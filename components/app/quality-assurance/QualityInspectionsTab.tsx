import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { getInspectionProgress, getInspectionStatus, inspectionStatusTone } from "@/lib/quality-assurance/helpers";
import type { QualityInspection } from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";
import { QualityEmptyState } from "./QualityEmptyState";

interface QualityInspectionsTabProps {
  inspectionSearch: string;
  setInspectionSearch: (value: string) => void;
  inspectionStatusFilter: string;
  setInspectionStatusFilter: (value: string) => void;
  inspectionDueFilter: string;
  setInspectionDueFilter: (value: string) => void;
  inspectionTradeFilter: string;
  setInspectionTradeFilter: (value: string) => void;
  inspectionAssigneeFilter: string;
  setInspectionAssigneeFilter: (value: string) => void;
  inspectionLocationFilter: string;
  setInspectionLocationFilter: (value: string) => void;
  inspectionTradeOptions: string[];
  inspectionAssigneeOptions: string[];
  inspectionLocationOptions: string[];
  filteredInspections: QualityInspection[];
  onResetFilters: () => void;
  onSelectInspection: (inspectionId: string) => void;
}

export function QualityInspectionsTab(props: QualityInspectionsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={2} />
          <Input
            value={props.inspectionSearch}
            onChange={(event) => props.setInspectionSearch(event.target.value)}
            placeholder="Search inspections..."
            size="toolbar"
            className="pl-11"
          />
        </div>
        <select value={props.inspectionStatusFilter} onChange={(event) => props.setInspectionStatusFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="All">All Status</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Complete">Complete</option>
        </select>
        <select value={props.inspectionDueFilter} onChange={(event) => props.setInspectionDueFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="All">Due Date</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
        <select value={props.inspectionTradeFilter} onChange={(event) => props.setInspectionTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.inspectionTradeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Trade" : item}
            </option>
          ))}
        </select>
        <select value={props.inspectionAssigneeFilter} onChange={(event) => props.setInspectionAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.inspectionAssigneeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "People" : item}
            </option>
          ))}
        </select>
        <select value={props.inspectionLocationFilter} onChange={(event) => props.setInspectionLocationFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.inspectionLocationOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Location" : item}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="toolbar" onClick={props.onResetFilters} className="px-4 font-semibold text-[var(--text-secondary)]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[var(--text-primary)]`}>Inspections</h3>
        </div>
        {props.filteredInspections.length === 0 ? (
          <QualityEmptyState title="No inspections yet" description="Create an inspection to track site quality checks." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_minmax(220px,1.2fr)_minmax(160px,1fr)_140px_minmax(150px,0.9fr)_140px] border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              {["Inspection", "Trade / Location", "Assignee", "Due Date", "Progress", "Status"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                  {heading}
                </p>
              ))}
            </div>

            <div>
              {props.filteredInspections.map((inspection) => {
                const status = getInspectionStatus(inspection.items);
                const progress = getInspectionProgress(inspection.items);
                const overdue = Boolean(inspection.dueDate && inspection.dueDate < new Date().toISOString().slice(0, 10) && status !== "Complete");

                return (
                  <button
                    key={inspection.id}
                    type="button"
                    onClick={() => props.onSelectInspection(inspection.id)}
                    className={cn("grid w-full grid-cols-[minmax(260px,1.8fr)_minmax(220px,1.2fr)_minmax(160px,1fr)_140px_minmax(150px,0.9fr)_140px] items-center border-b border-[var(--border-subtle)] px-5 py-4 text-left transition hover:bg-[var(--surface-muted)] last:border-b-0", overdue ? "bg-[var(--error-light)]" : "bg-[var(--surface)]")}
                  >
                    <div className="min-w-0 pr-4">
                      <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{inspection.title}</p>
                      <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[var(--text-secondary)]`}>{formatTimestamp(inspection.scheduledAt)}</p>
                    </div>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[var(--text-primary)]`}>
                      {[inspection.trade || "No trade", inspection.location || "No location"].join(" / ")}
                    </p>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[var(--text-primary)]`}>{inspection.assignee || "Unassigned"}</p>
                    <p className={cn(`${interMedium.className} text-[13px]`, overdue ? "font-semibold text-[var(--error)]" : "text-[var(--text-primary)]")}>
                      {inspection.dueDate || "No due date"}
                    </p>
                    <div className="pr-4">
                      <p className={`${interMedium.className} text-[13px] font-medium text-[var(--text-primary)]`}>
                        {progress.complete}/{progress.total}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div className="h-full rounded-full bg-[var(--info)]" style={{ width: `${progress.total ? (progress.complete / progress.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <span className={`${interMedium.className} inline-flex rounded-full border px-3 py-1 text-[12px] font-medium ${inspectionStatusTone(status)}`}>
                        {status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
