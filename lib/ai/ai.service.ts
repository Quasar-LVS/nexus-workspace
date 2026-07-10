import { createDbAdminClient, createDbServerClient } from "../backend/database/client";
import { ProviderFactory } from "./provider-factory";
import { PROMPTS } from "./prompts";
import { logger } from "../backend/utils/logger";
import { getOrCreateDMAction } from "@/app/actions/chat";

export class AiService {
  /**
   * Main entry point for Nova AI assistant chats.
   * Gathers workspace context, routes to the active provider, parses actions, and returns a stream.
   */
  async chat(
    workspaceId: string,
    query: string,
    userId: string,
    contextId?: string,
    contextType?: string
  ): Promise<ReadableStream<string>> {
    logger.info("AiService: Processing user query", { workspaceId, query: query.slice(0, 50), userId });
    await this.logAiActivity(workspaceId, userId, "chat", { query: query.slice(0, 100) });

    const client = createDbAdminClient();

    // 1. Fetch active AI provider configured for this workspace
    const { data: workspace } = await client
      .from("workspaces")
      .select("ai_provider")
      .eq("id", workspaceId)
      .single();

    const activeProviderName = workspace?.ai_provider || "gemini";
    const provider = ProviderFactory.getProvider(activeProviderName);

    // 2. Detect and execute special AI Actions
    const lowercaseQuery = query.toLowerCase();

    // ACTION: Task Generator ("build a login system", "create a project plan")
    if (
      lowercaseQuery.includes("build a") || 
      lowercaseQuery.includes("create a project") || 
      lowercaseQuery.includes("project plan")
    ) {
      return this.handleProjectTaskGeneration(workspaceId, query, provider);
    }

    // ACTION: Smart Search ("Show unfinished API tasks", "Which tasks mention React?")
    if (
      lowercaseQuery.includes("search") || 
      lowercaseQuery.includes("find") || 
      lowercaseQuery.includes("mention") || 
      lowercaseQuery.includes("show unfinished")
    ) {
      return this.handleSmartSearch(workspaceId, query, provider);
    }

    // ACTION: Daily Standup ("daily standup", "standup report")
    if (lowercaseQuery.includes("standup") || lowercaseQuery.includes("stand up")) {
      return this.handleDailyStandup(workspaceId, userId, provider);
    }

    // ACTION: Smart Assignment Suggestion
    if (lowercaseQuery.includes("assignee") || lowercaseQuery.includes("assign")) {
      return this.handleSmartAssignment(workspaceId, query, provider);
    }

    // ACTION: Deadline Prediction ("predict", "schedule", "track", "deadline")
    if (
      lowercaseQuery.includes("predict") || 
      lowercaseQuery.includes("schedule") || 
      lowercaseQuery.includes("track") || 
      lowercaseQuery.includes("deadline")
    ) {
      return this.handleDeadlinePrediction(workspaceId, provider);
    }

    // DEFAULT ACTION: General chat with context gathering (Workspace Summary / catch up)
    return this.handleGeneralWorkspaceChat(workspaceId, query, provider, contextId, contextType);
  }

