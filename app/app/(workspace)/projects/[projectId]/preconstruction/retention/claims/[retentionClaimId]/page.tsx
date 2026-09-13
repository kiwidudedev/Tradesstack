import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  History,
  RefreshCw,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import styles from "@/components/app/trade-pack-builder.module.css";
import { interMedium } from "@/lib/fonts";
import { formatMoneyOperational } from "@/lib/format/currency";
import { getRetentionClaimWorkspace } from "@/lib/retention/phase7-retention-workspace";
import { getRetentionClaimImmutableXeroPanel } from "@/lib/xero/retention-claim-immutable-panel";
import { RetentionClaimXeroPanel } from "@/components/app/RetentionClaimXeroPanel";
import {
  RetentionClaimDateEditingProvider,
  RetentionClaimDateEditingHeaderActions,
  RetentionClaimSubmittedDateFields,
} from "@/components/app/RetentionClaimDateEditing";
import { getRetentionClaimPaymentState } from "@/lib/retention/phase10-payment-reconciliation";
import { resolveAccountingIdentityPresentation } from "@/lib/accounting/accounting-identity-presentation";
import { getRetentionClaimDraftOriginSetHash } from "@/lib/retention/retention-claim-document-save";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import {
  getMasterRetentionAccountingPosition,
  getMasterRetentionSource,
} from "@/lib/retention/master-retention-source";
import {
  resolveRetentionClaimGstPresentation,
} from "@/lib/retention/retention-claim-gst-presentation";
import {
  RetentionClaimDraftEditor,
  type RetentionClaimDraftEditorLine,
} from "./RetentionClaimDraftEditor";
import { ClaimLineTableShell } from "./ClaimLineTableShell";
import {
  addRetentionAllocationAction,
  cancelRetentionClaimAction,
  recordManualRetentionClaimPaymentAction,
  refreshRetentionClaimPaymentAction,
  removeRetentionAllocationAction,
  submitRetentionClaimAction,
  updateRetentionAllocationAction,
  updateRetentionClaimAction,
} from "../../actions";

type EligibilityOrigin = {
  originatingPaymentClaimId: string;
  claimNumber: string;
  claimDate: string | null;
  currentRetentionOwned: number;
  currentEligibleRetention: number;
  committedRetention: number;
  availableRetention: number;
};

function money(value: number | null | undefined) {
  return formatMoneyOperational(Number(value ?? 0), { decimals: 2 });
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-NZ");
}

function statusLabel(value: string) {
  if (value === "cancelled_draft") return "Cancelled";
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function statusBadge(value: string) {
  if (value === "submitted") return "approved" as const;
  return "draft" as const;
}

function toCents(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function centsToAmount(value: number) {
  return value / 100;
}

function minorMoney(value: number | null | undefined) {
  return value == null ? "—" : money(centsToAmount(value));
}

function gstLabel(effectiveRate: number | null | undefined) {
  if (effectiveRate == null || !Number.isFinite(effectiveRate)) return "GST";
  return `GST (${effectiveRate.toLocaleString("en-NZ", {
    maximumFractionDigits: 4,
  })}%)`;
}

function HiddenContext({
  projectSlug,
  claimId,
  revision,
}: {
  projectSlug: string;
  claimId: string;
  revision: number;
}) {
  return (
    <>
      <input type="hidden" name="projectSlug" value={projectSlug} />
      <input type="hidden" name="retentionClaimId" value={claimId} />
      <input type="hidden" name="expectedDraftRevision" value={revision} />
    </>
  );
}

function WorkflowDisclosure({
  title,
  description,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className={`${styles.quotePanelCard} group min-w-0 overflow-hidden`}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-5 marker:hidden sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
              {title}
            </h2>
          </div>
          {description ? (
            <p className={`${interMedium.className} mt-2 text-sm leading-6 text-[var(--text-secondary)]`}>
              {description}
            </p>
          ) : null}
        </div>
        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--border-subtle)] px-5 py-5 sm:px-6">
        {children}
      </div>
    </details>
  );
}

