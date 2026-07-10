import { createDbAdminClient } from "../database/client";
import { logger } from "../utils/logger";

export class SecurityService {
  /**
   * Fetch paginated audit logs based on search query filters
   */
  async getAuditLogs(
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
  ): Promise<{ logs: any[]; total: number }> {
    const client = createDbAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
      let query = client
        .from("activity_logs")
        .select(`
          id,
          workspace_id,
          actor_id,
          action,
          target_type,
          target_id,
          metadata,
          created_at,
          entity_type,
          entity_id,
          profile:profiles (first_name, last_name, email, avatar_url)
        `, { count: "exact" })
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (filters.member) {
        query = query.eq("actor_id", filters.member);
      }
      if (filters.action) {
        query = query.eq("action", filters.action);
      }
      if (filters.entityType) {
        query = query.eq("entity_type", filters.entityType);
      }
      if (filters.dateStart) {
        query = query.gte("created_at", filters.dateStart);
      }
      if (filters.dateEnd) {
        query = query.lte("created_at", filters.dateEnd);
      }

      const { data, count, error } = await query.range(from, to);

      if (error) throw error;

      return {
        logs: data || [],
        total: count || 0,
      };
    } catch (err) {
      logger.error("SecurityService: Failed to fetch audit logs", err as Error);
      throw err;
    }
  }

  /**
   * Fetch security dashboard KPIs and calculate simple Risk Indicator
   */
  async getSecurityMetrics(workspaceId: string): Promise<any> {
    const client = createDbAdminClient();

    const fifteenMinsAgo = new Date();
    fifteenMinsAgo.setMinutes(fifteenMinsAgo.getMinutes() - 15);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      // 1. Online Users (active in workspace in last 15 minutes)
      const { data: onlineUsersData } = await client
        .from("activity_logs")
        .select("actor_id")
        .eq("workspace_id", workspaceId)
        .neq("actor_id", "system")
        .gte("created_at", fifteenMinsAgo.toISOString());

      const onlineCount = Math.max(
        1, // At least the current logged-in admin viewing the dashboard
        new Set((onlineUsersData || []).map((u) => u.actor_id).filter(Boolean)).size
      );

      // 2. Total active members
      const { count: activeMembersCount } = await client
        .from("workspace_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null);

      // 3. Today's AI Requests
      const { count: aiRequestsToday } = await client
        .from("activity_logs")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .like("action", "ai.%")
        .gte("created_at", today.toISOString());

      // 4. Today's File Uploads
      const { count: uploadsToday } = await client
        .from("attachments")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", today.toISOString());

      // 5. Invitation Activity (Pending invitations)
      const { count: pendingInvites } = await client
        .from("workspace_invitations")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      // 6. Failed auth attempts (last 7 days)
      const { count: failedAuths } = await client
        .from("activity_logs")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("action", "auth.failed")
        .gte("created_at", sevenDaysAgo.toISOString());

      // 7. Recent admin role updates (last 7 days)
      const { count: roleChanges } = await client
        .from("activity_logs")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("action", "member.role_changed")
        .gte("created_at", sevenDaysAgo.toISOString());

      // 8. Recent sign-ins (latest 5 user activities, mapping distinct actors)
      const { data: recentSigninsData } = await client
        .from("activity_logs")
        .select(`
          actor_id,
          created_at,
          profile:profiles (first_name, last_name, email, avatar_url)
        `)
        .eq("workspace_id", workspaceId)
        .neq("actor_id", "system")
        .order("created_at", { ascending: false })
        .limit(20);

      // Filter distinct actors to represent mock sign-in sessions
      const seenActors = new Set();
      const recentSignins = (recentSigninsData || [])
        .filter((a) => {
          if (!a.actor_id || seenActors.has(a.actor_id)) return false;
          seenActors.add(a.actor_id);
          return true;
        })
        .slice(0, 5)
        .map((a: any) => {
          const profile = Array.isArray(a.profile) ? a.profile[0] : (a.profile || {});
          const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "Teammate";
          return {
            actorId: a.actor_id,
            name,
            avatarUrl: profile.avatar_url,
            time: a.created_at,
          };
        });

      // 9. Calculate Simple Workspace Risk Indicator Score
      // Threshold rules:
      // - Each failed auth adds 15 points
      // - Each pending invitation adds 5 points (unmanaged invitations risk)
      // - Each recent admin role change adds 20 points (high privilege drift)
      // - Upload activity spike (uploads today > 10 adds 15 points)
      // - AI request spike (ai requests today > 50 adds 15 points)
      let riskScore = 0;
      riskScore += (failedAuths || 0) * 15;
      riskScore += (pendingInvites || 0) * 5;
      riskScore += (roleChanges || 0) * 20;
      if ((uploadsToday || 0) > 10) riskScore += 15;
      if ((aiRequestsToday || 0) > 50) riskScore += 15;

      let riskRating: "Low" | "Medium" | "High" = "Low";
      if (riskScore > 50) {
        riskRating = "High";
      } else if (riskScore > 20) {
        riskRating = "Medium";
      }

      return {
        metrics: {
          onlineCount,
          activeMembersCount: activeMembersCount || 0,
          aiRequestsToday: aiRequestsToday || 0,
          uploadsToday: uploadsToday || 0,
          pendingInvites: pendingInvites || 0,
          failedAuths: failedAuths || 0,
        },
        risk: {
          score: riskScore,
          rating: riskRating,
        },
        recentSignins,
      };
    } catch (err) {
      logger.error("SecurityService: Failed to retrieve security metrics", err as Error);
      throw err;
    }
  }
}

export const securityService = new SecurityService();
