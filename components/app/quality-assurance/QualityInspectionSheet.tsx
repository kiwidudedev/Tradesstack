"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { formatTimestamp, getInspectionProgress, getInspectionStatus, inspectionStatusTone } from "@/lib/quality-assurance/helpers";
import type { OrganizationUserOption, QualityInspection, QualityInspectionActivity, QualityInspectionItem } from "@/lib/quality-assurance/types";
import { cn } from "@/lib/utils";

interface CreateQualityInspectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newInspectionTitle: string;
  setNewInspectionTitle: (value: string) => void;
  newInspectionTrade: string;
  setNewInspectionTrade: (value: string) => void;
  newInspectionLocation: string;
  setNewInspectionLocation: (value: string) => void;
  newInspectionAssigneeUserId: string;
  setNewInspectionAssigneeUserId: (value: string) => void;
  newInspectionDueDate: string;
  setNewInspectionDueDate: (value: string) => void;
  newInspectionTemplate: string;
  setNewInspectionTemplate: (value: string) => void;
  organizationUserOptions: OrganizationUserOption[];
  inspectionTemplates: Array<{ label: string; value: string }>;
  isSaving: boolean;
  onCreate: () => void;
}

export function CreateQualityInspectionSheet(props: CreateQualityInspectionSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <div className="space-y-0">
          <div className="px-7 pb-6 pt-7">
            <p className={`${interMedium.className} text-[13px] font-semibold text-[#64748B]`}>New inspection</p>
            <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">Add Inspection</h3>
          </div>
          <div className="space-y-3.5 px-7 pb-4">
          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Title</span>
            <Input value={props.newInspectionTitle} onChange={(event) => props.setNewInspectionTitle(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Trade</span>
              <Input value={props.newInspectionTrade} onChange={(event) => props.setNewInspectionTrade(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Location</span>
              <Input value={props.newInspectionLocation} onChange={(event) => props.setNewInspectionLocation(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Assigned To</span>
              <select value={props.newInspectionAssigneeUserId} onChange={(event) => props.setNewInspectionAssigneeUserId(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
                {props.organizationUserOptions.map((member) => (
                  <option key={member.userId || "none"} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Due Date</span>
              <Input type="date" value={props.newInspectionDueDate} onChange={(event) => props.setNewInspectionDueDate(event.target.value)} className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]" />
            </label>
          </div>
          <label className="space-y-1">
            <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Template</span>
            <select value={props.newInspectionTemplate} onChange={(event) => props.setNewInspectionTemplate(event.target.value)} className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}>
              {props.inspectionTemplates.map((template) => (
                <option key={template.label} value={template.value}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          </div>
          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
              Cancel
            </Button>
            <Button type="button" onClick={props.onCreate} disabled={props.isSaving || !props.newInspectionTitle.trim()} className="h-10 rounded-[10px] bg-[#F15A29] px-5 text-[14px] font-semibold text-white hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-70">
              Add Inspection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface QualityInspectionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInspection: QualityInspection | null;
  organizationUserOptions: OrganizationUserOption[];
  organizationUserNameById: Map<string, string>;
  inspectionActivity: QualityInspectionActivity[];
  newInspectionItemLabel: string;
  setNewInspectionItemLabel: (value: string) => void;
  isSaving: boolean;
  setInspectionLocal: (inspectionId: string, patch: Partial<QualityInspection>) => void;
  saveInspectionFields: (inspectionId: string, patch: Partial<QualityInspection>, activityAction?: string, activityDetail?: string) => Promise<void>;
  setInspectionItemLocal: (itemId: string, patch: Partial<QualityInspectionItem>) => void;
  updateChecklistStatus: (inspectionId: string, itemId: string, status: "pass" | "fail" | null) => Promise<void>;
  saveChecklistText: (inspectionId: string, itemId: string, key: "notes" | "photo_url", value: string) => Promise<void>;
  handleInspectionItemPhotoFileSelect: (inspectionId: string, itemId: string, event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  addInspectionPhotoToLog: (inspectionId: string, item: QualityInspectionItem) => Promise<void>;
  createIssueFromInspectionFail: (inspectionId: string, item: QualityInspectionItem) => Promise<void>;
  addInspectionItem: () => Promise<void>;
}

export function QualityInspectionDetailSheet(props: QualityInspectionDetailSheetProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        {props.selectedInspection ? (
          <div className="space-y-0">
            <div className="px-7 pb-6 pt-7">
              <p className={`${interMedium.className} text-[13px] font-semibold text-[#64748B]`}>Inspection detail</p>
              <h3 className="mt-1 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]">{props.selectedInspection.title || "Inspection"}</h3>
              <p className={`${interMedium.className} mt-2 text-[12px] text-[#64748B]`}>
                {getInspectionProgress(props.selectedInspection.items).complete} / {getInspectionProgress(props.selectedInspection.items).total} complete
              </p>
            </div>

            <div className="space-y-3.5 px-7 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Title</span>
                <Input
                  value={props.selectedInspection.title}
                  onChange={(event) => props.setInspectionLocal(props.selectedInspection!.id, { title: event.target.value })}
                  onBlur={(event) => void props.saveInspectionFields(props.selectedInspection!.id, { title: event.target.value.trim() }, "Details updated", "Title updated")}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Trade</span>
                <Input
                  value={props.selectedInspection.trade}
                  onChange={(event) => props.setInspectionLocal(props.selectedInspection!.id, { trade: event.target.value })}
                  onBlur={(event) => void props.saveInspectionFields(props.selectedInspection!.id, { trade: event.target.value.trim() }, "Details updated", "Trade updated")}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Location</span>
                <Input
                  value={props.selectedInspection.location}
                  onChange={(event) => props.setInspectionLocal(props.selectedInspection!.id, { location: event.target.value })}
                  onBlur={(event) => void props.saveInspectionFields(props.selectedInspection!.id, { location: event.target.value.trim() }, "Details updated", "Location updated")}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                  disabled={props.isSaving}
                />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-[13px] font-semibold text-[#1d2433]`}>Assigned To</span>
                <select
                  value={props.selectedInspection.assigneeUserId ?? ""}
                  onChange={(event) => {
                    const assigneeUserId = event.target.value || null;
                    const assignee = assigneeUserId ? props.organizationUserNameById.get(assigneeUserId) ?? "" : "";
                    props.setInspectionLocal(props.selectedInspection!.id, { assigneeUserId, assignee });
                    void props.saveInspectionFields(props.selectedInspection!.id, { assigneeUserId, assignee }, "Assignment updated", assignee || "Assignee cleared");
                  }}
                  className={`${interMedium.className} h-[2.75rem] w-full rounded-[10px] border border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]`}
                  disabled={props.isSaving}
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
                  value={props.selectedInspection.dueDate ?? ""}
                  onChange={(event) => props.setInspectionLocal(props.selectedInspection!.id, { dueDate: event.target.value || null })}
                  onBlur={(event) => void props.saveInspectionFields(props.selectedInspection!.id, { dueDate: event.target.value || null }, "Due date changed", event.target.value ? `Due ${event.target.value}` : "Due date cleared")}
                  className="h-[2.75rem] border-[#D9E3EE] bg-white px-3.5 text-[14px] text-[#10283B]"
                  disabled={props.isSaving}
                />
              </label>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Checklist</p>
                <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${inspectionStatusTone(getInspectionStatus(props.selectedInspection.items))}`}>
                  {getInspectionStatus(props.selectedInspection.items)}
                </span>
              </div>
              <div className="space-y-3">
                {props.selectedInspection.items.map((item) => (
                  <div key={item.id} className="rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{item.label}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void props.updateChecklistStatus(props.selectedInspection!.id, item.id, "pass")}
                          disabled={props.isSaving}
                          className={cn(
                            `${interMedium.className} rounded-[6px] border px-2.5 py-1 text-xs font-semibold`,
                            item.status === "pass" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-[#CBD5E1] bg-white text-[#475569]"
                          )}
                        >
                          Pass
                        </button>
                        <button
                          type="button"
                          onClick={() => void props.updateChecklistStatus(props.selectedInspection!.id, item.id, "fail")}
                          disabled={props.isSaving}
                          className={cn(
                            `${interMedium.className} rounded-[6px] border px-2.5 py-1 text-xs font-semibold`,
                            item.status === "fail" ? "border-rose-300 bg-rose-100 text-rose-900" : "border-[#CBD5E1] bg-white text-[#475569]"
                          )}
                        >
                          Fail
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Input
                        value={item.notes}
                        onChange={(event) => props.setInspectionItemLocal(item.id, { notes: event.target.value })}
                        onBlur={(event) => void props.saveChecklistText(props.selectedInspection!.id, item.id, "notes", event.target.value)}
                        className="h-9 border-[#CBD5E1] bg-white"
                        disabled={props.isSaving}
                      />
                      <Input
                        value={item.photoUrl}
                        onChange={(event) => props.setInspectionItemLocal(item.id, { photoUrl: event.target.value })}
                        onBlur={(event) => void props.saveChecklistText(props.selectedInspection!.id, item.id, "photo_url", event.target.value)}
                        className="h-9 border-[#CBD5E1] bg-white"
                        disabled={props.isSaving}
                      />
                      <Input type="file" accept="image/*" onChange={(event) => void props.handleInspectionItemPhotoFileSelect(props.selectedInspection!.id, item.id, event)} className="h-9 border-[#CBD5E1] bg-white" disabled={props.isSaving} />
                      <div className="flex gap-2">
                        <Button type="button" onClick={() => void props.addInspectionPhotoToLog(props.selectedInspection!.id, item)} disabled={props.isSaving || !item.photoUrl.trim()} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                          Add to Photo Log
                        </Button>
                        {item.status === "fail" ? (
                          <Button type="button" variant="outline" onClick={() => void props.createIssueFromInspectionFail(props.selectedInspection!.id, item)} disabled={props.isSaving} className="h-9 rounded-[6px] border-[#CBD5E1] bg-white text-xs text-[#334155]">
                            Create Issue
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {props.selectedInspection.items.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No checklist items yet.</p> : null}
                <div className="flex gap-2">
                  <Input value={props.newInspectionItemLabel} onChange={(event) => props.setNewInspectionItemLabel(event.target.value)} className="h-9 border-[#CBD5E1] bg-white" />
                  <Button type="button" onClick={() => void props.addInspectionItem()} disabled={props.isSaving || !props.newInspectionItemLabel.trim()} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                    Add Item
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
              <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Activity</p>
              <div className="space-y-2">
                {props.inspectionActivity.map((entry) => (
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
                {props.inspectionActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No activity yet.</p> : null}
              </div>
            </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                Cancel
              </Button>
              <Button type="button" onClick={() => props.onOpenChange(false)} className="h-10 rounded-[10px] bg-[#F15A29] px-5 text-[14px] font-semibold text-white hover:bg-[#db4d1f]">
                Done
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
