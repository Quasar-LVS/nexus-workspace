"use client";

import React, { useEffect, use } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Clock, 
  Activity, 
  MessageSquare, 
  PlusCircle, 
  Trash2, 
  UserPlus, 
  Settings, 
  Bookmark, 
  AlertCircle,
  HelpCircle,
  FolderOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default function WorkspaceSlugActivityPage({ params }: PageProps) {
  const { workspaceSlug } = use(params);
  const { workspaces, activityLogs } = useWorkspace();
  const { activeWorkspaceSlug, setActiveWorkspace } = useWorkspaceStore();

  // Sync active workspace if accessed via direct URL
  useEffect(() => {
    if (workspaceSlug && workspaceSlug !== activeWorkspaceSlug && workspaces.length > 0) {
      const target = workspaces.find((w) => w.slug === workspaceSlug);
      if (target) {
        setActiveWorkspace(target.id, target.name, target.slug);
      }
    }
  }, [workspaceSlug, activeWorkspaceSlug, workspaces, setActiveWorkspace]);

  const getActivityIcon = (action: string, type: string) => {
    const act = action.toLowerCase();
    const tp = type.toLowerCase();

    if (act.includes("create")) return <PlusCircle className="h-4 w-4 text-emerald-500" />;
    if (act.includes("delete") || act.includes("remove") || act.includes("archive")) {
      return <Trash2 className="h-4 w-4 text-rose-500" />;
    }
    if (act.includes("invite") || act.includes("join") || act.includes("accept")) {
      return <UserPlus className="h-4 w-4 text-teal-500" />;
    }
    if (tp === "message") return <MessageSquare className="h-4 w-4 text-sky-500" />;
    if (tp === "project") return <FolderOpen className="h-4 w-4 text-indigo-500" />;
    
    return <Activity className="h-4 w-4 text-muted-foreground" />;
  };

  const getTargetBadgeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "channel":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "project":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "task":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "member":
      case "invitation":
        return "bg-teal-500/10 text-teal-400 border-teal-500/20";
      case "message":
        return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "ai":
        return "bg-violet-500/10 text-violet-400 border-violet-500/20";
      default:
        return "bg-muted/10 text-muted-foreground border-border";
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

  const renderMetadata = (log: any) => {
    if (!log.metadata) return null;
    const meta = log.metadata;

    const details: string[] = [];
    if (meta.title || meta.name) {
      details.push(`"${meta.title || meta.name}"`);
    }
    if (meta.channelName) {
      details.push(`in #${meta.channelName}`);
    }
    if (meta.projectName) {
      details.push(`for project "${meta.projectName}"`);
    }

    if (details.length === 0) return null;

    return (
      <span className="text-muted-foreground/80 font-normal ml-1">
        {details.join(" ")}
      </span>
    );
  };

  return (
    <div className="flex-1 p-6 md:p-8 max-w-4xl mx-auto space-y-6 overflow-y-auto">
      {/* Header section */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4 select-none">
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold tracking-tight uppercase bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Workspace Activity Feed
          </h1>
          <p className="text-xs text-muted-foreground">
            A chronological timeline of collaborative actions across this workspace.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card/40 text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Real-time Enabled</span>
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="relative border-l border-border/60 ml-4 pl-6 space-y-6">
        {activityLogs.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 select-none border border-dashed border-border rounded-lg bg-card/25">
            <Activity className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
            <span>No activity logs recorded yet in this workspace.</span>
          </div>
        ) : (
          activityLogs.map((log) => {
            const actorInitials = log.actorName
              ? log.actorName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
              : "??";

            return (
              <div key={log.id} className="relative group">
                {/* Timeline connector dot with icon */}
                <span className="absolute -left-[38px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border shadow-sm group-hover:scale-110 transition-transform">
                  {getActivityIcon(log.action, log.targetType)}
                </span>

                <Card className="bg-card/45 border border-border/70 hover:border-border transition-colors shadow-sm">
                  <CardContent className="p-4 flex items-start gap-4">
                    {/* Actor avatar */}
                    <Avatar className="h-8 w-8 border border-border/50 shrink-0">
                      <AvatarImage src={log.actorAvatarUrl} />
                      <AvatarFallback className="bg-muted text-[10px] font-extrabold">
                        {actorInitials}
                      </AvatarFallback>
                    </Avatar>

                    {/* Content log text */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs font-bold text-foreground">
                          {log.actorName || "Someone"}{" "}
                          <span className="text-muted-foreground/90 font-semibold lowercase">
                            {log.action.replace(/_/g, " ")}
                          </span>
                          {renderMetadata(log)}
                        </p>
                        <span className="text-[10px] text-muted-foreground font-semibold shrink-0">
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </div>

                      {/* Target type indicator badge */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border tracking-wider",
                          getTargetBadgeColor(log.targetType)
                        )}>
                          {log.targetType}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
