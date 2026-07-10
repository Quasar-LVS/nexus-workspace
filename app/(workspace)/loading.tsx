import React from "react";
import { Loader2, Sparkles } from "lucide-react";

export default function WorkspaceLoading() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background select-none text-white font-sans">
      <div className="flex flex-col items-center space-y-4 animate-pulse">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-nova-purple to-nova-teal shadow-md shadow-black/10">
          <Sparkles className="h-6 w-6 text-white animate-pulse" />
        </div>
        <div className="space-y-1.5 flex flex-col items-center">
          <h2 className="text-sm font-bold tracking-widest uppercase bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent">
            Nexus Workspace
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-nova-purple" />
            <span>Synchronizing workspace environment...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
