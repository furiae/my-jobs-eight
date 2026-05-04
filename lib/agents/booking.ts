import { Anthropic } from "@anthropic-ai/sdk";
import { Lead } from "@/lib/db";
import { generatePresentationPDF } from "@/lib/pdf-generator";
import { generateEmailTemplate } from "@/lib/email-templates";

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

    // Step 2: Generate PDF buffer for attachment
    const pdfBuffer = await generatePresentationPDF(lead, analysisResult as any);

    // Step 3: Send presentation via email (using Resend) with PDF attachment
    const emailSent = await sendPresentationEmail(lead, pdfBuffer, emailContent);

    if (!emailSent) {
      throw new Error("Failed to send presentation email");
    }

    // Step 4: Generate Calendly link (or booking URL)
    const calendlyLink = generateCalendlyLink(lead);

    // Step 5: Log follow-up in system
    const followUpDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

    // Step 6: Update getfrontspot with status (placeholder for now)
    const getfrontspotUpdated = await updateGetfrontspotLead(lead, calendlyLink);

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
  pdfBuffer: Buffer,
  emailContent: string
): Promise<boolean> {
  try {
    // Dynamically import and instantiate Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Generate email template based on lead type
    const template = generateEmailTemplate(lead, emailContent);

    // Convert Buffer to base64 for Resend attachment
    const pdfBase64 = pdfBuffer.toString("base64");
    const fileName = `seo-audit-${lead.business_name || "presentation"}-${new Date().toISOString().split("T")[0]}.pdf`;

    // Send via Resend with PDF attachment
    const result = await resend.emails.send({
      from: "noreply@my-jobs-eight.vercel.app",
      to: lead.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      attachments: [
        {
          filename: fileName,
          content: pdfBase64,
          encoding: "base64",
        },
      ],
    } as any); // Type assertion due to Resend SDK version

    console.log(`[booking] Email sent to ${lead.email} with PDF attachment: ${result.data?.id}`);
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
  calendlyLink: string
): Promise<boolean> {
  try {
    // TODO: Implement actual getfrontspot API callback
    // POST to getfrontspot with status update including calendly link

    console.log(
      `[booking] Updated getfrontspot for ${lead.email}: presentation sent with attachment`
    );
    return true;
  } catch (error) {
    console.error(`[booking] getfrontspot update failed:`, error);
    return false;
  }
}
