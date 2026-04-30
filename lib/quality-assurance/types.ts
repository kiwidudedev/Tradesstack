export type QaTab = "Overview" | "Work Proof" | "Issues" | "Sign-Offs" | "Photo Log" | "Inspections";
export type IssueStatus = "Open" | "In Progress" | "Blocked" | "Requires Attention" | "Complete" | "Verified";
export type ChecklistStatus = "pass" | "fail" | null;
export type InspectionStatus = "Not Started" | "In Progress" | "Complete";
export type SignOffStatus = "Pending" | "Requested" | "Signed" | "Rejected";
export type SignOffType = "Internal" | "Client" | "Council" | "Final Handover";
export type PhotoType = "issue" | "inspection" | "general" | "work_proof";
export type PhotoPhase = "before" | "during" | "after" | "";
export type PhotoLinkMode = "none" | "issue" | "inspection" | "work_proof";
export type PhotoLinkFilter = "All" | "Issue" | "Inspection" | "Work Proof" | "General";
export type PhotoViewMode = "list" | "grid" | "timeline";
export type Priority = "Low" | "Medium" | "High";
export type WorkProofStatus = "draft" | "completed" | "linked_to_signoff";

export interface ProjectContext {
  organizationId: string;
  projectId: string;
}

export interface OrganizationUserOption {
  userId: string;
  name: string;
}

export interface QualityIssue {
  id: string;
  title: string;
  description: string;
  trade: string;
  tradeType: string;
  workCategory: string;
  location: string;
  area: string;
  priority: Priority;
  dueDate: string | null;
  assignee: string;
  assigneeUserId: string | null;
  linkedWorkProofId: string | null;
  closedAt: string | null;
  status: IssueStatus;
  updatedAt: string;
}

export interface QualityIssueComment {
  id: string;
  issueId: string;
  authorName: string;
  comment: string;
  createdAt: string;
}

export interface QualityIssueActivity {
  id: string;
  issueId: string;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface QualityInspectionItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  notes: string;
  photoUrl: string;
  photoStoragePath: string | null;
}

export interface QualityInspection {
  id: string;
  title: string;
  trade: string;
  location: string;
  assignee: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  templateName: string;
  scheduledAt: string;
  items: QualityInspectionItem[];
}

export interface QualityInspectionActivity {
  id: string;
  inspectionId: string;
  inspectionItemId: string | null;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface QualitySignOff {
  id: string;
  title: string;
  type: SignOffType;
  trade: string;
  tradeType: string;
  workCategory: string;
  location: string;
  area: string;
  assignee: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  linkedWorkProofId: string | null;
  linkedWorkProofIds: string[];
  linkedInspectionId: string | null;
  linkedIssueId: string | null;
  note: string;
  status: SignOffStatus;
  signedBy: string | null;
  signedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  createdAt: string;
}

export interface QualitySignOffActivity {
  id: string;
  signoffId: string;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface LinkedTask {
  id: string;
  title: string;
  source_type: "quality_issue" | "quality_inspection_item" | null;
  is_completed: boolean;
}

export interface QualityPhoto {
  id: string;
  title: string;
  notes: string;
  photoUrl: string;
  trade: string;
  tradeType: string;
  workCategory: string;
  location: string;
  area: string;
  photoType: PhotoType;
  category: string;
  statusTag: string;
  phaseTag: PhotoPhase;
  assignedUserId: string | null;
  assignedUserName: string;
  hasSignoffEvidence: boolean;
  capturedAt: string;
  uploadedByName: string;
  uploadedByUserId: string | null;
  linkedWorkProofId: string | null;
  linkedIssueId: string | null;
  linkedInspectionId: string | null;
  linkedInspectionItemId: string | null;
  storagePath: string | null;
  createdAt: string;
}

export interface QualityWorkProofChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
}

export interface QualityWorkProof {
  id: string;
  tradeType: string;
  workCategory: string;
  area: string;
  note: string;
  status: WorkProofStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  checklistItems: QualityWorkProofChecklistItem[];
}

export interface QualityIssueStats {
  workProofCount: number;
  openCount: number;
  inProgressCount: number;
  completeCount: number;
  overdueCount: number;
  inspectionsToday: number;
  workProofsCompleted: number;
  pendingSignoffs: number;
  completedWithoutSignoff: number;
}

export interface QualityInspectionItemIndexValue {
  inspectionId: string;
  inspectionTitle: string;
  itemLabel: string;
  itemStatus: ChecklistStatus;
}

export interface QualityPhotoInsertPayload {
  photoUrl: string;
  storagePath?: string | null;
  title: string;
  trade: string;
  tradeType: string;
  workCategory: string;
  location: string;
  area: string;
  photoType: PhotoType;
  category: string;
  notes: string;
  statusTag: string;
  phaseTag: PhotoPhase;
  capturedAtIso: string;
  linkedWorkProofId: string | null;
  linkedIssueId: string | null;
  linkedInspectionId: string | null;
  linkedInspectionItemId: string | null;
  assignedUserId: string | null;
  assignedUserName: string;
  hasSignoffEvidence: boolean;
}

export interface QualityCoreDataResult {
  context: ProjectContext;
  workProofs: QualityWorkProof[];
  issues: QualityIssue[];
  inspections: QualityInspection[];
  signOffs: QualitySignOff[];
  todoLinks: LinkedTask[];
  organizationUsers: OrganizationUserOption[];
}

export interface QualityIssueThreadResult {
  comments: QualityIssueComment[];
  activity: QualityIssueActivity[];
}

export interface QualityInspectionThreadResult {
  activity: QualityInspectionActivity[];
}

export interface QualitySignoffThreadResult {
  activity: QualitySignOffActivity[];
}

export interface QualityPhotoUploadResult {
  storagePath: string;
  signedUrl: string;
}
