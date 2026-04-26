import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp, signOffTone } from "@/lib/quality-assurance/helpers";
import type { QualitySignOff } from "@/lib/quality-assurance/types";
import { QualityEmptyState } from "./QualityEmptyState";

interface QualitySignOffsTabProps {
  signoffSearch: string;
  setSignoffSearch: (value: string) => void;
  signoffStatusFilter: string;
  setSignoffStatusFilter: (value: string) => void;
  signoffDueFilter: string;
  setSignoffDueFilter: (value: string) => void;
  signoffTypeFilter: string;
  setSignoffTypeFilter: (value: string) => void;
  signoffTradeFilter: string;
  setSignoffTradeFilter: (value: string) => void;
  signoffAssigneeFilter: string;
  setSignoffAssigneeFilter: (value: string) => void;
  signoffTradeOptions: string[];
  signoffAssigneeOptions: string[];
  filteredSignoffs: QualitySignOff[];
  onResetFilters: () => void;
  onSelectSignoff: (signoffId: string) => void;
}

export function QualitySignOffsTab(props: QualitySignOffsTabProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-[2fr_1fr_1fr]">
        <Input value={props.signoffSearch} onChange={(event) => props.setSignoffSearch(event.target.value)} className="h-9 border-[#CBD5E1]" />
        <select value={props.signoffStatusFilter} onChange={(event) => props.setSignoffStatusFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Signed">Signed</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={props.signoffDueFilter} onChange={(event) => props.setSignoffDueFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Due Dates</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
      </div>
      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-4">
        <select value={props.signoffTypeFilter} onChange={(event) => props.setSignoffTypeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">All Types</option>
          <option value="Internal">Internal</option>
          <option value="Client">Client</option>
          <option value="Council">Council</option>
          <option value="Final Handover">Final Handover</option>
        </select>
        <select value={props.signoffTradeFilter} onChange={(event) => props.setSignoffTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.signoffTradeOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={props.signoffAssigneeFilter} onChange={(event) => props.setSignoffAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.signoffAssigneeOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-9 border-[#CBD5E1] bg-white text-[#334155]">
          Reset Filters
        </Button>
      </div>

      {props.filteredSignoffs.length === 0 ? <QualityEmptyState title="No sign-offs yet" description="Create sign-offs to approve completed work and track accountability." /> : null}

      {props.filteredSignoffs.map((item) => (
        <div
          key={item.id}
          onClick={() => props.onSelectSignoff(item.id)}
          className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E6EAF0] bg-white px-4 py-3 transition-colors hover:bg-[#F8FAFC]"
        >
          <div className="min-w-0">
            <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{item.title}</p>
            <p className={`${interMedium.className} text-xs text-[#64748B]`}>
              {item.type} • {item.trade || "No trade"} • {item.location || "No location"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${signOffTone(item.status)}`}>
              {item.status}
            </span>
            {item.dueDate ? (
              <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                Due {item.dueDate}
              </span>
            ) : null}
            <span className={`${interMedium.className} flex h-7 w-7 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-semibold text-[#1D4ED8]`}>
              {(item.signedBy || item.assignee || "U").slice(0, 1).toUpperCase()}
            </span>
            <p className={`${interMedium.className} text-xs text-[#64748B]`}>
              {item.signedBy && item.signedAt ? `${item.signedBy} • ${formatTimestamp(item.signedAt)}` : item.assignee || "Unassigned"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
