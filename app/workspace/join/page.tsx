"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Loader2, ArrowRight, XCircle, CheckCircle } from "lucide-react";
import { joinWorkspaceAction } from "@/app/actions/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function WorkspaceJoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
        <Loader2 className="animate-spin text-nova-purple" size={32} />
        <p className="text-xs text-muted-foreground mt-2 animate-pulse">Loading invitation details...</p>
      </div>
    }>
      <WorkspaceJoinContent />
    </Suspense>
  );
}

function WorkspaceJoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const { isLoaded, isSignedIn, user } = useUser();
  const { setActiveWorkspace } = useWorkspaceStore();
  
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      // Prompt user to sign in, returning back to this URL
      const currentUrl = encodeURIComponent(window.location.href);
      router.push(`/sign-in?redirect_url=${currentUrl}`);
      return;
    }

    if (!token) {
      setError("No invitation token was provided. Please verify the join link is correct.");
      setJoining(false);
      return;
    }

    async function executeJoin() {
      try {
        const result = await joinWorkspaceAction({ token: token! });
        if (result.success && result.data) {
          setSuccess(true);
          toast.success("Joined workspace successfully!");
          
          const ws = result.data;
          setActiveWorkspace(ws.workspaceId, ws.workspaceName, ws.workspaceSlug);
          
          // Wait briefly to show success, then redirect to the dynamic slug page using a full reload
          setTimeout(() => {
            window.location.href = `/workspace/${ws.workspaceSlug}`;
          }, 1500);
        } else {
          setError(result.error || "Failed to join the workspace. The invitation might be invalid, expired, or already accepted.");
        }
      } catch (err) {
        setError("An unexpected error occurred while accepting the invitation.");
      } finally {
        setJoining(false);
      }
    }

    executeJoin();
  }, [isLoaded, isSignedIn, token, router, setActiveWorkspace]);

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col items-center justify-center p-6 font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-nova-purple-glow blur-[120px] rounded-full -z-10" />

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-nova-purple to-nova-teal text-white font-extrabold text-xl shadow-lg">
            N
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent uppercase tracking-wider">
            Project Nexus
          </h2>
        </div>

        <Card className="border border-white/10 bg-zinc-950/70 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-5">
            <CardTitle className="text-base font-bold text-left flex items-center gap-2">
              {joining && <Loader2 className="animate-spin text-nova-purple" size={18} />}
              {error && <XCircle className="text-destructive" size={18} />}
              {success && <CheckCircle className="text-green-500" size={18} />}
              <span>Workspace Invitation</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground text-left">
              {joining && "Verifying invitation credentials..."}
              {error && "Verification Failed"}
              {success && "Success!"}
            </CardDescription>
          </CardHeader>
          <CardContent className="py-6 text-center">
            {joining && (
              <div className="space-y-3">
                <Loader2 className="animate-spin text-nova-purple mx-auto" size={32} />
                <p className="text-sm text-muted-foreground animate-pulse">
                  Finalizing your workspace membership...
                </p>
              </div>
            )}

            {error && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-left bg-destructive/5 border border-destructive/15 rounded-xl p-3.5 leading-relaxed">
                  {error}
                </p>
              </div>
            )}

            {success && (
              <div className="space-y-3">
                <CheckCircle className="text-green-500 mx-auto" size={32} />
                <p className="text-sm font-semibold text-white">
                  Welcome to the workspace!
                </p>
                <p className="text-xs text-muted-foreground animate-pulse">
                  Redirecting to your new dashboard...
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t border-white/5 pt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={joining}
              onClick={() => router.push("/dashboard")}
              className="text-xs font-semibold border-white/10 hover:border-white/20 hover:bg-white/5 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Go to Dashboard</span>
              <ArrowRight size={13} />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
