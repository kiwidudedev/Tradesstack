"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp } from "@/lib/quality-assurance/helpers";
import type {
  IssueStatus,
  OrganizationUserOption,
  QualityIssue,
  QualityIssueActivity,
  QualityIssueComment,
  QualityWorkProof,
} from "@/lib/quality-assurance/types";

interface CreateQualityIssueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newIssueTitle: string;
  setNewIssueTitle: (value: string) => void;
  newIssueDescription: string;
  setNewIssueDescription: (value: string) => void;
  newIssueTrade: string;
  setNewIssueTrade: (value: string) => void;
  newIssueLocation: string;
  setNewIssueLocation: (value: string) => void;
  newIssuePriority: "Low" | "Medium" | "High";
  setNewIssuePriority: (value: "Low" | "Medium" | "High") => void;
  newIssueStatus: IssueStatus;
  setNewIssueStatus: (value: IssueStatus) => void;
  newIssueDueDate: string;
  setNewIssueDueDate: (value: string) => void;
  newIssueAssigneeUserId: string;
  setNewIssueAssigneeUserId: (value: string) => void;
  newIssueLinkedWorkProofId: string;
  setNewIssueLinkedWorkProofId: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  workProofs: QualityWorkProof[];
  isSaving: boolean;
  onCreate: () => void;
}

