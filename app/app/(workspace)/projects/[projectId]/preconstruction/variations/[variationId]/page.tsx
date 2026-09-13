"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
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
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { CommercialLinePrefixedNumberInput } from "@/components/app/CommercialLineItemsTable";
import {
  COMMERCIAL_LINE_GRID_WITH_SOURCE,
  COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE,
} from "@/components/app/commercial-line-table-layout";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { PricingWorksheetOverlayDialog } from "@/components/app/PricingWorksheetOverlayDialog";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { VariationPricingWorksheetEntryPanel } from "@/components/app/VariationPricingWorksheetEntryPanel";
import { VariationRecordTabs } from "@/components/app/VariationRecordTabs";
import { VariationImportPurchaseOrderLinesDrawer } from "@/components/app/VariationImportPurchaseOrderLinesDrawer";
import { VariationSupplierPricingDrawer } from "@/components/app/VariationSupplierPricingDrawer";
import { WorksheetSourceLink } from "@/components/app/WorksheetSourceLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import {
  createOpportunityPricingWorkbook,
} from "@/lib/opportunity-pricing-workbook";
import {
  createDefaultWorksheetData,
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildVariationPricingWorksheetOwner } from "@/lib/pricing-worksheet-owner";
import { mapPricingWorksheetUiErrorMessage } from "@/lib/pricing-worksheet-ui-errors";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { canManageCommercialData } from "@/lib/role-permissions";
import { buildVariationLineFromSupplierPrice } from "@/lib/materials/variation-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import {
  buildVariationCommercialItemSourceHref,
  enrichVariationLineItemsWithCommercialItems,
  type VariationCommercialItemLink,
} from "@/lib/commercial-items/variation-linking";
import styles from "@/components/app/trade-pack-builder.module.css";
import {
  loadVariationSupplierPricingPermissionsAction,
  type VariationSupplierPricingPermissions,
} from "./actions";

type VariationStatus = "Draft" | "Priced" | "Sent" | "Client Review" | "Approved" | "Rejected" | "Invoiced";
type VariationOrigin = "Client Request" | "Drawing Revision" | "Site Instruction" | "RFI" | "Unknown";
type CostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";
type VariationDrawerType = "purchase-order" | "materials" | null;

interface CostLine {
  id: string;
  section: CostSection;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sourceProjectQuoteId?: string | null;
  sourceProjectQuoteLineItemId?: string | null;
  sourceProjectQuoteNumber?: string;
  sourcePurchaseOrderId?: string | null;
  sourcePurchaseOrderLineItemId?: string | null;
  sourcePurchaseOrderNumber?: string;
  commercialItemLink?: VariationCommercialItemLink | null;
}

type CostLineIdentityFields = Pick<
  CostLine,
  "section" | "description" | "quantity" | "unit" | "rate" | "total" | "sourceProjectQuoteLineItemId" | "sourcePurchaseOrderLineItemId"
>;

interface AttachmentItem {
  id: string;
  name: string;
  type: "Drawing" | "Email" | "Site Instruction";
  storagePath: string | null;
  externalUrl: string | null;
}

