import { createDbAdminClient } from "../database/client";
import { createTaskSchema, updateTaskSchema, CreateTaskDTO, UpdateTaskDTO } from "../validation/task.schema";
import { permissionService } from "./permission.service";
import { ValidationError, DatabaseError, NotFoundError, ForbiddenError } from "../errors/custom-errors";
import { logger } from "../utils/logger";
import { Task, TaskComment, TaskAttachment, TaskLabel } from "@/types";

export class TaskService {
  /**
   * Helper: Logs activities within the database
   */
  private async logActivity(
    client: ReturnType<typeof createDbAdminClient>,
    workspaceId: string,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const { error } = await client
      .from("activity_logs")
      .insert({
        workspace_id: workspaceId,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata: metadata || {},
      });

    if (error) {
      logger.warn(`Failed to insert activity log for action: ${action}`, { error: error.message });
    }
  }

  /**
   * Maps a database row to the Task interface.
   */
  private mapRow(row: any, labels?: TaskLabel[]): Task {
    return {
      id: row.id,
      projectId: row.project_id,
      workspaceId: row.workspace_id,
      columnId: row.column_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assignee_id,
      reporterId: row.reporter_id,
      dueDateTime: row.due_date_time,
      dueDate: row.due_date,
      estimatedHours: row.estimated_hours ? Number(row.estimated_hours) : undefined,
      position: row.position || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      labels: labels || [],
    };
  }

  /**
   * Asserts task edit permissions based on user role:
   * - Guests: Read-only (Forbidden)
   * - Members: Can edit if they are assignee or reporter
   * - Owner/Admin/Manager: Can edit any task
   */
  private async assertTaskWritePermission(
    userId: string,
    workspaceId: string,
    taskAssigneeId?: string | null,
    taskReporterId?: string | null
  ): Promise<void> {
    const role = await permissionService.assertWorkspaceMember(userId, workspaceId);

    if (role === "guest") {
      throw new ForbiddenError("Guests have read-only access to tasks.");
    }

    if (role === "member") {
      const isAssignee = taskAssigneeId && taskAssigneeId === userId;
      const isReporter = taskReporterId && taskReporterId === userId;
      if (!isAssignee && !isReporter) {
        throw new ForbiddenError("Members can only edit tasks assigned to them or created by them.");
      }
    }
  }

  /**
   * Fetches labels mapped to tasks
   */
  private async fetchLabelsForTasks(
    client: ReturnType<typeof createDbAdminClient>,
    taskIds: string[]
  ): Promise<Record<string, TaskLabel[]>> {
    if (taskIds.length === 0) return {};

    const { data, error } = await client
      .from("task_label_mapping")
      .select(`
        task_id,
        task_labels (
          id,
          workspace_id,
          name,
          color
        )
      `)
      .in("task_id", taskIds);

    if (error || !data) return {};

    const mapping: Record<string, TaskLabel[]> = {};
    data.forEach((row: any) => {
      const taskId = row.task_id;
      const label = row.task_labels;
      if (label) {
        if (!mapping[taskId]) mapping[taskId] = [];
        mapping[taskId].push({
          id: label.id,
          workspaceId: label.workspace_id,
          name: label.name,
          color: label.color,
        });
      }
    });

    return mapping;
  }

  /**
   * Lists all tasks for a project, including labels.
   */
  async listProjectTasks(userId: string, projectId: string): Promise<Task[]> {
    const context = { userId, projectId, action: "listProjectTasks" };
    logger.info("BLL: Listing project tasks", context);

    const client = createDbAdminClient();

    const { data: project, error: projError } = await client
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .single();

    if (projError || !project) {
      throw new NotFoundError("Project not found.");
    }

    await permissionService.assertWorkspaceMember(userId, project.workspace_id);

    const { data, error } = await client
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("Failed to fetch project tasks", error as unknown as Error, context);
      throw new DatabaseError("Error fetching tasks.", error);
    }

    const taskIds = (data ?? []).map((t) => t.id);
    const labelMapping = await this.fetchLabelsForTasks(client, taskIds);

