import { createClient as createBaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service";

/**
 * Creates a standard server-side client with cookies forwarded.
 * Enforces database Row Level Security (RLS) based on the user session.
 */
export async function createDbServerClient() {
  const cookieStore = await cookies();
  
  let token: string | null = null;
  try {
    const authObj = await auth();
    if (authObj && authObj.userId) {
      token = await authObj.getToken({ template: "supabase" });
    }
  } catch {
    // Ignore context failure outside request handlers
  }

  const globalHeaders: Record<string, string> = {};
  if (token) {
    globalHeaders["Authorization"] = `Bearer ${token}`;
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Handled if called from dynamic server components where headers are read-only
        }
      },
    },
    global: {
      headers: globalHeaders,
    },
  });
}

/**
 * Creates an administrative client using the Supabase Service Role key.
 * WARNING: This client bypasses all Row Level Security (RLS) policies.
 * Use strictly inside secure webhook events or background synchronizations.
 */
export function createDbAdminClient() {
  return createBaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
