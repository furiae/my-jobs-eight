import { getLeadWorkflow } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const workflowId = request.nextUrl.searchParams.get("id");

  if (!workflowId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  try {
    const workflow = await getLeadWorkflow(workflowId);

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
