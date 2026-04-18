"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileStack,
  Mail,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { canManageCommercialData } from "@/lib/role-permissions";
import styles from "@/components/app/trade-pack-builder.module.css";

type VariationStatus = "Draft" | "Priced" | "Sent" | "Client Review" | "Approved" | "Rejected" | "Invoiced";
type VariationOrigin = "Client Request" | "Drawing Revision" | "Site Instruction" | "RFI" | "Unknown";
type CostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";

interface CostLine {
  id: string;
  section: CostSection;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourcePurchaseOrderId?: string | null;
  sourcePurchaseOrderLineItemId?: string | null;
  sourcePurchaseOrderNumber?: string;
}

interface AttachmentItem {
  id: string;
  name: string;
  type: "Drawing" | "Email" | "Site Instruction";
  storagePath: string | null;
  externalUrl: string | null;
}

interface VariationItem {
  id: string;
  code: string;
  title: string;
  status: VariationStatus;
  origin: VariationOrigin;
  requestedBy: string;
  requestedDate: string;
  dueDate: string;
  clientSentAt: string | null;
  approvedAt: string | null;
  invoiceReady: boolean;
  marginPercent: string;
  discountAmount: string;
  contingencyAmount: string;
  gstPercent: string;
  includeMarginInExport: boolean;
  includeDiscountInExport: boolean;
  includeContingencyInExport: boolean;
  costLines: CostLine[];
  notes: string;
  attachments: AttachmentItem[];
  validityPeriod: string;
  paymentTerms: string;
  leadTime: string;
  inclusions: string;
  exclusions: string;
  clarifications: string;
  assumptions: string;
}

interface VariationRow {
  id: string;
  variation_number: string;
  variation_title: string;
  status: string;
  origin: string;
  requested_by: string;
  requested_date: string | null;
  due_date: string | null;
  sent_to_client_at: string | null;
  approved_at: string | null;
  invoice_ready: boolean;
  margin_percent?: number | null;
  discount_amount?: number | null;
  contingency_amount?: number | null;
  gst_percent?: number | null;
  include_margin_in_export?: boolean | null;
  include_discount_in_export?: boolean | null;
  include_contingency_in_export?: boolean | null;
  notes: string;
  validity_period?: string | null;
  payment_terms?: string | null;
  lead_time?: string | null;
  terms_inclusions?: string | null;
  terms_exclusions?: string | null;
  clarifications?: string | null;
  assumptions?: string | null;
}

interface PurchaseOrderOption {
  id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  status: string;
}

interface PurchaseOrderLineOption {
  id: string;
  purchase_order_id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
}

type RpcResultRow = Record<string, unknown>;

const STATUS_OPTIONS: VariationStatus[] = ["Draft", "Priced", "Sent", "Client Review", "Approved", "Rejected", "Invoiced"];
const ORIGIN_OPTIONS: VariationOrigin[] = ["Client Request", "Drawing Revision", "Site Instruction", "RFI", "Unknown"];
const COST_SECTIONS: CostSection[] = ["Labour", "Materials", "Subcontractors", "Plant", "Margin"];
const LINE_GRID_TEMPLATE = "minmax(170px, 1.3fr) 140px 120px 72px 72px 104px 104px 44px";
const VARIATION_ATTACHMENTS_BUCKET = "project-variation-attachments";

function DescriptionInputWithPreview({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none"
    />
  );
}

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
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

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineTotal(line: CostLine) {
  return line.quantity * line.rate;
}

function makeDefaultCostLine(section: CostSection = "Labour"): CostLine {
  return {
    id: crypto.randomUUID(),
    section,
    description: "",
    quantity: 1,
    unit: section === "Labour" ? "hr" : "item",
    rate: 0,
  };
}

function deriveJobCode(value: string | null | undefined) {
  if (!value) {
    return "JOB";
  }

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "JOB";
}

function normalizeStatus(value: string): VariationStatus {
  if (STATUS_OPTIONS.includes(value as VariationStatus)) {
    return value as VariationStatus;
  }
  return "Draft";
}

function normalizeOrigin(value: string): VariationOrigin {
  if (ORIGIN_OPTIONS.includes(value as VariationOrigin)) {
    return value as VariationOrigin;
  }
  return "Unknown";
}

function variationStatusBadgeClass(status: VariationStatus): string {
  switch (status) {
    case "Approved": return "border-[#BBF7D0] bg-[#DCFCE7] text-[#15803D]";
    case "Rejected": return "border-[#FECACA] bg-[#FEE2E2] text-[#DC2626]";
    case "Invoiced": return "border-[#BFDBFE] bg-[#DBEAFE] text-[#1D4ED8]";
    case "Sent": return "border-[#BFDBFE] bg-[#DBEAFE] text-[#1D4ED8]";
    case "Client Review": return "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]";
    case "Priced": return "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]";
    default: return "border-[#D7E1EC] bg-[#FBFEFE] text-[#4B5D79]";
  }
}

