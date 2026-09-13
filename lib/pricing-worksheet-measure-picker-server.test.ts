import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { searchPricingWorksheetMeasures } from "@/lib/pricing-worksheet-measure-picker-server";

// The mock intentionally models Supabase's fluent/thenable query builder.
/* eslint-disable @typescript-eslint/no-explicit-any */
function query(result: { data: unknown; error: { message: string } | null; count?: number | null }) {
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "is", "ilike", "or", "limit", "order", "range"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  return builder;
}

function supabaseFor(results: Record<string, Array<{ data: unknown; error: { message: string } | null; count?: number | null }>>) {
  return {
    from: vi.fn((table: string) => {
      const next = results[table]?.shift();
      if (!next) throw new Error(`Unexpected query for ${table}`);
      return query(next);
    }),
  };
}

const workbook = { id: "workbook-1", organization_id: "org-1", opportunity_id: "opportunity-1", project_id: "project-1", quote_id: null, variation_id: null, archived_at: null };
const common = {
  project_drawing_sets: { id: "drawing-1", file_name: "A-201.pdf", display_name: "Architectural" },
  takeoff_pages: { id: "page-1", page_number: 4, page_label: "Ground Floor" },
  takeoff_measurement_groups: null,
  description: "",
  updated_at: "2026-08-23T00:00:00.000Z",
  drawing_set_id: "drawing-1",
  page_id: "page-1",
  group_id: null,
  status: "active",
  color_hex: null,
};

describe("pricing worksheet Measure server read model", () => {
  it("uses persisted display values for line/area and count_value for counts without geometry", async () => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: workbook, error: null }],
      organization_projects: [{ data: { id: "project-1", organization_id: "org-1" }, error: null }],
      project_drawing_sets: [{ data: null, error: null, count: 1 }],
      takeoff_measurements: [{ data: [
        { ...common, id: "line-1", version: 2, measurement_kind: "line", color_hex: "#123ABC", name: "Walls", display_value: 7.16, display_unit: "m", count_value: null, quantity: 1, points: [{ x: 1 }] },
        { ...common, id: "area-1", version: 3, measurement_kind: "area", name: "Floor", display_value: 145.2, display_unit: "m²", count_value: null, quantity: 1 },
        { ...common, id: "count-1", version: 1, measurement_kind: "count", name: "Panels", display_value: 99, display_unit: "ea", count_value: 8, quantity: 1 },
      ], error: null, count: 3 }],
    });
    const result = await searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" });
    expect(result.items.map((item) => [item.kind, item.quantity, item.unit])).toEqual([["line", 7.16, "m"], ["area", 145.2, "m²"], ["count", 8, "count"]]);
    expect(result.items.map((item) => item.colorHex)).toEqual(["#123ABC", null, null]);
    expect(result.items.every((item) => item.drawingSetName === "Architectural")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("points");
    expect(result.items.every((item) => item.quantity !== 1)).toBe(true);
  });

  it("resolves an opportunity workbook through its workspace Project", async () => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: { ...workbook, project_id: null }, error: null }],
      organization_opportunities: [{ data: { id: "opportunity-1", organization_id: "org-1", workspace_project_id: "workspace-project" }, error: null }],
      organization_projects: [{ data: { id: "workspace-project", organization_id: "org-1" }, error: null }],
      project_drawing_sets: [{ data: null, error: null, count: 0 }],
    });
    const result = await searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" });
    expect(result.workspaceStatus).toBe("no_drawings");
  });

  it("returns an explicit no-workspace state instead of failing", async () => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: { ...workbook, project_id: null }, error: null }],
      organization_opportunities: [{ data: { id: "opportunity-1", organization_id: "org-1", workspace_project_id: null }, error: null }],
    });
    await expect(searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" })).resolves.toMatchObject({ workspaceStatus: "no_workspace", items: [] });
  });

  it("rejects inaccessible or archived workbook scopes before querying Takeoff", async () => {
    const client = supabaseFor({ opportunity_pricing_worksheets: [{ data: null, error: null }] });
    await expect(searchPricingWorksheetMeasures({ supabase: client, organizationId: "forged-org", workbookId: "workbook-1" })).rejects.toThrow("invalid_workbook_scope");
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("rejects a workbook whose derived Project is outside the authorized organization", async () => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: workbook, error: null }],
      organization_projects: [{ data: null, error: null }],
    });
    await expect(searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" })).rejects.toThrow("invalid_project_scope");
  });

  it("rejects an opportunity owner that cannot be resolved in the authorized organization", async () => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: { ...workbook, project_id: null }, error: null }],
      organization_opportunities: [{ data: null, error: null }],
    });
    await expect(searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" })).rejects.toThrow("invalid_opportunity_scope");
  });

  it.each([
    ["project", { quote_id: null, variation_id: null }],
    ["quote", { quote_id: "quote-1", variation_id: null }],
    ["variation", { quote_id: null, variation_id: "variation-1" }],
  ])("uses the authorized workbook Project for %s owners", async (_owner, ownerFields) => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: { ...workbook, ...ownerFields }, error: null }],
      organization_projects: [{ data: { id: "project-1", organization_id: "org-1" }, error: null }],
      project_drawing_sets: [{ data: null, error: null, count: 0 }],
    });
    await expect(searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" })).resolves.toMatchObject({ workspaceStatus: "no_drawings" });
  });

  it("uses the original Takeoff workspace for a legacy final Project workbook", async () => {
    const client = supabaseFor({
      opportunity_pricing_worksheets: [{ data: { ...workbook, project_id: "final-project" }, error: null }],
      organization_projects: [
        { data: { id: "final-project", organization_id: "org-1", source_opportunity_id: "opportunity-1" }, error: null },
        { data: { id: "workspace-project" }, error: null },
      ],
      organization_opportunities: [{ data: { id: "opportunity-1", workspace_project_id: "workspace-project", converted_project_id: "final-project" }, error: null }],
      takeoff_pages: [{ data: null, error: null, count: 1 }, { data: null, error: null, count: 0 }],
      takeoff_measurements: [
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 0 },
        { data: [{ ...common, id: "line-legacy", version: 1, measurement_kind: "line", name: "Legacy wall", display_value: 5, display_unit: "m", count_value: null }], error: null, count: 1 },
      ],
      takeoff_render_jobs: [{ data: null, error: null, count: 0 }, { data: null, error: null, count: 0 }],
      project_drawing_sets: [{ data: null, error: null, count: 1 }],
    });
    const result = await searchPricingWorksheetMeasures({ supabase: client, organizationId: "org-1", workbookId: "workbook-1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ measurementId: "line-legacy", projectId: "workspace-project" });
  });
});
