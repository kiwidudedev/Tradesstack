"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp, getWorkProofChecklistProgress, workProofStatusTone } from "@/lib/quality-assurance/helpers";
import type {
  OrganizationUserOption,
  QualityIssue,
  QualityPhoto,
  QualitySignOff,
  QualityWorkProof,
  WorkProofStatus,
} from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";

interface CreateQualityWorkProofSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newWorkProofTradeType: string;
  setNewWorkProofTradeType: (value: string) => void;
  newWorkProofCategory: string;
  setNewWorkProofCategory: (value: string) => void;
  newWorkProofArea: string;
  setNewWorkProofArea: (value: string) => void;
  newWorkProofNote: string;
  setNewWorkProofNote: (value: string) => void;
  newWorkProofStatus: WorkProofStatus;
  setNewWorkProofStatus: (value: WorkProofStatus) => void;
  newWorkProofChecklistDrafts: string[];
  setNewWorkProofChecklistDraft: (index: number, value: string) => void;
  newWorkProofFileName: string;
  handleNewWorkProofPhotoFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isSaving: boolean;
  onCreate: () => void;
}

export function CreateQualityWorkProofSheet(props: CreateQualityWorkProofSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <div className="space-y-0">
          <div className="px-7 pb-6 pt-7">
            <p className={`${interMedium.className} text-[13px] font-semibold text-[#64748B]`}>New work log</p>
            <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">Log Work</h3>
          </div>

          <div className="space-y-3.5 px-7 pb-4">
            <div className="space-y-2">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Photo Proof</span>
              <label className="flex cursor-pointer items-center justify-between rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 py-3 hover:bg-[#F8FAFC]">
                <span className={`${interMedium.className} text-[14px] font-medium text-[#10283B]`}>{props.newWorkProofFileName || "Choose photo"}</span>
                <span className={`${interMedium.className} rounded-[8px] bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white`}>Browse</span>
                <input type="file" accept="image/*" onChange={(event) => void props.handleNewWorkProofPhotoFileSelect(event)} className="hidden" />
              </label>
              <p className={`${interMedium.className} text-[12px] text-[#64748B]`}>
                Add at least one photo to show what was completed. These photos can also be used as sign-off evidence.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Trade Type</span>
                <Input value={props.newWorkProofTradeType} onChange={(event) => props.setNewWorkProofTradeType(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Work Category</span>
                <Input value={props.newWorkProofCategory} onChange={(event) => props.setNewWorkProofCategory(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
              </label>
            </div>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Area / Location</span>
              <Input value={props.newWorkProofArea} onChange={(event) => props.setNewWorkProofArea(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>What was done</span>
              <Input
                value={props.newWorkProofNote}
                onChange={(event) => props.setNewWorkProofNote(event.target.value)}
                placeholder="e.g. Bathroom framing complete"
                className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
              />
              <p className={`${interMedium.className} text-[12px] text-[#64748B]`}>This title is shown everywhere the work log appears.</p>
            </label>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Status</span>
              <select value={props.newWorkProofStatus} onChange={(event) => props.setNewWorkProofStatus(event.target.value as WorkProofStatus)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
                <option value="draft">Draft</option>
                <option value="completed">Completed</option>
                <option value="linked_to_signoff">Linked To Sign-Off</option>
              </select>
            </label>

            <div className="space-y-2">
              <p className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Checklist</p>
              {props.newWorkProofChecklistDrafts.map((item, index) => (
                <Input
                  key={index}
                  value={item}
                  onChange={(event) => props.setNewWorkProofChecklistDraft(index, event.target.value)}
                  placeholder={`Checklist item ${index + 1}`}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={props.onCreate}
              disabled={
                props.isSaving ||
                !props.newWorkProofTradeType.trim() ||
                !props.newWorkProofCategory.trim() ||
                !props.newWorkProofArea.trim() ||
                !props.newWorkProofNote.trim() ||
                !props.newWorkProofFileName
              }
              className="h-10 rounded-[10px] bg-[#F15A29] px-5 text-[14px] font-semibold text-white hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Log Work
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface QualityWorkProofDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedWorkProof: QualityWorkProof | null;
  selectedWorkProofPhotos: QualityPhoto[];
  selectedWorkProofIssues: QualityIssue[];
  selectedWorkProofSignoffs: QualitySignOff[];
  organizationUsers: OrganizationUserOption[];
  organizationUserNameById: Map<string, string>;
  workProofIssueLinkId: string;
  setWorkProofIssueLinkId: (value: string) => void;
  isSaving: boolean;
  setWorkProofLocal: (workProofId: string, patch: Partial<QualityWorkProof>) => void;
  updateWorkProofChecklistItem: (workProofId: string, itemId: string, checked: boolean) => Promise<void>;
  saveWorkProofFields: (workProofId: string, patch: Partial<QualityWorkProof>) => Promise<void>;
  openPhotoDetail: (photoId: string) => void;
  openIssueDetail: (issueId: string) => void;
  openSignoffDetail: (signoffId: string) => void;
  createIssueFromWorkProof: (workProofId: string) => Promise<void>;
  onSaveAndClose: () => void;
}

export function QualityWorkProofDetailSheet(props: QualityWorkProofDetailSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        {props.selectedWorkProof ? (
          <div className="space-y-0">
            <div className="flex items-start justify-between gap-2 px-7 pb-6 pt-7">
              <div>
                <p className={`${interMedium.className} text-[13px] font-semibold text-[#64748B]`}>Edit work log</p>
                <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">{props.selectedWorkProof.note || "Work completed"}</h3>
                <p className={`${interMedium.className} mt-2 text-[12px] text-[#64748B]`}>
                  {props.organizationUserNameById.get(props.selectedWorkProof.createdBy) ?? "Team Member"} • {formatTimestamp(props.selectedWorkProof.createdAt)}
                </p>
              </div>
              <span className={cn(`${interMedium.className} rounded-full border px-3 py-1 text-[12px] font-medium`, workProofStatusTone(props.selectedWorkProof.status))}>
                {props.selectedWorkProof.status.replaceAll("_", " ")}
              </span>
            </div>

            <div className="space-y-3.5 px-7 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Trade Type</span>
                <Input
                  value={props.selectedWorkProof.tradeType}
                  onChange={(event) => props.setWorkProofLocal(props.selectedWorkProof!.id, { tradeType: event.target.value })}
                  onBlur={(event) => void props.saveWorkProofFields(props.selectedWorkProof!.id, { tradeType: event.target.value.trim() })}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Work Category</span>
                <Input
                  value={props.selectedWorkProof.workCategory}
                  onChange={(event) => props.setWorkProofLocal(props.selectedWorkProof!.id, { workCategory: event.target.value })}
                  onBlur={(event) => void props.saveWorkProofFields(props.selectedWorkProof!.id, { workCategory: event.target.value.trim() })}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Area / Location</span>
                <Input
                  value={props.selectedWorkProof.area}
                  onChange={(event) => props.setWorkProofLocal(props.selectedWorkProof!.id, { area: event.target.value })}
                  onBlur={(event) => void props.saveWorkProofFields(props.selectedWorkProof!.id, { area: event.target.value.trim() })}
                  disabled={props.isSaving}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>What was done</span>
                <Input
                  value={props.selectedWorkProof.note}
                  onChange={(event) => props.setWorkProofLocal(props.selectedWorkProof!.id, { note: event.target.value })}
                  onBlur={(event) => void props.saveWorkProofFields(props.selectedWorkProof!.id, { note: event.target.value.trim() })}
                  disabled={props.isSaving}
                  placeholder="e.g. Level 1 GIB install"
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                />
                <p className={`${interMedium.className} text-[12px] text-[#64748B]`}>Use a clear title that explains the completed work.</p>
              </label>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Checklist</p>
                <span className={`${interMedium.className} text-xs text-[#64748B]`}>
                  {getWorkProofChecklistProgress(props.selectedWorkProof.checklistItems).checked} / {getWorkProofChecklistProgress(props.selectedWorkProof.checklistItems).total}
                </span>
              </div>
              <div className="space-y-2">
                {props.selectedWorkProof.checklistItems.map((item) => (
                  <label key={item.id} className={`${interMedium.className} flex items-center gap-2 rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#1E293B]`}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) => void props.updateWorkProofChecklistItem(props.selectedWorkProof!.id, item.id, event.target.checked)}
                      disabled={props.isSaving}
                    />
                    <span>{item.label}</span>
                    {item.checkedAt ? <span className="ml-auto text-[11px] text-[#64748B]">{formatTimestamp(item.checkedAt)}</span> : null}
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Evidence Photos</p>
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>{props.selectedWorkProofPhotos.length} linked</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {props.selectedWorkProofPhotos.slice(0, 6).map((photo) => (
                  <button key={photo.id} type="button" onClick={() => props.openPhotoDetail(photo.id)} className="h-20 overflow-hidden rounded-[6px] border border-[#E6EAF0] bg-[#E2E8F0]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.photoUrl} alt={photo.title || "Work log evidence"} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Linked Issues</p>
                  <Button type="button" variant="outline" onClick={() => void props.createIssueFromWorkProof(props.selectedWorkProof!.id)} disabled={props.isSaving} className="h-8 border-[#CBD5E1] bg-white px-2 text-[11px] text-[#334155]">
                    Raise Issue
                  </Button>
                </div>
                <div className="space-y-1">
                  {props.selectedWorkProofIssues.map((issue) => (
                    <button key={issue.id} type="button" onClick={() => props.openIssueDetail(issue.id)} className={`${interMedium.className} block text-left text-xs text-[#334155] underline`}>
                      {issue.title}
                    </button>
                  ))}
                  {props.selectedWorkProofIssues.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No linked issues.</p> : null}
                </div>
              </div>
              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Linked Sign-Offs</p>
                <div className="space-y-1">
                  {props.selectedWorkProofSignoffs.map((signoff) => (
                    <button key={signoff.id} type="button" onClick={() => props.openSignoffDetail(signoff.id)} className={`${interMedium.className} block text-left text-xs text-[#334155] underline`}>
                      {signoff.title} • {signoff.status}
                    </button>
                  ))}
                  {props.selectedWorkProofSignoffs.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No linked sign-offs.</p> : null}
                </div>
              </div>
            </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                Cancel
              </Button>
              <Button type="button" onClick={props.onSaveAndClose} disabled={props.isSaving || !props.selectedWorkProof.note.trim()} className="h-10 rounded-[10px] bg-[#F15A29] px-5 text-[14px] font-semibold text-white hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-70">
                Save Work Log
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
