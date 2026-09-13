import { describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_SUPABASE_DB_TESTS === "1";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const measurementId = "aad63b7c-4b2f-4157-9040-2b9ace3f333c";
const drawingSetId = "37330a49-e8da-42fe-a915-f44b9d014ab0";
const pageId = "ef7ea961-0228-4e7e-b7bd-245b7f90b512";
const opportunityId = "8dd32a55-af63-42d8-880c-ada8c793f781";
const dataProjectId = "9688f1a0-ca08-4778-8d84-c9b93c5e1be8";

const takeoffSnapshot = {
  version: 1,
  sourceType: "takeoff_measurement",
  measurementId,
  measurementVersion: 1,
  measurementUpdatedAt: "2026-04-28T08:07:10.315445+00:00",
  measurementKind: "line",
  drawingSetId,
  pageId,
  measurementName: "Slab Edge",
  measurementDescription: "50mm NIB",
  displayQuantity: 33.07,
  displayUnit: "m",
  commercialDescription: "Slab Edge",
  commercialQuantity: 33.07,
  commercialRate: 0,
  commercialTotal: 0,
};

const takeoffSourceLink = {
  sourceType: "takeoff_measurement",
  measurementId,
  measurementVersion: 1,
  drawingSetId,
  measurementUpdatedAt: "2026-04-28T08:07:10.315445+00:00",
  pageId,
  ownerType: "opportunity",
  ownerSlug: "skycity-auckland",
  opportunityId,
  projectId: null,
  dataProjectId,
  capturedAt: "2026-08-26T06:30:00+00:00",
};

const worksheetSnapshot = {
  version: 1,
  sheetName: "Pricing",
  rangeLabel: "A1:D1",
  rowCount: 0,
  columnCount: 0,
  cellCount: 0,
  nonEmptyCellCount: 0,
  columns: [],
  rows: [],
  cells: [],
};

const worksheetSourceLink = {
  version: 1,
  sourceType: "worksheet_selection",
  ownerType: null,
  opportunityId: null,
  opportunitySlug: null,
  projectId: null,
  projectSlug: null,
  quoteId: null,
  variationId: null,
  worksheetId: "11111111-1111-4111-8111-111111111111",
  workbookId: "22222222-2222-4222-8222-222222222222",
  sheetId: "33333333-3333-4333-8333-333333333333",
  worksheetName: "Estimate",
  sheetName: "Pricing",
  range: "A1:D1",
  rowCount: 0,
  columnCount: 0,
  cellCount: 0,
  worksheetVersion: 1,
  capturedAt: "2026-08-26T06:30:00+00:00",
};

const worksheetLockedMetadata = {
  version: 1,
  worksheetVersion: 1,
  sheetName: "Pricing",
  rangeLabel: "A1:D1",
  worksheetMetadata: {},
  cells: [],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function callBooleanRpc(functionName: string, body: Record<string, unknown>) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase runtime test environment is not configured");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status}): ${responseBody}`);
  }

  return JSON.parse(responseBody) as boolean;
}

async function restRequest(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase runtime test environment is not configured");
  }

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

