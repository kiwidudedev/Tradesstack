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
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={2} />
          <Input
            value={props.photoSearch}
            onChange={(event) => props.setPhotoSearch(event.target.value)}
            placeholder="Search photos..."
            size="toolbar"
            className="pl-11"
          />
        </div>
        <select value={props.photoCategoryFilter} onChange={(event) => props.setPhotoCategoryFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.photoCategoryOptions.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "Category" : item}
            </option>
          ))}
        </select>
        <select value={props.photoTradeFilter} onChange={(event) => props.setPhotoTradeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.photoTradeOptions.map((trade) => (
            <option key={trade} value={trade}>
              {trade === "All" ? "Trade" : trade}
            </option>
          ))}
        </select>
        <select value={props.photoAreaFilter} onChange={(event) => props.setPhotoAreaFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {props.photoAreaOptions.map((area) => (
            <option key={area} value={area}>
              {area === "All" ? "Area" : area}
            </option>
          ))}
        </select>
        <select value={props.photoLinkFilter} onChange={(event) => props.setPhotoLinkFilter(event.target.value as PhotoLinkFilter)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          {PHOTO_LINK_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={props.photoAssigneeFilter} onChange={(event) => props.setPhotoAssigneeFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="All">Any Assignee</option>
          {props.organizationUserOptions.map((member) => (
            <option key={member.userId || "none"} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
        <Input size="toolbar" type="date" value={props.photoDateFromFilter} onChange={(event) => props.setPhotoDateFromFilter(event.target.value)} />
        <Input type="date" value={props.photoDateToFilter} onChange={(event) => props.setPhotoDateToFilter(event.target.value)} className="h-10 rounded-[12px] border-[var(--border)] bg-[var(--surface)] text-[14px]" />
        <select value={props.photoSignoffFilter} onChange={(event) => props.setPhotoSignoffFilter(event.target.value)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="All">Evidence</option>
          <option value="Yes">Sign-off Evidence</option>
          <option value="No">Not Sign-off Evidence</option>
        </select>
        <select value={props.photoViewMode} onChange={(event) => props.setPhotoViewMode(event.target.value as PhotoViewMode)} className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)]`}>
          <option value="list">List</option>
          <option value="grid">Grid</option>
          <option value="timeline">Timeline</option>
        </select>
        <Button type="button" variant="outline" size="toolbar" onClick={props.onResetFilters} className="px-4 font-semibold text-[var(--text-secondary)]">
          Reset
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`${interMedium.className} m-0 text-[16px] font-semibold text-[var(--text-primary)]`}>Photo Log</h3>
        </div>
        {props.filteredPhotos.length === 0 ? <QualityEmptyState title="No photos yet" description="Upload photos to document site progress and quality." /> : null}

        {props.filteredPhotos.length > 0 && props.photoViewMode === "list" ? (
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card-elevated)]">
            <div className="grid grid-cols-[minmax(280px,1.8fr)_120px_minmax(180px,1fr)_160px_160px_160px] border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              {["Photo", "Category", "Trade / Area", "Linked To", "Captured", "Assignee"].map((heading) => (
                <p key={heading} className={`${interMedium.className} m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
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
                  className="grid w-full grid-cols-[minmax(280px,1.8fr)_120px_minmax(180px,1fr)_160px_160px_160px] items-center border-b border-[var(--border-subtle)] px-5 py-4 text-left transition hover:bg-[var(--surface-muted)] last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3 pr-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] bg-[var(--surface-muted)]">
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                      </>
                    </div>
                    <div className="min-w-0">
                      <p className={`${interMedium.className} truncate text-[14px] font-semibold text-[var(--text-primary)]`}>{entry.title || "Untitled photo"}</p>
                      <p className={`${interMedium.className} mt-1 truncate text-[12px] text-[var(--text-secondary)]`}>{entry.location || "No location"}</p>
                    </div>
                  </div>
                  <div>
                    <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>
                      {entry.category}
                    </span>
                  </div>
                  <p className={`${interMedium.className} truncate pr-4 text-[13px] text-[var(--text-primary)]`}>
                    {[entry.trade || "No trade", entry.area || entry.location || "No area"].join(" / ")}
                  </p>
                  <p className={`${interMedium.className} text-[13px] text-[var(--text-primary)]`}>{getLinkedEntityLabel(entry)}</p>
                  <p className={`${interMedium.className} text-[13px] text-[var(--text-primary)]`}>{formatTimestamp(entry.capturedAt)}</p>
                  <p className={`${interMedium.className} truncate text-[13px] text-[var(--text-primary)]`}>{entry.assignedUserName || "Unassigned"}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {props.filteredPhotos.length > 0 && props.photoViewMode === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.filteredPhotos.map((entry) => (
            <button key={entry.id} type="button" onClick={() => props.onOpenPhoto(entry.id)} className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-left transition-colors hover:bg-[var(--surface-muted)]">
              <div className="h-44 bg-[var(--surface-muted)]">
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                </>
              </div>
              <div className="space-y-1 px-3 py-3">
                <p className={`${interMedium.className} text-sm font-semibold text-[var(--text-primary)]`}>{entry.title || "Untitled photo"}</p>
                <p className={`${interMedium.className} text-xs text-[var(--text-secondary)]`}>
                  {entry.trade || "No trade"} • {entry.location || "No location"} • {formatTimestamp(entry.capturedAt)}
                </p>
                {entry.assignedUserName ? <p className={`${interMedium.className} text-[11px] text-[var(--text-secondary)]`}>Assigned to {entry.assignedUserName}</p> : null}
                <div className="flex flex-wrap gap-1">
                  <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>{entry.category}</span>
                  {entry.linkedWorkProofId ? <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>Work Log</span> : null}
                  {entry.linkedIssueId ? <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>Issue</span> : null}
                  {entry.linkedInspectionId ? <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>Inspection</span> : null}
                  {entry.hasSignoffEvidence ? <span className={`${interMedium.className} inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]`}>Sign-off</span> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

        {props.filteredPhotos.length > 0 && props.photoViewMode === "timeline" ? (
        <div className="space-y-4">
          {props.timelinePhotos.map(([dateKey, entries]) => (
            <div key={dateKey} className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className={`${interMedium.className} text-sm font-semibold text-[var(--text-primary)]`}>
                {new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-NZ", {
                  weekday: "long",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>{entries.length} photo{entries.length === 1 ? "" : "s"} uploaded</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {entries.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => props.onOpenPhoto(entry.id)} className="flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-left">
                    <div className="h-16 w-16 overflow-hidden rounded-[6px] bg-[var(--surface-muted)]">
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                      </>
                    </div>
                    <div className="min-w-0">
                      <p className={`${interMedium.className} truncate text-xs font-semibold text-[var(--text-primary)]`}>{entry.title || "Untitled photo"}</p>
                      <p className={`${interMedium.className} text-[11px] text-[var(--text-secondary)]`}>{formatTimestamp(entry.capturedAt)}</p>
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
