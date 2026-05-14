import { AlertTriangle, ClipboardCheck, FileCheck2 } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import type { QualityIssueStats } from "@/lib/quality-assurance/types";

interface QualityKpiCardsProps {
  issueStats: QualityIssueStats;
}

export function QualityKpiCards({ issueStats }: QualityKpiCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card-elevated)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--kpi-bg-sage)]">
            <AlertTriangle className="h-5 w-5 text-[var(--kpi-fg-sage)]" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Work Logged</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{issueStats.workProofCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-sage)]`}>{issueStats.workProofsCompleted} marked complete</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card-elevated)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--kpi-bg-red)]">
            <AlertTriangle className="h-5 w-5 text-[var(--kpi-fg-red)]" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Open Issues</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{issueStats.openCount}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-red)]`}>Need resolution</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card-elevated)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--kpi-bg-amber)]">
            <ClipboardCheck className="h-5 w-5 text-[var(--kpi-fg-orange)]" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Pending Sign-Offs</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{issueStats.pendingSignoffs}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-orange)]`}>Awaiting approval</p>
      </div>
      <div className="flex min-h-[160px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card-elevated)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--kpi-bg-navy)]">
            <FileCheck2 className="h-5 w-5 text-[var(--kpi-fg-navy)]" />
          </span>
          <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Completed Work Without Sign-Off</p>
        </div>
        <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{issueStats.completedWithoutSignoff}</p>
        <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-navy)]`}>Ready to request</p>
      </div>
    </div>
  );
}
