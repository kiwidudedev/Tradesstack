interface SupabaseEnv {
  url: string;
  anonKey: string;
}

interface SupabaseServiceRoleEnv {
  url: string;
  serviceRoleKey: string;
}

declare const __TRADESSTACK_SUPABASE_URL__: string | undefined;
declare const __TRADESSTACK_SUPABASE_ANON_KEY__: string | undefined;

function getPublicSupabaseEnvValue(
  runtimeValue: string | undefined,
  buildTimeValue: string | undefined,
): string | undefined {
  return runtimeValue || buildTimeValue;
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = getPublicSupabaseEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    typeof __TRADESSTACK_SUPABASE_URL__ === "undefined"
      ? undefined
      : __TRADESSTACK_SUPABASE_URL__,
  );
  const anonKey = getPublicSupabaseEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    typeof __TRADESSTACK_SUPABASE_ANON_KEY__ === "undefined"
      ? undefined
      : __TRADESSTACK_SUPABASE_ANON_KEY__,
  );

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return { url, anonKey };
}

export function getSupabaseServiceRoleEnv(): SupabaseServiceRoleEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase service role environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return { url, serviceRoleKey };
}
