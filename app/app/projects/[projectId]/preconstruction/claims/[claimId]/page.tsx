"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ExternalLink, FileDown, Maximize2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "@/components/app/trade-pack-builder.module.css";

type ClaimStatus = "Draft" | "Submitted" | "Unpaid" | "Paid" | "Overdue" | "Cancelled";
type ClaimType = "Progress" | "Deposit" | "Final";

interface ClaimRow {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  claim_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  percent_complete: number | null;
  claim_amount: number | null;
  paid_amount: number | null;
  notes: string | null;
  updated_at: string;
}

interface CreateClaimDraftRow {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  claim_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  percent_complete: number | null;
  paid_amount: number | null;
  notes: string | null;
  updated_at: string;
}

interface SaveClaimDraftRow {
  updated_at: string;
  claim_amount: number;
  linked_quote_value: number;
  linked_approved_variations: number;
  previous_claims_total: number;
  revised_contract_value: number;
  percent_complete: number;
  paid_amount: number;
  status: ClaimStatus;
}

interface ClaimLineItemRow {
  id: string;
  source_kind: "Quote" | "Variation";
  source_document_id: string;
  source_line_item_id: string;
  source_number: string;
  source_title: string;
  section: string;
  description: string;
  quantity: number | null;
  unit: string;
  rate: number | null;
  source_total: number | null;
  previously_claimed_amount: number | null;
  previously_claimed_percent: number | null;
  claim_percent: number | null;
  claim_amount: number | null;
  cumulative_claimed_amount: number | null;
  cumulative_claimed_percent: number | null;
  sort_order: number | null;
}

