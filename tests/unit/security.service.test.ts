import { describe, it, expect, vi, beforeEach } from "vitest";
import { SecurityService } from "../../lib/backend/services/security.service";
import { createDbAdminClient } from "../../lib/backend/database/client";

// Mock dependencies using relative path matching the service
vi.mock("../../lib/backend/database/client", () => ({
  createDbAdminClient: vi.fn(),
  createDbServerClient: vi.fn(),
}));

describe("SecurityService Unit Tests", () => {
  let securityService: SecurityService;
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    securityService = new SecurityService();

    mockAdminClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({ data: [], count: 0, error: null })
      ),
    };

    (createDbAdminClient as any).mockReturnValue(mockAdminClient);
  });

  describe("getAuditLogs", () => {
    it("should fetch paginated audit logs successfully with filters", async () => {
      mockAdminClient.range.mockResolvedValueOnce({
        data: [{ id: "log_1", action: "workspace.create", created_at: "2026-07-09" }],
        count: 1,
        error: null,
      });

      const result = await securityService.getAuditLogs("ws_456", 1, 10, {
        action: "workspace.create",
      });

      expect(result.logs.length).toBe(1);
      expect(result.total).toBe(1);
      expect(mockAdminClient.eq).toHaveBeenCalledWith("action", "workspace.create");
    });
  });

  describe("getSecurityMetrics", () => {
    it("should calculate security KPIs", async () => {
      // Mock different metrics queries
      mockAdminClient.then = vi.fn()
        .mockImplementationOnce((resolve) => resolve({ data: [{ actor_id: "user_1" }], error: null })) // Online users
        .mockImplementationOnce((resolve) => resolve({ count: 10, error: null })) // Active members count
        .mockImplementationOnce((resolve) => resolve({ count: 50, error: null })) // AI requests
        .mockImplementationOnce((resolve) => resolve({ count: 5, error: null })) // Uploads
        .mockImplementationOnce((resolve) => resolve({ count: 2, error: null })) // Invitations
        .mockImplementationOnce((resolve) => resolve({ count: 0, error: null })) // Failed auths
        .mockImplementationOnce((resolve) => resolve({ count: 1, error: null })) // Role changes
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })); // Recent signins

      const result = await securityService.getSecurityMetrics("ws_456");

      expect(result).toBeDefined();
      expect(result.metrics.onlineCount).toBe(1);
      expect(result.metrics.failedAuths).toBe(0);
      expect(result.risk.score).toBeLessThanOrEqual(100);
    });
  });
});
