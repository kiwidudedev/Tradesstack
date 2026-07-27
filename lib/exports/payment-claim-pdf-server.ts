import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  composePaymentClaimPdfExport,
  type PaymentClaimPdfExportModel,
} from "@/lib/exports/payment-claim-pdf";
import type { XeroActionTiming } from "@/lib/xero/action-performance";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Payment Claim snapshot fields are ahead of some generated client builds.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

function db(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function dayMonthYear(value: unknown) {
  const resolved = text(value);
  if (!resolved) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
    const [year, month, day] = resolved.split("-");
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(resolved);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function periodRange(startValue: unknown, endValue: unknown) {
  const start = text(startValue);
  const end = text(endValue);
  if (!start && !end) return "—";
  const startDate = start ? new Date(`${start}T00:00:00`) : null;
  const endDate = end ? new Date(`${end}T00:00:00`) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    const left = dayMonthYear(start);
    const right = dayMonthYear(end);
    return left === "—" ? right : right === "—" ? left : `${left} - ${right}`;
  }
  if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.toLocaleDateString("en-NZ", { month: "long" })} ${startDate.getDate()} - ${endDate.getDate()}`;
  }
  return `${startDate.toLocaleDateString("en-NZ", { month: "long", day: "numeric" })} - ${endDate.toLocaleDateString("en-NZ", { month: "long", day: "numeric" })}`;
}

function sourceLabel(line: Row) {
  const kind = text(line.source_kind) || "Item";
  const sourceNumber = text(line.source_number);
  return sourceNumber ? `${kind} ${sourceNumber}` : kind;
}

export async function buildPaymentClaimPdfExportModelServer(params: {
  organizationId: string;
  claimId: string;
}) {
  const admin = db(await createAdminSupabaseClient());
  const [organizationResult, claimResult, linesResult] = await Promise.all([
    admin.from("organizations")
      .select("id, name, logo_path, brand_primary_color, country, business_number, bank_account_details, gst_number, contact_name, contact_email, contact_phone")
      .eq("id", params.organizationId)
      .maybeSingle(),
    admin.from("project_claims").select("*")
      .eq("organization_id", params.organizationId)
      .eq("id", params.claimId)
      .maybeSingle(),
    admin.from("project_claim_line_items").select("*")
      .eq("organization_id", params.organizationId)
      .eq("claim_id", params.claimId)
      .order("sort_order", { ascending: true }),
  ]);
  const initialError = organizationResult.error ?? claimResult.error ?? linesResult.error;
  if (initialError) throw new Error(initialError.message);
  if (!organizationResult.data || !claimResult.data) {
    throw new Error("The authoritative Payment Claim PDF data could not be loaded.");
  }
  const organization = organizationResult.data as Row;
  const claim = claimResult.data as Row;
  const projectResult = await admin.from("organization_projects")
    .select("id, organization_id, name, location, client_id")
    .eq("organization_id", params.organizationId)
    .eq("id", claim.project_id)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) {
    throw new Error(projectResult.error?.message ?? "The Payment Claim project could not be loaded.");
  }
  const project = projectResult.data as Row;
  const clientResult = project.client_id
    ? await admin.from("organization_clients")
        .select("id, organization_id, name, company_name")
        .eq("organization_id", params.organizationId)
        .eq("id", project.client_id)
        .maybeSingle()
    : { data: null, error: null };
  if (clientResult.error) throw new Error(clientResult.error.message);
  const client = clientResult.data as Row | null;
  const logoPath = text(organization.logo_path);
  const logoUrl = logoPath
    ? admin.storage.from("organization-logos").getPublicUrl(logoPath).data.publicUrl
    : null;
  const lines = (linesResult.data ?? []) as Row[];
  const previousClaims = number(claim.previous_claims_total);
  const currentClaim = number(claim.claim_amount);

  const model: PaymentClaimPdfExportModel = {
    organizationCountry: text(organization.country) || null,
    organizationName: text(organization.name) || "Tradesstack",
    organizationLogoUrl: logoUrl,
    organizationBrandPrimaryColor: text(organization.brand_primary_color) || null,
    organizationBusinessNumber: text(organization.business_number),
    organizationBankAccountDetails: text(organization.bank_account_details),
    organizationGstNumber: text(organization.gst_number),
    organizationContactName: text(organization.contact_name),
    organizationContactEmail: text(organization.contact_email),
    organizationContactPhone: text(organization.contact_phone),
    projectName: text(project.name) || "Project",
    projectLocation: text(project.location),
    clientCompanyName: text(client?.company_name) || text(client?.name),
    clientContactName: text(client?.name),
    claimNumber: text(claim.claim_number),
    issueDateIso: text(claim.claim_date) || null,
    issueDateLabel: dayMonthYear(claim.claim_date),
    dueDateLabel: dayMonthYear(claim.due_date),
    periodRangeLabel: periodRange(claim.period_start, claim.period_end),
    notes: text(claim.notes),
    legalNoticeText: ["NZ", "NZL", "NEW ZEALAND"].includes(text(organization.country).toUpperCase())
      ? "This is a Payment Claim under the Construction Contracts Act 2002."
      : null,
    originalContractLabel: money(claim.linked_quote_value),
    approvedVariationsLabel: money(claim.linked_approved_variations),
    revisedContractValueLabel: money(claim.revised_contract_value),
    valueEarnedToDateLabel: money(previousClaims + currentClaim),
    previousClaimsTotalLabel: money(previousClaims),
    grossCurrentClaimLabel: money(currentClaim),
    retentionWithheldLabel: money(claim.retention_withheld_amount),
    retentionHeldToDateLabel: money(claim.retention_held_to_date),
    netCurrentClaimLabel: money(claim.net_claim_excl_gst),
    gstLabel: "GST (15%)",
    gstAmountLabel: money(claim.gst_amount),
    totalPayableLabel: money(claim.total_payable),
    lineItems: lines.map((line) => {
      const sourceTotal = Math.max(0, number(line.source_total));
      const previousAmount = Math.max(0, number(line.previously_claimed_amount));
      const claimPercent = Math.min(100, Math.max(0, number(line.claim_percent)));
      const cumulativeAmount = previousAmount + Math.max(0, sourceTotal - previousAmount) * (claimPercent / 100);
      const cumulativePercent = sourceTotal > 0 ? Math.min(100, cumulativeAmount / sourceTotal * 100) : 0;
      return {
        id: text(line.id),
        description: text(line.description) || "Untitled line item",
        sourceLabel: sourceLabel(line),
        secondaryLabel: text(line.source_kind) === "Variation" && text(line.source_title)
          ? text(line.source_title)
          : null,
        contractValueLabel: money(sourceTotal),
        progressLabel: `${cumulativePercent.toFixed(2)}%`,
        totalLabel: money(cumulativeAmount),
      };
    }),
  };
  return { model, claim, project, organization, lines };
}

function serverPdfFetch(input: RequestInfo | URL, init?: RequestInit) {
  const value = String(input);
  if (value.startsWith("/")) {
    const safePath = value.replace(/^\/+/, "");
    if (safePath.includes("..")) return Promise.resolve(new Response(null, { status: 400 }));
    return readFile(join(process.cwd(), "public", safePath))
      .then((bytes) => new Response(bytes, { status: 200, headers: { "content-type": "application/pdf" } }))
      .catch(() => new Response(null, { status: 404 }));
  }
  return fetch(input, init);
}

export async function generatePaymentClaimPdfBundleServer(params: {
  organizationId: string;
  claimId: string;
}, timing?: XeroActionTiming) {
  const resolved = timing
    ? await timing.measure(
        "payment_pdf_data_model",
        () => buildPaymentClaimPdfExportModelServer(params),
      )
    : await buildPaymentClaimPdfExportModelServer(params);
  const compose = () => composePaymentClaimPdfExport({
      model: resolved.model,
      fetchImpl: serverPdfFetch as typeof fetch,
    });
  const exportResult = timing
    ? await timing.measure("payment_pdf_render_merge", compose)
    : await compose();
  return { ...exportResult, model: resolved.model, claim: resolved.claim };
}
