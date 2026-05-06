"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { useAuth } from "@/hooks/use-auth";
import { triggerDocumentClassification } from "@/lib/cost-items/trigger-document-classification";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteStatus } from "@/lib/supabase/types";
import {
  buildQuotePdfHtml,
  QuoteEditorLayout,
  LINE_ITEM_SECTIONS,
  type LineItem,
  type LineItemSection,
  type PricingSummary,
  type ScopeCostCategoryItem,
  lineItemTotal,
  makeDefaultLineItem,
  numberOrZero,
} from "@/components/app/QuoteEditorShared";

type RpcResultRow = Record<string, unknown>;

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

export default function PreconstructionQuotePage() {
  const params = useParams<{ opportunityId: string }>();
  const router = useRouter();
  const routeOpportunitySlug = params?.opportunityId;
  const sharedOpportunity = useOpportunityWorkspaceData();
  const { session, isLoading: isAuthLoading } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;
  const canManageQuote = true;

  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbOpportunityId, setDbOpportunityId] = useState<string | null>(sharedOpportunity.opportunityId);
  const [opportunityCode, setOpportunityCode] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("Sent");
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
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
  const [isScopeImportOpen, setIsScopeImportOpen] = useState(false);
  const [isLoadingScopeItems, setIsLoadingScopeItems] = useState(false);
  const [scopeCostItems, setScopeCostItems] = useState<ScopeCostCategoryItem[]>([]);
  const [selectedScopeCostItemIds, setSelectedScopeCostItemIds] = useState<string[]>([]);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const loadedOpportunitySlugRef = useRef<string | null>(null);

  const normalizeAllowedStatus = useCallback((status: QuoteStatus): QuoteStatus => {
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
      .from("opportunity_quotes")
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

        const loadBranding = async () => {
          const { data: organizationRow } = await supabase
            .from("organizations")
            .select("name, logo_path, brand_primary_color")
            .eq("id", resolvedOrganizationId)
            .maybeSingle();

          if (cancelled) {
            return;
          }

          setOrganizationName(organizationRow?.name ?? "");
          setOrganizationBrandPrimaryColor((organizationRow?.brand_primary_color ?? "").trim());
          if (organizationRow?.logo_path) {
            const { data: logoUrlData } = supabase.storage.from("organization-logos").getPublicUrl(organizationRow.logo_path);
            if (!cancelled) {
              setOrganizationLogoUrl(logoUrlData.publicUrl);
            }
          } else {
            setOrganizationLogoUrl(null);
          }
        };

        const shouldLoadScopeItems = Boolean(sharedOpportunity.workspaceProjectId);
        if (shouldLoadScopeItems) {
          setIsLoadingScopeItems(true);
        }

        const [
          opportunityDetailResult,
          clientResult,
          quoteResult,
          scopeRunsResult,
          tradePacksResult,
        ] = await Promise.all([
          supabase
            .from("organization_opportunities")
            .select("opportunity_code, location")
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
            .from("opportunity_quotes")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .eq("opportunity_id", sharedOpportunity.opportunityId)
            .order("updated_at", { ascending: false })
            .limit(20),
          shouldLoadScopeItems
            ? supabase
                .from("scope_runs")
                .select("id, trade_pack_id, result_json, created_at")
                .eq("organization_id", resolvedOrganizationId)
                .eq("project_id", sharedOpportunity.workspaceProjectId)
                .eq("status", "complete")
                .order("created_at", { ascending: false })
                .limit(120)
            : Promise.resolve({ data: [], error: null }),
          shouldLoadScopeItems
            ? supabase
                .from("trade_packs")
                .select("id, trade_label")
                .eq("organization_id", resolvedOrganizationId)
                .eq("project_id", sharedOpportunity.workspaceProjectId)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (opportunityDetailResult.error || !opportunityDetailResult.data) {
          throw new Error(opportunityDetailResult.error?.message ?? "Opportunity not found.");
        }

        if (cancelled) {
          return;
        }

        setOrganizationId(resolvedOrganizationId);
        const resolvedOpportunityCode =
          opportunityDetailResult.data.opportunity_code ?? deriveOpportunityCodeFromSlug(routeOpportunitySlug);

        setDbOpportunityId(sharedOpportunity.opportunityId);
        setOpportunityCode(resolvedOpportunityCode);
        setProjectName((current) => current || sharedOpportunity.name);
        setSiteAddress((current) => current || opportunityDetailResult.data.location || "");
        setQuoteNumber((current) => current || `Q-${resolvedOpportunityCode}-1`);

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

        const selectedQuote = (quoteRows ?? []).find((row) => row.status === "Sent") ?? (quoteRows ?? [])[0] ?? null;
        if (!selectedQuote || cancelled) {
          const nextNumber = await resolveNextQuoteNumber(resolvedOrganizationId, resolvedOpportunityCode);
          if (!cancelled) {
            setQuoteNumber(nextNumber);
            setIsEditing(true);
            setQuoteCreatedAt(new Date().toISOString());
            setQuoteUpdatedAt(null);
          }
          setQuoteDate(new Date().toISOString().slice(0, 10));
          void loadBranding();
          return;
        }

        setQuoteId(selectedQuote.id);
        setQuoteUpdatedAt(typeof selectedQuote.updated_at === "string" ? selectedQuote.updated_at : null);
        setQuoteCreatedAt(selectedQuote.created_at ?? null);
        setQuoteStatus(normalizeAllowedStatus(selectedQuote.status));
        setQuoteTitle(selectedQuote.quote_title);
        setQuoteNumber(selectedQuote.quote_number);
        setClientName(linkedClientName || selectedQuote.client_name || "");
        setCompanyName(linkedCompanyName || selectedQuote.company_name || "");
        setContactPerson(linkedContactPerson || selectedQuote.contact_person || "");
        setEmail(linkedEmail || selectedQuote.client_email || "");
        setPhone(linkedPhone || selectedQuote.client_phone || "");
        setSiteAddress(opportunityDetailResult.data.location || selectedQuote.site_address || "");
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

        const { data: itemRows, error: itemsError } = await supabase
          .from("opportunity_quote_line_items")
          .select("id, section, description, quantity, unit, rate, is_optional, sort_order")
          .eq("organization_id", resolvedOrganizationId)
          .eq("quote_id", selectedQuote.id)
          .order("sort_order", { ascending: true });
        if (itemsError) {
          throw new Error(itemsError.message);
        }

        if (!cancelled) {
          const nextItems = (itemRows ?? []).map((item) => ({
            id: item.id,
            section: item.section,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            isOptional: item.is_optional,
          }));
          setLineItems(nextItems.length > 0 ? nextItems : [makeDefaultLineItem()]);
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
    setIsScopeImportOpen(false);
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

    const trimmedTitle = quoteTitle.trim();
    let trimmedNumber = quoteNumber.trim();
    const resolvedOpportunityCode = opportunityCode ?? deriveOpportunityCodeFromSlug(routeOpportunitySlug);
    if (!trimmedNumber) {
      trimmedNumber = await resolveNextQuoteNumber(organizationId, resolvedOpportunityCode);
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
      }));

      const { data: saveRows, error: saveError } = await supabase.rpc("save_opportunity_quote_draft", {
        p_organization_id: organizationId,
        p_opportunity_id: dbOpportunityId,
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
        p_scope_exclusions: scopeExclusions,
        p_assumptions: assumptions,
        p_scope_notes: scopeNotes,
        p_margin_percent: Number(numberOrZero(marginPercent).toFixed(3)),
        p_discount_amount: Number(numberOrZero(discountAmount).toFixed(2)),
        p_contingency_amount: Number(numberOrZero(contingencyAmount).toFixed(2)),
        p_gst_percent: Number(numberOrZero(gstPercent).toFixed(3)),
        p_validity_period: validityPeriod,
        p_payment_terms: paymentTerms,
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
      const nextUpdatedAt = typeof savedRow?.updated_at === "string" ? savedRow.updated_at : null;
      if (!nextUpdatedAt) {
        throw new Error("Quote was saved but no updated timestamp was returned.");
      }

      setQuoteId(resolvedQuoteId);
      setQuoteUpdatedAt(nextUpdatedAt);
      triggerDocumentClassification({
        documentKind: "opportunity_quote",
        documentId: resolvedQuoteId,
        keepalive: quoteStatus === "Accepted",
      });

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
        const response = await fetch(`/api/leads-clients/opportunities/${routeOpportunitySlug}/convert`, { method: "POST" });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to convert accepted quote to project.");
        }
        const payload = await response.json().catch(() => null);
        const projectSlug = payload?.projectSlug as string | undefined;
        if (!projectSlug) {
          throw new Error("Project conversion succeeded but no project slug was returned.");
        }
        setSaveMessage("Quote accepted. Converting to project...");
        router.push(`/app/projects/${projectSlug}/dashboard`);
        return;
      }

      if (quoteStatus === "Rejected") {
        const { error: opportunityUpdateError } = await supabase
          .from("organization_opportunities")
          .update({ stage: "Lost" })
          .eq("organization_id", organizationId)
          .eq("id", dbOpportunityId);

        if (opportunityUpdateError) {
          throw new Error(opportunityUpdateError.message);
        }

        setSaveMessage("Opportunity marked as lost for tracking.");
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

  const exportQuotePdf = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const html = buildQuotePdfHtml({
      lineItems,
      pricingSummary: pricingSummary as PricingSummary,
      showMarginBreakout: includeMarginInExport === true,
      includeDiscountInExport,
      includeContingencyInExport,
      quoteDate,
      quoteNumber,
      organizationName,
      organizationLogoUrl,
      organizationBrandPrimaryColor,
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
    siteAddress,
    termsExclusions,
    termsInclusions,
  ]);

  return (
    <div className="px-5">
      <QuoteEditorLayout
        heroTitle="Quote"
        createdAt={quoteCreatedAt}
        error={error}
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
        isScopeImportOpen={isScopeImportOpen}
        setIsScopeImportOpen={setIsScopeImportOpen}
        isLoadingScopeItems={isLoadingScopeItems}
        availableScopeCostItems={availableScopeCostItems}
        selectedScopeCostItemIds={selectedScopeCostItemIds}
        toggleScopeCostItem={toggleScopeCostItem}
        importSelectedScopeItems={importSelectedScopeItems}
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
      />
    </div>
  );
}
