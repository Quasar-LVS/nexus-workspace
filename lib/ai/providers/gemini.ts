import { GoogleGenerativeAI } from "@google/generative-ai";
   import { AIProvider } from "../provider";
   import { MockAIProvider } from "./mock";

   export class GeminiProvider implements AIProvider {
     private client: GoogleGenerativeAI | null = null;
     private fallback = new MockAIProvider();

     constructor() {
       const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
       if (apiKey) {
         this.client = new GoogleGenerativeAI(apiKey);
       }
     }

     async generateResponse(prompt: string, systemPrompt?: string): Promise<string> {
       if (!this.client) return this.fallback.generateResponse(prompt, systemPrompt);
       try {
         const model = this.client.getGenerativeModel({ model: "gemini-1.5-flash" });
         const result = await model.generateContent({
           contents: [{ role: "user", parts: [{ text: prompt }] }],
           systemInstruction: systemPrompt
         });
         return result.response.text();
       } catch (err) {
         console.warn("Gemini execution failed. Falling back to Mock.", err);
         return this.fallback.generateResponse(prompt, systemPrompt);
       }
     }

     async generateStream(prompt: string, systemPrompt?: string): Promise<ReadableStream<string>> {
       if (!this.client) return this.fallback.generateStream(prompt, systemPrompt);
       try {
         const model = this.client.getGenerativeModel({ model: "gemini-1.5-flash" });
         const result = await model.generateContentStream({
           contents: [{ role: "user", parts: [{ text: prompt }] }],
           systemInstruction: systemPrompt
         });
         
         return new ReadableStream<string>({
           async start(controller) {
             try {
               for await (const chunk of result.stream) {
                 const text = chunk.text();
                 if (text) controller.enqueue(text);
               }
               controller.close();
             } catch (err) {
               console.warn("Gemini stream chunk failure. Closing.", err);
               controller.close();
             }
           }
         });
       } catch (err) {
         console.warn("Gemini stream initiation failed. Falling back to Mock stream.", err);
         return this.fallback.generateStream(prompt, systemPrompt);
       }
     }
   }
