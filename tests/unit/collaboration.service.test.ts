import { describe, it, expect, vi, beforeEach } from "vitest";
import { CollaborationService } from "../../lib/backend/services/collaboration.service";
import { createDbServerClient } from "../../lib/backend/database/client";
import { ValidationError, NotFoundError } from "../../lib/backend/errors/custom-errors";

// Mock dependencies using relative path matching the service
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

const VALID_UUID_PARENT = "123e4567-e89b-12d3-a456-426614174001";
const VALID_UUID_REPLY = "123e4567-e89b-12d3-a456-426614174002";
const VALID_UUID_CHANNEL = "123e4567-e89b-12d3-a456-426614174003";
const VALID_UUID_WORKSPACE = "123e4567-e89b-12d3-a456-426614174004";

describe("CollaborationService Unit Tests", () => {
  let collaborationService: CollaborationService;
  let mockServerClient: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    vi.clearAllMocks();
    collaborationService = new CollaborationService();

    mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ data: [], error: null })
      ),
    };

    mockServerClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    };

    (createDbServerClient as any).mockResolvedValue(mockServerClient);
  });

  describe("createThreadReply", () => {
    it("should successfully save thread reply and create notification for parent message author", async () => {
      // 1. Mock parent message check
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: {
          content: "Original Message",
          channel_id: VALID_UUID_CHANNEL,
          profile_id: "user_author",
          channels: { workspace_id: VALID_UUID_WORKSPACE },
        },
        error: null,
      });

      // 2. Mock thread reply insert
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID_REPLY,
          channel_id: VALID_UUID_CHANNEL,
          profile_id: "user_replier",
          content: "Thread reply content",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          profiles: {
            email: "replier@example.com",
            first_name: "John",
            last_name: "Doe",
            avatar_url: null,
          },
        },
        error: null,
      });

      const result = await collaborationService.createThreadReply("user_replier", {
        parentId: VALID_UUID_PARENT,
        content: "Thread reply content",
      });

      expect(result.id).toBe(VALID_UUID_REPLY);
      expect(mockServerClient.from).toHaveBeenCalledWith("messages");
      expect(mockServerClient.from).toHaveBeenCalledWith("notifications");
    });
  });

  describe("saveMessage", () => {
    it("should bookmark message", async () => {
      // 1. Mock parent message check to verify message exists
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: VALID_UUID_PARENT, channel_id: VALID_UUID_CHANNEL, channels: { workspace_id: VALID_UUID_WORKSPACE } },
        error: null,
      });

      await expect(
        collaborationService.saveMessage("user_123", {
          messageId: VALID_UUID_PARENT,
        })
      ).resolves.not.toThrow();
    });
  });
});
