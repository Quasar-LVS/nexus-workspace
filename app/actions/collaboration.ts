"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { collaborationService } from "@/lib/backend/services/collaboration.service";
import { 
  ThreadReplyDTO, 
  ReactionDTO, 
  PinMessageDTO, 
  SaveMessageDTO, 
  GlobalSearchDTO 
} from "@/lib/backend/validation/collaboration.schema";
import { MessageEntity } from "@/lib/backend/services/message.service";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Dispatches a threaded reply
 */
export async function createThreadReplyAction(payload: ThreadReplyDTO): Promise<ActionResult<MessageEntity>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const reply = await collaborationService.createThreadReply(userId, payload);
    return { success: true, data: reply };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to dispatch reply." };
  }
}

/**
 * Server Action: Adds an emoji reaction
 */
export async function addReactionAction(payload: ReactionDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.addReaction(userId, payload);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to react." };
  }
}

/**
 * Server Action: Removes an emoji reaction
 */
export async function removeReactionAction(payload: ReactionDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.removeReaction(userId, payload);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to remove reaction." };
  }
}

/**
 * Server Action: Pins a message in a channel
 */
export async function pinMessageAction(payload: PinMessageDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.pinMessage(userId, payload);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to pin message." };
  }
}

/**
 * Server Action: Unpins a message
 */
export async function unpinMessageAction(payload: PinMessageDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.unpinMessage(userId, payload);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to unpin message." };
  }
}

/**
 * Server Action: Saves a message to profile
 */
export async function saveMessageAction(payload: SaveMessageDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.saveMessage(userId, payload);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to bookmark message." };
  }
}

/**
 * Server Action: Removes a saved message bookmark
 */
export async function unsaveMessageAction(payload: SaveMessageDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.unsaveMessage(userId, payload);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to remove bookmark." };
  }
}

/**
 * Server Action: Lists notifications triggered for a profile
 */
export async function listNotificationsAction(): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const list = await collaborationService.listNotifications(userId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load notifications." };
  }
}

/**
 * Server Action: Marks all notifications as read
 */
export async function markNotificationsReadAction(): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.markNotificationsRead(userId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to read notifications." };
  }
}

/**
 * Server Action: Performs global workspace search queries
 */
export async function searchWorkspaceAction(payload: GlobalSearchDTO): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const results = await collaborationService.searchWorkspace(userId, payload);
    return { success: true, data: results };
  } catch (err: any) {
    return { success: false, error: err.message || "Search execution failed." };
  }
}

/**
 * Server Action: Generates a signed upload URL inside Supabase Storage workspace bucket
 */
export async function generateUploadPresignedUrlAction(payload: {
  workspaceId: string;
  fileName: string;
  fileType: string;
}): Promise<ActionResult<{ uploadUrl: string; publicUrl: string; filePath: string }>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const result = await collaborationService.generateUploadPresignedUrl(
      userId,
      payload.workspaceId,
      payload.fileName,
      payload.fileType
    );
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create upload credentials." };
  }
}

/**
 * Server Action: Marks a single notification as read
 */
export async function markNotificationReadAction(notificationId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.markNotificationAsRead(userId, notificationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to read notification." };
  }
}

/**
 * Server Action: Lists paginated chronological activity logs for a workspace
 */
export async function listActivityLogsAction(
  workspaceId: string,
  limit?: number,
  offset?: number
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const logs = await collaborationService.listActivityLogs(workspaceId, limit, offset);
    return { success: true, data: logs };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load activity logs." };
  }
}

/**
 * Server Action: Marks all user notifications as read
 */
export async function markAllNotificationsReadAction(): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.markAllNotificationsRead(userId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to mark all notifications as read." };
  }
}

/**
 * Server Action: Deletes a user notification
 */
export async function deleteNotificationAction(notificationId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.deleteNotification(userId, notificationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete notification." };
  }
}

/**
 * Server Action: Triggers due date calculations and generates notifications
 */
export async function checkDueDateNotificationsAction(workspaceId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await collaborationService.checkDueDateNotifications(workspaceId, userId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to run due date checks." };
  }
}
