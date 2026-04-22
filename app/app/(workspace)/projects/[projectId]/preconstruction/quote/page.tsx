"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteStatus } from "@/lib/supabase/types";
import { canManageCommercialData } from "@/lib/role-permissions";
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

export default function ProjectQuoteRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const { session, isLoading: isAuthLoading } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;
  const canManageQuote = canManageCommercialData(session?.role);

  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const [projectCode, setProjectCode] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("Sent");
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
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
  const [hasLoadedScopeItems, setHasLoadedScopeItems] = useState(false);
  const [scopeCostItems, setScopeCostItems] = useState<ScopeCostCategoryItem[]>([]);
  const [selectedScopeCostItemIds, setSelectedScopeCostItemIds] = useState<string[]>([]);
  const [isTermsOpen, setIsTermsOpen] = useState(true);
  const loadedSlugRef = useRef<string | null>(null);

  const normalizeAllowedStatus = useCallback((status: QuoteStatus): QuoteStatus => {
    if (status === "Sent" || status === "Accepted" || status === "Rejected" || status === "Expired") {
      return status;
    }
    return "Sent";
  }, []);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);
  const shouldShowEditor = isEditing || !quoteId;
  const isHydratingExistingQuote = isLoadingQuote && !!quoteId;

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
    return { baseSubtotal, optionalSubtotal, margin, contingency, discount, gst, grandTotal };
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
      if (!match) continue;
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > maxSuffix) maxSuffix = parsed;
    }
    return `${prefix}${maxSuffix + 1}`;
  }, [supabase]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!userId) {
      setIsLoadingQuote(false);
      setError("Please sign in to load this quote.");
    }
  }, [isAuthLoading, userId]);

  useEffect(() => {
    if (!supabase || !userId || !routeProjectSlug || isAuthLoading) return;
    if (loadedSlugRef.current === routeProjectSlug) return;

    let cancelled = false;

    const load = async () => {
      setIsLoadingQuote(true);
      setError(null);

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
        if (!resolvedOrganizationId) throw new Error("Could not resolve your organization.");

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

        let projectRow: { id: string; client_id: string | null; name: string; location: string; project_code: string | null } | null = null;

        const withCodeResult = await supabase
          .from("organization_projects")
          .select("id, client_id, name, project_code, location")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();

        if (!withCodeResult.error && withCodeResult.data) {
          projectRow = { ...withCodeResult.data, project_code: withCodeResult.data.project_code ?? null };
        } else {
          const fallbackResult = await supabase
            .from("organization_projects")
            .select("id, client_id, name, location")
            .eq("organization_id", resolvedOrganizationId)
            .eq("slug", routeProjectSlug)
            .maybeSingle();
          if (fallbackResult.error || !fallbackResult.data) {
            throw new Error(withCodeResult.error?.message ?? fallbackResult.error?.message ?? "Project not found.");
          }
          projectRow = { ...fallbackResult.data, project_code: null };
        }

        if (!projectRow) throw new Error("Project not found.");
        if (cancelled) return;

        setOrganizationId(resolvedOrganizationId);
        const resolvedProjectCode = projectRow.project_code ?? deriveProjectCodeFromSlug(routeProjectSlug);
        setDbProjectId(projectRow.id);
        setProjectCode(resolvedProjectCode);
        setProjectName((current) => current || projectRow.name);
        setSiteAddress((current) => current || projectRow.location || "");
        setQuoteNumber((current) => current || `Q-${resolvedProjectCode}-1`);

        let linkedClientName = "";
        let linkedCompanyName = "";
        let linkedContactPerson = "";
        let linkedEmail = "";
        let linkedPhone = "";

        if (projectRow.client_id) {
          const { data: clientRow } = await supabase
            .from("organization_clients")
            .select("name, company_name, email, phone")
            .eq("organization_id", resolvedOrganizationId)
            .eq("id", projectRow.client_id)
            .maybeSingle();
          if (clientRow) {
            linkedClientName = clientRow.name || "";
            linkedCompanyName = clientRow.company_name || "";
            linkedContactPerson = clientRow.name || "";
            linkedEmail = clientRow.email || "";
            linkedPhone = clientRow.phone || "";
            if (!cancelled) {
              setClientName((current) => current || linkedClientName);
              setCompanyName((current) => current || linkedCompanyName);
              setContactPerson((current) => current || linkedContactPerson);
              setEmail((current) => current || linkedEmail);
              setPhone((current) => current || linkedPhone);
            }
          }
        }

        type QuoteRow = {
          id: string;
          status: QuoteStatus;
          quote_title: string;
          quote_number: string;
          client_name: string | null;
          company_name: string | null;
          contact_person: string | null;
          client_email: string | null;
          client_phone: string | null;
          site_address: string | null;
          project_name: string | null;
          quote_date: string | null;
          expiry_date: string | null;
          optional_items_notes: string;
          scope_exclusions: string;
          assumptions: string;
          scope_notes: string;
          margin_percent: number | null;
          discount_amount: number | null;
          contingency_amount: number | null;
          gst_percent: number | null;
          validity_period: string | null;
          payment_terms: string;
          lead_time: string;
          terms_inclusions: string;
          terms_exclusions: string;
          clarifications: string;
          acceptance_notes: string;
        };

        const { data: quoteRows, error: quoteError } = await supabase
          .from("project_quotes")
          .select("*")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false })
          .limit(20);

        if (quoteError) throw new Error(quoteError.message);

        const selectedQuote = ((quoteRows ?? []).find((row) => row.status === "Accepted") ?? (quoteRows ?? []).find((row) => row.status === "Sent") ?? (quoteRows ?? [])[0] ?? null) as QuoteRow | null;

        if (!selectedQuote || cancelled) {
          const nextNumber = await resolveNextQuoteNumber(resolvedOrganizationId, resolvedProjectCode);
          if (!cancelled) {
            setQuoteNumber(nextNumber);
            setIsEditing(true);
          }
          setQuoteDate(new Date().toISOString().slice(0, 10));
          return;
        }

        setQuoteId(selectedQuote.id);
        setQuoteStatus(normalizeAllowedStatus(selectedQuote.status));
        setQuoteTitle(selectedQuote.quote_title);
        setQuoteNumber(selectedQuote.quote_number);
        setClientName(linkedClientName || selectedQuote.client_name || "");
        setCompanyName(linkedCompanyName || selectedQuote.company_name || "");
        setContactPerson(linkedContactPerson || selectedQuote.contact_person || "");
        setEmail(linkedEmail || selectedQuote.client_email || "");
        setPhone(linkedPhone || selectedQuote.client_phone || "");
        setSiteAddress(projectRow.location || selectedQuote.site_address || "");
        setProjectName(selectedQuote.project_name || projectRow.name);
        setQuoteDate(selectedQuote.quote_date ?? "");
        setExpiryDate(selectedQuote.expiry_date ?? "");
        setIsEditing(false);
        setOptionalItemsNotes(selectedQuote.optional_items_notes);
        setScopeExclusions(selectedQuote.scope_exclusions || selectedQuote.terms_exclusions || "");
        setAssumptions(selectedQuote.assumptions || "");
        setScopeNotes(selectedQuote.scope_notes || selectedQuote.clarifications || "");
        setMarginPercent(String(selectedQuote.margin_percent ?? 0));
        setDiscountAmount(String(selectedQuote.discount_amount ?? 0));
        setContingencyAmount(String(selectedQuote.contingency_amount ?? 0));
        setGstPercent(String(selectedQuote.gst_percent ?? 15));
        setValidityPeriod(selectedQuote.validity_period ?? "30 days");
        setPaymentTerms(selectedQuote.payment_terms);
        setLeadTime(selectedQuote.lead_time);
        setTermsInclusions(selectedQuote.terms_inclusions);
        setTermsExclusions(selectedQuote.terms_exclusions || selectedQuote.scope_exclusions || "");
        setClarifications(selectedQuote.clarifications || selectedQuote.scope_notes || "");
        setAcceptanceNotes(selectedQuote.acceptance_notes);

        const { data: itemRows, error: itemsError } = await supabase
          .from("project_quote_line_items")
          .select("id, section, description, quantity, unit, rate, is_optional, sort_order")
          .eq("organization_id", resolvedOrganizationId)
          .eq("quote_id", selectedQuote.id)
          .order("sort_order", { ascending: true });
        if (itemsError) throw new Error(itemsError.message);

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
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load quote.");
      } finally {
        if (!cancelled) {
          loadedSlugRef.current = routeProjectSlug;
          setIsLoadingQuote(false);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isAuthLoading, normalizeAllowedStatus, resolveNextQuoteNumber, routeProjectSlug, sessionOrganizationId, supabase, userId]);

  useEffect(() => {
    setHasLoadedScopeItems(false);
    setScopeCostItems([]);
    setSelectedScopeCostItemIds([]);
    setIsLoadingScopeItems(false);
  }, [dbProjectId, organizationId]);

  useEffect(() => {
    if (!isScopeImportOpen || hasLoadedScopeItems || !supabase || !organizationId || !dbProjectId) return;

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

        if (cancelled) return;

        if (!scopeRunsResult.error) {
          const tradeLabelByTradePackId = new Map((tradePacksResult.data ?? []).map((row) => [row.id, row.trade_label]));
          const normalizedItems = toScopeCostCategoryItems({
            runs: (scopeRunsResult.data ?? []) as Array<{ id: string; trade_pack_id: string; result_json: Record<string, unknown>; created_at: string }>,
            tradeLabelByTradePackId,
          });
          setScopeCostItems(normalizedItems);
        } else {
          setScopeCostItems([]);
        }
        setHasLoadedScopeItems(true);
      } finally {
        if (!cancelled) setIsLoadingScopeItems(false);
      }
    };

    void loadScopeItems();
    return () => { cancelled = true; };
  }, [dbProjectId, hasLoadedScopeItems, isScopeImportOpen, organizationId, supabase]);

  const addLineItem = (isOptional = false) => {
    setLineItems((current) => [...current, makeDefaultLineItem(isOptional)]);
  };

  const toggleScopeCostItem = (itemId: string) => {
    setSelectedScopeCostItemIds((current) =>
      current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId]
    );
  };

  const importSelectedScopeItems = () => {
    if (selectedScopeCostItemIds.length === 0) return;
    const selectedItems = availableScopeCostItems.filter((item) => selectedScopeCostItemIds.includes(item.id));
    if (selectedItems.length === 0) return;

    setLineItems((current) => {
      const existingDescriptions = new Set(current.map((item) => normalizeForMatch(item.description)));
      const importedItems: LineItem[] = [];
      for (const item of selectedItems) {
        const combinedDescription = item.description ? `${item.title} — ${item.description}` : item.title;
        const normalizedDescription = normalizeForMatch(combinedDescription);
        if (existingDescriptions.has(normalizedDescription)) continue;
        existingDescriptions.add(normalizedDescription);
        importedItems.push({ id: crypto.randomUUID(), section: "Item", description: combinedDescription, quantity: 1, unit: "Item", rate: 0, isOptional: false });
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
    if (!supabase || !session || !organizationId || !dbProjectId || !routeProjectSlug) {
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
      const payload = {
        organization_id: organizationId,
        project_id: dbProjectId,
        created_by: session.id,
        quote_title: trimmedTitle,
        quote_number: trimmedNumber,
        client_name: clientName.trim(),
        company_name: companyName.trim(),
        contact_person: contactPerson.trim(),
        client_email: email.trim(),
        client_phone: phone.trim(),
        site_address: siteAddress.trim(),
        project_name: projectName.trim(),
        quote_date: quoteDate || null,
        expiry_date: expiryDate || null,
        status: quoteStatus,
        optional_items_notes: optionalItemsNotes,
        scope_exclusions: scopeExclusions.trim(),
        assumptions: assumptions.trim(),
        scope_notes: scopeNotes.trim() || clarifications.trim(),
        subtotal: Number(pricingSummary.baseSubtotal.toFixed(2)),
        optional_subtotal: Number(pricingSummary.optionalSubtotal.toFixed(2)),
        margin_percent: Number(numberOrZero(marginPercent).toFixed(3)),
        margin_amount: Number(pricingSummary.margin.toFixed(2)),
        discount_amount: Number(numberOrZero(discountAmount).toFixed(2)),
        contingency_amount: Number(numberOrZero(contingencyAmount).toFixed(2)),
        gst_percent: Number(numberOrZero(gstPercent).toFixed(3)),
        gst_amount: Number(pricingSummary.gst.toFixed(2)),
        total_quote_price: Number(pricingSummary.grandTotal.toFixed(2)),
        validity_period: validityPeriod,
        payment_terms: paymentTerms,
        lead_time: leadTime,
        terms_inclusions: termsInclusions,
        terms_exclusions: termsExclusions.trim() || scopeExclusions.trim(),
        clarifications: clarifications.trim() || scopeNotes.trim(),
        acceptance_notes: acceptanceNotes,
      };

      let savedQuoteId = quoteId;

      if (quoteId) {
        const { data, error: updateError } = await supabase
          .from("project_quotes")
          .update(payload)
          .eq("id", quoteId)
          .select("id")
          .single();
        if (updateError) throw new Error(updateError.message);
        savedQuoteId = data.id;
      } else {
        const { data, error: insertError } = await supabase
          .from("project_quotes")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        savedQuoteId = data.id;
        setQuoteId(data.id);
      }

      const { error: deleteItemsError } = await supabase
        .from("project_quote_line_items")
        .delete()
        .eq("organization_id", organizationId)
        .eq("quote_id", savedQuoteId);
      if (deleteItemsError) throw new Error(deleteItemsError.message);

      if (lineItems.length > 0) {
        const itemsPayload = lineItems.map((item, index) => ({
          organization_id: organizationId,
          project_id: dbProjectId,
          quote_id: savedQuoteId,
          section: item.section,
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit: item.unit.trim(),
          rate: Number(item.rate),
          total: Number(lineItemTotal(item).toFixed(2)),
          is_optional: item.isOptional,
          sort_order: index,
        }));
        const { error: insertItemsError } = await supabase.from("project_quote_line_items").insert(itemsPayload);
        if (insertItemsError) throw new Error(insertItemsError.message);
      }

      if (!savedQuoteId) throw new Error("Quote was saved but no identifier was returned.");

      setQuoteId(savedQuoteId);
      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
      if (quoteStatus === "Expired") setSaveMessage("Quote marked as expired. Reprice required.");
      setIsEditing(false);
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

    const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete quote ${quoteNumber.trim() || quoteId}? This cannot be undone.`);
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    setSaveMessage(null);

    try {
      const { error: deleteItemsError } = await supabase
        .from("project_quote_line_items")
        .delete()
        .eq("organization_id", organizationId)
        .eq("quote_id", quoteId);
      if (deleteItemsError) throw new Error(deleteItemsError.message);

      const { error: deleteQuoteError } = await supabase
        .from("project_quotes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", quoteId);
      if (deleteQuoteError) throw new Error(deleteQuoteError.message);

      setQuoteId(null);
      setQuoteTitle("");
      setQuoteNumber("");
      setLineItems([makeDefaultLineItem()]);
      setIsEditing(true);
      setSaveMessage(null);
      loadedSlugRef.current = null;
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete quote.");
    } finally {
      setIsDeleting(false);
    }
  }, [canManageQuote, organizationId, quoteId, quoteNumber, supabase]);

  const exportQuotePdf = useCallback(() => {
    if (typeof window === "undefined") return;
    const html = buildQuotePdfHtml({
      lineItems,
      pricingSummary: pricingSummary as PricingSummary,
      showMarginBreakout,
      includeDiscountInExport,
      includeContingencyInExport,
      quoteDate,
      quoteNumber,
      organizationName,
      organizationLogoUrl,
      organizationBrandPrimaryColor: "",
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
    popup.onload = () => { popup.print(); };
    popup.onafterprint = () => { URL.revokeObjectURL(url); };
  }, [
    assumptions, clarifications, clientName, companyName, contactPerson, email, expiryDate,
    includeContingencyInExport, includeDiscountInExport, showMarginBreakout, gstPercent, lineItems,
    organizationLogoUrl, organizationName, phone, pricingSummary,
    projectName, quoteDate, quoteNumber, termsExclusions, termsInclusions, siteAddress,
  ]);

  return (
    <QuoteEditorLayout
      heroTitle="Quote"
      error={error}
      saveMessage={saveMessage}
      readOnlyMessage={!canManageQuote && session ? "You can review this quote, but only owner, admin, QS, and project manager roles can edit or delete it." : null}
      shouldShowEditor={shouldShowEditor}
      isLoadingQuote={isLoadingQuote}
      isHydratingExistingQuote={isHydratingExistingQuote}
      canManageQuote={canManageQuote}
      canDeleteQuote={canManageQuote}
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
        if (!canManageQuote) {
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
    />
  );
}
