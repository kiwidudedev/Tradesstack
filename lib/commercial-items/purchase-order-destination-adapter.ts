import type { WorksheetPublishDestinationAdapter } from "@/lib/commercial-items/destination-adapter";
import type { PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";
import {
  buildPurchaseOrderCommercialItemLink,
  persistCommercialItemPurchaseOrderLinksSafely,
} from "@/lib/commercial-items/purchase-order-linking";
import {
  createPurchaseOrderDraft,
  getPurchaseOrder,
  getPurchaseOrderDetail,
  listOrganizationSuppliers,
  savePurchaseOrderDraft,
} from "@/lib/purchase-orders/service";
import type { PurchaseOrderClient, PurchaseOrderCostSection, PurchaseOrderOrigin } from "@/lib/purchase-orders/types";
import { getSupplierDisplayName } from "@/lib/suppliers";

export interface PurchaseOrderPublishOption {
  id: string;
  purchaseOrderNumber: string;
  purchaseOrderTitle: string;
  status: string;
  supplierId: string | null;
  supplierLabel: string;
  updatedAt: string;
  lineItemCount: number;
}

export interface PurchaseOrderPublishLineSelection {
  rowId: string;
  purchaseOrderSection: Exclude<PurchaseOrderCostSection, "Margin">;
}

export type PurchaseOrderPublishTarget =
  | {
      mode: "new";
      supplierId: string;
      purchaseOrderTitle: string;
      lineSelections: PurchaseOrderPublishLineSelection[];
    }
  | {
      mode: "existing";
      purchaseOrderId: string;
      supplierId: string;
      lineSelections: PurchaseOrderPublishLineSelection[];
    };

export interface PurchaseOrderDestinationPublishResult {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  targetMode: PurchaseOrderPublishTarget["mode"];
  addedLineCount: number;
  skippedRowCount: number;
  partialLinkFailureMessage: string | null;
  message: string;
}

function rowCountLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function buildSuccessMessage(params: {
  purchaseOrderNumber: string;
  addedCount: number;
  skippedCount: number;
}) {
  const added = `${rowCountLabel(params.addedCount, "row")} added to ${params.purchaseOrderNumber}.`;
  if (params.skippedCount <= 0) {
    return added;
  }

  return `${added} ${rowCountLabel(params.skippedCount, "row")} skipped.`;
}

function derivePurchaseOrderOrigin(sections: Array<Exclude<PurchaseOrderCostSection, "Margin">>): PurchaseOrderOrigin {
  const uniqueSections = Array.from(new Set(sections));

  if (uniqueSections.length === 1) {
    switch (uniqueSections[0]) {
      case "Labour":
        return "Site Expense";
      case "Materials":
        return "Material Supply";
      case "Subcontractors":
        return "Subcontract Work";
      case "Plant":
        return "Plant / Equipment Hire";
      default:
        return "General Purchase";
    }
  }

  return "General Purchase";
}

async function listDraftPurchaseOrderPublishOptions(params: {
  client: PurchaseOrderClient;
  organizationId: string;
  projectId: string;
}): Promise<PurchaseOrderPublishOption[]> {
  const { data, error } = await params.client
    .from("project_purchase_orders")
    .select("id, purchase_order_number, purchase_order_title, status, supplier_id, issued_to_label, updated_at")
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .eq("status", "Draft")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const purchaseOrders = data ?? [];
  const detailRows = await Promise.all(
    purchaseOrders.map((row) =>
      getPurchaseOrderDetail(params.client, {
        organizationId: params.organizationId,
        purchaseOrderId: row.id,
      }),
    ),
  );

  return purchaseOrders.map((row, index) => ({
    id: row.id,
    purchaseOrderNumber: row.purchase_order_number,
    purchaseOrderTitle: row.purchase_order_title,
    status: row.status,
    supplierId: row.supplier_id ?? null,
    supplierLabel: row.issued_to_label ?? "",
    updatedAt: row.updated_at,
    lineItemCount: detailRows[index]?.lineItems.length ?? 0,
  }));
}

export async function resolvePurchaseOrderPublishOptions(params: {
  client: PurchaseOrderClient;
  organizationId: string;
  projectId: string;
}) {
  const [suppliers, draftPurchaseOrders] = await Promise.all([
    listOrganizationSuppliers(params.client, {
      organizationId: params.organizationId,
    }),
    listDraftPurchaseOrderPublishOptions(params),
  ]);

  return {
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      label: getSupplierDisplayName(supplier),
      email: supplier.email ?? null,
      phone: supplier.phone ?? null,
    })),
    draftPurchaseOrders,
  };
}

