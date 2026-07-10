import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { authService } from "@/lib/backend/services/auth.service";
import { handleApiError } from "@/lib/backend/errors/error-handler";
import { ValidationError } from "@/lib/backend/errors/custom-errors";
import { logger } from "@/lib/backend/utils/logger";

/**
 * POST /api/webhooks/clerk
 * Receives real-time user mutations from Clerk, verifies headers, and syncs profiles.
 */
export async function POST(req: Request) {
  const context = { endpoint: "api/webhooks/clerk", action: "POST" };
  logger.info("Received profile synchronization request from Clerk Webhook", context);

  // 1. Fetch headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    logger.warn("Request rejected: missing required Svix headers", context);
    return await handleApiError(new ValidationError("Missing webhook signature headers."));
  }

  // 2. Fetch webhook secret
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("CLERK_WEBHOOK_SECRET is not configured in local environment", new Error("Missing Webhook Secret"), context);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_CONFIGURATION_ERROR", message: "Webhook key missing" } },
      { status: 500 }
    );
  }

  try {
    // 3. Get raw body text
    const payloadBody = await req.text();
    
    // 4. Verify svix signatures
    const wh = new Webhook(webhookSecret);
    let evt: any;

    try {
      evt = wh.verify(payloadBody, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
    } catch (err) {
      logger.warn("Svix verification failed: invalid signature hash", { ...context, error: String(err) });
      return await handleApiError(new ValidationError("Webhook verification signature mismatch."));
    }

    // 5. Parse event types
    const eventType = evt.type;
    const eventData = evt.data;

    logger.info(`Received verified Clerk webhook event type: ${eventType}`, { ...context, eventType });

    if (eventType === "user.created" || eventType === "user.updated") {
      await authService.syncClerkProfile(eventData);
    } else if (eventType === "user.deleted") {
      if (eventData.id) {
        await authService.deleteClerkProfile(eventData.id);
      }
    } else {
      logger.debug(`Ignored unhandled Clerk webhook event: ${eventType}`, context);
    }

    return NextResponse.json({ success: true, message: "Sync complete" });
  } catch (error) {
    return await handleApiError(error);
  }
}
