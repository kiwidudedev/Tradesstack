import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getSupplierInvoiceCommercialComparison,
  type SupplierInvoiceCommercialComparison,
} from "@/lib/procurement-commercial-server";
import type { Database } from "@/lib/supabase/types";
import { createXeroInvoices, getXeroInvoice } from "@/lib/xero/client";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import {
  hasXeroInvoiceScope,
  XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
} from "@/lib/xero/scopes";

type UntypedSupabase = SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type XeroBillReadinessBlocker = {
  code: string;
  message: string;
};

export type XeroBillReadinessWarning = {
  code: string;
  message: string;
};

export type XeroBillResolvedLine = {
  commercialLineSnapshotId: string;
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  taxAmount: number;
  grossAmount: number;
  xeroAccountId: string;
  xeroAccountCode: string;
  xeroAccountTenantId: string | null;
  xeroTaxType: string;
  purchaseOrderNumber: string | null;
};

export type SupplierInvoiceXeroBillReadiness = {
  ready: boolean;
  blockers: XeroBillReadinessBlocker[];
  warnings: XeroBillReadinessWarning[];
  resolvedSummary: {
    commercialApprovalId: string | null;
    financeHash: string;
    financeHashValid: boolean;
    supplierName: string | null;
    contactId: string | null;
    contactName: string | null;
    connectionId: string | null;
    tenantId: string | null;
    tenantName: string | null;
    invoiceNumber: string;
    invoiceDate: string | null;
    dueDate: string | null;
    currency: string;
    subtotal: number;
    taxTotal: number;
    total: number;
    lineCount: number;
    poNumbers: string[];
    internallyPosted: boolean;
    exportStatus: string;
    externalDocumentNumber: string | null;
    rawExternalStatus: string | null;
    normalizedExternalStatus: string | null;
    amountPaid: number | null;
    amountDue: number | null;
    amountCredited: number | null;
    fullyPaidAt: string | null;
    providerUpdatedAt: string | null;
    lastStatusSyncedAt: string | null;
    exportedAt: string | null;
    safeError: string | null;
    lines: XeroBillResolvedLine[];
  };
};

export type XeroDraftBillSnapshot = {
  version: {
    id: string;
    document_id: string;
    commercial_approval_id: string;
    finance_hash: string;
    idempotency_key: string;
    contact_id_snapshot: string;
    invoice_number_snapshot: string;
    invoice_date_snapshot: string;
    due_date_snapshot: string;
    currency_code_snapshot: "NZD" | "AUD";
    subtotal_snapshot: number;
    tax_total_snapshot: number;
    total_snapshot: number;
    line_amount_type_snapshot: "Exclusive" | "Inclusive" | "NoTax";
    status: string;
    request_started_at: string | null;
    created_by: string;
  };
  document: {
    id: string;
    organization_id: string;
    accounting_connection_id: string;
    tenant_id: string;
    local_document_id: string;
    external_document_id: string | null;
    export_status: string;
  };
  lines: Array<{
    sequence: number;
    description: string;
    quantity: number;
    unit_amount: number;
    line_amount: number;
    tax_amount: number;
    xero_account_id: string;
    xero_account_code: string;
    xero_tax_type: string;
  }>;
};

export type XeroDraftBillPayload = {
  Invoices: Array<{
    Type: "ACCPAY";
    Contact: { ContactID: string };
    InvoiceNumber: string;
    Date: string;
    DueDate: string;
    CurrencyCode: "NZD" | "AUD";
    LineAmountTypes: "Exclusive" | "Inclusive" | "NoTax";
    Status: "DRAFT";
    LineItems: Array<{
      Description: string;
      Quantity: number;
      UnitAmount: number;
      LineAmount: number;
      AccountID: string;
      AccountCode: string;
      TaxType: string;
    }>;
  }>;
};

