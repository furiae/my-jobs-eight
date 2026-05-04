import { Lead } from "@/lib/db";

export type LeadType = "ecommerce" | "service" | "local" | "saas" | "other";

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function getLeadType(lead: Lead): LeadType {
  if (!lead.business_type) return "other";
  const type = lead.business_type.toLowerCase();
  if (type.includes("ecommerce") || type.includes("shop")) return "ecommerce";
  if (type.includes("service")) return "service";
  if (type.includes("local") || type.includes("restaurant") || type.includes("salon")) return "local";
  if (type.includes("saas") || type.includes("software")) return "saas";
  return "other";
}

export function generateEmailTemplate(
  lead: Lead,
  emailContent: string,
  leadType?: LeadType
): EmailTemplate {
  const type = leadType || getLeadType(lead);
  const businessName = lead.business_name || "Your Business";

  const templates: Record<LeadType, (content: string, name: string) => EmailTemplate> = {
    ecommerce: (content, name) => ({
      subject: `Your Custom SEO Audit for ${name} - Boost Your Online Sales`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Your SEO Audit is Ready</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Discover how to increase your online visibility and sales</p>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">Hi there,</p>
            ${content.replace(/\n/g, "<br/>")}
            <p style="color: #666; font-size: 14px; margin: 24px 0 0 0;">
              <strong>What's inside your audit:</strong>
            </p>
            <ul style="color: #666; font-size: 14px; line-height: 1.6;">
              <li>Current SEO performance analysis</li>
              <li>Technical SEO issues and fixes</li>
              <li>Competitive landscape overview</li>
              <li>Content strategy recommendations</li>
              <li>Quick wins for immediate improvements</li>
            </ul>
          </div>
          <div style="padding: 30px; background: #f8f9fa; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">
              Ready to take the next step? Let's discuss how to implement these recommendations.
            </p>
            <p style="color: #666; font-size: 12px; margin: 0;">
              <strong>My Jobs</strong><br/>
              hello@my-jobs-eight.vercel.app
            </p>
          </div>
        </div>
      `,
      text: `Your SEO Audit is Ready\n\n${content}\n\nWhat's inside your audit:\n- Current SEO performance analysis\n- Technical SEO issues and fixes\n- Competitive landscape overview\n- Content strategy recommendations\n- Quick wins for immediate improvements`,
    }),

    service: (content, name) => ({
      subject: `${name}'s SEO Audit - Your Roadmap to More Clients`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Your SEO Audit is Ready</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Attract more qualified leads to your service business</p>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">Hi there,</p>
            ${content.replace(/\n/g, "<br/>")}
            <p style="color: #666; font-size: 14px; margin: 24px 0 0 0;">
              <strong>Your audit includes:</strong>
            </p>
            <ul style="color: #666; font-size: 14px; line-height: 1.6;">
              <li>Local SEO optimization opportunities</li>
              <li>Review and reputation management insights</li>
              <li>Service page optimization recommendations</li>
              <li>Lead capture funnel improvements</li>
              <li>Timeline to see results</li>
            </ul>
          </div>
          <div style="padding: 30px; background: #f8f9fa; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">
              Let's schedule a quick call to discuss your results and next steps.
            </p>
          </div>
        </div>
      `,
      text: `${name}'s SEO Audit - Your Roadmap to More Clients\n\n${content}\n\nYour audit includes:\n- Local SEO optimization opportunities\n- Review and reputation management insights\n- Service page optimization recommendations\n- Lead capture funnel improvements\n- Timeline to see results`,
    }),

    local: (content, name) => ({
      subject: `${name}'s Local SEO Audit - Get Found by Local Customers`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Your Local SEO Audit is Ready</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Dominate local search and attract nearby customers</p>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">Hi there,</p>
            ${content.replace(/\n/g, "<br/>")}
            <p style="color: #666; font-size: 14px; margin: 24px 0 0 0;">
              <strong>What you'll discover:</strong>
            </p>
            <ul style="color: #666; font-size: 14px; line-height: 1.6;">
              <li>Google Business Profile optimization gaps</li>
              <li>Local citation and directory opportunities</li>
              <li>Review strategy and management tips</li>
              <li>Local keyword rankings analysis</li>
              <li>Competitor local SEO benchmarking</li>
            </ul>
          </div>
          <div style="padding: 30px; background: #f8f9fa; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">
              Ready to become the go-to choice in your area?
            </p>
          </div>
        </div>
      `,
      text: `${name}'s Local SEO Audit - Get Found by Local Customers\n\n${content}\n\nWhat you'll discover:\n- Google Business Profile optimization gaps\n- Local citation and directory opportunities\n- Review strategy and management tips\n- Local keyword rankings analysis\n- Competitor local SEO benchmarking`,
    }),

    saas: (content, name) => ({
      subject: `${name}'s SEO Audit - Grow Your SaaS Visibility`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Your SEO Audit is Ready</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Improve organic traffic and reduce CAC for your SaaS</p>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">Hi there,</p>
            ${content.replace(/\n/g, "<br/>")}
            <p style="color: #666; font-size: 14px; margin: 24px 0 0 0;">
              <strong>This audit analyzed:</strong>
            </p>
            <ul style="color: #666; font-size: 14px; line-height: 1.6;">
              <li>High-intent keyword opportunities</li>
              <li>Product page optimization potential</li>
              <li>Technical SEO and site performance</li>
              <li>Content gap analysis</li>
              <li>Backlink and authority opportunities</li>
            </ul>
          </div>
          <div style="padding: 30px; background: #f8f9fa; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">
              Let's discuss how to turn these insights into more qualified leads.
            </p>
          </div>
        </div>
      `,
      text: `${name}'s SEO Audit - Grow Your SaaS Visibility\n\n${content}\n\nThis audit analyzed:\n- High-intent keyword opportunities\n- Product page optimization potential\n- Technical SEO and site performance\n- Content gap analysis\n- Backlink and authority opportunities`,
    }),

    other: (content, name) => ({
      subject: `Your Custom SEO Audit for ${name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Your SEO Audit is Ready</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Discover your SEO opportunities and competitive advantages</p>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">Hi there,</p>
            ${content.replace(/\n/g, "<br/>")}
            <p style="color: #666; font-size: 14px; margin: 24px 0 0 0;">
              <strong>Inside your audit:</strong>
            </p>
            <ul style="color: #666; font-size: 14px; line-height: 1.6;">
              <li>Comprehensive SEO performance analysis</li>
              <li>Technical and on-page optimization opportunities</li>
              <li>Competitive positioning insights</li>
              <li>Actionable recommendations prioritized by impact</li>
              <li>Implementation roadmap</li>
            </ul>
          </div>
          <div style="padding: 30px; background: #f8f9fa; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px; margin: 0;">
              Questions about your audit? We're here to help.
            </p>
          </div>
        </div>
      `,
      text: `Your Custom SEO Audit for ${name}\n\n${content}\n\nInside your audit:\n- Comprehensive SEO performance analysis\n- Technical and on-page optimization opportunities\n- Competitive positioning insights\n- Actionable recommendations prioritized by impact\n- Implementation roadmap`,
    }),
  };

  return templates[type](emailContent, businessName);
}
