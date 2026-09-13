"use client";

import { useEffect } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";
import type { PricingWorksheetAiAssistantPreview, PricingWorksheetAiContinuationPlan } from "@/lib/ai-pricing-worksheet-edit-assistant";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type {
  PricingWorksheetAiEvidenceSource,
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

export type PricingWorksheetAiPreviewSummary = PricingWorksheetAiAssistantPreview["compactOutput"];

export type PricingWorksheetAiMatchedMemory = {
  id: string;
  title: string;
  summary: string;
};

export type PricingWorksheetAiContextSummary = PricingWorksheetAiAssistantPreview["contextSummary"];

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

export type PricingWorksheetAiPreviewContinuation = PricingWorksheetAiContinuationPlan;

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
    continuation?: PricingWorksheetAiPreviewContinuation | null;
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
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isGenerating) {
        return;
      }

      event.preventDefault();
      onOpenChange(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isGenerating, onOpenChange, open]);

  if (!open) {
    return null;
  }

  const previewAssistant = preview?.assistant ?? null;
  const hasPreview = Boolean(preview);
  const reviewTitle = previewAssistant?.mode === "answer_only" ? "Answer Ready" : "Review Ready";
  const reviewDescription =
    previewAssistant?.mode === "answer_only"
      ? "Your AI answer is ready. Continue to the worksheet panel to read it and respond."
      : "Your AI review is ready in the worksheet side panel. Continue there to approve, reject, or follow up.";

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-[450] flex items-center justify-center px-4 py-6"
    >
      <button
        type="button"
        aria-label="Close Ask AI"
        className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.48)]"
        onClick={() => {
          if (!isGenerating) {
            onOpenChange(false);
          }
        }}
      />
      <div className="relative z-[451] w-[96vw] max-w-[520px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <div className="border-b border-[var(--border)] px-6 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--primary)]/10 text-[var(--primary)]">
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="text-[18px] font-semibold tracking-[-0.01em]">
                Ask AI
              </div>
              <div className="text-[13px] text-[var(--text-secondary)]">
                Describe what you need. AI will build it into the sheet
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
          {!error && jobError?.message && (jobStatus === "failed" || jobStatus === "cancelled") ? (
            <OperationalAlert variant={jobError.retryable ? "warning" : "error"}>
              {jobError.message}
            </OperationalAlert>
          ) : null}

          {hasPreview && !isGenerating ? (
            <div className="space-y-4">
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
                <div className="text-[15px] font-semibold text-[var(--text-primary)]">
                  {reviewTitle}
                </div>
                <p className="mt-1 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
                  {reviewDescription}
                </p>
                {previewAssistant?.summary ? (
                  <p className="mt-3 text-[13px] leading-[1.6] text-[var(--text-primary)]">
                    {previewAssistant.summary}
                  </p>
                ) : null}
                {previewAssistant && previewAssistant.mode !== "answer_only" ? (
                  <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
                    {canApply
                      ? "You can review and approve the worksheet changes from the side panel."
                      : "The side panel is open for review, but applying worksheet edits may still be blocked."}
                  </p>
                ) : null}
              </div>

              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isSubmittingReview}
                className="h-11 w-full rounded-[10px] text-sm font-semibold"
              >
                {isSubmittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Continue To Review Panel
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  What do you need?
                </label>
                <textarea
                  value={prompt}
                  onChange={(event) => onPromptChange(event.target.value)}
                  disabled={isGenerating}
                  placeholder="e.g. Build me a pricing sheet for GIB plasterboard ceilings with material and labour."
                  className="min-h-[132px] w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)]">
                    Worksheet name
                  </span>
                  <input
                    value={previewWorksheetName}
                    onChange={(event) => onPreviewWorksheetNameChange(event.target.value)}
                    disabled={isGenerating}
                    className="h-11 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)]">
                    Trade package
                  </span>
                  <input
                    value={previewTradePackage}
                    onChange={(event) => onPreviewTradePackageChange(event.target.value)}
                    disabled={isGenerating}
                    placeholder="Optional"
                    className="h-11 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>

              <Button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating || previewWorksheetName.trim().length === 0}
                className="h-11 w-full rounded-[10px] text-sm font-semibold"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {isGenerating ? (jobProgressLabel ?? "Thinking…") : jobError?.retryable ? "Retry" : "Ask AI"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
