"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus, ArrowRight, Loader2, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useUser, SignOutButton } from "@clerk/nextjs";

import { listUserWorkspacesAction } from "@/app/actions/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Workspace } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function WorkspaceSelectPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const { setActiveWorkspace } = useWorkspaceStore();
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const result = await listUserWorkspacesAction();
        if (result.success && result.data) {
          setWorkspaces(result.data);
          
          // If user has 0 workspaces, send them to create page
          if (result.data.length === 0) {
            router.push("/workspace/create");
          }
          // If user has exactly 1 workspace, auto-redirect to it
          else if (result.data.length === 1) {
            const onlyWs = result.data[0];
            setActiveWorkspace(onlyWs.id, onlyWs.name, onlyWs.slug);
            router.push(`/workspace/${onlyWs.slug}`);
          }
        } else {
          toast.error(result.error || "Failed to load workspaces.");
        }
      } catch (err) {
        toast.error("Failed to retrieve your workspaces.");
      } finally {
        setLoading(false);
      }
    }

    if (isLoaded && isSignedIn) {
      loadWorkspaces();
    }
  }, [isLoaded, isSignedIn, router, setActiveWorkspace]);

  const handleSelectWorkspace = (ws: Workspace) => {
    setSelectingId(ws.id);
    setActiveWorkspace(ws.id, ws.name, ws.slug);
    toast.success(`Welcome back to ${ws.name}!`);
    router.push(`/workspace/${ws.slug}`);
  };

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-nova-purple-glow blur-[120px] rounded-full -z-10" />
        <Loader2 className="animate-spin text-nova-purple mb-4" size={32} />
        <p className="text-sm text-muted-foreground animate-pulse">Loading your workspaces...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col items-center justify-center p-6 font-sans">
      {/* Background radial glowing effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-nova-purple-glow blur-[120px] rounded-full -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-nova-teal/5 blur-[120px] rounded-full -z-10" />

      <div className="w-full max-w-lg space-y-6">
        {/* Header branding */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-nova-purple to-nova-teal text-white font-extrabold text-xl shadow-lg">
            N
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent uppercase tracking-wider">
            Project Nexus
          </h2>
          <p className="text-xs text-muted-foreground">Select a workspace to continue working</p>
        </div>

        <Card className="border border-white/10 bg-zinc-950/70 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg font-bold text-left flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Building2 className="text-nova-purple" size={18} />
                <span>Your Workspaces</span>
              </span>
              <span className="text-[10px] bg-muted/65 text-muted-foreground font-bold px-2 py-0.5 rounded-full">
                {workspaces.length} found
              </span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground text-left">
              Choose one of your active workspaces to enter the collaborative dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-4 space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {workspaces.map((ws) => (
              <motion.div
                key={ws.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <button
                  type="button"
                  disabled={selectingId !== null}
                  onClick={() => handleSelectWorkspace(ws)}
                  className="w-full text-left p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-nova-purple/10 text-nova-purple text-xs font-bold border border-nova-purple/20">
                      {ws.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-nova-purple transition-colors">
                        {ws.name}
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        nexus.co/{ws.slug}
                      </p>
                    </div>
                  </div>
                  {selectingId === ws.id ? (
                    <Loader2 className="animate-spin text-nova-purple" size={16} />
                  ) : (
                    <ArrowRight size={14} className="text-muted-foreground group-hover:text-white group-hover:translate-x-1 transition-all" />
                  )}
                </button>
              </motion.div>
            ))}
          </CardContent>
          <CardFooter className="border-t border-white/5 pt-4 flex flex-col sm:flex-row gap-3 justify-between items-center bg-white/[0.01]">
            <SignOutButton>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-white flex items-center gap-1.5 cursor-pointer">
                <LogOut size={13} />
                <span>Sign Out</span>
              </Button>
            </SignOutButton>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/workspace/create")}
              className="text-xs text-nova-purple border-nova-purple/20 hover:border-nova-purple/40 hover:bg-nova-purple-glow/5 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} />
              <span>Create Workspace</span>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
