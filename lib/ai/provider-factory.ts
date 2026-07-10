import { AIProvider } from "./provider";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";
import { ClaudeProvider } from "./providers/claude";
import { KimiProvider } from "./providers/kimi";
import { MockAIProvider } from "./providers/mock";

/**
 * ProviderFactory
 * Instantiates the selected active AI strategy.
 */
export class ProviderFactory {
  /**
   * Resolves the selected AIProvider strategy instance.
   */
  static getProvider(providerType: string): AIProvider {
    const type = (providerType || "gemini").toLowerCase().trim();

    switch (type) {
      case "gemini":
        return new GeminiProvider();
      case "openai":
        return new OpenAIProvider();
      case "claude":
        return new ClaudeProvider();
      case "kimi":
        return new KimiProvider();
      case "mock":
      default:
        return new MockAIProvider();
    }
  }
}
