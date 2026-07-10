import { createDbServerClient, createDbAdminClient } from "../database/client";
import { 
  sendMessageSchema, 
  editMessageSchema, 
  deleteMessageSchema, 
  fetchMessagesSchema, 
  markReadSchema,
  SendMessageDTO, 
  EditMessageDTO, 
  DeleteMessageDTO, 
  FetchMessagesDTO, 
  MarkReadDTO 
} from "../validation/chat.schema";
import { ValidationError, DatabaseError, NotFoundError, ForbiddenError } from "../errors/custom-errors";
import { logger } from "../utils/logger";

export interface MessageEntity {
  id: string;
  channelId?: string | null;
  conversationId?: string | null;
  profileId: string;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  parentId?: string | null;
  profile?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  attachments?: any[];
}

export class MessageService {

  /**
   * Dispatches index payloads to the Nova AI processing queue
   */
  private async emitNovaAiEvent(messageId: string, channelId: string, content: string): Promise<void> {
    logger.debug(`AI Trigger: Dispatching message indexing to Nova processing hub`, { messageId, channelId });
    // In future sprints, this triggers a message queue insertion or calls the AI summary engine directly.
  }

  /**
   * Helper: Logs activities in the database
   */
  private async logActivity(
    client: any,
    workspaceId: string,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: any
  ): Promise<void> {
    const { error } = await client
      .from("activity_logs")
      .insert({
        workspace_id: workspaceId,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata: metadata || {}
      });

    if (error) {
      logger.warn(`Failed to insert activity log for message action: ${action}`, { error: error.message });
    }
  }

