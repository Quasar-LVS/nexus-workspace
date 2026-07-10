import { AIProvider } from "../provider";
import { MockAIProvider } from "./mock";

export class KimiProvider implements AIProvider {
  private apiKey: string | null = null;
  private fallback = new MockAIProvider();

  constructor() {
    this.apiKey = process.env.KIMI_API_KEY || null;
  }

  async generateResponse(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.apiKey) return this.fallback.generateResponse(prompt, systemPrompt);

    try {
      const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "moonshot-v1-8k",
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        })
      });

      if (!res.ok) throw new Error(`Kimi error: ${res.statusText}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (err) {
      console.warn("Kimi execution failed. Falling back to Mock.", err);
      return this.fallback.generateResponse(prompt, systemPrompt);
    }
  }

  async generateStream(prompt: string, systemPrompt?: string): Promise<ReadableStream<string>> {
    if (!this.apiKey) return this.fallback.generateStream(prompt, systemPrompt);

    try {
      const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "moonshot-v1-8k",
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          stream: true
        })
      });

      if (!res.ok || !res.body) throw new Error(`Kimi stream error: ${res.statusText}`);

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
                  if (dataStr === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) controller.enqueue(content);
                  } catch {}
                }
              }
            }
            controller.close();
          } catch (err) {
            console.warn("Kimi stream chunk error", err);
            controller.close();
          }
        }
      });
    } catch (err) {
      console.warn("Kimi stream initiation failed. Falling back to Mock stream.", err);
      return this.fallback.generateStream(prompt, systemPrompt);
    }
  }
}
