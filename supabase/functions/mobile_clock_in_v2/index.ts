import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { FULL_TIME_SHEET_ENTRY_SELECT, autoCloseStaleTimeSheetEntries } from "../_shared/stale-time-sheet.ts";

type ClockInRequest = {
  project_id?: string | null;
  purchase_order_id?: string | null;
  client_entry_id?: string | null;
  clock_in_at?: string | null;
  created_from_device_id?: string | null;
  clock_in_latitude?: number | null;
  clock_in_longitude?: number | null;
  clock_in_accuracy_meters?: number | null;
  notes?: string | null;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  display_name: string;
};

type ProjectMembershipRow = {
  id: string;
  organization_id: string;
  organization_member_id: string;
  project_id: string;
  is_active: boolean;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type PurchaseOrderRow = {
  id: string;
  organization_id: string;
  project_id: string;
  purchase_order_number: string;
  purchase_order_title: string;
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

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function readClockInAt(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
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

  let payload: ClockInRequest = {};
  try {
    payload = (await request.json()) as ClockInRequest;
  } catch {
    payload = {};
  }

  const projectId = readRequiredString(payload.project_id);
  if (!projectId) {
    return errorResponse("project_id is required.", 400);
  }

  const clientEntryId = readRequiredString(payload.client_entry_id);
  if (!clientEntryId) {
    return errorResponse("client_entry_id is required.", 400);
  }

  const purchaseOrderId = readOptionalString(payload.purchase_order_id);
  const createdFromDeviceId = readOptionalString(payload.created_from_device_id);
  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
  const clockInLatitude = readOptionalNumber(payload.clock_in_latitude);
  const clockInLongitude = readOptionalNumber(payload.clock_in_longitude);
  const clockInAccuracyMeters = readOptionalNumber(payload.clock_in_accuracy_meters);
  const clockInAt = readClockInAt(payload.clock_in_at);

  if (!clockInAt) {
    return errorResponse("clock_in_at must be a valid ISO-8601 datetime if supplied.", 400);
  }

  if (!validateLatitude(clockInLatitude)) {
    return errorResponse("clock_in_latitude must be between -90 and 90.", 400);
  }

  if (!validateLongitude(clockInLongitude)) {
    return errorResponse("clock_in_longitude must be between -180 and 180.", 400);
  }

  if (!validateAccuracy(clockInAccuracyMeters)) {
    return errorResponse("clock_in_accuracy_meters must be zero or greater.", 400);
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

  const memberIds = memberRows.map((row) => row.id);
  const { data: projectMemberships, error: projectMembershipsError } = await client
    .from("project_members")
    .select("id, organization_id, organization_member_id, project_id, is_active")
    .in("organization_member_id", memberIds)
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (projectMembershipsError) {
    return errorResponse("Failed to load active project membership.", 500, {
      detail: projectMembershipsError.message,
    });
  }

  const projectMembership = ((projectMemberships ?? []) as ProjectMembershipRow[])[0] ?? null;
  if (!projectMembership) {
    return errorResponse("Active project membership required.", 403);
  }

  const member =
    memberRows.find((row) => row.id === projectMembership.organization_member_id) ?? null;
  if (!member) {
    return errorResponse("Organization membership not found.", 403);
  }

  if (projectMembership.organization_id !== member.organization_id) {
    return errorResponse("Project membership organization mismatch.", 409);
  }

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id, name")
    .eq("id", member.organization_id)
    .maybeSingle();

  if (organizationError) {
    return errorResponse("Failed to load organization.", 500, {
      detail: organizationError.message,
    });
  }

  if (!organization) {
    return errorResponse("Organization not found.", 404);
  }

  const { data: existingEntries, error: existingEntriesError } = await client
    .from("project_time_sheet_entries")
    .select(
      "id, organization_id, project_id, worker_member_id, worker_user_id, worker_name, purchase_order_id, purchase_order_number, purchase_order_title, client_entry_id, source, created_from_device_id, synced_at, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, notes, created_at, updated_at"
    )
    .eq("organization_id", member.organization_id)
    .eq("worker_user_id", user.id)
    .eq("client_entry_id", clientEntryId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingEntriesError) {
    return errorResponse("Failed to check existing client entry.", 500, {
      detail: existingEntriesError.message,
    });
  }

  const existingEntry = ((existingEntries ?? []) as TimeSheetEntryRow[])[0] ?? null;
  if (existingEntry) {
    return jsonResponse({
      ok: true,
      created: false,
      idempotent: true,
      entry: existingEntry,
    });
  }

  const { data: openEntries, error: openEntriesError } = await client
    .from("project_time_sheet_entries")
    .select(FULL_TIME_SHEET_ENTRY_SELECT)
    .eq("organization_id", member.organization_id)
    .eq("worker_user_id", user.id)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false });

  if (openEntriesError) {
    return errorResponse("Failed to check for an open shift.", 500, {
      detail: openEntriesError.message,
    });
  }

  const healedOpenEntries = await autoCloseStaleTimeSheetEntries(
    client,
    (openEntries ?? []) as TimeSheetEntryRow[],
    user.id
  );
  const openEntry = healedOpenEntries.find((entry) => !entry.clock_out_at) ?? null;
  if (openEntry) {
    return errorResponse("An open shift already exists for this user.", 409, {
      open_entry_id: openEntry.id,
      open_client_entry_id: openEntry.client_entry_id,
    });
  }

  let purchaseOrder: PurchaseOrderRow | null = null;
  if (purchaseOrderId) {
    const { data: purchaseOrderRow, error: purchaseOrderError } = await client
      .from("project_purchase_orders")
      .select("id, organization_id, project_id, purchase_order_number, purchase_order_title")
      .eq("id", purchaseOrderId)
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .maybeSingle();

    if (purchaseOrderError) {
      return errorResponse("Failed to validate purchase_order_id.", 500, {
        detail: purchaseOrderError.message,
      });
    }

    if (!purchaseOrderRow) {
      return errorResponse("purchase_order_id must belong to the supplied project_id.", 400);
    }

    purchaseOrder = purchaseOrderRow as PurchaseOrderRow;
  }

  const workerName = member.display_name.trim().length > 0 ? member.display_name.trim() : "Member";
  const organizationRow = organization as OrganizationRow;
  const syncedAt = new Date().toISOString();

  const { data: insertedEntry, error: insertEntryError } = await client
    .from("project_time_sheet_entries")
    .insert({
      organization_id: member.organization_id,
      project_id: projectId,
      created_by: user.id,
      worker_user_id: user.id,
      worker_member_id: member.id,
      worker_name: workerName,
      company_name: organizationRow.name,
      trade_name: "",
      clock_in_at: clockInAt,
      clock_in_latitude: clockInLatitude,
      clock_in_longitude: clockInLongitude,
      clock_in_accuracy_meters: clockInAccuracyMeters,
      notes,
      client_entry_id: clientEntryId,
      purchase_order_id: purchaseOrder?.id ?? null,
      purchase_order_number: purchaseOrder?.purchase_order_number ?? "",
      purchase_order_title: purchaseOrder?.purchase_order_title ?? "",
      source: "mobile",
      synced_at: syncedAt,
      created_from_device_id: createdFromDeviceId,
    })
    .select(
      "id, organization_id, project_id, worker_member_id, worker_user_id, worker_name, purchase_order_id, purchase_order_number, purchase_order_title, client_entry_id, source, created_from_device_id, synced_at, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, notes, created_at, updated_at"
    )
    .single();

  if (insertEntryError || !insertedEntry) {
    return errorResponse("Failed to create time sheet entry.", 500, {
      detail: insertEntryError?.message,
    });
  }

  const eventMessage = purchaseOrder
    ? `Clocked in via mobile for purchase order ${purchaseOrder.purchase_order_number}.`
    : "Clocked in via mobile.";

  const { data: insertedEvent, error: insertEventError } = await client
    .from("project_time_sheet_events")
    .insert({
      organization_id: member.organization_id,
      project_id: projectId,
      entry_id: insertedEntry.id,
      actor_user_id: user.id,
      worker_name: workerName,
      event_type: "clock_in",
      message: eventMessage,
    })
    .select("id, entry_id, event_type, message, created_at")
    .single();

  if (insertEventError || !insertedEvent) {
    return errorResponse("Failed to create time sheet event.", 500, {
      detail: insertEventError?.message,
      entry_id: insertedEntry.id,
    });
  }

  return jsonResponse({
    ok: true,
    created: true,
    idempotent: false,
    entry: insertedEntry,
    event: insertedEvent as TimeSheetEventRow,
  });
});
