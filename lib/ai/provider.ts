/**
 * AIProvider Strategy Interface
 * Every AI model provider (Gemini, OpenAI, Claude, Kimi, Mock) must implement this interface.
 */
export interface AIProvider {
  /**
   * Generates a complete text response synchronously/asynchronously.
   */
  generateResponse(prompt: string, systemPrompt?: string): Promise<string>;

  /**
   * Generates a streaming text response returning chunks via a ReadableStream.
   */
  generateStream(prompt: string, systemPrompt?: string): Promise<ReadableStream<string>>;
}
