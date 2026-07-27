import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { resolveCurrentSupplierInvoiceTax } from "@/lib/supplier-invoice-tax-resolution-server";
import { SUPPLIER_INVOICE_TAX_RESOLVER_VERSION } from "@/lib/supplier-invoice-tax-resolution";

type ServerSupabase = SupabaseClient<Database>;

export type SupplierInvoiceTaxRepairReport = {
  supplierInvoiceId: string;
  financeHash: string;
  dryRun: boolean;
  scanned: number;
  automaticallyResolved: number;
  alreadyResolved: number;
  accountsReviewRequired: number;
  unsupportedJurisdiction: number;
  missingXeroMapping: number;
  mixedTaxTreatment: number;
  unsupportedCurrency: number;
  locked: number;
  exported: number;
};

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function repairSupplierInvoiceTax(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  dryRun: boolean;
  expectedFinanceHash?: string;
}): Promise<SupplierInvoiceTaxRepairReport> {
  const hashResult = await params.supabase.rpc("supplier_invoice_finance_version_hash", {
    p_invoice_id: params.supplierInvoiceId,
  });
  if (hashResult.error || typeof hashResult.data !== "string") {
    throw new Error(hashResult.error?.message ?? "Supplier Invoice finance version is unavailable.");
  }
  const financeHash = hashResult.data;
  if (!params.dryRun && params.expectedFinanceHash !== financeHash) {
    throw new Error("The Supplier Invoice changed after the GST repair dry-run. Run the dry-run again.");
  }
  const resolution = await resolveCurrentSupplierInvoiceTax(params);
  const resolutions: Json = resolution.status === "exception"
    ? [{ status: "accounts_review", reason: resolution.reason }]
    : resolution.lines.map((line) => ({
        status: "resolved",
        lineId: line.lineId,
        accountingTaxRateId: line.accountingTaxRateId,
      }));
  const repairResult = await params.supabase.rpc("repair_supplier_invoice_allocation_tax" as never, {
    p_organization_id: params.organizationId,
    p_supplier_invoice_id: params.supplierInvoiceId,
    p_expected_finance_hash: financeHash,
    p_resolutions: resolutions,
    p_resolver_version: SUPPLIER_INVOICE_TAX_RESOLVER_VERSION,
    p_dry_run: params.dryRun,
  } as never) as unknown as { data: Json | null; error: { message: string } | null };
  if (repairResult.error) throw new Error(repairResult.error.message);
  const report = repairResult.data && typeof repairResult.data === "object" && !Array.isArray(repairResult.data)
    ? repairResult.data as Record<string, unknown>
    : {};
  const exceptionReason = resolution.status === "exception" ? resolution.reason : null;
  return {
    supplierInvoiceId: params.supplierInvoiceId,
    financeHash,
    dryRun: params.dryRun,
    scanned: numberField(report.scanned),
    automaticallyResolved: numberField(report.automaticallyResolved),
    alreadyResolved: numberField(report.alreadyResolved),
    accountsReviewRequired: numberField(report.accountsReviewRequired),
    unsupportedJurisdiction: exceptionReason === "missing_organization_configuration" ? 1 : 0,
    missingXeroMapping: exceptionReason === "missing_xero_tax_rate" || exceptionReason === "ambiguous_xero_tax_rate" ? 1 : 0,
    mixedTaxTreatment: exceptionReason === "mixed_tax_treatments" ? 1 : 0,
    unsupportedCurrency: exceptionReason === "unsupported_currency" ? 1 : 0,
    locked: numberField(report.locked),
    exported: numberField(report.exported),
  };
}
