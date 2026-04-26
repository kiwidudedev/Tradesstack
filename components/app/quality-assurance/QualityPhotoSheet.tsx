"use client";

import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp } from "@/lib/quality-assurance/helpers";
import type {
  OrganizationUserOption,
  PhotoPhase,
  PhotoType,
  QualityInspection,
  QualityIssue,
  QualityPhoto,
} from "@/lib/quality-assurance/types";

interface CreateQualityPhotoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newPhotoFileName: string;
  handleNewPhotoFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  newPhotoTitle: string;
  setNewPhotoTitle: (value: string) => void;
  newPhotoTrade: string;
  setNewPhotoTrade: (value: string) => void;
  newPhotoLocation: string;
  setNewPhotoLocation: (value: string) => void;
  newPhotoCategory: string;
  setNewPhotoCategory: (value: string) => void;
  newPhotoCapturedAt: string;
  setNewPhotoCapturedAt: (value: string) => void;
  newPhotoAssignedUserId: string;
  setNewPhotoAssignedUserId: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  newPhotoLinkMode: "none" | "issue" | "inspection";
  setNewPhotoLinkMode: (value: "none" | "issue" | "inspection") => void;
  photoLinkModes: Array<{ label: string; value: "none" | "issue" | "inspection" }>;
  newPhotoIssueId: string;
  setNewPhotoIssueId: (value: string) => void;
  newPhotoInspectionId: string;
  setNewPhotoInspectionId: (value: string) => void;
  newPhotoInspectionItemId: string;
  setNewPhotoInspectionItemId: (value: string) => void;
  issues: QualityIssue[];
  inspections: QualityInspection[];
  newPhotoNotes: string;
  setNewPhotoNotes: (value: string) => void;
  newPhotoHasSignoffEvidence: boolean;
  setNewPhotoHasSignoffEvidence: (value: boolean) => void;
  newPhotoUrl: string;
  newPhotoFileDraft: File | null;
  isSaving: boolean;
  photoCategories: string[];
  onCreate: () => void;
}

