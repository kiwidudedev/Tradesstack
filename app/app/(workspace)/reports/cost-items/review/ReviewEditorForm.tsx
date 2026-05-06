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
    <form action={action} className="rounded-[12px] border border-[#F3D7C8] bg-white p-4">
      <input type="hidden" name="costItemId" value={costItemId} />
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
            Work Type
          </span>
          <select
            name="workType"
            value={workType}
            onChange={(event) => setWorkType(event.target.value)}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#1d1d1d] outline-none`}
          >
            {workTypeOptions.map((option) => (
              <option key={option.workType} value={option.workType}>
                {option.workType}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
            Cost Type
          </span>
          <select
            name="costType"
            value={costType}
            onChange={(event) => setCostType(event.target.value)}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#1d1d1d] outline-none`}
          >
            {costTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
            Cost Code
          </span>
          <input
            type="text"
            name="costCode"
            value={resolvedCostCode}
            readOnly={hasCodePrefix}
            onChange={(event) => setCostCode(event.target.value)}
            className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#1d1d1d] outline-none ${hasCodePrefix ? "cursor-not-allowed bg-[#F8FAFB] text-[#64748B]" : ""}`}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#0B2739] bg-[#0B2739] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:opacity-95`}
        >
          Save Review
        </button>
        <a
          href={cancelHref}
          className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