    return (data ?? []).map((row) => this.mapRow(row, labelMapping[row.id]));
  }

  /**
   * Lists all tasks for a workspace across all projects.
   */
  async listWorkspaceTasks(userId: string, workspaceId: string): Promise<Task[]> {
    const context = { userId, workspaceId, action: "listWorkspaceTasks" };
    logger.info("BLL: Listing workspace tasks", context);

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const client = createDbAdminClient();
    const { data, error } = await client
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });

    if (error) {
      logger.error("Failed to fetch workspace tasks", error as unknown as Error, context);
      throw new DatabaseError("Error fetching workspace tasks.", error);
    }

    const taskIds = (data ?? []).map((t) => t.id);
    const labelMapping = await this.fetchLabelsForTasks(client, taskIds);

    return (data ?? []).map((row) => this.mapRow(row, labelMapping[row.id]));
  }

  /**
   * Creates a new task.
   */
  async createTask(userId: string, payload: CreateTaskDTO): Promise<Task> {
    const context = { userId, projectId: payload.projectId, action: "createTask" };
    logger.info(`BLL: Creating task "${payload.title}"`, context);

    const validation = createTaskSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid task parameters.", validation.error.format());
    }

    const client = createDbAdminClient();

    const { data: project, error: projError } = await client
      .from("projects")
      .select("workspace_id, name")
      .eq("id", payload.projectId)
      .single();

    if (projError || !project) {
      throw new NotFoundError("Project not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, project.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot create tasks.");
    }

    const { data, error } = await client
      .from("tasks")
      .insert({
        project_id: payload.projectId,
        workspace_id: project.workspace_id,
        column_id: payload.columnId || null,
        title: payload.title,
        description: payload.description || null,
        status: payload.status || "todo",
        priority: payload.priority || "medium",
        assignee_id: payload.assigneeId || null,
        reporter_id: payload.reporterId || userId,
        due_date: payload.dueDate || null,
        due_date_time: payload.dueDateTime || null,
        estimated_hours: payload.estimatedHours || null,
        position: payload.position || 0,
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to create task", error as unknown as Error, context);
      throw new DatabaseError("Error creating task.", error);
    }

    // Log Activity
    await this.logActivity(client, project.workspace_id, userId, "task.create", "task", data.id, {
      title: payload.title,
      projectName: project.name,
    });

    if (payload.assigneeId && payload.assigneeId !== userId) {
      const { collaborationService } = await import("./collaboration.service");
      await collaborationService.createNotification(
        project.workspace_id,
        payload.assigneeId,
        "task_assignment",
        "Task Assigned",
        `You were assigned to: "${data.title}"`,
        `/workspace/${project.workspace_id}/project/${payload.projectId}`,
        "task",
        data.id
      );
    }

    return this.mapRow(data);
  }

  /**
   * Updates an existing task's fields. Evaluates role-based write permissions.
   */
  async updateTask(userId: string, taskId: string, payload: UpdateTaskDTO): Promise<Task> {
    const context = { userId, taskId, action: "updateTask" };
    logger.info(`BLL: Updating task ${taskId}`, context);

    const validation = updateTaskSchema.safeParse(payload);
    if (!validation.success) {
      throw new ValidationError("Invalid update properties.", validation.error.format());
    }

    const client = createDbAdminClient();

    const { data: existing, error: fetchError } = await client
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError("Task not found.");
    }

    // Verify task update privileges
    await this.assertTaskWritePermission(userId, existing.workspace_id, existing.assignee_id, existing.reporter_id);

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.title !== undefined) updateData.title = payload.title;
    if (payload.description !== undefined) updateData.description = payload.description;
    if (payload.columnId !== undefined) updateData.column_id = payload.columnId;
    if (payload.reporterId !== undefined) updateData.reporter_id = payload.reporterId;
    if (payload.dueDate !== undefined) updateData.due_date = payload.dueDate;
    if (payload.estimatedHours !== undefined) updateData.estimated_hours = payload.estimatedHours;
    if (payload.position !== undefined) updateData.position = payload.position;

    if (payload.status !== undefined) {
      updateData.status = payload.status;
      if (payload.status === "done") {
        updateData.completed_at = new Date().toISOString();
      } else if (existing.status === "done") {
        updateData.completed_at = null;
      }
    }
    if (payload.priority !== undefined) updateData.priority = payload.priority;
    if (payload.assigneeId !== undefined) updateData.assignee_id = payload.assigneeId;
    if (payload.dueDateTime !== undefined) updateData.due_date_time = payload.dueDateTime;

    const { data, error } = await client
      .from("tasks")
      .update(updateData)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      logger.error("Failed to update task", error as unknown as Error, context);
      throw new DatabaseError("Error updating task.", error);
    }

    // Log detailed task updates activity log
    if (payload.status !== undefined && payload.status !== existing.status) {
      await this.logActivity(client, existing.workspace_id, userId, "task.move", "task", taskId, {
        title: existing.title,
        fromStatus: existing.status,
        toStatus: payload.status,
      });
    }
    if (payload.priority !== undefined && payload.priority !== existing.priority) {
      await this.logActivity(client, existing.workspace_id, userId, "task.priority", "task", taskId, {
        title: existing.title,
        fromPriority: existing.priority,
        toPriority: payload.priority,
      });
    }
    if (payload.assigneeId !== undefined && payload.assigneeId !== existing.assignee_id) {
      await this.logActivity(client, existing.workspace_id, userId, "task.assign", "task", taskId, {
        title: existing.title,
        assigneeId: payload.assigneeId,
      });

      if (payload.assigneeId && payload.assigneeId !== userId) {
        const type = existing.assignee_id ? "task_reassignment" : "task_assignment";
        const title = existing.assignee_id ? "Task Reassigned" : "Task Assigned";
        const content = existing.assignee_id
          ? `You were reassigned to: "${existing.title}"`
          : `You were assigned to: "${existing.title}"`;
        
        const { collaborationService } = await import("./collaboration.service");
        await collaborationService.createNotification(
          existing.workspace_id,
          payload.assigneeId,
          type,
          title,
          content,
          `/workspace/${existing.workspace_id}/project/${existing.project_id || "tasks"}`,
          "task",
          taskId
        );
      }
    }
    if (payload.status === "done" && existing.status !== "done") {
      await this.logActivity(client, existing.workspace_id, userId, "task.complete", "task", taskId, {
        title: existing.title,
      });
    }

    return this.mapRow(data);
  }

  /**
   * Deletes a task. Only owners/admins/managers or the reporter can delete.
   */
  async deleteTask(userId: string, taskId: string): Promise<void> {
    const context = { userId, taskId, action: "deleteTask" };
    logger.info(`BLL: Deleting task ${taskId}`, context);

    const client = createDbAdminClient();

    const { data: existing, error: fetchError } = await client
      .from("tasks")
      .select("workspace_id, title, reporter_id")
      .eq("id", taskId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError("Task not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, existing.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot delete tasks.");
    }

    if (role === "member" && existing.reporter_id !== userId) {
      throw new ForbiddenError("Members can only delete tasks they created.");
    }

    const { error } = await client.from("tasks").delete().eq("id", taskId);

    if (error) {
      logger.error("Failed to delete task", error as unknown as Error, context);
      throw new DatabaseError("Error deleting task.", error);
    }

    await this.logActivity(client, existing.workspace_id, userId, "task.delete", "task", taskId, {
      title: existing.title,
    });
  }

  /**
   * Duplicates an existing task
   */
  async duplicateTask(userId: string, taskId: string): Promise<Task> {
    const context = { userId, taskId, action: "duplicateTask" };
    logger.info(`BLL: Duplicating task ${taskId}`, context);

    const client = createDbAdminClient();

    const { data: existing, error: fetchError } = await client
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError("Task not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, existing.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot duplicate tasks.");
    }

    const { data, error } = await client
      .from("tasks")
      .insert({
        project_id: existing.project_id,
        workspace_id: existing.workspace_id,
        column_id: existing.column_id,
        title: `${existing.title} (Copy)`,
        description: existing.description,
        status: existing.status,
        priority: existing.priority,
        assignee_id: existing.assignee_id,
        reporter_id: userId,
        due_date: existing.due_date,
        due_date_time: existing.due_date_time,
        estimated_hours: existing.estimated_hours,
        position: (existing.position || 0) + 1,
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to duplicate task", error as unknown as Error, context);
      throw new DatabaseError("Error duplicating task.", error);
    }

    await this.logActivity(client, existing.workspace_id, userId, "task.create", "task", data.id, {
      title: data.title,
    });

    return this.mapRow(data);
  }

  /**
   * Lists task comments
   */
  async listTaskComments(userId: string, taskId: string): Promise<TaskComment[]> {
    const client = createDbAdminClient();

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("workspace_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundError("Task not found.");
    }

    await permissionService.assertWorkspaceMember(userId, task.workspace_id);

    const { data, error } = await client
      .from("task_comments")
      .select(`
        id,
        task_id,
        profile_id,
        content,
        created_at,
        profiles (
          email,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new DatabaseError("Error fetching task comments.", error);
    }

    return (data ?? []).map((row: any) => {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        taskId: row.task_id,
        profileId: row.profile_id,
        content: row.content,
        createdAt: row.created_at,
        profile: prof ? {
          email: prof.email,
          firstName: prof.first_name,
          lastName: prof.last_name,
          avatarUrl: prof.avatar_url,
        } : undefined,
      };
    });
  }

  /**
   * Creates a comment on a task
   */
  async createTaskComment(userId: string, taskId: string, content: string): Promise<TaskComment> {
    if (!content.trim()) {
      throw new ValidationError("Comment content is required.");
    }

    const client = createDbAdminClient();

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("workspace_id, title")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundError("Task not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, task.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot add comments.");
    }

    const { data, error } = await client
      .from("task_comments")
      .insert({
        task_id: taskId,
        profile_id: userId,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      throw new DatabaseError("Error saving task comment.", error);
    }

    await this.logActivity(client, task.workspace_id, userId, "task.comment", "task", taskId, {
      title: task.title,
    });

    const comment = await this.listTaskComments(userId, taskId);
    return comment.find((c) => c.id === data.id)!;
  }

  /**
   * Lists task attachments
   */
  async listTaskAttachments(userId: string, taskId: string): Promise<TaskAttachment[]> {
    const client = createDbAdminClient();

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("workspace_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundError("Task not found.");
    }

    await permissionService.assertWorkspaceMember(userId, task.workspace_id);

    const { data, error } = await client
      .from("attachments")
      .select("*")
      .eq("entity_type", "task")
      .eq("entity_id", taskId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError("Error fetching attachments.", error);
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      taskId: row.entity_id,
      fileName: row.file_name,
      fileUrl: row.storage_path, // Storage path to identify the file
      uploadedBy: row.uploader_id,
      createdAt: row.created_at,
    }));
  }

  /**
   * Creates an attachment on a task
   */
  async createTaskAttachment(
    userId: string,
    taskId: string,
    fileName: string,
    fileUrl: string
  ): Promise<TaskAttachment> {
    const client = createDbAdminClient();

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("workspace_id, title")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundError("Task not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, task.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot add attachments.");
    }

    const { data, error } = await client
      .from("attachments")
      .insert({
        workspace_id: task.workspace_id,
        uploader_id: userId,
        bucket: "workspace-files",
        storage_path: fileUrl.startsWith("http") ? fileUrl : `tasks/${taskId}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`,
        file_name: fileName,
        mime_type: "application/octet-stream",
        file_size: 0,
        entity_type: "task",
        entity_id: taskId
      })
      .select()
      .single();

    if (error) {
      throw new DatabaseError("Error saving attachment details.", error);
    }

    await this.logActivity(client, task.workspace_id, userId, "task.attach", "task", taskId, {
      title: task.title,
      fileName,
    });

    return {
      id: data.id,
      taskId: data.entity_id,
      fileName: data.file_name,
      fileUrl: data.storage_path,
      uploadedBy: data.uploader_id,
      createdAt: data.created_at,
    };
  }

  /**
   * Lists task labels available in workspace
   */
  async listWorkspaceLabels(userId: string, workspaceId: string): Promise<TaskLabel[]> {
    const client = createDbAdminClient();
    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const { data, error } = await client
      .from("task_labels")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });

    if (error) {
      throw new DatabaseError("Error fetching workspace labels.", error);
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      color: row.color,
    }));
  }

  /**
   * Maps a label to a task
   */
  async addLabelToTask(userId: string, taskId: string, labelId: string): Promise<void> {
    const client = createDbAdminClient();

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("workspace_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundError("Task not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, task.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot modify task labels.");
    }

    const { error } = await client
      .from("task_label_mapping")
      .insert({
        task_id: taskId,
        label_id: labelId,
      });

    if (error) {
      // Ignore unique violations (label already mapped)
      if (error.code !== "23505") {
        throw new DatabaseError("Error mapping label to task.", error);
      }
    }
  }

  /**
   * Removes a label from a task
   */
  async removeLabelFromTask(userId: string, taskId: string, labelId: string): Promise<void> {
    const client = createDbAdminClient();

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("workspace_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundError("Task not found.");
    }

    const role = await permissionService.assertWorkspaceMember(userId, task.workspace_id);
    if (role === "guest") {
      throw new ForbiddenError("Guests cannot modify task labels.");
    }

    const { error } = await client
      .from("task_label_mapping")
      .delete()
      .eq("task_id", taskId)
      .eq("label_id", labelId);

    if (error) {
      throw new DatabaseError("Error removing label mapping.", error);
    }
  }
}

export const taskService = new TaskService();
