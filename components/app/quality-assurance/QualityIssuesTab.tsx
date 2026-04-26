import { Camera } from "lucide-react";
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
    <div className="space-y-3">
      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-[2fr_1fr_1fr]">
        <Input value={props.issueSearch} onChange={(event) => props.setIssueSearch(event.target.value)} className="h-9 border-[#CBD5E1]" />
        <select value={props.issueStatusFilter} onChange={(event) => props.setIssueStatusFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Blocked">Blocked</option>
          <option value="Requires Attention">Requires Attention</option>
          <option value="Complete">Complete</option>
          <option value="Verified">Verified</option>
        </select>
        <select value={props.issueDueFilter} onChange={(event) => props.setIssueDueFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Due Dates</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
      </div>

      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-4">
        <select value={props.issueTradeFilter} onChange={(event) => props.setIssueTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.issueTradeOptions.map((trade) => (
            <option key={trade} value={trade}>
              {trade}
            </option>
          ))}
        </select>
        <select value={props.issueAssigneeFilter} onChange={(event) => props.setIssueAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.issueAssigneeOptions.map((assignee) => (
            <option key={assignee} value={assignee}>
              {assignee}
            </option>
          ))}
        </select>
        <select value={props.issueLocationFilter} onChange={(event) => props.setIssueLocationFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.issueLocationOptions.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-9 border-[#CBD5E1] bg-white text-[#334155]">
          Reset Filters
        </Button>
      </div>

      {props.filteredIssues.length === 0 ? <QualityEmptyState title="No issues yet" description="Add your first issue to track defects and quality items." /> : null}

      {props.filteredIssues.map((issue) => {
        const leadPhoto = props.issuePhotoCoverMap.get(issue.id) ?? "";
        const photoCount = props.issuePhotoCountMap.get(issue.id) ?? 0;
        const overdue = isOverdue(issue.dueDate, issue.status);
        return (
          <div
            key={issue.id}
            onClick={() => props.onSelectIssue(issue.id)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between rounded-[8px] border bg-white px-3 py-3 text-left transition-colors hover:bg-[#F8FAFC]",
              overdue ? "border-rose-200" : "border-[#E6EAF0]"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-9 w-9 overflow-hidden rounded-[6px] bg-[#E2E8F0]">
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
                <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{issue.title}</p>
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                  {issue.trade} • {issue.location}
                </p>
              </div>
            </div>
            <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
              {issue.dueDate ? (
                <span
                  className={cn(
                    `${interMedium.className} rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]`,
                    overdue ? "border-rose-200 bg-rose-100 text-rose-700" : "border-[#CBD5E1] bg-white text-[#475569]"
                  )}
                >
                  {overdue ? "Overdue" : `Due ${issue.dueDate}`}
                </span>
              ) : null}
              <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                {issue.priority}
              </span>
              {photoCount > 0 ? (
                <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                  {photoCount} photo{photoCount === 1 ? "" : "s"}
                </span>
              ) : null}
              <select
                value={issue.status}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => props.onStatusChange(issue.id, event.target.value as IssueStatus)}
                className={`${interMedium.className} h-8 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-xs text-[#1E293B]`}
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Blocked">Blocked</option>
                <option value="Requires Attention">Requires Attention</option>
                <option value="Complete">Complete</option>
                <option value="Verified">Verified</option>
              </select>
              <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusTone(issue.status)}`}>
                {issue.status}
              </span>
              <span className={`${interMedium.className} flex h-7 w-7 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-semibold text-[#1D4ED8]`}>
                {(issue.assignee || "U").slice(0, 1).toUpperCase()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
