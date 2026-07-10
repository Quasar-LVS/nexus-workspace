"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { messageService, MessageEntity } from "@/lib/backend/services/message.service";
import { 
  SendMessageDTO, 
  EditMessageDTO, 
  DeleteMessageDTO, 
  FetchMessagesDTO, 
  MarkReadDTO 
} from "@/lib/backend/validation/chat.schema";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Dispatches a new message text block
 */
export async function sendMessageAction(payload: SendMessageDTO): Promise<ActionResult<MessageEntity>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const message = await messageService.sendMessage(userId, payload);
    return { success: true, data: message };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send message." };
  }
}

/**
 * Server Action: Saves message modifications
 */
export async function editMessageAction(payload: EditMessageDTO): Promise<ActionResult<MessageEntity>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const message = await messageService.editMessage(userId, payload);
    return { success: true, data: message };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to edit message." };
  }
}

/**
 * Server Action: Triggers soft deletion of message text
 */
export async function deleteMessageAction(payload: DeleteMessageDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await messageService.deleteMessage(userId, payload);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete message." };
  }
}

/**
 * Server Action: Fetches messages with cursor-based pagination parameters
 */
export async function fetchMessagesAction(payload: FetchMessagesDTO): Promise<ActionResult<{ list: MessageEntity[]; nextCursor: string | null }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const result = await messageService.fetchMessages(userId, payload);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load messages." };
  }
}

/**
 * Server Action: Updates the channel unread mark indicator
 */
export async function markReadAction(payload: MarkReadDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await messageService.markRead(userId, payload);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to mark as read." };
  }
}

/**
 * Server Action: Fetches unread message counts for all active channels in a workspace
 */
export async function getUnreadCountsAction(workspaceId: string): Promise<ActionResult<Record<string, number>>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const counts = await messageService.getUnreadCounts(userId, workspaceId);
    return { success: true, data: counts };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load unread counts." };
  }
}
