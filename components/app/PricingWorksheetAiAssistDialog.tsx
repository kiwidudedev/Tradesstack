"use client";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type {
  PricingWorksheetAiEvidenceSource,
  PricingWorksheetAiOperation,
  PricingWorksheetAiReviewFinding,
  PricingWorksheetAiReviewSummary,
  PricingWorksheetAiSuggestedEditGroup,
} from "@/lib/pricing-worksheet-edit-plan";

export type PricingWorksheetAiValidationWarning = {
  ruleKey: string;
  severity: "info" | "warning" | "error" | "critical";
  result: "passed" | "failed" | "warning" | "overridden";
  message: string;
};

export type PricingWorksheetAiPreviewSummary = {
  suggestionSource: "memory" | "default";
  worksheetName: string;
  tradePackage: string | null;
  rowCount: number;
  columnCount: number;
  formulaCount: number;
  populatedCellCount: number;
  confidence: "high" | "medium" | "low";
  headers: string[];
  promptHighlights: string[];
  sampleLineItems: string[];
  sections?: string[];
  sectionCounts?: {
    sections: number;
    rows: number;
    operations: number;
  };
  assumptions?: string[];
  warnings?: string[];
};

export type PricingWorksheetAiMatchedMemory = {
  id: string;
  title: string;
  summary: string;
};

export type PricingWorksheetAiContextSummary = {
  matchedMemoryCount?: number;
  summary: string;
};

export type PricingWorksheetAiOperationPreview = {
  type: string;
  rationale?: string | null;
};

export type PricingWorksheetAiPreviewAssistant = {
  mode: "answer_only" | "propose_edit" | "answer_and_propose_edit";
  proposalName: string;
  answer: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  operations: PricingWorksheetAiOperationPreview[];
  assumptions: string[];
  warnings: string[];
  evidenceSources?: PricingWorksheetAiEvidenceSource[];
  reviewFindings?: PricingWorksheetAiReviewFinding[];
  reviewSummary?: PricingWorksheetAiReviewSummary | null;
  suggestedEditGroups?: PricingWorksheetAiSuggestedEditGroup[];
  diffSummary: {
    changedCells: string[];
    formulaCells: string[];
    formattingCells: string[];
    insertedRows: number[];
    affectedRows: number[];
  };
  diffPreview?: {
    changedCells: Array<{
      ref: string;
      row: number;
      sectionName: string | null;
      beforeValue: string;
      afterValue: string;
      beforeFormula: string | null;
      afterFormula: string | null;
      beforeFormattingSummary: string | null;
      afterFormattingSummary: string | null;
    }>;
    insertedRows: Array<{
      row: number;
      sectionName: string | null;
      values: string[];
      formulaRefs: string[];
    }>;
    affectedSections: string[];
    formulaChanges: Array<{
      ref: string;
      beforeFormula: string | null;
      afterFormula: string | null;
    }>;
    formattingChanges: Array<{
      ref: string;
      row: number;
      sectionName: string | null;
      beforeFormattingSummary: string | null;
      afterFormattingSummary: string | null;
    }>;
  };
};

export type PricingWorksheetAiFindingDisposition = "accepted" | "rejected";

type Props = {
  open: boolean;
  canApply: boolean;
  prompt: string;
  previewWorksheetName: string;
  previewTradePackage: string;
  isGenerating: boolean;
  jobStatus?: "queued" | "running" | "researching" | "generating" | "validating" | "ready" | "failed" | "cancelled" | null;
  jobProgressLabel?: string | null;
  jobError?: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  isSubmittingReview: boolean;
  preview: {
    compactOutput: PricingWorksheetAiPreviewSummary;
    matchedMemory: PricingWorksheetAiMatchedMemory | null;
    validationWarnings: PricingWorksheetAiValidationWarning[];
    contextSummary: PricingWorksheetAiContextSummary;
    classification?: PricingWorksheetConstructionIntent;
    assistant?: PricingWorksheetAiPreviewAssistant | null;
    generationMeta?: {
      provider: string;
      model: string;
      fallbackUsed: boolean;
      fallbackReason: string | null;
    };
  } | null;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onPromptChange: (value: string) => void;
  onPreviewWorksheetNameChange: (value: string) => void;
  onPreviewTradePackageChange: (value: string) => void;
  onGenerate: () => void;
  onReject: () => void;
  onApply: () => void;
  onApplySuggestedEditGroup: (groupId: string) => void;
  findingStates: Record<string, PricingWorksheetAiFindingDisposition>;
  appliedSuggestedEditGroupIds: string[];
  followUpPrompt: string;
  isSubmittingFollowUp: boolean;
  onFollowUpPromptChange: (value: string) => void;
  onSubmitFollowUp: () => void;
  onFindingDispositionChange: (findingId: string, disposition: PricingWorksheetAiFindingDisposition) => void;
};

