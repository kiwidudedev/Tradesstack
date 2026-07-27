import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

type ServerSupabaseClientOptions = {
  requestTimeoutMs?: number;
};

export async function createServerSupabaseClient(options: ServerSupabaseClientOptions = {}) {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  const requestTimeoutMs = options.requestTimeoutMs;

  return createServerClient<Database>(url, anonKey, {
    ...(requestTimeoutMs
      ? {
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetchWithTimeout(input, init ?? {}, requestTimeoutMs),
          },
        }
      : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // This can execute in contexts where cookies are read-only.
        }
      },
    },
  });
}
