"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { columnService } from "@/lib/backend/services/column.service";
import { ProjectColumn } from "@/types";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getProjectColumnsAction(
  projectId: string
): Promise<ActionResult<ProjectColumn[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const columns = await columnService.listProjectColumns(userId, projectId);
    return { success: true, data: columns };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load columns." };
  }
}

export async function createColumnAction(
  projectId: string,
  name: string,
  position: number
): Promise<ActionResult<ProjectColumn>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const column = await columnService.createColumn(userId, projectId, name, position);
    revalidatePath("/dashboard");
    return { success: true, data: column };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create column." };
  }
}

export async function updateColumnAction(
  columnId: string,
  name?: string,
  position?: number,
  isArchived?: boolean
): Promise<ActionResult<ProjectColumn>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const column = await columnService.updateColumn(userId, columnId, name, position, isArchived);
    revalidatePath("/dashboard");
    return { success: true, data: column };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update column." };
  }
}
