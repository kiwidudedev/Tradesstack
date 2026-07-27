"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Clock, DollarSign, Landmark, MoreHorizontal, Pencil, Plus, TrendingUp } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatMoneyOperational } from "@/lib/format/currency";
import { derivePaymentClaimRegisterMetrics } from "@/lib/payment-claim-register-summary";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loadPaymentClaimRegisterSnapshotAction } from "./register-snapshot-actions";
import type {
  PaymentClaimRegisterIdentity,
  PaymentClaimRegisterQuote,
  PaymentClaimRegisterRow,
  PaymentClaimRegisterSnapshot,
  PaymentClaimRegisterStatus,
} from "./financials-register-types";

type ClaimStatus = PaymentClaimRegisterStatus;
type ClaimRow = PaymentClaimRegisterRow;
type QuoteRow = PaymentClaimRegisterQuote;

function toMoney(value: number) {
  return formatMoneyOperational(value, { decimals: 2 });
}

function statusBadgeStatus(status: ClaimStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Paid":
      return "approved";
    case "Overdue":
      return "overdue";
    case "Submitted":
    case "Unpaid":
      return "pending";
    case "Cancelled":
      return "draft";
    default:
      return "draft";
  }
}

const STATUS_DOT_CLASS_BY_BADGE: Record<NonNullable<StatusBadgeProps["status"]>, string> = {
  approved: "bg-[var(--success)] border-[var(--success)]",
  pending: "bg-[var(--warning)] border-[var(--warning)]",
  overdue: "bg-[var(--error)] border-[var(--error)]",
  sent: "bg-[var(--info)] border-[var(--info)]",
  completed: "bg-[var(--status-completed)] border-[var(--status-completed)]",
  active: "bg-[var(--status-active)] border-[var(--status-active)]",
  draft: "bg-[var(--text-muted)] border-[var(--text-muted)]",
};

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

function calculateQuotePreGstTotal(quote: QuoteRow) {
  const subtotal = Number(quote.subtotal ?? 0);
  const marginPercent = Number(quote.margin_percent ?? 0);
  const discountAmount = Number(quote.discount_amount ?? 0);
  const contingencyAmount = Number(quote.contingency_amount ?? 0);
  return Math.max(0, subtotal + subtotal * (marginPercent / 100) + contingencyAmount - discountAmount);
}

function pickBaseQuoteContractValue(quotes: QuoteRow[]) {
  const accepted = quotes.find((quote) => quote.status === "Accepted");
  if (accepted) {
    return calculateQuotePreGstTotal(accepted);
  }

  const sent = quotes.find((quote) => quote.status === "Sent");
  if (sent) {
    return calculateQuotePreGstTotal(sent);
  }

  return quotes[0] ? calculateQuotePreGstTotal(quotes[0]) : 0;
}

function calculateProjectRetentionBalance(claims: ClaimRow[]) {
  const activeClaims = claims.filter((claim) => claim.status !== "Cancelled");
  const totalRetentionHeld = activeClaims.reduce(
    (sum, claim) => sum + Number(claim.retention_withheld_amount ?? 0),
    0,
  );
  const totalRetentionReleased = activeClaims.reduce(
    (sum, claim) => sum + Number(claim.retention_released_amount ?? 0),
    0,
  );
  return Math.max(0, totalRetentionHeld - totalRetentionReleased);
}

