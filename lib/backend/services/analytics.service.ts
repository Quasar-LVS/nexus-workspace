import { createDbAdminClient } from "../database/client";
import { logger } from "../utils/logger";

interface CacheEntry {
  value: any;
  expiresAt: number;
}

export class AnalyticsService {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 5000; // 5 seconds TTL

  private getCached(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCached(key: string, value: any, ttlMs: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private getDateFilter(range: string): string | null {
    const now = new Date();
    if (range === "today") {
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    } else if (range === "7d") {
      now.setDate(now.getDate() - 7);
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    } else if (range === "30d") {
      now.setDate(now.getDate() - 30);
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    }
    return null; // All time
  }

  /**
   * Retrieves KPI cards and calculated health metrics
   */
  async getWorkspaceAnalytics(workspaceId: string, range: string = "7d"): Promise<any> {
    const cacheKey = `ws:${workspaceId}:${range}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const client = createDbAdminClient();
    const dateLimit = this.getDateFilter(range);

    // Build base queries
    let membersQuery = client
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    let activeLogsQuery = client
      .from("activity_logs")
      .select("actor_id")
      .eq("workspace_id", workspaceId)
      .neq("actor_id", "system");

    let channelsQuery = client
      .from("channels")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    let projectsQuery = client
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    let tasksQuery = client
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    let completedTasksQuery = client
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "done");

    let pendingTasksQuery = client
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "done");

    let messagesQuery = client
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    let aiRequestsQuery = client
      .from("activity_logs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .like("action", "ai.%");

    let filesQuery = client
      .from("attachments")
      .select("file_size, created_at")
      .eq("workspace_id", workspaceId);

    let invitationsQuery = client
      .from("workspace_invitations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());

    // Apply date range filters where appropriate
    if (dateLimit) {
      activeLogsQuery = activeLogsQuery.gte("created_at", dateLimit);
      tasksQuery = tasksQuery.gte("created_at", dateLimit);
      completedTasksQuery = completedTasksQuery.gte("completed_at", dateLimit);
      pendingTasksQuery = pendingTasksQuery.gte("created_at", dateLimit);
      messagesQuery = messagesQuery.gte("created_at", dateLimit);
      aiRequestsQuery = aiRequestsQuery.gte("created_at", dateLimit);
      filesQuery = filesQuery.gte("created_at", dateLimit);
    }

    try {
      const [
        membersRes,
        activeActorsRes,
        channelsRes,
        projectsRes,
        tasksRes,
        completedTasksRes,
        pendingTasksRes,
        messagesRes,
        aiRequestsRes,
        filesRes,
        invitationsRes,
      ] = await Promise.all([
        membersQuery,
        activeLogsQuery,
        channelsQuery,
        projectsQuery,
        tasksQuery,
        completedTasksQuery,
        pendingTasksQuery,
        messagesQuery,
        aiRequestsQuery,
        filesQuery,
        invitationsQuery,
      ]);

      const totalMembers = membersRes.count || 0;
      const activeMembersToday = new Set(
        (activeActorsRes.data || []).map((a: any) => a.actor_id).filter(Boolean)
      ).size;

      const totalChannels = channelsRes.count || 0;
      const totalProjects = projectsRes.count || 0;
      const totalTasks = tasksRes.count || 0;
      const completedTasks = completedTasksRes.count || 0;
      const pendingTasks = pendingTasksRes.count || 0;
      const messagesSent = messagesRes.count || 0;
      const aiRequests = aiRequestsRes.count || 0;
      const filesUploaded = (filesRes.data || []).length;
      const totalStorageUsed = (filesRes.data || []).reduce(
        (acc: number, f: any) => acc + (f.file_size || 0),
        0
      );
      const pendingInvitations = invitationsRes.count || 0;

      // Health metrics calculations
      const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      const activeRatio = totalMembers > 0 ? activeMembersToday / totalMembers : 0;
      const msgVolumeFactor = Math.min(1, messagesSent / (range === "today" ? 50 : range === "7d" ? 300 : 1000));
      const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0.5;
      const collaborationScore = Math.min(
        100,
        Math.round((activeRatio * 40) + (msgVolumeFactor * 30) + (completionRatio * 30))
      );

      // Project Velocity: average time or completed ratio
      const projectVelocity = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      // AI Adoption Rate: unique members using AI / total members
      const aiAdoptionRate = totalMembers > 0 ? Math.min(100, Math.round((aiRequests / (messagesSent + aiRequests + 1)) * 100)) : 0;
      
      // Storage Utilization (against a default 100MB limit for local workspace)
      const STORAGE_LIMIT = 100 * 1024 * 1024; // 100MB
      const storageUtilization = Math.min(100, Math.round((totalStorageUsed / STORAGE_LIMIT) * 100));

      const result = {
        kpis: {
          totalMembers,
          activeMembersToday,
          totalChannels,
          totalProjects,
          totalTasks,
          completedTasks,
          pendingTasks,
          messagesSent,
          aiRequests,
          filesUploaded,
          totalStorageUsed,
          pendingInvitations,
        },
        health: {
          collaborationScore,
          projectVelocity,
          taskCompletionRate,
          aiAdoptionRate,
          storageUtilization,
        },
      };

      this.setCached(cacheKey, result);
      return result;
    } catch (err) {
      logger.error("AnalyticsService: Failed to retrieve workspace metrics", err as Error);
      throw err;
    }
  }

  /**
   * Retrieves leaderboard statistics for team members
   */
  async getMemberAnalytics(workspaceId: string, range: string = "7d"): Promise<any[]> {
    const cacheKey = `members:${workspaceId}:${range}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const client = createDbAdminClient();
    const dateLimit = this.getDateFilter(range);

    try {
      // 1. Fetch active members
      const { data: members, error: memErr } = await client
        .from("workspace_members")
        .select(`
          profile_id,
          role,
          profile:profiles (first_name, last_name, email, avatar_url)
        `)
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null);

      if (memErr || !members) throw memErr || new Error("Failed to load workspace members");

      // 2. Fetch tasks, messages, and AI logs in range
      let tasksQuery = client.from("tasks").select("assignee_id, status").eq("workspace_id", workspaceId);
      let messagesQuery = client.from("messages").select("profile_id").eq("workspace_id", workspaceId);
      let aiQuery = client.from("activity_logs").select("actor_id").eq("workspace_id", workspaceId).like("action", "ai.%");

      if (dateLimit) {
        tasksQuery = tasksQuery.gte("created_at", dateLimit);
        messagesQuery = messagesQuery.gte("created_at", dateLimit);
        aiQuery = aiQuery.gte("created_at", dateLimit);
      }

      const [tasksRes, messagesRes, aiRes] = await Promise.all([
        tasksQuery,
        messagesQuery,
        aiQuery,
      ]);

      const tasks = tasksRes.data || [];
      const messages = messagesRes.data || [];
      const aiLogs = aiRes.data || [];

      // 3. Map aggregates
      const leaderboard = members.map((m: any) => {
        const profile = m.profile || {};
        const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "Unknown Teammate";
        
        const userTasks = tasks.filter((t) => t.assignee_id === m.profile_id);
        const tasksAssigned = userTasks.filter((t) => t.status !== "done").length;
        const tasksCompleted = userTasks.filter((t) => t.status === "done").length;
        const messagesSent = messages.filter((msg) => msg.profile_id === m.profile_id).length;
        const aiRequests = aiLogs.filter((log) => log.actor_id === m.profile_id).length;

        // Balanced productivity rating metric
        const productivityScore = Math.min(
          100,
          Math.round((tasksCompleted * 15) + (messagesSent * 0.2) + (aiRequests * 1.5))
        );

        return {
          profileId: m.profile_id,
          name,
          avatarUrl: profile.avatar_url,
          role: m.role,
          tasksAssigned,
          tasksCompleted,
          messagesSent,
          aiRequests,
          productivityScore,
        };
      });

      // Sort by productivity descending
      leaderboard.sort((a, b) => b.productivityScore - a.productivityScore);

      this.setCached(cacheKey, leaderboard);
      return leaderboard;
    } catch (err) {
      logger.error("AnalyticsService: Failed to retrieve member leaderboard", err as Error);
      throw err;
    }
  }

  /**
   * Retrieves project completion metrics
   */
  async getProjectAnalytics(workspaceId: string, range: string = "7d"): Promise<any[]> {
    const cacheKey = `projects:${workspaceId}:${range}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const client = createDbAdminClient();
    const dateLimit = this.getDateFilter(range);

    try {
      const { data: projects, error: projErr } = await client
        .from("projects")
        .select("id, name, status")
        .eq("workspace_id", workspaceId);

      if (projErr || !projects) throw projErr || new Error("Failed to load projects");

      let tasksQuery = client.from("tasks").select("project_id, status").eq("workspace_id", workspaceId);
      if (dateLimit) {
        tasksQuery = tasksQuery.gte("created_at", dateLimit);
      }

      const { data: tasks } = await tasksQuery;
      const allTasks = tasks || [];

      const result = projects.map((p: any) => {
        const projectTasks = allTasks.filter((t) => t.project_id === p.id);
        const total = projectTasks.length;
        const completed = projectTasks.filter((t) => t.status === "done").length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        return {
          id: p.id,
          name: p.name,
          status: p.status || "active",
          totalTasks: total,
          completedTasks: completed,
          progress,
        };
      });

      this.setCached(cacheKey, result);
      return result;
    } catch (err) {
      logger.error("AnalyticsService: Failed to retrieve project metrics", err as Error);
      throw err;
    }
  }

  /**
   * Retrieves data arrays over time for Recharts graphs
   */
  async getActivityAnalytics(workspaceId: string, range: string = "7d"): Promise<any> {
    const cacheKey = `activity:${workspaceId}:${range}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const client = createDbAdminClient();
    
    // Set up range parameters (days count)
    let daysCount = 7;
    if (range === "today") daysCount = 1;
    else if (range === "30d") daysCount = 30;
    else if (range === "all") daysCount = 90; // Limit all time trends to 90 days for clean charts

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - daysCount);
    dateLimit.setHours(0, 0, 0, 0);

    try {
      const [tasksRes, messagesRes, aiLogsRes, activityLogsRes] = await Promise.all([
        client.from("tasks").select("completed_at, created_at").eq("workspace_id", workspaceId).gte("created_at", dateLimit.toISOString()),
        client.from("messages").select("created_at").eq("workspace_id", workspaceId).gte("created_at", dateLimit.toISOString()),
        client.from("activity_logs").select("created_at").eq("workspace_id", workspaceId).like("action", "ai.%").gte("created_at", dateLimit.toISOString()),
        client.from("activity_logs").select("created_at").eq("workspace_id", workspaceId).gte("created_at", dateLimit.toISOString()),
      ]);

      const tasks = tasksRes.data || [];
      const messages = messagesRes.data || [];
      const aiLogs = aiLogsRes.data || [];
      const activity = activityLogsRes.data || [];

      // Generate daily labels
      const chartPoints: any[] = [];
      
      if (range === "today") {
        // Hourly data point array
        for (let i = 0; i < 24; i += 2) {
          const hourLabel = `${i}:00`;
          const nextHour = i + 2;
          
          const startHour = new Date();
          startHour.setHours(i, 0, 0, 0);
          const endHour = new Date();
          endHour.setHours(nextHour, 0, 0, 0);

          const hourlyFilter = (item: any) => {
            const d = new Date(item.created_at || item.completed_at);
            return d >= startHour && d < endHour;
          };

          const hourlyCompletedFilter = (item: any) => {
            if (!item.completed_at) return false;
            const d = new Date(item.completed_at);
            return d >= startHour && d < endHour;
          };

          chartPoints.push({
            name: hourLabel,
            completed: tasks.filter(hourlyCompletedFilter).length,
            messages: messages.filter(hourlyFilter).length,
            activity: activity.filter(hourlyFilter).length,
            aiRequests: aiLogs.filter(hourlyFilter).length,
          });
        }
      } else {
        // Daily data point array
        for (let i = daysCount - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          date.setHours(0, 0, 0, 0);

          const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const startOfDay = new Date(date);
          const endOfDay = new Date(date);
          endOfDay.setDate(endOfDay.getDate() + 1);

          const dayFilter = (item: any) => {
            const d = new Date(item.created_at || item.completed_at);
            return d >= startOfDay && d < endOfDay;
          };

          const dayCompletedFilter = (item: any) => {
            if (!item.completed_at) return false;
            const d = new Date(item.completed_at);
            return d >= startOfDay && d < endOfDay;
          };

          chartPoints.push({
            name: dateStr,
            completed: tasks.filter(dayCompletedFilter).length,
            messages: messages.filter(dayFilter).length,
            activity: activity.filter(dayFilter).length,
            aiRequests: aiLogs.filter(dayFilter).length,
          });
        }
      }

      this.setCached(cacheKey, chartPoints);
      return chartPoints;
    } catch (err) {
      logger.error("AnalyticsService: Failed to retrieve activity history", err as Error);
      throw err;
    }
  }
}

export const analyticsService = new AnalyticsService();
