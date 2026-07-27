import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPdfSignature } from "@/lib/security/pdf-signature";
import {
  extractSupplierInvoiceDraft,
  type SupplierInvoiceDraftExtraction,
} from "@/lib/supplier-invoice-document-extraction";
import type { Database } from "@/lib/supabase/types";
import type { Json } from "@/lib/supabase/types";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import {
  buildSupplierInvoiceDocumentStoragePath,
  normalizeSupplierInvoiceNumber,
  SUPPLIER_INVOICE_DOCUMENTS_BUCKET,
  type SupplierInvoiceDocumentExtractionRow,
  type SupplierInvoiceDocumentRow,
  type SupplierInvoiceRow,
  validateSupplierInvoicePdfDocument,
} from "@/lib/supplier-invoices";

type AppSupabaseClient = SupabaseClient<Database>;

const LOCKED_XERO_EXPORT_STATUSES = ["queued", "exporting", "exported", "attention_required"] as const;
const EXTRACTION_SCHEMA_VERSION = "supplier-invoice-extraction-v1";

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function mapSupplierInvoiceDocumentRow(value: unknown): SupplierInvoiceDocumentRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string"
    || typeof row.organization_id !== "string"
    || typeof row.supplier_invoice_id !== "string"
    || typeof row.file_path !== "string"
    || typeof row.file_name !== "string"
    || typeof row.document_type !== "string"
    || typeof row.created_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    supplier_invoice_id: row.supplier_invoice_id,
    file_path: row.file_path,
    file_name: row.file_name,
    mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
    size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    document_type: row.document_type,
    uploaded_by: typeof row.uploaded_by === "string" ? row.uploaded_by : null,
    created_at: row.created_at,
    is_current: row.is_current === true,
    superseded_at: typeof row.superseded_at === "string" ? row.superseded_at : null,
    superseded_by_document_id:
      typeof row.superseded_by_document_id === "string" ? row.superseded_by_document_id : null,
  };
}

function mapSupplierInvoiceDocumentExtractionRow(value: unknown): SupplierInvoiceDocumentExtractionRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string"
    || typeof row.organization_id !== "string"
    || typeof row.supplier_invoice_id !== "string"
    || typeof row.supplier_invoice_document_id !== "string"
    || typeof row.status !== "string"
    || typeof row.schema_version !== "string"
    || typeof row.idempotency_key !== "string"
    || typeof row.attempt_number !== "number"
    || typeof row.created_at !== "string"
    || typeof row.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    supplier_invoice_id: row.supplier_invoice_id,
    supplier_invoice_document_id: row.supplier_invoice_document_id,
    status:
      row.status === "queued" || row.status === "processing" || row.status === "completed" || row.status === "failed"
        ? row.status
        : "failed",
    requested_by: typeof row.requested_by === "string" ? row.requested_by : null,
    schema_version: row.schema_version,
    idempotency_key: row.idempotency_key,
    provider: typeof row.provider === "string" ? row.provider : null,
    model: typeof row.model === "string" ? row.model : null,
    attempt_number: row.attempt_number,
    extracted_payload_json:
      row.extracted_payload_json && typeof row.extracted_payload_json === "object" && !Array.isArray(row.extracted_payload_json)
        ? (row.extracted_payload_json as Record<string, unknown>)
        : null,
    warnings_json: Array.isArray(row.warnings_json)
      ? row.warnings_json.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item)
        )
      : [],
    error_code: typeof row.error_code === "string" ? row.error_code : null,
    error_message: typeof row.error_message === "string" ? row.error_message : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getSupplierInvoiceEditabilityState(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const [{ data: invoice, error: invoiceError }, { data: lockedDocument, error: lockedError }, { data: postedEvent, error: postedError }] = await Promise.all([
    params.supabase
      .from("supplier_invoices")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("id", params.supplierInvoiceId)
      .maybeSingle(),
    params.supabase
      .from("organization_accounting_documents")
      .select("id, export_status")
      .eq("organization_id", params.organizationId)
      .eq("local_document_id", params.supplierInvoiceId)
      .in("export_status", [...LOCKED_XERO_EXPORT_STATUSES])
      .maybeSingle(),
    params.supabase
      .from("project_actual_cost_events")
      .select("id, event_status")
      .eq("organization_id", params.organizationId)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("event_status", "posted")
      .maybeSingle(),
  ]);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }
  if (lockedError) {
    throw new Error(lockedError.message);
  }
  if (postedError) {
    throw new Error(postedError.message);
  }

  if (!invoice) {
    throw new Error("Supplier Invoice not found.");
  }
  if (lockedDocument) {
    throw new Error("This Supplier Invoice is locked by its Xero export state.");
  }
  if (postedEvent) {
    throw new Error("This invoice has posted actual costs. Correct posted costs with reversal entries before editing the invoice.");
  }

  return invoice as SupplierInvoiceRow;
}

