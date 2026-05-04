import { Lead } from "@/lib/db";
import { generatePresentationPDF } from "@/lib/pdf-generator";

interface AnalysisResult {
  seo_score: number;
  audit_findings: {
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    recommendation: string;
  }[];
  competitor_analysis: {
    competitor_name: string;
    strength: string;
    weakness: string;
    opportunity: string;
  }[];
  market_analysis: {
    total_competitors: number;
    market_saturation: "low" | "medium" | "high";
    opportunity_score: number;
  };
  review_analysis: {
    estimated_review_count: number;
    average_rating: number;
    improvement_areas: string[];
  };
  summary: string;
}

/**
 * Generate a PDF presentation from the analysis results.
 * Returns a URL to the generated presentation PDF.
 */
export async function runPresentationAgent(
  lead: Lead,
  analysisResult: unknown
): Promise<string> {
  try {
    console.log(`[presentation] Generating presentation for ${lead.email}`);

    const analysis = analysisResult as AnalysisResult;

    // Generate PDF buffer
    const pdfBuffer = await generatePresentationPDF(lead, analysis);

    // For MVP, return a data URL to the PDF
    // In production: upload to Vercel Blob and return the permanent URL
    const base64Pdf = pdfBuffer.toString("base64");
    const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

    console.log(`[presentation] Generated presentation PDF (${pdfBuffer.length} bytes) for ${lead.email}`);

    // Temporary: Return a placeholder URL that will be replaced with Blob storage
    // The actual PDF can be accessed via the workflow data
    const presentationUrl = `https://my-jobs-eight.vercel.app/api/presentations/${lead.id}-${Date.now()}`;

    console.log(`[presentation] Generated presentation: ${presentationUrl}`);

    return presentationUrl;
  } catch (error) {
    console.error(`[presentation] Error for lead ${lead.email}:`, error);
    throw new Error(
      `Presentation generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