export default function PaymentClaimsRegisterClient({
  initialSnapshot,
  initialError = null,
}: {
  initialSnapshot?: PaymentClaimRegisterSnapshot | null;
  initialError?: string | null;
}) {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const fallbackLoad = useRef<{
    projectSlug: string;
    request: ReturnType<typeof loadPaymentClaimRegisterSnapshotAction>;
  } | null>(null);
  const appliedServerSnapshot = useRef(initialSnapshot?.loadedAt ?? null);

  const [isLoading, setIsLoading] = useState(initialSnapshot === undefined);
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [claims, setClaims] = useState<ClaimRow[]>(
    initialSnapshot?.claims ?? [],
  );
  const [quotes, setQuotes] = useState<QuoteRow[]>(
    initialSnapshot?.quotes ?? [],
  );
  const [approvedVariationsValue, setApprovedVariationsValue] = useState(
    initialSnapshot?.approvedVariationsValue ?? 0,
  );
  const [accountingIdentities, setAccountingIdentities] = useState<
    Record<string, PaymentClaimRegisterIdentity>
  >(initialSnapshot?.accountingIdentities ?? {});
  const [organizationId, setOrganizationId] = useState<string | null>(
    initialSnapshot?.organizationId ?? null,
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialSnapshot?.projectId ?? null,
  );

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (
      !initialSnapshot
      || appliedServerSnapshot.current === initialSnapshot.loadedAt
    ) {
      return;
    }
    appliedServerSnapshot.current = initialSnapshot.loadedAt;
    setOrganizationId(initialSnapshot.organizationId);
    setProjectId(initialSnapshot.projectId);
    setQuotes(initialSnapshot.quotes);
    setApprovedVariationsValue(initialSnapshot.approvedVariationsValue);
    setClaims(initialSnapshot.claims);
    setAccountingIdentities(initialSnapshot.accountingIdentities);
    setError(initialError);
    setIsLoading(false);
  }, [initialError, initialSnapshot]);

  useEffect(() => {
    if (initialSnapshot === null) {
      setError(initialError ?? "Unable to load Payment Claims.");
      setIsLoading(false);
    }
  }, [initialError, initialSnapshot]);

  useEffect(() => {
    if (initialSnapshot !== undefined) {
      return;
    }
    if (!routeProjectSlug) {
      setIsLoading(false);
      setError("Project not found.");
      return;
    }

    if (fallbackLoad.current?.projectSlug !== routeProjectSlug) {
      fallbackLoad.current = {
        projectSlug: routeProjectSlug,
        request:
          loadPaymentClaimRegisterSnapshotAction(routeProjectSlug),
      };
    }
    const request = fallbackLoad.current.request;
    let active = true;
    void request
      .then((result) => {
        if (!active) return;
        if (!result.snapshot) {
          setError(result.error ?? "Unable to load Payment Claims.");
          return;
        }
        setOrganizationId(result.snapshot.organizationId);
        setProjectId(result.snapshot.projectId);
        setQuotes(result.snapshot.quotes);
        setApprovedVariationsValue(
          result.snapshot.approvedVariationsValue,
        );
        setClaims(result.snapshot.claims);
        setAccountingIdentities(result.snapshot.accountingIdentities);
        setError(null);
      })
      .catch(() => {
        if (active) {
          setError("Unable to load Payment Claims.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [initialSnapshot, routeProjectSlug]);

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
    const baseQuoteValue = pickBaseQuoteContractValue(quotes);
    const revisedContractValue = baseQuoteValue + approvedVariationsValue;
    const activeClaims = claims.filter((claim) => claim.status !== "Cancelled");
    const paymentMetrics = derivePaymentClaimRegisterMetrics(claims);
    const approvedToDate = activeClaims
      .filter((claim) => claim.status !== "Draft")
      .reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const claimedToDate = activeClaims.reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0);
    const receivedToDate = paymentMetrics.receivedToDate;
    const outstanding = Math.max(0, paymentMetrics.outstanding);
    const remainingToClaim = Math.max(0, revisedContractValue - claimedToDate);
    const paidValue = paymentMetrics.paidValue;
    const dueValue = paymentMetrics.dueValue;
    const overdueValue = paymentMetrics.overdueValue;
    const paidClaimsCount = paymentMetrics.paidClaimsCount;
    const dueClaimsCount = paymentMetrics.dueClaimsCount;
    const overdueClaimsCount = paymentMetrics.overdueClaimsCount;
    const unpaidClaimsCount = paymentMetrics.unpaidClaimsCount;
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
      latestRetentionBalance: calculateProjectRetentionBalance(activeClaims),
      paidClaimsCount,
      dueClaimsCount,
      overdueClaimsCount,
      unpaidClaimsCount,
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

  const displayedClaims = claims;

  const claimsTableTotals = useMemo(() => {
    const grossTotal = displayedClaims.reduce((sum, claim) => {
      const claimAmount = Number(claim.claim_amount ?? 0);
      const paidAmount = Number(claim.paid_amount ?? 0);
      const balance = Math.max(0, claimAmount - paidAmount);
      return sum + (balance > 0 ? balance : claimAmount || paidAmount);
    }, 0);

    return {
      grossTotal,
    };
  }, [displayedClaims]);

  const ALL_CLAIM_STATUSES: ClaimStatus[] = ["Draft", "Submitted", "Unpaid", "Paid", "Overdue", "Cancelled"];
  const bodyMoneyCellClassName = "text-right [font-variant-numeric:tabular-nums]";
  const footerCellClassName = "px-4 py-3 align-middle";
  const footerLabelCellClassName = "px-4 py-3 align-middle text-sm font-semibold tracking-[-0.01em] text-[var(--text-secondary)]";
  const footerMoneyStrongCellClassName = "px-4 py-3 align-middle text-right text-sm font-semibold text-[var(--text-primary)] [font-variant-numeric:tabular-nums]";

  const updateClaimStatus = useCallback(async (claimId: string, newStatus: ClaimStatus) => {
    if (!supabase || !organizationId) return;
    setError(null);
    const previousClaims = claims;
    setClaims((prev) => prev.map((c) => c.id === claimId ? { ...c, status: newStatus } : c));

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: statusError } = await (supabase as any).rpc("update_project_claim_status", {
        p_organization_id: organizationId,
        p_project_id: projectId,
        p_claim_id: claimId,
        p_status: newStatus,
      });

      if (statusError) {
        throw new Error(statusError.message);
      }

      const refreshedClaim = Array.isArray(data) ? (data[0] as ClaimRow | undefined) : undefined;
      if (!refreshedClaim?.id) {
        throw new Error("Claim status was updated but no refreshed claim row was returned.");
      }

      setClaims((prev) => prev.map((claim) => claim.id === refreshedClaim.id ? refreshedClaim : claim));
    } catch (statusUpdateError) {
      setClaims(previousClaims);
      setError(statusUpdateError instanceof Error ? statusUpdateError.message : "Unable to update claim status.");
    }
  }, [claims, organizationId, projectId, supabase]);

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title="Financials"
        description="Create, track, submit, and reconcile payment claims for this job"
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void createClaimAndOpen()}
            disabled={isCreatingClaim || isLoading}
          >
            <Plus className="h-4 w-4" />
            {isCreatingClaim ? "Creating..." : "New Claim"}
          </Button>
        }
      />

      {error ? (
        <OperationalAlert variant="error">
          {error}
        </OperationalAlert>
      ) : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading claims register...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <OperationalKpiCard
              label="Project Total"
              value={formatMoneyOperational(contractSummary.contractValue)}
              icon={<DollarSign className="h-5 w-5" strokeWidth={2.1} />}
            />
            <OperationalKpiCard
              label="Submitted"
              value={formatMoneyOperational(contractSummary.dueValue)}
              icon={<Clock className="h-5 w-5" strokeWidth={2.1} />}
            />
            <OperationalKpiCard
              label="Paid"
              value={formatMoneyOperational(contractSummary.paidValue)}
              icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2.1} />}
            />
            <OperationalKpiCard
              label="Outstanding"
              value={formatMoneyOperational(contractSummary.outstanding)}
              icon={<TrendingUp className="h-5 w-5" strokeWidth={2.1} />}
            />
            <OperationalKpiCard
              label="Retention"
              value={formatMoneyOperational(contractSummary.latestRetentionBalance)}
              icon={<Landmark className="h-5 w-5" strokeWidth={2.1} />}
            />
          </div>

          {claims.length === 0 ? (
            <OperationalEmptyState
              title="No claims yet for this project."
              actions={
                <Button
                  onClick={() => void createClaimAndOpen()}
                  disabled={isLoading || isCreatingClaim}
                >
                  <Plus className="h-4 w-4" />
                  {isCreatingClaim ? "Creating..." : "Create First Claim"}
                </Button>
              }
            />
          ) : (
            <OperationalPanel contentClassName="p-0">
              <OperationalTable>
                <OperationalTableHeader>
                  <OperationalTableRow>
                    <OperationalTableHead className="w-[130px]">Claim #</OperationalTableHead>
                    <OperationalTableHead className="w-[240px]">Title</OperationalTableHead>
                    <OperationalTableHead className="w-[110px]">Date</OperationalTableHead>
                    <OperationalTableHead className="w-[140px]">Status</OperationalTableHead>
                    <OperationalTableHead className="w-[170px]">Xero</OperationalTableHead>
                    <OperationalTableHead className="w-[120px] text-right">Gross</OperationalTableHead>
                    <OperationalTableHead className="w-[52px]" />
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {displayedClaims.map((claim) => {
                    const claimAmount = Number(claim.claim_amount ?? 0);
                    const paidAmount = Number(claim.paid_amount ?? 0);
                    const balance = Math.max(0, claimAmount - paidAmount);
                    const rowBadge = statusBadgeStatus(claim.status);
                    const accounting = accountingIdentities[claim.id];

                    return (
                      <OperationalTableRow key={claim.id}>
                        <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                          {accounting?.identity.displayAccountingNumber
                            ?? claim.claim_number}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-primary)]">
                          {claim.claim_title || "Untitled claim"}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          {toDayMonthYearLabel(claim.claim_date)}
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="group inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] transition hover:opacity-80"
                              >
                                <StatusBadge status={rowBadge}>{claim.status}</StatusBadge>
                                <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                            >
                              {ALL_CLAIM_STATUSES.map((s) => {
                                const optionBadge = statusBadgeStatus(s);
                                return (
                                  <DropdownMenuItem
                                    key={s}
                                    onSelect={() => void updateClaimStatus(claim.id, s)}
                                    className={`h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)] ${claim.status === s ? "text-[var(--brand-blue)]" : "text-[var(--text-primary)]"}`}
                                  >
                                    <span className={`mr-2 inline-block h-2 w-2 rounded-full border ${STATUS_DOT_CLASS_BY_BADGE[optionBadge]}`} />
                                    {s}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </OperationalTableCell>
                        <OperationalTableCell className="whitespace-nowrap text-[var(--text-secondary)]">
                          {accounting?.statusLabel ?? "Not synced"}
                        </OperationalTableCell>
                        <OperationalTableCell className={bodyMoneyCellClassName}>
                          {toMoney(balance > 0 ? balance : claimAmount || paidAmount)}
                        </OperationalTableCell>
                        <OperationalTableCell className="px-2">
                          <div className="flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                              >
                                <DropdownMenuItem
                                  onSelect={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/${claim.id}`)}
                                  className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                >
                                  <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                                  Edit
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </OperationalTableCell>
                      </OperationalTableRow>
                    );
                  })}
                </OperationalTableBody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]">
                    <td className={`w-[130px] ${footerCellClassName}`} />
                    <td className={`w-[240px] ${footerCellClassName}`} />
                    <td className={`w-[110px] ${footerCellClassName}`} />
                    <td className={`w-[140px] ${footerLabelCellClassName}`}>
                      Totals
                    </td>
                    <td className={`w-[170px] ${footerCellClassName}`} />
                    <td className={`w-[120px] ${footerMoneyStrongCellClassName}`}>
                      {toMoney(claimsTableTotals.grossTotal)}
                    </td>
                    <td className={`w-[52px] ${footerCellClassName}`} />
                  </tr>
                </tfoot>
              </OperationalTable>
            </OperationalPanel>
          )}
        </div>
      )}
    </div>
  );
}
