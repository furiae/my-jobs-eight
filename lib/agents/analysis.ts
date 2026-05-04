import { Anthropic } from "@anthropic-ai/sdk";
import { Lead } from "@/lib/db";

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

export async function runAnalysisAgent(
  lead: Lead,
  intakeResult: unknown,
  apiKey?: string
): Promise<AnalysisResult> {
  const anthropicApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not provided and environment variable is not set");
  }

  const client = new Anthropic({
    apiKey: anthropicApiKey,
  });

  const systemPrompt = `You are an expert SEO auditor and competitive analyst. Your job is to:

1. Generate a comprehensive SEO audit for small/medium local businesses
2. Analyze their competitive landscape
3. Assess review management opportunities
4. Provide actionable recommendations

Always respond with a detailed JSON object containing audit findings, competitor analysis, and market opportunity.`;

  const userPrompt = `Please create a detailed SEO audit and analysis for:

Business: ${lead.business_name}
Type: ${lead.business_type || "Unknown"}
Location: Unknown (assume local/regional focus)
Email: ${lead.email}

Intake Analysis: ${JSON.stringify(intakeResult, null, 2)}

Generate:
1. SEO audit with 5-7 key findings
2. Competitive analysis (assume 3-5 competitors in their market)
3. Market opportunity assessment
4. Review management analysis

Respond with JSON matching this structure:
{
  "seo_score": number (0-100),
  "audit_findings": [{ "title": "string", "description": "string", "priority": "critical|high|medium|low", "recommendation": "string" }],
  "competitor_analysis": [{ "competitor_name": "string", "strength": "string", "weakness": "string", "opportunity": "string" }],
  "market_analysis": { "total_competitors": number, "market_saturation": "low|medium|high", "opportunity_score": number (0-100) },
  "review_analysis": { "estimated_review_count": number, "average_rating": number, "improvement_areas": ["string"] },
  "summary": "string"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    // Extract the text response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse JSON from Claude response");
    }

    const result: AnalysisResult = JSON.parse(jsonMatch[0]);

    console.log(
      `[analysis] Generated audit for ${lead.email}: score=${result.seo_score}`
    );
    return result;
  } catch (error) {
    console.error(`[analysis] Error for lead ${lead.email}:`, error);
    throw new Error(
      `Analysis generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
