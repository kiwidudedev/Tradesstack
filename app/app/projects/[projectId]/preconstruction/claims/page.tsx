"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteStatus } from "@/lib/supabase/types";
import styles from "@/components/app/trade-pack-builder.module.css";

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
    const activeClaims = claims.filter((claim) => claim.status !== "Cancelled");
    const approvedToDate = activeClaims
      .filter((claim) => claim.status !== "Draft")
      .reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const claimedToDate = activeClaims.reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const receivedToDate = activeClaims.reduce((sum, claim) => sum + Number(claim.paid_amount ?? 0), 0);
    const outstanding = Math.max(0, claimedToDate - receivedToDate);
    const remainingToClaim = Math.max(0, revisedContractValue - claimedToDate);
    const paidValue = activeClaims
      .filter((claim) => claim.status === "Paid")
      .reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const dueValue = activeClaims
      .filter((claim) => claim.status === "Submitted" || claim.status === "Unpaid")
      .reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const overdueValue = activeClaims
      .filter((claim) => claim.status === "Overdue")
      .reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const paidClaimsCount = activeClaims.filter((claim) => claim.status === "Paid").length;
    const dueClaimsCount = activeClaims.filter((claim) => claim.status === "Submitted" || claim.status === "Unpaid").length;
    const overdueClaimsCount = activeClaims.filter((claim) => claim.status === "Overdue").length;
    const draftCount = claims.filter((claim) => claim.status === "Draft").length;
    const submittedCount = claims.filter((claim) => claim.status === "Submitted" || claim.status === "Unpaid").length;
    const paidCount = claims.filter((claim) => claim.status === "Paid").length;
    const overdueCount = claims.filter((claim) => claim.status === "Overdue").length;
    const cancelledCount = claims.filter((claim) => claim.status === "Cancelled").length;

    return {
      contractValue: revisedContractValue,
      claimedToDate,
      approvedToDate,
      receivedToDate,
      outstanding,
      paidValue,
      dueValue,
      overdueValue,
      paidClaimsCount,
      dueClaimsCount,
      overdueClaimsCount,
      remainingToClaim,
      baseQuoteValue,
      approvedVariationsValue,
      draftCount,
      submittedCount,
      paidCount,
      overdueCount,
      cancelledCount,
    };
  }, [approvedVariationsValue, claims, quotes]);

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Claims</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Create, track, submit, and reconcile payment claims for this job
          </p>
        </div>
        <div className={styles.heroActions}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}
              >
                Actions
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={8} className={`${styles.menuPanel} !z-[200] min-w-[220px] !bg-[#F3F4F6] p-1.5 opacity-100`}>
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Project Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/new`);
                }}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Claim
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#F3F4F6] px-7 pb-7 pt-6 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)] md:px-8 md:pb-8">
        {isLoading ? (
          <p className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading claims register...</p>
        ) : (
          <div className="space-y-7">
            <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>
              Project Claims & Invoices
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[18px] border border-[#C5CDD8] bg-[#F6F7F9] px-5 py-4">
                <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.09em] text-[#64748B]`}>Current Project Total</p>
                <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">{toMoney(contractSummary.remainingToClaim)}</p>
              </div>
              <div className="rounded-[18px] border border-[#C5CDD8] bg-[#F6F7F9] px-5 py-4">
                <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.09em] text-[#B45309]`}>Submitted</p>
                <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">{toMoney(contractSummary.dueValue)}</p>
              </div>
              <div className="rounded-[18px] border border-[#C5CDD8] bg-[#F6F7F9] px-5 py-4">
                <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.09em] text-[#047857]`}>Paid</p>
                <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">{toMoney(contractSummary.paidValue)}</p>
              </div>
              <div className="rounded-[18px] border border-[#C5CDD8] bg-[#F6F7F9] px-5 py-4">
                <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.09em] text-[#B45309]`}>Outstanding</p>
                <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">{toMoney(contractSummary.outstanding)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Claim Lists</h3>
              <p className={`${interMedium.className} text-sm text-[#64748B]`}>The payment claims created in the last 30 days for this project.</p>

              {claims.length === 0 ? (
                <div className={`${styles.cardMuted} ${styles.producedRowProjectTone} px-5 py-6 text-center`}>
                  <p className={`${interMedium.className} text-sm font-medium text-[#5b6879]`}>No claims yet for this project.</p>
                  <Button
                    onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/new`)}
                    className={`${interMedium.className} mt-3 h-8 rounded-full bg-[#0B2739] px-3 text-[13px] text-white hover:bg-[#0B2739]`}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Create First Claim
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[12px] border border-[#D9DEE5] bg-[#F6F7F9]">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className={`${interMedium.className} text-[13px] font-medium tracking-[0.01em] text-[#6b7280]`}>
                        <th className="px-4 py-3 text-left">Claim Number</th>
                        <th className="px-4 py-3 text-left">Claim Title</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right"></th>
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
                            className="cursor-pointer border-t border-[#D9DEE5] bg-[#F3F4F6] transition-colors hover:bg-[#EEF2F7]"
                          >
                            <td className="px-4 py-3 text-sm font-semibold text-[#1d1d1d]">
                              <span className="hover:underline">{claim.claim_number}</span>
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {claim.claim_title || "Untitled claim"}
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {toDayMonthYearLabel(claim.claim_date)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold ${statusClassName(claim.status)}`}>
                                {claim.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-[#1d1d1d]">
                              {toMoney(balance > 0 ? balance : claimAmount || paidAmount)}
                            </td>
                            <td className="px-4 py-3 text-right text-[#6b6b6b]">•••</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Linked Workflows</h3>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote`}>View Quote</Link>
                </Button>
                <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations`}>View Variations</Link>
                </Button>
                <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                  <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>Project Dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