export function CreateQualityIssueSheet(props: CreateQualityIssueSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <div className="space-y-0">
          <div className="px-7 pb-6 pt-7">
            <p className={`${interMedium.className} text-[13px] font-semibold text-[#64748B]`}>New issue</p>
            <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">Add QA Issue</h3>
          </div>

          <div className="space-y-3.5 px-7 pb-4">
          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Title</span>
            <Input value={props.newIssueTitle} onChange={(event) => props.setNewIssueTitle(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
          </label>

          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Notes</span>
            <textarea
              value={props.newIssueDescription}
              onChange={(event) => props.setNewIssueDescription(event.target.value)}
              className={`${interMedium.className} min-h-[96px] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] text-[#10283B] outline-none transition focus:border-[#F15A29]`}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Trade</span>
              <Input value={props.newIssueTrade} onChange={(event) => props.setNewIssueTrade(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Location</span>
              <Input value={props.newIssueLocation} onChange={(event) => props.setNewIssueLocation(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Priority</span>
              <select value={props.newIssuePriority} onChange={(event) => props.setNewIssuePriority(event.target.value as "Low" | "Medium" | "High")} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Status</span>
              <select value={props.newIssueStatus} onChange={(event) => props.setNewIssueStatus(event.target.value as IssueStatus)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Blocked">Blocked</option>
                <option value="Requires Attention">Requires Attention</option>
                <option value="Complete">Complete</option>
                <option value="Verified">Verified</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Due Date</span>
              <Input type="date" value={props.newIssueDueDate} onChange={(event) => props.setNewIssueDueDate(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Assigned To</span>
              <select value={props.newIssueAssigneeUserId} onChange={(event) => props.setNewIssueAssigneeUserId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Linked Work Log</span>
            <select value={props.newIssueLinkedWorkProofId} onChange={(event) => props.setNewIssueLinkedWorkProofId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
              <option value="">No work log link</option>
              {props.workProofs.map((workProof) => (
                <option key={workProof.id} value={workProof.id}>
                  {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                </option>
              ))}
            </select>
          </label>

          <p className={`${interMedium.className} text-[12px] text-[#64748B]`}>Linked task is created automatically for active issues.</p>

          </div>

          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
              Cancel
            </Button>
            <Button type="button" onClick={props.onCreate} disabled={props.isSaving || !props.newIssueTitle.trim()} className="h-10 rounded-[10px] bg-[#F15A29] px-5 text-[14px] font-semibold text-white hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-70">
              Add Issue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface QualityIssueDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIssue: QualityIssue | null;
  organizationUserOptions: OrganizationUserOption[];
  issueComments: QualityIssueComment[];
  issueActivity: QualityIssueActivity[];
  issuePhotoUrlDraft: string;
  setIssuePhotoUrlDraft: (value: string) => void;
  issueCommentDraft: string;
  setIssueCommentDraft: (value: string) => void;
  isSaving: boolean;
  issuePhotoFileDraft: File | null;
  setIssuePhotoFileDraft: (file: File | null) => void;
  setIssueLocal: (issueId: string, patch: Partial<QualityIssue>) => void;
  saveIssueFields: (issueId: string, patch: Partial<QualityIssue>, activityAction?: string, activityDetail?: string) => Promise<void>;
  setIssueStatus: (issueId: string, status: IssueStatus) => Promise<void>;
  setIssueAssignee: (issueId: string, assigneeUserId: string) => Promise<void>;
  workProofs: QualityWorkProof[];
  handleIssuePhotoFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  addIssuePhoto: () => Promise<void>;
  addIssueComment: () => Promise<void>;
  deleteIssue: (issueId: string) => Promise<void>;
  onSaveAndClose: () => void;
}

export function QualityIssueDetailSheet(props: QualityIssueDetailSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        {props.selectedIssue ? (
          <div className="space-y-0">
            <div className="px-7 pb-6 pt-7">
              <p className={`${interMedium.className} text-[13px] font-semibold text-[#64748B]`}>Issue detail</p>
              <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">{props.selectedIssue.title || "Issue"}</h3>
            </div>

            <div className="space-y-3.5 px-7 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Title</span>
                <Input
                  value={props.selectedIssue.title}
                  onChange={(event) => props.setIssueLocal(props.selectedIssue!.id, { title: event.target.value })}
                  onBlur={(event) => void props.saveIssueFields(props.selectedIssue!.id, { title: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Title updated")}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Description</span>
                <textarea
                  value={props.selectedIssue.description}
                  onChange={(event) => props.setIssueLocal(props.selectedIssue!.id, { description: event.target.value })}
                  onBlur={(event) => void props.saveIssueFields(props.selectedIssue!.id, { description: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Description updated")}
                  disabled={props.isSaving}
                  className={`${interMedium.className} min-h-[96px] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Trade</span>
                <Input
                  value={props.selectedIssue.trade}
                  onChange={(event) => props.setIssueLocal(props.selectedIssue!.id, { trade: event.target.value })}
                  onBlur={(event) => void props.saveIssueFields(props.selectedIssue!.id, { trade: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Trade updated")}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Location</span>
                <Input
                  value={props.selectedIssue.location}
                  onChange={(event) => props.setIssueLocal(props.selectedIssue!.id, { location: event.target.value })}
                  onBlur={(event) => void props.saveIssueFields(props.selectedIssue!.id, { location: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Location updated")}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Status</span>
                <select
                  value={props.selectedIssue.status}
                  onChange={(event) => void props.setIssueStatus(props.selectedIssue!.id, event.target.value as IssueStatus)}
                  disabled={props.isSaving}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Requires Attention">Requires Attention</option>
                  <option value="Complete">Complete</option>
                  <option value="Verified">Verified</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Priority</span>
                <select
                  value={props.selectedIssue.priority}
                  onChange={(event) => {
                    const priority = event.target.value as "Low" | "Medium" | "High";
                    props.setIssueLocal(props.selectedIssue!.id, { priority });
                    void props.saveIssueFields(props.selectedIssue!.id, { priority, updatedAt: new Date().toISOString() }, "Priority changed", `Priority set to ${priority}`);
                  }}
                  disabled={props.isSaving}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Assignee</span>
                <select
                  value={props.selectedIssue.assigneeUserId ?? ""}
                  onChange={(event) => void props.setIssueAssignee(props.selectedIssue!.id, event.target.value)}
                  disabled={props.isSaving}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}
                >
                  {props.organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Due Date</span>
                <Input
                  type="date"
                  value={props.selectedIssue.dueDate ?? ""}
                  onChange={(event) => props.setIssueLocal(props.selectedIssue!.id, { dueDate: event.target.value || null })}
                  onBlur={(event) => void props.saveIssueFields(props.selectedIssue!.id, { dueDate: event.target.value || null, updatedAt: new Date().toISOString() }, "Due date changed", event.target.value ? `Due ${event.target.value}` : "Due date cleared")}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Linked Work Log</span>
                <select
                  value={props.selectedIssue.linkedWorkProofId ?? ""}
                  onChange={(event) => {
                    const linkedWorkProofId = event.target.value || null;
                    props.setIssueLocal(props.selectedIssue!.id, { linkedWorkProofId });
                    void props.saveIssueFields(props.selectedIssue!.id, { linkedWorkProofId }, "Work log linked");
                  }}
                  disabled={props.isSaving}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}
                >
                  <option value="">No work log link</option>
                  {props.workProofs.map((workProof) => (
                    <option key={workProof.id} value={workProof.id}>
                      {workProof.tradeType || "Work"} • {workProof.workCategory || "Proof"} • {workProof.area || "Area"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Add Photos</p>
              <div className="flex gap-2">
                <Input type="file" accept="image/*" onChange={(event) => void props.handleIssuePhotoFileSelect(event)} className="h-9 border-[#CBD5E1]" disabled={props.isSaving} />
                <Input
                  value={props.issuePhotoUrlDraft}
                  onChange={(event) => {
                    props.setIssuePhotoUrlDraft(event.target.value);
                    props.setIssuePhotoFileDraft(null);
                  }}
                  className="h-9 border-[#CBD5E1]"
                  disabled={props.isSaving}
                />
                <Button
                  type="button"
                  onClick={() => void props.addIssuePhoto()}
                  disabled={props.isSaving || (!props.issuePhotoUrlDraft.trim() && !props.issuePhotoFileDraft)}
                  className="h-9 rounded-[6px] bg-[#F74917] px-3 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Comments</p>
              <div className="space-y-2">
                {props.issueComments.map((entry) => (
                  <div key={entry.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                    <p className={`${interMedium.className} text-xs font-semibold text-[#0F172A]`}>{entry.authorName || "Unknown"}</p>
                    <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>{entry.comment}</p>
                    <p className={`${interMedium.className} mt-1 text-[11px] text-[#64748B]`}>{formatTimestamp(entry.createdAt)}</p>
                  </div>
                ))}
                {props.issueComments.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No comments yet.</p> : null}
                <div className="flex gap-2">
                  <Input value={props.issueCommentDraft} onChange={(event) => props.setIssueCommentDraft(event.target.value)} className="h-9 border-[#CBD5E1] bg-white" />
                  <Button type="button" onClick={() => void props.addIssueComment()} disabled={props.isSaving || !props.issueCommentDraft.trim()} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Activity</p>
              <div className="space-y-2">
                {props.issueActivity.map((entry) => (
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
                {props.issueActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No activity yet.</p> : null}
              </div>
            </div>

            <Button type="button" variant="outline" onClick={() => void props.deleteIssue(props.selectedIssue!.id)} disabled={props.isSaving} className="h-9 rounded-[6px] border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100">
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete Issue
            </Button>
            </div>

            <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                Cancel
              </Button>
              <Button type="button" onClick={props.onSaveAndClose} disabled={props.isSaving || !props.selectedIssue.title.trim()} className="h-10 rounded-[10px] bg-[#F15A29] px-5 text-[14px] font-semibold text-white hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-70">
                Save Issue
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-36 animate-pulse rounded bg-[#E2E8F0]" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
