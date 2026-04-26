import { AlertTriangle, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import type { QualityIssueStats } from "@/lib/quality-assurance/types";

interface QualityKpiCardsProps {
  issueStats: QualityIssueStats;
}

export function QualityKpiCards({ issueStats }: QualityKpiCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-rose-50">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Open Issues</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.openCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-rose-500`}>Require Attention</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-indigo-50">
            <CalendarClock className="h-5 w-5 text-indigo-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Inspections Today</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.inspectionsToday}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#4B5D79]`}>Scheduled For Today</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-amber-50">
            <Clock3 className="h-5 w-5 text-amber-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Overdue QA Items</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.overdueCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-amber-600`}>Past Due Date</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-emerald-50">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Completed This Week</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.completeCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-emerald-600`}>Issues Resolved</p>
      </div>
    </div>
  );
}
