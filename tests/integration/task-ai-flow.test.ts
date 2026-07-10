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

const VALID_UUID_WORKSPACE = "123e4567-e89b-12d3-a456-426614174001";
const VALID_UUID_PROJECT = "123e4567-e89b-12d3-a456-426614174002";
const VALID_UUID_COLUMN = "123e4567-e89b-12d3-a456-426614174003";

describe("Task AI Flow Integration Tests", () => {
  let aiService: AiService;
  let mockAdminClient: any;
  let mockProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    aiService = new AiService();

    // Table-specific query mocks to prevent sequence dependency issues
    const mockActivityLogsQuery = {
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
    };

    const mockWorkspaceQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ai_provider: "gemini" }, error: null }),
    };

    const mockColumnsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ data: [{ id: VALID_UUID_COLUMN, name: "Todo" }], error: null })
      ),
    };

    const mockTasksQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "task_generated_123",
          title: "Deploy Vitest runner",
          project_id: VALID_UUID_PROJECT,
          column_id: VALID_UUID_COLUMN,
        },
        error: null,
      }),
    };

    mockAdminClient = {
      from: vi.fn().mockImplementation((table) => {
        if (table === "activity_logs") return mockActivityLogsQuery;
        if (table === "workspaces") return mockWorkspaceQuery;
        if (table === "project_columns") return mockColumnsQuery;
        if (table === "tasks") return mockTasksQuery;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    mockProvider = {
      generateResponse: vi.fn().mockResolvedValue(
        JSON.stringify({
          tasks: [
            {
              title: "Deploy Vitest runner",
              description: "Setup test configuration in CI/CD pipeline",
              priority: "high",
              due_in_days: 2,
            },
          ],
        })
      ),
    };

    (createDbAdminClient as any).mockReturnValue(mockAdminClient);
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);
  });

  it("should integrate project board columns retrieval and AI task card insertion", async () => {
    const result = await aiService.generateTasks(
      VALID_UUID_WORKSPACE,
      VALID_UUID_PROJECT,
      "Setup tests for deployment"
    );

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("task_generated_123");
    expect(mockAdminClient.from).toHaveBeenCalledWith("project_columns");
    expect(mockAdminClient.from).toHaveBeenCalledWith("tasks");
  });
});
