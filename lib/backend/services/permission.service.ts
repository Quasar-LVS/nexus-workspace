import { createDbAdminClient } from "../database/client";
import { ForbiddenError, NotFoundError } from "../errors/custom-errors";
import { logger } from "../utils/logger";
import { UserRole } from "@/types";

/**
 * Permission Service (BLL)
 * Centralized permission and authorization checks for workspace operations.
 * All checks use the admin client to bypass RLS — validation is done in application logic.
 */
export class PermissionService {

  /**
   * Returns the role of a user within a workspace, or null if not a member.
   */
  async getMemberRole(userId: string, workspaceId: string): Promise<UserRole | null> {
    const client = createDbAdminClient();

    const { data, error } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return null;
    }

    return data.role as UserRole;
  }

  /**
   * Asserts that the user is a member of the workspace.
   * Throws ForbiddenError if not.
   */
  async assertWorkspaceMember(userId: string, workspaceId: string): Promise<UserRole> {
    const role = await this.getMemberRole(userId, workspaceId);

    if (!role) {
      logger.warn("Permission denied: user is not a workspace member", {
        userId,
        action: "assertWorkspaceMember",
      });
      try {
        const adminClient = createDbAdminClient();
        await adminClient.from("activity_logs").insert({
          workspace_id: workspaceId,
          actor_id: userId,
          action: "auth.failed",
          target_type: "workspace",
          target_id: workspaceId,
          metadata: { check: "assertWorkspaceMember" }
        });
      } catch (err) {
        logger.warn("Failed to write auth.failed log for assertWorkspaceMember", { error: String(err) });
      }
      throw new ForbiddenError("You are not a member of this workspace.");
    }

    return role;
  }

  /**
   * Asserts that the user has one of the required roles in the workspace.
   * Throws ForbiddenError if the user's role is not in the required set.
   */
  async assertRole(
    userId: string,
    workspaceId: string,
    requiredRoles: UserRole[]
  ): Promise<UserRole> {
    const role = await this.assertWorkspaceMember(userId, workspaceId);

    if (!requiredRoles.includes(role)) {
      logger.warn("Permission denied: insufficient role", {
        userId,
        action: "assertRole",
        currentRole: role,
        requiredRoles: requiredRoles.join(", "),
      });
      try {
        const adminClient = createDbAdminClient();
        await adminClient.from("activity_logs").insert({
          workspace_id: workspaceId,
          actor_id: userId,
          action: "auth.failed",
          target_type: "workspace",
          target_id: workspaceId,
          metadata: { check: "assertRole", currentRole: role, requiredRoles }
        });
      } catch (err) {
        logger.warn("Failed to write auth.failed log for assertRole", { error: String(err) });
      }
      throw new ForbiddenError(
        `This action requires one of the following roles: ${requiredRoles.join(", ")}. Your current role is: ${role}.`
      );
    }

    return role;
  }

  /**
   * Returns true if the user is an owner or admin of the workspace.
   */
  async canManageMembers(userId: string, workspaceId: string): Promise<boolean> {
    const role = await this.getMemberRole(userId, workspaceId);
    return role === "owner" || role === "admin";
  }

  /**
   * Returns true if the user is the workspace owner.
   */
  async isOwner(userId: string, workspaceId: string): Promise<boolean> {
    const role = await this.getMemberRole(userId, workspaceId);
    return role === "owner";
  }
}

export const permissionService = new PermissionService();
