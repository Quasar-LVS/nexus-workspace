"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { listUserWorkspacesAction } from "@/app/actions/workspace";
import { listChannelsAction } from "@/app/actions/chat";
import { getProjectsAction } from "@/app/actions/project";
import { listWorkspaceMembersAction } from "@/app/actions/members";
import { getWorkspaceTasksAction } from "@/app/actions/task";
import { listUserConversationsAction } from "@/app/actions/chat";
import { 
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  deleteNotificationAction,
  listActivityLogsAction,
  checkDueDateNotificationsAction
} from "@/app/actions/collaboration";
import { Workspace, Project, WorkspaceMemberWithProfile, Task } from "@/types";
import { toast } from "sonner";
import { 
  useRealtimeChannels, 
  useRealtimeProjects, 
  useRealtimeTasks,
  useRealtimeNotifications,
  useRealtimeActivityLogs
} from "@/hooks/use-realtime";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";

/**
 * Channel shape returned from chatService.listChannels
 */
interface WorkspaceChannel {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  categoryId: string | null;
  createdAt: string;
  isMember: boolean;
}

interface WorkspaceContextValue {
  /** All workspaces for the current user */
  workspaces: Workspace[];
  /** Currently active workspace object */
  currentWorkspace: Workspace | null;
  /** Channels in the active workspace */
  channels: WorkspaceChannel[];
  /** Projects in the active workspace */
  projects: Project[];
  /** Members of the active workspace */
  members: WorkspaceMemberWithProfile[];
  /** Tasks of the active workspace */
  tasks: Task[];
  /** User conversations (DMs & Groups) in active workspace */
  conversations: any[];
  /** User notifications in active workspace */
  notifications: any[];
  unreadCounts: Record<string, number>;
  /** Total unread notifications count */
  unreadCount: number;
  /** Activity logs for active workspace */
  activityLogs: any[];
  /** Global loading state for initial data fetch */
  loading: boolean;
  /** Refresh all workspace data (channels, projects, members, tasks, conversations, notifications) */
  refreshWorkspaceData: () => Promise<void>;
  /** Refresh only the workspace list */
  refreshWorkspaces: () => Promise<void>;
  refreshUnreadCounts: () => Promise<void>;
  markChannelAsRead: (channelId: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Hook to consume workspace context. Must be used within <WorkspaceProvider>.
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a <WorkspaceProvider>");
  }
  return ctx;
}

