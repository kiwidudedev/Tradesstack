import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  type SupplierBillUclBusinessRecord,
  validateSupplierBillUclBusinessRecord,
} from "@/lib/universal-learning/supplier-bill-schema";
import {
  getSupplierBillEffectiveCursor,
  selectSupplierBillRecordsForPrompt,
} from "@/lib/universal-learning/supplier-bill-prompt";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

function parseScalar(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === "null") {
    return null;
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function applyOrFilter(rows: Row[], expression: string) {
  const match = expression.match(/^([^.,]+)\.gt\.([^,]+),and\(\1\.eq\.([^,]+),id\.gt\.([^)]+)\)$/);
  if (match) {
    const [, column, gtValueRaw, eqValueRaw, idValueRaw] = match;
    const gtValue = parseScalar(gtValueRaw);
    const eqValue = parseScalar(eqValueRaw);
    const idValue = parseScalar(idValueRaw);

    return rows.filter((row) => {
      const columnValue = typeof row[column] === "string" ? row[column] : null;
      const rowId = typeof row.id === "string" ? row.id : null;
      return (
        (columnValue !== null && String(columnValue) > String(gtValue))
        || (columnValue !== null && String(columnValue) === String(eqValue) && rowId !== null && String(rowId) > String(idValue))
      );
    });
  }

  const simpleMatch = expression.match(/^([^.,]+)\.gt\.(.+)$/);
  if (simpleMatch) {
    const [, column, valueRaw] = simpleMatch;
    const value = parseScalar(valueRaw);
    return rows.filter((row) => {
      const columnValue = typeof row[column] === "string" ? row[column] : null;
      return columnValue !== null && String(columnValue) > String(value);
    });
  }

  throw new Error(`Unsupported fake or() expression: ${expression}`);
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private readonly table: string;
  private readonly data: TableData;
  private filters: Array<(row: Row) => boolean> = [];
  private sorts: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;

  constructor(table: string, data: TableData) {
    this.table = table;
    this.data = data;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => typeof row[column] === "string" && String(row[column]) >= String(value));
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push((row) => typeof row[column] === "string" && String(row[column]) < String(value));
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  or(expression: string) {
    this.filters.push((row) => applyOrFilter([row], expression).length > 0);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private execute() {
    let rows = [...(this.data[this.table] ?? [])];
    for (const filter of this.filters) {
      rows = rows.filter(filter);
    }

    for (let index = this.sorts.length - 1; index >= 0; index -= 1) {
      const sort = this.sorts[index];
      rows.sort((left, right) => {
        const leftValue = left[sort.column];
        const rightValue = right[sort.column];
        const leftComparable = leftValue == null ? "" : String(leftValue);
        const rightComparable = rightValue == null ? "" : String(rightValue);
        const comparison = leftComparable.localeCompare(rightComparable);
        return sort.ascending ? comparison : comparison * -1;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function installFakeAdmin(data: TableData) {
  createAdminSupabaseClient.mockReturnValue({
    from(table: string) {
      return new FakeQuery(table, data);
    },
  });
}

describe("Universal learning builders monthly selection", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("keeps project purchase order selection inside the review month even when only a child status event changed", async () => {
    installFakeAdmin({
      project_purchase_orders: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          status: "Approved",
          origin: "manual",
          invoice_ready: false,
          updated_at: "2026-05-20T09:00:00.000Z",
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          status: "Approved",
          origin: "manual",
          invoice_ready: false,
          updated_at: "2026-05-28T09:00:00.000Z",
        },
        {
          id: "00000000-0000-0000-0000-000000000003",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          status: "Approved",
          origin: "manual",
          invoice_ready: false,
          updated_at: "2026-07-02T09:00:00.000Z",
        },
      ],
      project_purchase_order_line_items: [],
      project_purchase_order_status_events: [
        {
          id: "10000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          purchase_order_id: "00000000-0000-0000-0000-000000000001",
          changed_at: "2026-06-12T10:00:00.000Z",
        },
        {
          id: "10000000-0000-0000-0000-000000000002",
          organization_id: "org-1",
          purchase_order_id: "00000000-0000-0000-0000-000000000002",
          changed_at: "2026-05-29T10:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_purchase_order",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.sourceId).toBe("00000000-0000-0000-0000-000000000001");
    expect(result.records[0]?.updatedAt).toBe("2026-06-12T10:00:00.000Z");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-12T10:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("applies both the claim month window and the previous cursor gate", async () => {
    installFakeAdmin({
      project_claims: [
        {
          id: "20000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          status: "Submitted",
          claim_type: "progress",
          updated_at: "2026-06-05T09:00:00.000Z",
        },
        {
          id: "20000000-0000-0000-0000-000000000002",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          status: "Submitted",
          claim_type: "progress",
          updated_at: "2026-06-20T11:30:00.000Z",
        },
        {
          id: "20000000-0000-0000-0000-000000000003",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          status: "Submitted",
          claim_type: "progress",
          updated_at: "2026-07-02T08:00:00.000Z",
        },
      ],
      project_claim_line_items: [],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_claim",
      context: {
        organizationId: "org-1",
        cursor: {
          updatedAt: "2026-06-10T00:00:00.000Z",
          id: "20000000-0000-0000-0000-000000000000",
        },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.sourceId).toBe("20000000-0000-0000-0000-000000000002");
    expect(result.records[0]?.updatedAt).toBe("2026-06-20T11:30:00.000000Z");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-20T11:30:00.000000Z",
      id: "20000000-0000-0000-0000-000000000002",
    });
  });

  it("skips cleanly when a review month has no in-window records", async () => {
    installFakeAdmin({
      opportunity_pricing_workbook_sheets: [
        {
          id: "30000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          updated_by: "user-1",
          version: 3,
          updated_at: "2026-05-18T09:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const previousCursor = {
      updatedAt: "2026-05-18T09:00:00.000Z",
      id: "30000000-0000-0000-0000-000000000001",
    };
    const result = await buildUniversalLearningContainerRecords({
      containerType: "pricing_workbook_sheet",
      context: {
        organizationId: "org-1",
        cursor: previousCursor,
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toEqual([]);
    expect(result.nextCursorCandidate).toEqual(previousCursor);
    expect(result.reviewScopeContext.recordCount).toBe(0);
  });

  it("enriches pricing workbook sheets into a saved-only trust-boundary packet", async () => {
    installFakeAdmin({
      opportunity_pricing_workbook_sheets: [
        {
          id: "sheet-1",
          workbook_id: "workbook-1",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          name: "Partitions Worksheet",
          sheet_order: 0,
          is_default: true,
          version: 4,
          created_by: "estimator-1",
          updated_by: "estimator-2",
          created_at: "2026-06-01T09:00:00.000Z",
          updated_at: "2026-06-14T10:30:00.000Z",
          worksheet_data: {
            version: 4,
            sheetName: "Partitions Worksheet",
            rowCount: 8,
            columnCount: 4,
            columns: [
              { id: "A", index: 0, label: "A", width: 140 },
              { id: "B", index: 1, label: "B", width: 140 },
              { id: "C", index: 2, label: "C", width: 140 },
              { id: "D", index: 3, label: "D", width: 140 },
            ],
            rows: Array.from({ length: 8 }, (_, index) => ({ id: String(index + 1), index, height: 36 })),
            cells: {
              A1: { value: "Description", type: "text", formula: null, computedValue: "Description", displayValue: "Description", metadata: {} },
              B1: { value: "Qty", type: "text", formula: null, computedValue: "Qty", displayValue: "Qty", metadata: {} },
              C1: { value: "Rate", type: "text", formula: null, computedValue: "Rate", displayValue: "Rate", metadata: {} },
              D1: { value: "Total", type: "text", formula: null, computedValue: "Total", displayValue: "Total", metadata: {} },
              A2: { value: "13mm GIB board", type: "text", formula: null, computedValue: "13mm GIB board", displayValue: "13mm GIB board", metadata: { aiInteractionId: "hidden" } },
              B2: { value: 120, type: "number", formula: null, computedValue: 120, displayValue: "120", metadata: {} },
              C2: { value: 24.5, type: "number", formula: null, computedValue: 24.5, displayValue: "24.5", metadata: {} },
              D2: { value: "=B2*C2", type: "text", formula: "=B2*C2", computedValue: 2940, displayValue: "2940", metadata: {} },
              A3: { value: "Labour install", type: "text", formula: null, computedValue: "Labour install", displayValue: "Labour install", metadata: {} },
              B3: { value: 18, type: "number", formula: null, computedValue: 18, displayValue: "18", metadata: {} },
              C3: { value: 72, type: "number", formula: null, computedValue: 72, displayValue: "72", metadata: {} },
              D3: { value: "=B3*C3", type: "text", formula: "=B3*C3", computedValue: 1296, displayValue: "1296", metadata: {} },
              A4: { value: "Wastage allowance", type: "text", formula: null, computedValue: "Wastage allowance", displayValue: "Wastage allowance", metadata: {} },
              B4: { value: 10, type: "number", formula: null, computedValue: 10, displayValue: "10", metadata: {} },
              A5: { value: "Margin", type: "text", formula: null, computedValue: "Margin", displayValue: "Margin", metadata: {} },
              B5: { value: 15, type: "number", formula: null, computedValue: 15, displayValue: "15", metadata: {} },
              A6: { value: "Exclusion", type: "text", formula: null, computedValue: "Exclusion", displayValue: "Exclusion", metadata: {} },
              B6: { value: "Painting by others", type: "text", formula: null, computedValue: "Painting by others", displayValue: "Painting by others", metadata: {} },
            },
            metadata: {
              templateId: "template-hidden",
              notes: "Assume after-hours access and clear working area.",
              aiPreviewId: "hidden-preview",
            },
          },
          pricing_summary: {
            version: 1,
            currency: "NZD",
            subtotal: 4236,
            margin: 635.4,
            gst: 730.71,
            grandTotal: 5602.11,
            lastCalculatedAt: "2026-06-14T10:30:00.000Z",
          },
          extracted_pricing_data: {
            version: 1,
            extractedAt: "2026-06-14T10:29:00.000Z",
            method: "ai",
            confidence: 0.81,
            lineItems: [
              { name: "13mm GIB board", quantity: 120, unit: "m2", rate: 24.5, total: 2940 },
              { name: "Labour install", quantity: 18, unit: "hr", rate: 72, total: 1296 },
            ],
            summary: {
              trade: "Partitions",
              lineItemCount: 2,
            },
            warnings: ["ignored for trust boundary"],
            sourceWorksheetVersion: 4,
          },
          ai_interactions: { prompt: "forbidden" },
          preview_payload: { operations: ["forbidden"] },
          validation_warnings: ["forbidden"],
          semantic_pool_id: "forbidden",
        },
      ],
      opportunity_pricing_worksheets: [
        {
          id: "workbook-1",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          name: "Level 3 Partitions",
          trade_package: "Partitions",
          last_active_sheet_id: "sheet-1",
          archived_at: null,
          version: 4,
          created_by: "estimator-1",
          updated_by: "estimator-2",
          created_at: "2026-06-01T09:00:00.000Z",
          updated_at: "2026-06-14T10:30:00.000Z",
        },
      ],
      organization_opportunities: [
        {
          id: "opp-1",
          organization_id: "org-1",
          name: "Long Bay Apartments",
          opportunity_code: "OPP-42",
          stage: "pricing",
          location: "Auckland",
          client_id: "client-1",
          estimated_value: 100000,
          workspace_project_id: "project-1",
          converted_project_id: "project-1",
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Long Bay Apartments",
          project_code: "P-100",
          stage: "estimating",
          location: "Auckland",
          client_id: "client-1",
          source_opportunity_id: "opp-1",
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Long Bay Client",
          company_name: "Long Bay Developments",
          client_status: "active",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "pricing_workbook_sheet",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record?.source).toMatchObject({
      table: "opportunity_pricing_workbook_sheets",
      sourceId: "sheet-1",
      sourceVersion: 4,
    });
    expect(record?.routingContext).toEqual({ readOnly: true });
    expect(Object.keys((record?.payload ?? {} as Record<string, unknown>)).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);

    const payload = record?.payload as Record<string, any>;
    expect(payload.sourceEvidence.worksheetIdentity).toMatchObject({
      workbookId: "workbook-1",
      workbookName: "Level 3 Partitions",
      sheetId: "sheet-1",
      sheetName: "Partitions Worksheet",
      tradePackage: "Partitions",
      isDefaultSheet: true,
    });
    expect(payload.sourceEvidence.worksheetStructureSummary).toMatchObject({
      rowCount: 8,
      columnCount: 4,
      populatedCellCount: 18,
      formulaCellCount: 2,
    });
    expect(payload.sourceEvidence.retainedPricingSummary).toMatchObject({
      currency: "NZD",
      subtotal: 4236,
      margin: 635.4,
      gst: 730.71,
      grandTotal: 5602.11,
    });
    expect(payload.sourceEvidence.retainedExtractedPricingData).toMatchObject({
      method: "ai",
      confidence: 0.81,
      lineItemCount: 2,
      sourceWorksheetVersion: 4,
    });
    expect(payload.sourceEvidence.retainedEstimatingSignals.quantities.length).toBeGreaterThan(0);
    expect(payload.sourceEvidence.retainedEstimatingSignals.rates.length).toBeGreaterThan(0);
    expect(payload.sourceEvidence.retainedEstimatingSignals.buildUpPatterns.labour.length).toBeGreaterThan(0);
    expect(payload.sourceEvidence.retainedCommercialNotes).toMatchObject({
      worksheetNotes: "Assume after-hours access and clear working area.",
    });
    expect(payload.operationalContext).toMatchObject({
      worksheetMaturity: "revised_established",
      worksheetVersion: 4,
      hasPricingSummary: true,
      hasExtractedPricingData: true,
      hasTradePackage: true,
      evidenceStrength: "strong",
    });
    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      clientId: "client-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sourceTable: "opportunity_pricing_workbook_sheets",
      parentTable: "opportunity_pricing_worksheets",
    });

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("\"row\"");
    expect(serialized).not.toContain("ai_interactions");
    expect(serialized).not.toContain("preview_payload");
    expect(serialized).not.toContain("validation_warnings");
    expect(serialized).not.toContain("semantic_pool_id");
    expect(serialized).not.toContain("hidden-preview");
    expect(serialized).not.toContain("hidden");
  });

  it("uses created_at for takeoff measurement point deltas", async () => {
    installFakeAdmin({
      takeoff_measurements: [
        {
          id: "40000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          updated_by: "user-1",
          status: "active",
          measurement_kind: "area",
          source: "manual",
          version: 1,
          updated_at: "2026-05-18T09:00:00.000Z",
        },
      ],
      takeoff_measurement_points: [
        {
          id: "41000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          measurement_id: "40000000-0000-0000-0000-000000000001",
          point_order: 1,
          created_at: "2026-06-08T09:00:00.000Z",
        },
      ],
      takeoff_measurement_events: [],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "takeoff_measurement",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.sourceId).toBe("40000000-0000-0000-0000-000000000001");
    expect(result.records[0]?.updatedAt).toBe("2026-06-08T09:00:00.000Z");
  });

  it("enriches project time sheet entries into a labour-only trust-boundary packet", async () => {
    installFakeAdmin({
      project_time_sheet_entries: [
        {
          id: "timesheet-1",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "manager-1",
          worker_user_id: "worker-1",
          worker_member_id: "member-1",
          worker_name: "Casey Worker",
          company_name: "TradesStack Interiors",
          trade_name: "Ceilings",
          purchase_order_id: "po-1",
          purchase_order_number: "PO-100",
          purchase_order_title: "Ceiling Labour",
          client_entry_id: "mobile-hidden-entry",
          source: "mobile",
          created_from_device_id: "hidden-device",
          synced_at: "2026-06-15T17:02:00.000Z",
          clock_in_at: "2026-06-15T08:00:00.000Z",
          clock_out_at: "2026-06-15T17:00:00.000Z",
          clock_in_latitude: -36.8485,
          clock_in_longitude: 174.7633,
          clock_in_accuracy_meters: 9,
          clock_out_latitude: -36.8486,
          clock_out_longitude: 174.7635,
          clock_out_accuracy_meters: 11,
          warning_8h5_at: "2026-06-15T16:30:00.000Z",
          auto_clocked_out: false,
          auto_clocked_out_at: null,
          total_hours: 9,
          notes: "Stayed late to complete ceiling grid.",
          created_at: "2026-06-15T08:00:00.000Z",
          updated_at: "2026-06-15T17:00:00.000Z",
        },
        {
          id: "timesheet-2",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "manager-1",
          worker_user_id: "worker-1",
          worker_member_id: "member-1",
          worker_name: "Casey Worker",
          company_name: "TradesStack Interiors",
          trade_name: "Ceilings",
          purchase_order_id: "po-1",
          purchase_order_number: "PO-100",
          purchase_order_title: "Ceiling Labour",
          client_entry_id: "mobile-hidden-entry-2",
          source: "web",
          created_from_device_id: null,
          synced_at: null,
          clock_in_at: "2026-06-10T07:30:00.000Z",
          clock_out_at: "2026-06-10T15:30:00.000Z",
          clock_in_latitude: null,
          clock_in_longitude: null,
          clock_in_accuracy_meters: null,
          clock_out_latitude: null,
          clock_out_longitude: null,
          clock_out_accuracy_meters: null,
          warning_8h5_at: null,
          auto_clocked_out: false,
          auto_clocked_out_at: null,
          total_hours: 8,
          notes: "",
          created_at: "2026-06-10T07:30:00.000Z",
          updated_at: "2026-06-10T15:30:00.000Z",
        },
      ],
      project_time_sheet_events: [
        {
          id: "event-1",
          organization_id: "org-1",
          project_id: "project-1",
          entry_id: "timesheet-1",
          actor_user_id: "worker-1",
          worker_name: "Casey Worker",
          event_type: "clock_in",
          message: "Clocked in via mobile.",
          created_at: "2026-06-15T08:00:00.000Z",
        },
        {
          id: "event-2",
          organization_id: "org-1",
          project_id: "project-1",
          entry_id: "timesheet-1",
          actor_user_id: null,
          worker_name: "Casey Worker",
          event_type: "warning_8h5",
          message: "8.5h warning triggered.",
          created_at: "2026-06-15T16:30:00.000Z",
        },
        {
          id: "event-3",
          organization_id: "org-1",
          project_id: "project-1",
          entry_id: "timesheet-1",
          actor_user_id: "worker-1",
          worker_name: "Casey Worker",
          event_type: "clock_out",
          message: "Clocked out via mobile.",
          created_at: "2026-06-15T17:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Long Bay Apartments",
          project_code: "P-100",
          stage: "delivery",
          location: "Auckland",
          client_id: "client-1",
          source_opportunity_id: "opp-1",
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Long Bay Client",
          company_name: "Long Bay Developments",
          client_status: "active",
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_purchase_orders: [
        {
          id: "po-1",
          organization_id: "org-1",
          project_id: "project-1",
          purchase_order_number: "PO-100",
          purchase_order_title: "Ceiling Labour",
          status: "Approved",
          supplier_id: null,
          issued_to_label: null,
          supplier_name_snapshot: null,
          updated_at: "2026-06-15T17:00:00.000Z",
        },
      ],
      project_purchase_order_line_items: [
        {
          id: "po-line-1",
          organization_id: "org-1",
          purchase_order_id: "po-1",
          project_id: "project-1",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "source-cost-item-1",
          description: "Casey Worker - 15/06/2026",
          quantity: 9,
          unit: "hrs",
          rate: 68,
          total: 612,
          section: "Labour",
          source_time_sheet_entry_id: "timesheet-1",
          updated_at: "2026-06-15T17:00:00.000Z",
        },
      ],
      cost_items: [
        {
          id: "cost-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_purchase_order",
          source_document_id: "po-1",
          source_line_id: "po-line-1",
          source_line_table: "project_purchase_order_line_items",
          tradesstack_cost_code: "200",
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "map-1",
          organization_cost_code_id: "org-cost-1",
        },
        {
          id: "source-cost-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_purchase_order",
          source_document_id: "po-1",
          source_line_id: "po-line-1",
          source_line_table: "project_purchase_order_line_items",
          tradesstack_cost_code: "200",
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "map-1",
          organization_cost_code_id: "org-cost-1",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_time_sheet_entry",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(2);
    const record = result.records.find((candidate) => candidate.source.sourceId === "timesheet-1");
    expect(record?.source).toMatchObject({
      table: "project_time_sheet_entries",
      sourceId: "timesheet-1",
      sourceVersion: 1,
    });
    expect(record?.signalStrength).toBe("strong");
    expect(record?.status).toMatchObject({
      close_status: "clocked_out",
      auto_clocked_out: false,
    });
    expect(record?.routingContext).toEqual({
      readOnly: true,
      tradesstack_cost_codeValues: ["200"],
      tradesstack_cost_code_labelValues: ["Labour"],
      accounting_mapping_idValues: ["map-1"],
      organization_cost_code_idValues: ["org-cost-1"],
    });

    const payload = record?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(payload.sourceEvidence.workerSnapshot).toMatchObject({
      workerName: "Casey Worker",
      companyName: "TradesStack Interiors",
      tradeName: "Ceilings",
    });
    expect(payload.sourceEvidence.projectSnapshot).toMatchObject({
      projectId: "project-1",
      projectName: "Long Bay Apartments",
      projectCode: "P-100",
    });
    expect(payload.sourceEvidence.purchaseOrderSnapshot).toMatchObject({
      purchaseOrderId: "po-1",
      purchaseOrderNumber: "PO-100",
      purchaseOrderTitle: "Ceiling Labour",
    });
    expect(payload.sourceEvidence.shiftSummary).toMatchObject({
      entryId: "timesheet-1",
      totalHours: 9,
      durationBucket: "extended",
    });
    expect(payload.sourceEvidence.eventSummary).toMatchObject({
      eventCount: 3,
      eventTypes: ["clock_in", "warning_8h5", "clock_out"],
    });
    expect(payload.sourceEvidence.closeMethodSummary).toMatchObject({
      closeStatus: "clocked_out",
      closeMethod: "manual",
      manuallyClosed: true,
      automaticallyClosed: false,
    });
    expect(payload.sourceEvidence.labourCommitmentSummary).toMatchObject({
      purchaseOrderLinked: true,
      syncedPurchaseOrderLineCount: 1,
      committedHours: 9,
    });
    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "closed_manual",
      shiftDurationBucket: "extended",
      warningReached: true,
      autoCloseReached: false,
      staleHealed: false,
      assignedPurchaseOrder: true,
      sourceChannel: "mobile",
      eventCompleteness: "complete",
      evidenceStrength: "strong",
    });
    expect(payload.operationalContext.repeatWorkerCadence).toMatchObject({
      cadence: "occasional",
      entryCountInReviewWindow: 2,
    });
    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      workerId: "worker-1",
      purchaseOrderId: "po-1",
      createdBy: "manager-1",
      updatedBy: null,
      sourceTable: "project_time_sheet_entries",
    });
    expect(payload.lineageContext.syncedPurchaseOrderLineItemIds).toEqual(["po-line-1"]);

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("\"row\"");
    expect(serialized).not.toContain("clock_in_latitude");
    expect(serialized).not.toContain("clock_out_latitude");
    expect(serialized).not.toContain("clock_in_longitude");
    expect(serialized).not.toContain("clock_out_longitude");
    expect(serialized).not.toContain("client_entry_id");
    expect(serialized).not.toContain("created_from_device_id");
    expect(serialized).not.toContain("synced_at");
    expect(serialized).not.toContain("mobile-hidden-entry");
    expect(serialized).not.toContain("hidden-device");
  });

  it("enriches tasks into a dedicated trust-boundary packet using canonical satellites and legacy lineage only", async () => {
    installFakeAdmin({
      project_job_todos: [
        {
          id: "task-1",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          title: "Confirm ceiling grid closeout and supplier paperwork",
          description: "Confirm the QA issue is resolved, check the PO paperwork, and capture the signed closeout note from site.",
          task_type: "purchase_order_follow_up",
          trade: "Ceilings",
          status: "Done",
          priority: "High",
          due_date: "2026-06-18",
          due_at: "2026-06-18T16:00:00.000Z",
          assigned_user_id: "worker-1",
          created_by: "manager-1",
          created_at: "2026-06-16T08:00:00.000Z",
          updated_by: "manager-2",
          updated_at: "2026-06-18T17:30:00.000Z",
          completed_by: "worker-1",
          completed_at: "2026-06-18T17:00:00.000Z",
          archived_by: null,
          archived_at: null,
          archive_reason: null,
          deleted_by: null,
          deleted_at: null,
          delete_reason: null,
          source_type: "quality_issue",
          source_id: "issue-1",
          linked_issue_id: "issue-1",
          linked_inspection_id: "inspection-1",
          linked_inspection_item_id: "inspection-item-1",
          linked_variation_id: "variation-1",
          linked_purchase_order_id: "po-1",
          linked_quote_id: "quote-1",
          linked_client_id: "client-1",
          metadata: {
            privateDeviceId: "hidden-device",
          },
          is_completed: true,
        },
      ],
      task_activity_log: [
        {
          id: "activity-1",
          organization_id: "org-1",
          task_id: "task-1",
          project_id: "project-1",
          actor_user_id: "manager-1",
          event_type: "task_created",
          field_name: null,
          old_value: null,
          new_value: { title: "Confirm ceiling grid closeout and supplier paperwork" },
          metadata: {},
          created_at: "2026-06-16T08:00:00.000Z",
        },
        {
          id: "activity-2",
          organization_id: "org-1",
          task_id: "task-1",
          project_id: "project-1",
          actor_user_id: "manager-2",
          event_type: "comment_added",
          field_name: null,
          old_value: null,
          new_value: "comment-1",
          metadata: {},
          created_at: "2026-06-17T09:00:00.000Z",
        },
        {
          id: "activity-3",
          organization_id: "org-1",
          task_id: "task-1",
          project_id: "project-1",
          actor_user_id: "worker-1",
          event_type: "completed",
          field_name: "status",
          old_value: "In Progress",
          new_value: "Done",
          metadata: {},
          created_at: "2026-06-18T17:00:00.000Z",
        },
      ],
      task_comments: [
        {
          id: "comment-1",
          organization_id: "org-1",
          task_id: "task-1",
          project_id: "project-1",
          user_id: "worker-1",
          comment: "QA issue closed on site. Signed note collected and supplier paperwork checked.",
          metadata: {},
          created_at: "2026-06-17T09:00:00.000Z",
          updated_at: "2026-06-17T09:00:00.000Z",
          deleted_at: null,
          deleted_by: null,
        },
        {
          id: "comment-2",
          organization_id: "org-1",
          task_id: "task-1",
          project_id: "project-1",
          user_id: "worker-1",
          comment: "Old draft note that should not be treated as active.",
          metadata: {},
          created_at: "2026-06-16T10:00:00.000Z",
          updated_at: "2026-06-16T10:00:00.000Z",
          deleted_at: "2026-06-16T11:00:00.000Z",
          deleted_by: "worker-1",
        },
      ],
      task_attachments: [
        {
          id: "attachment-1",
          organization_id: "org-1",
          task_id: "task-1",
          project_id: "project-1",
          comment_id: null,
          uploaded_by: "worker-1",
          file_name: "ceiling-closeout-note.pdf",
          original_file_name: "ceiling-closeout-note.pdf",
          file_type: "pdf",
          mime_type: "application/pdf",
          storage_bucket: "task-attachments",
          storage_path: "org-1/project-1/tasks/task-1/private-closeout-note.pdf",
          file_size: 1200,
          attachment_type: "pdf",
          metadata: {
            signedUrl: "https://example.com/private",
          },
          created_at: "2026-06-18T16:30:00.000Z",
          deleted_at: null,
          deleted_by: null,
        },
      ],
      task_links: [
        {
          id: "task-link-1",
          organization_id: "org-1",
          task_id: "task-1",
          linked_type: "quality_issue",
          linked_id: "issue-1",
          created_by: "manager-1",
          created_at: "2026-06-16T08:05:00.000Z",
          metadata: {},
        },
      ],
      project_job_todo_attachments: [
        {
          id: "legacy-attachment-1",
          organization_id: "org-1",
          project_id: "project-1",
          todo_id: "task-1",
          file_name: "legacy-site-photo.pdf",
          file_url: "https://legacy.example.com/site-photo.pdf",
          mime_type: "application/pdf",
          file_size_bytes: 512,
          created_by: "worker-1",
          created_at: "2026-06-16T12:00:00.000Z",
          updated_at: "2026-06-16T12:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Long Bay Apartments",
          project_code: "P-100",
          stage: "delivery",
          location: "Auckland",
          client_id: "client-1",
          source_opportunity_id: "opp-1",
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Long Bay Client",
          company_name: "Long Bay Developments",
          client_status: "active",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [
        {
          id: "opp-1",
          organization_id: "org-1",
          client_id: "client-1",
          name: "Long Bay Apartments",
          opportunity_code: "OPP-100",
          stage: "won",
          location: "Auckland",
          workspace_project_id: "project-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_quality_issues: [
        {
          id: "issue-1",
          organization_id: "org-1",
          project_id: "project-1",
          title: "Ceiling edge requires closeout",
          status: "closed",
          priority: "high",
          trade: "Ceilings",
          location: "Level 2",
          area: "North wing",
          due_date: "2026-06-18",
          closed_at: "2026-06-18T15:00:00.000Z",
          updated_at: "2026-06-18T15:00:00.000Z",
        },
      ],
      project_quality_inspections: [
        {
          id: "inspection-1",
          organization_id: "org-1",
          project_id: "project-1",
          title: "Ceiling pre-close inspection",
          trade: "Ceilings",
          location: "Level 2",
          due_date: "2026-06-18",
          scheduled_at: "2026-06-18T10:00:00.000Z",
          updated_at: "2026-06-18T10:00:00.000Z",
        },
      ],
      project_quality_inspection_items: [
        {
          id: "inspection-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          inspection_id: "inspection-1",
          label: "Ceiling perimeter complete",
          status: "passed",
          updated_at: "2026-06-18T10:30:00.000Z",
        },
      ],
      project_purchase_orders: [
        {
          id: "po-1",
          organization_id: "org-1",
          project_id: "project-1",
          purchase_order_number: "PO-100",
          purchase_order_title: "Ceiling Labour",
          status: "Approved",
          updated_at: "2026-06-15T17:00:00.000Z",
        },
      ],
      project_variations: [
        {
          id: "variation-1",
          organization_id: "org-1",
          project_id: "project-1",
          variation_number: "VAR-8",
          variation_title: "Ceiling edge revision",
          status: "Approved",
          total_variation_price: 1800,
          updated_at: "2026-06-14T00:00:00.000Z",
        },
      ],
      project_quotes: [
        {
          id: "quote-1",
          organization_id: "org-1",
          project_id: "project-1",
          quote_number: "Q-22",
          quote_title: "Ceiling package",
          status: "Accepted",
          total_quote_price: 12000,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "task",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record.source).toMatchObject({
      table: "project_job_todos",
      sourceId: "task-1",
      sourceVersion: 1,
    });
    expect(record.projectId).toBe("project-1");
    expect(record.clientId).toBe("client-1");
    expect(record.opportunityId).toBe("opp-1");
    expect(record.routingContext).toEqual({ readOnly: true });
    expect(record.signalStrength).toBe("strong");

    const payload = record.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(payload.sourceEvidence.taskSnapshot).toMatchObject({
      taskId: "task-1",
      sourceType: "quality_issue",
      sourceId: "issue-1",
    });
    expect(payload.sourceEvidence.taskStateSummary).toMatchObject({
      status: "Done",
      priority: "High",
      taskType: "purchase_order_follow_up",
      isCompleted: true,
    });
    expect(payload.sourceEvidence.projectSnapshot).toMatchObject({
      projectId: "project-1",
      projectName: "Long Bay Apartments",
      projectCode: "P-100",
    });
    expect(payload.sourceEvidence.clientSnapshot).toMatchObject({
      clientId: "client-1",
      clientName: "Long Bay Developments",
    });
    expect(payload.sourceEvidence.opportunitySnapshot).toMatchObject({
      opportunityId: "opp-1",
      opportunityCode: "OPP-100",
    });
    expect(payload.sourceEvidence.linkedCommercialSnapshots).toMatchObject({
      linkedPurchaseOrder: {
        purchaseOrderId: "po-1",
        purchaseOrderNumber: "PO-100",
      },
      linkedVariation: {
        variationId: "variation-1",
        variationNumber: "VAR-8",
      },
      linkedQuote: {
        quoteId: "quote-1",
        quoteNumber: "Q-22",
      },
    });
    expect(payload.sourceEvidence.linkedQASnapshots).toMatchObject({
      linkedIssue: {
        issueId: "issue-1",
        status: "closed",
      },
      linkedInspection: {
        inspectionId: "inspection-1",
      },
      linkedInspectionItem: {
        inspectionItemId: "inspection-item-1",
      },
    });
    expect(payload.sourceEvidence.activitySummary).toMatchObject({
      activityCount: 3,
      eventTypes: ["task_created", "comment_added", "completed"],
    });
    expect(payload.sourceEvidence.commentSummary).toMatchObject({
      commentCount: 1,
      deletedCommentCount: 1,
    });
    expect(payload.sourceEvidence.attachmentSummary).toMatchObject({
      attachmentCount: 1,
      attachmentTypes: ["pdf"],
      attachmentNames: ["ceiling-closeout-note.pdf"],
    });
    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "completed",
      dueState: "closed_with_due_date",
      assignmentState: "assigned",
      linkageCompleteness: "complete",
      commentVolume: 1,
      activityVolume: 3,
      attachmentEvidenceState: "canonical_present",
      canonicalVsLegacyAttachmentState: "canonical_with_legacy_compatibility",
      evidenceStrength: "strong",
    });
    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      opportunityId: "opp-1",
      clientId: "client-1",
      taskId: "task-1",
      assigneeId: "worker-1",
      createdBy: "manager-1",
      updatedBy: "manager-2",
      completedBy: "worker-1",
      sourceTable: "project_job_todos",
      sourceId: "task-1",
      activityIds: ["activity-1", "activity-2", "activity-3"],
      commentIds: ["comment-2", "comment-1"],
      attachmentIds: ["attachment-1"],
      legacyAttachmentIds: ["legacy-attachment-1"],
      taskLinkIds: ["task-link-1"],
    });

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("\"row\"");
    expect(serialized).not.toContain("project_job_todo_attachments");
    expect(serialized).not.toContain("file_url");
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("legacy.example.com");
    expect(serialized).not.toContain("private-closeout-note.pdf");
  });

  it("selects task records from canonical task_attachments using created_at without requiring updated_at", async () => {
    installFakeAdmin({
      project_job_todos: [
        {
          id: "task-attachment-cursor-1",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: null,
          title: "Attachment-driven task selection",
          description: "",
          task_type: "admin",
          trade: "",
          status: "To Do",
          priority: "Medium",
          due_date: null,
          due_at: null,
          assigned_user_id: null,
          created_by: "manager-1",
          created_at: "2026-06-01T08:00:00.000Z",
          updated_by: "manager-1",
          updated_at: "2026-06-01T08:00:00.000Z",
          completed_by: null,
          completed_at: null,
          archived_by: null,
          archived_at: null,
          archive_reason: null,
          deleted_by: null,
          deleted_at: null,
          delete_reason: null,
          source_type: null,
          source_id: null,
          linked_issue_id: null,
          linked_inspection_id: null,
          linked_inspection_item_id: null,
          linked_variation_id: null,
          linked_purchase_order_id: null,
          linked_quote_id: null,
          linked_client_id: null,
          metadata: {},
          is_completed: false,
        },
      ],
      task_attachments: [
        {
          id: "attachment-cursor-1",
          organization_id: "org-1",
          task_id: "task-attachment-cursor-1",
          project_id: "project-1",
          comment_id: null,
          uploaded_by: "worker-1",
          file_name: "closeout-proof.pdf",
          original_file_name: "closeout-proof.pdf",
          file_type: "pdf",
          mime_type: "application/pdf",
          storage_bucket: "task-attachments",
          storage_path: "org-1/project-1/tasks/task-attachment-cursor-1/closeout-proof.pdf",
          file_size: 1400,
          attachment_type: "pdf",
          metadata: {},
          created_at: "2026-06-20T12:00:00.000Z",
          deleted_at: null,
          deleted_by: null,
        },
      ],
      task_activity_log: [],
      task_comments: [],
      task_links: [],
      project_job_todo_attachments: [],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Long Bay Apartments",
          project_code: "P-100",
          stage: "delivery",
          location: "Auckland",
          client_id: "client-1",
          source_opportunity_id: null,
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Long Bay Client",
          company_name: "Long Bay Developments",
          client_status: "active",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [],
      project_quality_issues: [],
      project_quality_inspections: [],
      project_quality_inspection_items: [],
      project_purchase_orders: [],
      project_variations: [],
      project_quotes: [],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "task",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: "2026-06-10T00:00:00.000Z", id: "task-before" },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.sourceId).toBe("task-attachment-cursor-1");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-20T12:00:00.000Z",
      id: "task-attachment-cursor-1",
    });
    expect((result.records[0]?.payload as Record<string, any>).sourceEvidence.attachmentSummary).toMatchObject({
      attachmentCount: 1,
      attachmentNames: ["closeout-proof.pdf"],
    });
  });

  it("selects task records from task_links using created_at without requiring updated_at", async () => {
    installFakeAdmin({
      project_job_todos: [
        {
          id: "task-link-cursor-1",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: null,
          title: "Link-driven task selection",
          description: "",
          task_type: "coordination",
          trade: "",
          status: "In Progress",
          priority: "Medium",
          due_date: null,
          due_at: null,
          assigned_user_id: null,
          created_by: "manager-1",
          created_at: "2026-06-01T08:00:00.000Z",
          updated_by: "manager-1",
          updated_at: "2026-06-01T08:00:00.000Z",
          completed_by: null,
          completed_at: null,
          archived_by: null,
          archived_at: null,
          archive_reason: null,
          deleted_by: null,
          deleted_at: null,
          delete_reason: null,
          source_type: null,
          source_id: null,
          linked_issue_id: "issue-1",
          linked_inspection_id: null,
          linked_inspection_item_id: null,
          linked_variation_id: null,
          linked_purchase_order_id: null,
          linked_quote_id: null,
          linked_client_id: "client-1",
          metadata: {},
          is_completed: false,
        },
      ],
      task_attachments: [],
      task_activity_log: [],
      task_comments: [],
      task_links: [
        {
          id: "task-link-cursor-row-1",
          organization_id: "org-1",
          task_id: "task-link-cursor-1",
          linked_type: "quality_issue",
          linked_id: "issue-1",
          created_by: "manager-1",
          created_at: "2026-06-21T09:30:00.000Z",
          metadata: {},
        },
      ],
      project_job_todo_attachments: [],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Long Bay Apartments",
          project_code: "P-100",
          stage: "delivery",
          location: "Auckland",
          client_id: "client-1",
          source_opportunity_id: null,
          created_at: "2026-05-20T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Long Bay Client",
          company_name: "Long Bay Developments",
          client_status: "active",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [],
      project_quality_issues: [
        {
          id: "issue-1",
          organization_id: "org-1",
          project_id: "project-1",
          title: "Issue linked through task link",
          status: "open",
          priority: "medium",
          trade: "Ceilings",
          location: "Level 1",
          area: "Lobby",
          due_date: null,
          closed_at: null,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
      project_quality_inspections: [],
      project_quality_inspection_items: [],
      project_purchase_orders: [],
      project_variations: [],
      project_quotes: [],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "task",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: "2026-06-10T00:00:00.000Z", id: "task-before" },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.sourceId).toBe("task-link-cursor-1");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-21T09:30:00.000Z",
      id: "task-link-cursor-1",
    });
    expect((result.records[0]?.payload as Record<string, any>).sourceEvidence.taskLinkSummary).toMatchObject({
      taskLinkCount: 1,
      linkedTypes: ["quality_issue"],
    });
  });

  it("enriches takeoff measurements into a geometry-safe trust-boundary packet", async () => {
    installFakeAdmin({
      takeoff_measurements: [
        {
          id: "measurement-created",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          drawing_set_id: "drawing-1",
          page_id: "page-1",
          calibration_id: "calibration-1",
          group_id: "group-1",
          measurement_kind: "line",
          status: "active",
          source: "manual",
          name: "Perimeter setout",
          description: "Measure wall perimeter",
          quantity: 1,
          count_value: null,
          measured_length_base: 12.5,
          measured_area_base: null,
          measured_perimeter_base: null,
          display_value: 12.5,
          display_unit: "m",
          page_bbox_min_x: 0.1,
          page_bbox_min_y: 0.1,
          page_bbox_max_x: 0.4,
          page_bbox_max_y: 0.3,
          ai_confidence: null,
          ai_model: null,
          ai_run_id: null,
          external_ref: null,
          metadata: {},
          version: 1,
          created_by: "estimator-1",
          updated_by: "estimator-1",
          archived_by: null,
          created_at: "2026-06-01T08:00:00.000Z",
          updated_at: "2026-06-01T08:00:00.000Z",
          archived_at: null,
        },
        {
          id: "measurement-corrected",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          drawing_set_id: "drawing-1",
          page_id: "page-1",
          calibration_id: "calibration-1",
          group_id: "group-1",
          measurement_kind: "area",
          status: "active",
          source: "ai",
          name: "Floor area",
          description: "Main floor slab",
          quantity: 1,
          count_value: null,
          measured_length_base: null,
          measured_area_base: 42.5,
          measured_perimeter_base: 30.2,
          display_value: 42.5,
          display_unit: "m2",
          page_bbox_min_x: 0.2,
          page_bbox_min_y: 0.2,
          page_bbox_max_x: 0.6,
          page_bbox_max_y: 0.8,
          ai_confidence: 0.77,
          ai_model: "hidden-model",
          ai_run_id: "hidden-run",
          external_ref: "secret-ref",
          metadata: {
            areaShapeRoles: {
              "shape-1": "include",
              "shape-2": "deduction",
            },
          },
          version: 3,
          created_by: "estimator-2",
          updated_by: "reviewer-1",
          archived_by: null,
          created_at: "2026-06-02T08:00:00.000Z",
          updated_at: "2026-06-04T08:00:00.000Z",
          archived_at: null,
        },
        {
          id: "measurement-archived",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          drawing_set_id: "drawing-1",
          page_id: "page-1",
          calibration_id: null,
          group_id: "group-1",
          measurement_kind: "count",
          status: "archived",
          source: "imported",
          name: "Door count",
          description: "Imported opening count",
          quantity: 1,
          count_value: 4,
          measured_length_base: null,
          measured_area_base: null,
          measured_perimeter_base: null,
          display_value: 4,
          display_unit: "count",
          page_bbox_min_x: 0.1,
          page_bbox_min_y: 0.4,
          page_bbox_max_x: 0.2,
          page_bbox_max_y: 0.7,
          ai_confidence: null,
          ai_model: null,
          ai_run_id: null,
          external_ref: null,
          metadata: { countItemValue: 1 },
          version: 2,
          created_by: "estimator-3",
          updated_by: "estimator-3",
          archived_by: "estimator-3",
          created_at: "2026-06-05T08:00:00.000Z",
          updated_at: "2026-06-06T08:00:00.000Z",
          archived_at: "2026-06-06T08:00:00.000Z",
        },
        {
          id: "measurement-restored",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          drawing_set_id: "drawing-1",
          page_id: "page-1",
          calibration_id: "calibration-1",
          group_id: "group-1",
          measurement_kind: "area",
          status: "active",
          source: "manual",
          name: "Restored area",
          description: "Restored measurement",
          quantity: 1,
          count_value: null,
          measured_length_base: null,
          measured_area_base: 15,
          measured_perimeter_base: 18,
          display_value: 15,
          display_unit: "m2",
          page_bbox_min_x: 0.05,
          page_bbox_min_y: 0.05,
          page_bbox_max_x: 0.25,
          page_bbox_max_y: 0.25,
          ai_confidence: null,
          ai_model: null,
          ai_run_id: null,
          external_ref: null,
          metadata: {
            areaShapeRoles: {
              "shape-3": "include",
            },
          },
          version: 3,
          created_by: "estimator-4",
          updated_by: "estimator-4",
          archived_by: null,
          created_at: "2026-06-07T08:00:00.000Z",
          updated_at: "2026-06-09T08:00:00.000Z",
          archived_at: null,
        },
        {
          id: "measurement-deleted",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          drawing_set_id: "drawing-1",
          page_id: "page-1",
          calibration_id: "calibration-1",
          group_id: "group-1",
          measurement_kind: "line",
          status: "deleted",
          source: "manual",
          name: "Deleted line",
          description: "Removed measurement",
          quantity: 1,
          count_value: null,
          measured_length_base: 5,
          measured_area_base: null,
          measured_perimeter_base: null,
          display_value: 5,
          display_unit: "m",
          page_bbox_min_x: 0.15,
          page_bbox_min_y: 0.15,
          page_bbox_max_x: 0.35,
          page_bbox_max_y: 0.2,
          ai_confidence: null,
          ai_model: null,
          ai_run_id: null,
          external_ref: null,
          metadata: {},
          version: 2,
          created_by: "estimator-5",
          updated_by: "estimator-5",
          archived_by: "estimator-5",
          created_at: "2026-06-10T08:00:00.000Z",
          updated_at: "2026-06-11T08:00:00.000Z",
          archived_at: "2026-06-11T08:00:00.000Z",
        },
        {
          id: "measurement-incomplete",
          organization_id: "org-1",
          project_id: "project-1",
          opportunity_id: "opp-1",
          drawing_set_id: "drawing-1",
          page_id: "page-1",
          calibration_id: null,
          group_id: null,
          measurement_kind: "line",
          status: "active",
          source: "manual",
          name: "Incomplete line",
          description: "Missing calibration and geometry",
          quantity: 1,
          count_value: null,
          measured_length_base: null,
          measured_area_base: null,
          measured_perimeter_base: null,
          display_value: null,
          display_unit: null,
          page_bbox_min_x: null,
          page_bbox_min_y: null,
          page_bbox_max_x: null,
          page_bbox_max_y: null,
          ai_confidence: null,
          ai_model: "hidden-model",
          ai_run_id: "hidden-run",
          external_ref: "hidden-ref",
          metadata: {},
          version: 1,
          created_by: "estimator-6",
          updated_by: "estimator-6",
          archived_by: null,
          created_at: "2026-06-12T08:00:00.000Z",
          updated_at: "2026-06-12T08:00:00.000Z",
          archived_at: null,
        },
      ],
      takeoff_measurement_points: [
        { id: "point-1", organization_id: "org-1", measurement_id: "measurement-created", point_order: 0, x: 0.1, y: 0.1, created_at: "2026-06-01T08:00:00.000Z" },
        { id: "point-2", organization_id: "org-1", measurement_id: "measurement-created", point_order: 1, x: 0.4, y: 0.3, created_at: "2026-06-01T08:00:00.000Z" },
        { id: "point-3", organization_id: "org-1", measurement_id: "measurement-corrected", point_order: 0, x: 0.2, y: 0.2, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "point-4", organization_id: "org-1", measurement_id: "measurement-corrected", point_order: 1, x: 0.6, y: 0.2, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "point-5", organization_id: "org-1", measurement_id: "measurement-corrected", point_order: 2, x: 0.6, y: 0.8, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "point-6", organization_id: "org-1", measurement_id: "measurement-corrected", point_order: 3, x: 0.2, y: 0.8, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "point-7", organization_id: "org-1", measurement_id: "measurement-archived", point_order: 0, x: 0.1, y: 0.4, created_at: "2026-06-05T08:00:00.000Z" },
        { id: "point-8", organization_id: "org-1", measurement_id: "measurement-archived", point_order: 1, x: 0.2, y: 0.5, created_at: "2026-06-05T08:00:00.000Z" },
        { id: "point-9", organization_id: "org-1", measurement_id: "measurement-restored", point_order: 0, x: 0.05, y: 0.05, created_at: "2026-06-07T08:00:00.000Z" },
        { id: "point-10", organization_id: "org-1", measurement_id: "measurement-restored", point_order: 1, x: 0.25, y: 0.05, created_at: "2026-06-07T08:00:00.000Z" },
        { id: "point-11", organization_id: "org-1", measurement_id: "measurement-restored", point_order: 2, x: 0.25, y: 0.25, created_at: "2026-06-07T08:00:00.000Z" },
        { id: "point-12", organization_id: "org-1", measurement_id: "measurement-deleted", point_order: 0, x: 0.15, y: 0.15, created_at: "2026-06-10T08:00:00.000Z" },
        { id: "point-13", organization_id: "org-1", measurement_id: "measurement-deleted", point_order: 1, x: 0.35, y: 0.2, created_at: "2026-06-10T08:00:00.000Z" },
      ],
      takeoff_measurement_events: [
        { id: "event-created-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-created", event_type: "created", version: 1, actor_user_id: "estimator-1", change_reason: "Line measured", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-01T08:00:00.000Z" },
        { id: "event-corrected-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-corrected", event_type: "created", version: 1, actor_user_id: "estimator-2", change_reason: "Area measured", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "event-corrected-2", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-corrected", event_type: "updated", version: 2, actor_user_id: "reviewer-1", change_reason: "Adjusted boundary", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-03T08:00:00.000Z" },
        { id: "event-corrected-3", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-corrected", event_type: "recalculated", version: 3, actor_user_id: "reviewer-1", change_reason: "Recalculated after deduction", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-04T08:00:00.000Z" },
        { id: "event-archived-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-archived", event_type: "created", version: 1, actor_user_id: "estimator-3", change_reason: "Imported count", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-05T08:00:00.000Z" },
        { id: "event-archived-2", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-archived", event_type: "archived", version: 2, actor_user_id: "estimator-3", change_reason: "Archived after review", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-06T08:00:00.000Z" },
        { id: "event-restored-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-restored", event_type: "created", version: 1, actor_user_id: "estimator-4", change_reason: "Area measured", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-07T08:00:00.000Z" },
        { id: "event-restored-2", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-restored", event_type: "archived", version: 2, actor_user_id: "estimator-4", change_reason: "Temporarily archived", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-08T08:00:00.000Z" },
        { id: "event-restored-3", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-restored", event_type: "restored", version: 3, actor_user_id: "estimator-4", change_reason: "Restored for reuse", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-09T08:00:00.000Z" },
        { id: "event-deleted-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-deleted", event_type: "deleted", version: 2, actor_user_id: "estimator-5", change_reason: "Deleted duplicate", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-11T08:00:00.000Z" },
        { id: "event-incomplete-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", measurement_id: "measurement-incomplete", event_type: "created", version: 1, actor_user_id: "estimator-6", change_reason: "Started line measurement", snapshot: { hidden: true }, diff: { x: 1 }, metadata: {}, created_at: "2026-06-12T08:00:00.000Z" },
      ],
      takeoff_measurement_area_shapes: [
        { id: "shape-1", organization_id: "org-1", measurement_id: "measurement-corrected", shape_order: 0, measured_area_base: 45, measured_perimeter_base: 28, page_bbox_min_x: 0.2, page_bbox_min_y: 0.2, page_bbox_max_x: 0.6, page_bbox_max_y: 0.8, created_at: "2026-06-02T08:00:00.000Z", updated_at: "2026-06-04T08:00:00.000Z" },
        { id: "shape-2", organization_id: "org-1", measurement_id: "measurement-corrected", shape_order: 1, measured_area_base: 2.5, measured_perimeter_base: 2.2, page_bbox_min_x: 0.3, page_bbox_min_y: 0.3, page_bbox_max_x: 0.4, page_bbox_max_y: 0.4, created_at: "2026-06-02T08:30:00.000Z", updated_at: "2026-06-04T08:00:00.000Z" },
        { id: "shape-3", organization_id: "org-1", measurement_id: "measurement-restored", shape_order: 0, measured_area_base: 15, measured_perimeter_base: 18, page_bbox_min_x: 0.05, page_bbox_min_y: 0.05, page_bbox_max_x: 0.25, page_bbox_max_y: 0.25, created_at: "2026-06-07T08:00:00.000Z", updated_at: "2026-06-09T08:00:00.000Z" },
      ],
      takeoff_measurement_area_shape_points: [
        { id: "shape-point-1", organization_id: "org-1", area_shape_id: "shape-1", point_order: 0, x: 0.2, y: 0.2, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "shape-point-2", organization_id: "org-1", area_shape_id: "shape-1", point_order: 1, x: 0.6, y: 0.2, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "shape-point-3", organization_id: "org-1", area_shape_id: "shape-1", point_order: 2, x: 0.6, y: 0.8, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "shape-point-4", organization_id: "org-1", area_shape_id: "shape-1", point_order: 3, x: 0.2, y: 0.8, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "shape-point-5", organization_id: "org-1", area_shape_id: "shape-2", point_order: 0, x: 0.3, y: 0.3, created_at: "2026-06-02T08:30:00.000Z" },
        { id: "shape-point-6", organization_id: "org-1", area_shape_id: "shape-2", point_order: 1, x: 0.4, y: 0.3, created_at: "2026-06-02T08:30:00.000Z" },
        { id: "shape-point-7", organization_id: "org-1", area_shape_id: "shape-2", point_order: 2, x: 0.4, y: 0.4, created_at: "2026-06-02T08:30:00.000Z" },
        { id: "shape-point-8", organization_id: "org-1", area_shape_id: "shape-3", point_order: 0, x: 0.05, y: 0.05, created_at: "2026-06-07T08:00:00.000Z" },
        { id: "shape-point-9", organization_id: "org-1", area_shape_id: "shape-3", point_order: 1, x: 0.25, y: 0.05, created_at: "2026-06-07T08:00:00.000Z" },
        { id: "shape-point-10", organization_id: "org-1", area_shape_id: "shape-3", point_order: 2, x: 0.25, y: 0.25, created_at: "2026-06-07T08:00:00.000Z" },
      ],
      takeoff_measurement_line_paths: [
        { id: "path-1", organization_id: "org-1", measurement_id: "measurement-created", path_order: 0, measured_length_base: 12.5, page_bbox_min_x: 0.1, page_bbox_min_y: 0.1, page_bbox_max_x: 0.4, page_bbox_max_y: 0.3, created_at: "2026-06-01T08:00:00.000Z", updated_at: "2026-06-01T08:00:00.000Z" },
        { id: "path-2", organization_id: "org-1", measurement_id: "measurement-deleted", path_order: 0, measured_length_base: 5, page_bbox_min_x: 0.15, page_bbox_min_y: 0.15, page_bbox_max_x: 0.35, page_bbox_max_y: 0.2, created_at: "2026-06-10T08:00:00.000Z", updated_at: "2026-06-11T08:00:00.000Z" },
      ],
      takeoff_measurement_line_path_points: [
        { id: "path-point-1", organization_id: "org-1", line_path_id: "path-1", point_order: 0, x: 0.1, y: 0.1, created_at: "2026-06-01T08:00:00.000Z" },
        { id: "path-point-2", organization_id: "org-1", line_path_id: "path-1", point_order: 1, x: 0.4, y: 0.3, created_at: "2026-06-01T08:00:00.000Z" },
        { id: "path-point-3", organization_id: "org-1", line_path_id: "path-2", point_order: 0, x: 0.15, y: 0.15, created_at: "2026-06-10T08:00:00.000Z" },
        { id: "path-point-4", organization_id: "org-1", line_path_id: "path-2", point_order: 1, x: 0.35, y: 0.2, created_at: "2026-06-10T08:00:00.000Z" },
      ],
      takeoff_measurement_groups: [
        { id: "group-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", parent_group_id: null, name: "External envelope", code: "ENV", color_hex: "#FFFFFF", sort_order: 0, status: "active", trade_id: "trade-1", trade_label: "Envelope", metadata: { tag: "façade" }, created_by: "estimator-1", created_at: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z" },
      ],
      takeoff_pages: [
        { id: "page-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", drawing_set_id: "drawing-1", page_number: 7, page_label: "A7", rotation_degrees: 0, source_revision: "Rev B", created_by: "u1", created_at: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z" },
      ],
      takeoff_calibrations: [
        { id: "calibration-1", organization_id: "org-1", project_id: "project-1", opportunity_id: "opp-1", page_id: "page-1", name: "Scale 1:100", scale_ratio: 0.1, unit_system: "metric", base_unit: "m", display_unit: "m", reference_length_input: 100, reference_length_base: 10, is_active: true, superseded_by: null, notes: null, metadata: {}, created_by: "u1", created_at: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z" },
      ],
      project_drawing_sets: [
        { id: "drawing-1", organization_id: "org-1", project_id: "project-1", file_name: "Architectural set.pdf", mime_type: "application/pdf", uploaded_at: "2026-05-31T00:00:00.000Z", created_at: "2026-05-31T00:00:00.000Z", updated_at: "2026-05-31T00:00:00.000Z" },
      ],
      organization_projects: [
        { id: "project-1", organization_id: "org-1", name: "Auckland Office Fitout", project_code: "AKL-001", stage: "delivery", location: "Auckland", client_id: "client-1", source_opportunity_id: "opp-1", created_at: "2026-05-01T00:00:00.000Z", updated_at: "2026-05-01T00:00:00.000Z" },
      ],
      organization_clients: [
        { id: "client-1", organization_id: "org-1", company_name: "Metro Property Group", name: "Metro Property Group", client_type: "commercial", client_status: "active", created_at: "2026-05-01T00:00:00.000Z", updated_at: "2026-05-01T00:00:00.000Z" },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "takeoff_measurement",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(6);
    const recordsById = new Map(result.records.map((record) => [record.source.sourceId, record]));
    const corrected = recordsById.get("measurement-corrected");
    const created = recordsById.get("measurement-created");
    const archived = recordsById.get("measurement-archived");
    const restored = recordsById.get("measurement-restored");
    const deleted = recordsById.get("measurement-deleted");
    const incomplete = recordsById.get("measurement-incomplete");

    expect(corrected?.source.table).toBe("takeoff_measurements");
    expect(corrected?.projectId).toBe("project-1");
    expect(corrected?.clientId).toBe("client-1");
    expect(corrected?.routingContext).toEqual({ readOnly: true });

    const payload = corrected?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("\"x\":");
    expect(JSON.stringify(payload)).not.toContain("\"y\":");
    expect(JSON.stringify(payload)).not.toContain("\"snapshot\"");
    expect(JSON.stringify(payload)).not.toContain("\"diff\"");
    expect(JSON.stringify(payload)).not.toContain("preview_storage_path");
    expect(JSON.stringify(payload)).not.toContain("ai_model");
    expect(JSON.stringify(payload)).not.toContain("ai_run_id");
    expect(JSON.stringify(payload)).not.toContain("external_ref");
    expect(JSON.stringify(payload)).not.toContain("markup");
    expect(JSON.stringify(payload)).not.toContain("margin");
    expect(JSON.stringify(payload)).not.toContain("worksheet");
    expect(JSON.stringify(payload)).not.toContain("quote");

    expect(payload.sourceEvidence.measurement).toMatchObject({
      measurementId: "measurement-corrected",
      name: "Floor area",
      description: "Main floor slab",
      measurementKind: "area",
      source: "ai",
      status: "active",
    });
    expect(payload.sourceEvidence.calibration).toMatchObject({
      calibrationId: "calibration-1",
      calibrationName: "Scale 1:100",
      calibrationScale: 0.1,
      calibrationAvailability: "available",
    });
    expect(payload.sourceEvidence.grouping).toMatchObject({
      measurementGroup: {
        groupId: "group-1",
        groupName: "External envelope",
      },
      tradeGrouping: {
        tradeId: "trade-1",
        tradeLabel: "Envelope",
      },
      measurementTagsSummary: {
        tagSummary: "façade",
      },
    });
    expect(payload.sourceEvidence.drawingContext).toMatchObject({
      drawingSetSummary: {
        drawingSetId: "drawing-1",
        drawingSetName: "Architectural set.pdf",
      },
      pageSummary: {
        pageId: "page-1",
        pageNumber: 7,
        pageLabel: "A7",
        sourceRevision: "Rev B",
      },
    });
    expect(payload.sourceEvidence.geometrySummary).toMatchObject({
      pointCount: 4,
      linePathCount: 0,
      areaShapeCount: 2,
      childMeasurementCount: 2,
      includeDeductionSummary: {
        includedAreaShapeCount: 1,
        deductionAreaShapeCount: 1,
        hasDeductions: true,
      },
      boundingBoxSummary: {
        hasBoundingBox: true,
      },
    });
    expect(payload.sourceEvidence.eventSummary).toMatchObject({
      created: 1,
      corrected: 1,
      recalculated: 1,
      archived: 0,
      restored: 0,
      deleted: 0,
      correctionFrequency: "moderate",
      changeReasonSummary: {
        latestChangeReason: "Recalculated after deduction",
      },
    });
    expect(payload.sourceEvidence.evidenceStrengthSummary).toMatchObject({
      evidenceStrength: "strong",
    });

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "corrected",
      hasCalibration: true,
      hasGroup: true,
      hasOpportunity: true,
      hasProject: true,
      hasAiOrigin: true,
      hasImportedOrigin: false,
      correctionFrequency: "moderate",
      evidenceStrength: "strong",
    });
    expect(payload.operationalContext.geometryCompleteness).toMatchObject({
      hasGeometry: true,
      pointCount: 4,
      requiresCalibration: true,
      hasCalibration: true,
    });
    expect(payload.operationalContext.childStructureCompleteness).toMatchObject({
      childMeasurementCount: 2,
      areaShapeCount: 2,
      linePathCount: 0,
      areaShapesWithPointGeometry: 2,
    });

    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      projectName: "Auckland Office Fitout",
      opportunityId: "opp-1",
      drawingSetId: "drawing-1",
      pageId: "page-1",
      calibrationId: "calibration-1",
      groupId: "group-1",
      measurementId: "measurement-corrected",
      createdByUserId: "estimator-2",
      updatedByUserId: "reviewer-1",
      archivedByUserId: null,
      sourceTable: "takeoff_measurements",
    });

    expect((created?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("created");
    expect((archived?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("archived");
    expect((restored?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("restored");
    expect((deleted?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("deleted");
    expect((incomplete?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("incomplete_measurement");
    expect((incomplete?.payload as Record<string, any>).operationalContext.geometryCompleteness.hasCalibration).toBe(false);
    expect((incomplete?.payload as Record<string, any>).sourceEvidence.calibration.calibrationAvailability).toBe("missing");
  });

  it("enriches project quotes into a trust-boundary packet focused on estimating evidence", async () => {
    installFakeAdmin({
      opportunity_quotes: [],
      opportunity_quote_line_items: [],
      project_quotes: [
        {
          id: "45000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-quote-1",
          source_opportunity_id: "opportunity-1",
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_number: "OQ-101",
          quote_number: "Q-AKL-001-3",
          quote_title: "Level 4 fitout pricing",
          project_name: "Auckland Office Fitout",
          company_name: "Metro Property Group",
          client_name: "Mia Client",
          contact_person: "Mia Client",
          client_email: "mia@metro.test",
          client_phone: "0210000000",
          site_address: "22 Queen Street, Auckland",
          status: "Accepted",
          quote_date: "2026-06-10",
          expiry_date: "2026-07-10",
          validity_period: "30 days",
          lead_time: "3 weeks",
          payment_terms: "20th month following",
          scope_notes: "Supply and install plasterboard partitions and grid ceilings.",
          scope_exclusions: "Painting and floor coverings excluded.",
          assumptions: "Client access after hours is available.",
          clarifications: "Ceiling heights based on tender drawings.",
          acceptance_notes: "Accepted after VE review.",
          optional_items_notes: "Optional acoustic upgrade priced separately.",
          terms_inclusions: "Installation, fixings, trims, waste removal.",
          terms_exclusions: "Builder's work in connection and permits.",
          subtotal: 10000,
          optional_subtotal: 1800,
          margin_percent: 18,
          margin_amount: 1800,
          contingency_amount: 500,
          discount_amount: 200,
          gst_percent: 15,
          gst_amount: 1815,
          total_quote_price: 13915,
          updated_at: "2026-06-12T09:00:00.000Z",
        },
      ],
      project_quote_line_items: [
        {
          id: "45100000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "45000000-0000-0000-0000-000000000001",
          section: "Materials",
          description: "13mm GIB standard plasterboard",
          quantity: 120,
          unit: "sheet",
          rate: 42,
          total: 5040,
          is_optional: false,
          sort_order: 1,
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_line_item_id: "opportunity-line-1",
          source_opportunity_quote_number: "OQ-101",
          updated_at: "2026-06-12T09:00:00.000Z",
        },
        {
          id: "45100000-0000-0000-0000-000000000002",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "45000000-0000-0000-0000-000000000001",
          section: "Labour",
          description: "Install plasterboard partitions",
          quantity: 80,
          unit: "hr",
          rate: 55,
          total: 4400,
          is_optional: false,
          sort_order: 2,
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_line_item_id: "opportunity-line-2",
          source_opportunity_quote_number: "OQ-101",
          updated_at: "2026-06-12T09:00:00.000Z",
        },
        {
          id: "45100000-0000-0000-0000-000000000003",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "45000000-0000-0000-0000-000000000001",
          section: "Optional",
          description: "Acoustic insulation upgrade",
          quantity: 1,
          unit: "sum",
          rate: 1800,
          total: 1800,
          is_optional: true,
          sort_order: 3,
          source_opportunity_quote_id: "opportunity-quote-1",
          source_opportunity_quote_line_item_id: "opportunity-line-3",
          source_opportunity_quote_number: "OQ-101",
          updated_at: "2026-06-12T09:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "preconstruction",
          location: "22 Queen Street, Auckland",
          client_id: "client-1",
          source_opportunity_id: "opportunity-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Metro Property",
          company_name: "Metro Property Group",
          client_type: "commercial",
          client_status: "active",
          default_margin_percent: 16,
          email: "estimating@metro.test",
          phone: "0211111111",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [
        {
          id: "opportunity-1",
          organization_id: "org-1",
          name: "Level 4 refurbishment tender",
          opportunity_code: "OP-101",
          stage: "quoted",
          estimated_value: 14500,
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_quote",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const quote = result.records[0];
    expect(quote?.projectId).toBe("project-1");
    expect(quote?.opportunityId).toBe("opportunity-1");
    expect(quote?.clientId).toBe("client-1");
    expect(quote?.signalStrength).toBe("strong");
    expect(quote?.routingContext).toEqual({ readOnly: true });

    const payload = quote?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("classification_confidence");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");

    const sourceEvidence = payload.sourceEvidence as Record<string, unknown>;
    expect(sourceEvidence.quote).toMatchObject({
      sourceId: "45000000-0000-0000-0000-000000000001",
      quoteSourceType: "project_quote",
      number: "Q-AKL-001-3",
      title: "Level 4 fitout pricing",
      status: "Accepted",
      client: {
        clientId: "client-1",
        displayName: "Metro Property Group",
      },
      project: {
        projectId: "project-1",
        projectCode: "AKL-001",
      },
      opportunity: {
        opportunityId: "opportunity-1",
        sourceOpportunityQuoteId: "opportunity-quote-1",
        sourceOpportunityQuoteNumber: "OQ-101",
      },
      commercialTotals: {
        subtotal: 10000,
        optionalSubtotal: 1800,
        marginPercent: 18,
        marginAmount: 1800,
        contingencyAmount: 500,
        discountAmount: 200,
        total: 13915,
      },
    });
    const sourceEvidenceLineItems = sourceEvidence.lineItems as Array<Record<string, unknown>>;
    expect(sourceEvidenceLineItems).toHaveLength(3);
    expect(sourceEvidenceLineItems[2]).toMatchObject({
      lineItemId: "45100000-0000-0000-0000-000000000003",
      description: "Acoustic insulation upgrade",
      isOptional: true,
      sourceOpportunityQuoteNumber: "OQ-101",
    });

    expect(payload.operationalContext).toMatchObject({
      quoteSourceType: "project_quote",
      lineCount: 3,
      optionalLineCount: 1,
      includedLineCount: 2,
      hasProject: true,
      hasOpportunity: true,
      hasAcceptedStatus: true,
      hasZeroValue: false,
      evidenceStrength: "strong",
      pricingSignals: {
        marginApplied: true,
        contingencyApplied: true,
        discountApplied: true,
        optionalPricingUsed: true,
      },
      totalsBySection: {
        materialTotal: 5040,
        labourTotal: 4400,
      },
    });
    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      projectName: "Auckland Office Fitout",
      projectCode: "AKL-001",
      projectStatus: "preconstruction",
      clientId: "client-1",
      clientName: "Metro Property Group",
      opportunityId: "opportunity-1",
      opportunityName: "Level 4 refurbishment tender",
      opportunityCode: "OP-101",
      opportunityStage: "quoted",
      actorUserId: "user-quote-1",
      sourceTable: "project_quotes",
      sourceModule: "project_quotes",
      sourceWorkflow: "monthly_project_quote_review",
      sourceIds: {
        quoteId: "45000000-0000-0000-0000-000000000001",
        projectQuoteId: "45000000-0000-0000-0000-000000000001",
        opportunityQuoteId: null,
      },
    });
  });

  it("selects opportunity quotes into the unified project_quote container with the same trust-boundary shape", async () => {
    installFakeAdmin({
      opportunity_quotes: [
        {
          id: "op-quote-1",
          organization_id: "org-1",
          opportunity_id: "opportunity-17",
          created_by: "user-quote-2",
          quote_title: "Wall Linings",
          quote_number: "Q-26017-1",
          client_name: "Tradesstack Limited",
          company_name: "Tradesstack Limited",
          contact_person: "Tradesstack Limited",
          client_email: "hi@tradesstack.com",
          client_phone: "0225671746",
          site_address: "Unspecified",
          project_name: "Metro Ceilings Fitout",
          quote_date: "2026-06-25",
          expiry_date: null,
          status: "Sent",
          optional_items_notes: "",
          scope_exclusions: "",
          assumptions: "",
          scope_notes: "",
          margin_percent: 25,
          discount_amount: 0,
          contingency_amount: 0,
          gst_percent: 15,
          validity_period: "30 days",
          payment_terms: "",
          lead_time: "",
          terms_inclusions: "Fixings and adhesives.",
          terms_exclusions: "Plastering, Painting, Wall Framing",
          clarifications: "",
          acceptance_notes: "",
          subtotal: 7850,
          optional_subtotal: 0,
          margin_amount: 1962.5,
          gst_amount: 1471.88,
          total_quote_price: 11284.38,
          updated_at: "2026-06-25T07:10:41.549107+00:00",
        },
      ],
      opportunity_quote_line_items: [
        {
          id: "op-line-1",
          organization_id: "org-1",
          quote_id: "op-quote-1",
          section: "Item",
          description: "Supply and install 13mm GIB standard plasterboard wall linings to 3000mm",
          quantity: 150,
          unit: "M2",
          rate: 27,
          total: 4050,
          is_optional: false,
          sort_order: 1,
          updated_at: "2026-06-25T07:10:41.549107+00:00",
        },
        {
          id: "op-line-2",
          organization_id: "org-1",
          quote_id: "op-quote-1",
          section: "Item",
          description: "Supply and install 13mm GIB aqualine wall linings to 3000mm",
          quantity: 100,
          unit: "M2",
          rate: 38,
          total: 3800,
          is_optional: false,
          sort_order: 2,
          updated_at: "2026-06-25T07:10:41.549107+00:00",
        },
      ],
      project_quotes: [],
      project_quote_line_items: [],
      organization_projects: [],
      organization_clients: [
        {
          id: "client-17",
          organization_id: "org-1",
          name: "Tradesstack Limited",
          company_name: "Tradesstack Limited",
          client_type: "internal",
          client_status: "active",
          email: "hi@tradesstack.com",
          phone: "0225671746",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [
        {
          id: "opportunity-17",
          organization_id: "org-1",
          name: "Metro Ceilings Fitout",
          opportunity_code: "26017",
          stage: "Quoted",
          estimated_value: 11284.38,
          client_id: "client-17",
          updated_at: "2026-06-25T07:10:41.549107+00:00",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_quote",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.table).toBe("opportunity_quotes");
    expect(result.records[0]?.source.sourceId).toBe("op-quote-1");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-25T07:10:41.549107+00:00",
      id: "opportunity_quotes:op-quote-1",
    });

    const payload = result.records[0]?.payload as Record<string, any>;
    expect(payload.sourceEvidence.quote).toMatchObject({
      sourceId: "op-quote-1",
      quoteSourceType: "opportunity_quote",
      number: "Q-26017-1",
      title: "Wall Linings",
      status: "Sent",
    });
    expect(payload.sourceEvidence.lineItems).toMatchObject([
      {
        lineItemId: "op-line-1",
        description: "Supply and install 13mm GIB standard plasterboard wall linings to 3000mm",
        total: 4050,
        sourceOpportunityQuoteId: "op-quote-1",
        sourceOpportunityQuoteNumber: "Q-26017-1",
      },
      {
        lineItemId: "op-line-2",
        description: "Supply and install 13mm GIB aqualine wall linings to 3000mm",
        total: 3800,
        sourceOpportunityQuoteId: "op-quote-1",
        sourceOpportunityQuoteNumber: "Q-26017-1",
      },
    ]);
    expect(payload.operationalContext).toMatchObject({
      quoteSourceType: "opportunity_quote",
      hasSentStatus: true,
      hasOpportunity: true,
      hasProject: true,
    });
    expect(payload.lineageContext).toMatchObject({
      sourceTable: "opportunity_quotes",
      sourceWorkflow: "monthly_opportunity_quote_review",
      opportunityId: "opportunity-17",
      sourceIds: {
        quoteId: "op-quote-1",
        opportunityQuoteId: "op-quote-1",
        projectQuoteId: null,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("classification_confidence");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("\"trade\"");
    expect(JSON.stringify(payload)).not.toContain("\"system\"");
    expect(JSON.stringify(payload)).not.toContain("\"assembly\"");
  });

  it("dedupes converted quote lifecycle rows deterministically across opportunity and project sources", async () => {
    installFakeAdmin({
      opportunity_quotes: [
        {
          id: "op-quote-1",
          organization_id: "org-1",
          opportunity_id: "opportunity-1",
          created_by: "user-1",
          quote_title: "Wall Linings",
          quote_number: "Q-1",
          project_name: "Metro Fitout",
          company_name: "Metro",
          client_name: "Metro",
          status: "Sent",
          subtotal: 100,
          total_quote_price: 115,
          gst_percent: 15,
          gst_amount: 15,
          updated_at: "2026-06-20T09:00:00.000Z",
        },
      ],
      opportunity_quote_line_items: [
        {
          id: "op-line-1",
          organization_id: "org-1",
          quote_id: "op-quote-1",
          section: "Item",
          description: "Opp row",
          quantity: 1,
          unit: "ea",
          rate: 100,
          total: 100,
          is_optional: false,
          sort_order: 1,
          updated_at: "2026-06-20T09:00:00.000Z",
        },
      ],
      project_quotes: [
        {
          id: "project-quote-1",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-1",
          source_opportunity_id: "opportunity-1",
          source_opportunity_quote_id: "op-quote-1",
          source_opportunity_quote_number: "Q-1",
          quote_number: "Q-1",
          quote_title: "Wall Linings Converted",
          project_name: "Metro Fitout",
          company_name: "Metro",
          client_name: "Metro",
          status: "Accepted",
          subtotal: 100,
          total_quote_price: 115,
          gst_percent: 15,
          gst_amount: 15,
          updated_at: "2026-06-21T09:00:00.000Z",
        },
      ],
      project_quote_line_items: [
        {
          id: "project-line-1",
          organization_id: "org-1",
          project_id: "project-1",
          quote_id: "project-quote-1",
          section: "Item",
          description: "Project row",
          quantity: 1,
          unit: "ea",
          rate: 100,
          total: 100,
          is_optional: false,
          sort_order: 1,
          updated_at: "2026-06-21T09:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Metro Fitout",
          project_code: "26017",
          stage: "Pricing",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Metro",
          company_name: "Metro",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_opportunities: [
        {
          id: "opportunity-1",
          organization_id: "org-1",
          name: "Metro Fitout",
          opportunity_code: "26017",
          stage: "Won",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_quote",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.table).toBe("project_quotes");
    expect(result.records[0]?.source.sourceId).toBe("project-quote-1");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-21T09:00:00.000Z",
      id: "project_quotes:project-quote-1",
    });
  });

  it("enriches project variations into a dedicated trust-boundary packet with safe lifecycle, linkage, attachment, invoice, and mirrored routing context", async () => {
    installFakeAdmin({
      project_variations: [
        {
          id: "variation-1",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-variation-1",
          variation_number: "VAR-0017",
          variation_title: "Ceiling redesign and acoustic upgrade",
          status: "Approved",
          origin: "Client Request",
          source_reference: "SI-204 / client email",
          requested_by: "Site PM",
          requested_date: "2026-06-05",
          due_date: "2026-06-12",
          sent_to_client_at: "2026-06-10T09:00:00.000Z",
          approved_at: "2026-06-14T11:00:00.000Z",
          rejected_at: null,
          client_viewed_at: "2026-06-11T14:00:00.000Z",
          invoice_ready: true,
          invoice_reference: "VAR-INV-17",
          subtotal: 4000,
          margin_percent: 18,
          margin_total: 720,
          discount_amount: 100,
          contingency_amount: 250,
          gst_total: 730.5,
          total_variation_price: 5600.5,
          labour_total: 1800,
          materials_total: 2200,
          subcontractors_total: 0,
          plant_total: 0,
          payment_terms: "20th month following",
          validity_period: "30 days",
          lead_time: "2 weeks",
          terms_inclusions: "Supply and install upgraded acoustic ceiling tiles.",
          terms_exclusions: "Painting touch-ups excluded.",
          assumptions: "Night access available.",
          clarifications: "Client approved revised reflected ceiling plan.",
          notes: "Urgent client-driven upgrade before tenancy handover.",
          updated_at: "2026-06-20T09:00:00.000Z",
          created_at: "2026-06-05T08:00:00.000Z",
        },
      ],
      project_variation_line_items: [
        {
          id: "variation-line-1",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          section: "Materials",
          description: "Acoustic ceiling tile upgrade",
          quantity: 120,
          unit: "m2",
          rate: 18,
          total: 2160,
          sort_order: 1,
          source_project_quote_id: "quote-1",
          source_project_quote_line_item_id: "quote-line-1",
          source_project_quote_number: "Q-017",
          source_purchase_order_id: "po-1",
          source_purchase_order_line_item_id: "po-line-1",
          source_purchase_order_number: "PO-017",
          updated_at: "2026-06-20T09:00:00.000Z",
          created_at: "2026-06-05T08:00:00.000Z",
        },
        {
          id: "variation-line-2",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          section: "Labour",
          description: "Install revised ceiling grid and trims",
          quantity: 32,
          unit: "hr",
          rate: 70,
          total: 2240,
          sort_order: 2,
          source_project_quote_id: "quote-1",
          source_project_quote_line_item_id: "quote-line-2",
          source_project_quote_number: "Q-017",
          source_purchase_order_id: "po-1",
          source_purchase_order_line_item_id: "po-line-2",
          source_purchase_order_number: "PO-017",
          updated_at: "2026-06-20T09:00:00.000Z",
          created_at: "2026-06-05T08:00:00.000Z",
        },
      ],
      project_variation_status_events: [
        {
          id: "variation-status-1",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          from_status: "Draft",
          to_status: "Priced",
          event_type: "status_change",
          occurred_at: "2026-06-09T10:00:00.000Z",
          changed_at: "2026-06-09T10:00:00.000Z",
          changed_by: "user-variation-1",
          note: "Priced after supplier feedback.",
          metadata: { leaked: true },
        },
        {
          id: "variation-status-2",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          from_status: "Sent",
          to_status: "Approved",
          event_type: "status_change",
          occurred_at: "2026-06-14T11:00:00.000Z",
          changed_at: "2026-06-14T11:00:00.000Z",
          changed_by: "user-client-approver",
          note: "Approved on revised price.",
          metadata: { leaked: true },
        },
      ],
      project_variation_attachments: [
        {
          id: "variation-attachment-1",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          file_kind: "client_instruction",
          file_name: "client-instruction.pdf",
          storage_path: "org-1/variations/variation-1/client-instruction.pdf",
          external_url: "https://signed.example/client-instruction.pdf",
          notes: "Signed instruction received.",
          updated_at: "2026-06-21T10:00:00.000Z",
          created_at: "2026-06-21T10:00:00.000Z",
          uploaded_by: "user-variation-1",
        },
      ],
      project_variation_invoice_items: [
        {
          id: "variation-invoice-item-1",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          amount: 5600.5,
          status: "ready",
          invoice_reference: "VAR-INV-17",
          ready_at: "2026-06-15T09:00:00.000Z",
          exported_at: null,
          updated_at: "2026-06-23T12:00:00.000Z",
          created_at: "2026-06-15T09:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "delivery",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          company_name: "Metro Property Group",
          name: "Metro Property Group",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_quotes: [
        {
          id: "quote-1",
          organization_id: "org-1",
          project_id: "project-1",
          quote_number: "Q-017",
          quote_title: "Base ceiling package",
          status: "Accepted",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_purchase_orders: [
        {
          id: "po-1",
          organization_id: "org-1",
          project_id: "project-1",
          purchase_order_number: "PO-017",
          purchase_order_title: "Ceiling materials and labour",
          status: "Approved",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          issued_to_label: "Metro Building Supplies",
          supplier_name_snapshot: "Metro Building Supplies",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      cost_items: [
        {
          id: "cost-item-1",
          organization_id: "org-1",
          source_document_kind: "project_variation",
          source_document_id: "variation-1",
          source_line_id: "variation-line-1",
          source_line_table: "project_variation_line_items",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-variation-1",
          organization_cost_code_id: "org-cost-code-variation-1",
        },
        {
          id: "cost-item-2",
          organization_id: "org-1",
          source_document_kind: "project_variation",
          source_document_id: "variation-1",
          source_line_id: "variation-line-2",
          source_line_table: "project_variation_line_items",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-variation-2",
          organization_cost_code_id: "org-cost-code-variation-2",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_variation",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const variation = result.records[0];
    expect(variation?.source.table).toBe("project_variations");
    expect(variation?.source.sourceId).toBe("variation-1");
    expect(variation?.projectId).toBe("project-1");
    expect(variation?.clientId).toBe("client-1");
    expect(variation?.signalStrength).toBe("strong");
    expect(variation?.updatedAt).toBe("2026-06-23T12:00:00.000Z");
    expect(variation?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_codeValues: ["100", "200"],
      tradesstack_cost_code_labelValues: ["Materials", "Labour"],
      accounting_mapping_idValues: ["mapping-variation-1", "mapping-variation-2"],
      organization_cost_code_idValues: ["org-cost-code-variation-1", "org-cost-code-variation-2"],
    });

    const payload = variation?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(JSON.stringify(payload)).not.toContain("external_url");
    expect(JSON.stringify(payload)).not.toContain("signed.example");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("internal_cost_code");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("accounting_mapping_id");

    expect(payload.sourceEvidence).toMatchObject({
      variation: {
        variationId: "variation-1",
        variationNumber: "VAR-0017",
        title: "Ceiling redesign and acoustic upgrade",
        status: "Approved",
        origin: "Client Request",
        sourceReference: "SI-204 / client email",
      },
      commercialValues: {
        subtotal: 4000,
        marginPercent: 18,
        marginTotal: 720,
        discountAmount: 100,
        contingencyAmount: 250,
        gstTotal: 730.5,
        total: 5600.5,
      },
      commercialTerms: {
        paymentTerms: "20th month following",
        validityPeriod: "30 days",
        leadTime: "2 weeks",
      },
      attachmentSummary: {
        attachmentCount: 1,
        attachmentKinds: ["client_instruction"],
        hasAttachments: true,
      },
      invoiceExportSummary: {
        invoiceReady: true,
        invoiceItemCount: 1,
        exportedItemCount: 0,
        totalReadyAmount: 5600.5,
      },
      claimRelevanceSummary: {
        claimRelevant: true,
        commerciallyRecovered: false,
        awaitingApproval: false,
        awaitingIssue: false,
      },
      quoteLinkageSummary: {
        quoteLinked: true,
        linkedQuoteCount: 1,
        linkedQuoteLineCount: 2,
      },
      purchaseOrderLinkageSummary: {
        purchaseOrderLinked: true,
        linkedPurchaseOrderCount: 1,
        linkedPurchaseOrderLineCount: 2,
      },
      evidenceStrengthSummary: {
        evidenceStrength: "strong",
        mirroredCostItemCount: 2,
      },
    });
    expect(payload.sourceEvidence.lineItems).toMatchObject([
      {
        lineItemId: "variation-line-1",
        section: "Materials",
        description: "Acoustic ceiling tile upgrade",
        quantity: 120,
        unit: "m2",
        rate: 18,
        total: 2160,
      },
      {
        lineItemId: "variation-line-2",
        section: "Labour",
        description: "Install revised ceiling grid and trims",
      },
    ]);
    expect(payload.sourceEvidence.statusHistorySummary).toMatchObject([
      {
        statusEventId: "variation-status-1",
        fromStatus: "Draft",
        toStatus: "Priced",
      },
      {
        statusEventId: "variation-status-2",
        fromStatus: "Sent",
        toStatus: "Approved",
      },
    ]);

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "invoice_ready",
      hasQuoteLinkedLines: true,
      hasPurchaseOrderLinkedLines: true,
      hasAttachments: true,
      hasIssuedToClient: true,
      hasClientViewed: true,
      hasApproved: true,
      hasRejected: false,
      invoiceReady: true,
      hasInvoiceItems: true,
      claimRelevant: true,
      commerciallyRecovered: false,
      evidenceStrength: "strong",
      pricingCompleteness: {
        hasLineItems: true,
        hasCommercialValue: true,
        commerciallyComplete: true,
      },
      documentCompleteness: {
        attachmentCount: 1,
        hasAttachments: true,
      },
      approvalCompleteness: {
        hasIssuedToClient: true,
        hasClientViewed: true,
        hasApproved: true,
        hasRejected: false,
      },
    });
    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      variationId: "variation-1",
      projectId: "project-1",
      projectName: "Auckland Office Fitout",
      clientId: "client-1",
      clientName: "Metro Property Group",
      quoteIds: ["quote-1"],
      quoteLineItemIds: ["quote-line-1", "quote-line-2"],
      purchaseOrderIds: ["po-1"],
      purchaseOrderLineItemIds: ["po-line-1", "po-line-2"],
      attachmentIds: ["variation-attachment-1"],
      statusEventIds: ["variation-status-1", "variation-status-2"],
      invoiceItemIds: ["variation-invoice-item-1"],
      mirroredCostItemIds: ["cost-item-1", "cost-item-2"],
      actorUserId: "user-variation-1",
      sourceTable: "project_variations",
    });
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: "2026-06-23T12:00:00.000Z",
      id: "variation-1",
    });
  });

  it("enriches supplier invoices into a dedicated trust-boundary packet across capture, matching, allocation, and actual-cost lifecycle stages", async () => {
    installFakeAdmin({
      supplier_invoices: [
        {
          id: "invoice-1",
          organization_id: "org-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          invoice_number: "INV-2406-17",
          invoice_date: "2026-06-18",
          due_date: "2026-07-18",
          subtotal: 1500,
          tax_total: 225,
          total: 1725,
          currency: "NZD",
          supplier_po_reference: "PO-1001",
          tax_amount_mode: "exclusive",
          tax_evidence_json: { amountMode: "exclusive", lineTaxPreserved: true },
          status: "Needs Review",
          source: "upload",
          document_file_path: "org-1/supplier-invoices/invoice-1/header.pdf",
          document_file_name: "header.pdf",
          notes: "June plasterboard delivery.",
          created_by: "user-invoice-1",
          updated_at: "2026-06-21T09:00:00.000Z",
        },
      ],
      supplier_invoice_lines: [
        {
          id: "line-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          description: "13mm GIB standard plasterboard",
          quantity: 20,
          unit_price: 50,
          line_total: 1000,
          tax_amount: 150,
          project_id: "project-1",
          sort_order: 1,
          raw_line_text: "OCR ONLY TEXT",
          normalized_line_text: "13mm gib standard plasterboard",
          ocr_confidence: 0.94,
          import_source: "ocr",
          updated_at: "2026-06-21T09:00:00.000Z",
        },
        {
          id: "line-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          description: "Suspended ceiling grid",
          quantity: 10,
          unit_price: 50,
          line_total: 500,
          tax_amount: 75,
          project_id: "project-2",
          sort_order: 2,
          raw_line_text: "SECOND OCR TEXT",
          normalized_line_text: "suspended ceiling grid",
          ocr_confidence: 0.88,
          import_source: "ocr",
          updated_at: "2026-06-21T09:00:00.000Z",
        },
      ],
      supplier_invoice_documents: [
        {
          id: "document-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          file_path: "org-1/supplier-invoices/invoice-1/document-1.pdf",
          file_name: "invoice.pdf",
          mime_type: "application/pdf",
          size_bytes: 1200,
          document_type: "invoice",
          created_at: "2026-06-18T08:00:00.000Z",
        },
        {
          id: "document-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          file_path: "org-1/supplier-invoices/invoice-1/document-2.pdf",
          file_name: "delivery-docket.pdf",
          mime_type: "application/pdf",
          size_bytes: 900,
          document_type: "supporting_document",
          created_at: "2026-06-18T08:05:00.000Z",
        },
      ],
      supplier_invoice_purchase_order_matches: [
        {
          id: "match-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          purchase_order_id: "po-1",
          matched_amount: 1000,
          match_status: "accepted",
          approval_status: "approved",
          approval_notes: "Materials received and checked.",
          approval_checks_json: {
            materials_received: true,
            pricing_correct: true,
            allocation_correct: true,
          },
          created_at: "2026-06-19T10:00:00.000Z",
          updated_at: "2026-06-20T10:00:00.000Z",
        },
        {
          id: "match-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          purchase_order_id: "po-2",
          matched_amount: 500,
          match_status: "adjusted",
          approval_status: "pending",
          approval_notes: "",
          approval_checks_json: {
            materials_received: true,
          },
          created_at: "2026-06-19T11:00:00.000Z",
          updated_at: "2026-06-20T11:00:00.000Z",
        },
      ],
      supplier_invoice_line_allocations: [
        {
          id: "allocation-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          allocated_amount: 1000,
          matched_amount: 1000,
          allocation_sequence: 1,
          allocation_status: "matched",
          match_status: "accepted",
          approval_status: "approved",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-1",
          organization_cost_code_id: "org-cost-code-1",
          tax_resolution_status: "resolved",
          work_type: "wall linings",
          cost_type: "materials",
          internal_cost_code: "INT-100",
          ai_construction_intelligence: { leaked: true },
          created_at: "2026-06-20T12:00:00.000Z",
          updated_at: "2026-06-20T12:00:00.000Z",
          allocation_group_id: "allocation-group-1",
          edit_state: "locked_posted",
        },
        {
          id: "allocation-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-2",
          purchase_order_id: "po-2",
          purchase_order_line_item_id: "po-line-2",
          project_id: "project-2",
          allocated_amount: 300,
          matched_amount: 300,
          allocation_sequence: 1,
          allocation_status: "split",
          match_status: "adjusted",
          approval_status: "pending",
          tradesstack_cost_code: 300,
          tradesstack_cost_code_label: "Subcontractors",
          accounting_mapping_id: "mapping-2",
          organization_cost_code_id: "org-cost-code-2",
          tax_resolution_status: "resolved",
          work_type: "ceilings",
          cost_type: "subcontractors",
          internal_cost_code: "INT-300",
          created_at: "2026-06-20T13:00:00.000Z",
          updated_at: "2026-06-20T13:00:00.000Z",
          allocation_group_id: "allocation-group-2",
          edit_state: "editable",
        },
        {
          id: "allocation-3",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-2",
          purchase_order_id: null,
          purchase_order_line_item_id: null,
          project_id: "project-2",
          allocated_amount: 200,
          matched_amount: 0,
          allocation_sequence: 2,
          allocation_status: "unmatched",
          match_status: "suggested",
          approval_status: "pending",
          tax_resolution_status: "unresolved",
          created_at: "2026-06-20T13:10:00.000Z",
          updated_at: "2026-06-20T13:10:00.000Z",
          allocation_group_id: "allocation-group-2",
          edit_state: "editable",
          supersedes_allocation_id: "allocation-2",
        },
      ],
      project_actual_cost_events: [
        {
          id: "event-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          supplier_invoice_line_allocation_id: "allocation-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          amount: 1000,
          tax_amount: 150,
          total_amount: 1150,
          event_date: "2026-06-18",
          event_status: "posted",
          event_type: "posting",
          posting_source: "supplier_invoice_allocation",
          source_type: "supplier_invoice",
          source_invoice_allocation_id: "allocation-1",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-1",
          correction_root_event_id: "event-1",
          created_at: "2026-06-20T14:00:00.000Z",
        },
        {
          id: "event-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          supplier_invoice_line_allocation_id: "allocation-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          amount: 1000,
          tax_amount: 150,
          total_amount: 1150,
          event_date: "2026-06-22",
          event_status: "reversed",
          event_type: "reversal",
          posting_source: "supplier_invoice_allocation",
          source_type: "supplier_invoice",
          source_invoice_allocation_id: "allocation-1",
          reverses_event_id: "event-1",
          correction_root_event_id: "event-1",
          reversal_reason: "Supplier credit",
          reversal_note: "Credit note received",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-1",
          created_at: "2026-06-22T09:00:00.000Z",
        },
      ],
      organization_suppliers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org-1",
          company_name: "Metro Building Supplies",
          name: "Metro Building Supplies",
          legal_name: "Metro Building Supplies Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_purchase_orders: [
        {
          id: "po-1",
          organization_id: "org-1",
          project_id: "project-1",
          purchase_order_number: "PO-1001",
          purchase_order_title: "Plasterboard package",
          status: "Approved",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          issued_to_label: "Metro Building Supplies",
          supplier_name_snapshot: "Metro Building Supplies",
          updated_at: "2026-06-10T00:00:00.000Z",
          total_purchase_order_price: 2000,
        },
        {
          id: "po-2",
          organization_id: "org-1",
          project_id: "project-2",
          purchase_order_number: "PO-1002",
          purchase_order_title: "Ceiling package",
          status: "Approved",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          issued_to_label: "Metro Building Supplies",
          supplier_name_snapshot: "Metro Building Supplies",
          updated_at: "2026-06-10T00:00:00.000Z",
          total_purchase_order_price: 1000,
        },
      ],
      project_purchase_order_line_items: [
        {
          id: "po-line-1",
          organization_id: "org-1",
          purchase_order_id: "po-1",
          project_id: "project-1",
          description: "13mm GIB standard plasterboard",
          quantity: 40,
          rate: 50,
          total: 2000,
          sort_order: 1,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
        {
          id: "po-line-2",
          organization_id: "org-1",
          purchase_order_id: "po-2",
          project_id: "project-2",
          description: "Suspended ceiling grid",
          quantity: 20,
          rate: 50,
          total: 1000,
          sort_order: 1,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "delivery",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "project-2",
          organization_id: "org-1",
          name: "Wellington Retail Upgrade",
          project_code: "WLG-004",
          stage: "delivery",
          client_id: "client-2",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          company_name: "Metro Property Group",
          name: "Metro Property Group",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "client-2",
          organization_id: "org-1",
          company_name: "Capital Retail",
          name: "Capital Retail",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const invoice = result.records[0];
    expect(invoice?.source.table).toBe("supplier_invoices");
    expect(invoice?.source.sourceId).toBe("invoice-1");
    expect(invoice?.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect((invoice as SupplierBillUclBusinessRecord | undefined)?.supplier).toEqual({
      supplierId: "11111111-1111-4111-8111-111111111111",
      displayName: "Metro Building Supplies",
    });
    expect(invoice?.signalStrength).toBe("normal");
    expect(invoice?.routingContext).toEqual({
      readOnly: true,
      tradesstackCostCodes: ["100"],
      accountingMappingIds: ["mapping-1"],
      organizationCostCodeIds: ["org-cost-code-1"],
      xeroAccountCodes: [],
      xeroTaxTypes: [],
    });
    expect(JSON.stringify(invoice?.routingContext)).not.toContain("work_type");
    expect(JSON.stringify(invoice?.routingContext)).not.toContain("cost_type");
    expect(JSON.stringify(invoice?.routingContext)).not.toContain("internal_cost_code");

    const payload = invoice?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineage",
      "operationalContext",
      "provenance",
      "schemaVersion",
      "sourceEvidence",
      "visibility",
    ]);
    expect(payload.schemaVersion).toBe(SUPPLIER_BILL_UCL_SCHEMA_VERSION);
    expect(validateSupplierBillUclBusinessRecord(invoice).success).toBe(true);
    expect(payload).not.toHaveProperty("lineageContext");
    expect(payload.sourceEvidence).not.toHaveProperty("supplierInvoice");
    expect(payload.sourceEvidence).not.toHaveProperty("lineItems");
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("OCR ONLY TEXT");
    expect(JSON.stringify(payload)).not.toContain("org-1/supplier-invoices");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("final_classification");
    expect(JSON.stringify(payload)).not.toContain("classification_confidence");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("internal_cost_code");
    expect(JSON.stringify(payload)).not.toContain("signedUrl");
    expect(JSON.stringify(payload)).not.toContain("fingerprint");

    expect(payload.sourceEvidence).toMatchObject({
      bill: {
        billNumber: "INV-2406-17",
        billDate: "2026-06-18",
        dueDate: "2026-07-18",
        currency: "NZD",
        canonicalStatus: "Needs Review",
        source: "upload",
        supplierPoReference: "PO-1001",
        notesSummary: "June plasterboard delivery.",
      },
      supplier: {
        supplierId: "11111111-1111-4111-8111-111111111111",
        displayName: "Metro Building Supplies",
      },
      financialTotals: {
        subtotal: 1500,
        taxTotal: 225,
        total: 1725,
        calculatedLineSubtotal: 1500,
        calculatedLineTax: 225,
        calculatedLineTotal: 1725,
        headerVariance: 0,
      },
      taxSummary: {
        amountMode: "exclusive",
        evidencePresent: true,
        treatmentCounts: {
          taxable: 1,
          unresolved: 1,
        },
      },
      allocationSummary: {
        totalAllocationCount: 2,
        allocatedLineCount: 2,
        allocatedAmount: 1200,
        unallocatedAmount: 300,
        codedLineCount: 1,
        uncodedLineCount: 1,
      },
      actualCostPostingSummary: {
        postingEventCount: 2,
        postedAmount: 1000,
        postedTax: 150,
        postedTotal: 1150,
        reversalAmount: 1150,
        netPostedAmount: 0,
      },
      attachmentSummary: {
        totalAttachmentCount: 2,
      },
    });
    const sourceEvidence = payload.sourceEvidence as Record<string, any>;
    expect(sourceEvidence.billLines).toHaveLength(2);
    expect(sourceEvidence.billLines[0]).toMatchObject({
      lineId: "line-1",
      description: "13mm GIB standard plasterboard",
      quantity: 20,
      unitPrice: 50,
      lineTotal: 1000,
      poMatchSummary: {
        purchaseOrderId: "po-1",
        purchaseOrderLineItemId: "po-line-1",
        previouslyApprovedQuantity: 0,
        cumulativeQuantity: 20,
        remainingQuantity: 20,
      },
    });
    expect(sourceEvidence.poMatches).toMatchObject([
      {
        matchId: "match-1",
        purchaseOrderId: "po-1",
        matchedAmount: 1000,
        matchStatus: "accepted",
        approvalStatus: "approved",
      },
      {
        matchId: "match-2",
        purchaseOrderId: "po-2",
        matchedAmount: 500,
        matchStatus: "adjusted",
        approvalStatus: "pending",
      },
    ]);

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "draft",
      workflowState: "Draft",
      approvalState: "not_started",
      poMatchingCompleteness: "complete",
      allocationCompleteness: "complete",
      accountingReadiness: "not_ready",
      unresolvedExceptionCount: 2,
      evidenceStrength: "normal",
      truncated: false,
    });

    expect(payload.lineage).toMatchObject({
      supplierBillId: "invoice-1",
      supplierId: "11111111-1111-4111-8111-111111111111",
      billLineIds: ["line-1", "line-2"],
      currentDocumentIds: ["document-1", "document-2"],
      purchaseOrderIds: ["po-1", "po-2"],
      purchaseOrderLineItemIds: ["po-line-1"],
      allocationIds: ["allocation-1", "allocation-3"],
      actualCostEventIds: ["event-1", "event-2"],
      projectIds: ["project-1", "project-2"],
    });
    expect(payload.visibility).toMatchObject({
      organizationId: "org-1",
      projectIds: ["project-1", "project-2"],
      requiresSupplierInvoiceView: true,
    });
    expect(invoice?.projectId).toBeNull();
  });

  it("uses the latest direct-child timestamp as the Supplier Bill cursor before deterministic prompt prefixing", async () => {
    const invoiceRows = Array.from({ length: 13 }, (_, offset) => {
      const index = offset + 1;
      return {
        id: `invoice-cursor-${String(index).padStart(2, "0")}`,
        organization_id: "org-1",
        supplier_id: "11111111-1111-4111-8111-111111111111",
        invoice_number: `CURSOR-${index}`,
        invoice_date: "2026-06-01",
        subtotal: 100,
        tax_total: 15,
        total: 115,
        currency: "NZD",
        status: "Captured",
        source: "manual",
        created_by: "user-1",
        updated_at: `2026-06-02T00:${String(index).padStart(2, "0")}:00.592353+00:00`,
      };
    });
    const lineRows = invoiceRows.map((invoice, offset) => ({
      id: `line-cursor-${String(offset + 1).padStart(2, "0")}`,
      organization_id: "org-1",
      supplier_invoice_id: invoice.id,
      description: `Cursor line ${offset + 1}`,
      quantity: 1,
      unit_price: 100,
      line_total: 100,
      tax_amount: 15,
      sort_order: 1,
      updated_at: `2026-06-20T12:${String(13 - offset).padStart(2, "0")}:00.138918+12:00`,
    }));
    installFakeAdmin({
      supplier_invoices: [...invoiceRows].reverse(),
      supplier_invoice_lines: [
        ...lineRows.filter((_, index) => index % 2 === 0).reverse(),
        ...lineRows.filter((_, index) => index % 2 === 1),
      ],
      supplier_invoice_documents: [],
      supplier_invoice_purchase_order_matches: [],
      supplier_invoice_line_allocations: [],
      project_actual_cost_events: [],
      organization_suppliers: [{
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "org-1",
        name: "Cursor Supplier",
        updated_at: "2026-06-01T00:00:00.000Z",
      }],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });
    const expected = [...result.records].sort((left, right) => (
      left.updatedAt.localeCompare(right.updatedAt)
      || left.source.sourceId.localeCompare(right.source.sourceId)
    ));
    const selection = selectSupplierBillRecordsForPrompt({
      records: result.records,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: result.nextCursorCandidate,
    });

    expect(result.records.map((record) => record.source.sourceId)).toEqual(
      invoiceRows.map((invoice) => invoice.id),
    );
    expect(result.records[0].updatedAt).toBe(
      normalizeSupplierBillUclTimestamp(lineRows[0].updated_at),
    );
    expect(selection.records.map((record) => record.source.sourceId)).toEqual(
      expected.slice(0, 12).map((record) => record.source.sourceId),
    );
    expect(selection.nextCursorCandidate).toEqual(
      getSupplierBillEffectiveCursor(expected[11]),
    );
    expect(
      expected
        .slice(12)
        .every((record) => (
          record.updatedAt > selection.nextCursorCandidate.updatedAt!
          || (
            record.updatedAt === selection.nextCursorCandidate.updatedAt
            && record.source.sourceId > selection.nextCursorCandidate.id!
          )
        )),
    ).toBe(true);
  });

  it("uses the normalized owner timestamp when optional child timestamps are null", async () => {
    installFakeAdmin({
      supplier_invoices: [{
        id: "invoice-owner-cursor",
        organization_id: "org-1",
        supplier_id: "11111111-1111-4111-8111-111111111111",
        invoice_number: "OWNER-CURSOR",
        invoice_date: "2026-06-01",
        subtotal: 100,
        tax_total: 15,
        total: 115,
        currency: "NZD",
        status: "Captured",
        source: "manual",
        created_by: "user-1",
        updated_at: "2026-06-20T12:01:47.138918+12:00",
      }],
      supplier_invoice_lines: [{
        id: "line-null-cursor",
        organization_id: "org-1",
        supplier_invoice_id: "invoice-owner-cursor",
        description: "Optional null child timestamp",
        quantity: 1,
        unit_price: 100,
        line_total: 100,
        tax_amount: 15,
        sort_order: 1,
        updated_at: null,
        created_at: null,
      }],
      supplier_invoice_documents: [],
      supplier_invoice_purchase_order_matches: [],
      supplier_invoice_line_allocations: [],
      project_actual_cost_events: [],
      organization_suppliers: [{
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "org-1",
        name: "Owner Cursor Supplier",
        updated_at: "2026-06-01T00:00:00.000000+00:00",
      }],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].updatedAt).toBe("2026-06-20T00:01:47.138918Z");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: result.records[0].updatedAt,
      id: result.records[0].source.sourceId,
    });
  });

  it("treats extraction-only changes as enrichment snapshots rather than monthly selection dependencies", async () => {
    installFakeAdmin({
      supplier_invoices: [{
        id: "invoice-extraction-only",
        organization_id: "org-1",
        supplier_id: "11111111-1111-4111-8111-111111111111",
        invoice_number: "EXTRACTION-ONLY",
        currency: "NZD",
        status: "Captured",
        source: "upload",
        updated_at: "2026-05-31T23:59:00.000Z",
      }],
      supplier_invoice_lines: [],
      supplier_invoice_documents: [],
      supplier_invoice_purchase_order_matches: [],
      supplier_invoice_line_allocations: [],
      project_actual_cost_events: [],
      supplier_invoice_document_extractions: [{
        id: "extraction-in-june",
        organization_id: "org-1",
        supplier_invoice_id: "invoice-extraction-only",
        status: "completed",
        updated_at: "2026-06-10T10:00:00.000Z",
      }],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toEqual([]);
    expect(result.nextCursorCandidate).toEqual({ updatedAt: null, id: null });
  });

  it("fails the supplier invoice build with the source ID when the assembled v2 record is invalid", async () => {
    installFakeAdmin({
      supplier_invoices: [
        {
          id: "invoice-invalid-currency",
          organization_id: "org-1",
          supplier_id: null,
          invoice_number: "BAD-1",
          invoice_date: "2026-06-18",
          due_date: null,
          subtotal: 0,
          tax_total: 0,
          total: 0,
          currency: "nzd",
          status: "Needs Review",
          source: "manual",
          created_by: "user-1",
          updated_at: "2026-06-21T09:00:00.000Z",
        },
      ],
      supplier_invoice_lines: [],
      supplier_invoice_documents: [],
      supplier_invoice_purchase_order_matches: [],
      supplier_invoice_line_allocations: [],
      project_actual_cost_events: [],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    await expect(buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    })).rejects.toThrow(
      /Supplier Bill UCL validation failed for invoice-invalid-currency:.*currency/i,
    );
  });

  it("excludes cross-organization Supplier Bill relationships under service-level reads", async () => {
    installFakeAdmin({
      supplier_invoices: [{
        id: "invoice-secure",
        organization_id: "org-1",
        supplier_id: "supplier-foreign",
        invoice_number: "SECURE-1",
        invoice_date: "2026-06-18",
        currency: "NZD",
        subtotal: 100,
        tax_total: 15,
        total: 115,
        status: "Needs Review",
        source: "manual",
        updated_at: "2026-06-21T09:00:00.000Z",
      }],
      supplier_invoice_lines: [{
        id: "line-secure",
        organization_id: "org-1",
        supplier_invoice_id: "invoice-secure",
        project_id: "project-foreign",
        description: "Authorized bill line",
        quantity: 1,
        unit_price: 100,
        line_total: 100,
        tax_amount: 15,
        sort_order: 1,
      }],
      supplier_invoice_documents: [{
        id: "document-foreign",
        organization_id: "org-foreign",
        supplier_invoice_id: "invoice-secure",
        file_name: "foreign.pdf",
        is_current: true,
      }],
      supplier_invoice_purchase_order_matches: [{
        id: "match-foreign",
        organization_id: "org-1",
        supplier_invoice_id: "invoice-secure",
        purchase_order_id: "po-foreign",
      }],
      supplier_invoice_line_allocations: [{
        id: "allocation-foreign",
        organization_id: "org-foreign",
        supplier_invoice_id: "invoice-secure",
        supplier_invoice_line_id: "line-secure",
        project_id: "project-foreign",
        purchase_order_id: "po-foreign",
      }],
      project_actual_cost_events: [{
        id: "event-foreign",
        organization_id: "org-foreign",
        supplier_invoice_id: "invoice-secure",
        event_type: "posting",
        event_status: "posted",
        total_amount: 999,
      }],
      organization_suppliers: [{
        id: "supplier-foreign",
        organization_id: "org-foreign",
        company_name: "Foreign Supplier",
      }],
      project_purchase_orders: [{
        id: "po-foreign",
        organization_id: "org-foreign",
        project_id: "project-foreign",
      }],
      organization_projects: [{
        id: "project-foreign",
        organization_id: "org-foreign",
        name: "Foreign Project",
      }],
      organization_accounting_documents: [{
        id: "accounting-foreign",
        organization_id: "org-foreign",
        local_document_type: "supplier_invoice",
        local_document_id: "invoice-secure",
        export_status: "exported",
      }],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    const record = result.records[0] as SupplierBillUclBusinessRecord;
    const payload = record.payload;
    expect(validateSupplierBillUclBusinessRecord(record).success).toBe(true);
    expect(record).toMatchObject({ supplierId: null, projectId: null });
    expect(payload.sourceEvidence.supplier.supplierId).toBeNull();
    expect(payload.sourceEvidence.billLines[0].projectId).toBeNull();
    expect(payload.sourceEvidence.poMatches).toEqual([]);
    expect(payload.sourceEvidence.allocationSummary.allocations).toEqual([]);
    expect(payload.sourceEvidence.attachmentSummary.references).toEqual([]);
    expect(payload.sourceEvidence.actualCostPostingSummary.postingEventCount).toBe(0);
    expect(payload.sourceEvidence.xeroSummary.accountingDocumentId).toBeNull();
    expect(payload.visibility.projectIds).toEqual([]);
  });

  it("enriches supplier invoice allocations into a dedicated trust-boundary packet across review, posting, dispute, correction, and reversal stages", async () => {
    installFakeAdmin({
      supplier_invoice_line_allocations: [
        {
          id: "allocation-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          allocated_amount: 1000,
          allocated_quantity: 20,
          matched_amount: 1000,
          allocation_group_id: "group-1",
          allocation_sequence: 1,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "resolved",
          review_reason: "matched_to_po",
          approval_status: "approved",
          approval_notes: "Approved for posting.",
          accepted_ai_suggestion: false,
          ai_construction_intelligence: { leaked: true },
          ai_reasoning_summary: "SHOULD NOT LEAK",
          ai_suggestion_metadata_json: { leaked: true },
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          organization_cost_code_id: "org-cost-code-1",
          accounting_mapping_id: "mapping-1",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          work_type: "wall linings",
          cost_type: "labour",
          internal_cost_code: "07.01.LAB",
          classification_status: "inherited",
          created_at: "2026-06-20T09:00:00.000Z",
          updated_at: "2026-06-20T09:00:00.000Z",
          reviewed_at: "2026-06-20T10:00:00.000Z",
          reviewed_by_user_id: "reviewer-1",
          approved_at: "2026-06-20T10:15:00.000Z",
          approved_by_user_id: "approver-1",
          edit_state: "locked_posted",
          supersedes_allocation_id: null,
        },
        {
          id: "allocation-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-2",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-2",
          project_id: "project-1",
          allocated_amount: 300,
          allocated_quantity: 3,
          matched_amount: 300,
          allocation_group_id: "group-2",
          allocation_sequence: 1,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "needs_accounting_mapping",
          review_reason: "missing_accounting_mapping",
          approval_status: "pending",
          approval_notes: "",
          accepted_ai_suggestion: false,
          cost_item_id: "cost-item-2",
          source_cost_item_id: "cost-item-2",
          organization_cost_code_id: null,
          accounting_mapping_id: null,
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          work_type: "wall linings",
          cost_type: "labour",
          internal_cost_code: "07.01.LAB",
          classification_status: "inherited",
          created_at: "2026-06-20T11:00:00.000Z",
          updated_at: "2026-06-20T11:00:00.000Z",
          reviewed_at: null,
          reviewed_by_user_id: null,
          approved_at: null,
          approved_by_user_id: null,
          edit_state: "editable",
          supersedes_allocation_id: null,
        },
        {
          id: "allocation-3",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-3",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-3",
          project_id: "project-1",
          allocated_amount: 80,
          allocated_quantity: 1,
          matched_amount: 80,
          allocation_group_id: "group-3",
          allocation_sequence: 1,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "disputed",
          review_reason: "qa_hold",
          approval_status: "disputed",
          approval_notes: "Disputed for QA",
          accepted_ai_suggestion: false,
          cost_item_id: "cost-item-3",
          source_cost_item_id: "cost-item-3",
          organization_cost_code_id: "org-cost-code-1",
          accounting_mapping_id: "mapping-1",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          work_type: "wall linings",
          cost_type: "labour",
          internal_cost_code: "07.01.LAB",
          classification_status: "inherited",
          created_at: "2026-06-21T09:00:00.000Z",
          updated_at: "2026-06-21T09:00:00.000Z",
          reviewed_at: "2026-06-21T10:00:00.000Z",
          reviewed_by_user_id: "reviewer-2",
          approved_at: "2026-06-21T10:00:00.000Z",
          approved_by_user_id: "reviewer-2",
          edit_state: "editable",
          supersedes_allocation_id: null,
        },
        {
          id: "allocation-4",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-4",
          purchase_order_id: "po-2",
          purchase_order_line_item_id: "po-line-4",
          project_id: "project-2",
          allocated_amount: 100,
          allocated_quantity: 1,
          matched_amount: 100,
          allocation_group_id: "group-4",
          allocation_sequence: 1,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "resolved",
          review_reason: "matched_to_po",
          approval_status: "approved",
          approval_notes: "Approved then reversed.",
          accepted_ai_suggestion: false,
          cost_item_id: "cost-item-4",
          source_cost_item_id: "cost-item-4",
          organization_cost_code_id: "org-cost-code-2",
          accounting_mapping_id: "mapping-2",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          work_type: "structural timber",
          cost_type: "materials",
          internal_cost_code: "05.04.MAT",
          classification_status: "inherited",
          created_at: "2026-06-21T12:00:00.000Z",
          updated_at: "2026-06-21T12:00:00.000Z",
          reviewed_at: "2026-06-21T12:10:00.000Z",
          reviewed_by_user_id: "reviewer-3",
          approved_at: "2026-06-21T12:15:00.000Z",
          approved_by_user_id: "approver-3",
          edit_state: "reversed",
          supersedes_allocation_id: null,
        },
        {
          id: "allocation-5",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-4",
          purchase_order_id: "po-2",
          purchase_order_line_item_id: "po-line-4",
          project_id: "project-2",
          allocated_amount: 100,
          allocated_quantity: 1,
          matched_amount: 100,
          allocation_group_id: "group-4",
          allocation_sequence: 2,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "resolved",
          review_reason: "correction_successor",
          approval_status: "pending",
          approval_notes: "",
          accepted_ai_suggestion: true,
          cost_item_id: "cost-item-4",
          source_cost_item_id: "cost-item-4",
          organization_cost_code_id: "org-cost-code-2",
          accounting_mapping_id: "mapping-2",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          work_type: "structural timber",
          cost_type: "materials",
          internal_cost_code: "05.04.MAT",
          classification_status: "inherited",
          created_at: "2026-06-21T13:00:00.000Z",
          updated_at: "2026-06-21T13:00:00.000Z",
          reviewed_at: null,
          reviewed_by_user_id: null,
          approved_at: null,
          approved_by_user_id: null,
          edit_state: "editable",
          supersedes_allocation_id: "allocation-4",
        },
      ],
      supplier_invoices: [
        {
          id: "invoice-1",
          organization_id: "org-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          invoice_number: "INV-ALLOC-1",
          invoice_date: "2026-06-18",
          due_date: "2026-07-18",
          status: "Needs Review",
          source: "upload",
          subtotal: 1480,
          tax_total: 222,
          total: 1702,
          notes: "Allocation test invoice.",
          created_by: "invoice-user-1",
          created_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-21T13:00:00.000Z",
        },
      ],
      supplier_invoice_lines: [
        {
          id: "line-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          project_id: "project-1",
          description: "Wall linings labour draw 1",
          quantity: 20,
          unit: "hour",
          unit_price: 50,
          line_total: 1000,
          tax_amount: 150,
          sort_order: 1,
          updated_at: "2026-06-20T09:00:00.000Z",
        },
        {
          id: "line-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          project_id: "project-1",
          description: "Wall linings labour draw 2",
          quantity: 3,
          unit: "hour",
          unit_price: 100,
          line_total: 300,
          tax_amount: 45,
          sort_order: 2,
          updated_at: "2026-06-20T11:00:00.000Z",
        },
        {
          id: "line-3",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          project_id: "project-1",
          description: "QA disputed labour line",
          quantity: 1,
          unit: "hour",
          unit_price: 80,
          line_total: 80,
          tax_amount: 12,
          sort_order: 3,
          updated_at: "2026-06-21T09:00:00.000Z",
        },
        {
          id: "line-4",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          project_id: "project-2",
          description: "Structural timber materials",
          quantity: 1,
          unit: "lot",
          unit_price: 100,
          line_total: 100,
          tax_amount: 15,
          sort_order: 4,
          updated_at: "2026-06-21T12:00:00.000Z",
        },
      ],
      supplier_invoice_documents: [
        {
          id: "document-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          document_type: "invoice",
          created_at: "2026-06-18T08:00:00.000Z",
        },
        {
          id: "document-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          document_type: "supporting_document",
          created_at: "2026-06-18T08:01:00.000Z",
        },
      ],
      supplier_invoice_purchase_order_matches: [
        {
          id: "match-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          purchase_order_id: "po-1",
          matched_amount: 1380,
          match_status: "accepted",
          approval_status: "approved",
          approval_notes: "Labour package confirmed.",
          approval_checks_json: { quantity: true, price: true },
          created_at: "2026-06-19T10:00:00.000Z",
          updated_at: "2026-06-19T10:00:00.000Z",
        },
        {
          id: "match-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          purchase_order_id: "po-2",
          matched_amount: 100,
          match_status: "adjusted",
          approval_status: "pending",
          approval_notes: "",
          approval_checks_json: { quantity: true },
          created_at: "2026-06-19T11:00:00.000Z",
          updated_at: "2026-06-19T11:00:00.000Z",
        },
      ],
      project_purchase_orders: [
        {
          id: "po-1",
          organization_id: "org-1",
          project_id: "project-1",
          purchase_order_number: "PO-ALLOC-1",
          purchase_order_title: "Wall linings labour",
          status: "Approved",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          issued_to_label: "Metro Building Supplies",
          supplier_name_snapshot: "Metro Building Supplies",
          updated_at: "2026-06-10T00:00:00.000Z",
        },
        {
          id: "po-2",
          organization_id: "org-1",
          project_id: "project-2",
          purchase_order_number: "PO-ALLOC-2",
          purchase_order_title: "Structural timber",
          status: "Approved",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          issued_to_label: "Metro Building Supplies",
          supplier_name_snapshot: "Metro Building Supplies",
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
      project_purchase_order_line_items: [
        {
          id: "po-line-1",
          organization_id: "org-1",
          purchase_order_id: "po-1",
          project_id: "project-1",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          description: "Wall linings labour draw",
          quantity: 20,
          unit: "hour",
          rate: 50,
          total: 1000,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
        {
          id: "po-line-2",
          organization_id: "org-1",
          purchase_order_id: "po-1",
          project_id: "project-1",
          cost_item_id: "cost-item-2",
          source_cost_item_id: "cost-item-2",
          description: "Wall linings labour draw 2",
          quantity: 3,
          unit: "hour",
          rate: 100,
          total: 300,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
        {
          id: "po-line-3",
          organization_id: "org-1",
          purchase_order_id: "po-1",
          project_id: "project-1",
          cost_item_id: "cost-item-3",
          source_cost_item_id: "cost-item-3",
          description: "QA labour",
          quantity: 1,
          unit: "hour",
          rate: 80,
          total: 80,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
        {
          id: "po-line-4",
          organization_id: "org-1",
          purchase_order_id: "po-2",
          project_id: "project-2",
          cost_item_id: "cost-item-4",
          source_cost_item_id: "cost-item-4",
          description: "Structural timber lot",
          quantity: 1,
          unit: "lot",
          rate: 100,
          total: 100,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "delivery",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "project-2",
          organization_id: "org-1",
          name: "Wellington Retail Upgrade",
          project_code: "WLG-004",
          stage: "delivery",
          client_id: "client-2",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          company_name: "Metro Property Group",
          name: "Metro Property Group",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "client-2",
          organization_id: "org-1",
          company_name: "Capital Retail",
          name: "Capital Retail",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_suppliers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org-1",
          company_name: "Metro Building Supplies",
          name: "Metro Building Supplies",
          legal_name: "Metro Building Supplies Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_actual_cost_events: [
        {
          id: "event-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          supplier_invoice_line_allocation_id: "allocation-1",
          source_invoice_allocation_id: "allocation-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          total_amount: 1150,
          event_type: "posting",
          event_status: "posted",
          created_at: "2026-06-20T14:00:00.000Z",
        },
        {
          id: "event-4",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-4",
          supplier_invoice_line_allocation_id: "allocation-4",
          source_invoice_allocation_id: "allocation-4",
          purchase_order_id: "po-2",
          purchase_order_line_item_id: "po-line-4",
          project_id: "project-2",
          total_amount: 115,
          event_type: "posting",
          event_status: "posted",
          created_at: "2026-06-21T12:30:00.000Z",
        },
        {
          id: "event-5",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-4",
          supplier_invoice_line_allocation_id: "allocation-4",
          source_invoice_allocation_id: "allocation-4",
          purchase_order_id: "po-2",
          purchase_order_line_item_id: "po-line-4",
          project_id: "project-2",
          total_amount: 115,
          event_type: "reversal",
          event_status: "reversed",
          created_at: "2026-06-21T12:45:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice_allocation",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(5);
    const recordsById = new Map(result.records.map((record) => [record.source.sourceId, record]));
    const allocation1 = recordsById.get("allocation-1");
    const allocation4 = recordsById.get("allocation-4");
    const allocation5 = recordsById.get("allocation-5");

    expect(allocation1?.source.table).toBe("supplier_invoice_line_allocations");
    expect(allocation1?.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect(allocation1?.clientId).toBe("client-1");
    expect(allocation1?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_code: 200,
      tradesstack_cost_code_label: "Labour",
      accounting_mapping_id: "mapping-1",
      organization_cost_code_id: "org-cost-code-1",
    });

    const payload = allocation1?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("ai_reasoning_summary");
    expect(JSON.stringify(payload)).not.toContain("ai_suggestion_metadata_json");
    expect(JSON.stringify(payload)).not.toContain("classification_confidence");
    expect(JSON.stringify(payload)).not.toContain("classification_source");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("internal_cost_code");

    expect(payload.sourceEvidence).toMatchObject({
      allocation: {
        allocationId: "allocation-1",
        supplierInvoiceId: "invoice-1",
        supplierInvoiceLineId: "line-1",
        supplier: {
          supplierId: "11111111-1111-4111-8111-111111111111",
          supplierName: "Metro Building Supplies",
        },
        project: {
          projectId: "project-1",
          projectName: "Auckland Office Fitout",
          projectCode: "AKL-001",
        },
        purchaseOrder: {
          purchaseOrderId: "po-1",
          purchaseOrderNumber: "PO-ALLOC-1",
          purchaseOrderTitle: "Wall linings labour",
        },
        purchaseOrderLine: {
          purchaseOrderLineItemId: "po-line-1",
          description: "Wall linings labour draw",
          unit: "hour",
        },
        commercialAmounts: {
          allocatedAmount: 1000,
          allocatedQuantity: 20,
          matchedAmount: 1000,
        },
        allocationStatus: "matched",
        reviewStatus: "resolved",
        approvalStatus: "approved",
        matchStatus: "accepted",
        allocationSource: "manual",
        acceptedAiSuggestion: false,
        matchedBasis: {
          basis: "matched_to_purchase_order_line",
          matchEvidence: "accepted",
        },
      },
      supplierInvoice: {
        invoiceId: "invoice-1",
        invoiceNumber: "INV-ALLOC-1",
        invoiceDate: "2026-06-18",
        status: "Needs Review",
      },
      invoiceLine: {
        invoiceLineId: "line-1",
        description: "Wall linings labour draw 1",
        quantity: 20,
        unit: "hour",
        unitPrice: 50,
        lineTotal: 1000,
      },
      purchaseOrderMatch: {
        matchId: "match-1",
        purchaseOrderId: "po-1",
        matchedAmount: 1380,
        matchStatus: "accepted",
        approvalStatus: "approved",
      },
      documentSummary: {
        documentCount: 2,
        documentTypes: ["invoice", "supporting_document"],
      },
      actualCostEventSummary: {
        postedEventCount: 1,
        postedEventIds: ["event-1"],
        postedTotalAmount: 1150,
        reversalEventCount: 0,
      },
    });
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("accounting_mapping_id");

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "posted",
      hasProject: true,
      hasPurchaseOrder: true,
      hasPurchaseOrderLine: true,
      hasCostItem: true,
      hasSourceCostItem: true,
      hasActualCostPosting: true,
      hasReversal: false,
      reviewCompleteness: {
        reviewStatus: "resolved",
        reviewed: true,
        blocked: false,
      },
      approvalCompleteness: {
        approvalStatus: "approved",
        approved: true,
        disputed: false,
        pending: false,
      },
      evidenceStrength: "strong",
    });

    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      supplierInvoiceLineId: "line-1",
      purchaseOrderId: "po-1",
      purchaseOrderLineItemId: "po-line-1",
      projectId: "project-1",
      projectName: "Auckland Office Fitout",
      clientId: "client-1",
      clientName: "Metro Property Group",
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "Metro Building Supplies",
      costItemId: "cost-item-1",
      sourceCostItemId: "cost-item-1",
      actualCostEventIds: ["event-1"],
      reviewedByUserId: "reviewer-1",
      approvedByUserId: "approver-1",
      sourceTable: "supplier_invoice_line_allocations",
    });

    expect((allocation4?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("reversed");
    expect((allocation4?.payload as Record<string, any>).sourceEvidence.actualCostEventSummary).toMatchObject({
      postedEventCount: 1,
      reversalEventCount: 1,
      reversalEventIds: ["event-5"],
    });
    expect((allocation4?.payload as Record<string, any>).sourceEvidence.correctionChainSummary).toMatchObject({
      editState: "reversed",
      supersedesAllocationId: null,
      successorAllocationIds: ["allocation-5"],
    });

    expect((allocation5?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("corrected");
    expect((allocation5?.payload as Record<string, any>).sourceEvidence.allocation.acceptedAiSuggestion).toBe(true);
    expect((allocation5?.payload as Record<string, any>).lineageContext).toMatchObject({
      supersedesAllocationId: "allocation-4",
      successorAllocationIds: [],
      projectId: "project-2",
      clientId: "client-2",
      supplierId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("enriches project actual cost events into a dedicated trust-boundary packet across posting, reversal, repost, manual adjustment, and incomplete-lineage stages", async () => {
    installFakeAdmin({
      project_actual_cost_events: [
        {
          id: "event-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          supplier_invoice_line_allocation_id: "allocation-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          work_type: "wall linings",
          cost_type: "labour",
          internal_cost_code: "07.01.LAB",
          organization_cost_code_id: "org-cost-code-1",
          amount: 1000,
          tax_amount: 150,
          total_amount: 1150,
          quantity: 20,
          event_date: "2026-06-18",
          event_status: "posted",
          posting_source: "supplier_invoice_allocation",
          source_invoice_line_id: "line-1",
          source_invoice_allocation_id: "allocation-1",
          source_type: "supplier_invoice",
          source_reference: "INV-ACT-1 line 1",
          created_by_user_id: "poster-1",
          created_at: "2026-06-20T14:00:00.000Z",
          updated_at: "2026-06-20T14:00:00.000Z",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
          event_type: "posting",
          reverses_event_id: null,
          correction_root_event_id: "event-1",
          reversal_reason: null,
          reversal_note: null,
          ai_construction_intelligence: { leaked: true },
        },
        {
          id: "event-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          supplier_invoice_line_allocation_id: "allocation-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          work_type: "wall linings",
          cost_type: "labour",
          internal_cost_code: "07.01.LAB",
          organization_cost_code_id: "org-cost-code-1",
          amount: -1000,
          tax_amount: -150,
          total_amount: -1150,
          quantity: -20,
          event_date: "2026-06-21",
          event_status: "posted",
          posting_source: "supplier_invoice_allocation",
          source_invoice_line_id: "line-1",
          source_invoice_allocation_id: "allocation-1",
          source_type: "supplier_invoice",
          source_reference: "INV-ACT-1 reversal",
          created_by_user_id: "poster-2",
          created_at: "2026-06-21T09:00:00.000Z",
          updated_at: "2026-06-21T09:00:00.000Z",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
          event_type: "reversal",
          reverses_event_id: "event-1",
          correction_root_event_id: "event-1",
          reversal_reason: "Posting discrepancy",
          reversal_note: "Reversed after QA review.",
        },
        {
          id: "event-3",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          supplier_invoice_line_allocation_id: "allocation-2",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          work_type: "wall linings",
          cost_type: "labour",
          internal_cost_code: "07.01.LAB",
          organization_cost_code_id: "org-cost-code-1",
          amount: 1000,
          tax_amount: 150,
          total_amount: 1150,
          quantity: 20,
          event_date: "2026-06-22",
          event_status: "posted",
          posting_source: "supplier_invoice_allocation",
          source_invoice_line_id: "line-1",
          source_invoice_allocation_id: "allocation-2",
          source_type: "supplier_invoice",
          source_reference: "INV-ACT-1 repost",
          created_by_user_id: "poster-3",
          created_at: "2026-06-22T10:00:00.000Z",
          updated_at: "2026-06-22T10:00:00.000Z",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
          event_type: "posting",
          reverses_event_id: null,
          correction_root_event_id: "event-1",
          reversal_reason: null,
          reversal_note: null,
        },
        {
          id: "event-4",
          organization_id: "org-1",
          supplier_invoice_id: null,
          supplier_invoice_line_id: null,
          supplier_invoice_line_allocation_id: null,
          purchase_order_id: null,
          purchase_order_line_item_id: null,
          project_id: "project-2",
          supplier_id: null,
          cost_item_id: null,
          source_cost_item_id: null,
          work_type: "overheads",
          cost_type: "overheads",
          internal_cost_code: "99.01.OH",
          organization_cost_code_id: "org-cost-code-9",
          amount: 50,
          tax_amount: 0,
          total_amount: 50,
          quantity: null,
          event_date: "2026-06-23",
          event_status: "posted",
          posting_source: "manual_adjustment",
          source_invoice_line_id: null,
          source_invoice_allocation_id: null,
          source_type: "manual_adjustment",
          source_reference: "Manual overhead adjustment",
          created_by_user_id: "poster-4",
          created_at: "2026-06-23T11:00:00.000Z",
          updated_at: "2026-06-23T11:00:00.000Z",
          tradesstack_cost_code: 800,
          tradesstack_cost_code_label: "Others",
          accounting_mapping_id: null,
          event_type: "posting",
          reverses_event_id: null,
          correction_root_event_id: "event-4",
          reversal_reason: null,
          reversal_note: null,
        },
        {
          id: "event-5",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-2",
          supplier_invoice_line_id: null,
          supplier_invoice_line_allocation_id: null,
          purchase_order_id: null,
          purchase_order_line_item_id: null,
          project_id: "project-2",
          supplier_id: null,
          cost_item_id: null,
          source_cost_item_id: null,
          work_type: "materials",
          cost_type: "materials",
          internal_cost_code: "05.04.MAT",
          organization_cost_code_id: "org-cost-code-2",
          amount: 100,
          tax_amount: 15,
          total_amount: 115,
          quantity: 1,
          event_date: "2026-06-24",
          event_status: "posted",
          posting_source: "supplier_invoice_allocation",
          source_invoice_line_id: null,
          source_invoice_allocation_id: null,
          source_type: "supplier_invoice",
          source_reference: "Incomplete lineage posting",
          created_by_user_id: "poster-5",
          created_at: "2026-06-24T12:00:00.000Z",
          updated_at: "2026-06-24T12:00:00.000Z",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-2",
          event_type: "posting",
          reverses_event_id: null,
          correction_root_event_id: "event-5",
          reversal_reason: null,
          reversal_note: null,
        },
      ],
      supplier_invoice_line_allocations: [
        {
          id: "allocation-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          allocated_amount: 1000,
          allocated_quantity: 20,
          matched_amount: 1000,
          allocation_group_id: "group-1",
          allocation_sequence: 1,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "resolved",
          review_reason: "matched_to_po",
          approval_status: "approved",
          approval_notes: "Approved for posting.",
          accepted_ai_suggestion: false,
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          organization_cost_code_id: "org-cost-code-1",
          accounting_mapping_id: "mapping-1",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          created_at: "2026-06-20T09:00:00.000Z",
          updated_at: "2026-06-20T09:00:00.000Z",
          reviewed_at: "2026-06-20T10:00:00.000Z",
          reviewed_by_user_id: "reviewer-1",
          approved_at: "2026-06-20T10:15:00.000Z",
          approved_by_user_id: "approver-1",
          edit_state: "reversed",
          supersedes_allocation_id: null,
        },
        {
          id: "allocation-2",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          supplier_invoice_line_id: "line-1",
          purchase_order_id: "po-1",
          purchase_order_line_item_id: "po-line-1",
          project_id: "project-1",
          allocated_amount: 1000,
          allocated_quantity: 20,
          matched_amount: 1000,
          allocation_group_id: "group-1",
          allocation_sequence: 2,
          allocation_source: "manual",
          allocation_status: "matched",
          match_status: "accepted",
          review_status: "resolved",
          review_reason: "correction_successor",
          approval_status: "approved",
          approval_notes: "Corrected and reposted.",
          accepted_ai_suggestion: true,
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          organization_cost_code_id: "org-cost-code-1",
          accounting_mapping_id: "mapping-1",
          tradesstack_cost_code: 200,
          tradesstack_cost_code_label: "Labour",
          created_at: "2026-06-22T08:00:00.000Z",
          updated_at: "2026-06-22T08:00:00.000Z",
          reviewed_at: "2026-06-22T08:30:00.000Z",
          reviewed_by_user_id: "reviewer-2",
          approved_at: "2026-06-22T09:00:00.000Z",
          approved_by_user_id: "approver-2",
          edit_state: "locked_posted",
          supersedes_allocation_id: "allocation-1",
        },
      ],
      supplier_invoices: [
        {
          id: "invoice-1",
          organization_id: "org-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          invoice_number: "INV-ACT-1",
          invoice_date: "2026-06-18",
          due_date: "2026-07-18",
          status: "Approved",
          source: "upload",
          subtotal: 1000,
          tax_total: 150,
          total: 1150,
          notes: "Primary invoice",
          created_by: "user-1",
          created_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-18T08:00:00.000Z",
        },
        {
          id: "invoice-2",
          organization_id: "org-1",
          supplier_id: "supplier-2",
          invoice_number: "INV-ACT-2",
          invoice_date: "2026-06-24",
          due_date: "2026-07-24",
          status: "Approved",
          source: "upload",
          subtotal: 100,
          tax_total: 15,
          total: 115,
          notes: "Incomplete lineage invoice",
          created_by: "user-2",
          created_at: "2026-06-24T08:00:00.000Z",
          updated_at: "2026-06-24T08:00:00.000Z",
        },
      ],
      supplier_invoice_lines: [
        {
          id: "line-1",
          organization_id: "org-1",
          supplier_invoice_id: "invoice-1",
          project_id: "project-1",
          description: "Wall linings labour draw",
          quantity: 20,
          unit_price: 50,
          line_total: 1000,
          tax_amount: 150,
          sort_order: 1,
          updated_at: "2026-06-18T08:00:00.000Z",
        },
      ],
      project_purchase_orders: [
        {
          id: "po-1",
          organization_id: "org-1",
          project_id: "project-1",
          purchase_order_number: "PO-ACT-1",
          purchase_order_title: "Wall linings labour",
          status: "Approved",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          issued_to_label: "Metro Building Supplies",
          supplier_name_snapshot: "Metro Building Supplies",
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
      project_purchase_order_line_items: [
        {
          id: "po-line-1",
          organization_id: "org-1",
          purchase_order_id: "po-1",
          project_id: "project-1",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          description: "Wall linings labour draw",
          quantity: 20,
          unit: "hour",
          rate: 50,
          total: 1000,
          updated_at: "2026-06-10T00:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "delivery",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "project-2",
          organization_id: "org-1",
          name: "Wellington Retail Upgrade",
          project_code: "WLG-004",
          stage: "delivery",
          client_id: "client-2",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          company_name: "Metro Property Group",
          name: "Metro Property Group",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "client-2",
          organization_id: "org-1",
          company_name: "Capital Retail",
          name: "Capital Retail",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_suppliers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org-1",
          company_name: "Metro Building Supplies",
          name: "Metro Building Supplies",
          legal_name: "Metro Building Supplies Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "supplier-2",
          organization_id: "org-1",
          company_name: "Bunnings",
          name: "Bunnings",
          legal_name: "Bunnings Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_actual_cost_event",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(5);
    const recordsById = new Map(result.records.map((record) => [record.source.sourceId, record]));
    const event1 = recordsById.get("event-1");
    const event2 = recordsById.get("event-2");
    const event3 = recordsById.get("event-3");
    const event4 = recordsById.get("event-4");
    const event5 = recordsById.get("event-5");

    expect(event1?.source.table).toBe("project_actual_cost_events");
    expect(event1?.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect(event1?.clientId).toBe("client-1");
    expect(event1?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_code: 200,
      tradesstack_cost_code_label: "Labour",
      accounting_mapping_id: "mapping-1",
      organization_cost_code_id: "org-cost-code-1",
    });

    const payload = event1?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("internal_cost_code");

    expect(payload.sourceEvidence).toMatchObject({
      actualCostEvent: {
        eventId: "event-1",
        eventDate: "2026-06-18",
        eventType: "posting",
        eventStatus: "posted",
        postingSource: "supplier_invoice_allocation",
        sourceType: "supplier_invoice",
        sourceReference: "INV-ACT-1 line 1",
        commercialAmounts: {
          amount: 1000,
          taxAmount: 150,
          totalAmount: 1150,
          quantity: 20,
        },
      },
      supplierInvoice: {
        invoiceId: "invoice-1",
        invoiceNumber: "INV-ACT-1",
        invoiceDate: "2026-06-18",
        status: "Approved",
      },
      supplierInvoiceLine: {
        invoiceLineId: "line-1",
        sourceInvoiceLineId: "line-1",
        description: "Wall linings labour draw",
        quantity: 20,
        unitPrice: 50,
        lineTotal: 1000,
      },
      sourceAllocation: {
        allocationId: "allocation-1",
        supplierInvoiceLineAllocationId: "allocation-1",
        allocationStatus: "matched",
        reviewStatus: "resolved",
        approvalStatus: "approved",
        allocatedAmount: 1000,
        allocatedQuantity: 20,
        acceptedAiSuggestion: false,
      },
      purchaseOrder: {
        purchaseOrderId: "po-1",
        purchaseOrderNumber: "PO-ACT-1",
        purchaseOrderTitle: "Wall linings labour",
        purchaseOrderStatus: "Approved",
      },
      purchaseOrderLine: {
        purchaseOrderLineItemId: "po-line-1",
        description: "Wall linings labour draw",
        unit: "hour",
        rate: 50,
      },
      project: {
        projectId: "project-1",
        projectName: "Auckland Office Fitout",
        projectCode: "AKL-001",
      },
      supplier: {
        supplierId: "11111111-1111-4111-8111-111111111111",
        supplierName: "Metro Building Supplies",
      },
      ledgerMeaning: {
        ledgerLabel: "posting",
      },
      matchedBasis: {
        basis: "matched_to_purchase_order_line",
      },
      evidenceStrengthSummary: {
        evidenceStrength: "strong",
        hasCoreLineage: true,
        hasCostLineage: true,
      },
    });
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("accounting_mapping_id");

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "posted",
      hasSupplierInvoice: true,
      hasInvoiceLine: true,
      hasAllocation: true,
      hasPurchaseOrder: true,
      hasPurchaseOrderLine: true,
      hasProject: true,
      hasSupplier: true,
      hasCostItem: true,
      hasSourceCostItem: true,
      isCorrectionChain: true,
      isManualAdjustment: false,
      evidenceStrength: "strong",
    });

    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      eventId: "event-1",
      supplierInvoiceId: "invoice-1",
      supplierInvoiceLineId: "line-1",
      supplierInvoiceLineAllocationId: "allocation-1",
      sourceInvoiceLineId: "line-1",
      sourceInvoiceAllocationId: "allocation-1",
      purchaseOrderId: "po-1",
      purchaseOrderLineItemId: "po-line-1",
      projectId: "project-1",
      projectName: "Auckland Office Fitout",
      clientId: "client-1",
      clientName: "Metro Property Group",
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "Metro Building Supplies",
      costItemId: "cost-item-1",
      sourceCostItemId: "cost-item-1",
      reversesEventId: null,
      correctionRootEventId: "event-1",
      createdByUserId: "poster-1",
      sourceTable: "project_actual_cost_events",
    });

    expect((event2?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("reversed");
    expect((event2?.payload as Record<string, any>).sourceEvidence.correctionOrReversalSummary).toMatchObject({
      reversesEventId: "event-1",
      reversalReason: "Posting discrepancy",
      reversalNotePresent: true,
    });

    expect((event3?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("reposted");
    expect((event3?.payload as Record<string, any>).sourceEvidence.sourceAllocation.acceptedAiSuggestion).toBe(true);

    expect((event4?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("manual_adjustment_posted");
    expect((event4?.payload as Record<string, any>).operationalContext.isManualAdjustment).toBe(true);

    expect((event5?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("incomplete_lineage");
    expect((event5?.payload as Record<string, any>).operationalContext.lineageCompleteness.hasAllocationLineage).toBe(false);
    expect((event5?.payload as Record<string, any>).lineageContext).toMatchObject({
      projectId: "project-2",
      clientId: "client-2",
      supplierId: "supplier-2",
    });
  });

  it("enriches project claims into trust-boundary packets focused on commercial recovery evidence", async () => {
    installFakeAdmin({
      project_claims: [
        {
          id: "claim-1",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-claim-1",
          claim_number: "CLM-001",
          claim_title: "June progress claim",
          claim_type: "Progress",
          status: "Submitted",
          claim_date: "2026-06-20",
          due_date: "2026-06-27",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          claim_amount: 5500,
          paid_amount: 0,
          linked_quote_value: 10000,
          linked_approved_variations: 2500,
          previous_claims_total: 2000,
          revised_contract_value: 12500,
          retention_method: "flat",
          retention_percent: 10,
          retention_withheld_amount: 550,
          retention_released_amount: 0,
          retention_held_to_date: 750,
          retention_released_to_date: 0,
          retention_balance: 750,
          net_claim_excl_gst: 4950,
          gst_amount: 742.5,
          total_payable: 5692.5,
          notes: "Submitted to client for June works.",
          updated_at: "2026-06-21T09:00:00.000Z",
          created_at: "2026-06-20T08:00:00.000Z",
          ai_construction_intelligence: { leaked: true },
        },
        {
          id: "claim-2",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-claim-2",
          claim_number: "CLM-002",
          claim_title: "Late July collection",
          claim_type: "Progress",
          status: "Overdue",
          claim_date: "2026-06-25",
          due_date: "2026-06-28",
          period_start: "2026-06-15",
          period_end: "2026-06-30",
          claim_amount: 1500,
          paid_amount: 0,
          linked_quote_value: 10000,
          linked_approved_variations: 2500,
          previous_claims_total: 7500,
          revised_contract_value: 12500,
          retention_method: "flat",
          retention_percent: 10,
          retention_withheld_amount: 150,
          retention_released_amount: 0,
          retention_held_to_date: 900,
          retention_released_to_date: 0,
          retention_balance: 900,
          net_claim_excl_gst: 1350,
          gst_amount: 202.5,
          total_payable: 1552.5,
          updated_at: "2026-06-29T09:00:00.000Z",
          created_at: "2026-06-25T08:00:00.000Z",
        },
        {
          id: "claim-3",
          organization_id: "org-1",
          project_id: "project-1",
          created_by: "user-claim-3",
          claim_number: "CLM-003",
          claim_title: "Retention release",
          claim_type: "Final",
          status: "Paid",
          claim_date: "2026-06-26",
          due_date: "2026-07-03",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          claim_amount: 500,
          paid_amount: 575,
          linked_quote_value: 10000,
          linked_approved_variations: 2500,
          previous_claims_total: 9500,
          revised_contract_value: 12500,
          retention_method: "flat",
          retention_percent: 10,
          retention_withheld_amount: 0,
          retention_released_amount: 500,
          retention_held_to_date: 900,
          retention_released_to_date: 500,
          retention_balance: 400,
          net_claim_excl_gst: 1000,
          gst_amount: 150,
          total_payable: 1150,
          updated_at: "2026-06-30T09:00:00.000Z",
          created_at: "2026-06-26T08:00:00.000Z",
        },
        {
          id: "claim-4",
          organization_id: "org-1",
          project_id: "project-2",
          created_by: "user-claim-4",
          claim_number: "CLM-004",
          claim_title: "Draft claim missing client lineage",
          claim_type: "Progress",
          status: "Draft",
          claim_date: "2026-06-22",
          due_date: "2026-06-29",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          claim_amount: 0,
          paid_amount: 0,
          linked_quote_value: 0,
          linked_approved_variations: 0,
          previous_claims_total: 0,
          revised_contract_value: 0,
          retention_method: "flat",
          retention_percent: 0,
          retention_withheld_amount: 0,
          retention_released_amount: 0,
          retention_held_to_date: 0,
          retention_released_to_date: 0,
          retention_balance: 0,
          net_claim_excl_gst: 0,
          gst_amount: 0,
          total_payable: 0,
          updated_at: "2026-06-22T09:00:00.000Z",
          created_at: "2026-06-22T08:00:00.000Z",
        },
      ],
      project_claim_line_items: [
        {
          id: "claim-line-1",
          organization_id: "org-1",
          project_id: "project-1",
          claim_id: "claim-1",
          source_kind: "Quote",
          source_document_id: "quote-1",
          source_line_item_id: "quote-line-1",
          source_number: "Q-001",
          source_title: "Base contract",
          description: "Partition framing and linings",
          quantity: 1,
          unit: "lot",
          rate: 4000,
          source_total: 4000,
          previously_claimed_amount: 500,
          claim_percent: 100,
          claim_amount: 3500,
          cumulative_claimed_amount: 4000,
          line_uid: "line-uid-1",
          cost_item_id: "claim-cost-item-1",
          source_cost_item_id: "quote-cost-item-1",
          sort_order: 1,
          raw_line_text: "OCR SHOULD NOT LEAK",
        },
        {
          id: "claim-line-2",
          organization_id: "org-1",
          project_id: "project-1",
          claim_id: "claim-1",
          source_kind: "Variation",
          source_document_id: "variation-1",
          source_line_item_id: "variation-line-1",
          source_number: "VAR-1",
          source_title: "Acoustic ceiling upgrade",
          description: "Acoustic ceiling tiles",
          quantity: 1,
          unit: "lot",
          rate: 2000,
          source_total: 2000,
          previously_claimed_amount: 0,
          claim_percent: 100,
          claim_amount: 2000,
          cumulative_claimed_amount: 2000,
          line_uid: "line-uid-2",
          cost_item_id: "claim-cost-item-2",
          source_cost_item_id: "variation-cost-item-1",
          sort_order: 2,
          work_type: "leak-me",
        },
        {
          id: "claim-line-3",
          organization_id: "org-1",
          project_id: "project-1",
          claim_id: "claim-2",
          source_kind: "Quote",
          source_document_id: "quote-1",
          source_line_item_id: "quote-line-2",
          source_number: "Q-001",
          source_title: "Base contract",
          description: "Painting package",
          quantity: 1,
          unit: "lot",
          rate: 3000,
          source_total: 3000,
          previously_claimed_amount: 1500,
          claim_percent: 100,
          claim_amount: 1500,
          cumulative_claimed_amount: 3000,
          line_uid: "line-uid-3",
          cost_item_id: "claim-cost-item-3",
          source_cost_item_id: "quote-cost-item-2",
          sort_order: 1,
        },
        {
          id: "claim-line-4",
          organization_id: "org-1",
          project_id: "project-1",
          claim_id: "claim-3",
          source_kind: "Variation",
          source_document_id: "variation-1",
          source_line_item_id: "variation-line-1",
          source_number: "VAR-1",
          source_title: "Acoustic ceiling upgrade",
          description: "Retention release against approved variation",
          quantity: 1,
          unit: "lot",
          rate: 500,
          source_total: 500,
          previously_claimed_amount: 0,
          claim_percent: 100,
          claim_amount: 500,
          cumulative_claimed_amount: 500,
          line_uid: "line-uid-4",
          cost_item_id: "claim-cost-item-4",
          source_cost_item_id: "variation-cost-item-1",
          sort_order: 1,
        },
        {
          id: "claim-line-5",
          organization_id: "org-1",
          project_id: "project-2",
          claim_id: "claim-4",
          source_kind: "Quote",
          source_document_id: "quote-2",
          source_line_item_id: "quote-line-3",
          source_number: "Q-002",
          source_title: "Draft quote",
          description: "Early draft works",
          quantity: 1,
          unit: "lot",
          rate: 0,
          source_total: 0,
          previously_claimed_amount: 0,
          claim_percent: 0,
          claim_amount: 0,
          cumulative_claimed_amount: 0,
          line_uid: "line-uid-5",
          cost_item_id: null,
          source_cost_item_id: null,
          sort_order: 1,
        },
      ],
      retention_claim_allocations: [
        {
          id: "retention-allocation-1",
          organization_id: "org-1",
          project_id: "project-1",
          originating_payment_claim_id: "claim-1",
          retention_claim_id: "retention-claim-1",
          allocation_sequence: 1,
          allocation_amount: 250,
          origin_claim_status_snapshot: "Submitted",
          updated_at: "2026-06-30T10:00:00.123456Z",
        },
      ],
      organization_accounting_documents: [
        {
          id: "accounting-document-1",
          organization_id: "org-1",
          project_claim_id: "claim-1",
          local_document_type: "project_claim",
          provider: "xero",
          export_status: "exported",
          external_document_number: "INV-PC-001",
          normalized_external_status: "AUTHORISED",
          amount_paid: 1000,
          amount_due: 4692.5,
          currency_code: "NZD",
          attachment_filename: "PC-001.pdf",
          attachment_status: "uploaded",
          attachment_uploaded_at: "2026-06-30T11:00:00.123456Z",
          last_status_synced_at: "2026-06-30T12:00:00.123456Z",
          updated_at: "2026-06-30T12:00:00.123456Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "delivery",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "project-2",
          organization_id: "org-1",
          name: "Unassigned Draft Project",
          project_code: "AKL-002",
          stage: "draft",
          client_id: null,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          company_name: "Metro Property Group",
          name: "Metro Property Group",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_quotes: [
        {
          id: "quote-1",
          organization_id: "org-1",
          project_id: "project-1",
          quote_number: "Q-001",
          quote_title: "Base contract",
          status: "Accepted",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "quote-2",
          organization_id: "org-1",
          project_id: "project-2",
          quote_number: "Q-002",
          quote_title: "Draft quote",
          status: "Draft",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_quote_line_items: [
        {
          id: "quote-line-1",
          organization_id: "org-1",
          quote_id: "quote-1",
          project_id: "project-1",
          section: "Labour",
          description: "Partition framing and linings",
          quantity: 1,
          unit: "lot",
          rate: 4000,
          total: 4000,
          is_optional: false,
          sort_order: 1,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "quote-line-2",
          organization_id: "org-1",
          quote_id: "quote-1",
          project_id: "project-1",
          section: "Labour",
          description: "Painting package",
          quantity: 1,
          unit: "lot",
          rate: 3000,
          total: 3000,
          is_optional: false,
          sort_order: 2,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "quote-line-3",
          organization_id: "org-1",
          quote_id: "quote-2",
          project_id: "project-2",
          section: "Labour",
          description: "Early draft works",
          quantity: 1,
          unit: "lot",
          rate: 0,
          total: 0,
          is_optional: false,
          sort_order: 1,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_variations: [
        {
          id: "variation-1",
          organization_id: "org-1",
          project_id: "project-1",
          variation_number: "VAR-1",
          variation_title: "Acoustic ceiling upgrade",
          status: "Approved",
          total_variation_price: 2500,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      project_variation_line_items: [
        {
          id: "variation-line-1",
          organization_id: "org-1",
          variation_id: "variation-1",
          project_id: "project-1",
          section: "Materials",
          description: "Acoustic ceiling tiles",
          quantity: 1,
          unit: "lot",
          rate: 2000,
          total: 2000,
          sort_order: 1,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      cost_items: [
        {
          id: "quote-cost-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_quote",
          source_document_id: "quote-1",
          source_line_id: "quote-line-1",
          source_line_table: "project_quote_line_items",
          tradesstack_cost_code: "200",
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
          work_type: "should-not-leak",
          cost_type: "should-not-leak",
        },
        {
          id: "quote-cost-item-2",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_quote",
          source_document_id: "quote-1",
          source_line_id: "quote-line-2",
          source_line_table: "project_quote_line_items",
          tradesstack_cost_code: "200",
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
        },
        {
          id: "variation-cost-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_variation",
          source_document_id: "variation-1",
          source_line_id: "variation-line-1",
          source_line_table: "project_variation_line_items",
          tradesstack_cost_code: "100",
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-2",
        },
        {
          id: "claim-cost-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_claim",
          source_document_id: "claim-1",
          source_line_id: "claim-line-1",
          source_line_table: "project_claim_line_items",
          tradesstack_cost_code: "200",
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
          ai_construction_intelligence: { should: "not-leak" },
          classification_confidence: 1,
        },
        {
          id: "claim-cost-item-2",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_claim",
          source_document_id: "claim-1",
          source_line_id: "claim-line-2",
          source_line_table: "project_claim_line_items",
          tradesstack_cost_code: "100",
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-2",
        },
        {
          id: "claim-cost-item-3",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_claim",
          source_document_id: "claim-2",
          source_line_id: "claim-line-3",
          source_line_table: "project_claim_line_items",
          tradesstack_cost_code: "200",
          tradesstack_cost_code_label: "Labour",
          accounting_mapping_id: "mapping-1",
        },
        {
          id: "claim-cost-item-4",
          organization_id: "org-1",
          project_id: "project-1",
          source_document_kind: "project_claim",
          source_document_id: "claim-3",
          source_line_id: "claim-line-4",
          source_line_table: "project_claim_line_items",
          tradesstack_cost_code: "700",
          tradesstack_cost_code_label: "Retention",
          accounting_mapping_id: "mapping-3",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_claim",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(4);
    const recordsById = new Map(result.records.map((record) => [record.source.sourceId, record]));
    const submitted = recordsById.get("claim-1");
    const overdue = recordsById.get("claim-2");
    const paid = recordsById.get("claim-3");
    const incomplete = recordsById.get("claim-4");

    expect(submitted?.source.table).toBe("project_claims");
    expect(submitted?.projectId).toBe("project-1");
    expect(submitted?.clientId).toBe("client-1");
    expect(submitted?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_code: ["200", "100"],
      tradesstack_cost_code_label: ["Labour", "Materials"],
      accounting_mapping_id: ["mapping-1", "mapping-2"],
    });

    const payload = submitted?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineage",
      "operationalContext",
      "provenance",
      "schemaVersion",
      "sourceEvidence",
      "visibility",
    ]);
    expect(payload.schemaVersion).toBe("payment_claim.v2");
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("internal_cost_code");
    expect(JSON.stringify(payload)).not.toContain("OCR SHOULD NOT LEAK");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("accounting_mapping_id");

    expect(payload.sourceEvidence.claim).toMatchObject({
      paymentClaimId: "claim-1",
      claimNumber: "CLM-001",
      title: "June progress claim",
      claimType: "Progress",
      canonicalStatus: "Submitted",
      claimDate: "2026-06-20",
      dueDate: "2026-06-27",
      claimPeriodStart: "2026-06-01",
      claimPeriodEnd: "2026-06-30",
    });
    expect(payload.sourceEvidence.project).toMatchObject({
      projectId: "project-1",
      name: "Auckland Office Fitout",
      code: "AKL-001",
    });
    expect(payload.sourceEvidence.client).toEqual({
      clientId: "client-1",
      displayName: "Metro Property Group",
    });
    expect(payload.sourceEvidence.financialSummary.stored).toMatchObject({
      originalContractAmount: 10000,
      approvedVariations: 2500,
      revisedContractAmount: 12500,
      previouslyClaimed: 2000,
      thisClaim: 5500,
      tax: 742.5,
      totalClaimed: 5692.5,
      paidAmount: 0,
    });
    expect(payload.sourceEvidence.financialSummary.calculated).toMatchObject({
      lineThisClaim: 5500,
      lineClaimedToDate: 6000,
    });
    expect(payload.sourceEvidence.retention).toMatchObject({
      basis: "flat",
      rate: 10,
      heldThisClaim: 550,
      releasedThisClaim: 0,
      heldToDate: 750,
      releasedToDate: 0,
      remainingRetention: 750,
    });
    const claimLines = payload.sourceEvidence.claimLines as Array<Record<string, unknown>>;
    expect(claimLines).toHaveLength(2);
    expect(claimLines[0]).toMatchObject({
      lineId: "claim-line-1",
      sourceKind: "Quote",
      sourceScheduleId: "quote-1",
      sourceScheduleLineId: "quote-line-1",
      description: "Partition framing and linings",
      quantity: 1,
      unit: "lot",
      rate: 4000,
      contractValue: 4000,
      previouslyClaimed: 500,
      claimPercentage: 100,
      thisClaim: 3500,
      claimedToDate: 4000,
    });
    expect(claimLines[1]).toMatchObject({
      lineId: "claim-line-2",
      sourceKind: "Variation",
      variationId: "variation-1",
      sourceScheduleLineId: "variation-line-1",
      thisClaim: 2000,
    });

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "submitted",
      evidenceStrength: "strong",
      truncated: false,
      totalCounts: {
        claimLines: 2,
        variations: 1,
      },
    });
    expect(payload.lineage).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      clientId: "client-1",
      paymentClaimId: "claim-1",
      sourceQuoteIds: ["quote-1"],
      sourceQuoteLineIds: ["quote-line-1"],
      variationIds: ["variation-1"],
      variationLineIds: ["variation-line-1"],
    });
    expect(payload.provenance.latestDependencyUpdatedAt).toBe(submitted?.updatedAt);
    expect(submitted?.updatedAt).toBe("2026-06-30T12:00:00.123456Z");
    expect(payload.sourceEvidence.retention.linkedRetentionClaims).toEqual([
      {
        retentionClaimId: "retention-claim-1",
        allocationId: "retention-allocation-1",
        allocationAmount: 250,
        statusSnapshot: "Submitted",
      },
    ]);
    expect(payload.sourceEvidence.accountingAndPayment.observations).toEqual([
      expect.objectContaining({
        accountingDocumentId: "accounting-document-1",
        provider: "xero",
        exportStatus: "exported",
        externalDocumentReference: "INV-PC-001",
        paidAmount: 1000,
        outstandingAmount: 4692.5,
      }),
    ]);
    expect(payload.sourceEvidence.supportingEvidence.documents).toEqual([
      expect.objectContaining({
        documentId: "accounting-document-1",
        fileName: "PC-001.pdf",
        attachmentStatus: "uploaded",
      }),
    ]);

    expect((overdue?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("submitted_overdue");
    expect((paid?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("paid");
    expect((paid?.payload as Record<string, any>).sourceEvidence.retention.releasedThisClaim).toBe(500);
    expect((incomplete?.payload as Record<string, any>).operationalContext.lifecycleStage).toBe("draft");
    expect((incomplete?.payload as Record<string, any>).operationalContext.evidenceStrength).toBe("weak");
  });

  it("enriches organization materials into a dedicated catalogue-only trust-boundary packet", async () => {
    installFakeAdmin({
      organization_materials: [
        {
          id: "material-1",
          organization_id: "org-1",
          created_by: "user-material-1",
          name: "13mm GIB Standard",
          normalized_name: "13mm gib standard",
          description: "Standard plasterboard sheet",
          default_unit: "sheet",
          category: "linings",
          metadata: {
            source: "should-not-leak",
            tags: ["internal"],
          },
          is_active: true,
          archived_at: null,
          archived_by: null,
          created_at: "2026-06-01T08:00:00.000Z",
          updated_at: "2026-06-19T09:30:00.000Z",
          work_type: "leak-me",
          cost_type: "leak-me",
          cost_code: "999",
          classification_confidence: 0.98,
          classification_source: "user_confirmed",
          needs_review: true,
          original_classification: { should: "not-leak" },
          final_classification: { should: "not-leak" },
          confirmed_by_user_id: "reviewer-1",
          confirmed_at: "2026-06-10T10:00:00.000Z",
          review_reason: "Imported supplier pricing suggested a different classification.",
          review_status: "needs_routing_review",
          organization_cost_code_id: "org-cost-code-1",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-1",
          ai_construction_intelligence: { leaked: true },
        },
      ],
      organization_material_supplier_products: [
        {
          id: "supplier-product-1",
          organization_id: "org-1",
          material_id: "material-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          supplier_sku: "GIB-13-STD",
          supplier_description: "13mm GIB standard sheet",
          supplier_unit: "sheet",
          is_preferred: true,
          is_active: true,
          archived_at: null,
          identity_status: "confirmed",
        },
        {
          id: "supplier-product-2",
          organization_id: "org-1",
          material_id: "material-1",
          supplier_id: "supplier-2",
          supplier_sku: "ALT-BOARD-13",
          supplier_description: "Alternative plasterboard sheet",
          supplier_unit: "sheet",
          is_preferred: false,
          is_active: true,
          archived_at: null,
          identity_status: "confirmed",
        },
      ],
      organization_material_supplier_prices: [
        {
          id: "price-1",
          organization_id: "org-1",
          material_id: "material-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          supplier_product_id: "supplier-product-1",
          import_batch_id: "batch-1",
          supplier_sku: "GIB-13-STD",
          supplier_description: "13mm GIB standard sheet",
          unit: "sheet",
          unit_cost: 24.5,
          currency: "NZD",
          is_preferred: true,
          is_current: true,
          source: "import",
          effective_from: "2026-06-18T00:00:00.000Z",
          effective_to: null,
          created_by: "user-material-1",
          created_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-21T08:00:00.000Z",
        },
        {
          id: "price-2",
          organization_id: "org-1",
          material_id: "material-1",
          supplier_id: "supplier-2",
          supplier_product_id: "supplier-product-2",
          import_batch_id: null,
          supplier_sku: "ALT-BOARD-13",
          supplier_description: "Alternative plasterboard sheet",
          unit: "sheet",
          unit_cost: 25.75,
          currency: "NZD",
          is_preferred: false,
          is_current: true,
          source: "manual",
          effective_from: "2026-06-15T00:00:00.000Z",
          effective_to: null,
          created_by: "user-material-2",
          created_at: "2026-06-15T08:00:00.000Z",
          updated_at: "2026-06-20T09:00:00.000Z",
        },
        {
          id: "price-3",
          organization_id: "org-1",
          material_id: "material-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          supplier_product_id: "supplier-product-1",
          import_batch_id: null,
          supplier_sku: "GIB-13-OLD",
          supplier_description: "Old supplier sheet price",
          unit: "sheet",
          unit_cost: 22,
          currency: "NZD",
          is_preferred: false,
          is_current: false,
          source: "manual",
          effective_from: "2026-05-01T00:00:00.000Z",
          effective_to: "2026-06-18T00:00:00.000Z",
          created_by: "user-material-1",
          created_at: "2026-05-01T08:00:00.000Z",
          updated_at: "2026-06-18T07:00:00.000Z",
        },
      ],
      organization_material_import_batches: [
        {
          id: "batch-1",
          organization_id: "org-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          uploaded_by: "uploader-1",
          file_name: "metro-june-catalogue.pdf",
          file_type: "application/pdf",
          storage_path: "org-1/material-imports/batch-1/catalogue.pdf",
          status: "approved",
          rows_extracted: 3,
          rows_approved: 2,
          rows_rejected: 1,
          extraction_method: "pdf_text",
          extraction_summary: {
            should: "not-leak",
          },
          created_at: "2026-06-18T07:00:00.000Z",
          updated_at: "2026-06-19T07:00:00.000Z",
        },
      ],
      organization_material_import_rows: [
        {
          id: "import-row-1",
          organization_id: "org-1",
          import_batch_id: "batch-1",
          row_index: 1,
          extracted_name: "13mm GIB Standard",
          extracted_description: "GIB standard 13mm",
          extracted_unit: "sheet",
          extracted_unit_cost: 24.5,
          extracted_currency: "NZD",
          supplier_description: "13mm GIB standard sheet",
          supplier_sku: "GIB-13-STD",
          matched_material_id: "material-1",
          action: "match_material",
          status: "approved",
          confidence: 0.92,
          reviewed_name: "13mm GIB Standard",
          reviewed_description: "Standard plasterboard sheet",
          reviewed_unit: "sheet",
          reviewed_unit_cost: 24.5,
          reviewed_currency: "NZD",
          reviewed_supplier_description: "13mm GIB standard sheet",
          reviewed_supplier_sku: "GIB-13-STD",
          reviewed_by: "reviewer-1",
          reviewed_at: "2026-06-19T09:00:00.000Z",
          source_payload: {
            raw: "should-not-leak",
          },
          classification_reason_summary: "Imported supplier pricing conflicted with the prior confirmed setup.",
          classified_work_type: "materials",
          classified_cost_type: "materials",
          classified_cost_code: "100",
          classified_confidence: 0.88,
          classified_source: "imported",
          classified_needs_review: true,
          classified_original_classification: { should: "not-leak" },
          classified_final_classification: { should: "not-leak" },
          classified_organization_cost_code_id: "org-cost-code-1",
          classified_tradesstack_cost_code: 100,
          classified_tradesstack_cost_code_label: "Materials",
          classified_accounting_mapping_id: "mapping-1",
          classified_review_status: "needs_routing_review",
          classified_review_reason: "Should not leak",
          classified_ai_construction_intelligence: { leaked: true },
          created_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-19T09:00:00.000Z",
        },
        {
          id: "import-row-2",
          organization_id: "org-1",
          import_batch_id: "batch-1",
          row_index: 2,
          extracted_name: "Unused row",
          extracted_description: "Rejected supplier row",
          extracted_unit: "sheet",
          extracted_unit_cost: 30,
          extracted_currency: "NZD",
          supplier_description: "Unused row",
          supplier_sku: "UNUSED",
          matched_material_id: "material-1",
          action: "skip",
          status: "rejected",
          confidence: 0.4,
          reviewed_name: null,
          reviewed_description: null,
          reviewed_unit: null,
          reviewed_unit_cost: null,
          reviewed_currency: null,
          reviewed_supplier_description: null,
          reviewed_supplier_sku: null,
          reviewed_by: "reviewer-2",
          reviewed_at: "2026-06-19T09:15:00.000Z",
          source_payload: {
            raw: "should-not-leak",
          },
          classification_reason_summary: "Rejected duplicate row.",
          created_at: "2026-06-18T08:30:00.000Z",
          updated_at: "2026-06-19T09:15:00.000Z",
        },
      ],
      organization_suppliers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org-1",
          company_name: "Metro Building Supplies",
          name: "Metro Building Supplies",
          legal_name: "Metro Building Supplies Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "supplier-2",
          organization_id: "org-1",
          company_name: "Alt Building Supplies",
          name: "Alt Building Supplies",
          legal_name: "Alt Building Supplies Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "organization_material",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const material = result.records[0];
    expect(material?.source.table).toBe("organization_materials");
    expect(material?.source.sourceId).toBe("material-1");
    expect(material?.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect(material?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_code: 100,
      tradesstack_cost_code_label: "Materials",
      accounting_mapping_id: "mapping-1",
      organization_cost_code_id: "org-cost-code-1",
    });
    expect(JSON.stringify(material?.routingContext)).not.toContain("work_type");
    expect(JSON.stringify(material?.routingContext)).not.toContain("cost_type");
    expect(JSON.stringify(material?.routingContext)).not.toContain("internal_cost_code");

    const payload = material?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("metadata");
    expect(JSON.stringify(payload)).not.toContain("source_payload");
    expect(JSON.stringify(payload)).not.toContain("material-imports");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("original_classification");
    expect(JSON.stringify(payload)).not.toContain("final_classification");
    expect(JSON.stringify(payload)).not.toContain("classification_confidence");
    expect(JSON.stringify(payload)).not.toContain("classification_source");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload)).not.toContain("cost_code");
    expect(JSON.stringify(payload)).not.toContain("classified_");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("accounting_mapping_id");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("projectId");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("usage");

    expect(payload.sourceEvidence.material).toMatchObject({
      materialId: "material-1",
      materialName: "13mm GIB Standard",
      description: "Standard plasterboard sheet",
      defaultUnit: "sheet",
      category: "linings",
      activeState: {
        isActive: true,
        archivedAt: null,
        archived: false,
      },
    });
    expect(payload.sourceEvidence.reviewState).toMatchObject({
      needsReview: true,
      confirmedState: "not_confirmed",
      confirmedAt: "2026-06-10T10:00:00.000Z",
      reopenedForReview: true,
      reviewReasonSummary: "Imported supplier pricing suggested a different classification.",
    });
    expect(payload.sourceEvidence.currentSupplierPrices).toEqual([
      expect.objectContaining({
        supplierPriceId: "price-1",
        supplierId: "11111111-1111-4111-8111-111111111111",
        supplierName: "Metro Building Supplies",
        supplierSku: "GIB-13-STD",
        unitPrice: 24.5,
        unit: "sheet",
        isCurrent: true,
        isPreferred: true,
        priceSource: "import",
        priceSourceType: "import",
      }),
      expect.objectContaining({
        supplierPriceId: "price-2",
        supplierId: "supplier-2",
        supplierName: "Alt Building Supplies",
        unitPrice: 25.75,
        isCurrent: true,
        isPreferred: false,
        priceSourceType: "manual",
      }),
    ]);
    expect(payload.sourceEvidence.historicalSupplierPriceSummary).toMatchObject({
      historicalSupplierPriceCount: 1,
      historicalSupplierPriceIds: ["price-3"],
      historicalMinUnitPrice: 22,
      historicalMaxUnitPrice: 22,
    });
    expect(payload.sourceEvidence.importLinkedEvidence).toMatchObject({
      approvedImportBatchSummary: [
        {
          importBatchId: "batch-1",
          supplierId: "11111111-1111-4111-8111-111111111111",
          supplierName: "Metro Building Supplies",
          status: "approved",
          extractionMethod: "pdf_text",
          rowsExtracted: 3,
          rowsApproved: 2,
          rowsRejected: 1,
        },
      ],
      matchedMaterialDecisionSummary: {
        matchedImportRowCount: 1,
        createdImportRowCount: 0,
        skippedImportRowCount: 1,
      },
      supplierCatalogueUpdateSummary: {
        approvedImportBatchCount: 1,
        reviewedImportRowCount: 2,
        approvedImportRowCount: 1,
        matchedImportRowCount: 1,
        createdImportRowCount: 0,
        skippedImportRowCount: 1,
      },
    });
    expect(payload.sourceEvidence.catalogueSummaries.preferredSupplierSummary).toMatchObject([
      {
        supplierPriceId: "price-1",
        supplierId: "11111111-1111-4111-8111-111111111111",
        supplierName: "Metro Building Supplies",
      },
    ]);

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "reopened_for_review",
      isActive: true,
      hasCurrentPrice: true,
      hasPreferredSupplier: true,
      supplierPriceCount: 3,
      currentSupplierPriceCount: 2,
      historicalSupplierPriceCount: 1,
      preferredSupplierCount: 1,
      importBackedPriceCount: 1,
      manualPriceCount: 2,
      needsReview: true,
      confirmed: false,
      reopenedForReview: true,
      supplierCoverage: {
        supplierCount: 2,
        currentSupplierCount: 2,
        preferredSupplierCount: 1,
      },
      reviewCompleteness: {
        needsReview: true,
        confirmed: false,
        reopenedForReview: true,
        hasReviewReason: true,
        confirmedAt: "2026-06-10T10:00:00.000Z",
      },
      evidenceStrength: "strong",
    });

    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      materialId: "material-1",
      supplierIds: ["11111111-1111-4111-8111-111111111111", "supplier-2"],
      supplierPriceIds: ["price-1", "price-2", "price-3"],
      currentSupplierPriceIds: ["price-1", "price-2"],
      historicalSupplierPriceIds: ["price-3"],
      preferredSupplierPriceIds: ["price-1"],
      importBatchIds: ["batch-1"],
      importRowIds: ["import-row-1", "import-row-2"],
      matchedImportRowIds: ["import-row-1"],
      createdByUserId: "user-material-1",
      confirmedByUserId: "reviewer-1",
      archivedByUserId: null,
      sourceTable: "organization_materials",
    });
  });

  it("enriches material import batches into a dedicated catalogue-evolution trust-boundary packet", async () => {
    installFakeAdmin({
      organization_material_import_batches: [
        {
          id: "batch-1",
          organization_id: "org-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          uploaded_by: "uploader-1",
          file_name: "metro-june-catalogue.pdf",
          file_type: "application/pdf",
          storage_path: "org-1/material-imports/batch-1/catalogue.pdf",
          status: "approved",
          rows_extracted: 3,
          rows_approved: 2,
          rows_rejected: 1,
          extraction_method: "pdf_text",
          extraction_summary: {
            should: "not-leak",
          },
          created_at: "2026-06-18T07:00:00.000Z",
          updated_at: "2026-06-19T07:00:00.000Z",
        },
      ],
      organization_material_import_rows: [
        {
          id: "import-row-1",
          organization_id: "org-1",
          import_batch_id: "batch-1",
          row_index: 1,
          extracted_name: "13mm GIB Standard",
          extracted_description: "GIB standard 13mm",
          extracted_unit: "sheet",
          extracted_unit_cost: 24.5,
          extracted_currency: "NZD",
          supplier_description: "13mm GIB standard sheet",
          supplier_sku: "GIB-13-STD",
          matched_material_id: "material-1",
          action: "match_material",
          status: "approved",
          confidence: 0.92,
          reviewed_name: "13mm GIB Standard",
          reviewed_description: "Standard plasterboard sheet",
          reviewed_unit: "sheet",
          reviewed_unit_cost: 24.5,
          reviewed_currency: "NZD",
          reviewed_supplier_description: "13mm GIB standard sheet",
          reviewed_supplier_sku: "GIB-13-STD",
          reviewed_by: "reviewer-1",
          reviewed_at: "2026-06-19T09:00:00.000Z",
          source_payload: {
            raw: "should-not-leak",
          },
          classification_reason_summary: "Imported supplier pricing conflicted with the prior confirmed setup.",
          classified_work_type: "materials",
          classified_cost_type: "materials",
          classified_cost_code: "100",
          classified_confidence: 0.88,
          classified_source: "imported",
          classified_needs_review: true,
          classified_original_classification: { should: "not-leak" },
          classified_final_classification: { should: "not-leak" },
          classified_organization_cost_code_id: "org-cost-code-1",
          classified_tradesstack_cost_code: 100,
          classified_tradesstack_cost_code_label: "Materials",
          classified_accounting_mapping_id: "mapping-1",
          classified_review_status: "needs_routing_review",
          classified_review_reason: "Should not leak",
          classified_ai_construction_intelligence: { leaked: true },
          created_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-19T09:00:00.000Z",
        },
        {
          id: "import-row-2",
          organization_id: "org-1",
          import_batch_id: "batch-1",
          row_index: 2,
          extracted_name: "90mm Stud",
          extracted_description: "90mm steel stud",
          extracted_unit: "length",
          extracted_unit_cost: 12.1,
          extracted_currency: "NZD",
          supplier_description: "90mm steel stud",
          supplier_sku: "STUD-90",
          matched_material_id: "material-2",
          action: "create_material",
          status: "approved",
          confidence: 0.86,
          reviewed_name: "90mm Steel Stud",
          reviewed_description: "Light gauge steel stud",
          reviewed_unit: "length",
          reviewed_unit_cost: 12.1,
          reviewed_currency: "NZD",
          reviewed_supplier_description: "90mm steel stud",
          reviewed_supplier_sku: "STUD-90",
          reviewed_by: "reviewer-1",
          reviewed_at: "2026-06-19T09:05:00.000Z",
          source_payload: {
            raw: "should-not-leak",
          },
          classification_reason_summary: "Created new material from reviewed supplier row.",
          classified_work_type: "materials",
          classified_cost_type: "materials",
          classified_cost_code: "100",
          classified_confidence: 0.81,
          classified_source: "imported",
          classified_ai_construction_intelligence: { leaked: true },
          created_at: "2026-06-18T08:05:00.000Z",
          updated_at: "2026-06-19T09:05:00.000Z",
        },
        {
          id: "import-row-3",
          organization_id: "org-1",
          import_batch_id: "batch-1",
          row_index: 3,
          extracted_name: "Unused row",
          extracted_description: "Rejected supplier row",
          extracted_unit: "sheet",
          extracted_unit_cost: 30,
          extracted_currency: "NZD",
          supplier_description: "Unused row",
          supplier_sku: "UNUSED",
          matched_material_id: null,
          action: "skip",
          status: "rejected",
          confidence: 0.4,
          reviewed_by: "reviewer-2",
          reviewed_at: "2026-06-19T09:15:00.000Z",
          source_payload: {
            raw: "should-not-leak",
          },
          classification_reason_summary: "Rejected duplicate row.",
          created_at: "2026-06-18T08:30:00.000Z",
          updated_at: "2026-06-19T09:15:00.000Z",
        },
      ],
      organization_suppliers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org-1",
          company_name: "Metro Building Supplies",
          name: "Metro Building Supplies",
          legal_name: "Metro Building Supplies Limited",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_materials: [
        {
          id: "material-1",
          organization_id: "org-1",
          created_by: "user-material-1",
          name: "13mm GIB Standard",
          description: "Standard plasterboard sheet",
          default_unit: "sheet",
          category: "linings",
          is_active: true,
          needs_review: true,
          review_reason: "Imported supplier pricing suggested a different classification.",
          organization_cost_code_id: "org-cost-code-1",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-1",
          created_at: "2026-06-01T08:00:00.000Z",
          updated_at: "2026-06-19T09:30:00.000Z",
        },
        {
          id: "material-2",
          organization_id: "org-1",
          created_by: "reviewer-1",
          name: "90mm Steel Stud",
          description: "Light gauge steel stud",
          default_unit: "length",
          category: "framing",
          is_active: true,
          needs_review: false,
          review_reason: null,
          organization_cost_code_id: "org-cost-code-2",
          tradesstack_cost_code: 100,
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-2",
          created_at: "2026-06-19T09:05:00.000Z",
          updated_at: "2026-06-19T09:05:00.000Z",
        },
      ],
      organization_material_supplier_prices: [
        {
          id: "price-1",
          organization_id: "org-1",
          material_id: "material-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          import_batch_id: "batch-1",
          supplier_sku: "GIB-13-STD",
          supplier_description: "13mm GIB standard sheet",
          unit: "sheet",
          unit_cost: 24.5,
          currency: "NZD",
          is_preferred: false,
          is_current: true,
          source: "import",
          effective_from: "2026-06-18T00:00:00.000Z",
          effective_to: null,
          created_by: "reviewer-1",
          created_at: "2026-06-19T09:00:00.000Z",
          updated_at: "2026-06-19T09:00:00.000Z",
        },
        {
          id: "price-2",
          organization_id: "org-1",
          material_id: "material-2",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          import_batch_id: "batch-1",
          supplier_sku: "STUD-90",
          supplier_description: "90mm steel stud",
          unit: "length",
          unit_cost: 12.1,
          currency: "NZD",
          is_preferred: false,
          is_current: true,
          source: "import",
          effective_from: "2026-06-19T09:05:00.000Z",
          effective_to: null,
          created_by: "reviewer-1",
          created_at: "2026-06-19T09:05:00.000Z",
          updated_at: "2026-06-19T09:05:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "material_import_batch",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(1);
    const batch = result.records[0];
    expect(batch?.source.table).toBe("organization_material_import_batches");
    expect(batch?.source.sourceId).toBe("batch-1");
    expect(batch?.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect(batch?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_codeValues: [100],
      tradesstack_cost_code_labelValues: ["Materials"],
      accounting_mapping_idValues: ["mapping-1", "mapping-2"],
      organization_cost_code_idValues: ["org-cost-code-1", "org-cost-code-2"],
    });
    expect(JSON.stringify(batch?.routingContext)).not.toContain("work_type");
    expect(JSON.stringify(batch?.routingContext)).not.toContain("cost_type");
    expect(JSON.stringify(batch?.routingContext)).not.toContain("internal_cost_code");

    const payload = batch?.payload as Record<string, any>;
    expect(Object.keys(payload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(payload)).not.toContain("\"row\"");
    expect(JSON.stringify(payload)).not.toContain("source_payload");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(JSON.stringify(payload)).not.toContain("material-imports");
    expect(JSON.stringify(payload)).not.toContain("classified_");
    expect(JSON.stringify(payload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(payload)).not.toContain("work_type");
    expect(JSON.stringify(payload)).not.toContain("cost_type");
    expect(JSON.stringify(payload.sourceEvidence)).not.toContain("tradesstack_cost_code");
    expect(JSON.stringify(payload)).not.toContain("projectId");
    expect(JSON.stringify(payload)).not.toContain("usageFrequency");

    expect(payload.sourceEvidence.batch).toMatchObject({
      batchId: "batch-1",
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "Metro Building Supplies",
      fileName: "metro-june-catalogue.pdf",
      fileType: "application/pdf",
      batchStatus: "approved",
      extractionMethod: "pdf_text",
      rowsExtracted: 3,
      rowsApproved: 2,
      rowsRejected: 1,
    });
    expect(payload.sourceEvidence.rowDecisionSummary).toMatchObject({
      reviewedRowCount: 3,
      approvedRowCount: 2,
      rejectedRowCount: 1,
      createMaterialRowCount: 1,
      matchMaterialRowCount: 1,
      skipRowCount: 1,
    });
    expect(payload.sourceEvidence.reviewedRowSummary).toEqual([
      expect.objectContaining({
        rowId: "import-row-1",
        action: "match_material",
        status: "approved",
        matchedMaterialId: "material-1",
      }),
      expect.objectContaining({
        rowId: "import-row-2",
        action: "create_material",
        status: "approved",
        matchedMaterialId: "material-2",
      }),
      expect.objectContaining({
        rowId: "import-row-3",
        action: "skip",
        status: "rejected",
      }),
    ]);
    expect(payload.sourceEvidence.matchedMaterialSummary).toEqual([
      expect.objectContaining({
        materialId: "material-1",
        materialName: "13mm GIB Standard",
        needsReview: true,
      }),
    ]);
    expect(payload.sourceEvidence.createdMaterialSummary).toEqual([
      expect.objectContaining({
        materialId: "material-2",
        materialName: "90mm Steel Stud",
      }),
    ]);
    expect(payload.sourceEvidence.supplierPriceUpdateSummary).toEqual([
      expect.objectContaining({
        supplierPriceId: "price-1",
        materialId: "material-1",
      }),
      expect.objectContaining({
        supplierPriceId: "price-2",
        materialId: "material-2",
      }),
    ]);
    expect(payload.sourceEvidence.conflictReopenedReviewSummary).toMatchObject({
      reopenedReviewCount: 1,
      reopenedMaterialIds: ["material-1"],
      reopenedReviewReasons: ["Imported supplier pricing suggested a different classification."],
    });

    expect(payload.operationalContext).toMatchObject({
      lifecycleStage: "approved",
      hasSupplier: true,
      hasExtractedRows: true,
      hasReviewedRows: true,
      hasApprovedRows: true,
      hasRejectedRows: true,
      hasPriceUpdates: true,
      hasMaterialMatches: true,
      hasCreatedMaterials: true,
      hasSkippedRows: true,
      hasConflicts: true,
      reviewCompleteness: {
        reviewedRowCount: 3,
        complete: true,
      },
      approvalCompleteness: {
        decidedRowCount: 3,
        complete: true,
      },
      extractionCompleteness: {
        rowCount: 3,
        expectedRowCount: 3,
        complete: true,
      },
      createVsMatchMix: {
        createMaterialRowCount: 1,
        matchMaterialRowCount: 1,
        skipRowCount: 1,
      },
      evidenceStrength: "strong",
    });

    expect(payload.lineageContext).toMatchObject({
      organizationId: "org-1",
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "Metro Building Supplies",
      batchId: "batch-1",
      rowIds: ["import-row-1", "import-row-2", "import-row-3"],
      reviewedRowIds: ["import-row-1", "import-row-2", "import-row-3"],
      approvedRowIds: ["import-row-1", "import-row-2"],
      rejectedRowIds: ["import-row-3"],
      matchedMaterialIds: ["material-1"],
      createdMaterialIds: ["material-2"],
      supplierPriceIds: ["price-1", "price-2"],
      uploadedByUserId: "uploader-1",
      reviewedByUserIds: ["reviewer-1", "reviewer-2"],
      sourceTable: "organization_material_import_batches",
    });
  });

  it("enriches project purchase orders with supplier, project, line item, cost item, and evidence-strength context", async () => {
    installFakeAdmin({
      project_purchase_orders: [
        {
          id: "50000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          created_by: "user-1",
          status: "Approved",
          origin: "manual",
          invoice_ready: false,
          supplier_name_snapshot: "Bunnings Snapshot",
          issued_to_label: "Bunnings Trade Counter",
          total_purchase_order_price: 1200,
          updated_at: "2026-06-12T09:00:00.000Z",
        },
        {
          id: "50000000-0000-0000-0000-000000000002",
          organization_id: "org-1",
          project_id: "project-2",
          supplier_id: null,
          created_by: "user-1",
          status: "Draft",
          origin: "manual",
          invoice_ready: false,
          total_purchase_order_price: 0,
          updated_at: "2026-06-13T09:00:00.000Z",
        },
        {
          id: "50000000-0000-0000-0000-000000000003",
          organization_id: "org-1",
          project_id: "project-1",
          supplier_id: "11111111-1111-4111-8111-111111111111",
          created_by: "user-1",
          status: "Approved",
          origin: "manual",
          invoice_ready: false,
          total_purchase_order_price: 400,
          updated_at: "2026-07-01T09:00:00.000Z",
        },
      ],
      project_purchase_order_line_items: [
        {
          id: "51000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          purchase_order_id: "50000000-0000-0000-0000-000000000001",
          description: "13mm GIB standard plasterboard",
          quantity: 20,
          unit: "sheet",
          rate: 60,
          total: 1200,
          section: "Materials",
          cost_item_id: "cost-item-1",
          source_cost_item_id: "cost-item-1",
          sort_order: 1,
          updated_at: "2026-06-12T09:00:00.000Z",
        },
      ],
      project_purchase_order_status_events: [
        {
          id: "52000000-0000-0000-0000-000000000001",
          organization_id: "org-1",
          purchase_order_id: "50000000-0000-0000-0000-000000000001",
          from_status: "Draft",
          to_status: "Approved",
          changed_by: "user-1",
          note: "Approved for procurement",
          changed_at: "2026-06-12T10:00:00.000Z",
        },
      ],
      organization_suppliers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org-1",
          name: "Bunnings Trade",
          company_name: "Bunnings Commercial Supplies",
          legal_name: "Bunnings NZ Limited",
          is_active: true,
          source: "manual",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          name: "Auckland Office Fitout",
          project_code: "AKL-001",
          stage: "delivery",
          client_id: "client-1",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "project-2",
          organization_id: "org-1",
          name: "Draft Project",
          stage: "draft",
          client_id: null,
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      organization_clients: [
        {
          id: "client-1",
          organization_id: "org-1",
          name: "Metro Property",
          company_name: "Metro Property Group",
          client_type: "commercial",
          client_status: "active",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      cost_items: [
        {
          id: "cost-item-1",
          organization_id: "org-1",
          project_id: "project-1",
          description: "Supply plasterboard sheets",
          work_type: "wall linings",
          cost_type: "materials",
          cost_code: "INT-100-GIB",
          trade_label: "Plasterboard",
          quantity: 20,
          unit: "sheet",
          unit_rate: 60,
          line_total: 1200,
          supplier_id: "11111111-1111-4111-8111-111111111111",
          supplier_name_snapshot: "Bunnings Snapshot",
          tradesstack_cost_code: "100",
          tradesstack_cost_code_label: "Materials",
          accounting_mapping_id: "mapping-1",
          classification_source: "locked",
          classification_confidence: 1,
          final_classification: "materials",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const { buildUniversalLearningContainerRecords } = await import("./builders");
    const result = await buildUniversalLearningContainerRecords({
      containerType: "project_purchase_order",
      context: {
        organizationId: "org-1",
        cursor: { updatedAt: null, id: null },
        reviewMonth: "2026-06",
      },
    });

    expect(result.records).toHaveLength(2);
    expect(result.reviewScopeContext.supplierCount).toBe(1);
    expect(result.reviewScopeContext.projectCount).toBe(2);
    expect(result.reviewScopeContext.clientCount).toBe(1);
    expect(result.reviewScopeContext.suppliers[0]).toMatchObject({
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "Bunnings Commercial Supplies",
      supplierDisplayName: "Bunnings Commercial Supplies",
      issuedToLabel: "Bunnings Trade Counter",
      supplierNameSnapshot: "Bunnings Snapshot",
    });

    const approved = result.records.find((record) => record.source.sourceId === "50000000-0000-0000-0000-000000000001");
    expect(approved?.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect(approved?.linkedContext.sourceIds.supplierId).toBe("11111111-1111-4111-8111-111111111111");
    expect(approved?.projectId).toBe("project-1");
    expect(approved?.clientId).toBe("client-1");
    expect(approved?.signalStrength).toBe("strong");

    const approvedPayload = approved?.payload as Record<string, unknown>;
    expect(Object.keys(approvedPayload).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(approvedPayload)).not.toContain("ai_construction_intelligence");
    expect(JSON.stringify(approvedPayload)).not.toContain("final_classification");
    expect(JSON.stringify(approvedPayload)).not.toContain("classification_confidence");
    expect(JSON.stringify(approvedPayload)).not.toContain("classification_source");
    expect(JSON.stringify(approvedPayload)).not.toContain("work_type");
    expect(JSON.stringify(approvedPayload)).not.toContain("cost_type");
    expect(JSON.stringify(approvedPayload)).not.toContain("cost_code");
    expect(JSON.stringify(approvedPayload)).not.toContain("trade_label");

    const sourceEvidence = approvedPayload.sourceEvidence as Record<string, unknown>;
    expect(sourceEvidence.purchaseOrder).toMatchObject({
      sourceId: "50000000-0000-0000-0000-000000000001",
      title: null,
      status: "Approved",
      origin: "manual",
      invoiceReady: false,
      supplier: {
        supplierId: "11111111-1111-4111-8111-111111111111",
        displayName: "Bunnings Commercial Supplies",
        issuedToLabel: "Bunnings Trade Counter",
        nameSnapshot: "Bunnings Snapshot",
      },
      commercialTotals: {
        total: 1200,
      },
    });
    const sourceEvidenceLineItems = sourceEvidence.lineItems as Array<Record<string, unknown>>;
    expect(sourceEvidenceLineItems[0]).toMatchObject({
      lineItemId: "51000000-0000-0000-0000-000000000001",
      description: "13mm GIB standard plasterboard",
      quantity: 20,
      unit: "sheet",
      rate: 60,
      total: 1200,
      section: "Materials",
    });
    const sourceEvidenceStatusHistory = sourceEvidence.statusHistory as Array<Record<string, unknown>>;
    expect(sourceEvidenceStatusHistory[0]).toMatchObject({
      fromStatus: "Draft",
      toStatus: "Approved",
      note: "Approved for procurement",
    });

    expect(approvedPayload.operationalContext).toMatchObject({
      lineCount: 1,
      hasSupplier: true,
      hasApprovedStatus: true,
      hasZeroValue: false,
      evidenceStrength: "strong",
      totalsBySection: {
        materialTotal: 1200,
      },
    });
    expect(approvedPayload.lineageContext).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      projectName: "Auckland Office Fitout",
      projectCode: "AKL-001",
      projectStatus: "delivery",
      clientId: "client-1",
      clientName: "Metro Property Group",
      supplierId: "11111111-1111-4111-8111-111111111111",
      actorUserId: "user-1",
      sourceTable: "project_purchase_orders",
      sourceModule: "purchase_orders",
      sourceWorkflow: "monthly_purchase_order_review",
    });
    const lineageContext = approvedPayload.lineageContext as Record<string, unknown>;
    const lineageLineLinks = lineageContext.lineLinks as Array<Record<string, unknown>>;
    expect(lineageLineLinks[0]).toMatchObject({
      lineItemId: "51000000-0000-0000-0000-000000000001",
      costItemId: "cost-item-1",
      sourceCostItemId: "cost-item-1",
      sourceKind: "cost_item",
      sourceId: "cost-item-1",
    });
    expect(approved?.routingContext).toMatchObject({
      readOnly: true,
      tradesstack_cost_codeValues: ["100"],
      tradesstack_cost_code_labelValues: ["Materials"],
      accounting_mapping_idValues: ["mapping-1"],
    });
    expect(JSON.stringify(approved?.routingContext)).not.toContain("work_type");
    expect(JSON.stringify(approved?.routingContext)).not.toContain("cost_type");
    expect(approved?.routingContext).not.toHaveProperty("cost_codeValues");

    const weakDraft = result.records.find((record) => record.source.sourceId === "50000000-0000-0000-0000-000000000002");
    expect(weakDraft?.signalStrength).toBe("weak");
    expect((weakDraft?.payload as Record<string, unknown>).operationalContext).toMatchObject({
      lineCount: 0,
      hasSupplier: false,
      hasZeroValue: true,
      evidenceStrength: "weak",
    });
  });
});
