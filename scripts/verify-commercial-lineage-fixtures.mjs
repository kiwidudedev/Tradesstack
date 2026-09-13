import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase service-role environment is required.");
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fixtureItemIds = [randomUUID(), randomUUID()];
const result = {
  material: null,
  takeoff: null,
  unsupportedWriteRejected: false,
  crossOrganizationWriteRejected: false,
  anonymousTableAccessDenied: false,
  cleanup: false,
};

async function required(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function insertCommercialItem(id, template, lockedMetadata) {
  const fixtureCellKey = lockedMetadata.cells[0]?.cellKey ?? "A1";
  const fixtureColumnId = fixtureCellKey.replace(/[0-9]/g, "") || "A";
  const fixtureRowId = fixtureCellKey.replace(/[^0-9]/g, "") || "1";
  const cells = lockedMetadata.cells.map((cell) => ({
    cellKey: cell.cellKey,
    rowId: fixtureRowId,
    rowIndex: 0,
    columnId: fixtureColumnId,
    columnIndex: 0,
    formula: null,
    value: 1,
    computedValue: 1,
    displayValue: "1",
    metadata: cell.metadata,
  }));
  await required(admin.from("commercial_items").insert({
    id,
    organization_id: template.organization_id,
    opportunity_id: template.opportunity_id,
    project_id: template.project_id,
    source_type: "worksheet_selection",
    source_workbook_id: template.source_workbook_id,
    source_worksheet_id: template.source_workbook_id,
    source_sheet_id: template.source_sheet_id,
    source_range: `${fixtureCellKey}:${fixtureCellKey}`,
    source_signature: `lineage-fixture:${id}`,
    source_version: 1,
    source_status: "current",
    description: "Disposable commercial lineage verification fixture",
    quantity: 1,
    unit: "ea",
    rate: 1,
    total: 1,
    snapshot_json: {
      version: 1, sheetName: "Fixture", rangeLabel: `${fixtureCellKey}:${fixtureCellKey}`, rowCount: 1, columnCount: 1,
      cellCount: 1, nonEmptyCellCount: 1,
      columns: [{ id: fixtureColumnId, index: 0, label: fixtureColumnId }], rows: [{ id: fixtureRowId, index: 0 }],
      cells: [{ cellKey: fixtureCellKey, rowId: fixtureRowId, rowIndex: 0, columnId: fixtureColumnId, columnIndex: 0,
        type: "number", value: 1, computedValue: 1, displayValue: "1",
        format: { numberKind: null, textAlign: null, textWrapMode: null } }],
    },
    source_link_json: {
      version: 1, sourceType: "worksheet_selection", ownerType: "opportunity",
      opportunityId: template.opportunity_id, opportunitySlug: null, projectId: template.project_id,
      projectSlug: null, quoteId: null, variationId: null, worksheetId: template.source_workbook_id,
      workbookId: template.source_workbook_id, sheetId: template.source_sheet_id,
      worksheetName: "Fixture", sheetName: "Fixture", range: `${fixtureCellKey}:${fixtureCellKey}`, rowCount: 1,
      columnCount: 1, cellCount: 1, worksheetVersion: 1, capturedAt: new Date().toISOString(),
    },
    locked_metadata_json: {
      version: 1, worksheetVersion: lockedMetadata.worksheetVersion ?? 1,
      sheetName: "Fixture", rangeLabel: `${fixtureCellKey}:${fixtureCellKey}`, worksheetMetadata: {}, cells,
    },
    created_by: template.created_by,
    updated_by: template.created_by,
  }), "insert fixture Commercial Item");
}

try {
  const bindings = await required(admin.from("worksheet_material_price_bindings")
    .select("id,organization_id,workbook_id,sheet_id,current_cell_address,organization_material_id,supplier_id,supplier_product_id,supplier_price_id,inserted_by")
    .eq("binding_state", "active").not("inserted_by", "is", null).limit(20), "load active Material binding");
  let binding = null;
  let materialTemplate = null;
  for (const candidate of bindings) {
    const workbooks = await required(admin.from("opportunity_pricing_worksheets")
      .select("id,organization_id,opportunity_id,project_id,created_by")
      .eq("id", candidate.workbook_id).limit(1), "load Material workbook");
    if (workbooks[0]) {
      binding = candidate;
      materialTemplate = {
        ...workbooks[0],
        source_workbook_id: candidate.workbook_id,
        source_sheet_id: candidate.sheet_id,
        created_by: candidate.inserted_by ?? workbooks[0].created_by,
      };
      break;
    }
  }
  if (!binding || !materialTemplate) throw new Error("No safe active Material binding fixture was available.");

  await insertCommercialItem(fixtureItemIds[0], materialTemplate, {
    version: 1,
    worksheetVersion: 1,
    cells: [{
      cellKey: binding.current_cell_address,
      metadata: {
        materialPricing: {
          version: 1,
          bindingId: binding.id,
          organizationMaterialId: binding.organization_material_id,
          supplierId: binding.supplier_id,
          supplierProductId: binding.supplier_product_id,
          supplierPriceId: binding.supplier_price_id,
          snapshot: {
            materialName: "Fixture", supplierName: "Fixture", supplierProductDescription: null,
            supplierSku: null, unitCost: 1, unit: "ea", currency: "NZD", sourceTaxBasis: "exclusive",
            sourceTaxRate: 0.15, taxJurisdictionCode: "NZ", priceEffectiveFrom: new Date().toISOString(),
            evaluatedAt: new Date().toISOString(),
          },
        },
      },
    }],
  });
  const materialFirst = await required(admin.rpc("sync_commercial_item_lineage", {
    p_commercial_item_id: fixtureItemIds[0],
  }), "sync Material fixture");
  const materialRetry = await required(admin.rpc("sync_commercial_item_lineage", {
    p_commercial_item_id: fixtureItemIds[0],
  }), "retry Material fixture");
  const materialEdges = await required(admin.from("commercial_lineage_edges")
    .select("relationship_type,to_entity_type,to_entity_id")
    .eq("from_entity_id", fixtureItemIds[0]).is("superseded_at", null), "read Material fixture edges");
  result.material = { firstInserted: materialFirst, retryInserted: materialRetry, edges: materialEdges };

  const items = await required(admin.from("commercial_items")
    .select("organization_id,opportunity_id,project_id,source_workbook_id,source_sheet_id,created_by")
    .not("project_id", "is", null).limit(200), "load Takeoff workbook candidates");
  const templateByScope = new Map(items.map((item) => [`${item.organization_id}:${item.project_id}`, item]));
  const measurements = await required(admin.from("takeoff_measurements")
    .select("id,organization_id,project_id,opportunity_id,drawing_set_id,page_id,group_id,version,quantity,display_unit,updated_at")
    .is("archived_at", null).limit(500), "load Takeoff candidates");
  const measurement = measurements.find((candidate) => {
    const template = templateByScope.get(`${candidate.organization_id}:${candidate.project_id}`);
    return template?.opportunity_id === candidate.opportunity_id;
  });
  if (!measurement) throw new Error("No same-project Takeoff/workbook fixture was available.");
  const takeoffTemplate = templateByScope.get(`${measurement.organization_id}:${measurement.project_id}`);
  await insertCommercialItem(fixtureItemIds[1], takeoffTemplate, {
    version: 1,
    worksheetVersion: 1,
    cells: [{
      cellKey: "A1",
      metadata: {
        measureSource: {
          version: 1, bindingId: randomUUID(), measurementId: measurement.id,
          measurementVersion: measurement.version, projectId: measurement.project_id,
          drawingSetId: measurement.drawing_set_id, drawingSetName: "Fixture drawing set",
          pageId: measurement.page_id, pageNumber: 1, pageLabel: null,
          groupId: measurement.group_id, groupName: null, measurementKind: "line",
          measurementName: "Fixture measurement", sourceDescription: null,
          insertedField: "quantity", insertedValue: measurement.quantity,
          insertedQuantity: measurement.quantity, insertedUnit: measurement.display_unit ?? "m",
          sourceUpdatedAt: measurement.updated_at, insertedAt: new Date().toISOString(),
        },
      },
    }],
  });
  const takeoffFirst = await required(admin.rpc("sync_commercial_item_lineage", {
    p_commercial_item_id: fixtureItemIds[1],
  }), "sync Takeoff fixture");
  const takeoffRetry = await required(admin.rpc("sync_commercial_item_lineage", {
    p_commercial_item_id: fixtureItemIds[1],
  }), "retry Takeoff fixture");
  const takeoffEdges = await required(admin.from("commercial_lineage_edges")
    .select("relationship_type,to_entity_type,to_entity_id,contribution_quantity")
    .eq("from_entity_id", fixtureItemIds[1]).is("superseded_at", null), "read Takeoff fixture edges");
  result.takeoff = { firstInserted: takeoffFirst, retryInserted: takeoffRetry, edges: takeoffEdges };

  const { error: invalidError } = await admin.from("commercial_lineage_edges").insert({
    organization_id: materialTemplate.organization_id,
    project_id: materialTemplate.project_id,
    from_entity_type: "commercial_item",
    from_entity_id: fixtureItemIds[0],
    to_entity_type: "takeoff_measurement",
    to_entity_id: measurement.id,
    relationship_type: "caused_by",
    evidence_source: "fixture",
    evidence_version: "v1",
    evidence_ref: {},
  });
  result.unsupportedWriteRejected = Boolean(invalidError);
  const { error: crossOrganizationError } = await admin.from("commercial_lineage_edges").insert({
    organization_id: materialTemplate.organization_id,
    project_id: materialTemplate.project_id,
    from_entity_type: "commercial_item",
    from_entity_id: fixtureItemIds[0],
    to_entity_type: "takeoff_measurement",
    to_entity_id: measurement.id,
    relationship_type: "measured_from",
    evidence_source: "fixture",
    evidence_version: "v1",
    evidence_ref: {},
  });
  result.crossOrganizationWriteRejected = Boolean(crossOrganizationError?.message.includes("cross_organization_edge"));

  const { error: anonymousReadError } = await anonymous.from("commercial_lineage_edges").select("id").limit(1);
  result.anonymousTableAccessDenied = Boolean(anonymousReadError);
} finally {
  await admin.from("commercial_lineage_edges").delete().in("from_entity_id", fixtureItemIds);
  await admin.from("commercial_lineage_edges").delete().in("to_entity_id", fixtureItemIds);
  await admin.from("commercial_items").delete().in("id", fixtureItemIds);
  const remaining = await admin.from("commercial_items").select("id").in("id", fixtureItemIds);
  result.cleanup = !remaining.error && (remaining.data?.length ?? 0) === 0;
}

if (result.material?.firstInserted !== 3 || result.material?.retryInserted !== 0
  || result.takeoff?.firstInserted !== 1 || result.takeoff?.retryInserted !== 0
  || !result.unsupportedWriteRejected || !result.crossOrganizationWriteRejected
  || !result.anonymousTableAccessDenied || !result.cleanup) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  throw new Error("Hosted commercial lineage fixture verification failed.");
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