function asNumber(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function readMetadataString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addBlocker(
  blockers: XeroBillReadinessBlocker[],
  code: string,
  message: string,
  condition: boolean,
) {
  if (condition) {
    blockers.push({ code, message });
  }
}

export async function getSupplierInvoiceXeroBillReadiness(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  supplierInvoiceId: string;
  requireAccountsApproval?: boolean;
  commercialComparison?: SupplierInvoiceCommercialComparison;
}): Promise<SupplierInvoiceXeroBillReadiness> {
  const db = params.supabase as unknown as UntypedSupabase;
  const comparison = params.commercialComparison
    ?? await getSupplierInvoiceCommercialComparison({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
    });

  const [
    invoiceResult,
    invoiceLinesResult,
    supplierResult,
    snapshotsResult,
    connectionResult,
    documentResult,
    activeJobsResult,
    actualCostsResult,
    accountsApprovalResult,
  ] = await Promise.all([
    db
      .from("supplier_invoices")
      .select("id, supplier_id, invoice_number, invoice_date, due_date, currency, subtotal, tax_total, total")
      .eq("organization_id", params.organizationId)
      .eq("id", params.supplierInvoiceId)
      .maybeSingle(),
    db
      .from("supplier_invoice_lines")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("supplier_invoice_id", params.supplierInvoiceId),
    db
      .from("supplier_invoices")
      .select("organization_suppliers(company_name, name)")
      .eq("organization_id", params.organizationId)
      .eq("id", params.supplierInvoiceId)
      .maybeSingle(),
    comparison.activeApproval
      ? db
          .from("supplier_invoice_commercial_line_snapshots")
          .select("*")
          .eq("organization_id", params.organizationId)
          .eq("commercial_approval_id", comparison.activeApproval.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    db
      .from("organization_xero_connections")
      .select("*")
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
    db
      .from("organization_accounting_documents")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("local_document_type", "supplier_invoice")
      .eq("local_document_id", params.supplierInvoiceId)
      .maybeSingle(),
    db
      .from("organization_accounting_sync_jobs")
      .select("id, queue_state, request_payload")
      .eq("organization_id", params.organizationId)
      .eq("job_kind", "xero.bill.export")
      .in("queue_state", ["pending", "claimed", "retry_scheduled"]),
    db
      .from("project_actual_cost_events")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("event_status", "posted")
      .limit(1),
    db
      .from("supplier_invoice_accounts_approvals")
      .select("id, finance_hash, status, site_review_submission_id")
      .eq("organization_id", params.organizationId)
      .eq("supplier_invoice_id", params.supplierInvoiceId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const firstError = [
    invoiceResult.error,
    invoiceLinesResult.error,
    supplierResult.error,
    snapshotsResult.error,
    connectionResult.error,
    documentResult.error,
    activeJobsResult.error,
    actualCostsResult.error,
    accountsApprovalResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }
  const invoice = invoiceResult.data as Record<string, unknown> | null;
  if (!invoice) {
    throw new Error("Supplier invoice not found.");
  }

  const approval = comparison.activeApproval;
  const connection = connectionResult.data as Record<string, unknown> | null;
  const document = documentResult.data as Record<string, unknown> | null;
  const snapshots = (snapshotsResult.data ?? []) as Array<Record<string, unknown>>;
  const expectedCommercialLineCount = (invoiceLinesResult.data ?? []).length;
  const accountsApproval = ((accountsApprovalResult.data ?? [])[0] ?? null) as Record<string, unknown> | null;
  const supplierJoin = supplierResult.data as Record<string, unknown> | null;
  const supplierValue = supplierJoin?.organization_suppliers;
  const supplier =
    supplierValue && typeof supplierValue === "object" && !Array.isArray(supplierValue)
      ? (supplierValue as Record<string, unknown>)
      : null;

  let link: Record<string, unknown> | null = null;
  let contact: Record<string, unknown> | null = null;
  if (invoice.supplier_id && connection?.id && connection.tenant_id) {
    const linkResult = await db
      .from("organization_external_contacts")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("accounting_connection_id", connection.id)
      .eq("provider", "xero")
      .eq("local_entity_type", "supplier")
      .eq("local_entity_id", invoice.supplier_id)
      .eq("tenant_id", connection.tenant_id)
      .eq("link_status", "linked")
      .maybeSingle();
    if (linkResult.error) {
      throw new Error(linkResult.error.message);
    }
    link = linkResult.data as Record<string, unknown> | null;
    if (link?.external_contact_id) {
      const contactResult = await db
        .from("organization_xero_contacts")
        .select("*")
        .eq("organization_id", params.organizationId)
        .eq("connection_id", connection.id)
        .eq("tenant_id", connection.tenant_id)
        .eq("contact_id", link.external_contact_id)
        .maybeSingle();
      if (contactResult.error) {
        throw new Error(contactResult.error.message);
      }
      contact = contactResult.data as Record<string, unknown> | null;
    }
  }

  const mappingIds = snapshots
    .map((row) => String(row.accounting_mapping_id ?? ""))
    .filter(Boolean);
  const routeMappingIds = snapshots
    .map((row) => String(row.accounting_route_mapping_id ?? ""))
    .filter(Boolean);
  const namedAccountIds = snapshots
    .filter((row) => row.accounting_route === "supplier_bill_expense")
    .map((row) => String(row.organization_cost_code_id ?? ""))
    .filter(Boolean);
  const taxRateIds = snapshots
    .map((row) => String(row.accounting_tax_rate_id ?? ""))
    .filter(Boolean);
  const poIds = snapshots
    .map((row) => String(row.purchase_order_id ?? ""))
    .filter(Boolean);
  const [mappingsResult, routeMappingsResult, namedAccountsResult, taxRatesResult, purchaseOrdersResult] = await Promise.all([
    mappingIds.length
      ? db
          .from("organization_tradesstack_accounting_mappings")
          .select("id, tradesstack_cost_code, organization_cost_code_id, is_active, organization_cost_codes(*)")
          .eq("organization_id", params.organizationId)
          .in("id", mappingIds)
      : Promise.resolve({ data: [], error: null }),
    routeMappingIds.length
      ? db
          .from("organization_accounting_route_mappings")
          .select("id, accounting_route, organization_cost_code_id, project_id, is_active")
          .eq("organization_id", params.organizationId)
          .in("id", routeMappingIds)
      : Promise.resolve({ data: [], error: null }),
    namedAccountIds.length
      ? db
          .from("organization_cost_codes")
          .select("*")
          .eq("organization_id", params.organizationId)
          .in("id", namedAccountIds)
      : Promise.resolve({ data: [], error: null }),
    taxRateIds.length
      ? db
          .from("organization_accounting_tax_rates")
          .select("id, tax_type, is_active, provider, status, accounting_connection_id, tenant_id, can_apply_to_expenses")
          .eq("organization_id", params.organizationId)
          .in("id", taxRateIds)
      : Promise.resolve({ data: [], error: null }),
    poIds.length
      ? db
          .from("project_purchase_orders")
          .select("id, purchase_order_number")
          .eq("organization_id", params.organizationId)
          .in("id", poIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = [mappingsResult.error, routeMappingsResult.error, namedAccountsResult.error, taxRatesResult.error, purchaseOrdersResult.error].find(Boolean);
  if (relatedError) {
    throw new Error(relatedError.message);
  }

  const mappingById = new Map(
    ((mappingsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
  );
  const routeMappingById = new Map(
    ((routeMappingsResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => row.is_active === true && row.accounting_route === "supplier_bill_expense")
      .map((row) => [String(row.id), row]),
  );
  const namedAccountById = new Map(
    ((namedAccountsResult.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => [String(row.id), row]),
  );
  const taxById = new Map(
    ((taxRatesResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((row) =>
        row.is_active === true
        && String(row.status ?? "").toUpperCase() === "ACTIVE"
        && row.can_apply_to_expenses === true
        && row.accounting_connection_id === connection?.id
        && row.tenant_id === connection?.tenant_id,
      )
      .map((row) => [String(row.id), row]),
  );
  const poById = new Map(
    ((purchaseOrdersResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
  );
  const lines: XeroBillResolvedLine[] = snapshots.map((snapshot) => {
    const mapping = mappingById.get(String(snapshot.accounting_mapping_id ?? "")) ?? null;
    const routeMapping = routeMappingById.get(String(snapshot.accounting_route_mapping_id ?? "")) ?? null;
    const costCodeValue = mapping?.organization_cost_codes;
    const legacyCostCode =
      costCodeValue && typeof costCodeValue === "object" && !Array.isArray(costCodeValue)
        ? (costCodeValue as Record<string, unknown>)
        : null;
    const namedCostCode = namedAccountById.get(String(snapshot.organization_cost_code_id ?? "")) ?? null;
    const costCode = snapshot.accounting_route === "supplier_bill_expense"
      && (
        routeMapping?.organization_cost_code_id === snapshot.organization_cost_code_id
        || snapshot.account_override_organization_cost_code_id === snapshot.organization_cost_code_id
      )
      ? namedCostCode
      : legacyCostCode;
    const taxRate = snapshot.accounting_tax_rate_id
      ? taxById.get(String(snapshot.accounting_tax_rate_id)) ?? null
      : null;
    const po = snapshot.purchase_order_id
      ? poById.get(String(snapshot.purchase_order_id)) ?? null
      : null;
    const lineAmount = asNumber(snapshot.amount);
    const taxAmount = asNumber(snapshot.tax_amount);
    return {
      commercialLineSnapshotId: String(snapshot.id),
      description: String(snapshot.description ?? "").trim(),
      quantity: asNumber(snapshot.quantity),
      unitAmount: asNumber(snapshot.unit_rate),
      lineAmount,
      taxAmount,
      grossAmount: roundMoney(lineAmount + taxAmount),
      xeroAccountId: readMetadataString(costCode?.metadata, "accountId") ?? "",
      xeroAccountCode:
        typeof costCode?.external_code === "string" ? costCode.external_code.trim() : "",
      xeroAccountTenantId: readMetadataString(costCode?.metadata, "tenantId"),
      xeroTaxType: typeof taxRate?.tax_type === "string" ? taxRate.tax_type.trim() : "",
      purchaseOrderNumber:
        typeof po?.purchase_order_number === "string" ? po.purchase_order_number : null,
    };
  });

  const blockers: XeroBillReadinessBlocker[] = comparison.blockers.map((blocker) => ({
    code: `commercial_${blocker.code}`,
    message: blocker.message,
  }));
  const scopes = Array.isArray(connection?.scope) ? connection.scope.map(String) : [];
  const lineNet = roundMoney(lines.reduce((sum, line) => sum + line.lineAmount, 0));
  const lineTax = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const currentVersionJobIds = new Set(
    ((activeJobsResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((job) => {
        const payload = job.request_payload;
        return payload && typeof payload === "object" && !Array.isArray(payload);
      })
      .map((job) => {
        const payload = job.request_payload as Record<string, unknown>;
        return String(payload.supplierInvoiceId ?? "");
      }),
  );
  addBlocker(blockers, "no_active_commercial_approval", "An active commercial approval is required.", !approval);
  addBlocker(
    blockers,
    "finance_hash_mismatch",
    "The commercial approval no longer matches the current finance version.",
    Boolean(approval && approval.finance_version_hash !== comparison.financeVersionHash),
  );
  addBlocker(
    blockers,
    "missing_accounts_approval",
    "A current final Accounts approval is required before Xero export.",
    params.requireAccountsApproval !== false
      && (!accountsApproval || accountsApproval.finance_hash !== comparison.financeVersionHash),
  );
  addBlocker(blockers, "missing_supplier", "Select a supplier before export.", !invoice.supplier_id);
  addBlocker(blockers, "missing_contact_link", "Link the Supplier to an active Xero Contact.", !link);
  addBlocker(
    blockers,
    "archived_contact",
    "The linked Xero Contact is archived or unavailable.",
    Boolean(link && (!contact || ![null, "ACTIVE"].includes(contact.contact_status as string | null))),
  );
  addBlocker(
    blockers,
    "unhealthy_connection",
    "A healthy connected Xero tenant is required.",
    !connection || connection.status !== "connected" || connection.last_health_status !== "healthy",
  );
  addBlocker(
    blockers,
    "missing_invoice_scope",
    XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
    !hasXeroInvoiceScope(scopes),
  );
  addBlocker(blockers, "missing_invoice_number", "Enter an invoice number.", !String(invoice.invoice_number ?? "").trim());
  addBlocker(blockers, "missing_invoice_date", "Enter an invoice date.", !invoice.invoice_date);
  addBlocker(blockers, "missing_due_date", "Enter a due date.", !invoice.due_date);
  addBlocker(blockers, "unsupported_currency", "Supplier Invoice currency must be NZD or AUD.", !["NZD", "AUD"].includes(String(invoice.currency).toUpperCase()));
  addBlocker(
    blockers,
    "missing_lines",
    "The commercial approval does not contain a complete line snapshot set.",
    Boolean(approval && lines.length !== expectedCommercialLineCount),
  );
  addBlocker(blockers, "missing_account_id", "Every line requires a snapshottable Xero AccountID.", lines.some((line) => !line.xeroAccountId));
  addBlocker(blockers, "missing_account_code", "Every line requires a snapshottable Xero AccountCode.", lines.some((line) => !line.xeroAccountCode));
  addBlocker(
    blockers,
    "account_tenant_mismatch",
    "One or more Xero account mappings belong to a different tenant. Refresh and remap the account before export.",
    lines.some(
      (line) =>
        Boolean(
          line.xeroAccountTenantId
          && connection?.tenant_id
          && line.xeroAccountTenantId !== connection.tenant_id
        )
    ),
  );
  addBlocker(blockers, "missing_tax_type", "Every line requires a resolved Xero TaxType.", lines.some((line) => !line.xeroTaxType));
  addBlocker(
    blockers,
    "total_reconciliation_failure",
    "Approved line amounts and tax do not reconcile to the invoice.",
    Math.abs(lineNet - asNumber(invoice.subtotal)) > 0.01
      || Math.abs(lineTax - asNumber(invoice.tax_total)) > 0.01
      || Math.abs(asNumber(invoice.subtotal) + asNumber(invoice.tax_total) - asNumber(invoice.total)) > 0.01,
  );
  addBlocker(
    blockers,
    "already_exported",
    "This Supplier Invoice finance version has already been exported.",
    document?.export_status === "exported",
  );
  addBlocker(
    blockers,
    "active_export_job",
    "A Draft Xero Bill export is already active.",
    currentVersionJobIds.has(params.supplierInvoiceId),
  );
  addBlocker(
    blockers,
    "uncertain_prior_export",
    "A prior export has an uncertain result and requires operator review.",
    document?.export_status === "attention_required" && !document.external_document_id,
  );

  const poNumbers = Array.from(
    new Set(lines.map((line) => line.purchaseOrderNumber).filter((value): value is string => Boolean(value))),
  ).sort();
  const warnings: XeroBillReadinessWarning[] = [];
  if (poNumbers.length === 0) {
    warnings.push({ code: "no_po", message: "This commercially approved invoice has no Purchase Order." });
  } else if (poNumbers.length > 1) {
    warnings.push({ code: "multiple_pos", message: "This invoice is allocated across multiple Purchase Orders." });
  }
  if ((actualCostsResult.data ?? []).length === 0) {
    warnings.push({ code: "not_internally_posted", message: "Internal actual costs have not been posted." });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    resolvedSummary: {
      commercialApprovalId: approval?.id ?? null,
      financeHash: comparison.financeVersionHash,
      financeHashValid: Boolean(approval && approval.finance_version_hash === comparison.financeVersionHash),
      supplierName:
        typeof supplier?.company_name === "string" && supplier.company_name.trim()
          ? supplier.company_name.trim()
          : typeof supplier?.name === "string" && supplier.name.trim()
            ? supplier.name.trim()
            : null,
      contactId: typeof link?.external_contact_id === "string" ? link.external_contact_id : null,
      contactName:
        (typeof link?.external_contact_name === "string" && link.external_contact_name)
        || (typeof contact?.name === "string" && contact.name)
        || null,
      connectionId: typeof connection?.id === "string" ? connection.id : null,
      tenantId: typeof connection?.tenant_id === "string" ? connection.tenant_id : null,
      tenantName: typeof connection?.tenant_name === "string" ? connection.tenant_name : null,
      invoiceNumber: String(invoice.invoice_number ?? ""),
      invoiceDate: typeof invoice.invoice_date === "string" ? invoice.invoice_date : null,
      dueDate: typeof invoice.due_date === "string" ? invoice.due_date : null,
      currency: String(invoice.currency ?? ""),
      subtotal: asNumber(invoice.subtotal),
      taxTotal: asNumber(invoice.tax_total),
      total: asNumber(invoice.total),
      lineCount: lines.length,
      poNumbers,
      internallyPosted: (actualCostsResult.data ?? []).length > 0,
      exportStatus: typeof document?.export_status === "string" ? document.export_status : "not_ready",
      externalDocumentNumber:
        typeof document?.external_document_number === "string" ? document.external_document_number : null,
      rawExternalStatus: typeof document?.raw_external_status === "string" ? document.raw_external_status : null,
      normalizedExternalStatus:
        typeof document?.normalized_external_status === "string"
          ? document.normalized_external_status
          : null,
      amountPaid: document?.amount_paid === null || document?.amount_paid === undefined
        ? null
        : asNumber(document.amount_paid),
      amountDue: document?.amount_due === null || document?.amount_due === undefined
        ? null
        : asNumber(document.amount_due),
      amountCredited: document?.amount_credited === null || document?.amount_credited === undefined
        ? null
        : asNumber(document.amount_credited),
      fullyPaidAt: typeof document?.fully_paid_at === "string" ? document.fully_paid_at : null,
      providerUpdatedAt:
        typeof document?.provider_updated_at === "string" ? document.provider_updated_at : null,
      lastStatusSyncedAt:
        typeof document?.last_status_synced_at === "string" ? document.last_status_synced_at : null,
      exportedAt: typeof document?.exported_at === "string" ? document.exported_at : null,
      safeError:
        (typeof document?.last_status_sync_error === "string" && document.last_status_sync_error)
        || (typeof document?.last_error_message === "string" && document.last_error_message)
        || null,
      lines,
    },
  };
}

export function buildXeroDraftBillPayload(snapshot: XeroDraftBillSnapshot): XeroDraftBillPayload {
  return {
    Invoices: [
      {
        Type: "ACCPAY",
        Contact: { ContactID: snapshot.version.contact_id_snapshot },
        InvoiceNumber: snapshot.version.invoice_number_snapshot,
        Date: snapshot.version.invoice_date_snapshot,
        DueDate: snapshot.version.due_date_snapshot,
        CurrencyCode: snapshot.version.currency_code_snapshot,
        LineAmountTypes: snapshot.version.line_amount_type_snapshot,
        Status: "DRAFT",
        LineItems: snapshot.lines
          .slice()
          .sort((left, right) => left.sequence - right.sequence)
          .map((line) => ({
            Description: line.description,
            Quantity: asNumber(line.quantity),
            UnitAmount: asNumber(line.unit_amount),
            LineAmount: asNumber(line.line_amount),
            AccountID: line.xero_account_id,
            AccountCode: line.xero_account_code,
            TaxType: line.xero_tax_type,
          })),
      },
    ],
  };
}

function readXeroString(value: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }
  }
  return null;
}

export async function exportPreparedXeroDraftBill(params: {
  organizationId: string;
  documentVersionId: string;
  workerJobId: string;
}) {
  const admin = await createAdminSupabaseClient();
  const db = admin as unknown as UntypedSupabase;
  const versionResult = await db
    .from("organization_accounting_document_versions")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.documentVersionId)
    .maybeSingle();
  if (versionResult.error || !versionResult.data) {
    throw new Error("The immutable Xero Bill export version could not be loaded.");
  }
  const version = versionResult.data as XeroDraftBillSnapshot["version"];
  const [documentResult, linesResult, approvalResult] = await Promise.all([
    db
      .from("organization_accounting_documents")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("id", version.document_id)
      .maybeSingle(),
    db
      .from("organization_accounting_document_lines")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("version_id", version.id)
      .order("sequence", { ascending: true }),
    db
      .from("supplier_invoice_commercial_approvals")
      .select("id, status, finance_version_hash")
      .eq("organization_id", params.organizationId)
      .eq("id", version.commercial_approval_id)
      .maybeSingle(),
  ]);
  const document = documentResult.data as XeroDraftBillSnapshot["document"] | null;
  if (documentResult.error || !document) {
    throw new Error("The Xero Bill accounting document could not be loaded.");
  }
  const currentHashResult = await db.rpc("supplier_invoice_finance_version_hash", {
    p_invoice_id: document.local_document_id,
  });
  if (linesResult.error || approvalResult.error || currentHashResult.error) {
    throw new Error("The Xero Bill export snapshot could not be verified.");
  }
  const approval = approvalResult.data as Record<string, unknown> | null;
  if (
    !approval
    || approval.status !== "approved"
    || approval.finance_version_hash !== version.finance_hash
    || currentHashResult.data !== version.finance_hash
  ) {
    await markXeroBillAttentionRequired({
      documentId: document.id,
      versionId: version.id,
      code: "commercial_approval_changed",
      message: "Commercial approval changed after the Xero export was queued.",
    });
    throw new Error("Commercial approval changed after the Xero export was queued.");
  }
  if (document.external_document_id) {
    return {
      invoiceId: document.external_document_id,
      recovered: true,
      status: "exported",
    };
  }

  const tokenState = await getFreshXeroAccessToken(params.organizationId);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tokenState.connection.tenant_id !== document.tenant_id
    || !hasXeroInvoiceScope(tokenState.connection.scope)
  ) {
    throw new Error("The Xero connection or tenant no longer matches the prepared export.");
  }

  const snapshot: XeroDraftBillSnapshot = {
    version,
    document,
    lines: (linesResult.data ?? []) as XeroDraftBillSnapshot["lines"],
  };
  const payload = buildXeroDraftBillPayload(snapshot);
  const requestStartedAt = new Date().toISOString();
  await db
    .from("organization_accounting_document_versions")
    .update({ status: "exporting", request_started_at: requestStartedAt })
    .eq("id", version.id);
  await db
    .from("organization_accounting_documents")
    .update({ export_status: "exporting", last_error_code: null, last_error_message: null })
    .eq("id", document.id);
  await db.from("supplier_invoice_activity_events").insert({
    organization_id: params.organizationId,
    supplier_invoice_id: document.local_document_id,
    event_type: "xero_export_started",
    message: "Draft Xero Bill export started.",
    metadata: {
      accounting_document_id: document.id,
      accounting_document_version_id: version.id,
      worker_job_id: params.workerJobId,
    },
    created_by: version.created_by,
  });

  const invoices = await createXeroInvoices({
    accessToken: tokenState.tokenSet.access_token,
    tenantId: document.tenant_id,
    invoices: payload.Invoices,
    idempotencyKey: version.idempotency_key,
  });
  const created = invoices[0] as Record<string, unknown> | undefined;
  const invoiceId = created ? readXeroString(created, "InvoiceID", "invoiceID") : null;
  if (!created || !invoiceId) {
    await markXeroBillAttentionRequired({
      documentId: document.id,
      versionId: version.id,
      code: "missing_external_identity",
      message: "Xero accepted the request without returning a verifiable Bill identity.",
    });
    throw new Error("Xero did not return a verifiable Bill identity.");
  }

  const confirmedRows = await getXeroInvoice(
    tokenState.tokenSet.access_token,
    document.tenant_id,
    invoiceId,
  );
  const confirmed = (confirmedRows[0] ?? created) as Record<string, unknown>;
  const returnedSubtotal = asNumber(confirmed.SubTotal ?? confirmed.subTotal);
  const returnedTax = asNumber(confirmed.TotalTax ?? confirmed.totalTax);
  const returnedTotal = asNumber(confirmed.Total ?? confirmed.total);
  const totalsMatch =
    Math.abs(returnedSubtotal - asNumber(version.subtotal_snapshot)) <= 0.01
    && Math.abs(returnedTax - asNumber(version.tax_total_snapshot)) <= 0.01
    && Math.abs(returnedTotal - asNumber(version.total_snapshot)) <= 0.01;
  const now = new Date().toISOString();
  const invoiceNumber = readXeroString(confirmed, "InvoiceNumber", "invoiceNumber");
  const status = readXeroString(confirmed, "Status", "status") ?? "DRAFT";

  await db
    .from("organization_accounting_documents")
    .update({
      external_document_id: invoiceId,
      external_document_number: invoiceNumber,
      raw_external_status: status,
      normalized_external_status: status.toLowerCase(),
      export_status: totalsMatch ? "exported" : "attention_required",
      amount_exported: returnedTotal,
      tax_exported: returnedTax,
      currency_code: version.currency_code_snapshot,
      exported_by: version.created_by,
      exported_at: now,
      last_synced_at: now,
      last_error_code: totalsMatch ? null : "returned_total_mismatch",
      last_error_message: totalsMatch
        ? null
        : "The Xero Draft Bill was created, but its returned totals do not match TradesStack.",
    })
    .eq("id", document.id);
  await db
    .from("organization_accounting_document_versions")
    .update({ status: totalsMatch ? "exported" : "attention_required" })
    .eq("id", version.id);
  await db.from("supplier_invoice_activity_events").insert({
    organization_id: params.organizationId,
    supplier_invoice_id: document.local_document_id,
    event_type: totalsMatch ? "xero_draft_bill_created" : "xero_export_attention_required",
    message: totalsMatch
      ? "Draft Xero Bill created."
      : "Draft Xero Bill created with a total reconciliation issue.",
    metadata: {
      accounting_document_id: document.id,
      accounting_document_version_id: version.id,
      xero_invoice_id: invoiceId,
      xero_invoice_number: invoiceNumber,
      xero_status: status,
      worker_job_id: params.workerJobId,
    },
    created_by: version.created_by,
  });

  return {
    invoiceId,
    invoiceNumber,
    status,
    totalsMatch,
    recovered: false,
  };
}

export async function markXeroBillAttentionRequired(params: {
  documentId: string;
  versionId: string;
  code: string;
  message: string;
}) {
  const admin = await createAdminSupabaseClient();
  const db = admin as unknown as UntypedSupabase;
  const existingResult = await db
    .from("organization_accounting_documents")
    .select("organization_id, local_document_id, export_status, last_error_code, exported_by")
    .eq("id", params.documentId)
    .maybeSingle();
  const shouldRecordActivity =
    existingResult.data
    && (
      existingResult.data.export_status !== "attention_required"
      || existingResult.data.last_error_code !== params.code
    );
  await Promise.all([
    db
      .from("organization_accounting_documents")
      .update({
        export_status: "attention_required",
        last_error_code: params.code,
        last_error_message: params.message,
      })
      .eq("id", params.documentId),
    db
      .from("organization_accounting_document_versions")
      .update({ status: "attention_required" })
      .eq("id", params.versionId),
  ]);
  if (shouldRecordActivity && existingResult.data) {
    await db.from("supplier_invoice_activity_events").insert({
      organization_id: existingResult.data.organization_id,
      supplier_invoice_id: existingResult.data.local_document_id,
      event_type: "xero_export_attention_required",
      message: params.message,
      metadata: {
        accounting_document_id: params.documentId,
        accounting_document_version_id: params.versionId,
        error_code: params.code,
      },
      created_by: existingResult.data.exported_by,
    });
  }
}

export async function markXeroBillFailed(params: {
  documentId: string;
  versionId: string;
  code: string;
  message: string;
}) {
  const admin = await createAdminSupabaseClient();
  const db = admin as unknown as UntypedSupabase;
  const documentResult = await db
    .from("organization_accounting_documents")
    .select("organization_id, local_document_id, exported_by")
    .eq("id", params.documentId)
    .maybeSingle();
  await Promise.all([
    db
      .from("organization_accounting_documents")
      .update({
        export_status: "failed",
        last_error_code: params.code,
        last_error_message: params.message,
      })
      .eq("id", params.documentId),
    db
      .from("organization_accounting_document_versions")
      .update({ status: "failed" })
      .eq("id", params.versionId),
  ]);
  if (documentResult.data) {
    await db.from("supplier_invoice_activity_events").insert({
      organization_id: documentResult.data.organization_id,
      supplier_invoice_id: documentResult.data.local_document_id,
      event_type: "xero_export_failed",
      message: params.message,
      metadata: {
        accounting_document_id: params.documentId,
        accounting_document_version_id: params.versionId,
        error_code: params.code,
      },
      created_by: documentResult.data.exported_by,
    });
  }
}
