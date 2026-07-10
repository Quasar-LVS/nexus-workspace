import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsService } from "../../lib/backend/services/analytics.service";
import { createDbAdminClient } from "../../lib/backend/database/client";

// Mock dependencies using relative path matching the service
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

describe("AnalyticsService Unit Tests", () => {
  let analyticsService: AnalyticsService;
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsService = new AnalyticsService();

    mockAdminClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ count: 10, data: [], error: null })
      ),
    };

    (createDbAdminClient as any).mockReturnValue(mockAdminClient);
  });

  describe("getWorkspaceAnalytics", () => {
    it("should fetch workspace metrics and perform analytics calculations", async () => {
      // Setup overrides for queries running in Promise.all
      mockAdminClient.then = vi.fn()
        .mockImplementationOnce((resolve) => resolve({ count: 5, error: null })) // totalMembers
        .mockImplementationOnce((resolve) => resolve({ data: [{ actor_id: "user_1" }, { actor_id: "user_2" }], error: null })) // activeActorsRes
        .mockImplementationOnce((resolve) => resolve({ count: 3, error: null })) // channelsRes
        .mockImplementationOnce((resolve) => resolve({ count: 2, error: null })) // projectsRes
        .mockImplementationOnce((resolve) => resolve({ count: 10, error: null })) // tasksRes
        .mockImplementationOnce((resolve) => resolve({ count: 4, error: null })) // completedTasksRes
        .mockImplementationOnce((resolve) => resolve({ count: 6, error: null })) // pendingTasksRes
        .mockImplementationOnce((resolve) => resolve({ count: 100, error: null })) // messagesRes
        .mockImplementationOnce((resolve) => resolve({ count: 15, error: null })) // aiRequestsRes
        .mockImplementationOnce((resolve) => resolve({ data: [{ file_size: 1024 * 1024 }], error: null })) // filesRes
        .mockImplementationOnce((resolve) => resolve({ count: 1, error: null })); // invitationsRes

      const result = await analyticsService.getWorkspaceAnalytics("ws_456", "7d");

      expect(result).toBeDefined();
      expect(result.kpis.totalMembers).toBe(5);
      expect(result.kpis.activeMembersToday).toBe(2);
      expect(result.kpis.messagesSent).toBe(100);
      expect(result.health.taskCompletionRate).toBe(40); // 4 completed out of 10 tasks = 40%
    });
  });
});
