import { createDbServerClient, createDbAdminClient } from "../database/client";
import { 
  createChannelSchema, 
  updateChannelSchema, 
  channelActionSchema,
  CreateChannelDTO, 
  UpdateChannelDTO, 
  ChannelActionDTO 
} from "../validation/chat.schema";
import { ValidationError, DatabaseError, NotFoundError, ForbiddenError } from "../errors/custom-errors";
import { logger } from "../utils/logger";

export interface ChannelEntity {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  isArchived: boolean;
  categoryId: string | null;
  createdAt: string;
}

export class ChatService {
  
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
      logger.warn(`Failed to insert activity log for action: ${action}`, { error: error.message });
    }
  }

  /**
   * Creates a new Slack-style Channel
   */
  async createChannel(userId: string, payload: CreateChannelDTO): Promise<ChannelEntity> {
    const context = { userId, workspaceId: payload.workspaceId, action: "createChannel" };
    logger.info(`BLL: Creating channel #${payload.name}`, context);

    const validation = createChannelSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid channel validation parameters.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Verify user is active workspace member using Admin client to bypass RLS checks (Clerk Auth)
    const adminClient = createDbAdminClient();
    const { data: member, error: memberError } = await adminClient
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", payload.workspaceId)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .single();

    if (memberError || !member) {
      throw new ForbiddenError("You must belong to this workspace to create a channel.");
    }

    // 2. Insert channel row
    const { data: channel, error: channelError } = await client
      .from("channels")
      .insert({
        workspace_id: payload.workspaceId,
        name: payload.name,
        description: payload.description || null,
        is_private: payload.isPrivate,
        category_id: payload.categoryId || null,
      })
      .select()
      .single();

    if (channelError) {
      logger.error("Failed to insert channel in DB", channelError, context);
      throw new DatabaseError("Error creating channel record.", channelError);
    }

    // 3. Map creator as channel owner member
    const { error: cmError } = await client
      .from("channel_members")
      .insert({
        channel_id: channel.id,
        profile_id: userId,
        role: "owner"
      });

    if (cmError) {
      logger.warn(`Failed to map owner in channel_members for channel: ${channel.id}`, { error: cmError.message });
    }

    // 4. Log channel creation event
    await this.logActivity(
      client,
      payload.workspaceId,
      userId,
      "channel.create",
      "channel",
      channel.id,
      { name: payload.name, isPrivate: payload.isPrivate }
    );

    return {
      id: channel.id,
      workspaceId: channel.workspace_id,
      name: channel.name,
      description: channel.description,
      isPrivate: channel.is_private,
      isArchived: channel.is_archived,
      categoryId: channel.category_id,
      createdAt: channel.created_at
    };
  }

  /**
   * Updates an existing Channel name, description, or category mapping
   */
  async updateChannel(userId: string, payload: UpdateChannelDTO): Promise<ChannelEntity> {
    const context = { userId, channelId: payload.channelId, action: "updateChannel" };
    logger.info(`BLL: Updating channel details`, context);

    const validation = updateChannelSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid parameters for channel updates.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Fetch channel details
    const { data: channel, error: fetchError } = await client
      .from("channels")
      .select("workspace_id, name")
      .eq("id", payload.channelId)
      .single();

    if (fetchError || !channel) {
      throw new NotFoundError("Target channel not found.");
    }

    // 2. Verify user has rights (channel owner, or workspace admin/owner)
    const { data: wsMember } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", channel.workspace_id)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .single();

    const { data: chanMember } = await client
      .from("channel_members")
      .select("role")
      .eq("channel_id", payload.channelId)
      .eq("profile_id", userId)
      .single();

    const isAuthorized = 
      chanMember?.role === "owner" || 
      wsMember?.role === "owner" || 
      wsMember?.role === "admin";

    if (!isAuthorized) {
      throw new ForbiddenError("You do not have permission to modify this channel.");
    }

    // 3. Perform update queries
    const { data: updated, error: updateError } = await client
      .from("channels")
      .update({
        ...(payload.name && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.isPrivate !== undefined && { is_private: payload.isPrivate }),
        ...(payload.categoryId !== undefined && { category_id: payload.categoryId }),
        updated_at: new Date().toISOString()
      })
      .eq("id", payload.channelId)
      .select()
      .single();

    if (updateError) {
      logger.error("Failed to update channel in DB", updateError, context);
      throw new DatabaseError("Error persisting channel updates.", updateError);
    }

    // 4. Log update activity
    await this.logActivity(
      client,
      updated.workspace_id,
      userId,
      "channel.update",
      "channel",
      updated.id,
      { updatedName: payload.name }
    );

    return {
      id: updated.id,
      workspaceId: updated.workspace_id,
      name: updated.name,
      description: updated.description,
      isPrivate: updated.is_private,
      isArchived: updated.is_archived,
      categoryId: updated.category_id,
      createdAt: updated.created_at
    };
  }

  /**
   * Archives a channel (marking is_archived = true)
   */
  async archiveChannel(userId: string, payload: ChannelActionDTO): Promise<void> {
    const context = { userId, channelId: payload.channelId, action: "archiveChannel" };
    logger.info("BLL: Archiving channel", context);

    const validation = channelActionSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid channel identifier.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Fetch channel workspace context
    const { data: channel, error: fetchError } = await client
      .from("channels")
      .select("workspace_id")
      .eq("id", payload.channelId)
      .single();

    if (fetchError || !channel) {
      throw new NotFoundError("Channel not found.");
    }

    // 2. Validate permissions
    const { data: wsMember } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", channel.workspace_id)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .single();

    if (!wsMember || (wsMember.role !== "owner" && wsMember.role !== "admin")) {
      throw new ForbiddenError("Only workspace administrators can archive channels.");
    }

    // 3. Mark channel as archived
    const { error: archiveError } = await client
      .from("channels")
      .update({
        is_archived: true,
        deleted_at: new Date().toISOString()
      })
      .eq("id", payload.channelId);

    if (archiveError) {
      logger.error("Failed to archive channel row", archiveError, context);
      throw new DatabaseError("Error archiving channel record.", archiveError);
    }

    // 4. Log archive event
    await this.logActivity(
      client,
      channel.workspace_id,
      userId,
      "channel.archive",
      "channel",
      payload.channelId
    );
  }

  /**
   * Joins a user to a public channel
   */
  async joinChannel(userId: string, payload: ChannelActionDTO): Promise<void> {
    const context = { userId, channelId: payload.channelId, action: "joinChannel" };
    logger.info("BLL: User joining channel", context);

    const validation = channelActionSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid channel identifier.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Verify channel is public and not archived
    const { data: channel, error: fetchError } = await client
      .from("channels")
      .select("workspace_id, is_private, is_archived")
      .eq("id", payload.channelId)
      .single();

    if (fetchError || !channel) {
      throw new NotFoundError("Channel not found.");
    }

    if (channel.is_archived) {
      throw new ValidationError("Cannot join an archived channel.");
    }

    if (channel.is_private) {
      throw new ForbiddenError("Cannot join a private channel without invitation.");
    }

    // 2. Validate workspace membership
    const { data: wsMember } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", channel.workspace_id)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .single();

    if (!wsMember) {
      throw new ForbiddenError("You must belong to the workspace to join its channels.");
    }

    // 3. Add to channel_members
    const { error: joinError } = await client
      .from("channel_members")
      .insert({
        channel_id: payload.channelId,
        profile_id: userId,
        role: "member"
      });

    if (joinError) {
      logger.error("Failed to join channel mapping in DB", joinError, context);
      throw new DatabaseError("Error finalizing channel membership.", joinError);
    }

    // 4. Log activity
    await this.logActivity(
      client,
      channel.workspace_id,
      userId,
      "channel.join",
      "channel",
      payload.channelId
    );
  }

  /**
   * Leaves a channel
   */
  async leaveChannel(userId: string, payload: ChannelActionDTO): Promise<void> {
    const context = { userId, channelId: payload.channelId, action: "leaveChannel" };
    logger.info("BLL: User leaving channel", context);

    const validation = channelActionSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid channel identifier.", validation.error.format());
    }

    const client = await createDbServerClient();

    // 1. Fetch channel workspace context
    const { data: channel, error: fetchError } = await client
      .from("channels")
      .select("workspace_id, name")
      .eq("id", payload.channelId)
      .single();

    if (fetchError || !channel) {
      throw new NotFoundError("Channel not found.");
    }

    if (channel.name === "general") {
      throw new ValidationError("Workspace members cannot leave the general channel.");
    }

    // 2. Remove from channel_members
    const { error: leaveError } = await client
      .from("channel_members")
      .delete()
      .eq("channel_id", payload.channelId)
      .eq("profile_id", userId);

    if (leaveError) {
      logger.error("Failed to delete channel membership", leaveError, context);
      throw new DatabaseError("Error leaving channel.", leaveError);
    }

    // 3. Log activity
    await this.logActivity(
      client,
      channel.workspace_id,
      userId,
      "channel.leave",
      "channel",
      payload.channelId
    );
  }

  /**
   * Lists all public channels in a workspace and private ones the user belongs to
   */
  async listChannels(userId: string, workspaceId: string): Promise<any[]> {
    const context = { userId, workspaceId, action: "listChannels" };
    logger.info("BLL: Listing workspace channels", context);

    const client = await createDbServerClient();

    // Query channels
    const { data: channels, error } = await client
      .from("channels")
      .select(`
        id,
        name,
        description,
        is_private,
        is_archived,
        category_id,
        created_at,
        channel_members (profile_id)
      `)
      .eq("workspace_id", workspaceId)
      .eq("is_archived", false);

    if (error) {
      logger.error("Failed to list channels from DB", error, context);
      throw new DatabaseError("Error loading channels list.", error);
    }

    // Filter private channels: Keep if user is in channel_members or channel is public
    return (channels || [])
      .filter((ch: any) => {
        if (!ch.is_private) return true;
        return ch.channel_members.some((cm: any) => cm.profile_id === userId);
      })
      .map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        isPrivate: ch.is_private,
        categoryId: ch.category_id,
        createdAt: ch.created_at,
        isMember: ch.channel_members.some((cm: any) => cm.profile_id === userId)
      }));
  }

  /**
   * Lists all categories defined for a workspace
   */
  async listCategories(workspaceId: string): Promise<any[]> {
    const client = await createDbServerClient();

    const { data, error } = await client
      .from("channel_categories")
      .select("id, name")
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error(`Failed to list channel categories for workspace: ${workspaceId}`, error);
      throw new DatabaseError("Error loading channel categories.", error);
    }

    return data || [];
  }
}

export const chatService = new ChatService();
