import type {
  InspectionStatus,
  IssueStatus,
  LinkedTask,
  PhotoLinkFilter,
  PhotoPhase,
  PhotoType,
  QualityInspection,
  QualityInspectionItem,
  QualityIssue,
  QualityIssueStats,
  QualityPhoto,
  QualitySignOff,
  QualityWorkProof,
  QualityWorkProofChecklistItem,
  SignOffStatus,
} from "@/lib/quality-assurance/types";

function normalizeSeedText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLegacySeedIssueTitle(title: string) {
  const normalized = normalizeSeedText(title);
  return normalized.includes("crack in plaster") || normalized.includes("waterproofing seam gap") || normalized.includes("door hardware alignment");
}

export function isLegacySeedInspectionTitle(title: string) {
  const normalized = normalizeSeedText(title);
  return normalized === "framing inspection" || normalized === "waterproofing check";
}

export function isLegacySeedSignOffTitle(title: string) {
  const normalized = normalizeSeedText(title);
  return normalized === "internal qa sign-off" || normalized === "client sign-off" || normalized === "final completion";
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "photo";
}

export function looksLikeHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function looksLikeStoragePath(value: string) {
  if (!value || looksLikeHttpUrl(value) || value.startsWith("data:")) {
    return false;
  }
  return value.split("/").length >= 5;
}

