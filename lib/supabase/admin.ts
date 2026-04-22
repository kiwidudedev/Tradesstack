import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export function createAdminSupabaseClient() {
  const { url, serviceRoleKey } = getSupabaseServiceRoleEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
