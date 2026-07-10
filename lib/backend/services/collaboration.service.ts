import { createDbServerClient, createDbAdminClient } from "../database/client";
import { 
  threadReplySchema, 
  reactionSchema, 
  pinMessageSchema, 
  saveMessageSchema, 
  globalSearchSchema,
  ThreadReplyDTO, 
  ReactionDTO, 
  PinMessageDTO, 
  SaveMessageDTO, 
  GlobalSearchDTO 
} from "../validation/collaboration.schema";
import { ValidationError, DatabaseError, NotFoundError } from "../errors/custom-errors";
import { logger } from "../utils/logger";
import { MessageEntity } from "./message.service";

export class CollaborationService {

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
      logger.warn(`Failed to insert activity log for collaboration action: ${action}`, { error: error.message });
    }
  }

  /**
   * Sends a threaded reply to a message
   */
  async createThreadReply(userId: string, payload: ThreadReplyDTO): Promise<MessageEntity> {
    const context = { userId, parentId: payload.parentId, action: "createThreadReply" };
    logger.info(`BLL: Replying to thread`, context);

    const validation = threadReplySchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid thread reply parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Fetch parent message to locate channel and author details
    const { data: parentMsg, error: parentError } = await client
      .from("messages")
      .select("content, channel_id, profile_id, channels (workspace_id)")
      .eq("id", payload.parentId)
      .single();

    if (parentError || !parentMsg) {
      throw new NotFoundError("Parent message not found.");
    }

    const channels: any = Array.isArray(parentMsg.channels) ? parentMsg.channels[0] : parentMsg.channels;
    const workspaceId = channels?.workspace_id;

    // 2. Insert reply message
    const { data: reply, error: replyError } = await client
      .from("messages")
      .insert({
        channel_id: parentMsg.channel_id,
        profile_id: userId,
        content: payload.content,
        parent_id: payload.parentId
      })
      .select(`
        id,
        channel_id,
        profile_id,
        content,
        is_edited,
        created_at,
        updated_at,
        deleted_at,
        profiles (email, first_name, last_name, avatar_url)
      `)
      .single();

    if (replyError) {
      logger.error("Failed to insert thread reply", replyError, context);
      throw new DatabaseError("Error saving thread reply.", replyError);
    }

    const prof: any = Array.isArray(reply.profiles) ? reply.profiles[0] : reply.profiles;

    // 3. Trigger notification for parent message author
    if (parentMsg.profile_id !== userId) {
      const { error: notifError } = await client
        .from("notifications")
        .insert({
          workspace_id: workspaceId,
          profile_id: parentMsg.profile_id,
          type: "reply",
          title: "New thread reply",
          content: `${prof?.first_name || "Someone"} replied to your message: "${parentMsg.content.slice(0, 30)}..."`,
          target_url: `/c/${parentMsg.channel_id}?thread=${payload.parentId}`
        });

      if (notifError) {
        logger.warn("Failed to create thread reply notification mapping", { error: notifError.message });
      }
    }

    // 4. Log activity
    await this.logActivity(
      client,
      workspaceId,
      userId,
      "thread.reply",
      "message",
      reply.id,
      { parentId: payload.parentId }
    );

    return {
      id: reply.id,
      channelId: reply.channel_id,
      profileId: reply.profile_id,
      content: reply.content,
      isEdited: reply.is_edited,
      createdAt: reply.created_at,
      updatedAt: reply.updated_at,
      deletedAt: reply.deleted_at,
      profile: prof ? {
        email: prof.email,
        firstName: prof.first_name,
        lastName: prof.last_name,
        avatarUrl: prof.avatar_url
      } : undefined
    };
  }

  /**
   * Adds an emoji reaction to a target message
   */
  async addReaction(userId: string, payload: ReactionDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, emoji: payload.emoji, action: "addReaction" };
    logger.debug(`BLL: Adding reaction ${payload.emoji}`, context);

    const validation = reactionSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid reaction parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    const { error } = await client
      .from("message_reactions")
      .insert({
        message_id: payload.messageId,
        profile_id: userId,
        emoji: payload.emoji
      });

    if (error) {
      logger.warn("Failed to insert message reaction mapping", { error: error.message });
      throw new DatabaseError("Error adding emoji reaction.", error);
    }
  }

  /**
   * Removes an emoji reaction
   */
  async removeReaction(userId: string, payload: ReactionDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, emoji: payload.emoji, action: "removeReaction" };
    logger.debug(`BLL: Removing reaction ${payload.emoji}`, context);

    const validation = reactionSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid reaction parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    const { error } = await client
      .from("message_reactions")
      .delete()
      .eq("message_id", payload.messageId)
      .eq("profile_id", userId)
      .eq("emoji", payload.emoji);

    if (error) {
      logger.error("Failed to delete emoji reaction mapping", error, context);
      throw new DatabaseError("Error removing reaction.", error);
    }
  }

  /**
   * Pins a message in a channel
   */
  async pinMessage(userId: string, payload: PinMessageDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, channelId: payload.channelId, action: "pinMessage" };
    logger.info("BLL: Pinning message in channel", context);

    const validation = pinMessageSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid pin parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    const { error } = await client
      .from("pinned_messages")
      .insert({
        channel_id: payload.channelId,
        message_id: payload.messageId,
        pinned_by: userId
      });

    if (error) {
      logger.error("Failed to pin message in database", error, context);
      throw new DatabaseError("Error pinning message.", error);
    }

    // Log pin activity
    const { data: channel } = await client.from("channels").select("workspace_id").eq("id", payload.channelId).single();
    if (channel) {
      await this.logActivity(client, channel.workspace_id, userId, "message.pin", "message", payload.messageId);
    }
  }

  /**
   * Unpins a pinned message
   */
  async unpinMessage(userId: string, payload: PinMessageDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, channelId: payload.channelId, action: "unpinMessage" };
    logger.info("BLL: Unpinning message in channel", context);

    const client = await createDbServerClient();

    const { error } = await client
      .from("pinned_messages")
      .delete()
      .eq("channel_id", payload.channelId)
      .eq("message_id", payload.messageId);

    if (error) {
      logger.error("Failed to unpin message from database", error, context);
      throw new DatabaseError("Error unpinning message.", error);
    }
  }

  /**
   * Bookmarks / saves a message to user profile
   */
  async saveMessage(userId: string, payload: SaveMessageDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, action: "saveMessage" };
    logger.info("BLL: Bookmarking message", context);

    const validation = saveMessageSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid bookmark parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    const { error } = await client
      .from("saved_messages")
      .insert({
        profile_id: userId,
        message_id: payload.messageId
      });

    if (error) {
      logger.error("Failed to save message in database", error, context);
      throw new DatabaseError("Error bookmarking message.", error);
    }
  }

  /**
   * Removes a saved message bookmark
   */
  async unsaveMessage(userId: string, payload: SaveMessageDTO): Promise<void> {
    const context = { userId, messageId: payload.messageId, action: "unsaveMessage" };
    logger.info("BLL: Removing bookmarked message", context);

    const client = await createDbServerClient();

    const { error } = await client
      .from("saved_messages")
      .delete()
      .eq("message_id", payload.messageId)
      .eq("profile_id", userId);

    if (error) {
      logger.error("Failed to delete saved message bookmark", error, context);
      throw new DatabaseError("Error removing message bookmark.", error);
    }
  }

  /**
   * Lists in-app notifications triggered for a profile
   */
  async listNotifications(userId: string): Promise<any[]> {
    const client = await createDbServerClient();

    const { data, error } = await client
      .from("notifications")
      .select("id, workspace_id, type, title, content, target_url, is_read, created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError("Error fetching user notifications.", error);
    }

    return data || [];
  }

  /**
   * Marks all notifications as read
   */
  async markNotificationsRead(userId: string): Promise<void> {
    const client = await createDbServerClient();

    const { error } = await client
      .from("notifications")
      .update({ is_read: true })
      .eq("profile_id", userId);

    if (error) {
      throw new DatabaseError("Error updating notifications status.", error);
    }
  }

  /**
   * Marks a single notification as read
   */
  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    const client = await createDbServerClient();

    const { error } = await client
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("profile_id", userId);

    if (error) {
      throw new DatabaseError("Error updating notification status.", error);
    }
  }

  /**
   * Creates an in-app notification alert
   */
  async createNotification(
    workspaceId: string,
    profileId: string,
    type: string,
    title: string,
    content: string,
    targetUrl: string,
    referenceType?: string,
    referenceId?: string
  ): Promise<any> {
    const client = await createDbServerClient();
    const { data, error } = await client
      .from("notifications")
      .insert({
        workspace_id: workspaceId,
        profile_id: profileId,
        type,
        title,
        content,
        description: content,
        target_url: targetUrl,
        reference_type: referenceType || null,
        reference_id: referenceId || null,
        entity_type: referenceType || null,
        entity_id: referenceId || null,
        body: content,
        is_read: false
      })
      .select()
      .single();

    if (error) {
      logger.warn("Failed to create in-app notification row", { error: error.message });
    }
    return data;
  }

  /**
   * Deletes a specific notification record
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const client = await createDbServerClient();
    const { error } = await client
      .from("notifications")
      .delete()
      .eq("id", notificationId)
      .eq("profile_id", userId);

    if (error) {
      throw new DatabaseError("Error deleting notification.", error);
    }
  }

  /**
   * Alias: Marks a single notification as read
   */
  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    return this.markNotificationAsRead(userId, notificationId);
  }

  /**
   * Alias: Marks all user notifications as read
   */
  async markAllNotificationsRead(userId: string): Promise<void> {
    return this.markNotificationsRead(userId);
  }

  /**
   * Runs check for task due dates and generates notifications
   */
  async checkDueDateNotifications(workspaceId: string, userId: string): Promise<void> {
    const client = createDbAdminClient();
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: tasks, error } = await client
      .from("tasks")
      .select("id, title, due_date, due_date_time, project_id")
      .eq("workspace_id", workspaceId)
      .eq("assignee_id", userId)
      .neq("status", "done");

    if (error || !tasks) return;

    const today = new Date(todayStr);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    for (const task of tasks) {
      const dateVal = task.due_date || (task.due_date_time ? task.due_date_time.split("T")[0] : null);
      if (!dateVal) continue;

      let type: "task_due_today" | "task_due_tomorrow" | "task_overdue" | null = null;
      let title = "";
      let description = "";

      if (dateVal === todayStr) {
        type = "task_due_today";
        title = "Task Due Today";
        description = `Task "${task.title}" is due today.`;
      } else if (dateVal === tomorrowStr) {
        type = "task_due_tomorrow";
        title = "Task Due Tomorrow";
        description = `Task "${task.title}" is due tomorrow.`;
      } else if (new Date(dateVal) < today) {
        type = "task_overdue";
        title = "Task Overdue";
        description = `Task "${task.title}" is overdue!`;
      }

      if (type) {
        const { data: existing } = await client
          .from("notifications")
          .select("id")
          .eq("profile_id", userId)
          .eq("entity_id", task.id)
          .eq("type", type)
          .limit(1);

        if (!existing || existing.length === 0) {
          const targetUrl = task.project_id
            ? `/workspace/${workspaceId}/project/${task.project_id}`
            : `/workspace/${workspaceId}`;

          await this.createNotification(
            workspaceId,
            userId,
            type,
            title,
            description,
            targetUrl,
            "task",
            task.id
          );
        }
      }
    }
  }

  /**
   * Global workspace cross-search filters
   */
  async searchWorkspace(
    userId: string, 
    payload: GlobalSearchDTO
  ): Promise<{ channels: any[]; messages: any[]; users: any[]; projects: any[]; tasks: any[]; conversations: any[] }> {
    const context = { userId, workspaceId: payload.workspaceId, query: payload.query, action: "searchWorkspace" };
    logger.info("BLL: Executing global search across workspace structures", context);

    const validation = globalSearchSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid search query parameters.", validation.error.format());
    }

    const client = await createDbServerClient();
    const queryStr = `%${payload.query}%`;

    // 1. Search Channels matching query
    const { data: channels } = await client
      .from("channels")
      .select("id, name, description, is_private")
      .eq("workspace_id", payload.workspaceId)
      .eq("is_archived", false)
      .ilike("name", queryStr);

    // 2. Search Messages content
    const { data: messages } = await client
      .from("messages")
      .select(`
        id,
        content,
        created_at,
        channel_id,
        channels!inner(name, is_private),
        profiles(first_name, last_name, avatar_url)
      `)
      .eq("channels.workspace_id", payload.workspaceId)
      .is("deleted_at", null)
      .ilike("content", queryStr)
      .limit(30);

    // 3. Search Profiles
    const { data: profiles } = await client
      .from("profiles")
      .select("id, email, first_name, last_name, avatar_url")
      .or(`first_name.ilike.${queryStr},last_name.ilike.${queryStr},email.ilike.${queryStr}`)
      .limit(20);

    // 4. Search Projects
    const { data: projects } = await client
      .from("projects")
      .select("id, name, description, status")
      .eq("workspace_id", payload.workspaceId)
      .ilike("name", queryStr);

    // 5. Search Tasks
    const { data: tasks } = await client
      .from("tasks")
      .select("id, title, description, status, project_id")
      .eq("workspace_id", payload.workspaceId)
      .or(`title.ilike.${queryStr},description.ilike.${queryStr}`);

    // 6. Search Conversations (DMs) user belongs to
    const { data: dmMembers } = await client
      .from("conversation_members")
      .select("conversation_id")
      .eq("profile_id", userId);
    const userConvIds = (dmMembers ?? []).map(m => m.conversation_id);

    let conversations: any[] = [];
    if (userConvIds.length > 0) {
      const { data: convs } = await client
        .from("conversations")
        .select("id, name, type")
        .eq("workspace_id", payload.workspaceId)
        .in("id", userConvIds)
        .ilike("name", queryStr);
      conversations = convs ?? [];
    }

    return {
      channels: channels || [],
      messages: (messages || []).map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        createdAt: msg.created_at,
        channelId: msg.channel_id,
        channelName: msg.channels?.name,
        isPrivate: msg.channels?.is_private,
        sender: msg.profiles ? `${msg.profiles.first_name || ""} ${msg.profiles.last_name || ""}`.trim() : "Member"
      })),
      users: profiles || [],
      projects: projects || [],
      tasks: tasks || [],
      conversations: conversations || []
    };
  }

  /**
   * Generates a signed upload URL inside Supabase Storage workspace bucket
   */
  async generateUploadPresignedUrl(
    userId: string, 
    workspaceId: string, 
    fileName: string, 
    fileType: string
  ): Promise<{ uploadUrl: string; publicUrl: string; filePath: string }> {
    const client = await createDbServerClient();
    
    // Generate secure filepath: workspaces/[workspaceId]/[userId]/[uuid]-[fileName]
    const fileUuid = crypto.randomUUID();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.]/g, "_");
    const filePath = `workspaces/${workspaceId}/${userId}/${fileUuid}-${sanitizedName}`;

    logger.info(`BLL: Generating presigned upload URL for: ${filePath}`);

    // Call Supabase storage signed upload creator
    const { data, error } = await client.storage
      .from("workspace-files")
      .createSignedUploadUrl(filePath);

    if (error || !data) {
      logger.error("Failed to generate signed upload URL from Supabase Storage", error);
      throw new DatabaseError("Error generating storage credentials.", error);
    }

    // Get public asset URL reference
    const { data: publicData } = client.storage
      .from("workspace-files")
      .getPublicUrl(filePath);

    return {
      uploadUrl: data.signedUrl,
      publicUrl: publicData.publicUrl,
      filePath
    };
  }

  /**
   * Creates a chronological activity log entry
   */
  async createActivityLog(
    workspaceId: string,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>
  ): Promise<any> {
    const client = createDbAdminClient();
    const { data, error } = await client
      .from("activity_logs")
      .insert({
        workspace_id: workspaceId,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        entity_type: targetType,
        entity_id: targetId,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      logger.warn(`Failed to insert activity log for action: ${action}`, { error: error.message });
    }
    return data;
  }

  /**
   * Lists chronological activity logs for a workspace with pagination
   */
  async listActivityLogs(
    workspaceId: string,
    limit: number = 30,
    offset: number = 0
  ): Promise<any[]> {
    const client = createDbAdminClient();
    const { data, error } = await client
      .from("activity_logs")
      .select(`
        *,
        profiles (
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new DatabaseError("Error fetching activity logs.", error);
    }

    return (data || []).map((log: any) => {
      const actor = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
      return {
        id: log.id,
        workspaceId: log.workspace_id,
        actorId: log.actor_id,
        actorName: actor ? `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || actor.email : "Someone",
        actorAvatarUrl: actor?.avatar_url || undefined,
        action: log.action,
        targetType: log.target_type,
        targetId: log.target_id,
        metadata: log.metadata,
        createdAt: log.created_at
      };
    });
  }

  /**
   * Uploads a file attachment and stores it in database + storage
   */
  async uploadAttachment(payload: {
    userId: string;
    workspaceId: string;
    entityType: string;
    entityId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileBuffer: Buffer;
  }): Promise<any> {
    const { userId, workspaceId, entityType, entityId, fileName, mimeType, fileSize, fileBuffer } = payload;
    
    // 1. Verify workspace membership
    const { permissionService } = await import("./permission.service");
    await permissionService.assertWorkspaceMember(userId, workspaceId);

    // 2. Validate maximum file size (50MB = 52428800 bytes)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      throw new ValidationError("File size exceeds the 50MB limit.");
    }

    const client = createDbAdminClient();

    // 3. Generate storage path
    const fileUuid = crypto.randomUUID();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.]/g, "_");
    const storagePath = `${workspaceId}/${entityType}/${fileUuid}-${sanitizedName}`;

    // 4. Upload file to Supabase Storage
    const { error: uploadError } = await client.storage
      .from("workspace-files")
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      logger.error("Failed to upload attachment file to Supabase Storage", uploadError ? new Error(uploadError.message) : undefined);
      throw new DatabaseError("Error saving attachment file in storage.", uploadError);
    }

    // 5. Create attachment record in database
    const { data: attachment, error: dbError } = await client
      .from("attachments")
      .insert({
        workspace_id: workspaceId,
        uploader_id: userId,
        bucket: "workspace-files",
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        entity_type: entityType,
        entity_id: entityId
      })
      .select()
      .single();

    if (dbError || !attachment) {
      // Cleanup uploaded file on DB insert failure
      await client.storage.from("workspace-files").remove([storagePath]);
      logger.error("Failed to insert attachment row in database", dbError ? new Error(dbError.message) : undefined);
      throw new DatabaseError("Error saving attachment details.", dbError);
    }

    // 6. Log activity
    await this.logActivity(
      client,
      workspaceId,
      userId,
      "file.upload",
      "attachment",
      attachment.id,
      { fileName, fileSize, entityType }
    );

    return {
      id: attachment.id,
      workspaceId: attachment.workspace_id,
      uploaderId: attachment.uploader_id,
      bucket: attachment.bucket,
      storagePath: attachment.storage_path,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize: Number(attachment.file_size),
      entityType: attachment.entity_type,
      entityId: attachment.entity_id,
      createdAt: attachment.created_at
    };
  }

  /**
   * Deletes an attachment from database and storage
   */
  async deleteAttachment(userId: string, attachmentId: string): Promise<void> {
    const client = createDbAdminClient();

    // 1. Fetch attachment details
    const { data: attachment, error: fetchError } = await client
      .from("attachments")
      .select("*")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      throw new NotFoundError("Attachment not found.");
    }

    // 2. Validate workspace membership
    const { permissionService } = await import("./permission.service");
    const role = await permissionService.assertWorkspaceMember(userId, attachment.workspace_id);

    // 3. Authorization check (only owner, admin, or the uploader can delete)
    const isOwnerOrAdmin = role === "owner" || role === "admin";
    const isUploader = attachment.uploader_id === userId;
    if (!isOwnerOrAdmin && !isUploader) {
      const { ForbiddenError } = await import("../errors/custom-errors");
      throw new ForbiddenError("You do not have permission to delete this attachment.");
    }

    // 4. Remove file from storage
    const { error: storageError } = await client.storage
      .from(attachment.bucket)
      .remove([attachment.storage_path]);

    if (storageError) {
      logger.warn("Failed to delete attachment file from storage", { error: storageError.message });
    }

    // 5. Delete metadata record
    const { error: dbError } = await client
      .from("attachments")
      .delete()
      .eq("id", attachmentId);

    if (dbError) {
      throw new DatabaseError("Error deleting attachment metadata from database.", dbError);
    }

    // 6. Log activity
    await this.logActivity(
      client,
      attachment.workspace_id,
      userId,
      "file.delete",
      "attachment",
      attachmentId,
      { fileName: attachment.file_name }
    );
  }

  /**
   * Lists attachments mapped to an entity
   */
  async listAttachments(userId: string, entityType: string, entityId: string): Promise<any[]> {
    const client = createDbAdminClient();

    // 1. Fetch any one attachment to verify workspace ID (or check directly if we have entity's workspace)
    let workspaceId: string | null = null;

    if (entityType === "project") {
      const { data: p } = await client.from("projects").select("workspace_id").eq("id", entityId).single();
      workspaceId = p?.workspace_id || null;
    } else if (entityType === "channel") {
      const { data: c } = await client.from("channels").select("workspace_id").eq("id", entityId).single();
      workspaceId = c?.workspace_id || null;
    } else if (entityType === "task") {
      const { data: t } = await client.from("tasks").select("workspace_id").eq("id", entityId).single();
      workspaceId = t?.workspace_id || null;
    } else if (entityType === "message") {
      const { data: msg } = await client.from("messages").select("channels(workspace_id), conversations(workspace_id)").eq("id", entityId).single();
      const channels: any = Array.isArray(msg?.channels) ? msg?.channels[0] : msg?.channels;
      const conversations: any = Array.isArray(msg?.conversations) ? msg?.conversations[0] : msg?.conversations;
      workspaceId = channels?.workspace_id || conversations?.workspace_id || null;
    }

    // Fallback search in attachments table if entity lookup fails
    if (!workspaceId) {
      const { data: att } = await client.from("attachments").select("workspace_id").eq("entity_id", entityId).limit(1);
      if (att && att.length > 0) {
        workspaceId = att[0].workspace_id;
      }
    }

    if (workspaceId) {
      const { permissionService } = await import("./permission.service");
      await permissionService.assertWorkspaceMember(userId, workspaceId);
    }

    const { data: attachments, error } = await client
      .from("attachments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError("Error listing attachments.", error);
    }

    return (attachments || []).map((att: any) => ({
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
    }));
  }

  /**
   * Retrieves single attachment detail
   */
  async getAttachment(userId: string, attachmentId: string): Promise<any> {
    const client = createDbAdminClient();
    const { data: attachment, error } = await client
      .from("attachments")
      .select("*")
      .eq("id", attachmentId)
      .single();

    if (error || !attachment) {
      throw new NotFoundError("Attachment not found.");
    }

    const { permissionService } = await import("./permission.service");
    await permissionService.assertWorkspaceMember(userId, attachment.workspace_id);

    return {
      id: attachment.id,
      workspaceId: attachment.workspace_id,
      uploaderId: attachment.uploader_id,
      bucket: attachment.bucket,
      storagePath: attachment.storage_path,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize: Number(attachment.file_size),
      entityType: attachment.entity_type,
      entityId: attachment.entity_id,
      createdAt: attachment.created_at
    };
  }

  /**
   * Generates a temporary signed URL to download/read the attachment
   */
  async generateSignedUrl(userId: string, attachmentId: string): Promise<string> {
    const attachment = await this.getAttachment(userId, attachmentId);
    const client = createDbAdminClient();

    const { data, error } = await client.storage
      .from(attachment.bucket)
      .createSignedUrl(attachment.storagePath, 3600); // 1 hour expiration

    if (error || !data) {
      logger.error("Failed to generate signed download URL", error);
      throw new DatabaseError("Error generating signed download link.", error);
    }

    return data.signedUrl;
  }
}

export const collaborationService = new CollaborationService();
