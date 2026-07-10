import { z } from "zod";

export const threadReplySchema = z.object({
  parentId: z.string().uuid("Parent Message ID must be a valid UUID"),
  content: z.string().min(1, "Reply content cannot be empty").max(4000, "Reply content is too long"),
});

export const reactionSchema = z.object({
  messageId: z.string().uuid("Message ID must be a valid UUID"),
  emoji: z.string().min(1, "Emoji character is required").max(10, "Emoji code is too long"),
});

export const pinMessageSchema = z.object({
  channelId: z.string().uuid("Channel ID must be a valid UUID"),
  messageId: z.string().uuid("Message ID must be a valid UUID"),
});

export const saveMessageSchema = z.object({
  messageId: z.string().uuid("Message ID must be a valid UUID"),
});

export const globalSearchSchema = z.object({
  workspaceId: z.string().uuid("Workspace ID must be a valid UUID"),
  query: z.string().min(1, "Search query cannot be empty").max(100, "Query is too long"),
});

export type ThreadReplyDTO = z.infer<typeof threadReplySchema>;
export type ReactionDTO = z.infer<typeof reactionSchema>;
export type PinMessageDTO = z.infer<typeof pinMessageSchema>;
export type SaveMessageDTO = z.infer<typeof saveMessageSchema>;
export type GlobalSearchDTO = z.infer<typeof globalSearchSchema>;
