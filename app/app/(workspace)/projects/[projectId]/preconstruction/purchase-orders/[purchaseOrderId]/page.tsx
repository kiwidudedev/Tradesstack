"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  FileStack,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import {
  CommercialLineItemActionButton,
  CommercialLineItemsAddButton,
  CommercialLineItemsCell,
  CommercialLineItemsRow,
  CommercialLineItemsTable,
  CommercialLinePrefixedNumberInput,
  CommercialLineTextInput,
  CommercialSummaryCard,
  CommercialSummaryRow,
} from "@/components/app/CommercialLineItemsTable";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { SupplierInvoiceTeamReviewModal } from "@/components/app/SupplierInvoiceTeamReviewModal";
import { WorksheetSourceLink } from "@/components/app/WorksheetSourceLink";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { SupplierPicker } from "@/components/app/SupplierPicker";
import { PurchaseOrderSupplierPricingDrawer } from "@/components/app/PurchaseOrderSupplierPricingDrawer";
import { PurchaseOrderImportQuoteDrawer } from "@/components/app/PurchaseOrderImportQuoteDrawer";
import { PurchaseOrderImportVariationDrawer } from "@/components/app/PurchaseOrderImportVariationDrawer";
import {
  COMMERCIAL_LINE_GRID_WITH_SOURCE,
  COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE,
} from "@/components/app/commercial-line-table-layout";
import { createPurchaseOrderInlineSupplierAction } from "@/app/app/(workspace)/company/suppliers/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  buildPurchaseOrderCommercialItemSourceHref,
  enrichPurchaseOrderLineItemsWithCommercialItems,
  type PurchaseOrderCommercialItemLink,
} from "@/lib/commercial-items/purchase-order-linking";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import {
  createPurchaseOrderDraft,
  getProjectPurchaseOrderSummary,
  getPurchaseOrder,
  listProjectMembers,
  listPurchaseOrderAssignments,
  listPurchaseOrderAttachments,
  listPurchaseOrderLineItems,
  savePurchaseOrderDraft,
} from "@/lib/purchase-orders/service";
import type {
  PurchaseOrderInvoiceXeroStatus,
  PurchaseOrderSiteReviewStatus,
  PurchaseOrderSupplierInvoiceSummaryPayload,
} from "@/lib/purchase-order-supplier-invoice-summary";
import type { PurchaseOrderSupplierInvoiceDetail } from "@/lib/purchase-order-supplier-invoice-detail";
import {
  derivePurchaseOrderPaymentProgressFillPresentation,
  derivePurchaseOrderStatusPresentation,
} from "@/lib/purchase-order-commercial-presentation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { canManageCommercialData } from "@/lib/role-permissions";
import {
  buildPurchaseOrderSelectionFromSupplierPrice,
  canUsePurchaseOrderSupplierPricing,
} from "@/lib/materials/purchase-order-supplier-pricing";
import type { PricingWorksheetMaterialPickerItem } from "@/lib/pricing-worksheet-material-picker";
import {
  buildPurchaseOrderDraftLineFromSource,
  selectNewPurchaseOrderImportLines,
  type PurchaseOrderImportLine,
  type PurchaseOrderQuoteImportSource,
  type PurchaseOrderVariationImportOption,
} from "@/lib/purchase-orders/source-import";
import {
  getSupplierDisplayName,
  type OrganizationSupplierRow,
} from "@/lib/suppliers";
import styles from "@/components/app/trade-pack-builder.module.css";
import {
  decideSupplierInvoiceSiteReviewAction,
  loadPurchaseOrderQuoteImportSourceAction,
  loadPurchaseOrderSupplierPricingPermissionsAction,
  loadPurchaseOrderSupplierInvoiceDetailAction,
  loadPurchaseOrderSupplierInvoiceSummaryAction,
  loadPurchaseOrderVariationImportLinesAction,
  loadPurchaseOrderVariationImportOptionsAction,
  type PurchaseOrderSupplierPricingPermissions,
} from "./actions";

type VariationStatus = "Draft" | "Pending Approval" | "Approved" | "Issued" | "Received" | "Invoiced" | "Cancelled";
type VariationOrigin = "Material Supply" | "Subcontract Work" | "Plant / Equipment Hire" | "Site Expense" | "Freight / Delivery" | "Variation Order" | "General Purchase" | "Other";
type CostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";
type PurchaseOrderDrawerType = "quote" | "variation" | "materials" | null;

interface CostLine {
  id: string;
  lineUid?: string | null;
  costItemId?: string | null;
  sourceCostItemId?: string | null;
  commercialItemLink?: PurchaseOrderCommercialItemLink | null;
  section: CostSection;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourceTimeSheetEntryId?: string | null;
}

interface SourceCostItemOption {
  id: string;
  documentKind: "project_quote" | "project_variation";
  documentId: string;
  documentNumber: string;
  documentTitle: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  sortOrder: number;
}

interface AttachmentItem {
  id: string;
  name: string;
  type: "Drawing" | "Email" | "Site Instruction";
  storagePath: string | null;
  externalUrl: string | null;
  notes?: string;
}

interface VariationItem {
  id: string;
  updatedAt: string | null;
  code: string;
  title: string;
  status: VariationStatus;
  origin: VariationOrigin;
  issuedToSupplierId: string;
  issuedToLabel: string;
  supplierContact: string;
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
  totalPrice: number;
  costLines: CostLine[];
  notes: string;
  attachments: AttachmentItem[];
}

interface VariationRow {
  id: string;
  updated_at: string | null;
  purchase_order_number: string;
  purchase_order_title: string;
  status: string;
  origin: string;
  supplier_id: string | null;
  issued_to_label: string | null;
  supplier_contact: string | null;
  supplier_name_snapshot: string | null;
  supplier_email_snapshot: string | null;
  supplier_phone_snapshot: string | null;
  requested_by: string;
  requested_date: string | null;
  due_date: string | null;
  total_purchase_order_price: number | null;
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
}

interface ProjectMemberListItem {
  id: string;
  organization_id: string;
  project_id: string;
  organization_member_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
}

const STATUS_OPTIONS: VariationStatus[] = ["Draft", "Pending Approval", "Approved", "Issued", "Received", "Invoiced", "Cancelled"];
const ORIGIN_OPTIONS: VariationOrigin[] = ["Material Supply", "Subcontract Work", "Plant / Equipment Hire", "Site Expense", "Freight / Delivery", "Variation Order", "General Purchase", "Other"];
const COST_SECTIONS: CostSection[] = ["Labour", "Materials", "Subcontractors", "Plant", "Margin"];
const NEW_SUPPLIER_OPTION = "__new_supplier__";
const PURCHASE_ORDER_ATTACHMENTS_BUCKET = "project-variation-attachments";
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
    lineUid: crypto.randomUUID(),
    costItemId: null,
    sourceCostItemId: null,
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

function makeDefaultVariation(index: number, jobCode: string): VariationItem {
  const code = `${jobCode}-VAR-${String(index + 1).padStart(2, "0")}`;
  return {
    id: crypto.randomUUID(),
    updatedAt: null,
    code,
    title: "",
    status: "Draft",
    origin: "Material Supply",
    issuedToSupplierId: "",
    issuedToLabel: "",
    supplierContact: "",
    requestedBy: "",
    requestedDate: new Date().toISOString().slice(0, 10),
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
    totalPrice: 0,
    costLines: [makeDefaultCostLine("Labour")],
    notes: "",
    attachments: [],
  };
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
  return "Other";
}

function purchaseOrderStatusBadge(status: VariationStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Approved": return "approved";
    case "Cancelled": return "overdue";
    case "Invoiced": return "sent";
    case "Issued": return "sent";
    case "Pending Approval": return "pending";
    case "Received": return "active";
    default: return "draft";
  }
}

function siteReviewLabel(status: PurchaseOrderSiteReviewStatus) {
  if (status === "approved") return "Approved";
  if (status === "disputed") return "Declined";
  if (status === "invalidated") return "Needs resubmission";
  if (status === "awaiting_site_approval") return "Waiting";
  return "Not available";
}

function xeroStatusLabel(status: PurchaseOrderInvoiceXeroStatus) {
  return {
    not_exported: "Not sent",
    draft: "Draft",
    awaiting_approval: "Awaiting approval",
    awaiting_payment: "Awaiting payment",
    partially_paid: "Partially paid",
    paid: "Paid",
    voided: "Voided",
    deleted: "Voided",
    attention_required: "Attention required",
  }[status];
}

function statusPillClass(status: string) {
  if (status === "approved" || status === "paid") return "bg-[#DCFCE7] text-[#15803D]";
  if (status === "disputed" || status === "voided" || status === "deleted") return "bg-[#FEE2E2] text-[#B91C1C]";
  if (status === "partially_paid" || status === "awaiting_payment") return "bg-[#DBEAFE] text-[#1D4ED8]";
  return "bg-[#FEF3C7] text-[#92400E]";
}

