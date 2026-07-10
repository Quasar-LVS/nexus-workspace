import { z } from "zod";

export const createTaskSchema = z.object({
  projectId: z.string().uuid("Project ID must be a valid UUID"),
  title: z.string().min(1, "Task title is required").max(200, "Title is too long"),
  description: z.string().max(2000, "Description exceeds limit").optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigneeId: z.string().optional().nullable(),
  dueDateTime: z.string().datetime({ message: "Invalid ISO 8601 datetime format" }).optional().nullable(),
  columnId: z.string().uuid().optional().nullable(),
  status: z.enum(["backlog", "todo", "in-progress", "in-review", "done"]).optional(),
  reporterId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  position: z.number().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["backlog", "todo", "in-progress", "in-review", "done"]).optional(),
  completedAt: z.string().datetime().optional().nullable(),
});

export type CreateTaskDTO = z.infer<typeof createTaskSchema>;
export type UpdateTaskDTO = z.infer<typeof updateTaskSchema>;
