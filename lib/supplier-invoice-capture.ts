import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { hasPdfSignature } from "@/lib/security/pdf-signature";
import {
  extractSupplierInvoiceDraft,
  type SupplierInvoiceDraftExtraction,
} from "@/lib/supplier-invoice-document-extraction";
import {
  buildSupplierInvoiceDocumentStoragePath,
  SUPPLIER_INVOICE_DOCUMENTS_BUCKET,
  validateSupplierInvoiceDocument,
  validateSupplierInvoicePdfDocument,
} from "@/lib/supplier-invoices";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveTaxJurisdiction } from "@/lib/jurisdiction/country";
import type { Json } from "@/lib/supabase/types";

export type CreateSupplierInvoiceCaptureResult = {
  ok: boolean;
  invoiceId?: string;
  error?: string;
};

export type ExtractSupplierInvoiceDraftPreviewResult = {
  ok: boolean;
  extraction?: SupplierInvoiceDraftExtraction;
  error?: string;
};

type CreateSupplierInvoiceCaptureLineInput = {
  id?: string;
  description?: string;
  supplierItemCode?: string | null;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  taxAmount?: number;
  costCodeId?: string | null;
  projectId?: string | null;
  sortOrder?: number;
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function numberValue(formData: FormData, key: string) {
  const value = Number(textValue(formData, key));
  return Number.isFinite(value) ? value : Number.NaN;
}

function createLineInputValue(value: unknown): CreateSupplierInvoiceCaptureLineInput[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Supplier Invoice lines must be a valid array.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Supplier Invoice lines must be a valid array.");
  }

  return parsed.map((line) => {
    if (!line || typeof line !== "object") {
      throw new Error("Supplier Invoice lines must be a valid array.");
    }
    const candidate = line as Record<string, unknown>;
    return {
      id: typeof candidate.id === "string" ? candidate.id : undefined,
      description: typeof candidate.description === "string" ? candidate.description : "",
      supplierItemCode:
        typeof candidate.supplierItemCode === "string"
          ? candidate.supplierItemCode
          : candidate.supplierItemCode === null
            ? null
            : undefined,
      quantity: typeof candidate.quantity === "number" ? candidate.quantity : Number(candidate.quantity),
      unitPrice: typeof candidate.unitPrice === "number" ? candidate.unitPrice : Number(candidate.unitPrice),
      lineTotal: typeof candidate.lineTotal === "number" ? candidate.lineTotal : Number(candidate.lineTotal),
      taxAmount: typeof candidate.taxAmount === "number" ? candidate.taxAmount : Number(candidate.taxAmount),
      costCodeId: null,
      projectId: null,
      sortOrder: typeof candidate.sortOrder === "number" ? candidate.sortOrder : Number(candidate.sortOrder),
    } satisfies CreateSupplierInvoiceCaptureLineInput;
  });
}

export function safeSupplierInvoiceCaptureError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const allowed = [
    "permission",
    "Select a valid Supplier",
    "invoice number",
    "invoice date",
    "Due date",
    "currency",
    "reconcile",
    "PO reference",
    "already exists",
    "description",
    "line",
    "negative",
    "25 MB",
    "PDF, JPEG",
    "document",
  ];
  return allowed.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : "Unable to create the Supplier Invoice. Refresh and try again.";
}

async function requireSupplierInvoiceCaptureContext() {
  const member = await getCurrentOrganizationMember();
  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new Error("You do not have permission to capture Supplier Invoices.");
  }
  if (!(await hasOrganizationPermission(member.organization_id, "supplier_invoices.capture"))) {
    throw new Error("You do not have permission to capture Supplier Invoices.");
  }
  return member;
}

