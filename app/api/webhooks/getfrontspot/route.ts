import { createLead, createLeadWorkflow } from "@/lib/db";
import { orchestrateLeadWorkflow } from "@/lib/orchestration";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Helper function to get environment variable from .env.local
function getEnvVar(varName: string): string | undefined {
  // First try process.env
  if (process.env[varName]) {
    return process.env[varName];
  }

  // For development, try reading from .env.local
  if (process.env.NODE_ENV === "development") {
    try {
      const envPath = join(process.cwd(), ".env.local");
      const envContent = readFileSync(envPath, "utf-8");
      const line = envContent
        .split("\n")
        .find((l) => l.startsWith(`${varName}=`));
      if (line) {
        const value = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
        return value;
      }
    } catch (e) {
      // Ignore file read errors
    }
  }

  return undefined;
}

// Webhook signature verification secret (set in Vercel environment variables)
const WEBHOOK_SECRET = process.env.GETFRONTSPOT_WEBHOOK_SECRET;

interface GetfrontspotWebhookPayload {
  event: string;
  lead?: {
    id?: string;
    email?: string;
    phone?: string;
    name?: string;
    businessName?: string;
    businessType?: string;
    [key: string]: unknown;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if secret is configured
    if (WEBHOOK_SECRET) {
      const signature = request.headers.get("x-getfrontspot-signature");
      if (!signature || !verifySignature(request, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload: GetfrontspotWebhookPayload = await request.json();

    // Only process lead events
    if (!payload.event?.startsWith("lead.") || !payload.lead) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const { lead } = payload;

    // Validate required fields
    if (!lead.email || !lead.businessName) {
      return NextResponse.json(
        { error: "Missing required fields: email, businessName" },
        { status: 400 }
      );
    }

    console.log(`[getfrontspot] Received lead: ${lead.email} from ${lead.businessName}`);

    // Create lead in database (or retrieve existing)
    let createdLead;
    try {
      createdLead = await createLead({
        email: lead.email,
        phone: lead.phone,
        business_name: lead.businessName,
        business_type: lead.businessType,
        getfrontspot_id: lead.id,
        raw_data: lead,
      });
      console.log(`[getfrontspot] Created new lead: ${createdLead.id}`);
    } catch (error) {
      // If lead already exists, that's fine - just log it
      if (error instanceof Error && error.message.includes("duplicate key")) {
        console.log(`[getfrontspot] Lead already exists for email: ${lead.email}`);
        // For now, return success as the lead was previously created
        return NextResponse.json(
          {
            received: true,
            message: "Lead already exists",
          },
          { status: 200 }
        );
      }
      throw error;
    }

    // Create workflow for this lead
    const workflow = await createLeadWorkflow(createdLead.id);
    console.log(`[getfrontspot] Created workflow: ${workflow.id}`);

    // Start orchestration (async, don't wait for it)
    // Pass API keys in context since background tasks may not have env vars
    const anthropicApiKey = getEnvVar("ANTHROPIC_API_KEY");
    const resendApiKey = getEnvVar("RESEND_API_KEY");

    console.log(
      `[getfrontspot] Starting orchestration with Anthropic API key: ${anthropicApiKey ? `(length: ${anthropicApiKey.length})` : "NOT SET"}`
    );

    orchestrateLeadWorkflow(workflow.id, createdLead, {
      anthropicApiKey: anthropicApiKey || "",
      resendApiKey: resendApiKey || "",
    }).catch((error) => {
      console.error(`[getfrontspot] Orchestration failed for workflow ${workflow.id}:`, error);
    });

    return NextResponse.json(
      {
        received: true,
        leadId: createdLead.id,
        workflowId: workflow.id,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[getfrontspot] Webhook error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Placeholder signature verification (implement based on getfrontspot's actual scheme)
function verifySignature(request: NextRequest, signature: string): boolean {
  // TODO: Implement actual HMAC verification
  // For now, just check that the signature is non-empty
  return signature.length > 0;
}
