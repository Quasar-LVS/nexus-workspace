"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type RealtimeEventCallback = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: any;
  old: any;
}) => void;

interface Listener {
  id: string;
  callback: RealtimeEventCallback;
}

/**
 * Global Subscription Manager to prevent duplicate Supabase Realtime channels
 * and clean up memory when all listeners unmount.
 */
class RealtimeSubscriptionManager {
  private channels: Record<string, RealtimeChannel> = {};
  private listeners: Record<string, Listener[]> = {};

  subscribe(
    channelKey: string,
    tableName: string,
    filter: string,
    listenerId: string,
    callback: RealtimeEventCallback
  ) {
    if (!this.listeners[channelKey]) {
      this.listeners[channelKey] = [];
    }

    if (!this.listeners[channelKey].some((l) => l.id === listenerId)) {
      this.listeners[channelKey].push({ id: listenerId, callback });
    }

    if (!this.channels[channelKey]) {
      const channel = supabase
        .channel(channelKey)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: tableName,
            filter: filter,
          },
          (payload: any) => {
            const activeListeners = this.listeners[channelKey] || [];
            activeListeners.forEach((l) => l.callback(payload));
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            console.warn(`RealtimeSubscriptionManager: Error on channel ${channelKey}, reconnecting...`);
          }
        });

      this.channels[channelKey] = channel;
    }
  }

  unsubscribe(channelKey: string, listenerId: string) {
    if (this.listeners[channelKey]) {
      this.listeners[channelKey] = this.listeners[channelKey].filter(
        (l) => l.id !== listenerId
      );

      if (this.listeners[channelKey].length === 0) {
        const channel = this.channels[channelKey];
        if (channel) {
          supabase.removeChannel(channel);
          delete this.channels[channelKey];
        }
        delete this.listeners[channelKey];
      }
    }
  }
}

export const subscriptionManager = new RealtimeSubscriptionManager();

/**
 * Listens to Realtime changes on the 'channels' table for a given workspace.
 */
export function useRealtimeChannels(
  workspaceId: string | null,
  onEvent: RealtimeEventCallback
) {
  const callbackRef = useRef<RealtimeEventCallback>(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!workspaceId) return;

    const channelKey = `realtime:channels:${workspaceId}`;
    const listenerId = Math.random().toString(36).substring(2, 9);

    subscriptionManager.subscribe(
      channelKey,
      "channels",
      `workspace_id=eq.${workspaceId}`,
      listenerId,
      (payload) => callbackRef.current(payload)
    );

    return () => {
      subscriptionManager.unsubscribe(channelKey, listenerId);
    };
  }, [workspaceId]);
}

/**
 * Listens to Realtime changes on the 'projects' table for a given workspace.
 */
export function useRealtimeProjects(
  workspaceId: string | null,
  onEvent: RealtimeEventCallback
) {
  const callbackRef = useRef<RealtimeEventCallback>(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!workspaceId) return;

    const channelKey = `realtime:projects:${workspaceId}`;
    const listenerId = Math.random().toString(36).substring(2, 9);

    subscriptionManager.subscribe(
      channelKey,
      "projects",
      `workspace_id=eq.${workspaceId}`,
      listenerId,
      (payload) => callbackRef.current(payload)
    );

    return () => {
      subscriptionManager.unsubscribe(channelKey, listenerId);
    };
  }, [workspaceId]);
}

/**
 * Listens to Realtime changes on the 'tasks' table for a given workspace.
 */
export function useRealtimeTasks(
  workspaceId: string | null,
  onEvent: RealtimeEventCallback
) {
  const callbackRef = useRef<RealtimeEventCallback>(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!workspaceId) return;

    const channelKey = `realtime:tasks:${workspaceId}`;
    const listenerId = Math.random().toString(36).substring(2, 9);

    subscriptionManager.subscribe(
      channelKey,
      "tasks",
      `workspace_id=eq.${workspaceId}`,
      listenerId,
      (payload) => callbackRef.current(payload)
    );

    return () => {
      subscriptionManager.unsubscribe(channelKey, listenerId);
    };
  }, [workspaceId]);
}

/**
 * Syncs Online, Away, and Offline status using Supabase Presence.
 * Automatically detects inactivity (10 min idle -> Away, browser close -> Offline).
 */