async function loadCurrentSupplierInvoiceDocument(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const { data, error } = await params.supabase
    .from("supplier_invoice_documents" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapSupplierInvoiceDocumentRow(data);
}

async function loadLatestSupplierInvoiceDocumentExtraction(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
  supplierInvoiceDocumentId: string | null;
}) {
  if (!params.supplierInvoiceDocumentId) {
    return null;
  }

  const { data, error } = await params.supabase
    .from("supplier_invoice_document_extractions" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("supplier_invoice_document_id", params.supplierInvoiceDocumentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapSupplierInvoiceDocumentExtractionRow(data);
}

export async function loadSupplierInvoiceDocumentState(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const currentDocument = await loadCurrentSupplierInvoiceDocument(params);
  const extraction = await loadLatestSupplierInvoiceDocumentExtraction({
    ...params,
    supplierInvoiceDocumentId: currentDocument?.id ?? null,
  });

  return { currentDocument, extraction };
}

async function recordSupplierInvoiceActivity(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
  userId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await params.supabase.rpc("record_supplier_invoice_activity_event", {
    p_organization_id: params.organizationId,
    p_supplier_invoice_id: params.supplierInvoiceId,
    p_event_type: params.eventType,
    p_message: params.message,
    p_metadata: (params.metadata ?? {}) as Json,
    p_created_by: params.userId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function attachOrReplaceSupplierInvoiceDocument(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  userId: string;
  supplierInvoiceId: string;
  file: File;
}) {
  validateSupplierInvoicePdfDocument(params.file);
  if (!(await hasPdfSignature(params.file))) {
    throw new Error("The uploaded file is not a valid PDF.");
  }

  await getSupplierInvoiceEditabilityState({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });

  const previousCurrentDocument = await loadCurrentSupplierInvoiceDocument({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });

  const documentId = crypto.randomUUID();
  const storagePath = buildSupplierInvoiceDocumentStoragePath({
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    documentId,
    fileName: params.file.name,
  });

  const { error: uploadError } = await params.supabase.storage
    .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
    .upload(storagePath, params.file, {
      cacheControl: "3600",
      contentType: params.file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Unable to upload the Supplier Invoice document.");
  }

  const nowIso = new Date().toISOString();
  let insertedDocumentId: string | null = null;

  try {
    const { data: insertedDocument, error: insertError } = await params.supabase
      .from("supplier_invoice_documents" as never)
      .insert({
        id: documentId,
        organization_id: params.organizationId,
        supplier_invoice_id: params.supplierInvoiceId,
        file_path: storagePath,
        file_name: params.file.name,
        mime_type: params.file.type || "application/pdf",
        size_bytes: params.file.size,
        document_type: "invoice",
        uploaded_by: params.userId,
        is_current: previousCurrentDocument ? false : true,
        superseded_at: null,
        superseded_by_document_id: null,
      } as never)
      .select("*")
      .single();

    if (insertError || !insertedDocument) {
      throw new Error(insertError?.message ?? "Unable to create the Supplier Invoice document record.");
    }
    insertedDocumentId = documentId;

    if (previousCurrentDocument) {
      const { error: supersedeError } = await params.supabase
        .from("supplier_invoice_documents" as never)
        .update({
          is_current: false,
          superseded_at: nowIso,
          superseded_by_document_id: documentId,
        } as never)
        .eq("organization_id", params.organizationId)
        .eq("id", previousCurrentDocument.id);

      if (supersedeError) {
        throw new Error(supersedeError.message);
      }

      const { error: markCurrentError } = await params.supabase
        .from("supplier_invoice_documents" as never)
        .update({
          is_current: true,
          superseded_at: null,
          superseded_by_document_id: null,
        } as never)
        .eq("organization_id", params.organizationId)
        .eq("id", documentId);

      if (markCurrentError) {
        throw new Error(markCurrentError.message);
      }
    }

    const { error: headerError } = await params.supabase
      .from("supplier_invoices")
      .update({
        source: "upload",
        document_file_path: storagePath,
        document_file_name: params.file.name,
        document_mime_type: params.file.type || "application/pdf",
        document_size_bytes: params.file.size,
      })
      .eq("organization_id", params.organizationId)
      .eq("id", params.supplierInvoiceId);

    if (headerError) {
      throw new Error(headerError.message);
    }

    await recordSupplierInvoiceActivity({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      userId: params.userId,
      eventType: previousCurrentDocument ? "document_replaced" : "document_uploaded",
      message: previousCurrentDocument
        ? "Supplier Invoice PDF replaced for extraction and preview."
        : "Supplier Invoice PDF uploaded for extraction and preview.",
      metadata: {
        documentId,
        previousDocumentId: previousCurrentDocument?.id ?? null,
        fileName: params.file.name,
        sizeBytes: params.file.size,
      },
    });

    const currentDocument = await loadCurrentSupplierInvoiceDocument({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
    });

    return {
      currentDocument,
      invoiceUpdate: {
        source: "upload" as const,
        document_file_path: storagePath,
        document_file_name: params.file.name,
        document_mime_type: params.file.type || "application/pdf",
        document_size_bytes: params.file.size,
      },
    };
  } catch (error) {
    if (insertedDocumentId) {
      await params.supabase
        .from("supplier_invoice_documents" as never)
        .delete()
        .eq("organization_id", params.organizationId)
        .eq("id", insertedDocumentId);
    }

    if (previousCurrentDocument) {
      await params.supabase
        .from("supplier_invoice_documents" as never)
        .update({
          is_current: true,
          superseded_at: null,
          superseded_by_document_id: null,
        } as never)
        .eq("organization_id", params.organizationId)
        .eq("id", previousCurrentDocument.id);
    }

    await params.supabase.storage
      .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
      .remove([storagePath])
      .catch(() => undefined);

    throw new Error(toErrorMessage(error, "Unable to attach the Supplier Invoice document."));
  }
}

export async function queueSupplierInvoiceDocumentExtraction(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  userId: string;
  supplierInvoiceId: string;
  supplierInvoiceDocumentId: string;
  force: boolean;
}) {
  await getSupplierInvoiceEditabilityState({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });

  const latest = await loadLatestSupplierInvoiceDocumentExtraction({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    supplierInvoiceDocumentId: params.supplierInvoiceDocumentId,
  });

  if (latest && (latest.status === "queued" || latest.status === "processing")) {
    return latest;
  }

  if (latest && !params.force) {
    return latest;
  }

  const attemptNumber = latest ? latest.attempt_number + 1 : 1;
  const idempotencyKey = params.force
    ? `${params.supplierInvoiceDocumentId}:retry:${crypto.randomUUID()}`
    : `${params.supplierInvoiceDocumentId}:current`;

  const { data, error } = await params.supabase
    .from("supplier_invoice_document_extractions" as never)
    .insert({
      organization_id: params.organizationId,
      supplier_invoice_id: params.supplierInvoiceId,
      supplier_invoice_document_id: params.supplierInvoiceDocumentId,
      status: "queued",
      requested_by: params.userId,
      schema_version: EXTRACTION_SCHEMA_VERSION,
      idempotency_key: idempotencyKey,
      attempt_number: attemptNumber,
      extracted_payload_json: null,
      warnings_json: [],
      error_code: null,
      error_message: null,
      started_at: null,
      completed_at: null,
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    const activeExtraction = await loadLatestSupplierInvoiceDocumentExtraction({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      supplierInvoiceDocumentId: params.supplierInvoiceDocumentId,
    });
    if (activeExtraction && (activeExtraction.status === "queued" || activeExtraction.status === "processing")) {
      return activeExtraction;
    }
    throw new Error(error?.message ?? "Unable to queue document extraction.");
  }

  const extraction = mapSupplierInvoiceDocumentExtractionRow(data);
  if (!extraction) {
    throw new Error("Unable to load the queued extraction attempt.");
  }

  await recordSupplierInvoiceActivity({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    userId: params.userId,
    eventType: params.force ? "document_extraction_retried" : "document_extraction_queued",
    message: params.force
      ? "Supplier Invoice document extraction retried."
      : "Supplier Invoice document extraction queued.",
    metadata: {
      extractionId: extraction.id,
      documentId: params.supplierInvoiceDocumentId,
      attemptNumber: extraction.attempt_number,
    },
  });

  return extraction;
}

function classifyExtractionFailure(error: unknown) {
  const message = toErrorMessage(error, "Unable to extract invoice data.");
  const normalized = message.toLowerCase();
  if (normalized.includes("password")) {
    return { code: "password_protected_pdf", message };
  }
  if (normalized.includes("openai")) {
    return { code: "provider_request_failed", message };
  }
  if (normalized.includes("invalid extraction json") || normalized.includes("malformed")) {
    return { code: "invalid_model_output", message };
  }
  if (normalized.includes("valid pdf")) {
    return { code: "invalid_pdf_signature", message };
  }
  if (normalized.includes("read this pdf")) {
    return { code: "corrupt_or_unreadable_pdf", message };
  }
  return { code: "extraction_failed", message };
}

export async function processSupplierInvoiceDocumentExtraction(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  userId: string;
  supplierInvoiceId: string;
  extractionId: string;
}) {
  const { data: extractionData, error: extractionError } = await params.supabase
    .from("supplier_invoice_document_extractions" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("id", params.extractionId)
    .maybeSingle();

  if (extractionError) {
    throw new Error(extractionError.message);
  }

  const extraction = mapSupplierInvoiceDocumentExtractionRow(extractionData);
  if (!extraction) {
    throw new Error("Document extraction not found.");
  }

  if (extraction.status === "completed") {
    return extraction;
  }

  await getSupplierInvoiceEditabilityState({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });

  const currentDocument = await loadCurrentSupplierInvoiceDocument({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });

  if (!currentDocument || currentDocument.id !== extraction.supplier_invoice_document_id) {
    throw new Error("The extraction target is no longer the current Supplier Invoice document.");
  }

  const { error: markProcessingError } = await params.supabase
    .from("supplier_invoice_document_extractions" as never)
    .update({
      status: "processing",
      provider: null,
      model: null,
      error_code: null,
      error_message: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    } as never)
    .eq("organization_id", params.organizationId)
    .eq("id", extraction.id);

  if (markProcessingError) {
    throw new Error(markProcessingError.message);
  }

  try {
    const { data: fileBlob, error: downloadError } = await params.supabase.storage
      .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
      .download(currentDocument.file_path);

    if (downloadError || !fileBlob) {
      throw new Error("Unable to download the current Supplier Invoice PDF.");
    }

    const suppliersResult = await params.supabase
      .from("organization_suppliers")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("is_active", true)
      .order("company_name", { ascending: true })
      .order("name", { ascending: true });

    if (suppliersResult.error) {
      throw new Error(suppliersResult.error.message);
    }

    const draftResult = await extractSupplierInvoiceDraft({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      pdfFileName: currentDocument.file_name,
      pdfBytes: new Uint8Array(await fileBlob.arrayBuffer()),
      suppliers: (suppliersResult.data ?? []) as OrganizationSupplierRow[],
    });

    const { data: updatedData, error: updateError } = await params.supabase
      .from("supplier_invoice_document_extractions" as never)
      .update({
        status: "completed",
        provider: draftResult.provider,
        model: draftResult.model,
        extracted_payload_json: draftResult.draft as unknown as Record<string, unknown>,
        warnings_json: draftResult.draft.warnings as unknown as Record<string, unknown>[],
        error_code: null,
        error_message: null,
        completed_at: new Date().toISOString(),
      } as never)
      .eq("organization_id", params.organizationId)
      .eq("id", extraction.id)
      .select("*")
      .single();

    if (updateError || !updatedData) {
      throw new Error(updateError?.message ?? "Unable to store the extracted invoice draft.");
    }

    await recordSupplierInvoiceActivity({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      userId: params.userId,
      eventType: "document_extraction_completed",
      message: "Supplier Invoice draft extraction completed.",
      metadata: {
        extractionId: extraction.id,
        documentId: currentDocument.id,
        attemptNumber: extraction.attempt_number,
        provider: draftResult.provider,
        model: draftResult.model,
        warningCount: draftResult.draft.warnings.length,
        normalizedInvoiceNumber: normalizeSupplierInvoiceNumber(
          draftResult.draft.header.invoiceNumber.value
        ) || null,
      },
    });

    const updatedExtraction = mapSupplierInvoiceDocumentExtractionRow(updatedData);
    if (!updatedExtraction) {
      throw new Error("Unable to load the completed extraction.");
    }

    return updatedExtraction;
  } catch (error) {
    const classified = classifyExtractionFailure(error);
    const { data: failedData, error: failedUpdateError } = await params.supabase
      .from("supplier_invoice_document_extractions" as never)
      .update({
        status: "failed",
        error_code: classified.code,
        error_message: classified.message,
        warnings_json: [],
        completed_at: new Date().toISOString(),
      } as never)
      .eq("organization_id", params.organizationId)
      .eq("id", extraction.id)
      .select("*")
      .single();

    if (!failedUpdateError) {
      await recordSupplierInvoiceActivity({
        supabase: params.supabase,
        organizationId: params.organizationId,
        supplierInvoiceId: params.supplierInvoiceId,
        userId: params.userId,
        eventType: "document_extraction_failed",
        message: "Supplier Invoice draft extraction failed.",
        metadata: {
          extractionId: extraction.id,
          documentId: extraction.supplier_invoice_document_id,
          errorCode: classified.code,
        },
      }).catch(() => undefined);
    }

    if (failedUpdateError) {
      throw new Error(failedUpdateError.message);
    }

    const failedExtraction = mapSupplierInvoiceDocumentExtractionRow(failedData);
    if (!failedExtraction) {
      throw new Error(classified.message);
    }

    return failedExtraction;
  }
}
