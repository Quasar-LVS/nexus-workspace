import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceService } from "../../lib/backend/services/workspace.service";
import { createDbAdminClient } from "../../lib/backend/database/client";
import { permissionService } from "../../lib/backend/services/permission.service";
import { ValidationError, ForbiddenError } from "../../lib/backend/errors/custom-errors";

// Mock dependencies using relative path matching the service
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

vi.mock("../../lib/backend/services/permission.service", () => ({
  permissionService: {
    assertWorkspaceMember: vi.fn(),
    assertRole: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn().mockResolvedValue({
    invitations: {
      createInvitation: vi.fn().mockResolvedValue({}),
    },
  }),
}));

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("WorkspaceService Unit Tests", () => {
  let workspaceService: WorkspaceService;
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    workspaceService = new WorkspaceService();

    mockAdminClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ data: [], error: null })
      ),
    };

    (createDbAdminClient as any).mockReturnValue(mockAdminClient);
  });

  describe("createWorkspace", () => {
    it("should fail validation if payload is invalid (e.g. empty slug)", async () => {
      await expect(
        workspaceService.createWorkspace("user_123", {
          name: "Test",
          slug: "", // invalid empty slug
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should successfully create workspace, assign owner, and seed general channel", async () => {
      // Mock profiles selection
      mockAdminClient.single
        .mockResolvedValueOnce({ data: { id: "user_123" }, error: null }) // Profile check
        .mockResolvedValueOnce({ data: { id: VALID_UUID, name: "Test Workspace", slug: "test-workspace" }, error: null })    // Workspace insert
        .mockResolvedValueOnce({ data: { id: VALID_UUID }, error: null })  // Channel insert
        .mockResolvedValueOnce({ data: { id: VALID_UUID }, error: null }); // Project insert

      const result = await workspaceService.createWorkspace("user_123", {
        name: "Test Workspace",
        slug: "test-workspace",
      });

      expect(result.id).toBe(VALID_UUID);
      expect(mockAdminClient.from).toHaveBeenCalledWith("workspaces");
      expect(mockAdminClient.from).toHaveBeenCalledWith("workspace_members");
      expect(mockAdminClient.from).toHaveBeenCalledWith("channels");
    });
  });

  describe("joinWorkspace", () => {
    it("should allow a member to join via valid code", async () => {
      // Mock query checking workspace invitations
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID,
          workspace_id: VALID_UUID,
          email: "test@example.com",
          role: "member",
          status: "pending",
          workspaces: {
            id: VALID_UUID,
            name: "Test Workspace",
            slug: "test-workspace",
          },
        },
        error: null,
      });

      // Mock profile check
      mockAdminClient.single.mockResolvedValueOnce({ data: { id: "user_123" }, error: null });

      const result = await workspaceService.joinWorkspace("user_123", {
        token: "INVITE_TOKEN_123",
      });

      expect(result.workspaceId).toBe(VALID_UUID);
      expect(result.workspaceName).toBe("Test Workspace");
    });
  });

  describe("inviteMember", () => {
    it("should successfully save invitation token and trigger Clerk email dispatch", async () => {
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID,
          workspace_id: VALID_UUID,
          email: "new_invitee@example.com",
          role: "member",
        },
        error: null,
      });

      const result = await workspaceService.inviteMember("user_123", {
        workspaceId: VALID_UUID,
        email: "new_invitee@example.com",
        role: "member",
      });

      expect(result.inviteId).toBe(VALID_UUID);
      expect(result.token).toBeDefined();
      expect(mockAdminClient.from).toHaveBeenCalledWith("workspace_invitations");
    });
  });
});
