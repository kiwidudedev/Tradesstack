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
  supplierId: string;
};

let admin: SupabaseClient;
let actor: SupabaseClient;
let fixture: Fixture;
const createdPurchaseOrderIds = new Set<string>();
const createdCommercialItemIds = new Set<string>();

async function publish(input: Record<string, unknown>) {
  const response = await actor.rpc("publish_takeoff_commercial_purchase_order_v1", { p_input: input });
  if (response.error) throw new Error(JSON.stringify(response.error));
  const row = Array.isArray(response.data) ? response.data[0] : null;
  if (!row) throw new Error("Takeoff PO publication returned no row.");
  createdPurchaseOrderIds.add(row.purchase_order_id);
  createdCommercialItemIds.add(row.commercial_item_id);
  return row as {
    purchase_order_id: string;
    purchase_order_line_id: string;
    purchase_order_number: string;
    commercial_item_id: string;
    target_mode: string;
    reused_commercial_item: boolean;
  };
}

describe.runIf(shouldRun)("live atomic Takeoff Purchase Order publication", () => {
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
      const [measurement, supplier, project] = await Promise.all([
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
        admin.from("organization_suppliers")
          .select("id")
          .eq("organization_id", opportunity.organization_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
        admin.from("organization_projects")
          .select("id")
          .eq("organization_id", opportunity.organization_id)
          .eq("id", opportunity.converted_project_id)
          .eq("source_opportunity_id", opportunity.id)
          .maybeSingle(),
      ]);
      if (measurement.data && supplier.data && project.data) {
        resolved = {
          organizationId: opportunity.organization_id,
          opportunityId: opportunity.id,
          projectId: opportunity.converted_project_id,
          dataProjectId: opportunity.workspace_project_id,
          measurementId: measurement.data.id,
          supplierId: supplier.data.id,
        };
        break;
      }
    }
    if (!resolved) throw new Error("No converted Takeoff fixture with a supplier was found.");
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
    if (createdPurchaseOrderIds.size > 0) {
      await admin.from("project_purchase_orders").delete().in("id", [...createdPurchaseOrderIds]);
    }
    if (createdCommercialItemIds.size > 0) {
      await admin.from("commercial_items").delete().in("id", [...createdCommercialItemIds]);
    }
  }, 30_000);

  it("commits source, Draft PO line and provenance atomically and makes retries idempotent", async () => {
    const requestKey = crypto.randomUUID();
    const baseInput = {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      description: `Runtime Takeoff PO ${requestKey}`,
      rate: 55,
      targetMode: "new",
      supplierId: fixture.supplierId,
      section: "Materials",
      purchaseOrderTitle: `Runtime Takeoff PO ${requestKey}`,
      requestKey,
    };
    const first = await publish(baseInput);
    const retry = await publish(baseInput);
    expect(retry).toEqual(first);

    const [po, lines, links, source] = await Promise.all([
      admin.from("project_purchase_orders").select("project_id, supplier_id, status").eq("id", first.purchase_order_id).single(),
      admin.from("project_purchase_order_line_items").select("id, description, quantity, unit, rate, section").eq("purchase_order_id", first.purchase_order_id),
      admin.from("commercial_item_document_links").select("commercial_item_id, document_kind, document_id, document_line_id").eq("document_id", first.purchase_order_id),
      admin.from("commercial_items").select("source_type, source_takeoff_measurement_id, rate, source_link_json").eq("id", first.commercial_item_id).single(),
    ]);
    expect(po.error ?? lines.error ?? links.error ?? source.error).toBeNull();
    expect(po.data).toMatchObject({ project_id: fixture.projectId, supplier_id: fixture.supplierId, status: "Draft" });
    expect(lines.data).toHaveLength(1);
    expect(lines.data?.[0]).toMatchObject({ id: first.purchase_order_line_id, rate: 55, section: "Materials" });
    expect(links.data).toEqual([expect.objectContaining({
      commercial_item_id: first.commercial_item_id,
      document_kind: "purchase_order_line",
      document_line_id: first.purchase_order_line_id,
    })]);
    expect(source.data).toMatchObject({
      source_type: "takeoff_measurement",
      source_takeoff_measurement_id: fixture.measurementId,
      rate: 55,
    });

    const currentPo = await admin.from("project_purchase_orders").select("updated_at").eq("id", first.purchase_order_id).single();
    const second = await publish({
      ...baseInput,
      targetMode: "existing",
      purchaseOrderId: first.purchase_order_id,
      expectedUpdatedAt: currentPo.data?.updated_at,
      requestKey: crypto.randomUUID(),
      purchaseOrderTitle: null,
    });
    expect(second.purchase_order_id).toBe(first.purchase_order_id);
    expect(second.commercial_item_id).toBe(first.commercial_item_id);
    expect(second.purchase_order_line_id).not.toBe(first.purchase_order_line_id);
    const afterSecond = await admin.from("project_purchase_order_line_items").select("id").eq("purchase_order_id", first.purchase_order_id);
    expect(afterSecond.data).toHaveLength(2);
  }, 120_000);

  it("rejects non-Draft status and rolls back stale and forged publications", async () => {
    const [purchaseOrderId] = [...createdPurchaseOrderIds];
    expect(purchaseOrderId).toBeTruthy();
    const base = {
      organizationId: fixture.organizationId,
      opportunityId: fixture.opportunityId,
      projectId: fixture.projectId,
      dataProjectId: fixture.dataProjectId,
      measurementId: fixture.measurementId,
      rate: 61.23,
      targetMode: "existing",
      supplierId: fixture.supplierId,
      section: "Labour",
      purchaseOrderId,
    };

    const nonDraft = await admin.from("project_purchase_orders").update({ status: "Approved" }).eq("id", purchaseOrderId).select("updated_at").single();
    expect(nonDraft.error).toBeNull();
    const rejected = await actor.rpc("publish_takeoff_commercial_purchase_order_v1", { p_input: {
      ...base,
      expectedUpdatedAt: nonDraft.data?.updated_at,
      description: "Rejected Approved PO",
      requestKey: crypto.randomUUID(),
    } });
    expect(rejected.error?.message).toContain("Only Draft Purchase Orders");

    const restored = await admin.from("project_purchase_orders").update({ status: "Draft" }).eq("id", purchaseOrderId).select("updated_at").single();
    expect(restored.error).toBeNull();
    const lineCountBefore = await admin.from("project_purchase_order_line_items").select("id", { count: "exact", head: true }).eq("purchase_order_id", purchaseOrderId);
    const staleDescription = `Stale rollback ${crypto.randomUUID()}`;
    const stale = await actor.rpc("publish_takeoff_commercial_purchase_order_v1", { p_input: {
      ...base,
      expectedUpdatedAt: new Date(Date.parse(restored.data!.updated_at) - 1_000).toISOString(),
      description: staleDescription,
      requestKey: crypto.randomUUID(),
    } });
    expect(stale.error?.message).toContain("updated by another user");
    const [lineCountAfter, staleSource] = await Promise.all([
      admin.from("project_purchase_order_line_items").select("id", { count: "exact", head: true }).eq("purchase_order_id", purchaseOrderId),
      admin.from("commercial_items").select("id").eq("organization_id", fixture.organizationId).eq("description", staleDescription),
    ]);
    expect(lineCountAfter.count).toBe(lineCountBefore.count);
    expect(staleSource.data).toEqual([]);

    const foreignSupplier = await admin.from("organization_suppliers").select("id").neq("organization_id", fixture.organizationId).eq("is_active", true).limit(1).maybeSingle();
    if (foreignSupplier.data) {
      const forgedTitle = `Forged PO ${crypto.randomUUID()}`;
      const forged = await actor.rpc("publish_takeoff_commercial_purchase_order_v1", { p_input: {
        ...base,
        targetMode: "new",
        purchaseOrderId: null,
        expectedUpdatedAt: null,
        supplierId: foreignSupplier.data.id,
        description: forgedTitle,
        purchaseOrderTitle: forgedTitle,
        requestKey: crypto.randomUUID(),
      } });
      expect(forged.error?.message).toContain("Active supplier not found");
      const leakedPo = await admin.from("project_purchase_orders").select("id").eq("purchase_order_title", forgedTitle);
      expect(leakedPo.data).toEqual([]);
    }
  }, 120_000);
});
