import { Camera, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { isOverdue, statusTone } from "@/lib/quality-assurance/helpers";
import type { IssueStatus, QualityIssue } from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";
import { QualityEmptyState } from "./QualityEmptyState";

interface QualityIssuesTabProps {
  issueSearch: string;
  setIssueSearch: (value: string) => void;
  issueStatusFilter: string;
  setIssueStatusFilter: (value: string) => void;
  issueDueFilter: string;
  setIssueDueFilter: (value: string) => void;
  issueTradeFilter: string;
  setIssueTradeFilter: (value: string) => void;
  issueAssigneeFilter: string;
  setIssueAssigneeFilter: (value: string) => void;
  issueLocationFilter: string;
  setIssueLocationFilter: (value: string) => void;
  issueTradeOptions: string[];
  issueAssigneeOptions: string[];
  issueLocationOptions: string[];
  filteredIssues: QualityIssue[];
  issuePhotoCoverMap: Map<string, string>;
  issuePhotoCountMap: Map<string, number>;
  onResetFilters: () => void;
  onSelectIssue: (issueId: string) => void;
  onStatusChange: (issueId: string, status: IssueStatus) => void;
}

export function QualityIssuesTab(props: QualityIssuesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <Input
            value={props.issueSearch}
            onChange={(event) => props.setIssueSearch(event.target.value)}
            placeholder="Search issues..."
            className="h-10 rounded-[12px] border-[#D9E3EE] bg-white pl-11 text-[14px]"
          />
        </div>
        <select value={props.issueStatusFilter} onChange={(event) => props.setIssueStatusFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">All Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Blocked">Blocked</option>
          <option value="Requires Attention">Requires Attention</option>
          <option value="Complete">Complete</option>
          <option value="Verified">Verified</option>
        </select>
        <select value={props.issueDueFilter} onChange={(event) => props.setIssueDueFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">Due Date</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
        <select value={props.issueTradeFilter} onChange={(event) => props.setIssueTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.issueTradeOptions.map((trade) => (
            <option key={trade} value={trade}>
              {trade === "All" ? "Trade" : trade}
            </option>
          ))}
        </select>
        <select value={props.issueAssigneeFilter} onChange={(event) => props.setIssueAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.issueAssigneeOptions.map((assignee) => (
            <option key={assignee} value={assignee}>
              {assignee === "All" ? "People" : assignee}
            </option>
          ))}
        </select>
        <select value={props.issueLocationFilter} onChange={(event) => props.setIssueLocationFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.issueLocationOptions.map((location) => (
            <option key={location} value={location}>
              {location === "All" ? "Location" : location}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-10 rounded-[12px] border border-[#D9E3EE] bg-white px-4 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Issues</h3>
        </div>
        {props.filteredIssues.length === 0 ? (
          <QualityEmptyState title="No issues yet" description="Add your first issue to track defects and quality items." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_120px_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,1fr)_140px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Issue", "Priority", "Status", "Trade / Area", "Assignee", "Due Date"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>

            <div>
              {props.filteredIssues.map((issue) => {
                const leadPhoto = props.issuePhotoCoverMap.get(issue.id) ?? "";
                const photoCount = props.issuePhotoCountMap.get(issue.id) ?? 0;
                const overdue = isOverdue(issue.dueDate, issue.status);

                return (
                  <div
                    key={issue.id}
                    className={cn("grid grid-cols-[minmax(260px,1.8fr)_120px_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,1fr)_140px] items-center border-b border-[#EEF3F8] px-5 py-4 last:border-b-0", overdue ? "bg-[#FFF6F6]" : "bg-white")}
                  >
                    <button type="button" onClick={() => props.onSelectIssue(issue.id)} className="flex min-w-0 items-center gap-3 pr-4 text-left">
                      <div className="h-10 w-10 overflow-hidden rounded-[10px] border border-[#E2E8F1] bg-[#F8FAFC]">
                        {leadPhoto ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={leadPhoto} alt={issue.title} className="h-full w-full object-cover" />
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[#64748B]">
                            <Camera className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{issue.title}</p>
                        <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>
                          {photoCount} photo{photoCount === 1 ? "" : "s"} • {issue.location || "No location"}
                        </p>
                      </div>
                    </button>

                    <div>
                      <span className="inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]">
                        {issue.priority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pr-4">
                      <select
                        value={issue.status}
                        onChange={(event) => props.onStatusChange(issue.id, event.target.value as IssueStatus)}
                        className={`${interMedium.className} h-9 min-w-[108px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[13px] text-[#0F172A]`}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Requires Attention">Requires Attention</option>
                        <option value="Complete">Complete</option>
                        <option value="Verified">Verified</option>
                      </select>
                      <span className={`${interMedium.className} inline-flex rounded-full border px-3 py-1 text-[12px] font-medium ${statusTone(issue.status)}`}>
                        {issue.status}
                      </span>
                    </div>

                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>
                      {[issue.trade || "No trade", issue.area || issue.location || "No area"].join(" / ")}
                    </p>
                    <div className="flex items-center gap-2 pr-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F74917] text-[12px] font-semibold text-white">
                        {(issue.assignee || "U").slice(0, 1).toUpperCase()}
                      </span>
                      <p className={`${interMedium.className} truncate text-[13px] text-[#0F172A]`}>{issue.assignee || "Unassigned"}</p>
                    </div>
                    <div>
                      <p className={cn(`${interMedium.className} text-[13px]`, overdue ? "font-semibold text-[#FF3B30]" : "text-[#0F172A]")}>
                        {issue.dueDate || "No due date"}
                      </p>
                      {overdue ? <p className={`${interMedium.className} mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#B91C1C]`}>Overdue</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
