import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { collaborationService } from "@/lib/backend/services/collaboration.service";
import { createDbAdminClient } from "@/lib/backend/database/client";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response("Authentication required", { status: 401 });
    }

    const { attachmentId } = await props.params;

    // 1. Fetch attachment metadata to verify workspace membership
    const attachment = await collaborationService.getAttachment(userId, attachmentId);

    // 2. Stream file from Supabase Storage
    const client = createDbAdminClient();
    const { data, error } = await client.storage
      .from(attachment.bucket)
      .download(attachment.storagePath);

    if (error || !data) {
      return new Response("File not found or storage error", { status: 404 });
    }

    // 3. Return streaming response
    return new Response(data, {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (err: any) {
    return new Response(err.message || "Internal server error", { status: err.status || 500 });
  }
}
