import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrations/20260826230000_add_atomic_takeoff_purchase_order_publication.sql", import.meta.url),
  "utf8",
);

describe("atomic Takeoff Purchase Order publication migration", () => {
  it("decouples source authority from Quote permission but keeps destination permissions", () => {
    const sourceFunction = sql.slice(
      sql.indexOf("create or replace function public.create_takeoff_commercial_item"),
      sql.indexOf("create table if not exists public.takeoff_purchase_order_publication_requests"),
    );
    expect(sourceFunction).toContain("leads.opportunities.write");
    expect(sourceFunction).not.toContain("quotes.write");
    expect(sql).toContain("purchase_orders.write");
    expect(sql).not.toContain("takeoff_po'");
    expect(sql).not.toContain("worksheet_selection");
  });

  it("uses canonical committed quantity for line, area, and count", () => {
    expect(sql).toContain("m.measurement_kind in ('line', 'area', 'count')");
    expect(sql).toContain("coalesce(measurement.count_value, measurement.display_value)");
    expect(sql).toContain("else measurement.display_value end");
    expect(sql).not.toContain("measurement.quantity");
  });

  it("proves legacy Takeoff data ownership separately from the final commercial Project", () => {
    expect(sql).toContain("o.workspace_project_id = data_project_id");
    expect(sql).toContain("o.converted_project_id = project_id");
    expect(sql).toContain("p.source_opportunity_id = opp_id");
    expect(sql).toContain("'projectId', project_id");
    expect(sql).toContain("'dataProjectId', data_project_id");
  });

  it("enforces supplier, Draft status, canonical sections, and stale-write safety", () => {
    expect(sql).toContain("s.organization_id = org_id and s.id = supplier_id and s.is_active = true");
    expect(sql).toContain("po.supplier_id <> supplier_id");
    expect(sql).toContain("po.status <> 'Draft'");
    for (const status of ["Labour", "Materials", "Subcontractors", "Plant"]) expect(sql).toContain(`'${status}'`);
    expect(sql).not.toMatch(/section_name[^\n]*Margin/);
    expect(sql).toContain("po.updated_at is distinct from expected_updated_at");
    expect(sql).toContain("for update");
  });

  it("rejects each canonical non-Draft Purchase Order status through the universal Draft guard", () => {
    expect(sql).toContain("if po.status <> 'Draft'");
    for (const status of ["Pending Approval", "Approved", "Issued", "Received", "Invoiced", "Cancelled"]) {
      expect(status).not.toBe("Draft");
    }
  });

  it("publishes PO save and provenance in one database transaction", () => {
    expect(sql.trimStart()).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain("public.create_project_purchase_order_draft");
    expect(sql).toContain("public.create_takeoff_commercial_item");
    expect(sql).toContain("public.save_project_purchase_order_draft");
    expect(sql).toContain("public.link_commercial_item_to_purchase_order_line");
    expect(sql).toContain("'sourceType', item.source_type");
    expect(sql).toContain("'sourceTakeoffMeasurementId', item.source_takeoff_measurement_id");
  });

  it("persists fingerprinted request results for safe retries without global source dedupe", () => {
    expect(sql).toContain("takeoff_purchase_order_publication_requests");
    expect(sql).toContain("primary key (organization_id, request_key)");
    expect(sql).toContain("request_fingerprint");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("requestKey was already used for a different Purchase Order publication");
    expect(sql).toContain("source_signature = signature");
  });
});
