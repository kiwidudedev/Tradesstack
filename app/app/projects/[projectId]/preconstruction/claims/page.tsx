"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Clock, DollarSign, MoreHorizontal, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
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
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [approvedVariationsValue, setApprovedVariationsValue] = useState(0);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

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
        setOrganizationId(resolvedOrganizationId);
        setProjectId(projectRow.id);

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
          .filter((row) => row.status === "Approved" || row.status === "Sent" || row.status === "Invoiced")
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

  const createClaimAndOpen = useCallback(async () => {
    if (!supabase || !organizationId || !projectId || isCreatingClaim) {
      return;
    }

    setIsCreatingClaim(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: createError } = await (supabase as any).rpc("create_project_claim_draft", {
        p_organization_id: organizationId,
        p_project_id: projectId,
        p_title: "New Claim",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(data) ? data[0] : null;
      if (!createdRow?.id) {
        throw new Error("Claim draft was created but no identifier was returned.");
      }

      router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/${createdRow.id}`);
    } catch (createClaimError) {
      setError(createClaimError instanceof Error ? createClaimError.message : "Unable to create claim.");
      setIsCreatingClaim(false);
    }
  }, [isCreatingClaim, organizationId, projectId, routeProjectSlug, router, supabase]);

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

  const ALL_CLAIM_STATUSES: ClaimStatus[] = ["Draft", "Submitted", "Unpaid", "Paid", "Overdue", "Cancelled"];

  const updateClaimStatus = useCallback(async (claimId: string, newStatus: ClaimStatus) => {
    if (!supabase || !organizationId) return;
    setClaims((prev) => prev.map((c) => c.id === claimId ? { ...c, status: newStatus } : c));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("project_claims").update({ status: newStatus }).eq("id", claimId).eq("organization_id", organizationId);
  }, [organizationId, supabase]);

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>

      {/* Hero */}
      <section className={`${styles.heroBlock} mb-2`}>
        <div className="min-w-0 flex-1">
          <h1 className={`${ibmPlexSans.className} ${styles.quotePageTitle}`}>Financials</h1>
          <p className={`${interMedium.className} mt-1 text-[15px] text-[#6b6b6b]`}>Create, track, submit, and reconcile payment claims for this job</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void createClaimAndOpen()}
            disabled={isCreatingClaim || isLoading}
            className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}
          >
            <Plus className="mr-1 h-4 w-4" />
            {isCreatingClaim ? "Creating..." : "New Claim"}
          </Button>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      <div className="px-0 py-0">
        {isLoading ? (
          <p className={`${interMedium.className} py-8 text-center text-sm font-medium text-[#6b6b6b]`}>Loading claims register...</p>
        ) : (
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-indigo-50">
                    <DollarSign className="h-5 w-5 text-indigo-500" />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Project Total</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{toMoney(contractSummary.contractValue)}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#4B5D79]`}>incl. approved variations</p>
              </div>
              <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-amber-50">
                    <Clock className="h-5 w-5 text-amber-500" />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Submitted</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{toMoney(contractSummary.dueValue)}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-amber-600`}>{contractSummary.dueClaimsCount} claim{contractSummary.dueClaimsCount !== 1 ? "s" : ""} awaiting payment</p>
              </div>
              <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-emerald-50">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Paid</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{toMoney(contractSummary.paidValue)}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-emerald-600`}>{contractSummary.paidClaimsCount} claim{contractSummary.paidClaimsCount !== 1 ? "s" : ""} received</p>
              </div>
              <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-rose-50">
                    <TrendingUp className="h-5 w-5 text-rose-500" />
                  </span>
                  <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Outstanding</p>
                </div>
                <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{toMoney(contractSummary.outstanding)}</p>
                <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-rose-500`}>{contractSummary.overdueClaimsCount > 0 ? `${contractSummary.overdueClaimsCount} overdue` : "no overdue claims"}</p>
              </div>
            </div>

            {/* Table */}
            {claims.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#D7E1EC] bg-[#F8FAFC] px-6 py-14 text-center">
                <p className={`${interMedium.className} text-sm font-medium text-[#6b6b6b]`}>No claims yet for this project.</p>
                <Button
                  onClick={() => void createClaimAndOpen()}
                  disabled={isLoading || isCreatingClaim}
                  className={`${styles.quoteButtonLabel} mt-4 h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {isCreatingClaim ? "Creating..." : "Create First Claim"}
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC]">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className={`${interMedium.className} border-b border-[#D7E1EC] bg-[#F3F4F6] text-[13px] font-semibold text-[#475569]`}>
                      <th className="w-[130px] px-4 py-2.5 text-left">Claim #</th>
                      <th className="w-[200px] px-4 py-2.5 text-left">Title</th>
                      <th className="w-[110px] px-4 py-2.5 text-left">Date</th>
                      <th className="w-[140px] px-4 py-2.5 text-left">Status</th>
                      <th className="w-[110px] px-4 py-2.5 text-left">Total</th>
                      <th className="w-[52px] px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
                    {claims.map((claim) => {
                      const claimAmount = Number(claim.claim_amount ?? 0);
                      const paidAmount = Number(claim.paid_amount ?? 0);
                      const balance = Math.max(0, claimAmount - paidAmount);

                      return (
                        <tr key={claim.id} className="transition-colors">
                          <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[#1d2433]`}>
                            {claim.claim_number}
                          </td>
                          <td className={`${interMedium.className} px-4 py-3 text-[13px] font-medium text-[#1d2433]`}>
                            {claim.claim_title || "Untitled claim"}
                          </td>
                          <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[#475569]`}>
                            {toDayMonthYearLabel(claim.claim_date)}
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className={`inline-flex cursor-pointer items-center gap-1 rounded-[8px] border px-2.5 py-0.5 text-[12px] font-semibold transition-opacity hover:opacity-80 ${statusClassName(claim.status)}`}>
                                  {claim.status}
                                  <ChevronDown className="h-3 w-3 opacity-60" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="!z-[200] min-w-[160px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                              >
                                {ALL_CLAIM_STATUSES.map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onSelect={() => void updateClaimStatus(claim.id, s)}
                                    className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium focus:bg-[#F8FAFC] ${claim.status === s ? "text-[#F15A29]" : "text-[#1d2433]"}`}
                                  >
                                    <span className={`mr-2 inline-block h-2 w-2 rounded-full border ${statusClassName(s)}`} />
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                          <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[#1d2433]`}>
                            {toMoney(balance > 0 ? balance : claimAmount || paidAmount)}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center justify-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-full border-[#D7E1EC] bg-white text-[#9AA8BC] hover:bg-[#F8FAFC] hover:text-[#1d2433]"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="!z-[200] min-w-[160px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                                >
                                  <DropdownMenuItem
                                    onSelect={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/${claim.id}`)}
                                    className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
                                  >
                                    <Pencil className="mr-2 h-3.5 w-3.5 text-[#64748B]" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="my-1 bg-[#E8EDF5]" />
                                  <DropdownMenuItem
                                    onSelect={() => {}}
                                    className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-rose-600 focus:bg-rose-50`}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-end border-t border-[#E8EDF5] pt-4">
              <p className={`${interMedium.className} flex items-center gap-6 text-[18px] font-semibold text-[#1d2433]`}>
                <span>Total Claimed</span>
                <span>{toMoney(contractSummary.claimedToDate)}</span>
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
