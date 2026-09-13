import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrations/20260826240000_add_atomic_takeoff_variation_publication.sql", import.meta.url),
  "utf8",
);

describe("atomic Takeoff Variation publication migration", () => {
  it("requires only source and Variation destination permissions", () => {
    expect(sql).toContain("leads.opportunities.write");
    expect(sql).toContain("variations.write");
    expect(sql).not.toContain("quotes.write");
    expect(sql).not.toContain("purchase_orders.write");
  });

  it("proves legacy Takeoff ownership separately from canonical commercial Project ownership", () => {
    expect(sql).toContain("o.workspace_project_id = data_project_id");
    expect(sql).toContain("o.converted_project_id = commercial_project_id");
    expect(sql).toContain("p.source_opportunity_id = opp_id");
    expect(sql).toContain("variation.project_id = commercial_project_id");
  });

  it("supports canonical creation and exact existing Draft/Priced targets", () => {
    expect(sql).toContain("public.create_project_variation_draft");
    expect(sql).toContain("variation_row.status not in ('Draft', 'Priced')");
    expect(sql).toContain("variation_row.updated_at is distinct from expected_updated_at");
    expect(sql).toContain("for update");
    expect(sql).toContain("variationTitle is required for a new Variation");
    for (const section of ["Labour", "Materials", "Subcontractors", "Plant", "Margin"]) {
      expect(sql).toContain(`'${section}'`);
    }
    for (const rejected of ["Sent", "Client Review", "Approved", "Rejected", "Invoiced"]) {
      expect(["Draft", "Priced"]).not.toContain(rejected);
    }
  });

  it("publishes the line and honest Takeoff provenance in one transaction", () => {
    expect(sql.trimStart()).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain("public.create_takeoff_commercial_item");
    expect(sql).toContain("public.save_project_variation_draft");
    expect(sql).toContain("public.link_commercial_item_to_variation_line");
    expect(sql).toContain("'sourceType', commercial_item.source_type");
    expect(sql).toContain("'sourceTakeoffMeasurementId', commercial_item.source_takeoff_measurement_id");
    expect(sql).not.toContain("worksheet_selection");
    expect(sql).not.toContain("sourceWorkbookId");
  });

  it("stores fingerprinted replay results while allowing intentional later lines", () => {
    expect(sql).toContain("takeoff_variation_publication_requests");
    expect(sql).toContain("primary key (organization_id, request_key)");
    expect(sql).toContain("request_fingerprint");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("requestKey was already used for a different Variation publication");
    expect(sql).toContain("source_takeoff_measurement_id = measurement_id");
  });
});
