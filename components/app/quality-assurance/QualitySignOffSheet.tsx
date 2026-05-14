"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp, signOffTone } from "@/lib/quality-assurance/helpers";
import type {
  OrganizationUserOption,
  QualityInspection,
  QualityIssue,
  QualityPhoto,
  QualitySignOff,
  QualitySignOffActivity,
  QualityWorkProof,
  SignOffStatus,
  SignOffType,
} from "@/lib/quality-assurance/types";

interface CreateQualitySignoffSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newSignoffTitle: string;
  setNewSignoffTitle: (value: string) => void;
  newSignoffType: SignOffType;
  setNewSignoffType: (value: SignOffType) => void;
  newSignoffTrade: string;
  setNewSignoffTrade: (value: string) => void;
  newSignoffLocation: string;
  setNewSignoffLocation: (value: string) => void;
  newSignoffAssigneeUserId: string;
  setNewSignoffAssigneeUserId: (value: string) => void;
  newSignoffDueDate: string;
  setNewSignoffDueDate: (value: string) => void;
  newSignoffLinkedWorkProofId: string;
  setNewSignoffLinkedWorkProofId: (value: string) => void;
  newSignoffLinkedWorkProofIds: string[];
  toggleNewSignoffLinkedWorkProof: (workProofId: string, checked: boolean) => void;
  newSignoffLinkedInspectionId: string;
  setNewSignoffLinkedInspectionId: (value: string) => void;
  newSignoffLinkedIssueId: string;
  setNewSignoffLinkedIssueId: (value: string) => void;
  newSignoffNote: string;
  setNewSignoffNote: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  workProofs: QualityWorkProof[];
  inspections: QualityInspection[];
  issues: QualityIssue[];
  isSaving: boolean;
  onCreate: () => void;
}

export function CreateQualitySignoffSheet(props: CreateQualitySignoffSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <div className="space-y-0">
          <div className="px-7 pb-6 pt-7">
            <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-secondary)]`}>New sign-off</p>
            <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">Add Sign-Off</h3>
          </div>
          <div className="space-y-3.5 px-7 pb-4">
          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Title</span>
            <Input value={props.newSignoffTitle} onChange={(event) => props.setNewSignoffTitle(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Type</span>
              <select value={props.newSignoffType} onChange={(event) => props.setNewSignoffType(event.target.value as SignOffType)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                <option value="Internal">Internal</option>
                <option value="Client">Client</option>
                <option value="Council">Council</option>
                <option value="Final Handover">Final Handover</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Due Date</span>
              <Input type="date" value={props.newSignoffDueDate} onChange={(event) => props.setNewSignoffDueDate(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Trade</span>
              <Input value={props.newSignoffTrade} onChange={(event) => props.setNewSignoffTrade(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Location</span>
              <Input value={props.newSignoffLocation} onChange={(event) => props.setNewSignoffLocation(event.target.value)} className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Assigned To</span>
              <select value={props.newSignoffAssigneeUserId} onChange={(event) => props.setNewSignoffAssigneeUserId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <select value={props.newSignoffLinkedWorkProofId} onChange={(event) => props.setNewSignoffLinkedWorkProofId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
              <option value="">Link work log (preferred)</option>
              {props.workProofs.map((workProof) => (
                <option key={workProof.id} value={workProof.id}>
                  {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                </option>
              ))}
            </select>
            <select value={props.newSignoffLinkedInspectionId} onChange={(event) => props.setNewSignoffLinkedInspectionId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
              <option value="">Link inspection (optional)</option>
              {props.inspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.title}
                </option>
              ))}
            </select>
            <select value={props.newSignoffLinkedIssueId} onChange={(event) => props.setNewSignoffLinkedIssueId(event.target.value)} className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}>
              <option value="">Link issue (optional)</option>
              {props.issues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.title}
                </option>
              ))}
            </select>
          </div>
          {props.workProofs.length > 1 ? (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Additional Work Logs</p>
              <div className="mt-3 grid gap-2">
                {props.workProofs.map((workProof) => (
                  <label key={workProof.id} className="flex items-start gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                    <input
                      type="checkbox"
                      checked={props.newSignoffLinkedWorkProofIds.includes(workProof.id)}
                      onChange={(event) => props.toggleNewSignoffLinkedWorkProof(workProof.id, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                    />
                    <span className={`${interMedium.className} text-[14px] text-[var(--text-primary)]`}>
                      {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Note</span>
            <textarea
              value={props.newSignoffNote}
              onChange={(event) => props.setNewSignoffNote(event.target.value)}
              className={`${interMedium.className} min-h-[96px] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
            />
          </label>
          </div>
          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
              Cancel
            </Button>
            <Button type="button" onClick={props.onCreate} disabled={props.isSaving || !props.newSignoffTitle.trim()} className="h-10 rounded-[10px] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-70">
              Add Sign-Off
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface QualitySignoffDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSignoff: QualitySignOff | null;
  isSaving: boolean;
  inspections: QualityInspection[];
  issues: QualityIssue[];
  workProofs: QualityWorkProof[];
  organizationUserOptions: OrganizationUserOption[];
  organizationUserNameById: Map<string, string>;
  inspectionIndex: Map<string, QualityInspection>;
  issueIndex: Map<string, QualityIssue>;
  signoffEvidencePhotos: QualityPhoto[];
  signoffQaBlockers: {
    openIssues: number;
    incompleteInspections: number;
    incompleteChecklistProofs: number;
    missingEvidenceProofs: number;
    evidenceCount: number;
    usingWorkProofScope: boolean;
  };
  signoffActivity: QualitySignOffActivity[];
  signoffActionNote: string;
  setSignoffActionNote: (value: string) => void;
  canCurrentUserSignoff: boolean;
  setSignoffLocal: (signoffId: string, patch: Partial<QualitySignOff>) => void;
  saveSignoffFields: (signoffId: string, patch: Partial<QualitySignOff>, activityAction?: string, activityDetail?: string) => Promise<void>;
  updateSignoffStatus: (signoffId: string, status: SignOffStatus) => Promise<void>;
  openPhotoDetail: (photoId: string) => void;
  onSaveAndClose: () => void;
}

