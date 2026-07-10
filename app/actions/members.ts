"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { memberService } from "@/lib/backend/services/member.service";
import { permissionService } from "@/lib/backend/services/permission.service";
import { WorkspaceMemberWithProfile, UserRole } from "@/types";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Lists all members of a workspace with profile details.
 */
export async function listWorkspaceMembersAction(
  workspaceId: string
): Promise<ActionResult<WorkspaceMemberWithProfile[]>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const members = await memberService.listWorkspaceMembers(userId, workspaceId);
    return { success: true, data: members };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load members." };
  }
}

/**
 * Server Action: Returns the calling user's role in a workspace.
 */
export async function getCurrentMemberRoleAction(
  workspaceId: string
): Promise<ActionResult<UserRole>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const role = await permissionService.getMemberRole(userId, workspaceId);
    if (!role) {
      return { success: false, error: "You are not a member of this workspace." };
    }

    return { success: true, data: role };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to get role." };
  }
}

/**
 * Server Action: Updates a member's role within a workspace.
 */
export async function updateMemberRoleAction(
  workspaceId: string,
  profileId: string,
  newRole: UserRole
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await memberService.updateMemberRole(userId, {
      workspaceId,
      profileId,
      role: newRole,
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update role." };
  }
}

/**
 * Server Action: Removes a member from a workspace (soft-delete).
 */
export async function removeMemberAction(
  workspaceId: string,
  profileId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await memberService.removeMember(userId, {
      workspaceId,
      profileId,
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to remove member." };
  }
}
