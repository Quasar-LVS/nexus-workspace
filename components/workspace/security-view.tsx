"use client";

import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  Users, 
  UserCheck, 
  Key, 
  Sparkles, 
  Upload, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Loader2,
  Terminal,
  Activity,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualList } from "@/components/ui/virtual-list";
import { 
  getAuditLogsAction, 
  getSecurityMetricsAction, 
  getCurrentSessionInfoAction 
} from "@/app/actions/security";

interface SecurityViewProps {
  workspaceId: string;
}

export function SecurityView({ workspaceId }: SecurityViewProps) {
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // States
  const [metrics, setMetrics] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [recentSignins, setRecentSignins] = useState<any[]>([]);
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  // Audit list & pagination
  const [logs, setLogs] = useState<any[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  // Search & Filter parameters
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [memberFilter, setMemberFilter] = useState("");

  useEffect(() => {
    async function loadSecurityData() {
      if (!workspaceId) return;
      setLoading(true);
      setAccessDenied(false);
      try {
        const [metRes, sessRes] = await Promise.all([
          getSecurityMetricsAction(workspaceId),
          getCurrentSessionInfoAction()
        ]);

        if (!metRes.success) {
          if (metRes.error?.includes("requires one of the following roles") || metRes.error?.includes("Permission denied")) {
            setAccessDenied(true);
            setLoading(false);
            return;
          }
          toast.error(metRes.error || "Failed to load security metrics.");
        } else {
          setMetrics(metRes.data.metrics);
          setRisk(metRes.data.risk);
          setRecentSignins(metRes.data.recentSignins);
        }

        if (sessRes.success && sessRes.data) {
          setSessionInfo(sessRes.data);
        }
      } catch (err) {
        console.error("Failed to load security overview:", err);
        toast.error("Error loading security center dashboard.");
      } finally {
        if (!accessDenied) {
          setLoading(false);
        }
      }
    }
    loadSecurityData();
  }, [workspaceId]);

  // Handle Audit log fetches separately for speed
  useEffect(() => {
    async function loadLogs() {
      if (!workspaceId || accessDenied) return;
      setLogsLoading(true);
      try {
        const res = await getAuditLogsAction(workspaceId, page, LIMIT, {
          action: actionFilter || undefined,
          entityType: entityFilter || undefined,
          member: memberFilter || undefined,
        });

        if (res.success && res.data) {
          setLogs(res.data.logs);
          setTotalLogs(res.data.total);
        }
      } catch (err) {
        console.error("Failed to load audit logs:", err);
      } finally {
        setLogsLoading(false);
      }
    }
    loadLogs();
  }, [workspaceId, page, actionFilter, entityFilter, memberFilter, accessDenied]);

  const handleExportAuditCSV = async () => {
    if (accessDenied) return;
    setExportLoading(true);
    try {
      // Fetch all matching logs (up to 200 items for export list)
      const res = await getAuditLogsAction(workspaceId, 1, 200, {
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
        member: memberFilter || undefined,
      });

      if (!res.success || !res.data) {
        toast.error("Failed to fetch full logs for CSV compilation.");
        return;
      }

      const csvContent = [
        ["Nexus Security Audit Log Timeline Export"],
        ["Workspace ID", workspaceId],
        ["Generated Date", new Date().toLocaleString()],
        ["Filters Applied", `Action: ${actionFilter || "None"}, Entity: ${entityFilter || "None"}, Member: ${memberFilter || "None"}`],
        [],
        ["ID", "Timestamp", "Actor Name", "Actor ID", "Action", "Affected Entity Type", "Affected Entity ID", "Metadata"],
        ...res.data.logs.map((log: any) => {
          const profile = log.profile || {};
          const actorName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "System";
          return [
            log.id,
            log.created_at,
            actorName,
            log.actor_id || "system",
            log.action,
            log.entity_type || log.target_type || "N/A",
            log.entity_id || log.target_id || "N/A",
            JSON.stringify(log.metadata || {})
          ];
        })
      ]
        .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `nexus_audit_export_${Date.now()}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Audit log CSV exported successfully!");
    } catch (err) {
      toast.error("Error creating CSV export file.");
    } finally {
      setExportLoading(false);
    }
  };

  const getRiskIcon = (rating: string) => {
    switch (rating) {
      case "High":
        return <ShieldAlert className="h-6 w-6 text-red-500" />;
      case "Medium":
        return <ShieldAlert className="h-6 w-6 text-amber-500" />;
      default:
        return <ShieldCheck className="h-6 w-6 text-emerald-500" />;
    }
  };

  const getRiskBadge = (rating: string) => {
    switch (rating) {
      case "High":
        return <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-xs font-bold font-mono">🔴 High</span>;
      case "Medium":
        return <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-xs font-bold font-mono">🟡 Medium</span>;
      default:
        return <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded text-xs font-bold font-mono">🟢 Low</span>;
    }
  };

  if (accessDenied) {
    return (
      <div className="p-12 max-w-xl mx-auto text-center space-y-6 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-full">
          <ShieldAlert className="h-10 w-10 text-red-500 animate-bounce" />
        </div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Access Restricted</h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
          Only Workspace Owners and Administrators possess permissions to access the Enterprise Security Center & Audit Logs. Please contact your administrator.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-pulse text-left">
        <div className="flex justify-between items-center pb-4 border-b border-border/40">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 bg-muted/30 rounded-md" />
            <Skeleton className="h-4 w-96 bg-muted/20 rounded-md" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-muted/25 rounded-xl border border-border/10" />
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96 md:col-span-2 bg-muted/20 rounded-xl" />
          <Skeleton className="h-96 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Active Members", value: metrics?.activeMembersCount, icon: Users, desc: "Profiles on team roster" },
    { label: "Online Users", value: metrics?.onlineCount, icon: UserCheck, desc: "Active in the last 15m", color: "text-emerald-500" },
    { label: "Failed Auths (7d)", value: metrics?.failedAuths, icon: Key, desc: "Unauthorized attempts logged", color: metrics?.failedAuths > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground/60" },
    { label: "AI Requests Today", value: metrics?.aiRequestsToday, icon: Sparkles, desc: "Total chat/summary triggers", color: "text-nova-purple" }
  ];

  const totalPages = Math.ceil(totalLogs / LIMIT) || 1;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-glow pb-16 text-left">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6 shrink-0">
        <div className="space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Security & Audit Center</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Enterprise logging audit trails, device context verification, and active system risk ratings.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportAuditCSV}
          disabled={exportLoading || logs.length === 0}
          className="flex items-center gap-1.5 h-9 font-semibold text-xs border-border/80 bg-background/30 hover:bg-accent/40 shrink-0 rounded-md"
        >
          {exportLoading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Download size={13} className="text-nova-teal" />
          )}
          <span>Export Audit Log</span>
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <Card key={idx} className="border border-border/60 bg-card/30 backdrop-blur-sm shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground truncate">
                  {kpi.label}
                </CardTitle>
                <Icon size={14} className={kpi.color || "text-muted-foreground/60"} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-extrabold text-foreground tracking-tight">
                  {kpi.value ?? 0}
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{kpi.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Risk and Session Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Risk Card */}
        <Card className="border border-border/60 bg-card/25 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Workspace Risk Analysis
            </CardTitle>
            <CardDescription className="text-[10px]">Estimated risk assessment rating</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 bg-background/40 p-4 rounded-xl border border-border/50">
              {getRiskIcon(risk?.rating)}
              <div className="flex flex-col">
                <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Workspace Threat level</span>
                <span className="mt-1">{getRiskBadge(risk?.rating)}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground leading-normal">
              <div className="flex justify-between py-1 border-b border-border/10">
                <span>Recent Admin Promotions (7d):</span>
                <span className="font-bold text-foreground">{metrics?.onlineCount - 1}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/10">
                <span>Failed Authorization Attempts:</span>
                <span className={`font-bold ${metrics?.failedAuths > 0 ? "text-red-500" : "text-foreground"}`}>{metrics?.failedAuths ?? 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/10">
                <span>Pending Workspace Invitations:</span>
                <span className="font-bold text-foreground">{metrics?.pendingInvites ?? 0}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>File Uploads Today:</span>
                <span className="font-bold text-foreground">{metrics?.uploadsToday ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Active Session Card */}
        <Card className="border border-border/60 bg-card/25">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Active Browser Session
            </CardTitle>
            <CardDescription className="text-[10px]">Details of the current authenticated device</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-background/40 p-4 rounded-xl border border-border/50 space-y-3">
              <div className="flex items-center gap-3">
                <Terminal className="h-5 w-5 text-nova-teal" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">{sessionInfo?.browser || "Web Browser"}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{sessionInfo?.os || "Operating System"}</span>
                </div>
              </div>
              <div className="space-y-1.5 pt-1 text-[11px] font-mono text-muted-foreground">
                <div className="flex justify-between">
                  <span>IP Address:</span>
                  <span className="text-foreground">{sessionInfo?.ipAddress || "127.0.0.1"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Active:</span>
                  <span className="text-foreground">{sessionInfo?.lastActive || "Just now"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="text-emerald-500 uppercase font-bold text-[9px] tracking-wider">{sessionInfo?.status || "active"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Session Actions */}
        <Card className="border border-border/60 bg-card/25">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Recent Sign-in Activity
            </CardTitle>
            <CardDescription className="text-[10px]">Latest user logins in workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 max-h-56 overflow-y-auto scrollbar-thin">
            {recentSignins.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2 text-center">No sign-in logs recorded</p>
            ) : (
              recentSignins.map((s, idx) => {
                const initials = s.name.substring(0, 2).toUpperCase();
                return (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 truncate">
                      <Avatar className="h-7 w-7">
                        {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                        <AvatarFallback className="bg-muted text-[10px] font-extrabold">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col truncate">
                        <span className="font-bold text-foreground truncate">{s.name}</span>
                        <span className="text-[9px] text-muted-foreground font-mono truncate">actor ID: {s.actorId.substring(0, 8)}...</span>
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                      {new Date(s.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

      </div>

      {/* Audit Log Timeline */}
      <Card className="border border-border/80 bg-card/20">
        <CardHeader className="border-b border-border/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-1.5">
              <Activity size={14} className="text-nova-teal" />
              <span>Audit Center Timeline</span>
            </CardTitle>
            <CardDescription className="text-[10px]">Detailed chronological record of workspace events</CardDescription>
          </div>

          {/* Timeline filter inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by Action..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="pl-8 pr-2.5 py-1.5 rounded-md border border-border bg-background/50 text-xs outline-none focus:ring-1 focus:ring-ring w-40 placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by Entity Type..."
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
                className="pl-8 pr-2.5 py-1.5 rounded-md border border-border bg-background/50 text-xs outline-none focus:ring-1 focus:ring-ring w-40 placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by Actor ID..."
                value={memberFilter}
                onChange={(e) => {
                  setMemberFilter(e.target.value);
                  setPage(1);
                }}
                className="pl-8 pr-2.5 py-1.5 rounded-md border border-border bg-background/50 text-xs outline-none focus:ring-1 focus:ring-ring w-40 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 relative">
          
          {logsLoading && (
            <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-b-2xl">
              <Loader2 className="h-6 w-6 animate-spin text-nova-teal" />
            </div>
          )}

          <div className="space-y-4">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-12 text-center">No matching audit logs found.</p>
            ) : (
              <VirtualList
                items={logs}
                itemHeight={100}
                containerClassName="h-[450px] overflow-y-auto scrollbar-thin pr-1"
                renderItem={(log) => {
                  const profile = log.profile || {};
                  const actorName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "System";
                  const initials = actorName.substring(0, 2).toUpperCase();
                  
                  const timeString = new Date(log.created_at).toLocaleString();
                  const relativeTime = () => {
                    const diff = Date.now() - new Date(log.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 1) return "Just now";
                    if (mins < 60) return `${mins}m ago`;
                    const hours = Math.floor(mins / 60);
                    if (hours < 24) return `${hours}h ago`;
                    return `${Math.floor(hours / 24)}d ago`;
                  };

                  return (
                    <div key={log.id} style={{ height: 92 }} className="flex items-start gap-3.5 p-3 mb-2 rounded-lg border border-border/40 bg-card/30 hover:border-border/80 transition-all text-xs">
                      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                        {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={actorName} />}
                        <AvatarFallback className="bg-muted text-[10px] font-extrabold">{initials}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-extrabold text-foreground">{actorName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-mono border border-border/20">
                            {log.action}
                          </span>
                          {log.entity_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-nova-purple-glow text-nova-purple font-mono border border-nova-purple/10">
                              entity: {log.entity_type}
                            </span>
                          )}
                        </div>

                        {/* Display targets / metadata details */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="p-1 rounded bg-background/50 text-[9px] font-mono text-muted-foreground border border-border/20 overflow-x-auto max-h-[36px] truncate">
                            {log.metadata.goal && <span>Goal: "{log.metadata.goal}" </span>}
                            {log.metadata.taskTitle && <span>Task: "{log.metadata.taskTitle}" </span>}
                            {log.metadata.channelName && <span>Channel: "#{log.metadata.channelName}" </span>}
                            {log.metadata.projectName && <span>Project: "{log.metadata.projectName}" </span>}
                            {log.metadata.invitationEmail && <span>Invite sent to: {log.metadata.invitationEmail} </span>}
                            {log.metadata.role && <span>New Role: {log.metadata.role} </span>}
                            {/* Fallback full metadata if none of specific fields */}
                            {!log.metadata.goal && !log.metadata.taskTitle && !log.metadata.channelName && !log.metadata.projectName && !log.metadata.invitationEmail && !log.metadata.role && (
                              <span>{JSON.stringify(log.metadata)}</span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          <span className="flex items-center gap-0.5 font-semibold">
                            <Calendar size={10} />
                            {timeString}
                          </span>
                          <span>&bull;</span>
                          <span>{relativeTime()}</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>

          {/* Pagination bar */}
          <div className="flex items-center justify-between border-t border-border/30 pt-4 mt-6">
            <span className="text-[10px] text-muted-foreground font-mono">
              Showing Page {page} of {totalPages} ({totalLogs} events found)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 rounded-md border border-border/60 hover:bg-accent/30"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 w-8 rounded-md border border-border/60 hover:bg-accent/30"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

    </div>
  );
}
