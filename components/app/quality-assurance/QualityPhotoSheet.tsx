"use client";

import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp } from "@/lib/quality-assurance/helpers";
import type {
  OrganizationUserOption,
  PhotoPhase,
  PhotoType,
  QualityInspection,
  QualityIssue,
  QualityPhoto,
  QualityWorkProof,
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
  newPhotoLinkMode: "none" | "issue" | "inspection" | "work_proof";
  setNewPhotoLinkMode: (value: "none" | "issue" | "inspection" | "work_proof") => void;
  photoLinkModes: Array<{ label: string; value: "none" | "issue" | "inspection" | "work_proof" }>;
  newPhotoWorkProofId: string;
  setNewPhotoWorkProofId: (value: string) => void;
  newPhotoIssueId: string;
  setNewPhotoIssueId: (value: string) => void;
  newPhotoInspectionId: string;
  setNewPhotoInspectionId: (value: string) => void;
  newPhotoInspectionItemId: string;
  setNewPhotoInspectionItemId: (value: string) => void;
  workProofs: QualityWorkProof[];
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <DialogDescription className="sr-only">Add a quality photo.</DialogDescription>
        <div className="space-y-0">
          <div className="px-7 pb-6 pt-7">
            <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-secondary)]`}>New photo</p>
            <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">Upload Photo</h3>
          </div>
          <div className="space-y-3.5 px-7 pb-4">
          <div className="space-y-2">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Photo</span>
            <label className="flex cursor-pointer items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 hover:bg-[var(--surface-muted)]">
              <span className={`${interMedium.className} text-[14px] font-medium text-[var(--text-primary)]`}>{props.newPhotoFileName || "Choose photo"}</span>
              <span className={`${interMedium.className} rounded-[8px] bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-white`}>Browse</span>
              <input type="file" accept="image/*" onChange={(event) => void props.handleNewPhotoFileSelect(event)} className="hidden" />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Title</span>
              <Input value={props.newPhotoTitle} onChange={(event) => props.setNewPhotoTitle(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Trade</span>
              <Input value={props.newPhotoTrade} onChange={(event) => props.setNewPhotoTrade(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Location</span>
              <Input value={props.newPhotoLocation} onChange={(event) => props.setNewPhotoLocation(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Type</span>
              <select value={props.newPhotoCategory} onChange={(event) => props.setNewPhotoCategory(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                {props.photoCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Captured</span>
              <Input type="datetime-local" value={props.newPhotoCapturedAt} onChange={(event) => props.setNewPhotoCapturedAt(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Assigned To</span>
              <select value={props.newPhotoAssignedUserId} onChange={(event) => props.setNewPhotoAssignedUserId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Link</span>
            <select value={props.newPhotoLinkMode} onChange={(event) => props.setNewPhotoLinkMode(event.target.value as "none" | "issue" | "inspection" | "work_proof")} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
              {props.photoLinkModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          {props.newPhotoLinkMode === "work_proof" ? (
            <select value={props.newPhotoWorkProofId} onChange={(event) => props.setNewPhotoWorkProofId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
              <option value="">Select work log</option>
              {props.workProofs.map((workProof) => (
                <option key={workProof.id} value={workProof.id}>
                  {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                </option>
              ))}
            </select>
          ) : null}
          {props.newPhotoLinkMode === "issue" ? (
            <select value={props.newPhotoIssueId} onChange={(event) => props.setNewPhotoIssueId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
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
              <select value={props.newPhotoInspectionId} onChange={(event) => props.setNewPhotoInspectionId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                <option value="">Select inspection</option>
                {props.inspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    {inspection.title}
                  </option>
                ))}
              </select>
              <select value={props.newPhotoInspectionItemId} onChange={(event) => props.setNewPhotoInspectionItemId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
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
            <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Notes</span>
            <textarea
              value={props.newPhotoNotes}
              onChange={(event) => props.setNewPhotoNotes(event.target.value)}
              className={`${interMedium.className} min-h-[96px] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
            />
          </label>
          <label className={`${interMedium.className} inline-flex items-center gap-2 text-[13px] text-[var(--text-secondary)]`}>
            <input
              type="checkbox"
              checked={props.newPhotoLinkMode === "work_proof" ? true : props.newPhotoHasSignoffEvidence}
              onChange={(event) => props.setNewPhotoHasSignoffEvidence(event.target.checked)}
              disabled={props.newPhotoLinkMode === "work_proof"}
            />
            {props.newPhotoLinkMode === "work_proof" ? "Automatically counts as work log sign-off evidence" : "Mark as sign-off evidence"}
          </label>
          </div>
          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={props.onCreate}
              disabled={props.isSaving || (!props.newPhotoUrl.trim() && !props.newPhotoFileDraft)}
              className="h-10 rounded-[10px] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Save Photo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  photoEditWorkProofId: string;
  setPhotoEditWorkProofId: (value: string) => void;
  photoEditIssueId: string;
  setPhotoEditIssueId: (value: string) => void;
  photoEditInspectionId: string;
  setPhotoEditInspectionId: (value: string) => void;
  photoEditInspectionItemId: string;
  setPhotoEditInspectionItemId: (value: string) => void;
  photoEditNotes: string;
  setPhotoEditNotes: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  workProofs: QualityWorkProof[];
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <DialogDescription className="sr-only">Review and update the quality photo.</DialogDescription>
        {props.selectedPhoto ? (
          <div className="space-y-0">
            <div className="px-7 pb-6 pt-7">
              <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-secondary)]`}>Photo detail</p>
              <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
                {props.selectedPhoto.title || "Photo"}
              </h3>
              <p className={`${interMedium.className} mt-2 text-[12px] text-[var(--text-secondary)]`}>
                Uploaded by {props.selectedPhoto.uploadedByName || "Unknown"} • {formatTimestamp(props.selectedPhoto.capturedAt)}
              </p>
              {props.selectedPhoto.assignedUserName ? (
                <p className={`${interMedium.className} mt-1 text-[12px] text-[var(--text-secondary)]`}>Assigned to {props.selectedPhoto.assignedUserName}</p>
              ) : null}
            </div>

            <div className="space-y-3.5 px-7 pb-4">
            <div className="h-64 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--border)]">
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.selectedPhoto.photoUrl} alt={props.selectedPhoto.title || "Photo"} className="h-full w-full object-cover" />
              </>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <Input value={props.photoEditTitle} onChange={(event) => props.setPhotoEditTitle(event.target.value)} disabled={!props.isPhotoEditing} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
              <Input value={props.photoEditTrade} onChange={(event) => props.setPhotoEditTrade(event.target.value)} disabled={!props.isPhotoEditing} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
              <Input value={props.photoEditLocation} onChange={(event) => props.setPhotoEditLocation(event.target.value)} disabled={!props.isPhotoEditing} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
              <Input value={props.photoEditStatusTag} onChange={(event) => props.setPhotoEditStatusTag(event.target.value)} disabled={!props.isPhotoEditing} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
              <select value={props.photoEditCategory} onChange={(event) => props.setPhotoEditCategory(event.target.value)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                {props.photoCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={props.photoEditPhaseTag} onChange={(event) => props.setPhotoEditPhaseTag(event.target.value as PhotoPhase)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                <option value="">No phase</option>
                <option value="before">Before</option>
                <option value="during">During</option>
                <option value="after">After</option>
              </select>
              <select value={props.photoEditType} onChange={(event) => props.setPhotoEditType(event.target.value as PhotoType)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                {props.photoTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select value={props.photoEditAssignedUserId} onChange={(event) => props.setPhotoEditAssignedUserId(event.target.value)} disabled={!props.isPhotoEditing} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
              <label className={`${interMedium.className} inline-flex items-center gap-2 text-[13px] text-[var(--text-secondary)]`}>
                <input
                  type="checkbox"
                  checked={props.photoEditType === "work_proof" && props.photoEditWorkProofId ? true : props.photoEditSignoffEvidence}
                  onChange={(event) => props.setPhotoEditSignoffEvidence(event.target.checked)}
                  disabled={!props.isPhotoEditing || (props.photoEditType === "work_proof" && !!props.photoEditWorkProofId)}
                />
                {props.photoEditType === "work_proof" && props.photoEditWorkProofId ? "Automatically counts as work log sign-off evidence" : "Handover evidence"}
              </label>
            </div>

            {props.isPhotoEditing ? (
              <>
                {props.photoEditType === "work_proof" ? (
                  <select value={props.photoEditWorkProofId} onChange={(event) => props.setPhotoEditWorkProofId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                    <option value="">Select work log</option>
                    {props.workProofs.map((workProof) => (
                      <option key={workProof.id} value={workProof.id}>
                        {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                      </option>
                    ))}
                  </select>
                ) : null}
                {props.photoEditType === "issue" ? (
                  <select value={props.photoEditIssueId} onChange={(event) => props.setPhotoEditIssueId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
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
                    <select value={props.photoEditInspectionId} onChange={(event) => props.setPhotoEditInspectionId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                      <option value="">Select inspection</option>
                      {props.inspections.map((inspection) => (
                        <option key={inspection.id} value={inspection.id}>
                          {inspection.title}
                        </option>
                      ))}
                    </select>
                    <select value={props.photoEditInspectionItemId} onChange={(event) => props.setPhotoEditInspectionItemId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
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

            <Input value={props.photoEditNotes} onChange={(event) => props.setPhotoEditNotes(event.target.value)} disabled={!props.isPhotoEditing} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]`}>Linked Objects</p>
                <p className={`${interMedium.className} mt-2 text-xs text-[var(--text-secondary)]`}>
                  {props.selectedPhoto.linkedWorkProofId ? `Work Log: ${props.workProofs.find((workProof) => workProof.id === props.selectedPhoto!.linkedWorkProofId)?.note ?? props.selectedPhoto.linkedWorkProofId}` : "No work log link"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                  {props.selectedPhoto.linkedIssueId ? `Issue: ${props.issueIndex.get(props.selectedPhoto.linkedIssueId)?.title ?? props.selectedPhoto.linkedIssueId}` : "No issue link"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                  {props.selectedPhoto.linkedInspectionId ? `Inspection: ${props.inspectionIndex.get(props.selectedPhoto.linkedInspectionId)?.title ?? props.selectedPhoto.linkedInspectionId}` : "No inspection link"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                  {props.selectedPhoto.linkedInspectionItemId ? `Checklist: ${props.inspectionItemIndex.get(props.selectedPhoto.linkedInspectionItemId)?.itemLabel ?? props.selectedPhoto.linkedInspectionItemId}` : "No checklist item link"}
                </p>
              </div>
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]`}>Related Photos</p>
                <div className="mt-2 space-y-1">
                  {props.relatedPhotos.map((item) => (
                    <button key={item.id} type="button" onClick={() => props.openPhotoDetail(item.id)} className={`${interMedium.className} block text-left text-xs text-[var(--text-secondary)] underline`}>
                      {item.title || item.id.slice(0, 8)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {props.isPhotoEditing ? (
                <Button type="button" onClick={() => void props.savePhotoEdits()} disabled={props.isSaving} className="h-9 rounded-[10px] bg-[var(--text-primary)] px-3 text-xs text-white hover:bg-[var(--text-primary)]">
                  Save Details
                </Button>
              ) : (
                <Button type="button" onClick={() => props.setIsPhotoEditing(true)} className="h-9 rounded-[10px] bg-[var(--text-primary)] px-3 text-xs text-white hover:bg-[var(--text-primary)]">
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
                className="h-9 rounded-[10px] border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-secondary)]"
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
                className="h-9 rounded-[10px] border-[var(--error-light)] bg-[var(--error-light)] text-xs text-[var(--error)] hover:bg-[var(--error-light)]"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!props.isPhotoEditing) {
                    props.setIsPhotoEditing(true);
                    return;
                  }
                  void props.savePhotoEdits();
                }}
                disabled={props.isSaving}
                className="h-10 rounded-[10px] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {props.isPhotoEditing ? "Save Photo" : "Edit Photo"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
