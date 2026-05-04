import { NextRequest, NextResponse } from "next/server";

// Test endpoint to simulate a getfrontspot webhook
export async function POST(request: NextRequest) {
  const baseUrl = new URL(request.url).origin;

  // Send a test webhook to the main endpoint
  const testPayload = {
    event: "lead.created",
    lead: {
      id: "test-lead-123",
      email: "testbusiness@example.com",
      phone: "(555) 123-4567",
      name: "John Smith",
      businessName: "Smith's Local Plumbing",
      businessType: "Plumbing",
    },
  };

  try {
    const response = await fetch(`${baseUrl}/api/webhooks/getfrontspot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testPayload),
    });

    const data = await response.json();

    return NextResponse.json(
      {
        success: true,
        testPayload,
        webhookResponse: data,
        status: response.status,
      },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to see test status
export async function GET() {
  return NextResponse.json({
    message: "getfrontspot webhook test endpoint",
    usage: 'POST to this endpoint with a test webhook payload to verify the integration',
  });
}