export function useWorkspacePresence(
  workspaceId: string | null,
  profileId: string | null
) {
  const [presenceMap, setPresenceMap] = useState<Record<string, { status: "online" | "away" | "offline"; user: any }>>({});
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const userStatusRef = useRef<"online" | "away">("online");
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!workspaceId || !profileId) {
      setPresenceMap({});
      return;
    }

    const resetIdleTimeout = () => {
      if (userStatusRef.current !== "online") {
        userStatusRef.current = "online";
        trackPresence("online");
      }
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        userStatusRef.current = "away";
        trackPresence("away");
      }, 10 * 60 * 1000); // 10 minutes
    };

    const trackPresence = async (status: "online" | "away") => {
      if (presenceChannelRef.current) {
        await presenceChannelRef.current.track({
          profile_id: profileId,
          status,
          online_at: new Date().toISOString(),
        });
      }
    };

    const channel = supabase.channel(`presence:workspace:${workspaceId}`, {
      config: {
        presence: {
          key: profileId,
        },
      },
    });

    presenceChannelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const map: Record<string, { status: "online" | "away" | "offline"; user: any }> = {};
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as any[];
          if (presences && presences.length > 0) {
            const activePresence = presences.find((p) => p.status === "online") || presences[0];
            map[key] = {
              status: activePresence.status || "online",
              user: activePresence,
            };
          }
        });
        setPresenceMap(map);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          userStatusRef.current = "online";
          resetIdleTimeout();
          await trackPresence("online");
        }
      });

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, resetIdleTimeout);
    });

    resetIdleTimeout();

    return () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, resetIdleTimeout);
      });
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [workspaceId, profileId]);

  return presenceMap;
}

/**
 * Listens to channel or conversation typing indicators and returns a list of usernames typing.
 */
export function useRealtimeTyping(
  channelId: string | null,
  conversationId: string | null,
  excludeUserId: string | null
) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!excludeUserId) return;
    if (!channelId && !conversationId) {
      setTypingUsers([]);
      return;
    }

    const loadTypingUsers = async () => {
      if (channelId) {
        const { getChannelTypingUsersAction } = await import("@/app/actions/chat");
        const res = await getChannelTypingUsersAction(channelId);
        if (res.success && res.data) {
          setTypingUsers(res.data);
        }
      } else if (conversationId) {
        const { getTypingUsersAction } = await import("@/app/actions/chat");
        const res = await getTypingUsersAction(conversationId);
        if (res.success && res.data) {
          setTypingUsers(res.data);
        }
      }
    };

    loadTypingUsers();

    const filter = channelId
      ? `channel_id=eq.${channelId}`
      : `conversation_id=eq.${conversationId}`;
    const channelKey = `realtime:typing:${channelId || conversationId}`;
    const listenerId = Math.random().toString(36).substring(2, 9);

    subscriptionManager.subscribe(
      channelKey,
      "typing_indicators",
      filter,
      listenerId,
      () => {
        loadTypingUsers();
      }
    );

    return () => {
      subscriptionManager.unsubscribe(channelKey, listenerId);
    };
  }, [channelId, conversationId, excludeUserId]);

  return typingUsers;
}

/**
 * Listens to Realtime changes on the 'notifications' table for a given user.
 */
export function useRealtimeNotifications(
  profileId: string | null,
  onNotificationReceived: (notification: any) => void
) {
  const onNotificationRef = useRef(onNotificationReceived);

  useEffect(() => {
    onNotificationRef.current = onNotificationReceived;
  }, [onNotificationReceived]);

  useEffect(() => {
    if (!profileId) return;

    const channelKey = `realtime:notifications:${profileId}`;
    const listenerId = Math.random().toString(36).substring(2, 9);

    subscriptionManager.subscribe(
      channelKey,
      "notifications",
      `profile_id=eq.${profileId}`,
      listenerId,
      (payload) => {
        if (payload.eventType === "INSERT") {
          onNotificationRef.current(payload.new);
        }
      }
    );

    return () => {
      subscriptionManager.unsubscribe(channelKey, listenerId);
    };
  }, [profileId]);
}

/**
 * Listens to Realtime changes on the 'activity_logs' table for a given workspace.
 */
export function useRealtimeActivityLogs(
  workspaceId: string | null,
  onEvent: RealtimeEventCallback
) {
  const callbackRef = useRef<RealtimeEventCallback>(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!workspaceId) return;

    const channelKey = `realtime:activity_logs:${workspaceId}`;
    const listenerId = Math.random().toString(36).substring(2, 9);

    subscriptionManager.subscribe(
      channelKey,
      "activity_logs",
      `workspace_id=eq.${workspaceId}`,
      listenerId,
      (payload) => callbackRef.current(payload)
    );

    return () => {
      subscriptionManager.unsubscribe(channelKey, listenerId);
    };
  }, [workspaceId]);
}
