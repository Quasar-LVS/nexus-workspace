/**
 * Reusable Prompt Templates for Nova AI Hub.
 * Avoids hardcoding prompts directly inside UI components or services.
 */
export const PROMPTS = {
  SYSTEM_ROLE: `You are Nova, the intelligent workspace AI assistant for Nexus (a platform combining Slack chat and Asana task management). 
Your goal is to help users synthesize discussions, generate structured project plans, predicted milestones, smart search logs, and daily standups.
Always render responses in clean Markdown format with headers, bullet points, and code highlights where appropriate.`,

  WORKSPACE_SUMMARY: (contextData: string) => `
You are asked to generate a comprehensive workspace summary. 
Below is the gathered workspace context data (including channels, recent messages, DMs, projects, tasks, and recent task comments):

---
CONTEXT DATA:
${contextData}
---

Please analyze the context and provide a structured Workspace Summary covering:
1. Active discussion topics in channels and DMs.
2. Key decisions made.
3. Urgent tasks, due dates, and task statuses.
4. Recommendations for action items.
`,

  MEETING_SUMMARY: (transcript: string) => `
You are asked to summarize the following conversation transcript.
Provide a clean summary covering:
1. Key Discussion Points.
2. Decisions Confirmed.
3. Action Items with potential assignees.

TRANSCRIPT:
${transcript}
`,

  TASK_GENERATOR: (projectGoal: string) => `
You are tasked with generating a detailed project plan based on the user's goal: "${projectGoal}".
Provide your recommendation in a clean JSON format so it can be parsed and inserted directly into the database. 
Your output MUST contain EXACTLY a JSON block enclosed in \`\`\`json and \`\`\` wrappers. No other text outside the JSON block.

The JSON schema must be:
{
  "projectName": "Name of the new project based on the goal",
  "tasks": [
    {
      "title": "Title of the task",
      "description": "Short description of what needs to be done",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Ensure you generate 3 to 5 realistic tasks necessary to achieve this project goal.
`,

  AI_WRITING: (prompt: string, type: string) => `
Write a high-quality ${type} based on the following request: "${prompt}".
Ensure the layout is well-formatted, professional, and written in clean markdown.
`,

  DAILY_STANDUP: (activityLogs: string, tasksAssigned: string) => `
Generate a structured Daily Standup Report covering Yesterday, Today, and Blocked sections.
Below is the teammate's database context:

Activity Logs (actions completed in the last 24h):
${activityLogs}

Tasks Assigned (open tasks due soon):
${tasksAssigned}

Formulate a concise standup update for this user in bullet-point format.
`,

  SMART_SEARCH: (query: string, searchResults: string) => `
Analyze the search results for the user's natural language query: "${query}".
Summarize the findings and provide clickable links or references to the matching channels, tasks, or conversations.

MATCHING DATA:
${searchResults}
`
};
