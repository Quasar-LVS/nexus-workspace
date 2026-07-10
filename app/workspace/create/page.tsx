"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Building2, Sparkles, Loader2, ArrowRight } from "lucide-react";

import { createWorkspaceSchema, CreateWorkspaceDTO } from "@/lib/backend/validation/workspace.schema";
import { createWorkspaceAction } from "@/app/actions/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function CreateWorkspacePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { setActiveWorkspace } = useWorkspaceStore();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateWorkspaceDTO>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: "",
      slug: "",
      companySize: "1-10",
      industry: "technology",
      timezone: "UTC",
    },
  });

  const workspaceName = watch("name");

  // Auto-generate slug from workspace name
  React.useEffect(() => {
    if (workspaceName) {
      const generatedSlug = workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "") // Remove invalid characters
        .trim()
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .substring(0, 50);
      setValue("slug", generatedSlug, { shouldValidate: true });
    }
  }, [workspaceName, setValue]);

  const onSubmit = async (data: CreateWorkspaceDTO) => {
    setSubmitting(true);
    try {
      const result = await createWorkspaceAction(data);
      if (result.success && result.data) {
        // Set the new workspace as active in the Zustand store
        setActiveWorkspace(result.data.id, result.data.name, result.data.slug);
        
        toast.success("Workspace created successfully!", {
          description: `Welcome to ${data.name}. Redirecting to your dashboard...`,
        });
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create workspace.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred during workspace creation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col items-center justify-center p-6 font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-nova-purple-glow blur-[120px] rounded-full -z-10" />
      
      <div className="w-full max-w-lg space-y-6">
        
        {/* Brand logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-nova-purple to-nova-teal text-white font-extrabold text-xl shadow-lg">
            N
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent uppercase tracking-wider">
            Project Nexus
          </h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Card className="border border-white/10 bg-zinc-950/70 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/5 pb-5">
              <CardTitle className="text-lg font-bold text-left flex items-center gap-2">
                <Building2 className="text-nova-purple" size={18} />
                <span>Create your Workspace</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground text-left">
                Setup your team workspace context. Workspaces isolate projects, chat channels, and Nova memory.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-4 text-left">
              {/* Workspace Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Workspace Name</label>
                <Input
                  type="text"
                  placeholder="e.g. Acme Corporation"
                  {...register("name")}
                  className="border-white/10 bg-black/40 text-sm h-10"
                />
                {errors.name && (
                  <p className="text-[10px] text-red-500 font-medium">{errors.name.message}</p>
                )}
              </div>

              {/* Workspace Slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Workspace URL Slug</label>
                <div className="flex rounded-md border border-white/10 bg-black/40 overflow-hidden items-center px-3 h-10">
                  <span className="text-xs text-muted-foreground select-none">nexus.co/</span>
                  <input
                    type="text"
                    {...register("slug")}
                    className="flex-1 bg-transparent border-0 outline-none p-0 text-sm focus:ring-0 ml-1 text-white"
                  />
                </div>
                {errors.slug && (
                  <p className="text-[10px] text-red-500 font-medium">{errors.slug.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Company Size */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">Company Size</label>
                  <select
                    {...register("companySize")}
                    className="w-full h-10 px-3 border border-white/10 bg-black/40 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-white cursor-pointer"
                  >
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201+">201+ employees</option>
                  </select>
                </div>

                {/* Industry */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">Industry</label>
                  <select
                    {...register("industry")}
                    className="w-full h-10 px-3 border border-white/10 bg-black/40 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-white cursor-pointer"
                  >
                    <option value="technology">Technology</option>
                    <option value="design">Design / Creative</option>
                    <option value="marketing">Marketing</option>
                    <option value="finance">Finance</option>
                    <option value="healthcare">Healthcare</option>
                  </select>
                </div>
              </div>

              {/* Time Zone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Time Zone</label>
                <select
                  {...register("timezone")}
                  className="w-full h-10 px-3 border border-white/10 bg-black/40 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-white cursor-pointer"
                >
                  <option value="UTC">UTC (GMT+00:00)</option>
                  <option value="EST">EST (GMT-05:00)</option>
                  <option value="PST">PST (GMT-08:00)</option>
                  <option value="IST">IST (GMT+05:30)</option>
                  <option value="CET">CET (GMT+01:00)</option>
                </select>
              </div>

            </CardContent>

            <CardFooter className="bg-white/[0.02] border-t border-white/5 p-6 flex justify-end">
              <Button
                type="submit"
                disabled={submitting}
                className="bg-white text-black hover:bg-neutral-200 h-10 px-5 gap-2 rounded-lg"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <span>Create Workspace</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