  /**
   * Dispatches a message to a channel or conversation
   */
  async sendMessage(userId: string, payload: SendMessageDTO): Promise<MessageEntity> {
    const context = { userId, channelId: payload.channelId, conversationId: payload.conversationId, action: "sendMessage" };
    logger.info(`BLL: Sending message`, context);

    const validation = sendMessageSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid message input parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    let workspaceId: string;
    let targetUrl: string;

    if (payload.conversationId) {
      const { data: conv, error: convError } = await client
        .from("conversations")
        .select("workspace_id")
        .eq("id", payload.conversationId)
        .single();
      if (convError || !conv) {
        throw new NotFoundError("Conversation not found.");
      }
      workspaceId = conv.workspace_id;
      
      const { data: member, error: memberError } = await client
        .from("conversation_members")
        .select("profile_id")
        .eq("conversation_id", payload.conversationId)
        .eq("profile_id", userId)
        .single();
      if (memberError || !member) {
        throw new ForbiddenError("You are not a member of this conversation.");
      }
      targetUrl = `/workspace/${workspaceId}/dm/${payload.conversationId}`;
    } else if (payload.channelId) {
      const { data: channel, error: fetchError } = await client
        .from("channels")
        .select("workspace_id, is_archived")
        .eq("id", payload.channelId)
        .single();
      if (fetchError || !channel) {
        throw new NotFoundError("Channel not found.");
      }
      if (channel.is_archived) {
        throw new ValidationError("Cannot send messages to an archived channel.");
      }
      workspaceId = channel.workspace_id;
      targetUrl = `/workspace/${workspaceId}/channel/${payload.channelId}`;
    } else {
      throw new ValidationError("Must specify either channelId or conversationId.");
    }

    // 2. Perform insert query
    const { data: msg, error: insertError } = await client
      .from("messages")
      .insert({
        channel_id: payload.channelId || null,
        conversation_id: payload.conversationId || null,
        parent_id: payload.parentId || null,
        profile_id: userId,
        content: payload.content,
      })
      .select(`
        id,
        channel_id,
        conversation_id,
        profile_id,
        content,
        is_edited,
        created_at,
        updated_at,
        deleted_at,
        parent_id,
        profiles (email, first_name, last_name, avatar_url)
      `)
      .single();

    if (insertError) {
      logger.error("Failed to insert message into DB", insertError, context);
      throw new DatabaseError("Error saving message.", insertError);
    }

    const senderProf: any = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;
    const senderName = senderProf ? ([senderProf.first_name, senderProf.last_name].filter(Boolean).join(" ") || senderProf.email) : "Someone";

    // 3. Parse mentions inside the message content
    const mentionRegex = /@(\w+)/g;
    const matches = payload.content.match(mentionRegex);
    if (matches && workspaceId) {
      // Find all workspace members and their profiles to identify mentioned user
      const { data: wsMembers } = await client
        .from("workspace_members")
        .select(`
          profile_id,
          profiles (first_name, last_name, email)
        `)
        .eq("workspace_id", workspaceId);

      if (wsMembers) {
        const { collaborationService } = await import("./collaboration.service");
        for (const row of wsMembers) {
          const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          if (prof && row.profile_id !== userId) {
            const userName = [prof.first_name, prof.last_name].filter(Boolean).join("").toLowerCase();
            const emailName = prof.email.split("@")[0].toLowerCase();
            
            const isMentioned = matches.some(m => {
              const matchedName = m.slice(1).toLowerCase();
              return matchedName === userName || 
                     matchedName === emailName || 
                     matchedName === (prof.first_name || "").toLowerCase() || 
                     matchedName === (prof.last_name || "").toLowerCase();
            });

            if (isMentioned) {
              await collaborationService.createNotification(
                workspaceId,
                row.profile_id,
                "mention",
                "You were mentioned",
                `${senderName} mentioned you: "${payload.content.slice(0, 40)}..."`,
                targetUrl,
                "message",
                msg.id
              );
            }
          }
        }
      }
    }

    // 4. Trigger thread notification for parent message author
    if (payload.parentId) {
      const { data: parentMsg } = await client
        .from("messages")
        .select("profile_id, content")
        .eq("id", payload.parentId)
        .single();
      
      if (parentMsg && parentMsg.profile_id !== userId) {
        const { collaborationService } = await import("./collaboration.service");
        await collaborationService.createNotification(
          workspaceId,
          parentMsg.profile_id,
          "reply",
          "New thread reply",
          `${senderName} replied to your thread: "${payload.content.slice(0, 40)}..."`,
          `${targetUrl}?thread=${payload.parentId}`,
          "message",
          msg.id
        );
      }
    }

    // 5. Trigger Nova AI logs
    if (payload.channelId) {
      await this.emitNovaAiEvent(msg.id, payload.channelId, payload.content);
    }
    
    await this.logActivity(
      client,
      workspaceId,
      userId,
      "message.send",
      "message",
      msg.id
    );

    return {
      id: msg.id,
      channelId: msg.channel_id,
      conversationId: msg.conversation_id,
      profileId: msg.profile_id,
      content: msg.content,
      isEdited: msg.is_edited,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      deletedAt: msg.deleted_at,
      parentId: msg.parent_id,
      profile: senderProf ? {
        email: senderProf.email,
        firstName: senderProf.first_name,
        lastName: senderProf.last_name,
        avatarUrl: senderProf.avatar_url
      } : undefined
    };
  }

