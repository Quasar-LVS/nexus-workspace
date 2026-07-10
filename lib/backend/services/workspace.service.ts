import {
  createDbServerClient,
  createDbAdminClient,
} from "../database/client";
import {
  createWorkspaceSchema,
  inviteMemberSchema,
  joinWorkspaceSchema,
  CreateWorkspaceDTO,
  InviteMemberDTO,
  JoinWorkspaceDTO
} from "../validation/workspace.schema";
import { ValidationError, DatabaseError, NotFoundError, ForbiddenError } from "../errors/custom-errors";
import { permissionService } from "./permission.service";
import { logger } from "../utils/logger";
import { Workspace } from "@/types";
import { currentUser, clerkClient } from "@clerk/nextjs/server";

export class WorkspaceService {

  /**
   * Helper: Logs activities within the database
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
   * Generates a new isolated Workspace tenant, default channel, getting started board, and activity log.
   * Automatically ensures the Clerk user has a profile row before creating ownership.
   */
  async createWorkspace(userId: string, payload: CreateWorkspaceDTO): Promise<Workspace> {
    const context = { userId, slug: payload.slug, action: "createWorkspace" };
    logger.info(`BLL: Creating workspace "${payload.name}"`, context);

    // 1. Validate parameters
    const validation = createWorkspaceSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid workspace attributes.", validation.error.format());
    }

    const client = createDbAdminClient();

    // 2. Ensure the user has a profile row (prevents FK failure on workspace_members)
    await this.ensureProfile(client, userId);

    // 3. Insert Workspace row
    const { data: workspaceData, error: wsError } = await client
      .from("workspaces")
      .insert({
        name: payload.name,
        slug: payload.slug,
        company_size: payload.companySize || null,
        industry: payload.industry || null,
        timezone: payload.timezone || null
      })
      .select()
      .single();

    if (wsError) {
      logger.error("Failed to insert workspace in DB", wsError, context);
      throw new DatabaseError("Error persisting workspace details.", wsError);
    }

    const workspaceId = workspaceData.id;

    // 4. Map Owner membership
    const { error: memberError } = await client
      .from("workspace_members")
      .insert({
        workspace_id: workspaceId,
        profile_id: userId,
        role: "owner"
      });

    if (memberError) {
      logger.error(`Failed to assign owner role for workspace: ${workspaceId}`, memberError, context);
      throw new DatabaseError("Error establishing workspace ownership mapping.", memberError);
    }

    // 5. Create default "#general" Channel
    const { data: channelData, error: chanError } = await client
      .from("channels")
      .insert({
        workspace_id: workspaceId,
        name: "general",
        description: "General workspace discussion",
        is_private: false
      })
      .select()
      .single();

    if (chanError) {
      logger.warn(`Failed to create default channel for workspace: ${workspaceId}`, { error: chanError.message });
    }

    // 5b. Add owner to channel_members for #general
    if (channelData) {
      const { error: chanMemberError } = await client
        .from("channel_members")
        .insert({
          channel_id: channelData.id,
          profile_id: userId,
          role: "owner"
        });

      if (chanMemberError) {
        logger.warn(`Failed to add owner to #general channel_members`, { error: chanMemberError.message });
      }
    }