/**
 * WorkspaceProvider
 * Provides workspace-scoped data (workspaces, channels, projects, members, tasks, conversations, notifications) to all children.
 * Automatically fetches child details when the active workspace changes.
 * Prevents duplicate network calls across dashboard, sidebar, switcher, etc.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [channels, setChannels] = useState<WorkspaceChannel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  // Derive the current workspace object from the list
  const currentWorkspace = useMemo(() => {
    if (!activeWorkspaceId) return null;
    return workspaces.find((w) => w.id === activeWorkspaceId) || null;
  }, [workspaces, activeWorkspaceId]);

  // Derive total unread notifications count
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  /**
   * Loads all workspaces for the user. If no workspace is active, selects the first one.
   */
  const refreshWorkspaces = useCallback(async () => {
    try {
      const result = await listUserWorkspacesAction();
      if (result.success && result.data) {
        setWorkspaces(result.data);

        // Auto-select if there is exactly 1 workspace.
        // If there are multiple, let the user select one via the workspace selector.
        if (result.data.length === 1 && !activeWorkspaceId) {
          const first = result.data[0];
          setActiveWorkspace(first.id, first.name, first.slug);
        }
      }
    } catch (err) {
      console.error("WorkspaceProvider: Failed to load workspaces", err);
    }
  }, [activeWorkspaceId, setActiveWorkspace]);

  /**
   * Loads workspace-scoped data: channels, projects, members, tasks, conversations, notifications.
   */
  const refreshWorkspaceData = useCallback(async () => {
    if (!activeWorkspaceId) {
      setChannels([]);
      setProjects([]);
      setMembers([]);
      setTasks([]);
      setConversations([]);
      setNotifications([]);
      setActivityLogs([]);
      return;
    }

    setLoading(true);
    try {
      const [channelsRes, projectsRes, membersRes, tasksRes, conversationsRes, notificationsRes, activityRes] = await Promise.all([
        listChannelsAction(activeWorkspaceId),
        getProjectsAction(activeWorkspaceId),
        listWorkspaceMembersAction(activeWorkspaceId),
        getWorkspaceTasksAction(activeWorkspaceId),
        listUserConversationsAction(activeWorkspaceId),
        listNotificationsAction(),
        listActivityLogsAction(activeWorkspaceId),
      ]);

      if (channelsRes.success && channelsRes.data) {
        setChannels(channelsRes.data as WorkspaceChannel[]);
      }
      if (projectsRes.success && projectsRes.data) {
        setProjects(projectsRes.data);
      }
      if (membersRes.success && membersRes.data) {
        setMembers(membersRes.data);
      }
      if (tasksRes.success && tasksRes.data) {
        setTasks(tasksRes.data);
      }
      if (conversationsRes.success && conversationsRes.data) {
        setConversations(conversationsRes.data);
      }
      if (notificationsRes.success && notificationsRes.data) {
        // Filter notifications by active workspace
        const filtered = (notificationsRes.data || []).filter(
          (n: any) => n.workspace_id === activeWorkspaceId
        );
        setNotifications(filtered);
      }
      if (activityRes.success && activityRes.data) {
        setActivityLogs(activityRes.data);
      }

      // Check task due date notifications in the background
      checkDueDateNotificationsAction(activeWorkspaceId).then((res) => {
        if (res.success) {
          listNotificationsAction().then((notifRes) => {
            if (notifRes.success && notifRes.data) {
              const filtered = (notifRes.data || []).filter(
                (n: any) => n.workspace_id === activeWorkspaceId
              );
              setNotifications(filtered);
            }
          });
        }
      });

      const { getUnreadCountsAction } = await import("@/app/actions/message");
      const unreadsRes = await getUnreadCountsAction(activeWorkspaceId);
      if (unreadsRes.success && unreadsRes.data) {
        setUnreadCounts(unreadsRes.data);
      }
    } catch (err) {
      console.error("WorkspaceProvider: Failed to load workspace data", err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  const refreshUnreadCounts = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const { getUnreadCountsAction } = await import("@/app/actions/message");
    const unreadsRes = await getUnreadCountsAction(activeWorkspaceId);
    if (unreadsRes.success && unreadsRes.data) {
      setUnreadCounts(unreadsRes.data);
    }
  }, [activeWorkspaceId]);

  const markChannelAsRead = useCallback(async (channelId: string) => {
    setUnreadCounts((prev) => ({
      ...prev,
      [channelId]: 0
    }));
    const { markReadAction } = await import("@/app/actions/message");
    await markReadAction({ channelId });
  }, []);

  const mapChannel = useCallback((dbChannel: any): WorkspaceChannel => {
    return {
      id: dbChannel.id,
      name: dbChannel.name,
      description: dbChannel.description || null,
      isPrivate: dbChannel.is_private || false,
      categoryId: dbChannel.category_id || null,
      createdAt: dbChannel.created_at,
      isMember: true
    };
  }, []);

  const handleChannelRealtime = useCallback((payload: any) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    
    setChannels((prev) => {
      if (eventType === "DELETE") {
        return prev.filter((ch) => ch.id !== oldRow.id);
      }
      
      if (eventType === "INSERT") {
        if (newRow.is_archived) return prev;
        if (prev.some((ch) => ch.id === newRow.id)) return prev;
        return [...prev, mapChannel(newRow)];
      }
      
      if (eventType === "UPDATE") {
        if (newRow.is_archived) {
          return prev.filter((ch) => ch.id !== newRow.id);
        }
        
        const exists = prev.some((ch) => ch.id === newRow.id);
        if (exists) {
          return prev.map((ch) =>
            ch.id === newRow.id ? { ...ch, ...mapChannel(newRow) } : ch
          );
        } else {
          return [...prev, mapChannel(newRow)];
        }
      }
      return prev;
    });
  }, [mapChannel]);

  const mapProject = useCallback((dbProject: any): Project => {
    return {
      id: dbProject.id,
      workspaceId: dbProject.workspace_id,
      name: dbProject.name,
      description: dbProject.description || undefined,
      status: dbProject.status,
      dueDate: dbProject.due_date || undefined,
      createdAt: dbProject.created_at,
      createdById: dbProject.created_by_id
    };
  }, []);

  const handleProjectRealtime = useCallback((payload: any) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    
    setProjects((prev) => {
      if (eventType === "DELETE") {
        return prev.filter((p) => p.id !== oldRow.id);
      }
      
      if (eventType === "INSERT") {
        if (prev.some((p) => p.id === newRow.id)) return prev;
        return [...prev, mapProject(newRow)];
      }
      
      if (eventType === "UPDATE") {
        return prev.map((p) =>
          p.id === newRow.id ? { ...p, ...mapProject(newRow) } : p
        );
      }
      return prev;
    });
  }, [mapProject]);

  const mapTask = useCallback((dbTask: any): Task => {
    return {
      id: dbTask.id,
      projectId: dbTask.project_id,
      workspaceId: dbTask.workspace_id,
      columnId: dbTask.column_id || undefined,
      title: dbTask.title,
      description: dbTask.description || undefined,
      status: dbTask.status,
      priority: dbTask.priority,
      assigneeId: dbTask.assignee_id || undefined,
      reporterId: dbTask.reporter_id || undefined,
      dueDateTime: dbTask.due_date_time || undefined,
      dueDate: dbTask.due_date || undefined,
      estimatedHours: dbTask.estimated_hours ? Number(dbTask.estimated_hours) : undefined,
      position: dbTask.position || 0,
      createdAt: dbTask.created_at,
      updatedAt: dbTask.updated_at,
      completedAt: dbTask.completed_at || undefined,
      labels: dbTask.labels || []
    };
  }, []);

  const handleTaskRealtime = useCallback((payload: any) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    
    setTasks((prev) => {
      if (eventType === "DELETE") {
        return prev.filter((t) => t.id !== oldRow.id);
      }
      
      if (eventType === "INSERT") {
        if (prev.some((t) => t.id === newRow.id)) return prev;
        return [...prev, mapTask(newRow)];
      }
      
      if (eventType === "UPDATE") {
        return prev.map((t) => {
          if (t.id === newRow.id) {
            const mapped = mapTask(newRow);
            return {
              ...mapped,
              labels: t.labels || mapped.labels
            };
          }
          return t;
        });
      }
      return prev;
    });
  }, [mapTask]);

  // Hook subscriptions
  useRealtimeChannels(activeWorkspaceId, handleChannelRealtime);
  useRealtimeProjects(activeWorkspaceId, handleProjectRealtime);
  useRealtimeTasks(activeWorkspaceId, handleTaskRealtime);

  // Subscribe to activity logs realtime to trigger refresh/update
  const handleActivityRealtime = useCallback((payload: any) => {
    const { eventType, new: newRow } = payload;
    if (eventType === "INSERT") {
      setActivityLogs((prev) => {
        if (prev.some((log) => log.id === newRow.id)) return prev;
        const actor = members.find((m) => m.profileId === newRow.actor_id)?.profile;
        const mappedLog = {
          id: newRow.id,
          workspaceId: newRow.workspace_id,
          actorId: newRow.actor_id,
          actorName: actor ? `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.email : "Someone",
          actorAvatarUrl: actor?.avatarUrl || undefined,
          action: newRow.action,
          targetType: newRow.target_type || newRow.entity_type,
          targetId: newRow.target_id || newRow.entity_id,
          metadata: newRow.metadata,
          createdAt: newRow.created_at
        };
        return [mappedLog, ...prev];
      });
    }
  }, [members]);
  useRealtimeActivityLogs(activeWorkspaceId, handleActivityRealtime);

  // Subscribe to notifications realtime to append new alerts
  const handleNotificationRealtime = useCallback((newNotification: any) => {
    if (newNotification.workspace_id === activeWorkspaceId) {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotification.id)) return prev;
        return [newNotification, ...prev];
      });
    }
  }, [activeWorkspaceId]);
  useRealtimeNotifications(user?.id || null, handleNotificationRealtime);

  // Listen to messages CDC to update unread counts dynamically
  useEffect(() => {
    if (!activeWorkspaceId || !user) return;

    const channel = supabase
      .channel(`realtime:unread-counts:${activeWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload: any) => {
          const newMsg = payload.new;
          if (newMsg.channel_id && newMsg.profile_id !== user.id) {
            const isWorkspaceChannel = channels.some((c) => c.id === newMsg.channel_id);
            if (isWorkspaceChannel) {
              setUnreadCounts((prev) => ({
                ...prev,
                [newMsg.channel_id]: (prev[newMsg.channel_id] || 0) + 1
              }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeWorkspaceId, user, channels]);

  const refreshNotifications = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const res = await listNotificationsAction();
    if (res.success && res.data) {
      const filtered = (res.data || []).filter(
        (n: any) => n.workspace_id === activeWorkspaceId
      );
      setNotifications(filtered);
    }
  }, [activeWorkspaceId]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    const res = await markNotificationReadAction(notificationId);
    if (!res.success) {
      toast.error(res.error || "Failed to mark notification as read.");
      refreshNotifications();
    }
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const res = await markAllNotificationsReadAction();
    if (!res.success) {
      toast.error(res.error || "Failed to mark all notifications as read.");
      refreshNotifications();
    }
  }, [refreshNotifications]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    const res = await deleteNotificationAction(notificationId);
    if (!res.success) {
      toast.error(res.error || "Failed to delete notification.");
      refreshNotifications();
    }
  }, [refreshNotifications]);

  // Initial workspace list load
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      await refreshWorkspaces();
      if (mounted) setLoading(false);
    }
    init();
    return () => { mounted = false; };
  }, [refreshWorkspaces]);

  // Fetch workspace-scoped data whenever the active workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      refreshWorkspaceData();
    }
  }, [activeWorkspaceId, refreshWorkspaceData]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaces,
    currentWorkspace,
    channels,
    projects,
    members,
    tasks,
    conversations,
    notifications,
    unreadCounts,
    unreadCount,
    activityLogs,
    loading,
    refreshWorkspaceData,
    refreshWorkspaces,
    refreshUnreadCounts,
    markChannelAsRead,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    refreshNotifications,
  }), [
    workspaces,
    currentWorkspace,
    channels,
    projects,
    members,
    tasks,
    conversations,
    notifications,
    unreadCounts,
    unreadCount,
    activityLogs,
    loading,
    refreshWorkspaceData,
    refreshWorkspaces,
    refreshUnreadCounts,
    markChannelAsRead,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    refreshNotifications,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
