"use client";

import React, { use, useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { VirtualList } from "@/components/ui/virtual-list";
import { 
  Send, 
  Sparkles, 
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
  ArrowRight,
  Sparkle,
  Check,
  ClipboardList,
  Users,
  FileImage
} from "lucide-react";
import { toast } from "sonner";

import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import { 
  listUserConversationsAction,
  setTypingStatusAction,
  getTypingUsersAction,
  markSingleNotificationReadAction
} from "@/app/actions/chat";
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
import { summarizeConversationAction, rewriteTextAction } from "@/app/actions/nova-ai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { MessageEntity } from "@/lib/backend/services/message.service";
import { Attachment } from "@/types";

export interface ExtendedMessageEntity extends MessageEntity {
  attachments?: Attachment[];
}
import { useUser } from "@clerk/nextjs";

// Simple Rich Text Formatter
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

export default function DMPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const router = useRouter();
  const { user } = useUser();
  const { currentWorkspace, members, conversations, refreshWorkspaceData } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const { openNova, setActiveSummary, setLoading: setPanelLoading } = useNovaPanelStore();
  const [loadingSummary, setLoadingSummary] = useState(false);

  const handleSummarize = async () => {
    if (!workspaceId || !conversationId) return;
    setLoadingSummary(true);
    openNova("dm", conversationId);
    setPanelLoading(true);
    try {
      const res = await summarizeConversationAction(workspaceId, "dm", conversationId);
      if (res.success && res.data) {
        setActiveSummary(res.data);
        toast.success("Conversation summary generated!");
      } else {
        toast.error(res.error || "Failed to generate conversation summary.");
      }
    } catch {
      toast.error("An unexpected error occurred during summarization.");
    } finally {
      setLoadingSummary(false);
      setPanelLoading(false);
    }
  };

  const [rewriting, setRewriting] = useState(false);

  const handleRewrite = async (action: string) => {
    if (!inputText.trim()) return;
    if (!workspaceId) return;

    setRewriting(true);
    try {
      const res = await rewriteTextAction(workspaceId, inputText, action);
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

  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<ExtendedMessageEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);

  // Message compose input state
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mentions auto-complete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(-1);

  // Typing indicators state
  const [activeTypers, setActiveTypers] = useState<Record<string, string>>({});
  const isTypingRef = useRef(false);
  const stoppedTypingTimeoutRef = useRef<any>(null);

  // Threads states (Slack style)
  const [threadParent, setThreadParent] = useState<MessageEntity | null>(null);
  const [threadReplies, setThreadReplies] = useState<ExtendedMessageEntity[]>([]);
  const [threadInputText, setThreadInputText] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSubmitting, setThreadSubmitting] = useState(false);

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // File Upload states
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!selectedFile || !workspaceId) return null;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("workspaceId", workspaceId);
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

  const typingStatusText = useMemo(() => {
    const names = Object.values(activeTypers);
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return "Several people are typing...";
  }, [activeTypers]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Load conversation details
  useEffect(() => {
    if (!workspaceId) return;

    // Find conversation in cached list
    const found = conversations.find(c => c.id === conversationId);
    if (found) {
      setConversation(found);
      setLoading(false);
    } else {
      // Direct load if not cached yet
      listUserConversationsAction(workspaceId).then(res => {
        if (res.success && res.data) {
          const detail = res.data.find(c => c.id === conversationId);
          if (detail) {
            setConversation(detail);
          } else {
            toast.error("Conversation not found.");
            router.push(`/workspace/${currentWorkspace?.slug || "active"}`);
          }
        }
        setLoading(false);
      });
    }
  }, [conversationId, workspaceId, conversations, router, currentWorkspace]);

  // Pagination states
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchMessagesAction({ conversationId, cursor, limit: 30 });
      if (res.success && res.data) {
        setMessages(prev => [...res.data!.list, ...prev]);
        setCursor(res.data.nextCursor);
        setHasMore(res.data.nextCursor !== null);
      }
    } catch (err) {
      console.error("Failed to load more DM messages:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Load DM messages
  useEffect(() => {
    async function loadMessages() {
      setMessagesLoading(true);
      try {
        const res = await fetchMessagesAction({ conversationId, limit: 50 });
        if (res.success && res.data) {
          setMessages(res.data.list);
          setCursor(res.data.nextCursor);
          setHasMore(res.data.nextCursor !== null);
          
          // Mark as read
          if (res.data.list.length > 0) {
            const lastMsg = res.data.list[res.data.list.length - 1];
            markReadAction({ conversationId, messageId: lastMsg.id });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setMessagesLoading(false);
      }
    }
    loadMessages();
  }, [conversationId]);

  const threadParentRef = useRef(threadParent);
  const userRef = useRef(user);
  const refreshWorkspaceDataRef = useRef(refreshWorkspaceData);

  useEffect(() => {
    threadParentRef.current = threadParent;
  }, [threadParent]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    refreshWorkspaceDataRef.current = refreshWorkspaceData;
  }, [refreshWorkspaceData]);

  // Realtime messages subscription & typing logs trigger
  useEffect(() => {
    const channel = supabase
      .channel(`conversation-chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, async (payload) => {
        // Fetch full message complete with sender profiles
        const { data: fullMsg } = await supabase
          .from("messages")
          .select(`
            id,
            channel_id,
            conversation_id,
            profile_id,
            content,
            is_edited,
            created_at,
            updated_at,
            deleted_at,
            parent_id,
            profiles (email, first_name, last_name, avatar_url)
          `)
          .eq("id", payload.new.id)
          .single();

        if (fullMsg) {
          const prof = Array.isArray(fullMsg.profiles) ? fullMsg.profiles[0] : fullMsg.profiles;
          const mapped: ExtendedMessageEntity = {
            id: fullMsg.id,
            channelId: fullMsg.channel_id,
            conversationId: fullMsg.conversation_id,
            profileId: fullMsg.profile_id,
            content: fullMsg.content,
            isEdited: fullMsg.is_edited,
            createdAt: fullMsg.created_at,
            updatedAt: fullMsg.updated_at,
            deletedAt: fullMsg.deleted_at,
            parentId: fullMsg.parent_id,
            profile: prof ? {
              email: prof.email,
              firstName: prof.first_name,
              lastName: prof.last_name,
              avatarUrl: prof.avatar_url
            } : undefined,
            attachments: []
          };

          if (mapped.parentId) {
            // Update thread list if open
            setThreadReplies(prev => {
              if (mapped.parentId === threadParentRef.current?.id) {
                return [...prev.filter(m => m.id !== mapped.id), mapped];
              }
              return prev;
            });
          } else {
            // Regular chat message
            setMessages(prev => [...prev.filter(m => m.id !== mapped.id), mapped]);
            markReadAction({ conversationId, messageId: mapped.id });
          }
        }
        refreshWorkspaceDataRef.current();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const raw = payload.new as any;
        const updated: Partial<ExtendedMessageEntity> = {
          id: raw.id,
          channelId: raw.channel_id,
          conversationId: raw.conversation_id,
          profileId: raw.profile_id,
          content: raw.content,
          isEdited: raw.is_edited || false,
          createdAt: raw.created_at,
          updatedAt: raw.updated_at,
          deletedAt: raw.deleted_at || null,
          parentId: raw.parent_id || null
        };
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        setThreadReplies(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
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
      supabase.removeChannel(channel);
      if (stoppedTypingTimeoutRef.current) {
        clearTimeout(stoppedTypingTimeoutRef.current);
      }
    };
  }, [conversationId]);

  // Sync Online status using Supabase Presence
  useEffect(() => {
    if (!workspaceId || !user) return;

    const presenceChannel = supabase.channel(`presence:workspace:${workspaceId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>();
        Object.keys(state).forEach(key => {
          activeIds.add(key);
        });
        setOnlineUserIds(activeIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
            status: "online"
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [workspaceId, user]);

  // Scroll message stream automatically
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadReplies]);

  // Send message submit
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!inputText.trim() && !selectedFile) return;

    // Immediately notify we stopped typing
    if (isTypingRef.current && user) {
      isTypingRef.current = false;
      if (stoppedTypingTimeoutRef.current) clearTimeout(stoppedTypingTimeoutRef.current);
      const typingChannel = supabase.channel(`conversation-chat:${conversationId}`);
      typingChannel.send({
        type: "broadcast",
        event: "stopped_typing",
        payload: { userId: user.id }
      });
    }

    setIsSubmitting(true);

    // Fallback content if only sending file
    let content = inputText.trim();
    if (!content && selectedFile) {
      content = `📎 Attached: ${selectedFile.name}`;
    }

    setInputText("");

    try {
      const res = await sendMessageAction({
        conversationId,
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
      } else {
        toast.error(res.error || "Failed to deliver message.");
      }
    } catch {
      toast.error("Network communication failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard typing indicator status updates
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);

    // Detect mention trigger '@'
    const lastChar = text[text.length - 1];
    const match = text.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }

    if (!user || !conversationId) return;

    const typingChannel = supabase.channel(`conversation-chat:${conversationId}`);

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

  // Select a user mention
  const handleSelectMention = (profileName: string) => {
    if (mentionQuery === null) return;
    const textBefore = inputText.slice(0, inputText.lastIndexOf("@"));
    setInputText(`${textBefore}@${profileName} `);
    setMentionQuery(null);
  };

  // Filter mention autocomplete profiles list
  const filteredMentionProfiles = useMemo(() => {
    if (mentionQuery === null) return [];
    return members.filter(m => {
      const name = [m.profile.firstName, m.profile.lastName].filter(Boolean).join("").toLowerCase();
      const emailName = m.profile.email.split("@")[0].toLowerCase();
      return name.includes(mentionQuery.toLowerCase()) || emailName.includes(mentionQuery.toLowerCase());
    });
  }, [mentionQuery, members]);

  // Load thread replies inside drawer
  const handleOpenThread = async (msg: MessageEntity) => {
    setThreadParent(msg);
    setThreadLoading(true);
    try {
      const res = await fetchMessagesAction({ parentId: msg.id, limit: 100 });
      if (res.success && res.data) {
        setThreadReplies(res.data.list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setThreadLoading(false);
    }
  };

  // Send thread reply submit
  const handleSendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadInputText.trim() || threadSubmitting || !threadParent) return;

    setThreadSubmitting(true);
    try {
      const res = await createThreadReplyAction({
        parentId: threadParent.id,
        content: threadInputText.trim()
      });

      if (res.success && res.data) {
        setThreadReplies(prev => [...prev, res.data!]);
        setThreadInputText("");
      } else {
        toast.error(res.error || "Failed to send reply.");
      }
    } catch {
      toast.error("Network communication failure.");
    } finally {
      setThreadSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground mt-2">Loading conversation...</span>
      </div>
    );
  }

  // Determine other members profiles to display names
  const conversationName = (() => {
    if (!conversation) return "Direct Message";
    if (conversation.type === "group") return conversation.name || "Group Chat";
    
    // Find counterpart profile
    const otherMember = (conversation.members || []).find((m: any) => m.profileId !== user?.id);
    if (!otherMember) return "Direct Message";
    return [otherMember.firstName, otherMember.lastName].filter(Boolean).join(" ") || otherMember.email;
  })();

  const isGroup = conversation?.type === "group";
  const isOnline = !isGroup && (conversation?.members || []).some((m: any) => m.profileId !== user?.id && onlineUserIds.has(m.profileId));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] relative overflow-hidden select-none">
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background border-r border-border/30 h-full relative">
        
        {/* Conversation Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-card/10 select-none">
          <div className="flex items-center gap-2 truncate">
            {isGroup ? (
              <Users size={16} className="text-muted-foreground" />
            ) : (
              <div className="relative">
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center border border-border">
                  <User size={10} className="text-muted-foreground" />
                </div>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                )}
              </div>
            )}
            <span className="font-bold text-sm tracking-tight text-white/90 truncate">{conversationName}</span>
            {!isGroup && (
              <span className="text-[10px] font-semibold text-muted-foreground">
                ({isOnline ? "Online" : "Offline"})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSummarize}
              disabled={loadingSummary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-nova-purple-glow hover:bg-nova-purple-glow/20 text-nova-purple border border-nova-purple/20 text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              {loadingSummary ? <Loader2 size={13} className="animate-spin text-nova-purple" /> : <Sparkles size={13} />}
              <span>✨ Summarize</span>
            </button>
          </div>
        </div>

        {/* Message stream */}
        <div className="flex-1 flex flex-col min-h-0 relative select-text">
          {messagesLoading ? (
            <div className="flex-grow flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center py-20 text-center space-y-2 select-none">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
              <h3 className="font-bold text-xs text-white">This is the start of your message history</h3>
              <p className="text-[10px] text-muted-foreground">Send a message to kick off the conversation.</p>
            </div>
          ) : (
            <VirtualList
              items={messages}
              itemHeight={120}
              containerClassName="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin h-[calc(100vh-8.5rem)] pr-1"
              onScrollNearTop={hasMore && !loadingMore ? handleLoadMore : undefined}
              renderItem={(msg) => {
                const firstName = msg.profile?.firstName || "";
                const lastName = msg.profile?.lastName || "";
                const sender = [firstName, lastName].filter(Boolean).join(" ") || msg.profile?.email || "Someone";
                const initials = (firstName || sender)[0]?.toUpperCase() || "?";

                return (
                  <div key={msg.id} className="flex gap-4 group hover:bg-muted/5 p-2 mb-2 rounded-lg transition-colors relative">
                    
                    {/* Avatar icon */}
                    <Avatar className="h-9 w-9 border border-border/80 shrink-0">
                      {msg.profile?.avatarUrl && <AvatarImage src={msg.profile.avatarUrl} alt={sender} />}
                      <AvatarFallback className="bg-muted text-xs font-bold">{initials}</AvatarFallback>
                    </Avatar>

                    {/* Message body details */}
                    <div className="flex-1 space-y-1 text-left min-w-0">
                      <div className="flex items-center justify-between text-xs select-none">
                        <span className="font-bold text-white/95">{sender}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <RichText text={msg.content} />

                      {/* Attachments List */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-3 select-none">
                          {msg.attachments.map((att: any) => {
                            const isImage = att.mimeType?.startsWith("image/");
                            return (
                              <div key={att.id} className="relative group/att max-w-sm rounded-xl border border-white/10 bg-zinc-900/40 p-2 flex flex-col gap-2">
                                {isImage ? (
                                  <div className="relative rounded-lg overflow-hidden border border-white/5 h-48 w-48 bg-black">
                                    <Image 
                                      src={`/api/attachments/${att.id}/download`} 
                                      alt={att.fileName}
                                      fill
                                      sizes="(max-width: 768px) 100vw, 50vw"
                                      className="object-contain hover:scale-[1.01] transition-transform cursor-pointer"
                                      onClick={() => window.open(`/api/attachments/${att.id}/download`, "_blank")}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 bg-zinc-950/65 p-3 rounded-lg border border-white/5 min-w-[200px]">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0 select-none">
                                      <FileImage size={18} />
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1 text-left">
                                      <span className="text-xs font-bold truncate text-white">{att.fileName}</span>
                                      <span className="text-[9px] text-muted-foreground">
                                        {att.fileSize ? (att.fileSize / 1024).toFixed(1) + " KB" : "Unknown size"}
                                      </span>
                                    </div>
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

                      {/* Thread trigger preview */}
                      <div className="flex items-center gap-3 pt-1 select-none">
                        <button
                          onClick={() => handleOpenThread(msg)}
                          className="text-[10px] text-nova-purple font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare size={10} />
                          <span>Reply in thread</span>
                        </button>
                      </div>
                    </div>

                    {/* Reaction panel tool overlay */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-card border border-border rounded shadow-sm px-1 py-0.5 select-none transition-opacity">
                      <button
                        onClick={() => addReactionAction({ messageId: msg.id, emoji: "👍" })}
                        className="hover:bg-accent text-xs p-1 rounded"
                        title="React Thumbs Up"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => addReactionAction({ messageId: msg.id, emoji: "❤️" })}
                        className="hover:bg-accent text-xs p-1 rounded"
                        title="React Heart"
                      >
                        ❤️
                      </button>
                    </div>
                  </div>
                );
              }}
            />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator row */}
        {typingStatusText && (
          <div className="px-6 py-1 bg-muted/5 border-t border-border/10 text-[10px] italic text-muted-foreground flex items-center gap-1.5 shrink-0 select-none">
            <span className="animate-pulse bg-emerald-500 h-1.5 w-1.5 rounded-full" />
            <span>{typingStatusText}</span>
          </div>
        )}

        {/* Message Input Form */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-card/25 shrink-0 relative select-text">
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
              <Button type="button" variant="ghost" size="icon" onClick={() => { setSelectedFile(null); setFilePreview(null); }} className="h-6 w-6 text-muted-foreground hover:text-destructive p-0">
                <X size={12} />
              </Button>
            </div>
          )}

          {/* Mention Auto-complete overlay dropdown */}
          {mentionQuery !== null && filteredMentionProfiles.length > 0 && (
            <div className="absolute bottom-full left-4 bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 w-64 p-1 select-none">
              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider px-2 py-1.5 border-b border-border/40 mb-1">Mention Workspace Member</div>
              {filteredMentionProfiles.map((p, idx) => {
                const name = [p.profile.firstName, p.profile.lastName].filter(Boolean).join(" ") || p.profile.email;
                const matchName = [p.profile.firstName, p.profile.lastName].filter(Boolean).join("") || p.profile.email.split("@")[0];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectMention(matchName)}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-foreground hover:bg-accent rounded transition-colors flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarFallback className="text-[9px] font-bold">{name[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
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
              className="p-2.5 h-10 w-10 self-end border-white/10 bg-card/30 hover:bg-accent/40 rounded-lg shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer p-0"
            >
              <Paperclip size={15} />
            </Button>

            <textarea
              placeholder={`Send message to ${conversationName}... (Use @ to mention teammates)`}
              value={inputText}
              onChange={handleInputChange}
              rows={2}
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
              className="flex-1 bg-background border border-white/10 rounded-lg p-3 text-xs text-white outline-none focus:ring-1 focus:ring-ring resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rewriting || !inputText.trim()}
                  className="h-10 w-10 self-end border-white/10 bg-card/30 hover:bg-accent/40 rounded-lg shrink-0 flex items-center justify-center text-nova-purple hover:text-nova-purple-glow cursor-pointer p-0"
                >
                  {rewriting ? <Loader2 size={15} className="animate-spin text-nova-purple" /> : <Sparkles size={15} />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-white/10 bg-zinc-950 text-white">
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

            <Button
              type="submit"
              disabled={isSubmitting || (!inputText.trim() && !selectedFile)}
              className="h-10 px-4 self-end bg-white text-black hover:bg-neutral-200 cursor-pointer font-bold transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </Button>
          </div>
        </form>

      </div>

      {/* Slide Out Thread Reply Side Drawer */}
      {threadParent && (
        <div className="w-80 bg-card border-l border-border h-full flex flex-col shrink-0 relative animate-slide-in select-none">
          {/* Thread Header */}
          <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-muted/20">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Thread Replies</span>
            <button
              onClick={() => setThreadParent(null)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Thread messages replies list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin select-text">
            {/* Thread Parent Message view */}
            <div className="p-3 bg-muted/20 rounded-lg border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <strong className="text-white">
                  {[threadParent.profile?.firstName, threadParent.profile?.lastName].filter(Boolean).join(" ") || threadParent.profile?.email}
                </strong>
                <span className="text-[8px] text-muted-foreground">Parent Message</span>
              </div>
              <p className="text-xs text-zinc-300 leading-normal">{threadParent.content}</p>
            </div>

            {/* Replies List */}
            {threadLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : threadReplies.length === 0 ? (
              <div className="text-[10px] text-muted-foreground italic text-center py-10">No replies yet. Be the first to start the thread.</div>
            ) : (
              threadReplies.map(reply => (
                <div key={reply.id} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <strong className="text-white">
                      {[reply.profile?.firstName, reply.profile?.lastName].filter(Boolean).join(" ") || reply.profile?.email}
                    </strong>
                    <span>{new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-zinc-200 leading-relaxed pl-1 border-l border-border/40">{reply.content}</p>
                </div>
              ))
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Thread input form composer */}
          <form onSubmit={handleSendThreadReply} className="p-3 border-t border-border shrink-0 select-text bg-card/30">
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Reply..."
                value={threadInputText}
                onChange={(e) => setThreadInputText(e.target.value)}
                className="flex-1 bg-background border border-white/10 rounded px-2.5 py-1.5 text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={threadSubmitting || !threadInputText.trim()}
                className="px-3 py-1.5 rounded bg-white text-black text-xs font-bold hover:bg-neutral-200 disabled:opacity-50 cursor-pointer"
              >
                Send
              </button>
            </div>
          </form>

        </div>
      )}

    </div>
  );
}
