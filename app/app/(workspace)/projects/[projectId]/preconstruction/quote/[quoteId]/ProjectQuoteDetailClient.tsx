"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ProjectQuoteReadView } from "@/components/app/ProjectQuoteReadView";
import { QuoteSupplierPricingDrawer } from "@/components/app/QuoteSupplierPricingDrawer";
import { ScopeImportDrawer } from "@/components/app/ScopeImportDrawer";
import { Button } from "@/components/ui/button";
import type { CommercialItemPayload } from "@/lib/commercial-items/types";
import {
  buildCommercialItemSourceHref,
  buildQuoteCommercialItemPickerItem,
  buildQuoteLineDraftFromCommercialItem,
  enrichQuoteLineItemsWithCommercialItems,
  persistCommercialItemQuoteLinksSafely,
} from "@/lib/commercial-items/quote-linking";
import { listCommercialItemsForOpportunity } from "@/lib/commercial-items/service";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ProjectQuoteDetailInitialData } from "@/lib/project-quote-detail-server";
import { prefetchProjectQuoteHref } from "@/lib/project-quote-prefetch";
import {
  type PersistedProjectQuotePdfLineRow,
  type PersistedProjectQuotePdfRow,
} from "@/lib/project-quote-pdf-snapshot";
import { nextProjectQuoteRevisionNumber } from "@/lib/project-quote-revision-numbering";
import { buildQuoteLineFromSupplierPrice } from "@/lib/materials/quote-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import {
  LINE_ITEM_SECTIONS,
  isQuoteImmutable,
  type LineItem,
  type LineItemSection,
  type PricingSummary,
  type QuoteStatus,
  type ScopeCostCategoryItem,
  lineItemTotal,
  makeDefaultLineItem,
  numberOrZero,
} from "@/lib/quote-editor-core";
type RpcResultRow = Record<string, unknown>;
type QuoteDrawerType = "scope" | "materials" | null;

const QuoteEditorLayout = dynamic(
  () => import("@/components/app/QuoteEditorShared").then((module) => module.QuoteEditorLayout),
  { loading: () => <div className="py-10 text-sm text-[var(--text-secondary)]">Loading quote editor…</div> },
);

const commercialEnrichmentInFlight = new Map<string, Promise<LineItem[]>>();
const opportunitySlugInFlight = new Map<string, Promise<string | null>>();
const successorResolutionInFlight = new Map<string, Promise<string | null>>();

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

function reuseInFlight<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = load();
  cache.set(key, promise);
  const clear = () => {
    if (cache.get(key) === promise) cache.delete(key);
  };
  void promise.then(clear, clear);
  return promise;
}

async function resolveMeaningfulSuccessor(params: {
  supabase: BrowserSupabaseClient;
  organizationId: string;
  projectId: string;
  quoteId: string;
}) {
  const { data: projectQuotes, error } = await params.supabase
    .from("project_quotes")
    .select("id, status, revision_kind, revision_number, predecessor_quote_id")
    .eq("organization_id", params.organizationId)
    .eq("project_id", params.projectId)
    .order("revision_number", { ascending: false });
  if (error) throw new Error(error.message);

  const quoteById = new Map((projectQuotes ?? []).map((candidate) => [candidate.id, candidate]));
  const isDescendant = (candidate: { predecessor_quote_id: string | null }) => {
    let predecessorId = candidate.predecessor_quote_id;
    const visited = new Set<string>();
    while (predecessorId && !visited.has(predecessorId)) {
      if (predecessorId === params.quoteId) return true;
      visited.add(predecessorId);
      predecessorId = quoteById.get(predecessorId)?.predecessor_quote_id ?? null;
    }
    return false;
  };
  const successors = (projectQuotes ?? []).filter((candidate) =>
    candidate.status === "Draft"
    && candidate.revision_kind === "project_working"
    && isDescendant(candidate),
  );
  if (successors.length === 0) return null;

  const classifications = await Promise.all(successors.map(async (successor) => {
    const { data, error: classificationError } = await params.supabase.rpc(
      "classify_legacy_automatic_project_quote_draft_v1" as never,
      { p_organization_id: params.organizationId, p_quote_id: successor.id } as never,
    );
    if (classificationError) throw new Error(classificationError.message);
    const row = (Array.isArray(data) ? data[0] : null) as { is_legacy_automatic_draft?: boolean } | null;
    return { id: successor.id, isLegacy: row?.is_legacy_automatic_draft === true };
  }));
  return classifications.find((classification) => !classification.isLegacy)?.id ?? null;
}