  /**
   * Modifies an existing message content and logs edit history
   */
  async editMessage(userId: string, payload: EditMessageDTO): Promise<MessageEntity> {
    const context = { userId, messageId: payload.messageId, action: "editMessage" };
    logger.info(`BLL: Modifying message content`, context);

    const validation = editMessageSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid message input parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Fetch original message
    const { data: original, error: fetchError } = await client
      .from("messages")
      .select("profile_id, content, channel_id")
      .eq("id", payload.messageId)
      .single();

    if (fetchError || !original) {
      throw new NotFoundError("Message not found.");
    }

    if (original.profile_id !== userId) {
      throw new ForbiddenError("You can only edit your own messages.");
    }

    // 2. Insert record in edits log history table
    const { error: historyError } = await client
      .from("message_edits")
      .insert({
        message_id: payload.messageId,
        old_content: original.content,
        new_content: payload.content
      });

    if (historyError) {
      logger.warn("Failed to insert message edit history mapping", { error: historyError.message });
    }

    // 3. Update message row
    const { data: msg, error: updateError } = await client
      .from("messages")
      .update({
        content: payload.content,
        is_edited: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", payload.messageId)
      .select(`
        id,
        channel_id,
        profile_id,
        content,
        is_edited,
        created_at,
        updated_at,
        deleted_at,
        parent_id,
        profiles (email, first_name, last_name, avatar_url)
      `)
      .single();

    if (updateError) {
      logger.error("Failed to update message in DB", updateError, context);
      throw new DatabaseError("Error saving message changes.", updateError);
    }

    // 4. Re-emit Nova event for index updates
    await this.emitNovaAiEvent(msg.id, msg.channel_id, payload.content);

    const prof: any = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;
    return {
      id: msg.id,
      channelId: msg.channel_id,
      profileId: msg.profile_id,
      content: msg.content,
      isEdited: msg.is_edited,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      deletedAt: msg.deleted_at,
      parentId: msg.parent_id,
      profile: prof ? {
        email: prof.email,
        firstName: prof.first_name,
        lastName: prof.last_name,
        avatarUrl: prof.avatar_url
      } : undefined
    };
  }

  /**
   * Executes a soft delete on a message (replacing text with a warning note)
   */
  async deleteMessage(userId: string, payload: DeleteMessageDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, action: "deleteMessage" };
    logger.info(`BLL: Soft deleting message`, context);

    const validation = deleteMessageSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid message identifier.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Verify user authorship
    const { data: original, error: fetchError } = await client
      .from("messages")
      .select("profile_id, channel_id")
      .eq("id", payload.messageId)
      .single();

    if (fetchError || !original) {
      throw new NotFoundError("Message not found.");
    }

    if (original.profile_id !== userId) {
      throw new ForbiddenError("You can only delete your own messages.");
    }

    // 2. Apply soft delete column indicators
    const { error: deleteError } = await client
      .from("messages")
      .update({
        content: "This message was deleted.",
        deleted_at: new Date().toISOString(),
        deleted_by: userId
      })
      .eq("id", payload.messageId);

    if (deleteError) {
      logger.error("Failed to apply soft delete updates", deleteError, context);
      throw new DatabaseError("Error deleting message.", deleteError);
    }
  }

  /**
   * Fetches messages for a channel, conversation, or thread parent with cursor-based pagination
   */
  async fetchMessages(userId: string, payload: FetchMessagesDTO): Promise<{ list: MessageEntity[]; nextCursor: string | null }> {
    const context = { userId, channelId: payload.channelId, conversationId: payload.conversationId, parentId: payload.parentId, action: "fetchMessages" };
    logger.info("BLL: Fetching message stream via cursor", context);

    const validation = fetchMessagesSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid query configurations.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Build pagination query
    let query = client
      .from("messages")
      .select(`
        id,
        channel_id,
        conversation_id,
        profile_id,
        content,
        is_edited,
        created_at,
        updated_at,
        deleted_at,
        parent_id,
        profiles (email, first_name, last_name, avatar_url)
      `);

    if (payload.parentId) {
      query = query.eq("parent_id", payload.parentId);
    } else if (payload.conversationId) {
      query = query.eq("conversation_id", payload.conversationId).is("parent_id", null);
    } else if (payload.channelId) {
      query = query.eq("channel_id", payload.channelId).is("parent_id", null);
    } else {
      throw new ValidationError("Must specify channelId, conversationId, or parentId.");
    }

    query = query.order("created_at", { ascending: false }).limit(payload.limit);

    if (payload.cursor) {
      query = query.lt("created_at", payload.cursor);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch message history list", error, context);
      throw new DatabaseError("Error retrieving messages.", error);
    }

    const rawList = data || [];
    const messageIds = rawList.map((m: any) => m.id);
    const attachmentsMap: Record<string, any[]> = {};

    if (messageIds.length > 0) {
      const { data: atts, error: attsError } = await client
        .from("attachments")
        .select("*")
        .eq("entity_type", "message")
        .in("entity_id", messageIds);

      if (!attsError && atts) {
        atts.forEach((att: any) => {
          if (!attachmentsMap[att.entity_id]) {
            attachmentsMap[att.entity_id] = [];
          }
          attachmentsMap[att.entity_id].push({
            id: att.id,
            workspaceId: att.workspace_id,
            uploaderId: att.uploader_id,
            bucket: att.bucket,
            storagePath: att.storage_path,
            fileName: att.file_name,
            mimeType: att.mime_type,
            fileSize: Number(att.file_size),
            entityType: att.entity_type,
            entityId: att.entity_id,
            createdAt: att.created_at
          });
        });
      }
    }
    
    // Chronological order layout for UI listing (reverse since database orders desc for cursors)
    const list: MessageEntity[] = [...rawList].reverse().map((msg: any) => {
      const prof: any = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;
      return {
        id: msg.id,
        channelId: msg.channel_id,
        conversationId: msg.conversation_id,
        profileId: msg.profile_id,
        content: msg.content,
        isEdited: msg.is_edited,
        createdAt: msg.created_at,
        updatedAt: msg.updated_at,
        deletedAt: msg.deleted_at,
        parentId: msg.parent_id,
        profile: prof ? {
          email: prof.email,
          firstName: prof.first_name,
          lastName: prof.last_name,
          avatarUrl: prof.avatar_url
        } : undefined,
        attachments: attachmentsMap[msg.id] || []
      };
    });

    const nextCursor = rawList.length === payload.limit ? rawList[rawList.length - 1].created_at : null;

    return { list, nextCursor };
  }

  /**
   * Marks a target channel or conversation message as read for the user session
   */
  async markRead(userId: string, payload: MarkReadDTO): Promise<void> {
    const context = { userId, channelId: payload.channelId, conversationId: payload.conversationId, action: "markRead" };
    logger.debug("BLL: Registering last read marker", context);

    const validation = markReadSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid parameters for read markers.", validation.error.format());
    }

    const client = await createDbServerClient();

    let finalMessageId = payload.messageId;
    if (!finalMessageId) {
      let query = client
        .from("messages")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (payload.channelId) {
        query = query.eq("channel_id", payload.channelId);
      } else if (payload.conversationId) {
        query = query.eq("conversation_id", payload.conversationId);
      }
      
      const { data } = await query;
      if (data && data.length > 0) {
        finalMessageId = data[0].id;
      }
    }

    let upsertPayload: any = {
      profile_id: userId,
      last_read_message_id: finalMessageId || null,
      last_read_at: new Date().toISOString()
    };

    if (payload.conversationId) {
      upsertPayload.conversation_id = payload.conversationId;
      upsertPayload.channel_id = null;
    } else if (payload.channelId) {
      upsertPayload.channel_id = payload.channelId;
      upsertPayload.conversation_id = null;
    } else {
      throw new ValidationError("Must specify channelId or conversationId.");
    }

    const { error } = await client
      .from("message_reads")
      .upsert(upsertPayload, {
        onConflict: payload.conversationId ? "conversation_id,profile_id" : "channel_id,profile_id"
      });

    if (error) {
      logger.warn("Failed to upsert message read marker row", { error: error.message });
      throw new DatabaseError("Error marking message as read.", error);
    }
  }

