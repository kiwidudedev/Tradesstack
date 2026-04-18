"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CalendarClock, Camera, CheckCircle2, Clock3, Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import styles from "@/components/app/trade-pack-builder.module.css";

type QaTab = "Overview" | "Issues" | "Inspections" | "Photo Log" | "Sign-Offs";
type IssueStatus = "Open" | "In Progress" | "Complete" | "Verified";
type ChecklistStatus = "pass" | "fail" | null;
type InspectionStatus = "Not Started" | "In Progress" | "Complete";
type SignOffStatus = "Pending" | "Requested" | "Signed" | "Rejected";
type SignOffType = "Internal" | "Client" | "Council" | "Final Handover";
type PhotoType = "issue" | "inspection" | "general";
type PhotoPhase = "before" | "during" | "after" | "";

interface ProjectContext {
  organizationId: string;
  projectId: string;
}

interface OrganizationUserOption {
  userId: string;
  name: string;
}

interface QaIssue {
  id: string;
  title: string;
  description: string;
  trade: string;
  location: string;
  priority: "Low" | "Medium" | "High";
  dueDate: string | null;
  assignee: string;
  assigneeUserId: string | null;
  status: IssueStatus;
  updatedAt: string;
}

interface IssueComment {
  id: string;
  issueId: string;
  authorName: string;
  comment: string;
  createdAt: string;
}

interface IssueActivity {
  id: string;
  issueId: string;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

interface InspectionItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  notes: string;
  photoUrl: string;
}

interface InspectionGroup {
  id: string;
  title: string;
  trade: string;
  location: string;
  assignee: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  templateName: string;
  scheduledAt: string;
  items: InspectionItem[];
}