interface VariationItem {
  id: string;
  updatedAt: string | null;
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
  updated_at: string | null;
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

function nullIfBlank(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function lineTotal(line: CostLine) {
  if (typeof line.total === "number" && Number.isFinite(line.total)) {
    return line.total;
  }

  if (typeof line.quantity === "number" && Number.isFinite(line.quantity) && typeof line.rate === "number" && Number.isFinite(line.rate)) {
    return line.quantity * line.rate;
  }

  return 0;
}

function getCostLineSignature(line: CostLineIdentityFields) {
  return [
    line.section,
    line.description.trim(),
    line.quantity === null ? "null" : Number(line.quantity).toFixed(6),
    (line.unit ?? "").trim(),
    line.rate === null ? "null" : Number(line.rate).toFixed(6),
    line.total === null ? "null" : Number(line.total).toFixed(2),
  ].join("::");
}

function normalizeCostLineId(line: CostLine) {
  return line.id.trim();
}

function reconcileVariationCostLineIds(currentLines: CostLine[], persistedLines: CostLine[]) {
  const persistedById = new Map(
    persistedLines
      .map((line) => [normalizeCostLineId(line), line] as const)
      .filter(([id]) => id.length > 0)
  );
  const persistedBySourceLineId = new Map<string, CostLine[]>();
  const persistedBySignature = new Map<string, CostLine[]>();

  persistedLines.forEach((line) => {
    if (line.sourcePurchaseOrderLineItemId) {
      const existingBySource = persistedBySourceLineId.get(line.sourcePurchaseOrderLineItemId) ?? [];
      existingBySource.push(line);
      persistedBySourceLineId.set(line.sourcePurchaseOrderLineItemId, existingBySource);
    }

    const signature = getCostLineSignature(line);
    const existingBySignature = persistedBySignature.get(signature) ?? [];
    existingBySignature.push(line);
    persistedBySignature.set(signature, existingBySignature);
  });

  const claimedPersistedIds = new Set<string>();

  return currentLines.map((line) => {
    const normalizedId = normalizeCostLineId(line);
    if (normalizedId.length > 0 && persistedById.has(normalizedId)) {
      claimedPersistedIds.add(normalizedId);
      return { ...line, id: normalizedId };
    }

    if (line.sourcePurchaseOrderLineItemId) {
      const sourceMatches = (persistedBySourceLineId.get(line.sourcePurchaseOrderLineItemId) ?? [])
        .filter((candidate) => !claimedPersistedIds.has(candidate.id));
      if (sourceMatches.length === 1) {
        claimedPersistedIds.add(sourceMatches[0].id);
        return { ...line, id: sourceMatches[0].id };
      }
    }

    const signatureMatches = (persistedBySignature.get(getCostLineSignature(line)) ?? [])
      .filter((candidate) => !claimedPersistedIds.has(candidate.id));
    if (signatureMatches.length === 1) {
      claimedPersistedIds.add(signatureMatches[0].id);
      return { ...line, id: signatureMatches[0].id };
    }

    return {
      ...line,
      id: normalizedId || crypto.randomUUID(),
    };
  });
}

function makeDefaultCostLine(section: CostSection = "Labour"): CostLine {
  return {
    id: crypto.randomUUID(),
    section,
    description: "",
    quantity: 1,
    unit: section === "Labour" ? "hr" : "item",
    rate: 0,
    total: null,
    commercialItemLink: null,
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

function variationStatusBadge(status: VariationStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Approved": return "approved";
    case "Rejected": return "overdue";
    case "Invoiced": return "sent";
    case "Sent": return "sent";
    case "Client Review": return "pending";
    case "Priced": return "active";
    default: return "draft";
  }
}

function resolveOverlayWorksheetIdFromPathname(pathname: string | null | undefined, basePath: string) {
  if (!pathname || !pathname.startsWith(`${basePath}/pricing-worksheet/`)) {
    return null;
  }

  const suffix = pathname.slice(`${basePath}/pricing-worksheet/`.length).split("/")[0] ?? null;
  return suffix && suffix.trim().length > 0 ? suffix : null;
}

function isVariationPricingWorksheetPath(pathname: string | null | undefined, basePath: string | null) {
  if (!pathname || !basePath) {
    return false;
  }

  return pathname === `${basePath}/pricing-worksheet` || pathname.startsWith(`${basePath}/pricing-worksheet/`);
}

function resolveOverlayWorksheetIdFromHistoryState(state: unknown) {
  if (!state || typeof state !== "object") {
    return null;
  }

  const overlayState = state as {
    pricingWorksheetOverlay?: unknown;
    worksheetId?: unknown;
  };

  if (!overlayState.pricingWorksheetOverlay || typeof overlayState.worksheetId !== "string") {
    return null;
  }

  const worksheetId = overlayState.worksheetId.trim();
  return worksheetId.length > 0 ? worksheetId : null;
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

export default function ProjectVariationsPage() {
  const params = useParams<{ projectId: string; variationId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeVariationId = params?.variationId;
  const isNewVariationRoute = routeVariationId === "new";
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuth();
  const canManageVariation = canManageCommercialData(session?.role);
  const [supplierPricingPermissions, setSupplierPricingPermissions] = useState<VariationSupplierPricingPermissions | null>(null);
  const [activeVariationDrawer, setActiveVariationDrawer] = useState<VariationDrawerType>(null);
  const materialsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeDrawerTriggerRef = useRef<HTMLElement | null>(null);
  const canUseMaterials = canManageVariation
    && supplierPricingPermissions?.canViewMaterials === true
    && supplierPricingPermissions.canWriteVariation;

  const [variations, setVariations] = useState<VariationItem[]>([]);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const persistedCostLinesByVariationRef = useRef<Map<string, CostLine[]>>(new Map());
  const enrichedVariationIdsRef = useRef<Set<string>>(new Set());
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const [projectSourceOpportunityId, setProjectSourceOpportunityId] = useState<string | null>(null);
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
  const [isLoadingVariations, setIsLoadingVariations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingVariation, setIsCreatingVariation] = useState(false);
  const [isCreatingWorksheet, setIsCreatingWorksheet] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingVariationWorksheetId, setExistingVariationWorksheetId] = useState<string | null>(null);
  const [variationWorksheetId, setVariationWorksheetId] = useState<string | null>(null);
  const [isVariationWorksheetClosePending, setIsVariationWorksheetClosePending] = useState(false);
  const [isVariationWorksheetDirty, setIsVariationWorksheetDirty] = useState(false);
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const [isCostBuildUpOpen, setIsCostBuildUpOpen] = useState(true);
  const [isTermsOpen, setIsTermsOpen] = useState(true);
  const [isDocsOpen, setIsDocsOpen] = useState(true);
  const [pendingAttachmentType, setPendingAttachmentType] = useState<AttachmentItem["type"] | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const variationWorksheetClosePendingRef = useRef(false);
  const hasAutoCreatedOnNewRoute = useRef(false);
  const variationDetailPath = activeVariationId && routeProjectSlug
    ? `/app/projects/${routeProjectSlug}/preconstruction/variations/${activeVariationId}`
    : null;
  const variationWorksheetTabPath = variationDetailPath ? `${variationDetailPath}/pricing-worksheet` : null;
  const variationWorksheetStorageKey = activeVariationId
    ? `variation-pricing-worksheet-overlay:${activeVariationId}`
    : null;
  const overlayWorksheetIdFromPathname = useMemo(
    () => (variationDetailPath ? resolveOverlayWorksheetIdFromPathname(pathname, variationDetailPath) : null),
    [pathname, variationDetailPath],
  );
  const restoredOverlayWorksheetId = useMemo(
    () =>
      overlayWorksheetIdFromPathname ??
      resolveOverlayWorksheetIdFromHistoryState(typeof window !== "undefined" ? window.history.state : null) ??
      (variationWorksheetStorageKey ? readPersistedOverlayWorksheetId(variationWorksheetStorageKey) : null),
    [overlayWorksheetIdFromPathname, variationWorksheetStorageKey],
  );
  const isPricingWorksheetTabActive = useMemo(
    () => isVariationPricingWorksheetPath(pathname, variationDetailPath),
    [pathname, variationDetailPath],
  );
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadVariationSupplierPricingPermissionsAction()
      .then((permissions) => {
        if (!cancelled) setSupplierPricingPermissions(permissions);
      })
      .catch(() => {
        if (!cancelled) {
          setSupplierPricingPermissions({ canViewMaterials: false, canWriteVariation: false });
        }
      });
    return () => { cancelled = true; };
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
        .select("id, project_code, name, location, source_opportunity_id")
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

      let resolvedProjectSourceOpportunityId = projectRow.source_opportunity_id ?? null;
      if (!resolvedProjectSourceOpportunityId) {
        const { data: repairedSourceOpportunityId, error: repairError } = await supabase.rpc(
          "repair_project_source_opportunity_lineage" as never,
          {
            p_project_id: projectRow.id,
          } as never,
        );

        if (repairError) {
          if (!cancelled) {
            setError(repairError.message);
          }
          setIsLoadingVariations(false);
          return;
        }

        const repairedSourceOpportunityValue =
          typeof repairedSourceOpportunityId === "string" ? repairedSourceOpportunityId.trim() : "";
        resolvedProjectSourceOpportunityId =
          repairedSourceOpportunityValue.length > 0 ? repairedSourceOpportunityValue : null;
      }

      setOrganizationId(resolvedOrganizationId);
      setDbProjectId(projectRow.id);
      setProjectSourceOpportunityId(resolvedProjectSourceOpportunityId);
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
      const [
        { data: variationRowsRaw, error: variationError },
        { data: purchaseOrderRowsRaw },
        { data: purchaseOrderLineRowsRaw },
      ] = await Promise.all([
        variationsTable
          .select(
          "id, updated_at, variation_number, variation_title, status, origin, requested_by, requested_date, due_date, sent_to_client_at, approved_at, invoice_ready, margin_percent, discount_amount, contingency_amount, gst_percent, include_margin_in_export, include_discount_in_export, include_contingency_in_export, notes, validity_period, payment_terms, lead_time, terms_inclusions, terms_exclusions, clarifications, assumptions"
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
        persistedCostLinesByVariationRef.current = new Map();
        enrichedVariationIdsRef.current = new Set();
        setPersistedVariationIds(new Set());
        setIsLoadingVariations(false);
        return;
      }

      const variationIds = variationRows.map((row) => row.id);
      const [{ data: lineRowsRaw }, { data: attachmentRowsRaw }] = await Promise.all([
        lineItemsTable
          .select("id, variation_id, section, description, quantity, unit, rate, total, source_project_quote_id, source_project_quote_line_item_id, source_project_quote_number, source_purchase_order_id, source_purchase_order_line_item_id, source_purchase_order_number")
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
        quantity: number | null;
        unit: string | null;
        rate: number | null;
        total: number | null;
        source_project_quote_id: string | null;
        source_project_quote_line_item_id: string | null;
        source_project_quote_number: string | null;
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
          quantity: lineRow.quantity === null ? null : Number(lineRow.quantity),
          unit: lineRow.unit ?? null,
          rate: lineRow.rate === null ? null : Number(lineRow.rate),
          total: lineRow.total === null ? null : Number(lineRow.total),
          sourceProjectQuoteId: lineRow.source_project_quote_id ?? null,
          sourceProjectQuoteLineItemId: lineRow.source_project_quote_line_item_id ?? null,
          sourceProjectQuoteNumber: lineRow.source_project_quote_number ?? "",
          sourcePurchaseOrderId: lineRow.source_purchase_order_id ?? null,
          sourcePurchaseOrderLineItemId: lineRow.source_purchase_order_line_item_id ?? null,
          sourcePurchaseOrderNumber: lineRow.source_purchase_order_number ?? "",
          commercialItemLink: null,
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
        updatedAt: row.updated_at ?? null,
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

      persistedCostLinesByVariationRef.current = new Map(
        hydratedVariations.map((variation) => [
          variation.id,
          variation.costLines.map((line) => ({ ...line })),
        ])
      );
      enrichedVariationIdsRef.current = new Set();

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

  useEffect(() => {
    if (!supabase || !organizationId || !activeVariation?.id) {
      return;
    }

    if (enrichedVariationIdsRef.current.has(activeVariation.id)) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const enrichedLines = await enrichVariationLineItemsWithCommercialItems({
        client: supabase,
        organizationId,
        variationId: activeVariation.id,
        lineItems: activeVariation.costLines,
        onWarning: (loadError) => {
          if (!cancelled) {
            setError((current) => current ?? loadError.message);
          }
        },
      });

      if (cancelled) {
        return;
      }

      enrichedVariationIdsRef.current.add(activeVariation.id);
      persistedCostLinesByVariationRef.current.set(
        activeVariation.id,
        enrichedLines.map((line) => ({ ...line })),
      );
      setVariations((current) =>
        current.map((variation) =>
          variation.id === activeVariation.id
            ? { ...variation, costLines: enrichedLines.map((line) => ({ ...line })) }
            : variation,
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [activeVariation?.costLines, activeVariation?.id, organizationId, supabase]);

  const worksheetOwner = useMemo(() => {
    if (!organizationId || !dbProjectId || !routeProjectSlug || !activeVariationId) {
      return null;
    }

    return buildVariationPricingWorksheetOwner({
      organizationId,
      opportunityId: projectSourceOpportunityId,
      projectId: dbProjectId,
      projectSlug: routeProjectSlug,
      variationId: activeVariationId,
      variationCode: activeVariation?.code ?? null,
    });
  }, [activeVariation?.code, activeVariationId, dbProjectId, organizationId, projectSourceOpportunityId, routeProjectSlug]);
  const hasVariations = variations.length > 0;
  const variationWorksheetNavigationHref =
    variationWorksheetId && variationWorksheetTabPath
      ? `${variationWorksheetTabPath}/${variationWorksheetId}`
      : existingVariationWorksheetId && variationWorksheetTabPath
        ? `${variationWorksheetTabPath}/${existingVariationWorksheetId}`
        : variationWorksheetTabPath ?? variationDetailPath ?? "#";
  const selectedPurchaseOrder = useMemo(
    () => purchaseOrders.find((purchaseOrder) => purchaseOrder.id === selectedPurchaseOrderId) ?? null,
    [purchaseOrders, selectedPurchaseOrderId]
  );
  const selectedPurchaseOrderLineOptions = useMemo(
    () => purchaseOrderLines.filter((line) => line.purchase_order_id === selectedPurchaseOrderId),
    [purchaseOrderLines, selectedPurchaseOrderId]
  );
  const alreadyImportedPurchaseOrderLineIds = useMemo(
    () => new Set(
      activeVariation?.costLines
        .map((line) => line.sourcePurchaseOrderLineItemId)
        .filter((value): value is string => Boolean(value)) ?? [],
    ),
    [activeVariation?.costLines],
  );

  useEffect(() => {
    if (!restoredOverlayWorksheetId) {
      return;
    }

    setVariationWorksheetId((current) => current ?? restoredOverlayWorksheetId);
  }, [restoredOverlayWorksheetId]);

  useEffect(() => {
    if (!variationWorksheetStorageKey) {
      return;
    }

    writePersistedOverlayWorksheetId(variationWorksheetStorageKey, variationWorksheetId);
  }, [variationWorksheetId, variationWorksheetStorageKey]);

  useEffect(() => {
    if (!supabase || !organizationId || !activeVariationId) {
      setExistingVariationWorksheetId(null);
      setVariationWorksheetId(null);
      return;
    }

    let cancelled = false;

    const loadVariationWorksheet = async () => {
      const { data, error: worksheetError } = await supabase
        .from("opportunity_pricing_worksheets")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("variation_id", activeVariationId)
        .is("archived_at", null)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (worksheetError) {
        setError(mapPricingWorksheetUiErrorMessage(worksheetError, "Unable to load the pricing worksheet right now."));
        return;
      }

      if (!data?.id && !overlayWorksheetIdFromPathname) {
        setExistingVariationWorksheetId(null);
        setVariationWorksheetId(null);
        return;
      }

      setExistingVariationWorksheetId(data?.id ?? null);
      if (overlayWorksheetIdFromPathname) {
        setVariationWorksheetId(overlayWorksheetIdFromPathname);
      } else if (data?.id && pathname === variationWorksheetTabPath) {
        setIsVariationWorksheetDirty(false);
        setVariationWorksheetId(data.id);
        if (variationWorksheetStorageKey) {
          writePersistedOverlayWorksheetId(variationWorksheetStorageKey, data.id);
        }
        window.history.replaceState({ pricingWorksheetOverlay: true, worksheetId: data.id }, "", `${variationWorksheetTabPath}/${data.id}`);
      }
    };

    void loadVariationWorksheet();

    return () => {
      cancelled = true;
    };
  }, [
    activeVariationId,
    organizationId,
    overlayWorksheetIdFromPathname,
    pathname,
    supabase,
    variationWorksheetStorageKey,
    variationWorksheetTabPath,
  ]);

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

  const openVariationWorksheet = useCallback((worksheetId: string, options?: { replace?: boolean }) => {
    if (!variationDetailPath || !variationWorksheetStorageKey || !variationWorksheetTabPath) {
      return;
    }

    const targetPath = `${variationWorksheetTabPath}/${worksheetId}`;
    const nextState = { pricingWorksheetOverlay: true, worksheetId };
    variationWorksheetClosePendingRef.current = false;
    setIsVariationWorksheetClosePending(false);
    setIsVariationWorksheetDirty(false);
    setVariationWorksheetId(worksheetId);
    writePersistedOverlayWorksheetId(variationWorksheetStorageKey, worksheetId);
    if (options?.replace) {
      window.history.replaceState(nextState, "", targetPath);
      return;
    }

    window.history.pushState(nextState, "", targetPath);
  }, [variationDetailPath, variationWorksheetStorageKey, variationWorksheetTabPath]);

  const closeVariationWorksheetOverlay = useCallback(() => {
    if (
      !variationDetailPath
      || !variationWorksheetStorageKey
      || !variationWorksheetId
      || variationWorksheetClosePendingRef.current
    ) {
      return;
    }

    setIsVariationWorksheetDirty(false);
    variationWorksheetClosePendingRef.current = true;
    setIsVariationWorksheetClosePending(true);
    // The local worksheet id remains authoritative while the route request is
    // pending. Clearing only persisted restoration here prevents a cold route
    // remount from reopening an overlay that the user has already closed.
    writePersistedOverlayWorksheetId(variationWorksheetStorageKey, null);
    try {
      router.replace(variationDetailPath, { scroll: false });
    } catch (navigationError) {
      variationWorksheetClosePendingRef.current = false;
      setIsVariationWorksheetClosePending(false);
      writePersistedOverlayWorksheetId(variationWorksheetStorageKey, variationWorksheetId);
      throw navigationError;
    }
  }, [router, variationDetailPath, variationWorksheetId, variationWorksheetStorageKey]);

  useEffect(() => {
    if (
      !isVariationWorksheetClosePending
      || !variationDetailPath
      || pathname !== variationDetailPath
    ) {
      return;
    }

    variationWorksheetClosePendingRef.current = false;
    setVariationWorksheetId(null);
    if (variationWorksheetStorageKey) {
      writePersistedOverlayWorksheetId(variationWorksheetStorageKey, null);
    }
    setIsVariationWorksheetClosePending(false);
  }, [
    isVariationWorksheetClosePending,
    pathname,
    variationDetailPath,
    variationWorksheetStorageKey,
  ]);

  useEffect(() => {
    if (
      isVariationWorksheetClosePending
      || !variationWorksheetId
      || !variationDetailPath
      || pathname !== variationDetailPath
    ) {
      return;
    }

    const targetPath = `${variationWorksheetTabPath}/${variationWorksheetId}`;
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};

    window.history.replaceState(
      {
        ...currentState,
        pricingWorksheetOverlay: true,
        worksheetId: variationWorksheetId,
      },
      "",
      targetPath,
    );
  }, [
    isVariationWorksheetClosePending,
    pathname,
    variationDetailPath,
    variationWorksheetId,
    variationWorksheetTabPath,
  ]);

  useEffect(() => {
    if (!variationWorksheetId || !variationDetailPath || !variationWorksheetStorageKey) {
      return;
    }

    const handlePopState = () => {
      if (
        isVariationWorksheetDirty &&
        !window.confirm("You have unsaved pricing worksheet changes. Leave this worksheet and discard those local edits?")
      ) {
        window.history.pushState(
          { pricingWorksheetOverlay: true, worksheetId: variationWorksheetId },
          "",
          `${variationDetailPath}/pricing-worksheet/${variationWorksheetId}`,
        );
        return;
      }

      setIsVariationWorksheetDirty(false);
      variationWorksheetClosePendingRef.current = false;
      setIsVariationWorksheetClosePending(false);
      setVariationWorksheetId(null);
      writePersistedOverlayWorksheetId(variationWorksheetStorageKey, null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [
    isVariationWorksheetDirty,
    variationDetailPath,
    variationWorksheetId,
    variationWorksheetStorageKey,
  ]);

  const createOrOpenVariationWorksheet = useCallback(async () => {
    if (!supabase || !session?.id || !organizationId || !dbProjectId || !activeVariationId) {
      setError("Unable to open the pricing worksheet right now.");
      return;
    }

    if (!projectSourceOpportunityId) {
      setError("This project does not have source opportunity lineage yet, so the pricing worksheet cannot open.");
      return;
    }

    if (existingVariationWorksheetId) {
      openVariationWorksheet(existingVariationWorksheetId, {
        replace: pathname === variationWorksheetTabPath,
      });
      return;
    }

    setIsCreatingWorksheet(true);
    setError(null);
    setSaveMessage(null);

    try {
      const workbook = await createOpportunityPricingWorkbook({
        supabase,
        organizationId,
        opportunityId: projectSourceOpportunityId,
        projectId: dbProjectId,
        variationId: activeVariationId,
        name: activeVariation?.title?.trim() || "Pricing Worksheet",
        pricingSummary: createDefaultWorksheetPricingSummary(),
        extractedPricingData: createDefaultWorksheetExtractedPricingData(),
        tradePackage: null,
        userId: session.id,
        worksheet: createDefaultWorksheetData(),
      });

      setExistingVariationWorksheetId(workbook.id);
      setVariationWorksheetId(workbook.id);
      openVariationWorksheet(workbook.id, {
        replace: pathname === variationWorksheetTabPath,
      });
    } catch (worksheetError) {
      setError(mapPricingWorksheetUiErrorMessage(worksheetError, "Unable to create the pricing worksheet right now."));
    } finally {
      setIsCreatingWorksheet(false);
    }
  }, [
    activeVariation?.title,
    activeVariationId,
    dbProjectId,
    openVariationWorksheet,
    organizationId,
    pathname,
    projectSourceOpportunityId,
    session?.id,
    supabase,
    existingVariationWorksheetId,
    variationWorksheetTabPath,
  ]);

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
  const variationPreGstTotal = Math.max(0, pricingSummary.grandTotal - pricingSummary.gst);

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
      if (typeof createdRow.updated_at !== "string" || createdRow.updated_at.length === 0) {
        throw new Error("Variation was created but no updated timestamp was returned.");
      }

      const createdVariation: VariationItem = {
        id: createdRow.id,
        updatedAt: createdRow.updated_at,
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
      persistedCostLinesByVariationRef.current.set(
        createdVariation.id,
        createdVariation.costLines.map((line) => ({ ...line }))
      );
      enrichedVariationIdsRef.current.delete(createdVariation.id);
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

  const closeActiveVariationDrawer = () => {
    setActiveVariationDrawer(null);
    const trigger = activeDrawerTriggerRef.current;
    window.requestAnimationFrame(() => trigger?.focus());
  };

  const openMaterials = (trigger: HTMLElement | null = materialsTriggerRef.current) => {
    if (!canUseMaterials) return;
    activeDrawerTriggerRef.current = trigger;
    setActiveVariationDrawer("materials");
  };

  const addSupplierMaterial = (item: PricingWorksheetMaterialPickerItem) => {
    if (!activeVariation || !canUseMaterials) {
      setError("You do not have permission to add supplier-priced materials to this Variation.");
      return;
    }
    try {
      const line = buildVariationLineFromSupplierPrice(item);
      setVariations((current) => current.map((variation) => (
        variation.id === activeVariation.id
          ? { ...variation, costLines: [...variation.costLines, line] }
          : variation
      )));
      setError(null);
      setSaveMessage("Material added to the Variation. Save Variation to persist this line.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "This supplier price cannot be added to the Variation.");
    }
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

  const openPurchaseOrderImport = (trigger: HTMLElement) => {
    activeDrawerTriggerRef.current = trigger;
    setActiveVariationDrawer("purchase-order");
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
        total: Number(((Number(line.quantity ?? 0)) * (Number(line.rate ?? 0))).toFixed(2)),
        sourcePurchaseOrderId: selectedPurchaseOrder.id,
        sourcePurchaseOrderLineItemId: line.id,
        sourcePurchaseOrderNumber: selectedPurchaseOrder.purchase_order_number,
        commercialItemLink: null,
      } satisfies CostLine));

    if (importedLines.length === 0) {
      return;
    }

    updateActiveVariation("costLines", [...activeVariation.costLines, ...importedLines]);
    setSelectedPurchaseOrderLineIds(new Set());
  };

  const updateCostLine = <K extends keyof CostLine>(lineId: string, key: K, value: CostLine[K]) => {
    if (!activeVariation) return;
    updateActiveVariation(
      "costLines",
      activeVariation.costLines.map((line) => {
        if (line.id !== lineId) {
          return line;
        }

        const nextLine = { ...line, [key]: value };
        if ((key === "quantity" || key === "rate")) {
          const nextQuantity = nextLine.quantity;
          const nextRate = nextLine.rate;
          if (
            typeof nextQuantity === "number" &&
            Number.isFinite(nextQuantity) &&
            typeof nextRate === "number" &&
            Number.isFinite(nextRate)
          ) {
            nextLine.total = Number((nextQuantity * nextRate).toFixed(2));
          }
        }

        return nextLine;
      }),
    );
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
      updateActiveVariation("clientSentAt", new Date().toISOString());
    }
    if (status === "Approved") {
      updateActiveVariation("approvedAt", new Date().toISOString());
      updateActiveVariation("invoiceReady", true);
    }
  };

  const saveVariation = async () => {
    if (!activeVariation || !supabase || !organizationId || !dbProjectId) {
      setError("Variation save is not ready. Please refresh and try again.");
      return;
    }
    if (!activeVariation.updatedAt) {
      setError("Variation version is missing. Please refresh and try again.");
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
      const currentOrganizationId = organizationId;
      const currentProjectId = dbProjectId;
      const persistedCostLines = persistedCostLinesByVariationRef.current.get(activeVariation.id) ?? [];
      const reconciledCostLines = reconcileVariationCostLineIds(activeVariation.costLines, persistedCostLines);

      const lineItemsPayload = reconciledCostLines.map((line) => ({
        id: line.id,
        section: line.section,
        description: line.description,
        quantity: line.quantity === null ? null : Number(line.quantity),
        unit: line.unit,
        rate: line.rate === null ? null : Number(line.rate),
        total: line.total === null ? null : Number(line.total),
        sourceProjectQuoteId: line.sourceProjectQuoteId ?? null,
        sourceProjectQuoteLineItemId: line.sourceProjectQuoteLineItemId ?? null,
        sourceProjectQuoteNumber: line.sourceProjectQuoteNumber ?? "",
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
        p_organization_id: currentOrganizationId,
        p_project_id: currentProjectId,
        p_variation_id: activeVariation.id,
        p_expected_updated_at: activeVariation.updatedAt,
        p_variation_title: activeVariation.title.trim() || activeVariation.code,
        p_variation_number: activeVariation.code,
        p_status: activeVariation.status,
        p_origin: activeVariation.origin,
        p_requested_by: activeVariation.requestedBy,
        p_requested_date: nullIfBlank(activeVariation.requestedDate),
        p_due_date: nullIfBlank(activeVariation.dueDate),
        p_sent_to_client_at: nullIfBlank(activeVariation.clientSentAt),
        p_approved_at: nullIfBlank(activeVariation.approvedAt),
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

      const savedVariationId = typeof savedRow.id === "string" ? savedRow.id : null;
      if (!savedVariationId) {
        throw new Error("Variation was saved but no identifier was returned.");
      }
      const savedVariationUpdatedAt = typeof savedRow.updated_at === "string" ? savedRow.updated_at : null;
      if (!savedVariationUpdatedAt) {
        throw new Error("Variation was saved but no updated timestamp was returned.");
      }


      persistedCostLinesByVariationRef.current.set(
        savedVariationId,
        reconciledCostLines.map((line) => ({ ...line }))
      );
      setVariations((current) =>
        current.map((variation) =>
          variation.id === activeVariation.id || variation.id === savedVariationId
            ? { ...variation, id: savedVariationId, updatedAt: savedVariationUpdatedAt, costLines: reconciledCostLines }
            : variation
        )
      );
      setActiveVariationId(savedVariationId);
      setPersistedVariationIds((current) => new Set([...current, savedVariationId]));
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
      persistedCostLinesByVariationRef.current.delete(variationId);
      enrichedVariationIdsRef.current.delete(variationId);
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
            const exportedRate = (line.rate ?? 0) * exportMarginMultiplier;
            const exportedLineTotal = lineTotal(line) * exportMarginMultiplier;
            const qty = typeof line.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : 0;
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
      <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
        <OperationalModuleHeader
          title={<span className="inline-block h-9 w-48 animate-pulse rounded-full bg-[var(--surface-muted)]" aria-hidden="true" />}
          actions={
            <>
              <span className="inline-block h-9 w-32 animate-pulse rounded-full bg-[var(--surface-muted)]" aria-hidden="true" />
              <span className="inline-block h-9 w-28 animate-pulse rounded-full bg-[var(--surface-muted)]" aria-hidden="true" />
            </>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
            <div className="space-y-4">
              <div className="h-10 w-56 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)] md:col-span-2" />
                <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
                <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              </div>
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[var(--text-secondary)]`}>Loading variations...</p>
            </div>
          </div>
          <div className={`${styles.quotePanelCard} overflow-hidden`}>
            <div className="px-5 pb-3 pt-5">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Pricing Summary</h2>
            </div>
            <div className="space-y-3 px-5 pb-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{activeVariation?.code || "Variation"}</span>
            {activeVariation ? (
              <StatusBadge status={variationStatusBadge(activeVariation.status)}>
                {activeVariation.status}
              </StatusBadge>
            ) : null}
          </span>
        }
        description={saveMessage ?? undefined}
        actions={
          <>
            {!isPricingWorksheetTabActive ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void saveVariation()}
                disabled={!canManageVariation || isSaving}
              >
                {isSaving ? "Saving..." : "Save Variation"}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={exportVariationPdf}
              disabled={isSaving}
            >
              Export PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-9 px-3">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="!z-[200] min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]">
                <DropdownMenuItem asChild className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]">
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations`}>
                    <ExternalLink className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                    All Variations
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void createVariation();
                  }}
                  disabled={!canManageVariation || isCreatingVariation}
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  <Plus className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                  {isCreatingVariation ? "Creating..." : "New Variation"}
                </DropdownMenuItem>
                {activeVariation ? (
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void deleteVariation(activeVariation.id);
                    }}
                    disabled={!canManageVariation || isDeleting}
                    className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--error)] focus:bg-[var(--error-light)] focus:text-[var(--error)]"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {error ? (
        <OperationalAlert variant="error">
          {error}
        </OperationalAlert>
      ) : null}
      {!canManageVariation && session ? (
        <OperationalAlert variant="warning">
          You can review this variation, but only owner, admin, QS, and project manager roles can edit or delete it.
        </OperationalAlert>
      ) : null}
      {hasVariations && variationDetailPath ? (
        <VariationRecordTabs
          detailsHref={variationDetailPath}
          pricingWorksheetHref={variationWorksheetNavigationHref}
          activeTab={isPricingWorksheetTabActive ? "pricing-worksheet" : "details"}
        />
      ) : null}

      {hasVariations && activeVariation ? (
      <div className="space-y-6 [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface)] [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface)] [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--surface)]">
        {isPricingWorksheetTabActive ? (
          <VariationPricingWorksheetEntryPanel
            canManageVariation={canManageVariation}
            hasSourceOpportunityLineage={Boolean(projectSourceOpportunityId)}
            hasWorksheet={Boolean(existingVariationWorksheetId)}
            isCreatingWorksheet={isCreatingWorksheet}
            onOpenWorksheet={() => void createOrOpenVariationWorksheet()}
          />
        ) : (
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="border-b border-[var(--border-subtle)] pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Variation Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={styles.quoteBodyLabel}>Variation title</label>
                  <Input value={activeVariation.title} onChange={(event) => updateActiveVariation("title", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Status</label>
                  <select value={activeVariation.status} onChange={(event) => setStatus(event.target.value as VariationStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] pl-3 pr-8 text-sm text-[var(--text-primary)]`}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Variation code</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[6px] bg-[var(--surface-muted)]" /></div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Origin</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`}>
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
                  <button type="button" onClick={() => updateActiveVariation("invoiceReady", !activeVariation.invoiceReady)} className={`flex h-10 w-full items-center justify-between rounded-[6px] border px-3 text-sm ${activeVariation.invoiceReady ? "border-[var(--success-light)] bg-[var(--success-light)] text-[var(--success)]" : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"}`}>
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => openPurchaseOrderImport(event.currentTarget)}
                  className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Import PO Items
                </Button>
                {canUseMaterials ? (
                  <Button
                    ref={materialsTriggerRef}
                    type="button"
                    variant="outline"
                    onClick={(event) => openMaterials(event.currentTarget)}
                    className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Materials
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              <div className="overflow-x-auto">
                <div className={COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE}>
                  <div
                    className={`${interMedium.className} grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}
                    style={{ gridTemplateColumns: COMMERCIAL_LINE_GRID_WITH_SOURCE }}
                  >
                    <span className="px-3 py-2.5 font-semibold">Description</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Source</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Item</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Qty.</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Unit</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Price</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Amount</span>
                    <span className="border-l border-[var(--border)] px-3 py-2.5" />
                  </div>
                  <div className="divide-y divide-[var(--border-subtle)] bg-[var(--surface)]">
                    {activeVariation.costLines.map((line) => (
                      <div key={line.id} className="group grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: COMMERCIAL_LINE_GRID_WITH_SOURCE }}>
                        <div className="flex items-center px-3 py-1.5">
                          <DescriptionInputWithPreview
                            value={line.description}
                            onChange={(value) => updateCostLine(line.id, "description", value)}
                          />
                        </div>
                        <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                          {line.commercialItemLink ? (
                            <WorksheetSourceLink
                              href={buildVariationCommercialItemSourceHref({
                                commercialItemLink: line.commercialItemLink,
                              })}
                              className={`${interMedium.className} text-[11px] text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline`}
                            />
                          ) : (
                            <span className={`${interMedium.className} truncate text-[12px] text-[var(--text-secondary)]`}>
                              {line.sourceProjectQuoteNumber || line.sourcePurchaseOrderNumber || "Manual"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                          <select value={line.section} onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)} className={`${interMedium.className} h-9 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}>
                            {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                          <Input type="number" value={line.quantity ?? ""} onChange={(event) => updateCostLine(line.id, "quantity", event.target.value === "" ? null : numberOrZero(event.target.value))} className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                        </div>
                        <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                          <Input value={line.unit ?? ""} onChange={(event) => updateCostLine(line.id, "unit", event.target.value || null)} className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                        </div>
                        <div className="flex items-center border-l border-[var(--border-subtle)] px-3 py-1.5">
                          <CommercialLinePrefixedNumberInput
                            prefix="$"
                            value={line.rate === null ? "" : String(line.rate)}
                            onChange={(value) => updateCostLine(line.id, "rate", value === "" ? null : numberOrZero(value))}
                          />
                        </div>
                        <div className="flex items-center justify-end border-l border-[var(--border-subtle)] px-3 py-1.5">
                          <div className={`${interMedium.className} whitespace-nowrap text-right text-sm text-[var(--text-primary)]`}>{toMoney(lineTotal(line))}</div>
                        </div>
                        <div className="flex items-center justify-center border-l border-[var(--border-subtle)] px-0 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeCostLine(line.id)}
                            className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)]/80 opacity-0 shadow-none hover:bg-transparent hover:text-[var(--error)] group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-0"
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
                className={`${styles.quoteButtonLabel} h-8 rounded-none border-0 bg-transparent px-0 text-[var(--text-secondary)] shadow-none hover:bg-transparent hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-0`}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

          </section>

          <div className="border-t border-[var(--border-subtle)] py-6">
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
                  <textarea value={activeVariation.inclusions} onChange={(event) => updateActiveVariation("inclusions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Exclusions</label>
                  <textarea value={activeVariation.exclusions} onChange={(event) => updateActiveVariation("exclusions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm`} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Clarifications</label>
                  <textarea value={activeVariation.clarifications} onChange={(event) => updateActiveVariation("clarifications", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm`} />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Assumptions</label>
                  <textarea value={activeVariation.assumptions} onChange={(event) => updateActiveVariation("assumptions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm`} />
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
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Drawing")} className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)]`}><Upload className="mr-1 h-4 w-4" />Attach Drawing</Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Email")} className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)]`}><Mail className="mr-1 h-4 w-4" />Attach Email</Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Site Instruction")} className={`${styles.quoteButtonLabel} h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)]`}><Clock3 className="mr-1 h-4 w-4" />Attach SI</Button>
                </div>

                <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
                  <label className={styles.quoteBodyLabel}>Linked Documentation</label>
                  <div className="space-y-2">
                    {activeVariation.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                        <span className={`${interMedium.className} min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]`}>{attachment.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-[6px] bg-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{attachment.type}</span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeAttachment(attachment.id)}
                            className={`${interMedium.className} h-10 w-10 rounded-[6px] border-[var(--border)] bg-[var(--surface-muted)] p-0 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]`}
                            aria-label="Delete attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {activeVariation.attachments.length === 0 ? <p className={`${interMedium.className} text-sm text-[var(--text-secondary)]`}>No attachments.</p> : null}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className={styles.quoteBodyLabel}>Variation notes</label>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => updateActiveVariation("notes", "")}
                      className="h-8 w-8 rounded-[6px] p-0 text-[var(--text-muted)]/80 hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                      aria-label="Delete notes"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <textarea value={activeVariation.notes} onChange={(event) => updateActiveVariation("notes", event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[6px] border border-[var(--border)] px-3 py-2 text-sm`} />
                </div>
              </div>
          </section>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>Pricing Summary</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeVariation.includeMarginInExport}
                      onChange={() => updateActiveVariation("includeMarginInExport", !activeVariation.includeMarginInExport)}
                      className="h-4 w-4 rounded border-[var(--border)]"
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
                      className="h-4 w-4 rounded border-[var(--border)]"
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
                      className="h-4 w-4 rounded border-[var(--border)]"
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

              <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <div className={`${interMedium.className} space-y-3 text-sm`}>
                  <p className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Discount</span><span className="font-medium text-[var(--text-primary)]">-{toMoney(pricingSummary.discount)}</span></p>
                  <p className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">P&G</span><span className="font-medium text-[var(--text-primary)]">{toMoney(pricingSummary.contingency)}</span></p>
                  {showMarginBreakout ? (
                    <p className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Mark up</span><span className="font-medium text-[var(--text-primary)]">{toMoney(pricingSummary.margin)}</span></p>
                  ) : null}
                  <div className="h-px bg-[var(--border)]" />
                  <p className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">Subtotal (excl. GST)</span><span className="font-medium text-[var(--text-primary)]">{toMoney(variationPreGstTotal)}</span></p>
                  <p className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Total GST {activeVariation.gstPercent.trim() || "15"}.00%</span>
                    <span className="font-medium text-[var(--text-primary)]">{toMoney(pricingSummary.gst)}</span>
                  </p>
                  <div className="h-px bg-[var(--border)]" />
                  <p className="flex items-center justify-between pt-1">
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">Total (incl. GST)</span>
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">{toMoney(pricingSummary.grandTotal)}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveVariation} disabled={!canManageVariation || isSaving} className={`${interMedium.className} h-10 w-full rounded-full bg-[var(--navy-primary)] text-sm font-medium text-white hover:bg-[var(--navy-primary)]`}>
                  {isSaving ? "Saving..." : "Save Variation"}
                </Button>
                <Button
                  type="button"
                  onClick={exportVariationPdf}
                  disabled={isSaving}
                  variant="outline"
                  className={`${interMedium.className} h-10 w-full rounded-full border-[var(--border)] bg-[var(--surface-muted)] text-sm font-medium text-[var(--text-primary)]`}
                >
                  Export PDF
                </Button>
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      ) : (
        <Card className="border-[var(--border)] bg-[var(--surface-muted)] shadow-none">
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[6px] bg-[var(--border-subtle)] text-[var(--text-primary)]">
              <FileStack className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-[var(--text-primary)]">No variations yet</h2>
            <p className={`${interMedium.className} mt-2 max-w-[520px] text-sm text-[var(--text-secondary)]`}>
              Start your variation register by creating the first variation for this project. You can then build costs,
              attach supporting documents, send to client, and track approval through to invoicing.
            </p>
            <Button
              type="button"
              onClick={() => void createVariation()}
              disabled={isCreatingVariation}
              className={`${interMedium.className} mt-6 h-10 rounded-[6px] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-hover)]`}
            >
              <Plus className="mr-1 h-4 w-4" />
              {isCreatingVariation ? "Creating..." : "Create First Variation"}
            </Button>
          </CardContent>
        </Card>
      )}
      {variationWorksheetId && worksheetOwner ? (
        <PricingWorksheetOverlayDialog
          owner={worksheetOwner}
          worksheetId={variationWorksheetId}
          onClose={closeVariationWorksheetOverlay}
          onDirtyStateChange={setIsVariationWorksheetDirty}
        />
      ) : null}
      {activeVariationDrawer === "purchase-order" && activeVariation ? (
        <VariationImportPurchaseOrderLinesDrawer
          purchaseOrders={purchaseOrders}
          selectedPurchaseOrderId={selectedPurchaseOrderId}
          purchaseOrderLines={selectedPurchaseOrderLineOptions}
          selectedLineIds={selectedPurchaseOrderLineIds}
          alreadyImportedLineIds={alreadyImportedPurchaseOrderLineIds}
          onPurchaseOrderChange={setSelectedPurchaseOrderId}
          onToggleLine={togglePurchaseOrderLine}
          onImportSelected={importSelectedPurchaseOrderLines}
          onClose={closeActiveVariationDrawer}
        />
      ) : null}
      {activeVariationDrawer === "materials" && canUseMaterials ? (
        <VariationSupplierPricingDrawer onClose={closeActiveVariationDrawer} onSelectPrice={addSupplierMaterial} />
      ) : null}
    </div>
  );
}