export function CreateQualityPhotoSheet(props: CreateQualityPhotoSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
        <div className="space-y-4 pr-6">
          <div>
            <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>New Photo</p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Upload Photo</h3>
          </div>
          <div className="space-y-2">
            <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Photo</span>
            <label className="flex cursor-pointer items-center justify-between rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 hover:bg-[#F8FAFC]">
              <span className={`${interMedium.className} text-sm font-medium text-[#334155]`}>{props.newPhotoFileName || "Choose photo"}</span>
              <span className={`${interMedium.className} rounded-[6px] bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white`}>Browse</span>
              <input type="file" accept="image/*" onChange={(event) => void props.handleNewPhotoFileSelect(event)} className="hidden" />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
              <Input value={props.newPhotoTitle} onChange={(event) => props.setNewPhotoTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
              <Input value={props.newPhotoTrade} onChange={(event) => props.setNewPhotoTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
              <Input value={props.newPhotoLocation} onChange={(event) => props.setNewPhotoLocation(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Type</span>
              <select value={props.newPhotoCategory} onChange={(event) => props.setNewPhotoCategory(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {props.photoCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Captured</span>
              <Input type="datetime-local" value={props.newPhotoCapturedAt} onChange={(event) => props.setNewPhotoCapturedAt(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
              <select value={props.newPhotoAssignedUserId} onChange={(event) => props.setNewPhotoAssignedUserId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1">
            <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Link</span>
            <select value={props.newPhotoLinkMode} onChange={(event) => props.setNewPhotoLinkMode(event.target.value as "none" | "issue" | "inspection")} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
              {props.photoLinkModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          {props.newPhotoLinkMode === "issue" ? (
            <select value={props.newPhotoIssueId} onChange={(event) => props.setNewPhotoIssueId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
              <option value="">Select issue</option>
              {props.issues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.title}
                </option>
              ))}
            </select>
          ) : null}
          {props.newPhotoLinkMode === "inspection" ? (
            <div className="grid gap-2 md:grid-cols-2">
              <select value={props.newPhotoInspectionId} onChange={(event) => props.setNewPhotoInspectionId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="">Select inspection</option>
                {props.inspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    {inspection.title}
                  </option>
                ))}
              </select>
              <select value={props.newPhotoInspectionItemId} onChange={(event) => props.setNewPhotoInspectionItemId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="">Select checklist item</option>
                {(props.inspections.find((inspection) => inspection.id === props.newPhotoInspectionId)?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <label className="space-y-1">
            <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Notes</span>
            <textarea
              value={props.newPhotoNotes}
              onChange={(event) => props.setNewPhotoNotes(event.target.value)}
              className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
            />
          </label>
          <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs text-[#334155]`}>
            <input type="checkbox" checked={props.newPhotoHasSignoffEvidence} onChange={(event) => props.setNewPhotoHasSignoffEvidence(event.target.checked)} />
            Mark as sign-off evidence
          </label>
          <Button
            type="button"
            onClick={props.onCreate}
            disabled={props.isSaving || (!props.newPhotoUrl.trim() && !props.newPhotoFileDraft)}
            className="h-10 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Save Photo
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface QualityPhotoDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPhoto: QualityPhoto | null;
  isPhotoEditing: boolean;
  setIsPhotoEditing: (value: boolean) => void;
  photoEditTitle: string;
  setPhotoEditTitle: (value: string) => void;
  photoEditTrade: string;
  setPhotoEditTrade: (value: string) => void;
  photoEditLocation: string;
  setPhotoEditLocation: (value: string) => void;
  photoEditStatusTag: string;
  setPhotoEditStatusTag: (value: string) => void;
  photoEditCategory: string;
  setPhotoEditCategory: (value: string) => void;
  photoEditPhaseTag: PhotoPhase;
  setPhotoEditPhaseTag: (value: PhotoPhase) => void;
  photoEditType: PhotoType;
  setPhotoEditType: (value: PhotoType) => void;
  photoEditAssignedUserId: string;
  setPhotoEditAssignedUserId: (value: string) => void;
  photoEditSignoffEvidence: boolean;
  setPhotoEditSignoffEvidence: (value: boolean) => void;
  photoEditIssueId: string;
  setPhotoEditIssueId: (value: string) => void;
  photoEditInspectionId: string;
  setPhotoEditInspectionId: (value: string) => void;
  photoEditInspectionItemId: string;
  setPhotoEditInspectionItemId: (value: string) => void;
  photoEditNotes: string;
  setPhotoEditNotes: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  issues: QualityIssue[];
  inspections: QualityInspection[];
  photoCategories: string[];
  photoTypes: Array<{ label: string; value: PhotoType }>;
  relatedPhotos: QualityPhoto[];
  issueIndex: Map<string, QualityIssue>;
  inspectionIndex: Map<string, QualityInspection>;
  inspectionItemIndex: Map<string, { itemLabel: string }>;
  isSaving: boolean;
  savePhotoEdits: () => Promise<void>;
  deletePhoto: (photoId: string) => Promise<void>;
  openPhotoDetail: (photoId: string) => void;
}

export function QualityPhotoDetailSheet(props: QualityPhotoDetailSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[560px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
        {props.selectedPhoto ? (
          <div className="space-y-4 pr-6">
            <div className="h-64 overflow-hidden rounded-[8px] border border-[#E6EAF0] bg-[#E2E8F0]">
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.selectedPhoto.photoUrl} alt={props.selectedPhoto.title || "Photo"} className="h-full w-full object-cover" />
              </>
            </div>

            <div className="space-y-2">
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Photo Context</p>
              <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{props.selectedPhoto.title || "Untitled photo"}</p>
              <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                Uploaded by {props.selectedPhoto.uploadedByName || "Unknown"} • {formatTimestamp(props.selectedPhoto.capturedAt)}
              </p>
              {props.selectedPhoto.assignedUserName ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>Assigned to {props.selectedPhoto.assignedUserName}</p> : null}
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <Input value={props.photoEditTitle} onChange={(event) => props.setPhotoEditTitle(event.target.value)} disabled={!props.isPhotoEditing} className="h-9 border-[#CBD5E1]" />
              <Input value={props.photoEditTrade} onChange={(event) => props.setPhotoEditTrade(event.target.value)} disabled={!props.isPhotoEditing} className="h-9 border-[#CBD5E1]" />
              <Input value={props.photoEditLocation} onChange={(event) => props.setPhotoEditLocation(event.target.value)} disabled={!props.isPhotoEditing} className="h-9 border-[#CBD5E1]" />
              <Input value={props.photoEditStatusTag} onChange={(event) => props.setPhotoEditStatusTag(event.target.value)} disabled={!props.isPhotoEditing} className="h-9 border-[#CBD5E1]" />
              <select value={props.photoEditCategory} onChange={(event) => props.setPhotoEditCategory(event.target.value)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {props.photoCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={props.photoEditPhaseTag} onChange={(event) => props.setPhotoEditPhaseTag(event.target.value as PhotoPhase)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="">No phase</option>
                <option value="before">Before</option>
                <option value="during">During</option>
                <option value="after">After</option>
              </select>
              <select value={props.photoEditType} onChange={(event) => props.setPhotoEditType(event.target.value as PhotoType)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {props.photoTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select value={props.photoEditAssignedUserId} onChange={(event) => props.setPhotoEditAssignedUserId(event.target.value)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
              <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs text-[#334155]`}>
                <input type="checkbox" checked={props.photoEditSignoffEvidence} onChange={(event) => props.setPhotoEditSignoffEvidence(event.target.checked)} disabled={!props.isPhotoEditing} />
                Handover evidence
              </label>
            </div>

            {props.isPhotoEditing ? (
              <>
                {props.photoEditType === "issue" ? (
                  <select value={props.photoEditIssueId} onChange={(event) => props.setPhotoEditIssueId(event.target.value)} className={`${interMedium.className} h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                    <option value="">Select issue</option>
                    {props.issues.map((issue) => (
                      <option key={issue.id} value={issue.id}>
                        {issue.title}
                      </option>
                    ))}
                  </select>
                ) : null}
                {props.photoEditType === "inspection" ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <select value={props.photoEditInspectionId} onChange={(event) => props.setPhotoEditInspectionId(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                      <option value="">Select inspection</option>
                      {props.inspections.map((inspection) => (
                        <option key={inspection.id} value={inspection.id}>
                          {inspection.title}
                        </option>
                      ))}
                    </select>
                    <select value={props.photoEditInspectionItemId} onChange={(event) => props.setPhotoEditInspectionItemId(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                      <option value="">Select checklist item</option>
                      {(props.inspections.find((inspection) => inspection.id === props.photoEditInspectionId)?.items ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </>
            ) : null}

            <Input value={props.photoEditNotes} onChange={(event) => props.setPhotoEditNotes(event.target.value)} disabled={!props.isPhotoEditing} className="h-9 border-[#CBD5E1]" />

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Linked Objects</p>
                <p className={`${interMedium.className} mt-2 text-xs text-[#334155]`}>
                  {props.selectedPhoto.linkedIssueId ? `Issue: ${props.issueIndex.get(props.selectedPhoto.linkedIssueId)?.title ?? props.selectedPhoto.linkedIssueId}` : "No issue link"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                  {props.selectedPhoto.linkedInspectionId ? `Inspection: ${props.inspectionIndex.get(props.selectedPhoto.linkedInspectionId)?.title ?? props.selectedPhoto.linkedInspectionId}` : "No inspection link"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                  {props.selectedPhoto.linkedInspectionItemId ? `Checklist: ${props.inspectionItemIndex.get(props.selectedPhoto.linkedInspectionItemId)?.itemLabel ?? props.selectedPhoto.linkedInspectionItemId}` : "No checklist item link"}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Related Photos</p>
                <div className="mt-2 space-y-1">
                  {props.relatedPhotos.map((item) => (
                    <button key={item.id} type="button" onClick={() => props.openPhotoDetail(item.id)} className={`${interMedium.className} block text-left text-xs text-[#334155] underline`}>
                      {item.title || item.id.slice(0, 8)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {props.isPhotoEditing ? (
                <Button type="button" onClick={() => void props.savePhotoEdits()} disabled={props.isSaving} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                  Save Details
                </Button>
              ) : (
                <Button type="button" onClick={() => props.setIsPhotoEditing(true)} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                  Edit Details
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (props.selectedPhoto) {
                    window.open(props.selectedPhoto.photoUrl, "_blank");
                  }
                }}
                className="h-9 rounded-[6px] border-[#CBD5E1] bg-white text-xs text-[#334155]"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Download
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (props.selectedPhoto) {
                    void props.deletePhoto(props.selectedPhoto.id);
                  }
                }}
                disabled={props.isSaving}
                className="h-9 rounded-[6px] border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
