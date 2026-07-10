"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import { Workspace } from "@/types";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const { workspaces, loading } = useWorkspace();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  const handleSwitch = (workspace: Workspace) => {
    setActiveWorkspace(workspace.id, workspace.name, workspace.slug);
    toast.success(`Switched to workspace: ${workspace.name}`);
    router.push(`/workspace/${workspace.slug}`);
  };

  if (loading) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="w-full justify-start gap-2 border-border/85 bg-background/30 h-10 px-3 rounded-md"
      >
        <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-semibold">Loading organizations...</span>
      </Button>
    );
  }

  if (workspaces.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push("/workspace/create")}
        className="w-full justify-between gap-2 border-dashed border-nova-purple/40 bg-nova-purple-glow/5 hover:bg-nova-purple-glow/10 hover:text-foreground h-10 px-3 rounded-md text-nova-purple"
      >
        <div className="flex items-center gap-2 truncate">
          <Plus size={13} />
          <span className="text-xs font-bold truncate">Create Workspace</span>
        </div>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between gap-2 border-border/80 bg-background/30 hover:bg-accent/40 hover:text-foreground h-10 px-3 select-none rounded-md"
        >
          <div className="flex items-center gap-2 text-left truncate">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-nova-purple-glow text-nova-purple border border-nova-purple/20 shrink-0">
              <Building2 size={13} />
            </div>
            <div className="flex flex-col text-xs leading-none truncate">
              <span className="font-bold text-foreground truncate">{activeWorkspace?.name || "Select Workspace"}</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {activeWorkspace?.slug ? `nexus.co/${activeWorkspace.slug}` : "No workspace selected"}
              </span>
            </div>
          </div>
          <ChevronsUpDown size={14} className="text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => handleSwitch(workspace)}
            className="flex items-center justify-between py-2 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                {workspace.name.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-semibold">{workspace.name}</span>
            </div>
            {activeWorkspaceId === workspace.id && (
              <Check size={14} className="text-nova-purple" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => router.push("/workspace/create")}
          className="flex items-center gap-2 text-xs py-2 cursor-pointer font-medium text-nova-purple focus:bg-nova-purple-glow/10"
        >
          <Plus size={14} />
          <span>Create New Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
