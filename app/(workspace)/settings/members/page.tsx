"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Crown,
  UserMinus,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Lock,
} from "lucide-react";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import {
  listWorkspaceMembersAction,
  getCurrentMemberRoleAction,
  updateMemberRoleAction,
  removeMemberAction,
} from "@/app/actions/members";
import {
  listWorkspaceInvitationsAction,
  revokeInvitationAction,
  inviteMemberAction,
} from "@/app/actions/workspace";
import { WorkspaceMemberWithProfile, UserRole } from "@/types";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { VirtualList } from "@/components/ui/virtual-list";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Role Display Helpers ─────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; icon: React.ComponentType<any>; color: string; bgColor: string }> = {
  owner: {
    label: "Owner",
    icon: Crown,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10 border-amber-400/20",
  },
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10 border-blue-400/20",
  },
  manager: {
    label: "Manager",
    icon: ShieldAlert,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10 border-emerald-400/20",
  },
  member: {
    label: "Member",
    icon: Shield,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50 border-border",
  },
  guest: {
    label: "Guest",
    icon: Users,
    color: "text-muted-foreground/70",
    bgColor: "bg-muted/30 border-border/50",
  },
};

const ASSIGNABLE_ROLES: UserRole[] = ["admin", "manager", "member", "guest"];

