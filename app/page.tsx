import React from "react";
import Link from "next/link";
import { Sparkles, MessageSquare, ClipboardList, ArrowRight, Shield, Zap, GitBranch } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col justify-between font-sans">
      {/* Background radial glowing effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-nova-purple-glow blur-[120px] rounded-full -z-10" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-emerald-500/10 blur-[150px] rounded-full -z-10" />

      {/* 1. Header Toolbar */}
      <header className="max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="font-extrabold tracking-wider text-2xl bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent">
            NEXUS
          </span>
        </div>
        <Link 
          href="/dashboard" 
          className="relative group overflow-hidden px-5 py-2 rounded-full border border-white/20 text-xs font-semibold hover:border-white/40 transition-all flex items-center gap-1 bg-white/5 backdrop-blur-sm"
        >
          <span>Go to App Dashboard</span>
          <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </header>

      {/* 2. Hero Body Section */}
      <main className="max-w-5xl w-full mx-auto px-6 py-16 sm:py-24 text-center space-y-8 flex-1 flex flex-col justify-center items-center">
        {/* Nova Glow announcement pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-nova-purple">
          <Sparkles size={12} className="animate-pulse" />
          <span>Nova AI Engine Initialized</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-3xl">
          The AI-Powered Workplace{" "}
          <span className="bg-gradient-to-r from-nova-purple to-nova-teal bg-clip-text text-transparent">
            Operating System
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
          Nexus combines Slack communication channels, Asana project task boards, and Nova AI cognitive memory into a unified workflow.
        </p>

        {/* Hero CTA Button */}
        <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center w-full max-w-xs">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white text-black font-semibold rounded-lg hover:bg-neutral-200 transition-colors shadow-lg"
          >
            <span>Launch Workspace</span>
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/nova"
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold rounded-lg transition-all"
          >
            <Sparkles size={16} className="text-nova-purple" />
            <span>Consult Nova</span>
          </Link>
        </div>

        {/* Tech Grid */}
        <div className="pt-16 grid gap-6 grid-cols-2 md:grid-cols-3 max-w-4xl w-full text-left">
          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm space-y-3">
            <div className="p-2 w-fit bg-nova-purple/10 text-nova-purple rounded-lg">
              <MessageSquare size={18} />
            </div>
            <h3 className="text-sm font-bold">Slack-style Channels</h3>
            <p className="text-xs text-muted-foreground">Real-time messaging channels for teams with persistent threads, attachments, and files.</p>
          </div>

          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm space-y-3">
            <div className="p-2 w-fit bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ClipboardList size={18} />
            </div>
            <h3 className="text-sm font-bold">Asana-style Boards</h3>
            <p className="text-xs text-muted-foreground">Agile task management boards, backlog grids, gantt views, and automatic ticket resolution.</p>
          </div>

          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm space-y-3 col-span-2 md:col-span-1">
            <div className="p-2 w-fit bg-nova-teal/10 text-nova-teal rounded-lg">
              <Sparkles size={18} />
            </div>
            <h3 className="text-sm font-bold">Embedded Nova AI</h3>
            <p className="text-xs text-muted-foreground">Automatic conversation summaries, task card generation, health scores, and search queries.</p>
          </div>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="max-w-6xl w-full mx-auto px-6 py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div>&copy; 2026 Nexus Workspace Operating System. All rights reserved.</div>
        <div className="flex gap-4">
          <span className="hover:text-white transition-colors cursor-pointer">Security</span>
          <span className="hover:text-white transition-colors cursor-pointer">API Integration</span>
          <span className="hover:text-white transition-colors cursor-pointer">Nova Framework</span>
        </div>
      </footer>
    </div>
  );
}
