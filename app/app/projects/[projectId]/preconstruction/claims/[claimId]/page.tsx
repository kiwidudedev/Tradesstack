"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileDown, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteStatus } from "@/lib/supabase/types";

type ClaimStatus = "Draft" | "Submitted" | "Unpaid" | "Paid" | "Overdue" | "Cancelled";
type ClaimType = "Progress" | "Deposit" | "Final";

interface ClaimRow {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  claim_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  percent_complete: number | null;
  claim_amount: number | null;
  paid_amount: number | null;
  notes: string | null;
}

interface QuoteRow {
  status: QuoteStatus;
  total_quote_price: number | null;
}

interface VariationRow {
  status: string;
  total_variation_price: number | null;
}

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function toDayMonthYearLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pickBaseQuoteValue(quotes: QuoteRow[]) {
  const accepted = quotes.find((quote) => quote.status === "Accepted");
  if (accepted?.total_quote_price) {
    return Number(accepted.total_quote_price);
  }

  const sent = quotes.find((quote) => quote.status === "Sent");
  if (sent?.total_quote_price) {
    return Number(sent.total_quote_price);
  }

  return Number(quotes[0]?.total_quote_price ?? 0);
}

function deriveJobCode(value: string | null | undefined) {
  if (!value) {
    return "JOB";
  }

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "JOB";
}

