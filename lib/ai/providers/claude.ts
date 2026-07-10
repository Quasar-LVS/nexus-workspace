import { AIProvider } from "../provider";
import { MockAIProvider } from "./mock";

export class ClaudeProvider implements AIProvider {
  private apiKey: string | null = null;
  private fallback = new MockAIProvider();

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || null;
  }

  async generateResponse(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.apiKey) return this.fallback.generateResponse(prompt, systemPrompt);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
          ...(systemPrompt ? { system: systemPrompt } : {})
        })
      });

      if (!res.ok) throw new Error(`Claude error: ${res.statusText}`);
      const data = await res.json();
      return data.content?.[0]?.text || "";
    } catch (err) {
      console.warn("Claude execution failed. Falling back to Mock.", err);
      return this.fallback.generateResponse(prompt, systemPrompt);
    }
  }

  async generateStream(prompt: string, systemPrompt?: string): Promise<ReadableStream<string>> {
    if (!this.apiKey) return this.fallback.generateStream(prompt, systemPrompt);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
          ...(systemPrompt ? { system: systemPrompt } : {}),
          stream: true
        })
      });

      if (!res.ok || !res.body) throw new Error(`Claude stream error: ${res.statusText}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      return new ReadableStream<string>({
        async start(controller) {
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const cleanLine = line.trim();
                if (!cleanLine) continue;
                if (cleanLine.startsWith("data: ")) {
                  const dataStr = cleanLine.slice(6).trim();
                  try {
                    const parsed = JSON.parse(dataStr);
                    const text = parsed.delta?.text;
                    if (text) controller.enqueue(text);
                  } catch {}
                }
              }
            }
            controller.close();
          } catch (err) {
            console.warn("Claude stream chunk error", err);
            controller.close();
          }
        }
      });
    } catch (err) {
      console.warn("Claude stream initiation failed. Falling back to Mock stream.", err);
      return this.fallback.generateStream(prompt, systemPrompt);
    }
  }
}
