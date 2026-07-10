"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import { 
  Sparkles, 
  Send, 
  Copy, 
  RefreshCw, 
  Check, 
  Cpu, 
  User, 
  Brain, 
  Loader2,
  Code
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context/workspace-context";
import { updateWorkspaceAIProviderAction } from "@/app/actions/workspace";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function NovaChatPanel() {
  const { currentWorkspace, refreshWorkspaceData, members } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const activeProvider = currentWorkspace?.ai_provider || "gemini";

  const pathname = usePathname();
  const { contextType: storeContextType, contextId: storeContextId, activeSummary } = useNovaPanelStore();

  // Infer context from pathname if not explicitly provided
  let inferredContextType: string | undefined = undefined;
  let inferredContextId: string | undefined = undefined;

  const channelMatch = pathname.match(/\/c\/([a-fA-F0-9-]+)/) || pathname.match(/\/channel\/([a-fA-F0-9-]+)/);
  const projectMatch = pathname.match(/\/p\/([a-fA-F0-9-]+)/) || pathname.match(/\/project\/([a-fA-F0-9-]+)/);
  const dmMatch = pathname.match(/\/dm\/([a-fA-F0-9-]+)/);

  if (channelMatch) {
    inferredContextType = "channel";
    inferredContextId = channelMatch[1];
  } else if (projectMatch) {
    inferredContextType = "project";
    inferredContextId = projectMatch[1];
  } else if (dmMatch) {
    inferredContextType = "dm";
    inferredContextId = dmMatch[1];
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Settings: Provider selection
  const [provider, setProvider] = useState(activeProvider);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync activeSummary into chat history
  useEffect(() => {
    if (activeSummary) {
      setMessages([
        {
          role: "assistant",
          content: activeSummary
        }
      ]);
    }
  }, [activeSummary]);

  // Sync state if workspace provider changes
  useEffect(() => {
    if (activeProvider) {
      setProvider(activeProvider);
    }
  }, [activeProvider]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle provider update selection
  const handleProviderChange = async (newVal: string) => {
    if (!workspaceId) return;
    setProvider(newVal);
    setIsUpdatingSettings(true);
    try {
      const res = await updateWorkspaceAIProviderAction(workspaceId, newVal);
      if (res.success) {
        toast.success(`Active AI provider switched to: ${newVal.toUpperCase()}`);
        await refreshWorkspaceData();
      } else {
        toast.error(res.error || "Failed to update AI settings.");
      }
    } catch {
      toast.error("Network configuration failure.");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // Submit query chat action
  const handleChatSubmit = async (queryText: string) => {
    if (!queryText.trim() || !workspaceId || isStreaming) return;

    setIsStreaming(true);
    
    // 1. Add user query to history
    const userMsg: ChatMessage = { role: "user", content: queryText.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");

    try {
      // 2. Fetch streaming chat Route
      const res = await fetch("/api/nova/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          workspaceId, 
          query: queryText.trim(),
          contextId: storeContextId || inferredContextId,
          contextType: storeContextType || inferredContextType
        })
      });

      if (!res.ok) {
        let errMsg = "Failed to communicate with Nova stream.";
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch {
          try {
            const rawText = await res.text();
            if (rawText) errMsg = rawText;
          } catch {}
        }
        throw new Error(errMsg);
      }

      if (!res.body) throw new Error("No readable stream response.");

      // 3. Setup streaming decoder
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = "";

      // Insert empty assistant message slot
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value);
        // Process SSE lines
        const lines = rawText.split("\n");
        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(cleanLine.slice(6));
              if (parsed.text) {
                assistantResponse += parsed.text;
                // Update assistant bubble in state
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: assistantResponse };
                  return copy;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred during text generation.");
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "⚠️ **Connection Error**: I was unable to connect to the reasoning servers. Please check your network or verify API keys." }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Copy raw text response
  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    toast.success("Response copied to clipboard.");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Regenerate last response
  const handleRegenerate = () => {
    const userPrompts = messages.filter(m => m.role === "user");
    if (userPrompts.length === 0) return;
    const lastPrompt = userPrompts[userPrompts.length - 1].content;
    handleChatSubmit(lastPrompt);
  };

  // Basic markdown parser
  const renderMarkdown = (text: string) => {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.substring(lastIndex, match.index) });
      }
      parts.push({ type: "code", language: match[1] || "txt", content: match[2] });
      lastIndex = codeBlockRegex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.substring(lastIndex) });
    }

    if (parts.length === 0) {
      parts.push({ type: "text", content: text });
    }

    return (
      <div className="space-y-3 leading-relaxed break-words text-xs text-zinc-300">
        {parts.map((part, index) => {
          if (part.type === "code") {
            return (
              <div key={index} className="rounded border border-white/5 bg-black p-3 font-mono text-[10px] text-zinc-400 relative overflow-hidden select-text text-left mt-2">
                <div className="absolute top-1 right-2 text-[8px] text-muted-foreground uppercase font-bold flex items-center gap-0.5 select-none">
                  <Code size={8} />
                  <span>{part.language}</span>
                </div>
                <pre className="overflow-x-auto pt-2">
                  <code>{part.content}</code>
                </pre>
              </div>
            );
          }

          // Inline tags highlights
          const inlineText = part.content;
          const inlineRegex = /(\*\*.*?\*\*|`[^`]+`|\*.*?\*)/g;
          const inlineParts = [];
          let inlineLastIndex = 0;
          let inlineMatch;

          while ((inlineMatch = inlineRegex.exec(inlineText)) !== null) {
            if (inlineMatch.index > inlineLastIndex) {
              inlineParts.push(<span key={inlineLastIndex}>{inlineText.substring(inlineLastIndex, inlineMatch.index)}</span>);
            }

            const token = inlineMatch[0];
            if (token.startsWith("**") && token.endsWith("**")) {
              inlineParts.push(<strong key={inlineMatch.index} className="text-white font-semibold">{token.slice(2, -2)}</strong>);
            } else if (token.startsWith("`") && token.endsWith("`")) {
              inlineParts.push(<code key={inlineMatch.index} className="px-1 py-0.5 rounded bg-muted font-mono text-[10px] text-nova-purple">{token.slice(1, -1)}</code>);
            } else {
              inlineParts.push(<em key={inlineMatch.index} className="italic">{token.slice(1, -1)}</em>);
            }
            inlineLastIndex = inlineRegex.lastIndex;
          }

          if (inlineLastIndex < inlineText.length) {
            inlineParts.push(<span key={inlineLastIndex}>{inlineText.substring(inlineLastIndex)}</span>);
          }

          return (
            <p key={index} className="whitespace-pre-line leading-relaxed">
              {inlineParts}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-card/95 text-card-foreground">
      
      {/* Settings Selector Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
        <div className="flex items-center gap-1.5 text-nova-purple font-semibold text-xs">
          <Brain size={14} className="animate-pulse" />
          <span>Nova AI Engine</span>
        </div>
        <div className="flex items-center gap-1">
          <Cpu size={12} className="text-muted-foreground" />
          <select
            value={provider}
            disabled={isUpdatingSettings}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="bg-black/50 border border-white/10 rounded px-1.5 py-1 text-[10px] text-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="claude">Anthropic Claude</option>
            <option value="kimi">Moonshot Kimi</option>
          </select>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin select-text">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20 px-4">
            <div className="h-10 w-10 rounded-full bg-nova-purple-glow/20 border border-nova-purple/30 flex items-center justify-center animate-pulse">
              <Sparkles size={20} className="text-nova-purple" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-xs text-white">Ask Nova anything about your workspace</h3>
              <p className="text-[10px] text-muted-foreground max-w-xs leading-relaxed">
                Nova can summarize conversations, predict project delays, suggesting assignees, or write sprint documents.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full max-w-xs select-none">
              <button 
                onClick={() => handleChatSubmit("Summarize today's workspace activities")}
                className="w-full text-left p-2 rounded bg-black/40 hover:bg-black/60 border border-white/5 text-[10px] text-zinc-300 font-medium transition-colors cursor-pointer"
              >
                📝 "Summarize today's activities"
              </button>
              <button 
                onClick={() => handleChatSubmit("Which projects or tasks are at risk of missing deadlines?")}
                className="w-full text-left p-2 rounded bg-black/40 hover:bg-black/60 border border-white/5 text-[10px] text-zinc-300 font-medium transition-colors cursor-pointer"
              >
                ⏰ "Show project milestone predictions"
              </button>
              <button 
                onClick={() => handleChatSubmit("Build a billing system project")}
                className="w-full text-left p-2 rounded bg-black/40 hover:bg-black/60 border border-white/5 text-[10px] text-zinc-300 font-medium transition-colors cursor-pointer"
              >
                🚀 "Generate task boards for a billing system"
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div key={idx} className={`flex gap-3 items-start ${isUser ? "justify-end" : "justify-start"}`}>
                
                {/* Bubble avatar */}
                {!isUser && (
                  <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-nova-purple to-nova-teal flex items-center justify-center border border-border/80 shrink-0 select-none">
                    <Sparkles size={11} className="text-white" />
                  </div>
                )}

                {/* Message Bubble content */}
                <div className={`p-3 rounded-lg border text-xs max-w-[85%] text-left relative group ${
                  isUser 
                    ? "bg-nova-purple-glow/5 border-nova-purple/20 text-white font-medium" 
                    : "bg-muted/30 border-white/5 text-zinc-200"
                }`}>
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <>
                      {renderMarkdown(msg.content)}
                      
                      {/* Hover action triggers */}
                      {msg.content && !isStreaming && (
                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 select-none transition-opacity bg-black/80 rounded border border-white/10 px-1 py-0.5">
                          <button
                            onClick={() => handleCopyText(msg.content, idx)}
                            className="p-1 rounded hover:bg-zinc-800 text-[9px] text-zinc-400 cursor-pointer"
                            title="Copy response text"
                          >
                            {copiedIndex === idx ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
                          </button>
                          {idx === messages.length - 1 && (
                            <button
                              onClick={handleRegenerate}
                              className="p-1 rounded hover:bg-zinc-800 text-[9px] text-zinc-400 cursor-pointer"
                              title="Regenerate last response"
                            >
                              <RefreshCw size={9} />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isUser && (
                  <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 select-none">
                    <User size={11} className="text-muted-foreground" />
                  </div>
                )}

              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Form Composer */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleChatSubmit(inputText); }} 
        className="p-4 border-t border-border bg-card/30 shrink-0 select-text"
      >
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={isStreaming ? "Nova is thinking..." : "Ask Nova about your tasks, standups..."}
            value={inputText}
            disabled={isStreaming}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-background border border-white/10 rounded-md px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
          />
          <Button
            type="submit"
            disabled={isStreaming || !inputText.trim()}
            className="bg-white text-black hover:bg-neutral-200 h-8 px-3 rounded font-bold cursor-pointer transition-all disabled:opacity-50"
          >
            {isStreaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </Button>
        </div>
      </form>

    </div>
  );
}
