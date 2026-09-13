import { describe, expect, it } from "vitest";
import { inspectCommercialLineageIntegrity } from "@/lib/commercial-lineage/integrity";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("commercial lineage integrity diagnostics", () => {
  it("finds valid locked Material and Takeoff provenance with missing normalized edges", () => {
    const findings = inspectCommercialLineageIntegrity({
      edges: [],
      commercialItems: [{
        id: uuid("1"), organization_id: uuid("2"), project_id: uuid("3"),
        locked_metadata_json: {
          cells: [{ metadata: {
            materialPricing: {
              version: 1, bindingId: uuid("4"), organizationMaterialId: uuid("5"), supplierId: uuid("6"),
              supplierProductId: uuid("7"), supplierPriceId: uuid("8"),
              snapshot: {
                materialName: "Board", supplierName: "Supplier", supplierProductDescription: null,
                supplierSku: null, unitCost: 12, unit: "ea", currency: "NZD", sourceTaxBasis: "exclusive",
                sourceTaxRate: 0.15, taxJurisdictionCode: "NZ", priceEffectiveFrom: "2026-01-01T00:00:00Z",
                evaluatedAt: "2026-01-02T00:00:00Z",
              },
            },
            measureSource: {
              version: 1, bindingId: uuid("9"), measurementId: uuid("10"), measurementVersion: 2,
              projectId: uuid("3"), drawingSetId: uuid("11"), drawingSetName: "Set", pageId: uuid("12"),
              pageNumber: 1, pageLabel: null, groupId: null, groupName: null, measurementKind: "area",
              measurementName: "Walls", sourceDescription: null, insertedField: "quantity", insertedValue: 42,
              insertedQuantity: 42, insertedUnit: "m2", sourceUpdatedAt: "2026-01-01T00:00:00Z",
              insertedAt: "2026-01-02T00:00:00Z",
            },
          } }],
        },
      }],
    });
    expect(findings.filter((finding) => finding.code === "valid_provenance_missing_edge")).toHaveLength(4);
  });

  it("detects duplicate, unsupported, missing, and cross-tenant edges", () => {
    const base = {
      id: uuid("20"), organization_id: uuid("2"), project_id: uuid("3"),
      from_entity_type: "commercial_item" as const, from_entity_id: uuid("1"),
      to_entity_type: "organization_material" as const, to_entity_id: uuid("5"),
      relationship_type: "derived_from_material" as const, superseded_at: null,
    };
    const scopes = new Map([
      [`commercial_item:${uuid("1")}`, { organizationId: uuid("2"), projectId: uuid("3") }],
      [`organization_material:${uuid("5")}`, { organizationId: uuid("99"), projectId: null }],
    ]);
    const findings = inspectCommercialLineageIntegrity({
      edges: [base, { ...base, id: uuid("21") }], commercialItems: [], entityScopes: scopes,
    });
    expect(findings.map((finding) => finding.code)).toContain("duplicate_active_edge");
    expect(findings.map((finding) => finding.code)).toContain("cross_organization_edge");
  });
});

