import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp } from "@/lib/quality-assurance/helpers";
import { PHOTO_LINK_FILTERS } from "@/lib/quality-assurance/constants";
import type { OrganizationUserOption, PhotoLinkFilter, PhotoViewMode, QualityPhoto } from "@/lib/quality-assurance/types";
import { QualityEmptyState } from "./QualityEmptyState";

interface QualityPhotoLogTabProps {
  photoSearch: string;
  setPhotoSearch: (value: string) => void;
  photoCategoryFilter: string;
  setPhotoCategoryFilter: (value: string) => void;
  photoTradeFilter: string;
  setPhotoTradeFilter: (value: string) => void;
  photoAreaFilter: string;
  setPhotoAreaFilter: (value: string) => void;
  photoLinkFilter: PhotoLinkFilter;
  setPhotoLinkFilter: (value: PhotoLinkFilter) => void;
  photoAssigneeFilter: string;
  setPhotoAssigneeFilter: (value: string) => void;
  photoDateFromFilter: string;
  setPhotoDateFromFilter: (value: string) => void;
  photoDateToFilter: string;
  setPhotoDateToFilter: (value: string) => void;
  photoSignoffFilter: string;
  setPhotoSignoffFilter: (value: string) => void;
  photoViewMode: PhotoViewMode;
  setPhotoViewMode: (value: PhotoViewMode) => void;
  photoTradeOptions: string[];
  photoAreaOptions: string[];
  photoCategoryOptions: string[];
  organizationUserOptions: OrganizationUserOption[];
  filteredPhotos: QualityPhoto[];
  timelinePhotos: Array<[string, QualityPhoto[]]>;
  onResetFilters: () => void;
  onOpenPhoto: (photoId: string) => void;
}

