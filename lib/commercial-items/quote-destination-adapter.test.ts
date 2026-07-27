import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildQuoteLineDraftFromPublishedRow,
  quoteDestinationAdapter,
  resolveQuotePublishTarget,
} from "@/lib/commercial-items/quote-destination-adapter";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";

vi.mock("@/lib/commercial-items/quote-linking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/commercial-items/quote-linking")>("@/lib/commercial-items/quote-linking");
  return {
    ...actual,
    persistCommercialItemQuoteLinksSafely: vi.fn(),
  };
});

import { persistCommercialItemQuoteLinksSafely } from "@/lib/commercial-items/quote-linking";

function createMockClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
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
    description: "Stud framing",
    quantity: 10,
    unit: "lm",
    rate: 32.5,
    total: 325,
    snapshotJson: {},
    sourceLinkJson: {
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
      worksheetVersion: 1,
      capturedAt: "2026-07-07T00:00:00.000Z",
    },
    uclClassification: null,
    uclValidationStatus: "not_reviewed",
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildPublishedRow(): PublishedWorksheetCommercialRowWithItem {
  return {
    rowId: "2",
    rowIndex: 1,
    rowLabel: "2",
    sourceRowIndex: 1,
    sourceRange: {
      startRowIndex: 1,
      endRowIndex: 1,
      startColumnIndex: 0,
      endColumnIndex: 4,
    },
    sourceRangeLabel: "A2:E2",
    sectionHeading: "Materials",
    rowCategoryHint: "Materials",
    description: "Stud framing",
    quantity: 10,
    unit: "lm",
    rate: 32.5,
    total: 325,
    snapshotJson: {},
    sourceLinkJson: {},
    lockedMetadataJson: {
      formula: "=SUM(A1:A2)",
    },
    sourceSignature: "sig-1",
    commercialItem: buildCommercialItem(),
    reusedCommercialItem: false,
  };
}

function mockQuoteListQueries(params: {
  client: CommercialItemsClient;
  quotes: Array<{
    id: string;
    quote_number: string;
    quote_title: string;
    status: string | null;
    updated_at: string | null;
    originating_opportunity_id?: string | null;
    project_id?: string | null;
  }>;
  lineItemCounts?: Record<string, number>;
}) {
  const from = vi.mocked(params.client.from);
  const lineRows = Object.entries(params.lineItemCounts ?? {}).flatMap(([quoteId, count]) =>
    Array.from({ length: count }, () => ({ quote_id: quoteId })),
  );

  const orderQuotes = vi.fn().mockResolvedValue({
    data: params.quotes.map((quote) => ({
      originating_opportunity_id: "opp-1",
      project_id: null,
      ...quote,
    })),
    error: null,
  });
  const eqOpportunity = vi.fn().mockReturnValue({ order: orderQuotes });
  const eqOrganization = vi.fn().mockReturnValue({ eq: eqOpportunity });

  from.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({ eq: eqOrganization }),
  } as never);

  if (params.quotes.length === 0) {
    return;
  }

  const inQuoteIds = vi.fn().mockResolvedValue({
    data: lineRows,
    error: null,
  });
  const eqLineOrganization = vi.fn().mockReturnValue({ in: inQuoteIds });

  from.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({ eq: eqLineOrganization }),
  } as never);
}

