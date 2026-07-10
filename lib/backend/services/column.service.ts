import { createDbAdminClient } from "../database/client";
import { permissionService } from "./permission.service";
import { ValidationError, DatabaseError, NotFoundError } from "../errors/custom-errors";
import { logger } from "../utils/logger";
import { ProjectColumn } from "@/types";

export class ColumnService {
  /**
   * Maps database row to ProjectColumn type
   */
  private mapRow(row: any): ProjectColumn {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      position: row.position,
      isArchived: row.is_archived,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Lists all columns for a project
   */
  async listProjectColumns(userId: string, projectId: string): Promise<ProjectColumn[]> {
    const context = { userId, projectId, action: "listProjectColumns" };
    logger.info("BLL: Listing project columns", context);

    const client = createDbAdminClient();

    // Verify workspace membership via project
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
      .from("project_columns")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_archived", false)
      .order("position", { ascending: true });

    if (error) {
      logger.error("Failed to fetch project columns", error as unknown as Error, context);
      throw new DatabaseError("Error fetching columns.", error);
    }

    return (data ?? []).map(this.mapRow);
  }

  /**
   * Seeds default columns (Backlog, Todo, In Progress, Review, Done) for a project
   */
  async seedDefaultColumns(client: any, projectId: string): Promise<void> {
    const defaultColumns = ["Backlog", "Todo", "In Progress", "Review", "Done"];
    const inserts = defaultColumns.map((name, index) => ({
      project_id: projectId,
      name,
      position: index,
      is_archived: false,
    }));

    const { error } = await client.from("project_columns").insert(inserts);
    if (error) {
      logger.warn(`Failed to seed default columns for project: ${projectId}`, { error: error.message });
    }
  }

  /**
   * Creates a new custom column in a project
   */
  async createColumn(userId: string, projectId: string, name: string, position: number): Promise<ProjectColumn> {
    const context = { userId, projectId, name, action: "createColumn" };
    logger.info("BLL: Creating project column", context);

    if (!name.trim()) {
      throw new ValidationError("Column name is required.");
    }

    const client = createDbAdminClient();

    const { data: project, error: projError } = await client
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .single();

    if (projError || !project) {
      throw new NotFoundError("Project not found.");
    }

    // Only owners and admins can manage project columns
    await permissionService.assertRole(userId, project.workspace_id, ["owner", "admin"]);

    const { data, error } = await client
      .from("project_columns")
      .insert({
        project_id: projectId,
        name: name.trim(),
        position,
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to create column", error as unknown as Error, context);
      throw new DatabaseError("Error creating column.", error);
    }

    return this.mapRow(data);
  }

  /**
   * Updates an existing column
   */
  async updateColumn(
    userId: string,
    columnId: string,
    name?: string,
    position?: number,
    isArchived?: boolean
  ): Promise<ProjectColumn> {
    const context = { userId, columnId, action: "updateColumn" };
    logger.info("BLL: Updating column", context);

    const client = createDbAdminClient();

    const { data: existing, error: fetchError } = await client
      .from("project_columns")
      .select("*, projects(workspace_id)")
      .eq("id", columnId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError("Column not found.");
    }

    const workspaceId = existing.projects.workspace_id;
    await permissionService.assertRole(userId, workspaceId, ["owner", "admin"]);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (position !== undefined) updateData.position = position;
    if (isArchived !== undefined) updateData.is_archived = isArchived;

    const { data, error } = await client
      .from("project_columns")
      .update(updateData)
      .eq("id", columnId)
      .select()
      .single();

    if (error) {
      logger.error("Failed to update column", error as unknown as Error, context);
      throw new DatabaseError("Error updating column.", error);
    }

    return this.mapRow(data);
  }
}

export const columnService = new ColumnService();
