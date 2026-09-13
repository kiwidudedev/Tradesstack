import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  composeInvoicePdfExport,
  type InvoicePdfExportModel,
} from "@/lib/exports/invoice-pdf";
import type { PdfExportTiming } from "@/lib/exports/pdf-export-timing";

type Row = Record<string, unknown>;
type UntypedQueryResult = {
  data: unknown;
  error: { message: string } | null;
};
type UntypedAdmin = {
  // Payment Claim and accounting revision fields are ahead of some generated clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

const ELIGIBLE_INVOICE_STATUSES = new Set([
  "Submitted",
  "Unpaid",
  "Paid",
  "Overdue",
]);

export type InvoicePdfServerErrorCode =
  | "not_found"
  | "ineligible_status"
  | "missing_value"
  | "invalid_value"
  | "financial_mismatch"
  | "accounting_identity_invalid";

export class InvoicePdfServerError extends Error {
  constructor(
    readonly code: InvoicePdfServerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InvoicePdfServerError";
  }
}

function db(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string) {
  const resolved = optionalText(value);
  if (!resolved) {
    throw new InvoicePdfServerError(
      "missing_value",
      `Invoice export requires ${field}.`,
    );
  }
  return resolved;
}

export function parseInvoiceMoneyMinor(value: unknown, field: string) {
  if (
    value === null
    || value === undefined
    || (typeof value !== "string" && typeof value !== "number")
  ) {
    throw new InvoicePdfServerError(
      "missing_value",
      `Invoice export requires persisted ${field}.`,
    );
  }
  const normalized = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new InvoicePdfServerError(
      "invalid_value",
      `Persisted ${field} must be a non-negative amount with no more than two decimal places.`,
    );
  }
  const [whole, fraction = ""] = normalized.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) {
    throw new InvoicePdfServerError(
      "invalid_value",
      `Persisted ${field} is outside the supported invoice range.`,
    );
  }
  return minor;
}