describe.runIf(shouldRun)("live PostgreSQL commercial-item validators", () => {
  it("accepts the exact Slab Edge Takeoff contracts", async () => {
    await expect(
      callBooleanRpc("validate_commercial_item_snapshot_json", { p_snapshot: takeoffSnapshot }),
    ).resolves.toBe(true);
    await expect(
      callBooleanRpc("validate_commercial_item_source_link_json", { p_source_link: takeoffSourceLink }),
    ).resolves.toBe(true);
    await expect(
      callBooleanRpc("validate_takeoff_commercial_item_locked_metadata_json", { p_locked_metadata: {} }),
    ).resolves.toBe(true);
  });

  it("accepts a valid Takeoff record and rejects inconsistent record identity atomically", async () => {
    const measurementResponse = await restRequest(
      `takeoff_measurements?select=organization_id,project_id,version,updated_at,measurement_kind,drawing_set_id,page_id,name,description,display_value,display_unit,created_by&id=eq.${measurementId}`,
    );
    expect(measurementResponse.ok).toBe(true);
    const [measurement] = await measurementResponse.json() as Array<{
      organization_id: string;
      project_id: string;
      version: number;
      updated_at: string;
      measurement_kind: string;
      drawing_set_id: string;
      page_id: string;
      name: string;
      description: string;
      display_value: string;
      display_unit: string;
      created_by: string;
    }>;
    expect(measurement).toBeTruthy();

    const normalizedQuantity = Math.round(Number(measurement.display_value) * 1_000) / 1_000;
    const runtimeSnapshot = {
      ...takeoffSnapshot,
      measurementVersion: measurement.version,
      measurementUpdatedAt: measurement.updated_at,
      measurementKind: measurement.measurement_kind,
      drawingSetId: measurement.drawing_set_id,
      pageId: measurement.page_id,
      measurementName: measurement.name,
      measurementDescription: measurement.description,
      displayQuantity: normalizedQuantity,
      displayUnit: measurement.display_unit,
      commercialQuantity: normalizedQuantity,
    };
    const runtimeSourceLink = {
      ...takeoffSourceLink,
      measurementVersion: measurement.version,
      measurementUpdatedAt: measurement.updated_at,
      drawingSetId: measurement.drawing_set_id,
      pageId: measurement.page_id,
      dataProjectId: measurement.project_id,
      capturedAt: new Date().toISOString(),
    };
    const signaturePrefix = `codex-takeoff-validator-${Date.now()}`;
    const baseRecord = {
      organization_id: measurement.organization_id,
      opportunity_id: opportunityId,
      project_id: null,
      source_type: "takeoff_measurement",
      source_workbook_id: null,
      source_worksheet_id: null,
      source_sheet_id: null,
      source_takeoff_measurement_id: measurementId,
      source_range: null,
      source_signature: `${signaturePrefix}-valid`,
      source_version: measurement.version,
      source_status: "current",
      description: "Slab Edge",
      quantity: normalizedQuantity,
      unit: measurement.display_unit,
      rate: 0,
      total: 0,
      snapshot_json: runtimeSnapshot,
      source_link_json: runtimeSourceLink,
      locked_metadata_json: {},
      ucl_validation_status: "not_reviewed",
      created_by: measurement.created_by,
      updated_by: measurement.created_by,
    };
    const createdIds: string[] = [];

    try {
      const validResponse = await restRequest("commercial_items?select=id,source_type,source_takeoff_measurement_id,source_version", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(baseRecord),
      });
      const validBody = await validResponse.text();
      expect(validResponse.ok, validBody).toBe(true);
      const [validItem] = JSON.parse(validBody) as Array<{
        id: string;
        source_type: string;
        source_takeoff_measurement_id: string;
        source_version: number;
      }>;
      createdIds.push(validItem.id);
      expect(validItem).toMatchObject({
        source_type: "takeoff_measurement",
        source_takeoff_measurement_id: measurementId,
        source_version: measurement.version,
      });

      const invalidRecords = [
        {
          name: "source measurement mismatch",
          patch: {
            snapshot_json: {
              ...runtimeSnapshot,
              measurementId: "44444444-4444-4444-8444-444444444444",
            },
          },
        },
        {
          name: "source version mismatch",
          patch: { source_version: measurement.version + 1 },
        },
        {
          name: "worksheet identity populated",
          patch: { source_workbook_id: "55555555-5555-4555-8555-555555555555" },
        },
        {
          name: "source-link measurement mismatch",
          patch: {
            source_link_json: {
              ...runtimeSourceLink,
              measurementId: "66666666-6666-4666-8666-666666666666",
            },
          },
        },
        {
          name: "snapshot source type mismatch",
          patch: {
            snapshot_json: {
              ...runtimeSnapshot,
              sourceType: "worksheet_selection",
            },
          },
        },
        {
          name: "worksheet locked metadata",
          patch: { locked_metadata_json: worksheetLockedMetadata },
        },
      ];

      for (const [index, invalid] of invalidRecords.entries()) {
        const response = await restRequest("commercial_items?select=id", {
          method: "POST",
          headers: { prefer: "return=representation" },
          body: JSON.stringify({
            ...baseRecord,
            source_signature: `${signaturePrefix}-invalid-${index}`,
            ...invalid.patch,
          }),
        });
        const responseBody = await response.text();
        if (response.ok) {
          const inserted = JSON.parse(responseBody) as Array<{ id: string }>;
          createdIds.push(...inserted.map((row) => row.id));
        }
        expect(response.ok, `${invalid.name}: ${responseBody}`).toBe(false);
      }

      const invalidCountResponse = await restRequest(
        `commercial_items?select=id&source_signature=like.${signaturePrefix}-invalid-*`,
        { headers: { prefer: "count=exact" } },
      );
      expect(invalidCountResponse.ok).toBe(true);
      expect(await invalidCountResponse.json()).toEqual([]);
    } finally {
      for (const id of createdIds) {
        const cleanupResponse = await restRequest(`commercial_items?id=eq.${id}`, { method: "DELETE" });
        expect(cleanupResponse.ok).toBe(true);
      }
    }
  }, 20_000);

  it("rejects malformed Takeoff snapshots using the real validator", async () => {
    const invalidSnapshots: Array<[string, Record<string, unknown>]> = [];
    const missingMeasurementId = clone(takeoffSnapshot) as Record<string, unknown>;
    delete missingMeasurementId.measurementId;
    invalidSnapshots.push(["missing measurementId", missingMeasurementId]);
    for (const key of ["measurementVersion", "drawingSetId", "pageId", "displayQuantity"] as const) {
      const missingField = clone(takeoffSnapshot) as Record<string, unknown>;
      delete missingField[key];
      invalidSnapshots.push([`missing ${key}`, missingField]);
    }

    for (const [name, key, value] of [
      ["invalid measurement UUID", "measurementId", "not-a-uuid"],
      ["measurementVersion zero", "measurementVersion", 0],
      ["invalid timestamp", "measurementUpdatedAt", "not-a-timestamp"],
      ["unsupported kind", "measurementKind", "volume"],
      ["invalid drawing set", "drawingSetId", "not-a-uuid"],
      ["invalid page", "pageId", "not-a-uuid"],
      ["blank name", "measurementName", "  "],
      ["null quantity", "displayQuantity", null],
      ["blank unit", "displayUnit", "  "],
      ["blank commercial description", "commercialDescription", "  "],
      ["negative rate", "commercialRate", -1],
      ["negative total", "commercialTotal", -1],
      ["inconsistent total", "commercialTotal", 1],
      ["wrong source type", "sourceType", "worksheet_selection"],
    ] as const) {
      invalidSnapshots.push([name, { ...takeoffSnapshot, [key]: value }]);
    }
    invalidSnapshots.push(["extra key", { ...takeoffSnapshot, unexpected: true }]);

    const results = await Promise.all(
      invalidSnapshots.map(async ([name, snapshot]) => [
        name,
        await callBooleanRpc("validate_commercial_item_snapshot_json", { p_snapshot: snapshot }),
      ] as const),
    );
    for (const [name, result] of results) expect(result, name).toBe(false);
  });

  it("rejects malformed Takeoff source links using the real validator", async () => {
    const missingMeasurementId = clone(takeoffSourceLink) as Record<string, unknown>;
    delete missingMeasurementId.measurementId;
    const missingDataProjectId = clone(takeoffSourceLink) as Record<string, unknown>;
    delete missingDataProjectId.dataProjectId;

    const invalidLinks: Array<[string, Record<string, unknown>]> = [
      ["missing measurementId", missingMeasurementId],
      ["wrong source type", { ...takeoffSourceLink, sourceType: "worksheet_selection" }],
      ["invalid drawing set", { ...takeoffSourceLink, drawingSetId: "not-a-uuid" }],
      ["invalid page", { ...takeoffSourceLink, pageId: "not-a-uuid" }],
      ["invalid capturedAt", { ...takeoffSourceLink, capturedAt: "not-a-timestamp" }],
      ["missing data project", missingDataProjectId],
      ["unsupported owner", { ...takeoffSourceLink, ownerType: "variation" }],
      ["extra key", { ...takeoffSourceLink, unexpected: true }],
      ["measurement version zero", { ...takeoffSourceLink, measurementVersion: 0 }],
    ];

    const results = await Promise.all(
      invalidLinks.map(async ([name, sourceLink]) => [
        name,
        await callBooleanRpc("validate_commercial_item_source_link_json", { p_source_link: sourceLink }),
      ] as const),
    );
    for (const [name, result] of results) expect(result, name).toBe(false);
  });

  it("preserves worksheet validation and isolates locked metadata by source", async () => {
    await expect(
      callBooleanRpc("validate_commercial_item_snapshot_json", { p_snapshot: worksheetSnapshot }),
    ).resolves.toBe(true);
    await expect(
      callBooleanRpc("validate_commercial_item_source_link_json", { p_source_link: worksheetSourceLink }),
    ).resolves.toBe(true);
    await expect(
      callBooleanRpc("validate_commercial_item_locked_metadata_json", {
        p_locked_metadata: worksheetLockedMetadata,
      }),
    ).resolves.toBe(true);
    await expect(
      callBooleanRpc("validate_takeoff_commercial_item_locked_metadata_json", {
        p_locked_metadata: worksheetLockedMetadata,
      }),
    ).resolves.toBe(false);
    await expect(
      callBooleanRpc("validate_takeoff_commercial_item_locked_metadata_json", {
        p_locked_metadata: { version: 1 },
      }),
    ).resolves.toBe(false);
    await expect(
      callBooleanRpc("validate_commercial_item_snapshot_json", {
        p_snapshot: { ...worksheetSnapshot, unexpected: true },
      }),
    ).resolves.toBe(false);
    await expect(
      callBooleanRpc("validate_commercial_item_source_link_json", {
        p_source_link: { ...worksheetSourceLink, sourceType: "takeoff_measurement" },
      }),
    ).resolves.toBe(false);
    await expect(
      callBooleanRpc("validate_commercial_item_locked_metadata_json", { p_locked_metadata: {} }),
    ).resolves.toBe(false);
  });
});