function RoleBadge({ role }: { role: UserRole }) {
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide border ${config.bgColor} ${config.color} select-none`}
    >
      <Icon size={12} />
      <span>{config.label}</span>
    </span>
  );
}

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  return email[0]?.toUpperCase() || "?";
}

function getDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  return email;
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function MemberManagementPage() {
  const { activeWorkspaceId, activeWorkspaceName } = useWorkspaceStore();

  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Invitations states
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "guest">("member");
  const [inviting, setInviting] = useState(false);

  // Confirm removal dialog state
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMemberWithProfile | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  const canManage = currentRole === "owner" || currentRole === "admin";

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) return;

    setLoading(true);
    try {
      const [membersRes, roleRes] = await Promise.all([
        listWorkspaceMembersAction(activeWorkspaceId),
        getCurrentMemberRoleAction(activeWorkspaceId),
      ]);

      if (membersRes.success && membersRes.data) {
        setMembers(membersRes.data);
      } else {
        toast.error(membersRes.error || "Failed to load members.");
      }

      if (roleRes.success && roleRes.data) {
        setCurrentRole(roleRes.data);
        const isOwnerOrAdmin = roleRes.data === "owner" || roleRes.data === "admin";
        if (isOwnerOrAdmin) {
          const invRes = await listWorkspaceInvitationsAction(activeWorkspaceId);
          if (invRes.success && invRes.data) {
            setInvitations(invRes.data);
          }
        }
      }
    } catch {
      toast.error("An unexpected error occurred while loading members.");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Invitation Actions ───────────────────────────────────────────────────

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId || !inviteEmail.trim()) return;
    setInviting(true);

    try {
      const result = await inviteMemberAction({
        workspaceId: activeWorkspaceId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      if (result.success) {
        toast.success(`Invitation sent to ${inviteEmail}!`);
        setInviteDialogOpen(false);
        setInviteEmail("");
        setInviteRole("member");
        await loadData();
      } else {
        toast.error(result.error || "Failed to send invitation.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!activeWorkspaceId) return;

    try {
      const result = await revokeInvitationAction(activeWorkspaceId, inviteId);
      if (result.success) {
        toast.success("Invitation revoked successfully.");
        await loadData();
      } else {
        toast.error(result.error || "Failed to revoke invitation.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    }
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleRoleChange = async (member: WorkspaceMemberWithProfile, newRole: UserRole) => {
    if (!activeWorkspaceId) return;
    setActionLoading(member.profileId);

    try {
      const result = await updateMemberRoleAction(activeWorkspaceId, member.profileId, newRole);
      if (result.success) {
        toast.success(`Role updated to ${ROLE_CONFIG[newRole].label} for ${getDisplayName(member.profile.firstName, member.profile.lastName, member.profile.email)}`);
        await loadData();
      } else {
        toast.error(result.error || "Failed to update role.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveConfirm = async () => {
    if (!activeWorkspaceId || !removeTarget) return;
    setActionLoading(removeTarget.profileId);

    try {
      const result = await removeMemberAction(activeWorkspaceId, removeTarget.profileId);
      if (result.success) {
        toast.success(`${getDisplayName(removeTarget.profile.firstName, removeTarget.profile.lastName, removeTarget.profile.email)} has been removed from the workspace.`);
        setRemoveDialogOpen(false);
        setRemoveTarget(null);
        await loadData();
      } else {
        toast.error(result.error || "Failed to remove member.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setActionLoading(null);
    }
  };

  // ─── No Workspace Selected ────────────────────────────────────────────────

  if (!activeWorkspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 px-6">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
          <Users size={28} className="text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground">No Workspace Selected</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Select a workspace from the sidebar to manage its members and roles.
        </p>
      </div>
    );
  }

  // ─── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <Loader2 size={32} className="animate-spin text-nova-purple" />
        <p className="text-sm text-muted-foreground font-semibold">Loading members...</p>
      </div>
    );
  }

  // ─── Access Denied ────────────────────────────────────────────────────────

  if (currentRole && !canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 px-6">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <Lock size={28} className="text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Only workspace Owners and Admins can manage members and roles.
          Your current role is: <strong className="text-foreground">{ROLE_CONFIG[currentRole].label}</strong>
        </p>
      </div>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
            <Users size={20} className="text-nova-purple" />
            <span>Members</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage members and roles for{" "}
            <strong className="text-foreground">{activeWorkspaceName || "this workspace"}</strong>.
            {" "}{members.length} member{members.length !== 1 ? "s" : ""}.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setInviteDialogOpen(true)}
            className="bg-nova-purple text-white hover:bg-nova-purple/90 text-xs font-semibold px-4 h-9 flex items-center gap-1.5 cursor-pointer rounded-lg shadow-md"
          >
            <Plus size={14} />
            <span>Invite Teammate</span>
          </Button>
        )}
      </div>

      {/* Members Table */}
      <div className="border border-border/80 rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-border/60 bg-muted/20">
          <div className="col-span-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Member
          </div>
          <div className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Role
          </div>
          <div className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Joined
          </div>
          <div className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">
            Actions
          </div>
        </div>

        {/* Member Rows */}
        <VirtualList
          items={members}
          itemHeight={64}
          containerClassName="max-h-[500px] overflow-y-auto scrollbar-thin"
          renderItem={(member) => {
            const displayName = getDisplayName(member.profile.firstName, member.profile.lastName, member.profile.email);
            const initials = getInitials(member.profile.firstName, member.profile.lastName, member.profile.email);
            const isOwner = member.role === "owner";
            const isLoading = actionLoading === member.profileId;

            return (
              <div
                key={member.id}
                style={{ height: 56 }}
                className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-border/30 items-center hover:bg-accent/20 transition-colors duration-150 last:border-b-0"
              >
                {/* Member Info */}
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    {member.profile.avatarUrl && (
                      <AvatarImage src={member.profile.avatarUrl} alt={displayName} />
                    )}
                    <AvatarFallback className="bg-nova-purple-glow text-nova-purple font-extrabold text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0 select-text">
                    <span className="text-xs font-bold text-foreground truncate">{displayName}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{member.profile.email}</span>
                  </div>
                </div>

                {/* Role Badge + Dropdown */}
                <div className="col-span-3 flex items-center select-none">
                  {canManage && !isOwner ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          disabled={isLoading}
                          className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50"
                        >
                          <RoleBadge role={member.role} />
                          <ChevronDown size={12} className="text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-44">
                        {ASSIGNABLE_ROLES.map((role) => {
                          const config = ROLE_CONFIG[role];
                          const Icon = config.icon;
                          const isActive = member.role === role;

                          // Only owner can assign admin
                          if (role === "admin" && currentRole !== "owner") return null;

                          return (
                            <DropdownMenuItem
                              key={role}
                              disabled={isActive}
                              onClick={() => handleRoleChange(member, role)}
                              className="flex items-center gap-2 text-xs py-2 cursor-pointer"
                            >
                              <Icon size={14} className={config.color} />
                              <span className={isActive ? "font-bold" : ""}>{config.label}</span>
                              {isActive && (
                                <span className="ml-auto text-[9px] text-muted-foreground font-medium">Current</span>
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <RoleBadge role={member.role} />
                  )}
                </div>

                {/* Joined Date */}
                <div className="col-span-2 text-[11px] text-muted-foreground font-medium select-none">
                  {new Date(member.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>

                {/* Actions */}
                <div className="col-span-2 flex justify-end select-none">
                  {canManage && !isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => {
                        setRemoveTarget(member);
                        setRemoveDialogOpen(true);
                      }}
                      className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold gap-1.5"
                    >
                      {isLoading ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <UserMinus size={13} />
                      )}
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          }}
        />

        {members.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No members found in this workspace.
          </div>
        )}
      </div>

      {/* Pending Invitations Section */}
      {canManage && (
        <div className="space-y-4 pt-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-foreground tracking-wide">
              Workspace Invitations
            </h2>
            <p className="text-xs text-muted-foreground">
              Manage sent invitations. Members can join via link or by accepting the dashboard prompt.
            </p>
          </div>

          <div className="border border-border/80 rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-border/60 bg-muted/20">
              <div className="col-span-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Email Address
              </div>
              <div className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Assigned Role
              </div>
              <div className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Status
              </div>
              <div className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">
                Actions
              </div>
            </div>

            {/* Invitation Rows */}
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-border/30 items-center hover:bg-accent/20 transition-all duration-150 last:border-b-0"
              >
                <div className="col-span-5 truncate text-xs font-semibold text-white">
                  {inv.email}
                </div>
                <div className="col-span-2 capitalize text-xs text-muted-foreground">
                  {inv.role}
                </div>
                <div className="col-span-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold capitalize select-none px-2 py-0.5",
                      inv.status === "pending" && "text-yellow-500 border-yellow-500/25 bg-yellow-500/5",
                      inv.status === "accepted" && "text-green-500 border-green-500/25 bg-green-500/5",
                      inv.status === "expired" && "text-red-500 border-red-500/25 bg-red-500/5",
                      inv.status === "revoked" && "text-muted-foreground border-muted/25 bg-muted/5",
                      inv.status === "declined" && "text-zinc-500 border-zinc-500/25 bg-zinc-500/5"
                    )}
                  >
                    {inv.status}
                  </Badge>
                </div>
                <div className="col-span-3 flex justify-end gap-2">
                  {inv.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold"
                      >
                        Revoke
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/workspace/join?token=${inv.token || ""}`);
                          toast.success("Invitation link copied!");
                        }}
                        className="h-8 px-2.5 text-xs text-nova-purple hover:bg-nova-purple/10 hover:text-nova-purple font-semibold"
                      >
                        Copy Link
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {invitations.length === 0 && (
              <div className="px-6 py-8 text-center text-xs text-muted-foreground italic">
                No active or historical invitations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-xl max-w-sm">
          <form onSubmit={handleInviteSubmit}>
            <DialogHeader className="text-left">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Plus size={18} className="text-nova-purple" />
                <span>Invite Teammate</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Enter your teammate's email and choose their workspace role.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/15 focus:border-nova-purple/55 text-white text-xs rounded-lg p-2.5 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-white/15 focus:border-nova-purple/55 text-white text-xs rounded-lg p-2.5 outline-none"
                >
                  <option value="member">Member (Access channels & projects)</option>
                  {currentRole === "owner" && (
                    <option value="admin">Admin (Manage settings & members)</option>
                  )}
                  <option value="guest">Guest (Limited visual access)</option>
                </select>
              </div>
            </div>
            <DialogFooter className="gap-2 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                className="border-white/10 bg-transparent text-white hover:bg-white/5 h-9 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviting}
                className="bg-nova-purple text-white hover:bg-nova-purple/90 h-9 text-xs font-semibold px-4 gap-1.5"
              >
                {inviting && <Loader2 size={13} className="animate-spin" />}
                <span>Send Invitation</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-xl max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle size={18} className="text-destructive" />
              <span>Remove Member</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to remove{" "}
              <strong className="text-foreground">
                {removeTarget
                  ? getDisplayName(removeTarget.profile.firstName, removeTarget.profile.lastName, removeTarget.profile.email)
                  : "this member"}
              </strong>{" "}
              from the workspace? They will lose access to all channels, projects, and tasks.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-2 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRemoveDialogOpen(false);
                setRemoveTarget(null);
              }}
              className="border-white/10 bg-transparent text-white hover:bg-white/5 h-9 text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRemoveConfirm}
              disabled={actionLoading === removeTarget?.profileId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 text-xs font-semibold gap-1.5 px-4"
            >
              {actionLoading === removeTarget?.profileId && (
                <Loader2 size={13} className="animate-spin" />
              )}
              <span>Remove Member</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
