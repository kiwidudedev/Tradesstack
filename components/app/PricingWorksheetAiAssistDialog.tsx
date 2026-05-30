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
  PricingWorksheetAiContinuationPlan,
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
  prompt,
  previewWorksheetName,
  previewTradePackage,
  isGenerating,
  jobStatus,
  jobProgressLabel,
  jobError,
  error,
  onOpenChange,
  onPromptChange,
  onPreviewWorksheetNameChange,
  onPreviewTradePackageChange,
  onGenerate,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[520px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <DialogHeader className="border-b border-[var(--border)] px-6 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--primary)]/10 text-[var(--primary)]">
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[18px] font-semibold tracking-[-0.01em]">
                Ask AI
              </DialogTitle>
              <DialogDescription className="text-[13px] text-[var(--text-secondary)]">
                Describe what you need. AI will build it into the sheet
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
          {!error && jobError?.message && (jobStatus === "failed" || jobStatus === "cancelled") ? (
            <OperationalAlert variant={jobError.retryable ? "warning" : "error"}>
              {jobError.message}
            </OperationalAlert>
          ) : null}

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
