"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Archive, ChevronDown, Copy, FolderPen, Pencil, Plus } from "lucide-react";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { PricingWorksheetOverlayDialog } from "@/components/app/PricingWorksheetOverlayDialog";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import {
  createDefaultWorksheetData,
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
  normalizeWorksheetData,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  buildOpportunityPricingWorkbookRegisterRows,
  deriveOpportunityPricingWorkbookRegisterName,
  buildOpportunityPricingWorkbookEditorRecord,
  createOpportunityPricingWorkbook,
  duplicateOpportunityPricingWorkbook,
  renameOpportunityPricingWorkbook,
} from "@/lib/opportunity-pricing-workbook";
import {
  buildPricingWorksheetIntelligenceEvent,
  logPricingWorksheetIntelligenceFailure,
  writePricingWorksheetIntelligenceEvent,
} from "@/lib/pricing-worksheet-intelligence";
import { mapPricingWorksheetUiErrorMessage } from "@/lib/pricing-worksheet-ui-errors";
import { markPricingWorksheetPerformance } from "@/lib/pricing-worksheet-performance";
import {
  clearPricingWorksheetOverlayHistoryState,
  resolveRestoredPricingWorksheetId,
} from "@/lib/pricing-worksheet-overlay-lifecycle";
import { canManageCommercialData } from "@/lib/role-permissions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import {
  buildOpportunityPricingWorksheetOwner,
  type PricingWorksheetOwnerContextValue,
} from "@/lib/pricing-worksheet-owner";
import { buildPricingWorksheetRegisterLoadScopeKey } from "@/lib/pricing-worksheet-register-scope";

type PricingWorksheetRegisterRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
  "id" | "name" | "trade_package" | "updated_at"
>;
type PricingWorksheetRegisterWorkbookRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
  "id" | "name" | "trade_package" | "updated_at" | "project_id" | "quote_id" | "variation_id" | "worksheet_data"
> & { clone_kind: string | null };
type PricingWorksheetRegisterSheetRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_workbook_sheets"]["Row"],
  "id" | "created_at" | "is_default" | "name" | "sheet_order" | "workbook_id"
>;
type WorksheetActionDialog =
  | { type: "rename"; row: PricingWorksheetRegisterRow; value: string }
  | { type: "trade"; row: PricingWorksheetRegisterRow; value: string }
  | { type: "archive"; row: PricingWorksheetRegisterRow }
  | null;

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emitPricingWorksheetEvent(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  event: ReturnType<typeof buildPricingWorksheetIntelligenceEvent>
) {
  void writePricingWorksheetIntelligenceEvent(supabase, event).catch((error) => {
    logPricingWorksheetIntelligenceFailure(event.eventType, error);
  });
}

function resolveOverlayWorksheetIdFromPathname(pathname: string | null | undefined, registerPath: string) {
  if (!pathname || !pathname.startsWith(`${registerPath}/`)) {
    return null;
  }

  const suffix = pathname.slice(registerPath.length + 1).split("/")[0] ?? null;
  return suffix && suffix.trim().length > 0 ? suffix : null;
}

function readPersistedOverlayWorksheetId(storageKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(storageKey);
  return value && value.trim().length > 0 ? value : null;
}

function writePersistedOverlayWorksheetId(storageKey: string, worksheetId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (worksheetId) {
    window.sessionStorage.setItem(storageKey, worksheetId);
    return;
  }

  window.sessionStorage.removeItem(storageKey);
}

function applyPricingWorksheetRegisterOwnerFilters(
  // Supabase's chained query builder type is intentionally polymorphic here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  owner: Pick<PricingWorksheetOwnerContextValue, "opportunityId" | "ownerType" | "projectId">,
) {
  query.eq("opportunity_id", owner.opportunityId);

  if (owner.ownerType === "project") {
    return query
      .eq("project_id", owner.projectId)
      .is("variation_id", null)
      .or("quote_id.is.null,clone_kind.eq.project_working");
  }

  return query.is("project_id", null).is("quote_id", null).is("variation_id", null);
}

function applyPricingWorksheetMutationOwnerFilters(
  // Supabase's chained query builder type is intentionally polymorphic here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  owner: Pick<PricingWorksheetOwnerContextValue, "ownerType" | "projectId">,
) {
  if (owner.ownerType === "project") {
    return query.eq("project_id", owner.projectId);
  }
  return query.is("project_id", null);
}

