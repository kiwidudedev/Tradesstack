import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPurchaseOrderLineDraft,
  purchaseOrderDestinationAdapter,
  resolvePurchaseOrderPublishOptions,
} from "@/lib/commercial-items/purchase-order-destination-adapter";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";

vi.mock("@/lib/commercial-items/purchase-order-linking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/commercial-items/purchase-order-linking")>("@/lib/commercial-items/purchase-order-linking");
  return {
    ...actual,
    persistCommercialItemPurchaseOrderLinksSafely: vi.fn(),
  };
});

vi.mock("@/lib/purchase-orders/service", () => ({
  createPurchaseOrderDraft: vi.fn(),
  getPurchaseOrder: vi.fn(),
  getPurchaseOrderDetail: vi.fn(),
  listOrganizationSuppliers: vi.fn(),
  savePurchaseOrderDraft: vi.fn(),
}));

import { persistCommercialItemPurchaseOrderLinksSafely } from "@/lib/commercial-items/purchase-order-linking";
import {
  createPurchaseOrderDraft,
  getPurchaseOrder,
  getPurchaseOrderDetail,
  listOrganizationSuppliers,
  savePurchaseOrderDraft,
} from "@/lib/purchase-orders/service";

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
    quantity: 10,
    unit: "lm",
    rate: 50,
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
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    ...overrides,
  };
}

