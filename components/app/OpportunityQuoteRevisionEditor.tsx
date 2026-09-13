"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { buildCommercialItemSourceHref, enrichQuoteLineItemsWithCommercialItems } from "@/lib/commercial-items/quote-linking";
import { useAuth } from "@/hooks/use-auth";
import {
  OPPORTUNITY_CONVERSION_RECONCILIATION_WARNING,
  hasUnclassifiedDeliveryProjectCandidates,
  isOpportunityConversionReconciliationWarning,
  shouldRetryAcceptedOpportunityConversion,
} from "@/lib/opportunity-conversion-reconciliation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  opportunityQuoteDisplayNumber,
  opportunityQuoteSeriesDisplayReference,
} from "@/lib/opportunity-quote-display";
import {
  OpportunityQuoteRevisionHistory,
  type OpportunityQuoteRevisionHistoryRow,
} from "@/components/app/OpportunityQuoteRevisionHistory";
import { Button } from "@/components/ui/button";
import { selectPreviousOpportunityQuoteRevisions } from "@/lib/opportunity-quote-history";
import { OpportunityQuoteRevisionStack } from "@/components/app/OpportunityQuoteRevisionStack";
import { QuoteSupplierPricingDrawer } from "@/components/app/QuoteSupplierPricingDrawer";
import { ScopeImportDrawer } from "@/components/app/ScopeImportDrawer";
import { buildQuoteLineFromSupplierPrice } from "@/lib/materials/quote-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import {
  QuoteEditorLayout,
  LINE_ITEM_SECTIONS,
  type LineItem,
  type LineItemSection,
  type PricingSummary,
  type QuoteStatus,
  type ScopeCostCategoryItem,
  lineItemTotal,
  makeDefaultLineItem,
  numberOrZero,
} from "@/components/app/QuoteEditorShared";

type RpcResultRow = Record<string, unknown>;
type QuoteDrawerType = "scope" | "materials" | null;
type RevisionHistoryRow = {
  series_id: string;
  base_quote_number: string;
  current_revision_id: string;
  revision_id: string;
  revision_number: number;
  status: string;
  total_quote_price: number;
  quote_date: string | null;
  expiry_date: string | null;
  updated_at: string;
};

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

