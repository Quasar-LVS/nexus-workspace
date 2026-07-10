"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { taskService } from "@/lib/backend/services/task.service";
import { Task } from "@/types";

import { createTaskSchema } from "@/lib/backend/validation/task.schema";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Returns all tasks for a project.
 */
export async function getProjectTasksAction(
  projectId: string
): Promise<ActionResult<Task[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const tasks = await taskService.listProjectTasks(userId, projectId);
    return { success: true, data: tasks };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load tasks." };
  }
}

/**
 * Server Action: Returns all tasks across a workspace.
 */
export async function getWorkspaceTasksAction(
  workspaceId: string
): Promise<ActionResult<Task[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const tasks = await taskService.listWorkspaceTasks(userId, workspaceId);
    return { success: true, data: tasks };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load workspace tasks." };
  }
}

/**
 * Server Action: Creates a new task.
 */
export async function createTaskAction(
  payload: {
    projectId: string;
    title: string;
    description?: string | null;
    priority?: "low" | "medium" | "high" | "urgent";
    assigneeId?: string | null;
    dueDateTime?: string | null;
    columnId?: string | null;
    reporterId?: string | null;
    status?: "backlog" | "todo" | "in-progress" | "in-review" | "done";
    dueDate?: string | null;
    estimatedHours?: number | null;
    position?: number;
  }
): Promise<ActionResult<Task>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const parsed = createTaskSchema.parse(payload);
    const task = await taskService.createTask(userId, parsed);
    revalidatePath("/dashboard");
    return { success: true, data: task };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create task." };
  }
}

/**
 * Server Action: Updates a task.
 */
export async function updateTaskAction(
  taskId: string,
  payload: {
    title?: string;
    description?: string | null;
    status?: "backlog" | "todo" | "in-progress" | "in-review" | "done";
    priority?: "low" | "medium" | "high" | "urgent";
    assigneeId?: string | null;
    dueDateTime?: string | null;
    columnId?: string | null;
    reporterId?: string | null;
    dueDate?: string | null;
    estimatedHours?: number | null;
    position?: number;
  }
): Promise<ActionResult<Task>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const task = await taskService.updateTask(userId, taskId, payload);
    revalidatePath("/dashboard");
    return { success: true, data: task };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update task." };
  }
}

/**
 * Server Action: Deletes a task.
 */
export async function deleteTaskAction(
  taskId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await taskService.deleteTask(userId, taskId);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete task." };
  }
}

/**
 * Server Action: Duplicates a task.
 */
export async function duplicateTaskAction(
  taskId: string
): Promise<ActionResult<Task>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const task = await taskService.duplicateTask(userId, taskId);
    revalidatePath("/dashboard");
    return { success: true, data: task };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to duplicate task." };
  }
}

/**
 * Server Action: Lists task comments.
 */
export async function getTaskCommentsAction(
  taskId: string
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const comments = await taskService.listTaskComments(userId, taskId);
    return { success: true, data: comments };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load comments." };
  }
}

/**
 * Server Action: Creates a task comment.
 */
export async function createTaskCommentAction(
  taskId: string,
  content: string
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const comment = await taskService.createTaskComment(userId, taskId, content);
    return { success: true, data: comment };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to post comment." };
  }
}

/**
 * Server Action: Lists task attachments.
 */
export async function getTaskAttachmentsAction(
  taskId: string
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const attachments = await taskService.listTaskAttachments(userId, taskId);
    return { success: true, data: attachments };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load attachments." };
  }
}

/**
 * Server Action: Creates a task attachment mapping.
 */
export async function createTaskAttachmentAction(
  taskId: string,
  fileName: string,
  fileUrl: string
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const attachment = await taskService.createTaskAttachment(userId, taskId, fileName, fileUrl);
    return { success: true, data: attachment };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to attach file." };
  }
}

/**
 * Server Action: Lists available task labels in workspace.
 */
export async function getWorkspaceLabelsAction(
  workspaceId: string
): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const labels = await taskService.listWorkspaceLabels(userId, workspaceId);
    return { success: true, data: labels };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load labels." };
  }
}

/**
 * Server Action: Maps a label to a task.
 */
export async function addLabelToTaskAction(
  taskId: string,
  labelId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await taskService.addLabelToTask(userId, taskId, labelId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to add label." };
  }
}

/**
 * Server Action: Removes a label from a task.
 */
export async function removeLabelFromTaskAction(
  taskId: string,
  labelId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await taskService.removeLabelFromTask(userId, taskId, labelId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to remove label." };
  }
}