function initialLineItems(initialData: ProjectQuoteDetailInitialData): LineItem[] {
  const lines = initialData.lines.map((line) => ({
    id: line.id,
    section: line.section as LineItemSection,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    isOptional: line.isOptional,
    sourceOpportunityQuoteId: line.sourceOpportunityQuoteId,
    sourceOpportunityQuoteLineItemId: line.sourceOpportunityQuoteLineItemId,
    sourceOpportunityQuoteNumber: line.sourceOpportunityQuoteNumber,
  }));
  return lines.length > 0 ? lines : [makeDefaultLineItem()];
}

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toScopeCostCategoryItems(params: {
  runs: Array<{ id: string; trade_pack_id: string; result_json: Record<string, unknown>; created_at: string }>;
  tradeLabelByTradePackId: Map<string, string>;
}): ScopeCostCategoryItem[] {
  const collected: ScopeCostCategoryItem[] = [];
  const seen = new Set<string>();

  for (const run of params.runs) {
    const resultJson = run.result_json;
    const pricingStructure = typeof resultJson?.pricingStructure === "object" && resultJson.pricingStructure !== null
      ? (resultJson.pricingStructure as Record<string, unknown>)
      : null;
    const categories = Array.isArray(pricingStructure?.costBreakdownCategories)
      ? (pricingStructure?.costBreakdownCategories as unknown[])
      : [];

    for (let index = 0; index < categories.length; index += 1) {
      const entry = categories[index];
      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const description = typeof record.description === "string" ? record.description.trim() : "";
      if (!title) {
        continue;
      }

      const dedupeKey = `${normalizeForMatch(title)}|${normalizeForMatch(description)}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      collected.push({
        id: `${run.id}:${index}`,
        title,
        description,
        tradeLabel: params.tradeLabelByTradePackId.get(run.trade_pack_id) ?? "Scope Builder",
        generatedAt: run.created_at,
      });
    }
  }

  return collected;
}

function deriveProjectCodeFromSlug(slug: string | null | undefined) {
  const normalized = (slug ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
  return normalized || "PRJ";
}

export default function ProjectQuoteDetailClient({
  initialData,
}: {
  initialData: ProjectQuoteDetailInitialData;
}) {
  const params = useParams<{ projectId: string; quoteId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeQuoteId = params?.quoteId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeMode = searchParams.get("mode");
  const canManageQuote = initialData.canManageQuote;

  const [quoteId, setQuoteId] = useState<string | null>(initialData.quote.id);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<string | null>(initialData.quote.updatedAt);
  const [organizationId] = useState(initialData.organizationId);
  const [dbProjectId] = useState(initialData.projectId);
  const [projectCode] = useState(initialData.projectCode);
  const [quoteSourceOpportunityId] = useState<string | null>(initialData.sourceOpportunityId);
  const [quoteSourceOpportunitySlug, setQuoteSourceOpportunitySlug] = useState<string | null>(null);
  const isLoadingQuote = false;
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(initialData.kind === "new");
  const [awardLockedAt] = useState<string | null>(initialData.quote.awardLockedAt);
  const [currentWorkingQuoteId, setCurrentWorkingQuoteId] = useState<string | null>(null);
  const [isSuccessorResolved, setIsSuccessorResolved] = useState(initialData.kind === "new" || initialData.quote.status === "Draft");
  const [isCommercialMetadataPending, setIsCommercialMetadataPending] = useState(initialData.kind === "existing" && initialData.lines.length > 0);
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>(initialData.quote.status);
  const [quoteTitle, setQuoteTitle] = useState(initialData.quote.title);
  const [quoteNumber, setQuoteNumber] = useState(initialData.quote.number);
  const [clientName] = useState(initialData.quote.clientName);
  const [companyName] = useState(initialData.quote.companyName);
  const [contactPerson] = useState(initialData.quote.contactPerson);
  const [email] = useState(initialData.quote.email);
  const [phone] = useState(initialData.quote.phone);
  const [siteAddress] = useState(initialData.quote.siteAddress);
  const [projectName, setProjectName] = useState(initialData.quote.projectName);
  const [quoteDate, setQuoteDate] = useState(initialData.quote.quoteDate);
  const [expiryDate, setExpiryDate] = useState(initialData.quote.expiryDate);

  const [lineItems, setLineItems] = useState<LineItem[]>(() => initialLineItems(initialData));

  const [optionalItemsNotes] = useState(initialData.quote.optionalItemsNotes);
  const [scopeExclusions, setScopeExclusions] = useState(initialData.quote.scopeExclusions);
  const [assumptions, setAssumptions] = useState(initialData.quote.assumptions);
  const [scopeNotes, setScopeNotes] = useState(initialData.quote.scopeNotes);

  const [marginPercent, setMarginPercent] = useState(String(initialData.quote.marginPercent));
  const [discountAmount, setDiscountAmount] = useState(String(initialData.quote.discountAmount));
  const [contingencyAmount, setContingencyAmount] = useState(String(initialData.quote.contingencyAmount));
  const [gstPercent, setGstPercent] = useState(String(initialData.quote.gstPercent));
  const [includeMarginInExport, setIncludeMarginInExport] = useState(false);
  const [includeDiscountInExport, setIncludeDiscountInExport] = useState(false);
  const [includeContingencyInExport, setIncludeContingencyInExport] = useState(false);

  const [validityPeriod, setValidityPeriod] = useState(initialData.quote.validityPeriod);
  const [paymentTerms, setPaymentTerms] = useState(initialData.quote.paymentTerms);
  const [leadTime, setLeadTime] = useState(initialData.quote.leadTime);
  const [termsInclusions, setTermsInclusions] = useState(initialData.quote.termsInclusions);
  const [termsExclusions, setTermsExclusions] = useState(initialData.quote.termsExclusions);
  const [clarifications, setClarifications] = useState(initialData.quote.clarifications);
  const [acceptanceNotes] = useState(initialData.quote.acceptanceNotes);
  const [isQuoteDetailsOpen, setIsQuoteDetailsOpen] = useState(true);
  const [isLineItemsOpen, setIsLineItemsOpen] = useState(true);
  const [activeQuoteDrawer, setActiveQuoteDrawer] = useState<QuoteDrawerType>(null);
  const [isCommercialItemsOpen, setIsCommercialItemsOpen] = useState(false);
  const [isLoadingScopeItems, setIsLoadingScopeItems] = useState(false);
  const [isLoadingCommercialItems, setIsLoadingCommercialItems] = useState(false);
  const [hasLoadedScopeItems, setHasLoadedScopeItems] = useState(false);
  const [hasLoadedCommercialItems, setHasLoadedCommercialItems] = useState(false);
  const [scopeCostItems, setScopeCostItems] = useState<ScopeCostCategoryItem[]>([]);
  const [commercialItems, setCommercialItems] = useState<CommercialItemPayload[]>([]);
  const [selectedScopeCostItemIds, setSelectedScopeCostItemIds] = useState<string[]>([]);
  const [selectedCommercialItemIds, setSelectedCommercialItemIds] = useState<string[]>([]);
  const [isTermsOpen, setIsTermsOpen] = useState(true);
  const opportunitySlugRequestIdRef = useRef(0);
  const commercialEnrichmentRequestIdRef = useRef(0);
  const prefetchedQuoteHrefsRef = useRef(new Set<string>());
  const scopeImportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const materialsTriggerRef = useRef<HTMLButtonElement | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);
  const isAwardLocked = Boolean(awardLockedAt);
  const isImmutableQuoteRevision = isQuoteImmutable({ quoteId, status: quoteStatus, awardLockedAt });
  const effectiveCanManageQuote = canManageQuote && !isImmutableQuoteRevision;
  const shouldShowEditor = !isImmutableQuoteRevision && (routeMode === "edit" || isEditing || !quoteId);
  const canUseMaterials = initialData.canViewMaterials && initialData.canWriteQuote && effectiveCanManageQuote && shouldShowEditor;
  const isHydratingExistingQuote = false;

  const mainLineItems = useMemo(() => lineItems.filter((item) => !item.isOptional), [lineItems]);
  const optionalLineItems = useMemo(() => lineItems.filter((item) => item.isOptional), [lineItems]);
  const availableScopeCostItems = useMemo(() => {
    const existingDescriptions = new Set(lineItems.map((item) => normalizeForMatch(item.description)));
    return scopeCostItems.filter((item) => {
      const combinedDescription = item.description ? `${item.title} — ${item.description}` : item.title;
      return !existingDescriptions.has(normalizeForMatch(combinedDescription));
    });
  }, [lineItems, scopeCostItems]);

  const sectionSubtotals = useMemo(() => {
    const subtotals = new Map<LineItemSection, number>(LINE_ITEM_SECTIONS.map((section) => [section, 0]));

    for (const item of lineItems) {
      const current = subtotals.get(item.section) ?? 0;
      subtotals.set(item.section, current + lineItemTotal(item));
    }

    return subtotals;
  }, [lineItems]);

  const pricingSummary = useMemo(() => {
    const baseSubtotal = lineItems.filter((item) => !item.isOptional).reduce((acc, item) => acc + lineItemTotal(item), 0);
    const optionalSubtotal = lineItems.filter((item) => item.isOptional).reduce((acc, item) => acc + lineItemTotal(item), 0);
    const margin = baseSubtotal * (numberOrZero(marginPercent) / 100);
    const contingency = numberOrZero(contingencyAmount);
    const discount = numberOrZero(discountAmount);
    const preGstTotal = Math.max(0, baseSubtotal + margin + contingency - discount);
    const gst = preGstTotal * (numberOrZero(gstPercent) / 100);
    const grandTotal = preGstTotal + gst;

    return {
      baseSubtotal,
      optionalSubtotal,
      margin,
      contingency,
      discount,
      gst,
      grandTotal,
    };
  }, [contingencyAmount, discountAmount, gstPercent, lineItems, marginPercent]);
  const showMarginBreakout = includeMarginInExport === true;

  const resolveNextQuoteNumber = useCallback(async (orgId: string, projectCodeValue: string): Promise<string> => {
    if (!supabase) {
      return `Q-${projectCodeValue}-1`;
    }

    const prefix = `Q-${projectCodeValue}-`;
    const { data, error } = await supabase
      .from("project_quotes")
      .select("quote_number")
      .eq("organization_id", orgId)
      .like("quote_number", `${prefix}%`);

    if (error) {
      return `${prefix}1`;
    }

    let maxSuffix = 0;
    const matcher = new RegExp(`^${prefix}(\\d+)$`);
    for (const row of data ?? []) {
      const match = matcher.exec(row.quote_number);
      if (!match) {
        continue;
      }
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > maxSuffix) {
        maxSuffix = parsed;
      }
    }

    return `${prefix}${maxSuffix + 1}`;
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !organizationId || !quoteSourceOpportunityId) return;
    const requestId = ++opportunitySlugRequestIdRef.current;
    const key = `${organizationId}:${quoteSourceOpportunityId}`;
    const promise = reuseInFlight(opportunitySlugInFlight, key, async () => {
      const { data } = await supabase
        .from("organization_opportunities")
        .select("slug")
        .eq("organization_id", organizationId)
        .eq("id", quoteSourceOpportunityId)
        .maybeSingle();
      return data?.slug ?? null;
    });
    void promise.then((slug) => {
      if (opportunitySlugRequestIdRef.current === requestId) setQuoteSourceOpportunitySlug(slug);
    });
    return () => {
      if (opportunitySlugRequestIdRef.current === requestId) opportunitySlugRequestIdRef.current += 1;
    };
  }, [organizationId, quoteSourceOpportunityId, supabase]);

  useEffect(() => {
    if (!supabase || !organizationId || !quoteId || initialData.lines.length === 0) {
      setIsCommercialMetadataPending(false);
      return;
    }
    const requestId = ++commercialEnrichmentRequestIdRef.current;
    const key = `${organizationId}:${quoteId}:${initialData.quote.updatedAt ?? "unsaved"}`;
    const rawLines = initialData.lines.map((line) => ({
      id: line.id,
      section: line.section as LineItemSection,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      isOptional: line.isOptional,
      sourceOpportunityQuoteId: line.sourceOpportunityQuoteId,
      sourceOpportunityQuoteLineItemId: line.sourceOpportunityQuoteLineItemId,
      sourceOpportunityQuoteNumber: line.sourceOpportunityQuoteNumber,
    }));
    const promise = reuseInFlight(commercialEnrichmentInFlight, key, () =>
      enrichQuoteLineItemsWithCommercialItems({
        client: supabase,
        organizationId,
        quoteId,
        lineItems: rawLines,
        onWarning: () => undefined,
      }),
    );
    void promise.then((enrichedLines) => {
      if (commercialEnrichmentRequestIdRef.current !== requestId) return;
      const metadataByLineId = new Map(enrichedLines.map((line) => [line.id, line.commercialItemLink ?? null]));
      setLineItems((current) => current.map((line) =>
        metadataByLineId.has(line.id)
          ? { ...line, commercialItemLink: metadataByLineId.get(line.id) ?? null }
          : line,
      ));
      setIsCommercialMetadataPending(false);
    });
    return () => {
      if (commercialEnrichmentRequestIdRef.current === requestId) commercialEnrichmentRequestIdRef.current += 1;
    };
  }, [initialData.lines, initialData.quote.updatedAt, organizationId, quoteId, supabase]);

  useEffect(() => {
    if (!supabase || !organizationId || !dbProjectId || !quoteId || !isImmutableQuoteRevision) {
      setCurrentWorkingQuoteId(null);
      setIsSuccessorResolved(true);
      return;
    }

    let cancelled = false;
    setIsSuccessorResolved(false);
    const key = `${organizationId}:${dbProjectId}:${quoteId}`;
    const promise = reuseInFlight(successorResolutionInFlight, key, () => resolveMeaningfulSuccessor({
      supabase,
      organizationId,
      projectId: dbProjectId,
      quoteId,
    }));
    void promise.then((successorId) => {
      if (cancelled) return;
      setCurrentWorkingQuoteId(successorId);
      setIsSuccessorResolved(true);
    }).catch((successorError) => {
      if (cancelled) return;
      setIsSuccessorResolved(true);
      setError(successorError instanceof Error ? successorError.message : "Unable to resolve the working quote revision.");
    });

    return () => {
      cancelled = true;
    };
  }, [dbProjectId, isImmutableQuoteRevision, organizationId, quoteId, supabase]);

  useEffect(() => {
    setHasLoadedScopeItems(false);
    setScopeCostItems([]);
    setSelectedScopeCostItemIds([]);
    setIsLoadingScopeItems(false);
  }, [dbProjectId, organizationId]);

  useEffect(() => {
    setHasLoadedCommercialItems(false);
    setCommercialItems([]);
    setSelectedCommercialItemIds([]);
    setIsLoadingCommercialItems(false);
  }, [dbProjectId, organizationId, quoteSourceOpportunityId]);

  useEffect(() => {
    if (activeQuoteDrawer !== "scope" || hasLoadedScopeItems || !supabase || !organizationId || !dbProjectId) {
      return;
    }

    let cancelled = false;

    const loadScopeItems = async () => {
      setIsLoadingScopeItems(true);

      try {
        const [scopeRunsResult, tradePacksResult] = await Promise.all([
          supabase
            .from("scope_runs")
            .select("id, trade_pack_id, result_json, created_at")
            .eq("organization_id", organizationId)
            .eq("project_id", dbProjectId)
            .eq("status", "complete")
            .order("created_at", { ascending: false })
            .limit(120),
          supabase
            .from("trade_packs")
            .select("id, trade_label")
            .eq("organization_id", organizationId)
            .eq("project_id", dbProjectId),
        ]);

        if (cancelled) {
          return;
        }

        if (!scopeRunsResult.error) {
          const tradeLabelByTradePackId = new Map((tradePacksResult.data ?? []).map((row) => [row.id, row.trade_label]));
          const normalizedItems = toScopeCostCategoryItems({
            runs: (scopeRunsResult.data ?? []) as Array<{
              id: string;
              trade_pack_id: string;
              result_json: Record<string, unknown>;
              created_at: string;
            }>,
            tradeLabelByTradePackId,
          });
          setScopeCostItems(normalizedItems);
        } else {
          setScopeCostItems([]);
        }

        setHasLoadedScopeItems(true);
      } finally {
        if (!cancelled) {
          setIsLoadingScopeItems(false);
        }
      }
    };

    void loadScopeItems();

    return () => {
      cancelled = true;
    };
  }, [activeQuoteDrawer, dbProjectId, hasLoadedScopeItems, organizationId, supabase]);

  useEffect(() => {
    if (!isCommercialItemsOpen || hasLoadedCommercialItems || !supabase || !organizationId || !quoteSourceOpportunityId) {
      return;
    }

    let cancelled = false;

    const loadCommercialItems = async () => {
      setIsLoadingCommercialItems(true);

      try {
        const rows = await listCommercialItemsForOpportunity(supabase, {
          organizationId,
          opportunityId: quoteSourceOpportunityId,
        });

        if (cancelled) {
          return;
        }

        setCommercialItems(
          rows
            .filter((item) => item.projectId === dbProjectId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        );
        setHasLoadedCommercialItems(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load worksheet sources.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCommercialItems(false);
        }
      }
    };

    void loadCommercialItems();
    return () => {
      cancelled = true;
    };
  }, [dbProjectId, hasLoadedCommercialItems, isCommercialItemsOpen, organizationId, quoteSourceOpportunityId, supabase]);

  const addLineItem = (isOptional = false) => {
    setLineItems((current) => [...current, makeDefaultLineItem(isOptional)]);
  };

  const closeScopeImport = useCallback(() => {
    setActiveQuoteDrawer(null);
    window.requestAnimationFrame(() => scopeImportTriggerRef.current?.focus());
  }, []);

  const openScopeImport = useCallback(() => {
    setIsCommercialItemsOpen(false);
    setActiveQuoteDrawer("scope");
  }, []);

  const closeMaterials = useCallback(() => {
    setActiveQuoteDrawer(null);
    window.requestAnimationFrame(() => materialsTriggerRef.current?.focus());
  }, []);

  const openMaterials = useCallback(() => {
    if (!canUseMaterials) return;
    setIsCommercialItemsOpen(false);
    setActiveQuoteDrawer("materials");
  }, [canUseMaterials]);

  const addSupplierMaterial = useCallback((item: PricingWorksheetMaterialPickerItem) => {
    if (!canUseMaterials) {
      setError("This Quote revision cannot be edited.");
      return;
    }
    try {
      setLineItems((current) => [...current, buildQuoteLineFromSupplierPrice(item)]);
      setError(null);
      setSaveMessage("Material added to the Quote. Save Quote to persist this line.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "This supplier price cannot be added to the Quote.");
    }
  }, [canUseMaterials]);

  const createProjectQuoteRevision = useCallback(async () => {
    if (!supabase || !organizationId || !dbProjectId || !quoteId || !routeProjectSlug) {
      setError("Unable to create a quote revision right now.");
      return;
    }
    if (!canManageQuote) {
      setError("You do not have permission to create quote revisions.");
      return;
    }

    setIsCreatingRevision(true);
    setError(null);
    try {
      const nextNumber = nextProjectQuoteRevisionNumber(quoteNumber);
      const { data, error: revisionError } = await supabase.rpc("create_project_quote_revision_v1" as never, {
        p_organization_id: organizationId,
        p_project_id: dbProjectId,
        p_predecessor_quote_id: quoteId,
        p_quote_number: nextNumber,
      } as never);
      if (revisionError) throw new Error(revisionError.message);
      const row = (Array.isArray(data) ? data[0] : null) as RpcResultRow | null;
      const nextQuoteId = typeof row?.quote_id === "string" ? row.quote_id : null;
      if (!nextQuoteId) throw new Error("Revision creation returned no quote identifier.");
      router.push(`/app/projects/${routeProjectSlug}/preconstruction/quote/${nextQuoteId}/pricing-worksheet`);
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "Unable to create the quote revision.");
    } finally {
      setIsCreatingRevision(false);
    }
  }, [canManageQuote, dbProjectId, organizationId, quoteId, quoteNumber, routeProjectSlug, router, supabase]);

  const availableCommercialItems = useMemo(() => {
    const linkedCommercialItemIds = new Set(
      lineItems
        .map((item) => item.commercialItemLink?.commercialItemId ?? null)
        .filter((value): value is string => Boolean(value)),
    );

    return commercialItems
      .filter((item) => !linkedCommercialItemIds.has(item.id))
      .map(buildQuoteCommercialItemPickerItem);
  }, [commercialItems, lineItems]);

  const toggleScopeCostItem = (itemId: string) => {
    setSelectedScopeCostItemIds((current) =>
      current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId]
    );
  };

  const toggleCommercialItem = (itemId: string) => {
    setSelectedCommercialItemIds((current) =>
      current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId],
    );
  };

  const importSelectedScopeItems = () => {
    if (selectedScopeCostItemIds.length === 0) {
      return;
    }

    const selectedItems = availableScopeCostItems.filter((item) => selectedScopeCostItemIds.includes(item.id));
    if (selectedItems.length === 0) {
      return;
    }

    setLineItems((current) => {
      const existingDescriptions = new Set(current.map((item) => normalizeForMatch(item.description)));
      const importedItems: LineItem[] = [];

      for (const item of selectedItems) {
        const combinedDescription = item.description ? `${item.title} — ${item.description}` : item.title;
        const normalizedDescription = normalizeForMatch(combinedDescription);
        if (existingDescriptions.has(normalizedDescription)) {
          continue;
        }

        existingDescriptions.add(normalizedDescription);
        importedItems.push({
          id: crypto.randomUUID(),
          section: "Item",
          description: combinedDescription,
          quantity: 1,
          unit: "Item",
          rate: 0,
          isOptional: false,
        });
      }

      return importedItems.length > 0 ? [...importedItems, ...current] : current;
    });

    setSaveMessage(`${selectedItems.length} Scope Builder item${selectedItems.length === 1 ? "" : "s"} added to line items.`);
    setSelectedScopeCostItemIds([]);
    closeScopeImport();
  };

  const importSelectedCommercialItems = () => {
    if (selectedCommercialItemIds.length === 0) {
      return;
    }

    const selectedItems = availableCommercialItems.filter((item) => selectedCommercialItemIds.includes(item.id));
    if (selectedItems.length === 0) {
      return;
    }

    setLineItems((current) => {
      const commercialItemById = new Map(commercialItems.map((item) => [item.id, item]));
      const importedItems = selectedItems.flatMap((item) => {
        const fullItem = commercialItemById.get(item.id);
        return fullItem ? [buildQuoteLineDraftFromCommercialItem(fullItem)] : [];
      });

      return importedItems.length > 0 ? [...importedItems, ...current] : current;
    });

    setSaveMessage(`${selectedItems.length} worksheet source${selectedItems.length === 1 ? "" : "s"} added to line items.`);
    setSelectedCommercialItemIds([]);
    setIsCommercialItemsOpen(false);
  };

  const updateLineItem = <K extends keyof LineItem>(id: string, key: K, value: LineItem[K]) => {
    setLineItems((current) => current.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const removeLineItem = (id: string) => {
    setLineItems((current) => current.filter((item) => item.id !== id));
  };

  const saveQuote = async () => {
    if (!supabase || !organizationId || !dbProjectId || !routeProjectSlug) {
      setError("Quote save is not ready. Please refresh and try again.");
      return;
    }

    if (!canManageQuote) {
      setError("You do not have permission to edit quotes.");
      return;
    }

    const trimmedTitle = quoteTitle.trim();
    let trimmedNumber = quoteNumber.trim();
    const resolvedProjectCode = projectCode ?? deriveProjectCodeFromSlug(routeProjectSlug);
    if (!trimmedNumber) {
      trimmedNumber = await resolveNextQuoteNumber(organizationId, resolvedProjectCode);
      setQuoteNumber(trimmedNumber);
    }
    if (!trimmedTitle || !trimmedNumber) {
      setError("Quote title and quote number are required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const lineItemsPayload = lineItems.map((item) => ({
        id: item.id,
        section: item.section,
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unit: item.unit.trim(),
        rate: Number(item.rate),
        isOptional: item.isOptional,
        sourceOpportunityQuoteId: item.sourceOpportunityQuoteId ?? null,
        sourceOpportunityQuoteLineItemId: item.sourceOpportunityQuoteLineItemId ?? null,
        sourceOpportunityQuoteNumber: item.sourceOpportunityQuoteNumber ?? null,
      }));

      const { data: saveRows, error: saveError } = await supabase.rpc("save_project_quote_draft" as never, {
        p_organization_id: organizationId,
        p_project_id: dbProjectId,
        p_quote_id: quoteId,
        p_expected_updated_at: quoteId ? quoteUpdatedAt : null,
        p_quote_title: trimmedTitle,
        p_quote_number: trimmedNumber,
        p_client_name: clientName.trim(),
        p_company_name: companyName.trim(),
        p_contact_person: contactPerson.trim(),
        p_client_email: email.trim(),
        p_client_phone: phone.trim(),
        p_site_address: siteAddress.trim(),
        p_project_name: projectName.trim(),
        p_quote_date: quoteDate || null,
        p_expiry_date: expiryDate || null,
        p_status: quoteStatus,
        p_optional_items_notes: optionalItemsNotes,
        p_scope_exclusions: scopeExclusions.trim(),
        p_assumptions: assumptions.trim(),
        p_scope_notes: scopeNotes.trim() || clarifications.trim(),
        p_margin_percent: Number(numberOrZero(marginPercent).toFixed(3)),
        p_discount_amount: Number(numberOrZero(discountAmount).toFixed(2)),
        p_contingency_amount: Number(numberOrZero(contingencyAmount).toFixed(2)),
        p_gst_percent: Number(numberOrZero(gstPercent).toFixed(3)),
        p_validity_period: validityPeriod,
        p_payment_terms: paymentTerms,
        p_retention_percent_default: 0,
        p_lead_time: leadTime,
        p_terms_inclusions: termsInclusions,
        p_terms_exclusions: termsExclusions.trim() || scopeExclusions.trim(),
        p_clarifications: clarifications.trim() || scopeNotes.trim(),
        p_acceptance_notes: acceptanceNotes,
        p_line_items: lineItemsPayload,
      } as never);

      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = (Array.isArray(saveRows) ? saveRows[0] : null) as RpcResultRow | null;
      const savedQuoteId = typeof savedRow?.id === "string" ? savedRow.id : null;
      if (!savedQuoteId) {
        throw new Error("Quote was saved but no identifier was returned.");
      }
      const nextUpdatedAt = typeof savedRow?.updated_at === "string" ? savedRow.updated_at : null;
      if (!nextUpdatedAt) {
        throw new Error("Quote was saved but no updated timestamp was returned.");
      }

      setQuoteId(savedQuoteId);
      setQuoteUpdatedAt(nextUpdatedAt);

      const linkResult = await persistCommercialItemQuoteLinksSafely({
        client: supabase,
        organizationId,
        quoteId: savedQuoteId,
        quoteSourceOpportunityId,
        lineItems,
      });

      if (linkResult.ok) {
        const { data: publicationRows, error: publicationError } = await supabase.rpc("validate_and_record_quote_publication_v1" as never, {
          p_organization_id: organizationId,
          p_quote_id: savedQuoteId,
        } as never);
        if (publicationError) {
          throw new Error(`Quote totals could not be validated for publication: ${publicationError.message}`);
        }
        const publicationRow = (Array.isArray(publicationRows) ? publicationRows[0] : null) as RpcResultRow | null;
        if (typeof publicationRow?.quote_updated_at === "string") {
          setQuoteUpdatedAt(publicationRow.quote_updated_at);
        }
      }


      if (!linkResult.ok && linkResult.errorMessage) {
        setSaveMessage(
          quoteStatus === "Expired"
            ? `Quote marked as expired. Worksheet source linking failed: ${linkResult.errorMessage}`
            : `Quote saved, but worksheet source linking failed: ${linkResult.errorMessage}`,
        );
      } else if (quoteStatus === "Expired") {
        setSaveMessage("Quote marked as expired. Reprice required.");
      } else {
        setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
      }
      setIsEditing(false);
      for (const key of commercialEnrichmentInFlight.keys()) {
        if (key.startsWith(`${organizationId}:${savedQuoteId}:`)) commercialEnrichmentInFlight.delete(key);
      }
      const directQuoteHref = `/app/projects/${routeProjectSlug}/preconstruction/quote/${savedQuoteId}`;
      if (routeQuoteId !== savedQuoteId) {
        router.replace(directQuoteHref);
      } else {
        router.refresh();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save quote.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteQuote = useCallback(async () => {
    if (!quoteId || !supabase || !organizationId) {
      setError("Quote delete is not ready. Please refresh and try again.");
      return;
    }

    if (!canManageQuote) {
      setError("You do not have permission to delete quotes.");
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete quote ${quoteNumber.trim() || quoteId}? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSaveMessage(null);

    try {
      const { error: deleteItemsError } = await supabase
        .from("project_quote_line_items")
        .delete()
        .eq("organization_id", organizationId)
        .eq("quote_id", quoteId);
      if (deleteItemsError) {
        throw new Error(deleteItemsError.message);
      }

      const { error: deleteQuoteError } = await supabase
        .from("project_quotes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", quoteId);
      if (deleteQuoteError) {
        throw new Error(deleteQuoteError.message);
      }

      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/quote`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete quote.");
    } finally {
      setIsDeleting(false);
    }
  }, [canManageQuote, organizationId, quoteId, quoteNumber, routeProjectSlug, router, supabase]);

  const getCommercialItemSourceHref = useCallback((item: LineItem) => {
    return buildCommercialItemSourceHref(item, quoteSourceOpportunitySlug);
  }, [quoteSourceOpportunitySlug]);

  const exportQuotePdf = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    if (!supabase || !organizationId) {
      setError("Unable to load quote export settings.");
      return;
    }
    const [{ buildQuotePdfHtml }, { buildPersistedProjectQuotePdfSnapshot }, { data: branding }] = await Promise.all([
      import("@/lib/quote-pdf-html"),
      import("@/lib/project-quote-pdf-snapshot"),
      supabase
        .from("organizations")
        .select("name, logo_path, brand_primary_color")
        .eq("id", organizationId)
        .maybeSingle(),
    ]);
    const organizationLogoUrl = branding?.logo_path
      ? supabase.storage.from("organization-logos").getPublicUrl(branding.logo_path).data.publicUrl
      : null;
    const organizationName = branding?.name ?? "";
    const organizationBrandPrimaryColor = (branding?.brand_primary_color ?? "").trim();
    let pdfSnapshot = {
      lineItems,
      pricingSummary: pricingSummary as PricingSummary,
      quoteDate,
      quoteNumber,
      projectName,
      companyName,
      clientName,
      siteAddress,
      contactPerson,
      email,
      phone,
      expiryDate,
      gstPercent,
      termsInclusions,
      termsExclusions,
      clarifications,
      assumptions,
    };

    const requiresPersistedAuthority = Boolean(
      quoteId && (isAwardLocked || quoteStatus === "Sent" || quoteStatus === "Accepted" || quoteStatus === "Rejected" || quoteStatus === "Expired"),
    );
    if (requiresPersistedAuthority) {
      if (!quoteId) {
        setError("Unable to load the persisted quote revision for export.");
        return;
      }
      const [{ data: persistedQuote, error: persistedQuoteError }, { data: persistedLines, error: persistedLinesError }] = await Promise.all([
        supabase
          .from("project_quotes")
          .select("assumptions, clarifications, client_email, client_name, client_phone, company_name, contact_person, contingency_amount, discount_amount, expiry_date, gst_amount, gst_percent, margin_amount, optional_subtotal, project_name, quote_date, quote_number, site_address, subtotal, terms_exclusions, terms_inclusions, total_quote_price")
          .eq("organization_id", organizationId)
          .eq("id", quoteId)
          .single(),
        supabase
          .from("project_quote_line_items")
          .select("id, section, description, quantity, unit, rate, is_optional")
          .eq("organization_id", organizationId)
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true }),
      ]);
      if (persistedQuoteError || persistedLinesError || !persistedQuote) {
        setError(persistedQuoteError?.message ?? persistedLinesError?.message ?? "Persisted quote revision was not found.");
        return;
      }
      pdfSnapshot = buildPersistedProjectQuotePdfSnapshot(
        persistedQuote as PersistedProjectQuotePdfRow,
        (persistedLines ?? []) as PersistedProjectQuotePdfLineRow[],
      );
    }

    const html = buildQuotePdfHtml({
      ...pdfSnapshot,
      showMarginBreakout,
      includeDiscountInExport,
      includeContingencyInExport,
      organizationName,
      organizationLogoUrl,
      organizationBrandPrimaryColor,
    });

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
  }, [
    assumptions,
    clarifications,
    clientName,
    companyName,
    email,
    expiryDate,
    includeContingencyInExport,
    includeDiscountInExport,
    isAwardLocked,
    showMarginBreakout,
    gstPercent,
    lineItems,
    organizationId,
    contactPerson,
    phone,
    pricingSummary,
    projectName,
    quoteDate,
    quoteNumber,
    quoteId,
    quoteStatus,
    supabase,
    termsExclusions,
    termsInclusions,
    siteAddress,
  ]);

  const currentWorkingQuoteHref = currentWorkingQuoteId && routeProjectSlug
    ? `/app/projects/${routeProjectSlug}/preconstruction/quote/${currentWorkingQuoteId}`
    : null;
  useEffect(() => {
    prefetchProjectQuoteHref({
      href: currentWorkingQuoteHref,
      projectId: routeProjectSlug,
      prefetchedHrefs: prefetchedQuoteHrefsRef.current,
      prefetch: (href) => router.prefetch(href),
    });
  }, [currentWorkingQuoteHref, routeProjectSlug, router]);

  const revisionPrimaryAction = isImmutableQuoteRevision ? (
    !isSuccessorResolved ? (
      <Button type="button" variant="secondary" className="sm:min-w-[180px]" disabled>
        Resolving Revision...
      </Button>
    ) : currentWorkingQuoteHref ? (
      <Button
        type="button"
        variant="secondary"
        disabled={!canManageQuote || isLoadingQuote}
        onClick={() => router.push(currentWorkingQuoteHref)}
      >
        Open Quote
      </Button>
    ) : (
      <Button
        type="button"
        variant="secondary"
        className="sm:min-w-[180px]"
        disabled={!canManageQuote || isCreatingRevision || isLoadingQuote}
        onClick={() => void createProjectQuoteRevision()}
      >
        {isCreatingRevision ? "Creating Revision..." : "Create Revision"}
      </Button>
    )
  ) : undefined;
  const readOnlyMessage = quoteStatus !== "Accepted" && quoteId && quoteStatus !== "Draft"
    ? "This issued quote revision is read-only. Create a successor Draft revision for commercial changes."
    : !canManageQuote
      ? "You can review this quote, but only owner, admin, QS, and project manager roles can edit or delete it."
      : null;

  if (!shouldShowEditor) {
    return (
      <ProjectQuoteReadView
        error={error}
        saveMessage={saveMessage}
        readOnlyMessage={readOnlyMessage}
        quoteNumber={quoteNumber}
        quoteTitle={quoteTitle}
        quoteStatus={quoteStatus}
        canManageQuote={effectiveCanManageQuote}
        onEdit={() => {
          if (!effectiveCanManageQuote) {
            setError("You do not have permission to edit quotes.");
            return;
          }
          setIsEditing(true);
        }}
        onExport={() => void exportQuotePdf()}
        primaryAction={revisionPrimaryAction}
        clientName={clientName}
        siteAddress={siteAddress}
        projectName={projectName}
        quoteDate={quoteDate}
        expiryDate={expiryDate}
        lineItems={lineItems}
        termsInclusions={termsInclusions}
        termsExclusions={scopeExclusions}
        clarifications={clarifications}
        assumptions={assumptions}
        pricingSummary={pricingSummary as PricingSummary}
        getCommercialItemSourceHref={getCommercialItemSourceHref}
        isCommercialMetadataPending={isCommercialMetadataPending}
      />
    );
  }

  return (
    <>
      <QuoteEditorLayout
      heroTitle="Quote"
      error={error}
      saveMessage={saveMessage}
      readOnlyMessage={readOnlyMessage}
      shouldShowEditor={shouldShowEditor}
      isLoadingQuote={isLoadingQuote}
      isHydratingExistingQuote={isHydratingExistingQuote}
      canManageQuote={effectiveCanManageQuote}
      canDeleteQuote={effectiveCanManageQuote}
      isSaving={isSaving}
      isDeleting={isDeleting}
      quoteId={quoteId}
      quoteStatus={quoteStatus}
      setQuoteStatus={setQuoteStatus}
      quoteTitle={quoteTitle}
      setQuoteTitle={setQuoteTitle}
      clientName={clientName}
      siteAddress={siteAddress}
      projectName={projectName}
      setProjectName={setProjectName}
      quoteDate={quoteDate}
      setQuoteDate={setQuoteDate}
      expiryDate={expiryDate}
      setExpiryDate={setExpiryDate}
      quoteNumber={quoteNumber}
      onSave={saveQuote}
      onEdit={() => {
        if (!effectiveCanManageQuote) {
          setError("You do not have permission to edit quotes.");
          return;
        }
        setIsEditing(true);
      }}
      onExport={exportQuotePdf}
      onDelete={deleteQuote}
      lineItems={lineItems}
      mainLineItems={mainLineItems}
      optionalLineItems={optionalLineItems}
      addLineItem={addLineItem}
      updateLineItem={updateLineItem}
      removeLineItem={removeLineItem}
      isQuoteDetailsOpen={isQuoteDetailsOpen}
      setIsQuoteDetailsOpen={setIsQuoteDetailsOpen}
      isLineItemsOpen={isLineItemsOpen}
      setIsLineItemsOpen={setIsLineItemsOpen}
      isTermsOpen={isTermsOpen}
      setIsTermsOpen={setIsTermsOpen}
      onOpenScopeImport={openScopeImport}
      scopeImportTriggerRef={scopeImportTriggerRef}
      showWorksheetSources
      isCommercialItemsOpen={isCommercialItemsOpen}
      setIsCommercialItemsOpen={setIsCommercialItemsOpen}
      isLoadingCommercialItems={isLoadingCommercialItems}
      availableCommercialItems={availableCommercialItems}
      selectedCommercialItemIds={selectedCommercialItemIds}
      toggleCommercialItem={toggleCommercialItem}
      importSelectedCommercialItems={importSelectedCommercialItems}
      canUseMaterials={canUseMaterials}
      onOpenMaterials={openMaterials}
      materialsTriggerRef={materialsTriggerRef}
      getCommercialItemSourceHref={getCommercialItemSourceHref}
      sectionSubtotals={sectionSubtotals}
      validityPeriod={validityPeriod}
      setValidityPeriod={setValidityPeriod}
      paymentTerms={paymentTerms}
      setPaymentTerms={setPaymentTerms}
      leadTime={leadTime}
      setLeadTime={setLeadTime}
      termsInclusions={termsInclusions}
      setTermsInclusions={setTermsInclusions}
      termsExclusions={scopeExclusions}
      setTermsExclusions={(value) => {
        setScopeExclusions(value);
        setTermsExclusions(value);
      }}
      clarifications={clarifications}
      setClarifications={(value) => {
        setClarifications(value);
        setScopeNotes(value);
      }}
      assumptions={assumptions}
      setAssumptions={setAssumptions}
      marginPercent={marginPercent}
      setMarginPercent={setMarginPercent}
      discountAmount={discountAmount}
      setDiscountAmount={setDiscountAmount}
      contingencyAmount={contingencyAmount}
      setContingencyAmount={setContingencyAmount}
      gstPercent={gstPercent}
      setGstPercent={setGstPercent}
      includeMarginInExport={includeMarginInExport}
      setIncludeMarginInExport={setIncludeMarginInExport}
      includeDiscountInExport={includeDiscountInExport}
      setIncludeDiscountInExport={setIncludeDiscountInExport}
      includeContingencyInExport={includeContingencyInExport}
      setIncludeContingencyInExport={setIncludeContingencyInExport}
      pricingSummary={pricingSummary as PricingSummary}
      primaryAction={revisionPrimaryAction}
      />
      {activeQuoteDrawer === "scope" ? (
        <ScopeImportDrawer
          isLoading={isLoadingScopeItems}
          items={availableScopeCostItems}
          selectedIds={selectedScopeCostItemIds}
          onToggleItem={toggleScopeCostItem}
          onAddSelected={importSelectedScopeItems}
          onClose={closeScopeImport}
        />
      ) : null}
      {activeQuoteDrawer === "materials" && canUseMaterials ? (
        <QuoteSupplierPricingDrawer onClose={closeMaterials} onSelectPrice={addSupplierMaterial} />
      ) : null}
    </>
  );
}
