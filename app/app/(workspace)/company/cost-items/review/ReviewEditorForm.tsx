"use client";

import { ibmPlexSans } from "@/lib/fonts";
import { listTradesstackFinancialRoutingCodes } from "@/lib/tradesstack-financial-routing";

type ReviewEditorFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  entityType: "cost_item" | "organization_material";
  entityId: string;
  initialTradesstackCostCode: string;
  constructionIntelligenceSummary?: string | null;
};

export function ReviewEditorForm({
  action,
  cancelHref,
  entityType,
  entityId,
  initialTradesstackCostCode,
  constructionIntelligenceSummary,
}: ReviewEditorFormProps) {
  return (
    <form action={action} className="rounded-[12px] border border-[var(--warning-light)] bg-[var(--surface)] p-4">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
            TradesStack Routing Code
          </span>
          <select
            name="tradesstackCostCode"
            defaultValue={initialTradesstackCostCode}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
          >
            {listTradesstackFinancialRoutingCodes().map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
            Resolution
          </span>
          <select
            name="resolutionMode"
            defaultValue="resolve"
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
          >
            <option value="resolve">Resolve review</option>
            <option value="mark_others">Mark as 800 Others</option>
          </select>
        </label>
      </div>
      {constructionIntelligenceSummary ? (
        <div className="mt-4 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
          <div className={`${ibmPlexSans.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
            Construction Intelligence
          </div>
          <p className="mt-1 text-sm text-[var(--text-primary)]">{constructionIntelligenceSummary}</p>
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[var(--navy-primary)] bg-[var(--navy-primary)] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:opacity-95`}
        >
          Save Routing Review
        </button>
        <a
          href={cancelHref}
          className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`}
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
