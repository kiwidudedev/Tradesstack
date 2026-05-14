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
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={2} />
          <Input
            value={props.issueSearch}
            onChange={(event) => props.setIssueSearch(event.target.value)}
            placeholder="Search issues..."
            size="toolbar"
            className="pl-11"
          />
        </div>
        <select value={props.issueStatusFilter} onChange={(event) => props.setIssueStatusFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="All">All Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Blocked">Blocked</option>
          <option value="Requires Attention">Requires Attention</option>
          <option value="Complete">Complete</option>
          <option value="Verified">Verified</option>
        </select>
        <select value={props.issueDueFilter} onChange={(event) => props.setIssueDueFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="All">Due Date</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
        <select value={props.issueTradeFilter} onChange={(event) => props.setIssueTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.issueTradeOptions.map((trade) => (
            <option key={trade} value={trade}>
              {trade === "All" ? "Trade" : trade}
            </option>
          ))}
        </select>
        <select value={props.issueAssigneeFilter} onChange={(event) => props.setIssueAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.issueAssigneeOptions.map((assignee) => (
            <option key={assignee} value={assignee}>
              {assignee === "All" ? "People" : assignee}
            </option>
          ))}
        </select>
        <select value={props.issueLocationFilter} onChange={(event) => props.setIssueLocationFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.issueLocationOptions.map((location) => (
            <option key={location} value={location}>
              {location === "All" ? "Location" : location}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="toolbar" onClick={props.onResetFilters} className="px-4 font-semibold text-[var(--text-secondary)]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[var(--text-primary)]`}>Issues</h3>
        </div>
        {props.filteredIssues.length === 0 ? (
          <QualityEmptyState title="No issues yet" description="Add your first issue to track defects and quality items." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_120px_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,1fr)_140px] border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              {["Issue", "Priority", "Status", "Trade / Area", "Assignee", "Due Date"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
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
                    className={cn("grid grid-cols-[minmax(260px,1.8fr)_120px_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,1fr)_140px] items-center border-b border-[var(--border-subtle)] px-5 py-4 last:border-b-0", overdue ? "bg-[var(--error-light)]" : "bg-[var(--surface)]")}
                  >
                    <button type="button" onClick={() => props.onSelectIssue(issue.id)} className="flex min-w-0 items-center gap-3 pr-4 text-left">
                      <div className="h-10 w-10 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)]">
                        {leadPhoto ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={leadPhoto} alt={issue.title} className="h-full w-full object-cover" />
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--text-secondary)]">
                            <Camera className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{issue.title}</p>
                        <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[var(--text-secondary)]`}>
                          {photoCount} photo{photoCount === 1 ? "" : "s"} • {issue.location || "No location"}
                        </p>
                      </div>
                    </button>

                    <div>
                      <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]">
                        {issue.priority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pr-4">
                      <select
                        value={issue.status}
                        onChange={(event) => props.onStatusChange(issue.id, event.target.value as IssueStatus)}
                        className={`${interMedium.className} h-9 min-w-[108px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)]`}
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

                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[var(--text-primary)]`}>
                      {[issue.trade || "No trade", issue.area || issue.location || "No area"].join(" / ")}
                    </p>
                    <div className="flex items-center gap-2 pr-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-[12px] font-semibold text-white">
                        {(issue.assignee || "U").slice(0, 1).toUpperCase()}
                      </span>
                      <p className={`${interMedium.className} truncate text-[13px] text-[var(--text-primary)]`}>{issue.assignee || "Unassigned"}</p>
                    </div>
                    <div>
                      <p className={cn(`${interMedium.className} text-[13px]`, overdue ? "font-semibold text-[var(--error)]" : "text-[var(--text-primary)]")}>
                        {issue.dueDate || "No due date"}
                      </p>
                      {overdue ? <p className={`${interMedium.className} mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--error)]`}>Overdue</p> : null}
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