export default async function RetentionClaimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; retentionClaimId: string }>;
  searchParams: Promise<{
    retentionError?: string;
    documentReady?: string;
    xeroQueued?: string;
    paymentReconciled?: string;
    paymentRefreshQueued?: string;
  }>;
}) {
  const [{ projectId: projectSlug, retentionClaimId }, query] =
    await Promise.all([params, searchParams]);
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
  if (!project) notFound();

  const workspace = await getRetentionClaimWorkspace(retentionClaimId);
  if (!workspace.claim.succeeded) notFound();
  const { claim, allocations, currentPosition, positionStateStale } =
    workspace.claim;
  const { rollingOrigins, automaticRolling } = workspace;
  if (claim.projectId !== project.id) notFound();

  const eligibilityOrigins = Array.isArray(workspace.eligibility.origins)
    ? (workspace.eligibility.origins as unknown as EligibilityOrigin[])
    : [];
  const eligibilityByOrigin = new Map(
    eligibilityOrigins.map((origin) => [
      origin.originatingPaymentClaimId,
      origin,
    ]),
  );
  const allocatedOriginIds = new Set(
    allocations.map((allocation) => allocation.originatingPaymentClaimId),
  );
  const availableOrigins = eligibilityOrigins.filter(
    (origin) =>
      !allocatedOriginIds.has(origin.originatingPaymentClaimId) &&
      Number(origin.availableRetention) > 0,
  );
  const eligibilityHash =
    typeof workspace.eligibility.eligibilityStateHash === "string"
      ? workspace.eligibility.eligibilityStateHash
      : "";
  const positionHash = currentPosition.stateHash ?? "";
  const isDraft = claim.status === "draft";
  const isSubmitted = claim.status === "submitted";
  const [
    immutableXeroPanel,
    paymentState,
    masterSource,
    masterAccounting,
  ] = await Promise.all([
    getRetentionClaimImmutableXeroPanel(claim.id),
    isSubmitted ? getRetentionClaimPaymentState(claim.id) : null,
    isSubmitted ? getMasterRetentionSource(claim.id) : null,
    isSubmitted ? getMasterRetentionAccountingPosition(claim.id) : null,
  ]);
  const accountingIdentity = resolveAccountingIdentityPresentation({
    commercialClaimNumber: claim.claimNumber,
    activeRevisionInvoiceNumber: immutableXeroPanel.invoiceNumber,
    activeRevisionInvoiceId: immutableXeroPanel.invoiceId,
  });
  const displayAllocations = isSubmitted && masterSource
    ? masterSource.allocations.map((origin) => ({
        ...allocations[0],
        id: origin.id,
        allocationAmount: origin.allocationAmount,
        originatingPaymentClaimId: origin.originatingPaymentClaimId,
        originClaimNumberSnapshot: origin.originClaimNumberSnapshot,
        currentOriginClaimNumber: origin.originClaimNumberSnapshot,
        originClaimDateSnapshot: origin.originClaimDateSnapshot,
        currentOriginClaimDate: origin.originClaimDateSnapshot,
        retentionWithheldSnapshot: origin.allocationAmount,
        currentRetentionOwned: origin.allocationAmount,
        existingSubmittedAllocationBefore: 0,
        currentSubmittedAllocationTotalFromOtherClaims: 0,
        remainingAfterAllocation: 0,
        currentCommittedRetentionTotal: origin.allocationAmount,
        originStateStale: false,
      }))
    : allocations;
  const allocationByOrigin = new Map(
    allocations.map((allocation) => [
      allocation.originatingPaymentClaimId,
      allocation,
    ]),
  );

  const representedRetentionCents = isDraft
    ? eligibilityOrigins.reduce(
        (sum, origin) => sum + toCents(origin.currentRetentionOwned),
        0,
      )
    : displayAllocations.reduce(
        (sum, allocation) =>
          sum +
          toCents(
            allocation.retentionWithheldSnapshot,
          ),
        0,
      );
  // Retention Claim ownership is the gross retention accumulated on originating
  // Payment Claims. Submitted Retention Claim allocations are presented
  // separately as Previously Claimed and must not be hidden in this value.
  const currentRetentionCents = representedRetentionCents;
  const eligibleCents = isDraft
    ? eligibilityOrigins.reduce(
        (sum, origin) => sum + toCents(origin.currentEligibleRetention),
        0,
      )
    : displayAllocations.reduce(
        (sum, allocation) =>
          sum +
          toCents(
            isSubmitted
              ? Number(allocation.allocationAmount) +
                  Number(allocation.remainingAfterAllocation)
              : eligibilityByOrigin.get(
                  allocation.originatingPaymentClaimId,
                )?.currentEligibleRetention,
          ),
        0,
      );
  const previouslyClaimedCents = isDraft
    ? eligibilityOrigins.reduce(
        (sum, origin) => sum + toCents(origin.committedRetention),
        0,
      )
    : displayAllocations.reduce(
        (sum, allocation) =>
          sum +
          toCents(
            allocation.existingSubmittedAllocationBefore ??
              allocation.currentSubmittedAllocationTotalFromOtherClaims,
          ),
        0,
      );
  const currentGstEvidence =
    immutableXeroPanel.currentRetentionSubtotalMinor != null
    && immutableXeroPanel.currentRetentionTaxMinor != null
    && immutableXeroPanel.currentRetentionTotalMinor != null
    && immutableXeroPanel.currentRetentionTaxType
    && immutableXeroPanel.currentRetentionEffectiveRate != null
      ? {
          subtotalMinor: immutableXeroPanel.currentRetentionSubtotalMinor,
          taxMinor: immutableXeroPanel.currentRetentionTaxMinor,
          totalMinor: immutableXeroPanel.currentRetentionTotalMinor,
          taxType: immutableXeroPanel.currentRetentionTaxType,
          effectiveRate: immutableXeroPanel.currentRetentionEffectiveRate,
        }
      : null;
  const pushedGstEvidence = masterAccounting?.revisionId
    && masterAccounting.authoritativeInheritedTax
    && masterAccounting.taxType
    && masterAccounting.effectiveRate != null
      ? {
          subtotalMinor: masterAccounting.subtotalMinor,
          taxMinor: masterAccounting.taxMinor,
          totalMinor: masterAccounting.totalMinor,
          taxType: masterAccounting.taxType,
          effectiveRate: masterAccounting.effectiveRate,
        }
      : null;
  const gstPresentation = resolveRetentionClaimGstPresentation({
    currentEvidence: currentGstEvidence,
    pushedEvidence: pushedGstEvidence,
    hasPushedRevision: Boolean(masterAccounting?.revisionId),
    providerPayment: immutableXeroPanel.authoritativeInheritedTax
      && immutableXeroPanel.amountPaid != null
      && immutableXeroPanel.amountOutstanding != null
      ? {
          paidMinor: toCents(immutableXeroPanel.amountPaid),
          outstandingMinor: toCents(immutableXeroPanel.amountOutstanding),
        }
      : null,
  });
  const submittedLinePresentations = displayAllocations.map((allocation) => {
    const currentSubtotalMinor = toCents(allocation.allocationAmount);
    const currentEvidence = gstPresentation.current
      && currentSubtotalMinor === gstPresentation.current.subtotalMinor
      && (
        immutableXeroPanel.currentRetentionOriginatingPaymentClaimId
          === allocation.originatingPaymentClaimId
        || displayAllocations.length === 1
      )
        ? gstPresentation.current
        : null;
    const pushedTotalMinor = masterAccounting?.authoritativeInheritedTax
      ? masterAccounting.pushedTotalByOrigin.get(
          allocation.originatingPaymentClaimId,
        ) ?? null
      : null;
    return {
      allocation,
      currentSubtotalMinor,
      currentTaxMinor: currentEvidence?.taxMinor ?? null,
      currentTotalMinor: currentEvidence?.totalMinor ?? null,
      pushedTotalMinor,
      newTotalMinor: currentEvidence && pushedTotalMinor != null
        ? Math.max(currentEvidence.totalMinor - pushedTotalMinor, 0)
        : null,
      paidMinor: displayAllocations.length === 1
        ? gstPresentation.payment?.paidMinor ?? null
        : null,
      outstandingMinor: displayAllocations.length === 1
        ? gstPresentation.payment?.outstandingMinor ?? null
        : null,
    };
  });
  const lineCount =
    automaticRolling && isDraft
      ? rollingOrigins.length
      : displayAllocations.length;
  const headerFormId = `retention-claim-header-${claim.id}`;
  const registerHref =
    `/app/projects/${projectSlug}/preconstruction/claims#retention`;
  const bodyMoneyClass =
    `${interMedium.className} whitespace-nowrap text-right text-sm font-normal text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]`;
  const compactCellClass =
    `${interMedium.className} h-12 border-l border-[var(--border-subtle)] px-3 py-1.5 align-middle text-sm font-normal text-[var(--text-secondary)]`;
  const compactMoneyCellClass = `${compactCellClass} ${bodyMoneyClass}`;

  if (isDraft) {
    const originSet = await getRetentionClaimDraftOriginSetHash(claim.id);
    const allocatedLines: RetentionClaimDraftEditorLine[] = allocations.map(
      (allocation) => {
        const eligibility = eligibilityByOrigin.get(
          allocation.originatingPaymentClaimId,
        );
        const proposedAmountCents = toCents(allocation.allocationAmount);
        return {
          key: allocation.id,
          originatingPaymentClaimId:
            allocation.originatingPaymentClaimId,
          candidateId: null,
          existingAllocationId: allocation.id,
          expectedOriginStateHash:
            originSet.originStateHashes[
              allocation.originatingPaymentClaimId
            ] ?? allocation.currentOriginStateHash,
          sequence: allocation.allocationSequence,
          claimNumber: allocation.currentOriginClaimNumber,
          claimDate: allocation.currentOriginClaimDate,
          retentionHeldCents: toCents(allocation.currentRetentionOwned),
          eligibleCents: toCents(
            eligibility?.currentEligibleRetention,
          ),
          previouslyClaimedCents: toCents(
            allocation.currentSubmittedAllocationTotalFromOtherClaims,
          ),
          availableCents: toCents(eligibility?.availableRetention),
          proposedAmountCents,
          stale: allocation.originStateStale,
        };
      },
    );
    const nextManualSequence = allocations.reduce(
      (maximum, allocation) =>
        Math.max(maximum, allocation.allocationSequence),
      0,
    );
    const unallocatedLines: RetentionClaimDraftEditorLine[] =
      availableOrigins
        .sort((left, right) =>
          (left.claimDate ?? "9999-12-31").localeCompare(
            right.claimDate ?? "9999-12-31",
          )
          || left.originatingPaymentClaimId.localeCompare(
            right.originatingPaymentClaimId,
          ))
        .map((origin, index) => ({
          key: origin.originatingPaymentClaimId,
          originatingPaymentClaimId: origin.originatingPaymentClaimId,
          candidateId: null,
          existingAllocationId: null,
          expectedOriginStateHash:
            originSet.originStateHashes[origin.originatingPaymentClaimId]
            ?? "",
          sequence: nextManualSequence + index + 1,
          claimNumber: origin.claimNumber,
          claimDate: origin.claimDate,
          retentionHeldCents: toCents(origin.currentRetentionOwned),
          eligibleCents: toCents(origin.currentEligibleRetention),
          previouslyClaimedCents: toCents(origin.committedRetention),
          availableCents: toCents(origin.availableRetention),
          proposedAmountCents: 0,
          stale: false,
        }));
    const draftLines: RetentionClaimDraftEditorLine[] = automaticRolling
      ? rollingOrigins.map((origin) => {
          const allocation = allocationByOrigin.get(
            origin.originatingPaymentClaimId,
          );
          const proposedAmountCents = toCents(allocation?.allocationAmount);
          return {
            key: origin.id,
            originatingPaymentClaimId: origin.originatingPaymentClaimId,
            candidateId: origin.id,
            existingAllocationId: allocation?.id ?? null,
            expectedOriginStateHash:
              originSet.originStateHashes[origin.originatingPaymentClaimId] ??
              origin.latestOriginStateHash,
            sequence: origin.originSequence,
            claimNumber: origin.claimNumber,
            claimDate: origin.claimDate,
            retentionHeldCents: toCents(origin.currentRetentionOwned),
            eligibleCents: toCents(origin.currentEligibleRetention),
            previouslyClaimedCents: toCents(origin.committedRetention),
            availableCents: toCents(origin.availableRetention),
            proposedAmountCents,
            stale: origin.originStateStale,
          };
        })
      : [...allocatedLines, ...unallocatedLines];

    return (
      <RetentionClaimDraftEditor
        key={`${claim.draftRevision}:${positionHash}:${eligibilityHash}:${originSet.originSetHash}`}
        projectSlug={projectSlug}
        registerHref={registerHref}
        retentionClaimId={claim.id}
        claimNumber={claim.claimNumber}
        initialTitle={claim.title}
        initialReference={claim.reference ?? ""}
        initialIssueDate={claim.issueDate ?? ""}
        initialDueDate={claim.dueDate ?? ""}
        initialDraftRevision={claim.draftRevision}
        initialPositionStateHash={positionHash}
        initialEligibilityStateHash={eligibilityHash}
        initialOriginSetHash={originSet.originSetHash}
        initialLines={draftLines}
        currentRetentionCents={currentRetentionCents}
        eligibleCents={eligibleCents}
        previouslyClaimedCents={previouslyClaimedCents}
        positionStateStale={positionStateStale}
        retentionError={query.retentionError}
        immutableXeroPanel={immutableXeroPanel}
        events={workspace.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          reason: event.reason,
          actorUserId: event.actorUserId,
          occurredAt: event.occurredAt,
        }))}
      />
    );
  }

  return (
    <RetentionClaimDateEditingProvider>
      <div
        className="-mb-8 w-full space-y-6 bg-[var(--background)]"
        data-testid="retention-claim-detail"
      >
      <OperationalModuleHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{accountingIdentity.displayAccountingNumber}</span>
            <StatusBadge status={statusBadge(claim.status)}>
              {statusLabel(claim.status)}
            </StatusBadge>
          </span>
        }
        description={[
          accountingIdentity.hasReplacementIdentity
            ? `Master Retention Claim ${accountingIdentity.commercialClaimNumber}`
            : null,
          `Cumulative retention position for ${project.name}.`,
        ].filter(Boolean).join(" · ")}
        actions={
          <>
            {isDraft ? (
              <Button type="submit" form={headerFormId}>
                Save and refresh
              </Button>
            ) : null}
            {!isDraft ? <RetentionClaimDateEditingHeaderActions /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 px-3"
                  aria-label="Retention Claim actions"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                sideOffset={8}
                className="!z-[200] min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
              >
                <DropdownMenuItem
                  asChild
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  <Link href={registerHref}>
                    <ExternalLink className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                    Retention Register
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {query.retentionError ? (
        <OperationalAlert variant="error">{query.retentionError}</OperationalAlert>
      ) : null}
      {query.xeroQueued === "true" ? (
        <OperationalAlert variant="success">
          The Retention Claim Xero operation is queued.
        </OperationalAlert>
      ) : null}
      {query.paymentReconciled === "true" ? (
        <OperationalAlert variant="success">
          The manual Retention Claim payment was reconciled and attributed.
        </OperationalAlert>
      ) : null}
      {query.paymentRefreshQueued === "true" ? (
        <OperationalAlert variant="success">
          The Xero payment refresh is queued.
        </OperationalAlert>
      ) : null}
      <div className="space-y-6 [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface)] [&_input]:text-[var(--text-primary)] [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface)] [&_select]:text-[var(--text-primary)]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          {isDraft ? (
            <form
              id={headerFormId}
              action={updateRetentionClaimAction}
            >
              <HiddenContext
                projectSlug={projectSlug}
                claimId={claim.id}
                revision={claim.draftRevision}
              />
              <section className="border-b border-[var(--border-subtle)] pb-5">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
                  Claim Workspace
                </h2>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Claim No.</label>
                      <Input
                        value={claim.claimNumber}
                        disabled
                        className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label htmlFor="retention-claim-title" className={styles.quoteBodyLabel}>
                        Title
                      </label>
                      <Input
                        id="retention-claim-title"
                        name="title"
                        defaultValue={claim.title}
                        required
                        className="h-10 rounded-[6px]"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5 md:col-span-2">
                      <label htmlFor="retention-claim-reference" className={styles.quoteBodyLabel}>
                        Reference
                      </label>
                      <Input
                        id="retention-claim-reference"
                        name="reference"
                        defaultValue={claim.reference ?? ""}
                        className="h-10 rounded-[6px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className={styles.quoteBodyLabel}>Status</span>
                      <div className="flex h-10 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3">
                        <StatusBadge status={statusBadge(claim.status)}>
                          {statusLabel(claim.status)}
                        </StatusBadge>
                        <span className="ml-auto text-xs text-[var(--text-muted)]">
                          Revision {claim.draftRevision}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="border-b border-[var(--border-subtle)] py-5">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
                  Claim Period
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="retention-claim-date" className={styles.quoteBodyLabel}>
                      Claim Date
                    </label>
                    <Input
                      id="retention-claim-date"
                      name="issueDate"
                      type="date"
                      defaultValue={claim.issueDate ?? ""}
                      className="h-10 rounded-[6px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="retention-due-date" className={styles.quoteBodyLabel}>
                      Due Date
                    </label>
                    <Input
                      id="retention-due-date"
                      name="dueDate"
                      type="date"
                      defaultValue={claim.dueDate ?? ""}
                      className="h-10 rounded-[6px]"
                    />
                  </div>
                </div>
              </section>
            </form>
          ) : (
            <>
              <section className="border-b border-[var(--border-subtle)] pb-5">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
                  Claim Workspace
                </h2>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>
                        Master Claim No.
                      </label>
                      <Input
                        value={claim.claimNumber}
                        disabled
                        className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>
                        Xero Invoice No.
                      </label>
                      <Input
                        value={accountingIdentity.displayAccountingNumber}
                        disabled
                        className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className={styles.quoteBodyLabel}>Title</label>
                      <Input
                        value={claim.title}
                        disabled
                        className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Reference</label>
                      <Input
                        value={claim.reference ?? "—"}
                        disabled
                        className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className={styles.quoteBodyLabel}>Status</span>
                      <div className="flex h-10 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3">
                        <StatusBadge status={statusBadge(claim.status)}>
                          {statusLabel(claim.status)}
                        </StatusBadge>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Submitted</label>
                      <Input
                        value={displayDate(claim.submittedAt)}
                        disabled
                        className="h-10 rounded-[6px] bg-[var(--surface-muted)]"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <RetentionClaimSubmittedDateFields
                retentionClaimId={claim.id}
                claimDate={claim.issueDate ?? ""}
                dueDate={claim.dueDate ?? ""}
              />
            </>
          )}

          <ClaimLineTableShell title="Retention Claim Lines">
            <div
              className="space-y-3 md:hidden"
              data-testid="retention-gst-lines-mobile"
            >
              {submittedLinePresentations.map((line) => (
                <article
                  key={line.allocation.id}
                  className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
                    <div className="font-medium text-[var(--text-primary)]">
                      {line.allocation.originClaimNumberSnapshot
                        ?? line.allocation.currentOriginClaimNumber}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {displayDate(line.allocation.originClaimDateSnapshot)}
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm [font-variant-numeric:tabular-nums]">
                    {[
                      ["Retention excl. GST", line.currentSubtotalMinor],
                      ["GST", line.currentTaxMinor],
                      ["Total incl. GST", line.currentTotalMinor],
                      ["Pushed to Xero incl. GST", line.pushedTotalMinor],
                      ["New Since Last Push incl. GST", line.newTotalMinor],
                      ["Paid incl. GST", line.paidMinor],
                      ["Outstanding incl. GST", line.outstandingMinor],
                    ].map(([label, amount]) => (
                      <div key={String(label)} className="contents">
                        <dt className="text-[var(--text-secondary)]">
                          {label}
                        </dt>
                        <dd className={`whitespace-nowrap text-right text-[var(--text-primary)] ${label === "Outstanding incl. GST" || label === "Total incl. GST" ? "font-semibold" : "font-medium"}`}>
                          {minorMoney(amount as number | null)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
              {lineCount === 0 ? (
                <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  No allocations have been added.
                </div>
              ) : null}
            </div>
            <div className="hidden overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)] md:block">
              <table className="w-full min-w-[1420px] border-collapse text-sm">
                <thead>
                  <tr className={`${styles.quoteButtonLabel} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}>
                    <th className="w-[210px] px-3 py-2.5 text-left font-semibold">Payment Claim</th>
                    <th className="w-[110px] border-l border-[var(--border)] px-3 py-2.5 text-left font-semibold">Date</th>
                    <th className="w-[155px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Retention excl. GST</th>
                    <th className="w-[120px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">GST</th>
                    <th className="w-[155px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Total incl. GST</th>
                    <th className="w-[180px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Pushed to Xero incl. GST</th>
                    <th className="w-[190px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">New Since Last Push incl. GST</th>
                    <th className="w-[145px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Paid incl. GST</th>
                    <th className="w-[170px] border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Outstanding incl. GST</th>
                  </tr>
                </thead>
                <tbody>
                  {automaticRolling && isDraft
                    ? rollingOrigins.map((origin) => {
                        const allocation = allocationByOrigin.get(
                          origin.originatingPaymentClaimId,
                        );
                        const thisClaim = Number(
                          allocation?.allocationAmount ?? 0,
                        );
                        const claimedToDate =
                          Number(origin.committedRetention) + thisClaim;
                        const claimPercent =
                          Number(origin.currentRetentionOwned) > 0
                            ? (thisClaim /
                                Number(origin.currentRetentionOwned)) *
                              100
                            : 0;
                        return (
                          <tr
                            key={origin.id}
                            className="h-12 border-b border-[var(--border-subtle)] bg-[var(--surface)] align-middle transition-colors last:border-b-0 hover:bg-[var(--surface-muted)]"
                          >
                            <td className="h-12 px-3 py-1.5">
                              <div className="text-sm font-medium text-[var(--text-primary)]">
                                {origin.claimNumber}
                              </div>
                              {origin.originStateStale ? (
                                <div className="text-xs text-[var(--warning)]">
                                  Source changed; refresh pending
                                </div>
                              ) : null}
                            </td>
                            <td className={compactCellClass}>
                              {displayDate(origin.claimDate)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {money(origin.currentRetentionOwned)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {money(origin.currentEligibleRetention)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {money(origin.committedRetention)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {allocation ? (
                                <div className="flex items-center justify-end gap-2">
                                  <form
                                    action={updateRetentionAllocationAction}
                                    className="flex items-center justify-end gap-2"
                                  >
                                    <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                                    <input type="hidden" name="allocationId" value={allocation.id} />
                                    <Input
                                      name="allocationAmount"
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      defaultValue={allocation.allocationAmount}
                                      className="h-9 w-28 rounded-[6px] text-right"
                                      aria-label={`This claim for ${origin.claimNumber}`}
                                    />
                                    <Button type="submit" size="sm" variant="secondary">Save</Button>
                                  </form>
                                  <form action={removeRetentionAllocationAction}>
                                    <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                                    <input type="hidden" name="allocationId" value={allocation.id} />
                                    <Button type="submit" size="sm" variant="ghost">Reset</Button>
                                  </form>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <form
                                    action={addRetentionAllocationAction}
                                    className="flex items-center justify-end gap-2"
                                  >
                                    <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                                    <input type="hidden" name="originatingPaymentClaimId" value={origin.originatingPaymentClaimId} />
                                    <Input
                                      name="allocationAmount"
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      placeholder="0.00"
                                      className="h-9 w-28 rounded-[6px] text-right"
                                      aria-label={`This claim for ${origin.claimNumber}`}
                                    />
                                    <Button type="submit" size="sm" variant="secondary">Save</Button>
                                  </form>
                                  {Number(origin.availableRetention) > 0 ? (
                                    <form action={addRetentionAllocationAction}>
                                      <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                                      <input type="hidden" name="originatingPaymentClaimId" value={origin.originatingPaymentClaimId} />
                                      <input type="hidden" name="allocationAmount" value={Number(origin.availableRetention).toFixed(2)} />
                                      <Button type="submit" size="sm">Use available</Button>
                                    </form>
                                  ) : (
                                    <span className="text-xs text-[var(--text-muted)]">
                                      No retention remaining
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="mt-1 text-right text-[11px] font-normal text-[var(--text-muted)]">
                                {claimPercent.toFixed(1)}% of retention held
                              </div>
                            </td>
                            <td className={compactMoneyCellClass}>
                              {money(claimedToDate)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {money(
                                Math.max(
                                  Number(origin.currentRetentionOwned) -
                                    claimedToDate,
                                  0,
                                ),
                              )}
                            </td>
                          </tr>
                        );
                      })
                    : submittedLinePresentations.map((line) => {
                        const { allocation } = line;
                        return (
                          <tr
                            key={allocation.id}
                            className="h-12 border-b border-[var(--border-subtle)] bg-[var(--surface)] align-middle transition-colors last:border-b-0 hover:bg-[var(--surface-muted)]"
                          >
                            <td className="h-12 px-3 py-1.5">
                              <div className="text-sm font-medium text-[var(--text-primary)]">
                                {isSubmitted
                                  ? allocation.originClaimNumberSnapshot ??
                                    allocation.currentOriginClaimNumber
                                  : allocation.currentOriginClaimNumber}
                              </div>
                              {allocation.originStateStale && isDraft ? (
                                <div className="text-xs text-[var(--warning)]">
                                  Source changed since Draft
                                </div>
                              ) : null}
                            </td>
                            <td className={compactCellClass}>
                              {displayDate(
                                isSubmitted
                                  ? allocation.originClaimDateSnapshot
                                  : allocation.currentOriginClaimDate,
                              )}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {minorMoney(line.currentSubtotalMinor)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {minorMoney(line.currentTaxMinor)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {minorMoney(line.currentTotalMinor)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {minorMoney(line.pushedTotalMinor)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {minorMoney(line.newTotalMinor)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              {minorMoney(line.paidMinor)}
                            </td>
                            <td className={compactMoneyCellClass}>
                              <span className="font-semibold text-[var(--text-primary)]">
                                {minorMoney(line.outstandingMinor)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  {lineCount === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-8 text-center text-[var(--text-secondary)]"
                      >
                        {automaticRolling && isDraft
                          ? "Waiting for a confirmed Payment Claim with positive retention."
                          : "No allocations have been added."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </ClaimLineTableShell>

          <div className="border-t border-[var(--border-subtle)] py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
              <section>
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>
                  Workflow & Supporting Information
                </h2>
                <div className="mt-4 space-y-4">
                  <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className={styles.quoteCardTitle}>Retention position</p>
                        <p className={styles.quoteBodyLabel}>
                          {isSubmitted
                            ? "Cumulative submitted Payment Claim origins"
                            : positionStateStale
                            ? "Refresh required before submission"
                            : "Current position evidence"}
                        </p>
                        <StatusBadge status={!isSubmitted && positionStateStale ? "pending" : "approved"}>
                          {isSubmitted ? "Accumulating" : positionStateStale ? "Stale" : "Current"}
                        </StatusBadge>
                      </div>
                      <div className="space-y-1">
                        <p className={styles.quoteCardTitle}>Allocation evidence</p>
                        <p className={styles.quoteBodyLabel}>
                          {isSubmitted
                            ? "Immutable submission snapshots"
                            : `${lineCount} originating Payment Claim${lineCount === 1 ? "" : "s"}`}
                        </p>
                        <p className={styles.quoteBodyValue}>
                          {isSubmitted ? "Locked" : `Revision ${claim.draftRevision}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isDraft && !automaticRolling && availableOrigins.length > 0 ? (
                    <div className="rounded-[6px] border border-[var(--border)] px-4 py-4">
                      <p className={styles.quoteCardTitle}>Add allocation</p>
                      <p className={`${styles.quoteBodyLabel} mt-1`}>
                        Any amount up to the remaining retention is available.
                      </p>
                      <form
                        action={addRetentionAllocationAction}
                        className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_auto]"
                      >
                        <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                        <select
                          name="originatingPaymentClaimId"
                          required
                          className={`${interMedium.className} h-10 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm`}
                          defaultValue=""
                        >
                          <option value="" disabled>Select originating Payment Claim</option>
                          {availableOrigins.map((origin) => (
                            <option
                              key={origin.originatingPaymentClaimId}
                              value={origin.originatingPaymentClaimId}
                            >
                              {origin.claimNumber} · available {money(origin.availableRetention)}
                            </option>
                          ))}
                        </select>
                        <Input
                          name="allocationAmount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Amount"
                          required
                          className="h-10 rounded-[6px]"
                        />
                        <Button type="submit" size="sm" className="h-10">Add allocation</Button>
                      </form>
                    </div>
                  ) : null}

                </div>
              </section>

              <aside className="border-t border-[var(--border-subtle)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>
                  Retention Claim Summary
                </h2>
                <div className="space-y-4">
                  <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                    <div className={`${interMedium.className} space-y-3 text-sm`} data-testid="retention-gst-summary">
                      <p className={styles.quoteCardTitle}>{"Retention Position"}</p>
                      <p className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-secondary)]">{"Current Retention excl. GST"}</span>
                        <span className="whitespace-nowrap font-medium text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(
                            gstPresentation.current?.subtotalMinor
                              ?? currentRetentionCents,
                          )}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-secondary)]">
                          {gstLabel(gstPresentation.current?.effectiveRate)}
                        </span>
                        <span className="whitespace-nowrap font-medium text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(gstPresentation.current?.taxMinor)}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-4 pt-1">
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{"Current Retention incl. GST"}</span>
                        <span className="whitespace-nowrap text-[15px] font-semibold text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(gstPresentation.current?.totalMinor)}
                        </span>
                      </p>

                      <div className="h-px bg-[var(--border)]" />
                      <p className={styles.quoteCardTitle}>{"Xero Position"}</p>
                      <p className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-secondary)]">{"Pushed to Xero incl. GST"}</span>
                        <span className="whitespace-nowrap font-medium text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(gstPresentation.pushed?.totalMinor)}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-secondary)]">{"New Since Last Push incl. GST"}</span>
                        <span className="whitespace-nowrap font-medium text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(gstPresentation.newSincePush?.totalMinor)}
                        </span>
                      </p>

                      <div className="h-px bg-[var(--border)]" />
                      <p className={styles.quoteCardTitle}>{"Payment Position"}</p>
                      <p className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-secondary)]">{"Paid incl. GST"}</span>
                        <span className="whitespace-nowrap font-medium text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(gstPresentation.payment?.paidMinor)}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-4 pt-1">
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{"Outstanding incl. GST"}</span>
                        <span className="whitespace-nowrap text-[15px] font-semibold text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                          {minorMoney(gstPresentation.payment?.outstandingMinor)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {isDraft ? (
                    <div className="space-y-2">
                      <Button type="submit" form={headerFormId} variant="secondary" className="h-10 w-full rounded-full">
                        Save and refresh
                      </Button>
                      <form action={submitRetentionClaimAction}>
                        <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                        <input type="hidden" name="positionStateHash" value={positionHash} />
                        <input type="hidden" name="eligibilityStateHash" value={eligibilityHash} />
                        <Button
                          type="submit"
                          className="h-10 w-full rounded-full"
                          disabled={
                            allocations.length === 0 ||
                            !positionHash ||
                            !eligibilityHash ||
                            positionStateStale
                          }
                        >
                          Submit immutable claim
                        </Button>
                      </form>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button type="button" variant="ghost" className="h-10 w-full rounded-full text-[var(--error)]">
                            Cancel Draft
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[calc(100vw-24px)] max-w-[520px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0 shadow-[var(--shadow-lg)] sm:w-full">
                          <DialogHeader className="border-b border-[var(--border)] px-5 pb-5 pt-5 sm:px-6">
                            <DialogTitle>Cancel {claim.claimNumber}?</DialogTitle>
                            <DialogDescription className="pt-2">
                              Cancellation is audited. Enter the required reason before confirming.
                            </DialogDescription>
                          </DialogHeader>
                          <form action={cancelRetentionClaimAction}>
                            <div className="px-5 py-5 sm:px-6">
                              <HiddenContext projectSlug={projectSlug} claimId={claim.id} revision={claim.draftRevision} />
                              <label htmlFor="retention-cancel-reason" className={styles.quoteBodyLabel}>
                                Cancellation reason
                              </label>
                              <Input
                                id="retention-cancel-reason"
                                name="reason"
                                required
                                className="mt-2 h-10 rounded-[6px]"
                              />
                            </div>
                            <DialogFooter className="border-t border-[var(--border)] px-5 py-4 sm:px-6">
                              <DialogClose asChild>
                                <Button type="button" variant="secondary">Keep Draft</Button>
                              </DialogClose>
                              <Button type="submit" variant="destructive">Cancel Draft</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                      {positionStateStale ? (
                        <p className="text-xs leading-5 text-[var(--warning)]">
                          Save and refresh the position before submitting.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {immutableXeroPanel.visible ? (
        <RetentionClaimXeroPanel
          retentionClaimId={claim.id}
          initialState={immutableXeroPanel}
        />
      ) : null}

      {isSubmitted && paymentState?.visible ? (
        <WorkflowDisclosure
          title="Payment Reconciliation"
          description="Reconcile aggregate paid state while preserving deterministic origin attribution."
        >
          <div className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[var(--text-muted)]">Status</dt>
                <dd className="mt-1 font-medium">
                  {paymentState.latestStatus?.replaceAll("_", " ") ?? "Unreconciled"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Paid excl. tax</dt>
                <dd className="mt-1 font-medium">{money(paymentState.currentPaidAmount)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Outstanding excl. tax</dt>
                <dd className="mt-1 font-medium">{money(paymentState.currentOutstandingAmount)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Latest authority</dt>
                <dd className="mt-1 font-medium">{paymentState.latestSource?.toUpperCase() ?? "—"}</dd>
              </div>
            </dl>
            {paymentState.attentionMessage ? (
              <OperationalAlert variant="warning">
                {paymentState.attentionMessage} The previous successful paid attribution remains current.
              </OperationalAlert>
            ) : null}
            {paymentState.canManage ? (
              <div className="flex flex-col gap-3 lg:flex-row">
                <form action={recordManualRetentionClaimPaymentAction} className="flex flex-1 flex-wrap gap-3">
                  <input type="hidden" name="projectSlug" value={projectSlug} />
                  <input type="hidden" name="retentionClaimId" value={claim.id} />
                  <input
                    type="hidden"
                    name="expectedPreviousReconciliationId"
                    value={paymentState.latestReconciliationId ?? ""}
                  />
                  <Input
                    name="paidAmount"
                    type="number"
                    min="0"
                    max={paymentState.subtotalExclTax}
                    step="0.01"
                    defaultValue={paymentState.currentPaidAmount}
                    aria-label="Manual paid amount excluding tax"
                    required
                    className="min-w-[180px] flex-1"
                  />
                  <Button type="submit" variant="secondary">Record manual payment</Button>
                </form>
                {paymentState.externalInvoiceId && !immutableXeroPanel?.visible ? (
                  <form action={refreshRetentionClaimPaymentAction}>
                    <input type="hidden" name="projectSlug" value={projectSlug} />
                    <input type="hidden" name="retentionClaimId" value={claim.id} />
                    <Button type="submit" disabled={paymentState.refreshInProgress}>
                      <RefreshCw className="h-4 w-4" />
                      {paymentState.refreshInProgress
                        ? "Xero refresh queued"
                        : "Refresh payment from Xero"}
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </WorkflowDisclosure>
      ) : null}

      <WorkflowDisclosure
        title="Audit History"
        description="Append-only Retention Claim events."
        icon={<History className="h-4 w-4 text-[var(--text-muted)]" />}
        defaultOpen={false}
      >
        <ol className="space-y-3">
          {workspace.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-2 border-b border-[var(--border)] pb-3 text-sm last:border-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4"
            >
              <div>
                <div className="font-medium text-[var(--text-primary)]">
                  {event.eventType.replaceAll("_", " ")}
                </div>
                <div className="text-[var(--text-secondary)]">{event.reason}</div>
                {event.actorUserId ? (
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Actor {event.actorUserId}
                  </div>
                ) : null}
              </div>
              <time className="shrink-0 text-[var(--text-muted)]">
                {displayDate(event.occurredAt)}
              </time>
            </li>
          ))}
          {workspace.events.length === 0 ? (
            <li className="text-sm text-[var(--text-secondary)]">No events are available.</li>
          ) : null}
        </ol>
      </WorkflowDisclosure>
      </div>
    </RetentionClaimDateEditingProvider>
  );
}