  /**
   * Action: Gathers channels, DMs, tasks, comments, and members context to feed the AI prompt.
   */
  private async handleGeneralWorkspaceChat(
    workspaceId: string,
    query: string,
    provider: any,
    contextId?: string,
    contextType?: string
  ): Promise<ReadableStream<string>> {
    const client = createDbAdminClient();

    // 1. Fetch targeted context info if present
    let targetedContext = "";
    if (contextType && contextId) {
      if (contextType === "channel") {
        const { data: chan } = await client.from("channels").select("name, description").eq("id", contextId).single();
        const { data: msgs } = await client.from("messages").select("content").eq("channel_id", contextId).order("created_at", { ascending: false }).limit(10);
        if (chan) {
          targetedContext = `Active Context: Channel #${chan.name} (${chan.description || "No description"})\nRecent channel messages: ${(msgs || []).map(m => m.content).reverse().join(" | ")}`;
        }
      } else if (contextType === "dm") {
        const { data: msgs } = await client.from("messages").select("content").eq("conversation_id", contextId).order("created_at", { ascending: false }).limit(10);
        targetedContext = `Active Context: Direct Message Thread\nRecent messages: ${(msgs || []).map(m => m.content).reverse().join(" | ")}`;
      } else if (contextType === "project") {
        const { data: proj } = await client.from("projects").select("name, description").eq("id", contextId).single();
        const { data: boardTasks } = await client.from("tasks").select("title, status, priority").eq("project_id", contextId).limit(10);
        if (proj) {
          targetedContext = `Active Context: Project "${proj.name}" (${proj.description || "No description"})\nProject tasks: ${(boardTasks || []).map(t => `${t.title} (${t.status})`).join("; ")}`;
        }
      } else if (contextType === "task") {
        const { data: tk } = await client.from("tasks").select("title, description, status, priority").eq("id", contextId).single();
        if (tk) {
          targetedContext = `Active Context: Task "${tk.title}"\nDescription: ${tk.description || "No description"}\nStatus: ${tk.status}, Priority: ${tk.priority}`;
        }
      }
    }

    // Gather workspace database context
    const [
      { data: channels },
      { data: messages },
      { data: projects },
      { data: tasks },
      { data: members }
    ] = await Promise.all([
      client.from("channels").select("name, description").eq("workspace_id", workspaceId).limit(5),
      client.from("messages").select("content, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(20),
      client.from("projects").select("name").eq("workspace_id", workspaceId).limit(5),
      client.from("tasks").select("title, status, priority").eq("workspace_id", workspaceId).limit(10),
      client.from("workspace_members").select("profile_id, role").eq("workspace_id", workspaceId).limit(10)
    ]);

    // Format context strings
    const contextStr = [
      targetedContext ? `--- TARGETED CONTEXT ---\n${targetedContext}\n----------------------` : "",
      `Active Channels: ${(channels || []).map(c => `#${c.name} (${c.description || "No desc"})`).join(", ")}`,
      `Projects: ${(projects || []).map(p => p.name).join(", ")}`,
      `Tasks & Milestones: ${(tasks || []).map(t => `${t.title} [Status: ${t.status}, Priority: ${t.priority}]`).join("; ")}`,
      `Recent Messages: ${(messages || []).map(m => m.content).join(" | ")}`,
      `Teammates counts: ${(members || []).length} active members`
    ].filter(Boolean).join("\n");

    const prompt = PROMPTS.WORKSPACE_SUMMARY(contextStr) + `\n\nUser Query: "${query}"`;
    return provider.generateStream(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Action: Structured project board and task list generation.
   */
  private async handleProjectTaskGeneration(
    workspaceId: string,
    query: string,
    provider: any
  ): Promise<ReadableStream<string>> {
    try {
      const prompt = PROMPTS.TASK_GENERATOR(query);
      const rawResponse = await provider.generateResponse(prompt, PROMPTS.SYSTEM_ROLE);

      // Extract JSON blocks
      const jsonMatch = rawResponse.match(/```json([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse.trim();
      const plan = JSON.parse(jsonStr);

      const client = createDbAdminClient();

      // 1. Create Project row in database
      const { data: project, error: projError } = await client
        .from("projects")
        .insert({
          workspace_id: workspaceId,
          name: plan.projectName || "New Project",
          description: `Automatically created by Nova AI based on prompt: "${query}"`
        })
        .select()
        .single();

      if (projError || !project) throw new Error("Failed to insert Project row.");

      // 2. Seed default Columns
      const defaultCols = ["Backlog", "Todo", "In Progress", "Review", "Done"];
      const createdCols = [];
      for (let i = 0; i < defaultCols.length; i++) {
        const { data: col } = await client
          .from("project_columns")
          .insert({
            project_id: project.id,
            name: defaultCols[i],
            position: i,
            is_archived: false
          })
          .select()
          .single();
        if (col) createdCols.push(col);
      }

      // Map column ids
      const todoColId = createdCols.find(c => c.name === "Todo")?.id || createdCols[0]?.id;

      // 3. Seed generated Tasks
      const tasksCreated = [];
      if (Array.isArray(plan.tasks)) {
        for (let i = 0; i < plan.tasks.length; i++) {
          const t = plan.tasks[i];
          const { data: task } = await client
            .from("tasks")
            .insert({
              workspace_id: workspaceId,
              project_id: project.id,
              column_id: todoColId,
              title: t.title || "Plan Action Card",
              description: t.description || "",
              status: "todo",
              priority: t.priority || "medium",
              position: i
            })
            .select()
            .single();
          if (task) tasksCreated.push(task);
        }
      }

      // Compile beautiful markdown confirmation text
      const confirmationText = `### 🚀 Project & Tasks Successfully Generated!\n\nI have parsed your prompt and generated a fully configured project board in your database:\n\n*   **Project Created**: **${project.name}**\n*   **Columns Initialized**: Backlog, Todo, In Progress, Review, Done\n*   **Tasks Seeded**:\n${tasksCreated.map((t, idx) => `    ${idx + 1}.  **${t.title}** (Priority: \`${t.priority}\`) - *${t.description}*`).join("\n")}\n\n*You can now open the newly generated project board under the Projects sidebar links!*`;

      return this.streamStaticText(confirmationText);
    } catch (err) {
      logger.error("AiService: Failed to generate project tasks board", err as Error);
      return this.streamStaticText(`### ⚠️ AI Task Generation Warning\n\nI processed your request to build a project, but encountered a schema mapping conflict while committing rows to the database. \n\n**Suggested next step**: Try creating the project manually under the Projects section and ask me to draft individual task specifications!`);
    }
  }

  /**
   * Action: Natural language smart search summarizing matches.
   */
  private async handleSmartSearch(
    workspaceId: string,
    query: string,
    provider: any
  ): Promise<ReadableStream<string>> {
    const client = createDbAdminClient();

    // Query databases for keyword matches
    const [
      { data: tasks },
      { data: channels },
      { data: messages }
    ] = await Promise.all([
      client.from("tasks").select("title, status").eq("workspace_id", workspaceId).ilike("title", `%${query.replace(/search|show|find/g, "").trim()}%`).limit(5),
      client.from("channels").select("name").eq("workspace_id", workspaceId).ilike("name", `%${query.replace(/search|show|find/g, "").trim()}%`).limit(5),
      client.from("messages").select("content").eq("workspace_id", workspaceId).ilike("content", `%${query.replace(/search|show|find/g, "").trim()}%`).limit(5)
    ]);

    const formattedHits = [
      `Tasks: ${(tasks || []).map(t => `${t.title} (${t.status})`).join(", ") || "None"}`,
      `Channels: ${(channels || []).map(c => `#${c.name}`).join(", ") || "None"}`,
      `Chat Messages: ${(messages || []).map(m => m.content).join(" | ") || "None"}`
    ].join("\n");

    const prompt = PROMPTS.SMART_SEARCH(query, formattedHits);
    return provider.generateStream(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Action: Daily Standup notes compilation.
   */
  private async handleDailyStandup(
    workspaceId: string,
    userId: string,
    provider: any
  ): Promise<ReadableStream<string>> {
    const client = createDbAdminClient();

    // Fetch user recent actions inside the workspace (last 24h)
    const { data: logs } = await client
      .from("activity_logs")
      .select("action, target_type, created_at")
      .eq("workspace_id", workspaceId)
      .eq("actor_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Fetch user assigned tasks
    const { data: assigned } = await client
      .from("tasks")
      .select("title, status, due_date")
      .eq("workspace_id", workspaceId)
      .eq("assignee_id", userId)
      .limit(5);

    const formattedLogs = (logs || []).map(l => `- Completed action: \`${l.action}\` on target \`${l.target_type}\` at ${new Date(l.created_at).toLocaleTimeString()}`).join("\n") || "No activity logged in the last 24h.";
    const formattedTasks = (assigned || []).map(t => `- Card: **${t.title}** (Status: \`${t.status}\`, Due: ${t.due_date || "None"})`).join("\n") || "No active tasks currently assigned.";

    const prompt = PROMPTS.DAILY_STANDUP(formattedLogs, formattedTasks);
    return provider.generateStream(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Action: Smart Assignment suggest workload.
   */
  private async handleSmartAssignment(
    workspaceId: string,
    query: string,
    provider: any
  ): Promise<ReadableStream<string>> {
    const client = createDbAdminClient();

    // Fetch active workspace members
    const { data: members } = await client
      .from("workspace_members")
      .select(`
        profile_id,
        profiles (email, first_name, last_name)
      `)
      .eq("workspace_id", workspaceId);

    // Fetch total active tasks counts grouped by assignee
    const { data: tasks } = await client
      .from("tasks")
      .select("assignee_id")
      .eq("workspace_id", workspaceId)
      .not("assignee_id", "is", null);

    const countMap: Record<string, number> = {};
    (tasks || []).forEach(t => {
      countMap[t.assignee_id] = (countMap[t.assignee_id] || 0) + 1;
    });

    const workloadList = (members || []).map((m: any) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      const name = prof ? `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || prof.email : m.profile_id;
      return `${name} (Profile ID: ${m.profile_id}) has ${countMap[m.profile_id] || 0} active assignments.`;
    }).join("\n");

    const prompt = `Suggest the best teammate to assign based on the following member workloads:\n${workloadList}\n\nUser Question: "${query}"`;
    return provider.generateStream(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Action: Prediction project milestone tracking.
   */
  private async handleDeadlinePrediction(
    workspaceId: string,
    provider: any
  ): Promise<ReadableStream<string>> {
    const client = createDbAdminClient();

    // Fetch tasks count & overdue cards
    const { data: tasks } = await client
      .from("tasks")
      .select("title, status, due_date")
      .eq("workspace_id", workspaceId);

    const now = new Date();
    let completed = 0;
    let total = 0;
    let overdue = 0;

    (tasks || []).forEach(t => {
      total++;
      if (t.status === "done") completed++;
      if (t.status !== "done" && t.due_date && new Date(t.due_date) < now) overdue++;
    });

    const contextStr = `Project Stats:\n- Completed Tasks: ${completed}/${total}\n- Overdue Tasks: ${overdue}\n- Average Completion Ratio: ${total ? Math.round((completed / total) * 100) : 0}%`;
    const prompt = `Predict project completion status (On Track, At Risk, Delayed) based on these metrics:\n${contextStr}`;
    return provider.generateStream(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Helper to resolve the active configured workspace AI provider
   */
  async getActiveProvider(workspaceId: string): Promise<any> {
    const client = createDbAdminClient();
    const { data: workspace } = await client
      .from("workspaces")
      .select("ai_provider")
      .eq("id", workspaceId)
      .single();

    const activeProviderName = workspace?.ai_provider || "gemini";
    return ProviderFactory.getProvider(activeProviderName);
  }

  /**
   * Summarizes channel or DM history and formats insights
   */
  async summarizeConversation(
    workspaceId: string,
    conversationType: "channel" | "dm",
    conversationId: string
  ): Promise<string> {
    await this.logAiActivity(workspaceId, "system", "summary", { conversationType, conversationId });
    const client = createDbAdminClient();
    let query = client
      .from("messages")
      .select("content, created_at, profile_id, profiles(first_name, last_name)")
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (conversationType === "channel") {
      query = query.eq("channel_id", conversationId);
    } else {
      query = query.eq("conversation_id", conversationId);
    }

    const { data: rawMsgs, error } = await query;
    if (error || !rawMsgs || rawMsgs.length === 0) {
      return "No recent conversation history found to summarize.";
    }

    const msgs = [...rawMsgs].reverse();
    const formatted = msgs.map(m => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      const sender = prof ? `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || "User" : m.profile_id;
      return `[${new Date(m.created_at).toLocaleTimeString()}] ${sender}: ${m.content}`;
    }).join("\n");

    const prompt = `You are asked to generate a comprehensive conversation summary of the following chat history. 
Please compile a structured summary covering:
1. **Key Points**: Summary of topics discussed.
2. **Decisions**: Any agreements or decisions made.
3. **Action Items**: Next steps with suggested assignees if visible.
4. **Open Questions**: Unresolved topics or follow-up questions.

TRANSCRIPT:
${formatted}`;

    const provider = await this.getActiveProvider(workspaceId);
    return provider.generateResponse(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Generates project tasks inside an existing board column
   */
  async generateTasks(
    workspaceId: string,
    projectId: string,
    goal: string
  ): Promise<any> {
    await this.logAiActivity(workspaceId, "system", "task_generator", { projectId, goal: goal.slice(0, 100) });
    const client = createDbAdminClient();
    const { data: cols } = await client
      .from("project_columns")
      .select("id, name")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .limit(1);

    if (!cols || cols.length === 0) {
      throw new Error("No columns found in the project. Please initialize the board columns first.");
    }
    const targetColId = cols[0].id;

    const prompt = `You are an expert project planner. Generate a list of task cards for a project board based on the goal: "${goal}".
Return the response in JSON format.
Your output MUST contain EXACTLY a JSON block enclosed in \`\`\`json and \`\`\` wrappers. No other text outside the JSON block.

The JSON schema must be:
{
  "tasks": [
    {
      "title": "Title of the task",
      "description": "Short description of what needs to be done",
      "priority": "high" | "medium" | "low",
      "due_in_days": number
    }
  ]
}

Ensure you generate 3 to 6 realistic tasks.`;

    const provider = await this.getActiveProvider(workspaceId);
    const response = await provider.generateResponse(prompt, PROMPTS.SYSTEM_ROLE);

    const jsonMatch = response.match(/```json([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();
    const parsed = JSON.parse(jsonStr);

    const createdTasks = [];
    if (parsed && Array.isArray(parsed.tasks)) {
      for (let i = 0; i < parsed.tasks.length; i++) {
        const t = parsed.tasks[i];
        let dueDate = null;
        if (typeof t.due_in_days === "number") {
          const d = new Date();
          d.setDate(d.getDate() + t.due_in_days);
          dueDate = d.toISOString();
        }

        const { data: task } = await client
          .from("tasks")
          .insert({
            workspace_id: workspaceId,
            project_id: projectId,
            column_id: targetColId,
            title: t.title || "Plan Action Task",
            description: t.description || "",
            status: "todo",
            priority: t.priority || "medium",
            position: i,
            due_date: dueDate
          })
          .select()
          .single();

        if (task) createdTasks.push(task);
      }
    }

    // Log activity and notify for AI-generated tasks
    if (createdTasks.length > 0) {
      try {
        await client.from("activity_logs").insert({
          workspace_id: workspaceId,
          actor_id: "system",
          action: "ai.tasks_generated",
          target_type: "project",
          target_id: projectId,
          metadata: { taskCount: createdTasks.length, goal }
        });

        // Fetch project members to notify
        const { data: projectData } = await client
          .from("projects")
          .select("name")
          .eq("id", projectId)
          .single();

        const { data: members } = await client
          .from("workspace_members")
          .select("profile_id")
          .eq("workspace_id", workspaceId);

        if (members && members.length > 0) {
          const { collaborationService } = await import("../backend/services/collaboration.service");
          for (const member of members) {
            await collaborationService.createNotification(
              workspaceId,
              member.profile_id,
              "ai_tasks_generated",
              "Nova Generated Tasks",
              `Nova AI created ${createdTasks.length} tasks for "${projectData?.name || "your project"}".`,
              `/workspace/${workspaceId}/project/${projectId}`,
              "project",
              projectId
            );
          }
        }
      } catch (notifErr) {
        // Non-blocking — don't fail the whole operation for notification issues
      }
    }

    return createdTasks;
  }

  /**
   * Summarizes meeting details and creates structured briefings
   */
  async summarizeMeeting(workspaceId: string, notes: string): Promise<string> {
    await this.logAiActivity(workspaceId, "system", "meeting_summary");
    const prompt = `You are a professional meeting scribe. Summarize the following meeting notes or transcript:
"${notes}"

Provide a comprehensive meeting summary in clean markdown covering:
1. **Executive Summary**: A high-level description of the meeting.
2. **Decisions**: Key conclusions and agreements reached.
3. **Risks**: Any potential blockers, dependencies, or risks identified.
4. **Action Items**: Detailed tasks, proposed owners, and target deadlines if specified.`;

    const provider = await this.getActiveProvider(workspaceId);
    return provider.generateResponse(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Rewrites draft writing compositions (translating, tone adjustment, expanding)
   */
  async rewriteText(workspaceId: string, text: string, action: string): Promise<string> {
    await this.logAiActivity(workspaceId, "system", "rewrite", { action });
    let actionInstruction = "";
    if (action === "improve") {
      actionInstruction = "Improve the writing style, spelling, grammar, and flow while keeping the meaning intact.";
    } else if (action === "shorten") {
      actionInstruction = "Shorten the text significantly, make it brief and concise.";
    } else if (action === "expand") {
      actionInstruction = "Expand the text slightly, adding more detail and context.";
    } else if (action === "professional") {
      actionInstruction = "Rewrite the text in a highly professional, business-appropriate tone.";
    } else if (action === "friendly") {
      actionInstruction = "Rewrite the text in a warm, friendly, and approachable tone.";
    } else if (action.startsWith("translate:")) {
      const lang = action.split(":")[1] || "English";
      actionInstruction = `Translate the text into ${lang} language, preserving meaning and style.`;
    } else {
      actionInstruction = "Refine the writing style.";
    }

    const prompt = `You are an expert writing assistant. Rewrite the following text according to these instructions:
"${actionInstruction}"

Original Text:
"${text}"

Return ONLY the rewritten text, without any preambles, comments, explanation or wrappers.`;

    const provider = await this.getActiveProvider(workspaceId);
    return provider.generateResponse(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Search workspace items and formulate a summarized solution with references
   */
  async semanticSearch(workspaceId: string, query: string): Promise<string> {
    await this.logAiActivity(workspaceId, "system", "search", { query: query.slice(0, 100) });
    const client = createDbAdminClient();
    const cleanTerm = query.replace(/search|find|show/gi, "").trim();

    const [
      { data: tasks },
      { data: channels },
      { data: messages }
    ] = await Promise.all([
      client.from("tasks").select("title, status, priority, due_date").eq("workspace_id", workspaceId).ilike("title", `%${cleanTerm}%`).limit(10),
      client.from("channels").select("name, description").eq("workspace_id", workspaceId).ilike("name", `%${cleanTerm}%`).limit(5),
      client.from("messages").select("content, created_at, channels(name)").eq("workspace_id", workspaceId).ilike("content", `%${cleanTerm}%`).limit(10)
    ]);

    const formattedHits = [
      `Tasks: ${(tasks || []).map(t => `${t.title} (Status: ${t.status}, Priority: ${t.priority}, Due: ${t.due_date || "None"})`).join(", ") || "None"}`,
      `Channels: ${(channels || []).map(c => `#${c.name} (${c.description || "No desc"})`).join(", ") || "None"}`,
      `Chat Messages: ${(messages || []).map(m => `[#${(m.channels as any)?.name || "unknown"}] "${m.content}"`).join(" | ") || "None"}`
    ].join("\n");

    const prompt = `You are a search assistant. Solve the user's natural language question: "${query}" using the matching items found in the workspace database:

---
WORKSPACE HITS:
${formattedHits}
---

Provide a well-structured summary answering their question. If specific tasks, channels, or messages match, mention them clearly. Make your response helpful and highly readable in markdown format.`;

    const provider = await this.getActiveProvider(workspaceId);
    return provider.generateResponse(prompt, PROMPTS.SYSTEM_ROLE);
  }

  /**
   * Helper: Yields a static text stream.
   */
  private streamStaticText(text: string): ReadableStream<string> {
    return new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      }
    });
  }

  /**
   * Helper: Logs AI operations to activity logs table
   */
  private async logAiActivity(workspaceId: string, userId: string, action: string, metadata?: any): Promise<void> {
    try {
      const client = createDbAdminClient();
      await client.from("activity_logs").insert({
        workspace_id: workspaceId,
        actor_id: userId || "system",
        action: `ai.${action}`,
        target_type: "workspace",
        target_id: workspaceId,
        metadata: metadata || {}
      });
    } catch (err) {
      logger.warn(`Failed to log AI activity for ${action}`, { error: String(err) });
    }
  }
}

export const aiService = new AiService();
