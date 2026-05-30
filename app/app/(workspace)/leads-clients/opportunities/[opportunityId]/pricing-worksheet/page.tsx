"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, Copy, FileSpreadsheet, FolderPen, Pencil, Plus } from "lucide-react";
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
  buildPricingWorksheetIntelligenceEvent,
  logPricingWorksheetIntelligenceFailure,
  writePricingWorksheetIntelligenceEvent,
} from "@/lib/pricing-worksheet-intelligence";
import { markPricingWorksheetPerformance } from "@/lib/pricing-worksheet-performance";
import { canManageCommercialData } from "@/lib/role-permissions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";

type PricingWorksheetRegisterRow = Pick<
  Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
  "id" | "name" | "trade_package" | "updated_at"
>;
type PricingWorksheetDuplicateSource = Pick<
  Database["public"]["Tables"]["opportunity_pricing_worksheets"]["Row"],
  | "name"
  | "trade_package"
  | "worksheet_data"
  | "pricing_summary"
  | "extracted_pricing_data"
  | "version"
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

function cloneJson(value: Json): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function syncWorksheetDataSheetName(value: Json, sheetName: string): Json {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...value,
      sheetName,
    } as Json;
  }

  return { sheetName } as Json;
}

function emitPricingWorksheetEvent(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  event: ReturnType<typeof buildPricingWorksheetIntelligenceEvent>
) {
  void writePricingWorksheetIntelligenceEvent(supabase, event).catch((error) => {
    logPricingWorksheetIntelligenceFailure(event.eventType, error);
  });
}

