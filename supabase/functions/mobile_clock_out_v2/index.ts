import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ClockOutRequest = {
  client_entry_id?: string | null;
  clock_out_latitude?: number | null;
  clock_out_longitude?: number | null;
  clock_out_accuracy_meters?: number | null;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  display_name: string;
};

type TimeSheetEntryRow = {
  id: string;
  organization_id: string;
  project_id: string;
  worker_member_id: string | null;
  worker_user_id: string;
  worker_name: string;
  purchase_order_id: string | null;
  purchase_order_number: string;
  purchase_order_title: string;
  client_entry_id: string | null;
  source: string;
  created_from_device_id: string | null;
  synced_at: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_accuracy_meters: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_out_accuracy_meters: number | null;
  total_hours: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

type TimeSheetEventRow = {
  id: string;
  entry_id: string | null;
  event_type: string;
  message: string;
  created_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function errorResponse(message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse(
    {
      ok: false,
      error: message,
      ...(extra ?? {}),
    },
    status
  );
}

function buildOptionsResponse() {
  return new Response("ok", {
    status: 200,
    headers: corsHeaders,
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

function createAuthenticatedClient(request: Request) {
  const accessToken = parseBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return { accessToken: null, client: null };
  }

  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  return { accessToken, client };
}

function readRequiredString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalNumber(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Number.NaN;
  }

  return value;
}

function validateLatitude(value: number | null) {
  if (value === null) {
    return true;
  }

  return value >= -90 && value <= 90;
}

function validateLongitude(value: number | null) {
  if (value === null) {
    return true;
  }

  return value >= -180 && value <= 180;
}

function validateAccuracy(value: number | null) {
  if (value === null) {
    return true;
  }

  return value >= 0;
}

function computeTotalHours(clockInAt: string, clockOutAt: string) {
  const startAt = new Date(clockInAt);
  const endAt = new Date(clockOutAt);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return null;
  }

  const elapsedHours = Math.max(0, (endAt.getTime() - startAt.getTime()) / 3_600_000);
  return Math.round(elapsedHours * 100) / 100;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return buildOptionsResponse();
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed. Use POST.", 405);
  }

  const { accessToken, client } = createAuthenticatedClient(request);
  if (!accessToken || !client) {
    return errorResponse("Missing or invalid bearer token.", 401);
  }

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser(accessToken);

  if (userError || !user) {
    return errorResponse("Unauthorized.", 401);
  }

  let payload: ClockOutRequest = {};
  try {
    payload = (await request.json()) as ClockOutRequest;
  } catch {
    payload = {};
  }

  const clientEntryId = readRequiredString(payload.client_entry_id);
  if (!clientEntryId) {
    return errorResponse("client_entry_id is required.", 400);
  }

  const hasClockOutLatitude = Object.prototype.hasOwnProperty.call(payload, "clock_out_latitude");
  const hasClockOutLongitude = Object.prototype.hasOwnProperty.call(payload, "clock_out_longitude");
  const hasClockOutAccuracy = Object.prototype.hasOwnProperty.call(payload, "clock_out_accuracy_meters");

  const clockOutLatitude = readOptionalNumber(payload.clock_out_latitude);
  const clockOutLongitude = readOptionalNumber(payload.clock_out_longitude);
  const clockOutAccuracyMeters = readOptionalNumber(payload.clock_out_accuracy_meters);

  if ((hasClockOutLatitude && Number.isNaN(clockOutLatitude)) || !validateLatitude(clockOutLatitude)) {
    return errorResponse("clock_out_latitude must be between -90 and 90 when supplied.", 400);
  }

  if ((hasClockOutLongitude && Number.isNaN(clockOutLongitude)) || !validateLongitude(clockOutLongitude)) {
    return errorResponse("clock_out_longitude must be between -180 and 180 when supplied.", 400);
  }

  if ((hasClockOutAccuracy && Number.isNaN(clockOutAccuracyMeters)) || !validateAccuracy(clockOutAccuracyMeters)) {
    return errorResponse("clock_out_accuracy_meters must be zero or greater when supplied.", 400);
  }

  const { data: memberships, error: membershipsError } = await client
    .from("organization_members")
    .select("id, organization_id, user_id, role, display_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    return errorResponse("Failed to load organization memberships.", 500, {
      detail: membershipsError.message,
    });
  }

  const memberRows = (memberships ?? []) as MembershipRow[];
  if (memberRows.length === 0) {
    return errorResponse("Organization membership not found.", 403);
  }

  const organizationIds = Array.from(new Set(memberRows.map((row) => row.organization_id)));
  const { data: matchedEntries, error: matchedEntriesError } = await client
    .from("project_time_sheet_entries")
    .select(
      "id, organization_id, project_id, worker_member_id, worker_user_id, worker_name, purchase_order_id, purchase_order_number, purchase_order_title, client_entry_id, source, created_from_device_id, synced_at, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, clock_out_latitude, clock_out_longitude, clock_out_accuracy_meters, total_hours, notes, created_at, updated_at"
    )
    .in("organization_id", organizationIds)
    .eq("worker_user_id", user.id)
    .eq("client_entry_id", clientEntryId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (matchedEntriesError) {
    return errorResponse("Failed to load time sheet entry.", 500, {
      detail: matchedEntriesError.message,
    });
  }

  const entry = ((matchedEntries ?? []) as TimeSheetEntryRow[])[0] ?? null;
  if (!entry) {
    return errorResponse("Time sheet entry not found.", 404);
  }

  if (entry.clock_out_at) {
    return jsonResponse({
      ok: true,
      created: false,
      idempotent: true,
      entry,
    });
  }

  const member = memberRows.find((row) => row.organization_id === entry.organization_id) ?? null;
  if (!member) {
    return errorResponse("Organization membership not found.", 403);
  }

  const clockOutAt = new Date().toISOString();
  const totalHours = computeTotalHours(entry.clock_in_at, clockOutAt);
  if (totalHours === null) {
    return errorResponse("Failed to compute total_hours from clock_in_at.", 500);
  }

  const syncedAt = clockOutAt;
  const updates: Record<string, unknown> = {
    clock_out_at: clockOutAt,
    total_hours: totalHours,
    synced_at: syncedAt,
  };

  if (hasClockOutLatitude) {
    updates.clock_out_latitude = clockOutLatitude;
  }

  if (hasClockOutLongitude) {
    updates.clock_out_longitude = clockOutLongitude;
  }

  if (hasClockOutAccuracy) {
    updates.clock_out_accuracy_meters = clockOutAccuracyMeters;
  }

  const { data: updatedEntry, error: updatedEntryError } = await client
    .from("project_time_sheet_entries")
    .update(updates)
    .eq("id", entry.id)
    .eq("organization_id", entry.organization_id)
    .eq("worker_user_id", user.id)
    .is("clock_out_at", null)
    .select(
      "id, organization_id, project_id, worker_member_id, worker_user_id, worker_name, purchase_order_id, purchase_order_number, purchase_order_title, client_entry_id, source, created_from_device_id, synced_at, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, clock_out_latitude, clock_out_longitude, clock_out_accuracy_meters, total_hours, notes, created_at, updated_at"
    )
    .maybeSingle();

  if (updatedEntryError) {
    return errorResponse("Failed to close time sheet entry.", 500, {
      detail: updatedEntryError.message,
    });
  }

  if (!updatedEntry) {
    const { data: replayEntries, error: replayEntriesError } = await client
      .from("project_time_sheet_entries")
      .select(
        "id, organization_id, project_id, worker_member_id, worker_user_id, worker_name, purchase_order_id, purchase_order_number, purchase_order_title, client_entry_id, source, created_from_device_id, synced_at, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, clock_out_latitude, clock_out_longitude, clock_out_accuracy_meters, total_hours, notes, created_at, updated_at"
      )
      .eq("id", entry.id)
      .eq("organization_id", entry.organization_id)
      .eq("worker_user_id", user.id)
      .limit(1);

    if (replayEntriesError) {
      return errorResponse("Failed to reload closed time sheet entry.", 500, {
        detail: replayEntriesError.message,
      });
    }

    const replayEntry = ((replayEntries ?? []) as TimeSheetEntryRow[])[0] ?? null;
    if (!replayEntry) {
      return errorResponse("Time sheet entry not found after close attempt.", 404);
    }

    return jsonResponse({
      ok: true,
      created: false,
      idempotent: true,
      entry: replayEntry,
    });
  }

  const eventMessage =
    updatedEntry.purchase_order_number.trim().length > 0
      ? `Clocked out via mobile for purchase order ${updatedEntry.purchase_order_number}.`
      : "Clocked out via mobile.";

  const { data: insertedEvent, error: insertedEventError } = await client
    .from("project_time_sheet_events")
    .insert({
      organization_id: updatedEntry.organization_id,
      project_id: updatedEntry.project_id,
      entry_id: updatedEntry.id,
      actor_user_id: user.id,
      worker_name: updatedEntry.worker_name,
      event_type: "clock_out",
      message: eventMessage,
    })
    .select("id, entry_id, event_type, message, created_at")
    .single();

  if (insertedEventError || !insertedEvent) {
    return errorResponse("Failed to create time sheet event.", 500, {
      detail: insertedEventError?.message,
      entry_id: updatedEntry.id,
    });
  }

  return jsonResponse({
    ok: true,
    created: true,
    idempotent: false,
    entry: updatedEntry,
    event: insertedEvent as TimeSheetEventRow,
  });
});
