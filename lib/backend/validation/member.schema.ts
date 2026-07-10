import { z } from "zod";

export const updateMemberRoleSchema = z.object({
  workspaceId: z.string().uuid("Invalid Workspace ID"),
  profileId: z.string().min(1, "Profile ID is required"),
  role: z.enum(["owner", "admin", "manager", "member", "guest"], {
    message: "Invalid role. Must be one of: owner, admin, manager, member, guest",
  }),
});

export const removeMemberSchema = z.object({
  workspaceId: z.string().uuid("Invalid Workspace ID"),
  profileId: z.string().min(1, "Profile ID is required"),
});

export type UpdateMemberRoleDTO = z.infer<typeof updateMemberRoleSchema>;
export type RemoveMemberDTO = z.infer<typeof removeMemberSchema>;