export async function createSupplierInvoiceCaptureFromFormData(
  formData: FormData,
): Promise<CreateSupplierInvoiceCaptureResult> {
  const invoiceId = crypto.randomUUID();
  let storagePath: string | null = null;

  try {
    const member = await requireSupplierInvoiceCaptureContext();
    const fileValue = formData.get("document");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    const lines = createLineInputValue(formData.get("lines"));
    if (file) {
      validateSupplierInvoiceDocument(file);
    }

    const supabase = await createServerSupabaseClient();
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("country, default_currency")
      .eq("id", member.organization_id)
      .single();
    if (organizationError) {
      throw new Error(organizationError.message);
    }
    const jurisdiction = resolveTaxJurisdiction(organization.country);
    const captureCurrency = String(organization.default_currency ?? "").trim().toUpperCase();
    if (
      (jurisdiction === "NZ" && captureCurrency !== "NZD") ||
      (jurisdiction === "AU" && captureCurrency !== "AUD") ||
      jurisdiction === "unsupported"
    ) {
      throw new Error("The organization country and default currency are not supported for Supplier Invoices.");
    }
    const { error: createError } = await supabase.rpc("save_supplier_invoice_capture" as never, {
      p_invoice_id: invoiceId,
      p_supplier_id: textValue(formData, "supplierId") || null,
      p_invoice_number: textValue(formData, "invoiceNumber"),
      p_supplier_po_reference: textValue(formData, "supplierPoReference") || null,
      p_invoice_date: textValue(formData, "invoiceDate") || null,
      p_due_date: textValue(formData, "dueDate") || null,
      p_currency: captureCurrency,
      p_subtotal: numberValue(formData, "subtotal"),
      p_tax_total: numberValue(formData, "taxTotal"),
      p_total: numberValue(formData, "total"),
      p_notes: textValue(formData, "notes"),
      p_source: file ? "upload" : "manual",
      p_lines: lines as unknown as Json,
      p_create: true,
    } as never);
    if (createError) {
      throw new Error(createError.message);
    }

    if (file) {
      const documentId = crypto.randomUUID();
      storagePath = buildSupplierInvoiceDocumentStoragePath({
        organizationId: member.organization_id,
        supplierInvoiceId: invoiceId,
        documentId,
        fileName: file.name,
      });
      const { error: uploadError } = await supabase.storage
        .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        });
      if (uploadError) {
        throw new Error("Unable to upload the Supplier Invoice document.");
      }
      const { error: documentError } = await supabase.from("supplier_invoice_documents").insert({
        id: documentId,
        organization_id: member.organization_id,
        supplier_invoice_id: invoiceId,
        file_path: storagePath,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        document_type: "invoice",
        uploaded_by: member.user_id,
      });
      if (documentError) {
        throw new Error("Unable to associate the Supplier Invoice document.");
      }
      const { error: headerError } = await supabase
        .from("supplier_invoices")
        .update({
          document_file_path: storagePath,
          document_file_name: file.name,
          document_mime_type: file.type || null,
          document_size_bytes: file.size,
        })
        .eq("organization_id", member.organization_id)
        .eq("id", invoiceId);
      if (headerError) {
        throw new Error("Unable to associate the Supplier Invoice document.");
      }
    }

    revalidatePath("/app/company/supplier-invoices");

    return { ok: true, invoiceId };
  } catch (error) {
    const admin = createAdminSupabaseClient();
    if (storagePath) {
      await admin.storage.from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET).remove([storagePath]);
    }
    await admin.from("supplier_invoices").delete().eq("id", invoiceId);
    return { ok: false, error: safeSupplierInvoiceCaptureError(error) };
  }
}

export async function extractSupplierInvoiceDraftPreviewFromFormData(
  formData: FormData,
): Promise<ExtractSupplierInvoiceDraftPreviewResult> {
  try {
    const member = await requireSupplierInvoiceCaptureContext();
    const fileValue = formData.get("document");
    if (!(fileValue instanceof File) || fileValue.size <= 0) {
      throw new Error("A PDF file is required.");
    }

    validateSupplierInvoicePdfDocument(fileValue);
    if (!(await hasPdfSignature(fileValue))) {
      throw new Error("The uploaded file is not a valid PDF.");
    }

    const supabase = await createServerSupabaseClient();
    const suppliersResult = await supabase
      .from("organization_suppliers")
      .select("*")
      .eq("organization_id", member.organization_id)
      .eq("is_active", true)
      .order("company_name", { ascending: true })
      .order("name", { ascending: true });

    if (suppliersResult.error) {
      throw new Error(suppliersResult.error.message);
    }

    const extractionResult = await extractSupplierInvoiceDraft({
      supabase,
      organizationId: member.organization_id,
      supplierInvoiceId: crypto.randomUUID(),
      pdfFileName: fileValue.name,
      pdfBytes: new Uint8Array(await fileValue.arrayBuffer()),
      suppliers: (suppliersResult.data ?? []) as OrganizationSupplierRow[],
    });

    return {
      ok: true,
      extraction: extractionResult.draft,
    };
  } catch (error) {
    console.error("[supplier-invoice-preview-extraction] failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false, error: safeSupplierInvoiceCaptureError(error) };
  }
}
