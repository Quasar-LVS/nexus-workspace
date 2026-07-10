import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageService } from "../../lib/backend/services/message.service";
import { createDbServerClient } from "../../lib/backend/database/client";
import { ValidationError, NotFoundError, ForbiddenError } from "../../lib/backend/errors/custom-errors";

// Mock dependencies using relative path matching the service
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

const VALID_UUID_1 = "123e4567-e89b-12d3-a456-426614174000";
const VALID_UUID_2 = "123e4567-e89b-12d3-a456-426614174001";
const VALID_UUID_3 = "123e4567-e89b-12d3-a456-426614174002";

describe("MessageService Unit Tests", () => {
  let messageService: MessageService;
  let mockServerClient: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    vi.clearAllMocks();
    messageService = new MessageService();

    // Query builder is thenable and handles filtering/chaining
    mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ data: [], error: null })
      ),
    };

    // Client is NOT thenable, preventing promise unwrapping issues on createDbServerClient
    mockServerClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    };

    (createDbServerClient as any).mockResolvedValue(mockServerClient);
  });

  describe("sendMessage", () => {
    it("should send message to a valid channel", async () => {
      // 1. Mock channel details check
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { workspace_id: VALID_UUID_2, is_archived: false },
        error: null,
      });

      // 2. Mock message insertion result
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID_3,
          channel_id: VALID_UUID_1,
          profile_id: "user_123",
          content: "Hello World",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
        },
        error: null,
      });

      const result = await messageService.sendMessage("user_123", {
        content: "Hello World",
        channelId: VALID_UUID_1,
      });

      expect(result.id).toBe(VALID_UUID_3);
      expect(result.content).toBe("Hello World");
    });

    it("should fail if channel is archived", async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { workspace_id: VALID_UUID_2, is_archived: true },
        error: null,
      });

      await expect(
        messageService.sendMessage("user_123", {
          content: "Hello",
          channelId: VALID_UUID_1,
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
