// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

type RulesResponse = {
  processed_warnings: number;
  processed_auto_clock_outs: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = Deno.env.get("TIME_SHEETS_CRON_SECRET");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function parseBearerToken(headerValue: string | null) {
  if (!headerValue) {
    return null;
  }
  const [scheme, token] = headerValue.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (CRON_SECRET) {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token || token !== CRON_SECRET) {
      return unauthorized();
    }
  }

  let body: { project_id?: string; max_rows?: number } = {};
  try {
    body = (await request.json()) as { project_id?: string; max_rows?: number };
  } catch {
    body = {};
  }

  const maxRows = typeof body.max_rows === "number" ? Math.max(1, Math.min(10000, Math.floor(body.max_rows))) : 2000;
  const projectId = typeof body.project_id === "string" && body.project_id.trim().length > 0 ? body.project_id : null;

  const { data, error } = await supabase.rpc("process_project_time_sheet_rules", {
    p_now: new Date().toISOString(),
    p_project_id: projectId,
    p_max_rows: maxRows,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const row = (Array.isArray(data) ? data[0] : null) as RulesResponse | null;
  return new Response(
    JSON.stringify({
      ok: true,
      processed_warnings: row?.processed_warnings ?? 0,
      processed_auto_clock_outs: row?.processed_auto_clock_outs ?? 0,
      processed_at: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
