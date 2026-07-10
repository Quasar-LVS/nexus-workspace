import { createDbAdminClient } from "../database/client";
import {
  updateMemberRoleSchema,
  removeMemberSchema,
  UpdateMemberRoleDTO,
  RemoveMemberDTO,
} from "../validation/member.schema";
import { permissionService } from "./permission.service";
import { ValidationError, DatabaseError, ForbiddenError, NotFoundError } from "../errors/custom-errors";
import { logger } from "../utils/logger";
import { WorkspaceMemberWithProfile, UserRole } from "@/types";

/**
 * Member Service (BLL)
 * Manages workspace member operations: listing, role changes, and removal.
 */
export class MemberService {

  /**
   * Helper: Logs activities within the database (mirrors WorkspaceService pattern)
   */
  private async logActivity(
    client: ReturnType<typeof createDbAdminClient>,
    workspaceId: string,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const { error } = await client
      .from("activity_logs")
      .insert({
        workspace_id: workspaceId,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata: metadata || {},
      });

    if (error) {
      logger.warn(`Failed to insert activity log for action: ${action}`, { error: error.message });
    }
  }

  /**
   * Lists all active members of a workspace with their profile information.
   * Caller must be a workspace member.
   */
  async listWorkspaceMembers(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceMemberWithProfile[]> {
    const context = { userId, workspaceId, action: "listWorkspaceMembers" };
    logger.info("BLL: Listing workspace members", context);

    // Verify caller is a member
    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const client = createDbAdminClient();

    const { data, error } = await client
      .from("workspace_members")
      .select(`
        id,
        workspace_id,
        profile_id,
        role,
        created_at,
        profiles!profile_id (
          id,
          email,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("Failed to fetch workspace members", error as unknown as Error, context);
      throw new DatabaseError("Error fetching workspace members.", error);
    }

    return (data ?? []).map((row: any) => {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        profileId: row.profile_id,
        role: row.role as UserRole,
        createdAt: row.created_at,
        profile: {
          id: prof?.id || row.profile_id,
          email: prof?.email || "",
          firstName: prof?.first_name || null,
          lastName: prof?.last_name || null,
          avatarUrl: prof?.avatar_url || null,
        },
      };
    });
  }

  /**
   * Returns the role of the calling user within a workspace.
   */
  async getMemberRole(userId: string, workspaceId: string): Promise<UserRole | null> {
    return permissionService.getMemberRole(userId, workspaceId);
  }

  /**
   * Updates a member's role within a workspace.
   * Business rules:
   * - Only owner/admin can change roles
   * - Cannot demote the owner
   * - Cannot promote anyone to owner (ownership transfer is a separate operation)
   * - Admin cannot promote to admin (only owner can)
   */
  async updateMemberRole(
    actorId: string,
    payload: UpdateMemberRoleDTO
  ): Promise<void> {
    const { workspaceId, profileId, role: newRole } = payload;
    const context = { actorId, workspaceId, targetProfileId: profileId, newRole, action: "updateMemberRole" };
    logger.info("BLL: Updating member role", context);

    // 1. Validate DTO
    const validation = updateMemberRoleSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid role update parameters.", validation.error.format());
    }

    // 2. Verify actor has permission to manage members
    const actorRole = await permissionService.assertRole(actorId, workspaceId, ["owner", "admin"]);

    // 3. Cannot promote anyone to owner
    if (newRole === "owner") {
      throw new ForbiddenError("Cannot promote a member to owner. Use ownership transfer instead.");
    }

    // 4. Only owner can promote to admin
    if (newRole === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the workspace owner can promote members to admin.");
    }

    // 5. Get the target member's current role
    const targetRole = await permissionService.getMemberRole(profileId, workspaceId);
    if (!targetRole) {
      throw new NotFoundError("Target user is not a member of this workspace.");
    }

    // 6. Cannot demote the owner
    if (targetRole === "owner") {
      throw new ForbiddenError("Cannot change the workspace owner's role.");
    }

    // 7. Admin cannot change another admin's role
    if (targetRole === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the workspace owner can change an admin's role.");
    }

    // 8. Perform the update
    const client = createDbAdminClient();
    const { error } = await client
      .from("workspace_members")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("profile_id", profileId)
      .is("deleted_at", null);

    if (error) {
      logger.error("Failed to update member role", error as unknown as Error, context);
      throw new DatabaseError("Error updating member role.", error);
    }

    // 9. Log activity
    await this.logActivity(
      client,
      workspaceId,
      actorId,
      "member.role_changed",
      "member",
      profileId,
      { previousRole: targetRole, newRole }
    );

    logger.info(`Member role updated: ${profileId} → ${newRole}`, context);
  }

  /**
   * Removes (soft-deletes) a member from the workspace.
   * Business rules:
   * - Only owner/admin can remove members
   * - Cannot remove the owner
   * - Admin cannot remove another admin
   */
  async removeMember(
    actorId: string,
    payload: RemoveMemberDTO
  ): Promise<void> {
    const { workspaceId, profileId } = payload;
    const context = { actorId, workspaceId, targetProfileId: profileId, action: "removeMember" };
    logger.info("BLL: Removing workspace member", context);

    // 1. Validate DTO
    const validation = removeMemberSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid member removal parameters.", validation.error.format());
    }

    // 2. Verify actor has permission
    const actorRole = await permissionService.assertRole(actorId, workspaceId, ["owner", "admin"]);

    // 3. Cannot remove yourself via this method
    if (actorId === profileId) {
      throw new ForbiddenError("Cannot remove yourself from the workspace. Use 'Leave Workspace' instead.");
    }

    // 4. Get target role
    const targetRole = await permissionService.getMemberRole(profileId, workspaceId);
    if (!targetRole) {
      throw new NotFoundError("Target user is not a member of this workspace.");
    }

    // 5. Cannot remove the owner
    if (targetRole === "owner") {
      throw new ForbiddenError("Cannot remove the workspace owner.");
    }

    // 6. Admin cannot remove another admin
    if (targetRole === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the workspace owner can remove an admin.");
    }

    // 7. Soft-delete the membership
    const client = createDbAdminClient();
    const { error } = await client
      .from("workspace_members")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: actorId,
      })
      .eq("workspace_id", workspaceId)
      .eq("profile_id", profileId)
      .is("deleted_at", null);

    if (error) {
      logger.error("Failed to remove workspace member", error as unknown as Error, context);
      throw new DatabaseError("Error removing workspace member.", error);
    }

    // 8. Log activity
    await this.logActivity(
      client,
      workspaceId,
      actorId,
      "member.removed",
      "member",
      profileId,
      { removedRole: targetRole }
    );

    logger.info(`Member removed from workspace: ${profileId}`, context);
  }
}

export const memberService = new MemberService();
