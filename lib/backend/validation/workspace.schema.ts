import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(100, "Workspace name is too long"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50, "Slug is too long")
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and hyphens"),
  companySize: z.string().optional(),
  industry: z.string().optional(),
  timezone: z.string().optional(),
});

export const inviteMemberSchema = z.object({
  workspaceId: z.string().uuid("Invalid Workspace ID"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "guest"]).default("member"),
});

export const joinWorkspaceSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
});

export type CreateWorkspaceDTO = z.infer<typeof createWorkspaceSchema>;
export type InviteMemberDTO = z.infer<typeof inviteMemberSchema>;
export type JoinWorkspaceDTO = z.infer<typeof joinWorkspaceSchema>;
