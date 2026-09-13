import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_SUPABASE_DB_TESTS === "1";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Fixture = {
  organizationId: string;
  opportunityId: string;
  projectId: string;
  dataProjectId: string;
  measurementId: string;
};

let admin: SupabaseClient;
let actor: SupabaseClient;
let fixture: Fixture;
const createdVariationIds = new Set<string>();
const createdCommercialItemIds = new Set<string>();

async function publish(input: Record<string, unknown>) {
  const response = await actor.rpc("publish_takeoff_commercial_variation_v1", { p_input: input });
  if (response.error) throw new Error(JSON.stringify(response.error));
  const row = Array.isArray(response.data) ? response.data[0] : null;
  if (!row) throw new Error("Takeoff Variation publication returned no row.");
  createdVariationIds.add(row.variation_id);
  createdCommercialItemIds.add(row.commercial_item_id);
  return row as {
    variation_id: string;
    variation_line_id: string;
    variation_number: string;
    commercial_item_id: string;
    target_mode: string;
    status: string;
    reused_commercial_item: boolean;
  };
}

describe.runIf(shouldRun)("live atomic Takeoff Variation publication", () => {
  beforeAll(async () => {
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase runtime environment is not configured.");
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const opportunities = await admin
      .from("organization_opportunities")
      .select("id, organization_id, workspace_project_id, converted_project_id")
      .not("workspace_project_id", "is", null)
      .not("converted_project_id", "is", null);
    if (opportunities.error) throw opportunities.error;

    let resolved: Fixture | null = null;
    for (const opportunity of opportunities.data ?? []) {
      const [measurement, project] = await Promise.all([
        admin.from("takeoff_measurements")
          .select("id")
          .eq("organization_id", opportunity.organization_id)
          .eq("project_id", opportunity.workspace_project_id)
          .eq("status", "active")
          .in("measurement_kind", ["line", "area", "count"])
          .not("display_unit", "is", null)
          .neq("name", "")
          .limit(1)
          .maybeSingle(),
        admin.from("organization_projects")
          .select("id")
          .eq("organization_id", opportunity.organization_id)
          .eq("id", opportunity.converted_project_id)
          .eq("source_opportunity_id", opportunity.id)
          .maybeSingle(),
      ]);
      if (measurement.data && project.data) {
        resolved = {
          organizationId: opportunity.organization_id,
          opportunityId: opportunity.id,
          projectId: opportunity.converted_project_id,
          dataProjectId: opportunity.workspace_project_id,
          measurementId: measurement.data.id,
        };
        break;
      }
    }
    if (!resolved) throw new Error("No converted Takeoff fixture was found.");
    fixture = resolved;

    const members = await admin.from("organization_members")
      .select("user_id")
      .eq("organization_id", fixture.organizationId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    if (members.error || !members.data) throw members.error ?? new Error("No authorized fixture member found.");
    const user = await admin.auth.admin.getUserById(members.data.user_id);
    if (user.error || !user.data.user?.email) throw user.error ?? new Error("Fixture member has no email.");
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: user.data.user.email });
    if (link.error || !link.data.properties.hashed_token) throw link.error ?? new Error("Unable to create runtime session.");
    actor = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const verified = await actor.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error("Unable to verify runtime session.");
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    if (createdVariationIds.size > 0) {
      await admin.from("project_variations").delete().in("id", [...createdVariationIds]);
    }
    if (createdCommercialItemIds.size > 0) {
      await admin.from("commercial_items").delete().in("id", [...createdCommercialItemIds]);
    }
  }, 30_000);

  it("creates a numbered Draft with a linked source, retries idempotently, and intentionally appends", async () => {
    const requestKey = crypto.randomUUID();
    const title = `Runtime Takeoff Variation ${requestKey}`;
    const baseInput = {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      description: title,
      rate: 125,
      targetMode: "new",
      section: "Materials",
      variationTitle: title,
      requestKey,
    };
    const first = await publish(baseInput);
    const retry = await publish(baseInput);
    expect(retry).toEqual(first);

    const [variation, lines, links, source, requests] = await Promise.all([
      admin.from("project_variations").select("organization_id, project_id, variation_title, variation_number, status").eq("id", first.variation_id).single(),
      admin.from("project_variation_line_items").select("id, description, quantity, unit, rate, total, section").eq("variation_id", first.variation_id),
      admin.from("commercial_item_document_links").select("commercial_item_id, document_kind, document_id, document_line_id").eq("document_id", first.variation_id),
      admin.from("commercial_items").select("source_type, source_takeoff_measurement_id, rate, source_link_json").eq("id", first.commercial_item_id).single(),
      admin.from("takeoff_variation_publication_requests").select("request_key").eq("organization_id", fixture.organizationId).eq("request_key", requestKey),
    ]);
    expect(variation.error ?? lines.error ?? links.error ?? source.error ?? requests.error).toBeNull();
    expect(variation.data).toMatchObject({
      organization_id: fixture.organizationId,
      project_id: fixture.projectId,
      variation_title: title,
      status: "Draft",
    });
    expect(variation.data?.variation_number).not.toBe("");
    expect(lines.data).toHaveLength(1);
    expect(lines.data?.[0]).toMatchObject({ id: first.variation_line_id, rate: 125, section: "Materials" });
    expect(links.data).toEqual([expect.objectContaining({
      commercial_item_id: first.commercial_item_id,
      document_kind: "variation_line",
      document_line_id: first.variation_line_id,
    })]);
    expect(source.data).toMatchObject({
      source_type: "takeoff_measurement",
      source_takeoff_measurement_id: fixture.measurementId,
      rate: 125,
    });
    expect(requests.data).toHaveLength(1);

    const current = await admin.from("project_variations").select("updated_at").eq("id", first.variation_id).single();
    const second = await publish({
      ...baseInput,
      targetMode: "existing",
      variationId: first.variation_id,
      expectedUpdatedAt: current.data?.updated_at,
      variationTitle: null,
      requestKey: crypto.randomUUID(),
    });
    expect(second.variation_id).toBe(first.variation_id);
    expect(second.commercial_item_id).toBe(first.commercial_item_id);
    expect(second.variation_line_id).not.toBe(first.variation_line_id);
    const appended = await admin.from("project_variation_line_items").select("id").eq("variation_id", first.variation_id);
    expect(appended.data).toHaveLength(2);
  }, 120_000);

  it("allows Priced and rejects every immutable status without partial writes", async () => {
    const [variationId] = [...createdVariationIds];
    expect(variationId).toBeTruthy();
    const base = {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      description: `Priced publish ${crypto.randomUUID()}`,
      rate: 126,
      targetMode: "existing",
      section: "Labour",
      variationId,
    };

    const priced = await admin.from("project_variations").update({ status: "Priced" }).eq("id", variationId).select("updated_at").single();
    expect(priced.error).toBeNull();
    const pricedResult = await publish({ ...base, expectedUpdatedAt: priced.data?.updated_at, requestKey: crypto.randomUUID() });
    expect(pricedResult.status).toBe("Priced");

    for (const status of ["Sent", "Client Review", "Approved", "Rejected", "Invoiced"]) {
      const updated = await admin.from("project_variations").update({ status }).eq("id", variationId).select("updated_at").single();
      expect(updated.error).toBeNull();
      const before = await admin.from("project_variation_line_items").select("id", { count: "exact", head: true }).eq("variation_id", variationId);
      const rejected = await actor.rpc("publish_takeoff_commercial_variation_v1", { p_input: {
        ...base,
        description: `Rejected ${status} ${crypto.randomUUID()}`,
        expectedUpdatedAt: updated.data?.updated_at,
        requestKey: crypto.randomUUID(),
      } });
      expect(rejected.error?.message).toContain("Only Draft or Priced Variations");
      const after = await admin.from("project_variation_line_items").select("id", { count: "exact", head: true }).eq("variation_id", variationId);
      expect(after.count).toBe(before.count);
    }
    await admin.from("project_variations").update({ status: "Draft" }).eq("id", variationId);
  }, 120_000);

  it("rolls back blank-title, stale-write, and reused-key failures", async () => {
    const [variationId] = [...createdVariationIds];
    const variationCountBefore = await admin.from("project_variations").select("id", { count: "exact", head: true }).eq("project_id", fixture.projectId);
    const blank = await actor.rpc("publish_takeoff_commercial_variation_v1", { p_input: {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      description: "Blank title rollback",
      rate: 1,
      targetMode: "new",
      section: "Plant",
      variationTitle: "   ",
      requestKey: crypto.randomUUID(),
    } });
    expect(blank.error?.message).toContain("variationTitle is required");
    const variationCountAfter = await admin.from("project_variations").select("id", { count: "exact", head: true }).eq("project_id", fixture.projectId);
    expect(variationCountAfter.count).toBe(variationCountBefore.count);

    const current = await admin.from("project_variations").select("updated_at").eq("id", variationId).single();
    const staleDescription = `Stale Variation rollback ${crypto.randomUUID()}`;
    const lineCountBefore = await admin.from("project_variation_line_items").select("id", { count: "exact", head: true }).eq("variation_id", variationId);
    const stale = await actor.rpc("publish_takeoff_commercial_variation_v1", { p_input: {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      description: staleDescription,
      rate: 9,
      targetMode: "existing",
      section: "Plant",
      variationId,
      expectedUpdatedAt: new Date(Date.parse(current.data!.updated_at) - 1_000).toISOString(),
      requestKey: crypto.randomUUID(),
    } });
    expect(stale.error?.message).toContain("updated by another user");
    const [lineCountAfter, staleSource] = await Promise.all([
      admin.from("project_variation_line_items").select("id", { count: "exact", head: true }).eq("variation_id", variationId),
      admin.from("commercial_items").select("id").eq("organization_id", fixture.organizationId).eq("description", staleDescription),
    ]);
    expect(lineCountAfter.count).toBe(lineCountBefore.count);
    expect(staleSource.data).toEqual([]);

    const firstRequest = await admin.from("takeoff_variation_publication_requests")
      .select("request_key, result_json")
      .eq("organization_id", fixture.organizationId)
      .limit(1)
      .single();
    const mismatch = await actor.rpc("publish_takeoff_commercial_variation_v1", { p_input: {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      description: "Fingerprint mismatch rollback",
      rate: 999,
      targetMode: "new",
      section: "Margin",
      variationTitle: "Must not exist",
      requestKey: firstRequest.data?.request_key,
    } });
    expect(mismatch.error?.message).toContain("requestKey was already used");
  }, 120_000);
});
