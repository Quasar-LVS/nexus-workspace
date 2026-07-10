import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { aiService } from "@/lib/ai/ai.service";
import { logger } from "@/lib/backend/utils/logger";
import { rateLimiter } from "@/lib/backend/utils/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: "Authentication required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Rate Limiting: max 10 requests per minute
    const isLimited = await rateLimiter.isRateLimited(`nova:chat:${userId}`, 10, 60000);
    if (isLimited) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before querying Nova again." }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { workspaceId, query, contextId, contextType } = body;

    if (!workspaceId || !query) {
      return new Response(JSON.stringify({ error: "workspaceId and query parameters are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Call dynamic provider stream
    let stringStream;
    try {
      stringStream = await aiService.chat(
        workspaceId,
        query,
        userId,
        contextId,
        contextType
      );
    } catch (providerErr: any) {
      logger.error("Nova AI: Provider execution failed", providerErr as Error);
      if (process.env.NODE_ENV === "development") {
        console.error("Nova AI Provider Error:", providerErr);
      }
      return new Response(JSON.stringify({ 
        error: providerErr.message || "The AI reasoning engine failed to execute. Please verify workspace settings." 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const encoder = new TextEncoder();

    // Transform raw text stream into standard SSE Event Stream format
    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = stringStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Format chunk as SSE data line
            const eventPayload = `data: ${JSON.stringify({ text: value })}\n\n`;
            controller.enqueue(encoder.encode(eventPayload));
          }
          controller.close();
        } catch (err) {
          logger.error("SSE Stream error during transmission", err as Error);
          controller.close();
        }
      }
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive"
      }
    });

  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      console.error("Nova AI: Streaming route failed. Stack trace:", err);
    }
    logger.error("Nova AI: Streaming route failed", err as Error);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
