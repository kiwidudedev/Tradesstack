import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type RpcDeletePayload = {
  deletedInvoiceId?: string;
  storagePaths?: unknown;
};

export type SupplierInvoiceDeleteResult =
  | {
      ok: true;
      deletedInvoiceId: string;
      storageCleanupWarnings: string[];
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "permission_denied"
        | "posted_actual_cost"
        | "xero_payment"
        | "xero_export"
        | "delete_failed";
      message: string;
    };

function toStoragePaths(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function mapDeleteError(error: unknown): SupplierInvoiceDeleteResult {
  const message = error instanceof Error ? error.message : "The Supplier Invoice could not be deleted. No records were removed.";
  const lower = message.toLowerCase();

  if (lower.includes("already been deleted") || lower.includes("no longer exists")) {
    return { ok: false, code: "not_found", message };
  }
  if (lower.includes("permission")) {
    return { ok: false, code: "permission_denied", message };
  }
  if (lower.includes("posted actual costs")) {
    return { ok: false, code: "posted_actual_cost", message };
  }
  if (lower.includes("payment has been recorded")) {
    return { ok: false, code: "xero_payment", message };
  }
  if (lower.includes("xero")) {
    return { ok: false, code: "xero_export", message };
  }

  return {
    ok: false,
    code: "delete_failed",
    message: "The Supplier Invoice could not be deleted. No records were removed.",
  };
}

export async function deleteSupplierInvoice(params: {
  organizationId: string;
  supplierInvoiceId: string;
  supabase: SupabaseClient<Database>;
}): Promise<SupplierInvoiceDeleteResult> {
  try {
    const { data, error } = await params.supabase.rpc("delete_supplier_invoice" as never, {
      p_organization_id: params.organizationId,
      p_supplier_invoice_id: params.supplierInvoiceId,
    } as never);

    if (error) {
      throw new Error(error.message);
    }

    const payload = (data ?? {}) as RpcDeletePayload;
    const deletedInvoiceId =
      typeof payload.deletedInvoiceId === "string" && payload.deletedInvoiceId.trim().length > 0
        ? payload.deletedInvoiceId
        : params.supplierInvoiceId;
    const storagePaths = Array.from(new Set(toStoragePaths(payload.storagePaths)));
    const storageCleanupWarnings: string[] = [];

    if (storagePaths.length > 0) {
      const admin = createAdminSupabaseClient();
      const removalResult = await admin.storage
        .from("supplier-invoice-documents")
        .remove(storagePaths);

      if (removalResult.error) {
        const warning = `Storage cleanup failed for Supplier Invoice ${deletedInvoiceId}.`;
        console.error(warning, {
          supplierInvoiceId: deletedInvoiceId,
          errorCode: removalResult.error.name ?? "storage_cleanup_failed",
        });
        storageCleanupWarnings.push(warning);
      }
    }

    return {
      ok: true,
      deletedInvoiceId,
      storageCleanupWarnings,
    };
  } catch (error) {
    console.error("Supplier Invoice delete failed.", {
      supplierInvoiceId: params.supplierInvoiceId,
      organizationId: params.organizationId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return mapDeleteError(error);
  }
}
