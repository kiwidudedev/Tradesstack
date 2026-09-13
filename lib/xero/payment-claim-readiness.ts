import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrganizationXeroConnection } from "@/lib/xero/service";
import {
  resolvePaymentClaimRevenueTax,
  type ResolvedPaymentClaimRevenueTax,
} from "@/lib/xero/payment-claim-revenue-tax";

export type PaymentClaimXeroReadinessBlockerCode =
  | "organization_not_found"
  | "organization_mismatch"
  | "claim_not_found"
  | "project_not_found"
  | "client_missing"
  | "client_not_found"
  | "xero_disconnected"
  | "xero_tenant_missing"
  | "client_contact_missing"
  | "client_contact_organization_mismatch"
  | "client_contact_connection_mismatch"
  | "client_contact_tenant_mismatch"
  | "client_contact_inactive"
  | "sales_mapping_missing"
  | "sales_mapping_archived"
  | "sales_account_inactive"
  | "sales_account_tenant_mismatch"
  | "sales_account_classification_invalid"
  | "retention_mapping_missing"
  | "retention_mapping_archived"
  | "retention_account_inactive"
  | "retention_account_tenant_mismatch"
  | "retention_account_classification_invalid"
  | "revenue_tax_type_missing"
  | "sales_account_tax_type_missing"
  | "sales_tax_rate_missing"
  | "sales_tax_rate_ambiguous"
  | "sales_tax_rate_gst_mismatch"
  | "claim_not_submitted"
  | "unsupported_jurisdiction"
  | "unsupported_tax_registration"
  | "unsupported_currency"
  | "accounting_document_invalid"
  | "accounting_document_organization_mismatch"
  | "accounting_document_connection_mismatch"
  | "accounting_document_tenant_mismatch"
  | "existing_invoice_id_invalid";

export type PaymentClaimXeroReadinessBlocker = {
  code: PaymentClaimXeroReadinessBlockerCode;
  message: string;
};

export type PaymentClaimXeroReadinessResult = {
  ready: boolean;
  blockers: PaymentClaimXeroReadinessBlocker[];
};

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // These generic tables include Stage 1 polymorphic fields not represented in
  // every generated-client build used by this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PaymentClaimXeroReadinessSnapshot = {
  organization: Row;
  claim: Row;
  project: Row;
  client: Row | null;
  connection: Row | null;
  contactLinks: Row[];
  importedContacts: Row[];
  mappings: Row[];
  /** Named mappings are authoritative for new claims. `mappings` is retained
   * only as an explicit legacy 600/700 compatibility read. */
  routeMappings?: Row[];
  costCodes: Row[];
  taxRates: Row[];
  accountingDocuments: Row[];
};

export type PaymentClaimXeroResolvedDependencies = {
  connectionId: string | null;
  tenantId: string | null;
  contactLink: Row | null;
  importedContact: Row | null;
  salesMapping: Row | null;
  salesAccount: Row | null;
  retentionRequired: boolean;
  retentionMapping: Row | null;
  retentionAccount: Row | null;
  revenueTaxRate: Row | null;
  revenueTaxResolution: ResolvedPaymentClaimRevenueTax;
  accountingDocument: Row | null;
};

export type PaymentClaimXeroResolution =
  | { snapshot: PaymentClaimXeroReadinessSnapshot; terminalReadiness: null }
  | { snapshot: null; terminalReadiness: PaymentClaimXeroReadinessResult };

