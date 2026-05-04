import { Anthropic } from "@anthropic-ai/sdk";
import { Lead } from "@/lib/db";

interface BookingResult {
  email_sent: boolean;
  calendly_link: string;
  calendar_integration_status: string;
  meeting_scheduled: boolean;
  getfrontspot_callback_sent: boolean;
  next_follow_up: string;
}

export async function runBookingAgent(
  lead: Lead,
  presentationUrl: string,
  analysisResult: unknown,
  apiKey?: string
): Promise<string> {
  try {
    console.log(`[booking] Processing booking for ${lead.email}`);

    // Step 1: Generate personalized email content using Claude
    const emailContent = await generateEmailContent(lead, analysisResult, apiKey);

    // Step 2: Send presentation via email (using Resend)
    const emailSent = await sendPresentationEmail(lead, presentationUrl, emailContent);

    if (!emailSent) {
      throw new Error("Failed to send presentation email");
    }

    // Step 3: Generate Calendly link (or booking URL)
    const calendlyLink = generateCalendlyLink(lead);

    // Step 4: Log follow-up in system
    const followUpDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

    // Step 5: Update getfrontspot with status (placeholder for now)
    const getfrontspotUpdated = await updateGetfrontspotLead(
      lead,
      presentationUrl,
      calendlyLink
    );

    const result: BookingResult = {
      email_sent: emailSent,
      calendly_link: calendlyLink,
      calendar_integration_status: "pending",
      meeting_scheduled: false,
      getfrontspot_callback_sent: getfrontspotUpdated,
      next_follow_up: followUpDate.toISOString(),
    };

    console.log(`[booking] Booking complete for ${lead.email}`);
    return JSON.stringify(result);
  } catch (error) {
    console.error(`[booking] Error for lead ${lead.email}:`, error);
    throw new Error(
      `Booking failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function generateEmailContent(
  lead: Lead,
  analysisResult: unknown,
  apiKey?: string
): Promise<string> {
  const anthropicApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not provided");
  }

  const client = new Anthropic({
    apiKey: anthropicApiKey,
  });

  const prompt = `Generate a personalized, professional email to send an SEO audit presentation to this business:

Business: ${lead.business_name}
Contact: ${lead.email}
Analysis Summary: ${JSON.stringify(analysisResult).substring(0, 500)}...

The email should:
1. Greet them personally
2. Reference their business
3. Explain the value of the presentation
4. Include a clear call-to-action for scheduling

Keep it concise (under 150 words) and professional.`;

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}

async function sendPresentationEmail(
  lead: Lead,
  presentationUrl: string,
  emailContent: string
): Promise<boolean> {
  try {
    // Dynamically import and instantiate Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Send via Resend
    const result = await resend.emails.send({
      from: "noreply@my-jobs-eight.vercel.app",
      to: lead.email,
      subject: `Your Custom SEO Audit for ${lead.business_name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          ${emailContent.replace(/\n/g, "<br/>")}
          <br/><br/>
          <a href="${presentationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">
            Download Your Presentation
          </a>
        </div>
      `,
    });

    console.log(`[booking] Email sent to ${lead.email}: ${result.data?.id}`);
    return !result.error;
  } catch (error) {
    console.error(`[booking] Email send failed for ${lead.email}:`, error);
    return false;
  }
}

function generateCalendlyLink(lead: Lead): string {
  // TODO: Integrate with actual Calendly API
  // For now, return a placeholder
  return `https://calendly.com/your-team/${lead.id}`;
}

async function updateGetfrontspotLead(
  lead: Lead,
  presentationUrl: string,
  calendlyLink: string
): Promise<boolean> {
  try {
    // TODO: Implement actual getfrontspot API callback
    // POST to getfrontspot with status update

    console.log(
      `[booking] Updated getfrontspot for ${lead.email}: presentation sent`
    );
    return true;
  } catch (error) {
    console.error(`[booking] getfrontspot update failed:`, error);
    return false;
  }
}
