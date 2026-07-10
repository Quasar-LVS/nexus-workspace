"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Hash, ArrowLeft, Loader2, Trash2, ArrowUpRight } from "lucide-react";

import { unsaveMessageAction } from "@/app/actions/collaboration";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";

import { useWorkspace } from "@/context/workspace-context";

export default function SavedMessagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savedList, setSavedList] = useState<any[]>([]);
  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug || "active";

  const loadSavedMessages = async () => {
    try {
      const client = supabase;
      const { data, error } = await client
        .from("saved_messages")
        .select(`
          id,
          message_id,
          created_at,
          messages (
            id,
            content,
            created_at,
            channel_id,
            channels (name),
            profiles (first_name, last_name, avatar_url)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load bookmarked messages.");
      } else if (data) {
        setSavedList(data.filter((d: any) => d.messages !== null));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSavedMessages();
  }, []);

  const handleUnsave = async (messageId: string) => {
    try {
      const result = await unsaveMessageAction({ messageId });
      if (result.success) {
        toast.success("Bookmark removed.");
        // Filter out of local list
        setSavedList(prev => prev.filter(item => item.message_id !== messageId));
      } else {
        toast.error(result.error || "Failed to remove bookmark.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6 text-left animate-pulse">
        <div className="h-8 w-48 bg-muted/40 rounded" />
        <div className="h-32 bg-muted/20 rounded-xl" />
        <div className="h-32 bg-muted/20 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 text-left pb-16">
      
      {/* Header title */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nova-purple-glow text-nova-purple border border-nova-purple/20">
          <Bookmark size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Saved Messages</h1>
          <p className="text-xs text-muted-foreground">Review your bookmarked discussions, text files, and references.</p>
        </div>
      </div>

      <div className="space-y-4">
        {savedList.map((item) => {
          const msg = item.messages;
          const author = msg.profiles;
          const authorName = author ? `${author.first_name || ""} ${author.last_name || ""}`.trim() : "Member";
          const initials = author?.first_name ? `${author.first_name[0]}${author.last_name?.[0] || ""}`.toUpperCase() : "VN";
          
          return (
            <Card key={item.id} className="border border-white/10 bg-zinc-950/40 rounded-xl group relative overflow-hidden transition-all duration-200">
              <CardHeader className="flex flex-row items-start justify-between pb-2 border-b border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6 rounded shrink-0">
                    <AvatarFallback className="bg-nova-purple-glow text-nova-purple font-bold text-[9px] rounded">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold">{authorName}</span>
                    <span className="text-[9px] text-muted-foreground">
                      Bookmarked on {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Channel label */}
                  <span className="text-[10px] text-muted-foreground font-bold flex items-center gap-0.5 border border-white/10 px-2 py-0.5 rounded bg-black/40">
                    <Hash size={10} />
                    <span>{msg.channels?.name || "channel"}</span>
                  </span>
                  
                  {/* Navigate to channel */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/workspace/${slug}/channel/${msg.messages.channel_id}`)}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground p-0 rounded-md"
                    title="Jump to channel message"
                  >
                    <ArrowUpRight size={13} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 text-xs md:text-sm leading-relaxed text-zinc-300 break-words">
                {msg.content}
              </CardContent>
              <CardFooter className="pt-2 flex justify-end pb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnsave(msg.id)}
                  className="text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive h-7 gap-1 font-bold rounded-md px-2"
                >
                  <Trash2 size={11} />
                  <span>Remove Bookmark</span>
                </Button>
              </CardFooter>
            </Card>
          );
        })}

        {savedList.length === 0 && (
          <div className="border border-dashed border-white/10 rounded-2xl h-48 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Bookmark size={24} className="text-muted-foreground/45 mb-2" />
            <span className="text-xs font-semibold select-none">No saved messages</span>
            <span className="text-[10px] text-muted-foreground/60 select-none">Hover message items in channels and click Bookmark to save reference links here.</span>
          </div>
        )}
      </div>

    </div>
  );
}
