import {
  getLeadWorkflow,
  updateLeadWorkflowStatus,
  logWorkflowExecution,
  Lead,
  LeadWorkflow,
} from "@/lib/db";
import { runIntakeAgent } from "@/lib/agents/intake";
import { runAnalysisAgent } from "@/lib/agents/analysis";
import { runPresentationAgent } from "@/lib/agents/presentation";
import { runBookingAgent } from "@/lib/agents/booking";

type WorkflowState = "intake" | "analysis" | "presentation" | "booking" | "completed" | "failed";

interface WorkflowContext {
  workflow: LeadWorkflow;
  lead: Lead;
  apiKeys?: {
    anthropicApiKey: string;
    resendApiKey: string;
  };
}

async function executeWorkflowStep(
  context: WorkflowContext,
  stepName: WorkflowState
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const { workflow, lead } = context;

  try {
    console.log(
      `[orchestration] Executing ${stepName} agent for workflow ${workflow.id}`
    );

    // Log execution start
    await logWorkflowExecution({
      workflow_id: workflow.id,
      agent_name: stepName,
      status: "running",
    });

    let result: unknown;

    // Execute the appropriate agent
    switch (stepName) {
      case "intake":
        result = await runIntakeAgent(lead, context.apiKeys?.anthropicApiKey);
        await updateLeadWorkflowStatus(workflow.id, stepName, {
          intake_result: result as Record<string, unknown>,
        });
        break;

      case "analysis":
        result = await runAnalysisAgent(lead, workflow.intake_result, context.apiKeys?.anthropicApiKey);
        await updateLeadWorkflowStatus(workflow.id, stepName, {
          analysis_result: result as Record<string, unknown>,
        });
        break;

      case "presentation":
        result = await runPresentationAgent(lead, workflow.analysis_result);
        await updateLeadWorkflowStatus(workflow.id, stepName, {
          presentation_url: result as string,
        });
        break;

      case "booking":
        result = await runBookingAgent(
          lead,
          workflow.presentation_url || "",
          workflow.analysis_result,
          context.apiKeys?.anthropicApiKey
        );
        await updateLeadWorkflowStatus(workflow.id, stepName, {
          booking_status: result as string,
        });
        break;

      default:
        throw new Error(`Unknown workflow state: ${stepName}`);
    }

    // Log success
    await logWorkflowExecution({
      workflow_id: workflow.id,
      agent_name: stepName,
      status: "success",
      result: result as Record<string, unknown>,
    });

    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[orchestration] Error in ${stepName} agent:`, error);

    // Log failure
    await logWorkflowExecution({
      workflow_id: workflow.id,
      agent_name: stepName,
      status: "failed",
      error: errorMessage,
    });

    // Update workflow with error
    await updateLeadWorkflowStatus(workflow.id, "failed", {
      error_message: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

async function getNextWorkflowState(
  currentState: WorkflowState
): Promise<WorkflowState | null> {
  const stateTransitions: Record<WorkflowState, WorkflowState | null> = {
    intake: "analysis",
    analysis: "presentation",
    presentation: "booking",
    booking: "completed",
    completed: null,
    failed: null,
  };

  return stateTransitions[currentState];
}

/**
 * Orchestrate the complete lead workflow from intake through booking.
 * This function runs asynchronously and manages state transitions.
 */
export async function orchestrateLeadWorkflow(
  workflowId: string,
  lead: Lead,
  apiKeys: { anthropicApiKey: string; resendApiKey: string }
): Promise<void> {
  let workflow = await getLeadWorkflow(workflowId);

  if (!workflow) {
    console.error(`[orchestration] Workflow not found: ${workflowId}`);
    return;
  }

  const context: WorkflowContext = { workflow, lead, apiKeys };

  // Execute workflow states in sequence, based on what's been completed
  const states: WorkflowState[] = ["intake", "analysis", "presentation", "booking"];

  for (const state of states) {
    // Check if this step has already been completed
    const isCompleted =
      (state === "intake" && workflow.intake_result) ||
      (state === "analysis" && workflow.analysis_result) ||
      (state === "presentation" && workflow.presentation_url) ||
      (state === "booking" && workflow.booking_status);

    if (isCompleted) {
      console.log(`[orchestration] Step ${state} already completed`);
      continue;
    }

    // Execute the next incomplete step
    const { success } = await executeWorkflowStep(context, state);

    if (!success) {
      // Error was already logged, workflow is marked as failed
      console.error(`[orchestration] Workflow failed at ${state}: ${workflowId}`);
      return;
    }

    // Fetch updated workflow
    workflow = (await getLeadWorkflow(workflowId))!;
    context.workflow = workflow;
  }

  // All steps completed successfully
  workflow = await updateLeadWorkflowStatus(workflowId, "completed");
  console.log(`[orchestration] Workflow completed: ${workflowId}`);
}

/**
 * Retry a failed workflow from the current step.
 * Note: This is a simplified retry for MVP - in production, should pass stored API keys.
 */
export async function retryWorkflow(workflowId: string): Promise<void> {
  let workflow = await getLeadWorkflow(workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  if (workflow.status !== "failed") {
    throw new Error(`Cannot retry non-failed workflow: ${workflow.status}`);
  }

  // Reset to last successful state (or intake if none)
  let retryState: WorkflowState = "intake";
  if (workflow.intake_result && !workflow.analysis_result) {
    retryState = "analysis";
  } else if (
    workflow.analysis_result &&
    !workflow.presentation_url
  ) {
    retryState = "presentation";
  } else if (workflow.presentation_url && !workflow.booking_status) {
    retryState = "booking";
  }

  // Reset error message and update status
  workflow = await updateLeadWorkflowStatus(workflowId, retryState, {
    error_message: "",
  });

  console.log(
    `[orchestration] Retrying workflow ${workflowId} from state ${retryState}`
  );

  // Continue orchestration from retry point
  const lead = { id: workflow.lead_id } as unknown as Lead;
  const context: WorkflowContext = { workflow, lead };
  const { success } = await executeWorkflowStep(context, retryState);

  if (success) {
    // Continue with next state
    const nextState = await getNextWorkflowState(retryState);
    if (nextState) {
      workflow = (await getLeadWorkflow(workflowId))!;
      // Retry will use environment variables (limited in MVP)
      await orchestrateLeadWorkflow(workflowId, lead, {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
        resendApiKey: process.env.RESEND_API_KEY || "",
      });
    }
  }
}