function requiredIsoDate(value: unknown, field: string) {
  const resolved = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
    throw new InvoicePdfServerError(
      "invalid_value",
      `${field} must be a persisted calendar date.`,
    );
  }
  const parsed = new Date(`${resolved}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== resolved
  ) {
    throw new InvoicePdfServerError(
      "invalid_value",
      `${field} must be a valid persisted calendar date.`,
    );
  }
  return resolved;
}

function dateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function currencyCode(value: unknown) {
  const resolved = requiredText(value, "organization currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(resolved)) {
    throw new InvoicePdfServerError(
      "invalid_value",
      "Organization currency must be a three-letter ISO currency code.",
    );
  }
  try {
    new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: resolved,
    }).format(0);
  } catch {
    throw new InvoicePdfServerError(
      "invalid_value",
      "Organization currency is not supported by the invoice formatter.",
    );
  }
  return resolved;
}

function taxLabel(country: unknown) {
  const normalized = optionalText(country)
    .toUpperCase()
    .replace(/\s+/g, " ");
  return [
    "NZ",
    "NZL",
    "NEW ZEALAND",
    "AU",
    "AUS",
    "AUSTRALIA",
  ].includes(normalized)
    ? "GST"
    : "Tax";
}

function notFound() {
  return new InvoicePdfServerError(
    "not_found",
    "The requested invoice source could not be found.",
  );
}

async function resolveInvoiceNumber(params: {
  admin: UntypedAdmin;
  organizationId: string;
  claimId: string;
  claimNumber: string;
  timing?: PdfExportTiming;
}) {
  params.timing?.start("accounting-document-query");
  const documentResult = await params.admin
    .from("organization_accounting_documents")
    .select(
      "id,organization_id,project_claim_id,provider,local_document_type,"
      + "integration_contract,active_accounting_revision_id,"
      + "external_document_id,external_document_number,"
      + "accounting_connection_id,tenant_id",
    )
    .eq("organization_id", params.organizationId)
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim")
    .eq("project_claim_id", params.claimId)
    .maybeSingle();
  params.timing?.end("accounting-document-query");
  if (documentResult.error) {
    throw new Error(documentResult.error.message);
  }
  const document = documentResult.data as Row | null;
  if (!document?.active_accounting_revision_id) {
    params.timing?.mark("accounting-revision-query-completed");
    return params.claimNumber;
  }

  params.timing?.start("accounting-revision-query");
  const revisionResult = await params.admin
    .from("organization_accounting_document_revisions")
    .select(
      "id,organization_id,accounting_document_id,external_document_id,"
      + "external_document_number,connection_id,tenant_id,lifecycle_state",
    )
    .eq("organization_id", params.organizationId)
    .eq("id", document.active_accounting_revision_id)
    .eq("accounting_document_id", document.id)
    .maybeSingle();
  params.timing?.end("accounting-revision-query");
  if (revisionResult.error) {
    throw new Error(revisionResult.error.message);
  }
  const revision = revisionResult.data as Row | null;
  const invoiceNumber = optionalText(revision?.external_document_number);
  const identityMatches = Boolean(
    revision
    && revision.lifecycle_state === "succeeded"
    && optionalText(revision.external_document_id)
    && invoiceNumber
    && revision.external_document_id === document.external_document_id
    && revision.external_document_number === document.external_document_number
    && revision.connection_id === document.accounting_connection_id
    && revision.tenant_id === document.tenant_id,
  );
  if (!identityMatches) {
    throw new InvoicePdfServerError(
      "accounting_identity_invalid",
      "The active invoice identity could not be validated for export.",
    );
  }
  return invoiceNumber;
}

export async function buildInvoicePdfExportModelServer(params: {
  organizationId: string;
  claimId: string;
  timing?: PdfExportTiming;
}) {
  const admin = db(await createAdminSupabaseClient());
  params.timing?.start("organization-query");
  params.timing?.start("claim-query");
  const [organizationResult, claimResult] = await Promise.all([
    admin.from("organizations")
      .select(
        "id,name,logo_path,brand_primary_color,country,business_number,"
        + "bank_account_details,gst_number,contact_name,contact_email,"
        + "contact_phone,default_currency",
      )
      .eq("id", params.organizationId)
      .maybeSingle()
      .then((result: UntypedQueryResult) => {
        params.timing?.end("organization-query");
        return result;
      }),
    admin.from("project_claims")
      .select(
        "id,organization_id,project_id,claim_number,claim_title,status,"
        + "claim_date,due_date,claim_amount,retention_withheld_amount,"
        + "retention_released_amount,net_claim_excl_gst,gst_amount,total_payable",
      )
      .eq("organization_id", params.organizationId)
      .eq("id", params.claimId)
      .maybeSingle()
      .then((result: UntypedQueryResult) => {
        params.timing?.end("claim-query");
        return result;
      }),
  ]);
  const firstError = organizationResult.error ?? claimResult.error;
  if (firstError) throw new Error(firstError.message);
  if (!organizationResult.data || !claimResult.data) throw notFound();

  const organization = organizationResult.data as Row;
  const claim = claimResult.data as Row;
  if (!ELIGIBLE_INVOICE_STATUSES.has(String(claim.status))) {
    throw new InvoicePdfServerError(
      "ineligible_status",
      "Invoices can only be exported for Submitted, Unpaid, Paid, or Overdue claims.",
    );
  }

  const claimNumber = requiredText(claim.claim_number, "payment claim number");
  const projectClientBranch = (async () => {
    params.timing?.start("project-query");
    const projectResult = await admin.from("organization_projects")
      .select("id,organization_id,name,location,client_id")
      .eq("organization_id", params.organizationId)
      .eq("id", claim.project_id)
      .maybeSingle();
    params.timing?.end("project-query");
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (!projectResult.data) throw notFound();
    const project = projectResult.data as Row;
    const clientId = requiredText(project.client_id, "a project client");
    params.timing?.start("client-query");
    const clientResult = await admin.from("organization_clients")
      .select("id,organization_id,name,company_name")
      .eq("organization_id", params.organizationId)
      .eq("id", clientId)
      .maybeSingle();
    params.timing?.end("client-query");
    if (clientResult.error) throw new Error(clientResult.error.message);
    if (!clientResult.data) throw notFound();
    return {
      project,
      client: clientResult.data as Row,
    };
  })();
  const accountingIdentityBranch = resolveInvoiceNumber({
    admin,
    organizationId: params.organizationId,
    claimId: params.claimId,
    claimNumber,
    timing: params.timing,
  });
  const [projectClientResult, accountingIdentityResult] = await Promise.all([
    projectClientBranch.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    ),
    accountingIdentityBranch.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    ),
  ]);
  if ("error" in projectClientResult) throw projectClientResult.error;
  if ("error" in accountingIdentityResult) {
    throw accountingIdentityResult.error;
  }
  const { project, client } = projectClientResult.value;
  const invoiceNumber = accountingIdentityResult.value;
  params.timing?.start("validation");
  const invoiceDateIso = requiredIsoDate(claim.claim_date, "invoice date");
  const dueDateIso = requiredIsoDate(claim.due_date, "due date");
  const grossClaimMinor = parseInvoiceMoneyMinor(
    claim.claim_amount,
    "claim_amount",
  );
  const retentionWithheldMinor = parseInvoiceMoneyMinor(
    claim.retention_withheld_amount,
    "retention_withheld_amount",
  );
  const retentionReleasedMinor = parseInvoiceMoneyMinor(
    claim.retention_released_amount,
    "retention_released_amount",
  );
  const subtotalMinor = parseInvoiceMoneyMinor(
    claim.net_claim_excl_gst,
    "net_claim_excl_gst",
  );
  const gstMinor = parseInvoiceMoneyMinor(claim.gst_amount, "gst_amount");
  const totalMinor = parseInvoiceMoneyMinor(
    claim.total_payable,
    "total_payable",
  );

  if (
    grossClaimMinor - retentionWithheldMinor + retentionReleasedMinor
    !== subtotalMinor
  ) {
    throw new InvoicePdfServerError(
      "financial_mismatch",
      "Persisted gross claim and retention values do not reconcile to the invoice subtotal.",
    );
  }
  if (subtotalMinor + gstMinor !== totalMinor) {
    throw new InvoicePdfServerError(
      "financial_mismatch",
      "Persisted invoice subtotal and tax do not reconcile to the total due.",
    );
  }
  params.timing?.end("validation");

  const logoPath = optionalText(organization.logo_path);
  const organizationName = requiredText(
    organization.name,
    "organization name",
  );
  const projectName = requiredText(project.name, "project name");
  const clientContactName = requiredText(client.name, "client contact");
  const clientCompanyName = optionalText(client.company_name)
    || clientContactName;
  const model: InvoicePdfExportModel = {
    organizationName,
    organizationLogoUrl: logoPath
      ? admin.storage.from("organization-logos").getPublicUrl(logoPath).data.publicUrl
      : null,
    organizationBrandPrimaryColor:
      optionalText(organization.brand_primary_color) || null,
    organizationBusinessNumber: optionalText(organization.business_number),
    organizationBankAccountDetails:
      optionalText(organization.bank_account_details),
    organizationTaxNumber: optionalText(organization.gst_number),
    organizationContactName: optionalText(organization.contact_name),
    organizationContactEmail: optionalText(organization.contact_email),
    organizationContactPhone: optionalText(organization.contact_phone),
    clientCompanyName,
    clientContactName,
    projectName,
    projectLocation: optionalText(project.location),
    invoiceNumber,
    invoiceDateIso,
    invoiceDateLabel: dateLabel(invoiceDateIso),
    dueDateLabel: dateLabel(dueDateIso),
    paymentClaimReference: claimNumber,
    claimTitle: optionalText(claim.claim_title),
    currencyCode: currencyCode(organization.default_currency),
    taxLabel: taxLabel(organization.country),
    subtotalMinor,
    taxMinor: gstMinor,
    totalMinor,
    lines: [
      {
        kind: "gross_claim",
        label: `Gross current claim — Payment Claim ${claimNumber}`,
        amountMinor: grossClaimMinor,
      },
      ...(retentionWithheldMinor > 0
        ? [{
            kind: "retention_withheld" as const,
            label: `Less retention withheld — Payment Claim ${claimNumber}`,
            amountMinor: retentionWithheldMinor,
          }]
        : []),
      ...(retentionReleasedMinor > 0
        ? [{
            kind: "retention_released" as const,
            label: `Retention released — Payment Claim ${claimNumber}`,
            amountMinor: retentionReleasedMinor,
          }]
        : []),
    ],
  };
  return {
    model,
    evidence: {
      organizationId: params.organizationId,
      claimId: params.claimId,
      projectId: String(project.id),
      clientId: String(client.id),
      status: String(claim.status),
    },
  };
}

export async function generateInvoicePdfBundleServer(params: {
  organizationId: string;
  claimId: string;
  timing?: PdfExportTiming;
}) {
  const resolved = await buildInvoicePdfExportModelServer(params);
  const result = await composeInvoicePdfExport({
    model: resolved.model,
    timing: params.timing,
  });
  return { ...result, model: resolved.model, evidence: resolved.evidence };
}
