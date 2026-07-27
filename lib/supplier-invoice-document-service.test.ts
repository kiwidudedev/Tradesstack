import { describe, expect, it } from "vitest";
import { queueSupplierInvoiceDocumentExtraction } from "@/lib/supplier-invoice-document-service";

type QueryResult = {
  data: unknown;
  error: null | { message: string };
};

function makeExtractionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "extraction-1",
    organization_id: "org-1",
    supplier_invoice_id: "invoice-1",
    supplier_invoice_document_id: "document-1",
    status: "failed",
    requested_by: "user-1",
    schema_version: "supplier-invoice-extraction-v1",
    idempotency_key: "document-1:current",
    provider: null,
    model: null,
    attempt_number: 1,
    extracted_payload_json: null,
    warnings_json: [],
    error_code: "extraction_failed",
    error_message: "Unable to extract invoice data.",
    started_at: null,
    completed_at: "2026-07-18T00:00:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

function makeInvoiceRow() {
  return {
    id: "invoice-1",
    organization_id: "org-1",
    status: "captured",
  };
}

function makeSupabase(params: {
  latestExtraction: QueryResult;
  insertResult?: QueryResult;
}) {
  let insertedPayload: Record<string, unknown> | null = null;
  let rpcCalls = 0;

  const extractionSelectBuilder = {
    eq() {
      return extractionSelectBuilder;
    },
    order() {
      return extractionSelectBuilder;
    },
    limit() {
      return extractionSelectBuilder;
    },
    maybeSingle() {
      return Promise.resolve(params.latestExtraction);
    },
  };

  const supplierInvoicesBuilder = {
    eq() {
      return supplierInvoicesBuilder;
    },
    maybeSingle() {
      return Promise.resolve({
        data: makeInvoiceRow(),
        error: null,
      });
    },
  };

  const lockedDocumentsBuilder = {
    eq() {
      return lockedDocumentsBuilder;
    },
    in() {
      return lockedDocumentsBuilder;
    },
    maybeSingle() {
      return Promise.resolve({
        data: null,
        error: null,
      });
    },
  };

  const postedEventsBuilder = {
    eq() {
      return postedEventsBuilder;
    },
    maybeSingle() {
      return Promise.resolve({
        data: null,
        error: null,
      });
    },
  };

  const extractionInsertBuilder = {
    select() {
      return {
        single() {
          return Promise.resolve(
            params.insertResult ?? {
              data: makeExtractionRow({
                id: "extraction-2",
                status: "queued",
                idempotency_key: String(insertedPayload?.idempotency_key ?? ""),
                attempt_number: Number(insertedPayload?.attempt_number ?? 2),
                error_code: null,
                error_message: null,
                completed_at: null,
              }),
              error: null,
            }
          );
        },
      };
    },
  };

  const supabase = {
    from(table: string) {
      if (table === "supplier_invoices") {
        return {
          select() {
            return supplierInvoicesBuilder;
          },
        };
      }

      if (table === "organization_accounting_documents") {
        return {
          select() {
            return lockedDocumentsBuilder;
          },
        };
      }

      if (table === "project_actual_cost_events") {
        return {
          select() {
            return postedEventsBuilder;
          },
        };
      }

      if (table === "supplier_invoice_document_extractions") {
        return {
          select() {
            return extractionSelectBuilder;
          },
          insert(payload: Record<string, unknown>) {
            insertedPayload = payload;
            return extractionInsertBuilder;
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc() {
      rpcCalls += 1;
      return Promise.resolve({ error: null });
    },
  };

  return {
    supabase: supabase as never,
    getInsertedPayload: () => insertedPayload,
    getRpcCalls: () => rpcCalls,
  };
}

describe("queueSupplierInvoiceDocumentExtraction", () => {
  it("reuses the latest failed current-document extraction when force is false", async () => {
    const latestExtraction = makeExtractionRow();
    const { supabase, getInsertedPayload, getRpcCalls } = makeSupabase({
      latestExtraction: {
        data: latestExtraction,
        error: null,
      },
    });

    const result = await queueSupplierInvoiceDocumentExtraction({
      supabase,
      organizationId: "org-1",
      userId: "user-1",
      supplierInvoiceId: "invoice-1",
      supplierInvoiceDocumentId: "document-1",
      force: false,
    });

    expect(result).toMatchObject({
      id: "extraction-1",
      status: "failed",
      idempotency_key: "document-1:current",
      attempt_number: 1,
    });
    expect(getInsertedPayload()).toBeNull();
    expect(getRpcCalls()).toBe(0);
  });

  it("creates a fresh retry extraction when force is true", async () => {
    const latestExtraction = makeExtractionRow();
    const { supabase, getInsertedPayload, getRpcCalls } = makeSupabase({
      latestExtraction: {
        data: latestExtraction,
        error: null,
      },
    });

    const result = await queueSupplierInvoiceDocumentExtraction({
      supabase,
      organizationId: "org-1",
      userId: "user-1",
      supplierInvoiceId: "invoice-1",
      supplierInvoiceDocumentId: "document-1",
      force: true,
    });

    const insertedPayload = getInsertedPayload();
    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload?.attempt_number).toBe(2);
    expect(insertedPayload?.idempotency_key).toEqual(expect.stringMatching(/^document-1:retry:/));
    expect(result).toMatchObject({
      id: "extraction-2",
      status: "queued",
      attempt_number: 2,
    });
    expect(getRpcCalls()).toBe(1);
  });
});
