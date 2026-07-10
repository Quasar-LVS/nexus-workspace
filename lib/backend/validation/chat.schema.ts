import { z } from "zod";

export const sendMessageSchema = z.object({
  channelId: z.string().uuid("Channel ID must be a valid UUID").optional().nullable(),
  conversationId: z.string().uuid("Conversation ID must be a valid UUID").optional().nullable(),
  content: z.string().min(1, "Message content cannot be empty").max(4000, "Message length exceeds limit"),
  parentId: z.string().uuid().optional().nullable(),
});

export const editMessageSchema = z.object({
  messageId: z.string().uuid("Message ID must be a valid UUID"),
  content: z.string().min(1, "Message content cannot be empty").max(4000, "Message length exceeds limit"),
});

export const deleteMessageSchema = z.object({
  messageId: z.string().uuid("Message ID must be a valid UUID"),
});

export const fetchMessagesSchema = z.object({
  channelId: z.string().uuid("Channel ID must be a valid UUID").optional().nullable(),
  conversationId: z.string().uuid("Conversation ID must be a valid UUID").optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  cursor: z.string().datetime().optional().nullable(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const markReadSchema = z.object({
  channelId: z.string().uuid("Channel ID must be a valid UUID").optional().nullable(),
  conversationId: z.string().uuid("Conversation ID must be a valid UUID").optional().nullable(),
  messageId: z.string().uuid("Message ID must be a valid UUID").optional().nullable(),
});

export const createChannelSchema = z.object({
  workspaceId: z.string().uuid("Workspace ID must be a valid UUID"),
  name: z
    .string()
    .min(1, "Channel name is required")
    .max(80, "Channel name is too long")
    .regex(/^[a-z0-9_-]+$/, "Channel name must only contain lowercase letters, numbers, hyphens or underscores"),
  description: z.string().max(250, "Description exceeds limit").optional(),
  isPrivate: z.boolean().default(false),
  categoryId: z.string().uuid("Category ID must be a valid UUID").optional().nullable(),
});

export const updateChannelSchema = z.object({
  channelId: z.string().uuid("Channel ID must be a valid UUID"),
  name: z
    .string()
    .min(1, "Channel name is required")
    .max(80, "Channel name is too long")
    .regex(/^[a-z0-9_-]+$/, "Channel name must only contain lowercase letters, numbers, hyphens or underscores")
    .optional(),
  description: z.string().max(250, "Description exceeds limit").optional(),
  isPrivate: z.boolean().optional(),
  categoryId: z.string().uuid("Category ID must be a valid UUID").optional().nullable(),
});

export const channelActionSchema = z.object({
  channelId: z.string().uuid("Channel ID must be a valid UUID"),
});

export type SendMessageDTO = z.infer<typeof sendMessageSchema>;
export type EditMessageDTO = z.infer<typeof editMessageSchema>;
export type DeleteMessageDTO = z.infer<typeof deleteMessageSchema>;
export type FetchMessagesDTO = z.infer<typeof fetchMessagesSchema>;
export type MarkReadDTO = z.infer<typeof markReadSchema>;
export type CreateChannelDTO = z.infer<typeof createChannelSchema>;
export type UpdateChannelDTO = z.infer<typeof updateChannelSchema>;
export type ChannelActionDTO = z.infer<typeof channelActionSchema>;