  /**
   * Fetches unread message counts for a user in a workspace across all channels
   */
  async getUnreadCounts(userId: string, workspaceId: string): Promise<Record<string, number>> {
    const client = createDbAdminClient();

    // 1. Get all active workspace channels
    const { data: channels, error: chanError } = await client
      .from("channels")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_archived", false);

    if (chanError || !channels) {
      return {};
    }

    const channelIds: string[] = channels.map((c: { id: string }) => c.id);
    if (channelIds.length === 0) return {};

    // 2. Get user's read markers for these channels
    const { data: reads, error: readsError } = await client
      .from("message_reads")
      .select("channel_id, last_read_at")
      .eq("profile_id", userId)
      .in("channel_id", channelIds);

    const readMarkers: Record<string, string> = {};
    if (!readsError && reads) {
      reads.forEach((r: { channel_id: string | null; last_read_at: string }) => {
        if (r.channel_id) {
          readMarkers[r.channel_id] = r.last_read_at;
        }
      });
    }

    // 3. For each channel, count messages created after the read marker, excluding user's own messages
    const unreadCounts: Record<string, number> = {};

    await Promise.all(
      channelIds.map(async (channelId: string) => {
        const lastReadAt = readMarkers[channelId];
        let query = client
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", channelId)
          .neq("profile_id", userId)
          .is("deleted_at", null);

        if (lastReadAt) {
          query = query.gt("created_at", lastReadAt);
        }

        const { count, error } = await query;
        if (!error && count !== null) {
          unreadCounts[channelId] = count;
        } else {
          unreadCounts[channelId] = 0;
        }
      })
    );

    return unreadCounts;
  }
}

export const messageService = new MessageService();