export function QualitySignoffDetailSheet(props: QualitySignoffDetailSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        {props.selectedSignoff ? (
          <div className="space-y-0">
            <div className="flex items-start justify-between gap-2 px-7 pb-6 pt-7">
              <div>
                <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-secondary)]`}>Sign-off detail</p>
                <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">{props.selectedSignoff.title || "Sign-Off"}</h3>
              </div>
              <span className={`${interMedium.className} rounded-full border px-3 py-1 text-[12px] font-medium ${signOffTone(props.selectedSignoff.status)}`}>
                {props.selectedSignoff.status}
              </span>
            </div>

            <div className="space-y-3.5 px-7 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Title</span>
                <Input
                  value={props.selectedSignoff.title}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { title: event.target.value })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { title: event.target.value.trim() }, "Details updated", "Title updated")}
                  className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Type</span>
                <select
                  value={props.selectedSignoff.type}
                  onChange={(event) => {
                    const type = event.target.value as SignOffType;
                    props.setSignoffLocal(props.selectedSignoff!.id, { type });
                    void props.saveSignoffFields(props.selectedSignoff!.id, { type }, "Type changed", type);
                  }}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}
                  disabled={props.isSaving}
                >
                  <option value="Internal">Internal</option>
                  <option value="Client">Client</option>
                  <option value="Council">Council</option>
                  <option value="Final Handover">Final Handover</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Due Date</span>
                <Input
                  type="date"
                  value={props.selectedSignoff.dueDate ?? ""}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { dueDate: event.target.value || null })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { dueDate: event.target.value || null }, "Due date changed", event.target.value || "Cleared")}
                  className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Trade</span>
                <Input
                  value={props.selectedSignoff.trade}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { trade: event.target.value })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { trade: event.target.value.trim() }, "Details updated", "Trade updated")}
                  className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Location</span>
                <Input
                  value={props.selectedSignoff.location}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { location: event.target.value })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { location: event.target.value.trim() }, "Details updated", "Location updated")}
                  className="h-[2.75rem] border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Assigned To</span>
                <select
                  value={props.selectedSignoff.assigneeUserId ?? ""}
                  onChange={(event) => {
                    const assigneeUserId = event.target.value || null;
                    const assignee = assigneeUserId ? props.organizationUserNameById.get(assigneeUserId) ?? "" : "";
                    props.setSignoffLocal(props.selectedSignoff!.id, { assigneeUserId, assignee });
                    void props.saveSignoffFields(props.selectedSignoff!.id, { assigneeUserId, assignee }, "Assignment updated", assignee || "Unassigned");
                  }}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}
                  disabled={props.isSaving}
                >
                  {props.organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <select
                value={props.selectedSignoff.linkedWorkProofId ?? ""}
                onChange={(event) => {
                  const linkedWorkProofId = event.target.value || null;
                  const linkedWorkProofIds = [...new Set([...(linkedWorkProofId ? [linkedWorkProofId] : []), ...props.selectedSignoff!.linkedWorkProofIds])];
                  props.setSignoffLocal(props.selectedSignoff!.id, { linkedWorkProofId, linkedWorkProofIds });
                  void props.saveSignoffFields(
                    props.selectedSignoff!.id,
                    { linkedWorkProofId, linkedWorkProofIds },
                    "Evidence link updated",
                    linkedWorkProofId ? "Work log linked" : "Work log unlinked"
                  );
                }}
                className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}
                disabled={props.isSaving}
              >
                <option value="">Link work log (preferred)</option>
                {props.workProofs.map((workProof) => (
                  <option key={workProof.id} value={workProof.id}>
                    {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                  </option>
                ))}
              </select>
              <select
                value={props.selectedSignoff.linkedInspectionId ?? ""}
                onChange={(event) => {
                  const linkedInspectionId = event.target.value || null;
                  props.setSignoffLocal(props.selectedSignoff!.id, { linkedInspectionId });
                  void props.saveSignoffFields(props.selectedSignoff!.id, { linkedInspectionId }, "Evidence link updated", linkedInspectionId ? "Inspection linked" : "Inspection unlinked");
                }}
                className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}
                disabled={props.isSaving}
              >
                <option value="">Link inspection (optional)</option>
                {props.inspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    {inspection.title}
                  </option>
                ))}
              </select>
              <select
                value={props.selectedSignoff.linkedIssueId ?? ""}
                onChange={(event) => {
                  const linkedIssueId = event.target.value || null;
                  props.setSignoffLocal(props.selectedSignoff!.id, { linkedIssueId });
                  void props.saveSignoffFields(props.selectedSignoff!.id, { linkedIssueId }, "Evidence link updated", linkedIssueId ? "Issue linked" : "Issue unlinked");
                }}
                className={`${interMedium.className} h-[2.75rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text-primary)]`}
                disabled={props.isSaving}
              >
                <option value="">Link issue (optional)</option>
                {props.issues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.title}
                  </option>
                ))}
              </select>
            </div>

            {props.workProofs.length > 1 ? (
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <p className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Additional Work Logs</p>
                <div className="mt-3 grid gap-2">
                  {props.workProofs.map((workProof) => (
                    <label key={workProof.id} className="flex items-start gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                      <input
                        type="checkbox"
                        checked={props.selectedSignoff!.linkedWorkProofIds.includes(workProof.id)}
                        onChange={(event) => {
                          const linkedWorkProofIds = event.target.checked
                            ? [...props.selectedSignoff!.linkedWorkProofIds, workProof.id]
                            : props.selectedSignoff!.linkedWorkProofIds.filter((item) => item !== workProof.id);
                          const primaryLinkedWorkProofId =
                            props.selectedSignoff!.linkedWorkProofId && linkedWorkProofIds.includes(props.selectedSignoff!.linkedWorkProofId)
                              ? props.selectedSignoff!.linkedWorkProofId
                              : linkedWorkProofIds[0] ?? null;
                          props.setSignoffLocal(props.selectedSignoff!.id, {
                            linkedWorkProofId: primaryLinkedWorkProofId,
                            linkedWorkProofIds,
                          });
                          void props.saveSignoffFields(
                            props.selectedSignoff!.id,
                            {
                              linkedWorkProofId: primaryLinkedWorkProofId,
                              linkedWorkProofIds,
                            },
                            "Evidence link updated",
                            linkedWorkProofIds.length > 0 ? `${linkedWorkProofIds.length} work log link(s)` : "Work log links cleared"
                          );
                        }}
                        className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                        disabled={props.isSaving}
                      />
                      <span className={`${interMedium.className} text-[14px] text-[var(--text-primary)]`}>
                        {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[var(--text-primary)]`}>Note</span>
              <textarea
                value={props.selectedSignoff.note}
                onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { note: event.target.value })}
                onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { note: event.target.value }, "Note updated")}
                className={`${interMedium.className} min-h-[96px] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
                disabled={props.isSaving}
              />
            </label>

            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[var(--text-primary)]`}>Evidence</p>
              <p className={`${interMedium.className} text-xs text-[var(--text-secondary)]`}>
                Linked work logs: {props.selectedSignoff.linkedWorkProofIds.length > 0 ? props.selectedSignoff.linkedWorkProofIds.map((workProofId) => props.workProofs.find((item) => item.id === workProofId)?.note ?? workProofId).join(" • ") : "None"}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                Linked inspection: {props.selectedSignoff.linkedInspectionId ? props.inspectionIndex.get(props.selectedSignoff.linkedInspectionId)?.title ?? props.selectedSignoff.linkedInspectionId : "None"}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                Linked issue: {props.selectedSignoff.linkedIssueId ? props.issueIndex.get(props.selectedSignoff.linkedIssueId)?.title ?? props.selectedSignoff.linkedIssueId : "None"}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>Sign-off evidence photos: {props.signoffEvidencePhotos.length}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {props.signoffEvidencePhotos.slice(0, 6).map((photo) => (
                  <button key={photo.id} type="button" onClick={() => props.openPhotoDetail(photo.id)} className="h-16 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--border)]">
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.photoUrl} alt={photo.title || "Evidence"} className="h-full w-full object-cover" />
                    </>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[var(--text-primary)]`}>Sign-Off Validation</p>
              <p className={`${interMedium.className} text-xs text-[var(--text-secondary)]`}>Open issues: {props.signoffQaBlockers.openIssues}</p>
              {props.signoffQaBlockers.usingWorkProofScope ? (
                <>
                  <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>Work logs with incomplete checklist: {props.signoffQaBlockers.incompleteChecklistProofs}</p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>Work logs missing evidence: {props.signoffQaBlockers.missingEvidenceProofs}</p>
                </>
              ) : (
                <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>Incomplete inspections: {props.signoffQaBlockers.incompleteInspections}</p>
              )}
              <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>Evidence photos: {props.signoffQaBlockers.evidenceCount}</p>
              {props.signoffQaBlockers.openIssues > 0 ||
              props.signoffQaBlockers.incompleteInspections > 0 ||
              props.signoffQaBlockers.incompleteChecklistProofs > 0 ||
              props.signoffQaBlockers.missingEvidenceProofs > 0 ||
              props.signoffQaBlockers.evidenceCount === 0 ? (
                <p className={`${interMedium.className} mt-2 text-xs font-semibold text-[var(--error)]`}>
                  {props.signoffQaBlockers.usingWorkProofScope ? "Cannot sign off — linked work log requirements are not complete" : "Cannot sign off — incomplete QA items"}
                </p>
              ) : null}
            </div>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]`}>Action Note</span>
              <textarea
                value={props.signoffActionNote}
                onChange={(event) => props.setSignoffActionNote(event.target.value)}
                className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-0`}
              />
            </label>

            {props.canCurrentUserSignoff ? (
              <div className="flex gap-2">
                <Button type="button" onClick={() => void props.updateSignoffStatus(props.selectedSignoff!.id, "Signed")} disabled={props.isSaving} className="h-9 rounded-[6px] bg-[var(--text-primary)] px-3 text-xs text-white hover:bg-[var(--text-primary)]">
                  Sign-Off
                </Button>
                <Button type="button" variant="outline" onClick={() => void props.updateSignoffStatus(props.selectedSignoff!.id, "Rejected")} disabled={props.isSaving} className="h-9 rounded-[6px] border-[var(--error-light)] bg-[var(--error-light)] px-3 text-xs text-[var(--error)] hover:bg-[var(--error-light)]">
                  Reject
                </Button>
              </div>
            ) : (
              <p className={`${interMedium.className} text-xs text-[var(--text-secondary)]`}>Assigned to {props.selectedSignoff.assignee || "another user"}.</p>
            )}

            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[var(--text-primary)]`}>Activity</p>
              <div className="space-y-2">
                {props.signoffActivity.map((entry) => (
                  <div key={entry.id} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                    <p className={`${interMedium.className} text-xs font-semibold text-[var(--text-primary)]`}>
                      {formatTimestamp(entry.createdAt)} - {entry.action}
                    </p>
                    <p className={`${interMedium.className} mt-1 text-xs text-[var(--text-secondary)]`}>
                      {entry.actorName || "Unknown"}
                      {entry.detail ? ` - ${entry.detail}` : ""}
                    </p>
                  </div>
                ))}
                {props.signoffActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[var(--text-secondary)]`}>No activity yet.</p> : null}
              </div>
            </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
                Cancel
              </Button>
              <Button type="button" onClick={props.onSaveAndClose} disabled={props.isSaving || !props.selectedSignoff.title.trim()} className="h-10 rounded-[10px] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-70">
                Save Sign-Off
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-36 animate-pulse rounded bg-[var(--border)]" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
