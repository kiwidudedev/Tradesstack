import { interMedium } from "@/lib/fonts";
import { formatTimestamp } from "@/lib/quality-assurance/helpers";
import type { LinkedTask, QualityInspection, QualityIssue, QualityIssueStats } from "@/lib/quality-assurance/types";
import { QualityEmptyState } from "./QualityEmptyState";

interface QualityOverviewTabProps {
  issueStats: QualityIssueStats;
  issues: QualityIssue[];
  inspections: QualityInspection[];
  todoLinks: LinkedTask[];
}

export function QualityOverviewTab({ issueStats, issues, inspections, todoLinks }: QualityOverviewTabProps) {
  const openTodoLinks = todoLinks.filter((item) => !item.is_completed);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Issues by Status</p>
        <div className="h-3 overflow-hidden rounded-full bg-[#E2E8F0]">
          <div className="flex h-full w-full">
            <div className="bg-[#DC2626]" style={{ width: `${(issueStats.openCount / Math.max(issues.length, 1)) * 100}%` }} />
            <div className="bg-[#D97706]" style={{ width: `${(issueStats.inProgressCount / Math.max(issues.length, 1)) * 100}%` }} />
            <div className="bg-[#15803D]" style={{ width: `${(issueStats.completeCount / Math.max(issues.length, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Recent Activity</h3>
        </div>
        {issues.length === 0 ? (
          <QualityEmptyState title="No recent QA activity" description="Issue activity will appear here once the team starts tracking work." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_140px_180px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Activity", "Status", "Updated"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>
            <div>
              {issues.slice(0, 5).map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(260px,1.8fr)_140px_180px] items-center border-b border-[#EEF3F8] px-5 py-4 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{item.title}</p>
                    <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>{item.location || "No location"}</p>
                  </div>
                  <div>
                    <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>
                      {item.status}
                    </span>
                  </div>
                  <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>{formatTimestamp(item.updatedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Upcoming Inspections</h3>
        </div>
        {inspections.length === 0 ? (
          <QualityEmptyState title="No inspections scheduled" description="Upcoming inspections will show here once they are created." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(240px,1.8fr)_minmax(130px,0.8fr)_180px_180px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Inspection", "Trade", "Scheduled", "Assignee"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>
            <div>
              {inspections.slice(0, 5).map((inspection) => (
                <div key={inspection.id} className="grid grid-cols-[minmax(240px,1.8fr)_minmax(130px,0.8fr)_180px_180px] items-center border-b border-[#EEF3F8] px-5 py-4 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{inspection.title}</p>
                    <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>{inspection.location || "No location"}</p>
                  </div>
                  <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>{inspection.trade || "No trade"}</p>
                  <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>{formatTimestamp(inspection.scheduledAt)}</p>
                  <p className={`${interMedium.className} truncate text-[13px] text-[#0F172A]`}>{inspection.assignee || "Unassigned"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Linked Tasks</h3>
        </div>
        {openTodoLinks.length === 0 ? (
          <QualityEmptyState title="No open linked tasks" description="Tasks created from QA items will appear here while they are still active." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(280px,1.8fr)_160px_140px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Task", "Linked From", "Status"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>
            <div>
              {openTodoLinks.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(280px,1.8fr)_160px_140px] items-center border-b border-[#EEF3F8] px-5 py-4 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{item.title}</p>
                  </div>
                  <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>{item.source_type === "quality_issue" ? "Issue" : "Inspection Fail"}</p>
                  <div>
                    <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>
                      Open
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
