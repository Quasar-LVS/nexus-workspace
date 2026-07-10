"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { projectService } from "@/lib/backend/services/project.service";
import { Project } from "@/types";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Returns all projects in a workspace.
 */
export async function getProjectsAction(
  workspaceId: string
): Promise<ActionResult<Project[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const projects = await projectService.getWorkspaceProjects(userId, workspaceId);
    return { success: true, data: projects };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load projects." };
  }
}

/**
 * Server Action: Returns a single project by ID.
 */
export async function getProjectByIdAction(
  projectId: string
): Promise<ActionResult<Project>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const project = await projectService.getProjectById(userId, projectId);
    return { success: true, data: project };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load project." };
  }
}

/**
 * Server Action: Creates a new project in a workspace.
 */
export async function createProjectAction(
  workspaceId: string,
  payload: { name: string; description?: string }
): Promise<ActionResult<Project>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const project = await projectService.createProject(userId, workspaceId, payload);
    revalidatePath("/dashboard");
    return { success: true, data: project };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create project." };
  }
}

/**
 * Server Action: Updates a project.
 */
export async function updateProjectAction(
  projectId: string,
  payload: { name?: string; description?: string; status?: string }
): Promise<ActionResult<Project>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const project = await projectService.updateProject(userId, projectId, payload);
    revalidatePath("/dashboard");
    return { success: true, data: project };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update project." };
  }
}

/**
 * Server Action: Deletes a project.
 */
export async function deleteProjectAction(
  projectId: string
): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await projectService.deleteProject(userId, projectId);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete project." };
  }
}
