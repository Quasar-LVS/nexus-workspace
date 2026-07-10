import { NextResponse } from "next/server";
import { NexusError } from "./custom-errors";
import { logger } from "../utils/logger";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import crypto from "crypto";

interface ErrorResponsePayload {
  success: false;
  error: {
    code: string;
    message: string;
    traceId: string;
    details?: any;
  };
}

/**
 * Capture exceptions globally with rich trace metadata
 */
export async function captureException(
  error: unknown,
  additionalContext: { route?: string; workspace?: string } = {}
): Promise<{ traceId: string; message: string }> {
  const traceId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  let userId: string | undefined = undefined;
  try {
    const authSession = await auth();
    userId = authSession?.userId || undefined;
  } catch {
    // request context not available
  }

  let route = additionalContext.route;
  let workspace = additionalContext.workspace;

  try {
    const headersList = await headers();
    if (!route) {
      route = headersList.get("x-pathname") || undefined;
    }
    if (!workspace && route) {
      const match = route.match(/\/workspace\/([^/]+)/);
      if (match) workspace = match[1];
    }
  } catch {
    // request context not available
  }

  const systemError = error instanceof Error ? error : new Error(String(error));

  logger.error(`Exception Captured [${traceId}]`, systemError, {
    timestamp,
    traceId,
    route,
    workspace,
    userId,
  });

  return {
    traceId,
    message: systemError.message,
  };
}

/**
 * Standard API error responder mapping NexusErrors directly to JSON payloads,
 * appending centralized trace IDs for monitoring, and wrapping unhandled failures.
 */
export async function handleApiError(error: unknown): Promise<NextResponse<ErrorResponsePayload>> {
  const { traceId, message } = await captureException(error);

  if (error instanceof NexusError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          traceId,
          details: error.details,
        },
      },
      { status: error.status }
    );
  }

  // General unexpected runtime failures friendly categorization
  let code = "INTERNAL_SERVER_ERROR";
  let userFriendlyMessage = "An unexpected server-side error occurred.";
  const errMsg = message.toLowerCase();
  if (errMsg.includes("openai") || errMsg.includes("gemini") || errMsg.includes("ai")) {
    code = "AI_PROVIDER_FAILURE";
    userFriendlyMessage = "Nova AI service is temporarily unavailable. Please try again shortly.";
  } else if (errMsg.includes("upload") || errMsg.includes("storage") || errMsg.includes("bucket")) {
    code = "STORAGE_UPLOAD_FAILURE";
    userFriendlyMessage = "Failed to upload file attachment. Please check your network and try again.";
  } else if (errMsg.includes("realtime") || errMsg.includes("websocket") || errMsg.includes("subscription")) {
    code = "REALTIME_SUBSCRIPTION_FAILURE";
    userFriendlyMessage = "Realtime communication stream lost connection. Attempting reconnection.";
  } else if (errMsg.includes("permission") || errMsg.includes("forbidden") || errMsg.includes("unauthorized")) {
    code = "PERMISSION_FAILURE";
    userFriendlyMessage = "You do not have access permissions to perform this operation.";
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message: userFriendlyMessage,
        traceId,
      },
    },
    { status: 500 }
  );
}
