"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, DollarSign, FileText, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  percent_complete: number | null;
  claim_amount: number | null;
  paid_amount: number | null;
  linked_quote_value: number | null;
  linked_approved_variations: number | null;
  revised_contract_value: number | null;
  previous_claims_total: number | null;
  updated_at: string;
}

interface QuoteRow {
  id: string;
  status: QuoteStatus;
  total_quote_price: number | null;
  updated_at: string;
}

interface VariationRow {
  id: string;
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

function statusClassName(status: ClaimStatus) {
  switch (status) {
    case "Paid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Overdue":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "Submitted":
    case "Unpaid":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Cancelled":
      return "bg-slate-200 text-slate-700 border-slate-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function toPeriodLabel(start: string | null, end: string | null) {
  const startLabel = toDayMonthYearLabel(start);
  const endLabel = toDayMonthYearLabel(end);
  if (startLabel === "—" && endLabel === "—") {
    return "—";
  }
  if (startLabel === "—") {
    return `Until ${endLabel}`;
  }
  if (endLabel === "—") {
    return `From ${startLabel}`;
  }
  return `${startLabel} - ${endLabel}`;
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

export default function ProjectClaimsRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const sessionOrganizationId = session?.organizationId ?? null;

  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [approvedVariationsValue, setApprovedVariationsValue] = useState(0);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase || !routeProjectSlug) {
      setIsLoading(false);
      return;
    }

    if (isAuthLoading) {
      return;
    }

    if (!session) {
      setIsLoading(false);
      setError("You are not signed in. Please refresh and try again.");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let resolvedOrganizationId = sessionOrganizationId;
        if (!resolvedOrganizationId) {
          const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
          resolvedOrganizationId = ensuredOrganizationId ?? null;
        }

        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
        }

        const { data: projectRow, error: projectError } = await supabase
          .from("organization_projects")
          .select("id, name")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();

        if (projectError || !projectRow?.id) {
          throw new Error(projectError?.message ?? "Project not found.");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const claimsTable = (supabase as any).from("project_claims");

        const { data: claimsRaw, error: claimsError } = await claimsTable
          .select("id, claim_number, claim_title, claim_type, status, claim_date, period_start, period_end, due_date, percent_complete, claim_amount, paid_amount, linked_quote_value, linked_approved_variations, revised_contract_value, previous_claims_total, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("claim_date", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false });

        if (claimsError) {
          throw new Error(claimsError.message);
        }

        if (cancelled) {
          return;
        }

        const claimRows = (claimsRaw ?? []) as ClaimRow[];
        setProjectName(projectRow.name || "");
        setClaims(claimRows);
        setIsLoading(false);

        const [{ data: quotesRaw }, { data: variationsRaw }] = await Promise.all([
          supabase
            .from("project_quotes")
            .select("id, status, total_quote_price, updated_at")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id)
            .order("updated_at", { ascending: false }),
          supabase
            .from("project_variations")
            .select("id, status, total_variation_price")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id),
        ]);

        if (cancelled) {
          return;
        }

        const quoteRows = (quotesRaw ?? []) as QuoteRow[];
        const variationRows = (variationsRaw ?? []) as VariationRow[];

        const approvedVariationTotal = variationRows
          .filter((row) => row.status === "Approved")
          .reduce((sum, row) => sum + Number(row.total_variation_price ?? 0), 0);

        setQuotes(quoteRows);
        setApprovedVariationsValue(approvedVariationTotal);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load claims.");
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, routeProjectSlug, session, sessionOrganizationId, supabase]);

  const contractSummary = useMemo(() => {
    const baseQuoteValue = pickBaseQuoteValue(quotes);
    const revisedContractValue = baseQuoteValue + approvedVariationsValue;
    const claimedToDate = claims
      .filter((claim) => claim.status !== "Cancelled")
      .reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const receivedToDate = claims
      .filter((claim) => claim.status !== "Cancelled")
      .reduce((sum, claim) => sum + Number(claim.paid_amount ?? 0), 0);
    const outstanding = Math.max(0, claimedToDate - receivedToDate);
    const remainingToClaim = Math.max(0, revisedContractValue - claimedToDate);
    const overdueCount = claims.filter((claim) => claim.status === "Overdue").length;

    return {
      contractValue: revisedContractValue,
      claimedToDate,
      receivedToDate,
      outstanding,
      remainingToClaim,
      baseQuoteValue,
      approvedVariationsValue,
      overdueCount,
    };
  }, [approvedVariationsValue, claims, quotes]);

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
          <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Claims Register</h1>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Create, track, submit, and reconcile project claims in one place{projectName ? ` for ${projectName}` : ""}.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/new`)}
              className={`${interMedium.className} h-10 rounded-[6px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10] disabled:opacity-60`}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Claim
            </Button>
          </div>
          {error ? (
            <p className={`${interMedium.className} mt-4 rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
          ) : null}
          {contractSummary.overdueCount > 0 ? (
            <p className={`${interMedium.className} mt-3 rounded-[6px] border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800`}>
              {contractSummary.overdueCount} overdue {contractSummary.overdueCount === 1 ? "claim" : "claims"} require follow-up.
            </p>
          ) : null}
        </CardHeader>
      </Card>

      <div className="overflow-x-auto rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC]">
        <div className="flex min-w-[1120px] divide-x divide-[#E3E8F0]">
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <FileText className="h-5 w-5 text-[#334155]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Contract Value</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(contractSummary.contractValue)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Send className="h-5 w-5 text-[#1D4ED8]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Claimed To Date</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(contractSummary.claimedToDate)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Received To Date</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(contractSummary.receivedToDate)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Clock3 className="h-5 w-5 text-[#B45309]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Outstanding</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(contractSummary.outstanding)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <DollarSign className="h-5 w-5 text-[#0F766E]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Remaining To Claim</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(contractSummary.remainingToClaim)}</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-2 pt-5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Claims Register</h2>
        </CardHeader>
        <CardContent className="pb-5">
          {isLoading ? (
            <p className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading claims register...</p>
          ) : claims.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[#D7DFEC] bg-[#FAFCFF] px-4 py-8 text-center">
              <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No claims yet for this project.</p>
              <Button
                type="button"
                onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/new`)}
                className={`${interMedium.className} mt-3 h-9 rounded-[6px] bg-[#F74917] px-4 text-sm text-white hover:bg-[#e63f10] disabled:opacity-60`}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create First Claim
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border-t border-[#E8EDF5]">
                <thead>
                  <tr className={`${interMedium.className} bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
                    <th className="px-3 py-2 text-left">Claim No.</th>
                    <th className="px-3 py-2 text-left">Claim Title</th>
                    <th className="px-3 py-2 text-left">Claim Date</th>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-right">% Complete</th>
                    <th className="px-3 py-2 text-right">Claim Amount</th>
                    <th className="px-3 py-2 text-right">Paid Amount</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => {
                    const claimAmount = Number(claim.claim_amount ?? 0);
                    const paidAmount = Number(claim.paid_amount ?? 0);
                    const balance = Math.max(0, claimAmount - paidAmount);

                    return (
                      <tr
                        key={claim.id}
                        onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/${claim.id}`)}
                        className="border-t border-[#EEF2F7] transition-colors hover:bg-[#F8FBFF]"
                      >
                        <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A]">
                          <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims/${claim.id}`} className="hover:underline">
                            {claim.claim_number}
                          </Link>
                        </td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#1F2E45]`}>
                          {claim.claim_title}
                          <span className="ml-2 rounded-[6px] bg-[#EEF3FA] px-2 py-0.5 text-[10px] font-semibold text-[#4A5D78]">{claim.claim_type}</span>
                        </td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{toDayMonthYearLabel(claim.claim_date)}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{toPeriodLabel(claim.period_start, claim.period_end)}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-right text-sm font-medium text-[#334155]`}>{Number(claim.percent_complete ?? 0).toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-[#0F172A]">{toMoney(claimAmount)}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-[#0F172A]">{toMoney(paidAmount)}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-[#0F172A]">{toMoney(balance)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-[6px] border px-2 py-0.5 text-xs font-semibold ${statusClassName(claim.status)}`}>{claim.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
