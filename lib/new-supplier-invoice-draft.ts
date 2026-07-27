import type { SupplierInvoiceDraftExtraction } from "@/lib/supplier-invoice-document-extraction";

export type NewSupplierInvoiceDraftValues = {
  supplierId: string;
  invoiceNumber: string;
  supplierPoReference: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string;
};

export const emptyNewSupplierInvoiceDraftValues: NewSupplierInvoiceDraftValues = {
  supplierId: "",
  invoiceNumber: "",
  supplierPoReference: "",
  invoiceDate: "",
  dueDate: "",
  subtotal: "0.00",
  taxTotal: "0.00",
  total: "0.00",
  notes: "",
};

export function hasEnteredNewSupplierInvoiceDraftValues(
  values: NewSupplierInvoiceDraftValues
) {
  return Boolean(
    values.supplierId
      || values.invoiceNumber.trim()
      || values.supplierPoReference.trim()
      || values.invoiceDate
      || values.dueDate
      || values.notes.trim()
      || values.subtotal !== emptyNewSupplierInvoiceDraftValues.subtotal
      || values.taxTotal !== emptyNewSupplierInvoiceDraftValues.taxTotal
      || values.total !== emptyNewSupplierInvoiceDraftValues.total
  );
}

export function applyExtractedDraftToNewSupplierInvoiceValues(params: {
  current: NewSupplierInvoiceDraftValues;
  extraction: SupplierInvoiceDraftExtraction;
  selectedSupplierId?: string | null;
}) {
  const { current, extraction, selectedSupplierId } = params;

  return {
    supplierId:
      selectedSupplierId
      ?? (extraction.supplierMatch.status === "high_confidence"
        ? extraction.supplierMatch.supplierId
        : current.supplierId),
    invoiceNumber: extraction.header.invoiceNumber.value ?? current.invoiceNumber,
    supplierPoReference:
      extraction.header.supplierPoReference.value ?? current.supplierPoReference,
    invoiceDate: extraction.header.invoiceDate.value ?? current.invoiceDate,
    dueDate: extraction.header.dueDate.value ?? current.dueDate,
    subtotal:
      extraction.header.subtotal.value === null
        ? current.subtotal
        : Number(extraction.header.subtotal.value).toFixed(2),
    taxTotal:
      extraction.header.taxTotal.value === null
        ? current.taxTotal
        : Number(extraction.header.taxTotal.value).toFixed(2),
    total:
      extraction.header.total.value === null
        ? current.total
        : Number(extraction.header.total.value).toFixed(2),
    notes: extraction.header.notes.value ?? current.notes,
  } satisfies NewSupplierInvoiceDraftValues;
}
