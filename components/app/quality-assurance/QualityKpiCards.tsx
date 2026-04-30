import { AlertTriangle, ClipboardCheck, FileCheck2 } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import type { QualityIssueStats } from "@/lib/quality-assurance/types";

interface QualityKpiCardsProps {
  issueStats: QualityIssueStats;
}

export function QualityKpiCards({ issueStats }: QualityKpiCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[#D9E3EE] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-emerald-50">
            <AlertTriangle className="h-5 w-5 text-emerald-600" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Work Logged</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.workProofCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-emerald-600`}>{issueStats.workProofsCompleted} marked complete</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[#D9E3EE] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-rose-50">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Open Issues</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.openCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-rose-500`}>Need resolution</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[#D9E3EE] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-amber-50">
            <ClipboardCheck className="h-5 w-5 text-amber-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Pending Sign-Offs</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.pendingSignoffs}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-amber-600`}>Awaiting approval</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[#D9E3EE] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-sky-50">
            <FileCheck2 className="h-5 w-5 text-emerald-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Completed Work Without Sign-Off</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.completedWithoutSignoff}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-emerald-600`}>Ready to request</p>
      </div>
    </div>
  );
}