const BLOCKER_MESSAGES: Record<PaymentClaimXeroReadinessBlockerCode, string> = {
  organization_not_found: "Organization not found.",
  organization_mismatch: "The Payment Claim does not belong to this organization.",
  claim_not_found: "Payment Claim not found.",
  project_not_found: "The Payment Claim project is missing or belongs to another organization.",
  client_missing: "The Payment Claim project does not have a client.",
  client_not_found: "The Payment Claim client is missing or belongs to another organization.",
  xero_disconnected: "Xero is not connected.",
  xero_tenant_missing: "No Xero tenant is selected.",
  client_contact_missing: "Missing client Xero Contact.",
  client_contact_organization_mismatch: "The client Xero Contact link belongs to another organization.",
  client_contact_connection_mismatch: "The client Xero Contact link belongs to another Xero connection.",
  client_contact_tenant_mismatch: "The client Xero Contact link belongs to another Xero tenant.",
  client_contact_inactive: "The linked client Xero Contact is archived, stale, or inactive.",
  sales_mapping_missing: "Payment Claims revenue account is not configured.",
  sales_mapping_archived: "The Payment Claims revenue account mapping is archived.",
  sales_account_inactive: "The mapped Sales account is missing, archived, or inactive.",
  sales_account_tenant_mismatch: "The mapped Sales account belongs to another Xero tenant.",
  sales_account_classification_invalid: "Payment Claims must map to a Xero Revenue account.",
  retention_mapping_missing: "Retention Receivable account is not configured.",
  retention_mapping_archived: "The Retention Receivable account mapping is archived.",
  retention_account_inactive: "The mapped Retention account is missing, archived, or inactive.",
  retention_account_tenant_mismatch: "The mapped Retention account belongs to another Xero tenant.",
  retention_account_classification_invalid: "Retention Receivable must map to a Xero Current Asset account.",
  revenue_tax_type_missing: "Missing a synchronized revenue TaxType that reconciles with this claim for the selected Xero tenant.",
  sales_account_tax_type_missing: "The mapped Sales account does not declare a synchronized Xero TaxType.",
  sales_tax_rate_missing: "No active revenue tax rate matches the mapped Sales account TaxType.",
  sales_tax_rate_ambiguous: "More than one active revenue tax rate matches the mapped Sales account TaxType.",
  sales_tax_rate_gst_mismatch: "The mapped Sales account TaxType does not reconcile to the persisted claim GST within one cent.",
  claim_not_submitted: "Payment Claim must be Submitted before it can synchronize to Xero.",
  unsupported_jurisdiction: "The organisation jurisdiction is not configured.",
  unsupported_tax_registration: "The organisation tax registration is not configured.",
  unsupported_currency: "The organisation must have a valid three-letter currency code.",
  accounting_document_invalid: "The current accounting document is invalid or ambiguous.",
  accounting_document_organization_mismatch: "The current accounting document belongs to another organization.",
  accounting_document_connection_mismatch: "The current accounting document belongs to another Xero connection.",
  accounting_document_tenant_mismatch: "The current accounting document belongs to another Xero tenant.",
  existing_invoice_id_invalid: "The existing Xero InvoiceID is invalid.",
};