export default function ProjectVariationsPage() {
  const params = useParams<{ projectId: string; purchaseOrderId: string }>();
  const routeProjectSlug = params?.projectId;
  const routePurchaseOrderId = params?.purchaseOrderId;
  const isNewVariationRoute = routePurchaseOrderId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const canManagePurchaseOrder = canManageCommercialData(session?.role);
  const [supplierPricingPermissions, setSupplierPricingPermissions] = useState<PurchaseOrderSupplierPricingPermissions | null>(null);
  const [activePurchaseOrderDrawer, setActivePurchaseOrderDrawer] = useState<PurchaseOrderDrawerType>(null);
  const [quoteImportSource, setQuoteImportSource] = useState<PurchaseOrderQuoteImportSource | null>(null);
  const [selectedQuoteImportLineIds, setSelectedQuoteImportLineIds] = useState<Set<string>>(new Set());
  const [isLoadingQuoteImport, setIsLoadingQuoteImport] = useState(false);
  const [quoteImportError, setQuoteImportError] = useState<string | null>(null);
  const [variationImportOptions, setVariationImportOptions] = useState<PurchaseOrderVariationImportOption[]>([]);
  const [selectedVariationImportId, setSelectedVariationImportId] = useState("");
  const [variationImportLines, setVariationImportLines] = useState<PurchaseOrderImportLine[]>([]);
  const [selectedVariationImportLineIds, setSelectedVariationImportLineIds] = useState<Set<string>>(new Set());
  const [isLoadingVariationImports, setIsLoadingVariationImports] = useState(false);
  const [isLoadingVariationImportLines, setIsLoadingVariationImportLines] = useState(false);
  const [variationImportError, setVariationImportError] = useState<string | null>(null);

  const [variations, setVariations] = useState<VariationItem[]>([]);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [organizationBrandPrimaryColor, setOrganizationBrandPrimaryColor] = useState("");
  const [jobCode, setJobCode] = useState(() => deriveJobCode(routeProjectSlug));
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<OrganizationSupplierRow[]>([]);
  const [quoteSourceOptions, setQuoteSourceOptions] = useState<SourceCostItemOption[]>([]);
  const [variationSourceOptions, setVariationSourceOptions] = useState<SourceCostItemOption[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberListItem[]>([]);
  const [assignedMemberIds, setAssignedMemberIds] = useState<Set<string>>(new Set());
  const [isLoadingAssignedWorkers, setIsLoadingAssignedWorkers] = useState(false);
  const [assignmentPendingMemberIds, setAssignmentPendingMemberIds] = useState<Set<string>>(new Set());
  const [assignedWorkerSearchQuery, setAssignedWorkerSearchQuery] = useState("");
  const [isAssignedWorkerMenuOpen, setIsAssignedWorkerMenuOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCompanyName, setNewSupplierCompanyName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [pendingAttachmentType, setPendingAttachmentType] = useState<AttachmentItem["type"] | null>(null);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [isSupplierMenuOpen, setIsSupplierMenuOpen] = useState(false);
  const [isLoadingVariations, setIsLoadingVariations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setSummary] = useState({
    totalValue: 0,
    draft: 0,
    awaitingClient: 0,
    approved: 0,
    invoiceReady: 0,
  });
  const [invoiceSummary, setInvoiceSummary] =
    useState<PurchaseOrderSupplierInvoiceSummaryPayload | null>(null);
  const [isSavingSiteReviewId, setIsSavingSiteReviewId] = useState<string | null>(null);
  const [selectedSupplierInvoiceId, setSelectedSupplierInvoiceId] = useState<string | null>(null);
  const [supplierBillDetail, setSupplierBillDetail] = useState<PurchaseOrderSupplierInvoiceDetail | null>(null);
  const [supplierBillDetailError, setSupplierBillDetailError] = useState<string | null>(null);
  const [supplierBillReviewError, setSupplierBillReviewError] = useState<string | null>(null);
  const [isLoadingSupplierBillDetail, setIsLoadingSupplierBillDetail] = useState(false);
  const [isBillsInvoicesOpen, setIsBillsInvoicesOpen] = useState(true);
  const [hydratedPurchaseOrderIds, setHydratedPurchaseOrderIds] = useState<Set<string>>(new Set());
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const isCreatingPurchaseOrderRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const supplierBillTriggerRef = useRef<HTMLButtonElement | null>(null);
  const materialsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeDrawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hydratingPurchaseOrderIdsRef = useRef<Set<string>>(new Set());
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
    let cancelled = false;
    void loadPurchaseOrderSupplierPricingPermissionsAction()
      .then((permissions) => {
        if (!cancelled) setSupplierPricingPermissions(permissions);
      })
      .catch(() => {
        if (!cancelled) {
          setSupplierPricingPermissions({ canViewMaterials: false, canWritePurchaseOrder: false });
        }
      });
    return () => { cancelled = true; };
  }, []);

  const refreshSummary = useCallback(async (nextOrganizationId: string, nextProjectId: string) => {
    if (!supabase) {
      return;
    }

    const row = await getProjectPurchaseOrderSummary(supabase, {
      organizationId: nextOrganizationId,
      projectId: nextProjectId,
    });
    setSummary({
      totalValue: Number(row.totalValue ?? 0),
      draft: Number(row.draftCount ?? 0),
      awaitingClient: Number(row.awaitingClientCount ?? 0),
      approved: Number(row.approvedCount ?? 0),
      invoiceReady: Number(row.invoiceReadyCount ?? 0),
    });
  }, [supabase]);

  const hydratePurchaseOrderDetails = useCallback(async (purchaseOrderId: string, resolvedOrganizationId: string) => {
    if (!supabase || !resolvedOrganizationId || !purchaseOrderId) {
      return;
    }
    if (hydratingPurchaseOrderIdsRef.current.has(purchaseOrderId)) {
      return;
    }
    hydratingPurchaseOrderIdsRef.current.add(purchaseOrderId);

    try {
      const [purchaseOrderRowRaw, lineRowsRaw, attachmentRowsRaw] = await Promise.all([
        getPurchaseOrder(supabase, {
          organizationId: resolvedOrganizationId,
          purchaseOrderId,
        }),
        listPurchaseOrderLineItems(supabase, {
          organizationId: resolvedOrganizationId,
          purchaseOrderId,
        }),
        listPurchaseOrderAttachments(supabase, {
          organizationId: resolvedOrganizationId,
          purchaseOrderId,
        }),
      ]);

      if (!purchaseOrderRowRaw) {
        return;
      }

      const row = purchaseOrderRowRaw;

      const hydratedLines = lineRowsRaw.length > 0
        ? await enrichPurchaseOrderLineItemsWithCommercialItems({
            client: supabase,
            organizationId: resolvedOrganizationId,
            purchaseOrderId,
            lineItems: lineRowsRaw.map((lineRow) => ({
              id: lineRow.id,
              lineUid: lineRow.lineUid ?? crypto.randomUUID(),
              costItemId: lineRow.costItemId ?? null,
              sourceCostItemId: lineRow.sourceCostItemId ?? null,
              commercialItemLink: null,
              section: COST_SECTIONS.includes(lineRow.section as CostSection) ? (lineRow.section as CostSection) : "Labour",
              description: lineRow.description ?? "",
              quantity: Number(lineRow.quantity ?? 0),
              unit: lineRow.unit ?? "",
              rate: Number(lineRow.rate ?? 0),
              sourceTimeSheetEntryId: lineRow.sourceTimeSheetEntryId ?? null,
            })),
            onWarning: (error) => {
              console.warn("Worksheet source enrichment failed while loading purchase order", {
                purchaseOrderId,
                organizationId: resolvedOrganizationId,
                errorType: error.name,
              });
            },
          })
        : [makeDefaultCostLine("Labour")];

      const hydratedAttachments: AttachmentItem[] = attachmentRowsRaw.map((attachmentRow) => ({
        id: attachmentRow.id,
        name: attachmentRow.fileName ?? "",
        type:
          attachmentRow.fileKind === "Drawing" || attachmentRow.fileKind === "Email" || attachmentRow.fileKind === "Site Instruction"
            ? (attachmentRow.fileKind as AttachmentItem["type"])
            : "Email",
        storagePath: attachmentRow.storagePath ?? null,
        externalUrl: attachmentRow.externalUrl ?? null,
        notes: attachmentRow.notes ?? "",
      }));

      setVariations((current) =>
        current.map((variation) =>
          variation.id !== purchaseOrderId
            ? variation
            : {
                ...variation,
                updatedAt: row.updatedAt ?? null,
                code: row.purchaseOrderNumber,
                title: row.purchaseOrderTitle,
                status: normalizeStatus(row.status),
                origin: normalizeOrigin(row.origin),
                issuedToSupplierId: row.supplierId ?? "",
                issuedToLabel: row.issuedToLabel ?? row.supplierNameSnapshot ?? "",
                supplierContact: row.supplierContact ?? "",
                requestedBy: row.requestedBy ?? "",
                requestedDate: row.requestedDate ?? "",
                dueDate: row.dueDate ?? "",
                clientSentAt: row.sentToClientAt,
                approvedAt: row.approvedAt,
                invoiceReady: Boolean(row.invoiceReady),
                marginPercent: String(row.marginPercent ?? 0),
                discountAmount: String(row.discountAmount ?? 0),
                contingencyAmount: String(row.contingencyAmount ?? 0),
                gstPercent: String(row.gstPercent ?? 15),
                includeMarginInExport: row.includeMarginInExport ?? true,
                includeDiscountInExport: Boolean(row.includeDiscountInExport),
                includeContingencyInExport: Boolean(row.includeContingencyInExport),
                totalPrice: Number(row.totalPurchaseOrderPrice ?? 0),
                notes: row.notes ?? "",
                costLines: hydratedLines,
                attachments: hydratedAttachments,
              }
        )
      );
      setHydratedPurchaseOrderIds((current) => new Set([...current, purchaseOrderId]));
    } finally {
      hydratingPurchaseOrderIdsRef.current.delete(purchaseOrderId);
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
      const variationsTable = (supabase as any).from("project_purchase_orders");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quotesTable = (supabase as any).from("project_quotes");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectVariationsTable = (supabase as any).from("project_variations");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const costItemsTable = (supabase as any).from("cost_items");

      const [
        { data: suppliersRaw },
        { data: quoteRowsRaw },
        { data: projectVariationRowsRaw },
        { data: sourceCostItemRowsRaw },
      ] = await Promise.all([
        supabase
          .from("organization_suppliers")
          .select("*")
          .eq("organization_id", resolvedOrganizationId)
          .order("company_name", { ascending: true })
          .order("name", { ascending: true }),
        quotesTable
          .select("id, quote_number, quote_title")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("quote_number", { ascending: true }),
        projectVariationsTable
          .select("id, variation_number, variation_title")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("variation_number", { ascending: true }),
        costItemsTable
          .select("id, source_document_kind, source_document_id, section, description, quantity, unit, unit_rate, sort_order")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .eq("is_current", true)
          .in("source_document_kind", ["project_quote", "project_variation"])
          .order("source_document_kind", { ascending: true })
          .order("sort_order", { ascending: true }),
      ]);

      const supplierRows = (suppliersRaw ?? []) as OrganizationSupplierRow[];
      setSuppliers(supplierRows);
      const quoteRows = (quoteRowsRaw ?? []) as Array<{ id: string; quote_number: string | null; quote_title: string | null }>;
      const projectVariationRows = (projectVariationRowsRaw ?? []) as Array<{
        id: string;
        variation_number: string | null;
        variation_title: string | null;
      }>;
      const sourceCostItemRows = (sourceCostItemRowsRaw ?? []) as Array<{
        id: string;
        source_document_kind: "project_quote" | "project_variation";
        source_document_id: string;
        section: string | null;
        description: string | null;
        quantity: number | null;
        unit: string | null;
        unit_rate: number | null;
        sort_order: number | null;
      }>;
      const quoteRowsById = new Map(quoteRows.map((row) => [row.id, row]));
      const projectVariationRowsById = new Map(projectVariationRows.map((row) => [row.id, row]));

      setQuoteSourceOptions(
        sourceCostItemRows
          .filter((row) => row.source_document_kind === "project_quote")
          .map((row) => {
            const quoteRow = quoteRowsById.get(row.source_document_id);
            return {
              id: row.id,
              documentKind: "project_quote",
              documentId: row.source_document_id,
              documentNumber: quoteRow?.quote_number ?? "Quote",
              documentTitle: quoteRow?.quote_title ?? "",
              section: row.section ?? "",
              description: row.description ?? "",
              quantity: Number(row.quantity ?? 0),
              unit: row.unit ?? "",
              unitRate: Number(row.unit_rate ?? 0),
              sortOrder: Number(row.sort_order ?? 0),
            } satisfies SourceCostItemOption;
          })
      );
      setVariationSourceOptions(
        sourceCostItemRows
          .filter((row) => row.source_document_kind === "project_variation")
          .map((row) => {
            const variationRow = projectVariationRowsById.get(row.source_document_id);
            return {
              id: row.id,
              documentKind: "project_variation",
              documentId: row.source_document_id,
              documentNumber: variationRow?.variation_number ?? "Variation",
              documentTitle: variationRow?.variation_title ?? "",
              section: row.section ?? "",
              description: row.description ?? "",
              quantity: Number(row.quantity ?? 0),
              unit: row.unit ?? "",
              unitRate: Number(row.unit_rate ?? 0),
              sortOrder: Number(row.sort_order ?? 0),
            } satisfies SourceCostItemOption;
          })
      );

      try {
        await refreshSummary(resolvedOrganizationId, projectRow.id);
      } catch (summaryError) {
        if (!cancelled) {
          setError(summaryError instanceof Error ? summaryError.message : "Unable to load purchase order summary.");
        }
      }

      const { data: variationRowsRaw, error: variationError } = await variationsTable
        .select(
          "id, updated_at, purchase_order_number, purchase_order_title, status, total_purchase_order_price, invoice_ready"
        )
        .eq("organization_id", resolvedOrganizationId)
        .eq("project_id", projectRow.id)
        .order("updated_at", { ascending: false });

      if (variationError) {
        setError(variationError.message);
        setIsLoadingVariations(false);
        return;
      }

      const variationRows = (variationRowsRaw ?? []) as VariationRow[];
      if (variationRows.length === 0) {
        setVariations([]);
        setActiveVariationId(null);
        setPersistedVariationIds(new Set());
        setIsLoadingVariations(false);
        return;
      }

      const variationIds = variationRows.map((row) => row.id);

      const hydratedVariations: VariationItem[] = variationRows.map((row) => ({
        id: row.id,
        updatedAt: row.updated_at ?? null,
        code: row.purchase_order_number,
        title: row.purchase_order_title,
        status: normalizeStatus(row.status),
        origin: "Material Supply",
        issuedToSupplierId: "",
        issuedToLabel: "",
        supplierContact: "",
        requestedBy: "",
        requestedDate: "",
        dueDate: "",
        clientSentAt: null,
        approvedAt: null,
        invoiceReady: Boolean(row.invoice_ready),
        marginPercent: "0",
        discountAmount: "0",
        contingencyAmount: "0",
        gstPercent: "15",
        includeMarginInExport: true,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
        totalPrice: Number(row.total_purchase_order_price ?? 0),
        costLines: [makeDefaultCostLine("Labour")],
        notes: "",
        attachments: [],
      }));

      setVariations(hydratedVariations);
      setHydratedPurchaseOrderIds(new Set());
      setActiveVariationId((current) => (current && hydratedVariations.some((item) => item.id === current) ? current : hydratedVariations[0].id));
      setPersistedVariationIds(new Set(hydratedVariations.map((item) => item.id)));

      const selectedId = routePurchaseOrderId && variationIds.includes(routePurchaseOrderId) ? routePurchaseOrderId : variationIds[0];
      try {
        await hydratePurchaseOrderDetails(selectedId, resolvedOrganizationId);
      } catch (hydrateError) {
        if (!cancelled) {
          setError(hydrateError instanceof Error ? hydrateError.message : "Unable to load purchase order details.");
        }
      }
      setIsLoadingVariations(false);
    };

    void loadProjectCode();

    return () => {
      cancelled = true;
    };
  }, [hydratePurchaseOrderDetails, refreshSummary, routeProjectSlug, routePurchaseOrderId, session?.organizationId, supabase]);

  const activeVariation = useMemo(
    () => variations.find((variation) => variation.id === activeVariationId) ?? variations[0] ?? null,
    [activeVariationId, variations]
  );
  const canUseMaterials = canManagePurchaseOrder
    && supplierPricingPermissions?.canViewMaterials === true
    && supplierPricingPermissions.canWritePurchaseOrder
    && canUsePurchaseOrderSupplierPricing(activeVariation?.origin ?? "");
  const canImportPurchaseOrderSources = canManagePurchaseOrder && activeVariation?.status === "Draft";
  const importedSourceCostItemIds = useMemo(
    () => new Set(
      (activeVariation?.costLines ?? [])
        .map((line) => line.sourceCostItemId)
        .filter((value): value is string => Boolean(value)),
    ),
    [activeVariation?.costLines],
  );

  useEffect(() => {
    if (!canUsePurchaseOrderSupplierPricing(activeVariation?.origin ?? "") && activePurchaseOrderDrawer === "materials") {
      setActivePurchaseOrderDrawer(null);
    }
  }, [activePurchaseOrderDrawer, activeVariation?.origin]);

  useEffect(() => {
    setActivePurchaseOrderDrawer(null);
    setSelectedQuoteImportLineIds(new Set());
    setSelectedVariationImportLineIds(new Set());
  }, [activeVariation?.id]);

  const refreshAuthoritativeInvoiceSummary = useCallback(async () => {
    if (!activeVariation?.id || !persistedVariationIds.has(activeVariation.id)) {
      setInvoiceSummary(null);
      return;
    }
    const result = await loadPurchaseOrderSupplierInvoiceSummaryAction({
      purchaseOrderId: activeVariation.id,
      projectId: dbProjectId,
    });
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load the authoritative Purchase Order invoice summary.");
      return;
    }
    setInvoiceSummary(result.data.summary);
  }, [activeVariation?.id, dbProjectId, persistedVariationIds]);

  const loadSupplierBillDetail = useCallback(async (supplierInvoiceId: string) => {
    if (!activeVariation?.id) return;
    setIsLoadingSupplierBillDetail(true);
    setSupplierBillDetailError(null);
    const result = await loadPurchaseOrderSupplierInvoiceDetailAction({
      purchaseOrderId: activeVariation.id,
      supplierInvoiceId,
      projectId: dbProjectId,
    });
    if (!result.ok || !result.data) {
      setSupplierBillDetail(null);
      setSupplierBillDetailError(result.error ?? "Unable to load Supplier Invoice detail.");
    } else {
      setSupplierBillDetail(result.data);
    }
    setIsLoadingSupplierBillDetail(false);
  }, [activeVariation?.id, dbProjectId]);

  const openSupplierBill = useCallback((supplierInvoiceId: string, trigger: HTMLButtonElement) => {
    supplierBillTriggerRef.current = trigger;
    setSelectedSupplierInvoiceId(supplierInvoiceId);
    setSupplierBillDetail(null);
    setSupplierBillReviewError(null);
    void loadSupplierBillDetail(supplierInvoiceId);
  }, [loadSupplierBillDetail]);

  const setSupplierBillDialogOpen = useCallback((open: boolean) => {
    if (open) return;
    setSelectedSupplierInvoiceId(null);
    setSupplierBillDetail(null);
    setSupplierBillDetailError(null);
    setSupplierBillReviewError(null);
    requestAnimationFrame(() => supplierBillTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    void refreshAuthoritativeInvoiceSummary();
  }, [refreshAuthoritativeInvoiceSummary]);

  const hasVariations = variations.length > 0;
  const assignableProjectMembers = useMemo(
    () =>
      projectMembers
        .filter((member) => member.role === "worker")
        .slice()
        .sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [projectMembers]
  );
  const assignedWorkers = useMemo(
    () => assignableProjectMembers.filter((member) => assignedMemberIds.has(member.organization_member_id)),
    [assignableProjectMembers, assignedMemberIds]
  );
  const filteredAssignableWorkers = useMemo(() => {
    const query = assignedWorkerSearchQuery.trim().toLowerCase();
    return assignableProjectMembers.filter((member) => {
      if (assignedMemberIds.has(member.organization_member_id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return member.display_name.toLowerCase().includes(query);
    });
  }, [assignableProjectMembers, assignedMemberIds, assignedWorkerSearchQuery]);
  const filteredSuppliers = useMemo(() => {
    const query = supplierSearchQuery.trim().toLowerCase();
    if (!query) {
      return suppliers;
    }
    return suppliers.filter((supplier) => getSupplierDisplayName(supplier).toLowerCase().includes(query));
  }, [supplierSearchQuery, suppliers]);
  const sourceOptionsById = useMemo(() => {
    const entries = [...quoteSourceOptions, ...variationSourceOptions].map((option) => [option.id, option] as const);
    return new Map(entries);
  }, [quoteSourceOptions, variationSourceOptions]);
  const reviewAllocation = useCallback(
    async (params: { allocationId: string; decision: "approved" | "disputed"; comment: string }) => {
      if (!supplierBillDetail?.canReview || !invoiceSummary?.canReviewSiteDecisions || !selectedSupplierInvoiceId || !routePurchaseOrderId) {
        return;
      }
      setIsSavingSiteReviewId(params.allocationId);
      setError(null);
      setSupplierBillReviewError(null);
      setSaveMessage(null);

      try {
        const result = await decideSupplierInvoiceSiteReviewAction({
          purchaseOrderId: routePurchaseOrderId,
          supplierInvoiceId: selectedSupplierInvoiceId,
          allocationId: params.allocationId,
          decision: params.decision,
          note: params.comment,
        });
        if (!result.ok) throw new Error(result.error ?? "Unable to record site review.");
        await refreshAuthoritativeInvoiceSummary();
        await loadSupplierBillDetail(selectedSupplierInvoiceId);
        setSaveMessage(
          params.decision === "approved"
            ? "Supplier Invoice line approved."
            : "Supplier Invoice line declined."
        );
      } catch (reviewError) {
        setSupplierBillReviewError(
          reviewError instanceof Error
            ? reviewError.message
            : "Unable to update the supplier invoice allocation."
        );
      } finally {
        setIsSavingSiteReviewId(null);
      }
    },
    [invoiceSummary?.canReviewSiteDecisions, loadSupplierBillDetail, refreshAuthoritativeInvoiceSummary, routePurchaseOrderId, selectedSupplierInvoiceId, supplierBillDetail]
  );

  const resolveSourceLabel = useCallback((line: CostLine) => {
    if (line.sourceTimeSheetEntryId) {
      return "Synced from timesheet";
    }

    if (!line.sourceCostItemId) {
      return "Manual";
    }

    const option = sourceOptionsById.get(line.sourceCostItemId);
    if (!option) {
      return "Manual";
    }

    return option.documentNumber || "Manual";
  }, [sourceOptionsById]);

  const resolveSourceHint = useCallback((line: CostLine) => {
    if (line.sourceTimeSheetEntryId) {
      return "";
    }

    const option = line.sourceCostItemId ? sourceOptionsById.get(line.sourceCostItemId) : null;
    if (!option) {
      return "";
    }

    if (option.documentKind === "project_quote") {
      return "Quote";
    }

    return "Variation";
  }, [sourceOptionsById]);

  useEffect(() => {
    if (!activeVariation) {
      return;
    }

    if (activeVariation.issuedToSupplierId === NEW_SUPPLIER_OPTION) {
      setSupplierSearchQuery(activeVariation.issuedToLabel || "");
      return;
    }

    const selectedSupplier = suppliers.find((supplier) => supplier.id === activeVariation.issuedToSupplierId);
    if (selectedSupplier) {
      setSupplierSearchQuery(getSupplierDisplayName(selectedSupplier));
      return;
    }

    setSupplierSearchQuery(activeVariation.issuedToLabel || "");
  }, [activeVariation, suppliers]);

  useEffect(() => {
    setAssignedWorkerSearchQuery("");
    setIsAssignedWorkerMenuOpen(false);
  }, [activeVariation?.id]);

  useEffect(() => {
    if (!routePurchaseOrderId || variations.length === 0) {
      return;
    }
    if (variations.some((variation) => variation.id === routePurchaseOrderId)) {
      setActiveVariationId(routePurchaseOrderId);
    }
  }, [routePurchaseOrderId, variations]);

  useEffect(() => {
    if (!activeVariationId || !organizationId || hydratedPurchaseOrderIds.has(activeVariationId)) {
      return;
    }

    void hydratePurchaseOrderDetails(activeVariationId, organizationId).catch((hydrateError) => {
      setError(hydrateError instanceof Error ? hydrateError.message : "Unable to load purchase order details.");
    });
  }, [activeVariationId, hydratePurchaseOrderDetails, hydratedPurchaseOrderIds, organizationId]);

  useEffect(() => {
    if (!supabase || !organizationId || !dbProjectId || !activeVariation?.id) {
      setProjectMembers([]);
      setAssignedMemberIds(new Set());
      return;
    }

    let cancelled = false;

    const loadAssignedWorkers = async () => {
      setIsLoadingAssignedWorkers(true);

      try {
        const [projectMembersResult, assignmentsResult] = await Promise.all([
          listProjectMembers(supabase, {
            organizationId,
            projectId: dbProjectId,
          }),
          listPurchaseOrderAssignments(supabase, {
            organizationId,
            projectId: dbProjectId,
            purchaseOrderId: activeVariation.id,
          }),
        ]);

        if (cancelled) {
          return;
        }

        const nextProjectMembers = projectMembersResult
          .map((member) => ({
            id: member.id,
            organization_id: member.organizationId,
            project_id: member.projectId,
            organization_member_id: member.organizationMemberId,
            is_active: member.isActive,
            created_at: member.createdAt,
            updated_at: member.updatedAt,
            role: member.role,
            user_id: member.userId,
            display_name: member.displayName,
            avatar_path: member.avatarPath,
          }))
          .filter((member) => member.is_active) as ProjectMemberListItem[];
        const nextAssignedMemberIds = new Set(
          assignmentsResult
            .filter((assignment) => assignment.isActive)
            .map((assignment) => assignment.organizationMemberId)
        );

        setProjectMembers(nextProjectMembers);
        setAssignedMemberIds(nextAssignedMemberIds);
      } catch (assignmentLoadError) {
        if (!cancelled) {
          setError(assignmentLoadError instanceof Error ? assignmentLoadError.message : "Unable to load assigned workers.");
          setProjectMembers([]);
          setAssignedMemberIds(new Set());
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAssignedWorkers(false);
        }
      }
    };

    void loadAssignedWorkers();

    return () => {
      cancelled = true;
    };
  }, [activeVariation?.id, dbProjectId, organizationId, supabase]);

  const pricingSummary = useMemo(() => {
    if (!activeVariation) {
      return {
        baseSubtotal: 0,
        gst: 0,
        grandTotal: 0,
      };
    }

    const baseSubtotal = activeVariation.costLines.reduce((acc, line) => acc + lineTotal(line), 0);
    const gst = baseSubtotal * (numberOrZero(activeVariation.gstPercent) / 100);
    const grandTotal = baseSubtotal + gst;

    return {
      baseSubtotal,
      gst,
      grandTotal,
    };
  }, [activeVariation]);
  const purchaseOrderStatusPresentation = useMemo(
    () => invoiceSummary
      ? derivePurchaseOrderStatusPresentation({
          purchaseOrderValue: invoiceSummary.metrics.purchaseOrderValue,
          paidAgainstPurchaseOrder: invoiceSummary.metrics.paidAgainstPurchaseOrder,
          outstandingAgainstPurchaseOrder: invoiceSummary.metrics.outstandingAgainstPurchaseOrder,
          overpaidAmount: invoiceSummary.metrics.overpaidAmount,
          paymentStatus: invoiceSummary.metrics.paymentStatus,
        })
      : null,
    [invoiceSummary]
  );
  const paymentProgressFillPresentation = useMemo(
    () => purchaseOrderStatusPresentation && invoiceSummary
      ? derivePurchaseOrderPaymentProgressFillPresentation({
          paidPercent: purchaseOrderStatusPresentation.paidPercent,
          paymentStatus: invoiceSummary.metrics.paymentStatus,
        })
      : null,
    [invoiceSummary, purchaseOrderStatusPresentation]
  );
  const purchaseOrderPreGstTotal = Math.max(0, pricingSummary.grandTotal - pricingSummary.gst);
  const isActiveVariationHydrated = activeVariation ? hydratedPurchaseOrderIds.has(activeVariation.id) : false;

  const createPurchaseOrder = useCallback(async () => {
    if (isCreatingPurchaseOrderRef.current) {
      return;
    }
    if (!canManagePurchaseOrder) {
      setError("You do not have permission to create purchase orders.");
      return;
    }
    isCreatingPurchaseOrderRef.current = true;
    try {
      setError(null);
      setSaveMessage(null);

      if (!supabase || !organizationId || !dbProjectId || !session?.id) {
        setError("Purchase order create is not ready. Please refresh and try again.");
        return;
      }
      // Use atomic DB-side draft creation to prevent purchase_order_number races under concurrency.
      const createdRow = await createPurchaseOrderDraft(supabase, {
        organizationId,
        projectId: dbProjectId,
        title: "New Purchase Order",
        origin: "Material Supply",
      });
      if (typeof createdRow.updatedAt !== "string" || createdRow.updatedAt.length === 0) {
        throw new Error("Purchase order was created but no updated timestamp was returned.");
      }

      const nextVariation = makeDefaultVariation(variations.length, jobCode);
      nextVariation.id = createdRow.id;
      nextVariation.updatedAt = createdRow.updatedAt;
      nextVariation.code = createdRow.purchaseOrderNumber || `${jobCode}-PO-00`;
      nextVariation.title = createdRow.purchaseOrderTitle || "New Purchase Order";
      nextVariation.status = normalizeStatus(createdRow.status);
      nextVariation.origin = normalizeOrigin(createdRow.origin);

      setVariations((current) => [...current, nextVariation]);
      setPersistedVariationIds((current) => new Set([...current, nextVariation.id]));
      setActiveVariationId(nextVariation.id);
      setHydratedPurchaseOrderIds((current) => {
        const next = new Set(current);
        next.delete(nextVariation.id);
        return next;
      });
      await refreshSummary(organizationId, dbProjectId);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${nextVariation.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create purchase order.");
    } finally {
      isCreatingPurchaseOrderRef.current = false;
    }
  }, [canManagePurchaseOrder, dbProjectId, jobCode, organizationId, refreshSummary, routeProjectSlug, router, session?.id, supabase, variations]);

  const deletePurchaseOrder = useCallback(async (purchaseOrderId: string) => {
    if (!canManagePurchaseOrder) {
      setError("You do not have permission to delete purchase orders.");
      return;
    }

    const purchaseOrder = variations.find((item) => item.id === purchaseOrderId);
    if (!purchaseOrder) {
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete purchase order ${purchaseOrder.code}? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSaveMessage(null);

    try {
      if (persistedVariationIds.has(purchaseOrderId)) {
        if (!supabase || !organizationId) {
          setError("Purchase order delete is not ready. Please refresh and try again.");
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
        const { error: deleteError } = await purchaseOrdersTable
          .delete()
          .eq("organization_id", organizationId)
          .eq("id", purchaseOrderId);

        if (deleteError) {
          throw new Error(deleteError.message);
        }
      }

      const nextRows = variations.filter((item) => item.id !== purchaseOrderId);
      setVariations(nextRows);
      setPersistedVariationIds((current) => {
        const next = new Set(current);
        next.delete(purchaseOrderId);
        return next;
      });
      setHydratedPurchaseOrderIds((current) => {
        const next = new Set(current);
        next.delete(purchaseOrderId);
        return next;
      });
      if (dbProjectId && organizationId) {
        await refreshSummary(organizationId, dbProjectId);
      }

      if (nextRows.length === 0) {
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders`);
      } else {
        const fallback = nextRows[0];
        setActiveVariationId(fallback.id);
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${fallback.id}`);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete purchase order.");
    } finally {
      setIsDeleting(false);
    }
  }, [canManagePurchaseOrder, dbProjectId, organizationId, persistedVariationIds, refreshSummary, routeProjectSlug, router, supabase, variations]);

  useEffect(() => {
    if (!isNewVariationRoute || isLoadingVariations) {
      return;
    }

    const unsavedVariation = variations.find((variation) => !persistedVariationIds.has(variation.id));
    if (unsavedVariation) {
      setActiveVariationId(unsavedVariation.id);
      if (routePurchaseOrderId !== unsavedVariation.id) {
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${unsavedVariation.id}`);
      }
      return;
    }

    void createPurchaseOrder();
  }, [createPurchaseOrder, isLoadingVariations, isNewVariationRoute, persistedVariationIds, routeProjectSlug, routePurchaseOrderId, router, variations]);

  const updateActiveVariation = <K extends keyof VariationItem>(key: K, value: VariationItem[K]) => {
    if (!activeVariation) return;
    setVariations((current) => current.map((item) => (item.id === activeVariation.id ? { ...item, [key]: value } : item)));
  };

  const addCostLine = (section: CostSection = "Labour") => {
    if (!activeVariation) return;
    updateActiveVariation("costLines", [...activeVariation.costLines, makeDefaultCostLine(section)]);
  };

  const closeActivePurchaseOrderDrawer = () => {
    setActivePurchaseOrderDrawer(null);
    window.requestAnimationFrame(() => activeDrawerTriggerRef.current?.focus());
  };

  const openMaterials = () => {
    if (!canUseMaterials) return;
    activeDrawerTriggerRef.current = materialsTriggerRef.current;
    setIsSupplierMenuOpen(false);
    setSupplierBillDialogOpen(false);
    setActivePurchaseOrderDrawer("materials");
  };

  const openQuoteImport = async (trigger: HTMLButtonElement) => {
    if (!canImportPurchaseOrderSources || !dbProjectId) return;
    activeDrawerTriggerRef.current = trigger;
    setActivePurchaseOrderDrawer("quote");
    setSelectedQuoteImportLineIds(new Set());
    setQuoteImportError(null);
    setIsLoadingQuoteImport(true);
    const result = await loadPurchaseOrderQuoteImportSourceAction({ projectId: dbProjectId });
    setIsLoadingQuoteImport(false);
    if (!result.ok) {
      setQuoteImportSource(null);
      setQuoteImportError(result.error);
      return;
    }
    setQuoteImportSource(result.data);
  };

  const openVariationImport = async (trigger: HTMLButtonElement) => {
    if (!canImportPurchaseOrderSources || !dbProjectId) return;
    activeDrawerTriggerRef.current = trigger;
    setActivePurchaseOrderDrawer("variation");
    setSelectedVariationImportLineIds(new Set());
    setSelectedVariationImportId("");
    setVariationImportLines([]);
    setVariationImportError(null);
    setIsLoadingVariationImports(true);
    const result = await loadPurchaseOrderVariationImportOptionsAction({ projectId: dbProjectId });
    setIsLoadingVariationImports(false);
    if (!result.ok) {
      setVariationImportOptions([]);
      setVariationImportError(result.error);
      return;
    }
    setVariationImportOptions(result.data);
  };

  const changeVariationImportSource = async (variationId: string) => {
    setSelectedVariationImportId(variationId);
    setSelectedVariationImportLineIds(new Set());
    setVariationImportLines([]);
    setVariationImportError(null);
    if (!variationId || !dbProjectId) return;
    setIsLoadingVariationImportLines(true);
    const result = await loadPurchaseOrderVariationImportLinesAction({ projectId: dbProjectId, variationId });
    setIsLoadingVariationImportLines(false);
    if (!result.ok) {
      setVariationImportError(result.error);
      return;
    }
    setVariationImportLines(result.data);
  };

  const toggleSourceImportLine = (lineId: string, source: "quote" | "variation") => {
    const update = (current: Set<string>) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    };
    if (source === "quote") setSelectedQuoteImportLineIds(update);
    else setSelectedVariationImportLineIds(update);
  };

  const importSourceLines = (source: "quote" | "variation") => {
    if (!activeVariation || !canImportPurchaseOrderSources) return;
    const sourceLines = source === "quote" ? quoteImportSource?.lines ?? [] : variationImportLines;
    const selectedLineIds = source === "quote" ? selectedQuoteImportLineIds : selectedVariationImportLineIds;
    const eligibleLines = selectNewPurchaseOrderImportLines({
      lines: sourceLines,
      selectedLineIds,
      existingSourceCostItemIds: importedSourceCostItemIds,
    });
    if (eligibleLines.length === 0) return;
    updateActiveVariation("costLines", [
      ...activeVariation.costLines,
      ...eligibleLines.map((line) => buildPurchaseOrderDraftLineFromSource(line) as CostLine),
    ]);
    if (source === "quote") setSelectedQuoteImportLineIds(new Set());
    else setSelectedVariationImportLineIds(new Set());
    setSaveMessage(`${eligibleLines.length} ${source === "quote" ? "Quote" : "Variation"} line${eligibleLines.length === 1 ? "" : "s"} added. Save Purchase Order to persist.`);
  };

  const addSupplierMaterial = (item: PricingWorksheetMaterialPickerItem) => {
    if (!activeVariation || !canUseMaterials || !canUsePurchaseOrderSupplierPricing(activeVariation.origin)) {
      setError("Supplier-priced materials can only be added to an editable Material Supply Purchase Order.");
      return;
    }
    try {
      const selection = buildPurchaseOrderSelectionFromSupplierPrice({
        item,
        purchaseOrderSupplierId: activeVariation.issuedToSupplierId || null,
        purchaseOrderSupplierLabel: activeVariation.issuedToLabel,
      });
      setVariations((current) => current.map((purchaseOrder) => (
        purchaseOrder.id === activeVariation.id
          ? {
              ...purchaseOrder,
              issuedToSupplierId: selection.supplierId,
              issuedToLabel: selection.supplierLabel,
              costLines: [...purchaseOrder.costLines, selection.line],
            }
          : purchaseOrder
      )));
      setSupplierSearchQuery(selection.supplierLabel);
      setError(null);
      setSaveMessage("Material added to the Purchase Order. Save Purchase Order to persist this line.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "This supplier price cannot be added to the Purchase Order.");
    }
  };

  const updateCostLine = <K extends keyof CostLine>(lineId: string, key: K, value: CostLine[K]) => {
    if (!activeVariation) return;
    updateActiveVariation("costLines", activeVariation.costLines.map((line) => (line.id === lineId ? { ...line, [key]: value } : line)));
  };

  const assignSourceCostItem = (lineId: string, sourceCostItemId: string | null) => {
    if (!activeVariation) {
      return;
    }

    updateActiveVariation(
      "costLines",
      activeVariation.costLines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              sourceCostItemId,
            }
          : line
      )
    );
  };

  const removeCostLine = (lineId: string) => {
    if (!activeVariation) return;
    updateActiveVariation(
      "costLines",
      activeVariation.costLines.filter((line) => line.id !== lineId)
    );
  };

  const addAttachment = (type: AttachmentItem["type"]) => {
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
            const storagePath = `${organizationId}/${dbProjectId}/purchase-orders/${activeVariation.id}/${fileId}-${cleanName}`;
            const { error: uploadError } = await supabase.storage
              .from(PURCHASE_ORDER_ATTACHMENTS_BUCKET)
              .upload(storagePath, file, { upsert: false });

            if (uploadError) {
              throw new Error(uploadError.message);
            }

            const { data: publicUrlData } = supabase.storage
              .from(PURCHASE_ORDER_ATTACHMENTS_BUCKET)
              .getPublicUrl(storagePath);

            return {
              id: fileId,
              name: file.name,
              type: pendingAttachmentType,
              storagePath,
              externalUrl: publicUrlData.publicUrl || `manual://${file.name}`,
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
    if (status === "Issued") {
      updateActiveVariation("clientSentAt", new Date().toISOString().slice(0, 10));
    }
    if (status === "Approved") {
      updateActiveVariation("approvedAt", new Date().toISOString().slice(0, 10));
    }
  };

  const saveVariation = async () => {
    if (!activeVariation || !supabase || !organizationId || !dbProjectId) {
      setError("Purchase Order save is not ready. Please refresh and try again.");
      return;
    }
    if (!activeVariation.updatedAt) {
      setError("Purchase order version is missing. Please refresh and try again.");
      return;
    }

    if (!canManagePurchaseOrder) {
      setError("You do not have permission to edit purchase orders.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      let resolvedSupplierId: string | null = activeVariation.issuedToSupplierId || null;
      let resolvedSupplier: OrganizationSupplierRow | null = suppliers.find((supplier) => supplier.id === resolvedSupplierId) ?? null;
      if (resolvedSupplierId === NEW_SUPPLIER_OPTION) {
        const supplierName = newSupplierName.trim();
        const supplierCompanyName = newSupplierCompanyName.trim();
        const supplierDisplay = supplierCompanyName || supplierName;
        if (!supplierDisplay) {
          throw new Error("Supplier name is required when adding a new supplier.");
        }

        let supplierCreateResult = await createPurchaseOrderInlineSupplierAction({
          input: {
            name: supplierDisplay,
            primaryContactEmail: newSupplierEmail.trim() || null,
            primaryContactPhone: newSupplierPhone.trim() || null,
          },
        });

        if (supplierCreateResult.requiresDuplicateConfirmation && supplierCreateResult.warnings?.length) {
          const confirmed = window.confirm(
            `Possible duplicate supplier:\n\n${supplierCreateResult.warnings.map((warning) => `• ${warning.message}`).join("\n")}\n\nCreate anyway?`
          );

          if (!confirmed) {
            setIsSaving(false);
            return;
          }

          supplierCreateResult = await createPurchaseOrderInlineSupplierAction({
            input: {
              name: supplierDisplay,
              primaryContactEmail: newSupplierEmail.trim() || null,
              primaryContactPhone: newSupplierPhone.trim() || null,
            },
            confirmPotentialDuplicates: true,
          });
        }

        if (!supplierCreateResult.ok || !supplierCreateResult.supplier?.id) {
          throw new Error(supplierCreateResult.error ?? "Unable to create supplier.");
        }

        const createdSupplier = supplierCreateResult.supplier as OrganizationSupplierRow;
        setSuppliers((current) => {
          const withoutExisting = current.filter((supplier) => supplier.id !== createdSupplier.id);
          return [...withoutExisting, createdSupplier].sort((left, right) =>
            getSupplierDisplayName(left).localeCompare(getSupplierDisplayName(right))
          );
        });

        resolvedSupplierId = createdSupplier.id;
        resolvedSupplier = createdSupplier;
        updateActiveVariation("issuedToSupplierId", createdSupplier.id);
        setNewSupplierName("");
        setNewSupplierCompanyName("");
        setNewSupplierEmail("");
        setNewSupplierPhone("");
      }

      const issuedToLabel =
        resolvedSupplier
          ? getSupplierDisplayName(resolvedSupplier)
          : activeVariation.issuedToLabel.trim();
      const supplierContact = activeVariation.supplierContact.trim();
      const supplierNameSnapshot = resolvedSupplier ? issuedToLabel : "";
      const supplierEmailSnapshot = resolvedSupplier?.email?.trim() || "";
      const supplierPhoneSnapshot = resolvedSupplier?.phone?.trim() || "";
      const savedRow = await savePurchaseOrderDraft(supabase, {
        organizationId,
        projectId: dbProjectId,
        purchaseOrderId: activeVariation.id,
        expectedUpdatedAt: activeVariation.updatedAt,
        purchaseOrderTitle: activeVariation.title.trim() || activeVariation.code,
        purchaseOrderNumber: activeVariation.code,
        status: activeVariation.status,
        origin: activeVariation.origin,
        supplierId: resolvedSupplierId,
        issuedToLabel,
        supplierContact,
        supplierNameSnapshot,
        supplierEmailSnapshot,
        supplierPhoneSnapshot,
        requestedBy: activeVariation.requestedBy,
        requestedDate: activeVariation.requestedDate || null,
        dueDate: activeVariation.dueDate || null,
        sentToClientAt: activeVariation.clientSentAt || null,
        approvedAt: activeVariation.approvedAt || null,
        invoiceReady: activeVariation.invoiceReady,
        notes: activeVariation.notes,
        marginPercent: 0,
        discountAmount: 0,
        contingencyAmount: 0,
        gstPercent: Number(numberOrZero(activeVariation.gstPercent).toFixed(3)),
        includeMarginInExport: false,
        includeDiscountInExport: false,
        includeContingencyInExport: false,
        lineItems: activeVariation.costLines.map((line) => ({
          id: line.id,
          lineUid: line.lineUid ?? null,
          costItemId: line.costItemId ?? null,
          section: line.section,
          description: line.description,
          quantity: Number(line.quantity),
          unit: line.unit,
          rate: Number(line.rate),
          sourceCostItemId: line.sourceCostItemId ?? null,
          sourceTimeSheetEntryId: line.sourceTimeSheetEntryId ?? null,
        })),
        attachments: activeVariation.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          storagePath: attachment.storagePath,
          externalUrl: attachment.externalUrl,
          notes: attachment.notes,
        })),
      });
      const savedPurchaseOrderId = typeof savedRow?.id === "string" ? savedRow.id : null;
      if (!savedPurchaseOrderId) {
        throw new Error("Purchase order was saved but no identifier was returned.");
      }
      const nextUpdatedAt = typeof savedRow?.updatedAt === "string" ? savedRow.updatedAt : null;
      if (!nextUpdatedAt) {
        throw new Error("Purchase order was saved but no updated timestamp was returned.");
      }
      const nextTotal = Number(savedRow?.totalPurchaseOrderPrice ?? pricingSummary.grandTotal);


      setPersistedVariationIds((current) => new Set([...current, savedPurchaseOrderId]));
      setVariations((current) =>
        current.map((item) =>
          item.id === activeVariation.id || item.id === savedPurchaseOrderId
            ? {
                ...item,
                id: savedPurchaseOrderId,
                updatedAt: nextUpdatedAt,
                status: activeVariation.status,
                invoiceReady: activeVariation.invoiceReady,
                totalPrice: nextTotal,
              }
            : item
        )
      );
      setActiveVariationId(savedPurchaseOrderId);
      setHydratedPurchaseOrderIds((current) => new Set([...current, savedPurchaseOrderId]));
      await refreshSummary(organizationId, dbProjectId);
      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save purchase order.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAssignedWorker = useCallback(async (organizationMemberId: string, shouldAssign: boolean) => {
    if (!supabase || !organizationId || !dbProjectId || !activeVariation?.id) {
      setError("Assigned workers are not ready yet. Please refresh and try again.");
      return;
    }

    if (!canManagePurchaseOrder) {
      setError("You do not have permission to manage assigned workers.");
      return;
    }

    const previousAssignedMemberIds = new Set(assignedMemberIds);
    const nextAssignedMemberIds = new Set(assignedMemberIds);
    if (shouldAssign) {
      nextAssignedMemberIds.add(organizationMemberId);
    } else {
      nextAssignedMemberIds.delete(organizationMemberId);
    }

    setAssignedMemberIds(nextAssignedMemberIds);
    setAssignmentPendingMemberIds((current) => new Set([...current, organizationMemberId]));
    setError(null);

    try {
      if (shouldAssign) {
        const { error: addError } = await supabase.rpc("add_purchase_order_assignment", {
          p_organization_id: organizationId,
          p_project_id: dbProjectId,
          p_purchase_order_id: activeVariation.id,
          p_organization_member_id: organizationMemberId,
        });

        if (addError) {
          throw new Error(addError.message);
        }

        setAssignedWorkerSearchQuery("");
        setIsAssignedWorkerMenuOpen(false);
      } else {
        const { error: removeError } = await supabase.rpc("remove_purchase_order_assignment", {
          p_organization_id: organizationId,
          p_project_id: dbProjectId,
          p_purchase_order_id: activeVariation.id,
          p_organization_member_id: organizationMemberId,
        });

        if (removeError) {
          throw new Error(removeError.message);
        }
      }
    } catch (assignmentError) {
      setAssignedMemberIds(previousAssignedMemberIds);
      setError(assignmentError instanceof Error ? assignmentError.message : "Unable to update assigned workers.");
    } finally {
      setAssignmentPendingMemberIds((current) => {
        const next = new Set(current);
        next.delete(organizationMemberId);
        return next;
      });
    }
  }, [activeVariation?.id, assignedMemberIds, canManagePurchaseOrder, dbProjectId, organizationId, supabase]);

  const exportVariationPdf = useCallback(() => {
    if (typeof window === "undefined" || !activeVariation) {
      return;
    }

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = projectName.trim() || (routeProjectSlug ?? "").replaceAll("-", " ") || "Project";
    const printableNumber = activeVariation.code.trim() || "Unassigned";
    const issuedDate = toDayMonthYearLabel(activeVariation.requestedDate || new Date().toISOString().slice(0, 10));
    const gstPercentLabel = activeVariation.gstPercent.trim() || "15";
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
    const sanitizedBrandPrimaryColor = organizationBrandPrimaryColor.trim();
    const pdfPrimaryColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(sanitizedBrandPrimaryColor)
      ? sanitizedBrandPrimaryColor
      : "#0B2739";
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;
    const issuedToName = activeVariation.issuedToLabel.trim() || organizationName.trim() || "Tradesstack Limited";
    const issuedToLocation = projectLocation.trim() || "Auckland City";
    const issuedToContact = activeVariation.supplierContact.trim() || issuedToName;
    const issuedToLines = [
      issuedToName,
      issuedToLocation,
      `Contact: ${issuedToContact}`,
    ]
      .filter((line) => line.length > 0)
      .map((line) => escapeHtml(line))
      .join("\n") || "Not specified";

    const lineItemsRows = activeVariation.costLines.length > 0
      ? activeVariation.costLines
          .map((line) => {
            const description = line.description.trim() || "Untitled line item";
            const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
            return `
              <tr>
                <td class="desc-cell">
                  <div class="cell-primary">${escapeHtml(description)}</div>
                  <div class="cell-secondary">${escapeHtml(line.section)}</div>
                </td>
                <td class="right money col-rate">${toMoney(line.rate)}</td>
                <td class="right col-qty">${qty}</td>
                <td class="col-unit">${escapeHtml(line.unit || "-")}</td>
                <td class="right money col-total">${toMoney(lineTotal(line))}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

    const attachmentsMarkup = activeVariation.attachments.length > 0
      ? activeVariation.attachments
          .map((attachment) => `<p><strong>${escapeHtml(attachment.type || "Attachment")}:</strong> ${escapeHtml(attachment.name || "-")}</p>`)
          .join("")
      : "";
    const notesMarkup = activeVariation.notes.trim()
      ? `<p><strong>Notes:</strong> ${escapeHtml(activeVariation.notes.trim()).replaceAll("\n", "<br />")}</p>`
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
      .order-details .bar {
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
      .order-details p {
        margin: 0 0 4px;
        color: #374151;
        font-size: 11px;
      }
      .order-details p strong { color: #1f2937; }

      .order-summary .bar {
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
      .summary-row.no-divider {
        border-bottom: 0;
      }
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

      .totals-inline { margin-top: 10px; }
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
      .terms {
        margin-top: 16px;
        max-width: 54%;
        color: #374151;
        font-size: 11px;
      }
      .terms p { margin: 0 0 8px; }
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
        <p class="title">Purchase Order</p>
      </header>

      <section class="issued-row">
        <div>
          <p class="issued-title">Issued To:</p>
          <p class="issued-text">${issuedToLines}</p>
        </div>
        <div class="issued-meta">
          <div class="row"><span class="k">Purchase Order No:</span><span class="v">${escapeHtml(printableNumber)}</span></div>
          <div class="row"><span class="k">Date:</span><span class="v">${escapeHtml(issuedDate)}</span></div>
          <div class="row"><span class="k">Type:</span><span class="v">${escapeHtml(activeVariation.origin || "—")}</span></div>
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
            <th class="col-unit" style="width:10%">Unit</th>
            <th class="right col-total" style="width:20%">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>

      <section class="lower">
        <section>
          ${attachmentsMarkup || notesMarkup ? `<div class="order-details"><div class="bar">Notes & Attachments</div>${attachmentsMarkup}${notesMarkup}</div>` : ""}
        </section>

        <div>
          <section class="totals-inline">
            <div class="row total-row"><span class="k">Order Summary</span><span class="v"></span></div>
            <div class="row"><span class="k">Subtotal (excl. GST)</span><span class="v">${toMoney(pricingSummary.baseSubtotal)}</span></div>
            <div class="row"><span class="k">GST (${escapeHtml(gstPercentLabel)}%)</span><span class="v">${toMoney(pricingSummary.gst)}</span></div>
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
    organizationLogoUrl,
    organizationBrandPrimaryColor,
    organizationName,
    projectName,
    projectLocation,
    pricingSummary.baseSubtotal,
    pricingSummary.grandTotal,
    pricingSummary.gst,
    routeProjectSlug,
  ]);

  if (isLoadingVariations) {
    return (
      <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
        <OperationalModuleHeader
          title="Purchase Order"
          actions={
            <>
              <Button type="button" variant="secondary" disabled>Save Purchase Order</Button>
              <Button type="button" disabled>Export PDF</Button>
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
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[var(--text-secondary)]`}>Loading purchase orders...</p>
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
            <span>{activeVariation?.code || "Purchase Order"}</span>
            {activeVariation ? (
              <StatusBadge status={purchaseOrderStatusBadge(activeVariation.status)}>
                {activeVariation.status}
              </StatusBadge>
            ) : null}
          </span>
        }
        description={saveMessage ?? undefined}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void saveVariation()}
              disabled={!canManagePurchaseOrder || isSaving}
            >
              {isSaving ? "Saving..." : "Save Purchase Order"}
            </Button>
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
              <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="!z-[200] min-w-[240px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]">
                <DropdownMenuItem asChild className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]">
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders`}>
                    <ExternalLink className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                    Purchase Order Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void createPurchaseOrder();
                  }}
                  disabled={!canManagePurchaseOrder}
                  className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                >
                  <Plus className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />
                  New Purchase Order
                </DropdownMenuItem>
                {activeVariation ? (
                  <>
                    <DropdownMenuSeparator className="my-1 bg-[var(--border)]" />
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        void deletePurchaseOrder(activeVariation.id);
                      }}
                      disabled={!canManagePurchaseOrder || isDeleting}
                      className="h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--error)] focus:bg-[var(--error-light)] focus:text-[var(--error)]"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </DropdownMenuItem>
                  </>
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
      {!canManagePurchaseOrder && session ? (
        <OperationalAlert variant="warning">
          You can review this purchase order, but only owner, admin, QS, and project manager roles can edit or delete it.
        </OperationalAlert>
      ) : null}

      {hasVariations && activeVariation ? (
      isActiveVariationHydrated ? (
      <div className="space-y-6 [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface)] [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface)] [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--surface)]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="border-b border-[var(--border-subtle)] pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Purchase Order Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={styles.quoteBodyLabel}>Purchase order title</label>
                  <Input value={activeVariation.title} onChange={(event) => updateActiveVariation("title", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Status</label>
                  <select value={activeVariation.status} onChange={(event) => setStatus(event.target.value as VariationStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Purchase Order Number</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[6px] bg-[var(--surface-muted)]" /></div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>PO Type</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]`}>
                    {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Raised By</label><Input value={activeVariation.requestedBy} onChange={(event) => updateActiveVariation("requestedBy", event.target.value)} className="h-10 rounded-[6px]" /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Issued To</label>
                  <SupplierPicker
                    suppliers={filteredSuppliers}
                    searchQuery={supplierSearchQuery}
                    isOpen={isSupplierMenuOpen}
                    onSearchQueryChange={(value) => {
                      setSupplierSearchQuery(value);
                      updateActiveVariation("issuedToLabel", value);
                    }}
                    onOpenChange={setIsSupplierMenuOpen}
                    onClearSelection={() => updateActiveVariation("issuedToSupplierId", "")}
                    onSelectSupplier={(supplier) => {
                      const label = getSupplierDisplayName(supplier);
                      updateActiveVariation("issuedToSupplierId", supplier.id);
                      updateActiveVariation("issuedToLabel", label);
                      setSupplierSearchQuery(label);
                    }}
                    onCreateNew={() => {
                      updateActiveVariation("issuedToSupplierId", NEW_SUPPLIER_OPTION);
                      updateActiveVariation("issuedToLabel", supplierSearchQuery.trim());
                    }}
                    disabled={!canManagePurchaseOrder}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Assigned Worker</label>
                  <div className="relative">
                    <div className="min-h-10 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {assignedWorkers.map((member) => {
                          const isPending = assignmentPendingMemberIds.has(member.organization_member_id);
                          return (
                            <div key={member.id} className="flex items-center gap-1.5">
                              <span className="font-body text-sm font-normal text-text">{member.display_name}</span>
                              <button
                                type="button"
                                disabled={!canManagePurchaseOrder || isPending}
                                onClick={() => {
                                  void toggleAssignedWorker(member.organization_member_id, false);
                                }}
                                className="font-body text-sm font-normal leading-none text-text-muted hover:text-[var(--error)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
                                aria-label={`Remove ${member.display_name}`}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                        <Input
                          value={assignedWorkerSearchQuery}
                          onFocus={() => setIsAssignedWorkerMenuOpen(true)}
                          onBlur={() => {
                            window.setTimeout(() => setIsAssignedWorkerMenuOpen(false), 100);
                          }}
                          onChange={(event) => {
                            setAssignedWorkerSearchQuery(event.target.value);
                            setIsAssignedWorkerMenuOpen(true);
                          }}
                          disabled={!canManagePurchaseOrder || isLoadingAssignedWorkers}
                          className="h-6 min-w-[160px] flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                          placeholder="Search workers..."
                        />
                      </div>
                    </div>
                    {isAssignedWorkerMenuOpen ? (
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
                        {filteredAssignableWorkers.length > 0 ? (
                          filteredAssignableWorkers.map((member) => {
                            const isPending = assignmentPendingMemberIds.has(member.organization_member_id);
                            return (
                              <button
                                key={member.id}
                                type="button"
                                disabled={isPending || !canManagePurchaseOrder}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  if (!isPending && canManagePurchaseOrder) {
                                    void toggleAssignedWorker(member.organization_member_id, true);
                                  }
                                }}
                                className={`${interMedium.className} block w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]`}
                              >
                                {member.display_name}
                              </button>
                            );
                          })
                        ) : (
                          <p className={`${interMedium.className} px-3 py-2 text-sm text-[var(--text-secondary)]`}>
                            {assignedWorkers.length === assignableProjectMembers.length
                              ? "All project workers are already assigned."
                              : "No matching workers found."}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Supplier Contact</label>
                  <Input value={activeVariation.supplierContact} onChange={(event) => updateActiveVariation("supplierContact", event.target.value)} className="h-10 rounded-[6px]" placeholder="Contact name, email, or phone" />
                </div>
              </div>

              {activeVariation.issuedToSupplierId === NEW_SUPPLIER_OPTION ? (
                <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <p className={styles.quoteCardTitle}>Add New Supplier</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Contact Name</label>
                      <Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} className="h-10 rounded-[6px]" placeholder="Account contact or trading name" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Company name</label>
                      <Input value={newSupplierCompanyName} onChange={(event) => setNewSupplierCompanyName(event.target.value)} className="h-10 rounded-[6px]" placeholder="Supplier company" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Email</label>
                      <Input type="email" value={newSupplierEmail} onChange={(event) => setNewSupplierEmail(event.target.value)} className="h-10 rounded-[6px]" placeholder="accounts@supplier.com" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Phone</label>
                      <Input value={newSupplierPhone} onChange={(event) => setNewSupplierPhone(event.target.value)} className="h-10 rounded-[6px]" placeholder="+64 21 123 4567" />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Requested Date</label><Input type="date" value={activeVariation.requestedDate} onChange={(event) => updateActiveVariation("requestedDate", event.target.value)} className="h-10 rounded-[6px]" /></div>
              </div>
            </div>
          </section>

          <section className="py-5">
            <div className="flex items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Line Items</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canImportPurchaseOrderSources ? (
                  <>
                    <Button type="button" variant="outline" onClick={(event) => void openQuoteImport(event.currentTarget)} className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}>
                      <Plus className="mr-1 h-4 w-4" />
                      Import From Quote
                    </Button>
                    <Button type="button" variant="outline" onClick={(event) => void openVariationImport(event.currentTarget)} className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}>
                      <Plus className="mr-1 h-4 w-4" />
                      Import From Variation
                    </Button>
                  </>
                ) : null}
                {canUseMaterials ? (
                  <Button
                    ref={materialsTriggerRef}
                    type="button"
                    variant="outline"
                    onClick={openMaterials}
                    className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Materials
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              <CommercialLineItemsTable
                columns={[
                  { key: "description", label: "Description" },
                  { key: "source", label: "Source" },
                  { key: "item", label: "Item" },
                  { key: "qty", label: "Qty." },
                  { key: "unit", label: "Unit" },
                  { key: "price", label: "Price" },
                  { key: "amount", label: "Amount", align: "right" },
                  { key: "actions", label: "" },
                ]}
                gridTemplateColumns={COMMERCIAL_LINE_GRID_WITH_SOURCE}
                minWidthClassName={COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITH_SOURCE}
              >
                {activeVariation.costLines.map((line) => (
                  <CommercialLineItemsRow
                    key={line.id}
                    gridTemplateColumns={COMMERCIAL_LINE_GRID_WITH_SOURCE}
                  >
                    <CommercialLineItemsCell>
                      <CommercialLineTextInput
                        value={line.description}
                        onChange={(value) => updateCostLine(line.id, "description", value)}
                        disabled={Boolean(line.sourceTimeSheetEntryId)}
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                          {line.sourceTimeSheetEntryId ? (
                            <span className={`${interMedium.className} text-[12px] text-[var(--text-secondary)]`}>
                              Synced from timesheet
                            </span>
                          ) : line.commercialItemLink ? (
                            <div className="flex min-w-0 flex-col gap-1">
                              <WorksheetSourceLink
                                href={buildPurchaseOrderCommercialItemSourceHref(line)}
                                className={`${interMedium.className} inline-flex items-center gap-1 text-[11px] text-[var(--brand-primary,#0B2739)] underline underline-offset-2`}
                              />
                            </div>
                          ) : (
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className={`${interMedium.className} truncate text-[12px] text-[var(--text-secondary)]`}>
                                {resolveSourceLabel(line)}
                              </span>
                              <div className="flex items-center gap-2">
                                {resolveSourceHint(line) ? (
                                  <span className={`${interMedium.className} text-[11px] text-[var(--text-muted)]`}>
                                    {resolveSourceHint(line)}
                                  </span>
                                ) : null}
                                {canManagePurchaseOrder ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={`${interMedium.className} inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline`}
                                      >
                                        {line.sourceCostItemId ? "Change" : "Link source"}
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      side="bottom"
                                      align="start"
                                      sideOffset={8}
                                      className="!z-[200] max-h-[320px] min-w-[320px] overflow-y-auto rounded-[14px] border border-[var(--border)] !bg-[var(--surface)] p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                                    >
                                      <DropdownMenuItem
                                        onSelect={() => assignSourceCostItem(line.id, null)}
                                        className={`${interMedium.className} min-h-10 cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]`}
                                      >
                                        <div className="flex min-w-0 flex-col">
                                          <span>Manual</span>
                                          <span className="text-[11px] text-[var(--text-secondary)]">No source link</span>
                                        </div>
                                      </DropdownMenuItem>
                                      {quoteSourceOptions.length > 0 ? (
                                        <>
                                          <DropdownMenuSeparator className="my-1 bg-[var(--border-subtle)]" />
                                          <div className={`${interMedium.className} px-3 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
                                            Quote Items
                                          </div>
                                          {quoteSourceOptions.map((option) => (
                                            <DropdownMenuItem
                                              key={option.id}
                                              onSelect={() => assignSourceCostItem(line.id, option.id)}
                                              className={`${interMedium.className} min-h-10 cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]`}
                                            >
                                              <div className="flex min-w-0 flex-col">
                                                <span className="truncate">{option.documentNumber}</span>
                                                <span className="truncate text-[11px] text-[var(--text-secondary)]">
                                                  {option.description || option.documentTitle || option.section || "Quote line"}
                                                </span>
                                              </div>
                                            </DropdownMenuItem>
                                          ))}
                                        </>
                                      ) : null}
                                      {variationSourceOptions.length > 0 ? (
                                        <>
                                          <DropdownMenuSeparator className="my-1 bg-[var(--border-subtle)]" />
                                          <div className={`${interMedium.className} px-3 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
                                            Variation Items
                                          </div>
                                          {variationSourceOptions.map((option) => (
                                            <DropdownMenuItem
                                              key={option.id}
                                              onSelect={() => assignSourceCostItem(line.id, option.id)}
                                              className={`${interMedium.className} min-h-10 cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]`}
                                            >
                                              <div className="flex min-w-0 flex-col">
                                                <span className="truncate">{option.documentNumber}</span>
                                                <span className="truncate text-[11px] text-[var(--text-secondary)]">
                                                  {option.description || option.documentTitle || option.section || "Variation line"}
                                                </span>
                                              </div>
                                            </DropdownMenuItem>
                                          ))}
                                        </>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            </div>
                          )}
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                          <select
                            value={line.section}
                            onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                            className={`${interMedium.className} h-9 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:cursor-not-allowed disabled:!bg-transparent disabled:text-[var(--text-secondary)]`}
                          >
                            {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                          </select>
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                      <CommercialLineTextInput
                        type="number"
                        value={line.quantity}
                        onChange={(value) => updateCostLine(line.id, "quantity", numberOrZero(value))}
                        disabled={Boolean(line.sourceTimeSheetEntryId)}
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                      <CommercialLineTextInput
                        value={line.unit}
                        onChange={(value) => updateCostLine(line.id, "unit", value)}
                        disabled={Boolean(line.sourceTimeSheetEntryId)}
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder>
                      <CommercialLinePrefixedNumberInput
                        prefix="$"
                        value={line.rate === 0 ? "" : String(line.rate)}
                        onChange={(value) => updateCostLine(line.id, "rate", numberOrZero(value))}
                        disabled={Boolean(line.sourceTimeSheetEntryId) ? !canManagePurchaseOrder : false}
                        title={line.sourceTimeSheetEntryId ? "Synced from timesheet: rate is editable, other fields are locked." : undefined}
                      />
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder className="justify-end">
                          <div className={`${interMedium.className} whitespace-nowrap text-right text-sm text-[var(--text-primary)]`}>{toMoney(lineTotal(line))}</div>
                    </CommercialLineItemsCell>
                    <CommercialLineItemsCell withBorder className="justify-center px-0">
                          <CommercialLineItemActionButton
                            icon={<Trash2 className="h-4 w-4" />}
                            label="Delete line item"
                            onClick={() => removeCostLine(line.id)}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                          />
                    </CommercialLineItemsCell>
                  </CommercialLineItemsRow>
                ))}
              </CommercialLineItemsTable>
            </div>

            <div className="mt-3 flex justify-end pr-3">
              <CommercialLineItemsAddButton
                onClick={() => addCostLine("Labour")}
                className={styles.quoteButtonLabel}
              />
            </div>
          </section>

          <div className="pt-2 pb-6 space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
              <div>
                <div className="space-y-5">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => handleAttachmentFilesSelected(event.target.files)}
                    accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,.eml,.msg,.doc,.docx"
                  />

                  <div>
                    <label className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4 block`}>
                      Notes
                    </label>
                    <textarea
                      value={activeVariation.notes}
                      onChange={(event) => updateActiveVariation("notes", event.target.value)}
                      className={`${interMedium.className} block min-h-[140px] w-full max-w-[600px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--navy-primary)]`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Button
                      type="button"
                      onClick={() => addAttachment("Drawing")}
                      className={`${ibmPlexSans.className} inline-flex h-9 items-center gap-2 rounded-full bg-[var(--navy-primary)] px-5 text-[14px] font-semibold !text-white hover:bg-[var(--navy-primary)] hover:opacity-90`}
                    >
                      <Upload className="h-4 w-4" />
                      Attachments
                    </Button>

                    {activeVariation.attachments.length > 0 ? (
                      <div className="space-y-2 pt-2">
                        {activeVariation.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                            <span className={`${interMedium.className} min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]`}>{attachment.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeAttachment(attachment.id)}
                              className="h-8 w-8 rounded-[6px] p-0 text-[var(--text-muted)]/80 hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                              aria-label="Delete attachment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <CommercialSummaryCard
                title={<span className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Pricing Summary</span>}
              >
                <div className={`${interMedium.className} space-y-2.5 text-[13px]`}>
                  <CommercialSummaryRow
                    label="Subtotal"
                    value={toMoney(purchaseOrderPreGstTotal)}
                  />
                  <CommercialSummaryRow
                    label={
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                      GST
                      <Input
                        type="number"
                        value={activeVariation.gstPercent}
                        onChange={(event) => updateActiveVariation("gstPercent", event.target.value)}
                        className="h-6 w-12 rounded-[4px] border-[var(--border)] bg-[var(--surface)] px-1 text-center text-[12px]"
                      />
                      %
                      </span>
                    }
                    value={toMoney(pricingSummary.gst)}
                  />
                  <div className="h-px bg-[var(--border)]" />
                  <CommercialSummaryRow
                    label="Total"
                    value={toMoney(pricingSummary.grandTotal)}
                    className="pt-0.5"
                    labelClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                    valueClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                  />
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <Button type="button" onClick={saveVariation} disabled={!canManagePurchaseOrder || isSaving} className={`${ibmPlexSans.className} h-9 w-full rounded-full bg-[var(--navy-primary)] text-[14px] font-semibold !text-white hover:bg-[var(--navy-primary)] hover:opacity-90`}>
                    {isSaving ? "Saving..." : "Save Purchase Order"}
                  </Button>
                  <Button
                    type="button"
                    onClick={exportVariationPdf}
                    disabled={isSaving}
                    variant="outline"
                    className={`${ibmPlexSans.className} h-9 w-full rounded-full border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-primary)]`}
                  >
                    Export PDF
                  </Button>
                </div>
              </CommercialSummaryCard>
            </div>
          </div>
        </div>

        <section data-testid="purchase-order-commercial-card" className={`${styles.quotePanelCard} min-w-0 overflow-hidden px-4 py-5 sm:px-6`}>
          <button
            type="button"
            data-testid="purchase-order-bills-invoices-trigger"
            aria-expanded={isBillsInvoicesOpen}
            aria-controls="purchase-order-bills-invoices-content"
            aria-label={isBillsInvoicesOpen ? "Collapse Bills/Invoices" : "Expand Bills/Invoices"}
            onClick={() => setIsBillsInvoicesOpen((current) => !current)}
            className="mb-4 flex w-full items-center justify-between gap-3 rounded-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            <div className="min-w-0">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Bills/Invoices</h2>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${isBillsInvoicesOpen ? "rotate-180" : ""}`} />
          </button>

          {!isBillsInvoicesOpen ? null : (
            <div id="purchase-order-bills-invoices-content" data-testid="purchase-order-bills-invoices-content" className="min-w-0">
              {invoiceSummary && purchaseOrderStatusPresentation ? (
                <section data-testid="purchase-order-status-section" className="min-w-0">
                  <div data-testid="purchase-order-paid-outstanding-metrics" className="mt-5 grid grid-cols-1 items-end gap-8 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className={`${ibmPlexSans.className} text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]`}>Paid</p>
                      <p className={`${interMedium.className} mt-1 break-words text-[20px] font-semibold text-[var(--text-primary)]`}>{toMoney(invoiceSummary.metrics.paidAgainstPurchaseOrder)}</p>
                      <p className={`${interMedium.className} mt-1 text-[15px] font-semibold text-[var(--text-secondary)]`}>{purchaseOrderStatusPresentation.paidPercent}%</p>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <p className={`${ibmPlexSans.className} text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]`}>Outstanding</p>
                      <p className={`${interMedium.className} mt-1 break-words text-[20px] font-semibold text-[var(--text-primary)]`}>{toMoney(invoiceSummary.metrics.outstandingAgainstPurchaseOrder)}</p>
                      <p className={`${interMedium.className} mt-1 text-[15px] font-semibold text-[var(--text-secondary)]`}>{purchaseOrderStatusPresentation.outstandingPercent}%</p>
                    </div>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-label="Purchase Order payment progress">
                    <div className="flex h-4 w-full">
                      <div
                        data-testid="purchase-order-payment-progress-paid-fill"
                        className={paymentProgressFillPresentation?.variant === "complete" ? "bg-[#22C55E]" : paymentProgressFillPresentation?.variant === "partial" ? "bg-[#FACC15]" : "bg-transparent"}
                        style={paymentProgressFillPresentation?.variant === "partial"
                          ? {
                              width: `${paymentProgressFillPresentation.paidBarPercent}%`,
                              backgroundImage: "repeating-linear-gradient(135deg, rgba(217,119,6,0.28) 0 3px, rgba(217,119,6,0) 3px 9px)",
                            }
                          : {
                              width: `${paymentProgressFillPresentation?.paidBarPercent ?? 0}%`,
                            }}
                        title={`${purchaseOrderStatusPresentation.paidPercent}% paid`}
                      />
                      <div className="bg-[#CBD5E1]" style={{ width: `${purchaseOrderStatusPresentation.outstandingBarPercent}%` }} title={`${purchaseOrderStatusPresentation.outstandingPercent}% outstanding`} />
                    </div>
                  </div>
                  {invoiceSummary.metrics.overpaidAmount > 0 ? <div className="mt-4 rounded-[10px] border border-[var(--error)]/20 bg-[var(--error-light)] px-3 py-3 text-[13px] font-semibold text-[var(--error)]">Overpaid by {toMoney(invoiceSummary.metrics.overpaidAmount)} ({purchaseOrderStatusPresentation.overpaidPercent}%). The standard progress bar is capped at 100%.</div> : null}
                </section>
              ) : null}

              <div className="mb-3 mt-7">
                <h3 className={`${interMedium.className} text-[15px] font-semibold text-[var(--text-primary)]`}>Current Bills</h3>
              </div>

              {!invoiceSummary || invoiceSummary.rows.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center">
                  <p className={`${ibmPlexSans.className} text-[14px] text-[var(--text-secondary)]`}>No Supplier Invoices have been allocated to this Purchase Order.</p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] md:block">
                    <div className="max-w-full overflow-x-auto">
                      <table className="w-full min-w-[1080px] border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                          {["Bill / Invoice", "Supplier", "Invoice date", "Due date", "Allocated to this PO", "Team Approval", "Payment status", "Action"].map((heading) => (
                            <th key={heading} className={`${ibmPlexSans.className} px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-secondary)]`}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceSummary.rows.map((summary) => {
                          return (
                              <tr key={summary.supplierInvoiceId} className="border-b border-[var(--border)] align-middle transition-colors last:border-b-0 hover:bg-[var(--surface-muted)]">
                                <td className="px-4 py-4">
                                  <button type="button" onClick={(event) => openSupplierBill(summary.supplierInvoiceId, event.currentTarget)} className={`${ibmPlexSans.className} rounded-[4px] text-left text-[13px] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2`}>{summary.invoiceNumber}</button>
                                </td>
                                <td className="max-w-[190px] px-4 py-4 text-[12px] text-[var(--text-primary)]"><span className="line-clamp-2" title={summary.supplierName ?? "Supplier not recorded"}>{summary.supplierName ?? "Supplier not recorded"}</span></td>
                                <td className="px-4 py-4 text-[13px] text-[var(--text-primary)]">{toDayMonthYearLabel(summary.invoiceDate)}</td>
                                <td className="px-4 py-4 text-[13px] text-[var(--text-primary)]">{toDayMonthYearLabel(summary.dueDate)}</td>
                                <td className="px-4 py-4">
                                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">{toMoney(summary.poAllocatedAmount)}</p>
                                </td>
                                <td className="px-4 py-4">
                                  <span className={`${ibmPlexSans.className} inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusPillClass(summary.siteReviewStatus)}`}>{siteReviewLabel(summary.siteReviewStatus)}</span>
                                </td>
                                <td className="px-4 py-4">
                                  <span className={`${ibmPlexSans.className} inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusPillClass(summary.xeroStatus)}`}>{xeroStatusLabel(summary.xeroStatus)}</span>
                                </td>
                                <td className="px-4 py-4">
                                <Button type="button" variant="ghost" size="sm" onClick={(event) => openSupplierBill(summary.supplierInvoiceId, event.currentTarget)}>{summary.canReview ? "Review" : "View"}</Button>
                                </td>
                              </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="space-y-3 md:hidden">
                    {invoiceSummary.rows.map((summary) => {
                      return (
                        <article key={summary.supplierInvoiceId} className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button type="button" onClick={(event) => openSupplierBill(summary.supplierInvoiceId, event.currentTarget)} className={`${interMedium.className} rounded-[4px] text-left text-[14px] font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]`}>{summary.invoiceNumber}</button>
                              <p className="mt-1 break-words text-[12px] text-[var(--text-secondary)]">{summary.supplierName ?? "Supplier not recorded"}</p>
                            </div>
                            <span className={`${ibmPlexSans.className} shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusPillClass(summary.xeroStatus)}`}>{xeroStatusLabel(summary.xeroStatus)}</span>
                          </div>
                          <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
                            <div><dt className="text-[var(--text-secondary)]">Invoice / due</dt><dd className="mt-1">{toDayMonthYearLabel(summary.invoiceDate)} / {toDayMonthYearLabel(summary.dueDate)}</dd></div>
                            <div><dt className="text-[var(--text-secondary)]">Allocated to this PO</dt><dd className="mt-1 font-semibold">{toMoney(summary.poAllocatedAmount)}</dd></div>
                            <div><dt className="text-[var(--text-secondary)]">Team Approval</dt><dd className="mt-1">{siteReviewLabel(summary.siteReviewStatus)}</dd></div>
                          </dl>
                          <Button type="button" variant="outline" size="sm" className="mt-4 w-full" onClick={(event) => openSupplierBill(summary.supplierInvoiceId, event.currentTarget)}>View details</Button>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <SupplierInvoiceTeamReviewModal
            open={Boolean(selectedSupplierInvoiceId)}
            onOpenChange={setSupplierBillDialogOpen}
            detail={supplierBillDetail}
            loading={isLoadingSupplierBillDetail}
            error={supplierBillDetailError}
            reviewError={supplierBillReviewError}
            savingAllocationId={isSavingSiteReviewId}
            onReview={(params) => void reviewAllocation(params)}
          />

        </section>
      </div>
      ) : (
        <div className="space-y-6">
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
              <p className={`${styles.quoteBodyLabel} pt-2`}>Loading purchase order details...</p>
            </div>
          </div>
          <div className={`${styles.quotePanelCard} overflow-hidden`}>
            <div className="border-b border-[var(--border-subtle)] px-5 py-4">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Pricing Summary</h2>
            </div>
            <div className="space-y-3 px-5 py-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[var(--border-subtle)]" />
            </div>
          </div>
        </div>
      )
      ) : (
        <Card className="border-[var(--border)] bg-[var(--surface-muted)] shadow-none">
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[6px] bg-[var(--border-subtle)] text-[var(--text-primary)]">
              <FileStack className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-[var(--text-primary)]">No purchase orders yet</h2>
            <p className={`${interMedium.className} mt-2 max-w-[520px] text-sm text-[var(--text-secondary)]`}>
              Start your purchase order register by creating the first purchase order for this project. You can then build costs,
              attach supporting documents, send to client, and track approval through to invoicing.
            </p>
            <Button
              type="button"
              onClick={() => void createPurchaseOrder()}
              className={`${interMedium.className} mt-6 h-10 rounded-[6px] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-hover)]`}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create First Purchase Order
            </Button>
          </CardContent>
        </Card>
      )}
      {activePurchaseOrderDrawer === "quote" && canImportPurchaseOrderSources ? (
        <PurchaseOrderImportQuoteDrawer
          source={quoteImportSource}
          selectedLineIds={selectedQuoteImportLineIds}
          alreadyImportedSourceCostItemIds={importedSourceCostItemIds}
          isLoading={isLoadingQuoteImport}
          error={quoteImportError}
          onToggleLine={(lineId) => toggleSourceImportLine(lineId, "quote")}
          onImportSelected={() => importSourceLines("quote")}
          onClose={closeActivePurchaseOrderDrawer}
        />
      ) : null}
      {activePurchaseOrderDrawer === "variation" && canImportPurchaseOrderSources ? (
        <PurchaseOrderImportVariationDrawer
          variations={variationImportOptions}
          selectedVariationId={selectedVariationImportId}
          lines={variationImportLines}
          selectedLineIds={selectedVariationImportLineIds}
          alreadyImportedSourceCostItemIds={importedSourceCostItemIds}
          isLoadingVariations={isLoadingVariationImports}
          isLoadingLines={isLoadingVariationImportLines}
          error={variationImportError}
          onVariationChange={(variationId) => void changeVariationImportSource(variationId)}
          onToggleLine={(lineId) => toggleSourceImportLine(lineId, "variation")}
          onImportSelected={() => importSourceLines("variation")}
          onClose={closeActivePurchaseOrderDrawer}
        />
      ) : null}
      {activePurchaseOrderDrawer === "materials" && canUseMaterials && activeVariation ? (
        <PurchaseOrderSupplierPricingDrawer
          purchaseOrderSupplierId={activeVariation.issuedToSupplierId || null}
          purchaseOrderSupplierLabel={activeVariation.issuedToLabel}
          onClose={closeActivePurchaseOrderDrawer}
          onSelectPrice={addSupplierMaterial}
        />
      ) : null}
    </div>
  );
}
