"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { RetentionClaimXeroPanel } from "@/components/app/RetentionClaimXeroPanel";
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
import {
  calculateRetentionClaimPercentagePreview,
  retentionClaimPercentFromAmount,
} from "@/lib/retention/retention-claim-percentage";
import {
  isSavedRetentionClaimReadyForFinalisation,
} from "@/lib/retention/retention-claim-draft-readiness";
import type {
  RetentionClaimImmutableXeroPanelState,
} from "@/lib/xero/retention-claim-immutable-panel";
import {
  cancelRetentionClaimAction,
  saveRetentionClaimDocumentAction,
  submitRetentionClaimAction,
} from "../../actions";
import { ClaimLineTableShell } from "./ClaimLineTableShell";

export type RetentionClaimDraftEditorLine = {
  key: string;
  originatingPaymentClaimId: string;
  candidateId: string | null;
  existingAllocationId: string | null;
  expectedOriginStateHash: string;
  sequence: number;
  claimNumber: string;
  claimDate: string | null;
  retentionHeldCents: number;
  eligibleCents: number;
  previouslyClaimedCents: number;
  availableCents: number;
  proposedAmountCents: number;
  stale: boolean;
};

type Props = {
  projectSlug: string;
  registerHref: string;
  retentionClaimId: string;
  claimNumber: string;
  initialTitle: string;
  initialReference: string;
  initialIssueDate: string;
  initialDueDate: string;
  initialDraftRevision: number;
  initialPositionStateHash: string;
  initialEligibilityStateHash: string;
  initialOriginSetHash: string;
  initialLines: RetentionClaimDraftEditorLine[];
  currentRetentionCents: number;
  eligibleCents: number;
  previouslyClaimedCents: number;
  positionStateStale: boolean;
  retentionError?: string;
  immutableXeroPanel: RetentionClaimImmutableXeroPanelState;
  events: Array<{
    id: string;
    eventType: string;
    reason: string;
    actorUserId: string | null;
    occurredAt: string;
  }>;
};

type EditableLine = RetentionClaimDraftEditorLine & { claimPercent: string };

function money(cents: number) {
  return formatMoneyOperational(cents / 100, { decimals: 2 });
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-NZ");
}

function snapshot(
  title: string,
  reference: string,
  issueDate: string,
  dueDate: string,
  lines: EditableLine[],
) {
  return JSON.stringify({
    title,
    reference,
    issueDate,
    dueDate,
    lines: lines.map((line) => [
      line.originatingPaymentClaimId,
      line.claimPercent,
    ]),
  });
}

