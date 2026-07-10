"use client";

import React, { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings, Trash2, LogOut, ArrowLeft, Loader2, Save, Hash, Lock } from "lucide-react";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { getChannelDetailsAction, updateChannelAction, archiveChannelAction, leaveChannelAction, listCategoriesAction } from "@/app/actions/chat";
import { useWorkspace } from "@/context/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function ChannelSettingsPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = use(params);
  const router = useRouter();
  
  const { activeWorkspaceId } = useWorkspaceStore();
  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug || "active";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Form values
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [categoryId, setCategoryId] = useState("");

  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    async function loadChannelAndCategories() {
      try {
        const detailsRes = await getChannelDetailsAction(channelId);
        if (detailsRes.success && detailsRes.data) {
          const ch = detailsRes.data;
          setName(ch.name);
          setDescription(ch.description || "");
          setIsPrivate(ch.isPrivate);
          setCategoryId(ch.categoryId || "");
        } else {
          toast.error("Failed to load channel details.");
          router.push("/dashboard");
        }

        if (activeWorkspaceId) {
          const catRes = await listCategoriesAction(activeWorkspaceId);
          if (catRes.success && catRes.data) {
            setCategories(catRes.data);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadChannelAndCategories();
  }, [channelId, activeWorkspaceId, router]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const result = await updateChannelAction({
        channelId,
        name: name.toLowerCase().replace(/\s+/g, "-"),
        description,
        isPrivate,
        categoryId: categoryId || null,
      });

      if (result.success) {
        toast.success("Channel updated successfully!");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update channel.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveChannel = async () => {
    if (!confirm("Are you sure you want to archive this channel? This action cannot be undone.")) return;

    setArchiving(true);
    try {
      const result = await archiveChannelAction({ channelId });
      if (result.success) {
        toast.success("Channel archived successfully!");
        router.push("/dashboard");
      } else {
        toast.error(result.error || "Failed to archive channel.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setArchiving(false);
    }
  };

  const handleLeaveChannel = async () => {
    if (!confirm("Are you sure you want to leave this channel?")) return;

    setLeaving(true);
    try {
      const result = await leaveChannelAction({ channelId });
      if (result.success) {
        toast.success("You left the channel.");
        router.push("/dashboard");
      } else {
        toast.error(result.error || "Failed to leave channel.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setLeaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-6 text-left animate-pulse">
        <div className="h-6 w-24 bg-muted/30 rounded" />
        <div className="h-48 bg-muted/20 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 text-left pb-16">
      
      {/* Back navigation */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => router.push(`/workspace/${slug}/channel/${channelId}`)}
        className="gap-1.5 text-muted-foreground hover:text-foreground text-xs p-0 hover:bg-transparent"
      >
        <ArrowLeft size={14} />
        <span>Back to Channel</span>
      </Button>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nova-purple-glow text-nova-purple border border-nova-purple/20">
          <Settings size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Channel Settings</h1>
          <p className="text-xs text-muted-foreground">Manage configuration, privacy controls, and categories for this chat hub.</p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings}>
        <Card className="border border-white/10 bg-zinc-950/40 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              {isPrivate ? <Lock size={15} className="text-nova-purple" /> : <Hash size={15} className="text-nova-purple" />}
              <span>General Settings</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Update the main presentation parameters of the channel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Channel Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Channel Name</label>
              <div className="relative flex items-center border border-white/10 bg-black/40 rounded-md overflow-hidden h-10 px-3">
                <span className="text-xs text-muted-foreground select-none">#</span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none p-0 text-sm focus:ring-0 ml-1 text-white"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Description</label>
              <Textarea
                placeholder="What is this channel about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border-white/10 bg-black/40 text-sm focus:ring-1 focus:ring-ring"
                rows={3}
              />
            </div>

            {/* Category selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-10 px-3 border border-white/10 bg-black/40 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-white cursor-pointer"
              >
                <option value="">Unassigned</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between py-3 border-t border-white/5 mt-4">
              <div className="flex flex-col text-left select-none">
                <span className="text-xs font-bold">Channel Privacy</span>
                <span className="text-[10px] text-muted-foreground">Private channels are only viewable by explicit members.</span>
              </div>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-black text-nova-purple focus:ring-0 cursor-pointer"
              />
            </div>

          </CardContent>
          <CardFooter className="bg-white/[0.01] border-t border-white/5 p-4 flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="bg-white text-black hover:bg-neutral-200 h-9 text-xs font-semibold gap-1.5 px-4 rounded-lg"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>Save Changes</span>
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Danger Zone / Leaving options */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Card: Leave Channel */}
        <Card className="border border-white/10 bg-zinc-950/40 rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <LogOut size={15} className="text-orange-500" />
              <span>Leave Channel</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Remove your access to this channel's history and messages.</CardDescription>
          </CardHeader>
          <CardFooter className="pt-2">
            <Button
              variant="outline"
              disabled={leaving}
              onClick={handleLeaveChannel}
              className="border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-orange-500 h-9 text-xs font-semibold gap-1.5 rounded-lg w-full"
            >
              {leaving ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              <span>Leave Channel</span>
            </Button>
          </CardFooter>
        </Card>

        {/* Card: Archive Channel */}
        <Card className="border border-red-500/10 bg-red-950/5 rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Trash2 size={15} className="text-red-500" />
              <span>Archive Channel</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Archive the channel for all workspace members. Only admins can undo.</CardDescription>
          </CardHeader>
          <CardFooter className="pt-2">
            <Button
              variant="outline"
              disabled={archiving}
              onClick={handleArchiveChannel}
              className="border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 h-9 text-xs font-semibold gap-1.5 rounded-lg w-full"
            >
              {archiving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              <span>Archive Channel</span>
            </Button>
          </CardFooter>
        </Card>
      </div>

    </div>
  );
}
