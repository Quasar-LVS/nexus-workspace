"use server";

import { auth } from "@clerk/nextjs/server";
import { collaborationService } from "@/lib/backend/services/collaboration.service";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Uploads an attachment to storage and registers metadata
 */
export async function uploadAttachmentAction(formData: FormData): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const file = formData.get("file") as File;
    const workspaceId = formData.get("workspaceId") as string;
    const entityType = formData.get("entityType") as string;
    const entityId = formData.get("entityId") as string;

    if (!file || !workspaceId || !entityType || !entityId) {
      return { success: false, error: "Missing required upload parameters." };
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const attachment = await collaborationService.uploadAttachment({
      userId,
      workspaceId,
      entityType,
      entityId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileBuffer
    });

    return { success: true, data: attachment };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to upload file." };
  }
}

/**
 * Server Action: Deletes an attachment
 */
export async function deleteAttachmentAction(attachmentId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.deleteAttachment(userId, attachmentId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete attachment." };
  }
}

/**
 * Server Action: Lists attachments mapped to an entity
 */
export async function listAttachmentsAction(entityType: string, entityId: string): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const list = await collaborationService.listAttachments(userId, entityType, entityId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to list attachments." };
  }
}

/**
 * Server Action: Generates signed download URL
 */
export async function generateSignedUrlAction(attachmentId: string): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const url = await collaborationService.generateSignedUrl(userId, attachmentId);
    return { success: true, data: url };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate download URL." };
  }
}