describe("quote destination adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a published worksheet row into a quote line draft without exposing locked metadata", () => {
    const draft = buildQuoteLineDraftFromPublishedRow(buildPublishedRow());

    expect(draft).toMatchObject({
      description: "Stud framing",
      quantity: 10,
      unit: "lm",
      rate: 32.5,
    });
    expect(draft.commercialItemLink).not.toHaveProperty("lockedMetadataJson");
  });

  it("allows pre-award quote publishing when no project is attached yet", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      quotes: [],
    });

    const result = await resolveQuotePublishTarget({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
    });

    expect(result).toEqual({
      kind: "ready",
      target: { mode: "new" },
    });
  });

  it("auto-selects the only draft quote", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      quotes: [
        {
          id: "quote-1",
          quote_number: "Q-26025-1",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T09:00:00.000Z",
        },
      ],
      lineItemCounts: {
        "quote-1": 3,
      },
    });

    const result = await resolveQuotePublishTarget({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
    });

    expect(result).toEqual({
      kind: "ready",
      target: { mode: "existing", quoteId: "quote-1" },
    });
  });

  it("auto-selects the only draft quote when non-draft quotes also exist", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      quotes: [
        {
          id: "quote-1",
          quote_number: "Q-26025-1",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T09:00:00.000Z",
        },
        {
          id: "quote-2",
          quote_number: "Q-26025-2",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Sent",
          updated_at: "2026-07-07T09:00:00.000Z",
        },
      ],
      lineItemCounts: {
        "quote-1": 2,
        "quote-2": 5,
      },
    });

    const result = await resolveQuotePublishTarget({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
    });

    expect(result).toEqual({
      kind: "ready",
      target: { mode: "existing", quoteId: "quote-1" },
    });
  });

  it("shows the picker when multiple meaningful draft quotes exist", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      quotes: [
        {
          id: "quote-1",
          quote_number: "Q-26025-1",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T09:00:00.000Z",
        },
        {
          id: "quote-2",
          quote_number: "Q-26025-2",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T08:00:00.000Z",
        },
        {
          id: "quote-3",
          quote_number: "Q-26025-3",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Sent",
          updated_at: "2026-07-07T08:00:00.000Z",
        },
      ],
      lineItemCounts: {
        "quote-1": 2,
        "quote-2": 1,
        "quote-3": 4,
      },
    });

    const result = await resolveQuotePublishTarget({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
    });

    expect(result).toEqual({
      kind: "choose",
      quotes: [
        expect.objectContaining({
          id: "quote-1",
          lineItemCount: 2,
        }),
        expect.objectContaining({
          id: "quote-2",
          lineItemCount: 1,
        }),
      ],
    });
  });

  it("auto-selects the latest empty draft when all draft quotes are empty", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      quotes: [
        {
          id: "quote-1",
          quote_number: "Q-26025-1",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T08:00:00.000Z",
        },
        {
          id: "quote-2",
          quote_number: "Q-26025-2",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T09:00:00.000Z",
        },
      ],
      lineItemCounts: {
        "quote-1": 0,
        "quote-2": 0,
      },
    });

    const result = await resolveQuotePublishTarget({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
    });

    expect(result).toEqual({
      kind: "ready",
      target: { mode: "existing", quoteId: "quote-2" },
    });
  });

  it("hides empty draft quotes when at least one non-empty draft exists", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      quotes: [
        {
          id: "quote-1",
          quote_number: "Q-26025-1",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T09:00:00.000Z",
        },
        {
          id: "quote-2",
          quote_number: "Q-26025-2",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T08:00:00.000Z",
        },
        {
          id: "quote-3",
          quote_number: "Q-26025-3",
          quote_title: "Metro Ceilings Fitout Quote",
          status: "Draft",
          updated_at: "2026-07-08T07:00:00.000Z",
        },
      ],
      lineItemCounts: {
        "quote-1": 4,
        "quote-2": 0,
        "quote-3": 2,
      },
    });

    const result = await resolveQuotePublishTarget({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
    });

    expect(result).toEqual({
      kind: "choose",
      quotes: [
        expect.objectContaining({
          id: "quote-1",
          lineItemCount: 4,
        }),
        expect.objectContaining({
          id: "quote-3",
          lineItemCount: 2,
        }),
      ],
    });
    if (result.kind === "choose") {
      expect(result.quotes).toHaveLength(2);
      expect(result.quotes.map((quote) => quote.id)).not.toContain("quote-2");
    }
  });

  it("keeps pre-award quote save success and link failure as a partial success", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc);

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: {
        id: "opp-1",
        name: "Metro Ceilings Fitout",
        opportunity_code: "MCF-001",
        location: "Auckland",
        client_id: "client-1",
      },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    const maybeSingleClient = vi.fn().mockResolvedValue({
      data: {
        name: "Client Name",
        company_name: "Client Co",
        email: "client@example.com",
        phone: "021",
      },
      error: null,
    });
    const eqClientId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleClient });
    const eqClientOrg = vi.fn().mockReturnValue({ eq: eqClientId });

    const likeQuoteNumber = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqQuoteOrg = vi.fn().mockReturnValue({ like: likeQuoteNumber });

    from
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqClientOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqQuoteOrg }) } as never);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "quote-1",
          updated_at: "2026-07-07T02:00:00.000Z",
          status: "Draft",
        },
      ],
      error: null,
    } as never);

    vi.mocked(persistCommercialItemQuoteLinksSafely).mockResolvedValueOnce({
      ok: false,
      links: [],
      errorMessage: "Commercial item cannot be linked to the selected quote line",
    });

    const result = await quoteDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
      publishedSelection: {
        destination: "quote",
        selectionRange: {
          startRowIndex: 1,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 4,
        },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: { mode: "new" },
    });

    expect(result.quoteId).toBe("quote-1");
    expect(result.quoteNumber).toBe("Q-MCF-001-1");
    expect(result.message).toContain("1 row added to quote.");
    expect(result.message).toContain("Draft quote Q-MCF-001-1 created.");
    expect(result.partialLinkFailureMessage).toBe("Commercial item cannot be linked to the selected quote line");
    expect(rpc).toHaveBeenCalledWith("save_commercial_quote_draft", expect.objectContaining({
      p_originating_opportunity_id: "opp-1",
      p_project_id: null,
      p_quote_title: "Metro Ceilings Fitout Quote",
      p_retention_percent_default: 0,
    }));
  });

  it("keeps post-award quote save success and link failure as a partial success", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc);

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: {
        id: "opp-1",
        name: "Auckland Fitout Opportunity",
        opportunity_code: "AKL-OPP",
        location: "Auckland",
        client_id: "client-1",
      },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    const maybeSingleProject = vi.fn().mockResolvedValue({
      data: {
        id: "project-1",
        name: "Auckland Fitout",
        project_code: "AKL-001",
        location: "Auckland",
        client_id: "client-1",
        source_opportunity_id: "opp-1",
      },
      error: null,
    });
    const eqProjectId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleProject });
    const eqProjectOrg = vi.fn().mockReturnValue({ eq: eqProjectId });

    const maybeSingleClient = vi.fn().mockResolvedValue({
      data: {
        name: "Client Name",
        company_name: "Client Co",
        email: "client@example.com",
        phone: "021",
      },
      error: null,
    });
    const eqClientId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleClient });
    const eqClientOrg = vi.fn().mockReturnValue({ eq: eqClientId });

    const likeQuoteNumber = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqQuoteOrg = vi.fn().mockReturnValue({ like: likeQuoteNumber });

    from
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqProjectOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqClientOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqQuoteOrg }) } as never);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "quote-1",
          updated_at: "2026-07-07T02:00:00.000Z",
          status: "Draft",
        },
      ],
      error: null,
    } as never);

    vi.mocked(persistCommercialItemQuoteLinksSafely).mockResolvedValueOnce({
      ok: false,
      links: [],
      errorMessage: "Commercial item cannot be linked to the selected quote line",
    });

    const result = await quoteDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "quote",
        selectionRange: {
          startRowIndex: 1,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 4,
        },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: { mode: "new" },
    });

    expect(result.quoteId).toBe("quote-1");
    expect(result.quoteNumber).toBe("Q-AKL-001-1");
    expect(result.message).toContain("1 row added to quote.");
    expect(result.message).toContain("Draft quote Q-AKL-001-1 created.");
    expect(result.partialLinkFailureMessage).toBe("Commercial item cannot be linked to the selected quote line");
    expect(rpc).toHaveBeenCalledWith("save_commercial_quote_draft", expect.objectContaining({
      p_originating_opportunity_id: "opp-1",
      p_project_id: "project-1",
      p_quote_title: "Auckland Fitout Opportunity Quote",
      p_retention_percent_default: 0,
    }));
  });

  it("does not use tender workspace wording in new worksheet-publish quote titles", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc);

    const maybeSingleOpportunity = vi.fn().mockResolvedValue({
      data: {
        id: "opp-1",
        name: "Metro Ceilings Fitout",
        opportunity_code: "MCF-001",
        location: "Auckland",
        client_id: null,
      },
      error: null,
    });
    const eqOpportunityId = vi.fn().mockReturnValue({ maybeSingle: maybeSingleOpportunity });
    const eqOpportunityOrg = vi.fn().mockReturnValue({ eq: eqOpportunityId });

    const likeQuoteNumber = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const eqQuoteOrg = vi.fn().mockReturnValue({ like: likeQuoteNumber });

    from
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqOpportunityOrg }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: eqQuoteOrg }) } as never);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "quote-1",
          updated_at: "2026-07-07T02:00:00.000Z",
          status: "Draft",
        },
      ],
      error: null,
    } as never);

    vi.mocked(persistCommercialItemQuoteLinksSafely).mockResolvedValueOnce({
      ok: true,
      links: [],
      errorMessage: null,
    });

    await quoteDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
      publishedSelection: {
        destination: "quote",
        selectionRange: {
          startRowIndex: 1,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 4,
        },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: { mode: "new" },
    });

    expect(rpc).toHaveBeenCalledWith("save_commercial_quote_draft", expect.objectContaining({
      p_quote_title: "Metro Ceilings Fitout Quote",
    }));
    const rpcPayload = rpc.mock.calls[0]?.[1] as { p_quote_title?: string } | undefined;
    expect(rpcPayload?.p_quote_title).not.toContain("Tender Workspace");
    expect(rpcPayload?.p_quote_title).not.toContain("worksheet publish");
  });
});
