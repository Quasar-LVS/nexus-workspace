"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  LayoutDashboard,
  MessageSquare,
  Hash,
  FolderKanban,
  ClipboardList,
  Video,
  Calendar,
  FileText,
  BookOpen,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  Sparkles,
  Search,
  User,
  LogOut,
  Sun,
  Moon,
  Laptop,
  Plus,
  Loader2,
  Bell,
  Clock,
  ShieldCheck
} from "lucide-react";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import {
  createChannelAction,
  getOrCreateDMAction,
  createGroupConversationAction,
  markSingleNotificationReadAction
} from "@/app/actions/chat";
import { cn } from "@/lib/utils";
import { Lock as LockIcon, ChevronDown } from "lucide-react";
import { SignOutButton, UserButton, useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";

// UI System Components
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

// Shell Workspace Components
import { WorkspaceSwitcher } from "@/components/workspace/switcher";
import { Breadcrumb } from "@/components/workspace/breadcrumb";
import { NotificationsDropdown } from "@/components/workspace/notifications-dropdown";
import { WorkspaceProvider, useWorkspace } from "@/context/workspace-context";
import { PendingInvitationsBanner } from "@/components/workspace/pending-invitations-banner";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const NovaChatPanel = dynamic(
  () => import("@/components/workspace/nova-chat-panel").then((mod) => mod.NovaChatPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex-grow flex flex-col items-center justify-center p-8 text-muted-foreground select-none animate-pulse">
        <Loader2 className="h-6 w-6 animate-spin text-nova-purple mb-2" />
        <span className="text-xs">Waking up Nova...</span>
      </div>
    )
  }
);
import { NotificationDrawer } from "@/components/workspace/notification-drawer";
import { X } from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  badge?: string;
}

/**
 * Outer layout that wraps everything in WorkspaceProvider.
 */
export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<any>;
}) {
  return (
    <WorkspaceProvider>
      <WorkspaceLayoutContent params={params}>
        {children}
      </WorkspaceLayoutContent>
    </WorkspaceProvider>
  );
}

/**
 * Inner layout content that consumes workspace context.
 */
function WorkspaceLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<any>;
}) {
  const resolvedParams = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const { user } = useUser();

  // Workspace context — single source of truth for workspace data
  const {
    currentWorkspace,
    channels,
    projects,
    members,
    tasks,
    conversations,
    notifications,
    unreadCounts,
    unreadCount,
    loading,
    refreshWorkspaceData
  } = useWorkspace();
  const slug = currentWorkspace?.slug || "active";

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);

  const currentUserRole = React.useMemo(() => {
    if (!user || !members) return "member";
    const found = members.find((m) => m.profileId === user.id);
    return found ? found.role : "member";
  }, [user, members]);

  const canManageChannels = currentUserRole === "owner" || currentUserRole === "admin";

  // Zustand stores
  const {
    sidebarOpen,
    toggleSidebar,
    activeWorkspaceId,
    activeChannelId,
    setActiveChannelId,
    activeProjectId,
    setActiveProjectId,
  } = useWorkspaceStore();

  const {
    isOpen: novaOpen,
    closeNova,
    openNova,
    contextType,
    activeSummary
  } = useNovaPanelStore();

  // Dialog and mobile states
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Channel creation states
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [submittingChannel, setSubmittingChannel] = useState(false);

  // DM / Group Conversation creation states
  const [createDMOpen, setCreateDMOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [groupDMName, setGroupDMName] = useState("");
  const [isCreatingDM, setIsCreatingDM] = useState(false);
  const [dmSearchTerm, setDmSearchTerm] = useState("");

  // Presence states
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [userPresence, setUserPresence] = useState<Record<string, { status: "online" | "away" | "offline"; onlineAt: string }>>({});
  const [statusOverride, setStatusOverride] = useState<"online" | "away" | "offline" | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`presence_status_override_${user?.id}`);
      return (saved as any) || null;
    }
    return null;
  });
  const [currentStatus, setCurrentStatus] = useState<"online" | "away" | "offline">("online");

  // Inactivity detection
  useEffect(() => {
    if (!user) return;

    let inactivityTimer: any;
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

    const resetInactivityTimer = () => {
      if (statusOverride) return;
      setCurrentStatus("online");
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setCurrentStatus("away");
      }, INACTIVITY_TIMEOUT);
    };

    if (!statusOverride) {
      window.addEventListener("mousemove", resetInactivityTimer);
      window.addEventListener("keydown", resetInactivityTimer);
      window.addEventListener("click", resetInactivityTimer);
      window.addEventListener("scroll", resetInactivityTimer);

      resetInactivityTimer();
    } else {
      setCurrentStatus(statusOverride);
    }

    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener("mousemove", resetInactivityTimer);
      window.removeEventListener("keydown", resetInactivityTimer);
      window.removeEventListener("click", resetInactivityTimer);
      window.removeEventListener("scroll", resetInactivityTimer);
    };
  }, [user, statusOverride]);

  // Presence syncing
  useEffect(() => {
    if (!activeWorkspaceId || !user) return;

    const presenceChannel = supabase.channel(`presence:workspace:${activeWorkspaceId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>();
        const presences: Record<string, { status: "online" | "away" | "offline"; onlineAt: string }> = {};

        Object.keys(state).forEach(key => {
          const presenceList = state[key] as any[];
          if (presenceList && presenceList.length > 0) {
            const status = presenceList[0].status || "online";
            presences[key] = {
              status,
              onlineAt: presenceList[0].online_at || new Date().toISOString()
            };
            if (status === "online") {
              activeIds.add(key);
            }
          }
        });

        setOnlineUserIds(activeIds);
        setUserPresence(presences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
            status: currentStatus
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [activeWorkspaceId, user, currentStatus]);

  // Hydration safety — only render theme-dependent UI after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut listener for global Command Menu (Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Global search query and results states
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>({
    channels: [],
    messages: [],
    users: [],
    projects: [],
    tasks: [],
    conversations: []
  });

  // Run search query whenever globalQuery changes
  useEffect(() => {
    if (!globalQuery.trim() || !activeWorkspaceId) {
      setSearchResults({ channels: [], messages: [], users: [], projects: [], tasks: [], conversations: [] });
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const { searchWorkspaceAction } = await import("@/app/actions/collaboration");
        const res = await searchWorkspaceAction({ workspaceId: activeWorkspaceId, query: globalQuery.trim() });
        if (res.success && res.data) {
          setSearchResults(res.data);
        }
      } catch (err) {
        console.error(err);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounce);
  }, [globalQuery, activeWorkspaceId]);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !activeWorkspaceId) return;

    setSubmittingChannel(true);
    try {
      const result = await createChannelAction({
        workspaceId: activeWorkspaceId,
        name: newChannelName.toLowerCase().replace(/\s+/g, "-"),
        description: newChannelDesc,
        isPrivate: newChannelPrivate,
      });

      if (result.success && result.data) {
        toast.success("Channel created successfully!");
        setCreateChannelOpen(false);
        setNewChannelName("");
        setNewChannelDesc("");
        setNewChannelPrivate(false);
        await refreshWorkspaceData();
        window.location.href = `/workspace/${slug}/channel/${result.data.id}`;
      } else {
        toast.error(result.error || "Failed to create channel.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setSubmittingChannel(false);
    }
  };

  const handleCreateDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMemberIds.length === 0 || !activeWorkspaceId) return;

    setIsCreatingDM(true);
    try {
      if (selectedMemberIds.length === 1) {
        // Start 1-to-1 DM
        const result = await getOrCreateDMAction(activeWorkspaceId, selectedMemberIds[0]);
        if (result.success && result.data) {
          setCreateDMOpen(false);
          setSelectedMemberIds([]);
          toast.success("Direct message started!");
          router.push(`/workspace/${slug}/dm/${result.data.id}`);
          await refreshWorkspaceData();
        } else {
          toast.error(result.error || "Failed to start direct message.");
        }
      } else {
        // Start Group DM
        if (!groupDMName.trim()) {
          toast.error("Group conversation name is required.");
          setIsCreatingDM(false);
          return;
        }
        const result = await createGroupConversationAction(activeWorkspaceId, groupDMName.trim(), selectedMemberIds);
        if (result.success && result.data) {
          setCreateDMOpen(false);
          setSelectedMemberIds([]);
          setGroupDMName("");
          toast.success("Group conversation started!");
          router.push(`/workspace/${slug}/dm/${result.data.id}`);
          await refreshWorkspaceData();
        } else {
          toast.error(result.error || "Failed to start group conversation.");
        }
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsCreatingDM(false);
    }
  };

  const handleToggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const isAdmin = currentUserRole === "owner" || currentUserRole === "admin";

  // Standard Nexus navigation items
  const navigationItems: NavItem[] = [
    { name: "Dashboard", href: `/workspace/${slug}`, icon: LayoutDashboard },
    { name: "Chat", href: `/workspace/${slug}/channel/general`, icon: MessageSquare, badge: "AI" },
    { name: "Projects", href: projects.length > 0 ? `/workspace/${slug}/project/${projects[0].id}` : `/workspace/${slug}/project/getting-started`, icon: FolderKanban },
    { name: "Tasks", href: `/workspace/${slug}?tab=tasks`, icon: ClipboardList },
    { name: "Meetings", href: `/workspace/${slug}?tab=meetings`, icon: Video },
    { name: "Calendar", href: `/workspace/${slug}?tab=calendar`, icon: Calendar },
    { name: "Files", href: `/workspace/${slug}?tab=files`, icon: FileText },
    { name: "Wiki", href: `/workspace/${slug}?tab=wiki`, icon: BookOpen },
    { name: "Activity", href: `/workspace/${slug}/activity`, icon: Clock },
    { name: "Analytics", href: `/workspace/${slug}?tab=analytics`, icon: BarChart3 },
    { name: "Team", href: `/workspace/${slug}?tab=team`, icon: Users },
    ...(isAdmin ? [{ name: "Security", href: `/workspace/${slug}?tab=security`, icon: ShieldCheck }] : []),
    { name: "Settings", href: "/settings/members", icon: Settings },
  ];

  // Render Sidebar Content for reuse in both Desktop sidebar & Mobile sheet drawer
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-card text-card-foreground">
      {/* Sidebar Header: Workspace Switcher */}
      <div className="p-4 border-b border-border flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-nova-purple to-nova-teal text-white font-extrabold shadow-sm text-sm shrink-0">
              N
            </div>
            <span className="font-extrabold text-sm tracking-widest bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent uppercase">
              Nexus OS
            </span>
          </div>
          <button
            onClick={() => setNotificationDrawerOpen(true)}
            className="relative p-1.5 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Notifications"
          >
            <Bell size={15} className={cn(unreadCount > 0 && "animate-bounce text-nova-purple")} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[8px] font-extrabold text-white ring-2 ring-background animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
        <WorkspaceSwitcher />
      </div>

      {/* Navigation Group Items */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin text-left">
        {navigationItems.map((item) => {
          const isActive = pathname.startsWith(item.href) ||
            (item.href === "/dashboard" && pathname === "/dashboard");
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer select-none",
                isActive
                  ? "bg-primary text-primary-foreground font-bold shadow-md shadow-black/10"
                  : "hover:bg-accent/40 hover:text-foreground text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon size={15} className={cn("shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-widest uppercase border",
                  isActive
                    ? "bg-primary-foreground/15 text-primary-foreground border-primary-foreground/10"
                    : "bg-nova-purple-glow text-nova-purple border-nova-purple/10"
                )}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {loading ? (
          <div className="space-y-6 pt-4 border-t border-border/40 select-none px-1">
            {/* Channels Loading Skeletons */}
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 bg-muted/40 rounded ml-2" />
              <Skeleton className="h-7 w-full bg-muted/20 rounded-md" />
              <Skeleton className="h-7 w-full bg-muted/20 rounded-md" />
            </div>
            {/* Projects Loading Skeletons */}
            <div className="space-y-2 pt-2 border-t border-border/10">
              <Skeleton className="h-3 w-14 bg-muted/40 rounded ml-2" />
              <Skeleton className="h-7 w-full bg-muted/20 rounded-md" />
              <Skeleton className="h-7 w-full bg-muted/20 rounded-md" />
            </div>
            {/* DMs Loading Skeletons */}
            <div className="space-y-2 pt-2 border-t border-border/10">
              <Skeleton className="h-3 w-20 bg-muted/40 rounded ml-2" />
              <Skeleton className="h-7 w-full bg-muted/20 rounded-md" />
            </div>
          </div>
        ) : (
          <>
            {/* Collapsible Channels Section */}
            <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
              <div className="flex items-center justify-between px-3 text-muted-foreground">
                <div className="flex items-center gap-1 select-none">
                  <ChevronDown size={12} className="text-muted-foreground/60" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Channels</span>
                </div>
                {canManageChannels && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCreateChannelOpen(true);
                    }}
                    className="h-5 w-5 hover:bg-accent text-muted-foreground hover:text-foreground rounded-md p-0"
                    aria-label="Create Channel"
                  >
                    <Plus size={12} />
                  </Button>
                )}
              </div>
              <div className="space-y-0.5 px-1.5">
                {channels.map((chan) => {
                  const isChanActive = activeChannelId === chan.id || pathname.includes(`/channel/${chan.id}`);
                  const unreadCount = unreadCounts?.[chan.id] || 0;
                  return (
                    <Link
                      key={chan.id}
                      href={`/workspace/${slug}/channel/${chan.id}`}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setActiveChannelId(chan.id);
                      }}
                      className={cn(
                        "group flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 cursor-pointer select-none",
                        isChanActive
                          ? "bg-accent text-foreground font-bold"
                          : "hover:bg-accent/30 hover:text-foreground text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {chan.isPrivate ? (
                          <LockIcon size={11} className="text-muted-foreground/70 shrink-0" />
                        ) : (
                          <Hash size={11} className="text-muted-foreground/70 shrink-0" />
                        )}
                        <span className={cn("truncate", unreadCount > 0 && "font-bold text-foreground")}>{chan.name}</span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="bg-primary text-primary-foreground text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 min-w-[16px] h-[16px] flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
                {channels.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/50 px-3 italic block pt-1">No active channels</span>
                )}
              </div>
            </div>

            {/* Collapsible Projects Section */}
            <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
              <div className="flex items-center justify-between px-3 text-muted-foreground">
                <div className="flex items-center gap-1 select-none">
                  <ChevronDown size={12} className="text-muted-foreground/60" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Projects</span>
                </div>
              </div>
              <div className="space-y-0.5 px-1.5">
                {projects.map((proj) => {
                  const isProjActive = activeProjectId === proj.id || pathname.includes(`/project/${proj.id}`);
                  const projectTasksCount = tasks.filter((t) => t.projectId === proj.id && t.status !== "done").length;
                  return (
                    <Link
                      key={proj.id}
                      href={`/workspace/${slug}/project/${proj.id}`}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setActiveProjectId(proj.id);
                      }}
                      className={cn(
                        "group flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 cursor-pointer select-none",
                        isProjActive
                          ? "bg-accent text-foreground font-bold"
                          : "hover:bg-accent/30 hover:text-foreground text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderKanban size={11} className="text-muted-foreground/70 shrink-0" />
                        <span className="truncate">{proj.name}</span>
                      </div>
                      {projectTasksCount > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-bold shrink-0">
                          {projectTasksCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
                {projects.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/50 px-3 italic block pt-1">No projects yet</span>
                )}
              </div>
            </div>

            {/* Collapsible Direct Messages Section */}
            <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
              <div className="flex items-center justify-between px-3 text-muted-foreground">
                <div className="flex items-center gap-1 select-none">
                  <ChevronDown size={12} className="text-muted-foreground/60" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Direct Messages</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedMemberIds([]);
                    setGroupDMName("");
                    setCreateDMOpen(true);
                  }}
                  className="h-5 w-5 hover:bg-accent text-muted-foreground hover:text-foreground rounded-md p-0"
                  aria-label="Start Conversation"
                >
                  <Plus size={12} />
                </Button>
              </div>
              <div className="space-y-0.5 px-1.5">
                {conversations.map((conv) => {
                  const isConvActive = pathname.includes(`/dm/${conv.id}`);

                  // Find other members' profile info
                  const otherMember = (conv.members || []).find((m: any) => m.profileId !== user?.id);
                  const name = conv.type === "group"
                    ? (conv.name || "Group DM")
                    : (otherMember ? `${otherMember.firstName || ""} ${otherMember.lastName || ""}`.trim() || otherMember.email : "Direct Message");

                  // Online indicator check
                  const isMemberOnline = conv.type !== "group" && otherMember && onlineUserIds.has(otherMember.profileId);

                  return (
                    <Link
                      key={conv.id}
                      href={`/workspace/${slug}/dm/${conv.id}`}
                      onClick={() => {
                        setMobileMenuOpen(false);
                      }}
                      className={cn(
                        "group flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 cursor-pointer select-none",
                        isConvActive
                          ? "bg-accent text-foreground font-bold"
                          : "hover:bg-accent/30 hover:text-foreground text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {conv.type === "group" ? (
                          <Users size={11} className="text-muted-foreground/70 shrink-0" />
                        ) : (
                          <div className="relative shrink-0">
                            <div className="h-3.5 w-3.5 rounded-full bg-muted/80 border border-border/80 flex items-center justify-center">
                              <User size={8} className="text-muted-foreground" />
                            </div>
                            {isMemberOnline ? (
                              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-[1px] ring-background" title="Online" />
                            ) : userPresence[otherMember.profileId]?.status === "away" ? (
                              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-amber-500 ring-[1px] ring-background" title="Away" />
                            ) : (
                              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-zinc-400 ring-[1px] ring-background" title="Offline" />
                            )}
                          </div>
                        )}
                        <span className="truncate">{name}</span>
                      </div>
                    </Link>
                  );
                })}
                {conversations.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/50 px-3 italic block pt-1">No conversations yet</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sidebar Footer: Profile actions, theme switches, signout */}
      <div className="p-4 border-t border-border/80 flex flex-col gap-3 shrink-0 bg-muted/10">
        <div className="flex items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div 
                role="button"
                tabIndex={0}
                aria-label="User settings menu"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).click();
                  }
                }}
                className="flex items-center gap-2 cursor-pointer hover:bg-accent/40 p-1.5 rounded-lg transition-colors select-none shrink-0"
              >
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    {user?.imageUrl && (
                      <AvatarImage src={user.imageUrl} alt={user.fullName || "User profile"} />
                    )}
                    <AvatarFallback className="bg-nova-purple-glow text-nova-purple font-extrabold text-xs">
                      {user?.firstName && user?.lastName
                        ? `${user.firstName[0]}${user.lastName[0]}`
                        : user?.firstName
                          ? user.firstName[0]
                          : "VN"}
                    </AvatarFallback>
                  </Avatar>
                  {currentStatus === "online" && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                  )}
                  {currentStatus === "away" && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background" />
                  )}
                  {currentStatus === "offline" && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-zinc-400 ring-2 ring-background" />
                  )}
                </div>
                <div className="flex flex-col text-left max-w-[100px]">
                  <span className="text-xs font-bold text-foreground truncate">{user?.fullName || "Collaborator"}</span>
                  <span className="text-[9px] text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress || ""}</span>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Set Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                setStatusOverride("online");
                localStorage.setItem(`presence_status_override_${user?.id}`, "online");
              }}>
                <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2" />
                <span className="flex-1">Online</span>
                {statusOverride === "online" && <span className="text-[10px] text-muted-foreground font-bold">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setStatusOverride("away");
                localStorage.setItem(`presence_status_override_${user?.id}`, "away");
              }}>
                <span className="h-2 w-2 rounded-full bg-amber-500 mr-2" />
                <span className="flex-1">Away</span>
                {statusOverride === "away" && <span className="text-[10px] text-muted-foreground font-bold">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setStatusOverride("offline");
                localStorage.setItem(`presence_status_override_${user?.id}`, "offline");
              }}>
                <span className="h-2 w-2 rounded-full bg-zinc-400 mr-2" />
                <span className="flex-1">Do Not Disturb / Offline</span>
                {statusOverride === "offline" && <span className="text-[10px] text-muted-foreground font-bold">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                setStatusOverride(null);
                localStorage.removeItem(`presence_status_override_${user?.id}`);
              }}>
                <span className="text-xs text-muted-foreground">Reset to Automatic</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick theme toggles — only render after mount to prevent hydration mismatch */}
          {mounted && (
            <div className="flex rounded-md border border-border bg-background/50 p-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("light")}
                className={cn("h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground", theme === "light" && "bg-accent text-foreground")}
                aria-label="Light mode"
              >
                <Sun size={12} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("dark")}
                className={cn("h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground", theme === "dark" && "bg-accent text-foreground")}
                aria-label="Dark mode"
              >
                <Moon size={12} />
              </Button>
            </div>
          )}
        </div>

        <SignOutButton>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 text-xs text-destructive hover:bg-destructive/10 font-bold shrink-0 h-9"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </Button>
        </SignOutButton>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans antialiased">

        {/* 1. Desktop Sidebar Panel (visible from md screens upwards) */}
        <aside
          className={cn(
            "hidden md:flex flex-col border-r border-border bg-card/65 backdrop-blur-md transition-all duration-300 ease-in-out shrink-0",
            sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
          )}
        >
          {renderSidebarContent()}
        </aside>

        {/* 2. Main Content shell structure */}
        <div className="flex flex-1 flex-col overflow-hidden relative">

          {/* Top Sticky Navigation bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/35 px-6 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              {/* Desktop Toggle Menu */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="hidden md:flex h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
              </Button>

              {/* Mobile Burger Menu Sheet Drawer (visible on mobile/tablet views) */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Open mobile menu"
                  >
                    <Menu size={16} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72 overflow-hidden border-r border-border">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Mobile Navigation Menu</SheetTitle>
                  </SheetHeader>
                  {renderSidebarContent()}
                </SheetContent>
              </Sheet>

              <div className="h-4 w-px bg-border sm:block hidden" />

              {/* Route Path Breadcrumbs */}
              <Breadcrumb />
            </div>

            {/* Right-side Top Header Actions */}
            <div className="flex items-center gap-3">
              {/* Cmd+K Search trigger button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchOpen(true)}
                className="h-9 w-40 sm:w-48 justify-between text-xs text-muted-foreground border-input bg-background/50 hover:bg-accent hover:text-accent-foreground rounded-md flex"
              >
                <div className="flex items-center gap-2">
                  <Search size={14} />
                  <span className="truncate">Search (⌘K)...</span>
                </div>
              </Button>

              {/* Ask Nova floating AI drawer button */}
              <Button
                variant="glowing"
                size="sm"
                onClick={() => openNova("brief")}
                className="h-8 rounded-full text-xs font-semibold px-3.5 gap-1.5 cursor-pointer shrink-0"
              >
                <Sparkles size={12} className="animate-pulse" />
                <span>Ask Nova</span>
              </Button>

              {/* Notification drop list */}
              <NotificationsDropdown />

              <div className="h-4 w-px bg-border" />

              {/* Clerk UserButton trigger */}
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8"
                  }
                }}
              />
            </div>
          </header>

          {/* Children app contents */}
          <div className="flex-1 overflow-auto bg-background/35 relative flex flex-col">
            <PendingInvitationsBanner />
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </div>
        </div>

        {/* 3. Nova AI Slide-out Drawer Panel (Sheet-style overlay drawer) */}
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-96 border-l border-border bg-card/95 shadow-2xl backdrop-blur-lg transition-transform duration-300 ease-in-out transform flex flex-col overflow-hidden",
            novaOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between border-b border-border p-4 shrink-0 bg-muted/10 select-none">
            <div className="flex items-center gap-2 text-nova-purple font-semibold text-xs">
              <Sparkles size={14} className="animate-pulse" />
              <span>Nova Workspace Assistant</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeNova}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={14} />
            </Button>
          </div>

          <div className="flex-1 min-h-0">
            <NovaChatPanel />
          </div>
        </aside>

        {/* 4. Global Search Modal (Command Search dialog) */}
        <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
          <CommandInput placeholder="Type a search query or command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigation Shortcuts">
              <CommandItem onSelect={() => { window.location.href = "/dashboard"; setSearchOpen(false); }}>
                <LayoutDashboard className="h-4 w-4" />
                <span>Go to Dashboard Overview</span>
              </CommandItem>
              <CommandItem onSelect={() => { openNova("general"); setSearchOpen(false); }}>
                <Sparkles className="h-4 w-4" />
                <span>Consult Nova AI Engine</span>
              </CommandItem>
            </CommandGroup>
            <DropdownMenuSeparator />
            <CommandGroup heading="Workspace items">
              <CommandItem onSelect={() => { window.location.href = "/c/general"; setSearchOpen(false); }}>
                <Hash className="h-4 w-4" />
                <span>Channel: #general</span>
              </CommandItem>
              <CommandItem onSelect={() => { window.location.href = "/p/nexus-v1"; setSearchOpen(false); }}>
                <FolderKanban className="h-4 w-4" />
                <span>Project: Nexus Architecture</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        {/* 5. Create Channel Dialog */}
        <Dialog open={createChannelOpen} onOpenChange={setCreateChannelOpen}>
          <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-xl max-w-md">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Hash size={18} className="text-nova-purple" />
                <span>Create a new channel</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Channels are where your team communicates. They’re best when organized around a topic — like #marketing.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateChannel} className="space-y-4 pt-4 text-left">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Name</label>
                <div className="relative flex items-center border border-white/10 bg-black/40 rounded-md overflow-hidden h-10 px-3">
                  <span className="text-xs text-muted-foreground select-none">#</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. plan-launch"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    className="flex-1 bg-transparent border-0 outline-none p-0 text-sm focus:ring-0 ml-1 text-white placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 font-semibold">Description <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></label>
                <Textarea
                  placeholder="What is this channel about?"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="border-white/10 bg-black/40 text-sm focus:ring-1 focus:ring-ring"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between py-2 border-y border-white/5">
                <div className="flex flex-col text-left select-none">
                  <span className="text-xs font-bold">Make private</span>
                  <span className="text-[10px] text-muted-foreground">When a channel is private, it can only be viewed or joined by invitation.</span>
                </div>
                <input
                  type="checkbox"
                  checked={newChannelPrivate}
                  onChange={(e) => setNewChannelPrivate(e.target.checked)}
                  className="h-4 w-4 rounded border-white/10 bg-black text-nova-purple focus:ring-0 cursor-pointer"
                />
              </div>

              <DialogFooter className="pt-2 gap-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateChannelOpen(false)}
                  className="border-white/10 bg-transparent text-white hover:bg-white/5 h-9 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingChannel}
                  className="bg-white text-black hover:bg-neutral-200 h-9 text-xs font-semibold gap-1.5 px-4"
                >
                  {submittingChannel && <Loader2 size={13} className="animate-spin" />}
                  <span>Create Channel</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 6. Start DM / Group Chat Dialog */}
        <Dialog open={createDMOpen} onOpenChange={setCreateDMOpen}>
          <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-xl max-w-md">
            <DialogHeader className="text-left font-bold text-base flex flex-col gap-1.5">
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare size={18} className="text-nova-teal" />
                <span>Start a conversation</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Select one member for a direct message, or select multiple members and give it a name to launch a group DM.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateDM} className="space-y-4 pt-4 text-left">
              {/* Member Search input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Search Workspace Members</label>
                <input
                  type="text"
                  placeholder="Type name or email..."
                  value={dmSearchTerm}
                  onChange={(e) => setDmSearchTerm(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-ring text-white placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Members check list */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Select Teammates ({selectedMemberIds.length} selected)</label>
                <div className="max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2.5 space-y-1.5 bg-black/25">
                  {members
                    .filter(m => m.profileId !== user?.id)
                    .filter(m => {
                      const name = [m.profile.firstName, m.profile.lastName].filter(Boolean).join(" ").toLowerCase();
                      return name.includes(dmSearchTerm.toLowerCase()) || m.profile.email.toLowerCase().includes(dmSearchTerm.toLowerCase());
                    })
                    .map(m => {
                      const isSelected = selectedMemberIds.includes(m.profileId);
                      const name = [m.profile.firstName, m.profile.lastName].filter(Boolean).join(" ") || m.profile.email;
                      const initial = name[0]?.toUpperCase() || "?";
                      return (
                        <div
                          key={m.id}
                          onClick={() => handleToggleMemberSelection(m.profileId)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-md transition-all cursor-pointer select-none border text-xs",
                            isSelected
                              ? "bg-nova-teal-glow/10 border-nova-teal/30 text-nova-teal"
                              : "hover:bg-accent/40 border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5 shrink-0 border border-border/80">
                              <AvatarFallback className="text-[10px] font-bold bg-muted">{initial}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{name}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => { }} // handled by parent div click
                            className="h-3.5 w-3.5 rounded border-white/10 bg-black text-nova-teal focus:ring-0 cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  {members.filter(m => m.profileId !== user?.id).length === 0 && (
                    <div className="text-[10px] text-muted-foreground italic text-center py-4">No other members in this workspace</div>
                  )}
                </div>
              </div>

              {/* Group Name (Conditionally rendered when selected members > 1) */}
              {selectedMemberIds.length > 1 && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-xs font-semibold text-foreground/80 font-bold">Group DM Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Project Launch Sync"
                    value={groupDMName}
                    onChange={(e) => setGroupDMName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-ring text-white placeholder:text-muted-foreground/50"
                  />
                </div>
              )}

              <DialogFooter className="pt-2 gap-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateDMOpen(false);
                    setSelectedMemberIds([]);
                    setGroupDMName("");
                  }}
                  className="border-white/10 bg-transparent text-white hover:bg-white/5 h-9 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingDM || selectedMemberIds.length === 0}
                  className="bg-white text-black hover:bg-neutral-200 h-9 text-xs font-semibold gap-1.5 px-4"
                >
                  {isCreatingDM && <Loader2 size={13} className="animate-spin" />}
                  <span>Start Conversation</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Floating Nova AI Action Bubble */}
        <div className="fixed bottom-6 right-6 z-40 select-none">
          <Button
            onClick={() => {
              if (novaOpen) {
                closeNova();
              } else {
                openNova("general");
              }
            }}
            className="h-12 w-12 rounded-full bg-gradient-to-tr from-nova-purple to-nova-teal hover:from-nova-purple/90 hover:to-nova-teal/90 text-white shadow-lg flex items-center justify-center cursor-pointer border border-white/10 hover:scale-105 active:scale-95 transition-all"
            title="Ask Nova AI"
          >
            <Sparkles size={20} className="animate-pulse" />
          </Button>
        </div>

        {/* Notification Drawer Panel */}
        <NotificationDrawer open={notificationDrawerOpen} onOpenChange={setNotificationDrawerOpen} />

      </div>
    </TooltipProvider>
  );
}
