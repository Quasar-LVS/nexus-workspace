import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiService } from "../../lib/ai/ai.service";
import { createDbAdminClient } from "../../lib/backend/database/client";
import { ProviderFactory } from "../../lib/ai/provider-factory";

// Mock dependencies using relative path matching the service
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

vi.mock("../../lib/ai/provider-factory", () => ({
  ProviderFactory: {
    getProvider: vi.fn(),
  },
}));

describe("AiService Unit Tests", () => {
  let aiService: AiService;
  let mockAdminClient: any;
  let mockProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    aiService = new AiService();

    mockAdminClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ data: [], error: null })
      ),
    };

    mockProvider = {
      generateStream: vi.fn().mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue("AI stream chunk response");
            controller.close();
          },
        })
      ),
    };

    (createDbAdminClient as any).mockReturnValue(mockAdminClient);
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);
  });

  describe("chat", () => {
    it("should route general query to active workspace AI provider and return stream", async () => {
      // 1. Mock workspace config (active provider name)
      mockAdminClient.single.mockResolvedValueOnce({
        data: { ai_provider: "gemini" },
        error: null,
      });

      // 2. Mock workspace context calls
      mockAdminClient.then = vi.fn().mockImplementation((resolve) =>
        resolve({ data: [], error: null })
      );

      const resultStream = await aiService.chat(
        "ws_456",
        "Hello Nova, how is my day?",
        "user_123"
      );

      expect(resultStream).toBeInstanceOf(ReadableStream);
      expect(ProviderFactory.getProvider).toHaveBeenCalledWith("gemini");
    });
  });
});