export default function ProjectVariationsPage() {
  const params = useParams<{ projectId: string; variationId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeVariationId = params?.variationId;
  const isNewVariationRoute = routeVariationId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const canManageVariation = canManageCommercialData(session?.role);

  const [variations, setVariations] = useState<VariationItem[]>([]);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [jobCode, setJobCode] = useState(() => deriveJobCode(routeProjectSlug));
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [organizationBrandPrimaryColor, setOrganizationBrandPrimaryColor] = useState("");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [purchaseOrderLines, setPurchaseOrderLines] = useState<PurchaseOrderLineOption[]>([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState("");
  const [selectedPurchaseOrderLineIds, setSelectedPurchaseOrderLineIds] = useState<Set<string>>(new Set());
  const [isPurchaseOrderImportOpen, setIsPurchaseOrderImportOpen] = useState(false);
  const [isLoadingVariations, setIsLoadingVariations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingVariation, setIsCreatingVariation] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const [isCostBuildUpOpen, setIsCostBuildUpOpen] = useState(true);
  const [isTermsOpen, setIsTermsOpen] = useState(true);
  const [isDocsOpen, setIsDocsOpen] = useState(true);
  const [pendingAttachmentType, setPendingAttachmentType] = useState<AttachmentItem["type"] | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const hasAutoCreatedOnNewRoute = useRef(false);
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsLoadingVariations(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !routeProjectSlug) {
      return;
    }

    let cancelled = false;

    const loadProjectCode = async () => {
      setIsLoadingVariations(true);

      let resolvedOrganizationId = session?.organizationId ?? null;
      if (!resolvedOrganizationId) {
        const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
        resolvedOrganizationId = ensuredOrganizationId ?? null;
      }

      if (!resolvedOrganizationId) {
        if (!cancelled) {
          setIsLoadingVariations(false);
        }
        return;
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

      const { data: projectRow } = await supabase
        .from("organization_projects")
        .select("id, project_code, name, location")
        .eq("organization_id", resolvedOrganizationId)
        .eq("slug", routeProjectSlug)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (!projectRow?.id) {
        setIsLoadingVariations(false);
        return;
      }

      setOrganizationId(resolvedOrganizationId);
      setDbProjectId(projectRow.id);
      setProjectName(projectRow.name ?? "");
      setProjectLocation(projectRow.location ?? "");
      const resolvedCode = projectRow?.project_code ? deriveJobCode(projectRow.project_code) : deriveJobCode(routeProjectSlug);
      setJobCode(resolvedCode);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variationsTable = (supabase as any).from("project_variations");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineItemsTable = (supabase as any).from("project_variation_line_items");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentsTable = (supabase as any).from("project_variation_attachments");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseOrderLineItemsTable = (supabase as any).from("project_purchase_order_line_items");

      const [{ data: variationRowsRaw, error: variationError }, { data: purchaseOrderRowsRaw }, { data: purchaseOrderLineRowsRaw }] = await Promise.all([
        variationsTable
          .select(
          "id, variation_number, variation_title, status, origin, requested_by, requested_date, due_date, sent_to_client_at, approved_at, invoice_ready, margin_percent, discount_amount, contingency_amount, gst_percent, include_margin_in_export, include_discount_in_export, include_contingency_in_export, notes, validity_period, payment_terms, lead_time, terms_inclusions, terms_exclusions, clarifications, assumptions"
        )
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", projectRow.id)
        .order("updated_at", { ascending: false }),
        purchaseOrdersTable
          .select("id, purchase_order_number, purchase_order_title, status")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false }),
        purchaseOrderLineItemsTable
          .select("id, purchase_order_id, section, description, quantity, unit, rate")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("sort_order", { ascending: true }),
      ]);

      if (variationError) {
        setError(variationError.message);
        setIsLoadingVariations(false);
        return;
      }

      const variationRows = (variationRowsRaw ?? []) as VariationRow[];
      setPurchaseOrders((purchaseOrderRowsRaw ?? []) as PurchaseOrderOption[]);
      setPurchaseOrderLines((purchaseOrderLineRowsRaw ?? []) as PurchaseOrderLineOption[]);
      if (variationRows.length === 0) {
        setVariations([]);
        setActiveVariationId(null);
        setPersistedVariationIds(new Set());
        setIsLoadingVariations(false);
        return;
      }

      const variationIds = variationRows.map((row) => row.id);
      const [{ data: lineRowsRaw }, { data: attachmentRowsRaw }] = await Promise.all([
        lineItemsTable
          .select("id, variation_id, section, description, quantity, unit, rate, source_purchase_order_id, source_purchase_order_line_item_id, source_purchase_order_number")
          .in("variation_id", variationIds)
          .order("sort_order", { ascending: true }),
        attachmentsTable
          .select("id, variation_id, file_name, file_kind, storage_path, external_url")
          .in("variation_id", variationIds)
          .order("created_at", { ascending: true }),
      ]);

      const lineRows = (lineRowsRaw ?? []) as Array<{
        id: string;
        variation_id: string;
        section: string;
        description: string;
        quantity: number;
        unit: string;
        rate: number;
        source_purchase_order_id: string | null;
        source_purchase_order_line_item_id: string | null;
        source_purchase_order_number: string | null;
      }>;
      const attachmentRows = (attachmentRowsRaw ?? []) as Array<{
        id: string;
        variation_id: string;
        file_name: string;
        file_kind: string;
        storage_path: string | null;
        external_url: string | null;
      }>;

      const linesByVariationId = new Map<string, CostLine[]>();
      for (const lineRow of lineRows) {
        const current = linesByVariationId.get(lineRow.variation_id) ?? [];
        current.push({
          id: lineRow.id,
          section: COST_SECTIONS.includes(lineRow.section as CostSection) ? (lineRow.section as CostSection) : "Labour",
          description: lineRow.description ?? "",
          quantity: Number(lineRow.quantity ?? 0),
          unit: lineRow.unit ?? "",
          rate: Number(lineRow.rate ?? 0),
          sourcePurchaseOrderId: lineRow.source_purchase_order_id ?? null,
          sourcePurchaseOrderLineItemId: lineRow.source_purchase_order_line_item_id ?? null,
          sourcePurchaseOrderNumber: lineRow.source_purchase_order_number ?? "",
        });
        linesByVariationId.set(lineRow.variation_id, current);
      }

      const attachmentsByVariationId = new Map<string, AttachmentItem[]>();
      for (const attachmentRow of attachmentRows) {
        const current = attachmentsByVariationId.get(attachmentRow.variation_id) ?? [];
        current.push({
          id: attachmentRow.id,
          name: attachmentRow.file_name ?? "",
          type:
            attachmentRow.file_kind === "Drawing" || attachmentRow.file_kind === "Email" || attachmentRow.file_kind === "Site Instruction"
              ? (attachmentRow.file_kind as AttachmentItem["type"])
              : "Email",
          storagePath: attachmentRow.storage_path ?? null,
          externalUrl: attachmentRow.external_url ?? null,
        });
        attachmentsByVariationId.set(attachmentRow.variation_id, current);
      }

      const hydratedVariations: VariationItem[] = variationRows.map((row) => ({
        id: row.id,
        code: row.variation_number,
        title: row.variation_title,
        status: normalizeStatus(row.status),
        origin: normalizeOrigin(row.origin),
        requestedBy: row.requested_by ?? "",
        requestedDate: row.requested_date ?? "",
        dueDate: row.due_date ?? "",
        clientSentAt: row.sent_to_client_at,
        approvedAt: row.approved_at,
        invoiceReady: Boolean(row.invoice_ready),
        marginPercent: String(row.margin_percent ?? 0),
        discountAmount: String(row.discount_amount ?? 0),
        contingencyAmount: String(row.contingency_amount ?? 0),
        gstPercent: String(row.gst_percent ?? 15),
        includeMarginInExport: row.include_margin_in_export ?? true,
        includeDiscountInExport: Boolean(row.include_discount_in_export),
        includeContingencyInExport: Boolean(row.include_contingency_in_export),
        costLines: linesByVariationId.get(row.id) ?? [makeDefaultCostLine("Labour")],
        notes: row.notes ?? "",
        attachments: attachmentsByVariationId.get(row.id) ?? [],
        validityPeriod: row.validity_period ?? "30 days",
        paymentTerms: row.payment_terms ?? "",
        leadTime: row.lead_time ?? "",
        inclusions: row.terms_inclusions ?? "",
        exclusions: row.terms_exclusions ?? "",
        clarifications: row.clarifications ?? "",
        assumptions: row.assumptions ?? "",
      }));

      setVariations(hydratedVariations);
      setActiveVariationId((current) => {
        if (routeVariationId && hydratedVariations.some((item) => item.id === routeVariationId)) {
          return routeVariationId;
        }
        if (current && hydratedVariations.some((item) => item.id === current)) {
          return current;
        }
        return hydratedVariations[0].id;
      });
      setPersistedVariationIds(new Set(hydratedVariations.map((item) => item.id)));
      setIsLoadingVariations(false);
    };

    void loadProjectCode();

    return () => {
      cancelled = true;
    };
  }, [routeProjectSlug, routeVariationId, session?.organizationId, supabase]);

  const activeVariation = useMemo(
    () => variations.find((variation) => variation.id === activeVariationId) ?? variations[0] ?? null,
    [activeVariationId, variations]
  );
  const hasVariations = variations.length > 0;
  const selectedPurchaseOrder = useMemo(
    () => purchaseOrders.find((purchaseOrder) => purchaseOrder.id === selectedPurchaseOrderId) ?? null,
    [purchaseOrders, selectedPurchaseOrderId]
  );
  const selectedPurchaseOrderLineOptions = useMemo(
    () => purchaseOrderLines.filter((line) => line.purchase_order_id === selectedPurchaseOrderId),
    [purchaseOrderLines, selectedPurchaseOrderId]
  );

  useEffect(() => {
    if (selectedPurchaseOrderId && purchaseOrders.some((purchaseOrder) => purchaseOrder.id === selectedPurchaseOrderId)) {
      return;
    }
    setSelectedPurchaseOrderId(purchaseOrders[0]?.id ?? "");
  }, [purchaseOrders, selectedPurchaseOrderId]);

  useEffect(() => {
    setSelectedPurchaseOrderLineIds(new Set());
  }, [selectedPurchaseOrderId]);

  useEffect(() => {
    if (!routeVariationId || variations.length === 0) {
      return;
    }
    if (variations.some((variation) => variation.id === routeVariationId)) {
      setActiveVariationId(routeVariationId);
    }
  }, [routeVariationId, variations]);

  const pricingSummary = useMemo(() => {
    if (!activeVariation) {
      return {
        baseSubtotal: 0,
        margin: 0,
        discount: 0,
        contingency: 0,
        gst: 0,
        grandTotal: 0,
      };
    }

    const baseSubtotal = activeVariation.costLines.reduce((acc, line) => acc + lineTotal(line), 0);
    const margin = baseSubtotal * (numberOrZero(activeVariation.marginPercent) / 100);
    const contingency = numberOrZero(activeVariation.contingencyAmount);
    const discount = numberOrZero(activeVariation.discountAmount);
    const preGstTotal = Math.max(0, baseSubtotal + margin + contingency - discount);
    const gst = preGstTotal * (numberOrZero(activeVariation.gstPercent) / 100);
    const grandTotal = preGstTotal + gst;

    return {
      baseSubtotal,
      margin,
      discount,
      contingency,
      gst,
      grandTotal,
    };
  }, [activeVariation]);

  const showMarginBreakout = activeVariation?.includeMarginInExport === true;

  const createVariation = useCallback(async () => {
    if (isCreatingVariation) {
      return;
    }
    if (!canManageVariation) {
      setError("You do not have permission to create variations.");
      return;
    }
    if (!supabase || !organizationId || !dbProjectId) {
      setError("Variation creation is not ready. Please refresh and try again.");
      return;
    }

    setIsCreatingVariation(true);
    setError(null);
    setSaveMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: createError } = await (supabase as any).rpc("create_project_variation_draft", {
        p_organization_id: organizationId,
        p_project_id: dbProjectId,
        p_title: "New Variation",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(data) ? data[0] : null;
      if (!createdRow?.id) {
        throw new Error("Variation was created but no identifier was returned.");
      }

      const createdVariation: VariationItem = {
        id: createdRow.id,
        code: createdRow.variation_number || `${jobCode}-VAR-00`,
        title: createdRow.variation_title || "New Variation",
        status: normalizeStatus(createdRow.status),
        origin: normalizeOrigin(createdRow.origin),
        requestedBy: "",
        requestedDate: "",
        dueDate: "",
        clientSentAt: null,
        approvedAt: null,
        invoiceReady: false,
        marginPercent: "0",
        discountAmount: "0",
        contingencyAmount: "0",
        gstPercent: "15",
        includeMarginInExport: true,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
        costLines: [makeDefaultCostLine("Labour")],
        notes: "",
        attachments: [],
        validityPeriod: "30 days",
        paymentTerms: "",
        leadTime: "",
        inclusions: "",
        exclusions: "",
        clarifications: "",
        assumptions: "",
      };

      setVariations((current) => {
        if (current.some((variation) => variation.id === createdVariation.id)) {
          return current;
        }
        return [createdVariation, ...current];
      });
      setPersistedVariationIds((current) => new Set([...current, createdVariation.id]));

      setActiveVariationId(createdVariation.id);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/variations/${createdVariation.id}`);
    } catch (createVariationError) {
      setError(createVariationError instanceof Error ? createVariationError.message : "Unable to create variation.");
    } finally {
      setIsCreatingVariation(false);
    }
  }, [canManageVariation, dbProjectId, isCreatingVariation, jobCode, organizationId, routeProjectSlug, router, supabase]);

  useEffect(() => {
    if (!isNewVariationRoute) {
      hasAutoCreatedOnNewRoute.current = false;
      return;
    }

    if (isLoadingVariations || hasAutoCreatedOnNewRoute.current) {
      return;
    }

    hasAutoCreatedOnNewRoute.current = true;
    void createVariation();
  }, [createVariation, isLoadingVariations, isNewVariationRoute]);

  const updateActiveVariation = <K extends keyof VariationItem>(key: K, value: VariationItem[K]) => {
    if (!activeVariation) return;
    setVariations((current) => current.map((item) => (item.id === activeVariation.id ? { ...item, [key]: value } : item)));
  };

  const addCostLine = (section: CostSection = "Labour") => {
    if (!activeVariation) return;
    updateActiveVariation("costLines", [...activeVariation.costLines, makeDefaultCostLine(section)]);
  };

  const togglePurchaseOrderLine = (lineId: string) => {
    setSelectedPurchaseOrderLineIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  const importSelectedPurchaseOrderLines = () => {
    if (!activeVariation || !selectedPurchaseOrder) {
      return;
    }

    const existingSourceIds = new Set(
      activeVariation.costLines
        .map((line) => line.sourcePurchaseOrderLineItemId)
        .filter((value): value is string => Boolean(value))
    );

    const importedLines = selectedPurchaseOrderLineOptions
      .filter((line) => selectedPurchaseOrderLineIds.has(line.id) && !existingSourceIds.has(line.id))
      .map((line) => ({
        id: crypto.randomUUID(),
        section: COST_SECTIONS.includes(line.section as CostSection) ? (line.section as CostSection) : "Labour",
        description: line.description ?? "",
        quantity: Number(line.quantity ?? 0),
        unit: line.unit ?? "",
        rate: Number(line.rate ?? 0),
        sourcePurchaseOrderId: selectedPurchaseOrder.id,
        sourcePurchaseOrderLineItemId: line.id,
        sourcePurchaseOrderNumber: selectedPurchaseOrder.purchase_order_number,
      } satisfies CostLine));

    if (importedLines.length === 0) {
      return;
    }

    updateActiveVariation("costLines", [...activeVariation.costLines, ...importedLines]);
    setSelectedPurchaseOrderLineIds(new Set());
  };

  const updateCostLine = <K extends keyof CostLine>(lineId: string, key: K, value: CostLine[K]) => {
    if (!activeVariation) return;
    updateActiveVariation("costLines", activeVariation.costLines.map((line) => (line.id === lineId ? { ...line, [key]: value } : line)));
  };

  const removeCostLine = (lineId: string) => {
    if (!activeVariation) return;
    updateActiveVariation(
      "costLines",
      activeVariation.costLines.filter((line) => line.id !== lineId)
    );
  };

  const openAttachmentPicker = (type: AttachmentItem["type"]) => {
    setPendingAttachmentType(type);
    attachmentInputRef.current?.click();
  };

  const handleAttachmentFilesSelected = (files: FileList | null) => {
    if (!activeVariation || !pendingAttachmentType || !files || files.length === 0) {
      return;
    }
    if (!supabase || !organizationId || !dbProjectId) {
      setError("Attachment upload is not ready. Please refresh and try again.");
      return;
    }

    void (async () => {
      try {
        setError(null);
        const uploadResults = await Promise.all(
          Array.from(files).map(async (file) => {
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
            const fileId = crypto.randomUUID();
            const storagePath = `${organizationId}/${dbProjectId}/${activeVariation.id}/${fileId}-${cleanName}`;
            const { error: uploadError } = await supabase.storage
              .from(VARIATION_ATTACHMENTS_BUCKET)
              .upload(storagePath, file, { upsert: false });

            if (uploadError) {
              throw new Error(uploadError.message);
            }

            return {
              id: fileId,
              name: file.name,
              type: pendingAttachmentType,
              storagePath,
              externalUrl: null,
            } satisfies AttachmentItem;
          })
        );

        updateActiveVariation("attachments", [...activeVariation.attachments, ...uploadResults]);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Unable to upload attachment.");
      } finally {
        setPendingAttachmentType(null);
        if (attachmentInputRef.current) {
          attachmentInputRef.current.value = "";
        }
      }
    })();
  };

  const removeAttachment = (attachmentId: string) => {
    if (!activeVariation) return;
    updateActiveVariation(
      "attachments",
      activeVariation.attachments.filter((attachment) => attachment.id !== attachmentId)
    );
  };

  const setStatus = (status: VariationStatus) => {
    if (!activeVariation) return;
    updateActiveVariation("status", status);
    if (status === "Sent" || status === "Client Review") {
      updateActiveVariation("clientSentAt", new Date().toISOString().slice(0, 10));
    }
    if (status === "Approved") {
      updateActiveVariation("approvedAt", new Date().toISOString().slice(0, 10));
      updateActiveVariation("invoiceReady", true);
    }
  };

  const saveVariation = async () => {
    if (!activeVariation || !supabase || !organizationId || !dbProjectId) {
      setError("Variation save is not ready. Please refresh and try again.");
      return;
    }

    if (!canManageVariation) {
      setError("You do not have permission to edit variations.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const lineItemsPayload = activeVariation.costLines.map((line) => ({
        id: line.id,
        section: line.section,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        rate: Number(line.rate),
        sourcePurchaseOrderId: line.sourcePurchaseOrderId ?? null,
        sourcePurchaseOrderLineItemId: line.sourcePurchaseOrderLineItemId ?? null,
        sourcePurchaseOrderNumber: line.sourcePurchaseOrderNumber ?? "",
      }));

      const attachmentsPayload = activeVariation.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        storagePath: attachment.storagePath,
        externalUrl: attachment.externalUrl,
      }));

      const { data: saveRows, error: saveError } = await supabase.rpc("save_project_variation_draft", {
        p_organization_id: organizationId,
        p_project_id: dbProjectId,
        p_variation_id: activeVariation.id,
        p_expected_updated_at: null,
        p_variation_title: activeVariation.title.trim() || activeVariation.code,
        p_variation_number: activeVariation.code,
        p_status: activeVariation.status,
        p_origin: activeVariation.origin,
        p_requested_by: activeVariation.requestedBy,
        p_requested_date: activeVariation.requestedDate || null,
        p_due_date: activeVariation.dueDate || null,
        p_sent_to_client_at: activeVariation.clientSentAt || null,
        p_approved_at: activeVariation.approvedAt || null,
        p_invoice_ready: activeVariation.invoiceReady,
        p_notes: activeVariation.notes,
        p_margin_percent: Number(numberOrZero(activeVariation.marginPercent).toFixed(3)),
        p_discount_amount: Number(numberOrZero(activeVariation.discountAmount).toFixed(2)),
        p_contingency_amount: Number(numberOrZero(activeVariation.contingencyAmount).toFixed(2)),
        p_gst_percent: Number(numberOrZero(activeVariation.gstPercent).toFixed(3)),
        p_include_margin_in_export: activeVariation.includeMarginInExport,
        p_include_discount_in_export: activeVariation.includeDiscountInExport,
        p_include_contingency_in_export: activeVariation.includeContingencyInExport,
        p_validity_period: activeVariation.validityPeriod,
        p_payment_terms: activeVariation.paymentTerms,
        p_lead_time: activeVariation.leadTime,
        p_terms_inclusions: activeVariation.inclusions,
        p_terms_exclusions: activeVariation.exclusions,
        p_clarifications: activeVariation.clarifications,
        p_assumptions: activeVariation.assumptions,
        p_line_items: lineItemsPayload,
        p_attachments: attachmentsPayload,
      });

      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = (Array.isArray(saveRows) ? saveRows[0] : null) as RpcResultRow | null;
      if (!savedRow) {
        throw new Error("Variation was saved but no result was returned.");
      }

      setPersistedVariationIds((current) => new Set([...current, activeVariation.id]));
      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save variation.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteVariation = useCallback(async (variationId: string) => {
    if (!canManageVariation) {
      setError("You do not have permission to delete variations.");
      return;
    }

    const variation = variations.find((item) => item.id === variationId);
    if (!variation) {
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete variation ${variation.code}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSaveMessage(null);

    try {
      if (persistedVariationIds.has(variationId)) {
        if (!supabase || !organizationId) {
          setError("Variation delete is not ready. Please refresh and try again.");
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lineItemsTable = (supabase as any).from("project_variation_line_items");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attachmentsTable = (supabase as any).from("project_variation_attachments");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusEventsTable = (supabase as any).from("project_variation_status_events");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoiceItemsTable = (supabase as any).from("project_variation_invoice_items");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const variationsTable = (supabase as any).from("project_variations");

        const [{ error: deleteLineItemsError }, { error: deleteAttachmentsError }, { error: deleteStatusEventsError }, { error: deleteInvoiceItemsError }] = await Promise.all([
          lineItemsTable.delete().eq("organization_id", organizationId).eq("variation_id", variationId),
          attachmentsTable.delete().eq("organization_id", organizationId).eq("variation_id", variationId),
          statusEventsTable.delete().eq("organization_id", organizationId).eq("variation_id", variationId),
          invoiceItemsTable.delete().eq("organization_id", organizationId).eq("variation_id", variationId),
        ]);

        if (deleteLineItemsError) throw new Error(deleteLineItemsError.message);
        if (deleteAttachmentsError) throw new Error(deleteAttachmentsError.message);
        if (deleteStatusEventsError) throw new Error(deleteStatusEventsError.message);
        if (deleteInvoiceItemsError) throw new Error(deleteInvoiceItemsError.message);

        const { error: deleteVariationError } = await variationsTable
          .delete()
          .eq("organization_id", organizationId)
          .eq("id", variationId);
        if (deleteVariationError) {
          throw new Error(deleteVariationError.message);
        }
      }

      const nextRows = variations.filter((item) => item.id !== variationId);
      setVariations(nextRows);
      setPersistedVariationIds((current) => {
        const next = new Set(current);
        next.delete(variationId);
        return next;
      });

      if (nextRows.length === 0) {
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/variations`);
      } else {
        const fallback = nextRows[0];
        setActiveVariationId(fallback.id);
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/variations/${fallback.id}`);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete variation.");
    } finally {
      setIsDeleting(false);
    }
  }, [canManageVariation, organizationId, persistedVariationIds, routeProjectSlug, router, supabase, variations]);

  const exportVariationPdf = useCallback(() => {
    if (typeof window === "undefined" || !activeVariation) {
      return;
    }

    const showMarginBreakout = activeVariation.includeMarginInExport === true;
    const exportMarginMultiplier = !showMarginBreakout && pricingSummary.baseSubtotal > 0
      ? (pricingSummary.baseSubtotal + pricingSummary.margin) / pricingSummary.baseSubtotal
      : 1;

    const lineItemsRows = activeVariation.costLines.length > 0
      ? activeVariation.costLines
          .map((line) => {
            const description = line.description.trim() || "Untitled line item";
            const exportedRate = line.rate * exportMarginMultiplier;
            const exportedLineTotal = lineTotal(line) * exportMarginMultiplier;
            const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
            return `
              <tr>
                <td class="desc-cell">
                  <div class="cell-primary">${escapeHtml(description)}</div>
                  <div class="cell-secondary">${escapeHtml(line.section)}</div>
                </td>
                <td class="right money col-rate">${toMoney(exportedRate)}</td>
                <td class="right col-qty">${qty}</td>
                <td class="col-unit">${escapeHtml(line.unit || "-")}</td>
                <td class="right money col-total">${toMoney(exportedLineTotal)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName.trim() || (routeProjectSlug ?? "").replaceAll("-", " ") || "Project";
    const printableProjectLocation = projectLocation.trim();
    const printableIssuedToContact = activeVariation.requestedBy.trim();
    const printableIssuedToLines = [
      printableOrgName,
      printableProjectLocation || printableProjectName,
      printableIssuedToContact ? `Contact: ${printableIssuedToContact}` : "",
    ]
      .filter((line) => line.trim().length > 0)
      .map((line) => escapeHtml(line))
      .join("\n");
    const printableNumber = activeVariation.code.trim() || "Unassigned";
    const printableTitle = activeVariation.title.trim() || "Variation";
    const issuedDate = toDayMonthYearLabel(activeVariation.requestedDate || new Date().toISOString().slice(0, 10));
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
    const sanitizedBrandPrimaryColor = organizationBrandPrimaryColor.trim();
    const pdfPrimaryColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(sanitizedBrandPrimaryColor)
      ? sanitizedBrandPrimaryColor
      : "#0B2739";
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;

    const discountRowForExport = activeVariation.includeDiscountInExport && pricingSummary.discount > 0
      ? `<div class="summary-row"><span class="k">Discount</span><span class="v">-${toMoney(pricingSummary.discount)}</span></div>`
      : "";
    const contingencyRowForExport = activeVariation.includeContingencyInExport && pricingSummary.contingency > 0
      ? `<div class="summary-row"><span class="k">P&G</span><span class="v">${toMoney(pricingSummary.contingency)}</span></div>`
      : "";
    const markUpRowForExport = showMarginBreakout
      ? `<div class="summary-row"><span class="k">Mark up</span><span class="v">${toMoney(pricingSummary.margin)}</span></div>`
      : "";
    const totalIncludingMarginForExport = pricingSummary.baseSubtotal + pricingSummary.margin;
    const subtotalExcludingGstForExport = totalIncludingMarginForExport;
    const notesMarkup = activeVariation.notes.trim()
      ? `<p><strong>Notes:</strong> ${escapeHtml(activeVariation.notes.trim()).replaceAll("\n", "<br />")}</p>`
      : "";
    const termRows = [
      activeVariation.validityPeriod.trim() ? `<p><strong>Validity Period:</strong> ${escapeHtml(activeVariation.validityPeriod.trim())}</p>` : "",
      activeVariation.paymentTerms.trim() ? `<p><strong>Payment Terms:</strong> ${escapeHtml(activeVariation.paymentTerms.trim())}</p>` : "",
      activeVariation.leadTime.trim() ? `<p><strong>Lead Time:</strong> ${escapeHtml(activeVariation.leadTime.trim())}</p>` : "",
      activeVariation.inclusions.trim() ? `<p><strong>Inclusions:</strong> ${escapeHtml(activeVariation.inclusions.trim()).replaceAll("\n", "<br />")}</p>` : "",
      activeVariation.exclusions.trim() ? `<p><strong>Exclusions:</strong> ${escapeHtml(activeVariation.exclusions.trim()).replaceAll("\n", "<br />")}</p>` : "",
      activeVariation.clarifications.trim() ? `<p><strong>Clarifications:</strong> ${escapeHtml(activeVariation.clarifications.trim()).replaceAll("\n", "<br />")}</p>` : "",
      activeVariation.assumptions.trim() ? `<p><strong>Assumptions:</strong> ${escapeHtml(activeVariation.assumptions.trim()).replaceAll("\n", "<br />")}</p>` : "",
    ]
      .filter(Boolean)
      .join("");
    const attachmentsMarkup = activeVariation.attachments.length > 0
      ? activeVariation.attachments
          .map((attachment) => `<p><strong>${escapeHtml(attachment.type || "Attachment")}:</strong> ${escapeHtml(attachment.name || "-")}</p>`)
          .join("")
      : "";

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
        font-size: 22px;
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
      .cell-primary { font-weight: 600; color: #1f2937; }
      .cell-secondary { margin-top: 1px; font-size: 9px; color: #6b7280; }
      .right { text-align: right; }
      .money { white-space: nowrap; font-variant-numeric: tabular-nums; }

      .lower {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 360px;
        gap: 18px;
      }
      .variation-details .bar {
        display: block;
        width: 100%;
        background: var(--orange);
        color: #fff;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        padding: 6px 12px;
        margin-bottom: 8px;
      }
      .variation-details p {
        margin: 0 0 4px;
        color: #374151;
        font-size: 11px;
      }
      .variation-details p strong { color: #1f2937; }

      .variation-summary .bar {
        display: block;
        width: 100%;
        background: var(--orange);
        color: #fff;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        padding: 6px 12px;
        margin: 0 0 8px;
      }
      .summary-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 4px 0;
        border-bottom: 1px solid var(--line);
        font-size: 11px;
      }
      .summary-row.no-divider { border-bottom: 0; }
      .summary-row .k { color: #607089; }
      .summary-row .v { color: #253248; font-weight: 600; }
      .summary-divider { border-top: 2px solid #9fb2ce; margin: 6px 0 4px; }
      .summary-block-title {
        margin: 8px 0 3px;
        color: #4d617a;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .totals-inline { margin-top: 0; }
      .totals-inline .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 10px 0;
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
        <p class="title">Variation</p>
      </header>

      <section class="issued-row">
        <div>
          <p class="issued-title">Issued To:</p>
          <p class="issued-text">${printableIssuedToLines}</p>
        </div>
        <div class="issued-meta">
          <div class="row"><span class="k">Variation No:</span><span class="v">${escapeHtml(printableNumber)}</span></div>
          <div class="row"><span class="k">Date:</span><span class="v">${escapeHtml(issuedDate)}</span></div>
          <div class="row"><span class="k">Type:</span><span class="v">${escapeHtml(activeVariation.origin || "—")}</span></div>
          <div class="row"><span class="k">Status:</span><span class="v">${escapeHtml(activeVariation.status)}</span></div>
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

      <section class="lower">
        <section class="variation-details">
          <div class="bar">Variation Details</div>
          <p><strong>Variation:</strong> ${escapeHtml(printableTitle)}</p>
          <p><strong>Requested By:</strong> ${escapeHtml(activeVariation.requestedBy || "—")}</p>
          ${attachmentsMarkup}
          ${notesMarkup}
          ${termRows}
        </section>

        <div>
          <section class="totals-inline">
            <div class="row total-row"><span class="k">Variation Summary</span><span class="v"></span></div>
            ${markUpRowForExport ? markUpRowForExport.replaceAll("summary-row", "row") : ""}
            ${discountRowForExport ? discountRowForExport.replaceAll("summary-row", "row") : ""}
            ${contingencyRowForExport ? contingencyRowForExport.replaceAll("summary-row", "row") : ""}
            <div class="row"><span class="k">Subtotal (excl. GST)</span><span class="v">${toMoney(subtotalExcludingGstForExport)}</span></div>
            <div class="row"><span class="k">GST (${escapeHtml(activeVariation.gstPercent.trim() || "15")}%)</span><span class="v">${toMoney(pricingSummary.gst)}</span></div>
            <div class="row total-row"><span class="k">Total (incl. GST)</span><span class="v">${toMoney(pricingSummary.grandTotal)}</span></div>
          </section>
        </div>
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
    activeVariation,
    organizationBrandPrimaryColor,
    organizationLogoUrl,
    organizationName,
    pricingSummary.baseSubtotal,
    pricingSummary.contingency,
    pricingSummary.discount,
    pricingSummary.grandTotal,
    pricingSummary.gst,
    pricingSummary.margin,
    projectLocation,
    projectName,
    routeProjectSlug,
  ]);

  if (isLoadingVariations) {
    return (
      <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>
        <section className={styles.heroBlock}>
          <div className="space-y-3">
            <div className="h-9 w-48 animate-pulse rounded-full bg-[#E8EDF5]" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-32 animate-pulse rounded-full bg-[#E8EDF5]" />
            <div className="h-9 w-28 animate-pulse rounded-full bg-[#E8EDF5]" />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
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
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[#64748B]`}>Loading variations...</p>
            </div>
          </div>
          <div className={`${styles.quotePanelCard} overflow-hidden`}>
            <div className="px-5 pb-3 pt-5">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Pricing Summary</h2>
            </div>
            <div className="space-y-3 px-5 pb-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>
<section className={styles.heroBlock}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={styles.quotePageTitle}>{activeVariation?.code || "Variation"}</h1>
            {activeVariation ? (
              <span className={`${styles.quoteButtonLabel} inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] ${variationStatusBadgeClass(activeVariation.status)}`}>
                {activeVariation.status}
              </span>
            ) : null}
          </div>
          {saveMessage ? <p className={`${styles.quoteBodyLabel} text-xs`}>{saveMessage}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveVariation()}
            disabled={!canManageVariation || isSaving}
            className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}
          >
            {isSaving ? "Saving..." : "Save Variation"}
          </Button>
          <Button
            type="button"
            onClick={exportVariationPdf}
            disabled={isSaving}
            className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
          >
            Export PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`${interMedium.className} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC] px-3 text-[13px] text-[#475569]`}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="!z-[200] min-w-[220px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]">
              <DropdownMenuItem asChild className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}>
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations`}>
                  <ExternalLink className="mr-2 h-4 w-4 text-[#64748B]" />
                  All Variations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void createVariation();
                }}
                disabled={!canManageVariation || isCreatingVariation}
                className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
              >
                <Plus className="mr-2 h-4 w-4 text-[#64748B]" />
                {isCreatingVariation ? "Creating..." : "New Variation"}
              </DropdownMenuItem>
              {activeVariation ? (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[#E8EDF5]" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void deleteVariation(activeVariation.id);
                    }}
                    disabled={!canManageVariation || isDeleting}
                    className={`${interMedium.className} h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium text-[#b42318] focus:bg-[#FEF3F2] focus:text-[#b42318]`}
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
      {!canManageVariation && session ? (
        <p className={`${interMedium.className} rounded-[10px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800`}>
          You can review this variation, but only owner, admin, QS, and project manager roles can edit or delete it.
        </p>
      ) : null}

      {hasVariations && activeVariation ? (
      <div className="space-y-6 [&_input]:border-[#D7E1EC] [&_input]:bg-[#FBFEFE] [&_select]:border-[#D7E1EC] [&_select]:bg-[#FBFEFE] [&_textarea]:border-[#D7E1EC] [&_textarea]:bg-[#FBFEFE]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="border-b border-[#E8EDF5] pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Variation Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={styles.quoteBodyLabel}>Variation title</label>
                  <Input value={activeVariation.title} onChange={(event) => updateActiveVariation("title", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Status</label>
                  <select value={activeVariation.status} onChange={(event) => setStatus(event.target.value as VariationStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] pl-3 pr-8 text-sm text-[#1d2433]`}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Variation code</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[6px] bg-[#f8fafc]" /></div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Origin</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Requested by</label><Input value={activeVariation.requestedBy} onChange={(event) => updateActiveVariation("requestedBy", event.target.value)} className="h-10 rounded-[6px]" /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Requested date</label><Input type="date" value={activeVariation.requestedDate} onChange={(event) => updateActiveVariation("requestedDate", event.target.value)} className="h-10 rounded-[6px]" /></div>
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Due date</label><Input type="date" value={activeVariation.dueDate} onChange={(event) => updateActiveVariation("dueDate", event.target.value)} className="h-10 rounded-[6px]" /></div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Invoice ready</label>
                  <button type="button" onClick={() => updateActiveVariation("invoiceReady", !activeVariation.invoiceReady)} className={`flex h-10 w-full items-center justify-between rounded-[6px] border px-3 text-sm ${activeVariation.invoiceReady ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d1d9e6] bg-[#F8F9FC] text-[#334155]"}`}>
                    <span className={interMedium.className}>{activeVariation.invoiceReady ? "Ready for invoice" : "Not ready"}</span>
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="py-5">
            <div className="flex items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Line Items</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPurchaseOrderImportOpen((current) => !current)}
                className={`${styles.quoteButtonLabel} h-10 rounded-full border-[#D7E1EC] bg-[#FBFEFE] px-4`}
              >
                <Plus className="mr-1 h-4 w-4" />
                Import Scope Items
              </Button>
            </div>

            <div className="mt-4 overflow-hidden rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE]">
              <div>
                <div>
                  <div
                    className={`${interMedium.className} grid items-center gap-0 border-b border-[#D7E1EC] bg-[#F3F4F6] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[#475569]`}
                    style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}
                  >
                    <span className="px-3 py-2.5 font-semibold">Description</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Source</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Item</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Qty.</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Unit</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Price</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Amount</span>
                    <span className="border-l border-[#D7E1EC] px-3 py-2.5" />
                  </div>
                  <div className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
                    {activeVariation.costLines.map((line) => (
                      <div key={line.id} className="group grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}>
                        <div className="flex items-center px-3 py-1.5">
                          <DescriptionInputWithPreview
                            value={line.description}
                            onChange={(value) => updateCostLine(line.id, "description", value)}
                          />
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          {line.sourcePurchaseOrderNumber ? (
                            <span className={`${interMedium.className} text-[12px] text-[#64748B]`}>
                              {line.sourcePurchaseOrderNumber}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <select value={line.section} onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)} className={`${interMedium.className} h-9 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[#1d2433] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}>
                            {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <Input type="number" value={line.quantity} onChange={(event) => updateCostLine(line.id, "quantity", numberOrZero(event.target.value))} className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <Input value={line.unit} onChange={(event) => updateCostLine(line.id, "unit", event.target.value)} className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <div className="relative w-full">
                            <span className={`${interMedium.className} pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input type="number" value={line.rate === 0 ? "" : line.rate} onChange={(event) => updateCostLine(line.id, "rate", numberOrZero(event.target.value))} className="h-9 w-full !border-0 !bg-transparent pl-4 pr-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                          </div>
                        </div>
                        <div className="flex items-center justify-end border-l border-[#EEF2F7] px-3 py-1.5">
                          <div className={`${interMedium.className} text-right text-sm text-[#1d2433]`}>{toMoney(lineTotal(line))}</div>
                        </div>
                        <div className="flex items-center justify-center border-l border-[#EEF2F7] px-0 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeCostLine(line.id)}
                            className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[#9AA8BC]/80 opacity-0 shadow-none hover:bg-transparent hover:text-[#B42318] group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-0"
                            aria-label="Delete line item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 flex justify-end pr-12">
              <Button
                type="button"
                variant="ghost"
                onClick={() => addCostLine("Labour")}
                className={`${styles.quoteButtonLabel} h-8 rounded-none border-0 bg-transparent px-0 text-[#4B5D79] shadow-none hover:bg-transparent hover:text-[#22324A] focus-visible:outline-none focus-visible:ring-0`}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            {isPurchaseOrderImportOpen ? (
              <div className="mt-3 rounded-[8px] border border-[#D9DEE5] bg-[#F8F9FC]">
                <div className="px-3 pb-3 pt-3">
                  <p className={`${interMedium.className} mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#607089]`}>
                    Import From Purchase Order
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedPurchaseOrderId}
                      onChange={(event) => setSelectedPurchaseOrderId(event.target.value)}
                      className={`${interMedium.className} h-10 min-w-[260px] rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}
                    >
                      <option value="">Select purchase order</option>
                      {purchaseOrders.map((purchaseOrder) => (
                        <option key={purchaseOrder.id} value={purchaseOrder.id}>
                          {purchaseOrder.purchase_order_number} - {purchaseOrder.purchase_order_title || "Untitled purchase order"}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={importSelectedPurchaseOrderLines}
                      disabled={selectedPurchaseOrderLineIds.size === 0}
                      className={`${interMedium.className} h-10 rounded-[6px] border-[#d6dfeb] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}
                    >
                      Import Selected PO Lines
                    </Button>
                  </div>
                  {selectedPurchaseOrder ? (
                    <div className="mt-3 overflow-hidden rounded-[6px] border border-[#E5EAF2] bg-[#F8F9FC]">
                      <div className={`${interMedium.className} grid grid-cols-[44px_minmax(220px,1.5fr)_110px_90px_110px_110px] items-center gap-2 bg-[#F8FAFC] px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] text-[#607089]`}>
                        <span />
                        <span>Description</span>
                        <span>Item</span>
                        <span>Qty.</span>
                        <span>Price</span>
                        <span className="text-right">Amount</span>
                      </div>
                      <div className="divide-y divide-[#EEF2F7]">
                        {selectedPurchaseOrderLineOptions.length > 0 ? (
                          selectedPurchaseOrderLineOptions.map((line) => {
                            const alreadyImported = activeVariation?.costLines.some((costLine) => costLine.sourcePurchaseOrderLineItemId === line.id) ?? false;
                            return (
                              <label key={line.id} className="grid cursor-pointer grid-cols-[44px_minmax(220px,1.5fr)_110px_90px_110px_110px] items-center gap-2 px-3 py-2">
                                <span className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedPurchaseOrderLineIds.has(line.id)}
                                    onChange={() => togglePurchaseOrderLine(line.id)}
                                    disabled={alreadyImported}
                                    className="h-4 w-4 rounded border-[#CBD5E1]"
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-[#1d2433]">{line.description || "Untitled line item"}</span>
                                  {alreadyImported ? (
                                    <span className={`${interMedium.className} mt-0.5 block text-[11px] text-[#64748B]`}>
                                      Already imported into this variation
                                    </span>
                                  ) : null}
                                </span>
                                <span className={`${interMedium.className} text-sm text-[#475569]`}>{line.section}</span>
                                <span className={`${interMedium.className} text-sm text-[#475569]`}>{line.quantity}</span>
                                <span className={`${interMedium.className} text-sm text-[#475569]`}>{toMoney(line.rate)}</span>
                                <span className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>
                                  {toMoney(Number((line.quantity * line.rate).toFixed(2)))}
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p className={`${interMedium.className} px-3 py-3 text-sm text-[#64748B]`}>
                            No purchase order line items available to import.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <div className="border-t border-[#E8EDF5] py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
              <div>
          <section className="pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Terms & Clarifications</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Validity period</label>
                  <Input value={activeVariation.validityPeriod} onChange={(event) => updateActiveVariation("validityPeriod", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Payment terms</label>
                  <Input value={activeVariation.paymentTerms} onChange={(event) => updateActiveVariation("paymentTerms", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Lead time</label>
                  <Input value={activeVariation.leadTime} onChange={(event) => updateActiveVariation("leadTime", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Inclusions</label>
                  <textarea value={activeVariation.inclusions} onChange={(event) => updateActiveVariation("inclusions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Exclusions</label>
                  <textarea value={activeVariation.exclusions} onChange={(event) => updateActiveVariation("exclusions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Clarifications</label>
                  <textarea value={activeVariation.clarifications} onChange={(event) => updateActiveVariation("clarifications", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Assumptions</label>
                  <textarea value={activeVariation.assumptions} onChange={(event) => updateActiveVariation("assumptions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
              </div>
            </div>
          </section>

          <section className="pt-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Attachments & Notes</h2>

            <div className="mt-4 space-y-4">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => handleAttachmentFilesSelected(event.target.files)}
                  accept={
                    pendingAttachmentType === "Drawing"
                      ? ".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp"
                      : pendingAttachmentType === "Email"
                        ? ".eml,.msg,.pdf,.png,.jpg,.jpeg,.webp"
                        : ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Drawing")} className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}><Upload className="mr-1 h-4 w-4" />Attach Drawing</Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Email")} className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}><Mail className="mr-1 h-4 w-4" />Attach Email</Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Site Instruction")} className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}><Clock3 className="mr-1 h-4 w-4" />Attach SI</Button>
                </div>

                <div className="rounded-[6px] border border-[#E5EAF2] bg-[#FAFCFF] px-3 py-3">
                  <label className={styles.quoteBodyLabel}>Linked Documentation</label>
                  <div className="space-y-2">
                    {activeVariation.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[6px] border border-[#E5EAF2] bg-[#F8F9FC] px-3 py-2">
                        <span className={`${interMedium.className} min-w-0 flex-1 truncate text-sm text-[#1D2433]`}>{attachment.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-[6px] bg-[#EEF3FA] px-2 py-1 text-[11px] font-semibold text-[#4A5D78]">{attachment.type}</span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeAttachment(attachment.id)}
                            className={`${interMedium.className} h-10 w-10 rounded-[6px] border-[#d6dfeb] bg-[#F8F9FC] p-0 text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1d2433]`}
                            aria-label="Delete attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {activeVariation.attachments.length === 0 ? <p className={`${interMedium.className} text-sm text-[#73839a]`}>No attachments.</p> : null}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className={styles.quoteBodyLabel}>Variation notes</label>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => updateActiveVariation("notes", "")}
                      className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
                      aria-label="Delete notes"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <textarea value={activeVariation.notes} onChange={(event) => updateActiveVariation("notes", event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
              </div>
          </section>
              </div>
              <div className="border-t border-[#E8EDF5] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>Pricing Summary</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeVariation.includeMarginInExport}
                      onChange={() => updateActiveVariation("includeMarginInExport", !activeVariation.includeMarginInExport)}
                      className="h-4 w-4 rounded border-[#CBD5E1]"
                    />
                    <span className={styles.quoteBodyLabel}>Mark up (%)</span>
                  </label>
                  <Input
                    type="number"
                    value={activeVariation.marginPercent === "0" ? "" : activeVariation.marginPercent}
                    onChange={(event) => updateActiveVariation("marginPercent", event.target.value)}
                    className="h-10 rounded-[6px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeVariation.includeDiscountInExport}
                      onChange={() => updateActiveVariation("includeDiscountInExport", !activeVariation.includeDiscountInExport)}
                      className="h-4 w-4 rounded border-[#CBD5E1]"
                    />
                    <span className={styles.quoteBodyLabel}>Discount</span>
                  </label>
                  <Input
                    type="number"
                    value={activeVariation.discountAmount === "0" ? "" : activeVariation.discountAmount}
                    onChange={(event) => updateActiveVariation("discountAmount", event.target.value)}
                    className="h-10 rounded-[6px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeVariation.includeContingencyInExport}
                      onChange={() => updateActiveVariation("includeContingencyInExport", !activeVariation.includeContingencyInExport)}
                      className="h-4 w-4 rounded border-[#CBD5E1]"
                    />
                    <span className={styles.quoteBodyLabel}>P&G</span>
                  </label>
                  <Input
                    type="number"
                    value={activeVariation.contingencyAmount === "0" ? "" : activeVariation.contingencyAmount}
                    onChange={(event) => updateActiveVariation("contingencyAmount", event.target.value)}
                    className="h-10 rounded-[6px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>GST (%)</label>
                  <Input
                    type="number"
                    value={activeVariation.gstPercent}
                    onChange={(event) => updateActiveVariation("gstPercent", event.target.value)}
                    className="h-10 rounded-[6px]"
                  />
                </div>
              </div>

              <div className="rounded-[16px] border border-[#E8EDF5] bg-[#F9FAFC] px-4 py-4">
                <div className={`${interMedium.className} space-y-3 text-sm`}>
                  <p className="flex items-center justify-between"><span className="text-[#64748B]">Discount</span><span className="font-medium text-[#1d2433]">-{toMoney(pricingSummary.discount)}</span></p>
                  <p className="flex items-center justify-between"><span className="text-[#64748B]">P&G</span><span className="font-medium text-[#1d2433]">{toMoney(pricingSummary.contingency)}</span></p>
                  {showMarginBreakout ? (
                    <p className="flex items-center justify-between"><span className="text-[#64748B]">Mark up</span><span className="font-medium text-[#1d2433]">{toMoney(pricingSummary.margin)}</span></p>
                  ) : null}
                  <div className="h-px bg-[#E7ECF3]" />
                  <p className="flex items-center justify-between">
                    <span className="text-[#64748B]">Subtotal</span>
                    <span className="font-medium text-[#1d2433]">{toMoney(pricingSummary.baseSubtotal + pricingSummary.margin)}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-[#64748B]">Total GST {activeVariation.gstPercent.trim() || "15"}.00%</span>
                    <span className="font-medium text-[#1d2433]">{toMoney(pricingSummary.gst)}</span>
                  </p>
                  <div className="h-px bg-[#E7ECF3]" />
                  <p className="flex items-center justify-between pt-1">
                    <span className="text-[15px] font-semibold text-[#1d2433]">Total</span>
                    <span className="text-[15px] font-semibold text-[#1d2433]">{toMoney(pricingSummary.grandTotal)}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveVariation} disabled={!canManageVariation || isSaving} className={`${interMedium.className} h-10 w-full rounded-full bg-[#0B2739] text-sm font-medium text-white hover:bg-[#0B2739]`}>
                  {isSaving ? "Saving..." : "Save Variation"}
                </Button>
                <Button
                  type="button"
                  onClick={exportVariationPdf}
                  disabled={isSaving}
                  variant="outline"
                  className={`${interMedium.className} h-10 w-full rounded-full border-[#d3dbe8] bg-[#F8F9FC] text-sm font-medium text-[#1d2433]`}
                >
                  Export PDF
                </Button>
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : (
        <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#EEF3FA] text-[#29446E]">
              <FileStack className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-[#0F172A]">No variations yet</h2>
            <p className={`${interMedium.className} mt-2 max-w-[520px] text-sm text-[#64748B]`}>
              Start your variation register by creating the first variation for this project. You can then build costs,
              attach supporting documents, send to client, and track approval through to invoicing.
            </p>
            <Button
              type="button"
              onClick={() => void createVariation()}
              disabled={isCreatingVariation}
              className={`${interMedium.className} mt-6 h-10 rounded-[6px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
            >
              <Plus className="mr-1 h-4 w-4" />
              {isCreatingVariation ? "Creating..." : "Create First Variation"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
