import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageService } from "../../lib/backend/services/message.service";
import { createDbServerClient } from "../../lib/backend/database/client";

// Mock dependencies using relative path
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

const VALID_UUID_WORKSPACE = "123e4567-e89b-12d3-a456-426614174001";
const VALID_UUID_CHANNEL = "123e4567-e89b-12d3-a456-426614174002";
const VALID_UUID_MESSAGE = "123e4567-e89b-12d3-a456-426614174003";

describe("Channel Flow Integration Tests", () => {
  let messageService: MessageService;
  let mockServerClient: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    vi.clearAllMocks();
    messageService = new MessageService();

    mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
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

  it("should integrate channel details fetch and message delivery", async () => {
    // 1. Mock channel details check returns a valid, non-archived channel
    mockQueryBuilder.single.mockResolvedValueOnce({
      data: { workspace_id: VALID_UUID_WORKSPACE, is_archived: false },
      error: null,
    });

    // 2. Mock message insert returns the stored message record
    mockQueryBuilder.single.mockResolvedValueOnce({
      data: {
        id: VALID_UUID_MESSAGE,
        channel_id: VALID_UUID_CHANNEL,
        profile_id: "user_123",
        content: "Integration Test Message",
        is_edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      error: null,
    });

    // Run the service integration flow
    const message = await messageService.sendMessage("user_123", {
      channelId: VALID_UUID_CHANNEL,
      content: "Integration Test Message",
    });

    expect(message).toBeDefined();
    expect(message.id).toBe(VALID_UUID_MESSAGE);
    expect(message.content).toBe("Integration Test Message");
    expect(mockServerClient.from).toHaveBeenCalledWith("channels");
    expect(mockServerClient.from).toHaveBeenCalledWith("messages");
  });
});