interface InspectionActivity {
  id: string;
  inspectionId: string;
  inspectionItemId: string | null;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

interface SignOffItem {
  id: string;
  title: string;
  type: SignOffType;
  trade: string;
  location: string;
  assignee: string;
  assigneeUserId: string | null;
  dueDate: string | null;
  linkedInspectionId: string | null;
  linkedIssueId: string | null;
  note: string;
  status: SignOffStatus;
  signedBy: string | null;
  signedAt: string | null;
  createdAt: string;
}

interface SignOffActivity {
  id: string;
  signoffId: string;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}

interface TodoLinkRow {
  id: string;
  title: string;
  source_type: "qa_issue" | "inspection_fail" | null;
  is_completed: boolean;
}

interface QaPhotoRow {
  id: string;
  title: string;
  notes: string;
  photoUrl: string;
  trade: string;
  location: string;
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
  linkedIssueId: string | null;
  linkedInspectionId: string | null;
  linkedInspectionItemId: string | null;
  createdAt: string;
}

const TABS: QaTab[] = ["Overview", "Issues", "Inspections", "Photo Log", "Sign-Offs"];
const PHOTO_CATEGORIES = [
  "Progress",
  "Defect",
  "Inspection",
  "Handover",
  "Hidden Works",
];
const PHOTO_LINK_MODES: Array<{ value: "none" | "issue" | "inspection"; label: string }> = [
  { value: "none", label: "No link" },
  { value: "issue", label: "Link to Issue" },
  { value: "inspection", label: "Link to Inspection" },
];
const PHOTO_VIEW_MODES: Array<{ value: "grid" | "timeline"; label: string }> = [
  { value: "grid", label: "Grid" },
  { value: "timeline", label: "Timeline" },
];
const PHOTO_TYPES: Array<{ value: PhotoType; label: string }> = [
  { value: "issue", label: "Issue" },
  { value: "inspection", label: "Inspection" },
  { value: "general", label: "General Site Record" },
];
const PHOTO_LINK_FILTERS: Array<{ value: "All" | "Issue" | "Inspection" | "General"; label: string }> = [
  { value: "All", label: "Any Link" },
  { value: "Issue", label: "Issue" },
  { value: "Inspection", label: "Inspection" },
  { value: "General", label: "General" },
];
const INSPECTION_TEMPLATES: Array<{ value: string; label: string; items: string[] }> = [
  {
    value: "",
    label: "No template",
    items: [],
  },
  {
    value: "Framing Inspection",
    label: "Framing Inspection",
    items: ["Stud spacing correct", "Nogging installed", "Bracing installed", "Fixings correct"],
  },
  {
    value: "Waterproofing Inspection",
    label: "Waterproofing Inspection",
    items: ["Membrane continuity", "Corners sealed", "Drain flange sealed", "Cure time met"],
  },
  {
    value: "Pre-Pour Checklist",
    label: "Pre-Pour Checklist",
    items: ["Formwork secured", "Rebar spacing checked", "Penetrations protected", "Concrete order confirmed"],
  },
];

function normalizeSeedText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isLegacySeedIssueTitle(title: string) {
  const normalized = normalizeSeedText(title);
  return normalized.includes("crack in plaster") || normalized.includes("waterproofing seam gap") || normalized.includes("door hardware alignment");
}

function isLegacySeedInspectionTitle(title: string) {
  const normalized = normalizeSeedText(title);
  return normalized === "framing inspection" || normalized === "waterproofing check";
}

function isLegacySeedSignOffTitle(title: string) {
  const normalized = normalizeSeedText(title);
  return normalized === "internal qa sign-off" || normalized === "client sign-off" || normalized === "final completion";
}

function statusTone(status: IssueStatus) {
  if (status === "Open") {
    return "bg-rose-100 text-rose-800 border-rose-200";
  }
  if (status === "In Progress") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (status === "Verified") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

function signOffTone(status: SignOffStatus) {
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

function formatTimestamp(value: string | null) {
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

function isOverdue(dateIso: string | null, status: IssueStatus) {
  if (!dateIso || status === "Complete" || status === "Verified") {
    return false;
  }
  const dueDate = new Date(`${dateIso}T23:59:59.999Z`);
  return dueDate.getTime() < Date.now();
}

function normalizeSourceType(value: unknown): TodoLinkRow["source_type"] {
  if (value === "qa_issue" || value === "inspection_fail") {
    return value;
  }
  return null;
}

function toDateTimeLocal(value: string | null) {
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

function toIsoDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizePhotoType(value: unknown): PhotoType {
  if (value === "issue" || value === "inspection" || value === "general") {
    return value;
  }
  return "general";
}

function normalizePhotoPhase(value: unknown): PhotoPhase {
  if (value === "before" || value === "during" || value === "after") {
    return value;
  }
  return "";
}

function getInspectionProgress(items: InspectionItem[]) {
  const complete = items.filter((item) => item.status !== null).length;
  const total = items.length;
  return { complete, total };
}

function getInspectionStatus(items: InspectionItem[]): InspectionStatus {
  const { complete, total } = getInspectionProgress(items);
  if (total === 0 || complete === 0) {
    return "Not Started";
  }
  if (complete < total) {
    return "In Progress";
  }
  return "Complete";
}

function inspectionStatusTone(status: InspectionStatus) {
  if (status === "Not Started") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  if (status === "In Progress") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export function ProjectQualityAssuranceBoard() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId ?? "";
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState<QaTab>("Overview");
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [issues, setIssues] = useState<QaIssue[]>([]);
  const [inspections, setInspections] = useState<InspectionGroup[]>([]);
  const [signOffs, setSignOffs] = useState<SignOffItem[]>([]);
  const [todoLinks, setTodoLinks] = useState<TodoLinkRow[]>([]);
  const [photos, setPhotos] = useState<QaPhotoRow[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isIssueSheetOpen, setIsIssueSheetOpen] = useState(false);
  const [isCreateIssueSheetOpen, setIsCreateIssueSheetOpen] = useState(false);
  const [issuePhotoUrlDraft, setIssuePhotoUrlDraft] = useState("");
  const [issueCommentDraft, setIssueCommentDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [hasLoadedPhotos, setHasLoadedPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUserOption[]>([]);

  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssueDescription, setNewIssueDescription] = useState("");
  const [newIssueTrade, setNewIssueTrade] = useState("");
  const [newIssueLocation, setNewIssueLocation] = useState("");
  const [newIssuePriority, setNewIssuePriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [newIssueStatus, setNewIssueStatus] = useState<IssueStatus>("Open");
  const [newIssueDueDate, setNewIssueDueDate] = useState("");
  const [newIssueAssigneeUserId, setNewIssueAssigneeUserId] = useState("");
  const [newIssueCreateLinkedTask, setNewIssueCreateLinkedTask] = useState(true);

  const [isCreateInspectionSheetOpen, setIsCreateInspectionSheetOpen] = useState(false);
  const [isInspectionSheetOpen, setIsInspectionSheetOpen] = useState(false);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [inspectionActivity, setInspectionActivity] = useState<InspectionActivity[]>([]);
  const [newInspectionItemLabel, setNewInspectionItemLabel] = useState("");
  const [newInspectionTitle, setNewInspectionTitle] = useState("");
  const [newInspectionTrade, setNewInspectionTrade] = useState("");
  const [newInspectionLocation, setNewInspectionLocation] = useState("");
  const [newInspectionAssigneeUserId, setNewInspectionAssigneeUserId] = useState("");
  const [newInspectionDueDate, setNewInspectionDueDate] = useState("");
  const [newInspectionTemplate, setNewInspectionTemplate] = useState("");

  const [isCreateSignoffSheetOpen, setIsCreateSignoffSheetOpen] = useState(false);
  const [isSignoffSheetOpen, setIsSignoffSheetOpen] = useState(false);
  const [selectedSignoffId, setSelectedSignoffId] = useState<string | null>(null);
  const [signoffActivity, setSignoffActivity] = useState<SignOffActivity[]>([]);
  const [newSignoffTitle, setNewSignoffTitle] = useState("");
  const [newSignoffType, setNewSignoffType] = useState<SignOffType>("Internal");
  const [newSignoffTrade, setNewSignoffTrade] = useState("");
  const [newSignoffLocation, setNewSignoffLocation] = useState("");
  const [newSignoffAssigneeUserId, setNewSignoffAssigneeUserId] = useState("");
  const [newSignoffDueDate, setNewSignoffDueDate] = useState("");
  const [newSignoffLinkedInspectionId, setNewSignoffLinkedInspectionId] = useState("");
  const [newSignoffLinkedIssueId, setNewSignoffLinkedIssueId] = useState("");
  const [newSignoffNote, setNewSignoffNote] = useState("");
  const [signoffActionNote, setSignoffActionNote] = useState("");

  const [isCreatePhotoOpen, setIsCreatePhotoOpen] = useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newPhotoTitle, setNewPhotoTitle] = useState("");
  const [newPhotoNotes, setNewPhotoNotes] = useState("");
  const [newPhotoTrade, setNewPhotoTrade] = useState("");
  const [newPhotoLocation, setNewPhotoLocation] = useState("");
  const [newPhotoLinkMode, setNewPhotoLinkMode] = useState<"none" | "issue" | "inspection">("none");
  const [newPhotoCategory, setNewPhotoCategory] = useState("Progress");
  const [newPhotoCapturedAt, setNewPhotoCapturedAt] = useState(toDateTimeLocal(new Date().toISOString()));
  const [newPhotoIssueId, setNewPhotoIssueId] = useState("");
  const [newPhotoInspectionId, setNewPhotoInspectionId] = useState("");
  const [newPhotoInspectionItemId, setNewPhotoInspectionItemId] = useState("");
  const [newPhotoAssignedUserId, setNewPhotoAssignedUserId] = useState("");
  const [newPhotoHasSignoffEvidence, setNewPhotoHasSignoffEvidence] = useState(false);
  const [newPhotoFileName, setNewPhotoFileName] = useState("");

  const [photoSearch, setPhotoSearch] = useState("");
  const [photoTradeFilter, setPhotoTradeFilter] = useState("All");
  const [photoAreaFilter, setPhotoAreaFilter] = useState("All");
  const [photoDateFromFilter, setPhotoDateFromFilter] = useState("");
  const [photoDateToFilter, setPhotoDateToFilter] = useState("");
  const [photoCategoryFilter, setPhotoCategoryFilter] = useState("All");
  const [photoLinkFilter, setPhotoLinkFilter] = useState<"All" | "Issue" | "Inspection" | "General">("All");
  const [photoSignoffFilter, setPhotoSignoffFilter] = useState("All");
  const [photoViewMode, setPhotoViewMode] = useState<"grid" | "timeline">("grid");
  const [photoAssigneeFilter, setPhotoAssigneeFilter] = useState("All");

  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isPhotoDetailOpen, setIsPhotoDetailOpen] = useState(false);
  const [isPhotoEditing, setIsPhotoEditing] = useState(false);
  const [photoEditTitle, setPhotoEditTitle] = useState("");
  const [photoEditNotes, setPhotoEditNotes] = useState("");
  const [photoEditTrade, setPhotoEditTrade] = useState("");
  const [photoEditLocation, setPhotoEditLocation] = useState("");
  const [photoEditStatusTag, setPhotoEditStatusTag] = useState("");
  const [photoEditCategory, setPhotoEditCategory] = useState("Progress");
  const [photoEditPhaseTag, setPhotoEditPhaseTag] = useState<PhotoPhase>("");
  const [photoEditType, setPhotoEditType] = useState<PhotoType>("general");
  const [photoEditIssueId, setPhotoEditIssueId] = useState("");
  const [photoEditInspectionId, setPhotoEditInspectionId] = useState("");
  const [photoEditInspectionItemId, setPhotoEditInspectionItemId] = useState("");
  const [photoEditAssignedUserId, setPhotoEditAssignedUserId] = useState("");
  const [photoEditSignoffEvidence, setPhotoEditSignoffEvidence] = useState(false);

  const [issueSearch, setIssueSearch] = useState("");
  const [issueStatusFilter, setIssueStatusFilter] = useState("All");
  const [issueTradeFilter, setIssueTradeFilter] = useState("All");
  const [issueAssigneeFilter, setIssueAssigneeFilter] = useState("All");
  const [issueLocationFilter, setIssueLocationFilter] = useState("All");
  const [issueDueFilter, setIssueDueFilter] = useState("All");
  const [inspectionSearch, setInspectionSearch] = useState("");
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState("All");
  const [inspectionTradeFilter, setInspectionTradeFilter] = useState("All");
  const [inspectionAssigneeFilter, setInspectionAssigneeFilter] = useState("All");
  const [inspectionLocationFilter, setInspectionLocationFilter] = useState("All");
  const [inspectionDueFilter, setInspectionDueFilter] = useState("All");
  const [signoffSearch, setSignoffSearch] = useState("");
  const [signoffStatusFilter, setSignoffStatusFilter] = useState("All");
  const [signoffTypeFilter, setSignoffTypeFilter] = useState("All");
  const [signoffTradeFilter, setSignoffTradeFilter] = useState("All");
  const [signoffAssigneeFilter, setSignoffAssigneeFilter] = useState("All");
  const [signoffDueFilter, setSignoffDueFilter] = useState("All");
  const [issueComments, setIssueComments] = useState<IssueComment[]>([]);
  const [issueActivity, setIssueActivity] = useState<IssueActivity[]>([]);

  const isLoadingRef = useRef(false);
  const contextRef = useRef<ProjectContext | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const selectedIssue = useMemo(() => issues.find((item) => item.id === selectedIssueId) ?? null, [issues, selectedIssueId]);
  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === selectedInspectionId) ?? null,
    [inspections, selectedInspectionId]
  );
  const selectedSignoff = useMemo(() => signOffs.find((item) => item.id === selectedSignoffId) ?? null, [signOffs, selectedSignoffId]);
  const selectedPhoto = useMemo(() => photos.find((item) => item.id === selectedPhotoId) ?? null, [photos, selectedPhotoId]);
  const organizationUserNameById = useMemo(
    () => new Map(organizationUsers.map((member) => [member.userId, member.name])),
    [organizationUsers]
  );
  const organizationUserOptions = useMemo(
    () => [{ userId: "", name: "Unassigned" }, ...organizationUsers],
    [organizationUsers]
  );
  const issueIndex = useMemo(() => new Map(issues.map((item) => [item.id, item])), [issues]);
  const inspectionIndex = useMemo(() => new Map(inspections.map((item) => [item.id, item])), [inspections]);
  const inspectionItemIndex = useMemo(() => {
    const map = new Map<string, { inspectionId: string; inspectionTitle: string; itemLabel: string; itemStatus: ChecklistStatus }>();
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
  }, [inspections]);

  const issuePhotoCoverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) {
      if (photo.linkedIssueId && !map.has(photo.linkedIssueId)) {
        map.set(photo.linkedIssueId, photo.photoUrl);
      }
    }
    return map;
  }, [photos]);
  const issuePhotoCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const photo of photos) {
      if (photo.linkedIssueId) {
        map.set(photo.linkedIssueId, (map.get(photo.linkedIssueId) ?? 0) + 1);
      }
    }
    return map;
  }, [photos]);

  const issueStats = useMemo(() => {
    const openCount = issues.filter((item) => item.status === "Open").length;
    const inProgressCount = issues.filter((item) => item.status === "In Progress").length;
    const completeCount = issues.filter((item) => item.status === "Complete" || item.status === "Verified").length;
    const overdueCount = issues.filter((item) => isOverdue(item.dueDate, item.status)).length;
    const inspectionsToday = inspections.filter((group) => {
      const date = new Date(group.scheduledAt);
      const now = new Date();
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    }).length;
    return { openCount, inProgressCount, completeCount, overdueCount, inspectionsToday };
  }, [inspections, issues]);

  const issueTradeOptions = useMemo(() => ["All", ...new Set(issues.map((item) => item.trade).filter(Boolean))], [issues]);
  const issueAssigneeOptions = useMemo(() => ["All", ...new Set(issues.map((item) => item.assignee).filter(Boolean))], [issues]);
  const issueLocationOptions = useMemo(() => ["All", ...new Set(issues.map((item) => item.location).filter(Boolean))], [issues]);
  const inspectionTradeOptions = useMemo(
    () => ["All", ...new Set(inspections.map((inspection) => inspection.trade).filter(Boolean))],
    [inspections]
  );
  const inspectionAssigneeOptions = useMemo(
    () => ["All", ...new Set(inspections.map((inspection) => inspection.assignee).filter(Boolean))],
    [inspections]
  );
  const inspectionLocationOptions = useMemo(
    () => ["All", ...new Set(inspections.map((inspection) => inspection.location).filter(Boolean))],
    [inspections]
  );
  const signoffTradeOptions = useMemo(() => ["All", ...new Set(signOffs.map((item) => item.trade).filter(Boolean))], [signOffs]);
  const signoffAssigneeOptions = useMemo(
    () => ["All", ...new Set(signOffs.map((item) => item.assignee).filter(Boolean))],
    [signOffs]
  );

  const filteredIssues = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return issues.filter((item) => {
      const search = issueSearch.trim().toLowerCase();
      if (search) {
        const haystack = `${item.title} ${item.description} ${item.trade} ${item.location}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (issueStatusFilter !== "All" && item.status !== issueStatusFilter) {
        return false;
      }
      if (issueTradeFilter !== "All" && item.trade !== issueTradeFilter) {
        return false;
      }
      if (issueAssigneeFilter !== "All" && item.assignee !== issueAssigneeFilter) {
        return false;
      }
      if (issueLocationFilter !== "All" && item.location !== issueLocationFilter) {
        return false;
      }
      if (issueDueFilter === "Overdue" && !isOverdue(item.dueDate, item.status)) {
        return false;
      }
      if (issueDueFilter === "Due Today" && item.dueDate !== today) {
        return false;
      }
      if (issueDueFilter === "No Due Date" && item.dueDate) {
        return false;
      }
      return true;
    });
  }, [issueAssigneeFilter, issueDueFilter, issueLocationFilter, issueSearch, issueStatusFilter, issueTradeFilter, issues]);

  const filteredInspections = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return inspections.filter((inspection) => {
      const status = getInspectionStatus(inspection.items);
      const search = inspectionSearch.trim().toLowerCase();
      if (search) {
        const haystack = `${inspection.title} ${inspection.trade} ${inspection.location}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (inspectionStatusFilter !== "All" && status !== inspectionStatusFilter) {
        return false;
      }
      if (inspectionTradeFilter !== "All" && inspection.trade !== inspectionTradeFilter) {
        return false;
      }
      if (inspectionAssigneeFilter !== "All" && inspection.assignee !== inspectionAssigneeFilter) {
        return false;
      }
      if (inspectionLocationFilter !== "All" && inspection.location !== inspectionLocationFilter) {
        return false;
      }
      if (inspectionDueFilter === "Overdue" && !(inspection.dueDate && inspection.dueDate < today && status !== "Complete")) {
        return false;
      }
      if (inspectionDueFilter === "Due Today" && inspection.dueDate !== today) {
        return false;
      }
      if (inspectionDueFilter === "No Due Date" && inspection.dueDate) {
        return false;
      }
      return true;
    });
  }, [
    inspectionAssigneeFilter,
    inspectionDueFilter,
    inspectionLocationFilter,
    inspectionSearch,
    inspectionStatusFilter,
    inspectionTradeFilter,
    inspections,
  ]);

  const filteredSignoffs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return signOffs.filter((item) => {
      const search = signoffSearch.trim().toLowerCase();
      if (search) {
        const haystack = `${item.title} ${item.type} ${item.trade} ${item.location}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (signoffStatusFilter !== "All" && item.status !== signoffStatusFilter) {
        return false;
      }
      if (signoffTypeFilter !== "All" && item.type !== signoffTypeFilter) {
        return false;
      }
      if (signoffTradeFilter !== "All" && item.trade !== signoffTradeFilter) {
        return false;
      }
      if (signoffAssigneeFilter !== "All" && item.assignee !== signoffAssigneeFilter) {
        return false;
      }
      if (signoffDueFilter === "Overdue" && !(item.dueDate && item.dueDate < today && item.status !== "Signed")) {
        return false;
      }
      if (signoffDueFilter === "Due Today" && item.dueDate !== today) {
        return false;
      }
      if (signoffDueFilter === "No Due Date" && item.dueDate) {
        return false;
      }
      return true;
    });
  }, [signOffs, signoffAssigneeFilter, signoffDueFilter, signoffSearch, signoffStatusFilter, signoffTradeFilter, signoffTypeFilter]);

  const photoTradeOptions = useMemo(() => ["All", ...new Set(photos.map((entry) => entry.trade).filter(Boolean))], [photos]);
  const photoAreaOptions = useMemo(() => ["All", ...new Set(photos.map((entry) => entry.location).filter(Boolean))], [photos]);
  const photoCategoryOptions = useMemo(() => ["All", ...PHOTO_CATEGORIES], []);

  const filteredPhotos = useMemo(() => {
    return photos.filter((entry) => {
      const search = photoSearch.trim().toLowerCase();
      if (search) {
        const haystack = `${entry.title} ${entry.notes} ${entry.trade} ${entry.location} ${entry.category}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (photoTradeFilter !== "All" && entry.trade !== photoTradeFilter) {
        return false;
      }
      if (photoAreaFilter !== "All" && entry.location !== photoAreaFilter) {
        return false;
      }
      if (photoCategoryFilter !== "All" && entry.category !== photoCategoryFilter) {
        return false;
      }
      if (photoLinkFilter === "Issue" && !entry.linkedIssueId) {
        return false;
      }
      if (photoLinkFilter === "Inspection" && !entry.linkedInspectionId) {
        return false;
      }
      if (photoLinkFilter === "General" && (entry.linkedIssueId || entry.linkedInspectionId)) {
        return false;
      }
      if (photoAssigneeFilter !== "All") {
        if ((entry.assignedUserId ?? "") !== photoAssigneeFilter) {
          return false;
        }
      }
      if (photoSignoffFilter !== "All") {
        const expected = photoSignoffFilter === "Yes";
        if (entry.hasSignoffEvidence !== expected) {
          return false;
        }
      }
      if (photoDateFromFilter) {
        if (entry.capturedAt.slice(0, 10) < photoDateFromFilter) {
          return false;
        }
      }
      if (photoDateToFilter) {
        if (entry.capturedAt.slice(0, 10) > photoDateToFilter) {
          return false;
        }
      }
      return true;
    });
  }, [
    photoAreaFilter,
    photoCategoryFilter,
    photoDateFromFilter,
    photoDateToFilter,
    photoLinkFilter,
    photoAssigneeFilter,
    photoSearch,
    photoSignoffFilter,
    photoTradeFilter,
    photos,
  ]);

  const timelinePhotos = useMemo(() => {
    const groups = new Map<string, QaPhotoRow[]>();
    for (const entry of filteredPhotos) {
      const key = entry.capturedAt.slice(0, 10);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredPhotos]);

  const openPhotoDetail = (photoId: string) => {
    setSelectedPhotoId(photoId);
    setIsPhotoDetailOpen(true);
  };

  useEffect(() => {
    if (!selectedPhoto) {
      return;
    }
    setPhotoEditTitle(selectedPhoto.title);
    setPhotoEditNotes(selectedPhoto.notes);
    setPhotoEditTrade(selectedPhoto.trade);
    setPhotoEditLocation(selectedPhoto.location);
    setPhotoEditStatusTag(selectedPhoto.statusTag);
    setPhotoEditCategory(selectedPhoto.category || "Progress");
    setPhotoEditPhaseTag(selectedPhoto.phaseTag);
    setPhotoEditType(selectedPhoto.photoType);
    setPhotoEditIssueId(selectedPhoto.linkedIssueId ?? "");
    setPhotoEditInspectionId(selectedPhoto.linkedInspectionId ?? "");
    setPhotoEditInspectionItemId(selectedPhoto.linkedInspectionItemId ?? "");
    setPhotoEditAssignedUserId(selectedPhoto.assignedUserId ?? "");
    setPhotoEditSignoffEvidence(selectedPhoto.hasSignoffEvidence);
  }, [selectedPhoto]);

  const resolveContext = async (): Promise<ProjectContext> => {
    if (!supabase || !session?.id || !routeProjectSlug) {
      throw new Error("Session not ready.");
    }
    if (contextRef.current) {
      return contextRef.current;
    }

    let resolvedOrganizationId = session.organizationId;
    if (!resolvedOrganizationId) {
      const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
      resolvedOrganizationId = ensuredOrganizationId ?? null;
    }
    if (!resolvedOrganizationId) {
      throw new Error("Could not resolve your organization.");
    }

    const { data: projectRow, error: projectError } = await supabase
      .from("organization_projects")
      .select("id")
      .eq("organization_id", resolvedOrganizationId)
      .eq("slug", routeProjectSlug)
      .maybeSingle();

    if (projectError || !projectRow) {
      throw new Error(projectError?.message ?? "Project not found.");
    }

    const next = { organizationId: resolvedOrganizationId, projectId: projectRow.id };
    contextRef.current = next;
    setContext(next);
    return next;
  };

  const refreshTodoLinks = async (resolvedContext?: ProjectContext) => {
    if (!supabase) {
      return;
    }
    const activeContext = resolvedContext ?? contextRef.current;
    if (!activeContext) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todosTable = (supabase as any).from("project_job_todos");
    const { data, error: todoError } = await todosTable
      .select("id, title, source_type, is_completed")
      .eq("organization_id", activeContext.organizationId)
      .eq("project_id", activeContext.projectId)
      .not("source_type", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!todoError) {
      const normalized = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? ""),
        source_type: normalizeSourceType(row.source_type),
        is_completed: Boolean(row.is_completed),
      }));
      setTodoLinks(normalized);
    }
  };

  const loadIssueThread = async (issueId: string) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const activeContext = contextRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commentsTable = (supabase as any).from("project_quality_issue_comments");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityTable = (supabase as any).from("project_quality_issue_activity");

    const [commentsResult, activityResult] = await Promise.all([
      commentsTable
        .select("id, issue_id, author_name, comment, created_at")
        .eq("organization_id", activeContext.organizationId)
        .eq("project_id", activeContext.projectId)
        .eq("issue_id", issueId)
        .order("created_at", { ascending: true })
        .limit(200),
      activityTable
        .select("id, issue_id, actor_name, action, detail, created_at")
        .eq("organization_id", activeContext.organizationId)
        .eq("project_id", activeContext.projectId)
        .eq("issue_id", issueId)
        .order("created_at", { ascending: true })
        .limit(300),
    ]);

    if (!commentsResult.error) {
      setIssueComments(
        ((commentsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          issueId: String(row.issue_id),
          authorName: String(row.author_name ?? ""),
          comment: String(row.comment ?? ""),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        }))
      );
    }
    if (!activityResult.error) {
      setIssueActivity(
        ((activityResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          issueId: String(row.issue_id),
          actorName: String(row.actor_name ?? ""),
          action: String(row.action ?? ""),
          detail: String(row.detail ?? ""),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        }))
      );
    }
  };

  const writeIssueActivity = async (issueId: string, action: string, detail = "") => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const activeContext = contextRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityTable = (supabase as any).from("project_quality_issue_activity");
    await activityTable.insert({
      organization_id: activeContext.organizationId,
      project_id: activeContext.projectId,
      issue_id: issueId,
      actor_user_id: session?.id ?? null,
      actor_name: session?.name ?? "",
      action,
      detail,
    });
  };

  const loadInspectionThread = async (inspectionId: string) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const activeContext = contextRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityTable = (supabase as any).from("project_quality_inspection_activity");
    const { data, error: activityError } = await activityTable
      .select("id, inspection_id, inspection_item_id, actor_name, action, detail, created_at")
      .eq("organization_id", activeContext.organizationId)
      .eq("project_id", activeContext.projectId)
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false })
      .limit(150);
    if (activityError) {
      return;
    }
    setInspectionActivity(
      ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        inspectionId: String(row.inspection_id),
        inspectionItemId: typeof row.inspection_item_id === "string" ? row.inspection_item_id : null,
        actorName: String(row.actor_name ?? ""),
        action: String(row.action ?? ""),
        detail: String(row.detail ?? ""),
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      }))
    );
  };

  const writeInspectionActivity = async (inspectionId: string, action: string, detail = "", inspectionItemId: string | null = null) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const activeContext = contextRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityTable = (supabase as any).from("project_quality_inspection_activity");
    await activityTable.insert({
      organization_id: activeContext.organizationId,
      project_id: activeContext.projectId,
      inspection_id: inspectionId,
      inspection_item_id: inspectionItemId,
      actor_user_id: session?.id ?? null,
      actor_name: session?.name ?? "",
      action,
      detail,
    });
  };

  const loadSignoffThread = async (signoffId: string) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const activeContext = contextRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityTable = (supabase as any).from("project_quality_signoff_activity");
    const { data, error: activityError } = await activityTable
      .select("id, signoff_id, actor_name, action, detail, created_at")
      .eq("organization_id", activeContext.organizationId)
      .eq("project_id", activeContext.projectId)
      .eq("signoff_id", signoffId)
      .order("created_at", { ascending: false })
      .limit(150);
    if (activityError) {
      return;
    }
    setSignoffActivity(
      ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        signoffId: String(row.signoff_id),
        actorName: String(row.actor_name ?? ""),
        action: String(row.action ?? ""),
        detail: String(row.detail ?? ""),
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      }))
    );
  };

  const writeSignoffActivity = async (signoffId: string, action: string, detail = "") => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const activeContext = contextRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityTable = (supabase as any).from("project_quality_signoff_activity");
    await activityTable.insert({
      organization_id: activeContext.organizationId,
      project_id: activeContext.projectId,
      signoff_id: signoffId,
      actor_user_id: session?.id ?? null,
      actor_name: session?.name ?? "",
      action,
      detail,
    });
  };

  const loadCoreData = async (options?: { showLoading?: boolean }) => {
    if (!supabase || !session?.id || !routeProjectSlug || isLoadingRef.current) {
      return;
    }
    const showLoading = options?.showLoading ?? true;
    isLoadingRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const resolvedContext = await resolveContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionsTable = (supabase as any).from("project_quality_inspections");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signOffsTable = (supabase as any).from("project_quality_sign_offs");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosTable = (supabase as any).from("project_job_todos");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const membersTable = (supabase as any).from("organization_members");

      const [issuesResult, inspectionsResult, signOffsResult, todosResult, membersResult] = await Promise.all([
        issuesTable
          .select("id, title, description, trade, location, priority, status, due_date, assignee_name, assignee_user_id, updated_at")
          .eq("organization_id", resolvedContext.organizationId)
          .eq("project_id", resolvedContext.projectId)
          .order("created_at", { ascending: false })
          .limit(400),
        inspectionsTable
          .select(
            "id, title, trade, location, assignee_name, assignee_user_id, due_date, template_name, scheduled_at, project_quality_inspection_items(id, label, status, notes, photo_url)"
          )
          .eq("organization_id", resolvedContext.organizationId)
          .eq("project_id", resolvedContext.projectId)
          .order("scheduled_at", { ascending: true })
          .limit(200),
        signOffsTable
          .select(
            "id, title, signoff_type, trade, location, assignee_name, assignee_user_id, due_date, linked_inspection_id, linked_issue_id, note, status, signed_by_name, signed_at, created_at"
          )
          .eq("organization_id", resolvedContext.organizationId)
          .eq("project_id", resolvedContext.projectId)
          .order("created_at", { ascending: true })
          .limit(50),
        todosTable
          .select("id, title, source_type, is_completed")
          .eq("organization_id", resolvedContext.organizationId)
          .eq("project_id", resolvedContext.projectId)
          .not("source_type", "is", null)
          .order("created_at", { ascending: false })
          .limit(100),
        membersTable
          .select("user_id, display_name")
          .eq("organization_id", resolvedContext.organizationId)
          .order("display_name", { ascending: true }),
      ]);

      if (issuesResult.error || inspectionsResult.error || signOffsResult.error || todosResult.error || membersResult.error) {
        throw new Error(
          issuesResult.error?.message ??
            inspectionsResult.error?.message ??
            signOffsResult.error?.message ??
            todosResult.error?.message ??
            membersResult.error?.message ??
            "Unable to load Quality Assurance."
        );
      }

      const normalizedIssues: QaIssue[] = ((issuesResult.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const priority: QaIssue["priority"] =
            row.priority === "Low"
              ? "Low"
              : row.priority === "High"
                ? "High"
                : row.priority === "Medium"
                  ? "Medium"
                  : "Medium";
          return {
            id: String(row.id),
            title: String(row.title ?? ""),
            description: String(row.description ?? ""),
            trade: String(row.trade ?? ""),
            location: String(row.location ?? ""),
            priority,
            status: (row.status as IssueStatus) ?? "Open",
            dueDate: typeof row.due_date === "string" ? row.due_date : null,
            assignee: String(row.assignee_name ?? ""),
            assigneeUserId: typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
            updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
          };
        })
        .filter((row) => !isLegacySeedIssueTitle(row.title));

      const normalizedInspections: InspectionGroup[] = ((inspectionsResult.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const nestedItems = Array.isArray(row.project_quality_inspection_items)
            ? (row.project_quality_inspection_items as Array<Record<string, unknown>>)
            : [];
          return {
            id: String(row.id),
            title: String(row.title ?? ""),
            trade: String(row.trade ?? ""),
            location: String(row.location ?? ""),
            assignee: String(row.assignee_name ?? ""),
            assigneeUserId: typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
            dueDate: typeof row.due_date === "string" ? row.due_date : null,
            templateName: String(row.template_name ?? ""),
            scheduledAt: typeof row.scheduled_at === "string" ? row.scheduled_at : new Date().toISOString(),
            items: nestedItems.map((item) => ({
              id: String(item.id),
              label: String(item.label ?? ""),
              status: (item.status as ChecklistStatus) ?? null,
              notes: String(item.notes ?? ""),
              photoUrl: String(item.photo_url ?? ""),
            })),
          };
        })
        .filter((row) => !isLegacySeedInspectionTitle(row.title));

      const normalizedSignOffs: SignOffItem[] = ((signOffsResult.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const type: SignOffItem["type"] =
            row.signoff_type === "Client"
              ? "Client"
              : row.signoff_type === "Council"
                ? "Council"
                : row.signoff_type === "Final Handover"
                  ? "Final Handover"
                  : "Internal";
          return {
            id: String(row.id),
            title: String(row.title ?? ""),
            type,
            trade: String(row.trade ?? ""),
            location: String(row.location ?? ""),
            assignee: String(row.assignee_name ?? ""),
            assigneeUserId: typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
            dueDate: typeof row.due_date === "string" ? row.due_date : null,
            linkedInspectionId: typeof row.linked_inspection_id === "string" ? row.linked_inspection_id : null,
            linkedIssueId: typeof row.linked_issue_id === "string" ? row.linked_issue_id : null,
            note: String(row.note ?? ""),
            status: (row.status as SignOffStatus) ?? "Pending",
            signedBy: typeof row.signed_by_name === "string" ? row.signed_by_name : null,
            signedAt: typeof row.signed_at === "string" ? row.signed_at : null,
            createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
          };
        })
        .filter((row) => !isLegacySeedSignOffTitle(row.title));

      const normalizedTodoLinks: TodoLinkRow[] = ((todosResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? ""),
        source_type: normalizeSourceType(row.source_type),
        is_completed: Boolean(row.is_completed),
      }));
      const normalizedMembers: OrganizationUserOption[] = ((membersResult.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => ({
          userId: String(row.user_id ?? ""),
          name: String(row.display_name ?? "").trim(),
        }))
        .filter((row) => row.userId.length > 0)
        .map((row) => ({ ...row, name: row.name || (row.userId === session.id ? session.name ?? "You" : "Team Member") }));

      setIssues(normalizedIssues);
      setInspections(normalizedInspections);
      setSignOffs(normalizedSignOffs);
      setTodoLinks(normalizedTodoLinks);
      setOrganizationUsers(normalizedMembers);
      setSelectedIssueId((current) => current ?? normalizedIssues[0]?.id ?? null);
      setSelectedInspectionId((current) => current ?? normalizedInspections[0]?.id ?? null);
      setSelectedSignoffId((current) => current ?? normalizedSignOffs[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Quality Assurance.");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
      isLoadingRef.current = false;
    }
  };

  const loadPhotos = async (options?: { force?: boolean }) => {
    if (!supabase || !session?.id || !routeProjectSlug) {
      return;
    }
    if (isPhotosLoading) {
      return;
    }
    if (hasLoadedPhotos && !options?.force) {
      return;
    }
    const resolvedContext = contextRef.current ?? (await resolveContext());
    setIsPhotosLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const photosTable = (supabase as any).from("project_quality_photos");
      const { data, error: photoError } = await photosTable
        .select(
          "id, title, notes, photo_url, trade, location, photo_type, category, status_tag, phase_tag, assigned_user_id, assigned_user_name, has_signoff_evidence, captured_at, uploaded_by_name, uploaded_by_user_id, linked_issue_id, linked_inspection_id, linked_inspection_item_id, created_at"
        )
        .eq("organization_id", resolvedContext.organizationId)
        .eq("project_id", resolvedContext.projectId)
        .order("captured_at", { ascending: false })
        .limit(1000);

      if (photoError) {
        throw new Error(photoError.message);
      }

      const normalized: QaPhotoRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        title: String(row.title ?? ""),
        notes: String(row.notes ?? ""),
        photoUrl: String(row.photo_url ?? ""),
        trade: String(row.trade ?? ""),
        location: String(row.location ?? ""),
        photoType: normalizePhotoType(row.photo_type),
        category: String(row.category ?? "Progress"),
        statusTag: String(row.status_tag ?? ""),
        phaseTag: normalizePhotoPhase(row.phase_tag),
        assignedUserId: typeof row.assigned_user_id === "string" ? row.assigned_user_id : null,
        assignedUserName: String(row.assigned_user_name ?? ""),
        hasSignoffEvidence: Boolean(row.has_signoff_evidence),
        capturedAt: typeof row.captured_at === "string" ? row.captured_at : new Date().toISOString(),
        uploadedByName: String(row.uploaded_by_name ?? ""),
        uploadedByUserId: typeof row.uploaded_by_user_id === "string" ? row.uploaded_by_user_id : null,
        linkedIssueId: typeof row.linked_issue_id === "string" ? row.linked_issue_id : null,
        linkedInspectionId: typeof row.linked_inspection_id === "string" ? row.linked_inspection_id : null,
        linkedInspectionItemId: typeof row.linked_inspection_item_id === "string" ? row.linked_inspection_item_id : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      }));

      setPhotos(normalized);
      setHasLoadedPhotos(true);
    } catch (photoLoadError) {
      setError(photoLoadError instanceof Error ? photoLoadError.message : "Unable to load photo log.");
    } finally {
      setIsPhotosLoading(false);
    }
  };

  const insertPhoto = async (payload: {
    photoUrl: string;
    title: string;
    trade: string;
    location: string;
    photoType: PhotoType;
    category: string;
    notes: string;
    statusTag: string;
    phaseTag: PhotoPhase;
    capturedAtIso: string;
    linkedIssueId: string | null;
    linkedInspectionId: string | null;
    linkedInspectionItemId: string | null;
    assignedUserId: string | null;
    assignedUserName: string;
    hasSignoffEvidence: boolean;
  }) => {
    if (!supabase || !session?.id || !context) {
      throw new Error("Context unavailable.");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photosTable = (supabase as any).from("project_quality_photos");
    const { data, error: insertError } = await photosTable
      .insert({
        organization_id: context.organizationId,
        project_id: context.projectId,
        created_by: session.id,
        uploaded_by_user_id: session.id,
        uploaded_by_name: session.name ?? "",
        photo_url: payload.photoUrl,
        title: payload.title,
        notes: payload.notes,
        trade: payload.trade,
        location: payload.location,
        photo_type: payload.photoType,
        category: payload.category,
        status_tag: payload.statusTag,
        phase_tag: payload.phaseTag || null,
        assigned_user_id: payload.assignedUserId,
        assigned_user_name: payload.assignedUserName,
        has_signoff_evidence: payload.hasSignoffEvidence,
        captured_at: payload.capturedAtIso,
        linked_issue_id: payload.linkedIssueId,
        linked_inspection_id: payload.linkedInspectionId,
        linked_inspection_item_id: payload.linkedInspectionItemId,
      })
      .select(
        "id, title, notes, photo_url, trade, location, photo_type, category, status_tag, phase_tag, assigned_user_id, assigned_user_name, has_signoff_evidence, captured_at, uploaded_by_name, uploaded_by_user_id, linked_issue_id, linked_inspection_id, linked_inspection_item_id, created_at"
      )
      .maybeSingle();

    if (insertError) {
      throw new Error(insertError.message);
    }
    if (!data) {
      return null;
    }
    const photo: QaPhotoRow = {
      id: String(data.id),
      title: String(data.title ?? ""),
      notes: String(data.notes ?? ""),
      photoUrl: String(data.photo_url ?? ""),
      trade: String(data.trade ?? ""),
      location: String(data.location ?? ""),
      photoType: normalizePhotoType(data.photo_type),
      category: String(data.category ?? "Progress"),
      statusTag: String(data.status_tag ?? ""),
      phaseTag: normalizePhotoPhase(data.phase_tag),
      assignedUserId: typeof data.assigned_user_id === "string" ? data.assigned_user_id : null,
      assignedUserName: String(data.assigned_user_name ?? ""),
      hasSignoffEvidence: Boolean(data.has_signoff_evidence),
      capturedAt: typeof data.captured_at === "string" ? data.captured_at : new Date().toISOString(),
      uploadedByName: String(data.uploaded_by_name ?? ""),
      uploadedByUserId: typeof data.uploaded_by_user_id === "string" ? data.uploaded_by_user_id : null,
      linkedIssueId: typeof data.linked_issue_id === "string" ? data.linked_issue_id : null,
      linkedInspectionId: typeof data.linked_inspection_id === "string" ? data.linked_inspection_id : null,
      linkedInspectionItemId: typeof data.linked_inspection_item_id === "string" ? data.linked_inspection_item_id : null,
      createdAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
    };
    return photo;
  };

  useEffect(() => {
    contextRef.current = null;
    setContext(null);
    setIssues([]);
    setInspections([]);
    setSelectedInspectionId(null);
    setSelectedSignoffId(null);
    setSignOffs([]);
    setTodoLinks([]);
    setOrganizationUsers([]);
    setPhotos([]);
    setHasLoadedPhotos(false);
    void loadCoreData({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  useEffect(() => {
    if (activeTab === "Photo Log" || activeTab === "Issues" || activeTab === "Sign-Offs" || isIssueSheetOpen || isPhotoDetailOpen || isSignoffSheetOpen) {
      void loadPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isIssueSheetOpen, isPhotoDetailOpen, isSignoffSheetOpen, issues, inspections]);

  useEffect(() => {
    if (!selectedIssueId || !isIssueSheetOpen) {
      setIssueComments([]);
      setIssueActivity([]);
      return;
    }
    void loadIssueThread(selectedIssueId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId, isIssueSheetOpen]);

  useEffect(() => {
    if (!selectedInspectionId || !isInspectionSheetOpen) {
      setInspectionActivity([]);
      return;
    }
    void loadInspectionThread(selectedInspectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInspectionId, isInspectionSheetOpen]);

  useEffect(() => {
    if (!selectedSignoffId || !isSignoffSheetOpen) {
      setSignoffActivity([]);
      return;
    }
    void loadSignoffThread(selectedSignoffId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSignoffId, isSignoffSheetOpen]);

  const setInspectionItemLocal = (itemId: string, patch: Partial<InspectionItem>) => {
    setInspections((current) =>
      current.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      }))
    );
  };

  const setInspectionLocal = (inspectionId: string, patch: Partial<InspectionGroup>) => {
    setInspections((current) =>
      current.map((inspection) => (inspection.id === inspectionId ? { ...inspection, ...patch } : inspection))
    );
  };

  const saveInspectionFields = async (
    inspectionId: string,
    patch: Partial<InspectionGroup>,
    activityAction?: string,
    activityDetail?: string
  ) => {
    if (!context || !supabase) {
      return;
    }
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      dbPatch.title = patch.title;
    }
    if (patch.trade !== undefined) {
      dbPatch.trade = patch.trade;
    }
    if (patch.location !== undefined) {
      dbPatch.location = patch.location;
    }
    if (patch.assignee !== undefined) {
      dbPatch.assignee_name = patch.assignee;
    }
    if (patch.assigneeUserId !== undefined) {
      dbPatch.assignee_user_id = patch.assigneeUserId || null;
    }
    if (patch.dueDate !== undefined) {
      dbPatch.due_date = patch.dueDate || null;
    }
    if (patch.templateName !== undefined) {
      dbPatch.template_name = patch.templateName;
    }
    if (Object.keys(dbPatch).length === 0) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionsTable = (supabase as any).from("project_quality_inspections");
      const { error: updateError } = await inspectionsTable
        .update(dbPatch)
        .eq("id", inspectionId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (activityAction) {
        await writeInspectionActivity(inspectionId, activityAction, activityDetail ?? "");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update inspection.");
      await loadCoreData({ showLoading: false });
    } finally {
      setIsSaving(false);
    }
  };

  const setSignoffLocal = (signoffId: string, patch: Partial<SignOffItem>) => {
    setSignOffs((current) => current.map((item) => (item.id === signoffId ? { ...item, ...patch } : item)));
  };

  const saveSignoffFields = async (
    signoffId: string,
    patch: Partial<SignOffItem>,
    activityAction?: string,
    activityDetail?: string
  ) => {
    if (!context || !supabase) {
      return;
    }
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      dbPatch.title = patch.title;
    }
    if (patch.type !== undefined) {
      dbPatch.signoff_type = patch.type;
    }
    if (patch.trade !== undefined) {
      dbPatch.trade = patch.trade;
    }
    if (patch.location !== undefined) {
      dbPatch.location = patch.location;
    }
    if (patch.assignee !== undefined) {
      dbPatch.assignee_name = patch.assignee;
    }
    if (patch.assigneeUserId !== undefined) {
      dbPatch.assignee_user_id = patch.assigneeUserId || null;
    }
    if (patch.dueDate !== undefined) {
      dbPatch.due_date = patch.dueDate || null;
    }
    if (patch.linkedInspectionId !== undefined) {
      dbPatch.linked_inspection_id = patch.linkedInspectionId || null;
    }
    if (patch.linkedIssueId !== undefined) {
      dbPatch.linked_issue_id = patch.linkedIssueId || null;
    }
    if (patch.note !== undefined) {
      dbPatch.note = patch.note;
    }
    if (Object.keys(dbPatch).length === 0) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signOffsTable = (supabase as any).from("project_quality_sign_offs");
      const { error: updateError } = await signOffsTable
        .update(dbPatch)
        .eq("id", signoffId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (activityAction) {
        await writeSignoffActivity(signoffId, activityAction, activityDetail ?? "");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update sign-off.");
      await loadCoreData({ showLoading: false });
    } finally {
      setIsSaving(false);
    }
  };

  const setIssueLocal = (issueId: string, patch: Partial<QaIssue>) => {
    setIssues((current) => current.map((item) => (item.id === issueId ? { ...item, ...patch } : item)));
  };

  const saveIssueFields = async (issueId: string, patch: Partial<QaIssue>, activityAction?: string, activityDetail?: string) => {
    if (!context || !supabase) {
      return;
    }
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      dbPatch.title = patch.title;
    }
    if (patch.description !== undefined) {
      dbPatch.description = patch.description;
    }
    if (patch.trade !== undefined) {
      dbPatch.trade = patch.trade;
    }
    if (patch.location !== undefined) {
      dbPatch.location = patch.location;
    }
    if (patch.priority !== undefined) {
      dbPatch.priority = patch.priority;
    }
    if (patch.status !== undefined) {
      dbPatch.status = patch.status;
    }
    if (patch.assignee !== undefined) {
      dbPatch.assignee_name = patch.assignee;
    }
    if (patch.assigneeUserId !== undefined) {
      dbPatch.assignee_user_id = patch.assigneeUserId || null;
    }
    if (patch.dueDate !== undefined) {
      dbPatch.due_date = patch.dueDate || null;
    }
    if (Object.keys(dbPatch).length === 0) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      const { error: updateError } = await issuesTable
        .update(dbPatch)
        .eq("id", issueId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (activityAction) {
        await writeIssueActivity(issueId, activityAction, activityDetail ?? "");
      }
      if (patch.status !== undefined) {
        await refreshTodoLinks();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update issue.");
      await loadCoreData({ showLoading: false });
    } finally {
      setIsSaving(false);
    }
  };

  const setIssueStatus = async (issueId: string, status: IssueStatus) => {
    setIssueLocal(issueId, { status, updatedAt: new Date().toISOString() });
    await saveIssueFields(issueId, { status }, "Status changed", `Status set to ${status}`);
  };

  const setIssueAssignee = async (issueId: string, assigneeUserId: string) => {
    const assignee = assigneeUserId ? organizationUserNameById.get(assigneeUserId) ?? "" : "";
    setIssueLocal(issueId, { assignee, assigneeUserId: assigneeUserId || null, updatedAt: new Date().toISOString() });
    await saveIssueFields(
      issueId,
      { assignee, assigneeUserId: assigneeUserId || null },
      "Assignment updated",
      assignee ? `Assigned to ${assignee}` : "Assignee cleared"
    );
  };

  const updateChecklistStatus = async (inspectionId: string, itemId: string, status: ChecklistStatus) => {
    if (!context || !supabase) {
      return;
    }
    setInspectionItemLocal(itemId, { status });
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsTable = (supabase as any).from("project_quality_inspection_items");
      const { error: updateError } = await itemsTable
        .update({ status })
        .eq("id", itemId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      const label =
        inspections
          .find((inspection) => inspection.id === inspectionId)
          ?.items.find((item) => item.id === itemId)?.label ?? "Checklist item";
      await writeInspectionActivity(
        inspectionId,
        "Checklist status updated",
        `${label}: ${status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Pending"}`,
        itemId
      );
      await refreshTodoLinks();
      if (selectedInspectionId === inspectionId && isInspectionSheetOpen) {
        await loadInspectionThread(inspectionId);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update inspection status.");
      await loadCoreData({ showLoading: false });
    } finally {
      setIsSaving(false);
    }
  };

  const saveChecklistText = async (inspectionId: string, itemId: string, key: "notes" | "photo_url", value: string) => {
    if (!context || !supabase) {
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsTable = (supabase as any).from("project_quality_inspection_items");
      const { error: updateError } = await itemsTable
        .update({ [key]: value })
        .eq("id", itemId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      await writeInspectionActivity(
        inspectionId,
        key === "notes" ? "Checklist notes updated" : "Checklist photo updated",
        value.trim().length > 0 ? "Details added" : "Details cleared",
        itemId
      );
      if (selectedInspectionId === inspectionId && isInspectionSheetOpen) {
        await loadInspectionThread(inspectionId);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save inspection note.");
    }
  };

  const addInspectionPhotoToLog = async (inspectionId: string, item: InspectionItem) => {
    if (!item.photoUrl.trim()) {
      return;
    }
    const inspection = inspectionIndex.get(inspectionId);
    if (!inspection) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const inserted = await insertPhoto({
        photoUrl: item.photoUrl.trim(),
        title: item.label,
        trade: "",
        location: "",
        photoType: "inspection",
        category: "Inspection Evidence",
        notes: item.notes,
        statusTag: item.status === "fail" ? "Fail" : item.status === "pass" ? "Pass" : "",
        phaseTag: "",
        capturedAtIso: new Date().toISOString(),
        linkedIssueId: null,
        linkedInspectionId: inspection.id,
        linkedInspectionItemId: item.id,
        assignedUserId: inspection.assigneeUserId,
        assignedUserName: inspection.assignee,
        hasSignoffEvidence: false,
      });
      if (inserted) {
        setPhotos((current) => [inserted, ...current]);
        setHasLoadedPhotos(true);
      }
      await writeInspectionActivity(inspectionId, "Photo added", item.label, item.id);
      if (selectedInspectionId === inspectionId && isInspectionSheetOpen) {
        await loadInspectionThread(inspectionId);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add inspection photo.");
    } finally {
      setIsSaving(false);
    }
  };

  const addIssuePhoto = async () => {
    if (!selectedIssue || !issuePhotoUrlDraft.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const inserted = await insertPhoto({
        photoUrl: issuePhotoUrlDraft.trim(),
        title: selectedIssue.title,
        trade: selectedIssue.trade,
        location: selectedIssue.location,
        photoType: "issue",
        category: "Defect",
        notes: "",
        statusTag: selectedIssue.status,
        phaseTag: "",
        capturedAtIso: new Date().toISOString(),
        linkedIssueId: selectedIssue.id,
        linkedInspectionId: null,
        linkedInspectionItemId: null,
        assignedUserId: selectedIssue.assigneeUserId,
        assignedUserName: selectedIssue.assignee,
        hasSignoffEvidence: false,
      });
      if (inserted) {
        setPhotos((current) => [inserted, ...current]);
        setHasLoadedPhotos(true);
      }
      await writeIssueActivity(selectedIssue.id, "Photo added");
      setIssuePhotoUrlDraft("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add issue photo.");
    } finally {
      setIsSaving(false);
    }
  };

  const addIssueComment = async () => {
    if (!selectedIssue || !context || !supabase || !session?.id || !issueCommentDraft.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commentsTable = (supabase as any).from("project_quality_issue_comments");
      const commentText = issueCommentDraft.trim();
      const { data, error: insertError } = await commentsTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          issue_id: selectedIssue.id,
          created_by: session.id,
          author_name: session.name ?? "",
          comment: commentText,
        })
        .select("id, issue_id, author_name, comment, created_at")
        .maybeSingle();

      if (insertError) {
        throw new Error(insertError.message);
      }

      if (data) {
        setIssueComments((current) => [
          ...current,
          {
            id: String(data.id),
            issueId: String(data.issue_id),
            authorName: String(data.author_name ?? ""),
            comment: String(data.comment ?? ""),
            createdAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
          },
        ]);
      }
      await writeIssueActivity(selectedIssue.id, "Comment added");
      setIssueCommentDraft("");
      await loadIssueThread(selectedIssue.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add comment.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteIssue = async (issueId: string) => {
    if (!context || !supabase) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      const { error: deleteError } = await issuesTable
        .delete()
        .eq("id", issueId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      setIssues((current) => current.filter((item) => item.id !== issueId));
      setPhotos((current) => current.filter((item) => item.linkedIssueId !== issueId));
      if (selectedIssueId === issueId) {
        setSelectedIssueId(null);
        setIsIssueSheetOpen(false);
      }
      await refreshTodoLinks();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to delete issue.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleIssuePhotoFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setIssuePhotoUrlDraft(dataUrl);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read selected file.");
    }
  };

  const handleInspectionItemPhotoFileSelect = async (inspectionId: string, itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setInspectionItemLocal(itemId, { photoUrl: dataUrl });
      await saveChecklistText(inspectionId, itemId, "photo_url", dataUrl);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read selected file.");
    }
  };

  const addInspectionItem = async () => {
    if (!context || !supabase || !session?.id || !selectedInspection || !newInspectionItemLabel.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsTable = (supabase as any).from("project_quality_inspection_items");
      const { data, error: insertError } = await itemsTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          inspection_id: selectedInspection.id,
          created_by: session.id,
          label: newInspectionItemLabel.trim(),
          status: null,
          notes: "",
          photo_url: "",
        })
        .select("id, label, status, notes, photo_url")
        .maybeSingle();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (data) {
        setInspections((current) =>
          current.map((inspection) =>
            inspection.id === selectedInspection.id
              ? {
                  ...inspection,
                  items: [
                    ...inspection.items,
                    {
                      id: String(data.id),
                      label: String(data.label ?? ""),
                      status: (data.status as ChecklistStatus) ?? null,
                      notes: String(data.notes ?? ""),
                      photoUrl: String(data.photo_url ?? ""),
                    },
                  ],
                }
              : inspection
          )
        );
      }
      await writeInspectionActivity(selectedInspection.id, "Checklist item added", newInspectionItemLabel.trim());
      setNewInspectionItemLabel("");
      await loadInspectionThread(selectedInspection.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add checklist item.");
    } finally {
      setIsSaving(false);
    }
  };

  const createIssueFromInspectionFail = async (inspectionId: string, item: InspectionItem) => {
    if (!context || !supabase || !session?.id) {
      return;
    }
    const inspection = inspections.find((entry) => entry.id === inspectionId);
    if (!inspection) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      const issueTitle = `${inspection.title} - ${item.label}`;
      const { data, error: insertError } = await issuesTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          created_by: session.id,
          title: issueTitle,
          description: item.notes || "Auto-created from failed inspection checklist item.",
          trade: inspection.trade,
          location: inspection.location,
          priority: "Medium",
          status: "Open",
          due_date: inspection.dueDate,
          assignee_name: inspection.assignee,
          assignee_user_id: inspection.assigneeUserId,
        })
        .select("*")
        .maybeSingle();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (data) {
        const row: QaIssue = {
          id: String(data.id),
          title: String(data.title ?? ""),
          description: String(data.description ?? ""),
          trade: String(data.trade ?? ""),
          location: String(data.location ?? ""),
          priority:
            data.priority === "Low" || data.priority === "High" || data.priority === "Medium"
              ? data.priority
              : "Medium",
          status: (data.status as IssueStatus) ?? "Open",
          dueDate: typeof data.due_date === "string" ? data.due_date : null,
          assignee: String(data.assignee_name ?? ""),
          assigneeUserId: typeof data.assignee_user_id === "string" ? data.assignee_user_id : null,
          updatedAt: typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
        };
        setIssues((current) => [row, ...current]);
        await writeIssueActivity(row.id, "Issue created", "Auto-created from failed inspection checklist item");
        if (item.photoUrl.trim()) {
          const inserted = await insertPhoto({
            photoUrl: item.photoUrl.trim(),
            title: row.title,
            trade: row.trade,
            location: row.location,
            photoType: "issue",
            category: "Defect",
            notes: item.notes,
            statusTag: row.status,
            phaseTag: "",
            capturedAtIso: new Date().toISOString(),
            linkedIssueId: row.id,
            linkedInspectionId: inspection.id,
            linkedInspectionItemId: item.id,
            assignedUserId: row.assigneeUserId,
            assignedUserName: row.assignee,
            hasSignoffEvidence: false,
          });
          if (inserted) {
            setPhotos((current) => [inserted, ...current]);
            setHasLoadedPhotos(true);
          }
        }
      }
      await writeInspectionActivity(inspection.id, "Issue created from fail", item.label, item.id);
      await refreshTodoLinks();
      if (selectedInspectionId === inspection.id && isInspectionSheetOpen) {
        await loadInspectionThread(inspection.id);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create issue from checklist fail.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewPhotoFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setNewPhotoUrl(dataUrl);
      setNewPhotoFileName(file.name);
      if (!newPhotoTitle.trim()) {
        setNewPhotoTitle(file.name);
      }
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read selected file.");
    }
  };

  const createIssue = async () => {
    if (!context || !supabase || !session?.id || !newIssueTitle.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesTable = (supabase as any).from("project_quality_issues");
      const { data, error: insertError } = await issuesTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          created_by: session.id,
          title: newIssueTitle.trim(),
          description: newIssueDescription.trim(),
          trade: newIssueTrade.trim(),
          location: newIssueLocation.trim(),
          priority: newIssuePriority,
          status: newIssueStatus,
          due_date: newIssueDueDate || null,
          assignee_name: newIssueAssigneeUserId ? organizationUserNameById.get(newIssueAssigneeUserId) ?? "" : "",
          assignee_user_id: newIssueAssigneeUserId || null,
        })
        .select("*")
        .maybeSingle();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (data) {
        const row: QaIssue = {
          id: String(data.id),
          title: String(data.title ?? ""),
          description: String(data.description ?? ""),
          trade: String(data.trade ?? ""),
          location: String(data.location ?? ""),
          priority:
            data.priority === "Low" || data.priority === "High" || data.priority === "Medium"
              ? data.priority
              : "Medium",
          status: (data.status as IssueStatus) ?? "Open",
          dueDate: typeof data.due_date === "string" ? data.due_date : null,
          assignee: String(data.assignee_name ?? ""),
          assigneeUserId: typeof data.assignee_user_id === "string" ? data.assignee_user_id : null,
          updatedAt: typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
        };
        setIssues((current) => [row, ...current]);
        setSelectedIssueId(row.id);
        await writeIssueActivity(row.id, "Issue created", newIssueCreateLinkedTask ? "Linked task enabled" : "Linked task disabled");
      }
      setNewIssueTitle("");
      setNewIssueDescription("");
      setNewIssueTrade("");
      setNewIssueLocation("");
      setNewIssuePriority("Medium");
      setNewIssueStatus("Open");
      setNewIssueDueDate("");
      setNewIssueAssigneeUserId("");
      setNewIssueCreateLinkedTask(true);
      setIsCreateIssueSheetOpen(false);
      await refreshTodoLinks();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create issue.");
    } finally {
      setIsSaving(false);
    }
  };

  const createInspection = async () => {
    if (!context || !supabase || !session?.id || !newInspectionTitle.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inspectionsTable = (supabase as any).from("project_quality_inspections");
      const dueDate = newInspectionDueDate || null;
      const scheduledAtIso = dueDate ? `${dueDate}T09:00:00.000Z` : new Date().toISOString();
      const { data, error: insertError } = await inspectionsTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          created_by: session.id,
          title: newInspectionTitle.trim(),
          trade: newInspectionTrade.trim(),
          location: newInspectionLocation.trim(),
          assignee_name: newInspectionAssigneeUserId ? organizationUserNameById.get(newInspectionAssigneeUserId) ?? "" : "",
          assignee_user_id: newInspectionAssigneeUserId || null,
          due_date: dueDate,
          template_name: newInspectionTemplate,
          scheduled_at: scheduledAtIso,
        })
        .select("id, title, trade, location, assignee_name, assignee_user_id, due_date, template_name, scheduled_at")
        .maybeSingle();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (data) {
        const row: InspectionGroup = {
          id: String(data.id),
          title: String(data.title ?? ""),
          trade: String(data.trade ?? ""),
          location: String(data.location ?? ""),
          assignee: String(data.assignee_name ?? ""),
          assigneeUserId: typeof data.assignee_user_id === "string" ? data.assignee_user_id : null,
          dueDate: typeof data.due_date === "string" ? data.due_date : null,
          templateName: String(data.template_name ?? ""),
          scheduledAt: typeof data.scheduled_at === "string" ? data.scheduled_at : new Date().toISOString(),
          items: [],
        };
        const template = INSPECTION_TEMPLATES.find((entry) => entry.value === newInspectionTemplate);
        if (template && template.items.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const itemsTable = (supabase as any).from("project_quality_inspection_items");
          const { data: itemRows, error: itemInsertError } = await itemsTable
            .insert(
              template.items.map((label) => ({
                organization_id: context.organizationId,
                project_id: context.projectId,
                inspection_id: row.id,
                created_by: session.id,
                label,
                status: null,
                notes: "",
                photo_url: "",
              }))
            )
            .select("id, label, status, notes, photo_url");
          if (itemInsertError) {
            throw new Error(itemInsertError.message);
          }
          row.items = ((itemRows ?? []) as Array<Record<string, unknown>>).map((item) => ({
            id: String(item.id),
            label: String(item.label ?? ""),
            status: (item.status as ChecklistStatus) ?? null,
            notes: String(item.notes ?? ""),
            photoUrl: String(item.photo_url ?? ""),
          }));
        }
        setInspections((current) =>
          [...current, row].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        );
        setSelectedInspectionId(row.id);
        await writeInspectionActivity(row.id, "Inspection created", row.templateName ? `Template: ${row.templateName}` : "");
      }
      setNewInspectionTitle("");
      setNewInspectionTrade("");
      setNewInspectionLocation("");
      setNewInspectionAssigneeUserId("");
      setNewInspectionDueDate("");
      setNewInspectionTemplate("");
      setIsCreateInspectionSheetOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create inspection.");
    } finally {
      setIsSaving(false);
    }
  };

  const createSignoff = async () => {
    if (!context || !supabase || !session?.id || !newSignoffTitle.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signOffsTable = (supabase as any).from("project_quality_sign_offs");
      const { data, error: insertError } = await signOffsTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          created_by: session.id,
          title: newSignoffTitle.trim(),
          signoff_type: newSignoffType,
          trade: newSignoffTrade.trim(),
          location: newSignoffLocation.trim(),
          assignee_name: newSignoffAssigneeUserId ? organizationUserNameById.get(newSignoffAssigneeUserId) ?? "" : "",
          assignee_user_id: newSignoffAssigneeUserId || null,
          due_date: newSignoffDueDate || null,
          linked_inspection_id: newSignoffLinkedInspectionId || null,
          linked_issue_id: newSignoffLinkedIssueId || null,
          note: newSignoffNote.trim(),
          status: "Pending",
        })
        .select("id, title, signoff_type, trade, location, assignee_name, assignee_user_id, due_date, linked_inspection_id, linked_issue_id, note, status, signed_by_name, signed_at, created_at")
        .maybeSingle();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (data) {
        const row: SignOffItem = {
          id: String(data.id),
          title: String(data.title ?? ""),
          type:
            data.signoff_type === "Client" || data.signoff_type === "Council" || data.signoff_type === "Final Handover"
              ? data.signoff_type
              : "Internal",
          trade: String(data.trade ?? ""),
          location: String(data.location ?? ""),
          assignee: String(data.assignee_name ?? ""),
          assigneeUserId: typeof data.assignee_user_id === "string" ? data.assignee_user_id : null,
          dueDate: typeof data.due_date === "string" ? data.due_date : null,
          linkedInspectionId: typeof data.linked_inspection_id === "string" ? data.linked_inspection_id : null,
          linkedIssueId: typeof data.linked_issue_id === "string" ? data.linked_issue_id : null,
          note: String(data.note ?? ""),
          status: (data.status as SignOffStatus) ?? "Pending",
          signedBy: typeof data.signed_by_name === "string" ? data.signed_by_name : null,
          signedAt: typeof data.signed_at === "string" ? data.signed_at : null,
          createdAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
        };
        setSignOffs((current) => [...current, row]);
        setSelectedSignoffId(row.id);
        await writeSignoffActivity(row.id, "Sign-off created", newSignoffType);
      }
      setNewSignoffTitle("");
      setNewSignoffType("Internal");
      setNewSignoffTrade("");
      setNewSignoffLocation("");
      setNewSignoffAssigneeUserId("");
      setNewSignoffDueDate("");
      setNewSignoffLinkedInspectionId("");
      setNewSignoffLinkedIssueId("");
      setNewSignoffNote("");
      setIsCreateSignoffSheetOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create sign-off.");
    } finally {
      setIsSaving(false);
    }
  };

  const createPhotoFromPhotoLog = async () => {
    if (!newPhotoUrl.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const linkedIssueId = newPhotoLinkMode === "issue" ? (newPhotoIssueId || null) : null;
      const linkedInspectionId = newPhotoLinkMode === "inspection" ? (newPhotoInspectionId || null) : null;
      const linkedInspectionItemId = newPhotoLinkMode === "inspection" ? (newPhotoInspectionItemId || null) : null;
      const photoType: PhotoType = newPhotoLinkMode === "issue" ? "issue" : newPhotoLinkMode === "inspection" ? "inspection" : "general";

      const inserted = await insertPhoto({
        photoUrl: newPhotoUrl.trim(),
        title: newPhotoTitle.trim(),
        trade: newPhotoTrade.trim(),
        location: newPhotoLocation.trim(),
        photoType,
        category: newPhotoCategory,
        notes: newPhotoNotes.trim(),
        statusTag: "",
        phaseTag: "",
        capturedAtIso: newPhotoCapturedAt ? toIsoDateTime(newPhotoCapturedAt) : new Date().toISOString(),
        linkedIssueId,
        linkedInspectionId,
        linkedInspectionItemId,
        assignedUserId: newPhotoAssignedUserId || null,
        assignedUserName: newPhotoAssignedUserId ? organizationUserNameById.get(newPhotoAssignedUserId) ?? "" : "",
        hasSignoffEvidence: newPhotoHasSignoffEvidence,
      });

      if (inserted) {
        setPhotos((current) => [inserted, ...current]);
        setHasLoadedPhotos(true);
      }
      setNewPhotoUrl("");
      setNewPhotoTitle("");
      setNewPhotoNotes("");
      setNewPhotoTrade("");
      setNewPhotoLocation("");
      setNewPhotoLinkMode("none");
      setNewPhotoCategory("Progress");
      setNewPhotoCapturedAt(toDateTimeLocal(new Date().toISOString()));
      setNewPhotoIssueId("");
      setNewPhotoInspectionId("");
      setNewPhotoInspectionItemId("");
      setNewPhotoAssignedUserId("");
      setNewPhotoHasSignoffEvidence(false);
      setNewPhotoFileName("");
      setIsCreatePhotoOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create photo record.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSignoffStatus = async (signoffId: string, status: SignOffStatus) => {
    if (!context || !supabase) {
      return;
    }
    const previous = signOffs;
    const openIssues = issues.filter((item) => item.status !== "Complete" && item.status !== "Verified").length;
    const incompleteInspections = inspections.filter((inspection) => getInspectionStatus(inspection.items) !== "Complete").length;
    const signoffEvidenceCount = photos.filter((item) => item.hasSignoffEvidence).length;
    if (status === "Signed" && (openIssues > 0 || incompleteInspections > 0 || signoffEvidenceCount === 0)) {
      setError("Cannot sign off — incomplete QA items");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSignOffs((current) =>
      current.map((item) =>
        item.id === signoffId
          ? {
              ...item,
              status,
              signedBy: session?.name ?? "",
              signedAt: status === "Signed" ? new Date().toISOString() : item.signedAt,
            }
          : item
      )
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signOffsTable = (supabase as any).from("project_quality_sign_offs");
      const { error: updateError } = await signOffsTable
        .update({
          status,
          requested_at: status === "Requested" ? new Date().toISOString() : null,
          signed_by_name: session?.name ?? null,
          signed_at: status === "Signed" ? new Date().toISOString() : null,
          note: signoffActionNote.trim(),
        })
        .eq("id", signoffId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      await writeSignoffActivity(signoffId, status === "Signed" ? "Signed" : status === "Rejected" ? "Rejected" : "Status changed", signoffActionNote.trim());
      setSignoffActionNote("");
      if (selectedSignoffId === signoffId && isSignoffSheetOpen) {
        await loadSignoffThread(signoffId);
      }
    } catch (saveError) {
      setSignOffs(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to update sign-off status.");
    } finally {
      setIsSaving(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!context || !supabase) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const photosTable = (supabase as any).from("project_quality_photos");
      const { error: deleteError } = await photosTable
        .delete()
        .eq("id", photoId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      setPhotos((current) => current.filter((item) => item.id !== photoId));
      if (selectedPhotoId === photoId) {
        setIsPhotoDetailOpen(false);
        setSelectedPhotoId(null);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to delete photo.");
    } finally {
      setIsSaving(false);
    }
  };

  const savePhotoEdits = async () => {
    if (!selectedPhoto || !context || !supabase) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const photosTable = (supabase as any).from("project_quality_photos");
      const linkedIssueId = photoEditType === "issue" ? (photoEditIssueId || null) : null;
      const linkedInspectionId = photoEditType === "inspection" ? (photoEditInspectionId || null) : null;
      const linkedInspectionItemId = photoEditType === "inspection" ? (photoEditInspectionItemId || null) : null;
      const assignedUserId = photoEditAssignedUserId || null;
      const assignedUserName = assignedUserId ? organizationUserNameById.get(assignedUserId) ?? "" : "";
      const { error: updateError } = await photosTable
        .update({
          title: photoEditTitle.trim(),
          notes: photoEditNotes.trim(),
          trade: photoEditTrade.trim(),
          location: photoEditLocation.trim(),
          category: photoEditCategory,
          status_tag: photoEditStatusTag.trim(),
          phase_tag: photoEditPhaseTag || null,
          photo_type: photoEditType,
          has_signoff_evidence: photoEditSignoffEvidence,
          linked_issue_id: linkedIssueId,
          linked_inspection_id: linkedInspectionId,
          linked_inspection_item_id: linkedInspectionItemId,
          assigned_user_id: assignedUserId,
          assigned_user_name: assignedUserName,
        })
        .eq("id", selectedPhoto.id)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setPhotos((current) =>
        current.map((item) =>
          item.id === selectedPhoto.id
            ? {
                ...item,
                title: photoEditTitle.trim(),
                notes: photoEditNotes.trim(),
                trade: photoEditTrade.trim(),
                location: photoEditLocation.trim(),
                category: photoEditCategory,
                statusTag: photoEditStatusTag.trim(),
                phaseTag: photoEditPhaseTag,
                photoType: photoEditType,
                hasSignoffEvidence: photoEditSignoffEvidence,
                linkedIssueId,
                linkedInspectionId,
                linkedInspectionItemId,
                assignedUserId,
                assignedUserName,
              }
            : item
        )
      );
      setIsPhotoEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save photo edits.");
    } finally {
      setIsSaving(false);
    }
  };

  const relatedPhotos = useMemo(() => {
    if (!selectedPhoto) {
      return [];
    }
    return photos.filter((item) => {
      if (item.id === selectedPhoto.id) {
        return false;
      }
      return (
        (selectedPhoto.linkedIssueId && item.linkedIssueId === selectedPhoto.linkedIssueId) ||
        (selectedPhoto.linkedInspectionId && item.linkedInspectionId === selectedPhoto.linkedInspectionId) ||
        item.location === selectedPhoto.location
      );
    }).slice(0, 6);
  }, [photos, selectedPhoto]);

  const signoffEvidencePhotos = useMemo(() => {
    if (!selectedSignoff) {
      return [];
    }
    return photos.filter((photo) => {
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
      return !selectedSignoff.linkedIssueId && !selectedSignoff.linkedInspectionId;
    });
  }, [photos, selectedSignoff]);

  const signoffQaBlockers = useMemo(() => {
    const openIssues = issues.filter((item) => item.status !== "Complete" && item.status !== "Verified").length;
    const incompleteInspections = inspections.filter((inspection) => getInspectionStatus(inspection.items) !== "Complete").length;
    const evidenceCount = signoffEvidencePhotos.length;
    return { openIssues, incompleteInspections, evidenceCount };
  }, [inspections, issues, signoffEvidencePhotos.length]);

  const canCurrentUserActionSignoff = useMemo(() => {
    if (!selectedSignoff) {
      return false;
    }
    if (!selectedSignoff.assigneeUserId) {
      return true;
    }
    if (!session?.id) {
      return false;
    }
    return selectedSignoff.assigneeUserId === session.id;
  }, [selectedSignoff, session?.id]);

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>

      {/* Hero */}
      <section className={`${styles.heroBlock} mb-2`}>
        <div className="min-w-0 flex-1">
          <h1 className={`${ibmPlexSans.className} ${styles.quotePageTitle}`}>Health & Safety</h1>
          <p className={`${interMedium.className} mt-1 text-[15px] text-[#6b6b6b]`}>Site-based quality tracking with linked actions and visual proof</p>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-rose-50">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
            </span>
            <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Open Issues</p>
          </div>
          <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.openCount}</p>
          <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-rose-500`}>Require Attention</p>
        </div>
        <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-indigo-50">
              <CalendarClock className="h-5 w-5 text-indigo-500" />
            </span>
            <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Inspections Today</p>
          </div>
          <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.inspectionsToday}</p>
          <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[#4B5D79]`}>Scheduled For Today</p>
        </div>
        <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-amber-50">
              <Clock3 className="h-5 w-5 text-amber-500" />
            </span>
            <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Overdue QA Items</p>
          </div>
          <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.overdueCount}</p>
          <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-amber-600`}>Past Due Date</p>
        </div>
        <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </span>
            <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>Completed This Week</p>
          </div>
          <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>{issueStats.completeCount}</p>
          <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-emerald-600`}>Issues Resolved</p>
        </div>
      </div>

      {/* Tab bar + content */}
      <div className="px-0 py-0">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  `${interMedium.className} rounded-full px-4 py-2 text-[13px] font-semibold transition-colors`,
                  activeTab === tab ? "bg-[#0B2739] text-white" : "border border-[#D7E1EC] bg-[#F8F9FC] text-[#475569] hover:bg-[#EEF2F7]"
                )}
              >
                {tab}
              </button>
            ))}
            <div className="ml-auto">
              {activeTab === "Issues" ? (
                <Button type="button" onClick={() => setIsCreateIssueSheetOpen(true)} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
                  Add Issue
                </Button>
              ) : null}
              {activeTab === "Inspections" ? (
                <Button type="button" onClick={() => setIsCreateInspectionSheetOpen(true)} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
                  Add Inspection
                </Button>
              ) : null}
              {activeTab === "Photo Log" ? (
                <Button type="button" onClick={() => setIsCreatePhotoOpen(true)} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
                  Upload Photo
                </Button>
              ) : null}
              {activeTab === "Sign-Offs" ? (
                <Button type="button" onClick={() => setIsCreateSignoffSheetOpen(true)} className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#F15928] !text-white hover:bg-[#d94d20]`}>
                  Add Sign-Off
                </Button>
              ) : null}
            </div>
          </div>
        <div className="pb-6">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-[#E2E8F0]" />
              <div className="h-4 w-64 animate-pulse rounded bg-[#E2E8F0]" />
            </div>
          ) : null}

          {!isLoading && activeTab === "Overview" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Issues by Status</p>
                <div className="h-3 overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div className="flex h-full w-full">
                    <div className="bg-[#DC2626]" style={{ width: `${(issueStats.openCount / Math.max(issues.length, 1)) * 100}%` }} />
                    <div className="bg-[#D97706]" style={{ width: `${(issueStats.inProgressCount / Math.max(issues.length, 1)) * 100}%` }} />
                    <div className="bg-[#15803D]" style={{ width: `${(issueStats.completeCount / Math.max(issues.length, 1)) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-4">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Recent Activity</p>
                  <div className="mt-3 space-y-2">
                    {issues.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{item.title}</p>
                        <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                          {item.status} • {formatTimestamp(item.updatedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-4">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Upcoming Inspections</p>
                  <div className="mt-3 space-y-2">
                    {inspections.map((group) => (
                      <div key={group.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{group.title}</p>
                        <p className={`${interMedium.className} text-xs text-[#64748B]`}>{formatTimestamp(group.scheduledAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-4">
                <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Linked Tasks</p>
                <div className="mt-3 space-y-2">
                  {todoLinks.filter((item) => !item.is_completed).length === 0 ? (
                    <p className={`${interMedium.className} text-xs text-[#64748B]`}>No open QA-linked tasks right now.</p>
                  ) : (
                    todoLinks
                      .filter((item) => !item.is_completed)
                      .map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                          <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{item.title}</p>
                          <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">
                            {item.source_type === "qa_issue" ? "Issue" : "Inspection Fail"}
                          </Badge>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {!isLoading && activeTab === "Issues" ? (
            <div className="space-y-3">
              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-[2fr_1fr_1fr]">
                <Input value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} className="h-9 border-[#CBD5E1]" />
                <select value={issueStatusFilter} onChange={(event) => setIssueStatusFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Status</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Complete">Complete</option>
                  <option value="Verified">Verified</option>
                </select>
                <select value={issueDueFilter} onChange={(event) => setIssueDueFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Due Dates</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Due Today">Due Today</option>
                  <option value="No Due Date">No Due Date</option>
                </select>
              </div>

              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-4">
                <select value={issueTradeFilter} onChange={(event) => setIssueTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {issueTradeOptions.map((trade) => (
                    <option key={trade} value={trade}>
                      {trade}
                    </option>
                  ))}
                </select>
                <select value={issueAssigneeFilter} onChange={(event) => setIssueAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {issueAssigneeOptions.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
                <select value={issueLocationFilter} onChange={(event) => setIssueLocationFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {issueLocationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIssueSearch("");
                    setIssueStatusFilter("All");
                    setIssueTradeFilter("All");
                    setIssueAssigneeFilter("All");
                    setIssueLocationFilter("All");
                    setIssueDueFilter("All");
                  }}
                  className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
                >
                  Reset Filters
                </Button>
              </div>

              {filteredIssues.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-7 text-center">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>No issues yet</p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>Add your first issue to track defects and quality items.</p>
                </div>
              ) : null}

              {filteredIssues.map((issue) => {
                const leadPhoto = issuePhotoCoverMap.get(issue.id) ?? "";
                const photoCount = issuePhotoCountMap.get(issue.id) ?? 0;
                const overdue = isOverdue(issue.dueDate, issue.status);
                return (
                  <div
                    key={issue.id}
                    onClick={() => {
                      setSelectedIssueId(issue.id);
                      setIssuePhotoUrlDraft("");
                      setIsIssueSheetOpen(true);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-[8px] border bg-white px-3 py-3 text-left transition-colors hover:bg-[#F8FAFC]",
                      overdue ? "border-rose-200" : "border-[#E6EAF0]"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-9 w-9 overflow-hidden rounded-[6px] bg-[#E2E8F0]">
                        {leadPhoto ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={leadPhoto} alt={issue.title} className="h-full w-full object-cover" />
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[#64748B]">
                            <Camera className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{issue.title}</p>
                        <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                          {issue.trade} • {issue.location}
                        </p>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
                      {issue.dueDate ? (
                        <span
                          className={cn(
                            `${interMedium.className} rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]`,
                            overdue ? "border-rose-200 bg-rose-100 text-rose-700" : "border-[#CBD5E1] bg-white text-[#475569]"
                          )}
                        >
                          {overdue ? "Overdue" : `Due ${issue.dueDate}`}
                        </span>
                      ) : null}
                      <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                        {issue.priority}
                      </span>
                      {photoCount > 0 ? (
                        <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                          {photoCount} photo{photoCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <select
                        value={issue.status}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => void setIssueStatus(issue.id, event.target.value as IssueStatus)}
                        className={`${interMedium.className} h-8 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-xs text-[#1E293B]`}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Complete">Complete</option>
                        <option value="Verified">Verified</option>
                      </select>
                      <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusTone(issue.status)}`}>
                        {issue.status}
                      </span>
                      <span className={`${interMedium.className} flex h-7 w-7 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-semibold text-[#1D4ED8]`}>
                        {(issue.assignee || "U").slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!isLoading && activeTab === "Inspections" ? (
            <div className="space-y-3">
              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-[2fr_1fr_1fr]">
                <Input value={inspectionSearch} onChange={(event) => setInspectionSearch(event.target.value)} className="h-9 border-[#CBD5E1]" />
                <select value={inspectionStatusFilter} onChange={(event) => setInspectionStatusFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Status</option>
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Complete">Complete</option>
                </select>
                <select value={inspectionDueFilter} onChange={(event) => setInspectionDueFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Due Dates</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Due Today">Due Today</option>
                  <option value="No Due Date">No Due Date</option>
                </select>
              </div>

              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-4">
                <select value={inspectionTradeFilter} onChange={(event) => setInspectionTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {inspectionTradeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={inspectionAssigneeFilter} onChange={(event) => setInspectionAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {inspectionAssigneeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={inspectionLocationFilter} onChange={(event) => setInspectionLocationFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {inspectionLocationOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setInspectionSearch("");
                    setInspectionStatusFilter("All");
                    setInspectionTradeFilter("All");
                    setInspectionAssigneeFilter("All");
                    setInspectionLocationFilter("All");
                    setInspectionDueFilter("All");
                  }}
                  className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
                >
                  Reset Filters
                </Button>
              </div>

              {filteredInspections.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-7 text-center">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>No inspections yet</p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>Create an inspection to track site quality checks.</p>
                </div>
              ) : null}

              {filteredInspections.map((inspection) => {
                const status = getInspectionStatus(inspection.items);
                const progress = getInspectionProgress(inspection.items);
                const overdue = Boolean(inspection.dueDate && inspection.dueDate < new Date().toISOString().slice(0, 10) && status !== "Complete");
                return (
                  <div
                    key={inspection.id}
                    onClick={() => {
                      setSelectedInspectionId(inspection.id);
                      setIsInspectionSheetOpen(true);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-[8px] border bg-white px-3 py-3 text-left transition-colors hover:bg-[#F8FAFC]",
                      overdue ? "border-rose-200" : "border-[#E6EAF0]"
                    )}
                  >
                    <div className="min-w-0">
                      <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{inspection.title}</p>
                      <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                        {inspection.trade || "No trade"} • {inspection.location || "No location"}
                      </p>
                    </div>
                    <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
                      <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${inspectionStatusTone(status)}`}>
                        {status}
                      </span>
                      <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                        {progress.complete} / {progress.total}
                      </span>
                      {inspection.dueDate ? (
                        <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${overdue ? "border-rose-200 bg-rose-100 text-rose-700" : "border-[#CBD5E1] bg-white text-[#475569]"}`}>
                          {overdue ? "Overdue" : `Due ${inspection.dueDate}`}
                        </span>
                      ) : null}
                      <span className={`${interMedium.className} flex h-7 w-7 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-semibold text-[#1D4ED8]`}>
                        {(inspection.assignee || "U").slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!isLoading && activeTab === "Photo Log" ? (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-12">
                <Input value={photoSearch} onChange={(event) => setPhotoSearch(event.target.value)} className="h-9 border-[#CBD5E1] md:col-span-2" />
                <select value={photoCategoryFilter} onChange={(event) => setPhotoCategoryFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {photoCategoryOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={photoTradeFilter} onChange={(event) => setPhotoTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {photoTradeOptions.map((trade) => (
                    <option key={trade} value={trade}>
                      {trade}
                    </option>
                  ))}
                </select>
                <select value={photoAreaFilter} onChange={(event) => setPhotoAreaFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {photoAreaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <select value={photoLinkFilter} onChange={(event) => setPhotoLinkFilter(event.target.value as "All" | "Issue" | "Inspection" | "General")} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {PHOTO_LINK_FILTERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select value={photoAssigneeFilter} onChange={(event) => setPhotoAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">Any Assignee</option>
                  {organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <select value={photoSignoffFilter} onChange={(event) => setPhotoSignoffFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">Sign-off</option>
                  <option value="Yes">Sign-off evidence</option>
                  <option value="No">No sign-off</option>
                </select>
                <select value={photoViewMode} onChange={(event) => setPhotoViewMode(event.target.value as "grid" | "timeline")} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {PHOTO_VIEW_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <Input type="date" value={photoDateFromFilter} onChange={(event) => setPhotoDateFromFilter(event.target.value)} className="h-9 border-[#CBD5E1]" />
                <Input type="date" value={photoDateToFilter} onChange={(event) => setPhotoDateToFilter(event.target.value)} className="h-9 border-[#CBD5E1]" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPhotoSearch("");
                    setPhotoCategoryFilter("All");
                    setPhotoTradeFilter("All");
                    setPhotoAreaFilter("All");
                    setPhotoLinkFilter("All");
                    setPhotoAssigneeFilter("All");
                    setPhotoSignoffFilter("All");
                    setPhotoDateFromFilter("");
                    setPhotoDateToFilter("");
                    setPhotoViewMode("grid");
                  }}
                  className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
                >
                  Reset Filters
                </Button>
              </div>

              {isPhotosLoading ? <div className="h-4 w-28 animate-pulse rounded bg-[#E2E8F0]" /> : null}

              {filteredPhotos.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-7 text-center">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>No photos yet</p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>Upload photos to document site progress and quality.</p>
                </div>
              ) : null}

              {photoViewMode === "grid" ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredPhotos.map((entry) => (
                    <button key={entry.id} type="button" onClick={() => openPhotoDetail(entry.id)} className="overflow-hidden rounded-[8px] border border-[#E6EAF0] bg-white text-left transition-colors hover:bg-[#F8FAFC]">
                      <div className="h-44 bg-[#E2E8F0]">
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                        </>
                      </div>
                      <div className="space-y-1 px-3 py-3">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{entry.title || "Untitled photo"}</p>
                        <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                          {entry.trade || "No trade"} • {entry.location || "No location"} • {formatTimestamp(entry.capturedAt)}
                        </p>
                        {entry.assignedUserName ? <p className={`${interMedium.className} text-[11px] text-[#64748B]`}>Assigned to {entry.assignedUserName}</p> : null}
                        <div className="flex flex-wrap gap-1">
                          <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">{entry.category}</Badge>
                          {entry.linkedIssueId ? <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Issue</Badge> : null}
                          {entry.linkedInspectionId ? <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Inspection</Badge> : null}
                          {entry.hasSignoffEvidence ? <Badge className="border border-[#CBD5E1] bg-white text-[#334155]">Sign-off</Badge> : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {timelinePhotos.map(([dateKey, entries]) => (
                    <div key={dateKey} className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                      <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>
                        {new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-NZ", {
                          weekday: "long",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>{entries.length} photo{entries.length === 1 ? "" : "s"} uploaded</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {entries.map((entry) => (
                          <button key={entry.id} type="button" onClick={() => openPhotoDetail(entry.id)} className="flex items-center gap-3 rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC] p-2 text-left">
                            <div className="h-16 w-16 overflow-hidden rounded-[6px] bg-[#E2E8F0]">
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={entry.photoUrl} alt={entry.title || entry.location || "Photo"} className="h-full w-full object-cover" />
                              </>
                            </div>
                            <div className="min-w-0">
                              <p className={`${interMedium.className} truncate text-xs font-semibold text-[#0F172A]`}>{entry.title || "Untitled photo"}</p>
                              <p className={`${interMedium.className} text-[11px] text-[#64748B]`}>{formatTimestamp(entry.capturedAt)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!isLoading && activeTab === "Sign-Offs" ? (
            <div className="space-y-3">
              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-[2fr_1fr_1fr]">
                <Input value={signoffSearch} onChange={(event) => setSignoffSearch(event.target.value)} className="h-9 border-[#CBD5E1]" />
                <select value={signoffStatusFilter} onChange={(event) => setSignoffStatusFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Signed">Signed</option>
                  <option value="Rejected">Rejected</option>
                </select>
                <select value={signoffDueFilter} onChange={(event) => setSignoffDueFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Due Dates</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Due Today">Due Today</option>
                  <option value="No Due Date">No Due Date</option>
                </select>
              </div>
              <div className="grid gap-2 rounded-[8px] border border-[#E6EAF0] bg-white p-3 md:grid-cols-4">
                <select value={signoffTypeFilter} onChange={(event) => setSignoffTypeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="All">All Types</option>
                  <option value="Internal">Internal</option>
                  <option value="Client">Client</option>
                  <option value="Council">Council</option>
                  <option value="Final Handover">Final Handover</option>
                </select>
                <select value={signoffTradeFilter} onChange={(event) => setSignoffTradeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {signoffTradeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={signoffAssigneeFilter} onChange={(event) => setSignoffAssigneeFilter(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {signoffAssigneeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSignoffSearch("");
                    setSignoffStatusFilter("All");
                    setSignoffTypeFilter("All");
                    setSignoffTradeFilter("All");
                    setSignoffAssigneeFilter("All");
                    setSignoffDueFilter("All");
                  }}
                  className="h-9 border-[#CBD5E1] bg-white text-[#334155]"
                >
                  Reset Filters
                </Button>
              </div>

              {filteredSignoffs.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white px-4 py-7 text-center">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>No sign-offs yet</p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>Create sign-offs to approve completed work and track accountability.</p>
                </div>
              ) : null}

              {filteredSignoffs.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedSignoffId(item.id);
                    setIsSignoffSheetOpen(true);
                  }}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#E6EAF0] bg-white px-4 py-3 transition-colors hover:bg-[#F8FAFC]"
                >
                  <div className="min-w-0">
                    <p className={`${interMedium.className} truncate text-sm font-semibold text-[#0F172A]`}>{item.title}</p>
                    <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                      {item.type} • {item.trade || "No trade"} • {item.location || "No location"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${signOffTone(item.status)}`}>
                      {item.status}
                    </span>
                    {item.dueDate ? (
                      <span className={`${interMedium.className} rounded-full border border-[#CBD5E1] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#475569]`}>
                        Due {item.dueDate}
                      </span>
                    ) : null}
                    <span className={`${interMedium.className} flex h-7 w-7 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-semibold text-[#1D4ED8]`}>
                      {(item.signedBy || item.assignee || "U").slice(0, 1).toUpperCase()}
                    </span>
                    <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                      {item.signedBy && item.signedAt ? `${item.signedBy} • ${formatTimestamp(item.signedAt)}` : item.assignee || "Unassigned"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        </div>
      </div>

      <Sheet open={isCreateSignoffSheetOpen} onOpenChange={setIsCreateSignoffSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          <div className="space-y-4 pr-6">
            <div>
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>New Sign-Off</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Add Sign-Off</h3>
            </div>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
              <Input value={newSignoffTitle} onChange={(event) => setNewSignoffTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Type</span>
                <select value={newSignoffType} onChange={(event) => setNewSignoffType(event.target.value as SignOffType)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="Internal">Internal</option>
                  <option value="Client">Client</option>
                  <option value="Council">Council</option>
                  <option value="Final Handover">Final Handover</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
                <Input type="date" value={newSignoffDueDate} onChange={(event) => setNewSignoffDueDate(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                <Input value={newSignoffTrade} onChange={(event) => setNewSignoffTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                <Input value={newSignoffLocation} onChange={(event) => setNewSignoffLocation(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                <select value={newSignoffAssigneeUserId} onChange={(event) => setNewSignoffAssigneeUserId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <select value={newSignoffLinkedInspectionId} onChange={(event) => setNewSignoffLinkedInspectionId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="">Link inspection (optional)</option>
                {inspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    {inspection.title}
                  </option>
                ))}
              </select>
              <select value={newSignoffLinkedIssueId} onChange={(event) => setNewSignoffLinkedIssueId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="">Link issue (optional)</option>
                {issues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.title}
                  </option>
                ))}
              </select>
            </div>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Note</span>
              <textarea
                value={newSignoffNote}
                onChange={(event) => setNewSignoffNote(event.target.value)}
                className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
              />
            </label>
            <Button type="button" onClick={() => void createSignoff()} disabled={isSaving || !newSignoffTitle.trim()} className="h-10 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70">
              Add Sign-Off
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isSignoffSheetOpen} onOpenChange={setIsSignoffSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[620px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          {selectedSignoff ? (
            <div className="space-y-4 pr-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>Sign-Off Detail</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">{selectedSignoff.title || "Sign-Off"}</h3>
                </div>
                <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${signOffTone(selectedSignoff.status)}`}>
                  {selectedSignoff.status}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
                  <Input
                    value={selectedSignoff.title}
                    onChange={(event) => setSignoffLocal(selectedSignoff.id, { title: event.target.value })}
                    onBlur={(event) => void saveSignoffFields(selectedSignoff.id, { title: event.target.value.trim() }, "Details updated", "Title updated")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Type</span>
                  <select
                    value={selectedSignoff.type}
                    onChange={(event) => {
                      const type = event.target.value as SignOffType;
                      setSignoffLocal(selectedSignoff.id, { type });
                      void saveSignoffFields(selectedSignoff.id, { type }, "Type changed", type);
                    }}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                    disabled={isSaving}
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
                    value={selectedSignoff.dueDate ?? ""}
                    onChange={(event) => setSignoffLocal(selectedSignoff.id, { dueDate: event.target.value || null })}
                    onBlur={(event) => void saveSignoffFields(selectedSignoff.id, { dueDate: event.target.value || null }, "Due date changed", event.target.value || "Cleared")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                  <Input
                    value={selectedSignoff.trade}
                    onChange={(event) => setSignoffLocal(selectedSignoff.id, { trade: event.target.value })}
                    onBlur={(event) => void saveSignoffFields(selectedSignoff.id, { trade: event.target.value.trim() }, "Details updated", "Trade updated")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                  <Input
                    value={selectedSignoff.location}
                    onChange={(event) => setSignoffLocal(selectedSignoff.id, { location: event.target.value })}
                    onBlur={(event) => void saveSignoffFields(selectedSignoff.id, { location: event.target.value.trim() }, "Details updated", "Location updated")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                  <select
                    value={selectedSignoff.assigneeUserId ?? ""}
                    onChange={(event) => {
                      const assigneeUserId = event.target.value || null;
                      const assignee = assigneeUserId ? organizationUserNameById.get(assigneeUserId) ?? "" : "";
                      setSignoffLocal(selectedSignoff.id, { assigneeUserId, assignee });
                      void saveSignoffFields(selectedSignoff.id, { assigneeUserId, assignee }, "Assignment updated", assignee || "Unassigned");
                    }}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                    disabled={isSaving}
                  >
                    {organizationUserOptions.map((member) => (
                      <option key={member.userId || "none"} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <select
                  value={selectedSignoff.linkedInspectionId ?? ""}
                  onChange={(event) => {
                    const linkedInspectionId = event.target.value || null;
                    setSignoffLocal(selectedSignoff.id, { linkedInspectionId });
                    void saveSignoffFields(selectedSignoff.id, { linkedInspectionId }, "Evidence link updated", linkedInspectionId ? "Inspection linked" : "Inspection unlinked");
                  }}
                  className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  disabled={isSaving}
                >
                  <option value="">Link inspection (optional)</option>
                  {inspections.map((inspection) => (
                    <option key={inspection.id} value={inspection.id}>
                      {inspection.title}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedSignoff.linkedIssueId ?? ""}
                  onChange={(event) => {
                    const linkedIssueId = event.target.value || null;
                    setSignoffLocal(selectedSignoff.id, { linkedIssueId });
                    void saveSignoffFields(selectedSignoff.id, { linkedIssueId }, "Evidence link updated", linkedIssueId ? "Issue linked" : "Issue unlinked");
                  }}
                  className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                  disabled={isSaving}
                >
                  <option value="">Link issue (optional)</option>
                  {issues.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.title}
                    </option>
                  ))}
                </select>
              </div>

              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Note</span>
                <textarea
                  value={selectedSignoff.note}
                  onChange={(event) => setSignoffLocal(selectedSignoff.id, { note: event.target.value })}
                  onBlur={(event) => void saveSignoffFields(selectedSignoff.id, { note: event.target.value }, "Note updated")}
                  className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
                  disabled={isSaving}
                />
              </label>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Evidence</p>
                <p className={`${interMedium.className} text-xs text-[#334155]`}>
                  Linked inspection: {selectedSignoff.linkedInspectionId ? inspectionIndex.get(selectedSignoff.linkedInspectionId)?.title ?? selectedSignoff.linkedInspectionId : "None"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                  Linked issue: {selectedSignoff.linkedIssueId ? issueIndex.get(selectedSignoff.linkedIssueId)?.title ?? selectedSignoff.linkedIssueId : "None"}
                </p>
                <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>Sign-off evidence photos: {signoffEvidencePhotos.length}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {signoffEvidencePhotos.slice(0, 6).map((photo) => (
                    <button key={photo.id} type="button" onClick={() => openPhotoDetail(photo.id)} className="h-16 overflow-hidden rounded-[6px] border border-[#E6EAF0] bg-[#E2E8F0]">
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
                <p className={`${interMedium.className} text-xs text-[#334155]`}>Open issues: {signoffQaBlockers.openIssues}</p>
                <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>Incomplete inspections: {signoffQaBlockers.incompleteInspections}</p>
                <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>Evidence photos: {signoffQaBlockers.evidenceCount}</p>
                {(signoffQaBlockers.openIssues > 0 || signoffQaBlockers.incompleteInspections > 0 || signoffQaBlockers.evidenceCount === 0) ? (
                  <p className={`${interMedium.className} mt-2 text-xs font-semibold text-rose-700`}>Cannot sign off — incomplete QA items</p>
                ) : null}
              </div>

              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Action Note</span>
                <textarea
                  value={signoffActionNote}
                  onChange={(event) => setSignoffActionNote(event.target.value)}
                  className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
                />
              </label>

              {canCurrentUserActionSignoff ? (
                <div className="flex gap-2">
                  <Button type="button" onClick={() => void updateSignoffStatus(selectedSignoff.id, "Signed")} disabled={isSaving} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                    Sign-Off
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void updateSignoffStatus(selectedSignoff.id, "Rejected")} disabled={isSaving} className="h-9 rounded-[6px] border-rose-200 bg-rose-50 px-3 text-xs text-rose-700 hover:bg-rose-100">
                    Reject
                  </Button>
                </div>
              ) : (
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>Assigned to {selectedSignoff.assignee || "another user"}.</p>
              )}

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Activity</p>
                <div className="space-y-2">
                  {signoffActivity.map((entry) => (
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
                  {signoffActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No activity yet.</p> : null}
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

      <Sheet open={isCreateInspectionSheetOpen} onOpenChange={setIsCreateInspectionSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          <div className="space-y-4 pr-6">
            <div>
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>New Inspection</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Add Inspection</h3>
            </div>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
              <Input value={newInspectionTitle} onChange={(event) => setNewInspectionTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                <Input value={newInspectionTrade} onChange={(event) => setNewInspectionTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                <Input value={newInspectionLocation} onChange={(event) => setNewInspectionLocation(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                <select value={newInspectionAssigneeUserId} onChange={(event) => setNewInspectionAssigneeUserId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
                <Input type="date" value={newInspectionDueDate} onChange={(event) => setNewInspectionDueDate(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
            </div>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Template</span>
              <select value={newInspectionTemplate} onChange={(event) => setNewInspectionTemplate(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {INSPECTION_TEMPLATES.map((template) => (
                  <option key={template.label} value={template.value}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={() => void createInspection()} disabled={isSaving || !newInspectionTitle.trim()} className="h-10 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70">
              Add Inspection
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isInspectionSheetOpen} onOpenChange={setIsInspectionSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[620px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          {selectedInspection ? (
            <div className="space-y-4 pr-6">
              <div>
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>Inspection Detail</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">{selectedInspection.title || "Inspection"}</h3>
                <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>
                  {getInspectionProgress(selectedInspection.items).complete} / {getInspectionProgress(selectedInspection.items).total} complete
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
                  <Input
                    value={selectedInspection.title}
                    onChange={(event) => setInspectionLocal(selectedInspection.id, { title: event.target.value })}
                    onBlur={(event) => void saveInspectionFields(selectedInspection.id, { title: event.target.value.trim() }, "Details updated", "Title updated")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                  <Input
                    value={selectedInspection.trade}
                    onChange={(event) => setInspectionLocal(selectedInspection.id, { trade: event.target.value })}
                    onBlur={(event) => void saveInspectionFields(selectedInspection.id, { trade: event.target.value.trim() }, "Details updated", "Trade updated")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                  <Input
                    value={selectedInspection.location}
                    onChange={(event) => setInspectionLocal(selectedInspection.id, { location: event.target.value })}
                    onBlur={(event) => void saveInspectionFields(selectedInspection.id, { location: event.target.value.trim() }, "Details updated", "Location updated")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                  <select
                    value={selectedInspection.assigneeUserId ?? ""}
                    onChange={(event) => {
                      const assigneeUserId = event.target.value || null;
                      const assignee = assigneeUserId ? organizationUserNameById.get(assigneeUserId) ?? "" : "";
                      setInspectionLocal(selectedInspection.id, { assigneeUserId, assignee });
                      void saveInspectionFields(selectedInspection.id, { assigneeUserId, assignee }, "Assignment updated", assignee || "Assignee cleared");
                    }}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}
                    disabled={isSaving}
                  >
                    {organizationUserOptions.map((member) => (
                      <option key={member.userId || "none"} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
                  <Input
                    type="date"
                    value={selectedInspection.dueDate ?? ""}
                    onChange={(event) => setInspectionLocal(selectedInspection.id, { dueDate: event.target.value || null })}
                    onBlur={(event) => void saveInspectionFields(selectedInspection.id, { dueDate: event.target.value || null }, "Due date changed", event.target.value ? `Due ${event.target.value}` : "Due date cleared")}
                    className="h-10 border-[#CBD5E1] bg-white"
                    disabled={isSaving}
                  />
                </label>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>Checklist</p>
                  <span className={`${interMedium.className} rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${inspectionStatusTone(getInspectionStatus(selectedInspection.items))}`}>
                    {getInspectionStatus(selectedInspection.items)}
                  </span>
                </div>
                <div className="space-y-3">
                  {selectedInspection.items.map((item) => (
                    <div key={item.id} className="rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`${interMedium.className} text-sm font-semibold text-[#1E293B]`}>{item.label}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void updateChecklistStatus(selectedInspection.id, item.id, "pass")}
                            disabled={isSaving}
                            className={cn(
                              `${interMedium.className} rounded-[6px] border px-2.5 py-1 text-xs font-semibold`,
                              item.status === "pass" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-[#CBD5E1] bg-white text-[#475569]"
                            )}
                          >
                            Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateChecklistStatus(selectedInspection.id, item.id, "fail")}
                            disabled={isSaving}
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
                          onChange={(event) => setInspectionItemLocal(item.id, { notes: event.target.value })}
                          onBlur={(event) => void saveChecklistText(selectedInspection.id, item.id, "notes", event.target.value)}
                          className="h-9 border-[#CBD5E1] bg-white"
                          disabled={isSaving}
                        />
                        <Input
                          value={item.photoUrl}
                          onChange={(event) => setInspectionItemLocal(item.id, { photoUrl: event.target.value })}
                          onBlur={(event) => void saveChecklistText(selectedInspection.id, item.id, "photo_url", event.target.value)}
                          className="h-9 border-[#CBD5E1] bg-white"
                          disabled={isSaving}
                        />
                        <Input type="file" accept="image/*" onChange={(event) => void handleInspectionItemPhotoFileSelect(selectedInspection.id, item.id, event)} className="h-9 border-[#CBD5E1] bg-white" disabled={isSaving} />
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => void addInspectionPhotoToLog(selectedInspection.id, item)} disabled={isSaving || !item.photoUrl.trim()} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                            Add to Photo Log
                          </Button>
                          {item.status === "fail" ? (
                            <Button type="button" variant="outline" onClick={() => void createIssueFromInspectionFail(selectedInspection.id, item)} disabled={isSaving} className="h-9 rounded-[6px] border-[#CBD5E1] bg-white text-xs text-[#334155]">
                              Create Issue
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {selectedInspection.items.length === 0 ? (
                    <p className={`${interMedium.className} text-xs text-[#64748B]`}>No checklist items yet.</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Input value={newInspectionItemLabel} onChange={(event) => setNewInspectionItemLabel(event.target.value)} className="h-9 border-[#CBD5E1] bg-white" />
                    <Button type="button" onClick={() => void addInspectionItem()} disabled={isSaving || !newInspectionItemLabel.trim()} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                      Add Item
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Activity</p>
                <div className="space-y-2">
                  {inspectionActivity.map((entry) => (
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
                  {inspectionActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No activity yet.</p> : null}
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

      <Sheet open={isCreatePhotoOpen} onOpenChange={setIsCreatePhotoOpen}>
        <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          <div className="space-y-4 pr-6">
            <div>
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>New Photo</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Upload Photo</h3>
            </div>
            <div className="space-y-2">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Photo</span>
              <label className="flex cursor-pointer items-center justify-between rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 hover:bg-[#F8FAFC]">
                <span className={`${interMedium.className} text-sm font-medium text-[#334155]`}>
                  {newPhotoFileName || "Choose photo"}
                </span>
                <span className={`${interMedium.className} rounded-[6px] bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white`}>
                  Browse
                </span>
                <input type="file" accept="image/*" onChange={(event) => void handleNewPhotoFileSelect(event)} className="hidden" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
                <Input value={newPhotoTitle} onChange={(event) => setNewPhotoTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                <Input value={newPhotoTrade} onChange={(event) => setNewPhotoTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                <Input value={newPhotoLocation} onChange={(event) => setNewPhotoLocation(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Type</span>
                <select value={newPhotoCategory} onChange={(event) => setNewPhotoCategory(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {PHOTO_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Captured</span>
                <Input type="datetime-local" value={newPhotoCapturedAt} onChange={(event) => setNewPhotoCapturedAt(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                <select value={newPhotoAssignedUserId} onChange={(event) => setNewPhotoAssignedUserId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Link</span>
              <select value={newPhotoLinkMode} onChange={(event) => setNewPhotoLinkMode(event.target.value as "none" | "issue" | "inspection")} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                {PHOTO_LINK_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
            {newPhotoLinkMode === "issue" ? (
              <select value={newPhotoIssueId} onChange={(event) => setNewPhotoIssueId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                <option value="">Select issue</option>
                {issues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.title}
                  </option>
                ))}
              </select>
            ) : null}
            {newPhotoLinkMode === "inspection" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <select value={newPhotoInspectionId} onChange={(event) => setNewPhotoInspectionId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="">Select inspection</option>
                  {inspections.map((inspection) => (
                    <option key={inspection.id} value={inspection.id}>
                      {inspection.title}
                    </option>
                  ))}
                </select>
                <select value={newPhotoInspectionItemId} onChange={(event) => setNewPhotoInspectionItemId(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="">Select checklist item</option>
                  {(inspections.find((inspection) => inspection.id === newPhotoInspectionId)?.items ?? []).map((item) => (
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
                value={newPhotoNotes}
                onChange={(event) => setNewPhotoNotes(event.target.value)}
                className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
              />
            </label>
            <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs text-[#334155]`}>
              <input type="checkbox" checked={newPhotoHasSignoffEvidence} onChange={(event) => setNewPhotoHasSignoffEvidence(event.target.checked)} />
              Mark as sign-off evidence
            </label>
            <Button type="button" onClick={() => void createPhotoFromPhotoLog()} disabled={isSaving || !newPhotoUrl.trim()} className="h-10 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70">
              Save Photo
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isCreateIssueSheetOpen} onOpenChange={setIsCreateIssueSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          <div className="space-y-4 pr-6">
            <div>
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>New Issue</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Add QA Issue</h3>
            </div>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
              <Input value={newIssueTitle} onChange={(event) => setNewIssueTitle(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
            </label>

            <label className="space-y-1">
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Notes</span>
              <textarea
                value={newIssueDescription}
                onChange={(event) => setNewIssueDescription(event.target.value)}
                className={`${interMedium.className} min-h-[96px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                <Input value={newIssueTrade} onChange={(event) => setNewIssueTrade(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                <Input value={newIssueLocation} onChange={(event) => setNewIssueLocation(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Priority</span>
                <select value={newIssuePriority} onChange={(event) => setNewIssuePriority(event.target.value as "Low" | "Medium" | "High")} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Status</span>
                <select value={newIssueStatus} onChange={(event) => setNewIssueStatus(event.target.value as IssueStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Complete">Complete</option>
                  <option value="Verified">Verified</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
                <Input type="date" value={newIssueDueDate} onChange={(event) => setNewIssueDueDate(event.target.value)} className="h-10 border-[#CBD5E1] bg-white" />
              </label>
              <label className="space-y-1">
                <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assigned To</span>
                <select value={newIssueAssigneeUserId} onChange={(event) => setNewIssueAssigneeUserId(event.target.value)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs text-[#334155]`}>
              <input type="checkbox" checked={newIssueCreateLinkedTask} onChange={(event) => setNewIssueCreateLinkedTask(event.target.checked)} />
              Create linked Task
            </label>

            <Button type="button" onClick={() => void createIssue()} disabled={isSaving || !newIssueTitle.trim()} className="h-10 rounded-[6px] bg-[#F74917] px-4 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70">
              Add Issue
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isIssueSheetOpen} onOpenChange={setIsIssueSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[560px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          {selectedIssue ? (
            <div className="space-y-4 pr-6">
              <div>
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]`}>Issue Detail</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">{selectedIssue.title || "Issue"}</h3>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Title</span>
                  <Input
                    value={selectedIssue.title}
                    onChange={(event) => setIssueLocal(selectedIssue.id, { title: event.target.value })}
                    onBlur={(event) => void saveIssueFields(selectedIssue.id, { title: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Title updated")}
                    disabled={isSaving}
                    className="h-10 border-[#CBD5E1] bg-white text-sm text-[#1E293B]"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Description</span>
                  <textarea
                    value={selectedIssue.description}
                    onChange={(event) => setIssueLocal(selectedIssue.id, { description: event.target.value })}
                    onBlur={(event) => void saveIssueFields(selectedIssue.id, { description: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Description updated")}
                    disabled={isSaving}
                    className={`${interMedium.className} min-h-[88px] w-full rounded-[6px] border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none ring-0`}
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Trade</span>
                  <Input
                    value={selectedIssue.trade}
                    onChange={(event) => setIssueLocal(selectedIssue.id, { trade: event.target.value })}
                    onBlur={(event) => void saveIssueFields(selectedIssue.id, { trade: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Trade updated")}
                    disabled={isSaving}
                    className="h-10 border-[#CBD5E1] bg-white text-sm text-[#1E293B]"
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Location</span>
                  <Input
                    value={selectedIssue.location}
                    onChange={(event) => setIssueLocal(selectedIssue.id, { location: event.target.value })}
                    onBlur={(event) => void saveIssueFields(selectedIssue.id, { location: event.target.value.trim(), updatedAt: new Date().toISOString() }, "Details updated", "Location updated")}
                    disabled={isSaving}
                    className="h-10 border-[#CBD5E1] bg-white text-sm text-[#1E293B]"
                  />
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Status</span>
                  <select
                    value={selectedIssue.status}
                    onChange={(event) => void setIssueStatus(selectedIssue.id, event.target.value as IssueStatus)}
                    disabled={isSaving}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm text-[#1E293B]`}
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Complete">Complete</option>
                    <option value="Verified">Verified</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Priority</span>
                  <select
                    value={selectedIssue.priority}
                    onChange={(event) => {
                      const priority = event.target.value as "Low" | "Medium" | "High";
                      setIssueLocal(selectedIssue.id, { priority });
                      void saveIssueFields(selectedIssue.id, { priority, updatedAt: new Date().toISOString() }, "Priority changed", `Priority set to ${priority}`);
                    }}
                    disabled={isSaving}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm text-[#1E293B]`}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Assignee</span>
                  <select
                    value={selectedIssue.assigneeUserId ?? ""}
                    onChange={(event) => void setIssueAssignee(selectedIssue.id, event.target.value)}
                    disabled={isSaving}
                    className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm text-[#1E293B]`}
                  >
                    {organizationUserOptions.map((member) => (
                      <option key={member.userId || "none"} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Due Date</span>
                  <Input
                    type="date"
                    value={selectedIssue.dueDate ?? ""}
                    onChange={(event) => setIssueLocal(selectedIssue.id, { dueDate: event.target.value || null })}
                    onBlur={(event) => void saveIssueFields(selectedIssue.id, { dueDate: event.target.value || null, updatedAt: new Date().toISOString() }, "Due date changed", event.target.value ? `Due ${event.target.value}` : "Due date cleared")}
                    disabled={isSaving}
                    className="h-10 border-[#CBD5E1] bg-white text-sm text-[#1E293B]"
                  />
                </label>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Add Photos</p>
                <div className="flex gap-2">
                  <Input type="file" accept="image/*" onChange={(event) => void handleIssuePhotoFileSelect(event)} className="h-9 border-[#CBD5E1]" disabled={isSaving} />
                  <Input value={issuePhotoUrlDraft} onChange={(event) => setIssuePhotoUrlDraft(event.target.value)} className="h-9 border-[#CBD5E1]" disabled={isSaving} />
                  <Button
                    type="button"
                    onClick={() => void addIssuePhoto()}
                    disabled={isSaving || !issuePhotoUrlDraft.trim()}
                    className="h-9 rounded-[6px] bg-[#F74917] px-3 text-xs font-semibold text-white hover:bg-[#e63f10] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Comments</p>
                <div className="space-y-2">
                  {issueComments.map((entry) => (
                    <div key={entry.id} className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                      <p className={`${interMedium.className} text-xs font-semibold text-[#0F172A]`}>{entry.authorName || "Unknown"}</p>
                      <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>{entry.comment}</p>
                      <p className={`${interMedium.className} mt-1 text-[11px] text-[#64748B]`}>{formatTimestamp(entry.createdAt)}</p>
                    </div>
                  ))}
                  {issueComments.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No comments yet.</p> : null}
                  <div className="flex gap-2">
                    <Input value={issueCommentDraft} onChange={(event) => setIssueCommentDraft(event.target.value)} className="h-9 border-[#CBD5E1] bg-white" />
                    <Button type="button" onClick={() => void addIssueComment()} disabled={isSaving || !issueCommentDraft.trim()} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#0F172A]`}>Activity</p>
                <div className="space-y-2">
                  {issueActivity.map((entry) => (
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
                  {issueActivity.length === 0 ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>No activity yet.</p> : null}
                </div>
              </div>

              <Button type="button" variant="outline" onClick={() => void deleteIssue(selectedIssue.id)} disabled={isSaving} className="h-9 rounded-[6px] border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100">
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete Issue
              </Button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="h-4 w-36 animate-pulse rounded bg-[#E2E8F0]" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={isPhotoDetailOpen} onOpenChange={setIsPhotoDetailOpen}>
        <SheetContent side="right" className="w-full max-w-[560px] overflow-y-auto border-l border-[#E6EAF0] bg-[#F8F9FC] p-5">
          {selectedPhoto ? (
            <div className="space-y-4 pr-6">
              <div className="h-64 overflow-hidden rounded-[8px] border border-[#E6EAF0] bg-[#E2E8F0]">
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedPhoto.photoUrl} alt={selectedPhoto.title || "Photo"} className="h-full w-full object-cover" />
                </>
              </div>

              <div className="space-y-2">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Photo Context</p>
                <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{selectedPhoto.title || "Untitled photo"}</p>
                <p className={`${interMedium.className} text-xs text-[#64748B]`}>
                  Uploaded by {selectedPhoto.uploadedByName || "Unknown"} • {formatTimestamp(selectedPhoto.capturedAt)}
                </p>
                {selectedPhoto.assignedUserName ? <p className={`${interMedium.className} text-xs text-[#64748B]`}>Assigned to {selectedPhoto.assignedUserName}</p> : null}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Input value={photoEditTitle} onChange={(event) => setPhotoEditTitle(event.target.value)} disabled={!isPhotoEditing} className="h-9 border-[#CBD5E1]" />
                <Input value={photoEditTrade} onChange={(event) => setPhotoEditTrade(event.target.value)} disabled={!isPhotoEditing} className="h-9 border-[#CBD5E1]" />
                <Input value={photoEditLocation} onChange={(event) => setPhotoEditLocation(event.target.value)} disabled={!isPhotoEditing} className="h-9 border-[#CBD5E1]" />
                <Input value={photoEditStatusTag} onChange={(event) => setPhotoEditStatusTag(event.target.value)} disabled={!isPhotoEditing} className="h-9 border-[#CBD5E1]" />
                <select value={photoEditCategory} onChange={(event) => setPhotoEditCategory(event.target.value)} disabled={!isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {PHOTO_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={photoEditPhaseTag} onChange={(event) => setPhotoEditPhaseTag(event.target.value as PhotoPhase)} disabled={!isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  <option value="">No phase</option>
                  <option value="before">Before</option>
                  <option value="during">During</option>
                  <option value="after">After</option>
                </select>
                <select value={photoEditType} onChange={(event) => setPhotoEditType(event.target.value as PhotoType)} disabled={!isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {PHOTO_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select value={photoEditAssignedUserId} onChange={(event) => setPhotoEditAssignedUserId(event.target.value)} disabled={!isPhotoEditing} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                  {organizationUserOptions.map((member) => (
                    <option key={member.userId || "none"} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs text-[#334155]`}>
                  <input type="checkbox" checked={photoEditSignoffEvidence} onChange={(event) => setPhotoEditSignoffEvidence(event.target.checked)} disabled={!isPhotoEditing} />
                  Handover evidence
                </label>
              </div>

              {isPhotoEditing ? (
                <>
                  {photoEditType === "issue" ? (
                    <select value={photoEditIssueId} onChange={(event) => setPhotoEditIssueId(event.target.value)} className={`${interMedium.className} h-9 w-full rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                      <option value="">Select issue</option>
                      {issues.map((issue) => (
                        <option key={issue.id} value={issue.id}>
                          {issue.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {photoEditType === "inspection" ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      <select value={photoEditInspectionId} onChange={(event) => setPhotoEditInspectionId(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                        <option value="">Select inspection</option>
                        {inspections.map((inspection) => (
                          <option key={inspection.id} value={inspection.id}>
                            {inspection.title}
                          </option>
                        ))}
                      </select>
                      <select value={photoEditInspectionItemId} onChange={(event) => setPhotoEditInspectionItemId(event.target.value)} className={`${interMedium.className} h-9 rounded-[6px] border border-[#CBD5E1] bg-white px-2 text-sm`}>
                        <option value="">Select checklist item</option>
                        {(inspections.find((inspection) => inspection.id === photoEditInspectionId)?.items ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              ) : null}

              <Input value={photoEditNotes} onChange={(event) => setPhotoEditNotes(event.target.value)} disabled={!isPhotoEditing} className="h-9 border-[#CBD5E1]" />

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                  <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Linked Objects</p>
                  <p className={`${interMedium.className} mt-2 text-xs text-[#334155]`}>
                    {selectedPhoto.linkedIssueId ? `Issue: ${issueIndex.get(selectedPhoto.linkedIssueId)?.title ?? selectedPhoto.linkedIssueId}` : "No issue link"}
                  </p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                    {selectedPhoto.linkedInspectionId
                      ? `Inspection: ${inspectionIndex.get(selectedPhoto.linkedInspectionId)?.title ?? selectedPhoto.linkedInspectionId}`
                      : "No inspection link"}
                  </p>
                  <p className={`${interMedium.className} mt-1 text-xs text-[#334155]`}>
                    {selectedPhoto.linkedInspectionItemId
                      ? `Checklist: ${inspectionItemIndex.get(selectedPhoto.linkedInspectionItemId)?.itemLabel ?? selectedPhoto.linkedInspectionItemId}`
                      : "No checklist item link"}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[#E6EAF0] bg-white p-3">
                  <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]`}>Related Photos</p>
                  <div className="mt-2 space-y-1">
                    {relatedPhotos.map((item) => (
                      <button key={item.id} type="button" onClick={() => openPhotoDetail(item.id)} className={`${interMedium.className} block text-left text-xs text-[#334155] underline`}>
                        {item.title || item.id.slice(0, 8)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {isPhotoEditing ? (
                  <Button type="button" onClick={() => void savePhotoEdits()} disabled={isSaving} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                    Save Details
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setIsPhotoEditing(true)} className="h-9 rounded-[6px] bg-[#0F172A] px-3 text-xs text-white hover:bg-[#1E293B]">
                    Edit Details
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => window.open(selectedPhoto.photoUrl, "_blank")} className="h-9 rounded-[6px] border-[#CBD5E1] bg-white text-xs text-[#334155]">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </Button>
                <Button type="button" variant="outline" onClick={() => void deletePhoto(selectedPhoto.id)} disabled={isSaving} className="h-9 rounded-[6px] border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
