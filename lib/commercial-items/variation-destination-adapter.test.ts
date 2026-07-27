import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  variationDestinationAdapter,
  variationPublishImmutableStatusMessage,
} from "@/lib/commercial-items/variation-destination-adapter";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";

vi.mock("@/lib/commercial-items/variation-linking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/commercial-items/variation-linking")>("@/lib/commercial-items/variation-linking");
  return {
    ...actual,
    persistCommercialItemVariationLinksSafely: vi.fn(),
  };
});

import { persistCommercialItemVariationLinksSafely } from "@/lib/commercial-items/variation-linking";

function createMockClient() {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
  } as unknown as CommercialItemsClient;
}

function buildCommercialItem(overrides: Partial<CommercialItemPayload> = {}): CommercialItemPayload {
  return {
    id: "item-1",
    organizationId: "org-1",
    opportunityId: "opp-1",
    projectId: "project-1",
    sourceType: "worksheet_selection",
    sourceWorkbookId: "workbook-1",
    sourceWorksheetId: "workbook-1",
    sourceSheetId: "sheet-1",
    sourceRange: "A2:E2",
    sourceSignature: "sig-1",
    sourceVersion: 1,
    sourceStatus: "current",
    staleReasonCode: null,
    lastSourceCheckedAt: null,
    lastSourceChangedAt: null,
    description: "Steel framing",
    quantity: null,
    unit: null,
    rate: null,
    total: 500,
    snapshotJson: {},
    sourceLinkJson: {
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
      ownerType: "variation",
      projectSlug: "airport-fitout",
      variationId: "variation-1",
    },
    uclClassification: null,
    uclValidationStatus: "not_reviewed",
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function buildPublishedRow(overrides: Partial<PublishedWorksheetCommercialRowWithItem> = {}): PublishedWorksheetCommercialRowWithItem {
  return {
    rowId: "selection-line-0",
    rowIndex: 1,
    rowLabel: "2",
    sourceRowIndex: 1,
    sourceRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
    sourceRangeLabel: "A2:E2",
    sectionHeading: "Materials",
    rowCategoryHint: "Materials",
    description: "Steel framing",
    quantity: null,
    unit: null,
    rate: null,
    total: 500,
    snapshotJson: {},
    sourceLinkJson: {},
    lockedMetadataJson: {},
    sourceSignature: "sig-1",
    commercialItem: buildCommercialItem(),
    reusedCommercialItem: false,
    ...overrides,
  };
}

describe("variation destination adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends worksheet lines through the existing variation save rpc and preserves total-only values", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);
    const from = vi.mocked(client.from);

    const maybeSingleVariation = vi.fn().mockResolvedValue({
      data: {
        id: "variation-1",
        updated_at: "2026-07-14T00:00:00.000Z",
        variation_number: "VAR-001",
        variation_title: "Client changes",
        status: "Draft",
        origin: "Client Request",
        requested_by: "",
        requested_date: null,
        due_date: null,
        sent_to_client_at: null,
        approved_at: null,
        invoice_ready: false,
        notes: "",
        margin_percent: 0,
        discount_amount: 0,
        contingency_amount: 0,
        gst_percent: 15,
        include_margin_in_export: true,
        include_discount_in_export: false,
        include_contingency_in_export: false,
        validity_period: "30 days",
        payment_terms: "",
        lead_time: "",
        terms_inclusions: "",
        terms_exclusions: "",
        clarifications: "",
        assumptions: "",
      },
      error: null,
    });
    const eqVariationId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVariation });
    const eqVariationProject = vi.fn().mockReturnValue({ eq: eqVariationId });
    const eqVariationOrg = vi.fn().mockReturnValue({ eq: eqVariationProject });

    const orderExistingLines = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqLinesVariation = vi.fn().mockReturnValue({ order: orderExistingLines });
    const eqLinesProject = vi.fn().mockReturnValue({ eq: eqLinesVariation });
    const eqLinesOrg = vi.fn().mockReturnValue({ eq: eqLinesProject });

    const orderAttachments = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqAttachmentsVariation = vi.fn().mockReturnValue({ order: orderAttachments });
    const eqAttachmentsOrg = vi.fn().mockReturnValue({ eq: eqAttachmentsVariation });

    from
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqVariationOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqLinesOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqAttachmentsOrg }) } as never);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "variation-1",
          updated_at: "2026-07-14T00:01:00.000Z",
          status: "Draft",
        },
      ],
      error: null,
    } as never);

    vi.mocked(persistCommercialItemVariationLinksSafely).mockResolvedValue({
      ok: true,
      links: [],
      errorMessage: null,
    });

    const result = await variationDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "variation",
        selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: {
        variationId: "variation-1",
        lineSelections: [{ rowId: "selection-line-0", section: "Materials" }],
      },
    });

    expect(rpc).toHaveBeenCalledWith("save_project_variation_draft", expect.objectContaining({
      p_variation_id: "variation-1",
      p_project_id: "project-1",
      p_line_items: [
        expect.objectContaining({
          description: "Steel framing",
          quantity: null,
          unit: null,
          rate: null,
          total: 500,
          section: "Materials",
        }),
      ],
    }));
    expect(result.addedLineCount).toBe(1);
    expect(result.variationLineIds).toHaveLength(1);
  });

  it("blocks immutable variations before attempting a save", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);

    const maybeSingleVariation = vi.fn().mockResolvedValue({
      data: {
        id: "variation-1",
        updated_at: "2026-07-14T00:00:00.000Z",
        variation_number: "VAR-001",
        variation_title: "Client changes",
        status: "Approved",
        origin: "Client Request",
        requested_by: "",
        requested_date: null,
        due_date: null,
        sent_to_client_at: null,
        approved_at: null,
        invoice_ready: false,
        notes: "",
        margin_percent: 0,
        discount_amount: 0,
        contingency_amount: 0,
        gst_percent: 15,
        include_margin_in_export: true,
        include_discount_in_export: false,
        include_contingency_in_export: false,
        validity_period: "30 days",
        payment_terms: "",
        lead_time: "",
        terms_inclusions: "",
        terms_exclusions: "",
        clarifications: "",
        assumptions: "",
      },
      error: null,
    });
    const eqVariationId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleVariation });
    const eqVariationProject = vi.fn().mockReturnValue({ eq: eqVariationId });
    const eqVariationOrg = vi.fn().mockReturnValue({ eq: eqVariationProject });

    from.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqVariationOrg }) } as never);

    await expect(variationDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "variation",
        selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: {
        variationId: "variation-1",
        lineSelections: [{ rowId: "selection-line-0", section: "Materials" }],
      },
    })).rejects.toThrow(variationPublishImmutableStatusMessage);
  });
});