export function RetentionClaimDraftEditor({
  projectSlug,
  registerHref,
  retentionClaimId,
  claimNumber,
  initialTitle,
  initialReference,
  initialIssueDate,
  initialDueDate,
  initialDraftRevision,
  initialPositionStateHash,
  initialEligibilityStateHash,
  initialOriginSetHash,
  initialLines,
  currentRetentionCents,
  eligibleCents,
  previouslyClaimedCents,
  positionStateStale,
  retentionError,
  immutableXeroPanel,
  events,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [reference, setReference] = useState(initialReference);
  const [issueDate, setIssueDate] = useState(initialIssueDate);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [revision, setRevision] = useState(initialDraftRevision);
  const [positionHash, setPositionHash] = useState(initialPositionStateHash);
  const [eligibilityHash, setEligibilityHash] = useState(
    initialEligibilityStateHash,
  );
  const [originSetHash, setOriginSetHash] = useState(initialOriginSetHash);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    initialLines.map((line) => ({
      ...line,
      claimPercent: retentionClaimPercentFromAmount(
        line.retentionHeldCents,
        line.previouslyClaimedCents,
        line.proposedAmountCents,
      ),
    })),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshot(
      initialTitle,
      initialReference,
      initialIssueDate,
      initialDueDate,
      initialLines.map((line) => ({
        ...line,
        claimPercent: retentionClaimPercentFromAmount(
          line.retentionHeldCents,
          line.previouslyClaimedCents,
          line.proposedAmountCents,
        ),
      })),
    ),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [isSaving, startSaving] = useTransition();
  const currentSnapshot = snapshot(title, reference, issueDate, dueDate, lines);
  const dirty = currentSnapshot !== savedSnapshot;
  const linePreviews = useMemo(
    () =>
      lines.map((line) => ({
        id: line.originatingPaymentClaimId,
        preview: calculateRetentionClaimPercentagePreview(
          line.retentionHeldCents,
          line.previouslyClaimedCents,
          line.claimPercent,
        ),
      })),
    [lines],
  );
  const hasInvalidPercentages = linePreviews.some(
    (value) => value.preview === null,
  );
  const previewByOrigin = useMemo(
    () => new Map(linePreviews.map((value) => [value.id, value.preview])),
    [linePreviews],
  );
  const thisClaimCents = linePreviews.reduce(
    (sum, value) => sum + (value.preview?.thisClaimCents ?? 0),
    0,
  );
  const claimedToDateCents = previouslyClaimedCents + thisClaimCents;
  const remainingCents = Math.max(
    currentRetentionCents - claimedToDateCents,
    0,
  );
  const canSubmit = isSavedRetentionClaimReadyForFinalisation({
    dirty,
    isSaving,
    positionStateStale,
    hasInvalidPercentages,
    thisClaimCents,
    positionStateHash: positionHash,
    eligibilityStateHash: eligibilityHash,
  });

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setLinePercent(originId: string, claimPercent: string) {
    setMessage(null);
    setSaveError(null);
    setLines((current) =>
      current.map((line) =>
        line.originatingPaymentClaimId === originId
          ? { ...line, claimPercent }
          : line,
      ),
    );
  }

  function saveClaim() {
    setMessage(null);
    setSaveError(null);
    setRowErrors({});
    if (hasInvalidPercentages) {
      setSaveError(
        "Enter each Claim % from 0 to 100 with no more than three decimal places.",
      );
      return;
    }
    startSaving(async () => {
      const result = await saveRetentionClaimDocumentAction({
        projectSlug,
        retentionClaimId,
        expectedDraftRevision: revision,
        title,
        reference: reference || null,
        issueDate: issueDate || null,
        dueDate: dueDate || null,
        expectedPositionStateHash: positionHash,
        expectedEligibilityStateHash: eligibilityHash,
        expectedOriginSetHash: originSetHash,
        lines: lines.map((line) => ({
          originatingPaymentClaimId: line.originatingPaymentClaimId,
          candidateId: line.candidateId,
          existingAllocationId: line.existingAllocationId,
          expectedOriginStateHash: line.expectedOriginStateHash,
          sequence: line.sequence,
          proposedAmountCents:
            calculateRetentionClaimPercentagePreview(
              line.retentionHeldCents,
              line.previouslyClaimedCents,
              line.claimPercent,
            )?.thisClaimCents ?? 0,
        })),
      });
      if (!result.succeeded) {
        setSaveError(
          `The claim was not saved (${(result.errorCode ?? "unknown_error").replaceAll("_", " ")}). No changes were applied.`,
        );
        setRowErrors(
          Object.fromEntries(
            (result.rowErrors ?? []).map((error) => [
              error.originatingPaymentClaimId,
              `${error.errorCode.replaceAll("_", " ")}. Currently allowable: ${money(error.currentLimitCents)}.`,
            ]),
          ),
        );
        if (result.requiresReload || result.errorCode === "origin_set_changed") {
          router.refresh();
        }
        return;
      }

      const returnedByOrigin = new Map(
        (result.lines ?? []).map((line) => [
          line.originatingPaymentClaimId,
          line,
        ]),
      );
      const nextLines = lines.map((line) => {
        const returned = returnedByOrigin.get(line.originatingPaymentClaimId);
        return returned
          ? {
              ...line,
              existingAllocationId: returned.existingAllocationId,
              expectedOriginStateHash: returned.expectedOriginStateHash,
              proposedAmountCents: returned.proposedAmountCents,
              claimPercent: retentionClaimPercentFromAmount(
                line.retentionHeldCents,
                line.previouslyClaimedCents,
                returned.proposedAmountCents,
              ),
              availableCents: returned.availableCents,
            }
          : line;
      });
      setLines(nextLines);
      setRevision(result.draftRevision ?? revision);
      setPositionHash(result.positionStateHash ?? positionHash);
      setEligibilityHash(result.eligibilityStateHash ?? eligibilityHash);
      setOriginSetHash(result.originSetHash ?? originSetHash);
      setSavedSnapshot(
        snapshot(title, reference, issueDate, dueDate, nextLines),
      );
      setMessage(result.changed ? "Retention Claim saved." : "No changes to save.");
      router.refresh();
    });
  }

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]" data-testid="retention-claim-detail">
      <OperationalModuleHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{claimNumber}</span>
            <StatusBadge status="draft">Draft</StatusBadge>
          </span>
        }
        description="Live Retention Claim calculation based on saved Payment Claim retention."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={saveClaim} disabled={isSaving || hasInvalidPercentages}>
              {isSaving ? "Saving…" : "Save Claim"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-9 px-3" aria-label="Retention Claim actions">
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
                  <Link href={registerHref}>Retention Register</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={saveClaim}
                  disabled={isSaving || hasInvalidPercentages}
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  Save Claim
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {retentionError ? <OperationalAlert variant="error">{retentionError}</OperationalAlert> : null}
      {saveError ? <OperationalAlert variant="error">{saveError}</OperationalAlert> : null}
      {message ? <OperationalAlert variant="success">{message}</OperationalAlert> : null}
      {positionStateStale ? (
        <OperationalAlert variant="warning">
          The Retention position has changed. Save the Claim to refresh its evidence before submission.
        </OperationalAlert>
      ) : null}
      {dirty ? (
        <OperationalAlert variant="warning">
          {immutableXeroPanel.visible
            ? "This Retention Claim has unsaved changes. Save Claim before pushing to Xero."
            : "This Retention Claim has unsaved changes. Save Claim before submitting."}
        </OperationalAlert>
      ) : null}

      <div className="space-y-6 [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface)] [&_input]:text-[var(--text-primary)]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
        <section className="border-b border-[var(--border-subtle)] pb-5">
          <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Claim Workspace</h2>
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className={`${styles.quoteBodyLabel} space-y-1.5`}>
                Claim No.
                <Input value={claimNumber} readOnly className="h-10 rounded-[6px] bg-[var(--surface-muted)]" />
              </label>
              <label className={`${styles.quoteBodyLabel} space-y-1.5 md:col-span-2`}>
                Title
                <Input name="title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 rounded-[6px]" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className={`${styles.quoteBodyLabel} space-y-1.5 md:col-span-2`}>
                Reference
                <Input name="reference" value={reference} onChange={(event) => setReference(event.target.value)} className="h-10 rounded-[6px]" />
              </label>
              <div className="space-y-1.5">
                <span className={styles.quoteBodyLabel}>Status</span>
                <div className="flex h-10 items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3">
                  <StatusBadge status="draft">Draft</StatusBadge>
                  <span className="ml-auto text-xs text-[var(--text-muted)]">Revision {revision}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--border-subtle)] py-5">
          <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Claim Period</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className={`${styles.quoteBodyLabel} space-y-1.5`}>
              Claim Date
              <Input name="issueDate" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="h-10 rounded-[6px]" />
            </label>
            <label className={`${styles.quoteBodyLabel} space-y-1.5`}>
              Due Date
              <Input name="dueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-[6px]" />
            </label>
          </div>
        </section>

        <ClaimLineTableShell title="Retention Claim Lines">
          <div className="overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className={`${styles.quoteButtonLabel} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}>
                  {["Payment Claim", "Retention Held", "Previously Claimed", "Claim %", "This Claim", "Claimed to Date", "Remaining"].map((heading, index) => (
                    <th key={heading} className={`${index ? "border-l border-[var(--border)]" : ""} px-3 py-2.5 font-semibold ${index >= 1 && index !== 3 ? "text-right" : ""}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const preview = previewByOrigin.get(
                    line.originatingPaymentClaimId,
                  );
                  const invalid = preview === null;
                  return (
                    <tr key={line.key} className="h-12 border-t border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]">
                      <td className="h-12 px-3 py-1.5 text-sm font-medium text-[var(--text-primary)]">
                        {line.claimNumber}
                        {line.stale ? <span className="block text-xs text-[var(--warning)]">Source changed</span> : null}
                      </td>
                      {[line.retentionHeldCents, line.previouslyClaimedCents].map((cents, index) => (
                        <td key={index} className={`${interMedium.className} h-12 whitespace-nowrap border-l border-[var(--border-subtle)] px-3 py-1.5 text-right text-sm font-normal text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]`}>{money(cents)}</td>
                      ))}
                      <td className="border-l border-[var(--border-subtle)] px-3 py-1.5">
                        <div className="relative w-full">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.001"
                            value={line.claimPercent}
                            onChange={(event) => setLinePercent(line.originatingPaymentClaimId, event.target.value)}
                            className={`h-9 rounded-[6px] border-[var(--border)] bg-[var(--surface)] pr-7 text-right ${invalid ? "border-[var(--error)] focus-visible:ring-[var(--error)]" : ""}`}
                            aria-label={`Claim % for ${line.claimNumber}`}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">%</span>
                        </div>
                        {invalid ? <p className="mt-1 text-right text-xs text-[var(--error)]">Enter 0–100 with up to three decimal places.</p> : null}
                        {rowErrors[line.originatingPaymentClaimId] ? <p className="text-right text-xs text-[var(--error)]">{rowErrors[line.originatingPaymentClaimId]}</p> : null}
                      </td>
                      <td className="whitespace-nowrap border-l border-[var(--border-subtle)] px-3 py-1.5 text-right font-semibold [font-variant-numeric:tabular-nums]">{preview ? money(preview.thisClaimCents) : "—"}</td>
                      <td className="whitespace-nowrap border-l border-[var(--border-subtle)] px-3 py-1.5 text-right [font-variant-numeric:tabular-nums]">{preview ? money(preview.claimedToDateCents) : "—"}</td>
                      <td className="whitespace-nowrap border-l border-[var(--border-subtle)] px-3 py-1.5 text-right [font-variant-numeric:tabular-nums]">{preview ? money(preview.remainingCents) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={`${interMedium.className} mt-3 text-xs leading-5 text-[var(--text-muted)]`}>
            Payment Claims remain the source of retention ownership. Amounts shown while editing are previews; Save Claim validates the complete document on the server.
          </p>
        </ClaimLineTableShell>

        <div className="border-t border-[var(--border-subtle)] py-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <section>
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Workflow & Supporting Information</h2>
            <div className="mt-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
              <p className={styles.quoteCardTitle}>Retention position</p>
              <p className={`${styles.quoteBodyLabel} mt-1`}>
                {immutableXeroPanel.visible
                  ? "Save the complete Draft before pushing to Xero. Push to Xero finalises the saved allocations as immutable evidence before showing the accounting preview."
                  : "Save the complete Draft before submission. Submission freezes the persisted allocations as immutable evidence."}
              </p>
              <div className="mt-2"><StatusBadge status={positionStateStale ? "pending" : "approved"}>{positionStateStale ? "Stale" : "Current"}</StatusBadge></div>
            </div>
          </section>
          <aside className="border-t border-[var(--border-subtle)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>Retention Claim Summary</h2>
            <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
              <div className={`${interMedium.className} space-y-3 text-sm`}>
                {[
                  ["Current Retention", currentRetentionCents],
                  ["Eligible", eligibleCents],
                  ["Previously Claimed", previouslyClaimedCents],
                  ["This Retention Claim", thisClaimCents],
                  ["Claimed to Date", claimedToDateCents],
                  ["After This Claim", remainingCents],
                  ["Paid", 0],
                  ["Outstanding", 0],
                ].map(([label, cents]) => (
                  <p key={String(label)} className="flex items-center justify-between gap-4">
                    <span className="text-[var(--text-secondary)]">{label}</span>
                    <span className="whitespace-nowrap font-medium [font-variant-numeric:tabular-nums]">{money(Number(cents))}</span>
                  </p>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Button type="button" className="h-10 w-full rounded-full" onClick={saveClaim} disabled={isSaving || hasInvalidPercentages}>
                {isSaving ? "Saving…" : "Save Claim"}
              </Button>
              {!immutableXeroPanel.visible ? (
                <form action={submitRetentionClaimAction}>
                  <input type="hidden" name="projectSlug" value={projectSlug} />
                  <input type="hidden" name="retentionClaimId" value={retentionClaimId} />
                  <input type="hidden" name="expectedDraftRevision" value={revision} />
                  <input type="hidden" name="positionStateHash" value={positionHash} />
                  <input type="hidden" name="eligibilityStateHash" value={eligibilityHash} />
                  <Button type="submit" variant="secondary" className="h-10 w-full rounded-full" disabled={!canSubmit}>
                    Submit immutable claim
                  </Button>
                </form>
              ) : null}
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" className="h-10 w-full rounded-full text-[var(--error)]">Cancel Draft</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel {claimNumber}?</DialogTitle>
                    <DialogDescription>Cancellation is audited and requires a reason.</DialogDescription>
                  </DialogHeader>
                  <form action={cancelRetentionClaimAction}>
                    <input type="hidden" name="projectSlug" value={projectSlug} />
                    <input type="hidden" name="retentionClaimId" value={retentionClaimId} />
                    <input type="hidden" name="expectedDraftRevision" value={revision} />
                    <label className={styles.quoteBodyLabel}>
                      Cancellation reason
                      <Input name="reason" required className="mt-2 h-10 rounded-[6px]" />
                    </label>
                    <DialogFooter className="mt-5">
                      <DialogClose asChild><Button type="button" variant="secondary">Keep Draft</Button></DialogClose>
                      <Button type="submit" variant="destructive">Cancel Draft</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              {!canSubmit ? (
                <p className="text-xs leading-5 text-[var(--text-muted)]">
                  {immutableXeroPanel.visible
                    ? "Save all changes and resolve stale or invalid lines before pushing to Xero."
                    : "Save all changes and resolve stale or invalid lines before submitting."}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
        </div>
        </div>
      </div>

      {immutableXeroPanel.visible ? (
        <RetentionClaimXeroPanel
          retentionClaimId={retentionClaimId}
          initialState={immutableXeroPanel}
          draftCanPush={canSubmit}
          draftBlockedMessage={
            "Save the Retention Claim and resolve any invalid lines before pushing it to Xero."
          }
        />
      ) : null}

      <details className={`${styles.quotePanelCard} group min-w-0 overflow-hidden`}>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-5 marker:hidden sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--text-muted)]" />
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Audit History</h2>
            </div>
            <p className={`${interMedium.className} mt-2 text-sm leading-6 text-[var(--text-secondary)]`}>
              Append-only Retention Claim events.
            </p>
          </div>
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-[var(--border-subtle)] px-5 py-5 sm:px-6">
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-2 border-b border-[var(--border)] pb-3 text-sm last:border-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">{event.eventType.replaceAll("_", " ")}</div>
                  <div className="text-[var(--text-secondary)]">{event.reason}</div>
                  {event.actorUserId ? <div className="mt-1 text-xs text-[var(--text-muted)]">Actor {event.actorUserId}</div> : null}
                </div>
                <time className="shrink-0 text-[var(--text-muted)]">{displayDate(event.occurredAt)}</time>
              </li>
            ))}
            {events.length === 0 ? <li className="text-sm text-[var(--text-secondary)]">No events are available.</li> : null}
          </ol>
        </div>
      </details>
    </div>
  );
}
