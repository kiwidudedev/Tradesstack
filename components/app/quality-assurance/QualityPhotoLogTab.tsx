import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-12">
        <Input value={props.photoSearch} onChange={(event) => props.setPhotoSearch(event.target.value)} className="h-9 border-[#CBD5E1] md:col-span-2" />
        <select value={props.photoCategoryFilter} onChange={(event) => props.setPhotoCategoryFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.photoCategoryOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={props.photoTradeFilter} onChange={(event) => props.setPhotoTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.photoTradeOptions.map((trade) => (
            <option key={trade} value={trade}>
              {trade}
            </option>
          ))}
        </select>
        <select value={props.photoAreaFilter} onChange={(event) => props.setPhotoAreaFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {props.photoAreaOptions.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        <select value={props.photoLinkFilter} onChange={(event) => props.setPhotoLinkFilter(event.target.value as PhotoLinkFilter)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          {PHOTO_LINK_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={props.photoAssigneeFilter} onChange={(event) => props.setPhotoAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">Any Assignee</option>
          {props.organizationUserOptions.map((member) => (
            <option key={member.userId || "none"} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
        <Input type="date" value={props.photoDateFromFilter} onChange={(event) => props.setPhotoDateFromFilter(event.target.value)} className="h-9 border-[#CBD5E1]" />
        <Input type="date" value={props.photoDateToFilter} onChange={(event) => props.setPhotoDateToFilter(event.target.value)} className="h-9 border-[#CBD5E1]" />
        <select value={props.photoSignoffFilter} onChange={(event) => props.setPhotoSignoffFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="All">Any Evidence</option>
          <option value="Yes">Sign-off Evidence</option>
          <option value="No">Not Sign-off Evidence</option>
        </select>
        <select value={props.photoViewMode} onChange={(event) => props.setPhotoViewMode(event.target.value as PhotoViewMode)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
          <option value="grid">Grid</option>
          <option value="timeline">Timeline</option>
        </select>
        <Button type="button" variant="outline" onClick={props.onResetFilters} className="h-9 border-[#CBD5E1] bg-white text-[#334155] md:col-span-2">
          Reset Filters
        </Button>
      </div>

      {props.filteredPhotos.length === 0 ? <QualityEmptyState title="No photos yet" description="Upload photos to document site progress and quality." /> : null}

      {props.photoViewMode === "grid" ? (
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
                  <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">{entry.category}</Badge>
                  {entry.linkedIssueId ? <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Issue</Badge> : null}
                  {entry.linkedInspectionId ? <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Inspection</Badge> : null}
                  {entry.hasSignoffEvidence ? <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Sign-off</Badge> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
