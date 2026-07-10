"use client";

import React, { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { VirtualList } from "@/components/ui/virtual-list";
import { 
  Send, 
  Sparkles, 
  Hash, 
  Lock, 
  Settings, 
  Loader2, 
  User, 
  ExternalLink,
  Code,
  MessageSquare,
  Pin,
  Bookmark,
  Smile,
  Paperclip,
  X,
  FileImage,
  ArrowRight,
  Sparkle,
  Check,
  ClipboardList
} from "lucide-react";
import { toast } from "sonner";

import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import { getChannelDetailsAction } from "@/app/actions/chat";
import { sendMessageAction, fetchMessagesAction, markReadAction } from "@/app/actions/message";
import { 
  createThreadReplyAction, 
  addReactionAction, 
  pinMessageAction, 
  saveMessageAction, 
  generateUploadPresignedUrlAction
} from "@/app/actions/collaboration";
import {
  uploadAttachmentAction,
  deleteAttachmentAction,
  generateSignedUrlAction
} from "@/app/actions/storage";
import {
  generateCatchUpSummaryAction,
  generateThreadSummaryAction,
  extractActionItemsAction,
  generateSmartRepliesAction,
  approveSuggestionAction,
  rejectSuggestionAction,
  summarizeConversationAction,
  rewriteTextAction
} from "@/app/actions/nova-ai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { MessageEntity } from "@/lib/backend/services/message.service";
import { Attachment } from "@/types";

export interface ExtendedMessageEntity extends MessageEntity {
  attachments?: Attachment[];
}

// Simple Rich Text formatter
const RichText = React.memo(function RichText({ text }: { text: string }) {
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

  const parseInline = (inlineText: string) => {
    const inlineRegex = /(@\w+|`[^`]+`|https?:\/\/[^\s]+)/g;
    const inlineParts = [];
    let inlineLastIndex = 0;
    let inlineMatch;

    while ((inlineMatch = inlineRegex.exec(inlineText)) !== null) {
      if (inlineMatch.index > inlineLastIndex) {
        inlineParts.push(<span key={inlineLastIndex}>{inlineText.substring(inlineLastIndex, inlineMatch.index)}</span>);
      }
      
      const token = inlineMatch[0];
      if (token.startsWith("@")) {
        inlineParts.push(
          <span key={inlineMatch.index} className="px-1.5 py-0.5 rounded bg-nova-purple-glow text-nova-purple font-semibold text-xs border border-nova-purple/10 select-all">
            {token}
          </span>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        inlineParts.push(
          <code key={inlineMatch.index} className="px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono text-[11px] border border-white/5">
            {token.slice(1, -1)}
          </code>
        );
      } else {
        inlineParts.push(
          <a key={inlineMatch.index} href={token} target="_blank" rel="noopener noreferrer" className="text-nova-teal hover:underline inline-flex items-center gap-0.5">
            <span>{token}</span>
            <ExternalLink size={10} />
          </a>
        );
      }
      inlineLastIndex = inlineRegex.lastIndex;
    }

    if (inlineLastIndex < inlineText.length) {
      inlineParts.push(<span key={inlineLastIndex}>{inlineText.substring(inlineLastIndex)}</span>);
    }

    return inlineParts;
  };

  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <div key={index} className="rounded-lg border border-white/10 bg-black/60 p-4 font-mono text-xs text-zinc-300 relative overflow-hidden select-text text-left">
              <div className="absolute top-2 right-2 text-[9px] text-muted-foreground uppercase font-bold flex items-center gap-1 select-none">
                <Code size={10} />
                <span>{part.language}</span>
              </div>
              <pre className="overflow-x-auto pt-2">
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }
        return <div key={index}>{parseInline(part.content)}</div>;
      })}
    </div>
  );
});

// Link Preview component
const LinkPreviewCard = React.memo(function LinkPreviewCard({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const match = text.match(urlRegex);
  if (!match) return null;

  const url = match[0];
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = "external-link";
  }

  return (
    <div className="mt-3 p-3 border border-white/5 bg-zinc-950/40 rounded-xl max-w-md flex flex-col gap-1 text-left border-l-nova-purple border-l-2 select-none">
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{domain}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold hover:underline truncate">
        URL Destination Details
      </a>
      <span className="text-[11px] text-muted-foreground truncate">Redirect preview for {url}</span>
    </div>
  );
});

export default function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = use(params);
  const router = useRouter();
  const { user } = useUser();

  // Core states
  const [messages, setMessages] = useState<ExtendedMessageEntity[]>([]);
  const [inputText, setInputText] = useState("");
  const [activeTypers, setActiveTypers] = useState<Record<string, string>>({});
  
  const isTypingRef = useRef(false);
  const stoppedTypingTimeoutRef = useRef<any>(null);

  const typingStatusText = React.useMemo(() => {
    const names = Object.values(activeTypers);
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return "Several people are typing...";
  }, [activeTypers]);

  const [channelName, setChannelName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Pagination states
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Thread states
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadReplies, setThreadReplies] = useState<ExtendedMessageEntity[]>([]);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);

  // File Upload states
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pinned panel states
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pinnedMsgs, setPinnedMsgs] = useState<any[]>([]);

  // Emoji Reactions mapping
  const [reactionsMap, setReactionsMap] = useState<{[msgId: string]: {[emoji: string]: string[]}}>({});

  // Nova AI features states
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [loadingAiCatchUp, setLoadingAiCatchUp] = useState(false);
  const [loadingThreadAi, setLoadingThreadAi] = useState(false);
  
  // Action Items Suggestions Dialog
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [actionSuggestions, setActionSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [rewriting, setRewriting] = useState(false);

  const handleRewrite = async (action: string) => {
    if (!inputText.trim()) return;
    const wsId = activeWorkspaceId || currentWorkspace?.id;
    if (!wsId) return;

    setRewriting(true);
    try {
      const res = await rewriteTextAction(wsId, inputText, action);
      if (res.success && res.data) {
        setInputText(res.data);
        toast.success("Text refined by Nova AI!");
      } else {
        toast.error(res.error || "Failed to refine text.");
      }
    } catch {
      toast.error("Text refinement failed.");
    } finally {
      setRewriting(false);
    }
  };

  const { openNova, setLoading, setActiveSummary } = useNovaPanelStore();
  const { setActiveChannelId, activeWorkspaceId } = useWorkspaceStore();
  const { currentWorkspace, members, markChannelAsRead } = useWorkspace();
  const slug = currentWorkspace?.slug || "active";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollThreadToBottom = () => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch messages
  const loadChannelMessages = React.useCallback(async (chanId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetchMessagesAction({ channelId: chanId, limit: 35 });
      if (res.success && res.data) {
        setMessages(res.data.list);
        setCursor(res.data.nextCursor);
        setHasMore(res.data.nextCursor !== null);
        setTimeout(scrollToBottom, 100);

        if (res.data.list.length > 0) {
          const lastMsg = res.data.list[res.data.list.length - 1];
          await markReadAction({ channelId: chanId, messageId: lastMsg.id });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Sync smart suggestions & channel details
  const fetchSmartSuggestions = React.useCallback(async (chanId: string) => {
    try {
      const res = await generateSmartRepliesAction(chanId);
      if (res.success && res.data) {
        setSmartReplies(res.data);
      }
    } catch (err) {
      console.error("Smart replies fail", err);
    }
  }, []);

  useEffect(() => {
    setActiveChannelId(channelId);
    markChannelAsRead(channelId);
    async function loadChannelDetails() {
      const res = await getChannelDetailsAction(channelId);
      if (res.success && res.data) {
        setChannelName(res.data.name);
        setIsPrivate(res.data.isPrivate);
      }
    }
    loadChannelDetails();
    loadChannelMessages(channelId);
    fetchSmartSuggestions(channelId);
    setActiveThreadId(null);
  }, [channelId, setActiveChannelId, loadChannelMessages, fetchSmartSuggestions, markChannelAsRead]);

  const activeThreadIdRef = useRef(activeThreadId);
  const membersRef = useRef(members);
  const userRef = useRef(user);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    const rtChannel = supabase
      .channel(`room:${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const raw = payload.new as any;
        const newMsg: ExtendedMessageEntity = {
          id: raw.id,
          channelId: raw.channel_id,
          profileId: raw.profile_id,
          content: raw.content,
          isEdited: raw.is_edited || false,
          createdAt: raw.created_at,
          updatedAt: raw.updated_at,
          deletedAt: raw.deleted_at || null,
          parentId: raw.parent_id || null,
          attachments: []
        };

        // Attach profile details from workspace members cache
        const member = membersRef.current.find(m => m.profileId === newMsg.profileId);
        if (member) {
          newMsg.profile = {
            email: member.profile.email,
            firstName: member.profile.firstName,
            lastName: member.profile.lastName,
            avatarUrl: member.profile.avatarUrl
          };
        }
        
        if (newMsg.parentId) {
          if (newMsg.parentId === activeThreadIdRef.current) {
            setThreadReplies(prev => {
              if (prev.some(r => r.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            setTimeout(scrollThreadToBottom, 50);
          }
        } else {
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(scrollToBottom, 50);
          // Reload suggestions when new main messages land
          fetchSmartSuggestions(channelId);
        }
        // Mark as read immediately when active on screen
        markChannelAsRead(channelId);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const raw = payload.new as any;
        const updated: Partial<ExtendedMessageEntity> = {
          id: raw.id,
          channelId: raw.channel_id,
          profileId: raw.profile_id,
          content: raw.content,
          isEdited: raw.is_edited || false,
          createdAt: raw.created_at,
          updatedAt: raw.updated_at,
          deletedAt: raw.deleted_at || null,
          parentId: raw.parent_id || null
        };

        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        if (updated.parentId === activeThreadIdRef.current) {
          setThreadReplies(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const oldRow = payload.old as any;
        setMessages(prev => prev.filter(m => m.id !== oldRow.id));
        setThreadReplies(prev => prev.filter(r => r.id !== oldRow.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attachments", filter: `entity_type=eq.message` }, (payload) => {
        const newAtt = payload.new as any;
        const mappedAtt = {
          id: newAtt.id,
          workspaceId: newAtt.workspace_id,
          uploaderId: newAtt.uploader_id,
          bucket: newAtt.bucket,
          storagePath: newAtt.storage_path,
          fileName: newAtt.file_name,
          mimeType: newAtt.mime_type,
          fileSize: Number(newAtt.file_size),
          entityType: newAtt.entity_type,
          entityId: newAtt.entity_id,
          createdAt: newAtt.created_at
        };

        setMessages(prev => prev.map(m => {
          if (m.id === mappedAtt.entityId) {
            const atts = m.attachments || [];
            if (atts.some((a: any) => a.id === mappedAtt.id)) return m;
            return { ...m, attachments: [...atts, mappedAtt] };
          }
          return m;
        }));

        setThreadReplies(prev => prev.map(r => {
          if (r.id === mappedAtt.entityId) {
            const atts = r.attachments || [];
            if (atts.some((a: any) => a.id === mappedAtt.id)) return r;
            return { ...r, attachments: [...atts, mappedAtt] };
          }
          return r;
        }));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "attachments", filter: `entity_type=eq.message` }, (payload) => {
        const oldAtt = payload.old as any;
        setMessages(prev => prev.map(m => {
          const atts = m.attachments || [];
          if (!atts.some((a: any) => a.id === oldAtt.id)) return m;
          return { ...m, attachments: atts.filter((a: any) => a.id !== oldAtt.id) };
        }));

        setThreadReplies(prev => prev.map(r => {
          const atts = r.attachments || [];
          if (!atts.some((a: any) => a.id === oldAtt.id)) return r;
          return { ...r, attachments: atts.filter((a: any) => a.id !== oldAtt.id) };
        }));
      })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const { userId, userName } = payload.payload;
        if (userId !== userRef.current?.id) {
          setActiveTypers((prev) => ({
            ...prev,
            [userId]: userName,
          }));
        }
      })
      .on("broadcast", { event: "stopped_typing" }, (payload: any) => {
        const { userId } = payload.payload;
        if (userId !== userRef.current?.id) {
          setActiveTypers((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(rtChannel);
      if (stoppedTypingTimeoutRef.current) {
        clearTimeout(stoppedTypingTimeoutRef.current);
      }
    };
  }, [channelId, fetchSmartSuggestions, markChannelAsRead]);

  // Load thread replies
  useEffect(() => {
    if (!activeThreadId) {
      setThreadReplies([]);
      return;
    }

    async function loadReplies() {
      setLoadingReplies(true);
      try {
        const client = supabase;
        const { data, error } = await client
          .from("messages")
          .select(`
            id,
            channel_id,
            profile_id,
            content,
            is_edited,
            created_at,
            updated_at,
            deleted_at,
            profiles (email, first_name, last_name, avatar_url)
          `)
          .eq("parent_id", activeThreadId)
          .order("created_at", { ascending: true });

        if (!error && data) {
          setThreadReplies(data.map((reply: any) => {
            const prof = Array.isArray(reply.profiles) ? reply.profiles[0] : reply.profiles;
            return {
              id: reply.id,
              channelId: reply.channel_id,
              profileId: reply.profile_id,
              content: reply.content,
              isEdited: reply.is_edited,
              createdAt: reply.created_at,
              updatedAt: reply.updated_at,
              deletedAt: reply.deleted_at,
              profile: prof ? {
                email: prof.email,
                firstName: prof.first_name,
                lastName: prof.last_name,
                avatarUrl: prof.avatar_url
              } : undefined
            };
          }));
          setTimeout(scrollThreadToBottom, 100);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingReplies(false);
      }
    }
    loadReplies();
  }, [activeThreadId]);

  // Load pinned list
  const loadPinnedMessages = async () => {
    try {
      const client = supabase;
      const { data, error } = await client
        .from("pinned_messages")
        .select(`
          message_id,
          messages (
            id,
            content,
            created_at,
            profiles (first_name, last_name)
          )
        `)
        .eq("channel_id", channelId);

      if (!error && data) {
        setPinnedMsgs(data.map((pm: any) => pm.messages));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reactions toggle
  const handleReact = async (messageId: string, emoji: string) => {
    try {
      const result = await addReactionAction({ messageId, emoji });
      if (result.success) {
        setReactionsMap(prev => {
          const msgReacts = prev[messageId] || {};
          const users = msgReacts[emoji] || [];
          if (!users.includes("You")) {
            return {
              ...prev,
              [messageId]: { ...msgReacts, [emoji]: [...users, "You"] }
            };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // File Upload triggers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (file.type.startsWith("image/")) {
        setFilePreview(URL.createObjectURL(file));
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleUploadFile = async (messageId: string) => {
    if (!selectedFile || !activeWorkspaceId) return null;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("workspaceId", activeWorkspaceId);
      formData.append("entityType", "message");
      formData.append("entityId", messageId);

      const res = await uploadAttachmentAction(formData);

      if (res.success && res.data) {
        toast.success("Attachment uploaded successfully!");
        setSelectedFile(null);
        setFilePreview(null);
        return res.data;
      } else {
        toast.error(res.error || "File upload failed.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred during file upload.");
    } finally {
      setUploadingFile(false);
    }
    return null;
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!inputText.trim() && !selectedFile) return;

    // Immediately notify we stopped typing
    if (isTypingRef.current && user) {
      isTypingRef.current = false;
      if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);
      const typingChannel = supabase.channel(`typing:${channelId}`);
      typingChannel.send({
        type: "broadcast",
        event: "stopped_typing",
        payload: { userId: user.id }
      });
    }

    setSubmitting(true);
    
    // Determine content fallback if sending only attachment
    let content = inputText.trim();
    if (!content && selectedFile) {
      content = `📎 Attached: ${selectedFile.name}`;
    }

    setInputText("");

    try {
      const res = await sendMessageAction({
        channelId,
        content
      });

      if (res.success && res.data) {
        let newMsg = res.data;
        if (selectedFile) {
          const uploaded = await handleUploadFile(newMsg.id);
          if (uploaded) {
            newMsg.attachments = [uploaded];
          }
        }

        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) {
            return prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m);
          }
          return [...prev, newMsg];
        });
        setTimeout(scrollToBottom, 50);
      } else {
        toast.error(res.error || "Failed to send message.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (val: string) => {
    setInputText(val);

    if (!user || !channelId) return;

    const typingChannel = supabase.channel(`typing:${channelId}`);

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      typingChannel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          userId: user.id,
          userName: user.fullName || user.firstName || "Someone"
        }
      });
    }

    if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);
    stoppedTypingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingChannel.send({
        type: "broadcast",
        event: "stopped_typing",
        payload: { userId: user.id }
      });
    }, 3000);
  };

  // Send reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submittingReply || !activeThreadId) return;

    setSubmittingReply(true);
    const content = replyText;
    setReplyText("");

    try {
      const res = await createThreadReplyAction({
        parentId: activeThreadId,
        content
      });

      if (res.success && res.data) {
        setThreadReplies(prev => {
          if (prev.some(r => r.id === res.data!.id)) return prev;
          return [...prev, res.data!];
        });
        setTimeout(scrollThreadToBottom, 50);
      } else {
        toast.error(res.error || "Failed to send thread reply.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    } finally {
      setSubmittingReply(false);
    }
  };

  const handlePinMessage = async (messageId: string) => {
    try {
      const result = await pinMessageAction({ channelId, messageId });
      if (result.success) {
        toast.success("Message pinned successfully!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveMessage = async (messageId: string) => {
    try {
      const result = await saveMessageAction({ messageId });
      if (result.success) {
        toast.success("Message bookmarked successfully!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Nova AI Catch-up Summarization Action
  const handleCatchUp = async () => {
    const wsId = activeWorkspaceId || currentWorkspace?.id;
    if (!wsId) return;

    setLoadingAiCatchUp(true);
    openNova("channel", channelId);
    setLoading(true);
    try {
      const res = await summarizeConversationAction(wsId, "channel", channelId);
      if (res.success && res.data) {
        setActiveSummary(res.data);
        toast.success("Catch-Up summary synthesized!");
      } else {
        toast.error(res.error || "Catch-up summarization failed.");
      }
    } catch (err) {
      toast.error("Catch-up summarization failed.");
    } finally {
      setLoadingAiCatchUp(false);
      setLoading(false);
    }
  };

  // Nova AI Thread Summarization Action
  const handleSummarizeThread = async () => {
    if (!activeThreadId) return;
    setLoadingThreadAi(true);
    openNova("channel", channelId);
    setLoading(true);
    try {
      const res = await generateThreadSummaryAction(activeThreadId);
      if (res.success && res.data) {
        setActiveSummary(res.data);
        toast.success("Thread summary generated!");
      } else {
        toast.error(res.error || "Thread summarization failed.");
      }
    } catch (err) {
      toast.error("Thread summarization failed.");
    } finally {
      setLoadingThreadAi(false);
      setLoading(false);
    }
  };

  // Nova AI Extract Action Items Suggestions
  const handleExtractActions = async () => {
    setLoadingSuggestions(true);
    setSuggestionsOpen(true);
    try {
      const res = await extractActionItemsAction(channelId);
      if (res.success && res.data) {
        setActionSuggestions(res.data);
        toast.success("AI Action items identified!");
      } else {
        toast.error(res.error || "Failed to identify tasks.");
      }
    } catch (err) {
      toast.error("Extraction failed.");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Approval card approvals/rejections triggers
  const handleApproveSuggestion = async (id: string) => {
    try {
      const result = await approveSuggestionAction(id);
      if (result.success) {
        setActionSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved" } : s));
        toast.success("Action Item approved and logged!");
      } else {
        toast.error(result.error || "Approval failed.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    }
  };

  const handleRejectSuggestion = async (id: string) => {
    try {
      const result = await rejectSuggestionAction(id);
      if (result.success) {
        setActionSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" } : s));
        toast.info("Action Item suggestion rejected.");
      } else {
        toast.error(result.error || "Rejection failed.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    }
  };

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchMessagesAction({ channelId, cursor, limit: 30 });
      if (res.success && res.data) {
        setMessages(prev => [...res.data!.list, ...prev]);
        setCursor(res.data.nextCursor);
        setHasMore(res.data.nextCursor !== null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const getGroupedMessages = () => {
    const groups: { [key: string]: MessageEntity[] } = {};
    messages.forEach((msg) => {
      if (!msg.parentId) {
        const date = new Date(msg.createdAt).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!groups[date]) groups[date] = [];
        groups[date].push(msg);
      }
    });
    return groups;
  };

  const grouped = getGroupedMessages();
  const parentMsg = messages.find(m => m.id === activeThreadId);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] text-white">
      
      {/* 1. Header toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card/10 px-6 py-3 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-left select-none">
            {isPrivate ? <Lock size={15} className="text-muted-foreground shrink-0" /> : <Hash size={15} className="text-muted-foreground shrink-0" />}
            <span className="capitalize truncate max-w-[180px]">{channelName || channelId}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/workspace/${slug}/channel/${channelId}/settings`)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-0"
              aria-label="Channel Settings"
            >
              <Settings size={12} />
            </Button>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setPinnedOpen(true); loadPinnedMessages(); }}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 font-bold h-7 px-2 gap-1 rounded-md"
          >
            <Pin size={10} />
            <span>Pinned</span>
          </Button>

          {/* Action item scanner */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExtractActions}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 font-bold h-7 px-2 gap-1 rounded-md"
          >
            <ClipboardList size={11} />
            <span>Suggested Action Cards</span>
          </Button>
        </div>

        {/* AI Action Triggers */}
        <div className="flex items-center gap-2">
          {/* Catch me up button */}
          <button
            onClick={handleCatchUp}
            disabled={loadingAiCatchUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-nova-purple-glow hover:bg-nova-purple-glow/20 text-nova-purple border border-nova-purple/20 text-xs font-semibold shadow-sm transition-all"
          >
            {loadingAiCatchUp ? <Loader2 size={13} className="animate-spin text-nova-purple" /> : <Sparkle size={13} />}
            <span>✨ Catch me up</span>
          </button>
        </div>
      </div>

      {/* 2. Main split page container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Channel messages history */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {loadingHistory ? (
              <div className="flex-1 p-6 space-y-6 select-none animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 p-2 rounded-lg items-start text-left">
                    <Skeleton className="h-8 w-8 rounded-md bg-muted/30 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3.5 w-24 bg-muted/40 rounded" />
                        <Skeleton className="h-2.5 w-12 bg-muted/20 rounded" />
                      </div>
                      <Skeleton className="h-4 w-full bg-muted/30 rounded" />
                      <Skeleton className="h-4 w-2/3 bg-muted/20 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center py-24 px-4 text-center select-none">
                <div className="h-16 w-16 rounded-full bg-nova-purple-glow/10 flex items-center justify-center text-nova-purple mb-4">
                  <Hash size={28} />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Welcome to #{channelName || "channel"}!</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  This is the very beginning of the #{channelName || "channel"} history. Use this space to share ideas, post updates, and brainstorm with your team.
                </p>
              </div>
            ) : (
              <VirtualList
                items={messages}
                itemHeight={130}
                containerClassName="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin h-[calc(100vh-8.5rem)] pr-1"
                onScrollNearTop={hasMore && !loadingMore ? handleLoadMore : undefined}
                renderItem={(msg, idx) => {
                  const showDateDivider = idx === 0 || (() => {
                    const prevDate = new Date(messages[idx - 1].createdAt).toDateString();
                    const currDate = new Date(msg.createdAt).toDateString();
                    return prevDate !== currDate;
                  })();

                  const dateLabel = new Date(msg.createdAt).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  const senderName = msg.profile?.firstName ? `${msg.profile.firstName} ${msg.profile.lastName || ""}` : "Collaborator";
                  const initials = msg.profile?.firstName ? `${msg.profile.firstName[0]}${msg.profile.lastName?.[0] || ""}`.toUpperCase() : "VN";
                  const reacts = reactionsMap[msg.id] || {};

                  return (
                    <div key={msg.id} className="space-y-4 mb-3">
                      {showDateDivider && (
                        <div className="relative flex py-2 items-center select-none">
                          <div className="flex-1 border-t border-white/5"></div>
                          <span className="flex-shrink mx-4 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{dateLabel}</span>
                          <div className="flex-1 border-t border-white/5"></div>
                        </div>
                      )}

                      <div className="flex gap-3 hover:bg-white/[0.01] p-2 rounded-lg group relative transition-colors text-left items-start">
                        <Avatar className="h-8 w-8 rounded-md shrink-0">
                          <AvatarFallback className="bg-nova-purple-glow text-nova-purple font-extrabold text-[11px] rounded-md">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1 overflow-hidden">
                          <div className="flex items-center gap-2 select-none">
                            <span className="text-xs font-bold text-foreground hover:underline cursor-pointer">{senderName}</span>
                            <span className="text-[9px] text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.isEdited && <span className="text-[9px] text-muted-foreground/50 italic">(edited)</span>}
                          </div>
                          
                          <RichText text={msg.content} />
                          <LinkPreviewCard text={msg.content} />

                          {/* Attachments rendering */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 select-none text-left">
                              {msg.attachments.map((att) => {
                                const isImage = att.mimeType?.startsWith("image/");
                                return (
                                  <div key={att.id} className="border border-white/5 bg-zinc-950/40 hover:bg-zinc-950/60 p-2.5 rounded-xl flex flex-col gap-2 transition-colors animate-fade-in">
                                    <div className="flex items-center gap-3">
                                      <div className="h-9 w-9 rounded bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0 border border-white/5">
                                        <Paperclip size={14} className="text-muted-foreground" />
                                      </div>
                                      <div className="flex flex-col truncate">
                                        <span className="text-xs font-bold text-foreground truncate max-w-[150px]">{att.fileName}</span>
                                        <span className="text-[9px] text-muted-foreground">{(att.fileSize / 1024).toFixed(1)} KB</span>
                                      </div>
                                    </div>

                                    {isImage && (
                                      <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-white/5 bg-black/20">
                                        <Image
                                          src={`/api/attachments/${att.id}/download`}
                                          alt={att.fileName}
                                          fill
                                          sizes="(max-width: 768px) 100vw, 50vw"
                                          className="object-cover cursor-pointer"
                                          onClick={() => window.open(`/api/attachments/${att.id}/download`, "_blank")}
                                        />
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between gap-2 px-1 select-none">
                                      <button
                                        onClick={() => window.open(`/api/attachments/${att.id}/download`, "_blank")}
                                        className="text-[10px] text-nova-teal hover:underline flex items-center gap-1 font-bold cursor-pointer"
                                      >
                                        Download
                                      </button>

                                      {(user?.id === att.uploaderId || members.some(m => m.profileId === user?.id && ["owner", "admin"].includes(m.role))) && (
                                        <button
                                          onClick={async () => {
                                            if (confirm("Are you sure you want to delete this file?")) {
                                              const res = await deleteAttachmentAction(att.id);
                                              if (res.success) {
                                                toast.success("Attachment deleted successfully!");
                                              } else {
                                                toast.error(res.error || "Failed to delete file.");
                                              }
                                            }
                                          }}
                                          className="text-[10px] text-destructive hover:underline font-bold cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {Object.keys(reacts).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {Object.entries(reacts).map(([emoji, users]) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(msg.id, emoji)}
                                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-nova-purple/20 bg-nova-purple-glow/5 hover:bg-nova-purple-glow/10 text-xs text-nova-purple font-semibold transition-colors"
                                >
                                  <span>{emoji}</span>
                                  <span>{users.length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Hover Actions Toolbar */}
                        <div className="absolute right-4 top-[-10px] hidden group-hover:flex items-center border border-white/10 bg-zinc-950/90 shadow-lg rounded-lg p-0.5 shrink-0 z-10 select-none">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md p-0">
                                <Smile size={13} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="p-1 min-w-[120px] flex gap-1 justify-center bg-zinc-950 border border-white/10" align="end">
                              {["👍", "❤️", "🔥", "🚀", "👀"].map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(msg.id, emoji)}
                                  className="hover:bg-white/10 p-1.5 rounded text-sm transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setActiveThreadId(msg.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md p-0"
                            title="Reply in Thread"
                          >
                            <MessageSquare size={13} />
                          </Button>

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handlePinMessage(msg.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md p-0"
                            title="Pin Message"
                          >
                            <Pin size={12} />
                          </Button>

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleSaveMessage(msg.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md p-0"
                            title="Save Bookmark"
                          >
                            <Bookmark size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
          )}

          {/* Input tray panel */}
          <div className="border-t border-border p-4 bg-background/50 shrink-0">
            
            {/* 1. Preselected file preview */}
            {selectedFile && (
              <div className="max-w-4xl mx-auto flex items-center justify-between p-2.5 border border-white/10 bg-zinc-950/60 rounded-xl mb-3 select-none text-left">
                <div className="flex items-center gap-3">
                  {filePreview ? (
                    <img src={filePreview} alt="Preview" className="h-10 w-10 object-cover rounded-md border border-white/5" />
                  ) : (
                    <div className="h-10 w-10 flex items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileImage size={18} />
                    </div>
                  )}
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-bold truncate max-w-[180px]">{selectedFile.name}</span>
                    <span className="text-[9px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setSelectedFile(null); setFilePreview(null); }} className="h-6 w-6 text-muted-foreground hover:text-destructive p-0">
                  <X size={12} />
                </Button>
              </div>
            )}

            {/* 2. Smart Replies Suggestions Pills */}
            {smartReplies.length > 0 && !inputText.trim() && (
              <div className="max-w-4xl mx-auto flex flex-wrap gap-2 pb-3 pt-1 select-none text-left animate-fade-in">
                {smartReplies.map((reply, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setInputText(reply)}
                    className="px-2.5 py-1 rounded-full border border-white/5 bg-zinc-950/60 hover:bg-white/5 text-[11.5px] text-muted-foreground hover:text-foreground font-semibold transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                  >
                    <Sparkles size={10} className="text-nova-purple shrink-0" />
                    <span>{reply}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Live typing indicator overlay */}
            {typingStatusText && (
              <div className="max-w-4xl mx-auto text-[11px] text-muted-foreground italic pb-2 animate-fade-in flex items-center gap-1.5 select-none">
                <Loader2 size={10} className="animate-spin text-primary" />
                <span>{typingStatusText}</span>
              </div>
            )}

            {/* 3. Input form */}
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 h-10 w-10 border-border/80 bg-card/30 hover:bg-accent/40 rounded-lg shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Paperclip size={15} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={rewriting || !inputText.trim()}
                    className="p-2.5 h-10 w-10 border-border/80 bg-card/30 hover:bg-accent/40 rounded-lg shrink-0 flex items-center justify-center text-nova-purple hover:text-nova-purple-glow cursor-pointer"
                  >
                    {rewriting ? <Loader2 size={15} className="animate-spin text-nova-purple" /> : <Sparkles size={15} />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 border-white/10 bg-zinc-950 text-white">
                  <DropdownMenuItem onClick={() => handleRewrite("improve")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">🪄 Improve Writing</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRewrite("shorten")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">📝 Shorten</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRewrite("expand")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">📖 Expand</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRewrite("professional")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">💼 Make Professional</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRewrite("friendly")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">😊 Make Friendly</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem onClick={() => handleRewrite("translate:Spanish")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">🇪🇸 Translate to Spanish</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRewrite("translate:French")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">🇫🇷 Translate to French</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRewrite("translate:Chinese")} className="cursor-pointer text-xs font-semibold hover:bg-white/5 py-2">🇨🇳 Translate to Chinese</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <input
                type="text"
                placeholder={`Message #${channelName || channelId}`}
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                disabled={submitting}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    const file = e.dataTransfer.files[0];
                    setSelectedFile(file);
                    if (file.type.startsWith("image/")) {
                      setFilePreview(URL.createObjectURL(file));
                    } else {
                      setFilePreview(null);
                    }
                  }
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files && e.clipboardData.files[0]) {
                    const file = e.clipboardData.files[0];
                    setSelectedFile(file);
                    if (file.type.startsWith("image/")) {
                      setFilePreview(URL.createObjectURL(file));
                    } else {
                      setFilePreview(null);
                    }
                  }
                }}
                className="flex-1 px-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-ring text-white placeholder:text-muted-foreground/50"
              />
              <button
                type="submit"
                disabled={submitting || (!inputText.trim() && !selectedFile)}
                className="p-2.5 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white rounded-lg transition-colors shrink-0 flex items-center justify-center"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Collapsible thread panel */}
        {activeThreadId && parentMsg && (
          <div className="w-80 md:w-[380px] flex flex-col shrink-0 bg-card/25 backdrop-blur-md border-l border-white/5 relative">
            <div className="flex items-center justify-between border-b border-white/5 p-4 shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm text-left select-none">
                <MessageSquare size={15} className="text-nova-purple" />
                <span>Thread Discussion</span>
              </div>
              <div className="flex items-center gap-1.5 select-none">
                
                {/* Summarize thread trigger */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSummarizeThread}
                  disabled={loadingThreadAi}
                  className="h-7 text-[10px] text-nova-purple hover:bg-nova-purple-glow/10 font-bold gap-1 rounded-md px-2"
                >
                  {loadingThreadAi ? <Loader2 size={10} className="animate-spin text-nova-purple" /> : <Sparkles size={10} />}
                  <span>Summarize Thread</span>
                </Button>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setActiveThreadId(null)} 
                  className="h-6 w-6 text-muted-foreground hover:text-foreground rounded p-0"
                >
                  <X size={12} />
                </Button>
              </div>
            </div>

            <div className="p-4 border-b border-white/5 text-left bg-white/[0.01]">
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-nova-purple-glow text-nova-purple font-bold text-xs select-none">
                  {parentMsg.profile?.firstName?.[0] || "P"}
                </div>
                <div className="flex-1 space-y-1 overflow-hidden">
                  <div className="flex items-center gap-1.5 select-none">
                    <span className="text-xs font-bold">{parentMsg.profile?.firstName || "Member"}</span>
                    <span className="text-[8px] text-muted-foreground">
                      {new Date(parentMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <RichText text={parentMsg.content} />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin text-left">
              {loadingReplies && (
                <div className="flex justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {threadReplies.map((reply) => {
                const replyInitials = reply.profile?.firstName ? `${reply.profile.firstName[0]}${reply.profile.lastName?.[0] || ""}`.toUpperCase() : "VN";
                return (
                  <div key={reply.id} className="flex gap-2.5">
                    <Avatar className="h-6 w-6 rounded shrink-0">
                      <AvatarFallback className="bg-nova-purple-glow text-nova-purple font-bold text-[9px] rounded">
                        {replyInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 select-none">
                        <span className="text-[11px] font-bold">{reply.profile?.firstName || "Member"}</span>
                        <span className="text-[8px] text-muted-foreground">
                          {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <RichText text={reply.content} />
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            <form onSubmit={handleSendReply} className="p-4 border-t border-white/5 bg-background/20 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Reply in thread..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={submittingReply}
                  className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-ring text-white placeholder:text-muted-foreground/50"
                />
                <button
                  type="submit"
                  disabled={submittingReply || !replyText.trim()}
                  className="p-2.5 bg-white text-black hover:bg-neutral-200 rounded-lg shrink-0 flex items-center justify-center h-8 w-8"
                >
                  <ArrowRight size={13} />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* 3. Pinned Messages panel */}
      <Dialog open={pinnedOpen} onOpenChange={setPinnedOpen}>
        <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-xl max-w-lg">
          <DialogHeader className="text-left border-b border-white/5 pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 select-none">
              <Pin size={16} className="text-nova-purple" />
              <span>Pinned Messages</span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-4 pt-4 text-left scrollbar-thin">
            {pinnedMsgs.map((msg) => (
              <div key={msg.id} className="p-3 border border-white/5 bg-zinc-900/40 rounded-xl space-y-1">
                <div className="flex items-center gap-2 select-none">
                  <span className="text-xs font-bold">{msg.profiles ? `${msg.profiles.first_name || ""} ${msg.profiles.last_name || ""}` : "Member"}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(msg.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-zinc-300 break-words">{msg.content}</p>
              </div>
            ))}
            {pinnedMsgs.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground italic select-none">
                No pinned messages in this channel.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. AI ACTION SUGGESTIONS DIALOG (Approval Cards UI) */}
      <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-2xl max-w-xl">
          <DialogHeader className="text-left border-b border-white/5 pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 select-none">
              <Sparkles size={16} className="text-nova-purple animate-pulse" />
              <span>Nova Task Approval Cards</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground select-none">
              Review suggested actions extracted by Nova. Action items will NOT create workspace tasks until approved.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[380px] overflow-y-auto space-y-4 pt-4 text-left scrollbar-thin">
            {loadingSuggestions && (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 size={20} className="animate-spin text-nova-purple" />
                <span className="text-xs font-semibold">Extracting actionable task cards...</span>
              </div>
            )}

            {!loadingSuggestions && actionSuggestions.map((sug) => (
              <Card key={sug.id} className="border border-white/10 bg-zinc-900/60 rounded-xl relative overflow-hidden transition-colors">
                <CardHeader className="pb-2 border-b border-white/5 bg-white/[0.01]">
                  <CardTitle className="text-xs font-bold flex items-center justify-between">
                    <span>{sug.suggestedTitle}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase select-none ${
                      sug.status === "approved" 
                        ? "bg-green-500/10 text-green-500 border border-green-500/20" 
                        : sug.status === "rejected" 
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    }`}>
                      {sug.status}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3 text-xs leading-relaxed text-zinc-300">
                  {sug.suggestedDescription}
                </CardContent>
                <CardFooter className="pt-1 flex justify-end gap-2 pb-3 border-t border-white/5 bg-white/[0.01]">
                  {sug.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRejectSuggestion(sug.id)}
                        className="text-[10px] text-destructive hover:bg-destructive/10 h-7 rounded-md font-bold"
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApproveSuggestion(sug.id)}
                        className="text-[10px] bg-white text-black hover:bg-zinc-200 h-7 rounded-md font-bold px-3 gap-1"
                      >
                        <Check size={11} />
                        <span>Approve Action</span>
                      </Button>
                    </>
                  )}
                  {sug.status === "approved" && (
                    <span className="text-[10px] text-muted-foreground/60 italic flex items-center gap-1 select-none">
                      <Check size={11} className="text-green-500" />
                      <span>Task creation approved.</span>
                    </span>
                  )}
                </CardFooter>
              </Card>
            ))}

            {!loadingSuggestions && actionSuggestions.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground italic select-none">
                No new task action items detected.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
