"use client";

import React, { useState } from "react";
import { Sparkles, Search, ArrowRight, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { searchWorkspaceAIAction } from "@/app/actions/nova-ai";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NovaPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [searching, setSearching] = useState(false);
  const { activeWorkspaceId } = useWorkspaceStore();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!activeWorkspaceId) {
      toast.error("No active workspace selected.");
      return;
    }

    setSearching(true);
    setAnswer("");
    try {
      const res = await searchWorkspaceAIAction(activeWorkspaceId, query.trim());
      if (res.success && res.data) {
        setAnswer(res.data);
      } else {
        toast.error(res.error || "Search query failed.");
      }
    } catch {
      toast.error("Cognitive search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-fade-in-glow pb-16">
      {/* Page Title */}
      <div className="flex flex-col gap-2 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2 text-nova-purple font-semibold">
          <Sparkles size={22} className="animate-pulse" />
          <span className="text-sm uppercase tracking-wider font-extrabold">Nova Cognitive Hub</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Ask Nova anything</h1>
        <p className="text-muted-foreground text-sm max-w-xl">
          Search across Slack communication streams, Asana project boards, sprint updates, and organization documents.
        </p>
      </div>

      {/* Query Bar */}
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          placeholder="e.g. What did we decide about the Supabase database migration?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-12 pr-28 py-4 bg-card/60 backdrop-blur-sm border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-ring shadow-sm text-white placeholder:text-muted-foreground/60"
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Search size={18} />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-nova-purple text-primary-foreground text-xs font-semibold rounded-lg hover:bg-nova-purple/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
        >
          {searching ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Searching...</span>
            </>
          ) : (
            <span>Ask Nova</span>
          )}
        </button>
      </form>

      {/* Results Container */}
      {searching && (
        <Card className="border border-border/80 bg-card/40 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden animate-pulse select-none">
          <CardHeader className="border-b border-white/5 pb-4 bg-muted/10">
            <CardTitle className="text-sm font-bold text-left flex items-center gap-2 text-white">
              <Sparkles size={16} className="text-nova-purple animate-spin" />
              <span>Nova AI is thinking...</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6 text-left space-y-3">
            <Skeleton className="h-4 w-full bg-muted/30 rounded" />
            <Skeleton className="h-4 w-5/6 bg-muted/20 rounded" />
            <Skeleton className="h-4 w-4/5 bg-muted/20 rounded" />
            <Skeleton className="h-4 w-2/3 bg-muted/15 rounded" />
          </CardContent>
        </Card>
      )}

      {answer && (
        <Card className="border border-border/80 bg-card/40 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-4 bg-muted/10">
            <CardTitle className="text-sm font-bold text-left flex items-center gap-2 text-white">
              <Sparkles size={16} className="text-nova-purple" />
              <span>Nova AI Search Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6 text-left">
            <div className="prose prose-sm prose-invert max-w-none text-zinc-300 leading-relaxed whitespace-pre-wrap select-text text-sm">
              {answer}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State Tips */}
      {!answer && !searching && (
        <div className="border border-dashed border-border/85 rounded-xl p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Nova leverages semantic indexing to find connections across your workspaces.</p>
          <div className="grid gap-3 sm:grid-cols-2 max-w-lg mx-auto text-left select-none">
            <div 
              onClick={() => {
                setQuery("What are the upcoming database migration tasks?");
              }}
              className="p-3 bg-card border border-border rounded-lg text-xs font-semibold cursor-pointer hover:bg-accent/40 flex items-center justify-between transition-colors"
            >
              <span>"What are the database migration tasks?"</span>
              <ArrowRight size={12} className="text-muted-foreground" />
            </div>
            <div 
              onClick={() => {
                setQuery("What was recommended for Clerk webhook sync integration?");
              }}
              className="p-3 bg-card border border-border rounded-lg text-xs font-semibold cursor-pointer hover:bg-accent/40 flex items-center justify-between transition-colors"
            >
              <span>"clerk webhook integration recommendation"</span>
              <ArrowRight size={12} className="text-muted-foreground" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
