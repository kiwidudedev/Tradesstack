"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp, signOffTone } from "@/lib/quality-assurance/helpers";
import type {
  OrganizationUserOption,
  QualityInspection,
  QualityIssue,
  QualityPhoto,
  QualitySignOff,
  QualitySignOffActivity,
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
  newSignoffLinkedInspectionId: string;
  setNewSignoffLinkedInspectionId: (value: string) => void;
  newSignoffLinkedIssueId: string;
  setNewSignoffLinkedIssueId: (value: string) => void;
  newSignoffNote: string;
  setNewSignoffNote: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  inspections: QualityInspection[];
  issues: QualityIssue[];
  isSaving: boolean;
  onCreate: () => void;
}

export function CreateQualitySignoffSheet(props: CreateQualitySignoffSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
        <div className="space-y-4 pr-6">
          <div>
            <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>New Sign-Off</p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Add Sign-Off</h3>
          </div>
          <label className="space-y-1">
            <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
            <Input value={props.newSignoffTitle} onChange={(event) => props.setNewSignoffTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Type</span>
              <select value={props.newSignoffType} onChange={(event) => props.setNewSignoffType(event.target.value as SignOffType)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="Internal">Internal</option>
                <option value="Client">Client</option>
                <option value="Council">Council</option>
                <option value="Final Handover">Final Handover</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
              <Input type="date" value={props.newSignoffDueDate} onChange={(event) => props.setNewSignoffDueDate(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
              <Input value={props.newSignoffTrade} onChange={(event) => props.setNewSignoffTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
              <Input value={props.newSignoffLocation} onChange={(event) => props.setNewSignoffLocation(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
              <select value={props.newSignoffAssigneeUserId} onChange={(event) => props.setNewSignoffAssigneeUserId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <select value={props.newSignoffLinkedInspectionId} onChange={(event) => props.setNewSignoffLinkedInspectionId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
              <option value="">Link inspection (optional)</option>
              {props.inspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.title}
                </option>
              ))}
            </select>
            <select value={props.newSignoffLinkedIssueId} onChange={(event) => props.setNewSignoffLinkedIssueId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
              <option value="">Link issue (optional)</option>
              {props.issues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.title}
                </option>
              ))}
            </select>
          </div>
          <label className="space-y-1">
            <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Note</span>
            <textarea
              value={props.newSignoffNote}
              onChange={(event) => props.setNewSignoffNote(event.target.value)}
              className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
            />
          </label>
          <Button type="button" onClick={props.onCreate} disabled={props.isSaving || !props.newSignoffTitle.trim()} className="h-10 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70">
            Add Sign-Off
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface QualitySignoffDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSignoff: QualitySignOff | null;
  isSaving: boolean;
  inspections: QualityInspection[];
  issues: QualityIssue[];
  organizationUserOptions: OrganizationUserOption[];
  organizationUserNameById: Map<string, string>;
  inspectionIndex: Map<string, QualityInspection>;
  issueIndex: Map<string, QualityIssue>;
  signoffEvidencePhotos: QualityPhoto[];
  signoffQaBlockers: { openIssues: number; incompleteInspections: number; evidenceCount: number };
  signoffActivity: QualitySignOffActivity[];
  signoffActionNote: string;
  setSignoffActionNote: (value: string) => void;
  canCurrentUserSignoff: boolean;
  setSignoffLocal: (signoffId: string, patch: Partial<QualitySignOff>) => void;
  saveSignoffFields: (signoffId: string, patch: Partial<QualitySignOff>, activityAction?: string, activityDetail?: string) => Promise<void>;
  updateSignoffStatus: (signoffId: string, status: SignOffStatus) => Promise<void>;
  openPhotoDetail: (photoId: string) => void;
}

export function QualitySignoffDetailSheet(props: QualitySignoffDetailSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[620px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
        {props.selectedSignoff ? (
          <div className="space-y-4 pr-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>Sign-Off Detail</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">{props.selectedSignoff.title || "Sign-Off"}</h3>
              </div>
              <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${signOffTone(props.selectedSignoff.status)}`}>
                {props.selectedSignoff.status}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
                <Input
                  value={props.selectedSignoff.title}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { title: event.target.value })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { title: event.target.value.trim() }, "Details updated", "Title updated")}
                  className="h-10 border-[#CBD5E1] bg-white"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Type</span>
                <select
                  value={props.selectedSignoff.type}
                  onChange={(event) => {
                    const type = event.target.value as SignOffType;
                    props.setSignoffLocal(props.selectedSignoff!.id, { type });
                    void props.saveSignoffFields(props.selectedSignoff!.id, { type }, "Type changed", type);
                  }}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  disabled={props.isSaving}
                >
                  <option value="Internal">Internal</option>
                  <option value="Client">Client</option>
                  <option value="Council">Council</option>
                  <option value="Final Handover">Final Handover</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
                <Input
                  type="date"
                  value={props.selectedSignoff.dueDate ?? ""}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { dueDate: event.target.value || null })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { dueDate: event.target.value || null }, "Due date changed", event.target.value || "Cleared")}
                  className="h-10 border-[#CBD5E1] bg-white"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                <Input
                  value={props.selectedSignoff.trade}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { trade: event.target.value })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { trade: event.target.value.trim() }, "Details updated", "Trade updated")}
                  className="h-10 border-[#CBD5E1] bg-white"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                <Input
                  value={props.selectedSignoff.location}
                  onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { location: event.target.value })}
                  onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { location: event.target.value.trim() }, "Details updated", "Location updated")}
                  className="h-10 border-[#CBD5E1] bg-white"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                <select
                  value={props.selectedSignoff.assigneeUserId ?? ""}
                  onChange={(event) => {
                    const assigneeUserId = event.target.value || null;
                    const assignee = assigneeUserId ? props.organizationUserNameById.get(assigneeUserId) ?? "" : "";
                    props.setSignoffLocal(props.selectedSignoff!.id, { assigneeUserId, assignee });
                    void props.saveSignoffFields(props.selectedSignoff!.id, { assigneeUserId, assignee }, "Assignment updated", assignee || "Unassigned");
                  }}
                  className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
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

            <div className="grid gap-2 md:grid-cols-2">
              <select
                value={props.selectedSignoff.linkedInspectionId ?? ""}
                onChange={(event) => {
                  const linkedInspectionId = event.target.value || null;
                  props.setSignoffLocal(props.selectedSignoff!.id, { linkedInspectionId });
                  void props.saveSignoffFields(props.selectedSignoff!.id, { linkedInspectionId }, "Evidence link updated", linkedInspectionId ? "Inspection linked" : "Inspection unlinked");
                }}
                className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
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
                className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
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

            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Note</span>
              <textarea
                value={props.selectedSignoff.note}
                onChange={(event) => props.setSignoffLocal(props.selectedSignoff!.id, { note: event.target.value })}
                onBlur={(event) => void props.saveSignoffFields(props.selectedSignoff!.id, { note: event.target.value }, "Note updated")}
                className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
                disabled={props.isSaving}
              />
            </label>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Evidence</p>
              <p className={`${interMedium.className} text-xs text-[#334155]`}>
                Linked inspection: {props.selectedSignoff.linkedInspectionId ? props.inspectionIndex.get(props.selectedSignoff.linkedInspectionId)?.title ?? props.selectedSignoff.linkedInspectionId : "None"}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                Linked issue: {props.selectedSignoff.linkedIssueId ? props.issueIndex.get(props.selectedSignoff.linkedIssueId)?.title ?? props.selectedSignoff.linkedIssueId : "None"}
              </p>
              <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>Sign-off evidence photos: {props.signoffEvidencePhotos.length}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {props.signoffEvidencePhotos.slice(0, 6).map((photo) => (
                  <button key={photo.id} type="button" onClick={() => props.openPhotoDetail(photo.id)} className="h-16 overflow-hidden rounded-[6px] border border-[#E6EAF0] bg-[#E2E8F0]">
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.photoUrl} alt={photo.title || "Evidence"} className="h-full w-full object-cover" />
                    </>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Sign-Off Validation</p>
              <p className={`${interMedium.className} text-xs text-[#334155]`}>Open issues: {props.signoffQaBlockers.openIssues}</p>
              <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>Incomplete inspections: {props.signoffQaBlockers.incompleteInspections}</p>
              <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>Evidence photos: {props.signoffQaBlockers.evidenceCount}</p>
              {props.signoffQaBlockers.openIssues > 0 || props.signoffQaBlockers.incompleteInspections > 0 || props.signoffQaBlockers.evidenceCount === 0 ? (
                <p className={`${interMedium.className} mt-2 text-xs font-semibold text-rose-700`}>Cannot sign off — incomplete QA items</p>
              ) : null}
            </div>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Action Note</span>
              <textarea
                value={props.signoffActionNote}
                onChange={(event) => props.setSignoffActionNote(event.target.value)}
                className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
              />
            </label>

            {props.canCurrentUserSignoff ? (
              <div className="flex gap-2">
                <Button type="button" onClick={() => void props.updateSignoffStatus(props.selectedSignoff!.id, "Signed")} disabled={props.isSaving} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                  Sign-Off
                </Button>
                <Button type="button" variant="outline" onClick={() => void props.updateSignoffStatus(props.selectedSignoff!.id, "Rejected")} disabled={props.isSaving} className="h-9 rounded-[6px] border-rose-200 bg-rose-50 px-3 text-xs text-rose-700 hover:bg-rose-100">
                  Reject
                </Button>
              </div>
            ) : (
              <p className={`${interMedium.className} text-xs text-[#64748B]`}>Assigned to {props.selectedSignoff.assignee || "another user"}.</p>
            )}

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Activity</p>
              <div className="space-y-2">
                {props.signoffActivity.map((entry) => (
                  <div key={entry.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                    <p className={`${interMedium.className} text-xs font-semibold text-[#0F172A]`}>
                      {formatTimestamp(entry.createdAt)} - {entry.action}
                    </p>
                    <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                      {entry.actorName || "Unknown"}
                      {entry.detail ? ` - ${entry.detail}` : ""}
                    </p>
                  </div>
                ))}
                {props.signoffActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No activity yet.</p> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-36 animate-pulse rounded bg-[#E2E8F0]" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
