"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { chatService, ChannelEntity } from "@/lib/backend/services/chat.service";
import { CreateChannelDTO, UpdateChannelDTO, ChannelActionDTO } from "@/lib/backend/validation/chat.schema";
import { createDbServerClient } from "@/lib/backend/database/client";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Creates a new chat channel
 */
export async function createChannelAction(payload: CreateChannelDTO): Promise<ActionResult<ChannelEntity>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const channel = await chatService.createChannel(userId, payload);
    revalidatePath("/dashboard");
    return { success: true, data: channel };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create channel." };
  }
}

/**
 * Server Action: Updates a channel details
 */
export async function updateChannelAction(payload: UpdateChannelDTO): Promise<ActionResult<ChannelEntity>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const channel = await chatService.updateChannel(userId, payload);
    revalidatePath("/dashboard");
    return { success: true, data: channel };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update channel." };
  }
}

/**
 * Server Action: Archives a channel
 */
export async function archiveChannelAction(payload: ChannelActionDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await chatService.archiveChannel(userId, payload);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to archive channel." };
  }
}

/**
 * Server Action: User joins a channel
 */
export async function joinChannelAction(payload: ChannelActionDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await chatService.joinChannel(userId, payload);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to join channel." };
  }
}

/**
 * Server Action: User leaves a channel
 */
export async function leaveChannelAction(payload: ChannelActionDTO): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await chatService.leaveChannel(userId, payload);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to leave channel." };
  }
}

/**
 * Server Action: Lists channels for the workspace layout sidebar
 */
export async function listChannelsAction(workspaceId: string): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const list = await chatService.listChannels(userId, workspaceId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load channels." };
  }
}

/**
 * Server Action: Lists categories inside a workspace
 */
export async function listCategoriesAction(workspaceId: string): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const list = await chatService.listCategories(workspaceId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load categories." };
  }
}

/**
 * Server Action: Fetches specific details for a single channel
 */
export async function getChannelDetailsAction(channelId: string): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const client = await createDbServerClient();
    const { data, error } = await client
      .from("channels")
      .select("id, name, description, is_private, workspace_id, category_id, created_at")
      .eq("id", channelId)
      .single();

    if (error || !data) {
      return { success: false, error: "Channel not found." };
    }

    return {
      success: true,
      data: {
        id: data.id,
        workspaceId: data.workspace_id,
        name: data.name,
        description: data.description,
        isPrivate: data.is_private,
        categoryId: data.category_id,
        createdAt: data.created_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load channel details." };
  }
}

/**
 * Server Action: Lists all user DMs and group conversations inside workspace
 */
export async function listUserConversationsAction(workspaceId: string): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    const list = await conversationService.listUserConversations(userId, workspaceId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load conversations." };
  }
}

/**
 * Server Action: Gets or creates 1-to-1 DM between logged user and target user
 */
export async function getOrCreateDMAction(workspaceId: string, targetProfileId: string): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    const conversation = await conversationService.getOrCreateDM(userId, workspaceId, targetProfileId);
    return { success: true, data: conversation };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to launch direct message." };
  }
}

/**
 * Server Action: Creates a new Group DM conversation
 */
export async function createGroupConversationAction(
  workspaceId: string,
  name: string,
  profileIds: string[]
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    const conversation = await conversationService.createGroupConversation(userId, workspaceId, name, profileIds);
    return { success: true, data: conversation };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create group conversation." };
  }
}

/**
 * Server Action: Registers current user typing indicators status
 */
export async function setTypingStatusAction(conversationId: string, isTyping: boolean): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    await conversationService.setTypingStatus(userId, conversationId, isTyping);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update typing indicator status." };
  }
}

/**
 * Server Action: Lists users currently typing in a conversation
 */
export async function getTypingUsersAction(conversationId: string): Promise<ActionResult<string[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    const list = await conversationService.getTypingUsers(conversationId, userId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load typing users list." };
  }
}

/**
 * Server Action: Marks a single notification as read
 */
export async function markSingleNotificationReadAction(notificationId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { collaborationService } = await import("@/lib/backend/services/collaboration.service");
    await collaborationService.markNotificationAsRead(userId, notificationId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to mark notification as read." };
  }
}

/**
 * Server Action: Registers current user typing status inside a channel
 */
export async function setChannelTypingStatusAction(channelId: string, isTyping: boolean): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    await conversationService.setTypingStatus(userId, null, isTyping, channelId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update channel typing indicator status." };
  }
}

/**
 * Server Action: Lists users currently typing in a channel
 */
export async function getChannelTypingUsersAction(channelId: string): Promise<ActionResult<string[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const { conversationService } = await import("@/lib/backend/services/conversation.service");
    const list = await conversationService.getTypingUsers(null, userId, channelId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load channel typing users." };
  }
}

