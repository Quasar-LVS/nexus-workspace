import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger";

const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  logger.info("Nova AI: Gemini API client successfully initialized.");
} else {
  logger.warn("Nova AI: GEMINI_API_KEY is not defined. Falling back to mock engine responses.");
}

export async function askGemini(prompt: string, fallbackResponse: string): Promise<string> {
  if (!genAI) {
    logger.debug("Nova AI (Mock Mode): Processing prompt", { prompt: prompt.slice(0, 100) });
    return fallbackResponse;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (err: any) {
    logger.error("Nova AI: Gemini API request encountered an error", err);
    return fallbackResponse;
  }
}