export function QualityPhotoLogTab(props: QualityPhotoLogTabProps) {
  const getLinkedEntityLabel = (entry: QualityPhoto) => {
    if (entry.linkedWorkProofId) return "Work Log";
    if (entry.linkedIssueId) return "Issue";
    if (entry.linkedInspectionId) return "Inspection";
    return "General";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <Input
            value={props.photoSearch}
            onChange={(event) => props.setPhotoSearch(event.target.value)}
            placeholder="Search photos..."
            className="h-10 rounded-[12px] border-[#D9E3EE] bg-white pl-11 text-[14px]"
          />
        </div>
        <select value={props.photoCategoryFilter} onChange={(event) => props.setPhotoCategoryFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.photoCategoryOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Category" : item}
            </option>
          ))}
        </select>
        <select value={props.photoTradeFilter} onChange={(event) => props.setPhotoTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.photoTradeOptions.map((trade) => (
            <option key={trade} value={trade}>
              {trade === "All" ? "Trade" : trade}
            </option>
          ))}
        </select>
        <select value={props.photoAreaFilter} onChange={(event) => props.setPhotoAreaFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {props.photoAreaOptions.map((area) => (
            <option key={area} value={area}>
              {area === "All" ? "Area" : area}
            </option>
          ))}
        </select>
        <select value={props.photoLinkFilter} onChange={(event) => props.setPhotoLinkFilter(event.target.value as PhotoLinkFilter)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          {PHOTO_LINK_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={props.photoAssigneeFilter} onChange={(event) => props.setPhotoAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">Any Assignee</option>
          {props.organizationUserOptions.map((member) => (
            <option key={member.userId || "none"} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
        <Input type="date" value={props.photoDateFromFilter} onChange={(event) => props.setPhotoDateFromFilter(event.target.value)} className="h-10 rounded-[12px] border-[#D9E3EE] bg-white text-[14px]" />
        <Input type="date" value={props.photoDateToFilter} onChange={(event) => props.setPhotoDateToFilter(event.target.value)} className="h-10 rounded-[12px] border-[#D9E3EE] bg-white text-[14px]" />
        <select value={props.photoSignoffFilter} onChange={(event) => props.setPhotoSignoffFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="All">Evidence</option>
          <option value="Yes">Sign-off Evidence</option>
          <option value="No">Not Sign-off Evidence</option>
        </select>
        <select value={props.photoViewMode} onChange={(event) => props.setPhotoViewMode(event.target.value as PhotoViewMode)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#D9E3EE] bg-white px-3 text-[14px] text-[#0F172A]`}>
          <option value="list">List</option>
          <option value="grid">Grid</option>
          <option value="timeline">Timeline</option>
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-10 rounded-[12px] border border-[#D9E3EE] bg-white px-4 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[#0F172A]`}>Photo Log</h3>
        </div>
        {props.filteredPhotos.length === 0 ? <QualityEmptyState title="No photos yet" description="Upload photos to document site progress and quality." /> : null}

        {props.filteredPhotos.length > 0 && props.photoViewMode === "list" ? (
          <div className="overflow-hidden rounded-[18px] border border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(280px,1.8fr)_120px_minmax(180px,1fr)_160px_160px_160px] border-b border-[#EEF3F8] bg-[#FCFDFE] px-5 py-3">
              {["Photo", "Category", "Trade / Area", "Linked To", "Captured", "Assignee"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {heading}
                </p>
              ))}
            </div>

            <div>
              {props.filteredPhotos.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => props.onOpenPhoto(entry.id)}
                  className="grid w-full grid-cols-[minmax(280px,1.8fr)_120px_minmax(180px,1fr)_160px_160px_160px] items-center border-b border-[#EEF3F8] px-5 py-4 text-left transition hover:bg-[#F8FAFC] last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3 pr-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-[#E2E8F0]">
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                      </>
                    </div>
                    <div className="min-w-0">
                      <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[#0F172A]`}>{entry.title || "Untitled photo"}</p>
                      <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[#6B7C93]`}>{entry.location || "No location"}</p>
                    </div>
                  </div>
                  <div>
                    <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>
                      {entry.category}
                    </span>
                  </div>
                  <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[#0F172A]`}>
                    {[entry.trade || "No trade", entry.area || entry.location || "No area"].join(" / ")}
                  </p>
                  <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>{getLinkedEntityLabel(entry)}</p>
                  <p className={`${interMedium.className} text-[13px] text-[#0F172A]`}>{formatTimestamp(entry.capturedAt)}</p>
                  <p className={`${interMedium.className} truncate text-[13px] text-[#0F172A]`}>{entry.assignedUserName || "Unassigned"}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {props.filteredPhotos.length > 0 && props.photoViewMode === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.filteredPhotos.map((entry) => (
            <button key={entry.id} type="button" onClick={() => props.onOpenPhoto(entry.id)} className="overflow-hidden rounded-[8px] border border-[#E6EAF0] bg-white text-left transition-colors hover:bg-[#F8FAFC]">
              <div className="h-44 bg-[#E2E8F0]">
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                </>
              </div>
              <div className="space-y-1 px-3 py-3">
                <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{entry.title || "Untitled photo"}</p>
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                  {entry.trade || "No trade"} • {entry.location || "No location"} • {formatTimestamp(entry.capturedAt)}
                </p>
                {entry.assignedUserName ? <p className={`${interMedium.className} text-[11px] text-[#64748B]`}>Assigned to {entry.assignedUserName}</p> : null}
                <div className="flex flex-wrap gap-1">
                  <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>{entry.category}</span>
                  {entry.linkedWorkProofId ? <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>Work Log</span> : null}
                  {entry.linkedIssueId ? <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>Issue</span> : null}
                  {entry.linkedInspectionId ? <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>Inspection</span> : null}
                  {entry.hasSignoffEvidence ? <span className={`${interMedium.className} inline-flex rounded-full border border-[#D9E3EE] bg-[#F8FAFC] px-3 py-1 text-[12px] font-medium text-[#475569]`}>Sign-off</span> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

        {props.filteredPhotos.length > 0 && props.photoViewMode === "timeline" ? (
        <div className="space-y-4">
          {props.timelinePhotos.map(([dateKey, entries]) => (
            <div key={dateKey} className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>
                {new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-NZ", {
                  weekday: "long",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>{entries.length} photo{entries.length === 1 ? "" : "s"} uploaded</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {entries.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => props.onOpenPhoto(entry.id)} className="flex items-center gap-3 rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC] p-2 text-left">
                    <div className="h-16 w-16 overflow-hidden rounded-[6px] bg-[#E2E8F0]">
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                      </>
                    </div>
                    <div className="min-w-0">
                      <p className={`${interMedium.className} truncate text-xs font-semibold text-[#0F172A]`}>{entry.title || "Untitled photo"}</p>
                      <p className={`${interMedium.className} text-[11px] text-[#64748B]`}>{formatTimestamp(entry.capturedAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        ) : null}
      </section>
    </div>
  );
}