async function loadPrimaryWorkbookSheet(params: {
  supabase: ReturnType<typeof createBrowserSupabaseClient>;
  organizationId: string;
  opportunityId: string;
  projectId?: string | null;
  workbookId: string;
}) {
  const { data, error } = await params.supabase
    .from("opportunity_pricing_workbook_sheets")
    .select("id, name, is_default, sheet_order")
    .eq("organization_id", params.organizationId)
    .eq("opportunity_id", params.opportunityId)
    .eq("workbook_id", params.workbookId)
    .order("is_default", { ascending: false })
    .order("sheet_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Pick<
    Database["public"]["Tables"]["opportunity_pricing_workbook_sheets"]["Row"],
    "id" | "name" | "is_default" | "sheet_order"
  > | null;
}

export default function OpportunityPricingWorksheetRegisterPage() {
  const sharedOpportunity = useOpportunityWorkspaceData();
  const worksheetOwner = useMemo(() => buildOpportunityPricingWorksheetOwner({
    organizationId: sharedOpportunity.organizationId,
    opportunityId: sharedOpportunity.opportunityId,
    opportunitySlug: sharedOpportunity.slug,
    projectId: sharedOpportunity.workspaceProjectId,
    projectSlug: sharedOpportunity.workspaceProjectSlug,
  }), [
    sharedOpportunity.opportunityId,
    sharedOpportunity.organizationId,
    sharedOpportunity.slug,
    sharedOpportunity.workspaceProjectId,
    sharedOpportunity.workspaceProjectSlug,
  ]);

  return (
    <SharedPricingWorksheetRegisterPage
      owner={worksheetOwner}
      registerPath={`/app/leads-clients/opportunities/${sharedOpportunity.slug}/pricing-worksheet`}
      contextLabel="opportunity"
    />
  );
}

export function SharedPricingWorksheetRegisterPage({
  owner: worksheetOwner,
  registerPath,
  contextLabel,
}: {
  owner: PricingWorksheetOwnerContextValue;
  registerPath: string;
  contextLabel: "opportunity" | "project";
}) {
  if (!worksheetOwner.opportunityId) {
    throw new Error("Pricing worksheet register requires originating opportunity lineage.");
  }

  const sharedOpportunity = {
    organizationId: worksheetOwner.organizationId,
    opportunityId: worksheetOwner.opportunityId,
  };
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const canManageWorksheets = canManageCommercialData(session?.role) && !worksheetOwner.readOnly;
  const sessionUserId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [worksheetRows, setWorksheetRows] = useState<PricingWorksheetRegisterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [mutatingWorksheetId, setMutatingWorksheetId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<WorksheetActionDialog>(null);
  const [isOverlayWorksheetDirty, setIsOverlayWorksheetDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedRegisterScopeKey, setLoadedRegisterScopeKey] = useState<string | null>(null);
  const activeRegisterLoadRef = useRef(0);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);
  const registerLoadScopeKey = buildPricingWorksheetRegisterLoadScopeKey({
    owner: worksheetOwner,
    sessionOrganizationId,
    sessionUserId,
  });
  const hasLoadedCurrentRegisterScope = loadedRegisterScopeKey === registerLoadScopeKey;

  const overlayWorksheetStorageKey = `pricing-worksheet-overlay:${contextLabel}:${worksheetOwner.projectId ?? sharedOpportunity.opportunityId}`;
  const overlayWorksheetIdFromPathname = useMemo(
    () => resolveOverlayWorksheetIdFromPathname(pathname, registerPath),
    [pathname, registerPath],
  );
  const restoredOverlayWorksheetId = useMemo(
    () => resolveRestoredPricingWorksheetId({
      isRegisterPath: pathname === registerPath,
      pathnameWorksheetId: overlayWorksheetIdFromPathname,
      historyState: typeof window !== "undefined" ? window.history.state : null,
      persistedWorksheetId: readPersistedOverlayWorksheetId(overlayWorksheetStorageKey),
    }),
    [overlayWorksheetIdFromPathname, overlayWorksheetStorageKey, pathname, registerPath],
  );
  const [selectedWorksheetId, setSelectedWorksheetId] = useState<string | null>(restoredOverlayWorksheetId);
  const worksheetCloseInFlightRef = useRef(false);
  const initialSheetId = useMemo(() => {
    const sheetId = searchParams.get("sheetId");
    return sheetId && sheetId.trim().length > 0 ? sheetId : null;
  }, [searchParams]);

  const openWorksheet = useCallback(
    (worksheetId: string) => {
      const targetPath = `${registerPath}/${worksheetId}`;
      markPricingWorksheetPerformance("register-row-click", {
        worksheetId,
        targetPath,
      });
      setIsOverlayWorksheetDirty(false);
      worksheetCloseInFlightRef.current = false;
      setSelectedWorksheetId(worksheetId);
      writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, worksheetId);
      window.history.pushState({ pricingWorksheetOverlay: true, worksheetId }, "", targetPath);
    },
    [overlayWorksheetStorageKey, registerPath]
  );

  const closeWorksheetOverlay = useCallback(() => {
    if (!selectedWorksheetId || worksheetCloseInFlightRef.current) {
      return;
    }

    const previousHistoryState = window.history.state;
    const previousHref = window.location.href;
    worksheetCloseInFlightRef.current = true;

    try {
      setIsOverlayWorksheetDirty(false);
      setSelectedWorksheetId(null);
      writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, null);
      window.history.replaceState(
        clearPricingWorksheetOverlayHistoryState(previousHistoryState),
        "",
        registerPath,
      );
    } catch {
      window.history.replaceState(previousHistoryState, "", previousHref);
      worksheetCloseInFlightRef.current = false;
      setSelectedWorksheetId(selectedWorksheetId);
      writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, selectedWorksheetId);
      setError("Unable to close the pricing worksheet right now.");
    }
  }, [overlayWorksheetStorageKey, registerPath, selectedWorksheetId]);

  useEffect(() => {
    if (selectedWorksheetId) {
      return;
    }

    worksheetCloseInFlightRef.current = false;
  }, [selectedWorksheetId]);

  useEffect(() => {
    if (pathname === registerPath) {
      setSelectedWorksheetId(null);
      writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, null);
      return;
    }

    if (overlayWorksheetIdFromPathname) {
      setSelectedWorksheetId(overlayWorksheetIdFromPathname);
      writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, overlayWorksheetIdFromPathname);
      return;
    }

    if (restoredOverlayWorksheetId) {
      setSelectedWorksheetId((current) => current ?? restoredOverlayWorksheetId);
    }
  }, [overlayWorksheetIdFromPathname, overlayWorksheetStorageKey, pathname, registerPath, restoredOverlayWorksheetId]);

  useEffect(() => {
    writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, selectedWorksheetId);
  }, [overlayWorksheetStorageKey, selectedWorksheetId]);

  useEffect(() => {
    const handlePopState = () => {
      if (
        isOverlayWorksheetDirty &&
        !window.confirm("You have unsaved pricing worksheet changes. Leave this worksheet and discard those local edits?")
      ) {
        window.history.pushState(
          { pricingWorksheetOverlay: true, worksheetId: selectedWorksheetId },
          "",
          `${registerPath}/${selectedWorksheetId}`
        );
        return;
      }

      setIsOverlayWorksheetDirty(false);
      worksheetCloseInFlightRef.current = false;
      const routeWorksheetId = resolveOverlayWorksheetIdFromPathname(window.location.pathname, registerPath);
      setSelectedWorksheetId(routeWorksheetId);
      writePersistedOverlayWorksheetId(overlayWorksheetStorageKey, routeWorksheetId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOverlayWorksheetDirty, overlayWorksheetStorageKey, registerPath, selectedWorksheetId]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      setError("Unable to load pricing worksheets right now.");
      return;
    }

    if (!sessionUserId || !sessionOrganizationId) {
      return;
    }

    let cancelled = false;
    const loadId = activeRegisterLoadRef.current + 1;
    activeRegisterLoadRef.current = loadId;
    const isCurrentLoad = () => !cancelled && activeRegisterLoadRef.current === loadId;
    const ownerScope = {
      opportunityId: worksheetOwner.opportunityId,
      ownerType: worksheetOwner.ownerType,
      projectId: worksheetOwner.projectId,
    };

    const loadWorksheets = async () => {
      setWorksheetRows([]);
      setIsLoading(true);
      setError(null);

      try {
        const workbookQuery = applyPricingWorksheetRegisterOwnerFilters(supabase
          .from("opportunity_pricing_worksheets")
          .select("id, name, trade_package, updated_at, project_id, quote_id, variation_id, clone_kind, worksheet_data")
          .eq("organization_id", sharedOpportunity.organizationId)
          .is("archived_at", null), ownerScope);
        const { data: workbookRows, error: loadError } = await workbookQuery
          .order("updated_at", { ascending: false });

        if (loadError) {
          throw new Error(loadError.message);
        }

        const typedWorkbookRows = (workbookRows ?? []) as PricingWorksheetRegisterWorkbookRow[];
        const workbookIds = typedWorkbookRows.map((row) => row.id);
        let sheetRows: PricingWorksheetRegisterSheetRow[] = [];

        if (workbookIds.length > 0) {
          const { data: loadedSheetRows, error: sheetLoadError } = await supabase
            .from("opportunity_pricing_workbook_sheets")
            .select("id, workbook_id, name, is_default, sheet_order, created_at")
            .eq("organization_id", sharedOpportunity.organizationId)
            .eq("opportunity_id", sharedOpportunity.opportunityId)
            .in("workbook_id", workbookIds);

          if (sheetLoadError) {
            throw new Error(sheetLoadError.message);
          }

          sheetRows = (loadedSheetRows ?? []) as PricingWorksheetRegisterSheetRow[];
        }

        if (isCurrentLoad()) {
          setWorksheetRows(
            buildOpportunityPricingWorkbookRegisterRows({
              workbooks: typedWorkbookRows,
              sheets: sheetRows,
              scope: contextLabel,
            }).map((row) => ({
              id: row.id,
              name: row.name,
              trade_package: row.tradePackage,
              updated_at: row.updatedAt,
            }))
          );
        }
      } catch (loadError) {
        if (isCurrentLoad()) {
          setError(mapPricingWorksheetUiErrorMessage(loadError, "Unable to load pricing worksheets."));
        }
      } finally {
        if (isCurrentLoad()) {
          setLoadedRegisterScopeKey(registerLoadScopeKey);
          setIsLoading(false);
        }
      }
    };

    void loadWorksheets();

    return () => {
      cancelled = true;
    };
  }, [
    sessionOrganizationId,
    sessionUserId,
    contextLabel,
    registerLoadScopeKey,
    sharedOpportunity.opportunityId,
    sharedOpportunity.organizationId,
    supabase,
    worksheetOwner.opportunityId,
    worksheetOwner.ownerType,
    worksheetOwner.projectId,
  ]);

  const createWorksheet = useCallback(async () => {
    if (!supabase || !session?.id || isCreating) {
      return;
    }

    if (!canManageWorksheets) {
      setError("You do not have permission to create pricing worksheets.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const worksheet = createDefaultWorksheetData({ sheetName: "New Worksheet" });
      const workbook = await createOpportunityPricingWorkbook({
        supabase,
        organizationId: sharedOpportunity.organizationId,
        opportunityId: sharedOpportunity.opportunityId,
        projectId: worksheetOwner.ownerType === "project" ? worksheetOwner.projectId : null,
        projectOwned: worksheetOwner.ownerType === "project",
        name: "New Worksheet",
        tradePackage: null,
        worksheet,
        pricingSummary: createDefaultWorksheetPricingSummary(),
        extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
        userId: session.id,
      });

      setWorksheetRows((current) => [
        {
          id: workbook.id,
          name: deriveOpportunityPricingWorkbookRegisterName({
            workbook: {
              name: workbook.name,
              trade_package: workbook.tradePackage,
              worksheet_data: workbook.sheets[0]?.worksheet as never,
            },
            sheets: workbook.sheets.map((sheet) => ({
              created_at: sheet.createdAt,
              is_default: sheet.isDefault,
              name: sheet.name,
              sheet_order: sheet.sheetOrder,
            })),
          }),
          trade_package: workbook.tradePackage,
          updated_at: workbook.updatedAt,
        },
        ...current,
      ]);
      emitPricingWorksheetEvent(
        supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: sharedOpportunity.organizationId,
          opportunityId: sharedOpportunity.opportunityId,
          workbookId: workbook.id,
          sheetId: workbook.sheets[0]?.id ?? workbook.id,
          sheetName: workbook.sheets[0]?.name ?? "New Worksheet",
          worksheetId: workbook.id,
          worksheetName: "New Worksheet",
          tradePackage: null,
          worksheet: buildOpportunityPricingWorkbookEditorRecord(workbook).worksheet,
          eventType: "worksheet_created",
          eventFamily: "entity_lifecycle",
          action: "created",
        })
      );
    } catch (createError) {
      setError(mapPricingWorksheetUiErrorMessage(createError, "Unable to create pricing worksheet."));
    } finally {
      setIsCreating(false);
    }
  }, [
    canManageWorksheets,
    isCreating,
    session?.id,
    sharedOpportunity.opportunityId,
    sharedOpportunity.organizationId,
    supabase,
    worksheetOwner.ownerType,
    worksheetOwner.projectId,
  ]);

  const requireWritableContext = useCallback(() => {
    if (!supabase || !session?.id) {
      setError("Pricing worksheet actions are not ready. Please refresh and try again.");
      return null;
    }

    if (!canManageWorksheets) {
      setError("You do not have permission to manage pricing worksheets.");
      return null;
    }

    return {
      supabase,
      userId: session.id,
      organizationId: sharedOpportunity.organizationId,
      opportunityId: sharedOpportunity.opportunityId,
      projectId: worksheetOwner.ownerType === "project" ? worksheetOwner.projectId : null,
    };
  }, [
    canManageWorksheets,
    session?.id,
    sharedOpportunity.opportunityId,
    sharedOpportunity.organizationId,
    supabase,
    worksheetOwner.ownerType,
    worksheetOwner.projectId,
  ]);

  const updateWorksheetName = useCallback(async () => {
    if (actionDialog?.type !== "rename") {
      return;
    }

    const context = requireWritableContext();
    const nextName = actionDialog.value.trim();
    if (!context) {
      return;
    }

    if (!nextName) {
      setError("Worksheet name cannot be blank.");
      return;
    }

    setMutatingWorksheetId(actionDialog.row.id);
    setError(null);

    try {
      const currentWorksheetQuery = applyPricingWorksheetMutationOwnerFilters(context.supabase
        .from("opportunity_pricing_worksheets")
        .select("name, trade_package, worksheet_data")
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id), worksheetOwner);
      const { data: currentWorksheet, error: loadError } = await currentWorksheetQuery
        .single();

      if (loadError) {
        throw new Error(loadError.message);
      }

      const workbook = await renameOpportunityPricingWorkbook({
        supabase: context.supabase,
        organizationId: context.organizationId,
        opportunityId: context.opportunityId,
        projectId: context.projectId,
        workbookId: actionDialog.row.id,
        nextName,
        userId: context.userId,
      });
      const primarySheet = await loadPrimaryWorkbookSheet({
        supabase: context.supabase,
        organizationId: context.organizationId,
        opportunityId: context.opportunityId,
        projectId: context.projectId,
        workbookId: actionDialog.row.id,
      });

      setWorksheetRows((current) =>
        current.map((row) =>
          row.id === workbook.id
            ? {
                id: workbook.id,
                name: deriveOpportunityPricingWorkbookRegisterName({
                  workbook: {
                    name: workbook.name,
                    trade_package: workbook.tradePackage,
                    worksheet_data: workbook.sheets[0]?.worksheet as never,
                  },
                  sheets: workbook.sheets.map((sheet) => ({
                    created_at: sheet.createdAt,
                    is_default: sheet.isDefault,
                    name: sheet.name,
                    sheet_order: sheet.sheetOrder,
                  })),
                }),
                trade_package: workbook.tradePackage,
                updated_at: workbook.updatedAt,
              }
            : row
        )
      );
      emitPricingWorksheetEvent(
        context.supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: context.organizationId,
          opportunityId: context.opportunityId,
          workbookId: actionDialog.row.id,
          sheetId: primarySheet?.id ?? actionDialog.row.id,
          sheetName: primarySheet?.name ?? nextName,
          worksheetId: actionDialog.row.id,
          worksheetName: nextName,
          tradePackage:
            typeof currentWorksheet.trade_package === "string" ? currentWorksheet.trade_package : null,
          worksheet: normalizeWorksheetData(currentWorksheet.worksheet_data),
          eventType: "worksheet_renamed",
          eventFamily: "entity_lifecycle",
          action: "renamed",
          beforeData: {
            name: typeof currentWorksheet.name === "string" ? currentWorksheet.name : actionDialog.row.name,
          },
          afterData: {
            name: nextName,
          },
          diffData: {
            nameFrom: typeof currentWorksheet.name === "string" ? currentWorksheet.name : actionDialog.row.name,
            nameTo: nextName,
          },
        })
      );
      setActionDialog(null);
    } catch (updateError) {
      setError(mapPricingWorksheetUiErrorMessage(updateError, "Unable to rename worksheet."));
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [actionDialog, requireWritableContext, worksheetOwner]);

  const updateWorksheetTradePackage = useCallback(async () => {
    if (actionDialog?.type !== "trade") {
      return;
    }

    const context = requireWritableContext();
    if (!context) {
      return;
    }

    const nextTradePackage = actionDialog.value.trim() || null;
    setMutatingWorksheetId(actionDialog.row.id);
    setError(null);

    try {
      const updateQuery = applyPricingWorksheetMutationOwnerFilters(context.supabase
        .from("opportunity_pricing_worksheets")
        .update({
          trade_package: nextTradePackage,
          updated_by: context.userId,
        })
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id), worksheetOwner);
      const { data, error: updateError } = await updateQuery
        .select("id, name, trade_package, updated_at")
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      setWorksheetRows((current) =>
        current.map((row) =>
          row.id === data.id ? (data as PricingWorksheetRegisterRow) : row
        )
      );
      setActionDialog(null);
    } catch (updateError) {
      setError(mapPricingWorksheetUiErrorMessage(updateError, "Unable to update trade/package."));
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [actionDialog, requireWritableContext, worksheetOwner]);

  const duplicateWorksheet = useCallback(async (worksheetId: string) => {
    const context = requireWritableContext();
    if (!context || mutatingWorksheetId) {
      return;
    }

    setMutatingWorksheetId(worksheetId);
    setError(null);

    try {
      const sourceQuery = applyPricingWorksheetMutationOwnerFilters(context.supabase
        .from("opportunity_pricing_worksheets")
        .select("name, trade_package, worksheet_data")
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", worksheetId), worksheetOwner);
      const { data: source, error: loadError } = await sourceQuery
        .single();

      if (loadError) {
        throw new Error(loadError.message);
      }

      const sourceRow = source as Pick<
        Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
        "name" | "trade_package" | "worksheet_data"
      >;
      const duplicatedName = `${sourceRow.name || "Worksheet"} Copy`;
      const workbook = await duplicateOpportunityPricingWorkbook({
        supabase: context.supabase,
        organizationId: context.organizationId,
        opportunityId: context.opportunityId,
        projectId: context.projectId,
        workbookId: worksheetId,
        userId: context.userId,
      });

      const nextRow: PricingWorksheetRegisterRow = {
        id: workbook.id,
        name: deriveOpportunityPricingWorkbookRegisterName({
          workbook: {
            name: workbook.name,
            trade_package: workbook.tradePackage,
            worksheet_data: workbook.sheets[0]?.worksheet as never,
          },
          sheets: workbook.sheets.map((sheet) => ({
            created_at: sheet.createdAt,
            is_default: sheet.isDefault,
            name: sheet.name,
            sheet_order: sheet.sheetOrder,
          })),
        }),
        trade_package: workbook.tradePackage,
        updated_at: workbook.updatedAt,
      };
      setWorksheetRows((current) => [nextRow, ...current]);
      emitPricingWorksheetEvent(
        context.supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: context.organizationId,
          opportunityId: context.opportunityId,
          workbookId: nextRow.id,
          sheetId: workbook.sheets[0]?.id ?? nextRow.id,
          sheetName: workbook.sheets[0]?.name ?? duplicatedName,
          worksheetId: nextRow.id,
          worksheetName: duplicatedName,
          tradePackage: sourceRow.trade_package,
          worksheet: buildOpportunityPricingWorkbookEditorRecord(workbook).worksheet,
          eventType: "worksheet_duplicated",
          eventFamily: "entity_lifecycle",
          action: "duplicated",
          relatedEntities: [
            {
              entityType: "pricing_worksheet",
              entityId: worksheetId,
            },
          ],
          lineageRefs: [
            {
              type: "duplicated_from",
              entityType: "pricing_worksheet",
              entityId: worksheetId,
            },
          ],
        })
      );
      openWorksheet(nextRow.id);
    } catch (duplicateError) {
      setError(mapPricingWorksheetUiErrorMessage(duplicateError, "Unable to duplicate worksheet."));
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [mutatingWorksheetId, openWorksheet, requireWritableContext, worksheetOwner]);

  const archiveWorksheet = useCallback(async () => {
    if (actionDialog?.type !== "archive") {
      return;
    }

    const context = requireWritableContext();
    if (!context) {
      return;
    }

    setMutatingWorksheetId(actionDialog.row.id);
    setError(null);

    try {
      const archivedAt = new Date().toISOString();
      const currentWorksheetQuery = applyPricingWorksheetMutationOwnerFilters(context.supabase
        .from("opportunity_pricing_worksheets")
        .select("name, trade_package, worksheet_data")
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id), worksheetOwner);
      const { data: currentWorksheet, error: loadError } = await currentWorksheetQuery
        .single();

      if (loadError) {
        throw new Error(loadError.message);
      }

      const archiveQuery = applyPricingWorksheetMutationOwnerFilters(context.supabase
        .from("opportunity_pricing_worksheets")
        .update({
          archived_at: archivedAt,
          updated_by: context.userId,
        })
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id), worksheetOwner);
      const { error: archiveError } = await archiveQuery;

      if (archiveError) {
        throw new Error(archiveError.message);
      }
      const primarySheet = await loadPrimaryWorkbookSheet({
        supabase: context.supabase,
        organizationId: context.organizationId,
        opportunityId: context.opportunityId,
        workbookId: actionDialog.row.id,
      });

      setWorksheetRows((current) => current.filter((row) => row.id !== actionDialog.row.id));
      emitPricingWorksheetEvent(
        context.supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: context.organizationId,
          opportunityId: context.opportunityId,
          workbookId: actionDialog.row.id,
          sheetId: primarySheet?.id ?? actionDialog.row.id,
          sheetName:
            primarySheet?.name ??
            (typeof currentWorksheet.name === "string" ? currentWorksheet.name : actionDialog.row.name),
          worksheetId: actionDialog.row.id,
          worksheetName:
            typeof currentWorksheet.name === "string" ? currentWorksheet.name : actionDialog.row.name,
          tradePackage:
            typeof currentWorksheet.trade_package === "string" ? currentWorksheet.trade_package : null,
          worksheet: normalizeWorksheetData(currentWorksheet.worksheet_data),
          eventType: "worksheet_archived",
          eventFamily: "entity_lifecycle",
          action: "archived",
          beforeData: {
            archivedAt: null,
          },
          afterData: {
            archivedAt,
          },
          diffData: {
            archived: true,
          },
        })
      );
      setActionDialog(null);
    } catch (archiveError) {
      setError(mapPricingWorksheetUiErrorMessage(archiveError, "Unable to archive worksheet."));
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [actionDialog, requireWritableContext, worksheetOwner]);

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title="Pricing Worksheets"
        description={`Create and manage pricing worksheets for this ${contextLabel}.`}
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void createWorksheet()}
            disabled={isCreating || isLoading || !canManageWorksheets}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating..." : "New Worksheet"}
          </Button>
        }
      />

      {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
      {!canManageWorksheets && session ? (
        <OperationalAlert variant="warning">
          Only owner, admin, QS, and project manager roles can create pricing worksheets.
        </OperationalAlert>
      ) : null}

      {isLoading && !hasLoadedCurrentRegisterScope ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading pricing worksheets...</p>
      ) : worksheetRows.length === 0 ? (
        <OperationalEmptyState
          actions={
            <Button
              type="button"
              onClick={() => void createWorksheet()}
              disabled={isCreating || !canManageWorksheets}
            >
              <Plus className="h-4 w-4" />
              {isCreating ? "Creating..." : "Create First Worksheet"}
            </Button>
          }
        />
      ) : (
        <OperationalPanel contentClassName="p-0">
          <OperationalTable>
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead className="w-[42%]">Worksheet name</OperationalTableHead>
                <OperationalTableHead className="w-[28%]">Trade/package</OperationalTableHead>
                <OperationalTableHead className="w-[22%]">Last updated</OperationalTableHead>
                <OperationalTableHead className="w-[112px] text-center">Actions</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {worksheetRows.map((row) => (
                <OperationalTableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => openWorksheet(row.id)}
                >
                  <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                    {row.name || "Untitled worksheet"}
                  </OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-secondary)]">
                    {row.trade_package?.trim() || "—"}
                  </OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-secondary)]">
                    {formatUpdatedAt(row.updated_at)}
                  </OperationalTableCell>
                  <OperationalTableCell className="px-2">
                    <div className="flex items-center justify-center gap-1">
                      <Tooltip label="Edit worksheet">
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 rounded-[8px] border-0 bg-transparent text-[var(--text-secondary)] shadow-none hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                          aria-label="Edit worksheet"
                          onClick={(event) => {
                            event.stopPropagation();
                            openWorksheet(row.id);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <DropdownMenu>
                        <Tooltip label="More actions">
                          <DropdownMenuTrigger asChild disabled={mutatingWorksheetId === row.id}>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="h-8 w-8 rounded-[8px] border-0 bg-transparent text-[var(--text-secondary)] shadow-none hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                              aria-label="More worksheet actions"
                              disabled={mutatingWorksheetId === row.id}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </Tooltip>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={4}
                          className="min-w-[11rem] rounded-[10px] p-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenuItem
                            disabled={!canManageWorksheets || mutatingWorksheetId === row.id}
                            className="h-8 rounded-[6px] px-2 text-[12px] font-medium"
                            onSelect={() => setActionDialog({ type: "rename", row, value: row.name })}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canManageWorksheets || mutatingWorksheetId === row.id}
                            className="h-8 rounded-[6px] px-2 text-[12px] font-medium"
                            onSelect={() => setActionDialog({ type: "trade", row, value: row.trade_package ?? "" })}
                          >
                            <FolderPen className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                            Edit trade/package
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canManageWorksheets || mutatingWorksheetId !== null}
                            className="h-8 rounded-[6px] px-2 text-[12px] font-medium"
                            onSelect={() => void duplicateWorksheet(row.id)}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!canManageWorksheets || mutatingWorksheetId === row.id}
                            className="h-8 rounded-[6px] px-2 text-[12px] font-medium text-[var(--error)] focus:text-[var(--error)]"
                            onSelect={() => setActionDialog({ type: "archive", row })}
                          >
                            <Archive className="mr-2 h-3.5 w-3.5" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </OperationalTableCell>
                </OperationalTableRow>
              ))}
            </OperationalTableBody>
          </OperationalTable>
          {isLoading ? (
            <p className="border-t border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-muted)]" role="status">
              Updating pricing worksheets...
            </p>
          ) : null}
        </OperationalPanel>
      )}

      <Dialog open={actionDialog?.type === "rename"} onOpenChange={(open) => (!open ? setActionDialog(null) : undefined)}>
        <DialogContent className="w-full max-w-[460px] p-6">
          <DialogHeader>
            <DialogTitle>Rename Worksheet</DialogTitle>
            <DialogDescription>Update the worksheet name shown in this register.</DialogDescription>
          </DialogHeader>
          <form
            className="mt-5 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void updateWorksheetName();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="worksheet-name">
                Worksheet name
              </label>
              <Input
                id="worksheet-name"
                value={actionDialog?.type === "rename" ? actionDialog.value : ""}
                onChange={(event) =>
                  setActionDialog((current) =>
                    current?.type === "rename" ? { ...current, value: event.target.value } : current
                  )
                }
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setActionDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutatingWorksheetId !== null}>
                {mutatingWorksheetId ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog?.type === "trade"} onOpenChange={(open) => (!open ? setActionDialog(null) : undefined)}>
        <DialogContent className="w-full max-w-[460px] p-6">
          <DialogHeader>
            <DialogTitle>Edit Trade/Package</DialogTitle>
            <DialogDescription>Set the trade or package label for this worksheet. Leave blank to clear it.</DialogDescription>
          </DialogHeader>
          <form
            className="mt-5 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void updateWorksheetTradePackage();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="worksheet-trade-package">
                Trade/package
              </label>
              <Input
                id="worksheet-trade-package"
                value={actionDialog?.type === "trade" ? actionDialog.value : ""}
                onChange={(event) =>
                  setActionDialog((current) =>
                    current?.type === "trade" ? { ...current, value: event.target.value } : current
                  )
                }
                placeholder="e.g. Suspended Ceilings"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setActionDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutatingWorksheetId !== null}>
                {mutatingWorksheetId ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog?.type === "archive"} onOpenChange={(open) => (!open ? setActionDialog(null) : undefined)}>
        <DialogContent className="w-full max-w-[460px] p-6">
          <DialogHeader>
            <DialogTitle>Archive Worksheet</DialogTitle>
            <DialogDescription>
              This will remove {actionDialog?.type === "archive" ? actionDialog.row.name : "this worksheet"} from the register without permanently deleting it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void archiveWorksheet()} disabled={mutatingWorksheetId !== null}>
              {mutatingWorksheetId ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedWorksheetId ? (
        <PricingWorksheetOverlayDialog
          owner={worksheetOwner}
          worksheetId={selectedWorksheetId}
          initialSheetId={initialSheetId}
          onClose={closeWorksheetOverlay}
          onDirtyStateChange={setIsOverlayWorksheetDirty}
        />
      ) : null}
    </div>
  );
}
