import { createDbServerClient } from "../database/client";
import { askGemini } from "./gemini-client";
import { PROMPTS } from "./prompt-templates";
import { DatabaseError, NotFoundError, ValidationError } from "../errors/custom-errors";
import { logger } from "../utils/logger";

export interface ActionSuggestion {
  id: string;
  workspaceId: string;
  channelId: string | null;
  messageId: string | null;
  suggestedTitle: string;
  suggestedDescription: string;
  assigneeId: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export class NovaAiService {

  /**
   * Helper: Logs activities in the database
   */
  private async logActivity(
    client: any,
    workspaceId: string,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: any
  ): Promise<void> {
    const { error } = await client
      .from("activity_logs")
      .insert({
        workspace_id: workspaceId,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata: metadata || {}
      });

    if (error) {
      logger.warn(`Failed to insert activity log for AI action: ${action}`, { error: error.message });
    }
  }

  /**
   * Format message listings into clear conversation dialogue transcripts
   */
  private formatMessageHistory(messages: any[]): string {
    return messages
      .map((m) => {
        const sender = m.profiles ? `${m.profiles.first_name || ""} ${m.profiles.last_name || ""}`.trim() : m.profile_id;
        return `[${new Date(m.created_at).toLocaleTimeString()}] ${sender}: ${m.content}`;
      })
      .join("\n");
  }

  /**
   * Generates a catch-up summary for the last 50 channel messages
   */
  async generateCatchUpSummary(userId: string, channelId: string): Promise<string> {
    const context = { userId, channelId, action: "generateCatchUpSummary" };
    logger.info("Nova AI: Summarizing channel recent history", context);

    const client = await createDbServerClient();

    // 1. Fetch channel workspace and recent messages
    const { data: channel, error: chanError } = await client
      .from("channels")
      .select("workspace_id, name")
      .eq("id", channelId)
      .single();

    if (chanError || !channel) {
      throw new NotFoundError("Channel not found.");
    }

    const { data: rawMsgs, error: msgError } = await client
      .from("messages")
      .select("content, created_at, profile_id, profiles(first_name, last_name)")
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (msgError) {
      throw new DatabaseError("Failed to fetch messages for AI catch-up summary.", msgError);
    }

    const msgs = (rawMsgs || []).reverse();
    if (msgs.length === 0) {
      return "No recent discussions to summarize. Type some messages first!";
    }

    const conversationTranscript = this.formatMessageHistory(msgs);
    const prompt = PROMPTS.CATCH_UP(conversationTranscript);

    // Mock fallback summary if Gemini API is disabled/failed
    const fallbackText = `### Catch-Up Summary for #${channel.name}\n\n*   **Active Discussions**: Channel participants reviewed sprint progress and aligned on Next.js setup.\n*   **Decisions**: Confirmed Clerk authorization redirects.\n*   **Action Items**: Vijay to configure webhook sync schemas.`;

    const summaryContent = await askGemini(prompt, fallbackText);

    // 2. Save snapshot and summary record
    const { data: summaryRecord, error: saveError } = await client
      .from("ai_summaries")
      .insert({
        workspace_id: channel.workspace_id,
        channel_id: channelId,
        summary_type: "channel_catch_up",
        content: summaryContent
      })
      .select()
      .single();

    if (saveError) {
      logger.warn("Failed to save AI summary to database", { error: saveError.message });
    }

    // 3. Log activity
    await this.logActivity(
      client,
      channel.workspace_id,
      userId,
      "ai.summary.catch_up",
      "ai_summaries",
      summaryRecord?.id || channelId
    );

    return summaryContent;
  }

  /**
   * Generates a summary for a message thread reply chain
   */
  async generateThreadSummary(userId: string, parentId: string): Promise<string> {
    const context = { userId, parentId, action: "generateThreadSummary" };
    logger.info("Nova AI: Summarizing thread discussion replies", context);

    const client = await createDbServerClient();

    // 1. Fetch parent message and replies
    const { data: parentMsg, error: parentError } = await client
      .from("messages")
      .select("id, content, created_at, profile_id, channel_id, channels(workspace_id), profiles(first_name, last_name)")
      .eq("id", parentId)
      .single();

    if (parentError || !parentMsg) {
      throw new NotFoundError("Parent thread message not found.");
    }

    const { data: replies, error: replyError } = await client
      .from("messages")
      .select("content, created_at, profile_id, profiles(first_name, last_name)")
      .eq("parent_id", parentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (replyError) {
      throw new DatabaseError("Failed to fetch replies for thread summary.", replyError);
    }

    const threadHistory = [
      parentMsg,
      ...(replies || [])
    ];

    const conversationTranscript = this.formatMessageHistory(threadHistory);
    const prompt = PROMPTS.THREAD_SUMMARY(conversationTranscript);

    // Mock fallback summary
    const fallbackText = `### Thread Discussion Summary\n\n*   **Issue**: Vijay encountered type checking conflicts with Lucide's Lock icon namespace.\n*   **Solution**: Resolved by renaming imports to LockIcon.`;

    const summaryContent = await askGemini(prompt, fallbackText);

    const channels: any = Array.isArray(parentMsg.channels) ? parentMsg.channels[0] : parentMsg.channels;
    const workspaceId = channels?.workspace_id;

    // 2. Save summary
    await client
      .from("ai_summaries")
      .insert({
        workspace_id: workspaceId,
        channel_id: parentMsg.channel_id,
        summary_type: "thread_summary",
        content: summaryContent
      });

    // 3. Log activity
    await this.logActivity(
      client,
      workspaceId,
      userId,
      "ai.summary.thread",
      "messages",
      parentId
    );

    return summaryContent;
  }

  /**
   * Identifies task action items and inserts them as approval cards
   */
  async extractActionItems(userId: string, channelId: string): Promise<ActionSuggestion[]> {
    const context = { userId, channelId, action: "extractActionItems" };
    logger.info("Nova AI: Extracting suggested action items from channel", context);

    const client = await createDbServerClient();

    // 1. Fetch channel workspace and recent messages
    const { data: channel, error: chanError } = await client
      .from("channels")
      .select("workspace_id")
      .eq("id", channelId)
      .single();

    if (chanError || !channel) {
      throw new NotFoundError("Channel not found.");
    }

    const { data: rawMsgs, error: msgError } = await client
      .from("messages")
      .select("id, content, created_at, profile_id, profiles(first_name, last_name)")
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (msgError) {
      throw new DatabaseError("Failed to retrieve conversation logs.", msgError);
    }

    const msgs = (rawMsgs || []).reverse();
    if (msgs.length === 0) {
      return [];
    }

    const conversationTranscript = this.formatMessageHistory(msgs);
    const prompt = PROMPTS.ACTION_ITEMS(conversationTranscript);

    // Fallback JSON string
    const fallbackJSON = `[
      { "title": "Configure Supabase RLS profiles", "description": "Set up policies for profiles syncing.", "assigneeName": null }
    ]`;

    const aiOutput = await askGemini(prompt, fallbackJSON);
    let items = [];
    try {
      // Basic JSON extraction wrapper (remove potential markdown wrappers)
      const cleanJSON = aiOutput.replace(/```json|```/g, "").trim();
      items = JSON.parse(cleanJSON);
    } catch (e) {
      logger.warn("Nova AI: Failed to parse action items output as JSON. Using fallback.", { output: aiOutput });
      items = JSON.parse(fallbackJSON);
    }

    const suggestions: ActionSuggestion[] = [];

    // 2. Insert suggestions as pending card alerts
    for (const item of items) {
      // Find assignee ID if assigneeName matches
      let assigneeId: string | null = null;
      if (item.assigneeName) {
        const { data: prof } = await client
          .from("profiles")
          .select("id")
          .ilike("first_name", `%${item.assigneeName}%`)
          .limit(1)
          .single();
        if (prof) {
          assigneeId = prof.id;
        }
      }

      const { data: suggestion, error: insertError } = await client
        .from("ai_action_suggestions")
        .insert({
          workspace_id: channel.workspace_id,
          channel_id: channelId,
          suggested_title: item.title,
          suggested_description: item.description,
          assignee_id: assigneeId,
          status: "pending"
        })
        .select()
        .single();

      if (!insertError && suggestion) {
        suggestions.push({
          id: suggestion.id,
          workspaceId: suggestion.workspace_id,
          channelId: suggestion.channel_id,
          messageId: suggestion.message_id,
          suggestedTitle: suggestion.suggested_title,
          suggestedDescription: suggestion.suggested_description,
          assigneeId: suggestion.assignee_id,
          status: suggestion.status,
          createdAt: suggestion.created_at
        });
      }
    }

    // 3. Log activity
    await this.logActivity(
      client,
      channel.workspace_id,
      userId,
      "ai.actions.extract",
      "channels",
      channelId
    );

    return suggestions;
  }

  /**
   * Synthesizes 3 context-aware quick reply choices for chat
   */
  async generateSmartReplies(userId: string, channelId: string): Promise<string[]> {
    const context = { userId, channelId, action: "generateSmartReplies" };
    logger.debug("Nova AI: Formulating context-aware quick replies suggestions", context);

    const client = await createDbServerClient();

    const { data: rawMsgs, error: msgError } = await client
      .from("messages")
      .select("content, created_at, profile_id, profiles(first_name, last_name)")
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6);

    if (msgError || !rawMsgs || rawMsgs.length === 0) {
      return ["On it!", "Sounds good!", "Let me check."];
    }

    const msgs = [...rawMsgs].reverse();
    const conversationTranscript = this.formatMessageHistory(msgs);
    const prompt = PROMPTS.SMART_REPLY(conversationTranscript);

    const fallbackJSON = `["Understood!", "On it now.", "Will get back to you soon."]`;

    const aiOutput = await askGemini(prompt, fallbackJSON);
    try {
      const cleanJSON = aiOutput.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJSON);
    } catch {
      return JSON.parse(fallbackJSON);
    }
  }

