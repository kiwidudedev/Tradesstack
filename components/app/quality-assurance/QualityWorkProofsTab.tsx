import { Camera, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp, getWorkProofChecklistProgress, workProofStatusTone } from "@/lib/quality-assurance/helpers";
import type { QualityWorkProof } from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";
import { QualityEmptyState } from "./QualityEmptyState";

interface QualityWorkProofsTabProps {
  workProofSearch: string;
  setWorkProofSearch: (value: string) => void;
  workProofStatusFilter: string;
  setWorkProofStatusFilter: (value: string) => void;
  workProofTradeFilter: string;
  setWorkProofTradeFilter: (value: string) => void;
  workProofCategoryFilter: string;
  setWorkProofCategoryFilter: (value: string) => void;
  workProofAreaFilter: string;
  setWorkProofAreaFilter: (value: string) => void;
  workProofTradeOptions: string[];
  workProofCategoryOptions: string[];
  workProofAreaOptions: string[];
  filteredWorkProofs: QualityWorkProof[];
  workProofPhotoCoverMap: Map<string, string>;
  workProofPhotoCountMap: Map<string, number>;
  workProofIssueCountMap: Map<string, number>;
  workProofSignoffMap: Map<string, string>;
  organizationUserNameById: Map<string, string>;
  onResetFilters: () => void;
  onSelectWorkProof: (workProofId: string) => void;
}

export function QualityWorkProofsTab(props: QualityWorkProofsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <Input
            value={props.workProofSearch}
            onChange={(event) => props.setWorkProofSearch(event.target.value)}
            placeholder="Search work log..."
            className="h-10 rounded-[12px] border-[#D9E3EE] bg-white pl-11 text-[14px]"
          />
        </div>
        <select
          value={props.workProofStatusFilter}
          onChange={(event) => props.setWorkProofStatusFilter(event.target.value)}
          className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}
        >
          <option value="All">All Status</option>
          <option value="draft">Draft</option>
          <option value="completed">Completed</option>
          <option value="linked_to_signoff">Linked To Sign-Off</option>
        </select>
        <select
          value={props.workProofTradeFilter}
          onChange={(event) => props.setWorkProofTradeFilter(event.target.value)}
          className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}
        >
          {props.workProofTradeOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Trade" : item}
            </option>
          ))}
        </select>
        <select
          value={props.workProofCategoryFilter}
          onChange={(event) => props.setWorkProofCategoryFilter(event.target.value)}
          className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}
        >
          {props.workProofCategoryOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Category" : item}
            </option>
          ))}
        </select>
        <select
          value={props.workProofAreaFilter}
          onChange={(event) => props.setWorkProofAreaFilter(event.target.value)}
          className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}
        >
          {props.workProofAreaOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Area" : item}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-10 rounded-[12px] border border-[#D9E3EE] bg-white px-4 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Work Logged</h3>
        </div>
        {props.filteredWorkProofs.length === 0 ? (
          <QualityEmptyState title="No work logged yet" description="Log completed work with photos, checklist items, and location details." />
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(260px,1.8fr)_minmax(180px,1fr)_minmax(140px,0.85fr)_minmax(160px,1fr)_minmax(140px,0.85fr)_120px_140px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Work Log", "Trade / Category", "Area", "Checklist", "Evidence", "Issues", "Status"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>

            <div>
              {props.filteredWorkProofs.map((workProof) => {
                const leadPhoto = props.workProofPhotoCoverMap.get(workProof.id) ?? "";
                const photoCount = props.workProofPhotoCountMap.get(workProof.id) ?? 0;
                const issueCount = props.workProofIssueCountMap.get(workProof.id) ?? 0;
                const signoffStatus = props.workProofSignoffMap.get(workProof.id) ?? "";
                const checklistProgress = getWorkProofChecklistProgress(workProof.checklistItems);
                const createdByName = props.organizationUserNameById.get(workProof.createdBy) ?? "Team Member";

                return (
                  <button
                    key={workProof.id}
                    type="button"
                    onClick={() => props.onSelectWorkProof(workProof.id)}
                    className="grid w-full grid-cols-[minmax(260px,1.8fr)_minmax(180px,1fr)_minmax(140px,0.85fr)_minmax(160px,1fr)_minmax(140px,0.85fr)_120px_140px] items-center border-b border-[#EEF3F8] px-5 py-4 text-left transition hover:bg-[#F8FAFC] last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3 pr-4">
                      <div className="h-12 w-12 overflow-hidden rounded-[10px] border border-[#E2E8F1] bg-[#F8FAFC]">
                        {leadPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={leadPhoto} alt={workProof.note || "Work completed"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[#64748B]">
                            <Camera className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>
                          {workProof.note || "Work completed"}
                        </p>
                        <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>
                          Created by {createdByName} • {formatTimestamp(workProof.createdAt)}
                        </p>
                      </div>
                    </div>

                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>
                      {[workProof.tradeType || "No trade", workProof.workCategory || "No category"].join(" / ")}
                    </p>
                    <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>
                      {workProof.area || "No area"}
                    </p>
                    <div className="pr-4">
                      <p className={`${interMedium.className} text-[13px] font-medium text-[#0F172A]`}>
                        {checklistProgress.checked}/{checklistProgress.total || 0}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6EDF5]">
                        <div
                          className="h-full rounded-full bg-[#1DA1F2]"
                          style={{ width: `${checklistProgress.total ? (checklistProgress.checked / checklistProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="pr-4">
                      <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>
                        {photoCount} photo{photoCount === 1 ? "" : "s"}
                      </p>
                      <p className={`${interMedium.className} mt-1 text-[11px] text-[#64748B]`}>
                        {signoffStatus ? signoffStatus : "No sign-off linked"}
                      </p>
                    </div>

                    <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>
                      {issueCount}
                    </p>

                    <div>
                      <span className={cn(`${interMedium.className} inline-flex rounded-full border px-3 py-1 text-[12px] font-medium`, workProofStatusTone(workProof.status))}>
                        {workProof.status.replaceAll("_", " ")}
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