function claimStatusClassName(status: ClaimStatus) {
  switch (status) {
    case "Paid":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "Overdue":
      return "border-rose-200 bg-rose-100 text-rose-800";
    case "Submitted":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "Unpaid":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "Cancelled":
      return "border-slate-300 bg-slate-200 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export default function ProjectClaimDetailPage() {
  const params = useParams<{ projectId: string; claimId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeClaimId = params?.claimId;
  const isNewRoute = routeClaimId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [projectDbId, setProjectDbId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimNumber, setClaimNumber] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [claimType, setClaimType] = useState<ClaimType>("Progress");
  const [status, setStatus] = useState<ClaimStatus>("Draft");
  const [claimDate, setClaimDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [percentComplete, setPercentComplete] = useState("0");
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");

  const [baseQuoteValue, setBaseQuoteValue] = useState(0);
  const [approvedVariationsValue, setApprovedVariationsValue] = useState(0);
  const [previousClaimsTotal, setPreviousClaimsTotal] = useState(0);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase || !routeProjectSlug || !userId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setSaveMessage(null);

      try {
        let resolvedOrganizationId = sessionOrganizationId;
        if (!resolvedOrganizationId) {
          const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
          resolvedOrganizationId = ensuredOrganizationId ?? null;
        }
        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
        }
        if (!cancelled) {
          setOrganizationId(resolvedOrganizationId);
        }

        const { data: organizationRow } = await supabase
          .from("organizations")
          .select("name, logo_path")
          .eq("id", resolvedOrganizationId)
          .maybeSingle();
        if (!cancelled) {
          setOrganizationName(organizationRow?.name ?? "");
          if (organizationRow?.logo_path) {
            const { data: logoUrlData } = supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path);
            setOrganizationLogoUrl(logoUrlData.publicUrl);
          } else {
            setOrganizationLogoUrl(null);
          }
        }

        const { data: projectRow, error: projectError } = await supabase
          .from("organization_projects")
          .select("id, name, project_code")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();
        if (projectError || !projectRow?.id) {
          throw new Error(projectError?.message ?? "Project not found.");
        }
        if (!cancelled) {
          setProjectDbId(projectRow.id);
          setProjectName(projectRow.name ?? "");
        }

        const [{ data: quoteRows }, { data: variationRows }, { data: claimsRowsRaw }] = await Promise.all([
          supabase
            .from("project_quotes")
            .select("status, total_quote_price")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id)
            .order("updated_at", { ascending: false }),
          supabase
            .from("project_variations")
            .select("status, total_variation_price")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("project_claims")
            .select("id, claim_number, claim_amount, status")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id),
        ]);

        const quotes = (quoteRows ?? []) as QuoteRow[];
        const variations = (variationRows ?? []) as VariationRow[];
        const claimsRows = (claimsRowsRaw ?? []) as Array<{ id: string; claim_number: string; claim_amount: number | null; status: ClaimStatus }>;

        const quoteValue = pickBaseQuoteValue(quotes);
        const approvedVariations = variations
          .filter((row) => row.status === "Approved")
          .reduce((sum, row) => sum + Number(row.total_variation_price ?? 0), 0);

        const existingClaimId = isNewRoute ? null : routeClaimId;
        const previousTotal = claimsRows
          .filter((row) => row.id !== existingClaimId && row.status !== "Cancelled")
          .reduce((sum, row) => sum + Number(row.claim_amount ?? 0), 0);

        if (!cancelled) {
          setBaseQuoteValue(quoteValue);
          setApprovedVariationsValue(approvedVariations);
          setPreviousClaimsTotal(previousTotal);
        }

        if (isNewRoute) {
          const jobCode = deriveJobCode(projectRow.project_code ?? routeProjectSlug);
          const prefix = `${jobCode}-CL-`;
          const highestNumber = claimsRows.reduce((max, claim) => {
            if (!claim.claim_number?.startsWith(prefix)) {
              return max;
            }
            const match = claim.claim_number.match(new RegExp(`^${prefix}(\\d+)$`));
            const value = match ? Number.parseInt(match[1], 10) : 0;
            return Number.isFinite(value) ? Math.max(max, value) : max;
          }, 0);
          const nextNo = highestNumber + 1;
          const today = new Date().toISOString().slice(0, 10);
          const due = new Date();
          due.setDate(due.getDate() + 7);
          if (!cancelled) {
            setClaimId(null);
            setClaimNumber(`${prefix}${String(nextNo).padStart(2, "0")}`);
            setClaimTitle(`Progress Claim ${nextNo}`);
            setClaimType("Progress");
            setStatus("Draft");
            setClaimDate(today);
            setDueDate(due.toISOString().slice(0, 10));
            setPeriodStart(today);
            setPeriodEnd(due.toISOString().slice(0, 10));
            setPercentComplete("0");
            setPaidAmount("0");
            setNotes("");
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const claimsTable = (supabase as any).from("project_claims");
          const { data: claimRowRaw, error: claimError } = await claimsTable
            .select("id, claim_number, claim_title, claim_type, status, claim_date, due_date, period_start, period_end, percent_complete, claim_amount, paid_amount, notes")
            .eq("organization_id", resolvedOrganizationId)
            .eq("id", routeClaimId)
            .maybeSingle();
          if (claimError || !claimRowRaw) {
            throw new Error(claimError?.message ?? "Claim not found.");
          }

          const claim = claimRowRaw as ClaimRow;
          if (!cancelled) {
            setClaimId(claim.id);
            setClaimNumber(claim.claim_number ?? "");
            setClaimTitle(claim.claim_title ?? "");
            setClaimType((claim.claim_type ?? "Progress") as ClaimType);
            setStatus((claim.status ?? "Draft") as ClaimStatus);
            setClaimDate(claim.claim_date ?? "");
            setDueDate(claim.due_date ?? "");
            setPeriodStart(claim.period_start ?? "");
            setPeriodEnd(claim.period_end ?? "");
            setPercentComplete(String(claim.percent_complete ?? 0));
            setPaidAmount(String(claim.paid_amount ?? 0));
            setNotes(claim.notes ?? "");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load claim.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isNewRoute, routeClaimId, routeProjectSlug, sessionOrganizationId, supabase, userId]);

  const revisedContractValue = baseQuoteValue + approvedVariationsValue;
  const parsedPercentComplete = Number.isFinite(Number(percentComplete)) ? Math.min(100, Math.max(0, Number(percentComplete))) : 0;
  const valueEarnedToDate = revisedContractValue * (parsedPercentComplete / 100);
  const currentClaimAmount = Math.max(0, valueEarnedToDate - previousClaimsTotal);
  const previousPercentComplete = revisedContractValue > 0 ? (previousClaimsTotal / revisedContractValue) * 100 : 0;
  const thisClaimPercent = Math.max(0, parsedPercentComplete - previousPercentComplete);
  const paidAmountNumber = Number(paidAmount || 0);
  const balance = Math.max(0, currentClaimAmount - paidAmountNumber);
  const isSubmittedLocked = status === "Submitted";

  const saveClaim = async () => {
    if (!supabase || !organizationId || !projectDbId || !userId) {
      setError("Claim save is not ready. Please refresh and try again.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimsTable = (supabase as any).from("project_claims");

      const payload = {
        organization_id: organizationId,
        project_id: projectDbId,
        created_by: userId,
        claim_number: claimNumber.trim(),
        claim_title: claimTitle.trim() || "Untitled Claim",
        claim_type: claimType,
        status,
        claim_date: claimDate || null,
        due_date: dueDate || null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        percent_complete: Number(parsedPercentComplete.toFixed(3)),
        claim_amount: Number(currentClaimAmount.toFixed(2)),
        paid_amount: Number(paidAmountNumber.toFixed(2)),
        linked_quote_value: Number(baseQuoteValue.toFixed(2)),
        linked_approved_variations: Number(approvedVariationsValue.toFixed(2)),
        previous_claims_total: Number(previousClaimsTotal.toFixed(2)),
        revised_contract_value: Number(revisedContractValue.toFixed(2)),
        notes,
      };

      if (!claimId) {
        const { data: inserted, error: insertError } = await claimsTable
          .insert(payload)
          .select("id")
          .single();
        if (insertError || !inserted?.id) {
          throw new Error(insertError?.message ?? "Unable to create claim.");
        }
        setClaimId(inserted.id as string);
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims/${inserted.id as string}`);
      } else {
        const { error: updateError } = await claimsTable
          .update(payload)
          .eq("organization_id", organizationId)
          .eq("id", claimId);
        if (updateError) {
          throw new Error(updateError.message);
        }
      }

      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClaim = async () => {
    if (!claimId || !supabase || !organizationId) {
      return;
    }
    const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete claim ${claimNumber}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimsTable = (supabase as any).from("project_claims");
      const { error: deleteError } = await claimsTable
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", claimId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete claim.");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportClaimPdf = () => {
    if (!claimId || typeof window === "undefined") {
      return;
    }

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName || routeProjectSlug?.replaceAll("-", " ") || "Project";
    const printableClaimNumber = claimNumber || "Unassigned";
    const printableClaimTitle = claimTitle.trim() || "Progress Claim";
    const issueDate = toDayMonthYearLabel(claimDate || new Date().toISOString().slice(0, 10));
    const periodLabel = periodStart || periodEnd
      ? `${toDayMonthYearLabel(periodStart || null)} - ${toDayMonthYearLabel(periodEnd || null)}`
      : "—";
    const raisedBy = session?.fullName?.trim() || "—";
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableClaimNumber}`;
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;

    const gstRate = 0.15;
    const subtotal = currentClaimAmount;
    const gst = subtotal * gstRate;
    const total = subtotal + gst;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportDocumentTitle)}</title>
    <style>
      :root {
        --navy: #082851;
        --orange: #F74917;
        --text: #0F172A;
        --muted: #64748B;
        --border: #E2E8F0;
      }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
      html, body { margin: 0; padding: 0; background: #fff; color: var(--text); }
      body { font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; line-height: 1.4; }
      .doc { position: relative; min-height: calc(297mm - 30mm); }
      .accent { height: 3px; background: var(--orange); margin-bottom: 14px; }
      .header {
        display: grid;
        grid-template-columns: 1fr 320px;
        column-gap: 24px;
        align-items: start;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .logo-img { width: 100%; height: 100%; object-fit: contain; }
      .logo-fallback {
        width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--border); color: var(--navy); font-weight: 700; letter-spacing: 0.06em;
      }
      .company-name { margin: 0; color: var(--navy); font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
      .header-meta dl { margin: 0; }
      .header-meta .row {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 8px;
        padding: 2px 0;
      }
      .header-meta dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .header-meta dd { margin: 0; color: var(--text); font-weight: 600; }
      .title-block { padding: 16px 0 14px; border-bottom: 1px solid var(--border); }
      .quote-title { margin: 0; color: var(--navy); font-size: 34px; line-height: 1.05; letter-spacing: -0.02em; }
      .details { padding: 12px 0; border-bottom: 1px solid var(--border); }
      .details-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 22px; row-gap: 6px; }
      .details-row { display: grid; grid-template-columns: 94px 1fr; gap: 10px; }
      .details-row .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .details-row .v { color: var(--text); font-weight: 600; }
      .section-title {
        margin: 16px 0 8px;
        color: var(--navy);
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .claim-summary-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #ffffff;
        padding: 16px;
      }
      .claim-summary-title {
        margin: 0 0 10px;
        color: var(--text);
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .summary-group {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
      }
      .summary-group:first-of-type {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
      }
      .summary-group-label {
        margin: 0 0 8px;
        color: #5d7292;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .summary-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 3px 0;
        align-items: baseline;
      }
      .summary-row .k {
        color: #5d6f8b;
      }
      .summary-row .v {
        color: #334155;
        font-weight: 500;
      }
      .summary-row.strong .k,
      .summary-row.strong .v {
        color: var(--text);
        font-weight: 700;
      }
      .current-claim-block {
        margin-top: 12px;
        border-radius: 12px;
        background: #0b2e63;
        padding: 14px 16px;
        color: white;
      }
      .current-claim-block .k {
        margin: 0;
        color: rgba(255, 255, 255, 0.75);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .current-claim-block .v {
        margin: 4px 0 0;
        font-size: 46px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: -0.03em;
      }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead th {
        background: #F8FAFC;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 10px;
        font-weight: 700;
        text-align: left;
        padding: 8px 8px;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
      }
      tbody td {
        padding: 8px;
        border-bottom: 1px solid #EEF2F7;
        color: var(--text);
        vertical-align: top;
        word-break: break-word;
      }
      .right { text-align: right; }
      .notes-box {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px;
        color: var(--text);
        background: #fff;
      }
      .totals {
        margin-top: 10px;
        margin-left: auto;
        width: 360px;
      }
      .totals .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 3px 0;
      }
      .totals .k { color: var(--muted); }
      .totals .v { text-align: right; font-weight: 600; }
      .totals .divider { border-top: 2px solid var(--navy); margin-top: 6px; padding-top: 8px; }
      .totals .final .k,
      .totals .final .v { color: var(--navy); font-weight: 800; font-size: 22px; line-height: 1.05; }
      .doc-footer {
        margin-top: 14px;
        padding-top: 8px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        color: var(--muted);
        font-size: 10px;
      }
      .doc-footer .page::before { content: counter(page); }
      @media print {
        .doc { min-height: auto; }
      }
    </style>
  </head>
  <body>
    <main class="doc">
      <div class="accent"></div>
      <header class="header">
        <div class="brand">
          <div class="logo-wrap">${logoMarkup}</div>
          <div>
            <p class="company-name">${escapeHtml(printableOrgName)}</p>
          </div>
        </div>
        <div class="header-meta">
          <dl>
            <div class="row"><dt>Claim #</dt><dd>${escapeHtml(printableClaimNumber)}</dd></div>
            <div class="row"><dt>Issued</dt><dd>${escapeHtml(issueDate)}</dd></div>
            <div class="row"><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
          </dl>
        </div>
      </header>

      <section class="title-block">
        <h1 class="quote-title">${escapeHtml(printableClaimTitle)}</h1>
      </section>

      <section class="details">
        <div class="details-grid">
          <div class="details-row"><span class="k">Project</span><span class="v">${escapeHtml(printableProjectName)}</span></div>
          <div class="details-row"><span class="k">Raised By</span><span class="v">${escapeHtml(raisedBy || "-")}</span></div>
          <div class="details-row"><span class="k">Claim Type</span><span class="v">${escapeHtml(claimType)}</span></div>
          <div class="details-row"><span class="k">Claim Date</span><span class="v">${escapeHtml(toDayMonthYearLabel(claimDate || null))}</span></div>
          <div class="details-row"><span class="k">Due Date</span><span class="v">${escapeHtml(toDayMonthYearLabel(dueDate || null))}</span></div>
          <div class="details-row"><span class="k">Period</span><span class="v">${escapeHtml(periodLabel)}</span></div>
        </div>
      </section>

      <section class="claim-summary-card">
        <h2 class="claim-summary-title">Claim Summary</h2>

        <div class="summary-group">
          <p class="summary-group-label">Contract Position</p>
          <div class="summary-row"><span class="k">Original Contract</span><span class="v">${toMoney(baseQuoteValue)}</span></div>
          <div class="summary-row"><span class="k">Approved Variations</span><span class="v">${toMoney(approvedVariationsValue)}</span></div>
          <div class="summary-row strong"><span class="k">Revised Contract Value</span><span class="v">${toMoney(revisedContractValue)}</span></div>
        </div>

        <div class="summary-group">
          <p class="summary-group-label">Previous Claims</p>
          <div class="summary-row"><span class="k">Total Previously Claimed</span><span class="v">${toMoney(previousClaimsTotal)}</span></div>
          <div class="summary-row"><span class="k">Previous % Complete</span><span class="v">${previousPercentComplete.toFixed(2)}%</span></div>
        </div>

        <div class="summary-group">
          <p class="summary-group-label">This Claim</p>
          <div class="summary-row"><span class="k">% Complete (Current)</span><span class="v">${parsedPercentComplete.toFixed(2)}%</span></div>
          <div class="summary-row"><span class="k">This Claim %</span><span class="v">${thisClaimPercent.toFixed(2)}%</span></div>
          <div class="summary-row"><span class="k">Value Earned to Date</span><span class="v">${toMoney(valueEarnedToDate)}</span></div>
          <div class="summary-row"><span class="k">Less Previous Claims</span><span class="v">-${toMoney(previousClaimsTotal)}</span></div>
        </div>

        <div class="summary-group">
          <p class="summary-group-label">Payment Position</p>
          <div class="summary-row"><span class="k">Paid to Date</span><span class="v">${toMoney(paidAmountNumber)}</span></div>
          <div class="summary-row strong"><span class="k">Outstanding</span><span class="v">${toMoney(balance)}</span></div>
        </div>

        <div class="current-claim-block">
          <p class="k">Current Claim</p>
          <p class="v">${toMoney(currentClaimAmount)}</p>
        </div>
      </section>

      <h2 class="section-title">Notes</h2>
      <section class="notes-box">${escapeHtml(notes.trim() || "No notes added.")}</section>

      <section class="totals">
        <div class="row"><span class="k">Subtotal</span><span class="v">${toMoney(subtotal)}</span></div>
        <div class="row"><span class="k">GST</span><span class="v">${toMoney(gst)}</span></div>
        <div class="divider final">
          <div class="row"><span class="k">Total</span><span class="v">${toMoney(total)}</span></div>
        </div>
      </section>

      <footer class="doc-footer">
        <span>${escapeHtml(printableOrgName)} • ${escapeHtml(printableClaimNumber)}</span>
        <span class="page">Page </span>
      </footer>
    </main>
  </body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "width=1024,height=768");
    if (!popup) {
      URL.revokeObjectURL(url);
      setError("Unable to export PDF. Please allow pop-ups and try again.");
      return;
    }

    popup.focus();
    popup.onload = () => {
      popup.print();
    };
    popup.onafterprint = () => {
      URL.revokeObjectURL(url);
    };
  };

  if (isLoading) {
    return (
      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardContent className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading claim...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          asChild
          className={`${interMedium.className} h-8 rounded-[6px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
        >
          <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Claims Register
          </Link>
        </Button>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">{claimId ? "Edit Claim" : "New Claim"}</h1>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Live claim calculation based on contract progress{projectName ? ` for ${projectName}` : ""}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {claimId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void deleteClaim()}
                  disabled={isDeleting}
                  className={`${interMedium.className} h-10 rounded-[6px] border-[#d6dfeb] bg-[#F8F9FC] px-4 text-sm font-medium text-[#7f1d1d] hover:bg-[#fff1f2]`}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={exportClaimPdf}
                disabled={!claimId}
                variant="outline"
                className={`${interMedium.className} h-10 rounded-[6px] border-[#d6dfeb] bg-[#F8F9FC] px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}
              >
                <FileDown className="mr-1.5 h-4 w-4" />
                Export PDF
              </Button>
              <Button
                type="button"
                onClick={() => void saveClaim()}
                disabled={isSaving}
                className={`${interMedium.className} h-10 rounded-[6px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
              >
                <Save className="mr-1.5 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Claim"}
              </Button>
            </div>
          </div>
          {error ? <p className={`${interMedium.className} mt-4 rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p> : null}
          {saveMessage ? <p className={`${interMedium.className} mt-2 text-xs font-medium text-[#5f6f89]`}>{saveMessage}</p> : null}
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
          <CardHeader className="pb-2 pt-5">
            <CardTitle className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">Claim Workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pb-5">
            <section className="space-y-3">
              <h3 className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7392]`}>Claim Setup</h3>
              <div className="grid gap-3 md:grid-cols-12">
                <div className="space-y-1.5 md:col-span-4">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim No.</label>
                  <Input value={claimNumber} onChange={(event) => setClaimNumber(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} />
                </div>
                <div className="space-y-1.5 md:col-span-8">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim Title</label>
                  <Input value={claimTitle} onChange={(event) => setClaimTitle(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim Type</label>
                  <select value={claimType} onChange={(event) => setClaimType(event.target.value as ClaimType)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`} disabled={isSubmittedLocked}>
                    <option value="Progress">Progress</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Status</label>
                  <select value={status} onChange={(event) => setStatus(event.target.value as ClaimStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                  <span className={`${interMedium.className} inline-flex rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold ${claimStatusClassName(status)}`}>
                    {status}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>% Complete</label>
                  <Input type="number" value={percentComplete} onChange={(event) => setPercentComplete(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} />
                </div>
              </div>
            </section>

            <div className="h-px bg-[#E7ECF3]" />

            <section className="space-y-3">
              <h3 className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7392]`}>Claim Period</h3>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim Date</label><Input type="date" value={claimDate} onChange={(event) => setClaimDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Due Date</label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Period Start</label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Period End</label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              </div>
            </section>

            <div className="h-px bg-[#E7ECF3]" />

            <section className="space-y-3">
              <h3 className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#5f7392]`}>Payment & Notes</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[6px] border border-[#D6E5FB] bg-[#F4F8FF] p-4 md:col-span-2">
                  <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4f678c]`}>Calculated Claim Amount</p>
                  <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#0F2C5C]">{toMoney(currentClaimAmount)}</p>
                  <p className={`${interMedium.className} mt-2 text-xs font-medium text-[#4f678c]`}>
                    Based on {parsedPercentComplete.toFixed(2)}% complete of revised contract value {toMoney(revisedContractValue)}.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Paid Amount</label>
                  <Input type="number" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Notes</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${interMedium.className} min-h-[110px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} disabled={isSubmittedLocked} />
              </div>
            </section>
          </CardContent>
        </Card>

        <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none xl:sticky xl:top-6 xl:self-start">
          <CardHeader className="pb-3 pt-5">
            <CardTitle className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">Claim Summary</CardTitle>
          </CardHeader>
          <CardContent className={`${interMedium.className} space-y-4 pb-5 text-sm font-medium text-[#334155]`}>
            <section className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Contract Position</p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Original Contract</span><span>{toMoney(baseQuoteValue)}</span></p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Approved Variations</span><span>{toMoney(approvedVariationsValue)}</span></p>
              <p className="flex items-center justify-between text-[15px] font-semibold text-[#0F172A]"><span>Revised Contract Value</span><span>{toMoney(revisedContractValue)}</span></p>
            </section>

            <div className="h-px bg-[#E7ECF3]" />

            <section className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Previous Claims</p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Total Previously Claimed</span><span>{toMoney(previousClaimsTotal)}</span></p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Previous % Complete</span><span>{previousPercentComplete.toFixed(2)}%</span></p>
            </section>

            <div className="h-px bg-[#E7ECF3]" />

            <section className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">This Claim</p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">% Complete (Current)</span><span>{parsedPercentComplete.toFixed(2)}%</span></p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">This Claim %</span><span>{thisClaimPercent.toFixed(2)}%</span></p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Value Earned to Date</span><span>{toMoney(valueEarnedToDate)}</span></p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Less Previous Claims</span><span>-{toMoney(previousClaimsTotal)}</span></p>
            </section>

            <div className="h-px bg-[#E7ECF3]" />

            <section className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Payment Position</p>
              <p className="flex items-center justify-between"><span className="text-[#64748B]">Paid to Date</span><span>{toMoney(paidAmountNumber)}</span></p>
              <p className="flex items-center justify-between text-[15px] font-semibold text-[#0F172A]"><span>Outstanding</span><span>{toMoney(balance)}</span></p>
            </section>

            <div className="rounded-[6px] border border-[#0E2A56] bg-[#0B2E63] px-4 py-3 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#cbd8ea]">Current Claim</p>
              <p className="mt-1 text-[30px] font-semibold leading-none tracking-[-0.02em]">{toMoney(currentClaimAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
