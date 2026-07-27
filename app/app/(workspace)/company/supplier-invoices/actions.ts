"use server";

import type { SupplierInvoiceDraftExtraction } from "@/lib/supplier-invoice-document-extraction";
import {
  createSupplierInvoiceCaptureFromFormData,
  extractSupplierInvoiceDraftPreviewFromFormData,
  type CreateSupplierInvoiceCaptureResult,
  type ExtractSupplierInvoiceDraftPreviewResult,
} from "@/lib/supplier-invoice-capture";

export type CreateSupplierInvoiceActionResult = {
  ok: boolean;
  invoiceId?: string;
  error?: string;
};

export type ExtractSupplierInvoiceDraftPreviewActionResult = {
  ok: boolean;
  extraction?: SupplierInvoiceDraftExtraction;
  error?: string;
};

export async function createSupplierInvoiceAction(
  formData: FormData,
): Promise<CreateSupplierInvoiceActionResult> {
  return createSupplierInvoiceCaptureFromFormData(formData) as Promise<CreateSupplierInvoiceCaptureResult>;
}

export async function extractSupplierInvoiceDraftPreviewAction(
  formData: FormData
): Promise<ExtractSupplierInvoiceDraftPreviewActionResult> {
  return extractSupplierInvoiceDraftPreviewFromFormData(formData) as Promise<ExtractSupplierInvoiceDraftPreviewResult>;
}
