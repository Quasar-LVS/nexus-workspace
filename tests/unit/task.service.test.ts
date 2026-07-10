import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskService } from "../../lib/backend/services/task.service";
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
  },
}));

const VALID_UUID_PROJECT = "123e4567-e89b-12d3-a456-426614174001";
const VALID_UUID_WORKSPACE = "123e4567-e89b-12d3-a456-426614174002";
const VALID_UUID_TASK = "123e4567-e89b-12d3-a456-426614174003";

describe("TaskService Unit Tests", () => {
  let taskService: TaskService;
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    taskService = new TaskService();

    mockAdminClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    (createDbAdminClient as any).mockReturnValue(mockAdminClient);
  });

  describe("createTask", () => {
    it("should allow a member to create a task in a project", async () => {
      // Mock project metadata check
      mockAdminClient.single.mockResolvedValueOnce({
        data: { workspace_id: VALID_UUID_WORKSPACE, name: "Onboarding" },
        error: null,
      });

      // Mock member permissions check (not guest)
      (permissionService.assertWorkspaceMember as any).mockResolvedValueOnce("member");

      // Mock task insertion
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID_TASK,
          project_id: VALID_UUID_PROJECT,
          workspace_id: VALID_UUID_WORKSPACE,
          title: "Setup Vitest tests",
          status: "todo",
          priority: "high",
          reporter_id: "user_123",
          assignee_id: null,
        },
        error: null,
      });

      // Mock logActivity
      mockAdminClient.then = vi.fn().mockImplementation((resolve) =>
        resolve({ data: {}, error: null })
      );

      const result = await taskService.createTask("user_123", {
        title: "Setup Vitest tests",
        projectId: VALID_UUID_PROJECT,
        status: "todo",
        priority: "high",
      });

      expect(result.id).toBe(VALID_UUID_TASK);
      expect(result.title).toBe("Setup Vitest tests");
      expect(permissionService.assertWorkspaceMember).toHaveBeenCalledWith("user_123", VALID_UUID_WORKSPACE);
    });

    it("should throw ForbiddenError if guest attempts to create task", async () => {
      mockAdminClient.single.mockResolvedValueOnce({
        data: { workspace_id: VALID_UUID_WORKSPACE, name: "Onboarding" },
        error: null,
      });

      (permissionService.assertWorkspaceMember as any).mockResolvedValueOnce("guest");

      await expect(
        taskService.createTask("user_123", {
          title: "Setup Vitest tests",
          projectId: VALID_UUID_PROJECT,
          priority: "medium",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateTask", () => {
    it("should allow task assignee to update task fields", async () => {
      // 1. Mock existing task fetch
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID_TASK,
          workspace_id: VALID_UUID_WORKSPACE,
          assignee_id: "user_123",
          reporter_id: "user_other",
          title: "Vitest setup",
          status: "todo",
        },
        error: null,
      });

      // 2. Mock workspace membership check
      (permissionService.assertWorkspaceMember as any).mockResolvedValueOnce("member");

      // 3. Mock update query execution
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID_TASK,
          title: "Vitest setup (Updated)",
          status: "in-progress",
        },
        error: null,
      });

      // Mock logActivity
      mockAdminClient.then = vi.fn().mockImplementation((resolve) =>
        resolve({ data: {}, error: null })
      );

      const result = await taskService.updateTask("user_123", VALID_UUID_TASK, {
        title: "Vitest setup (Updated)",
        status: "in-progress",
      });

      expect(result.title).toBe("Vitest setup (Updated)");
      expect(result.status).toBe("in-progress");
    });

    it("should reject updates if member is neither assignee nor reporter", async () => {
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: VALID_UUID_TASK,
          workspace_id: VALID_UUID_WORKSPACE,
          assignee_id: "user_other",
          reporter_id: "user_other",
        },
        error: null,
      });

      (permissionService.assertWorkspaceMember as any).mockResolvedValueOnce("member");

      await expect(
        taskService.updateTask("user_123", VALID_UUID_TASK, {
          title: "Updated Title",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
