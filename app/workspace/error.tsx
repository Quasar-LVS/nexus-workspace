"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceManagementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Workspace management error boundary triggered:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center select-none text-white font-sans">
      <div className="flex max-w-md flex-col items-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-2">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Workspace Gateway Interrupted</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          An error occurred while managing your workspaces or processing invitation details.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => reset()}
            className="flex items-center gap-1.5 bg-white text-black hover:bg-neutral-200 font-semibold text-xs h-9 px-4 cursor-pointer"
          >
            <RefreshCw size={13} />
            <span>Try Again</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/workspace/select";
            }}
            className="border border-white/10 hover:bg-white/5 font-semibold text-xs h-9 px-4 cursor-pointer text-white"
          >
            Go to Selector
          </Button>
        </div>
      </div>
    </div>
  );
}