function deriveOpportunityCodeFromSlug(slug: string | null | undefined) {
  const normalized = (slug ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
  return normalized || "OPP";
}

export function OpportunityQuoteRevisionEditor({
  revisionId,
  canViewMaterials,
  canWriteQuote,
}: {
  revisionId: string;
  canViewMaterials: boolean;
  canWriteQuote: boolean;
}) {
  const params = useParams<{ opportunityId: string }>();
  const router = useRouter();
  const routeOpportunitySlug = params?.opportunityId;
  const sharedOpportunity = useOpportunityWorkspaceData();
  const { session, isLoading: isAuthLoading } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<string | null>(null);
  const [persistedQuoteStatus, setPersistedQuoteStatus] = useState<QuoteStatus | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbOpportunityId, setDbOpportunityId] = useState<string | null>(sharedOpportunity.opportunityId);
  const [opportunityCode, setOpportunityCode] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [revisionNumber, setRevisionNumber] = useState(1);
  const [currentRevisionId, setCurrentRevisionId] = useState<string | null>(null);
  const [baseQuoteNumber, setBaseQuoteNumber] = useState("");
  const [revisionHistory, setRevisionHistory] = useState<RevisionHistoryRow[]>([]);
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("Sent");
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [internalQuoteNumber, setInternalQuoteNumber] = useState("");
  const [quoteCreatedAt, setQuoteCreatedAt] = useState<string | null>(null);
  const [clientName, setClientName] = useState(sharedOpportunity.clientName === "Unassigned" ? "" : sharedOpportunity.clientName);
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [organizationBrandPrimaryColor, setOrganizationBrandPrimaryColor] = useState("");
  const [projectName, setProjectName] = useState(sharedOpportunity.name);
  const [quoteDate, setQuoteDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([makeDefaultLineItem()]);

  const [optionalItemsNotes, setOptionalItemsNotes] = useState("");
  const [scopeExclusions, setScopeExclusions] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");

  const [marginPercent, setMarginPercent] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [contingencyAmount, setContingencyAmount] = useState("0");
  const [gstPercent, setGstPercent] = useState("15");
  const [includeMarginInExport, setIncludeMarginInExport] = useState(false);
  const [includeDiscountInExport, setIncludeDiscountInExport] = useState(false);
  const [includeContingencyInExport, setIncludeContingencyInExport] = useState(false);

  const [validityPeriod, setValidityPeriod] = useState("30 days");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [termsInclusions, setTermsInclusions] = useState("");
  const [termsExclusions, setTermsExclusions] = useState("");
  const [clarifications, setClarifications] = useState("");
  const [acceptanceNotes, setAcceptanceNotes] = useState("");
  const [isQuoteDetailsOpen, setIsQuoteDetailsOpen] = useState(true);
  const [isLineItemsOpen, setIsLineItemsOpen] = useState(true);
  const [activeQuoteDrawer, setActiveQuoteDrawer] = useState<QuoteDrawerType>(null);
  const [isLoadingScopeItems, setIsLoadingScopeItems] = useState(false);
  const [scopeCostItems, setScopeCostItems] = useState<ScopeCostCategoryItem[]>([]);
  const [selectedScopeCostItemIds, setSelectedScopeCostItemIds] = useState<string[]>([]);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const loadedOpportunitySlugRef = useRef<string | null>(null);
  const scopeImportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const materialsTriggerRef = useRef<HTMLButtonElement | null>(null);

  const normalizeAllowedStatus = useCallback((status: string): QuoteStatus => {
    if (status === "Draft" || status === "Sent" || status === "Accepted" || status === "Rejected" || status === "Expired") {
      return status;
    }
    return "Draft";
  }, []);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const shouldShowEditor = isEditing || !quoteId;
  const isHydratingExistingQuote = isLoadingQuote;
  const isCurrentRevision = Boolean(quoteId && currentRevisionId === quoteId);
  const canManageQuote = isCurrentRevision && persistedQuoteStatus === "Draft";
  const canUseMaterials = canViewMaterials && canWriteQuote && canManageQuote && shouldShowEditor;
  const previousRevisions = useMemo<OpportunityQuoteRevisionHistoryRow[]>(() => {
    return selectPreviousOpportunityQuoteRevisions({
      rows: revisionHistory,
      viewedRevisionId: quoteId,
      currentRevisionId,
      currentRevisionNumber: revisionNumber,
    })
      .map((revision) => ({
        revision_id: revision.revision_id,
        revision_number: revision.revision_number,
        status: revision.status,
        total_quote_price: Number(revision.total_quote_price ?? 0),
        updated_at: revision.updated_at,
      }));
  }, [currentRevisionId, quoteId, revisionHistory, revisionNumber]);

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

  const resolveNextQuoteNumber = useCallback(async (orgId: string, opportunityCodeValue: string): Promise<string> => {
    if (!supabase) {
      return `Q-${opportunityCodeValue}-1`;
    }

    const prefix = `Q-${opportunityCodeValue}-`;
    const { data, error } = await supabase
      .from("project_quotes")
      .select("quote_number")
      .eq("organization_id", orgId)
      .eq("originating_opportunity_id", sharedOpportunity.opportunityId)
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
  }, [sharedOpportunity.opportunityId, supabase]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    if (!userId) {
      setIsLoadingQuote(false);
      setError("Please sign in to load this quote.");
      return;
    }
  }, [isAuthLoading, userId]);

  useEffect(() => {
    if (!supabase || !userId || !routeOpportunitySlug || isAuthLoading) {
      return;
    }
    if (loadedOpportunitySlugRef.current === routeOpportunitySlug) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoadingQuote(true);
      setError(null);
      setOrganizationName("");
      setOrganizationLogoUrl(null);
      setOrganizationBrandPrimaryColor("");

      try {
        let resolvedOrganizationId = sessionOrganizationId;
        if (!resolvedOrganizationId) {
          const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
          resolvedOrganizationId = ensuredOrganizationId ?? null;
        }
        if (!resolvedOrganizationId) {
          const { data: memberRow } = await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          resolvedOrganizationId = memberRow?.organization_id ?? null;
        }
        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
        }

        const resolvedRevisionId = revisionId;
        if (!resolvedRevisionId) {
          throw new Error("Quote revision was not specified.");
        }

        const loadBranding = async () => {
          const { data: organizationRow } = await supabase
            .from("organizations")
            .select("name, logo_path")
            .eq("id", resolvedOrganizationId)
            .maybeSingle();

          if (cancelled) {
            return;
          }

          setOrganizationName(organizationRow?.name ?? "");
          if (organizationRow?.logo_path) {
            const { data: logoUrlData } = supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path);
            if (!cancelled) {
              setOrganizationLogoUrl(logoUrlData.publicUrl);
            }
          } else {
            setOrganizationLogoUrl(null);
          }
        };

        const workspaceProjectId = sharedOpportunity.workspaceProjectId;
        const shouldLoadScopeItems = Boolean(workspaceProjectId);
        if (shouldLoadScopeItems) {
          setIsLoadingScopeItems(true);
        }

        const [
          opportunityDetailResult,
          clientResult,
          quoteResult,
          scopeRunsResult,
          tradePacksResult,
          sourceProjectsResult,
        ] = await Promise.all([
          supabase
            .from("organization_opportunities")
            .select("opportunity_code, location, workspace_project_id, converted_project_id")
            .eq("organization_id", resolvedOrganizationId)
            .eq("slug", routeOpportunitySlug)
            .maybeSingle(),
          sharedOpportunity.clientId
            ? supabase
                .from("organization_clients")
                .select("name, company_name, email, phone")
                .eq("organization_id", resolvedOrganizationId)
                .eq("id", sharedOpportunity.clientId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from("project_quotes")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .eq("originating_opportunity_id", sharedOpportunity.opportunityId)
            .eq("id", resolvedRevisionId)
            .order("updated_at", { ascending: false })
            .limit(1),
          workspaceProjectId
            ? supabase
                .from("scope_runs")
                .select("id, trade_pack_id, result_json, created_at")
                .eq("organization_id", resolvedOrganizationId)
                .eq("project_id", workspaceProjectId)
                .eq("status", "complete")
                .order("created_at", { ascending: false })
                .limit(120)
            : Promise.resolve({ data: [], error: null }),
          workspaceProjectId
            ? supabase
                .from("trade_packs")
                .select("id, trade_label")
                .eq("organization_id", resolvedOrganizationId)
                .eq("project_id", workspaceProjectId)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("organization_projects")
            .select("id")
            .eq("organization_id", resolvedOrganizationId)
            .eq("source_opportunity_id", sharedOpportunity.opportunityId),
        ]);

        if (opportunityDetailResult.error || !opportunityDetailResult.data) {
          throw new Error(opportunityDetailResult.error?.message ?? "Opportunity not found.");
        }

        if (cancelled) {
          return;
        }

        setOrganizationId(resolvedOrganizationId);
        if (sourceProjectsResult.error) {
          throw new Error(sourceProjectsResult.error.message);
        }
        setReconciliationRequired(hasUnclassifiedDeliveryProjectCandidates({
          convertedProjectId: opportunityDetailResult.data.converted_project_id,
          workspaceProjectId: opportunityDetailResult.data.workspace_project_id,
          sourceProjectIds: (sourceProjectsResult.data ?? []).map((project) => project.id),
        }));
        const resolvedOpportunityCode =
          opportunityDetailResult.data.opportunity_code ?? deriveOpportunityCodeFromSlug(routeOpportunitySlug);

        setDbOpportunityId(sharedOpportunity.opportunityId);
        setOpportunityCode(resolvedOpportunityCode);
        setProjectName((current) => current || sharedOpportunity.name);
        setSiteAddress((current) => current || opportunityDetailResult.data?.location || "");
        setQuoteNumber((current) => current || resolvedOpportunityCode);

        if (shouldLoadScopeItems) {
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
          setIsLoadingScopeItems(false);
        } else {
          setScopeCostItems([]);
          setIsLoadingScopeItems(false);
        }

        let linkedClientName = "";
        let linkedCompanyName = "";
        let linkedContactPerson = "";
        let linkedEmail = "";
        let linkedPhone = "";

        const clientRow = clientResult.data;
        if (clientRow) {
          linkedClientName = clientRow.name || "";
          linkedCompanyName = clientRow.company_name || "";
          linkedContactPerson = clientRow.name || "";
          linkedEmail = clientRow.email || "";
          linkedPhone = clientRow.phone || "";

          setClientName((current) => current || linkedClientName);
          setCompanyName((current) => current || linkedCompanyName);
          setContactPerson((current) => current || linkedContactPerson);
          setEmail((current) => current || linkedEmail);
          setPhone((current) => current || linkedPhone);
        }

        const { data: quoteRows, error: quoteError } = quoteResult;
        if (quoteError) {
          throw new Error(quoteError.message);
        }

        const selectedQuote = quoteRows?.[0] ?? null;
        if (!selectedQuote || cancelled) {
          throw new Error("Quote revision not found for this Opportunity.");
        }
        if (!(selectedQuote as unknown as Record<string, unknown>).quote_series_id) {
          throw new Error("This record is not a client quotation revision.");
        }

        setQuoteId(selectedQuote.id);
        setRevisionNumber(selectedQuote.revision_number ?? 1);
        setQuoteUpdatedAt(typeof selectedQuote.updated_at === "string" ? selectedQuote.updated_at : null);
        setQuoteCreatedAt(selectedQuote.created_at ?? null);
        setQuoteStatus(normalizeAllowedStatus(selectedQuote.status));
        setPersistedQuoteStatus(normalizeAllowedStatus(selectedQuote.status));
        setQuoteTitle(selectedQuote.quote_title);
        setInternalQuoteNumber(selectedQuote.quote_number);
        setQuoteNumber(opportunityQuoteDisplayNumber(resolvedOpportunityCode, selectedQuote.revision_number));
        setClientName(selectedQuote.client_name || "");
        setCompanyName(selectedQuote.company_name || "");
        setContactPerson(selectedQuote.contact_person || "");
        setEmail(selectedQuote.client_email || "");
        setPhone(selectedQuote.client_phone || "");
        setSiteAddress(selectedQuote.site_address || "");
        setProjectName(selectedQuote.project_name || sharedOpportunity.name);
        setQuoteDate(selectedQuote.quote_date ?? "");
        setExpiryDate(selectedQuote.expiry_date ?? "");
        setIsEditing(false);
        setOptionalItemsNotes(selectedQuote.optional_items_notes);
        setScopeExclusions(selectedQuote.scope_exclusions);
        setAssumptions(selectedQuote.assumptions);
        setScopeNotes(selectedQuote.scope_notes);
        setMarginPercent(String(selectedQuote.margin_percent ?? 0));
        setDiscountAmount(String(selectedQuote.discount_amount ?? 0));
        setContingencyAmount(String(selectedQuote.contingency_amount ?? 0));
        setGstPercent(String(selectedQuote.gst_percent ?? 15));
        setValidityPeriod(selectedQuote.validity_period ?? "30 days");
        setPaymentTerms(selectedQuote.payment_terms);
        setLeadTime(selectedQuote.lead_time);
        setTermsInclusions(selectedQuote.terms_inclusions);
        setTermsExclusions(selectedQuote.terms_exclusions);
        setClarifications(selectedQuote.clarifications);
        setAcceptanceNotes(selectedQuote.acceptance_notes);

        const historyRpc = supabase as unknown as {
          rpc(name: "get_opportunity_quote_revision_history_v1", args: {
            p_organization_id: string;
            p_opportunity_id: string;
            p_revision_id: string;
          }): Promise<{ data: RevisionHistoryRow[] | null; error: { message: string } | null }>;
        };
        const historyResult = await historyRpc.rpc("get_opportunity_quote_revision_history_v1", {
          p_organization_id: resolvedOrganizationId,
          p_opportunity_id: sharedOpportunity.opportunityId,
          p_revision_id: selectedQuote.id,
        });
        if (historyResult.error) {
          throw new Error(historyResult.error.message);
        }
        const historyRows = historyResult.data ?? [];
        const resolvedBaseQuoteNumber = historyRows[0]?.base_quote_number ?? selectedQuote.quote_number;
        setCurrentRevisionId(historyRows[0]?.current_revision_id ?? null);
        setBaseQuoteNumber(resolvedBaseQuoteNumber);
        setRevisionHistory(historyRows);
        setQuoteNumber(opportunityQuoteDisplayNumber(
          opportunityQuoteSeriesDisplayReference(resolvedBaseQuoteNumber, resolvedOpportunityCode),
          selectedQuote.revision_number,
        ));

        const { data: itemRows, error: itemsError } = await supabase
          .from("project_quote_line_items")
          .select("id, section, description, quantity, unit, rate, is_optional, sort_order, source_opportunity_quote_id, source_opportunity_quote_line_item_id, source_opportunity_quote_number")
          .eq("organization_id", resolvedOrganizationId)
          .eq("quote_id", selectedQuote.id)
          .order("sort_order", { ascending: true });
        if (itemsError) {
          throw new Error(itemsError.message);
        }

        if (!cancelled) {
          const nextItems = (itemRows ?? []).map((item) => ({
            id: item.id,
            section: item.section as LineItemSection,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            isOptional: item.is_optional,
            sourceOpportunityQuoteId: item.source_opportunity_quote_id,
            sourceOpportunityQuoteLineItemId: item.source_opportunity_quote_line_item_id,
            sourceOpportunityQuoteNumber: item.source_opportunity_quote_number,
          }));
          const enrichedItems = await enrichQuoteLineItemsWithCommercialItems({
            client: supabase,
            organizationId: resolvedOrganizationId,
            quoteId: selectedQuote.id,
            lineItems: nextItems,
          });
          setLineItems(enrichedItems.length > 0 ? enrichedItems : [makeDefaultLineItem()]);
        }
        void loadBranding();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load quote.");
        }
      } finally {
        if (!cancelled) {
          loadedOpportunitySlugRef.current = routeOpportunitySlug;
          setIsLoadingQuote(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthLoading,
    normalizeAllowedStatus,
    resolveNextQuoteNumber,
    routeOpportunitySlug,
    revisionId,
    sessionOrganizationId,
    sharedOpportunity.clientId,
    sharedOpportunity.name,
    sharedOpportunity.opportunityId,
    sharedOpportunity.workspaceProjectId,
    supabase,
    userId,
  ]);

  const addLineItem = (isOptional = false) => {
    setLineItems((current) => [...current, makeDefaultLineItem(isOptional)]);
  };

  const closeScopeImport = useCallback(() => {
    setActiveQuoteDrawer(null);
    window.requestAnimationFrame(() => scopeImportTriggerRef.current?.focus());
  }, []);

  const openScopeImport = useCallback(() => {
    setActiveQuoteDrawer("scope");
  }, []);

  const closeMaterials = useCallback(() => {
    setActiveQuoteDrawer(null);
    window.requestAnimationFrame(() => materialsTriggerRef.current?.focus());
  }, []);

  const openMaterials = useCallback(() => {
    if (!canUseMaterials) return;
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

  const toggleScopeCostItem = (itemId: string) => {
    setSelectedScopeCostItemIds((current) =>
      current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId]
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

  const updateLineItem = <K extends keyof LineItem>(id: string, key: K, value: LineItem[K]) => {
    setLineItems((current) => current.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const removeLineItem = (id: string) => {
    setLineItems((current) => current.filter((item) => item.id !== id));
  };

  const saveQuote = async () => {
    if (!supabase || !session || !organizationId || !dbOpportunityId || !routeOpportunitySlug) {
      setError("Quote save is not ready. Please refresh and try again.");
      return;
    }
    if (!quoteId || !quoteUpdatedAt) {
      setError("The exact quote revision is not ready to save. Refresh and try again.");
      return;
    }
    if (persistedQuoteStatus && persistedQuoteStatus !== "Draft") {
      setError("Issued quote revisions are read-only. Create a revision to change the commercial record.");
      return;
    }
    const convertAcceptedQuote = async (acceptedQuoteId: string) => {
      const response = await fetch(
        `/api/leads-clients/opportunities/${routeOpportunitySlug}/convert`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ acceptedQuoteId }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (isOpportunityConversionReconciliationWarning(payload?.error)) {
          setReconciliationRequired(true);
        }
        throw new Error(payload?.error ?? "Unable to convert accepted quote to project.");
      }
      const payload = await response.json().catch(() => null);
      const projectSlug = payload?.projectSlug as string | undefined;
      if (!projectSlug) {
        throw new Error("Project conversion succeeded but no project slug was returned.");
      }
      setSaveMessage(
        (payload?.legacyTenderDataMigrationStatus ?? payload?.fileMigrationStatus) === "retry_required"
          ? "Quote accepted and project created. Some legacy tender drawings or scope data will be retried."
          : "Quote accepted. Converting to project...",
      );
      router.push(`/app/projects/${projectSlug}/dashboard`);
    };

    if (shouldRetryAcceptedOpportunityConversion({
      quoteId,
      selectedStatus: quoteStatus,
      persistedStatus: persistedQuoteStatus,
    })) {
      setIsSaving(true);
      setError(null);
      setSaveMessage(null);
      try {
        await convertAcceptedQuote(quoteId as string);
      } catch (conversionError) {
        setError(conversionError instanceof Error ? conversionError.message : "Unable to convert accepted quote to project.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const trimmedTitle = quoteTitle.trim();
    let trimmedNumber = internalQuoteNumber.trim();
    const resolvedOpportunityCode = opportunityCode ?? deriveOpportunityCodeFromSlug(routeOpportunitySlug);
    if (!trimmedNumber) {
      trimmedNumber = await resolveNextQuoteNumber(organizationId, resolvedOpportunityCode);
      setInternalQuoteNumber(trimmedNumber);
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
      }));

      const { data: saveRows, error: saveError } = await supabase.rpc("save_commercial_quote_draft", {
        p_organization_id: organizationId,
        p_originating_opportunity_id: dbOpportunityId,
        p_project_id: undefined,
        p_quote_id: quoteId,
        p_expected_updated_at: quoteUpdatedAt,
        p_quote_title: trimmedTitle,
        p_quote_number: trimmedNumber,
        p_client_name: clientName.trim(),
        p_company_name: companyName.trim(),
        p_contact_person: contactPerson.trim(),
        p_client_email: email.trim(),
        p_client_phone: phone.trim(),
        p_site_address: siteAddress.trim(),
        p_project_name: projectName.trim(),
        p_quote_date: quoteDate || undefined,
        p_expiry_date: expiryDate || undefined,
        // Persist the commercial body while the canonical revision is Draft.
        // Issuance is the final mutation so child-evidence immutability applies
        // immediately after this transaction boundary.
        p_status: "Draft",
        p_optional_items_notes: optionalItemsNotes,
        p_scope_exclusions: scopeExclusions,
        p_assumptions: assumptions,
        p_scope_notes: scopeNotes,
        p_margin_percent: Number(numberOrZero(marginPercent).toFixed(3)),
        p_discount_amount: Number(numberOrZero(discountAmount).toFixed(2)),
        p_contingency_amount: Number(numberOrZero(contingencyAmount).toFixed(2)),
        p_gst_percent: Number(numberOrZero(gstPercent).toFixed(3)),
        p_validity_period: validityPeriod,
        p_payment_terms: paymentTerms,
        p_retention_percent_default: 0,
        p_lead_time: leadTime,
        p_terms_inclusions: termsInclusions,
        p_terms_exclusions: termsExclusions,
        p_clarifications: clarifications,
        p_acceptance_notes: acceptanceNotes,
        p_line_items: lineItemsPayload,
      });

      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = (Array.isArray(saveRows) ? saveRows[0] : null) as RpcResultRow | null;
      const resolvedQuoteId = typeof savedRow?.id === "string" ? savedRow.id : null;
      if (!resolvedQuoteId) {
        throw new Error("Quote was saved but no identifier was returned.");
      }
      let nextUpdatedAt = typeof savedRow?.updated_at === "string" ? savedRow.updated_at : null;
      if (!nextUpdatedAt) {
        throw new Error("Quote was saved but no updated timestamp was returned.");
      }

      if (quoteStatus !== "Draft") {
        const issuedResult = await supabase
          .from("project_quotes")
          .update({ status: quoteStatus, published_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("originating_opportunity_id", dbOpportunityId)
          .eq("id", resolvedQuoteId)
          .eq("status", "Draft")
          .select("updated_at")
          .single();
        if (issuedResult.error) {
          throw new Error(issuedResult.error.message);
        }
        nextUpdatedAt = issuedResult.data.updated_at;
      }

      setQuoteId(resolvedQuoteId);
      setQuoteUpdatedAt(nextUpdatedAt);
      setPersistedQuoteStatus(quoteStatus);

      if (quoteStatus === "Sent") {
        const { error: opportunityUpdateError } = await supabase
          .from("organization_opportunities")
          .update({
            stage: "Quoted",
            quoted_at: new Date().toISOString().slice(0, 10),
          })
          .eq("organization_id", organizationId)
          .eq("id", dbOpportunityId);

        if (opportunityUpdateError) {
          throw new Error(opportunityUpdateError.message);
        }
      }

      if (quoteStatus === "Accepted") {
        const acceptanceRpc = supabase as unknown as {
          rpc(name: "select_opportunity_accepted_quote_revision_v1", args: {
            p_organization_id: string;
            p_opportunity_id: string;
            p_quote_revision_id: string;
          }): Promise<{ error: { message: string } | null }>;
        };
        const acceptanceResult = await acceptanceRpc.rpc("select_opportunity_accepted_quote_revision_v1", {
          p_organization_id: organizationId,
          p_opportunity_id: dbOpportunityId,
          p_quote_revision_id: resolvedQuoteId,
        });
        if (acceptanceResult.error) {
          throw new Error(acceptanceResult.error.message);
        }
        await convertAcceptedQuote(resolvedQuoteId);
        return;
      }

      if (quoteStatus === "Rejected") {
        setSaveMessage("Quote marked as rejected. The opportunity remains active.");
      }

      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
      if (quoteStatus === "Expired") {
        setSaveMessage("Quote marked as expired. Reprice required.");
      }
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save quote.");
    } finally {
      setIsSaving(false);
    }
  };

  const exportQuotePdf = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    const [{ buildQuotePdfHtml }, { buildPersistedProjectQuotePdfSnapshot }] = await Promise.all([
      import("@/lib/quote-pdf-html"),
      import("@/lib/project-quote-pdf-snapshot"),
    ]);

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

    if (supabase && organizationId && dbOpportunityId && quoteId && persistedQuoteStatus && persistedQuoteStatus !== "Draft") {
      const [quoteResult, linesResult] = await Promise.all([
        supabase
          .from("project_quotes")
          .select("assumptions, clarifications, client_email, client_name, client_phone, company_name, contact_person, contingency_amount, discount_amount, expiry_date, gst_amount, gst_percent, margin_amount, optional_subtotal, project_name, quote_date, quote_number, site_address, subtotal, terms_exclusions, terms_inclusions, total_quote_price")
          .eq("organization_id", organizationId)
          .eq("originating_opportunity_id", dbOpportunityId)
          .eq("id", quoteId)
          .single(),
        supabase
          .from("project_quote_line_items")
          .select("id, section, description, quantity, unit, rate, is_optional")
          .eq("organization_id", organizationId)
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true }),
      ]);
      if (quoteResult.error || linesResult.error || !quoteResult.data) {
        setError(quoteResult.error?.message ?? linesResult.error?.message ?? "Unable to load the persisted PDF revision.");
        return;
      }
      pdfSnapshot = buildPersistedProjectQuotePdfSnapshot(quoteResult.data, linesResult.data ?? []);
      pdfSnapshot.quoteNumber = quoteNumber;
    }

    const html = buildQuotePdfHtml({
      lineItems: pdfSnapshot.lineItems,
      pricingSummary: pdfSnapshot.pricingSummary,
      showMarginBreakout: includeMarginInExport === true,
      includeDiscountInExport,
      includeContingencyInExport,
      quoteDate: pdfSnapshot.quoteDate,
      quoteNumber: pdfSnapshot.quoteNumber,
      revisionNumber: revisionNumber > 1 ? revisionNumber - 1 : undefined,
      organizationName,
      organizationLogoUrl,
      organizationBrandPrimaryColor,
      projectName: pdfSnapshot.projectName,
      companyName: pdfSnapshot.companyName,
      clientName: pdfSnapshot.clientName,
      siteAddress: pdfSnapshot.siteAddress,
      contactPerson: pdfSnapshot.contactPerson,
      email: pdfSnapshot.email,
      phone: pdfSnapshot.phone,
      expiryDate: pdfSnapshot.expiryDate,
      gstPercent: pdfSnapshot.gstPercent,
      termsInclusions: pdfSnapshot.termsInclusions,
      termsExclusions: pdfSnapshot.termsExclusions,
      clarifications: pdfSnapshot.clarifications,
      assumptions: pdfSnapshot.assumptions,
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
    contactPerson,
    email,
    expiryDate,
    gstPercent,
    includeContingencyInExport,
    includeDiscountInExport,
    includeMarginInExport,
    lineItems,
    organizationLogoUrl,
    organizationBrandPrimaryColor,
    organizationName,
    phone,
    pricingSummary,
    projectName,
    quoteDate,
    quoteNumber,
    revisionNumber,
    quoteId,
    persistedQuoteStatus,
    organizationId,
    dbOpportunityId,
    supabase,
    siteAddress,
    termsExclusions,
    termsInclusions,
  ]);

  const createRevision = useCallback(async () => {
    if (!supabase || !organizationId || !dbOpportunityId || !quoteId || !routeOpportunitySlug || !isCurrentRevision) {
      setError("Unable to create a quote revision right now.");
      return;
    }

    setIsCreatingRevision(true);
    setError(null);
    try {
      const rpc = supabase as unknown as {
        rpc(name: "create_opportunity_quote_revision_v1", args: {
          p_organization_id: string;
          p_opportunity_id: string;
          p_predecessor_quote_id: string;
        }): Promise<{ data: Array<{ revision_id: string }> | null; error: { message: string } | null }>;
      };
      const result = await rpc.rpc("create_opportunity_quote_revision_v1", {
        p_organization_id: organizationId,
        p_opportunity_id: dbOpportunityId,
        p_predecessor_quote_id: quoteId,
      });
      const createdRevisionId = result.data?.[0]?.revision_id;
      if (result.error || !createdRevisionId) {
        throw new Error(result.error?.message ?? "Unable to create the quote revision.");
      }
      router.push(`/app/leads-clients/opportunities/${routeOpportunitySlug}/quote/${createdRevisionId}`);
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "Unable to create the quote revision.");
    } finally {
      setIsCreatingRevision(false);
    }
  }, [dbOpportunityId, isCurrentRevision, organizationId, quoteId, routeOpportunitySlug, router, supabase]);

  const getCommercialItemSourceHref = useCallback((item: LineItem) => {
    return buildCommercialItemSourceHref(item, routeOpportunitySlug);
  }, [routeOpportunitySlug]);

  const primaryAction = !isCurrentRevision && currentRevisionId && routeOpportunitySlug ? (
    <Button
      type="button"
      variant="secondary"
      onClick={() => router.push(`/app/leads-clients/opportunities/${routeOpportunitySlug}/quote/${currentRevisionId}`)}
    >
      Open Current Revision
    </Button>
  ) : isCurrentRevision && persistedQuoteStatus && persistedQuoteStatus !== "Draft" && persistedQuoteStatus !== "Accepted" ? (
    <Button
      type="button"
      variant="secondary"
      disabled={isCreatingRevision}
      onClick={() => void createRevision()}
    >
      {isCreatingRevision ? "Creating Revision..." : "Create Revision"}
    </Button>
  ) : undefined;

  const previousRevisionsCard = isCurrentRevision && routeOpportunitySlug && previousRevisions.length > 0 ? (
    <OpportunityQuoteRevisionHistory
      opportunitySlug={routeOpportunitySlug}
      baseQuoteNumber={baseQuoteNumber}
      rows={previousRevisions}
    />
  ) : undefined;

  return (
    <>
      <OpportunityQuoteRevisionStack
      quote={(
        <QuoteEditorLayout
        heroTitle="Quote"
        createdAt={quoteCreatedAt}
        error={error ?? (reconciliationRequired
          ? OPPORTUNITY_CONVERSION_RECONCILIATION_WARNING
          : null)}
        saveMessage={saveMessage}
        shouldShowEditor={shouldShowEditor}
        isLoadingQuote={isLoadingQuote}
        isHydratingExistingQuote={isHydratingExistingQuote}
        canManageQuote={canManageQuote}
        canDeleteQuote={false}
        isSaving={isSaving}
        isDeleting={false}
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
        onEdit={() => setIsEditing(true)}
        onExport={exportQuotePdf}
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
        showWorksheetSources={false}
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
        termsExclusions={termsExclusions}
        setTermsExclusions={setTermsExclusions}
        clarifications={clarifications}
        setClarifications={setClarifications}
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
          primaryAction={primaryAction}
        />
      )}
      history={previousRevisionsCard}
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
