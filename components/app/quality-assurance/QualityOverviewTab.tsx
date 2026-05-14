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
        <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]`}>Issues by Status</p>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="flex h-full w-full">
            <div className="bg-[var(--error)]" style={{ width: `${(issueStats.openCount / Math.max(issues.length, 1)) * 100}%` }} />
            <div className="bg-[var(--warning)]" style={{ width: `${(issueStats.inProgressCount / Math.max(issues.length, 1)) * 100}%` }} />
            <div className="bg-[var(--success)]" style={{ width: `${(issueStats.completeCount / Math.max(issues.length, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[var(--text-primary)]`}>Recent Activity</h3>
        </div>
        {issues.length === 0 ? (
          <QualityEmptyState title="No recent QA activity" description="Issue activity will appear here once the team starts tracking work." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_140px_180px] border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              {["Activity", "Status", "Updated"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                  {heading}
                </p>
              ))}
            </div>
            <div>
              {issues.slice(0, 5).map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(260px,1.8fr)_140px_180px] items-center border-b border-[var(--border-subtle)] px-5 py-4 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{item.title}</p>
                    <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[var(--text-secondary)]`}>{item.location || "No location"}</p>
                  </div>
                  <div>
                    <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>
                      {item.status}
                    </span>
                  </div>
                  <p className={`${interMedium.className} text-[13px] text-[var(--text-primary)]`}>{formatTimestamp(item.updatedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[var(--text-primary)]`}>Upcoming Inspections</h3>
        </div>
        {inspections.length === 0 ? (
          <QualityEmptyState title="No inspections scheduled" description="Upcoming inspections will show here once they are created." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
            <div className="grid grid-cols-[minmax(240px,1.8fr)_minmax(130px,0.8fr)_180px_180px] border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              {["Inspection", "Trade", "Scheduled", "Assignee"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                  {heading}
                </p>
              ))}
            </div>
            <div>
              {inspections.slice(0, 5).map((inspection) => (
                <div key={inspection.id} className="grid grid-cols-[minmax(240px,1.8fr)_minmax(130px,0.8fr)_180px_180px] items-center border-b border-[var(--border-subtle)] px-5 py-4 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{inspection.title}</p>
                    <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[var(--text-secondary)]`}>{inspection.location || "No location"}</p>
                  </div>
                  <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[var(--text-primary)]`}>{inspection.trade || "No trade"}</p>
                  <p className={`${interMedium.className} text-[13px] text-[var(--text-primary)]`}>{formatTimestamp(inspection.scheduledAt)}</p>
                  <p className={`${interMedium.className} truncate text-[13px] text-[var(--text-primary)]`}>{inspection.assignee || "Unassigned"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[var(--text-primary)]`}>Linked Tasks</h3>
        </div>
        {openTodoLinks.length === 0 ? (
          <QualityEmptyState title="No open linked tasks" description="Tasks created from QA items will appear here while they are still active." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
            <div className="grid grid-cols-[minmax(280px,1.8fr)_160px_140px] border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              {["Task", "Linked From", "Status"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                  {heading}
                </p>
              ))}
            </div>
            <div>
              {openTodoLinks.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(280px,1.8fr)_160px_140px] items-center border-b border-[var(--border-subtle)] px-5 py-4 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{item.title}</p>
                  </div>
                  <p className={`${interMedium.className} text-[13px] text-[var(--text-primary)]`}>{item.source_type === "quality_issue" ? "Issue" : "Inspection Fail"}</p>
                  <div>
                    <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>
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
