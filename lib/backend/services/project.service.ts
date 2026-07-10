import { createDbAdminClient } from "../database/client";
import { permissionService } from "./permission.service";
import { ValidationError, DatabaseError, NotFoundError } from "../errors/custom-errors";
import { logger } from "../utils/logger";
import { Project } from "@/types";

import { columnService } from "./column.service";

/**
 * Project Service (BLL)
 * Manages workspace project boards — CRUD with workspace membership validation.
 */
export class ProjectService {

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
   * Returns all projects for a workspace. Caller must be a workspace member.
   */
  async getWorkspaceProjects(userId: string, workspaceId: string): Promise<Project[]> {
    const context = { userId, workspaceId, action: "getWorkspaceProjects" };
    logger.info("BLL: Fetching workspace projects", context);

    await permissionService.assertWorkspaceMember(userId, workspaceId);

    const client = createDbAdminClient();
    const { data, error } = await client
      .from("projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("Failed to fetch workspace projects", error as unknown as Error, context);
      throw new DatabaseError("Error fetching workspace projects.", error);
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      createdById: row.created_by_id || userId,
    }));
  }

  /**
   * Returns a single project by ID. Validates workspace membership via the project's workspace.
   */
  async getProjectById(userId: string, projectId: string): Promise<Project> {
    const context = { userId, projectId, action: "getProjectById" };
    logger.info("BLL: Fetching project by ID", context);

    const client = createDbAdminClient();
    const { data, error } = await client
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      throw new NotFoundError("Project not found.");
    }

    // Verify the caller is a member of the project's workspace
    await permissionService.assertWorkspaceMember(userId, data.workspace_id);

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.name,
      description: data.description,
      status: data.status,
      createdAt: data.created_at,
      createdById: data.created_by_id || userId,
    };
  }

  /**
   * Creates a new project in a workspace. Caller must be owner/admin.
   */
  async createProject(
    userId: string,
    workspaceId: string,
    payload: { name: string; description?: string; status?: string }
  ): Promise<Project> {
    const context = { userId, workspaceId, action: "createProject" };
    logger.info(`BLL: Creating project "${payload.name}"`, context);

    if (!payload.name || payload.name.trim().length === 0) {
      throw new ValidationError("Project name is required.");
    }

    // Restrict project creation to owners/admins
    await permissionService.assertRole(userId, workspaceId, ["owner", "admin"]);

    const client = createDbAdminClient();
    const { data, error } = await client
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: payload.name.trim(),
        description: payload.description || null,
        status: payload.status || "active",
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to create project", error as unknown as Error, context);
      throw new DatabaseError("Error creating project.", error);
    }

    // Seed default Kanban columns
    await columnService.seedDefaultColumns(client, data.id);

    await this.logActivity(client, workspaceId, userId, "project.create", "project", data.id, {
      name: payload.name,
    });

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.name,
      description: data.description,
      status: data.status,
      createdAt: data.created_at,
      createdById: userId,
    };
  }

  /**
   * Updates a project's name, description, or status.
   */
  async updateProject(
    userId: string,
    projectId: string,
    payload: { name?: string; description?: string; status?: string }
  ): Promise<Project> {
    const context = { userId, projectId, action: "updateProject" };
    logger.info("BLL: Updating project", context);

    // Fetch project to get workspace_id
    const existing = await this.getProjectById(userId, projectId);
    await permissionService.assertRole(userId, existing.workspaceId, ["owner", "admin"]);

    const updateData: Record<string, unknown> = {};
    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.description !== undefined) updateData.description = payload.description;
    if (payload.status !== undefined) updateData.status = payload.status;

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    const client = createDbAdminClient();
    const { data, error } = await client
      .from("projects")
      .update(updateData)
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      logger.error("Failed to update project", error as unknown as Error, context);
      throw new DatabaseError("Error updating project.", error);
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.name,
      description: data.description,
      status: data.status,
      createdAt: data.created_at,
      createdById: userId,
    };
  }

  /**
   * Deletes a project. Only owner/admin can delete.
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const context = { userId, projectId, action: "deleteProject" };
    logger.info("BLL: Deleting project", context);

    const existing = await this.getProjectById(userId, projectId);
    await permissionService.assertRole(userId, existing.workspaceId, ["owner", "admin"]);

    const client = createDbAdminClient();
    const { error } = await client
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      logger.error("Failed to delete project", error as unknown as Error, context);
      throw new DatabaseError("Error deleting project.", error);
    }

    await this.logActivity(client, existing.workspaceId, userId, "project.delete", "project", projectId, {
      name: existing.name,
    });
  }
}

export const projectService = new ProjectService();