function adminDb(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadata(row: Row | null) {
  const value = row?.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function organizationCurrency(snapshot: PaymentClaimXeroReadinessSnapshot) {
  const currency = text(snapshot.organization.default_currency)?.toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function addBlocker(
  blockers: PaymentClaimXeroReadinessBlocker[],
  code: PaymentClaimXeroReadinessBlockerCode,
  when = true,
) {
  if (when && !blockers.some((blocker) => blocker.code === code)) {
    blockers.push({ code, message: BLOCKER_MESSAGES[code] });
  }
}

type ClaimAccountingRoute = "payment_claim_revenue" | "retention_receivable";

function legacyRoute(accountingRoute: ClaimAccountingRoute) {
  return accountingRoute === "payment_claim_revenue" ? 600 : 700;
}

function relevantMappings(snapshot: PaymentClaimXeroReadinessSnapshot, accountingRoute: ClaimAccountingRoute) {
  const named = (snapshot.routeMappings ?? [])
    .filter((row) => row.provider === "xero" && row.accounting_route === accountingRoute);
  const candidates = named.length > 0
    ? named
    : snapshot.mappings.filter((row) =>
        row.provider === "xero" && Number(row.tradesstack_cost_code) === legacyRoute(accountingRoute),
      );
  return candidates
    .filter((row) => row.project_id === snapshot.project.id || row.project_id == null)
    .sort((left, right) => {
      const leftProject = left.project_id === snapshot.project.id ? 0 : 1;
      const rightProject = right.project_id === snapshot.project.id ? 0 : 1;
      if (leftProject !== rightProject) return leftProject - rightProject;
      return String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
    });
}

function resolveMapping(snapshot: PaymentClaimXeroReadinessSnapshot, accountingRoute: ClaimAccountingRoute) {
  const mappings = relevantMappings(snapshot, accountingRoute);
  const activeMapping = mappings.find((row) => row.is_active === true) ?? null;
  const account = activeMapping
    ? snapshot.costCodes.find((row) => row.id === activeMapping.organization_cost_code_id) ?? null
    : null;
  return { mappings, activeMapping, account };
}

export function resolvePaymentClaimXeroDependencies(
  snapshot: PaymentClaimXeroReadinessSnapshot,
): PaymentClaimXeroResolvedDependencies {
  const connectionId = text(snapshot.connection?.id);
  const tenantId = text(snapshot.connection?.tenant_id);
  const contactLink = snapshot.contactLinks.find((row) =>
    ["linked", "attention_required", "external_archived"].includes(String(row.link_status)),
  ) ?? null;
  const importedContact = contactLink
    ? snapshot.importedContacts.find((row) =>
        row.contact_id === contactLink.external_contact_id
        && row.organization_id === snapshot.organization.id
        && row.connection_id === connectionId
        && row.tenant_id === tenantId,
      ) ?? null
    : null;
  const sales = resolveMapping(snapshot, "payment_claim_revenue");
  const retention = resolveMapping(snapshot, "retention_receivable");
  const revenueTaxResolution = resolvePaymentClaimRevenueTax({
    organizationId: String(snapshot.organization.id),
    connectionId,
    tenantId,
    salesAccount: sales.account,
    taxRates: snapshot.taxRates,
    claim: snapshot.claim,
  });
  const revenueTaxRate = revenueTaxResolution.status === "resolved"
    ? revenueTaxResolution.taxRate
    : revenueTaxResolution.code === "sales_tax_rate_gst_mismatch"
      ? revenueTaxResolution.matchedTaxRate
      : null;

  return {
    connectionId,
    tenantId,
    contactLink,
    importedContact,
    salesMapping: sales.activeMapping,
    salesAccount: sales.account,
    retentionRequired: Number(snapshot.claim.retention_withheld_amount ?? 0)
      !== Number(snapshot.claim.retention_released_amount ?? 0),
    retentionMapping: retention.activeMapping,
    retentionAccount: retention.account,
    revenueTaxRate,
    revenueTaxResolution,
    accountingDocument: snapshot.accountingDocuments[0] ?? null,
  };
}

function evaluateMapping(params: {
  snapshot: PaymentClaimXeroReadinessSnapshot;
  accountingRoute: ClaimAccountingRoute;
  required: boolean;
  currentTenantId: string | null;
  blockers: PaymentClaimXeroReadinessBlocker[];
}) {
  if (!params.required) return;
  const prefix = params.accountingRoute === "payment_claim_revenue" ? "sales" : "retention";
  const { mappings, activeMapping, account } = resolveMapping(params.snapshot, params.accountingRoute);
  if (!activeMapping) {
    addBlocker(
      params.blockers,
      `${prefix}_mapping_archived` as PaymentClaimXeroReadinessBlockerCode,
      mappings.length > 0,
    );
    addBlocker(
      params.blockers,
      `${prefix}_mapping_missing` as PaymentClaimXeroReadinessBlockerCode,
      mappings.length === 0,
    );
    return;
  }

  const accountMetadata = metadata(account);
  const status = text(accountMetadata.status)?.toUpperCase();
  const accountActive = Boolean(
    account
    && account.organization_id === params.snapshot.organization.id
    && account.is_active === true
    && account.external_provider === "xero"
    && text(account.external_code)
    && text(accountMetadata.accountId)
    && status !== "ARCHIVED"
    && status !== "DELETED",
  );
  addBlocker(
    params.blockers,
    `${prefix}_account_inactive` as PaymentClaimXeroReadinessBlockerCode,
    !accountActive,
  );
  if (!accountActive) return;

  if (params.currentTenantId) {
    addBlocker(
      params.blockers,
      `${prefix}_account_tenant_mismatch` as PaymentClaimXeroReadinessBlockerCode,
      text(accountMetadata.tenantId) !== params.currentTenantId,
    );
  }

  const accountClass = text(accountMetadata.class)?.toUpperCase();
  const accountType = text(accountMetadata.type)?.toUpperCase();
  const validClassification = params.accountingRoute === "payment_claim_revenue"
    ? accountClass === "REVENUE"
    : accountClass === "ASSET" && accountType === "CURRENT";
  addBlocker(
    params.blockers,
    `${prefix}_account_classification_invalid` as PaymentClaimXeroReadinessBlockerCode,
    !validClassification,
  );
}

export function evaluatePaymentClaimXeroReadinessSnapshot(
  snapshot: PaymentClaimXeroReadinessSnapshot,
): PaymentClaimXeroReadinessResult {
  const blockers: PaymentClaimXeroReadinessBlocker[] = [];
  const resolved = resolvePaymentClaimXeroDependencies(snapshot);
  const connectionId = resolved.connectionId;
  const tenantId = resolved.tenantId;
  const connected = snapshot.connection?.status === "connected";

  addBlocker(blockers, "claim_not_submitted", snapshot.claim.status !== "Submitted");
  const currency = organizationCurrency(snapshot);
  addBlocker(blockers, "unsupported_currency", !currency);
  addBlocker(blockers, "xero_disconnected", !connected);
  addBlocker(blockers, "xero_tenant_missing", !tenantId);

  if (!snapshot.client) {
    addBlocker(blockers, "client_not_found");
  } else {
    const link = resolved.contactLink;
    if (!link) {
      addBlocker(blockers, "client_contact_missing");
    } else {
      addBlocker(blockers, "client_contact_organization_mismatch", link.organization_id !== snapshot.organization.id);
      if (connectionId) {
        addBlocker(blockers, "client_contact_connection_mismatch", link.accounting_connection_id !== connectionId);
      }
      if (tenantId) addBlocker(blockers, "client_contact_tenant_mismatch", link.tenant_id !== tenantId);
      addBlocker(
        blockers,
        "client_contact_inactive",
        link.link_status !== "linked"
          || !resolved.importedContact
          || ["ARCHIVED", "GDPRREQUEST"].includes(String(resolved.importedContact.contact_status)),
      );
    }
  }

  evaluateMapping({ snapshot, accountingRoute: "payment_claim_revenue", required: true, currentTenantId: tenantId, blockers });
  evaluateMapping({ snapshot, accountingRoute: "retention_receivable", required: resolved.retentionRequired, currentTenantId: tenantId, blockers });

  if (connectionId && tenantId && resolved.salesAccount && resolved.revenueTaxResolution.status === "blocked") {
    addBlocker(blockers, resolved.revenueTaxResolution.code);
  }

  const documents = snapshot.accountingDocuments;
  addBlocker(blockers, "accounting_document_invalid", documents.length > 1);
  const document = resolved.accountingDocument;
  if (document) {
    addBlocker(blockers, "accounting_document_organization_mismatch", document.organization_id !== snapshot.organization.id);
    addBlocker(
      blockers,
      "accounting_document_invalid",
      document.provider !== "xero"
        || document.local_document_type !== "project_claim"
        || document.project_claim_id !== snapshot.claim.id
        || document.local_document_id != null
        || document.current_version_id != null,
    );
    if (connectionId) {
      addBlocker(blockers, "accounting_document_connection_mismatch", document.accounting_connection_id !== connectionId);
    }
    if (tenantId) addBlocker(blockers, "accounting_document_tenant_mismatch", document.tenant_id !== tenantId);
    addBlocker(
      blockers,
      "existing_invoice_id_invalid",
      document.external_document_id != null && !text(document.external_document_id),
    );
    addBlocker(
      blockers,
      "unsupported_currency",
      document.currency_code != null
        && text(document.currency_code)?.toUpperCase() !== currency,
    );
  }

  return { ready: blockers.length === 0, blockers };
}

function terminal(blocker: PaymentClaimXeroReadinessBlockerCode): PaymentClaimXeroReadinessResult {
  return { ready: false, blockers: [{ code: blocker, message: BLOCKER_MESSAGES[blocker] }] };
}

export async function resolvePaymentClaimXeroReadinessContext(params: {
  organizationId: string;
  claimId: string;
}): Promise<PaymentClaimXeroResolution> {
  const db = adminDb(await createAdminSupabaseClient());
  const [
    organizationResult,
    claimResult,
    connection,
    routeMappingsResult,
    legacyMappingsResult,
    taxRatesResult,
    documentsResult,
  ] = await Promise.all([
    db.from("organizations")
      .select("id, name, country, default_currency, tax_registration_status")
      .eq("id", params.organizationId)
      .maybeSingle(),
    db.from("project_claims")
      .select("*")
      .eq("id", params.claimId)
      .maybeSingle(),
    getOrganizationXeroConnection(params.organizationId) as Promise<Row | null>,
    db.from("organization_accounting_route_mappings").select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .in("accounting_route", ["payment_claim_revenue", "retention_receivable"]),
    db.from("organization_tradesstack_accounting_mappings").select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .in("tradesstack_cost_code", [600, 700]),
    db.from("organization_accounting_tax_rates").select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero"),
    db.from("organization_accounting_documents").select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("project_claim_id", params.claimId)
      .order("updated_at", { ascending: false }),
  ]);
  if (organizationResult.error) throw new Error(organizationResult.error.message);
  if (!organizationResult.data) return { snapshot: null, terminalReadiness: terminal("organization_not_found") };
  if (claimResult.error) throw new Error(claimResult.error.message);
  if (!claimResult.data) return { snapshot: null, terminalReadiness: terminal("claim_not_found") };
  if (claimResult.data.organization_id !== params.organizationId) {
    return { snapshot: null, terminalReadiness: terminal("organization_mismatch") };
  }
  const firstWaveError = [
    routeMappingsResult.error,
    legacyMappingsResult.error,
    taxRatesResult.error,
    documentsResult.error,
  ].find(Boolean);
  if (firstWaveError) throw new Error(firstWaveError.message);

  const routeMappings = (routeMappingsResult.data ?? []) as Row[];
  const mappings = (legacyMappingsResult.data ?? []) as Row[];
  const costCodeIds = [
    ...new Set(
      [...routeMappings, ...mappings]
        .map((row) => text(row.organization_cost_code_id))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [projectResult, costCodesResult] = await Promise.all([
    db.from("organization_projects")
      .select("id, organization_id, client_id, project_code, name")
      .eq("organization_id", params.organizationId)
      .eq("id", claimResult.data.project_id)
      .maybeSingle(),
    costCodeIds.length
      ? db.from("organization_cost_codes").select("*")
          .eq("organization_id", params.organizationId)
          .in("id", costCodeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (!projectResult.data || projectResult.data.organization_id !== params.organizationId) {
    return { snapshot: null, terminalReadiness: terminal("project_not_found") };
  }
  if (!projectResult.data.client_id) return { snapshot: null, terminalReadiness: terminal("client_missing") };
  if (costCodesResult.error) throw new Error(costCodesResult.error.message);

  const [clientResult, linksResult] = await Promise.all([
    db.from("organization_clients")
      .select("id, organization_id, name, company_name")
      .eq("organization_id", params.organizationId)
      .eq("id", projectResult.data.client_id)
      .maybeSingle(),
    db.from("organization_external_contacts").select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("local_entity_type", "client")
      .eq("local_entity_id", projectResult.data.client_id)
      .order("created_at", { ascending: false }),
  ]);
  if (clientResult.error) throw new Error(clientResult.error.message);
  if (!clientResult.data || clientResult.data.organization_id !== params.organizationId) {
    return { snapshot: null, terminalReadiness: terminal("client_not_found") };
  }
  if (linksResult.error) throw new Error(linksResult.error.message);

  const links = (linksResult.data ?? []) as Row[];
  const contactIds = [
    ...new Set(
      links
        .map((row) => text(row.external_contact_id))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const importedContactsResult = contactIds.length
    ? await db.from("organization_xero_contacts").select("*")
        .eq("organization_id", params.organizationId)
        .eq("connection_id", text(connection?.id) ?? "")
        .eq("tenant_id", text(connection?.tenant_id) ?? "")
        .in("contact_id", contactIds)
    : { data: [], error: null };
  if (importedContactsResult.error) throw new Error(importedContactsResult.error.message);

  return { snapshot: {
    organization: organizationResult.data,
    claim: claimResult.data,
    project: projectResult.data,
    client: clientResult.data,
    connection,
    contactLinks: links,
    importedContacts: (importedContactsResult.data ?? []) as Row[],
    mappings,
    routeMappings,
    costCodes: (costCodesResult.data ?? []) as Row[],
    taxRates: (taxRatesResult.data ?? []) as Row[],
    accountingDocuments: (documentsResult.data ?? []) as Row[],
  }, terminalReadiness: null };
}

export async function evaluatePaymentClaimXeroReadiness(params: {
  organizationId: string;
  claimId: string;
}): Promise<PaymentClaimXeroReadinessResult> {
  const resolution = await resolvePaymentClaimXeroReadinessContext(params);
  return resolution.snapshot
    ? evaluatePaymentClaimXeroReadinessSnapshot(resolution.snapshot)
    : resolution.terminalReadiness;
}
