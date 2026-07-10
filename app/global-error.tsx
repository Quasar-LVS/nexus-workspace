"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center select-none text-white font-sans">
        <div className="flex max-w-md flex-col items-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Critical Error</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A fatal initialization error occurred. We've logged the diagnostics. Try reloading the application.
          </p>
          <Button
            onClick={() => reset()}
            className="bg-white text-black hover:bg-neutral-200 font-semibold text-xs h-9 px-4 cursor-pointer"
          >
            Reboot App
          </Button>
        </div>
      </body>
    </html>
  );
}
