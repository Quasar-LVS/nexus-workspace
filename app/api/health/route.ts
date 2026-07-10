import { NextResponse } from "next/server";
import { createDbAdminClient } from "@/lib/backend/database/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  const environment = process.env.NODE_ENV || "development";

  // 1. Database Connectivity Check
  let databaseStatus: "healthy" | "degraded" = "degraded";
  const client = createDbAdminClient();
  try {
    const { error } = await client.from("profiles").select("id").limit(1);
    if (!error) {
      databaseStatus = "healthy";
    }
  } catch (err) {
    // Suppress crash, service is degraded
  }

  // 2. Storage Bucket Accessibility Check
  let storageStatus: "healthy" | "degraded" = "degraded";
  try {
    const { error } = await client.storage.getBucket("attachments");
    if (!error) {
      storageStatus = "healthy";
    }
  } catch (err) {
    // Suppress crash
  }

  // 3. Clerk Configuration Check
  let authStatus: "healthy" | "degraded" = "degraded";
  try {
    const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const secKey = process.env.CLERK_SECRET_KEY;
    if (pubKey && secKey && pubKey.startsWith("pk_") && secKey.startsWith("sk_")) {
      authStatus = "healthy";
    }
  } catch (err) {
    // Suppress crash
  }

  // 4. AI Provider Check
  let aiStatus: "healthy" | "mock" | "degraded" = "degraded";
  try {
    const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY);
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasClaude = !!process.env.ANTHROPIC_API_KEY;
    const hasKimi = !!process.env.KIMI_API_KEY;

    if (hasGemini || hasOpenAI || hasClaude || hasKimi) {
      aiStatus = "healthy";
    } else {
      // Graceful fallback to MockAIProvider
      aiStatus = "mock";
    }
  } catch (err) {
    // Suppress crash
  }

  // Aggregate Status
  const isHealthy =
    databaseStatus === "healthy" &&
    storageStatus === "healthy" &&
    authStatus === "healthy" &&
    (aiStatus === "healthy" || aiStatus === "mock");

  const status = isHealthy ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      version: "1.0.0",
      timestamp,
      environment,
      services: {
        database: databaseStatus,
        storage: storageStatus,
        auth: authStatus,
        ai: aiStatus,
      },
    },
    { status: 200 }
  );
}
