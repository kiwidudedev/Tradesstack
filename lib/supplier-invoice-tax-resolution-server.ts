import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import {
  inferSupplierInvoiceTaxMode,
  resolveSupplierInvoiceTax,
  type SupplierInvoiceTaxMode,
  type SupplierInvoiceTaxRegistrationStatus,
  type SupplierInvoiceTaxResolution,
  type SupplierInvoiceTaxTreatment,
} from "@/lib/supplier-invoice-tax-resolution";

type ServerSupabase = SupabaseClient<Database>;

function objectValue(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function treatment(value: unknown): SupplierInvoiceTaxTreatment | null {
  return ["standard", "zero_rated", "exempt", "gst_free", "input_taxed", "no_tax"].includes(String(value))
    ? value as SupplierInvoiceTaxTreatment
    : null;
}

export async function resolveCurrentSupplierInvoiceTax(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceTaxResolution> {
  const [organizationResult, invoiceResult, connectionResult, lineResult, allocationResult] = await Promise.all([
    params.supabase.from("organizations").select("country, default_tax_rate, tax_registration_status")
      .eq("id", params.organizationId).single(),
    params.supabase.from("supplier_invoices").select("id, supplier_id, currency, subtotal, tax_total, total, tax_amount_mode")
      .eq("organization_id", params.organizationId).eq("id", params.supplierInvoiceId).single(),
    params.supabase.from("organization_xero_connections").select("id, tenant_id, status")
      .eq("organization_id", params.organizationId).eq("status", "connected").maybeSingle(),
    params.supabase.from("supplier_invoice_lines").select("id, sort_order, line_total, tax_amount, source_metadata_json")
      .eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId)
      .order("sort_order"),
    params.supabase.from("supplier_invoice_line_allocations")
      .select("supplier_invoice_line_id, accounting_tax_rate_id, tax_resolution_status")
      .eq("organization_id", params.organizationId).eq("supplier_invoice_id", params.supplierInvoiceId),
  ]);
  const firstError = [organizationResult.error, invoiceResult.error, connectionResult.error, lineResult.error, allocationResult.error]
    .find(Boolean);
  if (firstError) throw new Error(firstError.message);
  const organization = organizationResult.data as unknown as {
    country: string | null; default_tax_rate: number | null; tax_registration_status: string;
  };
  const invoice = invoiceResult.data as unknown as {
    supplier_id: string | null; currency: string; subtotal: number; tax_total: number; total: number; tax_amount_mode: string;
  };
  const connection = connectionResult.data as unknown as { id: string; tenant_id: string; status: string } | null;
  if (!connection) {
    return { status: "exception", jurisdiction: "unsupported", reason: "missing_xero_tax_rate", message: "Connect the current Xero organization before GST can be resolved.", evidence: [] };
  }

  const [supplierResult, rateResult, historicalResult] = await Promise.all([
    invoice.supplier_id
      ? params.supabase.from("organization_suppliers")
          .select("country_code, tax_number, tax_number_type, company_registration_number, default_tax_rate_id")
          .eq("organization_id", params.organizationId).eq("id", invoice.supplier_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    params.supabase.from("organization_accounting_tax_rates")
      .select("id, accounting_connection_id, tenant_id, jurisdiction_code, tax_type, effective_rate, status, is_active, can_apply_to_expenses, metadata")
      .eq("organization_id", params.organizationId).eq("accounting_connection_id", connection.id)
      .eq("tenant_id", connection.tenant_id),
    invoice.supplier_id
      ? params.supabase.from("supplier_invoice_line_allocations" as never)
          .select("accounting_tax_rate_id, supplier_invoices!inner(supplier_id)" as never)
          .eq("organization_id", params.organizationId)
          .eq("approval_status", "approved")
          .eq("tax_resolution_status", "resolved")
          .eq("supplier_invoices.supplier_id", invoice.supplier_id)
          .neq("supplier_invoice_id", params.supplierInvoiceId)
          .order("updated_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (rateResult.error) throw new Error(rateResult.error.message);
  if (historicalResult.error) throw new Error(historicalResult.error.message);
  const supplier = supplierResult.data as unknown as {
    country_code: string | null; tax_number: string | null; tax_number_type: string | null;
    company_registration_number: string | null; default_tax_rate_id: string | null;
  } | null;
  const rates = (rateResult.data ?? []) as unknown as Array<{
    id: string; accounting_connection_id: string | null; tenant_id: string | null; jurisdiction_code: string | null;
    tax_type: string | null; effective_rate: number | null; status: string | null; is_active: boolean;
    can_apply_to_expenses: boolean; metadata: Json;
  }>;
  const supplierDefaultTreatment = treatment(
    objectValue(rates.find((rate) => rate.id === supplier?.default_tax_rate_id)?.metadata).purchaseTreatmentKind,
  );
  const historicalRateIds = Array.from(new Set(
    ((historicalResult.data ?? []) as Array<{ accounting_tax_rate_id?: string | null }>)
      .map((row) => row.accounting_tax_rate_id)
      .filter((value): value is string => Boolean(value)),
  ));
  const lines = (lineResult.data ?? []) as Array<{
    id: string; sort_order: number; line_total: number; tax_amount: number; source_metadata_json: Json;
  }>;
  const hasDocumentLineTax = lines.every((line) => {
    const metadata = objectValue(line.source_metadata_json);
    return Number(line.tax_amount ?? 0) === 0
      || metadata.taxEvidenceSource === "document_line"
      || Number.isFinite(Number(line.tax_amount));
  });
  const resolverLines = lines.map((line) => {
    const metadata = objectValue(line.source_metadata_json);
    return {
      id: line.id,
      sortOrder: line.sort_order,
      netAmount: Number(line.line_total),
      grossAmount: typeof metadata.grossLineTotal === "number" ? metadata.grossLineTotal : null,
      taxAmount: Number(line.tax_amount),
      treatment: treatment(metadata.taxTreatment) ?? (Number(invoice.tax_total) > 0 ? "standard" : supplierDefaultTreatment),
    };
  });
  const storedTaxMode = invoice.tax_amount_mode as SupplierInvoiceTaxMode;
  const resolvedTaxMode = storedTaxMode === "unknown"
    ? inferSupplierInvoiceTaxMode({
        subtotal: Number(invoice.subtotal),
        taxTotal: Number(invoice.tax_total),
        total: Number(invoice.total),
        lines: resolverLines,
      })
    : storedTaxMode;

  return resolveSupplierInvoiceTax({
    organization: {
      country: organization.country,
      taxRegistrationStatus: organization.tax_registration_status as SupplierInvoiceTaxRegistrationStatus,
      defaultTaxRate: organization.default_tax_rate,
    },
    supplier: supplier ? {
      countryCode: supplier.country_code,
      taxNumber: supplier.tax_number,
      taxNumberType: supplier.tax_number_type,
      companyRegistrationNumber: supplier.company_registration_number,
      defaultTaxRateId: supplier.default_tax_rate_id,
    } : null,
    invoice: {
      currency: invoice.currency,
      subtotal: Number(invoice.subtotal),
      taxTotal: Number(invoice.tax_total),
      total: Number(invoice.total),
      taxMode: resolvedTaxMode,
      isTaxInvoice: hasDocumentLineTax,
      documentType: "invoice",
      lines: resolverLines,
    },
    currentConnectionId: connection.id,
    currentTenantId: connection.tenant_id,
    taxRates: rates.map((rate) => ({
      id: rate.id,
      accountingConnectionId: rate.accounting_connection_id,
      tenantId: rate.tenant_id,
      jurisdiction: rate.jurisdiction_code === "NZ" || rate.jurisdiction_code === "AU" ? rate.jurisdiction_code : "unsupported",
      taxType: rate.tax_type,
      effectiveRate: rate.effective_rate,
      status: rate.status,
      isActive: rate.is_active,
      canApplyToExpenses: rate.can_apply_to_expenses,
      treatment: treatment(objectValue(rate.metadata).purchaseTreatmentKind),
    })),
    explicitDecisions: (allocationResult.data ?? []).flatMap((allocation) =>
      allocation.tax_resolution_status === "resolved" || allocation.tax_resolution_status === "not_applicable"
        ? [{
            lineId: allocation.supplier_invoice_line_id,
            taxResolutionStatus: allocation.tax_resolution_status,
            accountingTaxRateId: allocation.accounting_tax_rate_id,
          }]
        : [],
    ),
    historicalTaxRateId: historicalRateIds.length === 1 ? historicalRateIds[0]! : null,
  });
}
