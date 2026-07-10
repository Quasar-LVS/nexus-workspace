"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Sparkles, 
  Activity, 
  Calendar as CalendarIcon, 
  Users, 
  FolderKanban, 
  CheckCircle2, 
  Clock, 
  MessageSquare,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Plus,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import { getWorkspaceTasksAction, updateTaskAction } from "@/app/actions/task";
import { summarizeMeetingAction } from "@/app/actions/nova-ai";
import { cn } from "@/lib/utils";
import { Task } from "@/types";

// UI System Components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const AnalyticsDashboardView = dynamic(
  () => import("@/components/workspace/analytics-view").then((mod) => mod.AnalyticsView),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse text-left">
        <div className="flex justify-between items-center pb-4 border-b border-border/40">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 bg-muted/30 rounded-md" />
            <Skeleton className="h-4 w-96 bg-muted/20 rounded-md" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-72 md:col-span-2 bg-muted/20 rounded-xl" />
          <Skeleton className="h-72 bg-muted/20 rounded-xl" />
        </div>
      </div>
    )
  }
);

const SecurityDashboardView = dynamic(
  () => import("@/components/workspace/security-view").then((mod) => mod.SecurityView),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse text-left">
        <div className="flex justify-between items-center pb-4 border-b border-border/40">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 bg-muted/30 rounded-md" />
            <Skeleton className="h-4 w-96 bg-muted/20 rounded-md" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-muted/20 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-72 md:col-span-2 bg-muted/20 rounded-xl" />
          <Skeleton className="h-72 bg-muted/20 rounded-xl" />
        </div>
      </div>
    )
  }
);

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse text-left">
        <div className="h-10 w-48 bg-muted/40 rounded-md" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const { openNova } = useNovaPanelStore();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const { workspaces, projects, members, loading: contextLoading } = useWorkspace();
  const [pageLoading, setPageLoading] = useState(true);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);

  // Redirect to workspace selector / create / dynamic slug depending on memberships
  useEffect(() => {
    if (!contextLoading) {
      if (workspaces.length === 0) {
        router.push("/workspace/create");
      } else if (workspaces.length === 1) {
        const active = workspaces[0];
        setActiveWorkspace(active.id, active.name, active.slug);
        router.push(`/workspace/${active.slug}`);
      } else {
        const active = workspaces.find((w) => w.id === activeWorkspaceId);
        if (active && window.location.pathname === "/dashboard") {
          router.push(`/workspace/${active.slug}`);
        } else if (!active) {
          router.push("/workspace/select");
        } else {
          setPageLoading(false);
        }
      }
    }
  }, [contextLoading, workspaces, activeWorkspaceId, router, setActiveWorkspace]);

  // Load workspace tasks when active workspace changes
  useEffect(() => {
    async function loadTasks() {
      if (!activeWorkspaceId) return;
      try {
        const result = await getWorkspaceTasksAction(activeWorkspaceId);
        if (result.success && result.data) {
          setWorkspaceTasks(result.data);
        }
      } catch (err) {
        console.error("Failed to load workspace tasks:", err);
      }
    }
    loadTasks();
  }, [activeWorkspaceId]);

  // Mock Pulse Chart Data
  const chartData = [
    { name: "Mon", messages: 35, tasks: 12 },
    { name: "Tue", messages: 45, tasks: 18 },
    { name: "Wed", messages: 30, tasks: 15 },
    { name: "Thu", messages: 60, tasks: 22 },
    { name: "Fri", messages: 50, tasks: 25 },
    { name: "Sat", messages: 20, tasks: 8 },
    { name: "Sun", messages: 25, tasks: 10 },
  ];

  // Toggle Task Completion (real update)
  const handleToggleTask = async (taskId: string) => {
    const task = workspaceTasks.find((t) => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === "done" ? "todo" : "done";

    // Optimistic update
    setWorkspaceTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t))
    );

    try {
      const result = await updateTaskAction(taskId, { status: newStatus });
      if (result.success) {
        if (newStatus === "done") toast.success("Task completed!");
      } else {
        // Rollback on failure
        setWorkspaceTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t))
        );
        toast.error(result.error || "Failed to update task.");
      }
    } catch {
      setWorkspaceTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t))
      );
    }
  };

  // Recent Activity Feed
  const activities: { id: string; user: string; action: string; target: string; time: string; type: "chat" | "task" | "project" | "ai" }[] = [
    { id: "a1", user: "System", action: "initialized workspace with", target: "default resources", time: "Just now", type: "project" },
    { id: "a2", user: "Nova AI", action: "is ready to assist in", target: "your workspace", time: "Just now", type: "ai" },
  ];

  // Calendar Slots Preview
  const calendarEvents = [
    { id: "e1", title: "No meetings scheduled", time: "Your calendar is clear", type: "team" },
  ];

  // Compute project progress from tasks
  const projectProgressData = projects.map((proj) => {
    const projectTasks = workspaceTasks.filter((t) => t.projectId === proj.id);
    const total = projectTasks.length;
    const done = projectTasks.filter((t) => t.status === "done").length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      name: proj.name,
      progress,
      status: progress >= 90 ? "Near Completion" : progress >= 50 ? "On Track" : "Getting Started",
      color: progress >= 90 ? "from-nova-teal to-emerald-500" : progress >= 50 ? "from-nova-purple to-violet-500" : "from-amber-500 to-orange-500",
    };
  });

  if (tab === "meetings") {
    return <MeetingsAssistantView />;
  }

  if (tab === "analytics") {
    if (!activeWorkspaceId) {
      return (
        <div className="p-8 flex flex-col items-center justify-center text-muted-foreground h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-nova-purple mb-2" />
          <span className="text-xs">Loading workspace metrics...</span>
        </div>
      );
    }
    return <AnalyticsDashboardView workspaceId={activeWorkspaceId} />;
  }

  if (tab === "security") {
    if (!activeWorkspaceId) {
      return (
        <div className="p-8 flex flex-col items-center justify-center text-muted-foreground h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-nova-purple mb-2" />
          <span className="text-xs">Loading security logs...</span>
        </div>
      );
    }
    return <SecurityDashboardView workspaceId={activeWorkspaceId} />;
  }

  if (pageLoading || contextLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse text-left">
        <div className="h-10 w-48 bg-muted/40 rounded-md" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-56 bg-muted/30 rounded-xl" />
          <div className="h-56 bg-muted/30 rounded-xl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="h-20 bg-muted/20 rounded-xl" />
          <div className="h-20 bg-muted/20 rounded-xl" />
          <div className="h-20 bg-muted/20 rounded-xl" />
          <div className="h-20 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-glow pb-16">
      
      {/* 1. Header Greeting Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6 shrink-0">
        <div className="space-y-1.5 text-left">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Good morning, Vijay</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Here's what Nova summarized across your workspace channels and sprint boards.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => openNova("brief")}
          className="flex items-center gap-1.5 h-9 font-semibold text-xs border-border/80 bg-background/30 hover:bg-accent/40 w-fit shrink-0 rounded-md"
        >
          <Sparkles size={13} className="text-nova-purple" />
          <span>Generate New Daily Brief</span>
        </Button>
      </div>

      {/* 2. Top-level AI brief and Pulse grid */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        
        {/* Card: AI Daily Brief (Spans 2 columns) */}
        <Card className="lg:col-span-2 relative overflow-hidden border border-border/80 bg-card/40 backdrop-blur-sm shadow-sm">
          <div className="absolute top-0 right-0 w-64 h-64 bg-nova-purple-glow blur-[100px] -z-10" />
          
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-nova-purple animate-pulse" />
              <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground/90">
                Nova Daily Brief
              </CardTitle>
            </div>
            <Badge variant="nova" className="text-[9px] font-extrabold tracking-widest uppercase">
              Synced 10m ago
            </Badge>
          </CardHeader>
          
          <CardContent className="pt-5 space-y-4 text-left">
            <p className="text-xs md:text-sm leading-relaxed text-muted-foreground">
              Vijay, you have <strong className="text-foreground">3 priority tasks</strong> due today. Alex Carter merged database sync updates in <span className="text-foreground font-semibold">Nexus OS</span>. Sarah Jenkins is waiting on your review of the styling architecture in <span className="text-foreground font-semibold">#product-roadmap</span>.
            </p>
            
            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              <div className="p-3.5 rounded-lg border border-border/60 bg-background/40 flex items-start gap-2.5">
                <AlertCircle size={15} className="text-nova-purple shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-foreground leading-none">Blocker Alert</h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Clerk profile webhook mapping fails if empty parameters are forwarded.
                  </p>
                </div>
              </div>
              
              <div className="p-3.5 rounded-lg border border-border/60 bg-background/40 flex items-start gap-2.5">
                <CheckCircle2 size={15} className="text-nova-teal shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-foreground leading-none">Nova Task Suggestion</h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Add generic profile fallbacks inside synchronizer mappings.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Workspace Pulse Indicator */}
        <Card className="border border-border/80 bg-card/40 backdrop-blur-sm shadow-sm flex flex-col justify-between h-full min-h-[220px]">
          <CardHeader className="pb-2 border-b border-border/30 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                Workspace Pulse
              </CardTitle>
              <CardDescription className="text-[10px]">Weekly activity volume</CardDescription>
            </div>
            <TrendingUp size={15} className="text-nova-teal" />
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-end">
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-nova-purple)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--color-nova-purple)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      borderColor: "hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "10px"
                    }} 
                  />
                  <Area type="monotone" dataKey="messages" stroke="var(--color-nova-purple)" fillOpacity={1} fill="url(#colorMessages)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* 3. Main Dashboard grid layout */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 items-start">
        
        {/* Column 1: My Tasks (Action items checklists) */}
        <Card className="border border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/30">
            <div className="space-y-0.5">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
                My Tasks
              </CardTitle>
              <CardDescription className="text-[10px]">Assigned to you</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer">
              <Plus size={14} />
            </Button>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-border/30">
            {workspaceTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">No tasks yet. Create a workspace to get started.</p>
            ) : (
              workspaceTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 text-left">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={() => handleToggleTask(task.id)}
                    className="mt-1 rounded border-border text-nova-purple focus:ring-ring shrink-0 h-4 w-4 cursor-pointer"
                  />
                  <div className="flex-1 space-y-1">
                    <p className={cn(
                      "text-xs font-semibold leading-tight",
                      task.status === "done" ? "line-through text-muted-foreground font-normal" : "text-foreground"
                    )}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full font-bold border text-[8px]",
                        task.priority === "urgent" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        task.priority === "high" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        task.priority === "medium" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                        "bg-slate-500/10 text-slate-500 border-slate-500/20"
                      )}>
                        {task.priority}
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {task.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Column 2: Calendar & Project progress */}
        <div className="space-y-6">
          
          {/* Card: Calendar Preview */}
          <Card className="border border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/30">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
                  Calendar Preview
                </CardTitle>
                <CardDescription className="text-[10px]">Meetings for today</CardDescription>
              </div>
              <CalendarIcon size={14} className="text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {calendarEvents.map((evt) => (
                <div key={evt.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/10 text-left">
                  <div className={cn(
                    "w-1 h-8 rounded shrink-0 mt-0.5",
                    evt.type === "ai" ? "bg-nova-purple" : evt.type === "team" ? "bg-nova-teal" : "bg-blue-500"
                  )} />
                  <div className="space-y-1 truncate">
                    <h4 className="text-xs font-bold text-foreground leading-none truncate">{evt.title}</h4>
                    <p className="text-[10px] text-muted-foreground leading-none">{evt.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Card: Project Progress */}
          <Card className="border border-border/80 shadow-sm">
            <CardHeader className="pb-2 border-b border-border/30">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
                Project Progress
              </CardTitle>
              <CardDescription className="text-[10px]">Active workspace boards</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {projectProgressData.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2 text-center">No projects yet</p>
              ) : (
                projectProgressData.map((proj) => (
                  <div key={proj.name} className="space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="truncate max-w-[160px] text-foreground/80">{proj.name}</span>
                      <span className="text-[10px] text-muted-foreground">{proj.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full bg-gradient-to-r rounded-full transition-all duration-500", proj.color)}
                        style={{ width: `${proj.progress}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>

        {/* Column 3: Team Activity & Recent Activity Feed */}
        <div className="space-y-6">
          
          {/* Card: Team Activity status */}
          <Card className="border border-border/80 shadow-sm">
            <CardHeader className="pb-2 border-b border-border/30">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
                Team Status
              </CardTitle>
              <CardDescription className="text-[10px]">Active workspace members</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3.5">
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2 text-center">No members yet</p>
              ) : (
                members.map((member) => {
                  const firstName = member.profile.firstName || "";
                  const lastName = member.profile.lastName || "";
                  const displayName = [firstName, lastName].filter(Boolean).join(" ") || member.profile.email;
                  const initials = firstName && lastName
                    ? `${firstName[0]}${lastName[0]}`
                    : (firstName || member.profile.email || "?")[0].toUpperCase();

                  return (
                    <div key={member.id} className="flex items-center justify-between text-left">
                      <div className="flex items-center gap-3 truncate">
                        <div className="relative">
                          <Avatar className="h-8 w-8">
                            {member.profile.avatarUrl && (
                              <AvatarImage src={member.profile.avatarUrl} alt={displayName} />
                            )}
                            <AvatarFallback className="bg-muted text-xs font-extrabold">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="text-xs font-bold text-foreground truncate">{displayName}</span>
                          <span className="text-[10px] text-muted-foreground truncate capitalize">{member.role}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Card: Recent Activity stream feed */}
          <Card className="border border-border/80 shadow-sm">
            <CardHeader className="pb-2 border-b border-border/30">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
                Recent Activity
              </CardTitle>
              <CardDescription className="text-[10px]">Real-time events</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {activities.map((act) => (
                <div key={act.id} className="flex items-start gap-3 text-left">
                  <div className={cn(
                    "p-2 rounded-lg shrink-0 mt-0.5",
                    act.type === "chat" ? "bg-blue-500/10 text-blue-500" :
                    act.type === "task" ? "bg-emerald-500/10 text-emerald-500" :
                    act.type === "ai" ? "bg-nova-purple-glow text-nova-purple border border-nova-purple/10" :
                    "bg-purple-500/10 text-purple-500"
                  )}>
                    {act.type === "chat" ? <MessageSquare size={12} /> :
                     act.type === "task" ? <CheckCircle2 size={12} /> :
                     act.type === "ai" ? <Sparkles size={12} /> :
                     <FolderKanban size={12} />}
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      <strong className="text-foreground font-semibold">{act.user}</strong> {act.action}{" "}
                      <span className="text-foreground font-semibold">{act.target}</span>
                    </p>
                    <span className="text-[9px] text-muted-foreground block">{act.time}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

        </div>

      </div>

    </div>
  );
}

function MeetingsAssistantView() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");

  const handleAnalyze = async () => {
    if (!notes.trim() || !workspaceId) return;
    setLoading(true);
    setSummary("");
    try {
      const res = await summarizeMeetingAction(workspaceId, notes.trim());
      if (res.success && res.data) {
        setSummary(res.data);
        toast.success("Meeting transcript summarized successfully!");
      } else {
        toast.error(res.error || "Failed to analyze transcript.");
      }
    } catch {
      toast.error("Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 text-left animate-fade-in-glow pb-16">
      <div className="flex flex-col gap-2 border-b border-border/60 pb-6">
        <div className="flex items-center gap-2 text-nova-purple font-semibold">
          <Sparkles size={20} className="animate-pulse" />
          <span className="text-xs uppercase tracking-wider font-extrabold">Nova AI Assistant</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">AI Meeting Scribe</h1>
        <p className="text-xs text-muted-foreground">
          Paste your meeting notes, discussions, or video transcript below. Nova will extract risks, decisions, and action cards.
        </p>
      </div>

      <div className="space-y-4">
        <textarea
          placeholder="Paste meeting transcript or notes here..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={10}
          className="w-full bg-card/40 border border-border rounded-xl p-4 text-xs text-white outline-none focus:ring-1 focus:ring-ring resize-none font-mono placeholder:text-muted-foreground/50 leading-relaxed"
        />
        <Button
          onClick={handleAnalyze}
          disabled={loading || !notes.trim()}
          className="bg-white hover:bg-neutral-200 text-black font-semibold text-xs px-4 py-2 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Analyzing Notes...</span>
            </>
          ) : (
            <>
              <Sparkles size={13} className="text-nova-purple" />
              <span>Summarize Meeting</span>
            </>
          )}
        </Button>
      </div>

      {summary && (
        <Card className="border border-border/80 bg-card/40 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden animate-fade-in">
          <CardHeader className="border-b border-white/5 pb-4 bg-muted/10">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-nova-purple" />
              <span>Meeting Briefing & Action Map</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <div className="prose prose-sm prose-invert max-w-none text-zinc-300 leading-relaxed whitespace-pre-wrap select-text text-sm">
              {summary}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
