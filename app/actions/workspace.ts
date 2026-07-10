"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { workspaceService } from "@/lib/backend/services/workspace.service";
import { permissionService } from "@/lib/backend/services/permission.service";
import { createDbAdminClient } from "@/lib/backend/database/client";
import { CreateWorkspaceDTO, InviteMemberDTO, JoinWorkspaceDTO } from "@/lib/backend/validation/workspace.schema";
import { Workspace, UserRole } from "@/types";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Creates a new Workspace tenant
 */
export async function createWorkspaceAction(payload: CreateWorkspaceDTO): Promise<ActionResult<Workspace>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const newWorkspace = await workspaceService.createWorkspace(userId, payload);
    
    // Revalidate dashboard routes
    revalidatePath("/dashboard");
    
    return { success: true, data: newWorkspace };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create workspace." };
  }
}

/**
 * Server Action: Invites a member to a workspace
 */
export async function inviteMemberAction(payload: InviteMemberDTO): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const invitation = await workspaceService.inviteMember(userId, payload);
    return { success: true, data: invitation };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to invite member." };
  }
}

/**
 * Server Action: Joins a user to a workspace based on invitation token
 */
export async function joinWorkspaceAction(payload: JoinWorkspaceDTO): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const result = await workspaceService.joinWorkspace(userId, payload);
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to join workspace." };
  }
}

/**
 * Server Action: Retrieves all workspaces linked to a user profile
 */
export async function listUserWorkspacesAction(): Promise<ActionResult<Workspace[]>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const list = await workspaceService.listUserWorkspaces(userId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load workspaces." };
  }
}

/**
 * Server Action: Alias for listUserWorkspacesAction (Sprint 3.2 naming convention)
 */
export async function getUserWorkspacesAction(): Promise<ActionResult<Workspace[]>> {
  return listUserWorkspacesAction();
}

/**
 * Server Action: Switches the active workspace after validating membership.
 * Returns workspace data and the user's role within it.
 */
export async function switchWorkspaceAction(
  workspaceId: string
): Promise<ActionResult<{ workspace: Workspace; role: UserRole }>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    // Verify the user is a member of this workspace
    const role = await permissionService.assertWorkspaceMember(userId, workspaceId);

    // Fetch workspace details
    const workspaces = await workspaceService.listUserWorkspaces(userId);
    const workspace = workspaces.find((w) => w.id === workspaceId);

    if (!workspace) {
      return { success: false, error: "Workspace not found." };
    }

    revalidatePath("/dashboard");
    return { success: true, data: { workspace, role } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to switch workspace." };
  }
}

/**
 * Server Action: Updates the active AI provider setting for a workspace
 */
export async function updateWorkspaceAIProviderAction(
  workspaceId: string,
  provider: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await workspaceService.updateWorkspaceAIProvider(userId, workspaceId, provider);
    revalidatePath(`/workspace/${workspaceId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update AI settings." };
  }
}

/**
 * Server Action: Lists all invitations for a workspace
 */
export async function listWorkspaceInvitationsAction(
  workspaceId: string
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const invites = await workspaceService.listWorkspaceInvitations(userId, workspaceId);
    return { success: true, data: invites };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to retrieve invitations." };
  }
}

/**
 * Server Action: Revokes a pending workspace invitation
 */
export async function revokeInvitationAction(
  workspaceId: string,
  inviteId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    await workspaceService.revokeInvitation(userId, workspaceId, inviteId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to revoke invitation." };
  }
}

/**
 * Server Action: Retrieves pending invitations for the logged-in user's email address
 */
export async function getPendingInvitationsAction(): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const clerkUser = await currentUser();
    if (!clerkUser) {
      return { success: false, error: "Authentication profile details not found." };
    }

    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      return { success: true, data: [] };
    }

    const invites = await workspaceService.getPendingInvitationsForEmail(email);
    return { success: true, data: invites };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch pending invitations." };
  }
}

/**
 * Server Action: Declines/ignores a pending invitation
 */
export async function declineInvitationAction(
  inviteId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Authentication required." };
    }

    const dbClient = createDbAdminClient();
    
    const { error } = await dbClient
      .from("workspace_invitations")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("id", inviteId);

    if (error) {
      return { success: false, error: "Database error declining invitation." };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to decline invitation." };
  }
}
