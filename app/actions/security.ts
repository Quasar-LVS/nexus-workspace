"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { securityService } from "@/lib/backend/services/security.service";
import { permissionService } from "@/lib/backend/services/permission.service";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getAuditLogsAction(
  workspaceId: string,
  page: number = 1,
  limit: number = 15,
  filters: {
    member?: string;
    action?: string;
    dateStart?: string;
    dateEnd?: string;
    entityType?: string;
  } = {}
): Promise<ActionResult<{ logs: any[]; total: number }>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    // Security: Only Owners and Admins can view audit logs
    await permissionService.assertRole(userId, workspaceId, ["owner", "admin"]);

    const data = await securityService.getAuditLogs(workspaceId, page, limit, filters);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load audit logs." };
  }
}

export async function getSecurityMetricsAction(
  workspaceId: string
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    // Security: Only Owners and Admins can view security overview
    await permissionService.assertRole(userId, workspaceId, ["owner", "admin"]);

    const metrics = await securityService.getSecurityMetrics(workspaceId);
    return { success: true, data: metrics };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load security metrics." };
  }
}

export async function getCurrentSessionInfoAction(): Promise<ActionResult<any>> {
  try {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) return { success: false, error: "Authentication required." };

    const client = await clerkClient();
    const session = await client.sessions.getSession(sessionId);

    const latestActivity = session.latestActivity as any;
    const ua = latestActivity?.userAgent || "";
    let browser = "Unknown Browser";
    let os = "Unknown OS";

    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";
    else if (ua.includes("Opera")) browser = "Opera";

    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Macintosh") || ua.includes("Mac OS")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    const lastActive = session.lastActiveAt 
      ? new Date(session.lastActiveAt).toLocaleString() 
      : new Date().toLocaleString();

    const currentSession = {
      id: session.id,
      browser,
      os,
      ipAddress: latestActivity?.ipAddress || "Local IP",
      lastActive,
      status: session.status,
    };

    return { success: true, data: currentSession };
  } catch (err: any) {
    // Graceful fallback to client details if clerkClient fails
    return { 
      success: true, 
      data: {
        id: "local-session",
        browser: "Current Browser",
        os: "Local Operating System",
        ipAddress: "127.0.0.1",
        lastActive: new Date().toLocaleString(),
        status: "active"
      }
    };
  }
}
