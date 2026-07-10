"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  MessageSquare, 
  FolderKanban, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  FileText, 
  Mail, 
  Database,
  BarChart3,
  TrendingUp,
  Download,
  AlertCircle,
  TrendingDown,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { 
  AreaChart, Area, 
  BarChart, Bar, 
  LineChart, Line, 
  XAxis, YAxis, 
  Tooltip, ResponsiveContainer, 
  CartesianGrid 
} from "recharts";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  getWorkspaceAnalyticsAction, 
  getMemberAnalyticsAction, 
  getProjectAnalyticsAction, 
  getActivityAnalyticsAction,
  checkExportPermissionAction
} from "@/app/actions/analytics";

interface AnalyticsViewProps {
  workspaceId: string;
}

export function AnalyticsView({ workspaceId }: AnalyticsViewProps) {
  const [range, setRange] = useState<"today" | "7d" | "30d" | "all">("7d");
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  
  const [kpis, setKpis] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [projectsData, setProjectsData] = useState<any[]>([]);
  const [chartPoints, setChartPoints] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>("member");
  const [canExport, setCanExport] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!workspaceId) return;
      setLoading(true);
      try {
        const [wsRes, memRes, projRes, actRes, permRes] = await Promise.all([
          getWorkspaceAnalyticsAction(workspaceId, range),
          getMemberAnalyticsAction(workspaceId, range),
          getProjectAnalyticsAction(workspaceId, range),
          getActivityAnalyticsAction(workspaceId, range),
          checkExportPermissionAction(workspaceId)
        ]);

        if (wsRes.success && wsRes.data) {
          setKpis(wsRes.data.kpis);
          setHealth(wsRes.data.health);
        } else {
          toast.error(wsRes.error || "Failed to load workspace KPIs.");
        }

        if (memRes.success && memRes.data) {
          setLeaderboard(memRes.data);
        }

        if (projRes.success && projRes.data) {
          setProjectsData(projRes.data);
        }

        if (actRes.success && actRes.data) {
          setChartPoints(actRes.data);
        }

        if (permRes.success && permRes.data) {
          setCanExport(permRes.data.canExport);
          setUserRole(permRes.data.role);
        }
      } catch (err) {
        console.error("Failed to load workspace analytics:", err);
        toast.error("An error occurred loading analytics dashboards.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [workspaceId, range]);

  const handleExportCSV = async () => {
    if (!canExport) {
      toast.error(`Access Denied: Only Workspace Owners and Admins can export analytics. Your role is: ${userRole}`);
      return;
    }

    setExportLoading(true);
    try {
      const csvContent = [
        ["Nexus Workspace Intelligence Analytics Export"],
        ["Workspace ID", workspaceId],
        ["Export Timestamp", new Date().toLocaleString()],
        ["Reporting Range", range.toUpperCase()],
        [],
        ["1. Key Performance Indicators (KPIs)"],
        ["Metric", "Value"],
        ["Total Members", kpis?.totalMembers ?? 0],
        ["Active Members Today", kpis?.activeMembersToday ?? 0],
        ["Total Channels", kpis?.totalChannels ?? 0],
        ["Total Projects", kpis?.totalProjects ?? 0],
        ["Total Tasks", kpis?.totalTasks ?? 0],
        ["Completed Tasks", kpis?.completedTasks ?? 0],
        ["Pending Tasks", kpis?.pendingTasks ?? 0],
        ["Messages Sent", kpis?.messagesSent ?? 0],
        ["AI Requests Logged", kpis?.aiRequests ?? 0],
        ["Files Uploaded", kpis?.filesUploaded ?? 0],
        ["Total Storage (Bytes)", kpis?.totalStorageUsed ?? 0],
        ["Pending Invitations", kpis?.pendingInvitations ?? 0],
        [],
        ["2. Workspace Health & Velocity Metrics"],
        ["Dimension", "Score / Utilization (%)"],
        ["Collaboration Score", health?.collaborationScore ?? 0],
        ["Project Velocity", health?.projectVelocity ?? 0],
        ["Task Completion Rate", health?.taskCompletionRate ?? 0],
        ["AI Adoption Rate", health?.aiAdoptionRate ?? 0],
        ["Storage Utilization", health?.storageUtilization ?? 0],
        [],
        ["3. Teammate Productivity Leaderboard"],
        ["Name", "Role", "Tasks Assigned", "Tasks Completed", "Messages Sent", "AI Requests", "Productivity Rating (0-100)"],
        ...leaderboard.map((m: any) => [
          m.name,
          m.role,
          m.tasksAssigned,
          m.tasksCompleted,
          m.messagesSent,
          m.aiRequests,
          m.productivityScore
        ]),
        [],
        ["4. Projects Progress Breakdown"],
        ["Project Name", "Status", "Total Tasks", "Completed Tasks", "Board Progress (%)"],
        ...projectsData.map((p: any) => [
          p.name,
          p.status,
          p.totalTasks,
          p.completedTasks,
          p.progress
        ])
      ]
        .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `nexus_analytics_report_${range}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Analytics CSV exported successfully!");
    } catch (err) {
      toast.error("Failed to compile CSV data export.");
    } finally {
      setExportLoading(false);
    }
  };

  const formatStorage = (bytes: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-pulse text-left">
        <div className="flex justify-between items-center pb-4 border-b border-border/40">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 bg-muted/30 rounded-md" />
            <Skeleton className="h-4 w-96 bg-muted/20 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 bg-muted/30 rounded-md" />
            <Skeleton className="h-9 w-32 bg-muted/30 rounded-md" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-muted/25 rounded-xl border border-border/10" />
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-72 md:col-span-2 bg-muted/20 rounded-xl" />
          <Skeleton className="h-72 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  const kpiCards = [
    { label: "Total Members", value: kpis?.totalMembers, icon: Users, desc: "Active workspace profiles" },
    { label: "Active Members", value: kpis?.activeMembersToday, icon: Clock, desc: "Active in the selected range" },
    { label: "Total Channels", value: kpis?.totalChannels, icon: MessageSquare, desc: "Public & private channels" },
    { label: "Total Projects", value: kpis?.totalProjects, icon: FolderKanban, desc: "Active sprint project boards" },
    { label: "Total Tasks", value: kpis?.totalTasks, icon: CheckCircle2, desc: "Tasks created in range" },
    { label: "Completed Tasks", value: kpis?.completedTasks, icon: CheckCircle2, desc: "Tasks completed in range", color: "text-nova-teal" },
    { label: "Messages Sent", value: kpis?.messagesSent, icon: MessageSquare, desc: "Messages sent in range" },
    { label: "AI Requests", value: kpis?.aiRequests, icon: Sparkles, desc: "Nova assistant invocations", color: "text-nova-purple" },
    { label: "Files Uploaded", value: kpis?.filesUploaded, icon: FileText, desc: "Attachments uploaded" },
    { label: "Storage Used", value: formatStorage(kpis?.totalStorageUsed), icon: Database, desc: "Total attachments file size" },
    { label: "Pending Invitations", value: kpis?.pendingInvitations, icon: Mail, desc: "Unaccepted user invites" }
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-glow pb-16 text-left">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6 shrink-0">
        <div className="space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Workspace Analytics</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Real-time collaboration, tasks, AI insights, and workspace activity trends.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Time range selector */}
          <div className="flex items-center rounded-lg border border-border bg-background/40 p-0.5">
            {[
              { id: "today", label: "Today" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "all", label: "All Time" }
            ].map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id as any)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  range === r.id 
                    ? "bg-muted text-foreground shadow-sm font-bold" 
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Export CSV button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exportLoading}
            className={`flex items-center gap-1.5 h-9 font-semibold text-xs border-border/80 bg-background/30 hover:bg-accent/40 ${
              !canExport && "opacity-50 cursor-not-allowed"
            }`}
            title={!canExport ? "Only Workspace Owners and Admins can export" : "Download Analytics Report"}
          >
            {exportLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} className="text-nova-teal" />
            )}
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <Card key={idx} className="border border-border/60 bg-card/30 backdrop-blur-sm shadow-sm hover:border-border/90 transition-all select-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground truncate">
                  {kpi.label}
                </CardTitle>
                <Icon size={14} className={kpi.color || "text-muted-foreground/60"} />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-extrabold text-foreground tracking-tight">
                  {kpi.value ?? 0}
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{kpi.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Workspace Health Indicator Grid */}
      <div className="grid gap-6 lg:grid-cols-5 items-stretch">
        {[
          { label: "Collaboration Score", val: health?.collaborationScore, desc: "General chat & activity weight", color: "from-nova-purple to-violet-500" },
          { label: "Project Velocity", val: health?.projectVelocity, desc: "Sprint task completions rate", color: "from-blue-500 to-indigo-500" },
          { label: "Task Completion", val: health?.taskCompletionRate, desc: "Completed vs total tasks", color: "from-nova-teal to-emerald-500" },
          { label: "AI Adoption Rate", val: health?.aiAdoptionRate, desc: "Nova requests over messages", color: "from-fuchsia-500 to-nova-purple" },
          { label: "Storage Utilization", val: health?.storageUtilization, desc: "Workspace attachments limit", color: "from-amber-500 to-orange-500" }
        ].map((h, i) => (
          <Card key={i} className="border border-border/60 bg-card/20 flex flex-col justify-between">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                {h.label}
              </CardTitle>
              <CardDescription className="text-[9px] truncate leading-none">{h.desc}</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-extrabold text-foreground">{h.val ?? 0}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r rounded-full transition-all duration-700 ${h.color}`}
                  style={{ width: `${h.val ?? 0}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* Chart: Activity Over Time */}
        <Card className="border border-border/80 bg-card/20">
          <CardHeader className="pb-2 border-b border-border/20 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90 flex items-center gap-1.5">
                <TrendingUp size={13} className="text-nova-teal" />
                <span>Workspace Activity Trend</span>
              </CardTitle>
              <CardDescription className="text-[10px]">Daily messaging and task operations count</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-56 w-full">
              {chartPoints.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No data logged.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartPoints} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAct" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-nova-purple)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--color-nova-purple)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-nova-teal)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--color-nova-teal)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#88888820" vertical={false} />
                    <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "0.5rem", fontSize: "10px" }}
                    />
                    <Area type="monotone" name="Activity logs" dataKey="activity" stroke="var(--color-nova-purple)" fillOpacity={1} fill="url(#colorAct)" strokeWidth={1.5} />
                    <Area type="monotone" name="Messages" dataKey="messages" stroke="var(--color-nova-teal)" fillOpacity={1} fill="url(#colorMsg)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chart: Task Completion Over Time */}
        <Card className="border border-border/80 bg-card/20">
          <CardHeader className="pb-2 border-b border-border/20 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-nova-teal" />
                <span>Task Completion Pace</span>
              </CardTitle>
              <CardDescription className="text-[10px]">Daily count of task cards marked completed</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-56 w-full">
              {chartPoints.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No data logged.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartPoints} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#88888820" vertical={false} />
                    <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "0.5rem", fontSize: "10px" }}
                    />
                    <Line type="monotone" name="Tasks completed" dataKey="completed" stroke="var(--color-nova-teal)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chart: Nova AI requests */}
        <Card className="border border-border/80 bg-card/20">
          <CardHeader className="pb-2 border-b border-border/20 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90 flex items-center gap-1.5">
                <Sparkles size={13} className="text-nova-purple" />
                <span>AI Invocations volume</span>
              </CardTitle>
              <CardDescription className="text-[10px]">Queries and actions processed by Nova</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-56 w-full">
              {chartPoints.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No data logged.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartPoints} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#88888820" vertical={false} />
                    <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "0.5rem", fontSize: "10px" }}
                    />
                    <Bar name="AI requests" dataKey="aiRequests" fill="var(--color-nova-purple)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chart: Projects Progress list */}
        <Card className="border border-border/80 bg-card/20">
          <CardHeader className="pb-2 border-b border-border/20">
            <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
              Project Board Completion
            </CardTitle>
            <CardDescription className="text-[10px]">Completed tasks ratio per board</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 max-h-60 overflow-y-auto scrollbar-thin">
            {projectsData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">No active projects boards</p>
            ) : (
              projectsData.map((proj) => {
                const isNearDone = proj.progress >= 90;
                const isOnTrack = proj.progress >= 50;
                
                return (
                  <div key={proj.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="truncate max-w-[200px] text-foreground">{proj.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {proj.completedTasks}/{proj.totalTasks} ({proj.progress}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
                          isNearDone ? "from-nova-teal to-emerald-500" :
                          isOnTrack ? "from-nova-purple to-violet-500" :
                          "from-amber-500 to-orange-500"
                        }`}
                        style={{ width: `${proj.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

      </div>

      {/* Leaderboard and Health Grid */}
      <div className="grid gap-6 md:grid-cols-3 items-start">
        
        {/* Member Productivity Leaderboard */}
        <Card className="md:col-span-2 border border-border/80 bg-card/20">
          <CardHeader className="pb-2 border-b border-border/20">
            <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
              Teammate Activity Leaderboard
            </CardTitle>
            <CardDescription className="text-[10px]">Ranked by tasks finished, messages sent and AI use</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-border/20 max-h-96 overflow-y-auto scrollbar-thin">
            {leaderboard.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">No members listed</p>
            ) : (
              leaderboard.map((member, rank) => {
                const initials = member.name.substring(0, 2).toUpperCase();
                return (
                  <div key={member.profileId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3 truncate min-w-0">
                      <div className="text-xs font-bold text-muted-foreground w-4 text-center shrink-0">
                        #{rank + 1}
                      </div>
                      <Avatar className="h-8 w-8 shrink-0">
                        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.name} />}
                        <AvatarFallback className="bg-muted text-xs font-extrabold">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col truncate">
                        <span className="text-xs font-bold text-foreground truncate">{member.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate capitalize">{member.role}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 text-right">
                      <div className="grid grid-cols-3 gap-4 text-[10px] text-muted-foreground font-mono">
                        <div className="flex flex-col items-center">
                          <span className="text-foreground font-bold">{member.tasksCompleted}</span>
                          <span>Tasks</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-foreground font-bold">{member.messagesSent}</span>
                          <span>Chats</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-foreground font-bold">{member.aiRequests}</span>
                          <span>AI</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-xs font-extrabold text-nova-purple bg-nova-purple-glow px-2 py-0.5 rounded border border-nova-purple/10">
                          {member.productivityScore}
                        </span>
                        <span className="text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5 font-bold">Score</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Project status board */}
        <Card className="border border-border/80 bg-card/20">
          <CardHeader className="pb-2 border-b border-border/20">
            <CardTitle className="text-xs font-bold tracking-wide uppercase text-foreground/90">
              Workspace Performance summary
            </CardTitle>
            <CardDescription className="text-[10px]">Collaboration health rating</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              {health?.collaborationScore >= 70 ? (
                <TrendingUp size={22} className="text-nova-teal shrink-0" />
              ) : (
                <TrendingDown size={22} className="text-red-500 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-foreground">Collaboration Score</h4>
                <p className="text-[10px]">Your team communication flow is {health?.collaborationScore >= 70 ? "excellent" : "moderate"}. Keep discussion threads active.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Sparkles size={22} className="text-nova-purple shrink-0" />
              <div>
                <h4 className="font-bold text-foreground">AI Adoption Recommendation</h4>
                <p className="text-[10px]">Nova generated {kpis?.aiRequests} requests. Suggesting team members run standups via "/nova standup".</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Database size={22} className="text-amber-500 shrink-0" />
              <div>
                <h4 className="font-bold text-foreground">Storage Health</h4>
                <p className="text-[10px]">Using {formatStorage(kpis?.totalStorageUsed)} of 100MB allocation. {100 - (health?.storageUtilization ?? 0)}% limit headroom remaining.</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
