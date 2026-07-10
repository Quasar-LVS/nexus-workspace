"use server";

import { auth } from "@clerk/nextjs/server";
import { analyticsService } from "@/lib/backend/services/analytics.service";
import { permissionService } from "@/lib/backend/services/permission.service";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getWorkspaceAnalyticsAction(
  workspaceId: string,
  range: string = "7d"
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    // Security: Assert workspace membership
    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const stats = await analyticsService.getWorkspaceAnalytics(workspaceId, range);
    return { success: true, data: stats };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load workspace analytics." };
  }
}

export async function getMemberAnalyticsAction(
  workspaceId: string,
  range: string = "7d"
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const leaderboard = await analyticsService.getMemberAnalytics(workspaceId, range);
    return { success: true, data: leaderboard };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load member analytics." };
  }
}

export async function getProjectAnalyticsAction(
  workspaceId: string,
  range: string = "7d"
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const projects = await analyticsService.getProjectAnalytics(workspaceId, range);
    return { success: true, data: projects };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load project analytics." };
  }
}

export async function getActivityAnalyticsAction(
  workspaceId: string,
  range: string = "7d"
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const trends = await analyticsService.getActivityAnalytics(workspaceId, range);
    return { success: true, data: trends };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load activity trends." };
  }
}

export async function checkExportPermissionAction(
  workspaceId: string
): Promise<ActionResult<{ canExport: boolean; role: string }>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const role = await permissionService.assertWorkspaceMember(userId, workspaceId);
    const canExport = role === "owner" || role === "admin";

    return { success: true, data: { canExport, role } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to check export permissions." };
  }
}
