"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteLineItemSection, QuoteStatus } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";

type LineItemSection = QuoteLineItemSection;

interface LineItem {
  id: string;
  section: LineItemSection;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  isOptional: boolean;
}

interface ScopeCostCategoryItem {
  id: string;
  title: string;
  description: string;
  tradeLabel: string;
  generatedAt: string;
}

function DescriptionInputWithPreview({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const hasContent = value.trim().length > 0;

  return (
    <div className="group relative">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 min-w-[200px] rounded-[8px]"
      />
      {hasContent ? (
        <div className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-30 w-[min(560px,70vw)] rounded-[14px] border border-[#E6ECF5] bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.14)] opacity-0 translate-y-1 transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <p className={`${interMedium.className} text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7F8FA7]`}>
            Full Description
          </p>
          <p className={`${interMedium.className} mt-1 text-sm font-medium leading-relaxed text-[#1F2E45]`}>{value}</p>
        </div>
      ) : null}
    </div>
  );
}

const STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = [
  { value: "Sent", label: "Sent" },
  { value: "Accepted", label: "Accepted" },
  { value: "Rejected", label: "Lost" },
  { value: "Expired", label: "Expired" },
];
const LINE_ITEM_SECTIONS: LineItemSection[] = ["Item", "Materials", "Labour", "Plant", "Subcontractors", "Preliminaries"];
const MAIN_LINE_GRID_TEMPLATE = "minmax(220px, 1.6fr) 130px 78px 78px 110px 110px";
const OPTIONAL_LINE_GRID_TEMPLATE = "minmax(260px, 1fr) 90px 90px 120px 130px";

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineItemTotal(item: LineItem) {
  return item.quantity * item.rate;
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

function makeDefaultLineItem(isOptional = false): LineItem {
  return {
    id: crypto.randomUUID(),
    section: "Labour",
    description: "",
    quantity: 1,
    unit: isOptional ? "Item" : "hr",
    rate: 0,
    isOptional,
  };
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deriveProjectCodeFromSlug(slug: string | null | undefined) {
  const normalized = (slug ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
  return normalized || "PRJ";
}

export default function PreconstructionQuotePage() {
  const params = useParams<{ projectId: string; quoteId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeQuoteId = params?.quoteId;
  const isNewQuoteRoute = routeQuoteId === "new";
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const [projectCode, setProjectCode] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
  const [scopeCostItems, setScopeCostItems] = useState<ScopeCostCategoryItem[]>([]);
  const [selectedScopeCostItemIds, setSelectedScopeCostItemIds] = useState<string[]>([]);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isQuoteContentHidden, setIsQuoteContentHidden] = useState(false);
  const loadedRouteRef = useRef<string | null>(null);

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
    if (!supabase || !userId || !routeProjectSlug || isAuthLoading) {
      return;
    }
    const routeKey = `${routeProjectSlug ?? ""}:${routeQuoteId ?? ""}`;
    if (loadedRouteRef.current === routeKey) {
      return;
    }

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
        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
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

        let projectRow:
          | {
              id: string;
              client_id: string | null;
              name: string;
              location: string;
              project_code: string | null;
              slug?: string | null;
            }
          | null = null;

        const withCodeResult = await supabase
          .from("organization_projects")
          .select("id, client_id, name, project_code, location")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();

        if (!withCodeResult.error && withCodeResult.data) {
          projectRow = withCodeResult.data as typeof projectRow;
        } else {
          const fallbackResult = await supabase
            .from("organization_projects")
            .select("id, client_id, name, slug, location")
            .eq("organization_id", resolvedOrganizationId)
            .eq("slug", routeProjectSlug)
            .maybeSingle();

          if (fallbackResult.error || !fallbackResult.data) {
            throw new Error(withCodeResult.error?.message ?? fallbackResult.error?.message ?? "Project not found.");
          }

          projectRow = {
            ...fallbackResult.data,
            project_code: null,
          };
        }

        if (!projectRow) {
          throw new Error("Project not found.");
        }

        if (cancelled) {
          return;
        }

        setOrganizationId(resolvedOrganizationId);
        const resolvedProjectCode = projectRow.project_code ?? deriveProjectCodeFromSlug(routeProjectSlug);

        setDbProjectId(projectRow.id);
        setProjectCode(resolvedProjectCode);
        setProjectName((current) => current || projectRow.name);
        setSiteAddress((current) => current || projectRow.location || "");
        setQuoteNumber((current) => current || `Q-${resolvedProjectCode}-1`);

        setIsLoadingScopeItems(true);
        const [scopeRunsResult, tradePacksResult] = await Promise.all([
          supabase
            .from("scope_runs")
            .select("id, trade_pack_id, result_json, created_at")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id)
            .eq("status", "complete")
            .order("created_at", { ascending: false })
            .limit(120),
          supabase
            .from("trade_packs")
            .select("id, trade_label")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id),
        ]);

        if (!cancelled) {
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
        }

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

        const { data: quoteRows, error: quoteError } = await supabase
          .from("project_quotes")
          .select("*")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false })
          .limit(20);
        if (quoteError) {
          throw new Error(quoteError.message);
        }

        let selectedQuote: (typeof quoteRows extends (infer U)[] ? U : never) | null = null;
        if (!isNewQuoteRoute) {
          if (routeQuoteId) {
            selectedQuote = (quoteRows ?? []).find((row) => row.id === routeQuoteId) ?? null;
          }
          if (!selectedQuote) {
            selectedQuote = (quoteRows ?? []).find((row) => row.status === "Sent") ?? (quoteRows ?? [])[0] ?? null;
          }
        }

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
          .from("project_quote_line_items")
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
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load quote.");
        }
      } finally {
        if (!cancelled) {
          loadedRouteRef.current = `${routeProjectSlug ?? ""}:${routeQuoteId ?? ""}`;
          setIsLoadingQuote(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isNewQuoteRoute, normalizeAllowedStatus, resolveNextQuoteNumber, routeProjectSlug, routeQuoteId, sessionOrganizationId, supabase, userId]);

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
    if (!supabase || !session || !organizationId || !dbProjectId || !routeProjectSlug) {
      setError("Quote save is not ready. Please refresh and try again.");
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
        scope_exclusions: scopeExclusions,
        assumptions,
        scope_notes: scopeNotes,
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
        terms_exclusions: termsExclusions,
        clarifications,
        acceptance_notes: acceptanceNotes,
      };

      let resolvedQuoteId = quoteId;

      if (quoteId) {
        const { data, error: updateError } = await supabase
          .from("project_quotes")
          .update(payload)
          .eq("id", quoteId)
          .select("id, updated_at")
          .single();
        if (updateError) {
          throw new Error(updateError.message);
        }
        resolvedQuoteId = data.id;
      } else {
        const { data, error: insertError } = await supabase.from("project_quotes").insert(payload).select("id, updated_at").single();
        if (insertError) {
          throw new Error(insertError.message);
        }
        resolvedQuoteId = data.id;
        setQuoteId(data.id);
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/quote/${data.id}`);
      }

      const { error: deleteItemsError } = await supabase
        .from("project_quote_line_items")
        .delete()
        .eq("organization_id", organizationId)
        .eq("quote_id", resolvedQuoteId);
      if (deleteItemsError) {
        throw new Error(deleteItemsError.message);
      }

      if (lineItems.length > 0) {
        const itemsPayload = lineItems.map((item, index) => ({
          organization_id: organizationId,
          project_id: dbProjectId,
          quote_id: resolvedQuoteId,
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
        if (insertItemsError) {
          throw new Error(insertItemsError.message);
        }
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

    const lineItemsRows = lineItems.length > 0
      ? lineItems
          .map((item) => {
            const description = item.description.trim() || "Untitled line item";
            return `
              <tr>
                <td>${escapeHtml(description)}</td>
                <td>${escapeHtml(item.section)}</td>
                <td class="right">${item.quantity}</td>
                <td>${escapeHtml(item.unit || "-")}</td>
                <td class="right">${toMoney(item.rate)}</td>
                <td class="right">${toMoney(lineItemTotal(item))}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="6" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

    const issuedDate = toDayMonthYearLabel(quoteDate || new Date().toISOString().slice(0, 10));
    const printableTitle = quoteTitle.trim() || "Quote";
    const printableNumber = quoteNumber.trim() || "Unassigned";
    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName.trim() || "Project";
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;
    const optionalPricingRows = [
      includeMarginInExport ? `<div class="row"><span class="k">Margin</span><span class="v">${toMoney(pricingSummary.margin)}</span></div>` : "",
      includeDiscountInExport ? `<div class="row"><span class="k">Discount</span><span class="v">-${toMoney(pricingSummary.discount)}</span></div>` : "",
      includeContingencyInExport ? `<div class="row"><span class="k">Contingency</span><span class="v">${toMoney(pricingSummary.contingency)}</span></div>` : "",
    ].join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportDocumentTitle)}</title>
    <style>
      :root {
        --navy: #082851;
        --orange: #F74917;
        --text: #0F172A;
        --muted: #64748B;
        --border: #E2E8F0;
      }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
      html, body { margin: 0; padding: 0; background: #fff; color: var(--text); }
      body { font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; line-height: 1.4; }
      .doc { position: relative; min-height: calc(297mm - 30mm); }
      .accent { height: 3px; background: var(--orange); margin-bottom: 14px; }
      .header {
        display: grid;
        grid-template-columns: 1fr 320px;
        column-gap: 24px;
        align-items: start;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .logo-img { width: 100%; height: 100%; object-fit: contain; }
      .logo-fallback {
        width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--border); color: var(--navy); font-weight: 700; letter-spacing: 0.06em;
      }
      .company-name { margin: 0; color: var(--navy); font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
      .header-meta dl { margin: 0; }
      .header-meta .row {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 8px;
        padding: 2px 0;
      }
      .header-meta dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .header-meta dd { margin: 0; color: var(--text); font-weight: 600; }
      .title-block { padding: 16px 0 14px; border-bottom: 1px solid var(--border); }
      .quote-title { margin: 0; color: var(--navy); font-size: 34px; line-height: 1.05; letter-spacing: -0.02em; }
      .details { padding: 12px 0; border-bottom: 1px solid var(--border); }
      .details-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 22px; row-gap: 6px; }
      .details-row { display: grid; grid-template-columns: 94px 1fr; gap: 10px; }
      .details-row .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .details-row .v { color: var(--text); font-weight: 600; }
      .section-title {
        margin: 16px 0 8px;
        color: var(--navy);
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead th {
        background: #F8FAFC;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 10px;
        font-weight: 700;
        text-align: left;
        padding: 8px 8px;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
      }
      tbody td {
        padding: 8px;
        border-bottom: 1px solid #EEF2F7;
        color: var(--text);
        vertical-align: top;
        word-break: break-word;
      }
      .right { text-align: right; }
      .totals {
        margin-top: 10px;
        margin-left: auto;
        width: 360px;
      }
      .totals .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 3px 0;
      }
      .totals .k { color: var(--muted); }
      .totals .v { text-align: right; font-weight: 600; }
      .totals .divider { border-top: 2px solid var(--navy); margin-top: 6px; padding-top: 8px; }
      .totals .final .k,
      .totals .final .v { color: var(--navy); font-weight: 800; font-size: 22px; line-height: 1.05; }
      .terms { margin-top: 18px; }
      .term-section { margin: 0 0 14px; break-inside: avoid; page-break-inside: avoid; }
      .term-section h3 {
        margin: 0 0 4px;
        color: var(--navy);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .term-section p {
        margin: 0;
        color: var(--text);
        font-size: 12px;
        white-space: pre-wrap;
      }
      .doc-footer {
        margin-top: 14px;
        padding-top: 8px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        color: var(--muted);
        font-size: 10px;
      }
      .doc-footer .page::before { content: counter(page); }
      @media print {
        .doc { min-height: auto; }
      }
    </style>
  </head>
  <body>
    <main class="doc">
      <div class="accent"></div>
      <header class="header">
        <div class="brand">
          <div class="logo-wrap">${logoMarkup}</div>
          <div>
            <p class="company-name">${escapeHtml(printableOrgName)}</p>
          </div>
        </div>
        <div class="header-meta">
          <dl>
            <div class="row"><dt>Quote #</dt><dd>${escapeHtml(printableNumber)}</dd></div>
            <div class="row"><dt>Issued</dt><dd>${escapeHtml(issuedDate)}</dd></div>
            <div class="row"><dt>Expiry</dt><dd>${escapeHtml(toDayMonthYearLabel(expiryDate))}</dd></div>
          </dl>
        </div>
      </header>

      <section class="title-block">
        <h1 class="quote-title">${escapeHtml(printableTitle)}</h1>
      </section>

      <section class="details">
        <div class="details-grid">
          <div class="details-row"><span class="k">Client</span><span class="v">${escapeHtml(clientName || "-")}</span></div>
          <div class="details-row"><span class="k">Company</span><span class="v">${escapeHtml(companyName || "-")}</span></div>
          <div class="details-row"><span class="k">Phone</span><span class="v">${escapeHtml(phone || "-")}</span></div>
          <div class="details-row"><span class="k">Email</span><span class="v">${escapeHtml(email || "-")}</span></div>
          <div class="details-row"><span class="k">Site</span><span class="v">${escapeHtml(siteAddress || "-")}</span></div>
          <div class="details-row"><span class="k">Project</span><span class="v">${escapeHtml(projectName || "-")}</span></div>
        </div>
      </section>

      <h2 class="section-title">Line Items</h2>
      <table>
        <thead>
          <tr>
            <th style="width:33%">Description</th>
            <th style="width:17%">Section</th>
            <th class="right" style="width:10%">Qty</th>
            <th style="width:10%">Unit</th>
            <th class="right" style="width:15%">Rate</th>
            <th class="right" style="width:15%">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>

      <section class="totals">
        <div class="row"><span class="k">Subtotal</span><span class="v">${toMoney(pricingSummary.baseSubtotal)}</span></div>
        ${optionalPricingRows}
        <div class="row"><span class="k">GST</span><span class="v">${toMoney(pricingSummary.gst)}</span></div>
        <div class="row"><span class="k">Optional Items</span><span class="v">${toMoney(pricingSummary.optionalSubtotal)}</span></div>
        <div class="divider final">
          <div class="row"><span class="k">Total</span><span class="v">${toMoney(pricingSummary.grandTotal)}</span></div>
        </div>
      </section>

      <section class="terms">
        <h2 class="section-title">Terms & Scope</h2>
        <div class="term-section"><h3>Inclusions</h3><p>${escapeHtml(termsInclusions || "-")}</p></div>
        <div class="term-section"><h3>Exclusions</h3><p>${escapeHtml(termsExclusions || "-")}</p></div>
        <div class="term-section"><h3>Clarifications</h3><p>${escapeHtml(clarifications || "-")}</p></div>
        <div class="term-section"><h3>Assumptions</h3><p>${escapeHtml(assumptions || "-")}</p></div>
        <div class="term-section"><h3>Payment terms</h3><p>${escapeHtml(paymentTerms || "-")}</p></div>
        <div class="term-section"><h3>Lead time</h3><p>${escapeHtml(leadTime || "-")}</p></div>
        <div class="term-section"><h3>Acceptance notes</h3><p>${escapeHtml(acceptanceNotes || "-")}</p></div>
      </section>

      <footer class="doc-footer">
        <span>${escapeHtml(printableOrgName)} • ${escapeHtml(printableNumber)}</span>
        <span class="page">Page </span>
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
  }, [
    assumptions,
    acceptanceNotes,
    clarifications,
    clientName,
    companyName,
    email,
    expiryDate,
    includeContingencyInExport,
    includeDiscountInExport,
    includeMarginInExport,
    lineItems,
    leadTime,
    organizationLogoUrl,
    organizationName,
    phone,
    pricingSummary.baseSubtotal,
    pricingSummary.contingency,
    pricingSummary.discount,
    pricingSummary.grandTotal,
    pricingSummary.gst,
    pricingSummary.margin,
    pricingSummary.optionalSubtotal,
    projectName,
    quoteDate,
    quoteNumber,
    quoteTitle,
    termsExclusions,
    termsInclusions,
    paymentTerms,
    siteAddress,
  ]);

  if (isLoadingQuote) {
    return (
      <div className="rounded-[12px] border border-[#E6EAF0] bg-white px-4 py-4 sm:px-5">
        <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>Loading quote...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          asChild
          className={`${interMedium.className} h-8 rounded-[8px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
        >
          <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Quote Register
          </Link>
        </Button>
      </div>

      <Card className={`shadow-none ${shouldShowEditor ? "border-[#E6EAF0] bg-white" : "border-[#E6EAF0] bg-white"}`}>
        <CardHeader className={`${shouldShowEditor ? "pb-5 pt-6" : "pb-4 pt-4"}`}>
          <div className={`flex flex-wrap items-start justify-between ${shouldShowEditor ? "gap-4" : "gap-3"}`}>
            <div>
              <CardTitle className={`${shouldShowEditor ? "text-[26px] sm:text-[34px]" : "text-[24px] sm:text-[30px]"} font-semibold leading-none tracking-[-0.03em] text-[#0F172A]`}>
                {shouldShowEditor ? `Quote - ${projectName || "Project Name"}` : quoteTitle || "Quote Overview"}
              </CardTitle>
              {!shouldShowEditor ? (
                <div className={`${interMedium.className} mt-2 space-y-0.5 text-sm font-medium text-[#64748B]`}>
                  <p className="text-[#4f5f77]">{companyName || "No company"}</p>
                </div>
              ) : (
                <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>{companyName || "No company"}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsQuoteContentHidden((current) => !current)}
                className={`${interMedium.className} h-10 rounded-[10px] border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}
                aria-expanded={!isQuoteContentHidden}
                aria-label={isQuoteContentHidden ? "Show quote content" : "Hide quote content"}
              >
                {isQuoteContentHidden ? "Show" : "Hide"}
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isQuoteContentHidden ? "-rotate-90" : "rotate-0"}`} />
              </Button>
              {shouldShowEditor ? (
                <>
                  <select
                    value={quoteStatus}
                    onChange={(event) => setQuoteStatus(event.target.value as QuoteStatus)}
                    className={`${interMedium.className} h-10 rounded-[10px] border border-[#cfd7e4] bg-white px-3 text-sm text-[#1d2433]`}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    onClick={saveQuote}
                    disabled={isSaving}
                    className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
                  >
                    {isSaving ? "Saving..." : "Save Quote"}
                  </Button>
                  <Button
                    type="button"
                    onClick={exportQuotePdf}
                    disabled={isSaving}
                    variant="outline"
                    className={`${interMedium.className} h-10 rounded-[10px] border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}
                  >
                    Export PDF
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={isSaving}
                    variant="outline"
                    className={`${interMedium.className} h-9 rounded-[10px] border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}
                  >
                    Edit Quote
                  </Button>
                  <Button
                    type="button"
                    onClick={exportQuotePdf}
                    disabled={isSaving}
                    variant="outline"
                    className={`${interMedium.className} h-9 rounded-[10px] border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}
                  >
                    Export PDF
                  </Button>
                </>
              )}
            </div>
          </div>
          {error ? (
            <p className={`${interMedium.className} mt-4 rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
          ) : null}
          {saveMessage ? <p className={`${interMedium.className} mt-2 text-xs font-medium text-[#5f6f89]`}>{saveMessage}</p> : null}
        </CardHeader>
      </Card>

      {isQuoteContentHidden ? null : shouldShowEditor ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[12px] border border-[#E6EAF0] bg-white px-3 py-4 sm:px-5">
          <section className="border-b border-[#E8EDF5] pb-5">
            <button
              type="button"
              onClick={() => setIsQuoteDetailsOpen((current) => !current)}
              className="flex w-full items-center justify-between"
            >
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Quote Details</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isQuoteDetailsOpen ? "rotate-180" : ""}`} />
            </button>

            {isQuoteDetailsOpen ? (
              <div className="mt-4 space-y-5">
                <div>
                  <p className={`${interMedium.className} mb-3 text-sm font-semibold text-[#24324a]`}>Project & Quote</p>
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Quote title</label>
                        <Input value={quoteTitle} onChange={(event) => setQuoteTitle(event.target.value)} placeholder="Kitchen renovation quote" className="h-10 rounded-[8px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Status</label>
                        <select
                          value={quoteStatus}
                          onChange={(event) => setQuoteStatus(event.target.value as QuoteStatus)}
                          className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d1d9e6] bg-white px-3 text-sm text-[#1d2433]`}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Project name</label>
                        <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="h-10 rounded-[8px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Quote date</label>
                        <Input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} className="h-10 rounded-[8px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Expiry date</label>
                        <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="h-10 rounded-[8px]" />
                      </div>
                    </div>
                    <div className="max-w-[320px] space-y-1.5">
                      <label className={`${interMedium.className} block text-xs font-medium text-[#64748B]`}>Quote number</label>
                      <Input value={quoteNumber} readOnly placeholder="Q-26001-1" className="h-10 rounded-[8px] bg-[#f8fafc]" />
                    </div>
                  </div>
                </div>

              </div>
            ) : null}
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <button
              type="button"
              onClick={() => setIsLineItemsOpen((current) => !current)}
              className="flex w-full items-center justify-between"
            >
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Line Items</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isLineItemsOpen ? "rotate-180" : ""}`} />
            </button>

            {isLineItemsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => addLineItem(false)} className={`${interMedium.className} h-9 rounded-[8px] bg-[#F74917] px-3 text-xs font-medium text-white hover:bg-[#e63f10]`}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Item
                  </Button>
                  <Button type="button" onClick={() => addLineItem(true)} variant="outline" className={`${interMedium.className} h-9 rounded-[8px] border-[#d3dbe8] bg-white px-3 text-xs font-medium text-[#1d2433]`}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Optional
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsScopeImportOpen((current) => !current)}
                    className={`${interMedium.className} h-9 rounded-[8px] border-[#d3dbe8] bg-white px-3 text-xs font-medium text-[#1d2433]`}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Import Scope Items
                  </Button>
                </div>

              {isScopeImportOpen ? (
                <div className="rounded-[10px] border border-[#E5EAF2] bg-[#FCFDFE] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className={`${interMedium.className} text-sm font-semibold text-[#24324A]`}>Cost Breakdown Categories</p>
                    <Button
                      type="button"
                      onClick={importSelectedScopeItems}
                      disabled={selectedScopeCostItemIds.length === 0}
                      className={`${interMedium.className} h-8 rounded-[8px] bg-[#F74917] px-3 text-xs font-medium text-white hover:bg-[#e63f10] disabled:opacity-50`}
                    >
                      Add Selected ({selectedScopeCostItemIds.length})
                    </Button>
                  </div>
                  {isLoadingScopeItems ? (
                    <p className={`${interMedium.className} text-xs font-medium text-[#6B7D96]`}>Loading Scope Builder items...</p>
                  ) : availableScopeCostItems.length > 0 ? (
                    <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                      {availableScopeCostItems.map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-[8px] border border-[#E6ECF5] bg-white px-2.5 py-2">
                          <input
                            type="checkbox"
                            checked={selectedScopeCostItemIds.includes(item.id)}
                            onChange={() => toggleScopeCostItem(item.id)}
                            className="mt-0.5 h-4 w-4 rounded border-[#cfd8e6]"
                          />
                          <span className="min-w-0">
                            <span className={`${interMedium.className} block text-xs font-semibold text-[#23344D]`}>{item.title}</span>
                            {item.description ? (
                              <span className={`${interMedium.className} mt-0.5 block text-xs font-medium text-[#64748B]`}>
                                {item.description}
                              </span>
                            ) : null}
                            <span className={`${interMedium.className} mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8697AE]`}>
                              {item.tradeLabel} · {toDayMonthYearLabel(item.generatedAt)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className={`${interMedium.className} text-xs font-medium text-[#6B7D96]`}>
                      No completed Scope Builder items found for this lead workspace.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="hidden rounded-[10px] border border-[#E5EAF2] overflow-visible md:block">
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div
                      className={`${interMedium.className} grid items-center gap-2 bg-[#F8FAFC] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.1em] text-[#607089]`}
                      style={{ gridTemplateColumns: MAIN_LINE_GRID_TEMPLATE }}
                    >
                      <span>Description</span>
                      <span>Section</span>
                      <span>Qty</span>
                      <span>Unit</span>
                      <span>Rate</span>
                      <span className="text-right">Total</span>
                    </div>
                    <div className="divide-y divide-[#EEF2F7]">
                      {mainLineItems.map((item) => (
                        <div key={item.id} className="group grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: MAIN_LINE_GRID_TEMPLATE }}>
                          <DescriptionInputWithPreview
                            value={item.description}
                            onChange={(value) => updateLineItem(item.id, "description", value)}
                            placeholder="Description"
                          />
                          <select
                            value={item.section}
                            onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                            className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d6dfeb] bg-white px-2 text-sm text-[#1d2433]`}
                          >
                            {LINE_ITEM_SECTIONS.map((section) => (
                              <option key={section} value={section}>
                                {section}
                              </option>
                            ))}
                          </select>
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[8px] px-2" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[8px] px-2" />
                          <div className="relative w-[100px]">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-10 w-[100px] rounded-[8px] pl-6 pr-2"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeLineItem(item.id)}
                              className="h-8 w-8 rounded-[8px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
                              aria-label="Delete line item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {mainLineItems.length === 0 ? (
                        <div className={`${interMedium.className} px-3 py-5 text-center text-sm text-[#73839a]`}>No main line items yet.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:hidden">
                <p className={`${interMedium.className} px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6E7F97]`}>Main line items</p>
                {mainLineItems.map((item) => (
                  <div key={item.id} className="space-y-2 rounded-[10px] border border-[#E5EAF2] bg-[#FAFCFF] p-3">
                    <DescriptionInputWithPreview
                      value={item.description}
                      onChange={(value) => updateLineItem(item.id, "description", value)}
                      placeholder="Description"
                    />
                    <select
                      value={item.section}
                      onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                      className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d6dfeb] bg-white px-2 text-sm text-[#1d2433]`}
                    >
                      {LINE_ITEM_SECTIONS.map((section) => (
                        <option key={section} value={section}>
                          {section}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-full rounded-[8px] px-2" />
                      <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-full rounded-[8px] px-2" />
                      <div className="relative">
                        <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                        <Input
                          type="number"
                          value={item.rate === 0 ? "" : item.rate}
                          onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                          className="h-10 w-full rounded-[8px] pl-6 pr-2"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeLineItem(item.id)}
                        className="h-8 w-8 rounded-[8px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
                        aria-label="Delete line item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {mainLineItems.length === 0 ? (
                  <div className={`${interMedium.className} rounded-[10px] border border-[#E5EAF2] px-3 py-4 text-center text-sm text-[#73839a]`}>No main line items yet.</div>
                ) : null}
              </div>

              <div className="hidden rounded-[10px] border border-[#E5EAF2] overflow-visible md:block">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div
                      className={`${interMedium.className} grid items-center gap-2 bg-[#FAFBFD] px-3 py-2 text-left text-[11px] uppercase tracking-[0.08em] text-[#6E7F97]`}
                      style={{ gridTemplateColumns: OPTIONAL_LINE_GRID_TEMPLATE }}
                    >
                      <span>Optional Items</span>
                      <span>Qty</span>
                      <span>Unit</span>
                      <span>Rate</span>
                      <span className="text-right">Total</span>
                    </div>
                    <div className="divide-y divide-[#EEF2F7]">
                      {optionalLineItems.map((item) => (
                        <div key={item.id} className="group grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: OPTIONAL_LINE_GRID_TEMPLATE }}>
                          <DescriptionInputWithPreview
                            value={item.description}
                            onChange={(value) => updateLineItem(item.id, "description", value)}
                            placeholder="Optional add-on"
                          />
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[8px] px-2" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[8px] px-2" />
                          <div className="relative w-[100px]">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-10 w-[100px] rounded-[8px] pl-6 pr-2"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeLineItem(item.id)}
                              className="h-8 w-8 rounded-[8px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
                              aria-label="Delete optional line item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {optionalLineItems.length === 0 ? (
                        <div className={`${interMedium.className} px-3 py-3 text-center text-xs text-[#7e8ca2]`}>No optional items yet.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:hidden">
                <p className={`${interMedium.className} px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6E7F97]`}>Optional items</p>
                {optionalLineItems.map((item) => (
                  <div key={item.id} className="space-y-2 rounded-[10px] border border-[#E5EAF2] bg-white p-3">
                    <DescriptionInputWithPreview
                      value={item.description}
                      onChange={(value) => updateLineItem(item.id, "description", value)}
                      placeholder="Optional add-on"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-full rounded-[8px] px-2" />
                      <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-full rounded-[8px] px-2" />
                      <div className="relative">
                        <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                        <Input
                          type="number"
                          value={item.rate === 0 ? "" : item.rate}
                          onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                          className="h-10 w-full rounded-[8px] pl-6 pr-2"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeLineItem(item.id)}
                        className="h-8 w-8 rounded-[8px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
                        aria-label="Delete optional line item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {optionalLineItems.length === 0 ? (
                  <div className={`${interMedium.className} rounded-[10px] border border-[#E5EAF2] px-3 py-4 text-center text-xs text-[#7e8ca2]`}>No optional items yet.</div>
                ) : null}
              </div>

                <div>
                  <p className={`${interMedium.className} mb-2 text-sm font-semibold text-[#24324a]`}>Section totals</p>
                  <div className={`${interMedium.className} space-y-1.5 text-sm font-medium text-[#334155]`}>
                    {LINE_ITEM_SECTIONS.map((section) => (
                      <p key={section} className="flex items-center justify-between">
                        <span className="text-[#64748B]">{section}</span>
                        <span>{toMoney(sectionSubtotals.get(section) ?? 0)}</span>
                      </p>
                    ))}
                  </div>
                </div>

              </div>
            ) : null}
          </section>

          <section className="pt-5">
            <button
              type="button"
              onClick={() => setIsTermsOpen((current) => !current)}
              className="flex w-full items-center justify-between"
            >
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Terms & Clarifications</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isTermsOpen ? "rotate-180" : ""}`} />
            </button>
            {isTermsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Validity period</label>
                    <Input value={validityPeriod} onChange={(event) => setValidityPeriod(event.target.value)} className="h-10 rounded-[8px]" />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Payment terms</label>
                    <Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} className="h-10 rounded-[8px]" />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Lead time</label>
                    <Input value={leadTime} onChange={(event) => setLeadTime(event.target.value)} className="h-10 rounded-[8px]" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Inclusions</label>
                  <textarea value={termsInclusions} onChange={(event) => setTermsInclusions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[8px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Exclusions</label>
                  <textarea value={termsExclusions} onChange={(event) => setTermsExclusions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[8px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Clarifications</label>
                  <textarea value={clarifications} onChange={(event) => setClarifications(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[8px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Assumptions</label>
                  <textarea value={assumptions} onChange={(event) => setAssumptions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[8px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
              </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Card className="border-[#E6EAF0] bg-white shadow-none">
            <CardHeader className="pb-3 pt-5">
              <CardTitle className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">Pricing Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-5">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Margin (%)</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIncludeMarginInExport((current) => !current)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      includeMarginInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-white text-[#64748B]"
                    }`}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Include
                  </Button>
                </div>
                <Input
                  type="number"
                  value={marginPercent === "0" ? "" : marginPercent}
                  onChange={(event) => setMarginPercent(event.target.value)}
                  className="h-10 rounded-[8px]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Discount</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIncludeDiscountInExport((current) => !current)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      includeDiscountInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-white text-[#64748B]"
                    }`}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Include
                  </Button>
                </div>
                <Input
                  type="number"
                  value={discountAmount === "0" ? "" : discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                  className="h-10 rounded-[8px]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Contingency</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIncludeContingencyInExport((current) => !current)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      includeContingencyInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-white text-[#64748B]"
                    }`}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Include
                  </Button>
                </div>
                <Input
                  type="number"
                  value={contingencyAmount === "0" ? "" : contingencyAmount}
                  onChange={(event) => setContingencyAmount(event.target.value)}
                  className="h-10 rounded-[8px]"
                />
              </div>
              <div className="grid gap-2">
                <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>GST (%)</label>
                <Input type="number" value={gstPercent} onChange={(event) => setGstPercent(event.target.value)} className="h-10 rounded-[8px]" />
              </div>

              <div className="h-px bg-[#E7ECF3]" />

              <div className={`${interMedium.className} space-y-1.5 text-sm font-medium text-[#334155]`}>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Subtotal</span><span>{toMoney(pricingSummary.baseSubtotal)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Margin</span><span>{toMoney(pricingSummary.margin)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Discount</span><span>-{toMoney(pricingSummary.discount)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Contingency</span><span>{toMoney(pricingSummary.contingency)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">GST</span><span>{toMoney(pricingSummary.gst)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Optional Items</span><span>{toMoney(pricingSummary.optionalSubtotal)}</span></p>
              </div>

              <div className="rounded-[10px] bg-[#04234D] px-4 py-3 text-white">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.08em] text-white/70`}>Total Quote Price</p>
                <p className="mt-1 text-[32px] font-semibold leading-none">{toMoney(pricingSummary.grandTotal)}</p>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveQuote} disabled={isSaving} className={`${interMedium.className} h-10 w-full rounded-[10px] bg-[#F74917] text-sm font-medium text-white hover:bg-[#e63f10]`}>
                  {isSaving ? "Saving..." : "Save Quote"}
                </Button>
                <Button type="button" onClick={exportQuotePdf} disabled={isSaving} variant="outline" className={`${interMedium.className} h-10 w-full rounded-[10px] border-[#d3dbe8] bg-white text-sm font-medium text-[#1d2433]`}>
                  Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      ) : (
        <div className="space-y-7">
          <section className="rounded-[12px] border border-[#E6EAF0] bg-white px-5 py-4">
            <div className="mb-3 border-b border-[#E2E8F0] pb-2.5">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Quote Summary</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="mt-1 text-[40px] font-semibold leading-none text-[#082851]">{toMoney(pricingSummary.grandTotal)}</p>
              </div>
              <div className={`${interMedium.className} grid gap-y-2 text-sm font-medium text-[#334155]`}>
              </div>
            </div>
          </section>

          <div className="space-y-7">
            <section className="rounded-[12px] border border-[#E6EAF0] bg-white px-4 py-3">
              <div className="mb-3 flex items-end justify-between border-b border-[#E2E8F0] pb-2.5">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Quote Details</h2>
              </div>
              <div className={`${interMedium.className} grid gap-x-8 gap-y-2 text-sm font-medium text-[#0F172A] md:grid-cols-2`}>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Client</span><span>{clientName || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Site</span><span>{siteAddress || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Project</span><span>{projectName || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Issued</span><span>{toDayMonthYearLabel(quoteDate)}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Quote #</span><span>{quoteNumber || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Expiry</span><span>{toDayMonthYearLabel(expiryDate)}</span></div>
              </div>
            </section>

            <section className="rounded-[12px] border border-[#dbe3ef] bg-white">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E2E8F0] px-5 pb-3 pt-4">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Line Items</h2>
              </div>
              <div className="overflow-x-auto">
                <table className={`${interMedium.className} min-w-full border-collapse text-left text-sm font-medium text-[#0F172A]`}>
                  <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Section</th>
                      <th className="px-4 py-3 text-right font-semibold">Qty</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 text-right font-semibold">Rate</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => (
                      <tr key={item.id} className={index === 0 ? "" : "border-t border-[#E2E8F0]"}>
                        <td className="px-4 py-3">{item.description || "Untitled item"}</td>
                        <td className="px-4 py-3">{item.section}{item.isOptional ? " (Optional)" : ""}</td>
                        <td className="px-4 py-3 text-right">{item.quantity}</td>
                        <td className="px-4 py-3">{item.unit || "—"}</td>
                        <td className="px-4 py-3 text-right">{toMoney(item.rate)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{toMoney(lineItemTotal(item))}</td>
                      </tr>
                    ))}
                    {lineItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-center text-[#64748B]" colSpan={6}>
                          No line items added yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[#E2E8F0] px-5 py-3">
                <div className={`${interMedium.className} ml-auto max-w-[320px] text-xs font-medium text-[#334155]`}>
                  <p className="flex items-center justify-between gap-3 text-sm font-semibold text-[#082851]">
                    <span>Total</span>
                    <span>{toMoney(pricingSummary.grandTotal)}</span>
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[12px] border border-[#eef2f7] bg-[#fcfdff] px-5 py-4">
              <div className="mb-3 border-b border-[#E2E8F0] pb-2.5">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Terms & Clarifications</h2>
              </div>
              <div className={`${interMedium.className} grid gap-3 text-sm font-medium text-[#0F172A]`}>
                <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#eef3f8] pb-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Inclusions</p><p>{termsInclusions || "—"}</p></div>
                <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#eef3f8] pb-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Exclusions</p><p>{termsExclusions || "—"}</p></div>
                <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#eef3f8] pb-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Clarifications</p><p>{clarifications || "—"}</p></div>
                <div className="grid grid-cols-[130px_1fr] gap-3"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Assumptions</p><p>{assumptions || "—"}</p></div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
