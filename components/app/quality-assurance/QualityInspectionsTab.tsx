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
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <Input
            value={props.inspectionSearch}
            onChange={(event) => props.setInspectionSearch(event.target.value)}
            placeholder="Search inspections..."
            className="h-10 rounded-[12px] border-[#D9E3EE] bg-white pl-11 text-[14px]"
          />
        </div>
        <select value={props.inspectionStatusFilter} onChange={(event) => props.setInspectionStatusFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">All Status</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Complete">Complete</option>
        </select>
        <select value={props.inspectionDueFilter} onChange={(event) => props.setInspectionDueFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">Due Date</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
        <select value={props.inspectionTradeFilter} onChange={(event) => props.setInspectionTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.inspectionTradeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Trade" : item}
            </option>
          ))}
        </select>
        <select value={props.inspectionAssigneeFilter} onChange={(event) => props.setInspectionAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.inspectionAssigneeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "People" : item}
            </option>
          ))}
        </select>
        <select value={props.inspectionLocationFilter} onChange={(event) => props.setInspectionLocationFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.inspectionLocationOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Location" : item}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-10 rounded-[12px] border border-[#D9E3EE] bg-white px-4 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Inspections</h3>
        </div>
        {props.filteredInspections.length === 0 ? (
          <QualityEmptyState title="No inspections yet" description="Create an inspection to track site quality checks." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_minmax(220px,1.2fr)_minmax(160px,1fr)_140px_minmax(150px,0.9fr)_140px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Inspection", "Trade / Location", "Assignee", "Due Date", "Progress", "Status"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
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
                    className={cn("grid w-full grid-cols-[minmax(260px,1.8fr)_minmax(220px,1.2fr)_minmax(160px,1fr)_140px_minmax(150px,0.9fr)_140px] items-center border-b border-[#EEF3F8] px-5 py-4 text-left transition hover:bg-[#F8FAFC] last:border-b-0", overdue ? "bg-[#FFF6F6]" : "bg-white")}
                  >
                    <div className="min-w-0 pr-4">
                      <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{inspection.title}</p>
                      <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>{formatTimestamp(inspection.scheduledAt)}</p>
                    </div>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>
                      {[inspection.trade || "No trade", inspection.location || "No location"].join(" / ")}
                    </p>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>{inspection.assignee || "Unassigned"}</p>
                    <p className={cn(`${interMedium.className} text-[13px]`, overdue ? "font-semibold text-[#FF3B30]" : "text-[#0F172A]")}>
                      {inspection.dueDate || "No due date"}
                    </p>
                    <div className="pr-4">
                      <p className={`${interMedium.className} text-[13px] font-medium text-[#0F172A]`}>
                        {progress.complete}/{progress.total}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6EDF5]">
                        <div className="h-full rounded-full bg-[#1DA1F2]" style={{ width: `${progress.total ? (progress.complete / progress.total) * 100 : 0}%` }} />
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
