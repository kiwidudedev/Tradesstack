"use client";

import { useMemo, useState } from "react";
import { ibmPlexSans } from "@/lib/fonts";

export type ReviewWorkTypeOption = {
  workType: string;
  codePrefix: string | null;
};

type ReviewEditorFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  costItemId: string;
  initialWorkType: string;
  initialCostType: string;
  initialCostCode: string;
  workTypeOptions: ReviewWorkTypeOption[];
  costTypeOptions: string[];
};

function buildCostCode(codePrefix: string | null | undefined, costType: string): string {
  if (!codePrefix || !costType) {
    return "";
  }

  return `${codePrefix}.${costType}`;
}

export function ReviewEditorForm({
  action,
  cancelHref,
  costItemId,
  initialWorkType,
  initialCostType,
  initialCostCode,
  workTypeOptions,
  costTypeOptions,
}: ReviewEditorFormProps) {
  const [workType, setWorkType] = useState(initialWorkType);
  const [costType, setCostType] = useState(initialCostType);
  const [costCode, setCostCode] = useState(initialCostCode);

  const selectedWorkType = useMemo(
    () => workTypeOptions.find((option) => option.workType === workType) ?? null,
    [workType, workTypeOptions]
  );

  const hasCodePrefix = Boolean(selectedWorkType?.codePrefix);
  const resolvedCostCode = hasCodePrefix ? buildCostCode(selectedWorkType?.codePrefix, costType) : costCode;

  return (
    <form action={action} className="rounded-[12px] border border-[var(--warning-light)] bg-[var(--surface)] p-4">
      <input type="hidden" name="costItemId" value={costItemId} />
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
            Work Type
          </span>
          <select
            name="workType"
            value={workType}
            onChange={(event) => setWorkType(event.target.value)}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
          >
            {workTypeOptions.map((option) => (
              <option key={option.workType} value={option.workType}>
                {option.workType}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
            Cost Type
          </span>
          <select
            name="costType"
            value={costType}
            onChange={(event) => setCostType(event.target.value)}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
          >
            {costTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
            Cost Code
          </span>
          <input
            type="text"
            name="costCode"
            value={resolvedCostCode}
            readOnly={hasCodePrefix}
            onChange={(event) => setCostCode(event.target.value)}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none ${hasCodePrefix ? "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-secondary)]" : ""}`}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[var(--navy-primary)] bg-[var(--navy-primary)] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:opacity-95`}
        >
          Save Review
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