function buildPurchaseOrderLineDraft(params: {
  row: PublishedWorksheetCommercialRowWithItem;
  purchaseOrderSection: Exclude<PurchaseOrderCostSection, "Margin">;
}) {
  const lineUid = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    lineUid,
    costItemId: null,
    sourceCostItemId: null,
    section: params.purchaseOrderSection,
    description: params.row.description,
    quantity: params.row.quantity ?? 0,
    unit: params.row.unit ?? "",
    rate: params.row.rate ?? 0,
    sourceTimeSheetEntryId: null,
    commercialItemLink: buildPurchaseOrderCommercialItemLink(params.row.commercialItem),
  };
}

async function loadSupplierById(params: {
  client: PurchaseOrderClient;
  organizationId: string;
  supplierId: string;
}) {
  const suppliers = await listOrganizationSuppliers(params.client, {
    organizationId: params.organizationId,
  });

  const supplier = suppliers.find((candidate) => candidate.id === params.supplierId) ?? null;
  if (!supplier) {
    throw new Error("Select a supplier before adding rows to the purchase order.");
  }

  return supplier;
}

export const purchaseOrderDestinationAdapter: WorksheetPublishDestinationAdapter<
  PurchaseOrderPublishTarget,
  PurchaseOrderDestinationPublishResult