function buildPublishedRow(overrides: Partial<PublishedWorksheetCommercialRowWithItem> = {}): PublishedWorksheetCommercialRowWithItem {
  return {
    rowId: "2",
    rowIndex: 1,
    rowLabel: "2",
    sourceRowIndex: 1,
    sourceRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
    sourceRangeLabel: "A2:E2",
    sectionHeading: "Materials",
    rowCategoryHint: "Materials",
    description: "Steel framing",
    quantity: 10,
    unit: "lm",
    rate: 50,
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

describe("purchase order destination adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["Description", { description: "Stud", quantity: null, unit: null, rate: null, total: null }, { description: "Stud", quantity: 0, unit: "", rate: 0 }],
    ["Quantity", { description: "", quantity: 10, unit: null, rate: null, total: null }, { description: "", quantity: 10, unit: "", rate: 0 }],
    ["Unit", { description: "", quantity: null, unit: "lm", rate: null, total: null }, { description: "", quantity: 0, unit: "lm", rate: 0 }],
    ["Rate", { description: "", quantity: null, unit: null, rate: 5, total: null }, { description: "", quantity: 0, unit: "", rate: 5 }],
    ["Total", { description: "", quantity: null, unit: null, rate: null, total: 50 }, { description: "", quantity: 1, unit: "", rate: 50 }],
  ] as const)("normalizes a %s-only mapping into a valid Purchase Order line", (_field, values, expected) => {
    expect(buildPurchaseOrderLineDraft({ row: buildPublishedRow(values), purchaseOrderSection: "Materials" })).toMatchObject(expected);
  });

  it("returns supplier and draft purchase order options", async () => {
    const client = createMockClient();
    vi.mocked(listOrganizationSuppliers).mockResolvedValue([
      {
        id: "supplier-1",
        name: "Acme",
        company_name: "Acme",
        legal_name: null,
        email: null,
        phone: null,
        address: null,
        website: null,
        default_tax_rate_id: null,
        default_payment_terms: null,
        is_active: true,
        source: "manual",
        organization_id: "org-1",
        created_by: "user-1",
        created_at: "",
        updated_at: "",
      },
    ] as never);
    vi.mocked(client.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "po-1",
                    purchase_order_number: "PO-001",
                    purchase_order_title: "Draft PO",
                    status: "Draft",
                    supplier_id: "supplier-1",
                    issued_to_label: "Acme",
                    updated_at: "2026-07-11T00:00:00.000Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never);
    vi.mocked(getPurchaseOrderDetail).mockResolvedValue({
      purchaseOrder: null,
      lineItems: [{ id: "line-1" }] as never,
      attachments: [],
    });

    const result = await resolvePurchaseOrderPublishOptions({
      client,
      organizationId: "org-1",
      projectId: "project-1",
    });

    expect(result.suppliers[0]).toMatchObject({
      id: "supplier-1",
      label: "Acme",
    });
    expect(result.draftPurchaseOrders[0]).toMatchObject({
      id: "po-1",
      purchaseOrderNumber: "PO-001",
      lineItemCount: 1,
    });
  });

  it("creates a new draft purchase order, saves line values, and links sources after save", async () => {
    const client = createMockClient();
    let savedLineUid: string | null = null;
    vi.mocked(listOrganizationSuppliers).mockResolvedValue([
      {
        id: "supplier-1",
        name: "Acme",
        company_name: "Acme",
        legal_name: null,
        email: "orders@acme.test",
        phone: "123",
        address: null,
        website: null,
        default_tax_rate_id: null,
        default_payment_terms: null,
        is_active: true,
        source: "manual",
        organization_id: "org-1",
        created_by: "user-1",
        created_at: "",
        updated_at: "",
      },
    ] as never);
    vi.mocked(createPurchaseOrderDraft).mockResolvedValue({
      id: "po-1",
      updatedAt: "2026-07-11T00:00:00.000Z",
      purchaseOrderNumber: "PO-001",
      purchaseOrderTitle: "Worksheet Purchase Order",
      status: "Draft",
      origin: "Material Supply",
    });
    vi.mocked(getPurchaseOrder)
      .mockResolvedValueOnce({
        id: "po-1",
        organizationId: "org-1",
        projectId: "project-1",
        createdBy: "user-1",
        createdAt: "",
        updatedAt: "2026-07-11T00:00:00.000Z",
        purchaseOrderTitle: "Worksheet Purchase Order",
        purchaseOrderNumber: "PO-001",
        status: "Draft",
        origin: "Material Supply",
        supplierId: null,
        issuedToLabel: "",
        supplierContact: "",
        supplierNameSnapshot: "",
        supplierEmailSnapshot: "",
        supplierPhoneSnapshot: "",
        requestedBy: "",
        requestedDate: null,
        dueDate: null,
        sentToClientAt: null,
        approvedAt: null,
        invoiceReady: false,
        notes: "",
        labourTotal: 0,
        materialsTotal: 0,
        subcontractorsTotal: 0,
        plantTotal: 0,
        marginTotal: 0,
        subtotal: 0,
        marginPercent: 0,
        discountAmount: 0,
        contingencyAmount: 0,
        gstPercent: 15,
        gstTotal: 0,
        totalPurchaseOrderPrice: 0,
        includeMarginInExport: false,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
      })
      .mockResolvedValueOnce({
        id: "po-1",
        organizationId: "org-1",
        projectId: "project-1",
        createdBy: "user-1",
        createdAt: "",
        updatedAt: "2026-07-11T00:00:00.000Z",
        purchaseOrderTitle: "Worksheet Purchase Order",
        purchaseOrderNumber: "PO-001",
        status: "Draft",
        origin: "Material Supply",
        supplierId: "supplier-1",
        issuedToLabel: "Acme",
        supplierContact: "",
        supplierNameSnapshot: "Acme",
        supplierEmailSnapshot: "orders@acme.test",
        supplierPhoneSnapshot: "123",
        requestedBy: "",
        requestedDate: null,
        dueDate: null,
        sentToClientAt: null,
        approvedAt: null,
        invoiceReady: false,
        notes: "",
        labourTotal: 0,
        materialsTotal: 500,
        subcontractorsTotal: 0,
        plantTotal: 0,
        marginTotal: 0,
        subtotal: 500,
        marginPercent: 0,
        discountAmount: 0,
        contingencyAmount: 0,
        gstPercent: 15,
        gstTotal: 75,
        totalPurchaseOrderPrice: 575,
        includeMarginInExport: false,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
      });
    vi.mocked(getPurchaseOrderDetail)
      .mockResolvedValueOnce({
        purchaseOrder: null,
        lineItems: [],
        attachments: [],
      })
      .mockImplementationOnce(async () => ({
        purchaseOrder: null,
        lineItems: [
          {
            id: "line-1",
            lineUid: savedLineUid,
            sourceCostItemId: null,
          },
        ] as never,
        attachments: [],
      }));
    vi.mocked(savePurchaseOrderDraft).mockImplementation(async (_client, input) => {
      savedLineUid = input.lineItems[0]?.lineUid ?? null;
      return {
        id: "po-1",
        updatedAt: "2026-07-11T00:00:00.000Z",
        subtotal: 500,
        gstTotal: 75,
        totalPurchaseOrderPrice: 575,
        status: "Draft",
      };
    });
    vi.mocked(persistCommercialItemPurchaseOrderLinksSafely).mockResolvedValue({
      ok: true,
      links: [],
      errorMessage: null,
    });

    const result = await purchaseOrderDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "purchase_order",
        selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        commercialRows: [buildPublishedRow()],
        skippedRows: [],
      },
      publishedRows: [buildPublishedRow()],
      target: {
        mode: "new",
        supplierId: "supplier-1",
        purchaseOrderTitle: "Wall Framing Package",
        lineSelections: [{ rowId: "2", purchaseOrderSection: "Materials" }],
      },
    });

    expect(createPurchaseOrderDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: "Wall Framing Package",
    }));
    expect(savePurchaseOrderDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lineItems: [
        expect.objectContaining({
          description: "Steel framing",
          quantity: 10,
          unit: "lm",
          rate: 50,
          sourceCostItemId: null,
        }),
      ],
    }));
    expect(persistCommercialItemPurchaseOrderLinksSafely).toHaveBeenCalled();
    expect(result.message).toBe("1 row added to PO-001.");
  });

  it("maps labour worksheet rows into labour purchase order lines", async () => {
    const client = createMockClient();
    let savedLineUid: string | null = null;
    vi.mocked(listOrganizationSuppliers).mockResolvedValue([
      {
        id: "supplier-1",
        name: "Acme",
        company_name: "Acme",
        legal_name: null,
        email: "orders@acme.test",
        phone: "123",
        address: null,
        website: null,
        default_tax_rate_id: null,
        default_payment_terms: null,
        is_active: true,
        source: "manual",
        organization_id: "org-1",
        created_by: "user-1",
        created_at: "",
        updated_at: "",
      },
    ] as never);
    vi.mocked(createPurchaseOrderDraft).mockResolvedValue({
      id: "po-1",
      updatedAt: "2026-07-11T00:00:00.000Z",
      purchaseOrderNumber: "PO-001",
      purchaseOrderTitle: "Worksheet Purchase Order",
      status: "Draft",
      origin: "Site Expense",
    });
    vi.mocked(getPurchaseOrder)
      .mockResolvedValueOnce({
        id: "po-1",
        organizationId: "org-1",
        projectId: "project-1",
        createdBy: "user-1",
        createdAt: "",
        updatedAt: "2026-07-11T00:00:00.000Z",
        purchaseOrderTitle: "Worksheet Purchase Order",
        purchaseOrderNumber: "PO-001",
        status: "Draft",
        origin: "Site Expense",
        supplierId: null,
        issuedToLabel: "",
        supplierContact: "",
        supplierNameSnapshot: "",
        supplierEmailSnapshot: "",
        supplierPhoneSnapshot: "",
        requestedBy: "",
        requestedDate: null,
        dueDate: null,
        sentToClientAt: null,
        approvedAt: null,
        invoiceReady: false,
        notes: "",
        labourTotal: 0,
        materialsTotal: 0,
        subcontractorsTotal: 0,
        plantTotal: 0,
        marginTotal: 0,
        subtotal: 0,
        marginPercent: 0,
        discountAmount: 0,
        contingencyAmount: 0,
        gstPercent: 15,
        gstTotal: 0,
        totalPurchaseOrderPrice: 0,
        includeMarginInExport: false,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
      })
      .mockResolvedValueOnce({
        id: "po-1",
        organizationId: "org-1",
        projectId: "project-1",
        createdBy: "user-1",
        createdAt: "",
        updatedAt: "2026-07-11T00:00:00.000Z",
        purchaseOrderTitle: "Worksheet Purchase Order",
        purchaseOrderNumber: "PO-001",
        status: "Draft",
        origin: "Site Expense",
        supplierId: "supplier-1",
        issuedToLabel: "Acme",
        supplierContact: "",
        supplierNameSnapshot: "Acme",
        supplierEmailSnapshot: "orders@acme.test",
        supplierPhoneSnapshot: "123",
        requestedBy: "",
        requestedDate: null,
        dueDate: null,
        sentToClientAt: null,
        approvedAt: null,
        invoiceReady: false,
        notes: "",
        labourTotal: 680,
        materialsTotal: 0,
        subcontractorsTotal: 0,
        plantTotal: 0,
        marginTotal: 0,
        subtotal: 680,
        marginPercent: 0,
        discountAmount: 0,
        contingencyAmount: 0,
        gstPercent: 15,
        gstTotal: 102,
        totalPurchaseOrderPrice: 782,
        includeMarginInExport: false,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
      });
    vi.mocked(getPurchaseOrderDetail)
      .mockResolvedValueOnce({
        purchaseOrder: null,
        lineItems: [],
        attachments: [],
      })
      .mockImplementationOnce(async () => ({
        purchaseOrder: null,
        lineItems: [
          {
            id: "line-1",
            lineUid: savedLineUid,
            sourceCostItemId: null,
          },
        ] as never,
        attachments: [],
      }));
    vi.mocked(savePurchaseOrderDraft).mockImplementation(async (_client, input) => {
      savedLineUid = input.lineItems[0]?.lineUid ?? null;
      return {
        id: "po-1",
        updatedAt: "2026-07-11T00:00:00.000Z",
        subtotal: 680,
        gstTotal: 102,
        totalPurchaseOrderPrice: 782,
        status: "Draft",
      };
    });
    vi.mocked(persistCommercialItemPurchaseOrderLinksSafely).mockResolvedValue({
      ok: true,
      links: [],
      errorMessage: null,
    });

    await purchaseOrderDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "purchase_order",
        selectionRange: { startRowIndex: 4, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 4 },
        commercialRows: [
          buildPublishedRow({
            rowId: "5",
            rowLabel: "5",
            rowIndex: 4,
            sectionHeading: "Labour",
            rowCategoryHint: "Labour",
            description: "Installation labour",
            quantity: 8,
            unit: "hrs",
            rate: 85,
            total: 680,
          }),
        ],
        skippedRows: [],
      },
      publishedRows: [
        buildPublishedRow({
          rowId: "5",
          rowLabel: "5",
          rowIndex: 4,
          sectionHeading: "Labour",
          rowCategoryHint: "Labour",
          description: "Installation labour",
          quantity: 8,
          unit: "hrs",
          rate: 85,
          total: 680,
        }),
      ],
      target: {
        mode: "new",
        supplierId: "supplier-1",
        purchaseOrderTitle: "Labour Package",
        lineSelections: [{ rowId: "5", purchaseOrderSection: "Labour" }],
      },
    });

    expect(createPurchaseOrderDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: "Labour Package",
      origin: "Site Expense",
    }));
    expect(savePurchaseOrderDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lineItems: [
        expect.objectContaining({
          description: "Installation labour",
          section: "Labour",
          quantity: 8,
          unit: "hrs",
          rate: 85,
          sourceCostItemId: null,
        }),
      ],
    }));
  });

  it("returns a truthful partial-success message when source linking fails after the save", async () => {
    const client = createMockClient();
    let savedLineUid: string | null = null;
    vi.mocked(listOrganizationSuppliers).mockResolvedValue([
      {
        id: "supplier-1",
        name: "Acme",
        company_name: "Acme",
        legal_name: null,
        email: null,
        phone: null,
        address: null,
        website: null,
        default_tax_rate_id: null,
        default_payment_terms: null,
        is_active: true,
        source: "manual",
        organization_id: "org-1",
        created_by: "user-1",
        created_at: "",
        updated_at: "",
      },
    ] as never);
    vi.mocked(getPurchaseOrder).mockResolvedValue({
      id: "po-1",
      organizationId: "org-1",
      projectId: "project-1",
      createdBy: "user-1",
      createdAt: "",
      updatedAt: "2026-07-11T00:00:00.000Z",
      purchaseOrderTitle: "Draft PO",
      purchaseOrderNumber: "PO-001",
      status: "Draft",
      origin: "Material Supply",
      supplierId: "supplier-1",
      issuedToLabel: "Acme",
      supplierContact: "",
      supplierNameSnapshot: "Acme",
      supplierEmailSnapshot: "",
      supplierPhoneSnapshot: "",
      requestedBy: "",
      requestedDate: null,
      dueDate: null,
      sentToClientAt: null,
      approvedAt: null,
      invoiceReady: false,
      notes: "",
      labourTotal: 0,
      materialsTotal: 0,
      subcontractorsTotal: 0,
      plantTotal: 0,
      marginTotal: 0,
      subtotal: 0,
      marginPercent: 0,
      discountAmount: 0,
      contingencyAmount: 0,
      gstPercent: 15,
      gstTotal: 0,
      totalPurchaseOrderPrice: 0,
      includeMarginInExport: false,
      includeDiscountInExport: false,
      includeContingencyInExport: false,
    });
    vi.mocked(getPurchaseOrderDetail)
      .mockResolvedValueOnce({
        purchaseOrder: null,
        lineItems: [],
        attachments: [],
      })
      .mockImplementationOnce(async () => ({
        purchaseOrder: null,
        lineItems: [{ id: "line-1", lineUid: savedLineUid, sourceCostItemId: null }] as never,
        attachments: [],
      }));
    vi.mocked(savePurchaseOrderDraft).mockImplementation(async (_client, input) => {
      savedLineUid = input.lineItems[0]?.lineUid ?? null;
      return {
        id: "po-1",
        updatedAt: "2026-07-11T00:00:00.000Z",
        subtotal: 500,
        gstTotal: 75,
        totalPurchaseOrderPrice: 575,
        status: "Draft",
      };
    });
    vi.mocked(persistCommercialItemPurchaseOrderLinksSafely).mockResolvedValue({
      ok: false,
      links: [],
      errorMessage: "Commercial item purchase order linking failed.",
    });

    const result = await purchaseOrderDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "purchase_order",
        selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        commercialRows: [buildPublishedRow()],
        skippedRows: [{ rowId: "4", rowIndex: 3, rowLabel: "4", reason: "destination_excluded" }],
      },
      publishedRows: [buildPublishedRow()],
      target: {
        mode: "existing",
        purchaseOrderId: "po-1",
        supplierId: "supplier-1",
        lineSelections: [{ rowId: "2", purchaseOrderSection: "Materials" }],
      },
    });

    expect(result.partialLinkFailureMessage).toBe("Commercial item purchase order linking failed.");
    expect(result.message).toBe("1 row added to PO-001. 1 row skipped.");
  });

  it("preserves a total-only worksheet line by deriving quantity 1 and rate", async () => {
    const client = createMockClient();
    let savedLineUid: string | null = null;
    vi.mocked(listOrganizationSuppliers).mockResolvedValue([
      {
        id: "supplier-1",
        name: "Acme",
        company_name: "Acme",
        legal_name: null,
        email: null,
        phone: null,
        address: null,
        website: null,
        default_tax_rate_id: null,
        default_payment_terms: null,
        is_active: true,
        source: "manual",
        organization_id: "org-1",
        created_by: "user-1",
        created_at: "",
        updated_at: "",
      },
    ] as never);
    vi.mocked(getPurchaseOrder).mockResolvedValue({
      id: "po-1",
      organizationId: "org-1",
      projectId: "project-1",
      createdBy: "user-1",
      createdAt: "",
      updatedAt: "2026-07-11T00:00:00.000Z",
      purchaseOrderTitle: "Draft PO",
      purchaseOrderNumber: "PO-001",
      status: "Draft",
      origin: "General Purchase",
      supplierId: "supplier-1",
      issuedToLabel: "Acme",
      supplierContact: "",
      supplierNameSnapshot: "Acme",
      supplierEmailSnapshot: "",
      supplierPhoneSnapshot: "",
      requestedBy: "",
      requestedDate: null,
      dueDate: null,
      sentToClientAt: null,
      approvedAt: null,
      invoiceReady: false,
      notes: "",
      labourTotal: 0,
      materialsTotal: 0,
      subcontractorsTotal: 0,
      plantTotal: 0,
      marginTotal: 0,
      subtotal: 0,
      marginPercent: 0,
      discountAmount: 0,
      contingencyAmount: 0,
      gstPercent: 15,
      gstTotal: 0,
      totalPurchaseOrderPrice: 0,
      includeMarginInExport: false,
      includeDiscountInExport: false,
      includeContingencyInExport: false,
    });
    vi.mocked(getPurchaseOrderDetail)
      .mockResolvedValueOnce({
        purchaseOrder: null,
        lineItems: [],
        attachments: [],
      })
      .mockImplementationOnce(async () => ({
        purchaseOrder: null,
        lineItems: [{ id: "line-1", lineUid: savedLineUid, sourceCostItemId: null }] as never,
        attachments: [],
      }));
    vi.mocked(savePurchaseOrderDraft).mockImplementation(async (_client, input) => {
      savedLineUid = input.lineItems[0]?.lineUid ?? null;
      return {
        id: "po-1",
        updatedAt: "2026-07-11T00:00:00.000Z",
        subtotal: 0,
        gstTotal: 0,
        totalPurchaseOrderPrice: 0,
        status: "Draft",
      };
    });
    vi.mocked(persistCommercialItemPurchaseOrderLinksSafely).mockResolvedValue({
      ok: true,
      links: [],
      errorMessage: null,
    });

    await purchaseOrderDestinationAdapter.publish({
      client,
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      publishedSelection: {
        destination: "purchase_order",
        selectionRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        commercialRows: [
          buildPublishedRow({
            quantity: null,
            unit: null,
            rate: null,
            total: 2760,
          }),
        ],
        skippedRows: [],
      },
      publishedRows: [
        buildPublishedRow({
          quantity: null,
          unit: null,
          rate: null,
          total: 2760,
        }),
      ],
      target: {
        mode: "existing",
        purchaseOrderId: "po-1",
        supplierId: "supplier-1",
        lineSelections: [{ rowId: "2", purchaseOrderSection: "Materials" }],
      },
    });

    expect(savePurchaseOrderDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lineItems: [
        expect.objectContaining({
          quantity: 1,
          unit: "",
          rate: 2760,
        }),
      ],
    }));
  });
});
