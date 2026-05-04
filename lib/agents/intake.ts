import { Anthropic } from "@anthropic-ai/sdk";
import { Lead } from "@/lib/db";

interface IntakeResult {
  qualified: boolean;
  qualification_reason: string;
  business_size: string | null;
  industry: string | null;
  key_goals: string[];
  seo_maturity: string;
  competitor_count: number | null;
  next_steps: string[];
}

export async function runIntakeAgent(lead: Lead, apiKey?: string): Promise<IntakeResult> {
  const anthropicApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not provided and environment variable is not set");
  }

  const client = new Anthropic({
    apiKey: anthropicApiKey,
  });

  const systemPrompt = `You are an expert sales qualification agent for an AI-powered local SEO and review management agency. Your job is to:

1. Qualify whether the lead is a good fit (target: small-medium businesses with <5 location reviews)
2. Extract key business information
3. Assess their SEO maturity level
4. Identify their potential needs

Always respond with a JSON object with the following structure:
{
  "qualified": boolean,
  "qualification_reason": "string explaining why qualified/not qualified",
  "business_size": "small|medium|large|unknown",
  "industry": "the business industry/type",
  "key_goals": ["array", "of", "goals"],
  "seo_maturity": "none|basic|intermediate|advanced",
  "competitor_count": number or null,
  "next_steps": ["array", "of", "recommended", "next", "steps"]
}`;

  const userPrompt = `Please qualify and analyze this lead:

Name: ${lead.business_name}
Email: ${lead.email}
Phone: ${lead.phone || "Not provided"}
Business Type: ${lead.business_type || "Not specified"}
Raw Data: ${JSON.stringify(lead.raw_data, null, 2)}

Determine if they're a good fit for our service and extract their business profile.`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
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

    const result: IntakeResult = JSON.parse(jsonMatch[0]);

    console.log(`[intake] Lead ${lead.email}: qualified=${result.qualified}`);
    return result;
  } catch (error) {
    console.error(`[intake] Error for lead ${lead.email}:`, error);
    throw new Error(
      `Intake qualification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
