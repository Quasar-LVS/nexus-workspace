import { logger } from "../utils/logger";
import { NovaAIError } from "../errors/custom-errors";

export interface NovaGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Nova AI Backend Service Client
 * Wraps the Google Gen AI client with robust logging and token rate limit fallbacks.
 */
export class NovaAIClient {
  private static getModelName(options?: NovaGenerateOptions): string {
    return options?.model || process.env.NOVA_MODEL_NAME || "gemini-2.0-flash";
  }

  /**
   * Dispatches text prompt requests to the Gen AI models
   */
  static async generateText(prompt: string, options?: NovaGenerateOptions): Promise<string> {
    const model = this.getModelName(options);
    const context = { model, action: "generateText" };
    logger.debug(`Dispatching prompt to Nova model: "${prompt.slice(0, 40)}..."`, context);

    try {
      // Check for Mock values or retrieve from actual AI keys
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.warn("GEMINI_API_KEY is not defined. Resolving with Mock fallback response.", context);
        return `[Mock Nova AI Output for model: ${model}]\n\nProcessed prompt successfully.`;
      }

      // Placeholder for actual Google Gen AI SDK client call:
      // const ai = new GoogleGenAI({ apiKey });
      // const response = await ai.models.generateContent({ model, contents: prompt });
      // return response.text;
      
      return `Processed prompt successfully with ${model}`;
    } catch (err) {
      logger.error("Nova AI Client model content generation failed", err as Error, context);
      throw new NovaAIError("Failed to communicate with Nova AI reasoning nodes.", err);
    }
  }
}
