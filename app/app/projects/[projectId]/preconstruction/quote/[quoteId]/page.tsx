"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteLineItemSection, QuoteStatus } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import styles from "@/components/app/trade-pack-builder.module.css";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePreviewPosition = useCallback(() => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }
    const rect = inputElement.getBoundingClientRect();
    setPreviewPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.min(560, Math.max(rect.width, 280)),
    });
  }, []);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const handleReposition = () => updatePreviewPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isPreviewOpen, updatePreviewPosition]);

  const openPreview = useCallback(() => {
    if (!hasContent) {
      return;
    }
    updatePreviewPosition();
    setIsPreviewOpen(true);
  }, [hasContent, updatePreviewPosition]);

  const closePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
        onFocus={openPreview}
        onBlur={closePreview}
        placeholder={placeholder}
        title={value.trim() || placeholder || ""}
        className="h-10 min-w-[200px] rounded-[6px]"
      />
      {hasContent && isPreviewOpen && previewPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[300] rounded-[6px] border border-[#E6ECF5] bg-[#F8F9FC] p-3 shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
              style={{
                top: previewPosition.top,
                left: previewPosition.left,
                width: previewPosition.width,
              }}
            >
              <p className={`${interMedium.className} text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7F8FA7]`}>
                Full Description
              </p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium leading-relaxed text-[#1F2E45]`}>{value}</p>
            </div>,
            document.body,
          )
        : null}
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
  const searchParams = useSearchParams();
  const routeMode = searchParams.get("mode");
  const { session, isLoading: isAuthLoading } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

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
  const [organizationBrandPrimaryColor, setOrganizationBrandPrimaryColor] = useState("");
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
  const shouldShowEditor = routeMode === "edit" || isEditing || !quoteId;
  const isHydratingExistingQuote = isLoadingQuote && !isNewQuoteRoute;

  useEffect(() => {
    if (!routeProjectSlug || !routeQuoteId || isNewQuoteRoute) {
      return;
    }

    if (routeMode !== "edit") {
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/quote/${routeQuoteId}?mode=edit`);
    }
  }, [isNewQuoteRoute, routeMode, routeProjectSlug, routeQuoteId, router]);

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
          .select("name, logo_path, brand_primary_color")
          .eq("id", resolvedOrganizationId)
          .maybeSingle();
        if (!cancelled) {
          setOrganizationName(organizationRow?.name ?? "");
          setOrganizationBrandPrimaryColor((organizationRow?.brand_primary_color ?? "").trim());
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
          projectRow = {
            ...withCodeResult.data,
            project_code: withCodeResult.data.project_code ?? null,
          };
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

        let selectedQuote: QuoteRow | null = null;
        if (!isNewQuoteRoute && routeQuoteId) {
          const { data: quoteById, error: quoteByIdError } = await supabase
            .from("project_quotes")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .eq("project_id", projectRow.id)
            .eq("id", routeQuoteId)
            .maybeSingle();

          if (quoteByIdError) {
            throw new Error(quoteByIdError.message);
          }

          selectedQuote = (quoteById as QuoteRow | null) ?? null;
        } else if (!isNewQuoteRoute) {
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

          selectedQuote = ((quoteRows ?? []).find((row) => row.status === "Sent") ?? (quoteRows ?? [])[0] ?? null) as QuoteRow | null;
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

  useEffect(() => {
    setHasLoadedScopeItems(false);
    setScopeCostItems([]);
    setSelectedScopeCostItemIds([]);
    setIsLoadingScopeItems(false);
  }, [dbProjectId, organizationId]);

  useEffect(() => {
    if (!isScopeImportOpen || hasLoadedScopeItems || !supabase || !organizationId || !dbProjectId) {
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

    if (!termsInclusions.trim() || !scopeExclusions.trim()) {
      setError("Please add at least one inclusion and one exclusion before saving.");
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
      setIsEditing(true);
      router.push(`/app/projects/${routeProjectSlug}/preconstruction/quote`);
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
  }, [organizationId, quoteId, quoteNumber, routeProjectSlug, router, supabase]);

  const exportQuotePdf = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const exportMarginMultiplier = !showMarginBreakout && pricingSummary.baseSubtotal > 0
      ? (pricingSummary.baseSubtotal + pricingSummary.margin) / pricingSummary.baseSubtotal
      : 1;

    const lineItemsRows = lineItems.length > 0
      ? lineItems
          .map((item) => {
            const description = item.description.trim() || "Untitled line item";
            const exportedRate = item.rate * exportMarginMultiplier;
            const exportedLineTotal = lineItemTotal(item) * exportMarginMultiplier;
            const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
            return `
              <tr>
                <td class="desc-cell">
                  <div class="cell-primary">${escapeHtml(description)}</div>
                  <div class="cell-secondary">${escapeHtml(item.section)}</div>
                </td>
                <td class="right money col-rate">${toMoney(exportedRate)}</td>
                <td class="right col-qty">${qty}</td>
                <td class="col-unit">${escapeHtml(item.unit || "-")}</td>
                <td class="right money col-total">${toMoney(exportedLineTotal)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

    const issuedDate = toDayMonthYearLabel(quoteDate || new Date().toISOString().slice(0, 10));
    const printableNumber = quoteNumber.trim() || "Unassigned";
    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName.trim() || "Project";
    const issuedToLines = [
      companyName.trim() || clientName.trim() || printableOrgName,
      siteAddress.trim() || printableProjectName,
      contactPerson.trim() ? `Contact: ${contactPerson.trim()}` : "",
    ]
      .filter((line) => line.trim().length > 0)
      .map((line) => escapeHtml(line))
      .join("\n");
    const footerCompanyName = companyName.trim() || printableOrgName;
    const footerEmail = email.trim() || "-";
    const footerContactNumber = phone.trim() || "-";
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
    const sanitizedBrandPrimaryColor = organizationBrandPrimaryColor.trim();
    const pdfPrimaryColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(sanitizedBrandPrimaryColor)
      ? sanitizedBrandPrimaryColor
      : "#0B2739";
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;
    const markUpRowForExport = showMarginBreakout ? `<div class="row"><span class="k">Mark up</span><span class="v">${toMoney(pricingSummary.margin)}</span></div>` : "";
    const discountRowForExport = includeDiscountInExport && pricingSummary.discount > 0
      ? `<div class="row"><span class="k">Discount</span><span class="v">-${toMoney(pricingSummary.discount)}</span></div>`
      : "";
    const contingencyRowForExport = includeContingencyInExport && pricingSummary.contingency > 0
      ? `<div class="row"><span class="k">P&G</span><span class="v">${toMoney(pricingSummary.contingency)}</span></div>`
      : "";
    const subtotalExcludingGstForExport = pricingSummary.baseSubtotal + pricingSummary.margin;
    const scopeBlocksMarkup = [
      {
        title: "Inclusions",
        value: termsInclusions.trim() || "-",
      },
      {
        title: "Exclusions",
        value: termsExclusions.trim() || "-",
      },
      {
        title: "Clarifications",
        value: clarifications.trim() || "-",
      },
      {
        title: "Assumptions",
        value: assumptions.trim() || "-",
      },
    ]
      .map((block) => `
        <section class="scope-item">
          <p class="scope-item-title">${escapeHtml(block.title)}</p>
          <p class="scope-item-value">${escapeHtml(block.value).replaceAll("\n", "<br />")}</p>
        </section>
      `)
      .join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportDocumentTitle)}</title>
    <style>
      :root {
        --orange: ${pdfPrimaryColor};
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
        display: flex;
        flex-direction: column;
      }
      .accent { height: 4px; background: var(--orange); margin-bottom: 16px; }
      .top {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        column-gap: 20px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 10px;
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap { width: 180px; height: 72px; display: flex; align-items: center; justify-content: flex-start; overflow: hidden; }
      .logo-img { width: 100%; height: 100%; object-fit: contain; }
      .logo-fallback {
        width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--line); color: var(--orange); font-size: 13px; font-weight: 700;
      }
      .title {
        margin: 0;
        color: var(--orange);
        font-size: 22px;
        line-height: 1.1;
        letter-spacing: -0.01em;
        font-weight: 700;
        text-align: right;
        justify-self: end;
      }

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
        font-size: 13px;
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
        font-size: 12px;
      }
      .project-lead {
        margin: 14px 0 10px;
      }
      .project-lead .project-line {
        margin: 0 0 2px;
        color: #1f2937;
        font-size: 18px;
        line-height: 1.15;
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
      .desc-cell { line-height: 1.25; }
      .cell-primary { font-weight: 400; color: #1f2937; }
      .cell-secondary { margin-top: 1px; font-size: 9px; color: #6b7280; }
      .right { text-align: right; }
      .money { white-space: nowrap; font-variant-numeric: tabular-nums; }

      .lower {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 360px;
        gap: 18px;
      }
      .quote-summary-wrap {
        margin-top: 12px;
        margin-left: auto;
        width: 360px;
      }
      .terms-wrap {
        width: 100%;
        margin-top: 280px;
        align-self: stretch;
      }
      .terms-wrap .terms-bar {
        display: block;
        width: 100%;
        background: var(--orange);
        color: #fff;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        padding: 8px 16px;
      }
      .scope-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px 28px;
        margin-top: 10px;
        padding: 0 16px;
      }
      .scope-item {
        margin-top: 0;
      }
      .scope-item-title {
        margin: 0 0 4px;
        color: #1f2937;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
      }
      .scope-item-value {
        margin: 0;
        color: #374151;
        font-size: 11px;
        white-space: pre-line;
      }

      .totals-inline { margin-top: 0; }
      .totals-inline .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 6px 0;
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
      .company-footer {
        margin-top: auto;
        padding-top: 10px;
        border-top: 1px solid var(--line);
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
      }
      .company-footer .item {
        margin: 0;
        font-size: 11px;
        color: #374151;
      }
      .company-footer .item .k {
        color: #1f2937;
        font-weight: 700;
      }

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
        <p class="title">Quote</p>
      </header>

      <section class="issued-row">
        <div>
          <p class="issued-title">Issued To:</p>
          <p class="issued-text">${issuedToLines}</p>
        </div>
        <div class="issued-meta">
          <div class="row"><span class="k">Quote No:</span><span class="v">${escapeHtml(printableNumber)}</span></div>
          <div class="row"><span class="k">Date:</span><span class="v">${escapeHtml(issuedDate)}</span></div>
          <div class="row"><span class="k">Expiry:</span><span class="v">${escapeHtml(toDayMonthYearLabel(expiryDate))}</span></div>
        </div>
      </section>

      <section class="project-lead">
        <p class="project-line">Project: ${escapeHtml(printableProjectName)}</p>
      </section>

      <table>
        <thead>
          <tr>
            <th style="width:42%">Description</th>
            <th class="right col-rate" style="width:18%">Rate</th>
            <th class="right col-qty" style="width:10%">Qty</th>
            <th style="width:10%">Unit</th>
            <th class="right col-total" style="width:20%">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>

      <section class="quote-summary-wrap">
        <section class="quote-summary">
          <section class="totals-inline">
          ${markUpRowForExport}
          ${discountRowForExport}
          ${contingencyRowForExport}
          <div class="row"><span class="k">Subtotal (excl. GST)</span><span class="v">${toMoney(subtotalExcludingGstForExport)}</span></div>
          <div class="row"><span class="k">GST (${escapeHtml(gstPercent.trim() || "15")}%)</span><span class="v">${toMoney(pricingSummary.gst)}</span></div>
          <div class="row total-row"><span class="k">Total (incl. GST)</span><span class="v">${toMoney(pricingSummary.grandTotal)}</span></div>
          </section>
        </section>
      </section>

      <section class="terms-wrap">
        <div class="terms-bar">Terms and Conditions</div>
        <section class="scope-grid">
          ${scopeBlocksMarkup}
        </section>
      </section>

      <section class="company-footer">
        <p class="item"><span class="k">Company Name:</span> ${escapeHtml(footerCompanyName)}</p>
        <p class="item"><span class="k">Email:</span> ${escapeHtml(footerEmail)}</p>
        <p class="item"><span class="k">Contact Number:</span> ${escapeHtml(footerContactNumber)}</p>
      </section>
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
    clarifications,
    clientName,
    companyName,
    email,
    expiryDate,
    includeContingencyInExport,
    includeDiscountInExport,
    showMarginBreakout,
    gstPercent,
    lineItems,
    organizationLogoUrl,
    organizationBrandPrimaryColor,
    organizationName,
    contactPerson,
    phone,
    pricingSummary.baseSubtotal,
    pricingSummary.contingency,
    pricingSummary.discount,
    pricingSummary.grandTotal,
    pricingSummary.gst,
    pricingSummary.margin,
    projectName,
    quoteDate,
    quoteNumber,
    termsExclusions,
    termsInclusions,
    siteAddress,
  ]);

  return (
    <div className={`${styles.scope} -mb-8 w-full space-y-6`} aria-busy={isLoadingQuote}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Quote</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={8}
              className={`${styles.menuPanel} !z-[200] min-w-[220px] !bg-[#F3F4F6] p-1.5 opacity-100 backdrop-blur-none`}
            >
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote`}>
                  Back to Quote Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
              {shouldShowEditor ? (
                <>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void saveQuote();
                    }}
                    disabled={isSaving}
                    className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
                  >
                    {isSaving ? "Saving..." : "Save Quote"}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setIsEditing(true);
                  }}
                  className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
                >
                  Edit Quote
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  exportQuotePdf();
                }}
                disabled={isSaving}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                Export PDF
              </DropdownMenuItem>

              {quoteId ? (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void deleteQuote();
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

      {isQuoteContentHidden ? null : isHydratingExistingQuote ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-6 py-6">
            <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>Loading saved quote...</p>
          </div>
          <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-6 py-6">
            <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>Loading pricing...</p>
          </div>
        </div>
      ) : shouldShowEditor ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] [&_input]:bg-[#F8F9FC] [&_select]:bg-[#F8F9FC] [&_textarea]:bg-[#F8F9FC]">
        <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
          <section className="border-b border-[#E8EDF5] pb-5">
            <button
              type="button"
              onClick={() => setIsQuoteDetailsOpen((current) => !current)}
              className="flex w-full items-center justify-between"
            >
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Quote Details</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isQuoteDetailsOpen ? "rotate-180" : ""}`} />
            </button>

            {isQuoteDetailsOpen ? (
              <div className="mt-4 space-y-5">
                <div>
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Quote title</label>
                        <Input value={quoteTitle} onChange={(event) => setQuoteTitle(event.target.value)} placeholder="Kitchen renovation quote" className="h-10 rounded-[6px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Status</label>
                        <select
                          value={quoteStatus}
                          onChange={(event) => setQuoteStatus(event.target.value as QuoteStatus)}
                          className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}
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
                        <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="h-10 rounded-[6px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Quote date</label>
                        <Input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} className="h-10 rounded-[6px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Expiry date</label>
                        <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="h-10 rounded-[6px]" />
                      </div>
                    </div>
                    <div className="max-w-[320px] space-y-1.5">
                      <label className={`${interMedium.className} block text-xs font-medium text-[#64748B]`}>Quote number</label>
                      <Input value={quoteNumber} readOnly placeholder="Q-26001-1" className="h-10 rounded-[6px] bg-[#f8fafc]" />
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
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Line Items</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isLineItemsOpen ? "rotate-180" : ""}`} />
            </button>

            {isLineItemsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => addLineItem(false)} className={`${interMedium.className} h-9 rounded-[6px] bg-[#0B2739] px-3 text-xs font-medium text-white hover:bg-[#0B2739]`}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Item
                  </Button>
                  <Button type="button" onClick={() => addLineItem(true)} variant="outline" className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Optional
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsScopeImportOpen((current) => !current)}
                    className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Import Scope Items
                  </Button>
                </div>

              {isScopeImportOpen ? (
                <div className="rounded-[6px] border border-[#E5EAF2] bg-[#FCFDFE] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className={`${interMedium.className} text-sm font-semibold text-[#24324A]`}>Cost Breakdown Categories</p>
                    <Button
                      type="button"
                      onClick={importSelectedScopeItems}
                      disabled={selectedScopeCostItemIds.length === 0}
                      className={`${interMedium.className} h-8 rounded-[6px] bg-[#F74917] px-3 text-xs font-medium text-white hover:bg-[#e63f10] disabled:opacity-50`}
                    >
                      Add Selected ({selectedScopeCostItemIds.length})
                    </Button>
                  </div>
                  {isLoadingScopeItems ? (
                    <p className={`${interMedium.className} text-xs font-medium text-[#6B7D96]`}>Loading Scope Builder items...</p>
                  ) : availableScopeCostItems.length > 0 ? (
                    <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                      {availableScopeCostItems.map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-[6px] border border-[#E6ECF5] bg-[#F8F9FC] px-2.5 py-2">
                          <input
                            type="checkbox"
                            checked={selectedScopeCostItemIds.includes(item.id)}
                            onChange={() => toggleScopeCostItem(item.id)}
                            className="mt-0.5 h-4 w-4 rounded-[6px] border-[#cfd8e6]"
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

              <div className="hidden rounded-[6px] border border-[#E5EAF2] overflow-visible md:block">
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
                            className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-2 text-sm text-[#1d2433]`}
                          >
                            {LINE_ITEM_SECTIONS.map((section) => (
                              <option key={section} value={section}>
                                {section}
                              </option>
                            ))}
                          </select>
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[6px] px-2" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[6px] px-2" />
                          <div className="relative w-[100px]">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-10 w-[100px] rounded-[6px] pl-6 pr-2"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeLineItem(item.id)}
                              className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
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
                  <div key={item.id} className="space-y-2 rounded-[6px] border border-[#E5EAF2] bg-[#FAFCFF] p-3">
                    <DescriptionInputWithPreview
                      value={item.description}
                      onChange={(value) => updateLineItem(item.id, "description", value)}
                      placeholder="Description"
                    />
                    <select
                      value={item.section}
                      onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                      className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-2 text-sm text-[#1d2433]`}
                    >
                      {LINE_ITEM_SECTIONS.map((section) => (
                        <option key={section} value={section}>
                          {section}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-full rounded-[6px] px-2" />
                      <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-full rounded-[6px] px-2" />
                      <div className="relative">
                        <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                        <Input
                          type="number"
                          value={item.rate === 0 ? "" : item.rate}
                          onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                          className="h-10 w-full rounded-[6px] pl-6 pr-2"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeLineItem(item.id)}
                        className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
                        aria-label="Delete line item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {mainLineItems.length === 0 ? (
                  <div className={`${interMedium.className} rounded-[6px] border border-[#E5EAF2] px-3 py-4 text-center text-sm text-[#73839a]`}>No main line items yet.</div>
                ) : null}
              </div>

              <div className="hidden rounded-[6px] border border-[#E5EAF2] bg-[#F6F7F9] overflow-visible md:block">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div
                      className={`${interMedium.className} grid items-center gap-2 bg-[#F6F7F9] px-3 py-2 text-left text-[11px] uppercase tracking-[0.08em] text-[#6E7F97]`}
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
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[6px] px-2" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[6px] px-2" />
                          <div className="relative w-[100px]">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-10 w-[100px] rounded-[6px] pl-6 pr-2"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeLineItem(item.id)}
                              className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
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
                  <div key={item.id} className="space-y-2 rounded-[6px] border border-[#E5EAF2] bg-[#F8F9FC] p-3">
                    <DescriptionInputWithPreview
                      value={item.description}
                      onChange={(value) => updateLineItem(item.id, "description", value)}
                      placeholder="Optional add-on"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-full rounded-[6px] px-2" />
                      <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-full rounded-[6px] px-2" />
                      <div className="relative">
                        <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                        <Input
                          type="number"
                          value={item.rate === 0 ? "" : item.rate}
                          onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                          className="h-10 w-full rounded-[6px] pl-6 pr-2"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeLineItem(item.id)}
                        className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
                        aria-label="Delete optional line item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {optionalLineItems.length === 0 ? (
                  <div className={`${interMedium.className} rounded-[6px] border border-[#E5EAF2] px-3 py-4 text-center text-xs text-[#7e8ca2]`}>No optional items yet.</div>
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
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Terms & Clarifications</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isTermsOpen ? "rotate-180" : ""}`} />
            </button>
            {isTermsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Validity period</label>
                    <Input value={validityPeriod} onChange={(event) => setValidityPeriod(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Payment terms</label>
                    <Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Lead time</label>
                    <Input value={leadTime} onChange={(event) => setLeadTime(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Inclusions</label>
                  <textarea value={termsInclusions} onChange={(event) => setTermsInclusions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Exclusions</label>
                  <textarea
                    value={scopeExclusions}
                    onChange={(event) => {
                      const value = event.target.value;
                      setScopeExclusions(value);
                      setTermsExclusions(value);
                    }}
                    className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`}
                  />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Clarifications</label>
                  <textarea
                    value={clarifications}
                    onChange={(event) => {
                      const value = event.target.value;
                      setClarifications(value);
                      setScopeNotes(value);
                    }}
                    className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`}
                  />
                </div>
                <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Assumptions</label>
                  <textarea value={assumptions} onChange={(event) => setAssumptions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
              </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Card className={`${styles.card} overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#f6f7f9] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)]`}>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className={`${interMedium.className} ${styles.sectionTitle}`}>Pricing Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 bg-[#F6F7F9] pb-5">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Mark up (%)</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIncludeMarginInExport((current) => !current)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      includeMarginInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
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
                  className="h-10 rounded-[6px]"
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
                      includeDiscountInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
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
                  className="h-10 rounded-[6px]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>P&G</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIncludeContingencyInExport((current) => !current)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      includeContingencyInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
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
                  className="h-10 rounded-[6px]"
                />
              </div>
              <div className="grid gap-2">
                <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>GST (%)</label>
                <Input type="number" value={gstPercent} onChange={(event) => setGstPercent(event.target.value)} className="h-10 rounded-[6px]" />
              </div>

              <div className="h-px bg-[#E7ECF3]" />

              <div className={`${interMedium.className} space-y-1.5 text-sm font-medium text-[#334155]`}>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Discount</span><span>-{toMoney(pricingSummary.discount)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">P&G</span><span>{toMoney(pricingSummary.contingency)}</span></p>
                <div className="my-1 h-px bg-[#CBD5E1]" />
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Subtotal (excl. GST)</span><span>{toMoney(showMarginBreakout ? pricingSummary.baseSubtotal : pricingSummary.baseSubtotal + pricingSummary.margin)}</span></p>
                {showMarginBreakout ? (
                  <>
                    <div className="my-1 h-px bg-[#CBD5E1]" />
                    <p className="flex items-center justify-between"><span className="text-[#64748B]">Mark up</span><span>{toMoney(pricingSummary.margin)}</span></p>
                    <div className="my-1 h-px bg-[#CBD5E1]" />
                    <p className="flex items-center justify-between"><span className="text-[#64748B]">Total (incl. margin)</span><span>{toMoney(pricingSummary.baseSubtotal + pricingSummary.margin)}</span></p>
                  </>
                ) : null}
                <div className="my-1 h-px bg-[#CBD5E1]" />
                <p className="flex items-center justify-between"><span className="text-[#64748B]">GST ({gstPercent.trim() || "15"}%)</span><span>{toMoney(pricingSummary.gst)}</span></p>
              </div>

              <div className="rounded-[6px] border-2 border-[#C9D6E3] bg-[#F6F7F9] px-4 py-3">
                <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Total Quote Price (incl. GST)</p>
                <p className="mt-[11px] text-[34px] font-semibold leading-none tracking-[-0.02em] text-[#0B2739]">{toMoney(pricingSummary.grandTotal)}</p>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveQuote} disabled={isSaving} className={`${interMedium.className} h-10 w-full rounded-full bg-[#0B2739] text-sm font-medium text-white hover:bg-[#0B2739]`}>
                  {isSaving ? "Saving..." : "Save Quote"}
                </Button>
                <Button type="button" onClick={exportQuotePdf} disabled={isSaving} variant="outline" className={`${interMedium.className} h-10 w-full rounded-full border-[#d3dbe8] bg-[#F8F9FC] text-sm font-medium text-[#1d2433]`}>
                  Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      ) : (
        <div className="space-y-7">
          <section className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-5 py-4">
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
            <section className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3">
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

            <section className="rounded-[6px] border border-[#dbe3ef] bg-[#F8F9FC]">
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

            <section className="rounded-[6px] border border-[#eef2f7] bg-[#fcfdff] px-5 py-4">
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