> = {
  destination: "purchase_order",
  async publish(input) {
    if (!input.projectId) {
      throw new Error("Purchase Orders are available after this opportunity is converted to a project.");
    }

    if (input.target.lineSelections.length === 0) {
      throw new Error("Select at least one eligible row before adding it to a purchase order.");
    }

    const supplier = await loadSupplierById({
      client: input.client,
      organizationId: input.organizationId,
      supplierId: input.target.supplierId,
    });
    const lineSelectionByRowId = new Map(
      input.target.lineSelections.map((selection) => [selection.rowId, selection]),
    );
    const appendedLineDrafts = input.publishedRows.map((row) => {
      const selection = lineSelectionByRowId.get(row.rowId);
      if (!selection) {
        throw new Error("One or more selected worksheet rows could not be mapped to the purchase order.");
      }

      return buildPurchaseOrderLineDraft({
        row,
        purchaseOrderSection: selection.purchaseOrderSection,
      });
    });

    const selectedSections = input.target.lineSelections.map((selection) => selection.purchaseOrderSection);

    let purchaseOrder = null;
    let detail = null;

    if (input.target.mode === "existing") {
      purchaseOrder = await getPurchaseOrder(input.client, {
        organizationId: input.organizationId,
        purchaseOrderId: input.target.purchaseOrderId,
      });

      if (!purchaseOrder || purchaseOrder.projectId !== input.projectId) {
        throw new Error("Selected purchase order no longer exists.");
      }

      if ((purchaseOrder.status ?? "Draft") !== "Draft") {
        throw new Error("Only draft purchase orders can receive worksheet rows.");
      }

      if (purchaseOrder.supplierId && purchaseOrder.supplierId !== supplier.id) {
        throw new Error("This purchase order is already assigned to a different supplier.");
      }

      detail = await getPurchaseOrderDetail(input.client, {
        organizationId: input.organizationId,
        purchaseOrderId: purchaseOrder.id,
      });
    } else {
      const created = await createPurchaseOrderDraft(input.client, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        title: input.target.purchaseOrderTitle,
        origin: derivePurchaseOrderOrigin(selectedSections),
      });

      purchaseOrder = await getPurchaseOrder(input.client, {
        organizationId: input.organizationId,
        purchaseOrderId: created.id,
      });

      if (!purchaseOrder) {
        throw new Error("Purchase order draft was created but could not be loaded.");
      }

      detail = await getPurchaseOrderDetail(input.client, {
        organizationId: input.organizationId,
        purchaseOrderId: purchaseOrder.id,
      });
    }

    const existingLineItems = detail?.lineItems ?? [];

    let savedPurchaseOrderNumber = purchaseOrder.purchaseOrderNumber;

    try {
      await savePurchaseOrderDraft(input.client, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        purchaseOrderId: purchaseOrder.id,
        expectedUpdatedAt: purchaseOrder.updatedAt,
        purchaseOrderTitle: purchaseOrder.purchaseOrderTitle,
        purchaseOrderNumber: purchaseOrder.purchaseOrderNumber,
        status: purchaseOrder.status,
        origin: purchaseOrder.origin || derivePurchaseOrderOrigin(selectedSections),
        supplierId: purchaseOrder.supplierId ?? supplier.id,
        issuedToLabel: purchaseOrder.issuedToLabel || getSupplierDisplayName(supplier),
        supplierContact: purchaseOrder.supplierContact || "",
        supplierNameSnapshot: purchaseOrder.supplierNameSnapshot || getSupplierDisplayName(supplier),
        supplierEmailSnapshot: purchaseOrder.supplierEmailSnapshot || supplier.email || "",
        supplierPhoneSnapshot: purchaseOrder.supplierPhoneSnapshot || supplier.phone || "",
        requestedBy: purchaseOrder.requestedBy || "",
        requestedDate: purchaseOrder.requestedDate ?? null,
        dueDate: purchaseOrder.dueDate ?? null,
        sentToClientAt: purchaseOrder.sentToClientAt ?? null,
        approvedAt: purchaseOrder.approvedAt ?? null,
        invoiceReady: purchaseOrder.invoiceReady,
        notes: purchaseOrder.notes,
        marginPercent: purchaseOrder.marginPercent,
        discountAmount: purchaseOrder.discountAmount,
        contingencyAmount: purchaseOrder.contingencyAmount,
        gstPercent: purchaseOrder.gstPercent,
        includeMarginInExport: purchaseOrder.includeMarginInExport,
        includeDiscountInExport: purchaseOrder.includeDiscountInExport,
        includeContingencyInExport: purchaseOrder.includeContingencyInExport,
        lineItems: [
          ...existingLineItems.map((line) => ({
            id: line.id,
            lineUid: line.lineUid,
            costItemId: line.costItemId,
            sourceCostItemId: line.sourceCostItemId,
            section: line.section,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            rate: line.rate,
            sourceTimeSheetEntryId: line.sourceTimeSheetEntryId,
          })),
          ...appendedLineDrafts.map((line) => ({
            id: line.id,
            lineUid: line.lineUid,
            costItemId: line.costItemId,
            sourceCostItemId: null,
            section: line.section,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            rate: line.rate,
            sourceTimeSheetEntryId: null,
          })),
        ],
        attachments: detail?.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.fileName,
          type: attachment.fileKind,
          storagePath: attachment.storagePath,
          externalUrl: attachment.externalUrl,
        })) ?? [],
      });

      const savedDetail = await getPurchaseOrderDetail(input.client, {
        organizationId: input.organizationId,
        purchaseOrderId: purchaseOrder.id,
      });
      const savedPurchaseOrder = await getPurchaseOrder(input.client, {
        organizationId: input.organizationId,
        purchaseOrderId: purchaseOrder.id,
      });
      savedPurchaseOrderNumber = savedPurchaseOrder?.purchaseOrderNumber || savedPurchaseOrderNumber;

      const savedLinesByUid = new Map(
        savedDetail.lineItems.map((line) => [line.lineUid, line]),
      );
      const linkableLines = appendedLineDrafts
        .map((line) => {
          const savedLine = line.lineUid ? savedLinesByUid.get(line.lineUid) ?? null : null;
          return savedLine
            ? {
                id: savedLine.id,
                lineUid: savedLine.lineUid,
                sourceCostItemId: savedLine.sourceCostItemId,
                commercialItemLink: line.commercialItemLink,
              }
            : null;
        })
        .filter((line): line is NonNullable<typeof line> => Boolean(line));

      const partialLinkFailureMessage =
        linkableLines.length === appendedLineDrafts.length
          ? (
              await persistCommercialItemPurchaseOrderLinksSafely({
                client: input.client,
                organizationId: input.organizationId,
                purchaseOrderId: purchaseOrder.id,
                lineItems: linkableLines,
              })
            ).errorMessage
          : "Rows were added to the purchase order, but worksheet source linking could not be completed.";

      return {
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderNumber: savedPurchaseOrderNumber,
        targetMode: input.target.mode,
        addedLineCount: appendedLineDrafts.length,
        skippedRowCount: input.publishedSelection.skippedRows.length,
        partialLinkFailureMessage,
        message: buildSuccessMessage({
          purchaseOrderNumber: savedPurchaseOrderNumber,
          addedCount: appendedLineDrafts.length,
          skippedCount: input.publishedSelection.skippedRows.length,
        }),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Unable to add rows to the purchase order.");
    }
  },
};