interface ClaimLineItem {
  id: string;
  sourceKind: "Quote" | "Variation";
  sourceDocumentId: string;
  sourceLineItemId: string;
  sourceNumber: string;
  sourceTitle: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourceTotal: number;
  previouslyClaimedAmount: number;
  previouslyClaimedPercent: number;
  claimPercent: number;
  claimAmount: number;
  cumulativeClaimedAmount: number;
  cumulativeClaimedPercent: number;
  sortOrder: number;
}

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function numberOrZero(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDayMonthYearLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function claimStatusClassName(status: ClaimStatus) {
  switch (status) {
    case "Paid":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "Overdue":
      return "border-rose-200 bg-rose-100 text-rose-800";
    case "Submitted":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "Unpaid":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "Cancelled":
      return "border-slate-300 bg-slate-200 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export default function ProjectClaimDetailPage() {
  const params = useParams<{ projectId: string; claimId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeClaimId = params?.claimId;
  const isNewRoute = routeClaimId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [projectDbId, setProjectDbId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimUpdatedAt, setClaimUpdatedAt] = useState<string | null>(null);
  const [claimNumber, setClaimNumber] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [claimType, setClaimType] = useState<ClaimType>("Progress");
  const [status, setStatus] = useState<ClaimStatus>("Draft");
  const [claimDate, setClaimDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [claimLineItems, setClaimLineItems] = useState<ClaimLineItem[]>([]);
  const [isLineItemsOpen, setIsLineItemsOpen] = useState(true);
  const [isLineItemsExpanded, setIsLineItemsExpanded] = useState(false);

  const [baseQuoteValue, setBaseQuoteValue] = useState(0);
  const [approvedVariationsValue, setApprovedVariationsValue] = useState(0);
  const [previousClaimsTotal, setPreviousClaimsTotal] = useState(0);
  const [paidToDateTotal, setPaidToDateTotal] = useState(0);
  const hasAutoCreatedOnNewRoute = useRef(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const applyClaimRow = useCallback((claim: ClaimRow | CreateClaimDraftRow) => {
    setClaimId(claim.id);
    setClaimUpdatedAt(claim.updated_at ?? null);
    setClaimNumber(claim.claim_number ?? "");
    setClaimTitle(claim.claim_title ?? "");
    setClaimType((claim.claim_type ?? "Progress") as ClaimType);
    setStatus((claim.status ?? "Draft") as ClaimStatus);
    setClaimDate(claim.claim_date ?? "");
    setDueDate(claim.due_date ?? "");
    setPeriodStart(claim.period_start ?? "");
    setPeriodEnd(claim.period_end ?? "");
    setPaidAmount(String(claim.paid_amount ?? 0));
    setNotes(claim.notes ?? "");
  }, []);

  const loadClaimLineItems = useCallback(async (resolvedOrganizationId: string, resolvedClaimId: string) => {
    if (!supabase) {
      return;
    }

    const loadFromSourceDocuments = async (applyToState = true): Promise<ClaimLineItem[]> => {
      const { data: quoteRows } = await supabase
        .from("project_quotes")
        .select("id, quote_number, quote_title, status, updated_at")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", projectDbId)
        .order("updated_at", { ascending: false });

      const baseQuote = (quoteRows ?? []).sort((left, right) => {
        const leftRank = left.status === "Accepted" ? 0 : left.status === "Sent" ? 1 : 2;
        const rightRank = right.status === "Accepted" ? 0 : right.status === "Sent" ? 1 : 2;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return 0;
      })[0];

      const quoteLineItems = baseQuote
        ? await supabase
            .from("project_quote_line_items")
            .select("id, section, description, quantity, unit, rate, total, sort_order")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectDbId)
            .eq("quote_id", baseQuote.id)
            .eq("is_optional", false)
            .order("sort_order", { ascending: true })
        : { data: [] as Array<Record<string, unknown>> };

      const { data: variationRows } = await supabase
        .from("project_variations")
        .select("id, variation_number, variation_title, total_variation_price, created_at")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", projectDbId)
        .in("status", ["Approved", "Sent", "Invoiced"])
        .order("created_at", { ascending: true });

      const quoteMapped: ClaimLineItem[] = ((quoteLineItems.data ?? []) as Array<Record<string, unknown>>).map((row, index) => ({
        id: `quote-${String(row.id ?? crypto.randomUUID())}`,
        sourceKind: "Quote",
        sourceDocumentId: String(baseQuote?.id ?? ""),
        sourceLineItemId: String(row.id ?? ""),
        sourceNumber: String(baseQuote?.quote_number ?? ""),
        sourceTitle: String(baseQuote?.quote_title ?? "Quote"),
        section: String(row.section ?? ""),
        description: String(row.description ?? ""),
        quantity: numberOrZero(row.quantity),
        unit: String(row.unit ?? ""),
        rate: numberOrZero(row.rate),
        sourceTotal: numberOrZero(row.total) || numberOrZero(row.quantity) * numberOrZero(row.rate),
        previouslyClaimedAmount: 0,
        previouslyClaimedPercent: 0,
        claimPercent: 0,
        claimAmount: 0,
        cumulativeClaimedAmount: 0,
        cumulativeClaimedPercent: 0,
        sortOrder: numberOrZero(row.sort_order) || index,
      }));

      const variationMapped: ClaimLineItem[] = ((variationRows ?? []) as Array<Record<string, unknown>>).map((row, index) => ({
        id: `variation-${String(row.id ?? crypto.randomUUID())}`,
        sourceKind: "Variation",
        sourceDocumentId: String(row.id ?? ""),
        sourceLineItemId: String(row.id ?? ""),
        sourceNumber: String(row.variation_number ?? ""),
        sourceTitle: String(row.variation_title ?? "Variation"),
        section: "Item",
        description: String(row.variation_title ?? "Variation"),
        quantity: 1,
        unit: "Item",
        rate: numberOrZero(row.total_variation_price),
        sourceTotal: numberOrZero(row.total_variation_price),
        previouslyClaimedAmount: 0,
        previouslyClaimedPercent: 0,
        claimPercent: 0,
        claimAmount: 0,
        cumulativeClaimedAmount: 0,
        cumulativeClaimedPercent: 0,
        sortOrder: 100000 + index,
      }));

      const sourceRows = [...quoteMapped, ...variationMapped];
      if (applyToState) {
        setClaimLineItems(sourceRows);
      }
      return sourceRows;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimLineItemsTable = (supabase as any).from("project_claim_line_items");
    const { data, error: lineItemsError } = await claimLineItemsTable
      .select("id, source_kind, source_document_id, source_line_item_id, source_number, source_title, section, description, quantity, unit, rate, source_total, previously_claimed_amount, previously_claimed_percent, claim_percent, claim_amount, cumulative_claimed_amount, cumulative_claimed_percent, sort_order")
      .eq("organization_id", resolvedOrganizationId)
      .eq("claim_id", resolvedClaimId)
      .order("sort_order", { ascending: true });

    if (lineItemsError) {
      await loadFromSourceDocuments(true);
      return;
    }

    const nextRows = ((data ?? []) as ClaimLineItemRow[]).map((row) => ({
      id: row.id,
      sourceKind: row.source_kind,
      sourceDocumentId: row.source_document_id,
      sourceLineItemId: row.source_line_item_id,
      sourceNumber: row.source_number ?? "",
      sourceTitle: row.source_title ?? "",
      section: row.section ?? "",
      description: row.description ?? "",
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "",
      rate: Number(row.rate ?? 0),
      sourceTotal: Number(row.source_total ?? 0),
      previouslyClaimedAmount: Number(row.previously_claimed_amount ?? 0),
      previouslyClaimedPercent: Number(row.previously_claimed_percent ?? 0),
      claimPercent: Number(row.claim_percent ?? 0),
      claimAmount: Number(row.claim_amount ?? 0),
      cumulativeClaimedAmount: Number(row.cumulative_claimed_amount ?? 0),
      cumulativeClaimedPercent: Number(row.cumulative_claimed_percent ?? 0),
      sortOrder: Number(row.sort_order ?? 0),
    }));

    if (nextRows.length === 0) {
      await loadFromSourceDocuments(true);
      return;
    }

    const liveSourceRows = await loadFromSourceDocuments(false);
    const liveVariationKeys = new Set(
      liveSourceRows
        .filter((row) => row.sourceKind === "Variation")
        .map((row) => `Variation:${row.sourceLineItemId}`)
    );
    const normalizedExistingRows = nextRows.filter(
      (row) => row.sourceKind !== "Variation" || liveVariationKeys.has(`Variation:${row.sourceLineItemId}`)
    );
    const existingSourceKeys = new Set(
      normalizedExistingRows.map((row) => `${row.sourceKind}:${row.sourceLineItemId}`)
    );
    const missingRows = liveSourceRows.filter(
      (row) => !existingSourceKeys.has(`${row.sourceKind}:${row.sourceLineItemId}`)
    );
    const mergedRows = [...normalizedExistingRows, ...missingRows].sort((left, right) => left.sortOrder - right.sortOrder);
    setClaimLineItems(mergedRows);
  }, [projectDbId, supabase]);

  const refreshContractSummary = useCallback(async (resolvedOrganizationId: string, resolvedProjectId: string, existingClaimId: string | null) => {
    if (!supabase) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimsTable = (supabase as any).from("project_claims");
    const [{ data: quoteRows }, { data: variationRows }, { data: claimsRowsRaw }] = await Promise.all([
      supabase
        .from("project_quotes")
        .select("status, total_quote_price, updated_at")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", resolvedProjectId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("project_variations")
        .select("status, total_variation_price")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", resolvedProjectId),
      claimsTable
        .select("id, claim_amount, paid_amount, status")
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", resolvedProjectId),
    ]);

    const bestQuote = (quoteRows ?? []).sort((left, right) => {
      const leftRank = left.status === "Accepted" ? 0 : left.status === "Sent" ? 1 : 2;
      const rightRank = right.status === "Accepted" ? 0 : right.status === "Sent" ? 1 : 2;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return 0;
    })[0];

    const quoteValue = Number(bestQuote?.total_quote_price ?? 0);
    const approvedVariations = (variationRows ?? [])
      .filter((row) => row.status === "Approved" || row.status === "Sent" || row.status === "Invoiced")
      .reduce((sum, row) => sum + Number(row.total_variation_price ?? 0), 0);

    const claimRows = (claimsRowsRaw ?? []) as Array<{ id: string; claim_amount: number | null; paid_amount: number | null; status: ClaimStatus }>;
    const previousTotal = claimRows
      .filter((row) => row.id !== existingClaimId && row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.claim_amount ?? 0), 0);
    const paidToDate = claimRows
      .filter((row) => row.status !== "Cancelled")
      .reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0);

    setBaseQuoteValue(quoteValue);
    setApprovedVariationsValue(approvedVariations);
    setPreviousClaimsTotal(previousTotal);
    setPaidToDateTotal(paidToDate);
  }, [supabase]);

  const createClaim = useCallback(async () => {
    if (isCreatingClaim || !supabase || !organizationId || !projectDbId) {
      return;
    }

    setIsCreatingClaim(true);
    setError(null);
    setSaveMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: createError } = await (supabase as any).rpc("create_project_claim_draft", {
        p_organization_id: organizationId,
        p_project_id: projectDbId,
        p_title: "New Claim",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(data) ? (data[0] as CreateClaimDraftRow | undefined) : undefined;
      if (!createdRow?.id) {
        throw new Error("Claim draft was created but no identifier was returned.");
      }

      applyClaimRow(createdRow);
      await loadClaimLineItems(organizationId, createdRow.id);
      await refreshContractSummary(organizationId, projectDbId, createdRow.id);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims/${createdRow.id}`);
    } catch (createClaimError) {
      setError(createClaimError instanceof Error ? createClaimError.message : "Unable to create claim.");
    } finally {
      setIsCreatingClaim(false);
    }
  }, [applyClaimRow, isCreatingClaim, loadClaimLineItems, organizationId, projectDbId, refreshContractSummary, routeProjectSlug, router, supabase]);

  useEffect(() => {
    if (!supabase || !routeProjectSlug || !userId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setSaveMessage(null);

      try {
        let resolvedOrganizationId = sessionOrganizationId;
        if (!resolvedOrganizationId) {
          const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
          resolvedOrganizationId = ensuredOrganizationId ?? null;
        }
        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
        }
        if (!cancelled) {
          setOrganizationId(resolvedOrganizationId);
        }

        const { data: organizationRow } = await supabase
          .from("organizations")
          .select("name, logo_path")
          .eq("id", resolvedOrganizationId)
          .maybeSingle();
        if (!cancelled) {
          setOrganizationName(organizationRow?.name ?? "");
          if (organizationRow?.logo_path) {
            const { data: logoUrlData } = supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path);
            setOrganizationLogoUrl(logoUrlData.publicUrl);
          } else {
            setOrganizationLogoUrl(null);
          }
        }

        const { data: projectRow, error: projectError } = await supabase
          .from("organization_projects")
          .select("id, name")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();
        if (projectError || !projectRow?.id) {
          throw new Error(projectError?.message ?? "Project not found.");
        }
        if (!cancelled) {
          setProjectDbId(projectRow.id);
          setProjectName(projectRow.name ?? "");
        }

        if (!isNewRoute) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const claimsTable = (supabase as any).from("project_claims");
          const { data: claimRowRaw, error: claimError } = await claimsTable
            .select("id, claim_number, claim_title, claim_type, status, claim_date, due_date, period_start, period_end, percent_complete, claim_amount, paid_amount, notes, updated_at")
            .eq("organization_id", resolvedOrganizationId)
            .eq("id", routeClaimId)
            .maybeSingle();
          if (claimError || !claimRowRaw) {
            throw new Error(claimError?.message ?? "Claim not found.");
          }
          if (!cancelled) {
            applyClaimRow(claimRowRaw as ClaimRow);
            await loadClaimLineItems(resolvedOrganizationId, routeClaimId);
          }
        } else if (!cancelled) {
          setClaimId(null);
          setClaimUpdatedAt(null);
          setClaimLineItems([]);
        }

        if (!cancelled) {
          await refreshContractSummary(resolvedOrganizationId, projectRow.id, isNewRoute ? null : routeClaimId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load claim.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [applyClaimRow, isNewRoute, loadClaimLineItems, refreshContractSummary, routeClaimId, routeProjectSlug, sessionOrganizationId, supabase, userId]);

  useEffect(() => {
    if (!isNewRoute) {
      hasAutoCreatedOnNewRoute.current = false;
      return;
    }

    if (isLoading || !organizationId || !projectDbId || hasAutoCreatedOnNewRoute.current) {
      return;
    }

    hasAutoCreatedOnNewRoute.current = true;
    void createClaim();
  }, [createClaim, isLoading, isNewRoute, organizationId, projectDbId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isRefreshShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r";
      if (!isRefreshShortcut) {
        return;
      }
      event.preventDefault();
      window.location.reload();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const claimLineItemsComputed = useMemo(() => {
    return claimLineItems.map((item) => {
      const previousAmount = Math.max(0, numberOrZero(item.previouslyClaimedAmount));
      const sourceTotal = Math.max(0, numberOrZero(item.sourceTotal));
      const remainingAmount = Math.max(0, sourceTotal - previousAmount);
      const claimPercent = Math.min(100, Math.max(0, numberOrZero(item.claimPercent)));
      const claimAmount = remainingAmount * (claimPercent / 100);
      const cumulativeAmount = previousAmount + claimAmount;
      const previousPercent = sourceTotal > 0 ? (previousAmount / sourceTotal) * 100 : 0;
      const cumulativePercent = sourceTotal > 0 ? (cumulativeAmount / sourceTotal) * 100 : 0;

      return {
        ...item,
        sourceTotal,
        previouslyClaimedAmount: previousAmount,
        previouslyClaimedPercent: previousPercent,
        claimPercent,
        claimAmount,
        cumulativeClaimedAmount: cumulativeAmount,
        cumulativeClaimedPercent: Math.min(100, cumulativePercent),
      };
    });
  }, [claimLineItems]);

  const currentClaimAmount = useMemo(
    () => claimLineItemsComputed.reduce((sum, item) => sum + item.claimAmount, 0),
    [claimLineItemsComputed],
  );
  const revisedContractValue = baseQuoteValue + approvedVariationsValue;
  const valueEarnedToDate = previousClaimsTotal + currentClaimAmount;
  const parsedPercentComplete = revisedContractValue > 0 ? Math.min(100, Math.max(0, (valueEarnedToDate / revisedContractValue) * 100)) : 0;
  const previousPercentComplete = revisedContractValue > 0 ? (previousClaimsTotal / revisedContractValue) * 100 : 0;
  const thisClaimPercent = revisedContractValue > 0 ? (currentClaimAmount / revisedContractValue) * 100 : 0;
  const paidAmountNumber = Number(paidAmount || 0);
  const balance = Math.max(0, valueEarnedToDate - paidToDateTotal);
  const isSubmittedLocked = status === "Submitted";
  const displayedPercentComplete = parsedPercentComplete.toFixed(2);

  const updateClaimLinePercent = (lineId: string, nextValue: string) => {
    if (isSubmittedLocked) {
      return;
    }
    const clampedPercent = Math.min(100, Math.max(0, numberOrZero(nextValue)));
    setClaimLineItems((current) =>
      current.map((line) => (line.id === lineId ? { ...line, claimPercent: clampedPercent } : line)),
    );
  };

  const lineItemsGridTemplate = "minmax(0,1.7fr) minmax(0,0.8fr) minmax(0,1.1fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,1fr)";
  const quoteLineItems = claimLineItemsComputed.filter((line) => line.sourceKind === "Quote");
  const variationLineItems = claimLineItemsComputed.filter((line) => line.sourceKind === "Variation");
  const quoteLineTotalValue = quoteLineItems.reduce((sum, line) => sum + line.sourceTotal, 0);
  const variationLineTotalValue = variationLineItems.reduce((sum, line) => sum + line.sourceTotal, 0);

  const renderLineItemRow = (line: (typeof claimLineItemsComputed)[number]) => (
    <div
      key={line.id}
      className="grid items-center gap-2 border-b border-[#EEF2F7] px-3 py-2 last:border-b-0 [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-[#EEF2F7] [&>*:not(:first-child)]:pl-3"
      style={{ gridTemplateColumns: lineItemsGridTemplate }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#1d2433]">
          {line.sourceNumber || line.description || "Untitled line"}
        </p>
        {line.sourceKind === "Variation" && line.sourceTitle ? (
          <p className={`${interMedium.className} truncate text-[11px] text-[#64748B]`}>
            {line.sourceTitle}
          </p>
        ) : null}
      </div>
      <span className={`${interMedium.className} min-w-0 truncate text-sm text-[#334155]`}>{line.section}</span>
      <span className={`${interMedium.className} truncate text-xs text-[#64748B]`}>{line.sourceKind} {line.sourceNumber}</span>
      <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[#334155]`}>{toMoney(line.sourceTotal)}</span>
      <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[#334155]`}>{toMoney(line.previouslyClaimedAmount)}</span>
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={line.claimPercent.toString()}
          onChange={(event) => updateClaimLinePercent(line.id, event.target.value)}
          disabled={isSubmittedLocked}
          className="h-10 rounded-[6px] pr-7 text-right"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">%</span>
      </div>
      <span className={`${interMedium.className} min-w-0 truncate text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(line.claimAmount)}</span>
      <span className={`${interMedium.className} min-w-0 truncate text-right text-sm text-[#334155]`}>{toMoney(line.cumulativeClaimedAmount)}</span>
    </div>
  );

  const renderLineItemsTable = (containerClassName = "") => (
    <div className={`overflow-x-auto rounded-[6px] border border-[#E5EAF2] ${containerClassName}`.trim()}>
      <div
        className={`${interMedium.className} grid items-center gap-2 border-b border-[#E5EAF2] bg-[#F8FAFC] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.1em] text-[#607089] [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-[#E5EAF2] [&>*:not(:first-child)]:pl-3`}
        style={{ gridTemplateColumns: lineItemsGridTemplate }}
      >
        <span>Description</span>
        <span>Section</span>
        <span>Source</span>
        <span className="text-right">Line Total</span>
        <span className="text-right">Prev Claimed</span>
        <span>Claim %</span>
        <span className="text-right">This Claim</span>
        <span className="text-right">Claimed to Date</span>
      </div>
      <div>
        {quoteLineItems.length > 0 ? (
          <div className="border-b border-[#E5EAF2] bg-[#F8FAFC] px-3 py-2">
            <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>
              Quote Value
            </p>
          </div>
        ) : null}
        {quoteLineItems.map(renderLineItemRow)}
        {variationLineItems.length > 0 ? (
          <div className="border-y border-[#E5EAF2] bg-[#F8FAFC] px-3 py-2">
            <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>
              Variations Value
            </p>
          </div>
        ) : null}
        {variationLineItems.map(renderLineItemRow)}
        {claimLineItemsComputed.length === 0 ? (
          <p className={`${interMedium.className} px-3 py-6 text-center text-sm text-[#73839a]`}>No claimable line items found yet.</p>
        ) : null}
      </div>
    </div>
  );

  const saveClaim = async () => {
    if (!supabase || !organizationId || !projectDbId || !userId || !claimId) {
      setError("Claim save is not ready. Please refresh and try again.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: saveError } = await (supabase as any).rpc("save_project_claim_draft", {
        p_organization_id: organizationId,
        p_project_id: projectDbId,
        p_claim_id: claimId,
        p_expected_updated_at: claimUpdatedAt,
        p_claim_title: claimTitle.trim() || "Untitled Claim",
        p_claim_type: claimType,
        p_status: status,
        p_claim_date: claimDate || null,
        p_due_date: dueDate || null,
        p_period_start: periodStart || null,
        p_period_end: periodEnd || null,
        p_percent_complete: Number(parsedPercentComplete.toFixed(3)),
        p_paid_amount: Number(Math.max(0, paidAmountNumber).toFixed(2)),
        p_notes: notes,
        p_line_items: claimLineItemsComputed.map((item) => ({
          source_kind: item.sourceKind,
          source_line_item_id: item.sourceLineItemId,
          claim_percent: Number(item.claimPercent.toFixed(3)),
        })),
      });
      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = Array.isArray(data) ? (data[0] as SaveClaimDraftRow | undefined) : undefined;
      if (savedRow) {
        setClaimUpdatedAt(savedRow.updated_at ?? null);
        setStatus(savedRow.status ?? status);
        setPaidAmount(String(savedRow.paid_amount ?? paidAmountNumber));
        setBaseQuoteValue(Number(savedRow.linked_quote_value ?? 0));
        setPreviousClaimsTotal(Number(savedRow.previous_claims_total ?? 0));
      }
      await loadClaimLineItems(organizationId, claimId);
      await refreshContractSummary(organizationId, projectDbId, claimId);

      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveClaimError) {
      setError(saveClaimError instanceof Error ? saveClaimError.message : "Unable to save claim.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClaim = async () => {
    if (!claimId || !supabase || !organizationId) {
      return;
    }
    const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete claim ${claimNumber}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimsTable = (supabase as any).from("project_claims");
      const { error: deleteError } = await claimsTable
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", claimId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/claims`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete claim.");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportClaimPdf = () => {
    if (!claimId || typeof window === "undefined") {
      return;
    }

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName || routeProjectSlug?.replaceAll("-", " ") || "Project";
    const printableClaimNumber = claimNumber || "Unassigned";
    const issueDate = toDayMonthYearLabel(claimDate || new Date().toISOString().slice(0, 10));
    const raisedBy = session?.name?.trim() || "—";
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableClaimNumber}`;
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;

    const quotePdfRows = claimLineItemsComputed.filter((line) => line.sourceKind === "Quote");
    const variationPdfRows = claimLineItemsComputed.filter((line) => line.sourceKind === "Variation");
    const renderPdfLineRow = (line: ClaimLineItem) => `
      <tr>
        <td class="desc-cell">
          <div class="cell-primary">${escapeHtml(line.sourceNumber || line.description || "Untitled line item")}</div>
          ${line.sourceKind === "Variation" && line.sourceTitle ? `<div class="cell-secondary">${escapeHtml(line.sourceTitle)}</div>` : ""}
        </td>
        <td class="right money col-contract">${toMoney(line.sourceTotal)}</td>
        <td class="right percent col-progress">${line.claimPercent.toFixed(2)}%</td>
        <td class="right money col-total">${toMoney(line.claimAmount)}</td>
      </tr>
    `;
    const lineItemsRows = claimLineItemsComputed.length > 0
      ? [
          quotePdfRows.length > 0 ? `<tr class="group-row"><td colspan="4">Quote Value</td></tr>${quotePdfRows.map(renderPdfLineRow).join("")}` : "",
          variationPdfRows.length > 0 ? `<tr class="group-row"><td colspan="4">Variations Value</td></tr>${variationPdfRows.map(renderPdfLineRow).join("")}` : "",
        ].join("")
      : `<tr><td colspan="4" style="text-align:center;color:#64748b;">No claimable line items.</td></tr>`;

    const gstRate = 0.15;
    const subtotal = currentClaimAmount;
    const gst = subtotal * gstRate;
    const total = subtotal + gst;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportDocumentTitle)}</title>
    <style>
      :root {
        --orange: #ff4d1f;
        --text: #2d3137;
        --muted: #697587;
        --line: #cfd6e0;
      }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #eceff3; color: var(--text); }
      body { font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; }
      .sheet {
        width: 794px;
        min-height: 1123px;
        margin: 34px auto;
        background: #fff;
        padding: 44px 44px 32px;
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08), 0 10px 26px rgba(15, 23, 42, 0.12);
      }
      .accent { height: 4px; background: var(--orange); margin-bottom: 16px; }
      .top {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        column-gap: 20px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 10px;
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .logo-img { width: 100%; height: 100%; object-fit: contain; }
      .logo-fallback {
        width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--line); color: var(--orange); font-size: 13px; font-weight: 700;
      }
      .title {
        margin: 0;
        color: var(--orange);
        font-size: 58px;
        line-height: 1;
        letter-spacing: -0.02em;
        font-weight: 700;
      }
      .site { margin: 0; color: var(--muted); font-size: 13px; white-space: nowrap; }

      .issued-row {
        margin-top: 16px;
        display: grid;
        grid-template-columns: 1fr 310px;
        column-gap: 20px;
      }
      .issued-title {
        margin: 0 0 4px;
        color: #1f2937;
        font-size: 12px;
        line-height: 1;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .issued-text {
        margin: 0;
        color: #4b5563;
        white-space: pre-line;
        font-size: 15px;
        line-height: 1.3;
      }
      .issued-meta .row {
        display: grid;
        grid-template-columns: 185px auto;
        gap: 10px;
        margin-bottom: 1px;
      }
      .issued-meta .k {
        color: #1f2937;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
        text-align: right;
        font-size: 10px;
      }
      .issued-meta .v {
        color: #4b5563;
        text-align: right;
        font-size: 14px;
      }
      .project-lead {
        margin: 14px 0 10px;
      }
      .project-lead .project-line {
        margin: 0 0 2px;
        color: #1f2937;
        font-size: 32px;
        line-height: 1.05;
        font-weight: 700;
      }
      .project-lead .lead-note {
        margin: 0;
        color: #4b5563;
        font-size: 11px;
      }
      .section-title {
        margin: 0 0 6px;
        color: #1f2937;
        font-size: 14px;
        line-height: 1;
        letter-spacing: 0;
        font-weight: 700;
      }

      table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid var(--line); }
      thead th {
        background: var(--orange);
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        font-weight: 700;
        text-align: left;
        padding: 5px 8px;
      }
      tbody td {
        border-top: 1px solid var(--line);
        padding: 6px 8px;
        color: #303846;
        font-size: 10px;
        vertical-align: top;
      }
      .group-row td {
        background: #f5f7fb;
        color: #5d6f88;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 10px;
        font-weight: 700;
      }
      .desc-cell { line-height: 1.25; }
      .cell-primary { font-weight: 600; color: #1f2937; }
      .cell-secondary { margin-top: 1px; font-size: 9px; color: #6b7280; }
      .right { text-align: right; }
      .money, .percent { white-space: nowrap; font-variant-numeric: tabular-nums; }

      .lower {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 360px;
        gap: 18px;
      }
      .payment-details .bar {
        display: inline-block;
        background: var(--orange);
        color: #fff;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        padding: 6px 12px;
        margin-bottom: 8px;
      }
      .payment-details p {
        margin: 0 0 4px;
        color: #374151;
        font-size: 12px;
      }
      .payment-details p strong { color: #1f2937; }
      .payment-details .thanks {
        margin-top: 10px;
        font-size: 12px;
        font-weight: 700;
        color: #1f2937;
      }
      .payment-details .legal {
        margin-top: 12px;
        font-size: 12px;
        line-height: 1.35;
        font-weight: 700;
      }

      .claim-summary h3 {
        margin: 0 0 8px;
        color: #1f2937;
        font-size: 11px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }
      .summary-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 4px 0;
        border-bottom: 1px solid var(--line);
        font-size: 11px;
      }
      .summary-row .k { color: #607089; }
      .summary-row .v { color: #253248; font-weight: 600; }
      .summary-row.strong .k,
      .summary-row.strong .v { color: #162033; font-weight: 700; }
      .summary-divider { border-top: 2px solid #9fb2ce; margin: 6px 0 4px; }
      .summary-block-title {
        margin: 8px 0 3px;
        color: #4d617a;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .totals-inline { margin-top: 10px; }
      .totals-inline .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 3px 0;
        border-bottom: 1px solid var(--line);
        font-size: 11px;
      }
      .totals-inline .k { color: #5d7292; }
      .totals-inline .v { color: #27344a; font-weight: 600; }
      .totals-inline .row.total-row {
        background: var(--orange);
        border-top: 0;
        border-bottom: 0;
        padding-top: 7px;
        padding-bottom: 7px;
        padding-left: 8px;
        padding-right: 8px;
      }
      .totals-inline .row.total-row .k,
      .totals-inline .row.total-row .v {
        color: #fff;
        font-size: 12px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: 0;
      }
      .terms {
        margin-top: 16px;
        max-width: 54%;
        color: #374151;
        white-space: pre-line;
        font-size: 11px;
      }
      .terms p { margin: 0 0 8px; }
      .signature {
        margin-top: 18px;
        text-align: right;
      }
      .signature .scribble {
        font-family: "Brush Script MT", "Segoe Script", cursive;
        font-size: 36px;
        color: #6b7280;
        line-height: 1;
      }
      .signature .name {
        margin-top: 4px;
        font-size: 16px;
        font-weight: 700;
        color: #1f2937;
        line-height: 1;
      }
      .doc-footer {
        margin-top: 18px;
        padding-top: 10px;
        border-top: 1px solid var(--line);
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        color: var(--muted);
        font-size: 11px;
      }
      .doc-footer .center { text-align: center; }
      .doc-footer .right { text-align: right; }
      .doc-footer .page::before { content: counter(page); }

      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        html, body { background: #fff; }
        .sheet { margin: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="accent"></div>
      <header class="top">
        <div class="brand">
          <div class="logo-wrap">${logoMarkup}</div>
        </div>
        <p class="title">Payment Claim</p>
        <p class="site">www.tradesstack.com</p>
      </header>

      <section class="issued-row">
        <div>
          <p class="issued-title">Issued To:</p>
          <p class="issued-text">${escapeHtml(printableProjectName)}
${escapeHtml(printableOrgName)}</p>
        </div>
        <div class="issued-meta">
          <div class="row"><span class="k">Payment Claim No:</span><span class="v">${escapeHtml(printableClaimNumber)}</span></div>
          <div class="row"><span class="k">Date:</span><span class="v">${escapeHtml(issueDate)}</span></div>
          <div class="row"><span class="k">Due Date:</span><span class="v">${escapeHtml(toDayMonthYearLabel(dueDate || null))}</span></div>
        </div>
      </section>

      <section class="project-lead">
        <p class="project-line">Project: ${escapeHtml(printableProjectName)}</p>
        <p class="lead-note">We greatly appreciate your support. Please see the payment claim breakdown below.</p>
      </section>

      <h2 class="section-title">Claim Line Items</h2>
      <table>
        <thead>
          <tr>
            <th style="width:46%">Description</th>
            <th class="right col-contract" style="width:20%">Contract Value</th>
            <th class="right col-progress" style="width:14%">Progress %</th>
            <th class="right col-total" style="width:20%">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>

      <section class="lower">
        <section class="payment-details">
          <div class="bar">Payment Details</div>
          <p><strong>Claim Type:</strong> ${escapeHtml(claimType)}</p>
          <p><strong>Status:</strong> ${escapeHtml(status)}</p>
          <p><strong>Project:</strong> ${escapeHtml(printableProjectName)}</p>
          <p class="thanks">Thank you for your business!</p>
          <p class="legal">This is a Payment Claim under the Construction Contracts Act 2002.</p>
        </section>

        <div>
          <section class="claim-summary">
            <h3>Claim Summary</h3>
            <div class="summary-row"><span class="k">Original Contract</span><span class="v">${toMoney(baseQuoteValue)}</span></div>
            <div class="summary-row"><span class="k">Approved Variations</span><span class="v">${toMoney(approvedVariationsValue)}</span></div>
            <div class="summary-row strong"><span class="k">Revised Contract Value</span><span class="v">${toMoney(revisedContractValue)}</span></div>

            <div class="summary-divider"></div>
            <p class="summary-block-title">Previous Claims</p>
            <div class="summary-row"><span class="k">Total Previously Claimed</span><span class="v">${toMoney(previousClaimsTotal)}</span></div>

            <div class="summary-divider"></div>
            <p class="summary-block-title">This Claim</p>
            <div class="summary-row"><span class="k">Value Earned to Date</span><span class="v">${toMoney(valueEarnedToDate)}</span></div>
            <div class="summary-row"><span class="k">Less Previous Claims</span><span class="v">-${toMoney(previousClaimsTotal)}</span></div>

            <div class="summary-divider"></div>
            <div class="summary-row strong"><span class="k">Current Claim</span><span class="v">${toMoney(currentClaimAmount)}</span></div>
          </section>

          <section class="totals-inline">
            <div class="row"><span class="k">Subtotal (excl. GST)</span><span class="v">${toMoney(subtotal)}</span></div>
            <div class="row"><span class="k">GST (${(gstRate * 100).toFixed(0)}%)</span><span class="v">${toMoney(gst)}</span></div>
            <div class="row total-row"><span class="k">Total (incl. GST)</span><span class="v">${toMoney(total)}</span></div>
          </section>
        </div>
      </section>

      <section class="signature">
        <div class="scribble">${escapeHtml(raisedBy || "Signature")}</div>
      </section>

      ${notes.trim() ? `<section class="terms"><p><strong>Claim Notes</strong></p><p>${escapeHtml(notes.trim())}</p></section>` : ""}

      <footer class="doc-footer">
        <span>📞 021 123 456</span>
        <span class="center">✉ admin@tradesstack.com</span>
        <span class="right page">Page </span>
      </footer>
    </main>
  </body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "width=1024,height=768");
    if (!popup) {
      URL.revokeObjectURL(url);
      setError("Unable to export PDF. Please allow pop-ups and try again.");
      return;
    }

    popup.focus();
    popup.onload = () => {
      popup.print();
    };
    popup.onafterprint = () => {
      URL.revokeObjectURL(url);
    };
  };

  if (isLoading) {
    return (
      <div className={`${styles.scope} -mb-8 space-y-6`}>
        <section className={styles.heroBlock}>
          <div>
            <h1 className={styles.heroTitle}>Claim</h1>
            <p className={`${interMedium.className} ${styles.heroSummary}`}>
              Live claim calculation based on contract progress.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Button
              type="button"
              variant="outline"
              disabled
              className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px] opacity-60`}
            >
              Actions
              <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
            <div className="space-y-4">
              <div className="h-10 w-56 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5] md:col-span-2" />
                <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
                <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              </div>
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[#64748B]`}>Loading claim...</p>
            </div>
          </div>
          <Card className={`${styles.card} overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#f6f7f9] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)]`}>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className={`${interMedium.className} ${styles.sectionTitle}`}>Claim Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className={`${interMedium.className} h-8 rounded-[6px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
          >
            <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to Claims Register
            </Link>
          </Button>
          <h1 className={styles.heroTitle}>Claim</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Live claim calculation based on contract progress{projectName ? ` for ${projectName}` : ""}.
          </p>
        </div>
        <div className={styles.heroActions}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}
              >
                Actions
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={8} className={`${styles.menuPanel} !z-[200] min-w-[230px] !bg-[#F3F4F6] p-1.5 opacity-100`}>
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Claims Register
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void createClaim();
                }}
                disabled={isCreatingClaim || !projectDbId || !organizationId}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                <Plus className="mr-2 h-4 w-4" />
                {isCreatingClaim ? "Creating..." : "New Claim"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void saveClaim();
                }}
                disabled={isSaving || !claimId}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Claim"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  exportClaimPdf();
                }}
                disabled={!claimId}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Export PDF
              </DropdownMenuItem>
              {claimId ? (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void deleteClaim();
                    }}
                    disabled={isDeleting}
                    className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#b42318] focus:bg-[#FEF3F2] focus:text-[#b42318]"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}
      {saveMessage ? <p className={`${interMedium.className} text-xs font-medium text-[#5f6f89]`}>{saveMessage}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] [&_input]:bg-[#F8F9FC] [&_select]:bg-[#F8F9FC] [&_textarea]:bg-[#F8F9FC]">
        <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
          <section className="border-b border-[#E8EDF5] pb-5">
            <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Claim Workspace</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="space-y-1.5 md:col-span-4">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim No.</label>
                  <Input value={claimNumber} onChange={(event) => setClaimNumber(event.target.value)} className="h-10 rounded-[6px]" disabled />
                </div>
                <div className="space-y-1.5 md:col-span-8">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim Title</label>
                  <Input value={claimTitle} onChange={(event) => setClaimTitle(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim Type</label>
                  <select value={claimType} onChange={(event) => setClaimType(event.target.value as ClaimType)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] px-3 text-sm text-[#1d2433]`} disabled={isSubmittedLocked}>
                    <option value="Progress">Progress</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Status</label>
                  <select value={status} onChange={(event) => setStatus(event.target.value as ClaimStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] px-3 text-sm text-[#1d2433]`}>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                  <span className={`${interMedium.className} inline-flex rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold ${claimStatusClassName(status)}`}>
                    {status}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>% Complete</label>
                  <Input type="number" value={displayedPercentComplete} className="h-10 rounded-[6px]" disabled />
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Claim Period</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Claim Date</label><Input type="date" value={claimDate} onChange={(event) => setClaimDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Due Date</label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Period Start</label><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
              <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Period End</label><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-10 rounded-[6px]" disabled={isSubmittedLocked} /></div>
            </div>
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <button type="button" onClick={() => setIsLineItemsOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Line Items</h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsLineItemsExpanded(true);
                  }}
                  className={`${interMedium.className} h-8 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-2.5 text-xs font-medium text-[#1d2433]`}
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Expand
                </Button>
                <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isLineItemsOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isLineItemsOpen ? (
              <div className="mt-4 space-y-4">
                {renderLineItemsTable()}
              </div>
            ) : null}
          </section>

          <section className="py-5">
            <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Payment & Notes</h2>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Notes</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${interMedium.className} min-h-[110px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} disabled={isSubmittedLocked} />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className={`${styles.card} overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#f6f7f9] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)]`}>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className={`${interMedium.className} ${styles.sectionTitle}`}>Claim Summary</CardTitle>
            </CardHeader>
            <CardContent className={`${interMedium.className} space-y-4 pb-5 text-sm font-medium text-[#334155]`}>
              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Contract Position</p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Original Contract</span><span>{toMoney(baseQuoteValue)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Approved Variations</span><span>{toMoney(approvedVariationsValue)}</span></p>
                <p className="flex items-center justify-between text-[15px] font-semibold text-[#0F172A]"><span>Revised Contract Value</span><span>{toMoney(revisedContractValue)}</span></p>
              </section>

              <div className="h-px bg-[#E7ECF3]" />

              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Previous Claims</p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Total Previously Claimed</span><span>{toMoney(previousClaimsTotal)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Previous % Complete</span><span>{previousPercentComplete.toFixed(2)}%</span></p>
              </section>

              <div className="h-px bg-[#E7ECF3]" />

              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">This Claim</p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">% Complete (Current)</span><span>{parsedPercentComplete.toFixed(2)}%</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">This Claim %</span><span>{thisClaimPercent.toFixed(2)}%</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Value Earned to Date</span><span>{toMoney(valueEarnedToDate)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Less Previous Claims</span><span>-{toMoney(previousClaimsTotal)}</span></p>
              </section>

              <div className="h-px bg-[#E7ECF3]" />

              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Payment Position</p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Paid to Date</span><span>{toMoney(paidToDateTotal)}</span></p>
                <p className="flex items-center justify-between text-[15px] font-semibold text-[#0F172A]"><span>Outstanding</span><span>{toMoney(balance)}</span></p>
              </section>

              <div className="rounded-[6px] border-2 border-[#C9D6E3] bg-[#F6F7F9] px-4 py-3">
                <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Current Claim</p>
                <p className="mt-[11px] text-[34px] font-semibold leading-none tracking-[-0.02em] text-[#0B2739]">{toMoney(currentClaimAmount)}</p>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={() => void saveClaim()} disabled={isSaving || !claimId} className={`${interMedium.className} h-10 w-full rounded-full bg-[#0B2739] text-sm font-medium text-white hover:bg-[#0B2739]`}>
                  {isSaving ? "Saving..." : "Save Claim"}
                </Button>
                <Button
                  type="button"
                  onClick={exportClaimPdf}
                  disabled={!claimId}
                  variant="outline"
                  className={`${interMedium.className} h-10 w-full rounded-full border-[#d3dbe8] bg-[#F8F9FC] text-sm font-medium text-[#1d2433]`}
                >
                  Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isLineItemsExpanded ? (
        <div className="fixed inset-0 z-[240] bg-[#0B1626]/55 p-4 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col rounded-[18px] border border-[#d9dee5] bg-[#F6F7F9] shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <div className="flex items-center justify-between border-b border-[#E8EDF5] px-5 py-4">
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Line Items</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLineItemsExpanded(false)}
                className={`${interMedium.className} h-8 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-2.5 text-xs font-medium text-[#1d2433]`}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Close
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E8EDF5] px-5 py-3">
              <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#D8E0EB] bg-[#F8FAFC] px-3 py-1.5">
                <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Quote Total</span>
                <span className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(quoteLineTotalValue)}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#D8E0EB] bg-[#F8FAFC] px-3 py-1.5">
                <span className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Variation Total</span>
                <span className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(variationLineTotalValue)}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {renderLineItemsTable("h-full")}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
