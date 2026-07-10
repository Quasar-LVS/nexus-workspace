"use client";

import * as React from "react";
import { Bell, Sparkles, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import { listNotificationsAction, markNotificationsReadAction } from "@/app/actions/collaboration";
import { markSingleNotificationReadAction } from "@/app/actions/chat";
import { VirtualList } from "@/components/ui/virtual-list";

export function NotificationsDropdown() {
  const { openNova } = useNovaPanelStore();
  const [notifications, setNotifications] = React.useState<any[]>([]);

  const loadNotifications = React.useCallback(async () => {
    try {
      const res = await listNotificationsAction();
      if (res.success && res.data) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  }, []);

  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      const result = await markNotificationsReadAction();
      if (result.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        toast.success("All notifications marked as read.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemClick = async (item: any) => {
    try {
      // Mark as read in database
      await markSingleNotificationReadAction(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error(err);
    }

    toast.info(`Notification alert`, {
      description: item.content,
    });

    if (item.target_url) {
      window.location.href = item.target_url;
    } else if (item.type === "ai") {
      openNova("brief");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="View notifications"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[9px] font-extrabold border-2 border-background animate-pulse"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-85 text-left" align="end">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="text-xs font-bold">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-auto px-1.5 py-0.5 text-[10px] text-nova-purple hover:bg-nova-purple-glow/10 font-bold"
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No recent notifications.
            </div>
          ) : (
              <VirtualList
                items={notifications}
                itemHeight={64}
                containerClassName="h-64 overflow-y-auto scrollbar-thin"
                renderItem={(item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    style={{ height: 60 }}
                    className={`flex items-start gap-3 p-3 cursor-pointer border-b border-border/20 last:border-0 mb-1 ${
                      !item.is_read ? "bg-accent/30 font-medium" : "hover:bg-accent/40"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 select-none ${
                        item.type === "reply"
                          ? "bg-nova-purple-glow text-nova-purple border border-nova-purple/10"
                          : item.type === "mention"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {item.type === "reply" ? (
                        <Sparkles size={13} className="animate-pulse" />
                      ) : item.type === "mention" ? (
                        <User size={13} />
                      ) : (
                        <AlertCircle size={13} />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2 select-none">
                        <p className="text-xs text-foreground font-bold leading-none truncate max-w-[140px]">{item.title}</p>
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                          {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal line-clamp-1">
                        {item.content}
                      </p>
                    </div>
                  </DropdownMenuItem>
                )}
              />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
