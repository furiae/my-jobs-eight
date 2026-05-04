import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { generatePresentationPDF } from "@/lib/pdf-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = id.split("-")[0];

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID not found" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Fetch the workflow and lead data
    const workflowRows = await sql`
      SELECT lw.*, l.email, l.phone, l.business_name
      FROM lead_workflows lw
      JOIN leads l ON lw.lead_id = l.id
      WHERE l.id = $1
      ORDER BY lw.created_at DESC
      LIMIT 1
    `;

    if (workflowRows.length === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const workflow = workflowRows[0] as any;

    if (!workflow.analysis_result) {
      return NextResponse.json({ error: "Analysis not yet completed" }, { status: 400 });
    }

    // Reconstruct lead object
    const lead = {
      id: leadId,
      email: workflow.email,
      phone: workflow.phone,
      business_name: workflow.business_name,
      business_type: null,
      getfrontspot_id: null,
      raw_data: {},
      created_at: new Date().toISOString(),
    } as any;

    // Generate PDF from stored analysis
    const analysis = workflow.analysis_result;
    const pdfBuffer = await generatePresentationPDF(lead, analysis);

    // Return PDF with appropriate headers
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${lead.business_name || "presentation"}-${new Date().toISOString().split("T")[0]}.pdf"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving presentation:", error);
    return NextResponse.json(
      {
        error:
          "Failed to serve presentation: " + (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
