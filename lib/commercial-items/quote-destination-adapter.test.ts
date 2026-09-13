import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildQuotePublicationRequestKey,
  buildQuoteLineDraftFromPublishedRow,
  quoteDestinationAdapter,
  resolveInitialQuotePublishTargetId,
  resolveInitialQuotePublishTargetIds,
  resolveInitialQuotePublishTargetMode,
  resolveQuotePublishOptions,
  resolveQuotePublishTarget,
} from "@/lib/commercial-items/quote-destination-adapter";
import type { QuotePublishTargetResolution } from "@/lib/commercial-items/quote-destination-adapter";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";

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

function buildPublishedRow(overrides: Partial<PublishedWorksheetCommercialRowWithItem> = {}): PublishedWorksheetCommercialRowWithItem {
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
    ...overrides,
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
    quote_series_id?: string | null;
    revision_number?: number;
    revision_kind?: string;
    award_locked_at?: string | null;
    company_name?: string | null;
  }>;
  series?: Array<{
    id: string;
    organization_id?: string;
    opportunity_id?: string;
    recipient_client_id?: string | null;
    current_revision_id: string | null;
    archived_at?: string | null;
  }>;
  lineItemCounts?: Record<string, number>;
}) {
  const from = vi.mocked(params.client.from);
  const lineRows = Object.entries(params.lineItemCounts ?? {}).flatMap(([quoteId, count]) =>
    Array.from({ length: count }, () => ({ organization_id: "org-1", quote_id: quoteId })),
  );

  const quoteRows = params.quotes.map((quote) => ({
    organization_id: "org-1",
    originating_opportunity_id: "opp-1",
    project_id: null,
    quote_series_id: quote.quote_series_id ?? `series-${quote.id}`,
    is_master_quote: false,
    client_name: "Recipient",
    company_name: null,
    revision_number: 1,
    revision_kind: "tender",
    award_locked_at: null,
    ...quote,
  }));
  const seriesRows = (params.series ?? quoteRows.map((quote) => ({
    id: quote.quote_series_id,
    recipient_client_id: `client-${quote.id}`,
    current_revision_id: quote.id,
  }))).map((series) => ({
    organization_id: "org-1",
    opportunity_id: "opp-1",
    archived_at: null,
    ...series,
  }));

  function queryFor(rows: Array<Record<string, unknown>>) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
        Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve),
    };
    return builder;
  }

  from.mockImplementation((table: string) => {
    if (table === "opportunity_quote_series") return queryFor(seriesRows as Array<Record<string, unknown>>) as never;
    if (table === "project_quotes") return queryFor(quoteRows) as never;
    if (table === "project_quote_line_items") return queryFor(lineRows) as never;
    throw new Error(`Unexpected candidate query table: ${table}`);
  });
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

  it("uses a stable order-independent publication key for safe retries", () => {
    const first = buildQuotePublicationRequestKey({
      organizationId: "org-1",
      target: { mode: "existing", quoteId: "quote-1" },
      commercialItemIds: ["item-b", "item-a"],
    });
    const retry = buildQuotePublicationRequestKey({
      organizationId: "org-1",
      target: { mode: "existing", quoteId: "quote-1" },
      commercialItemIds: ["item-a", "item-b"],
    });

    expect(retry).toBe(first);
    expect(retry).toBe("worksheet-quote-v1:org-1:quote-1:item-a:item-b");

    const multiFirst = buildQuotePublicationRequestKey({
      organizationId: "org-1",
      target: { mode: "existing", quoteIds: ["harbour", "fletcher"] },
      commercialItemIds: ["item-a"],
    });
    const multiRetry = buildQuotePublicationRequestKey({
      organizationId: "org-1",
      target: { mode: "existing", quoteIds: ["fletcher", "harbour"] },
      commercialItemIds: ["item-a"],
    });
    expect(multiRetry).toBe(multiFirst);
  });

  it("only preselects a destination when resolution found exactly one existing quote", () => {
    const oneExisting: QuotePublishTargetResolution = {
      kind: "ready",
      target: { mode: "existing", quoteId: "quote-1" },
    };
    const choose: QuotePublishTargetResolution = { kind: "choose", quotes: [] };
    const createNew: QuotePublishTargetResolution = { kind: "ready", target: { mode: "new" } };

    expect(resolveInitialQuotePublishTargetId(oneExisting)).toBe("quote-1");
    expect(resolveInitialQuotePublishTargetIds(oneExisting)).toEqual(["quote-1"]);
    expect(resolveInitialQuotePublishTargetMode(oneExisting)).toBe("existing");
    expect(resolveInitialQuotePublishTargetId(choose)).toBe("");
    expect(resolveInitialQuotePublishTargetIds(choose)).toEqual([]);
    expect(resolveInitialQuotePublishTargetMode(choose)).toBe("existing");
    expect(resolveInitialQuotePublishTargetId(createNew)).toBe("");
    expect(resolveInitialQuotePublishTargetMode(createNew)).toBe("new");
  });

  it.each([
    ["Description", { description: "Stud", quantity: null, unit: null, rate: null, total: null }, { description: "Stud", quantity: 1, unit: "Item", rate: 0 }],
    ["Quantity", { description: "", quantity: 10, unit: null, rate: null, total: null }, { description: "", quantity: 10, unit: "Item", rate: 0 }],
    ["Unit", { description: "", quantity: null, unit: "lm", rate: null, total: null }, { description: "", quantity: 1, unit: "lm", rate: 0 }],
    ["Rate", { description: "", quantity: null, unit: null, rate: 5, total: null }, { description: "", quantity: 1, unit: "Item", rate: 5 }],
    ["Total", { description: "", quantity: null, unit: null, rate: null, total: 50 }, { description: "", quantity: 1, unit: "Item", rate: 50 }],
  ] as const)("normalizes a %s-only mapping into a valid Quote line", (_field, values, expected) => {
    expect(buildQuoteLineDraftFromPublishedRow(buildPublishedRow(values))).toMatchObject(expected);
  });

  it("directs pre-award publishing to the Quotation Register when no Draft series exists", async () => {
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

    expect(result).toEqual({ kind: "ready", target: { mode: "new" } });
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

  it("keeps all empty recipient drafts selectable and requires an explicit choice", async () => {
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
      kind: "choose",
      quotes: [
        expect.objectContaining({ id: "quote-2", lineItemCount: 0 }),
        expect.objectContaining({ id: "quote-1", lineItemCount: 0 }),
      ],
    });
  });

  it("keeps empty recipient drafts selectable when another recipient has lines", async () => {
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
          id: "quote-2",
          lineItemCount: 0,
        }),
        expect.objectContaining({
          id: "quote-3",
          lineItemCount: 2,
        }),
      ],
    });
    if (result.kind === "choose") {
      expect(result.quotes).toHaveLength(3);
      expect(result.quotes.map((quote) => quote.id)).toContain("quote-2");
    }
  });

  it("fetches the exact current revision head from every active recipient series", async () => {
    const client = createMockClient();
    mockQuoteListQueries({
      client,
      series: [
        { id: "series-a", recipient_client_id: "client-a", current_revision_id: "quote-a-r1" },
        { id: "series-b", recipient_client_id: "client-b", current_revision_id: "quote-b-original" },
      ],
      quotes: [
        { id: "quote-a-original", quote_number: "Q-26008-2", quote_title: "Skycity Auckland Quotation", quote_series_id: "series-a", revision_number: 1, status: "Draft", updated_at: "2026-08-25T08:00:00.000Z" },
        { id: "quote-a-r1", quote_number: "Q-26008-2", quote_title: "Skycity Auckland Quotation", quote_series_id: "series-a", revision_number: 2, status: "Draft", updated_at: "2026-08-26T09:00:00.000Z" },
        { id: "quote-b-original", quote_number: "Q-26008-3", quote_title: "Skycity Auckland Quotation", quote_series_id: "series-b", revision_number: 1, status: "Draft", updated_at: "2026-08-26T08:00:00.000Z" },
      ],
    });

    const options = await resolveQuotePublishOptions({ client, organizationId: "org-1", opportunityId: "opp-1" });

    expect(options.map((quote) => quote.id)).toEqual(["quote-a-r1", "quote-b-original"]);
    expect(options.map((quote) => quote.revisionNumber)).toEqual([2, 1]);
  });

  it("excludes non-Draft, award-locked, archived, cross-opportunity, and recipient-less heads", async () => {
    const client = createMockClient();
    const nonDraftStatuses = ["Ready to Send", "Sent", "Viewed", "Accepted", "Rejected", "Expired"];
    mockQuoteListQueries({
      client,
      series: [
        { id: "series-draft", recipient_client_id: "client-a", current_revision_id: "draft" },
        ...nonDraftStatuses.map((status, index) => ({
          id: `series-state-${index}`,
          recipient_client_id: `client-state-${index}`,
          current_revision_id: `state-${index}`,
        })),
        { id: "series-locked", recipient_client_id: "client-c", current_revision_id: "locked" },
        { id: "series-archived", recipient_client_id: "client-d", current_revision_id: "archived", archived_at: "2026-08-26T00:00:00.000Z" },
        { id: "series-cross", recipient_client_id: "client-e", current_revision_id: "cross" },
        { id: "series-no-recipient", recipient_client_id: null, current_revision_id: "no-recipient" },
      ],
      quotes: [
        { id: "draft", quote_number: "Q-1", quote_title: "Draft", quote_series_id: "series-draft", status: "Draft", updated_at: "2026-08-26T01:00:00.000Z" },
        ...nonDraftStatuses.map((status, index) => ({
          id: `state-${index}`,
          quote_number: `Q-STATE-${index}`,
          quote_title: status,
          quote_series_id: `series-state-${index}`,
          status,
          updated_at: `2026-08-26T0${index + 2}:00:00.000Z`,
        })),
        { id: "locked", quote_number: "Q-3", quote_title: "Locked", quote_series_id: "series-locked", status: "Draft", award_locked_at: "2026-08-26T03:00:00.000Z", updated_at: "2026-08-26T03:00:00.000Z" },
        { id: "archived", quote_number: "Q-4", quote_title: "Archived", quote_series_id: "series-archived", status: "Draft", updated_at: "2026-08-26T04:00:00.000Z" },
        { id: "cross", quote_number: "Q-5", quote_title: "Cross", quote_series_id: "series-cross", originating_opportunity_id: "opp-2", status: "Draft", updated_at: "2026-08-26T05:00:00.000Z" },
        { id: "no-recipient", quote_number: "Q-6", quote_title: "No recipient", quote_series_id: "series-no-recipient", status: "Draft", updated_at: "2026-08-26T06:00:00.000Z" },
      ],
    });

    const options = await resolveQuotePublishOptions({ client, organizationId: "org-1", opportunityId: "opp-1" });

    expect(options.map((quote) => quote.id)).toEqual(["draft"]);
  });

  it("publishes to the selected recipient's exact quote id", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc) as unknown as ReturnType<typeof vi.fn>;
    const opportunityMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "opp-1", name: "Skycity Auckland", opportunity_code: "26008", location: "Auckland", client_id: "fletcher-client" },
      error: null,
    });
    const clientMaybeSingle = vi.fn().mockResolvedValue({
      data: { name: "Jordan", company_name: "Fletcher Construction", email: "fletcher@example.com", phone: "021" },
      error: null,
    });
    const quoteMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "harbour-quote",
        organization_id: "org-1",
        originating_opportunity_id: "opp-1",
        project_id: null,
        quote_series_id: "harbour-series",
        revision_number: 1,
        quote_number: "Q-26008-3",
        quote_title: "Skycity Auckland Quotation",
        status: "Draft",
        updated_at: "2026-08-26T04:56:09.688Z",
        client_name: "Josh Ryan",
        company_name: "Harbour Side Builders",
        contact_person: "Josh Ryan",
        client_email: "harbour@example.com",
        client_phone: "022",
        site_address: "Auckland",
        project_name: "Skycity Auckland",
        quote_date: "2026-08-26",
        expiry_date: null,
        optional_items_notes: "",
        scope_exclusions: "",
        assumptions: "",
        scope_notes: "",
        margin_percent: 0,
        discount_amount: 0,
        contingency_amount: 0,
        gst_percent: 15,
        validity_period: "30 days",
        payment_terms: "",
        lead_time: "",
        terms_inclusions: "",
        terms_exclusions: "",
        clarifications: "",
        acceptance_notes: "",
      },
      error: null,
    });
    const lineOrder = vi.fn().mockResolvedValue({ data: [], error: null });

    from
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: opportunityMaybeSingle }) }) }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: clientMaybeSingle }) }) }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: quoteMaybeSingle }) }) }) } as never)
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: lineOrder }) }) }) } as never);
    rpc.mockResolvedValue({
      data: [{ id: "harbour-quote", updated_at: "2026-08-26T05:00:00.000Z", status: "Draft" }],
      error: null,
    } as never);

    const result = await quoteDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
      publishedSelection: {
        destination: "quote",
        selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: { mode: "existing", quoteId: "harbour-quote" },
    });

    expect(result.quoteId).toBe("harbour-quote");
    expect(rpc).toHaveBeenCalledWith("publish_worksheet_commercial_quote_v1", {
      p_input: expect.objectContaining({
        quoteId: "harbour-quote",
        quoteNumber: "Q-26008-3",
        companyName: "Harbour Side Builders",
        requestKey: expect.stringContaining(":harbour-quote:"),
      }),
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("fletcher-quote");
  });

  it("publishes two exact recipients through one atomic multi-destination RPC", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc) as unknown as ReturnType<typeof vi.fn>;
    const quoteRows: Record<string, Record<string, unknown>> = {
      "fletcher-quote": {
        id: "fletcher-quote", updated_at: "2026-08-26T04:00:00.000Z", status: "Draft", quote_title: "Skycity", quote_number: "Q-26008-2",
        client_name: "Jordan", company_name: "Fletcher Construction", contact_person: "Jordan", client_email: "fletcher@example.com", client_phone: "021",
        site_address: "Auckland", project_name: "Skycity", quote_date: "2026-08-26", expiry_date: null, optional_items_notes: "", scope_exclusions: "", assumptions: "", scope_notes: "",
        margin_percent: 0, discount_amount: 0, contingency_amount: 0, gst_percent: 15, validity_period: "30 days", payment_terms: "", lead_time: "", terms_inclusions: "", terms_exclusions: "", clarifications: "", acceptance_notes: "",
        originating_opportunity_id: "opp-1", project_id: null,
      },
      "harbour-quote": {
        id: "harbour-quote", updated_at: "2026-08-26T04:30:00.000Z", status: "Draft", quote_title: "Skycity", quote_number: "Q-26008-3",
        client_name: "Josh", company_name: "Harbour Side Builders", contact_person: "Josh", client_email: "harbour@example.com", client_phone: "022",
        site_address: "Auckland", project_name: "Skycity", quote_date: "2026-08-26", expiry_date: null, optional_items_notes: "", scope_exclusions: "", assumptions: "", scope_notes: "",
        margin_percent: 0, discount_amount: 0, contingency_amount: 0, gst_percent: 15, validity_period: "30 days", payment_terms: "", lead_time: "", terms_inclusions: "", terms_exclusions: "", clarifications: "", acceptance_notes: "",
        originating_opportunity_id: "opp-1", project_id: null,
      },
    };

    from.mockImplementation((table: string) => {
      if (table === "organization_opportunities") {
        const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        builder.maybeSingle.mockResolvedValue({ data: { id: "opp-1", name: "Skycity", opportunity_code: "26008", location: "Auckland", client_id: "primary-client" }, error: null });
        return builder as never;
      }
      if (table === "organization_clients") {
        const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        builder.maybeSingle.mockResolvedValue({ data: { name: "Primary", company_name: "Primary Company", email: "primary@example.com", phone: "020" }, error: null });
        return builder as never;
      }
      if (table === "project_quotes") {
        let quoteId = "";
        const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
        builder.select.mockReturnValue(builder);
        builder.eq.mockImplementation((column: string, value: string) => {
          if (column === "id") quoteId = value;
          return builder;
        });
        builder.maybeSingle.mockImplementation(async () => ({ data: quoteRows[quoteId] ?? null, error: null }));
        return builder as never;
      }
      if (table === "project_quote_line_items") {
        const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        builder.order.mockResolvedValue({ data: [], error: null });
        return builder as never;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    rpc.mockResolvedValue({
      data: [
        { id: "fletcher-quote", updated_at: "2026-08-26T05:00:00.000Z", status: "Draft" },
        { id: "harbour-quote", updated_at: "2026-08-26T05:00:00.000Z", status: "Draft" },
      ],
      error: null,
    } as never);

    const result = await quoteDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
      publishedSelection: { destination: "quote", selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 }, commercialRows: [buildPublishedRow()], skippedRows: [] },
      publishedRows: [buildPublishedRow()],
      target: { mode: "existing", quoteIds: ["harbour-quote", "fletcher-quote"] },
    });

    expect(result.quoteIds).toEqual(["fletcher-quote", "harbour-quote"]);
    expect(result.message).toBe("Added 1 worksheet item to 2 Quotes.");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("publish_worksheet_commercial_quotes_v1");
    const multiInput = (rpc.mock.calls[0][1] as { p_input: { destinations: Array<Record<string, unknown>> } }).p_input;
    expect(multiInput.destinations.map((destination) => destination.quoteId)).toEqual(["fletcher-quote", "harbour-quote"]);
    expect(multiInput.destinations.map((destination) => destination.companyName)).toEqual(["Fletcher Construction", "Harbour Side Builders"]);
    expect(new Set(multiInput.destinations.flatMap((destination) => (destination.lineItems as Array<{ id: string }>).map((line) => line.id))).size).toBe(2);
  });

  it("publishes a post-award worksheet quote through the same atomic RPC", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc) as unknown as ReturnType<typeof vi.fn>;

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

    await expect(quoteDestinationAdapter.publish({
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
    })).rejects.toThrow("Unable to initialize the Primary Client quote");
    expect(rpc).toHaveBeenCalledWith("initialize_primary_opportunity_quote_v1", {
      p_organization_id: "org-1",
      p_opportunity_id: "opp-1",
    });
  });

  it("does not create an unscoped quote from worksheet publishing", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const rpc = vi.mocked(client.rpc) as unknown as ReturnType<typeof vi.fn>;

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

    await expect(quoteDestinationAdapter.publish({
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
    })).rejects.toThrow("Unable to initialize the Primary Client quote");
    expect(rpc).toHaveBeenCalledWith("initialize_primary_opportunity_quote_v1", {
      p_organization_id: "org-1",
      p_opportunity_id: "opp-1",
    });
  });
});