export function statusTone(status: IssueStatus) {
  if (status === "Open") {
    return "bg-rose-100 text-rose-800 border-rose-200";
  }
  if (status === "In Progress") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (status === "Blocked") {
    return "bg-slate-200 text-slate-800 border-slate-300";
  }
  if (status === "Requires Attention") {
    return "bg-orange-100 text-orange-800 border-orange-200";
  }
  if (status === "Verified") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export function signOffTone(status: SignOffStatus) {
  if (status === "Signed") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  if (status === "Rejected") {
    return "bg-rose-100 text-rose-800 border-rose-200";
  }
  if (status === "Requested") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function inspectionStatusTone(status: InspectionStatus) {
  if (status === "Not Started") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  if (status === "In Progress") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isOverdue(dateIso: string | null, status: IssueStatus) {
  if (!dateIso || status === "Complete" || status === "Verified") {
    return false;
  }
  const dueDate = new Date(`${dateIso}T23:59:59.999Z`);
  return dueDate.getTime() < Date.now();
}

export function normalizeSourceType(value: unknown): LinkedTask["source_type"] {
  if (value === "quality_issue" || value === "quality_inspection_item") {
    return value;
  }
  if (value === "qa_issue") {
    return "quality_issue";
  }
  if (value === "inspection_fail") {
    return "quality_inspection_item";
  }
  return null;
}

export function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toIsoDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export function normalizePhotoType(value: unknown): PhotoType {
  if (value === "issue" || value === "inspection" || value === "general" || value === "work_proof") {
    return value;
  }
  return "general";
}

export function workProofStatusTone(status: QualityWorkProof["status"]) {
  if (status === "linked_to_signoff") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function getWorkProofChecklistProgress(items: QualityWorkProofChecklistItem[]) {
  const total = items.length;
  const checked = items.filter((item) => item.checked).length;
  return { checked, total };
}

export function normalizePhotoPhase(value: unknown): PhotoPhase {
  if (value === "before" || value === "during" || value === "after") {
    return value;
  }
  return "";
}

export function getInspectionProgress(items: QualityInspectionItem[]) {
  const complete = items.filter((item) => item.status !== null).length;
  const total = items.length;
  return { complete, total };
}

export function getInspectionStatus(items: QualityInspectionItem[]): InspectionStatus {
  const { complete, total } = getInspectionProgress(items);
  if (total === 0 || complete === 0) {
    return "Not Started";
  }
  if (complete < total) {
    return "In Progress";
  }
  return "Complete";
}

export function calculateIssueStats(
  issues: QualityIssue[],
  inspections: QualityInspection[],
  workProofs: QualityWorkProof[],
  signOffs: QualitySignOff[]
): QualityIssueStats {
  void inspections;
  const openCount = issues.filter((item) => item.status !== "Complete" && item.status !== "Verified").length;
  const inProgressCount = issues.filter((item) => item.status === "In Progress").length;
  const completeCount = issues.filter((item) => item.status === "Complete" || item.status === "Verified").length;
  const overdueCount = issues.filter((item) => isOverdue(item.dueDate, item.status)).length;
  const workProofCount = workProofs.length;
  const workProofsCompleted = workProofs.filter((item) => item.status !== "draft").length;
  const pendingSignoffs = signOffs.filter((item) => item.status === "Pending" || item.status === "Requested").length;
  const signedWorkProofIds = new Set(
    signOffs
      .filter((item) => item.status === "Signed")
      .flatMap((item) => item.linkedWorkProofIds)
  );
  const completedWithoutSignoff = workProofs.filter(
    (item) => item.status !== "draft" && !signedWorkProofIds.has(item.id)
  ).length;

  return {
    workProofCount,
    openCount,
    inProgressCount,
    completeCount,
    overdueCount,
    inspectionsToday: 0,
    workProofsCompleted,
    pendingSignoffs,
    completedWithoutSignoff,
  };
}

export function filterWorkProofs(
  workProofs: QualityWorkProof[],
  filters: {
    search: string;
    status: string;
    tradeType: string;
    workCategory: string;
    area: string;
  }
) {
  return workProofs.filter((item) => {
    const search = filters.search.trim().toLowerCase();
    if (search) {
      const haystack = `${item.note} ${item.tradeType} ${item.workCategory} ${item.area}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (filters.status !== "All" && item.status !== filters.status) {
      return false;
    }
    if (filters.tradeType !== "All" && item.tradeType !== filters.tradeType) {
      return false;
    }
    if (filters.workCategory !== "All" && item.workCategory !== filters.workCategory) {
      return false;
    }
    if (filters.area !== "All" && item.area !== filters.area) {
      return false;
    }
    return true;
  });
}

export function filterIssues(
  issues: QualityIssue[],
  filters: {
    search: string;
    status: string;
    trade: string;
    assignee: string;
    location: string;
    due: string;
  }
) {
  const today = new Date().toISOString().slice(0, 10);
  return issues.filter((item) => {
    const search = filters.search.trim().toLowerCase();
    if (search) {
      const haystack = `${item.title} ${item.description} ${item.trade} ${item.location}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (filters.status !== "All" && item.status !== filters.status) {
      return false;
    }
    if (filters.trade !== "All" && item.trade !== filters.trade) {
      return false;
    }
    if (filters.assignee !== "All" && item.assignee !== filters.assignee) {
      return false;
    }
    if (filters.location !== "All" && item.location !== filters.location) {
      return false;
    }
    if (filters.due === "Overdue" && !isOverdue(item.dueDate, item.status)) {
      return false;
    }
    if (filters.due === "Due Today" && item.dueDate !== today) {
      return false;
    }
    if (filters.due === "No Due Date" && item.dueDate) {
      return false;
    }
    return true;
  });
}

export function filterInspections(
  inspections: QualityInspection[],
  filters: {
    search: string;
    status: string;
    trade: string;
    assignee: string;
    location: string;
    due: string;
  }
) {
  const today = new Date().toISOString().slice(0, 10);
  return inspections.filter((inspection) => {
    const status = getInspectionStatus(inspection.items);
    const search = filters.search.trim().toLowerCase();
    if (search) {
      const haystack = `${inspection.title} ${inspection.trade} ${inspection.location}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (filters.status !== "All" && status !== filters.status) {
      return false;
    }
    if (filters.trade !== "All" && inspection.trade !== filters.trade) {
      return false;
    }
    if (filters.assignee !== "All" && inspection.assignee !== filters.assignee) {
      return false;
    }
    if (filters.location !== "All" && inspection.location !== filters.location) {
      return false;
    }
    if (filters.due === "Overdue" && !(inspection.dueDate && inspection.dueDate < today && status !== "Complete")) {
      return false;
    }
    if (filters.due === "Due Today" && inspection.dueDate !== today) {
      return false;
    }
    if (filters.due === "No Due Date" && inspection.dueDate) {
      return false;
    }
    return true;
  });
}

export function filterSignOffs(
  signOffs: QualitySignOff[],
  filters: {
    search: string;
    status: string;
    type: string;
    trade: string;
    assignee: string;
    due: string;
  }
) {
  const today = new Date().toISOString().slice(0, 10);
  return signOffs.filter((item) => {
    const search = filters.search.trim().toLowerCase();
    if (search) {
      const haystack = `${item.title} ${item.type} ${item.trade} ${item.location}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (filters.status !== "All" && item.status !== filters.status) {
      return false;
    }
    if (filters.type !== "All" && item.type !== filters.type) {
      return false;
    }
    if (filters.trade !== "All" && item.trade !== filters.trade) {
      return false;
    }
    if (filters.assignee !== "All" && item.assignee !== filters.assignee) {
      return false;
    }
    if (filters.due === "Overdue" && !(item.dueDate && item.dueDate < today && item.status !== "Signed")) {
      return false;
    }
    if (filters.due === "Due Today" && item.dueDate !== today) {
      return false;
    }
    if (filters.due === "No Due Date" && item.dueDate) {
      return false;
    }
    return true;
  });
}

export function filterPhotos(
  photos: QualityPhoto[],
  filters: {
    search: string;
    trade: string;
    area: string;
    category: string;
    link: PhotoLinkFilter;
    assignee: string;
    signoff: string;
    dateFrom: string;
    dateTo: string;
  }
) {
  return photos.filter((entry) => {
    const search = filters.search.trim().toLowerCase();
    if (search) {
      const haystack = `${entry.title} ${entry.notes} ${entry.trade} ${entry.location} ${entry.category}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (filters.trade !== "All" && entry.trade !== filters.trade) {
      return false;
    }
    if (filters.area !== "All" && entry.location !== filters.area) {
      return false;
    }
    if (filters.category !== "All" && entry.category !== filters.category) {
      return false;
    }
    if (filters.link === "Issue" && !entry.linkedIssueId) {
      return false;
    }
    if (filters.link === "Inspection" && !entry.linkedInspectionId) {
      return false;
    }
    if (filters.link === "Work Proof" && !entry.linkedWorkProofId) {
      return false;
    }
    if (filters.link === "General" && (entry.linkedIssueId || entry.linkedInspectionId || entry.linkedWorkProofId)) {
      return false;
    }
    if (filters.assignee !== "All" && (entry.assignedUserId ?? "") !== filters.assignee) {
      return false;
    }
    if (filters.signoff !== "All") {
      const expected = filters.signoff === "Yes";
      if (entry.hasSignoffEvidence !== expected) {
        return false;
      }
    }
    if (filters.dateFrom && entry.capturedAt.slice(0, 10) < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && entry.capturedAt.slice(0, 10) > filters.dateTo) {
      return false;
    }
    return true;
  });
}

export function groupPhotosByTimeline(photos: QualityPhoto[]) {
  const groups = new Map<string, QualityPhoto[]>();
  for (const entry of photos) {
    const key = entry.capturedAt.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function buildIssuePhotoCoverMap(photos: QualityPhoto[]) {
  const map = new Map<string, string>();
  for (const photo of photos) {
    if (photo.linkedIssueId && !map.has(photo.linkedIssueId)) {
      map.set(photo.linkedIssueId, photo.photoUrl);
    }
  }
  return map;
}

export function buildIssuePhotoCountMap(photos: QualityPhoto[]) {
  const map = new Map<string, number>();
  for (const photo of photos) {
    if (photo.linkedIssueId) {
      map.set(photo.linkedIssueId, (map.get(photo.linkedIssueId) ?? 0) + 1);
    }
  }
  return map;
}

export function buildWorkProofPhotoCoverMap(photos: QualityPhoto[]) {
  const map = new Map<string, string>();
  for (const photo of photos) {
    if (photo.linkedWorkProofId && !map.has(photo.linkedWorkProofId)) {
      map.set(photo.linkedWorkProofId, photo.photoUrl);
    }
  }
  return map;
}

export function buildWorkProofPhotoCountMap(photos: QualityPhoto[]) {
  const map = new Map<string, number>();
  for (const photo of photos) {
    if (photo.linkedWorkProofId) {
      map.set(photo.linkedWorkProofId, (map.get(photo.linkedWorkProofId) ?? 0) + 1);
    }
  }
  return map;
}

export function buildInspectionItemIndex(inspections: QualityInspection[]) {
  const map = new Map<string, { inspectionId: string; inspectionTitle: string; itemLabel: string; itemStatus: QualityInspectionItem["status"] }>();
  for (const inspection of inspections) {
    for (const item of inspection.items) {
      map.set(item.id, {
        inspectionId: inspection.id,
        inspectionTitle: inspection.title,
        itemLabel: item.label,
        itemStatus: item.status,
      });
    }
  }
  return map;
}

export function getRelatedPhotos(photos: QualityPhoto[], selectedPhoto: QualityPhoto | null) {
  if (!selectedPhoto) {
    return [];
  }
  return photos
    .filter((item) => {
      if (item.id === selectedPhoto.id) {
        return false;
      }
      return (
        (selectedPhoto.linkedWorkProofId && item.linkedWorkProofId === selectedPhoto.linkedWorkProofId) ||
        (selectedPhoto.linkedIssueId && item.linkedIssueId === selectedPhoto.linkedIssueId) ||
        (selectedPhoto.linkedInspectionId && item.linkedInspectionId === selectedPhoto.linkedInspectionId) ||
        item.location === selectedPhoto.location
      );
    })
    .slice(0, 6);
}

export function getSignoffEvidencePhotos(photos: QualityPhoto[], selectedSignoff: QualitySignOff | null) {
  if (!selectedSignoff) {
    return [];
  }
  const linkedWorkProofIds = new Set(selectedSignoff.linkedWorkProofIds);
  return photos.filter((photo) => {
    if (photo.linkedWorkProofId && linkedWorkProofIds.has(photo.linkedWorkProofId)) {
      return true;
    }
    if (!photo.hasSignoffEvidence) {
      return false;
    }
    if (selectedSignoff.linkedIssueId && photo.linkedIssueId === selectedSignoff.linkedIssueId) {
      return true;
    }
    if (selectedSignoff.linkedInspectionId && photo.linkedInspectionId === selectedSignoff.linkedInspectionId) {
      return true;
    }
    if (selectedSignoff.location && photo.location && selectedSignoff.location === photo.location) {
      return true;
    }
    if (selectedSignoff.trade && photo.trade && selectedSignoff.trade === photo.trade) {
      return true;
    }
    return linkedWorkProofIds.size === 0 && !selectedSignoff.linkedIssueId && !selectedSignoff.linkedInspectionId;
  });
}

export function getSignoffQaBlockers(
  issues: QualityIssue[],
  inspections: QualityInspection[],
  workProofs: QualityWorkProof[],
  photos: QualityPhoto[],
  selectedSignoff: QualitySignOff | null
) {
  const linkedWorkProofIds = selectedSignoff ? selectedSignoff.linkedWorkProofIds : [];
  if (linkedWorkProofIds.length > 0) {
    const workProofIdSet = new Set(linkedWorkProofIds);
    const openIssues = issues.filter(
      (item) =>
        item.linkedWorkProofId &&
        workProofIdSet.has(item.linkedWorkProofId) &&
        item.status !== "Complete" &&
        item.status !== "Verified"
    ).length;
    const linkedWorkProofs = workProofs.filter((item) => workProofIdSet.has(item.id));
    const incompleteChecklistProofs = linkedWorkProofs.filter(
      (item) => item.checklistItems.length > 0 && item.checklistItems.some((checklistItem) => !checklistItem.checked)
    ).length;
    const missingEvidenceProofs = linkedWorkProofs.filter(
      (item) => !photos.some((photo) => photo.linkedWorkProofId === item.id)
    ).length;

    return {
      openIssues,
      incompleteInspections: 0,
      incompleteChecklistProofs,
      missingEvidenceProofs,
      evidenceCount: photos.filter((photo) => !!photo.linkedWorkProofId && workProofIdSet.has(photo.linkedWorkProofId)).length,
      usingWorkProofScope: true,
    };
  }

  const evidenceCount = getSignoffEvidencePhotos(photos, selectedSignoff).length;
  const openIssues = issues.filter((item) => item.status !== "Complete" && item.status !== "Verified").length;
  const incompleteInspections = inspections.filter((inspection) => getInspectionStatus(inspection.items) !== "Complete").length;
  return {
    openIssues,
    incompleteInspections,
    incompleteChecklistProofs: 0,
    missingEvidenceProofs: evidenceCount === 0 ? 1 : 0,
    evidenceCount,
    usingWorkProofScope: false,
  };
}

export function canCurrentUserActionSignoff(selectedSignoff: QualitySignOff | null, sessionUserId: string | null | undefined) {
  if (!selectedSignoff) {
    return false;
  }
  if (!selectedSignoff.assigneeUserId) {
    return true;
  }
  if (!sessionUserId) {
    return false;
  }
  return selectedSignoff.assigneeUserId === sessionUserId;
}