export default function OpportunityPricingWorksheetRegisterPage() {
  const sharedOpportunity = useOpportunityWorkspaceData();
  const router = useRouter();
  const { session } = useAuth();
  const canManageWorksheets = canManageCommercialData(session?.role);
  const sessionUserId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [worksheetRows, setWorksheetRows] = useState<PricingWorksheetRegisterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [mutatingWorksheetId, setMutatingWorksheetId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<WorksheetActionDialog>(null);
  const [selectedWorksheetId, setSelectedWorksheetId] = useState<string | null>(null);
  const [isOverlayWorksheetDirty, setIsOverlayWorksheetDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const registerPath = `/app/leads-clients/opportunities/${sharedOpportunity.slug}/pricing-worksheet`;

  const openWorksheet = useCallback(
    (worksheetId: string) => {
      const targetPath = `${registerPath}/${worksheetId}`;
      markPricingWorksheetPerformance("register-row-click", {
        worksheetId,
        targetPath,
      });
      setIsOverlayWorksheetDirty(false);
      setSelectedWorksheetId(worksheetId);
      window.history.pushState({ pricingWorksheetOverlay: true, worksheetId }, "", targetPath);
    },
    [registerPath]
  );

  const closeWorksheetOverlay = useCallback(() => {
    setIsOverlayWorksheetDirty(false);
    setSelectedWorksheetId(null);
    router.replace(registerPath, { scroll: false });
  }, [registerPath, router]);

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
      setSelectedWorksheetId(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOverlayWorksheetDirty, registerPath, selectedWorksheetId]);

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

    const loadWorksheets = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from("opportunity_pricing_worksheets")
          .select("id, name, trade_package, updated_at")
          .eq("organization_id", sharedOpportunity.organizationId)
          .eq("opportunity_id", sharedOpportunity.opportunityId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false });

        if (loadError) {
          throw new Error(loadError.message);
        }

        if (!cancelled) {
          setWorksheetRows((data ?? []) as PricingWorksheetRegisterRow[]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load pricing worksheets.");
        }
      } finally {
        if (!cancelled) {
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
    sharedOpportunity.opportunityId,
    sharedOpportunity.organizationId,
    supabase,
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
      const pricingSummary = createDefaultWorksheetPricingSummary();
      const extractedPricingData = createDefaultWorksheetExtractedPricingData(worksheet.version);

      const { data, error: createError } = await supabase
        .from("opportunity_pricing_worksheets")
        .insert({
          organization_id: sharedOpportunity.organizationId,
          opportunity_id: sharedOpportunity.opportunityId,
          name: "New Worksheet",
          trade_package: null,
          worksheet_data: worksheet as unknown as Json,
          pricing_summary: pricingSummary as unknown as Json,
          extracted_pricing_data: extractedPricingData as unknown as Json,
          version: worksheet.version,
          created_by: session.id,
          updated_by: session.id,
        })
        .select("id")
        .single();

      if (createError) {
        throw new Error(createError.message);
      }

      if (!data?.id) {
        throw new Error("Worksheet was created but no identifier was returned.");
      }

      const { data: createdRow, error: loadCreatedError } = await supabase
        .from("opportunity_pricing_worksheets")
        .select("id, name, trade_package, updated_at")
        .eq("organization_id", sharedOpportunity.organizationId)
        .eq("opportunity_id", sharedOpportunity.opportunityId)
        .eq("id", data.id)
        .single();

      if (loadCreatedError) {
        throw new Error(loadCreatedError.message);
      }

      setWorksheetRows((current) => [createdRow as PricingWorksheetRegisterRow, ...current]);
      emitPricingWorksheetEvent(
        supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: sharedOpportunity.organizationId,
          opportunityId: sharedOpportunity.opportunityId,
          entityId: data.id,
          worksheetName: "New Worksheet",
          tradePackage: null,
          worksheet,
          eventType: "worksheet_created",
          eventFamily: "entity_lifecycle",
          action: "created",
        })
      );
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create pricing worksheet.");
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
    };
  }, [
    canManageWorksheets,
    session?.id,
    sharedOpportunity.opportunityId,
    sharedOpportunity.organizationId,
    supabase,
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
      const { data: currentWorksheet, error: loadError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .select("name, trade_package, worksheet_data")
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id)
        .single();

      if (loadError) {
        throw new Error(loadError.message);
      }

      const { data, error: updateError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .update({
          name: nextName,
          worksheet_data: syncWorksheetDataSheetName(currentWorksheet.worksheet_data, nextName),
          updated_by: context.userId,
        })
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id)
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
      emitPricingWorksheetEvent(
        context.supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: context.organizationId,
          opportunityId: context.opportunityId,
          entityId: actionDialog.row.id,
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
      setError(updateError instanceof Error ? updateError.message : "Unable to rename worksheet.");
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [actionDialog, requireWritableContext]);

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
      const { data, error: updateError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .update({
          trade_package: nextTradePackage,
          updated_by: context.userId,
        })
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id)
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
      setError(updateError instanceof Error ? updateError.message : "Unable to update trade/package.");
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [actionDialog, requireWritableContext]);

  const duplicateWorksheet = useCallback(async (worksheetId: string) => {
    const context = requireWritableContext();
    if (!context || mutatingWorksheetId) {
      return;
    }

    setMutatingWorksheetId(worksheetId);
    setError(null);

    try {
      const { data: source, error: loadError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .select("name, trade_package, worksheet_data, pricing_summary, extracted_pricing_data, version")
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", worksheetId)
        .single();

      if (loadError) {
        throw new Error(loadError.message);
      }

      const sourceRow = source as PricingWorksheetDuplicateSource;
      const duplicatedName = `${sourceRow.name || "Worksheet"} Copy`;
      const { data: createdRow, error: insertError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .insert({
          organization_id: context.organizationId,
          opportunity_id: context.opportunityId,
          name: duplicatedName,
          trade_package: sourceRow.trade_package,
          worksheet_data: syncWorksheetDataSheetName(cloneJson(sourceRow.worksheet_data), duplicatedName),
          pricing_summary: cloneJson(sourceRow.pricing_summary),
          extracted_pricing_data: cloneJson(sourceRow.extracted_pricing_data),
          version: sourceRow.version,
          created_by: context.userId,
          updated_by: context.userId,
          archived_at: null,
        })
        .select("id, name, trade_package, updated_at")
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const nextRow = createdRow as PricingWorksheetRegisterRow;
      setWorksheetRows((current) => [nextRow, ...current]);
      emitPricingWorksheetEvent(
        context.supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: context.organizationId,
          opportunityId: context.opportunityId,
          entityId: nextRow.id,
          worksheetName: duplicatedName,
          tradePackage: sourceRow.trade_package,
          worksheet: normalizeWorksheetData(sourceRow.worksheet_data),
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
      setError(duplicateError instanceof Error ? duplicateError.message : "Unable to duplicate worksheet.");
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [mutatingWorksheetId, openWorksheet, requireWritableContext]);

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
      const { data: currentWorksheet, error: loadError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .select("name, trade_package, worksheet_data")
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id)
        .single();

      if (loadError) {
        throw new Error(loadError.message);
      }

      const { error: archiveError } = await context.supabase
        .from("opportunity_pricing_worksheets")
        .update({
          archived_at: archivedAt,
          updated_by: context.userId,
        })
        .eq("organization_id", context.organizationId)
        .eq("opportunity_id", context.opportunityId)
        .eq("id", actionDialog.row.id);

      if (archiveError) {
        throw new Error(archiveError.message);
      }

      setWorksheetRows((current) => current.filter((row) => row.id !== actionDialog.row.id));
      emitPricingWorksheetEvent(
        context.supabase,
        buildPricingWorksheetIntelligenceEvent({
          organizationId: context.organizationId,
          opportunityId: context.opportunityId,
          entityId: actionDialog.row.id,
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
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive worksheet.");
    } finally {
      setMutatingWorksheetId(null);
    }
  }, [actionDialog, requireWritableContext]);

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title="Pricing Worksheets"
        description="Create and manage pricing worksheets for this opportunity."
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

      {isLoading ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading pricing worksheets...</p>
      ) : worksheetRows.length === 0 ? (
        <OperationalEmptyState
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="No pricing worksheets yet for this opportunity."
          description="Create the first worksheet, then build out trade/package pricing in the spreadsheet editor."
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
          worksheetId={selectedWorksheetId}
          onClose={closeWorksheetOverlay}
          onDirtyStateChange={setIsOverlayWorksheetDirty}
        />
      ) : null}
    </div>
  );
}
