import { NextRequest, NextResponse } from "next/server";
import { postSlackMessage } from "@/lib/slack";

const TIER_NAMES: Record<string, string> = {
  starter: "Starter ($499/mo)",
  growth: "Growth ($999/mo)",
  scale: "Scale ($1,999/mo)",
};

function getTierName(session: Record<string, unknown>): string {
  const metadata = (session.metadata as Record<string, string>) || {};
  if (metadata.tier) return TIER_NAMES[metadata.tier.toLowerCase()] ?? metadata.tier;

  const amount = session.amount_total as number;
  if (amount === 49900) return TIER_NAMES.starter;
  if (amount === 99900) return TIER_NAMES.growth;
  if (amount === 199900) return TIER_NAMES.scale;

  return `$${(amount / 100).toFixed(0)}/mo`;
}

async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  // Stripe's HMAC signature format: t=timestamp,v1=hash
  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.split("=") as [string, string]),
  );
  const timestamp = parts["t"];
  const expectedHash = parts["v1"];
  if (!timestamp || !expectedHash) return null;

  // Reject events older than 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return null;

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computed !== expectedHash) return null;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Record<string, unknown>;

  if (webhookSecret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }
    const parsed = await verifyStripeSignature(body, signature, webhookSecret);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    event = parsed;
  } else {
    // No secret configured — accept without verification (dev/test only)
    console.warn("[stripe] STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data as Record<string, unknown>;
    const sessionObj = session.object as Record<string, unknown>;
    const customerDetails = sessionObj.customer_details as Record<string, string> | undefined;
    const customerName = customerDetails?.name ?? "New Client";
    const customerEmail = customerDetails?.email ?? sessionObj.customer_email ?? "unknown";
    const tierName = getTierName(sessionObj);
    const sessionId = sessionObj.id as string;
    const paymentIntent = sessionObj.payment_intent as string | undefined;
    const subscriptionId = sessionObj.subscription as string | undefined;

    console.log(`[stripe] checkout.session.completed: ${sessionId} — ${customerEmail}`);

    await postSlackMessage(`:tada: New paying client! ${customerName} (${customerEmail}) — ${tierName}`, [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: ":tada: New Paying Client — AI Content Writing",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Name:*\n${customerName}` },
          { type: "mrkdwn", text: `*Email:*\n${customerEmail}` },
          { type: "mrkdwn", text: `*Tier:*\n${tierName}` },
          {
            type: "mrkdwn",
            text: `*Stripe:*\n<https://dashboard.stripe.com/payments/${paymentIntent ?? sessionId}|View payment>`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Subscription: ${subscriptionId ?? "N/A"} · Session: ${sessionId}`,
          },
        ],
      },
    ]);
  }

  return NextResponse.json({ received: true });
}
