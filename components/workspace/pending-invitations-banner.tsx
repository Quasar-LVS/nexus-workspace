"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getPendingInvitationsAction, joinWorkspaceAction, declineInvitationAction } from "@/app/actions/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Button } from "@/components/ui/button";

interface Invitation {
  id: string;
  token: string;
  role: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
}

export function PendingInvitationsBanner() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { setActiveWorkspace } = useWorkspaceStore();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    async function checkInvites() {
      try {
        const result = await getPendingInvitationsAction();
        if (result.success && result.data) {
          setInvitations(result.data);
        }
      } catch (err) {
        console.error("Failed to check workspace invitations", err);
      }
    }

    if (isLoaded && isSignedIn) {
      checkInvites();
    }
  }, [isLoaded, isSignedIn]);

  const handleAccept = async (invite: Invitation) => {
    setLoadingId(invite.id);
    try {
      const result = await joinWorkspaceAction({ token: invite.token });
      if (result.success && result.data) {
        toast.success(`Welcome to ${invite.workspaceName}!`);
        setActiveWorkspace(invite.workspaceId, invite.workspaceName, invite.workspaceSlug);
        setInvitations(prev => prev.filter(i => i.id !== invite.id));
        // Force complete page reload to update workspace context provider
        window.location.href = `/workspace/${invite.workspaceSlug}`;
      } else {
        toast.error(result.error || "Failed to join workspace.");
      }
    } catch {
      toast.error("An error occurred while joining workspace.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDecline = async (invite: Invitation) => {
    setLoadingId(invite.id);
    try {
      const result = await declineInvitationAction(invite.id);
      if (result.success) {
        toast.success("Invitation declined.");
        setInvitations(prev => prev.filter(i => i.id !== invite.id));
      } else {
        toast.error(result.error || "Failed to decline invitation.");
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setLoadingId(null);
    }
  };

  if (invitations.length === 0) return null;

  const currentInvite = invitations[0];
  const isBusy = loadingId !== null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="w-full bg-gradient-to-r from-nova-purple/20 via-black to-nova-teal/10 border-b border-white/10 shrink-0 relative overflow-hidden"
      >
        {/* Decorative lighting */}
        <div className="absolute top-0 left-[20%] w-[150px] h-[50px] bg-nova-purple-glow blur-[40px] rounded-full opacity-60 pointer-events-none" />
        <div className="absolute bottom-0 right-[25%] w-[120px] h-[40px] bg-nova-teal/20 blur-[30px] rounded-full opacity-50 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-nova-purple/10 border border-nova-purple/25 text-nova-purple rounded-lg shrink-0">
              <Sparkles size={14} className="animate-pulse" />
            </div>
            <p className="text-xs font-semibold text-white/90">
              You've been invited to join <strong className="text-white font-bold">{currentInvite.workspaceName}</strong> as a <span className="capitalize text-nova-teal font-bold">{currentInvite.role}</span>!
            </p>
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => handleDecline(currentInvite)}
              className="h-8 px-3 text-[11px] font-bold border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 cursor-pointer flex items-center gap-1"
            >
              <X size={12} />
              <span>Decline</span>
            </Button>
            <Button
              size="sm"
              disabled={isBusy}
              onClick={() => handleAccept(currentInvite)}
              className="h-8 px-3.5 text-[11px] font-bold bg-nova-purple text-white hover:bg-nova-purple/90 cursor-pointer flex items-center gap-1 shadow-lg"
            >
              {isBusy && loadingId === currentInvite.id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              <span>Accept Invitation</span>
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
