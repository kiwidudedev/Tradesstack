import { describe, expect, it, vi } from "vitest";
import {
  createDefaultWorksheetData,
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  buildLegacyDefaultSheetId,
  buildOpportunityPricingWorkbook,
  buildOpportunityPricingWorkbookEditorRecord,
  buildOpportunityPricingWorkbookRegisterRows,
  createOpportunityPricingWorkbook,
  createOpportunityPricingWorkbookSheet,
  deleteOpportunityPricingWorkbookSheet,
  deriveOpportunityPricingWorkbookRegisterName,
  duplicateOpportunityPricingWorkbook,
  loadOpportunityPricingWorkbook,
  renameOpportunityPricingWorkbook,
  renameOpportunityPricingWorkbookSheet,
  saveOpportunityPricingWorkbookActiveSheet,
  setOpportunityPricingWorkbookLastActiveSheet,
} from "@/lib/opportunity-pricing-workbook";
import type { Database, Json } from "@/lib/supabase/types";

type WorkbookRow = Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"];
type WorkbookSheetRow = Database["public"]["Tables"]["opportunity_pricing_workbook_sheets"]["Row"];

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildWorkbookRow(overrides?: Partial<WorkbookRow>): WorkbookRow {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Legacy Worksheet",
    rowCount: 6,
    columnCount: 4,
  });

  return {
    id: "workbook-1",
    organization_id: "org-1",
    opportunity_id: "opp-1",
    last_active_sheet_id: null,
    name: "Legacy Worksheet",
    trade_package: "Ceilings",
    sort_order: 0,
    archived_at: null,
    worksheet_data: cloneJson(worksheet),
    pricing_summary: cloneJson(createDefaultWorksheetPricingSummary()),
    extracted_pricing_data: cloneJson(createDefaultWorksheetExtractedPricingData(worksheet.version)),
    version: worksheet.version,
    created_by: "user-1",
    updated_by: "user-1",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

function buildSheetRow(overrides?: Partial<WorkbookSheetRow>): WorkbookSheetRow {
  const worksheet = createDefaultWorksheetData({
    sheetName: "Default Sheet",
    rowCount: 6,
    columnCount: 4,
  });

  return {
    id: "sheet-1",
    workbook_id: "workbook-1",
    organization_id: "org-1",
    opportunity_id: "opp-1",
    name: "Default Sheet",
    sheet_order: 0,
    is_default: true,
    worksheet_data: cloneJson(worksheet),
    pricing_summary: cloneJson(createDefaultWorksheetPricingSummary()),
    extracted_pricing_data: cloneJson(createDefaultWorksheetExtractedPricingData(worksheet.version)),
    version: worksheet.version,
    created_by: "user-1",
    updated_by: "user-1",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

function buildRpcPayload(params?: {
  workbook?: Partial<WorkbookRow>;
  sheet?: Partial<WorkbookSheetRow> | null;
}) {
  const workbook = buildWorkbookRow(params?.workbook);
  const sheet =
    params?.sheet === null
      ? null
      : buildSheetRow({
          workbook_id: workbook.id,
          organization_id: workbook.organization_id,
          opportunity_id: workbook.opportunity_id,
          name: workbook.name,
          worksheet_data: cloneJson(workbook.worksheet_data),
          pricing_summary: cloneJson(workbook.pricing_summary),
          extracted_pricing_data: cloneJson(workbook.extracted_pricing_data),
          version: workbook.version,
          ...params?.sheet,
        });

  return {
    workbook,
    sheet,
  } satisfies {
    workbook: WorkbookRow;
    sheet: WorkbookSheetRow | null;
  };
}

function createWorkbookSupabaseRpcMock(options?: {
  saveResult?: Json | null;
  saveError?: { message: string } | null;
  renameResult?: Json | null;
  renameError?: { message: string } | null;
  duplicateResult?: Json | null;
  duplicateError?: { message: string } | null;
}) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "save_pricing_workbook_active_sheet") {
      return {
        data: options?.saveResult ?? buildRpcPayload(),
        error: options?.saveError ?? null,
      };
    }

    if (fn === "rename_opportunity_pricing_workbook") {
      return {
        data: options?.renameResult ?? buildRpcPayload(),
        error: options?.renameError ?? null,
      };
    }

    if (fn === "duplicate_opportunity_pricing_workbook") {
      return {
        data: options?.duplicateResult ?? buildRpcPayload(),
        error: options?.duplicateError ?? null,
      };
    }

    throw new Error(`Unexpected rpc ${fn} with ${JSON.stringify(args)}`);
  });

  return {
    supabase: {
      rpc,
      from: vi.fn(() => {
        throw new Error("from() should not be used for transactional workbook mutations");
      }),
    } as never,
    rpc,
  };
}

