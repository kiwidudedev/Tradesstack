import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { FULL_TIME_SHEET_ENTRY_SELECT, autoCloseStaleTimeSheetEntries } from "../_shared/stale-time-sheet.ts";

type BootstrapRequest = {
  organization_id?: string | null;
  include_timeclock_purchase_orders?: boolean;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  display_name: string;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type ProjectMembershipRow = {
  project_id: string;
  is_active: boolean;
  project: {
    id: string;
    name: string;
    slug: string;
    project_code: string | null;
    location: string | null;
    stage: string | null;
  } | null;
};

type OpenTimeSheetRow = {
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
  auto_clocked_out: boolean;
  auto_clocked_out_at: string | null;
  warning_8h5_at: string | null;
  notes: string;
};

type PurchaseOrderRow = {
  id: string;
  project_id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  status: string;
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

  let payload: BootstrapRequest = {};
  try {
    payload = (await request.json()) as BootstrapRequest;
  } catch {
    payload = {};
  }

  const requestedOrganizationId =
    typeof payload.organization_id === "string" && payload.organization_id.trim().length > 0
      ? payload.organization_id.trim()
      : null;
  const includeTimeclockPurchaseOrders = payload.include_timeclock_purchase_orders !== false;

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("id, organization_id, user_id, role, display_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return errorResponse("Failed to load organization membership.", 500, { detail: membershipError.message });
  }

  if (!membership) {
    return errorResponse("Organization membership not found.", 403);
  }

  const member = membership as MembershipRow;

  if (requestedOrganizationId && requestedOrganizationId !== member.organization_id) {
    return errorResponse("Not authorized for the requested organization.", 403);
  }

  const [organizationResult, projectMembershipsResult] = await Promise.all([
    client.from("organizations").select("id, name").eq("id", member.organization_id).maybeSingle(),
    client
      .from("project_members")
      .select(
        "project_id, is_active, project:organization_projects(id, name, slug, project_code, location, stage)"
      )
      .eq("organization_id", member.organization_id)
      .eq("organization_member_id", member.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  if (organizationResult.error) {
    return errorResponse("Failed to load organization.", 500, { detail: organizationResult.error.message });
  }

  if (projectMembershipsResult.error) {
    return errorResponse("Failed to load active project memberships.", 500, {
      detail: projectMembershipsResult.error.message,
    });
  }

  const organization = organizationResult.data as OrganizationRow | null;
  if (!organization) {
    return errorResponse("Organization not found.", 404);
  }

  const projectMemberships = ((projectMembershipsResult.data ?? []) as ProjectMembershipRow[])
    .filter((row) => row.project)
    .map((row) => ({
      project_id: row.project_id,
      project_name: row.project!.name,
      project_slug: row.project!.slug,
      project_code: row.project!.project_code,
      location: row.project!.location,
      stage: row.project!.stage,
      is_active: row.is_active,
    }));

  const accessibleProjectIds = projectMemberships.map((row) => row.project_id);

  let timeclockPurchaseOrdersByProject: Record<string, PurchaseOrderRow[]> = {};
  if (includeTimeclockPurchaseOrders && accessibleProjectIds.length > 0) {
    const { data: purchaseOrders, error: purchaseOrdersError } = await client
      .from("project_purchase_orders")
      .select("id, project_id, purchase_order_number, purchase_order_title, status")
      .eq("organization_id", member.organization_id)
      .in("project_id", accessibleProjectIds)
      .order("created_at", { ascending: false });

    if (purchaseOrdersError) {
      return errorResponse("Failed to load timeclock purchase orders.", 500, {
        detail: purchaseOrdersError.message,
      });
    }

    timeclockPurchaseOrdersByProject = ((purchaseOrders ?? []) as PurchaseOrderRow[]).reduce<
      Record<string, PurchaseOrderRow[]>
    >((acc, purchaseOrder) => {
      if (!acc[purchaseOrder.project_id]) {
        acc[purchaseOrder.project_id] = [];
      }
      acc[purchaseOrder.project_id].push(purchaseOrder);
      return acc;
    }, {});
  }

  const { data: openEntries, error: openEntriesError } = await client
    .from("project_time_sheet_entries")
    .select(FULL_TIME_SHEET_ENTRY_SELECT)
    .eq("organization_id", member.organization_id)
    .eq("worker_user_id", user.id)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false });

  if (openEntriesError) {
    return errorResponse("Failed to load open timesheet entry.", 500, {
      detail: openEntriesError.message,
    });
  }

  const healedOpenEntries = await autoCloseStaleTimeSheetEntries(
    client,
    (openEntries ?? []) as OpenTimeSheetRow[],
    user.id
  );
  const openTimeSheetEntry = healedOpenEntries.find((entry) => !entry.clock_out_at) ?? null;

  return jsonResponse({
    ok: true,
    organization: {
      id: organization.id,
      name: organization.name,
    },
    member: {
      user_id: member.user_id,
      member_id: member.id,
      organization_id: member.organization_id,
      role: member.role,
      display_name: member.display_name,
    },
    capabilities: {
      can_view_dashboard: true,
      can_view_tasks: true,
      can_clock_time: projectMemberships.length > 0,
      can_view_purchase_orders: projectMemberships.length > 0,
    },
    project_memberships: projectMemberships,
    open_time_sheet_entry: openTimeSheetEntry,
    timeclock_purchase_orders_by_project: timeclockPurchaseOrdersByProject,
  });
});
