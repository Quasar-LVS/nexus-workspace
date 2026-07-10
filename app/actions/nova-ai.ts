"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { novaAiService } from "@/lib/backend/ai/nova-ai.service";
import { aiService } from "@/lib/ai/ai.service";
import { createDbAdminClient } from "@/lib/backend/database/client";

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Generates a catch-up summary for a channel
 */
export async function generateCatchUpSummaryAction(channelId: string): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const summary = await novaAiService.generateCatchUpSummary(userId, channelId);
    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate summary." };
  }
}

/**
 * Server Action: Summarizes a thread replies chain
 */
export async function generateThreadSummaryAction(parentId: string): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const summary = await novaAiService.generateThreadSummary(userId, parentId);
    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to summarize thread." };
  }
}

/**
 * Server Action: Extracts task suggestions from recent messages
 */
export async function extractActionItemsAction(channelId: string): Promise<ActionResult<any[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const list = await novaAiService.extractActionItems(userId, channelId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to extract action items." };
  }
}

/**
 * Server Action: Returns smart context-aware reply choices
 */
export async function generateSmartRepliesAction(channelId: string): Promise<ActionResult<string[]>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const list = await novaAiService.generateSmartReplies(userId, channelId);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load smart replies." };
  }
}

/**
 * Server Action: Approves an AI Action suggestion card
 */
export async function approveSuggestionAction(suggestionId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await novaAiService.approveSuggestion(userId, suggestionId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to approve suggestion." };
  }
}

/**
 * Server Action: Rejects an AI Action suggestion card
 */
export async function rejectSuggestionAction(suggestionId: string): Promise<ActionResult<void>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    await novaAiService.rejectSuggestion(userId, suggestionId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reject suggestion." };
  }
}

/**
 * Server Action: Generates a conversation summary (channel or DM), checking and updating Cache
 */
export async function summarizeConversationAction(
  workspaceId: string,
  conversationType: "channel" | "dm",
  conversationId: string
): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const client = createDbAdminClient();
    const sumType = conversationType === "channel" ? "channel_catch_up" : "dm_summary";

    // 1. Check cache
    let query = client
      .from("ai_summaries")
      .select("content, created_at")
      .eq("workspace_id", workspaceId)
      .eq("summary_type", sumType)
      .order("created_at", { ascending: false })
      .limit(1);

    if (conversationType === "channel") {
      query = query.eq("channel_id", conversationId);
    } else {
      query = query.eq("conversation_id", conversationId);
    }

    const { data: cache } = await query;

    if (cache && cache.length > 0) {
      const lastCreated = new Date(cache[0].created_at).getTime();
      const now = new Date().getTime();
      // 15 minutes cache freshness
      if (now - lastCreated < 15 * 60 * 1000) {
        return { success: true, data: cache[0].content };
      }
    }

    // 2. Generate new summary
    const summary = await aiService.summarizeConversation(workspaceId, conversationType, conversationId);

    // 3. Cache it
    await client.from("ai_summaries").insert({
      workspace_id: workspaceId,
      [conversationType === "channel" ? "channel_id" : "conversation_id"]: conversationId,
      summary_type: sumType,
      content: summary
    });

    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate conversation summary." };
  }
}

/**
 * Server Action: Generates and seeds tasks inside an existing project board column
 */
export async function generateProjectTasksAction(
  workspaceId: string,
  projectId: string,
  goal: string
): Promise<ActionResult<any>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const tasks = await aiService.generateTasks(workspaceId, projectId, goal);
    return { success: true, data: tasks };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate project tasks." };
  }
}

/**
 * Server Action: Parses meeting transcript or notes and creates structured summaries
 */
export async function summarizeMeetingAction(
  workspaceId: string,
  notes: string
): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const summary = await aiService.summarizeMeeting(workspaceId, notes);
    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to summarize meeting." };
  }
}

/**
 * Server Action: Refines draft writing texts
 */
export async function rewriteTextAction(
  workspaceId: string,
  text: string,
  action: string
): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const rewritten = await aiService.rewriteText(workspaceId, text, action);
    return { success: true, data: rewritten };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to refine text style." };
  }
}

/**
 * Server Action: Performs cognitive search matching messages, tasks, and projects
 */
export async function searchWorkspaceAIAction(
  workspaceId: string,
  query: string
): Promise<ActionResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Authentication required." };

    const summary = await aiService.semanticSearch(workspaceId, query);
    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to complete workspace cognitive search." };
  }
}
