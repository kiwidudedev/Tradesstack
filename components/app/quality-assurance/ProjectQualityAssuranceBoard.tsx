"use client";

import { Suspense, type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { QualitySectionSkeleton } from "@/components/app/ProjectRouteSkeletons";
import {
  INSPECTION_TEMPLATES,
  PHOTO_CATEGORIES,
  PHOTO_LINK_MODES,
  PHOTO_TYPES,
} from "@/lib/quality-assurance/constants";
import {
  buildInspectionItemIndex,
  buildIssuePhotoCountMap,
  buildIssuePhotoCoverMap,
  calculateIssueStats,
  canCurrentUserActionSignoff,
  filterInspections,
  filterIssues,
  filterPhotos,
  filterSignOffs,
  getInspectionStatus,
  getRelatedPhotos,
  getSignoffEvidencePhotos,
  getSignoffQaBlockers,
  groupPhotosByTimeline,
  looksLikeStoragePath,
  toDateTimeLocal,
  toIsoDateTime,
} from "@/lib/quality-assurance/helpers";
import {
  createPhoto,
  createQualityInspectionActivity,
  createQualityIssueActivity,
  createQualitySignoffActivity,
  mapInsertedPhoto,
} from "@/lib/quality-assurance/mutations";
import {
  listLinkedTasks,
  listQualityCoreData,
  listQualityInspectionThread,
  listQualityPhotos,
  listQualityIssueThread,
  listQualitySignoffThread,
  resolveQualityProjectContext,
} from "@/lib/quality-assurance/queries";
import { deleteQualityPhoto, uploadQualityPhoto } from "@/lib/quality-assurance/storage";
import type {
  ChecklistStatus,
  IssueStatus,
  LinkedTask,
  OrganizationUserOption,
  PhotoLinkFilter,
  PhotoLinkMode,
  PhotoPhase,
  PhotoType,
  PhotoViewMode,
  ProjectContext,
  QaTab,
  QualityInspection,
  QualityInspectionActivity,
  QualityInspectionItem,
  QualityIssue,
  QualityIssueActivity,
  QualityIssueComment,
  QualityPhoto,
  QualitySignOff,
  QualitySignOffActivity,
  SignOffStatus,
  SignOffType,
} from "@/lib/quality-assurance/types";
import styles from "@/components/app/trade-pack-builder.module.css";
import { QualityKpiCards } from "./QualityKpiCards";
import { QualityOverviewTab } from "./QualityOverviewTab";
import { QualityIssuesTab } from "./QualityIssuesTab";
import { QualityInspectionsTab } from "./QualityInspectionsTab";
import { QualityPhotoLogTab } from "./QualityPhotoLogTab";
import { QualitySignOffsTab } from "./QualitySignOffsTab";
import { QualityTabs } from "./QualityTabs";
import { CreateQualityIssueSheet, QualityIssueDetailSheet } from "./QualityIssueSheet";
import { CreateQualityInspectionSheet, QualityInspectionDetailSheet } from "./QualityInspectionSheet";
import { CreateQualityPhotoSheet, QualityPhotoDetailSheet } from "./QualityPhotoSheet";
import { CreateQualitySignoffSheet, QualitySignoffDetailSheet } from "./QualitySignOffSheet";

export function ProjectQualityAssuranceBoard() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId ?? "";
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState<QaTab>("Overview");
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [signOffs, setSignOffs] = useState<QualitySignOff[]>([]);
  const [todoLinks, setTodoLinks] = useState<LinkedTask[]>([]);
  const [photos, setPhotos] = useState<QualityPhoto[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isIssueSheetOpen, setIsIssueSheetOpen] = useState(false);
  const [isCreateIssueSheetOpen, setIsCreateIssueSheetOpen] = useState(false);
  const [issuePhotoUrlDraft, setIssuePhotoUrlDraft] = useState("");
  const [issuePhotoFileDraft, setIssuePhotoFileDraft] = useState<File | null>(null);
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

  const [isCreateInspectionSheetOpen, setIsCreateInspectionSheetOpen] = useState(false);
  const [isInspectionSheetOpen, setIsInspectionSheetOpen] = useState(false);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [inspectionActivity, setInspectionActivity] = useState<QualityInspectionActivity[]>([]);
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
  const [signoffActivity, setSignoffActivity] = useState<QualitySignOffActivity[]>([]);
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
  const [newPhotoLinkMode, setNewPhotoLinkMode] = useState<PhotoLinkMode>("none");
  const [newPhotoCategory, setNewPhotoCategory] = useState("Progress");
  const [newPhotoCapturedAt, setNewPhotoCapturedAt] = useState(toDateTimeLocal(new Date().toISOString()));
  const [newPhotoIssueId, setNewPhotoIssueId] = useState("");
  const [newPhotoInspectionId, setNewPhotoInspectionId] = useState("");
  const [newPhotoInspectionItemId, setNewPhotoInspectionItemId] = useState("");
  const [newPhotoAssignedUserId, setNewPhotoAssignedUserId] = useState("");
  const [newPhotoHasSignoffEvidence, setNewPhotoHasSignoffEvidence] = useState(false);
  const [newPhotoFileName, setNewPhotoFileName] = useState("");
  const [newPhotoFileDraft, setNewPhotoFileDraft] = useState<File | null>(null);

  const [photoSearch, setPhotoSearch] = useState("");
  const [photoTradeFilter, setPhotoTradeFilter] = useState("All");
  const [photoAreaFilter, setPhotoAreaFilter] = useState("All");
  const [photoDateFromFilter, setPhotoDateFromFilter] = useState("");
  const [photoDateToFilter, setPhotoDateToFilter] = useState("");
  const [photoCategoryFilter, setPhotoCategoryFilter] = useState("All");
  const [photoLinkFilter, setPhotoLinkFilter] = useState<PhotoLinkFilter>("All");
  const [photoSignoffFilter, setPhotoSignoffFilter] = useState("All");
  const [photoViewMode, setPhotoViewMode] = useState<PhotoViewMode>("grid");
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
  const [issueComments, setIssueComments] = useState<QualityIssueComment[]>([]);
  const [issueActivity, setIssueActivity] = useState<QualityIssueActivity[]>([]);

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
  const inspectionItemIndex = useMemo(() => buildInspectionItemIndex(inspections), [inspections]);
  const issuePhotoCoverMap = useMemo(() => buildIssuePhotoCoverMap(photos), [photos]);
  const issuePhotoCountMap = useMemo(() => buildIssuePhotoCountMap(photos), [photos]);
  const issueStats = useMemo(() => calculateIssueStats(issues, inspections), [inspections, issues]);

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

  const filteredIssues = useMemo(
    () =>
      filterIssues(issues, {
        search: issueSearch,
        status: issueStatusFilter,
        trade: issueTradeFilter,
        assignee: issueAssigneeFilter,
        location: issueLocationFilter,
        due: issueDueFilter,
      }),
    [issueAssigneeFilter, issueDueFilter, issueLocationFilter, issueSearch, issueStatusFilter, issueTradeFilter, issues]
  );

  const filteredInspections = useMemo(
    () =>
      filterInspections(inspections, {
        search: inspectionSearch,
        status: inspectionStatusFilter,
        trade: inspectionTradeFilter,
        assignee: inspectionAssigneeFilter,
        location: inspectionLocationFilter,
        due: inspectionDueFilter,
      }),
    [
      inspectionAssigneeFilter,
      inspectionDueFilter,
      inspectionLocationFilter,
      inspectionSearch,
      inspectionStatusFilter,
      inspectionTradeFilter,
      inspections,
    ]
  );

  const filteredSignoffs = useMemo(
    () =>
      filterSignOffs(signOffs, {
        search: signoffSearch,
        status: signoffStatusFilter,
        type: signoffTypeFilter,
        trade: signoffTradeFilter,
        assignee: signoffAssigneeFilter,
        due: signoffDueFilter,
      }),
    [signOffs, signoffAssigneeFilter, signoffDueFilter, signoffSearch, signoffStatusFilter, signoffTradeFilter, signoffTypeFilter]
  );

  const photoTradeOptions = useMemo(() => ["All", ...new Set(photos.map((entry) => entry.trade).filter(Boolean))], [photos]);
  const photoAreaOptions = useMemo(() => ["All", ...new Set(photos.map((entry) => entry.location).filter(Boolean))], [photos]);
  const photoCategoryOptions = useMemo(() => ["All", ...PHOTO_CATEGORIES], []);

  const filteredPhotos = useMemo(
    () =>
      filterPhotos(photos, {
        search: photoSearch,
        trade: photoTradeFilter,
        area: photoAreaFilter,
        category: photoCategoryFilter,
        link: photoLinkFilter,
        assignee: photoAssigneeFilter,
        signoff: photoSignoffFilter,
        dateFrom: photoDateFromFilter,
        dateTo: photoDateToFilter,
      }),
    [
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
    ]
  );

  const timelinePhotos = useMemo(() => groupPhotosByTimeline(filteredPhotos), [filteredPhotos]);

  const openPhotoDetail = (photoId: string) => {
    setSelectedPhotoId(photoId);
    setIsPhotoDetailOpen(true);
  };

  const uploadQualityPhotoFile = async (file: File) => {
    return uploadQualityPhoto(supabase, context, session?.id, file);
  };

  const deleteStoredQualityPhoto = async (storagePath: string | null | undefined) => {
    await deleteQualityPhoto(supabase, storagePath);
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
    const next = await resolveQualityProjectContext(supabase, session, routeProjectSlug);
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
    setTodoLinks(await listLinkedTasks(supabase, activeContext));
  };

  const loadIssueThread = async (issueId: string) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const thread = await listQualityIssueThread(supabase, contextRef.current, issueId);
    setIssueComments(thread.comments);
    setIssueActivity(thread.activity);
  };

  const writeIssueActivity = async (issueId: string, action: string, detail = "") => {
    if (!supabase || !contextRef.current) {
      return;
    }
    await createQualityIssueActivity(supabase, contextRef.current, session ?? {}, issueId, action, detail);
  };

  const loadInspectionThread = async (inspectionId: string) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const thread = await listQualityInspectionThread(supabase, contextRef.current, inspectionId);
    setInspectionActivity(thread.activity);
  };

  const writeInspectionActivity = async (inspectionId: string, action: string, detail = "", inspectionItemId: string | null = null) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    await createQualityInspectionActivity(supabase, contextRef.current, session ?? {}, inspectionId, action, detail, inspectionItemId);
  };

  const loadSignoffThread = async (signoffId: string) => {
    if (!supabase || !contextRef.current) {
      return;
    }
    const thread = await listQualitySignoffThread(supabase, contextRef.current, signoffId);
    setSignoffActivity(thread.activity);
  };

  const writeSignoffActivity = async (signoffId: string, action: string, detail = "") => {
    if (!supabase || !contextRef.current) {
      return;
    }
    await createQualitySignoffActivity(supabase, contextRef.current, session ?? {}, signoffId, action, detail);
  };

  const loadCoreData = async (options?: { showLoading?: boolean }) => {
    if (!supabase || !session?.id || !routeProjectSlug || isLoadingRef.current) {
      return;
    }
    const showLoading = options?.showLoading ?? true;
    const timingLabel = `[projects][qa] load:${routeProjectSlug}`;
    console.time(timingLabel);
    isLoadingRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const data = await listQualityCoreData(supabase, session, routeProjectSlug);
      contextRef.current = data.context;
      setContext(data.context);
      setIssues(data.issues);
      setInspections(data.inspections);
      setSignOffs(data.signOffs);
      setTodoLinks(data.todoLinks);
      setOrganizationUsers(data.organizationUsers);
      setSelectedIssueId((current) => current ?? data.issues[0]?.id ?? null);
      setSelectedInspectionId((current) => current ?? data.inspections[0]?.id ?? null);
      setSelectedSignoffId((current) => current ?? data.signOffs[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Quality Assurance.");
    } finally {
      const approximateQueryCount = (session.organizationId ? 0 : 1) + 1 + 5;
      console.info("[projects][qa] query-count", {
        projectSlug: routeProjectSlug,
        approximateQueries: approximateQueryCount,
      });
      console.timeEnd(timingLabel);
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
    const timingLabel = `[projects][qa][photos] load:${routeProjectSlug}`;
    console.time(timingLabel);
    setIsPhotosLoading(true);

    try {
      setPhotos(await listQualityPhotos(supabase, resolvedContext));
      setHasLoadedPhotos(true);
      console.info("[projects][qa][photos] query-count", {
        projectSlug: routeProjectSlug,
        approximateQueries: 1,
      });
    } catch (photoLoadError) {
      setError(photoLoadError instanceof Error ? photoLoadError.message : "Unable to load photo log.");
    } finally {
      console.timeEnd(timingLabel);
      setIsPhotosLoading(false);
    }
  };

  const insertPhoto = async (payload: {
    photoUrl: string;
    storagePath?: string | null;
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
    const data = await createPhoto(supabase, context, session, payload);
    if (!data) {
      return null;
    }
    return mapInsertedPhoto(supabase, data as Record<string, unknown>);
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

  const setInspectionItemLocal = (itemId: string, patch: Partial<QualityInspectionItem>) => {
    setInspections((current) =>
      current.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      }))
    );
  };

  const setInspectionLocal = (inspectionId: string, patch: Partial<QualityInspection>) => {
    setInspections((current) =>
      current.map((inspection) => (inspection.id === inspectionId ? { ...inspection, ...patch } : inspection))
    );
  };

  const saveInspectionFields = async (
    inspectionId: string,
    patch: Partial<QualityInspection>,
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

  const setSignoffLocal = (signoffId: string, patch: Partial<QualitySignOff>) => {
    setSignOffs((current) => current.map((item) => (item.id === signoffId ? { ...item, ...patch } : item)));
  };

  const saveSignoffFields = async (
    signoffId: string,
    patch: Partial<QualitySignOff>,
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

  const setIssueLocal = (issueId: string, patch: Partial<QualityIssue>) => {
    setIssues((current) => current.map((item) => (item.id === issueId ? { ...item, ...patch } : item)));
  };

  const saveIssueFields = async (issueId: string, patch: Partial<QualityIssue>, activityAction?: string, activityDetail?: string) => {
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
      const currentItem =
        inspections
          .find((inspection) => inspection.id === inspectionId)
          ?.items.find((item) => item.id === itemId) ?? null;
      const storagePathToDelete =
        key === "photo_url" &&
        currentItem?.photoStoragePath &&
        value !== currentItem.photoUrl &&
        !looksLikeStoragePath(value)
          ? currentItem.photoStoragePath
          : null;
      const updatePayload =
        key === "photo_url"
          ? {
              photo_url:
                currentItem?.photoStoragePath && value === currentItem.photoUrl
                  ? currentItem.photoStoragePath
                  : value,
              photo_storage_path:
                currentItem?.photoStoragePath && value === currentItem.photoUrl
                  ? currentItem.photoStoragePath
                  : looksLikeStoragePath(value)
                    ? value
                    : null,
            }
          : { [key]: value };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsTable = (supabase as any).from("project_quality_inspection_items");
      const { error: updateError } = await itemsTable
        .update(updatePayload)
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
      if (storagePathToDelete) {
        try {
          await deleteStoredQualityPhoto(storagePathToDelete);
        } catch (storageDeleteError) {
          setError(
            storageDeleteError instanceof Error
              ? `Checklist photo updated, but the previous stored file could not be removed: ${storageDeleteError.message}`
              : "Checklist photo updated, but the previous stored file could not be removed."
          );
        }
      }
      if (selectedInspectionId === inspectionId && isInspectionSheetOpen) {
        await loadInspectionThread(inspectionId);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save inspection note.");
    }
  };

  const addInspectionPhotoToLog = async (inspectionId: string, item: QualityInspectionItem) => {
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
      const sourcePhotoValue = item.photoStoragePath ? item.photoStoragePath : item.photoUrl.trim();
      const inserted = await insertPhoto({
        photoUrl: sourcePhotoValue,
        storagePath: null,
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
    if (!selectedIssue || (!issuePhotoUrlDraft.trim() && !issuePhotoFileDraft)) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      let photoUrl = issuePhotoUrlDraft.trim();
      let storagePath: string | null = null;
      if (issuePhotoFileDraft) {
        const uploaded = await uploadQualityPhotoFile(issuePhotoFileDraft);
        photoUrl = uploaded.signedUrl;
        storagePath = uploaded.storagePath;
      }
      const inserted = await insertPhoto({
        photoUrl,
        storagePath,
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
      setIssuePhotoFileDraft(null);
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
      setIssuePhotoFileDraft(null);
      return;
    }
    setError(null);
    setIssuePhotoFileDraft(file);
    setIssuePhotoUrlDraft(file.name);
  };

  const handleInspectionItemPhotoFileSelect = async (inspectionId: string, itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const inspection = inspections.find((entry) => entry.id === inspectionId);
    const item = inspection?.items.find((entry) => entry.id === itemId) ?? null;
    if (!inspection || !item || !context || !supabase) {
      return;
    }
    const previousPhotoUrl = item.photoUrl;
    const previousPhotoStoragePath = item.photoStoragePath;
    setIsSaving(true);
    setError(null);
    try {
      const uploaded = await uploadQualityPhotoFile(file);
      setInspectionItemLocal(itemId, {
        photoUrl: uploaded.signedUrl,
        photoStoragePath: uploaded.storagePath,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsTable = (supabase as any).from("project_quality_inspection_items");
      const { error: updateError } = await itemsTable
        .update({
          photo_url: uploaded.storagePath,
          photo_storage_path: uploaded.storagePath,
        })
        .eq("id", itemId)
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (previousPhotoStoragePath && previousPhotoStoragePath !== uploaded.storagePath) {
        await deleteStoredQualityPhoto(previousPhotoStoragePath);
      }
      await writeInspectionActivity(inspectionId, "Checklist photo updated", "Photo uploaded", itemId);
      if (selectedInspectionId === inspectionId && isInspectionSheetOpen) {
        await loadInspectionThread(inspectionId);
      }
    } catch (fileError) {
      setInspectionItemLocal(itemId, {
        photoUrl: previousPhotoUrl,
        photoStoragePath: previousPhotoStoragePath,
      });
      setError(fileError instanceof Error ? fileError.message : "Unable to upload selected file.");
    } finally {
      event.target.value = "";
      setIsSaving(false);
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
        .select("id, label, status, notes, photo_url, photo_storage_path")
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
                      photoStoragePath: typeof data.photo_storage_path === "string" ? data.photo_storage_path : null,
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

  const createIssueFromInspectionFail = async (inspectionId: string, item: QualityInspectionItem) => {
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
        const row: QualityIssue = {
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
          const linkedPhotoValue = item.photoStoragePath ? item.photoStoragePath : item.photoUrl.trim();
          const inserted = await insertPhoto({
            photoUrl: linkedPhotoValue,
            storagePath: null,
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
      setNewPhotoFileDraft(null);
      return;
    }
    setError(null);
    setNewPhotoFileDraft(file);
    setNewPhotoUrl(file.name);
    setNewPhotoFileName(file.name);
    if (!newPhotoTitle.trim()) {
      setNewPhotoTitle(file.name);
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
        const row: QualityIssue = {
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
        await writeIssueActivity(row.id, "Issue created", "Linked task is created automatically for active issues");
      }
      setNewIssueTitle("");
      setNewIssueDescription("");
      setNewIssueTrade("");
      setNewIssueLocation("");
      setNewIssuePriority("Medium");
      setNewIssueStatus("Open");
      setNewIssueDueDate("");
      setNewIssueAssigneeUserId("");
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
        const row: QualityInspection = {
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
            .select("id, label, status, notes, photo_url, photo_storage_path");
          if (itemInsertError) {
            throw new Error(itemInsertError.message);
          }
          row.items = ((itemRows ?? []) as Array<Record<string, unknown>>).map((item) => ({
            id: String(item.id),
            label: String(item.label ?? ""),
            status: (item.status as ChecklistStatus) ?? null,
            notes: String(item.notes ?? ""),
            photoUrl: String(item.photo_url ?? ""),
            photoStoragePath: typeof item.photo_storage_path === "string" ? item.photo_storage_path : null,
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
        const row: QualitySignOff = {
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
    if (!newPhotoUrl.trim() && !newPhotoFileDraft) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const linkedIssueId = newPhotoLinkMode === "issue" ? (newPhotoIssueId || null) : null;
      const linkedInspectionId = newPhotoLinkMode === "inspection" ? (newPhotoInspectionId || null) : null;
      const linkedInspectionItemId = newPhotoLinkMode === "inspection" ? (newPhotoInspectionItemId || null) : null;
      const photoType: PhotoType = newPhotoLinkMode === "issue" ? "issue" : newPhotoLinkMode === "inspection" ? "inspection" : "general";
      let photoUrl = newPhotoUrl.trim();
      let storagePath: string | null = null;
      if (newPhotoFileDraft) {
        const uploaded = await uploadQualityPhotoFile(newPhotoFileDraft);
        photoUrl = uploaded.signedUrl;
        storagePath = uploaded.storagePath;
      }

      const inserted = await insertPhoto({
        photoUrl,
        storagePath,
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
      setNewPhotoFileDraft(null);
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
    const photoToDelete = photos.find((item) => item.id === photoId) ?? null;
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
      if (photoToDelete?.storagePath) {
        try {
          await deleteStoredQualityPhoto(photoToDelete.storagePath);
        } catch (storageDeleteError) {
          setError(
            storageDeleteError instanceof Error
              ? `Photo record deleted, but the stored file could not be removed: ${storageDeleteError.message}`
              : "Photo record deleted, but the stored file could not be removed."
          );
        }
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

  const relatedPhotos = useMemo(() => getRelatedPhotos(photos, selectedPhoto), [photos, selectedPhoto]);

  const signoffEvidencePhotos = useMemo(() => getSignoffEvidencePhotos(photos, selectedSignoff), [photos, selectedSignoff]);

  const signoffQaBlockers = useMemo(
    () => getSignoffQaBlockers(issues, inspections, signoffEvidencePhotos.length),
    [inspections, issues, signoffEvidencePhotos.length]
  );

  const canCurrentUserSignoff = useMemo(
    () => canCurrentUserActionSignoff(selectedSignoff, session?.id),
    [selectedSignoff, session?.id]
  );

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>

      {/* Hero */}
      <section className={`${styles.heroBlock} mb-2`}>
        <div className="min-w-0 flex-1">
          <h1 className={`${ibmPlexSans.className} ${styles.quotePageTitle}`}>QA</h1>
          <p className={`${interMedium.className} mt-1 text-[15px] text-[#6b6b6b]`}>Site-based quality tracking with linked actions and visual proof</p>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      <Suspense fallback={<QualitySectionSkeleton />}>
        {/* Stat cards */}
        <QualityKpiCards issueStats={issueStats} />

        {/* Tab bar + content */}
        <div className="px-0 py-0">
          <div className="space-y-5">
            <QualityTabs
              activeTab={activeTab}
              onChange={setActiveTab}
              onCreateIssue={() => setIsCreateIssueSheetOpen(true)}
              onCreateInspection={() => setIsCreateInspectionSheetOpen(true)}
              onCreatePhoto={() => setIsCreatePhotoOpen(true)}
              onCreateSignoff={() => setIsCreateSignoffSheetOpen(true)}
            />
          <div className="pb-6">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-[#E2E8F0]" />
                <div className="h-4 w-64 animate-pulse rounded bg-[#E2E8F0]" />
              </div>
            ) : null}

            {!isLoading && activeTab === "Overview" ? (
              <QualityOverviewTab issueStats={issueStats} issues={issues} inspections={inspections} todoLinks={todoLinks} />
            ) : null}

            {!isLoading && activeTab === "Issues" ? (
              <QualityIssuesTab
              issueSearch={issueSearch}
              setIssueSearch={setIssueSearch}
              issueStatusFilter={issueStatusFilter}
              setIssueStatusFilter={setIssueStatusFilter}
              issueDueFilter={issueDueFilter}
              setIssueDueFilter={setIssueDueFilter}
              issueTradeFilter={issueTradeFilter}
              setIssueTradeFilter={setIssueTradeFilter}
              issueAssigneeFilter={issueAssigneeFilter}
              setIssueAssigneeFilter={setIssueAssigneeFilter}
              issueLocationFilter={issueLocationFilter}
              setIssueLocationFilter={setIssueLocationFilter}
              issueTradeOptions={issueTradeOptions}
              issueAssigneeOptions={issueAssigneeOptions}
              issueLocationOptions={issueLocationOptions}
              filteredIssues={filteredIssues}
              issuePhotoCoverMap={issuePhotoCoverMap}
              issuePhotoCountMap={issuePhotoCountMap}
              onResetFilters={() => {
                setIssueSearch("");
                setIssueStatusFilter("All");
                setIssueTradeFilter("All");
                setIssueAssigneeFilter("All");
                setIssueLocationFilter("All");
                setIssueDueFilter("All");
              }}
              onSelectIssue={(issueId) => {
                setSelectedIssueId(issueId);
                setIssuePhotoUrlDraft("");
                setIsIssueSheetOpen(true);
              }}
              onStatusChange={(issueId, status) => {
                void setIssueStatus(issueId, status);
              }}
              />
            ) : null}

            {!isLoading && activeTab === "Inspections" ? (
              <QualityInspectionsTab
              inspectionSearch={inspectionSearch}
              setInspectionSearch={setInspectionSearch}
              inspectionStatusFilter={inspectionStatusFilter}
              setInspectionStatusFilter={setInspectionStatusFilter}
              inspectionDueFilter={inspectionDueFilter}
              setInspectionDueFilter={setInspectionDueFilter}
              inspectionTradeFilter={inspectionTradeFilter}
              setInspectionTradeFilter={setInspectionTradeFilter}
              inspectionAssigneeFilter={inspectionAssigneeFilter}
              setInspectionAssigneeFilter={setInspectionAssigneeFilter}
              inspectionLocationFilter={inspectionLocationFilter}
              setInspectionLocationFilter={setInspectionLocationFilter}
              inspectionTradeOptions={inspectionTradeOptions}
              inspectionAssigneeOptions={inspectionAssigneeOptions}
              inspectionLocationOptions={inspectionLocationOptions}
              filteredInspections={filteredInspections}
              onResetFilters={() => {
                setInspectionSearch("");
                setInspectionStatusFilter("All");
                setInspectionTradeFilter("All");
                setInspectionAssigneeFilter("All");
                setInspectionLocationFilter("All");
                setInspectionDueFilter("All");
              }}
              onSelectInspection={(inspectionId) => {
                setSelectedInspectionId(inspectionId);
                setIsInspectionSheetOpen(true);
              }}
              />
            ) : null}

            {!isLoading && activeTab === "Photo Log" ? (
              <QualityPhotoLogTab
              photoSearch={photoSearch}
              setPhotoSearch={setPhotoSearch}
              photoCategoryFilter={photoCategoryFilter}
              setPhotoCategoryFilter={setPhotoCategoryFilter}
              photoTradeFilter={photoTradeFilter}
              setPhotoTradeFilter={setPhotoTradeFilter}
              photoAreaFilter={photoAreaFilter}
              setPhotoAreaFilter={setPhotoAreaFilter}
              photoLinkFilter={photoLinkFilter}
              setPhotoLinkFilter={setPhotoLinkFilter}
              photoAssigneeFilter={photoAssigneeFilter}
              setPhotoAssigneeFilter={setPhotoAssigneeFilter}
              photoDateFromFilter={photoDateFromFilter}
              setPhotoDateFromFilter={setPhotoDateFromFilter}
              photoDateToFilter={photoDateToFilter}
              setPhotoDateToFilter={setPhotoDateToFilter}
              photoSignoffFilter={photoSignoffFilter}
              setPhotoSignoffFilter={setPhotoSignoffFilter}
              photoViewMode={photoViewMode}
              setPhotoViewMode={setPhotoViewMode}
              photoTradeOptions={photoTradeOptions}
              photoAreaOptions={photoAreaOptions}
              photoCategoryOptions={photoCategoryOptions}
              organizationUserOptions={organizationUserOptions}
              filteredPhotos={filteredPhotos}
              timelinePhotos={timelinePhotos}
              onResetFilters={() => {
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
              onOpenPhoto={openPhotoDetail}
              />
            ) : null}

            {!isLoading && activeTab === "Sign-Offs" ? (
              <QualitySignOffsTab
              signoffSearch={signoffSearch}
              setSignoffSearch={setSignoffSearch}
              signoffStatusFilter={signoffStatusFilter}
              setSignoffStatusFilter={setSignoffStatusFilter}
              signoffDueFilter={signoffDueFilter}
              setSignoffDueFilter={setSignoffDueFilter}
              signoffTypeFilter={signoffTypeFilter}
              setSignoffTypeFilter={setSignoffTypeFilter}
              signoffTradeFilter={signoffTradeFilter}
              setSignoffTradeFilter={setSignoffTradeFilter}
              signoffAssigneeFilter={signoffAssigneeFilter}
              setSignoffAssigneeFilter={setSignoffAssigneeFilter}
              signoffTradeOptions={signoffTradeOptions}
              signoffAssigneeOptions={signoffAssigneeOptions}
              filteredSignoffs={filteredSignoffs}
              onResetFilters={() => {
                setSignoffSearch("");
                setSignoffStatusFilter("All");
                setSignoffTypeFilter("All");
                setSignoffTradeFilter("All");
                setSignoffAssigneeFilter("All");
                setSignoffDueFilter("All");
              }}
              onSelectSignoff={(signoffId) => {
                setSelectedSignoffId(signoffId);
                setIsSignoffSheetOpen(true);
              }}
              />
            ) : null}
          </div>
          </div>
        </div>
      </Suspense>

      <CreateQualitySignoffSheet
        open={isCreateSignoffSheetOpen}
        onOpenChange={setIsCreateSignoffSheetOpen}
        newSignoffTitle={newSignoffTitle}
        setNewSignoffTitle={setNewSignoffTitle}
        newSignoffType={newSignoffType}
        setNewSignoffType={setNewSignoffType}
        newSignoffTrade={newSignoffTrade}
        setNewSignoffTrade={setNewSignoffTrade}
        newSignoffLocation={newSignoffLocation}
        setNewSignoffLocation={setNewSignoffLocation}
        newSignoffAssigneeUserId={newSignoffAssigneeUserId}
        setNewSignoffAssigneeUserId={setNewSignoffAssigneeUserId}
        newSignoffDueDate={newSignoffDueDate}
        setNewSignoffDueDate={setNewSignoffDueDate}
        newSignoffLinkedInspectionId={newSignoffLinkedInspectionId}
        setNewSignoffLinkedInspectionId={setNewSignoffLinkedInspectionId}
        newSignoffLinkedIssueId={newSignoffLinkedIssueId}
        setNewSignoffLinkedIssueId={setNewSignoffLinkedIssueId}
        newSignoffNote={newSignoffNote}
        setNewSignoffNote={setNewSignoffNote}
        organizationUserOptions={organizationUserOptions}
        inspections={inspections}
        issues={issues}
        isSaving={isSaving}
        onCreate={() => void createSignoff()}
      />

      <QualitySignoffDetailSheet
        open={isSignoffSheetOpen}
        onOpenChange={setIsSignoffSheetOpen}
        selectedSignoff={selectedSignoff}
        isSaving={isSaving}
        inspections={inspections}
        issues={issues}
        organizationUserOptions={organizationUserOptions}
        organizationUserNameById={organizationUserNameById}
        inspectionIndex={inspectionIndex}
        issueIndex={issueIndex}
        signoffEvidencePhotos={signoffEvidencePhotos}
        signoffQaBlockers={signoffQaBlockers}
        signoffActivity={signoffActivity}
        signoffActionNote={signoffActionNote}
        setSignoffActionNote={setSignoffActionNote}
        canCurrentUserSignoff={canCurrentUserSignoff}
        setSignoffLocal={setSignoffLocal}
        saveSignoffFields={saveSignoffFields}
        updateSignoffStatus={updateSignoffStatus}
        openPhotoDetail={openPhotoDetail}
      />

      <CreateQualityInspectionSheet
        open={isCreateInspectionSheetOpen}
        onOpenChange={setIsCreateInspectionSheetOpen}
        newInspectionTitle={newInspectionTitle}
        setNewInspectionTitle={setNewInspectionTitle}
        newInspectionTrade={newInspectionTrade}
        setNewInspectionTrade={setNewInspectionTrade}
        newInspectionLocation={newInspectionLocation}
        setNewInspectionLocation={setNewInspectionLocation}
        newInspectionAssigneeUserId={newInspectionAssigneeUserId}
        setNewInspectionAssigneeUserId={setNewInspectionAssigneeUserId}
        newInspectionDueDate={newInspectionDueDate}
        setNewInspectionDueDate={setNewInspectionDueDate}
        newInspectionTemplate={newInspectionTemplate}
        setNewInspectionTemplate={setNewInspectionTemplate}
        organizationUserOptions={organizationUserOptions}
        inspectionTemplates={INSPECTION_TEMPLATES.map((template) => ({ label: template.label, value: template.value }))}
        isSaving={isSaving}
        onCreate={() => void createInspection()}
      />

      <QualityInspectionDetailSheet
        open={isInspectionSheetOpen}
        onOpenChange={setIsInspectionSheetOpen}
        selectedInspection={selectedInspection}
        organizationUserOptions={organizationUserOptions}
        organizationUserNameById={organizationUserNameById}
        inspectionActivity={inspectionActivity}
        newInspectionItemLabel={newInspectionItemLabel}
        setNewInspectionItemLabel={setNewInspectionItemLabel}
        isSaving={isSaving}
        setInspectionLocal={setInspectionLocal}
        saveInspectionFields={saveInspectionFields}
        setInspectionItemLocal={setInspectionItemLocal}
        updateChecklistStatus={updateChecklistStatus}
        saveChecklistText={saveChecklistText}
        handleInspectionItemPhotoFileSelect={handleInspectionItemPhotoFileSelect}
        addInspectionPhotoToLog={addInspectionPhotoToLog}
        createIssueFromInspectionFail={createIssueFromInspectionFail}
        addInspectionItem={addInspectionItem}
      />

      <CreateQualityPhotoSheet
        open={isCreatePhotoOpen}
        onOpenChange={setIsCreatePhotoOpen}
        newPhotoFileName={newPhotoFileName}
        handleNewPhotoFileSelect={handleNewPhotoFileSelect}
        newPhotoTitle={newPhotoTitle}
        setNewPhotoTitle={setNewPhotoTitle}
        newPhotoTrade={newPhotoTrade}
        setNewPhotoTrade={setNewPhotoTrade}
        newPhotoLocation={newPhotoLocation}
        setNewPhotoLocation={setNewPhotoLocation}
        newPhotoCategory={newPhotoCategory}
        setNewPhotoCategory={setNewPhotoCategory}
        newPhotoCapturedAt={newPhotoCapturedAt}
        setNewPhotoCapturedAt={setNewPhotoCapturedAt}
        newPhotoAssignedUserId={newPhotoAssignedUserId}
        setNewPhotoAssignedUserId={setNewPhotoAssignedUserId}
        organizationUserOptions={organizationUserOptions}
        newPhotoLinkMode={newPhotoLinkMode}
        setNewPhotoLinkMode={setNewPhotoLinkMode}
        photoLinkModes={PHOTO_LINK_MODES}
        newPhotoIssueId={newPhotoIssueId}
        setNewPhotoIssueId={setNewPhotoIssueId}
        newPhotoInspectionId={newPhotoInspectionId}
        setNewPhotoInspectionId={setNewPhotoInspectionId}
        newPhotoInspectionItemId={newPhotoInspectionItemId}
        setNewPhotoInspectionItemId={setNewPhotoInspectionItemId}
        issues={issues}
        inspections={inspections}
        newPhotoNotes={newPhotoNotes}
        setNewPhotoNotes={setNewPhotoNotes}
        newPhotoHasSignoffEvidence={newPhotoHasSignoffEvidence}
        setNewPhotoHasSignoffEvidence={setNewPhotoHasSignoffEvidence}
        newPhotoUrl={newPhotoUrl}
        newPhotoFileDraft={newPhotoFileDraft}
        isSaving={isSaving}
        photoCategories={PHOTO_CATEGORIES}
        onCreate={() => void createPhotoFromPhotoLog()}
      />

      <CreateQualityIssueSheet
        open={isCreateIssueSheetOpen}
        onOpenChange={setIsCreateIssueSheetOpen}
        newIssueTitle={newIssueTitle}
        setNewIssueTitle={setNewIssueTitle}
        newIssueDescription={newIssueDescription}
        setNewIssueDescription={setNewIssueDescription}
        newIssueTrade={newIssueTrade}
        setNewIssueTrade={setNewIssueTrade}
        newIssueLocation={newIssueLocation}
        setNewIssueLocation={setNewIssueLocation}
        newIssuePriority={newIssuePriority}
        setNewIssuePriority={setNewIssuePriority}
        newIssueStatus={newIssueStatus}
        setNewIssueStatus={setNewIssueStatus}
        newIssueDueDate={newIssueDueDate}
        setNewIssueDueDate={setNewIssueDueDate}
        newIssueAssigneeUserId={newIssueAssigneeUserId}
        setNewIssueAssigneeUserId={setNewIssueAssigneeUserId}
        organizationUserOptions={organizationUserOptions}
        isSaving={isSaving}
        onCreate={() => void createIssue()}
      />

      <QualityIssueDetailSheet
        open={isIssueSheetOpen}
        onOpenChange={setIsIssueSheetOpen}
        selectedIssue={selectedIssue}
        organizationUserOptions={organizationUserOptions}
        issueComments={issueComments}
        issueActivity={issueActivity}
        issuePhotoUrlDraft={issuePhotoUrlDraft}
        setIssuePhotoUrlDraft={setIssuePhotoUrlDraft}
        issueCommentDraft={issueCommentDraft}
        setIssueCommentDraft={setIssueCommentDraft}
        isSaving={isSaving}
        issuePhotoFileDraft={issuePhotoFileDraft}
        setIssuePhotoFileDraft={setIssuePhotoFileDraft}
        setIssueLocal={setIssueLocal}
        saveIssueFields={saveIssueFields}
        setIssueStatus={setIssueStatus}
        setIssueAssignee={setIssueAssignee}
        handleIssuePhotoFileSelect={handleIssuePhotoFileSelect}
        addIssuePhoto={addIssuePhoto}
        addIssueComment={addIssueComment}
        deleteIssue={deleteIssue}
      />

      <QualityPhotoDetailSheet
        open={isPhotoDetailOpen}
        onOpenChange={setIsPhotoDetailOpen}
        selectedPhoto={selectedPhoto}
        isPhotoEditing={isPhotoEditing}
        setIsPhotoEditing={setIsPhotoEditing}
        photoEditTitle={photoEditTitle}
        setPhotoEditTitle={setPhotoEditTitle}
        photoEditTrade={photoEditTrade}
        setPhotoEditTrade={setPhotoEditTrade}
        photoEditLocation={photoEditLocation}
        setPhotoEditLocation={setPhotoEditLocation}
        photoEditStatusTag={photoEditStatusTag}
        setPhotoEditStatusTag={setPhotoEditStatusTag}
        photoEditCategory={photoEditCategory}
        setPhotoEditCategory={setPhotoEditCategory}
        photoEditPhaseTag={photoEditPhaseTag}
        setPhotoEditPhaseTag={setPhotoEditPhaseTag}
        photoEditType={photoEditType}
        setPhotoEditType={setPhotoEditType}
        photoEditAssignedUserId={photoEditAssignedUserId}
        setPhotoEditAssignedUserId={setPhotoEditAssignedUserId}
        photoEditSignoffEvidence={photoEditSignoffEvidence}
        setPhotoEditSignoffEvidence={setPhotoEditSignoffEvidence}
        photoEditIssueId={photoEditIssueId}
        setPhotoEditIssueId={setPhotoEditIssueId}
        photoEditInspectionId={photoEditInspectionId}
        setPhotoEditInspectionId={setPhotoEditInspectionId}
        photoEditInspectionItemId={photoEditInspectionItemId}
        setPhotoEditInspectionItemId={setPhotoEditInspectionItemId}
        photoEditNotes={photoEditNotes}
        setPhotoEditNotes={setPhotoEditNotes}
        organizationUserOptions={organizationUserOptions}
        issues={issues}
        inspections={inspections}
        photoCategories={PHOTO_CATEGORIES}
        photoTypes={PHOTO_TYPES}
        relatedPhotos={relatedPhotos}
        issueIndex={issueIndex}
        inspectionIndex={inspectionIndex}
        inspectionItemIndex={inspectionItemIndex}
        isSaving={isSaving}
        savePhotoEdits={savePhotoEdits}
        deletePhoto={deletePhoto}
        openPhotoDetail={openPhotoDetail}
      />
    </div>
  );
}

export default ProjectQualityAssuranceBoard;
