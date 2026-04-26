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
    <div className="space-y-3">
      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-[2fr_1fr_1fr]">
        <Input value={props.inspectionSearch} onChange={(event) => props.setInspectionSearch(event.target.value)} className="h-9 border-[#CBD5E1]" />
        <select value={props.inspectionStatusFilter} onChange={(event) => props.setInspectionStatusFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Status</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Complete">Complete</option>
        </select>
        <select value={props.inspectionDueFilter} onChange={(event) => props.setInspectionDueFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Due Dates</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
      </div>

      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-4">
        <select value={props.inspectionTradeFilter} onChange={(event) => props.setInspectionTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.inspectionTradeOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={props.inspectionAssigneeFilter} onChange={(event) => props.setInspectionAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.inspectionAssigneeOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={props.inspectionLocationFilter} onChange={(event) => props.setInspectionLocationFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.inspectionLocationOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-9 border-[#CBD5E1] bg-white text-[#334155]">
          Reset Filters
        </Button>
      </div>

      {props.filteredInspections.length === 0 ? <QualityEmptyState title="No inspections yet" description="Create an inspection to track site quality checks." /> : null}

      {props.filteredInspections.map((inspection) => {
        const status = getInspectionStatus(inspection.items);
        const progress = getInspectionProgress(inspection.items);
        const overdue = Boolean(inspection.dueDate && inspection.dueDate < new Date().toISOString().slice(0, 10) && status !== "Complete");
        return (
          <div
            key={inspection.id}
            onClick={() => props.onSelectInspection(inspection.id)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between rounded-[8px] border bg-white px-3 py-3 text-left transition-colors hover:bg-[#F8FAFC]",
              overdue ? "border-rose-200" : "border-[#E6EAF0]"
            )}
          >
            <div className="min-w-0">
              <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{inspection.title}</p>
              <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                {inspection.trade || "No trade"} • {inspection.location || "No location"}
              </p>
            </div>
            <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
              <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${inspectionStatusTone(status)}`}>
                {status}
              </span>
              <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                {progress.complete} / {progress.total}
              </span>
              {inspection.dueDate ? (
                <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${overdue ? "border-rose-200 bg-rose-100 text-rose-700" : "border-[#CBD5E1] bg-white text-[#475569]"}`}>
                  {overdue ? "Overdue" : `Due ${inspection.dueDate}`}
                </span>
              ) : null}
              <span className={`${interMedium.className} flex h-7 w-7 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-semibold text-[#1D4ED8]`}>
                {(inspection.assignee || "U").slice(0, 1).toUpperCase()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
