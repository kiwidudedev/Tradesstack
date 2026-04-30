import { Search } from "lucide-react";
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
  organizationUserNameById: Map<string, string>;
  onResetFilters: () => void;
  onSelectSignoff: (signoffId: string) => void;
}

export function QualitySignOffsTab(props: QualitySignOffsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <Input
            value={props.signoffSearch}
            onChange={(event) => props.setSignoffSearch(event.target.value)}
            placeholder="Search sign-offs..."
            className="h-10 rounded-[12px] border-[#D9E3EE] bg-white pl-11 text-[14px]"
          />
        </div>
        <select value={props.signoffStatusFilter} onChange={(event) => props.setSignoffStatusFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Signed">Signed</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={props.signoffDueFilter} onChange={(event) => props.setSignoffDueFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">Due Date</option>
          <option value="Overdue">Overdue</option>
          <option value="Due Today">Due Today</option>
          <option value="No Due Date">No Due Date</option>
        </select>
        <select value={props.signoffTypeFilter} onChange={(event) => props.setSignoffTypeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">Type</option>
          <option value="Internal">Internal</option>
          <option value="Client">Client</option>
          <option value="Council">Council</option>
          <option value="Final Handover">Final Handover</option>
        </select>
        <select value={props.signoffTradeFilter} onChange={(event) => props.setSignoffTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.signoffTradeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Trade" : item}
            </option>
          ))}
        </select>
        <select value={props.signoffAssigneeFilter} onChange={(event) => props.setSignoffAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.signoffAssigneeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "People" : item}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-10 rounded-[12px] border border-[#D9E3EE] bg-white px-4 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Sign-Offs</h3>
        </div>
        {props.filteredSignoffs.length === 0 ? (
          <QualityEmptyState title="No sign-offs yet" description="Create sign-offs to approve completed work and track accountability." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(240px,1.7fr)_minmax(160px,1fr)_140px_minmax(150px,0.9fr)_minmax(150px,0.9fr)_160px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Sign-Off", "Linked Work Logs", "Status", "Requested By", "Approved By", "Date"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>

            <div>
              {props.filteredSignoffs.map((item) => {
                const approvedBy = item.signedBy || (item.approvedByUserId ? props.organizationUserNameById.get(item.approvedByUserId) : "") || "Pending";
                const linkedCount = item.linkedWorkProofIds.length || (item.linkedWorkProofId ? 1 : 0);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => props.onSelectSignoff(item.id)}
                    className="grid w-full grid-cols-[minmax(240px,1.7fr)_minmax(160px,1fr)_140px_minmax(150px,0.9fr)_minmax(150px,0.9fr)_160px] items-center border-b border-[#EEF3F8] px-5 py-4 text-left transition hover:bg-[#F8FAFC] last:border-b-0"
                  >
                    <div className="min-w-0 pr-4">
                      <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{item.title}</p>
                      <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>{item.type} • {item.location || "No location"}</p>
                    </div>
                    <div className="pr-4">
                      <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>
                        {linkedCount} linked
                      </p>
                      <p className={`${interMedium.className} mt-1 truncate text-[11px] text-[#64748B]`}>
                        {item.trade || "No trade"}
                      </p>
                    </div>
                    <div>
                      <span className={`${interMedium.className} inline-flex rounded-full border px-3 py-1 text-[12px] font-medium ${signOffTone(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>{item.assignee || "Unassigned"}</p>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>{approvedBy}</p>
                    <div>
                      <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>{item.signedAt ? formatTimestamp(item.signedAt) : formatTimestamp(item.createdAt)}</p>
                      {item.dueDate ? <p className={`${interMedium.className} mt-1 text-[11px] text-[#64748B]`}>Due {item.dueDate}</p> : null}
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
