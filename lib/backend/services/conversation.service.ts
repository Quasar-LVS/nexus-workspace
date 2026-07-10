import { createDbAdminClient } from "../database/client";
import { permissionService } from "./permission.service";
import { ValidationError, DatabaseError, NotFoundError } from "../errors/custom-errors";
import { logger } from "../utils/logger";

export interface ConversationEntity {
  id: string;
  workspaceId: string;
  type: "channel" | "dm" | "group";
  name: string | null;
  createdBy: string | null;
  createdAt: string;
  members?: {
    profileId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  }[];
}

export class ConversationService {
  /**
   * Helper: maps raw database row to ConversationEntity
   */
  private mapRow(row: any, members?: any[]): ConversationEntity {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      members: members || [],
    };
  }

  /**
   * Helper: fetches members for a conversation list
   */
  private async fetchConversationMembers(client: any, conversationIds: string[]): Promise<Record<string, any[]>> {
    if (conversationIds.length === 0) return {};

    const { data, error } = await client
      .from("conversation_members")
      .select(`
        conversation_id,
        profile_id,
        profiles (
          email,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .in("conversation_id", conversationIds);

    if (error || !data) return {};

    const mapping: Record<string, any[]> = {};
    data.forEach((row: any) => {
      const convId = row.conversation_id;
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (prof) {
        if (!mapping[convId]) mapping[convId] = [];
        mapping[convId].push({
          profileId: row.profile_id,
          email: prof.email,
          firstName: prof.first_name,
          lastName: prof.last_name,
          avatarUrl: prof.avatar_url,
        });
      }
    });

    return mapping;
  }

  /**
   * Lists all DMs and group conversations for a user inside a workspace
   */
  async listUserConversations(userId: string, workspaceId: string): Promise<ConversationEntity[]> {
    const context = { userId, workspaceId, action: "listUserConversations" };
    logger.info("BLL: Listing user conversations", context);

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const client = createDbAdminClient();

    // Query conversations where the user is a member
    const { data: memberOf, error: memberError } = await client
      .from("conversation_members")
      .select("conversation_id")
      .eq("profile_id", userId);

    if (memberError || !memberOf) {
      return [];
    }

    const conversationIds = memberOf.map((m) => m.conversation_id);
    if (conversationIds.length === 0) return [];

    const { data, error } = await client
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("id", conversationIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError("Error loading conversations.", error);
    }

    const memberMapping = await this.fetchConversationMembers(client, conversationIds);

    return (data ?? []).map((row) => this.mapRow(row, memberMapping[row.id]));
  }

  /**
   * Gets or creates a 1-to-1 DM between two users in a workspace
   */
  async getOrCreateDM(userId: string, workspaceId: string, targetProfileId: string): Promise<ConversationEntity> {
    const context = { userId, workspaceId, targetProfileId, action: "getOrCreateDM" };
    logger.info("BLL: Fetching or creating DM conversation", context);

    if (userId === targetProfileId) {
      throw new ValidationError("Cannot create a DM conversation with yourself.");
    }

    await permissionService.assertWorkspaceMember(userId, workspaceId);
    await permissionService.assertWorkspaceMember(targetProfileId, workspaceId);

    const client = createDbAdminClient();

    // 1. Check if a DM conversation already exists
    // Find all DM conversation_members of the current user
    const { data: userDMs, error: userDMsError } = await client
      .from("conversation_members")
      .select(`
        conversation_id,
        conversations!inner (
          id,
          type,
          workspace_id
        )
      `)
      .eq("profile_id", userId)
      .eq("conversations.type", "dm")
      .eq("conversations.workspace_id", workspaceId);

    if (!userDMsError && userDMs) {
      const convIds = userDMs.map((d: any) => d.conversation_id);

      if (convIds.length > 0) {
        // Find if targetProfileId is also a member in any of these conversations
        const { data: commonDM, error: commonDMError } = await client
          .from("conversation_members")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .eq("profile_id", targetProfileId)
          .single();

        if (!commonDMError && commonDM) {
          // Found existing DM! Fetch details
          const { data: convData } = await client
            .from("conversations")
            .select("*")
            .eq("id", commonDM.conversation_id)
            .single();

          if (convData) {
            const memberMapping = await this.fetchConversationMembers(client, [convData.id]);
            return this.mapRow(convData, memberMapping[convData.id]);
          }
        }
      }
    }

    // 2. Not found, create a new DM conversation
    const { data: conversation, error: createError } = await client
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        type: "dm",
        created_by: userId,
      })
      .select()
      .single();

    if (createError || !conversation) {
      throw new DatabaseError("Failed to create DM conversation.", createError);
    }

    // Add conversation members
    const { error: membersError } = await client
      .from("conversation_members")
      .insert([
        { conversation_id: conversation.id, profile_id: userId },
        { conversation_id: conversation.id, profile_id: targetProfileId },
      ]);

    if (membersError) {
      throw new DatabaseError("Failed to map conversation members.", membersError);
    }

    const memberMapping = await this.fetchConversationMembers(client, [conversation.id]);
    return this.mapRow(conversation, memberMapping[conversation.id]);
  }

  /**
   * Creates a new group conversation
   */
  async createGroupConversation(
    userId: string,
    workspaceId: string,
    name: string,
    profileIds: string[]
  ): Promise<ConversationEntity> {
    const context = { userId, workspaceId, name, action: "createGroupConversation" };
    logger.info("BLL: Creating group conversation", context);

    if (!name.trim()) {
      throw new ValidationError("Group conversation name is required.");
    }

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const client = createDbAdminClient();

    const { data: conversation, error: createError } = await client
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        type: "group",
        name: name.trim(),
        created_by: userId,
      })
      .select()
      .single();

    if (createError || !conversation) {
      throw new DatabaseError("Failed to create group conversation.", createError);
    }

    // Add all members including creator
    const distinctProfiles = Array.from(new Set([userId, ...profileIds]));
    const memberInserts = distinctProfiles.map((pid) => ({
      conversation_id: conversation.id,
      profile_id: pid,
    }));

    const { error: membersError } = await client
      .from("conversation_members")
      .insert(memberInserts);

    if (membersError) {
      throw new DatabaseError("Failed to map group conversation members.", membersError);
    }

    const memberMapping = await this.fetchConversationMembers(client, [conversation.id]);
    return this.mapRow(conversation, memberMapping[conversation.id]);
  }

  /**
   * Sets the typing indicator status for a conversation member
   */
  async setTypingStatus(
    userId: string,
    conversationId: string | null,
    isTyping: boolean,
    channelId?: string | null
  ): Promise<void> {
    const client = createDbAdminClient();

    if (isTyping) {
      const payload: any = {
        profile_id: userId,
        updated_at: new Date().toISOString(),
      };
      if (conversationId) payload.conversation_id = conversationId;
      if (channelId) payload.channel_id = channelId;

      const { error } = await client
        .from("typing_indicators")
        .upsert(payload, {
          onConflict: conversationId ? "conversation_id,profile_id" : "channel_id,profile_id"
        });
      if (error) {
        logger.warn("Failed to upsert typing indicator status", { error: error.message });
      }
    } else {
      let query = client.from("typing_indicators").delete().eq("profile_id", userId);
      if (conversationId) {
        query = query.eq("conversation_id", conversationId);
      } else if (channelId) {
        query = query.eq("channel_id", channelId);
      } else {
        return;
      }
      const { error } = await query;
      if (error) {
        logger.warn("Failed to delete typing indicator status", { error: error.message });
      }
    }
  }

  /**
   * Returns a list of usernames currently typing in a conversation or channel
   */
  async getTypingUsers(
    conversationId: string | null,
    excludeUserId: string,
    channelId?: string | null
  ): Promise<string[]> {
    const client = createDbAdminClient();
    const threshold = new Date(Date.now() - 6000).toISOString(); // 6-second inactivity window

    let query = client
      .from("typing_indicators")
      .select(`
        profile_id,
        profiles (
          first_name,
          last_name,
          email
        )
      `)
      .neq("profile_id", excludeUserId)
      .gt("updated_at", threshold);

    if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    } else if (channelId) {
      query = query.eq("channel_id", channelId);
    } else {
      return [];
    }

    const { data, error } = await query;

    if (error || !data) return [];

    return data.map((row: any) => {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!prof) return "Someone";
      return [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
    });
  }
}

export const conversationService = new ConversationService();
