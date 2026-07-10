import { AIProvider } from "../provider";

/**
 * Mock AI Provider
 * Falls back gracefully to simulate streaming outputs and context-aware markdown summaries.
 */
export class MockAIProvider implements AIProvider {
  private mockGenerate(prompt: string): string {
    const p = prompt.toLowerCase();

    if (p.includes("summary") || p.includes("summarize")) {
      return `### 📊 Workspace Activity Summary\n\nHere is a synthesized summary of recent activities and communications across your channels:\n\n*   **Active Discussions**: The engineering team resolved the Clerk auth redirects and validated token refreshes.\n*   **Key Decisions**: Merged the direct messaging routing structure under \`/workspace/[workspaceSlug]/dm\`.\n*   **Critical Actions**: Set up Supabase Presence channels to track user online statuses live in the sidebar.\n*   **Task Updates**: Completed the "Getting Started" onboarding tasks and initialized project boards.`;
    }

    if (p.includes("standup") || p.includes("yesterday")) {
      return `### ⏰ Daily Standup Report\n\nHere is the compiled daily standup report for the team:\n\n*   **Yesterday (Completed)**: Merged Sprint 6 database migrations and implemented typing indicator timers.\n*   **Today (In Progress)**: Integrating the strategy pattern AI factory and testing streaming SSE endpoints.\n*   **Blocked**: None. Awaiting final feedback on client settings layout designs.`;
    }

    if (p.includes("task") || p.includes("project plan") || p.includes("build a")) {
      if (p.includes("json") || p.includes("schema")) {
        return `\`\`\`json
{
  "tasks": [
    {
      "title": "Setup Clerk Middleware Redirects",
      "description": "Configure path routing rules and handle public vs private route exemptions in Clerk middleware.",
      "priority": "high",
      "due_in_days": 2
    },
    {
      "title": "Design Auth Database Schema & RLS",
      "description": "Establish workspace-level isolation filters, setup profile schemas, and enforce SELECT/UPDATE security policies.",
      "priority": "high",
      "due_in_days": 3
    },
    {
      "title": "Implement Login Forms UI Panels",
      "description": "Build high-performance components using Geist design system styles and responsive spacing.",
      "priority": "medium",
      "due_in_days": 5
    },
    {
      "title": "Write Authentication Integration Tests",
      "description": "Ensure validation blocks run correctly under strict Jest/Playwright coverage plans.",
      "priority": "medium",
      "due_in_days": 7
    }
  ]
}
\`\`\``;
      }
      return `### 🛠️ Structured Project Plan Generated\n\nI have created a new project board and seeded it with columns and cards based on your request:\n\n*   **Project**: Authentication & Login Module\n*   **Default Columns**: Backlog, Todo, In Progress, Review, Done\n*   **Generated Cards**:\n    1.  *Setup Clerk Middleware Redirects* (Priority: **High**, Estimate: **3 hrs**)\n    2.  *Design Auth Database Schema & RLS* (Priority: **High**, Estimate: **2 hrs**)\n    3.  *Implement Login Forms UI UI Panels* (Priority: **Medium**, Estimate: **4 hrs**)\n    4.  *Write Authentication Integration Tests* (Priority: **Medium**, Estimate: **3 hrs**)\n\n*All tasks have been successfully inserted into your workspace task database and linked to the board.*`;
    }

    if (p.includes("assign") || p.includes("workload")) {
      return `### 👥 Teammate Workload & Assignee Suggestions\n\nBased on current assignments and task completion histories, here is the suggested assignment:\n\n*   **Suggested Assignee**: **Vijay**\n*   **Reasoning**: Vijay has completed 4 onboarding tasks today and has the lowest active task count (2 tasks). Other members have higher workloads.`;
    }

    if (p.includes("predict") || p.includes("deadline") || p.includes("track")) {
      return `### 📈 Project Deadline & Completion Predictions\n\n*   **Project Status**: **On Track**\n*   **Estimated Completion**: Friday, July 10 (ahead of schedule)\n*   **Analysis**: 80% of milestone tasks are completed, and active cards have an average cycle time of less than 24 hours.`;
    }

    if (p.includes("search") || p.includes("unfinished")) {
      return `### 🔍 Smart Search Results\n\nHere are the most relevant matching workspace items:\n\n1.  **Task**: *Setup Clerk Middleware Redirects* (Status: **Todo**)\n2.  **Channel Message**: *#general* - "Authentication client is working."`;
    }

    return `### 👋 Hello! I'm Nova, your AI Workspace Assistant.\n\nI can help you coordinate workspace activities, generate task columns, summarize discussions, predict deadlines, and search natural language datasets. Try asking me:\n- *"Summarize today's discussion"* \n- *"Who was assigned tasks today?"* \n- *"Show all urgent tasks"*`;
  }

  async generateResponse(prompt: string, systemPrompt?: string): Promise<string> {
    return this.mockGenerate(prompt);
  }

  async generateStream(prompt: string, systemPrompt?: string): Promise<ReadableStream<string>> {
    const text = this.mockGenerate(prompt);
    
    // Standard web readable stream yielding string chunks
    return new ReadableStream<string>({
      start(controller) {
        const words = text.split(" ");
        let i = 0;
        const interval = setInterval(() => {
          if (i >= words.length) {
            clearInterval(interval);
            controller.close();
            return;
          }
          // Yield word + space
          controller.enqueue(words[i] + " ");
          i++;
        }, 30); // 30ms per word simulates smooth stream
      }
    });
  }
}