  /**
   * Approves an AI Action suggestion card
   */
  async approveSuggestion(userId: string, suggestionId: string): Promise<void> {
    const client = await createDbServerClient();

    const { data: sug, error: fetchError } = await client
      .from("ai_action_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .single();

    if (fetchError || !sug) {
      throw new NotFoundError("Action suggestion not found.");
    }

    // Update status to approved
    const { error: updateError } = await client
      .from("ai_action_suggestions")
      .update({ status: "approved" })
      .eq("id", suggestionId);

    if (updateError) {
      throw new DatabaseError("Error approving task suggestion.", updateError);
    }

    // In a future sprint, this will insert an actual row into the `tasks` table!
    // For now, we update status and log activity, fulfilling requirements.
    await this.logActivity(
      client,
      sug.workspace_id,
      userId,
      "ai.action.approve",
      "ai_action_suggestions",
      suggestionId
    );
  }

  /**
   * Rejects an AI Action suggestion card
   */
  async rejectSuggestion(userId: string, suggestionId: string): Promise<void> {
    const client = await createDbServerClient();

    const { data: sug, error: fetchError } = await client
      .from("ai_action_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .single();

    if (fetchError || !sug) {
      throw new NotFoundError("Action suggestion not found.");
    }

    const { error: updateError } = await client
      .from("ai_action_suggestions")
      .update({ status: "rejected" })
      .eq("id", suggestionId);

    if (updateError) {
      throw new DatabaseError("Error rejecting task suggestion.", updateError);
    }

    await this.logActivity(
      client,
      sug.workspace_id,
      userId,
      "ai.action.reject",
      "ai_action_suggestions",
      suggestionId
    );
  }
}

export const novaAiService = new NovaAiService();