function createWorkbookTableSupabaseMock(options?: {
  workbookRow?: WorkbookRow | null;
  sheetRows?: WorkbookSheetRow[];
  updateError?: { message: string } | null;
}) {
  const workbookEq = vi.fn(function () {
    return this;
  });
  const workbookIs = vi.fn(function () {
    return this;
  });
  const workbookMaybeSingle = vi.fn(async () => ({
    data: options?.workbookRow ?? null,
    error: null,
  }));
  const workbookSingle = vi.fn(async () => ({
    data: options?.workbookRow ?? null,
    error: null,
  }));
  const workbookOrder = vi.fn(async () => ({
    data: [],
    error: null,
  }));

  const workbookSelectChain = {
    eq: workbookEq,
    is: workbookIs,
    maybeSingle: workbookMaybeSingle,
    single: workbookSingle,
    order: workbookOrder,
  };
  workbookEq.mockImplementation(() => workbookSelectChain);
  workbookIs.mockImplementation(() => workbookSelectChain);

  const updateEq = vi.fn(function () {
    return this;
  });
  const updateIs = vi.fn(async () => ({
    error: options?.updateError ?? null,
  }));
  const workbookUpdateChain = {
    eq: updateEq,
    is: updateIs,
  };
  updateEq.mockImplementation(() => workbookUpdateChain);

  const workbookTable = {
    select() {
      return workbookSelectChain;
    },
    update() {
      return workbookUpdateChain;
    },
  };

  const sheetEq = vi.fn(function () {
    return this;
  });
  const sheetFirstOrder = vi.fn(function () {
    return sheetSecondOrderChain;
  });
  const sheetSecondOrder = vi.fn(async () => ({
    data: options?.sheetRows ?? [],
    error: null,
  }));
  const sheetSecondOrderChain = {
    order: sheetSecondOrder,
  };
  const sheetSelectChain = {
    eq: sheetEq,
    order: sheetFirstOrder,
  };
  sheetEq.mockImplementation(() => sheetSelectChain);

  const sheetTable = {
    select() {
      return sheetSelectChain;
    },
  };

  return {
    supabase: {
      from(table: string) {
        if (table === "opportunity_pricing_worksheets") {
          return workbookTable;
        }

        if (table === "opportunity_pricing_workbook_sheets") {
          return sheetTable;
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as never,
    workbookEq,
    workbookIs,
    workbookMaybeSingle,
    workbookSingle,
    updateEq,
    updateIs,
    sheetEq,
    sheetFirstOrder,
    sheetSecondOrder,
  };
}

function createWorkbookSheetSupabaseMock(options?: {
  latestSheetOrder?: number;
  insertedSheet?: WorkbookSheetRow;
  selectedSheet?: WorkbookSheetRow;
  updatedSheet?: WorkbookSheetRow;
  deleteResult?: Json | null;
  renameResult?: Json | null;
}) {
  const sheetFilters: Array<[string, unknown]> = [];
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "save_pricing_workbook_active_sheet") {
      return {
        data: options?.renameResult ?? null,
        error: null,
      };
    }
    if (fn === "delete_opportunity_pricing_workbook_sheet") {
      return {
        data:
          options?.deleteResult ??
          ({
            deletedSheetId: "sheet-delete",
            nextSheetId: "sheet-next",
          } satisfies Record<string, string>),
        error: null,
      };
    }

    throw new Error(`Unexpected rpc ${fn}`);
  });

  const workbookSheetTable = {
    select() {
      return {
        eq(column: string, value: unknown) {
          sheetFilters.push([column, value]);
          return this;
        },
        order() {
          return this;
        },
        limit: async () => ({
          data:
            typeof options?.latestSheetOrder === "number"
              ? [{ sheet_order: options.latestSheetOrder }]
              : [],
          error: null,
        }),
        single: async () => ({
          data: options?.selectedSheet ?? buildSheetRow(),
          error: null,
        }),
      };
    },
    insert(payload: Record<string, unknown>) {
      return {
        select() {
          return {
            single: async () => ({
              data:
                options?.insertedSheet ??
                buildSheetRow({
                  id: "sheet-created-2",
                  workbook_id: String(payload.workbook_id ?? "workbook-1"),
                  organization_id: String(payload.organization_id ?? "org-1"),
                  opportunity_id: String(payload.opportunity_id ?? "opp-1"),
                  name: String(payload.name ?? "Page 2"),
                  sheet_order: Number(payload.sheet_order ?? 1),
                  is_default: Boolean(payload.is_default ?? false),
                  worksheet_data: cloneJson(payload.worksheet_data),
                }),
              error: null,
            }),
          };
        },
      };
    },
    update(payload: Record<string, unknown>) {
      return {
        eq(column: string, value: unknown) {
          sheetFilters.push([column, value]);
          return this;
        },
        select() {
          return {
            single: async () => ({
              data:
                options?.updatedSheet ??
                buildSheetRow({
                  id: "sheet-rename-2",
                  name: String(payload.name ?? "Renamed Page"),
                  worksheet_data: cloneJson(payload.worksheet_data),
                  is_default: false,
                }),
              error: null,
            }),
          };
        },
      };
    },
  };

  return {
    supabase: {
      rpc,
      from(table: string) {
        if (table === "opportunity_pricing_workbook_sheets") {
          return workbookSheetTable;
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as never,
    rpc,
    sheetFilters,
  };
}

describe("opportunity pricing workbook adapter", () => {
  it("loads a legacy parent-only worksheet as a single default workbook sheet", () => {
    const workbookRow = buildWorkbookRow();
    const workbook = buildOpportunityPricingWorkbook({
      workbook: workbookRow,
      sheets: [],
    });

    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook);

    expect(workbook.legacySheetFallback).toBe(true);
    expect(workbook.sheets).toHaveLength(1);
    expect(editorRecord.workbookId).toBe(workbookRow.id);
    expect(editorRecord.sheetId).toBe(buildLegacyDefaultSheetId(workbookRow.id));
    expect(editorRecord.workbookName).toBe(workbookRow.name);
    expect(editorRecord.sheetName).toBe(workbookRow.name);
    expect(editorRecord.worksheet.sheetName).toBe("Legacy Worksheet");
  });

  it("keeps editor and AI flows pinned to the active default sheet when child sheets exist", () => {
    const workbook = buildOpportunityPricingWorkbook({
      workbook: buildWorkbookRow({
        name: "Workbook Parent",
      }),
      sheets: [
        buildSheetRow({
          id: "sheet-default",
          name: "Default Sheet",
          is_default: true,
          sheet_order: 0,
          worksheet_data: cloneJson(
            createDefaultWorksheetData({
              sheetName: "Default Sheet",
              rowCount: 5,
              columnCount: 3,
            }),
          ),
        }),
        buildSheetRow({
          id: "sheet-secondary",
          name: "Secondary Sheet",
          is_default: false,
          sheet_order: 1,
          worksheet_data: cloneJson(
            createDefaultWorksheetData({
              sheetName: "Secondary Sheet",
              rowCount: 9,
              columnCount: 8,
            }),
          ),
        }),
      ],
    });

    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook);

    expect(editorRecord.sheetId).toBe("sheet-default");
    expect(editorRecord.sheetName).toBe("Default Sheet");
    expect(editorRecord.worksheet.sheetName).toBe("Default Sheet");
    expect(editorRecord.worksheet.columns[2]?.id).toBe("C");
  });

  it("reopens on the persisted last active page when no valid url sheet is provided", () => {
    const workbook = buildOpportunityPricingWorkbook({
      workbook: buildWorkbookRow({
        name: "Workbook Parent",
        last_active_sheet_id: "sheet-page-2",
      }),
      sheets: [
        buildSheetRow({
          id: "sheet-default",
          name: "Page 1",
          is_default: true,
          sheet_order: 0,
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 1" })),
        }),
        buildSheetRow({
          id: "sheet-page-2",
          name: "Page 2",
          is_default: false,
          sheet_order: 1,
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 2" })),
        }),
      ],
    });

    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook);

    expect(editorRecord.sheetId).toBe("sheet-page-2");
    expect(editorRecord.sheetName).toBe("Page 2");
  });

  it("prefers a valid url sheet over the persisted last active page", () => {
    const workbook = buildOpportunityPricingWorkbook({
      workbook: buildWorkbookRow({
        name: "Workbook Parent",
        last_active_sheet_id: "sheet-page-2",
      }),
      sheets: [
        buildSheetRow({
          id: "sheet-default",
          name: "Page 1",
          is_default: true,
          sheet_order: 0,
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 1" })),
        }),
        buildSheetRow({
          id: "sheet-page-2",
          name: "Page 2",
          is_default: false,
          sheet_order: 1,
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 2" })),
        }),
        buildSheetRow({
          id: "sheet-page-3",
          name: "Page 3",
          is_default: false,
          sheet_order: 2,
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 3" })),
        }),
      ],
    });

    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook, "sheet-page-3");

    expect(editorRecord.sheetId).toBe("sheet-page-3");
    expect(editorRecord.sheetName).toBe("Page 3");
  });

  it("builds one register row per parent workbook instead of listing internal pages separately", () => {
    const rows = buildOpportunityPricingWorkbookRegisterRows({
      workbooks: [
        buildWorkbookRow({
          id: "workbook-1",
          name: "Ceiling Grid Workbook",
        }),
      ],
      sheets: [
        buildSheetRow({
          id: "sheet-default",
          workbook_id: "workbook-1",
          name: "Page 1",
          is_default: true,
          sheet_order: 0,
        }),
        buildSheetRow({
          id: "sheet-page-2",
          workbook_id: "workbook-1",
          name: "Page 2",
          is_default: false,
          sheet_order: 1,
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("workbook-1");
    expect(rows[0]?.name).toBe("Ceiling Grid Workbook");
    expect(rows.some((row) => row.name === "Page 2")).toBe(false);
  });

  it("keeps variation-owned workbooks out of the opportunity register rows", () => {
    const rows = buildOpportunityPricingWorkbookRegisterRows({
      workbooks: [
        buildWorkbookRow({
          id: "workbook-opportunity",
          name: "Opportunity Workbook",
          variation_id: null,
        }),
        buildWorkbookRow({
          id: "workbook-variation",
          name: "Variation Workbook",
          project_id: "project-1",
          variation_id: "variation-1",
        }),
      ],
    });

    expect(rows.map((row) => row.id)).toEqual(["workbook-opportunity"]);
  });

  it("keeps Project and Quote continuations out of the Opportunity register", () => {
    const rows = buildOpportunityPricingWorkbookRegisterRows({
      workbooks: [
        buildWorkbookRow({ id: "source", project_id: null, quote_id: null }),
        buildWorkbookRow({ id: "project-working", project_id: "project-1", quote_id: "quote-1" }),
        buildWorkbookRow({ id: "project-workspace", project_id: "project-1", quote_id: null }),
      ],
    });

    expect(rows.map((row) => row.id)).toEqual(["source"]);
  });

  it("lists Project continuations in the Project register scope", () => {
    const rows = buildOpportunityPricingWorkbookRegisterRows({
      scope: "project",
      workbooks: [
        buildWorkbookRow({ id: "source", project_id: null, quote_id: null }),
        buildWorkbookRow({ id: "project-working", project_id: "project-1", quote_id: "quote-1" }),
        buildWorkbookRow({ id: "project-workspace", project_id: "project-1", quote_id: null }),
      ],
    });

    expect(rows.map((row) => row.id)).toEqual(["project-working", "project-workspace"]);
  });

  it("repairs a corrupted parent workbook register name when it only contains an internal page label", () => {
    const displayName = deriveOpportunityPricingWorkbookRegisterName({
      workbook: buildWorkbookRow({
        name: "Page 2",
        trade_package: "Ceilings",
        worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 2" })),
      }),
      sheets: [
        buildSheetRow({
          id: "sheet-default",
          name: "Page 1",
          is_default: true,
          sheet_order: 0,
        }),
        buildSheetRow({
          id: "sheet-page-2",
          name: "Page 2",
          is_default: false,
          sheet_order: 1,
        }),
      ],
    });

    expect(displayName).toBe("Ceilings");
  });

  it("falls back safely to the default page when the persisted last active page was deleted", () => {
    const workbook = buildOpportunityPricingWorkbook({
      workbook: buildWorkbookRow({
        name: "Workbook Parent",
        last_active_sheet_id: "sheet-page-2",
      }),
      sheets: [
        buildSheetRow({
          id: "sheet-default",
          name: "Page 1",
          is_default: true,
          sheet_order: 0,
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 1" })),
        }),
      ],
    });

    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook);

    expect(editorRecord.sheetId).toBe("sheet-default");
    expect(editorRecord.sheetName).toBe("Page 1");
  });

  it("updates the workbook last active page preference for the current sheet", async () => {
    const updateChain = {
      error: null,
      eq() {
        return this;
      },
      is: vi.fn(function () {
        return this;
      }),
    };
    const update = vi.fn(() => updateChain);
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe("opportunity_pricing_worksheets");
        return {
          update,
        };
      }),
    } as never;

    await setOpportunityPricingWorkbookLastActiveSheet({
      supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-page-2",
    });

    expect(update).toHaveBeenCalledWith({
      last_active_sheet_id: "sheet-page-2",
    });
    expect(updateChain.is).toHaveBeenCalledWith("variation_id", null);
  });

  it("loads a variation-owned workbook through the shared owner scope", async () => {
    const workbookRow = buildWorkbookRow({
      id: "workbook-variation",
      opportunity_id: "opp-variation",
      project_id: "project-variation",
      quote_id: null,
      variation_id: "variation-1",
      last_active_sheet_id: "sheet-variation",
    });
    const sheetRow = buildSheetRow({
      id: "sheet-variation",
      workbook_id: "workbook-variation",
      opportunity_id: "opp-variation",
      name: "Variation Sheet",
      worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Variation Sheet" })),
    });
    const supabaseMock = createWorkbookTableSupabaseMock({
      workbookRow,
      sheetRows: [sheetRow],
    });

    const workbook = await loadOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-variation",
      projectId: "project-variation",
      variationId: "variation-1",
      workbookId: "workbook-variation",
    });

    expect(workbook?.variationId).toBe("variation-1");
    expect(workbook?.projectId).toBe("project-variation");
    expect(workbook?.sheets[0]?.name).toBe("Variation Sheet");
    expect(supabaseMock.workbookEq).toHaveBeenCalledWith("variation_id", "variation-1");
    expect(supabaseMock.workbookEq).toHaveBeenCalledWith("project_id", "project-variation");
    expect(supabaseMock.workbookEq).toHaveBeenCalledWith("opportunity_id", "opp-variation");
  });

  it("does not scope opportunity-owned workbook loads by project id", async () => {
    const workbookRow = buildWorkbookRow({
      id: "workbook-opportunity",
      opportunity_id: "opp-1",
      project_id: null,
      quote_id: null,
      variation_id: null,
    });
    const sheetRow = buildSheetRow({
      id: "sheet-opportunity",
      workbook_id: "workbook-opportunity",
      opportunity_id: "opp-1",
      name: "Opportunity Sheet",
      worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Opportunity Sheet" })),
    });
    const supabaseMock = createWorkbookTableSupabaseMock({
      workbookRow,
      sheetRows: [sheetRow],
    });

    const workbook = await loadOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "workspace-bridge-project",
      workbookId: "workbook-opportunity",
    });

    expect(workbook?.projectId).toBeNull();
    expect(workbook?.sheets[0]?.name).toBe("Opportunity Sheet");
    expect(supabaseMock.workbookEq).not.toHaveBeenCalledWith("project_id", "workspace-bridge-project");
  });

  it("creates a workbook through one atomic rpc call", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "New Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const rpcPayload = buildRpcPayload({
      workbook: {
        id: "workbook-created",
        name: "New Worksheet",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "New Worksheet",
        }),
      },
      sheet: {
        id: "sheet-created",
        name: "New Worksheet",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "New Worksheet",
        }),
      },
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: rpcPayload as unknown as Json,
    });

    const workbook = await createOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      name: "New Worksheet",
      tradePackage: null,
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_workbook_id: null,
        p_sheet_id: null,
        p_name: "New Worksheet",
      }),
    );
    expect(workbook.id).toBe("workbook-created");
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0]?.isDefault).toBe(true);
  });

  it("does not issue split parent/child writes when atomic save fails", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Updated Worksheet",
      rowCount: 7,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveError: { message: "child sheet insert failed" },
    });

    await expect(
      saveOpportunityPricingWorkbookActiveSheet({
        supabase: supabaseMock.supabase,
        organizationId: "org-1",
        opportunityId: "opp-1",
        workbookId: "workbook-1",
        sheetId: buildLegacyDefaultSheetId("workbook-1"),
        name: "Updated Worksheet",
        tradePackage: "Ceilings",
        worksheet,
        pricingSummary: createDefaultWorksheetPricingSummary(),
        extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
        userId: "user-1",
      }),
    ).rejects.toThrow("child sheet insert failed");

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_workbook_id: "workbook-1",
        p_sheet_id: null,
        p_name: "Updated Worksheet",
      }),
    );
  });

  it("does not leave an orphan parent workbook path in the client when create fails", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Starter Worksheet",
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveError: { message: "default child sheet creation failed" },
    });

    await expect(
      createOpportunityPricingWorkbook({
        supabase: supabaseMock.supabase,
        organizationId: "org-1",
        opportunityId: "opp-1",
        name: "Starter Worksheet",
        tradePackage: null,
        worksheet,
        pricingSummary: createDefaultWorksheetPricingSummary(),
        extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
        userId: "user-1",
      }),
    ).rejects.toThrow("default child sheet creation failed");

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });

  it("round-trips a child-sheet-backed workbook save through the atomic rpc result", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Ceiling Grid",
      rowCount: 10,
      columnCount: 6,
    });
    const rpcPayload = buildRpcPayload({
      workbook: {
        id: "workbook-2",
        name: "Ceiling Grid",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Ceiling Grid",
        }),
      },
      sheet: {
        id: "sheet-2",
        workbook_id: "workbook-2",
        name: "Ceiling Grid",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Ceiling Grid",
        }),
      },
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: rpcPayload as unknown as Json,
    });

    const workbook = await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-2",
      sheetId: "sheet-2",
      name: "Ceiling Grid",
      tradePackage: "Ceilings",
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    const editorRecord = buildOpportunityPricingWorkbookEditorRecord(workbook);

    expect(editorRecord.workbookId).toBe("workbook-2");
    expect(editorRecord.sheetId).toBe("sheet-2");
    expect(editorRecord.worksheet.sheetName).toBe("Ceiling Grid");
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });

  it("passes a stable save request id through the atomic save rpc", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Server Saved Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock();

    await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      name: "Server Saved Worksheet",
      tradePackage: "Ceilings",
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      saveRequestId: "save-request-123",
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_workbook_id: "workbook-1",
        p_sheet_id: "sheet-1",
        p_save_request_id: "save-request-123",
      }),
    );
  });

  it("rounds pricing summary totals before persisting workbook saves", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Rounded Summary Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock();

    await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      name: "Rounded Summary Worksheet",
      tradePackage: "Ceilings",
      worksheet,
      pricingSummary: {
        version: 1,
        currency: "NZD",
        subtotal: 30.700000000000003,
        margin: 4.610000000000001,
        gst: 5.296500000000001,
        grandTotal: 40.606500000000006,
        lastCalculatedAt: "2026-06-13T00:00:00.000Z",
      },
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_pricing_summary: {
          version: 1,
          currency: "NZD",
          subtotal: 30.7,
          margin: 4.61,
          gst: 5.3,
          grandTotal: 40.61,
          lastCalculatedAt: "2026-06-13T00:00:00.000Z",
        },
      }),
    );
  });

  it("keeps parent legacy workbook fields separate when saving a non-default page", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Page 2",
      rowCount: 10,
      columnCount: 6,
    });
    const rpcPayload = {
      workbook: buildWorkbookRow({
        id: "workbook-2",
        name: "Page 1",
        worksheet_data: cloneJson(
          createDefaultWorksheetData({
            sheetName: "Page 1",
            rowCount: 8,
            columnCount: 5,
          }),
        ),
      }),
      sheet: buildSheetRow({
        id: "sheet-2",
        workbook_id: "workbook-2",
        is_default: false,
        sheet_order: 1,
        name: "Page 2",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Page 2",
        }),
      }),
    };
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: rpcPayload as unknown as Json,
    });

    const workbook = await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-2",
      sheetId: "sheet-2",
      name: "Page 2",
      tradePackage: "Ceilings",
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(workbook.name).toBe("Page 1");
    expect(workbook.sheets[0]?.id).toBe("sheet-2");
    expect(workbook.sheets[0]?.name).toBe("Page 2");
  });

  it("rename syncs parent name, child name, and worksheet_data.sheetName", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Renamed Worksheet",
      rowCount: 6,
      columnCount: 4,
    });
    const rpcPayload = buildRpcPayload({
      workbook: {
        id: "workbook-rename",
        name: "Renamed Worksheet",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Renamed Worksheet",
        }),
      },
      sheet: {
        id: "sheet-rename",
        workbook_id: "workbook-rename",
        name: "Renamed Worksheet",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Renamed Worksheet",
        }),
      },
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      renameResult: rpcPayload as unknown as Json,
    });

    const workbook = await renameOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-rename",
      nextName: "Renamed Worksheet",
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "rename_opportunity_pricing_workbook",
      expect.objectContaining({
        p_workbook_id: "workbook-rename",
        p_next_name: "Renamed Worksheet",
      }),
    );
    expect(workbook.name).toBe("Renamed Worksheet");
    expect(workbook.sheets[0]?.name).toBe("Renamed Worksheet");
    expect(workbook.sheets[0]?.worksheet.sheetName).toBe("Renamed Worksheet");
  });

  it("duplicate creates one valid workbook with one default child sheet", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Source Worksheet Copy",
      rowCount: 6,
      columnCount: 4,
    });
    const rpcPayload = buildRpcPayload({
      workbook: {
        id: "workbook-duplicate",
        name: "Source Worksheet Copy",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Source Worksheet Copy",
        }),
      },
      sheet: {
        id: "sheet-duplicate",
        workbook_id: "workbook-duplicate",
        name: "Source Worksheet Copy",
        is_default: true,
        sheet_order: 0,
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Source Worksheet Copy",
        }),
      },
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      duplicateResult: rpcPayload as unknown as Json,
    });

    const workbook = await duplicateOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-source",
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "duplicate_opportunity_pricing_workbook",
      expect.objectContaining({
        p_workbook_id: "workbook-source",
      }),
    );
    expect(workbook.id).toBe("workbook-duplicate");
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0]?.isDefault).toBe(true);
    expect(workbook.sheets[0]?.name).toBe("Source Worksheet Copy");
  });

  it("duplicates every child sheet returned by the workbook duplicate rpc", async () => {
    const duplicateSheets = [
      buildSheetRow({
        id: "sheet-copy-1",
        workbook_id: "workbook-duplicate-3",
        name: "Page 1",
        is_default: true,
        sheet_order: 0,
        worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 1" })),
      }),
      buildSheetRow({
        id: "sheet-copy-2",
        workbook_id: "workbook-duplicate-3",
        name: "Page 2",
        is_default: false,
        sheet_order: 1,
        worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 2" })),
      }),
      buildSheetRow({
        id: "sheet-copy-3",
        workbook_id: "workbook-duplicate-3",
        name: "Page 3",
        is_default: false,
        sheet_order: 2,
        worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 3" })),
      }),
    ];
    const supabaseMock = createWorkbookSupabaseRpcMock({
      duplicateResult: {
        workbook: buildWorkbookRow({
          id: "workbook-duplicate-3",
          name: "Workbook Copy",
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Page 1" })),
        }),
        sheets: duplicateSheets,
      } as unknown as Json,
    });

    const workbook = await duplicateOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-source",
      userId: "user-1",
    });

    expect(workbook.name).toBe("Workbook Copy");
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(["sheet-copy-1", "sheet-copy-2", "sheet-copy-3"]);
    expect(workbook.sheets[0]?.isDefault).toBe(true);
  });

  it("preserves the autosave dual-write path through the same atomic save helper", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Autosave Worksheet",
      rowCount: 9,
      columnCount: 5,
    });
    const rpcPayload = buildRpcPayload({
      workbook: {
        id: "workbook-autosave",
        name: "Autosave Worksheet",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Autosave Worksheet",
        }),
      },
      sheet: {
        id: "sheet-autosave",
        workbook_id: "workbook-autosave",
        name: "Autosave Worksheet",
        worksheet_data: cloneJson({
          ...worksheet,
          sheetName: "Autosave Worksheet",
        }),
      },
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: rpcPayload as unknown as Json,
    });

    await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-autosave",
      sheetId: "sheet-autosave",
      name: "Autosave Worksheet",
      tradePackage: null,
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_workbook_id: "workbook-autosave",
        p_sheet_id: "sheet-autosave",
      }),
    );
  });

  it("creates a variation-owned workbook through the shared atomic save rpc", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Variation Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: buildRpcPayload({
        workbook: {
          id: "workbook-variation",
          opportunity_id: "opp-variation",
          project_id: "project-variation",
          quote_id: null,
          variation_id: "variation-1",
          name: "Variation Worksheet",
        },
        sheet: {
          id: "sheet-variation",
          workbook_id: "workbook-variation",
          opportunity_id: "opp-variation",
          name: "Variation Worksheet",
        },
      }) as unknown as Json,
    });

    const workbook = await createOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-variation",
      projectId: "project-variation",
      variationId: "variation-1",
      name: "Variation Worksheet",
      tradePackage: null,
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(workbook.variationId).toBe("variation-1");
    expect(workbook.projectId).toBe("project-variation");
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_opportunity_id: "opp-variation",
        p_project_id: "project-variation",
        p_quote_id: null,
        p_variation_id: "variation-1",
      }),
    );
  });

  it("creates an opportunity-owned workbook without sending project scope into the rpc", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Opportunity Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: buildRpcPayload({
        workbook: {
          id: "workbook-opportunity",
          opportunity_id: "opp-1",
          project_id: null,
          quote_id: null,
          variation_id: null,
          name: "Opportunity Worksheet",
        },
        sheet: {
          id: "sheet-opportunity",
          workbook_id: "workbook-opportunity",
          opportunity_id: "opp-1",
          name: "Opportunity Worksheet",
        },
      }) as unknown as Json,
    });

    await createOpportunityPricingWorkbook({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "workspace-bridge-project",
      name: "Opportunity Worksheet",
      tradePackage: null,
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_opportunity_id: "opp-1",
        p_project_id: null,
        p_quote_id: null,
        p_variation_id: null,
      }),
    );
  });

  it("saves an opportunity-owned workbook without sending workspace bridge project scope", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Opportunity Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: buildRpcPayload({
        workbook: {
          id: "workbook-opportunity",
          opportunity_id: "opp-1",
          project_id: null,
          quote_id: null,
          variation_id: null,
          name: "Opportunity Worksheet",
        },
        sheet: {
          id: "sheet-opportunity",
          workbook_id: "workbook-opportunity",
          opportunity_id: "opp-1",
          name: "Opportunity Worksheet",
        },
      }) as unknown as Json,
    });

    await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "workspace-bridge-project",
      workbookId: "workbook-opportunity",
      sheetId: "sheet-opportunity",
      name: "Opportunity Worksheet",
      tradePackage: null,
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_workbook_id: "workbook-opportunity",
        p_sheet_id: "sheet-opportunity",
        p_project_id: null,
        p_variation_id: null,
      }),
    );
  });

  it("saves a variation-owned workbook through the shared owner scope", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Variation Worksheet",
      rowCount: 8,
      columnCount: 5,
    });
    const supabaseMock = createWorkbookSupabaseRpcMock({
      saveResult: buildRpcPayload({
        workbook: {
          id: "workbook-variation",
          opportunity_id: "opp-variation",
          project_id: "project-variation",
          quote_id: null,
          variation_id: "variation-1",
          name: "Variation Worksheet",
        },
        sheet: {
          id: "sheet-variation",
          workbook_id: "workbook-variation",
          opportunity_id: "opp-variation",
          name: "Variation Worksheet",
        },
      }) as unknown as Json,
    });

    const workbook = await saveOpportunityPricingWorkbookActiveSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-variation",
      projectId: "project-variation",
      variationId: "variation-1",
      workbookId: "workbook-variation",
      sheetId: "sheet-variation",
      name: "Variation Worksheet",
      tradePackage: null,
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
      userId: "user-1",
    });

    expect(workbook.variationId).toBe("variation-1");
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_workbook_id: "workbook-variation",
        p_sheet_id: "sheet-variation",
        p_project_id: "project-variation",
        p_variation_id: "variation-1",
      }),
    );
  });

  it("rejects variation workbook mutations when originating opportunity lineage is missing", async () => {
    await expect(
      createOpportunityPricingWorkbook({
        supabase: createWorkbookSupabaseRpcMock().supabase,
        organizationId: "org-1",
        opportunityId: null,
        projectId: "project-variation",
        variationId: "variation-1",
        name: "Variation Worksheet",
        tradePackage: null,
        worksheet: createDefaultWorksheetData(),
        pricingSummary: createDefaultWorksheetPricingSummary(),
        extractedPricingData: createDefaultWorksheetExtractedPricingData(1),
        userId: "user-1",
      }),
    ).rejects.toThrow("Variation pricing worksheets require originating opportunity lineage.");
  });

  it("rounds persisted pricing summary totals when hydrating workbook sheets", () => {
    const workbook = buildOpportunityPricingWorkbook({
      workbook: buildWorkbookRow({
        pricing_summary: {
          version: 1,
          currency: "NZD",
          subtotal: 30.700000000000003,
          margin: 4.610000000000001,
          gst: 5.296500000000001,
          grandTotal: 40.606500000000006,
          lastCalculatedAt: "2026-06-13T00:00:00.000Z",
        } as unknown as Json,
      }),
      sheets: [
        buildSheetRow({
          pricing_summary: {
            version: 1,
            currency: "NZD",
            subtotal: 30.700000000000003,
            margin: 4.610000000000001,
            gst: 5.296500000000001,
            grandTotal: 40.606500000000006,
            lastCalculatedAt: "2026-06-13T00:00:00.000Z",
          } as unknown as Json,
        }),
      ],
    });

    expect(workbook.sheets[0]?.pricingSummary).toEqual({
      version: 1,
      currency: "NZD",
      subtotal: 30.7,
      margin: 4.61,
      gst: 5.3,
      grandTotal: 40.61,
      lastCalculatedAt: "2026-06-13T00:00:00.000Z",
    });
  });

  it("creates a new blank worksheet page after the current last sheet order", async () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Page 3",
      rowCount: 4,
      columnCount: 4,
    });
    const supabaseMock = createWorkbookSheetSupabaseMock({
      latestSheetOrder: 1,
    });

    const createdSheet = await createOpportunityPricingWorkbookSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      userId: "user-1",
      worksheet,
      pricingSummary: createDefaultWorksheetPricingSummary(),
      extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
    });

    expect(createdSheet.sheetOrder).toBe(2);
    expect(createdSheet.name).toBe("Page 3");
  });

  it("renames a non-default worksheet page without touching the workbook rpc path", async () => {
    const sourceSheet = buildSheetRow({
      id: "sheet-rename",
      is_default: false,
      name: "Old Page",
      worksheet_data: cloneJson(
        createDefaultWorksheetData({
          sheetName: "Old Page",
        }),
      ),
    });
    const supabaseMock = createWorkbookSheetSupabaseMock({
      selectedSheet: sourceSheet,
    });

    const renamedSheet = await renameOpportunityPricingWorkbookSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-rename",
      nextName: "Renamed Page",
      tradePackage: "Ceilings",
      userId: "user-1",
    });

    expect(renamedSheet.name).toBe("Renamed Page");
    expect(renamedSheet.worksheet.sheetName).toBe("Renamed Page");
    expect(supabaseMock.sheetFilters).toContainEqual(["workbook_id", "workbook-1"]);
    expect(supabaseMock.sheetFilters).toContainEqual(["id", "sheet-rename"]);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("renames a default Project variation sheet through the scoped atomic save path", async () => {
    const sourceSheet = buildSheetRow({
      id: "sheet-project",
      workbook_id: "workbook-project",
      opportunity_id: "opp-project",
      is_default: true,
      name: "Old Project Title",
      worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "Old Project Title" })),
    });
    const supabaseMock = createWorkbookSheetSupabaseMock({
      selectedSheet: sourceSheet,
      renameResult: buildRpcPayload({
        workbook: {
          id: "workbook-project",
          opportunity_id: "opp-project",
          project_id: "project-1",
          variation_id: "variation-1",
          name: "New Project Title",
        },
        sheet: {
          id: "sheet-project",
          workbook_id: "workbook-project",
          opportunity_id: "opp-project",
          is_default: true,
          name: "New Project Title",
          worksheet_data: cloneJson(createDefaultWorksheetData({ sheetName: "New Project Title" })),
        },
      }) as unknown as Json,
    });

    const renamedSheet = await renameOpportunityPricingWorkbookSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-project",
      projectId: "project-1",
      variationId: "variation-1",
      workbookId: "workbook-project",
      sheetId: "sheet-project",
      nextName: "New Project Title",
      userId: "user-1",
    });

    expect(renamedSheet.sheetName).toBe("New Project Title");
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "save_pricing_workbook_active_sheet",
      expect.objectContaining({
        p_opportunity_id: "opp-project",
        p_project_id: "project-1",
        p_variation_id: "variation-1",
        p_workbook_id: "workbook-project",
        p_sheet_id: "sheet-project",
      }),
    );
  });

  it("deletes a worksheet page through the transactional delete rpc", async () => {
    const supabaseMock = createWorkbookSheetSupabaseMock({
      deleteResult: {
        deletedSheetId: "sheet-delete",
        nextSheetId: "sheet-next",
      } as Json,
    });

    const result = await deleteOpportunityPricingWorkbookSheet({
      supabase: supabaseMock.supabase,
      organizationId: "org-1",
      opportunityId: "opp-1",
      workbookId: "workbook-1",
      sheetId: "sheet-delete",
      userId: "user-1",
      nextSheetId: "sheet-next",
    });

    expect(result).toEqual({
      deletedSheetId: "sheet-delete",
      nextSheetId: "sheet-next",
    });
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "delete_opportunity_pricing_workbook_sheet",
      expect.objectContaining({
        p_sheet_id: "sheet-delete",
        p_next_sheet_id: "sheet-next",
      }),
    );
  });
});