    // 6. Create default "Getting Started" Project board
    const { data: projectData, error: projError } = await client
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: "Getting Started",
        description: "Welcome to your workspace. Complete these tasks to get set up.",
        status: "active"
      })
      .select()
      .single();

    if (projError) {
      logger.warn(`Failed to create default project for workspace: ${workspaceId}`, { error: projError.message });
    }

    // 7. Create default onboarding tasks
    if (projectData) {
      // Check if tasks already exist for this project to ensure we only seed once
      const { count, error: countError } = await client
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectData.id);

      if (!countError && count === 0) {
        const defaultTasks = [
          {
            title: "Welcome to Nexus",
            description: "This is your first task! Explore channels, projects, and Nova AI to get started with your workspace.",
            priority: "medium",
          },
          {
            title: "Invite teammates",
            description: "Go to Settings → Members to invite your team members and assign roles.",
            priority: "high",
          },
          {
            title: "Create your first channel",
            description: "Channels organize conversations by topic. Try creating a #design or #engineering channel.",
            priority: "medium",
          },
          {
            title: "Create your first project",
            description: "Projects help you track work with Kanban boards. Create one for your current sprint.",
            priority: "low",
          },
        ];

        const taskInserts = defaultTasks.map((task, idx) => ({
          project_id: projectData.id,
          workspace_id: workspaceId,
          title: task.title,
          description: task.description,
          status: "todo",
          priority: task.priority,
          assignee_id: userId,
          position: idx
        }));

        const { error: taskError } = await client
          .from("tasks")
          .insert(taskInserts);

        if (taskError) {
          logger.warn(`Failed to create default tasks for workspace: ${workspaceId}`, { error: taskError.message });
        }
      }
    }

    // 8. Log workspace creation activity
    await this.logActivity(
      client,
      workspaceId,
      userId,
      "workspace.create",
      "workspace",
      workspaceId,
      { name: payload.name, slug: payload.slug }
    );

    return {
      id: workspaceId,
      name: workspaceData.name,
      slug: workspaceData.slug,
      ownerId: userId,
      createdAt: workspaceData.created_at
    };
  }

  /**
   * Joins a user to a workspace based on a secure invitation token
   */
  async joinWorkspace(userId: string, payload: JoinWorkspaceDTO): Promise<{ workspaceId: string; workspaceSlug: string; workspaceName: string }> {
    const context = { userId, action: "joinWorkspace" };
    logger.info(`BLL: Accepting workspace invitation`, context);

    const validation = joinWorkspaceSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invitation token is missing.", validation.error.format());
    }

    const client = createDbAdminClient();

    // 1. Verify invitation token
    const { data: invite, error: inviteError } = await client
      .from("workspace_invitations")
      .select(`
        *,
        workspaces (
          id,
          name,
          slug
        )
      `)
      .eq("token", payload.token)
      .single();

    if (inviteError || !invite) {
      throw new NotFoundError("Workspace invitation not found or is invalid.");
    }

    if (invite.status !== "pending") {
      throw new ValidationError(`Invitation has already been ${invite.status}.`);
    }

    if (new Date(invite.expires_at) < new Date()) {
      // Update status to expired
      await client
        .from("workspace_invitations")
        .update({ status: "expired" })
        .eq("id", invite.id);
      throw new ValidationError("Invitation has expired.");
    }

    // 2. Map User membership inside the workspace
    await this.ensureProfile(client, userId);

    const { error: memberError } = await client
      .from("workspace_members")
      .insert({
        workspace_id: invite.workspace_id,
        profile_id: userId,
        role: invite.role
      });

    if (memberError) {
      logger.error("Failed to map membership to joining user", memberError, context);
      throw new DatabaseError("Error finalizing workspace membership.", memberError);
    }

    // 3. Update invitation status
    const { error: updateInviteError } = await client
      .from("workspace_invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    if (updateInviteError) {
      logger.warn(`Failed to update invitation status to accepted`, { error: updateInviteError.message });
    }

    // 4. Log join activity
    await this.logActivity(
      client,
      invite.workspace_id,
      userId,
      "workspace.join",
      "workspace",
      invite.workspace_id,
      { invitationId: invite.id }
    );

    const ws = Array.isArray(invite.workspaces) ? invite.workspaces[0] : invite.workspaces;
    const workspaceSlug = ws?.slug || "";
    const workspaceName = ws?.name || "";

    // 5. Notify workspace owner/admins about the new member
    try {
      const { data: admins } = await client
        .from("workspace_members")
        .select("profile_id")
        .eq("workspace_id", invite.workspace_id)
        .in("role", ["owner", "admin"]);

      if (admins && admins.length > 0) {
        const { collaborationService } = await import("./collaboration.service");
        for (const admin of admins) {
          if (admin.profile_id === userId) continue;
          await collaborationService.createNotification(
            invite.workspace_id,
            admin.profile_id,
            "invitation_accepted",
            "Invitation Accepted",
            `A new member has joined "${workspaceName}".`,
            `/workspace/${workspaceSlug}/members`,
            "workspace",
            invite.workspace_id
          );
        }
      }
    } catch (notifErr) {
      logger.warn("Failed to send invitation acceptance notification", { error: (notifErr as Error).message });
    }

    return { 
      workspaceId: invite.workspace_id, 
      workspaceSlug, 
      workspaceName 
    };
  }

  /**
   * Retrieves all workspaces linked to a user profile
   */
  async listUserWorkspaces(userId: string): Promise<Workspace[]> {
    const context = { userId, action: "listUserWorkspaces" };
    logger.info("BLL: Listing user workspaces", context);

    const client = createDbAdminClient();

    let data: any[] | null = null;
    let error: any = null;

    const firstAttempt = await client
      .from("workspace_members")
      .select(`
      profile_id,
      workspaces (
        id,
        name,
        slug,
        ai_provider,
        created_at
      )
    `)
      .eq("profile_id", userId)
      .is("deleted_at", null);

    data = firstAttempt.data;
    error = firstAttempt.error;

    if (error && (error.message.includes("ai_provider") || error.message.includes("does not exist"))) {
      logger.warn("workspaces.ai_provider column does not exist, falling back to query without it.", context);
      const fallbackAttempt = await client
        .from("workspace_members")
        .select(`
        profile_id,
        workspaces (
          id,
          name,
          slug,
          created_at
        )
      `)
        .eq("profile_id", userId)
        .is("deleted_at", null);
      data = fallbackAttempt.data;
      error = fallbackAttempt.error;
    }

    if (error) {
      logger.error("Failed to retrieve user workspaces list", error, context);
      throw new DatabaseError("Error fetching user workspaces.", error);
    }

    return (data ?? []).map((member: any) => {
      const ws = member.workspaces;

      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        ownerId: member.profile_id,
        ai_provider: ws.ai_provider || "gemini",
        createdAt: ws.created_at,
      };
    });
  }

  /**
   * Dispatches a new workspace email invitation token
   */
  async inviteMember(userId: string, payload: InviteMemberDTO): Promise<{ inviteId: string; token: string }> {
    const context = { userId, workspaceId: payload.workspaceId, action: "inviteMember" };
    logger.info(`BLL: Dispatching invitation to ${payload.email}`, context);

    const validation = inviteMemberSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid parameters for workspace invitation.", validation.error.format());
    }

    // 1. Verify user holds admin/owner roles in workspace
    await permissionService.assertRole(userId, payload.workspaceId, ["owner", "admin"]);

    const client = createDbAdminClient();

    // 2. Generate secure token and insert invitation
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days expiration

    const { data: invite, error: inviteError } = await client
      .from("workspace_invitations")
      .insert({
        workspace_id: payload.workspaceId,
        email: payload.email,
        role: payload.role,
        token,
        status: "pending",
        expires_at: expiresAt,
        invited_by: userId
      })
      .select()
      .single();

    if (inviteError) {
      logger.error("Failed to insert workspace invitation in DB", inviteError, context);
      throw new DatabaseError("Error creating workspace invitation.", inviteError);
    }

    // 3. Dispatch Clerk invitation to trigger email delivery
    try {
      const clerk = await clerkClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await clerk.invitations.createInvitation({
        emailAddress: payload.email,
        redirectUrl: `${appUrl}/workspace/join?token=${token}`,
        publicMetadata: {
          workspaceId: payload.workspaceId,
          role: payload.role,
          invitationToken: token
        },
        ignoreExisting: true
      });
      logger.info(`Successfully dispatched Clerk invitation email to ${payload.email}`, context);
    } catch (clerkErr: any) {
      logger.error("Failed to send Clerk invitation email", clerkErr, context);
      throw new ValidationError(`Failed to send invitation email: ${clerkErr.message}`);
    }

    // 4. Log invite activity
    await this.logActivity(
      client,
      payload.workspaceId,
      userId,
      "workspace.invite",
      "invitation",
      invite.id,
      { invitedEmail: payload.email, invitedRole: payload.role }
    );

    return { inviteId: invite.id, token };
  }

  /**
   * Ensures a profile row exists for the given Clerk userId.
   * If the profile is missing, fetches user details from Clerk and creates one.
   * This prevents FK violations on workspace_members and eliminates webhook race conditions.
   */
  private async ensureProfile(
    client: ReturnType<typeof createDbAdminClient>,
    userId: string
  ): Promise<void> {
    const { data: existingProfile } = await client
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (existingProfile) return;

    logger.info(`Profile not found for user ${userId}. Fetching from Clerk and creating.`);

    const clerkUser = await currentUser();
    if (!clerkUser) {
      throw new ValidationError("Unable to resolve user details from authentication provider.");
    }

    const email = clerkUser.emailAddresses[0]?.emailAddress || "";
    const firstName = clerkUser.firstName || null;
    const lastName = clerkUser.lastName || null;
    const avatarUrl = clerkUser.imageUrl || null;

    const { error: profileError } = await client
      .from("profiles")
      .upsert({
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      logger.error("Failed to auto-create profile for user", profileError as unknown as Error, { userId });
      throw new DatabaseError("Error creating user profile.", profileError);
    }

    logger.info(`Profile auto-created successfully for user: ${userId}`);
  }

  /**
   * Updates the active AI provider setting for a workspace.
   * Restricts operation to workspace owners/admins.
   */
  async updateWorkspaceAIProvider(userId: string, workspaceId: string, provider: string): Promise<void> {
    const context = { userId, workspaceId, provider, action: "updateWorkspaceAIProvider" };
    logger.info(`BLL: Updating active AI provider for workspace: "${provider}"`, context);

    // 1. Assert workspace ownership/admin permissions
    const role = await permissionService.assertWorkspaceMember(userId, workspaceId);
    if (role !== "owner" && role !== "admin") {
      throw new ForbiddenError("Only workspace owners or admins can modify AI settings.");
    }

    // 2. Validate input
    const validProviders = ["gemini", "openai", "claude", "kimi"];
    if (!validProviders.includes(provider.toLowerCase())) {
      throw new ValidationError(`Unsupported AI provider: ${provider}`);
    }

    const client = await createDbServerClient();

    // 3. Update active provider
    const { error } = await client
      .from("workspaces")
      .update({ ai_provider: provider.toLowerCase() })
      .eq("id", workspaceId);

    if (error) {
      logger.error("Failed to update active AI provider settings", error, context);
      throw new DatabaseError("Error saving AI provider settings.", error);
    }

    // 4. Log setting update activity
    await this.logActivity(
      client,
      workspaceId,
      userId,
      "workspace.settings.ai_provider",
      "workspaces",
      workspaceId,
      { activeAIProvider: provider.toLowerCase() }
    );
  }

  /**
   * Retrieves all invitations associated with a workspace (Owner/Admin only)
   */
  async listWorkspaceInvitations(userId: string, workspaceId: string): Promise<any[]> {
    const context = { userId, workspaceId, action: "listWorkspaceInvitations" };
    logger.info("BLL: Listing workspace invitations", context);

    await permissionService.assertRole(userId, workspaceId, ["owner", "admin"]);

    const client = createDbAdminClient();
    const { data, error } = await client
      .from("workspace_invitations")
      .select(`
        id,
        email,
        role,
        status,
        token,
        expires_at,
        created_at,
        profiles!workspace_invitations_invited_by_fkey (
          first_name,
          last_name,
          email
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to list invitations from DB", error, context);
      throw new DatabaseError("Error fetching workspace invitations.", error);
    }

    return (data || []).map((row: any) => {
      const inviter = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        token: row.token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        inviterName: inviter
          ? ([inviter.first_name, inviter.last_name].filter(Boolean).join(" ") || inviter.email)
          : "System",
      };
    });
  }

  /**
   * Revokes a pending workspace invitation (Owner/Admin only)
   */
  async revokeInvitation(userId: string, workspaceId: string, inviteId: string): Promise<void> {
    const context = { userId, workspaceId, inviteId, action: "revokeInvitation" };
    logger.info("BLL: Revoking workspace invitation", context);

    await permissionService.assertRole(userId, workspaceId, ["owner", "admin"]);

    const client = createDbAdminClient();
    const { error } = await client
      .from("workspace_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to revoke invitation in DB", error, context);
      throw new DatabaseError("Error revoking workspace invitation.", error);
    }

    await this.logActivity(client, workspaceId, userId, "workspace.invite.revoke", "invitation", inviteId);
  }

  /**
   * Checks for active/pending invitations for a newly signed-in email address
   */
  async getPendingInvitationsForEmail(email: string): Promise<any[]> {
    const client = createDbAdminClient();
    const { data, error } = await client
      .from("workspace_invitations")
      .select(`
        id,
        token,
        role,
        expires_at,
        workspaces (
          id,
          name,
          slug
        )
      `)
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());

    if (error) {
      logger.error("Failed to retrieve pending invitations by email", error);
      return [];
    }

    return (data || []).map((row: any) => {
      const ws = row.workspaces;
      return {
        id: row.id,
        token: row.token,
        role: row.role,
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceSlug: ws.slug,
      };
    });
  }
}

export const workspaceService = new WorkspaceService();