function formatConfidence(value: PricingWorksheetAiPreviewSummary["confidence"]) {
  if (value === "high") {
    return "High";
  }

  if (value === "low") {
    return "Low";
  }

  return "Medium";
}

function warningVariant(
  severity: PricingWorksheetAiValidationWarning["severity"]
): "info" | "warning" | "error" {
  if (severity === "error" || severity === "critical") {
    return "error";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "info";
}

function formatFindingCategory(category: PricingWorksheetAiReviewFinding["category"]) {
  switch (category) {
    case "missing_scope":
      return "Missing scope";
    case "formula_risk":
      return "Formula risk";
    case "quantity_risk":
      return "Quantity risk";
    case "labour_risk":
      return "Labour risk";
    case "wastage_risk":
      return "Wastage risk";
    case "specification_uncertainty":
      return "Specification uncertainty";
    case "quote_readiness":
      return "Quote readiness";
    case "takeoff_readiness":
      return "Takeoff readiness";
    default:
      return "General review";
  }
}

function chipClassName(tone: "neutral" | "warning" | "critical" | "success") {
  if (tone === "critical") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-[var(--border)] bg-white text-[var(--text-secondary)]";
}

function findingSeverityTone(severity: PricingWorksheetAiReviewFinding["severity"]) {
  if (severity === "high") {
    return "critical" as const;
  }

  if (severity === "medium") {
    return "warning" as const;
  }

  if (severity === "info") {
    return "success" as const;
  }

  return "neutral" as const;
}

function formatFindingStatus(status: PricingWorksheetAiReviewFinding["findingStatus"] | undefined) {
  switch (status) {
    case "revised":
      return "Revised";
    case "downgraded":
      return "Downgraded";
    case "invalidated":
      return "Invalidated";
    case "confirmed":
      return "Confirmed";
    case "superseded":
      return "Superseded";
    default:
      return "Active";
  }
}

function findingStatusTone(status: PricingWorksheetAiReviewFinding["findingStatus"] | undefined) {
  switch (status) {
    case "invalidated":
      return "warning" as const;
    case "downgraded":
      return "warning" as const;
    case "confirmed":
      return "success" as const;
    default:
      return "neutral" as const;
  }
}

function formatEvidenceSourceType(sourceType: PricingWorksheetAiEvidenceSource["sourceType"]) {
  switch (sourceType) {
    case "manufacturer":
      return "Manufacturer";
    case "standard_or_code":
      return "Standard / code";
    case "industry_guidance":
      return "Industry guidance";
    case "supplier":
      return "Supplier";
    case "project_document":
      return "Project document";
    case "organization_memory":
      return "Organization memory";
    case "web":
      return "Web";
    default:
      return "Unknown";
  }
}

export function PricingWorksheetAiAssistDialog({
  open,
  canApply,
  prompt,
  previewWorksheetName,
  previewTradePackage,
  isGenerating,
  jobStatus,
  jobProgressLabel,
  jobError,
  isSubmittingReview,
  preview,
  error,
  onOpenChange,
  onPromptChange,
  onPreviewWorksheetNameChange,
  onPreviewTradePackageChange,
  onGenerate,
  onReject,
  onApply,
  onApplySuggestedEditGroup,
  findingStates,
  appliedSuggestedEditGroupIds,
  followUpPrompt,
  isSubmittingFollowUp,
  onFollowUpPromptChange,
  onSubmitFollowUp,
  onFindingDispositionChange,
}: Props) {
  const isBusy = isGenerating || isSubmittingReview || isSubmittingFollowUp;
  const isAnswerOnly = preview?.assistant?.mode === "answer_only";
  const hasBlockingWarning = preview?.validationWarnings.some(
    (warning) => warning.result === "failed" || warning.severity === "error" || warning.severity === "critical"
  ) ?? false;
  const hasMutatingOperations =
    (preview?.assistant?.operations ?? []).some((operation) => operation.type !== "explain_formula") ?? false;
  const reviewFindings = preview?.assistant?.reviewFindings ?? [];
  const suggestedEditGroups = preview?.assistant?.suggestedEditGroups ?? [];
  const evidenceSources = preview?.assistant?.evidenceSources ?? [];
  const inProgress = Boolean(jobStatus && !["ready", "failed", "cancelled"].includes(jobStatus));
  const applyLabel =
    isAnswerOnly
      ? "Done"
      : hasMutatingOperations
        ? "Apply changes"
        : "Accept response";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[920px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <DialogHeader className="border-b border-[var(--border)] px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                <Sparkles className="h-3.5 w-3.5" />
                Preview only
              </div>
              <DialogTitle className="text-[24px] font-semibold tracking-[-0.02em]">
                Ask AI worksheet assistant
              </DialogTitle>
              <DialogDescription className="max-w-[680px] text-sm text-[var(--text-secondary)]">
                Ask for formula advice, explanations, or safe worksheet edits. Nothing is applied or saved until you explicitly approve it.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
          {inProgress && jobProgressLabel ? <OperationalAlert variant="info">{jobProgressLabel}</OperationalAlert> : null}
          {!error && jobError?.message && (jobStatus === "failed" || jobStatus === "cancelled") ? (
            <OperationalAlert variant={jobError.retryable ? "warning" : "error"}>
              {jobError.message}
            </OperationalAlert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(event) => onPromptChange(event.target.value)}
                  disabled={isBusy}
                  placeholder="Explain this formula, add a nogs row, fix the total formula, or suggest a safer worksheet edit."
                  className="min-h-[132px] w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Preview worksheet name
                  </span>
                  <input
                    value={previewWorksheetName}
                    onChange={(event) => onPreviewWorksheetNameChange(event.target.value)}
                    disabled={isBusy}
                    className="h-11 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Preview trade package
                  </span>
                  <input
                    value={previewTradePackage}
                    onChange={(event) => onPreviewTradePackageChange(event.target.value)}
                    disabled={isBusy}
                    placeholder="Optional"
                    className="h-11 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={onGenerate}
                  disabled={isBusy || previewWorksheetName.trim().length === 0}
                  className="h-10 rounded-[8px] px-4 text-sm font-medium"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {isGenerating ? (jobProgressLabel ?? "Preparing response...") : jobError?.retryable ? "Retry Ask AI" : "Ask AI"}
                </Button>
                <p className="text-xs text-[var(--text-secondary)]">
                  Ask AI uses compact worksheet context only. Any worksheet edits stay local until you apply them, and nothing saves until you save normally.
                </p>
              </div>

              {preview ? (
                <div className="space-y-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      {preview.compactOutput.suggestionSource === "memory" ? "Memory-guided" : "Context-guided"}
                    </span>
                    <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Confidence {formatConfidence(preview.compactOutput.confidence)}
                    </span>
                    {preview.assistant ? (
                      <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {preview.assistant.mode.replaceAll("_", " ")}
                      </span>
                    ) : null}
                    {preview.generationMeta?.fallbackUsed ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                        Assistant fallback
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Rows / cols
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                        {preview.compactOutput.rowCount} rows / {preview.compactOutput.columnCount} columns
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Formulas
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                        {preview.compactOutput.formulaCount}
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Populated cells
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                        {preview.compactOutput.populatedCellCount}
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Context used
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                        {preview.contextSummary.matchedMemoryCount ?? 0} memory matches
                      </div>
                    </div>
                  </div>

                  {preview.compactOutput.sectionCounts ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          Sections
                        </div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                          {preview.compactOutput.sectionCounts.sections}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          Context rows
                        </div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                          {preview.compactOutput.sectionCounts.rows}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          Operations
                        </div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                          {preview.compactOutput.sectionCounts.operations}
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          Changed cells
                        </div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                          {preview.assistant?.diffSummary.changedCells.length ?? 0}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {preview.validationWarnings.length > 0 ? (
                    <div className="space-y-2">
                      {preview.validationWarnings.map((warning) => (
                        <OperationalAlert key={warning.ruleKey} variant={warningVariant(warning.severity)}>
                          {warning.message}
                        </OperationalAlert>
                      ))}
                    </div>
                  ) : (
                    <OperationalAlert variant="success">
                      Preview passed the initial worksheet validation checks.
                    </OperationalAlert>
                  )}

                  {!canApply && hasMutatingOperations ? (
                    <OperationalAlert variant="warning">
                      You can review this AI suggestion, but applying worksheet edits requires write permission.
                    </OperationalAlert>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                  Ask AI to see an answer, suggested worksheet edits, validation warnings, and matching memory context before anything touches the current sheet.
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Preview summary</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {isAnswerOnly
                    ? "Review the answer, assumptions, and memory support. This response will not change the worksheet unless you ask for an edit."
                    : "Review the answer, proposed changes, and memory support before applying anything to the current worksheet."}
                </p>
              </div>

              {preview ? (
                <div className="space-y-4">
                  {preview.assistant?.answer ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Answer
                      </div>
                      <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
                        {preview.assistant.answer}
                      </div>
                    </div>
                  ) : null}

                  {preview.assistant?.summary ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Summary
                      </div>
                      <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
                        {preview.assistant.summary}
                      </div>
                    </div>
                  ) : null}

                  {preview.assistant?.reviewSummary ? (
                    <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Estimator review summary
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          {
                            title: "Present items",
                            items: preview.assistant.reviewSummary.presentItems,
                          },
                          {
                            title: "Possible missing items",
                            items: preview.assistant.reviewSummary.possibleMissingItems,
                          },
                          {
                            title: "Key risks",
                            items: preview.assistant.reviewSummary.keyRisks,
                          },
                          {
                            title: "Confirmations needed",
                            items: preview.assistant.reviewSummary.confirmationsNeeded,
                          },
                        ].map((section) => (
                          <div key={section.title} className="rounded-[8px] bg-[var(--surface-muted)] p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                              {section.title}
                            </div>
                            {section.items.length > 0 ? (
                              <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-primary)]">
                                {section.items.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-2 text-xs text-[var(--text-secondary)]">No items captured.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {reviewFindings.length > 0 ? (
                    <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                            Review findings
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                            Structured estimator findings. Accepting a finding does not change the worksheet.
                          </div>
                        </div>
                        <div className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {reviewFindings.length} findings
                        </div>
                      </div>

                      <div className="space-y-3">
                        {reviewFindings.map((finding) => {
                          const disposition = findingStates[finding.id];
                          const relatedGroup = suggestedEditGroups.find((group) => group.id === finding.suggestedEditGroupId);
                          const isInvalidated = finding.findingStatus === "invalidated";
                          return (
                            <div key={finding.id} className={`rounded-[12px] border border-[var(--border)] p-4 ${isInvalidated ? "bg-amber-50/70" : "bg-[var(--surface-muted)]"}`}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                    {formatFindingCategory(finding.category)}
                                  </div>
                                  <div className="text-sm font-semibold text-[var(--text-primary)]">{finding.title}</div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${chipClassName(findingSeverityTone(finding.severity))}`}>
                                    {finding.severity}
                                  </span>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${chipClassName(findingStatusTone(finding.findingStatus))}`}>
                                    {formatFindingStatus(finding.findingStatus)}
                                  </span>
                                  <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                    Confidence {finding.confidence}
                                  </span>
                                  {disposition ? (
                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${chipClassName(disposition === "accepted" ? "success" : "warning")}`}>
                                      {disposition}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-3 text-sm text-[var(--text-primary)]">{finding.finding}</div>

                              {finding.revisionReason ? (
                                <div className="mt-3 rounded-[8px] bg-white px-3 py-2 text-xs text-[var(--text-secondary)]">
                                  <span className="font-semibold text-[var(--text-primary)]">Updated after clarification:</span>{" "}
                                  {finding.revisionReason}
                                </div>
                              ) : null}

                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {finding.worksheetEvidence && finding.worksheetEvidence.length > 0 ? (
                                  <div className="rounded-[8px] bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                      Worksheet evidence
                                    </div>
                                    <ul className="mt-2 space-y-1 text-xs text-[var(--text-primary)]">
                                      {finding.worksheetEvidence.map((item) => (
                                        <li key={item}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                                {finding.needsConfirmation ? (
                                  <div className="rounded-[8px] bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                      Needs confirmation
                                    </div>
                                    <div className="mt-2 text-xs text-[var(--text-primary)]">{finding.needsConfirmation}</div>
                                  </div>
                                ) : null}
                                {finding.assumption ? (
                                  <div className="rounded-[8px] bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                      Assumption
                                    </div>
                                    <div className="mt-2 text-xs text-[var(--text-primary)]">{finding.assumption}</div>
                                  </div>
                                ) : null}
                                {finding.uncertainty ? (
                                  <div className="rounded-[8px] bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                      Uncertainty
                                    </div>
                                    <div className="mt-2 text-xs text-[var(--text-primary)]">{finding.uncertainty}</div>
                                  </div>
                                ) : null}
                              </div>

                              {(finding.relatedCells?.length ?? 0) > 0 || (finding.relatedRows?.length ?? 0) > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {(finding.relatedCells ?? []).map((cell) => (
                                    <span key={cell} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
                                      Cell {cell}
                                    </span>
                                  ))}
                                  {(finding.relatedRows ?? []).map((row) => (
                                    <span key={`row-${row}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
                                      Row {row}
                                    </span>
                                  ))}
                                </div>
                              ) : null}

                              <div className="mt-4 flex flex-wrap gap-2">
                                {relatedGroup && finding.canSuggestWorksheetEdit && !isInvalidated ? (
                                  <Button
                                    type="button"
                                    onClick={() => onApplySuggestedEditGroup(relatedGroup.id)}
                                    disabled={isBusy || !canApply || hasBlockingWarning}
                                    className="h-9 rounded-[8px] px-3 text-xs font-medium"
                                  >
                                    Apply suggestion
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant={disposition === "accepted" ? "default" : "outline"}
                                  onClick={() => onFindingDispositionChange(finding.id, "accepted")}
                                  disabled={isBusy || isInvalidated}
                                  className="h-9 rounded-[8px] px-3 text-xs font-medium"
                                >
                                  Accept
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => onFindingDispositionChange(finding.id, "rejected")}
                                  disabled={isBusy}
                                  className="h-9 rounded-[8px] px-3 text-xs font-medium"
                                >
                                  Reject
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    onFollowUpPromptChange(
                                      `Regarding "${finding.title}": ${finding.needsConfirmation ?? "Please revise this finding based on the current worksheet context."}`,
                                    )
                                  }
                                  disabled={isBusy}
                                  className="h-9 rounded-[8px] px-3 text-xs font-medium"
                                >
                                  Ask follow-up
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {suggestedEditGroups.length > 0 ? (
                    <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Suggested edit groups
                      </div>
                      <div className="space-y-3">
                        {suggestedEditGroups.map((group) => (
                          <div key={group.id} className="rounded-[10px] bg-[var(--surface-muted)] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-[var(--text-primary)]">{group.title}</div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">{group.purpose}</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                  Confidence {group.confidence}
                                </span>
                                {appliedSuggestedEditGroupIds.includes(group.id) ? (
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${chipClassName("success")}`}>
                                    Applied
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {group.assumptions.length > 0 ? (
                              <div className="mt-3 text-xs text-[var(--text-primary)]">
                                <span className="font-semibold">Assumptions:</span> {group.assumptions.join(" • ")}
                              </div>
                            ) : null}
                            {group.warnings.length > 0 ? (
                              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                                <span className="font-semibold text-[var(--text-primary)]">Warnings:</span> {group.warnings.join(" • ")}
                              </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                onClick={() => onApplySuggestedEditGroup(group.id)}
                                disabled={isBusy || !canApply || hasBlockingWarning}
                                className="h-9 rounded-[8px] px-3 text-xs font-medium"
                              >
                                Apply suggestion
                              </Button>
                              <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                {group.operations.length} operation{group.operations.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Sources / evidence
                    </div>
                    {evidenceSources.length > 0 ? (
                      <div className="space-y-3">
                        {evidenceSources.map((source) => (
                          <div key={source.id} className="rounded-[10px] bg-[var(--surface-muted)] p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold text-[var(--text-primary)]">{source.title}</div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                    {formatEvidenceSourceType(source.sourceType)}
                                  </span>
                                  <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                    Confidence {source.confidence}
                                  </span>
                                  {source.jurisdiction && source.jurisdiction !== "unknown" ? (
                                    <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                      {source.jurisdiction}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            {source.supportedClaims && source.supportedClaims.length > 0 ? (
                              <div className="mt-3 text-xs text-[var(--text-primary)]">
                                <span className="font-semibold">Supported claim:</span> {source.supportedClaims[0]}
                              </div>
                            ) : null}
                            {source.url ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                              >
                                Open source
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--text-secondary)]">
                        No source evidence was captured for this response. Pure worksheet arithmetic and assumption-based review findings may not require external sources.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Worksheet sections
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(preview.compactOutput.sections ?? []).length > 0 ? (
                        (preview.compactOutput.sections ?? []).map((section) => (
                          <span
                            key={section}
                            className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                          >
                            {section}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">No section summary captured.</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Suggested headers
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {preview.compactOutput.headers.map((header) => (
                        <span
                          key={header}
                          className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                        >
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Assumptions
                    </div>
                    {(preview.assistant?.assumptions ?? preview.compactOutput.assumptions ?? []).length > 0 ? (
                      <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                        {(preview.assistant?.assumptions ?? preview.compactOutput.assumptions ?? []).map((assumption) => (
                          <li key={assumption} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2">
                            {assumption}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-[var(--text-secondary)]">
                        No explicit assumptions were captured for this preview.
                      </div>
                    )}
                  </div>

                  {isAnswerOnly ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Worksheet changes
                      </div>
                      <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
                        No worksheet edits were proposed. Ask AI with an edit instruction like &quot;Add this formula to the
                        worksheet&quot; if you want a previewable change plan.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Proposed changes
                      </div>
                      {(preview.compactOutput.sampleLineItems ?? []).length > 0 ? (
                        <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                          {preview.compactOutput.sampleLineItems.map((item) => (
                            <li key={item} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2">
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-[var(--text-secondary)]">
                          No worksheet edits were proposed for this response.
                        </div>
                      )}
                    </div>
                  )}

                  {(preview.assistant?.diffPreview?.affectedSections ?? []).length > 0 ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Affected sections
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(preview.assistant?.diffPreview?.affectedSections ?? []).map((section) => (
                          <span
                            key={section}
                            className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!isAnswerOnly ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Worksheet impact
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                          Inserted rows: {preview.assistant?.diffSummary.insertedRows.length ?? 0}
                        </div>
                        <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                          Formula changes: {preview.assistant?.diffSummary.formulaCells.length ?? 0}
                        </div>
                        <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                          Formatting changes: {preview.assistant?.diffSummary.formattingCells.length ?? 0}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {(preview.assistant?.diffPreview?.changedCells ?? []).length > 0 ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Changed cells
                      </div>
                      <div className="space-y-2">
                        {(preview.assistant?.diffPreview?.changedCells ?? []).map((change) => (
                          <div key={change.ref} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                            <div className="font-semibold">
                              {change.ref}
                              {change.sectionName ? ` • ${change.sectionName}` : ""}
                            </div>
                            <div className="mt-1 text-[var(--text-secondary)]">
                              {change.beforeFormattingSummary !== change.afterFormattingSummary &&
                              (change.beforeFormattingSummary || change.afterFormattingSummary)
                                ? `${change.beforeFormattingSummary ?? "no formatting"} to ${change.afterFormattingSummary ?? "no formatting"}`
                                : `${change.beforeValue || change.beforeFormula ? `"${change.beforeValue || change.beforeFormula}"` : "blank"} to ${change.afterValue || change.afterFormula ? `"${change.afterValue || change.afterFormula}"` : "blank"}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(preview.assistant?.diffPreview?.formattingChanges ?? []).length > 0 ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Formatting changes
                      </div>
                      <div className="space-y-2">
                        {(preview.assistant?.diffPreview?.formattingChanges ?? []).map((change) => (
                          <div key={`format-${change.ref}`} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                            <div className="font-semibold">
                              {change.ref}
                              {change.sectionName ? ` • ${change.sectionName}` : ""}
                            </div>
                            <div className="mt-1 text-[var(--text-secondary)]">
                              {change.beforeFormattingSummary ?? "no formatting"} to {change.afterFormattingSummary ?? "no formatting"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(preview.assistant?.diffPreview?.insertedRows ?? []).length > 0 ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Inserted rows
                      </div>
                      <div className="space-y-2">
                        {(preview.assistant?.diffPreview?.insertedRows ?? []).map((row) => (
                          <div key={`row-${row.row}`} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                            <div className="font-semibold">
                              Row {row.row}
                              {row.sectionName ? ` • ${row.sectionName}` : ""}
                            </div>
                            <div className="mt-1 text-[var(--text-secondary)]">
                              {row.values.length > 0 ? row.values.join(" • ") : "New blank row content"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(preview.assistant?.diffPreview?.formulaChanges ?? []).length > 0 ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        Formula changes
                      </div>
                      <div className="space-y-2">
                        {(preview.assistant?.diffPreview?.formulaChanges ?? []).map((change) => (
                          <div key={`formula-${change.ref}`} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-primary)]">
                            <div className="font-semibold">{change.ref}</div>
                            <div className="mt-1 text-[var(--text-secondary)]">
                              {change.beforeFormula || "blank"} to {change.afterFormula || "blank"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(preview.assistant?.operations ?? []).some((operation) => operation.rationale) ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        AI rationale
                      </div>
                      <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                        {(preview.assistant?.operations ?? [])
                          .filter((operation) => operation.rationale && operation.rationale.trim().length > 0)
                          .map((operation, index) => (
                            <li key={`${operation.type}-${index}`} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2">
                              {operation.rationale}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Prompt highlights
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {preview.compactOutput.promptHighlights.length > 0 ? (
                        preview.compactOutput.promptHighlights.map((highlight) => (
                          <span
                            key={highlight}
                            className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                          >
                            {highlight}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">No prompt highlights captured.</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                      Memory support
                    </div>
                    {preview.matchedMemory ? (
                      <div className="space-y-1 text-sm text-[var(--text-primary)]">
                        <div className="font-medium">{preview.matchedMemory.title}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{preview.matchedMemory.summary}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--text-secondary)]">
                        No strong organization memory match was found for this request.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-white px-4 py-5 text-sm text-[var(--text-secondary)]">
                  Answers, proposed worksheet changes, and memory support will appear here after Ask AI responds.
                </div>
              )}
            </div>
          </div>

          {preview ? (
            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ask follow-up</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Clarify assumptions, challenge findings, or ask the AI to revise this review. The next response will use the current worksheet plus this review context.
                </p>
              </div>
              <div className="mt-3 space-y-3">
                <textarea
                  value={followUpPrompt}
                  onChange={(event) => onFollowUpPromptChange(event.target.value)}
                  disabled={isBusy}
                  placeholder="Example: This wall is not acoustic rated, so remove any acoustic-related suggestions."
                  className="min-h-[112px] w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[var(--text-secondary)]">
                    Accepted and rejected findings are included so the next review can revise rather than restart.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onSubmitFollowUp}
                    disabled={isBusy || followUpPrompt.trim().length === 0}
                  >
                    {isSubmittingFollowUp ? "Revising review..." : "Ask follow-up"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--text-secondary)]">
            {isAnswerOnly
              ? "This response is advice only. Closing it will not change or save the current worksheet."
              : "Applying a preview updates the current worksheet locally and marks it as unsaved. You can still review and save manually afterward."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReject}
              disabled={isBusy || !preview}
              className="border-[var(--border)]"
            >
              {isSubmittingReview ? "Updating..." : "Reject"}
            </Button>
            <Button
              type="button"
              onClick={onApply}
              disabled={isBusy || !preview || !canApply || hasBlockingWarning}
              className="h-10 rounded-[8px] px-4 text-sm font-medium"
            >
              {isSubmittingReview ? (isAnswerOnly ? "Closing..." : "Applying...") : applyLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
