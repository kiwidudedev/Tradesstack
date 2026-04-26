import type {
  IssueStatus,
  PhotoLinkFilter,
  PhotoLinkMode,
  PhotoPhase,
  PhotoType,
  PhotoViewMode,
  QaTab,
  SignOffType,
} from "@/lib/quality-assurance/types";

export const QUALITY_TABS: QaTab[] = ["Overview", "Issues", "Inspections", "Photo Log", "Sign-Offs"];

export const ISSUE_STATUS_OPTIONS: IssueStatus[] = [
  "Open",
  "In Progress",
  "Blocked",
  "Requires Attention",
  "Complete",
  "Verified",
];

export const ISSUE_PRIORITY_OPTIONS = ["Low", "Medium", "High"] as const;

export const PHOTO_CATEGORIES = [
  "Progress",
  "Defect",
  "Inspection",
  "Handover",
  "Hidden Works",
];

export const PHOTO_LINK_MODES: Array<{ value: PhotoLinkMode; label: string }> = [
  { value: "none", label: "No link" },
  { value: "issue", label: "Link to Issue" },
  { value: "inspection", label: "Link to Inspection" },
];

export const PHOTO_VIEW_MODES: Array<{ value: PhotoViewMode; label: string }> = [
  { value: "grid", label: "Grid" },
  { value: "timeline", label: "Timeline" },
];

export const PHOTO_TYPES: Array<{ value: PhotoType; label: string }> = [
  { value: "issue", label: "Issue" },
  { value: "inspection", label: "Inspection" },
  { value: "general", label: "General Site Record" },
];

export const PHOTO_PHASE_OPTIONS: Array<{ value: PhotoPhase; label: string }> = [
  { value: "", label: "No phase" },
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
];

export const PHOTO_LINK_FILTERS: Array<{ value: PhotoLinkFilter; label: string }> = [
  { value: "All", label: "Any Link" },
  { value: "Issue", label: "Issue" },
  { value: "Inspection", label: "Inspection" },
  { value: "General", label: "General" },
];

export const SIGN_OFF_TYPE_OPTIONS: SignOffType[] = [
  "Internal",
  "Client",
  "Council",
  "Final Handover",
];

export const INSPECTION_TEMPLATES: Array<{ value: string; label: string; items: string[] }> = [
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

export const QUALITY_PHOTOS_BUCKET = "project-quality-photos";
export const MAX_QUALITY_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
export const QUALITY_PHOTO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);
