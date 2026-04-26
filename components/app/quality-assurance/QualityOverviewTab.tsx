import { Badge } from "@/components/ui/badge";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp } from "@/lib/quality-assurance/helpers";
import type { LinkedTask, QualityInspection, QualityIssue, QualityIssueStats } from "@/lib/quality-assurance/types";

interface QualityOverviewTabProps {
  issueStats: QualityIssueStats;
  issues: QualityIssue[];
  inspections: QualityInspection[];
  todoLinks: LinkedTask[];
}

export function QualityOverviewTab({ issueStats, issues, inspections, todoLinks }: QualityOverviewTabProps) {
  return (
    <div className="space-y-5">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-4">
          <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Recent Activity</p>
          <div className="mt-3 space-y-2">
            {issues.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{item.title}</p>
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                  {item.status} • {formatTimestamp(item.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-4">
          <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Upcoming Inspections</p>
          <div className="mt-3 space-y-2">
            {inspections.map((group) => (
              <div key={group.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{group.title}</p>
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>{formatTimestamp(group.scheduledAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-4">
        <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Linked Tasks</p>
        <div className="mt-3 space-y-2">
          {todoLinks.filter((item) => !item.is_completed).length === 0 ? (
            <p className={`${interMedium.className} text-xs text-[#64748B]`}>No open QA-linked tasks right now.</p>
          ) : (
            todoLinks
              .filter((item) => !item.is_completed)
              .map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{item.title}</p>
                  <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">
                    {item.source_type === "quality_issue" ? "Issue" : "Inspection Fail"}
                  </Badge>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
