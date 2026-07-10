"use client";

import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context/workspace-context";
import { 
  Bell, 
  Check, 
  Trash2, 
  MessageSquare, 
  AtSign, 
  ClipboardList, 
  UserPlus, 
  Sparkles, 
  ExternalLink,
  CheckCheck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { VirtualList } from "@/components/ui/virtual-list";

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDrawer({ open, onOpenChange }: NotificationDrawerProps) {
  const router = useRouter();
  const { 
    notifications, 
    unreadCount,
    markNotificationRead, 
    markAllNotificationsRead, 
    deleteNotification 
  } = useWorkspace();

  const handleClearRead = async () => {
    const readNotifications = notifications.filter((n) => n.is_read);
    for (const notif of readNotifications) {
      await deleteNotification(notif.id);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "mention":
        return <AtSign className="h-4 w-4 text-nova-purple" />;
      case "reply":
        return <MessageSquare className="h-4 w-4 text-nova-teal" />;
      case "task_assignment":
      case "task_reassignment":
      case "task_due_today":
      case "task_due_tomorrow":
      case "task_overdue":
        return <ClipboardList className="h-4 w-4 text-amber-500" />;
      case "invitation_accepted":
        return <UserPlus className="h-4 w-4 text-emerald-500" />;
      case "ai_tasks_generated":
        return <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-card/90 backdrop-blur-xl border-l border-border flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border flex flex-row items-center justify-between shrink-0 space-y-0">
          <SheetTitle className="text-sm font-extrabold uppercase tracking-widest flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span>Notifications ({unreadCount})</span>
          </SheetTitle>
        </SheetHeader>

        {/* Toolbar actions */}
        <div className="px-4 py-2 bg-muted/20 border-b border-border/40 flex items-center justify-between shrink-0">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => markAllNotificationsRead()}
            className="text-[10px] uppercase font-bold tracking-wider hover:bg-muted text-muted-foreground hover:text-foreground gap-1.5"
            disabled={unreadCount === 0}
          >
            <CheckCheck className="h-3 w-3" />
            Mark all read
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearRead}
            className="text-[10px] uppercase font-bold tracking-wider hover:bg-destructive/10 text-muted-foreground hover:text-destructive gap-1.5"
            disabled={notifications.filter((n) => n.is_read).length === 0}
          >
            <Trash2 className="h-3 w-3" />
            Clear read
          </Button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 select-none py-12">
              <Bell className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
              <span>All caught up! No notifications.</span>
            </div>
          ) : (
              <VirtualList
                items={notifications}
                itemHeight={80}
                containerClassName="h-[500px] overflow-y-auto scrollbar-thin space-y-2 pr-1"
                renderItem={(item) => (
                  <div 
                    key={item.id}
                    style={{ height: 72 }}
                    className={cn(
                      "p-3 mb-2 rounded-lg border text-left transition-all duration-200 relative group flex items-start gap-3",
                      item.is_read 
                        ? "bg-muted/10 border-border/50 opacity-75" 
                        : "bg-gradient-to-r from-primary/5 to-transparent border-primary/20 shadow-sm"
                    )}
                  >
                    {/* Visual Icon indicator */}
                    <div className="mt-0.5 p-1.5 rounded bg-muted/40 border border-border/30 shrink-0 select-none">
                      {getNotificationIcon(item.type)}
                    </div>

                    {/* Content body */}
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center justify-between gap-2 mb-0.5 select-none">
                        <span className="font-bold text-xs truncate text-foreground">{item.title}</span>
                        <span className="text-[9px] font-medium text-muted-foreground shrink-0">
                          {formatRelativeTime(item.created_at || item.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed break-words truncate">
                        {item.content || item.description || item.body}
                      </p>
                    </div>

                    {/* Action buttons (only visible or interactive) */}
                    <div className="absolute right-2 top-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                      {/* Click to navigate */}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          if (item.target_url) {
                            router.push(item.target_url);
                            onOpenChange(false);
                          }
                        }}
                        className="h-6 w-6 rounded-md"
                        title="Open destination"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </Button>

                      {/* Mark read */}
                      {!item.is_read && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => markNotificationRead(item.id)}
                          className="h-6 w-6 rounded-md hover:bg-emerald-500/10"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3 text-emerald-500" />
                        </Button>
                      )}

                      {/* Delete */}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteNotification(item.id)}
                        className="h-6 w-6 rounded-md hover:bg-destructive/10"
                        title="Delete notification"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
