"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  FileStack,
  MoreVertical,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { OperationalPageHeader } from "@/components/app/OperationalPageHeader";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { SupplierPicker } from "@/components/app/SupplierPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { triggerDocumentClassification } from "@/lib/cost-items/trigger-document-classification";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { canManageCommercialData } from "@/lib/role-permissions";
import {
  getSupplierDisplayName,
  getSupplierDuplicateWarnings,
  type OrganizationSupplierRow,
} from "@/lib/suppliers";
import {
  DEFAULT_SUPPLIER_INVOICE_APPROVAL_CHECKS,
  formatSupplierInvoiceMatchApprovalStatusLabel,
  formatMatchStatusLabel,
  getSupplierInvoiceMatchApprovalStatusClassName,
  getSupplierInvoiceMatchStatusClassName,
  matchCountsTowardInvoiceTotal,
  normalizeSupplierInvoiceApprovalChecks,
  type SupplierInvoiceApprovalChecks,
  type SupplierInvoiceRow,
} from "@/lib/supplier-invoices";
import styles from "@/components/app/trade-pack-builder.module.css";

type VariationStatus = "Draft" | "Pending Approval" | "Approved" | "Issued" | "Received" | "Invoiced" | "Cancelled";
type VariationOrigin = "Material Supply" | "Subcontract Work" | "Plant / Equipment Hire" | "Site Expense" | "Freight / Delivery" | "Variation Order" | "General Purchase" | "Other";
type CostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";

interface CostLine {
  id: string;
  lineUid?: string | null;
  costItemId?: string | null;
  sourceCostItemId?: string | null;
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

interface PurchaseOrderSummaryRow {
  total_value: number | null;
  draft_count: number | null;
  awaiting_client_count: number | null;
  approved_count: number | null;
  invoice_ready_count: number | null;
}

interface PurchaseOrderInvoiceMatchRow {
  id: string;
  organization_id: string;
  supplier_invoice_id: string;
  purchase_order_id: string;
  matched_amount: number;
  match_status: string;
  confidence_score: number | null;
  match_basis: string;
  approval_status: string;
  approved_by_user_id: string | null;
  approved_at: string | null;
  approval_notes: string;
  approval_checks_json: Database["public"]["Tables"]["supplier_invoice_purchase_order_matches"]["Row"]["approval_checks_json"];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type MatchedSupplierInvoiceRow = Pick<
  SupplierInvoiceRow,
  "id" | "invoice_number" | "status" | "supplier_id" | "invoice_date" | "due_date" | "total"
>;

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

interface OrganizationMemberSummary {
  user_id: string;
  display_name: string;
}

type MatchApprovalDraft = {
  approvalNotes: string;
  approvalChecks: SupplierInvoiceApprovalChecks;
};

type RpcResultRow = Record<string, unknown>;

const STATUS_OPTIONS: VariationStatus[] = ["Draft", "Pending Approval", "Approved", "Issued", "Received", "Invoiced", "Cancelled"];
const ORIGIN_OPTIONS: VariationOrigin[] = ["Material Supply", "Subcontract Work", "Plant / Equipment Hire", "Site Expense", "Freight / Delivery", "Variation Order", "General Purchase", "Other"];
const COST_SECTIONS: CostSection[] = ["Labour", "Materials", "Subcontractors", "Plant", "Margin"];
const NEW_SUPPLIER_OPTION = "__new_supplier__";
const LINE_GRID_TEMPLATE = "minmax(170px, 1.3fr) 140px 120px 72px 72px 104px 104px";
const PURCHASE_ORDER_ATTACHMENTS_BUCKET = "project-variation-attachments";
const SUPPLIER_INVOICE_APPROVAL_CHECK_OPTIONS: Array<{
  key: keyof SupplierInvoiceApprovalChecks;
  label: string;
}> = [
  { key: "materials_received", label: "Materials/services received" },
  { key: "pricing_correct", label: "Pricing correct" },
  { key: "variation_approved", label: "Variation approved if applicable" },
  { key: "no_supplier_overcharge", label: "No supplier overcharge" },
  { key: "allocation_correct", label: "Allocation correct" },
  { key: "ready_for_accounting", label: "Ready for accounting" },
];

function DescriptionInputWithPreview({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent"
      disabled={disabled}
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

export default function ProjectVariationsPage() {
  const params = useParams<{ projectId: string; purchaseOrderId: string }>();
  const routeProjectSlug = params?.projectId;
  const routePurchaseOrderId = params?.purchaseOrderId;
  const isNewVariationRoute = routePurchaseOrderId === "new";
  const router = useRouter();
  const { session } = useAuth();
  const canManagePurchaseOrder = canManageCommercialData(session?.role);

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
  const [purchaseOrderInvoiceMatches, setPurchaseOrderInvoiceMatches] = useState<PurchaseOrderInvoiceMatchRow[]>([]);
  const [matchedSupplierInvoices, setMatchedSupplierInvoices] = useState<MatchedSupplierInvoiceRow[]>([]);
  const [organizationMembersByUserId, setOrganizationMembersByUserId] = useState<Record<string, OrganizationMemberSummary>>({});
  const [canReviewSupplierInvoiceAllocations, setCanReviewSupplierInvoiceAllocations] = useState(false);
  const [matchApprovalDrafts, setMatchApprovalDrafts] = useState<Record<string, MatchApprovalDraft>>({});
  const [expandedMatchApprovalId, setExpandedMatchApprovalId] = useState<string | null>(null);
  const [isSavingMatchApprovalId, setIsSavingMatchApprovalId] = useState<string | null>(null);
  const [hydratedPurchaseOrderIds, setHydratedPurchaseOrderIds] = useState<Set<string>>(new Set());
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const isCreatingPurchaseOrderRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
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

  const refreshSummary = useCallback(async (nextOrganizationId: string, nextProjectId: string) => {
    if (!supabase) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: summaryError } = await (supabase as any).rpc("get_project_purchase_order_summary", {
      p_organization_id: nextOrganizationId,
      p_project_id: nextProjectId,
    });

    if (summaryError) {
      throw new Error(summaryError.message);
    }

    const row = (Array.isArray(data) ? data[0] : null) as PurchaseOrderSummaryRow | null;
    setSummary({
      totalValue: Number(row?.total_value ?? 0),
      draft: Number(row?.draft_count ?? 0),
      awaitingClient: Number(row?.awaiting_client_count ?? 0),
      approved: Number(row?.approved_count ?? 0),
      invoiceReady: Number(row?.invoice_ready_count ?? 0),
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItemsTable = (supabase as any).from("project_purchase_order_line_items");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachmentsTable = (supabase as any).from("project_purchase_order_attachments");

    try {
      const [{ data: purchaseOrderRowRaw, error: purchaseOrderError }, { data: lineRowsRaw }, { data: attachmentRowsRaw }] = await Promise.all([
        purchaseOrdersTable
          .select(
            "id, updated_at, purchase_order_number, purchase_order_title, status, origin, supplier_id, issued_to_label, supplier_contact, supplier_name_snapshot, supplier_email_snapshot, supplier_phone_snapshot, requested_by, requested_date, due_date, total_purchase_order_price, sent_to_client_at, approved_at, invoice_ready, margin_percent, discount_amount, contingency_amount, gst_percent, include_margin_in_export, include_discount_in_export, include_contingency_in_export, notes"
          )
          .eq("organization_id", resolvedOrganizationId)
          .eq("id", purchaseOrderId)
          .maybeSingle(),
        lineItemsTable
          .select("id, purchase_order_id, line_uid, cost_item_id, source_cost_item_id, section, description, quantity, unit, rate, source_time_sheet_entry_id")
          .eq("organization_id", resolvedOrganizationId)
          .eq("purchase_order_id", purchaseOrderId)
          .order("sort_order", { ascending: true }),
        attachmentsTable
          .select("id, purchase_order_id, file_name, file_kind, storage_path, external_url")
          .eq("organization_id", resolvedOrganizationId)
          .eq("purchase_order_id", purchaseOrderId)
          .order("created_at", { ascending: true }),
      ]);

      if (purchaseOrderError) {
        throw new Error(purchaseOrderError.message);
      }
      if (!purchaseOrderRowRaw) {
        return;
      }

      const row = purchaseOrderRowRaw as VariationRow;
      const lineRows = (lineRowsRaw ?? []) as Array<{
        id: string;
        purchase_order_id: string;
        line_uid: string | null;
        cost_item_id: string | null;
        source_cost_item_id: string | null;
        section: string;
        description: string;
        quantity: number;
        unit: string;
        rate: number;
        source_time_sheet_entry_id: string | null;
      }>;
      const attachmentRows = (attachmentRowsRaw ?? []) as Array<{
        id: string;
        purchase_order_id: string;
        file_name: string;
        file_kind: string;
        storage_path: string | null;
        external_url: string | null;
      }>;

      const hydratedLines = lineRows.length > 0
        ? lineRows.map((lineRow) => ({
            id: lineRow.id,
            lineUid: lineRow.line_uid ?? crypto.randomUUID(),
            costItemId: lineRow.cost_item_id ?? null,
            sourceCostItemId: lineRow.source_cost_item_id ?? null,
            section: COST_SECTIONS.includes(lineRow.section as CostSection) ? (lineRow.section as CostSection) : "Labour",
            description: lineRow.description ?? "",
            quantity: Number(lineRow.quantity ?? 0),
            unit: lineRow.unit ?? "",
            rate: Number(lineRow.rate ?? 0),
            sourceTimeSheetEntryId: lineRow.source_time_sheet_entry_id ?? null,
          }))
        : [makeDefaultCostLine("Labour")];

      const hydratedAttachments: AttachmentItem[] = attachmentRows.map((attachmentRow) => ({
        id: attachmentRow.id,
        name: attachmentRow.file_name ?? "",
        type:
          attachmentRow.file_kind === "Drawing" || attachmentRow.file_kind === "Email" || attachmentRow.file_kind === "Site Instruction"
            ? (attachmentRow.file_kind as AttachmentItem["type"])
            : "Email",
        storagePath: attachmentRow.storage_path ?? null,
        externalUrl: attachmentRow.external_url ?? null,
      }));

      setVariations((current) =>
        current.map((variation) =>
          variation.id !== purchaseOrderId
            ? variation
            : {
                ...variation,
                updatedAt: row.updated_at ?? null,
                code: row.purchase_order_number,
                title: row.purchase_order_title,
                status: normalizeStatus(row.status),
                origin: normalizeOrigin(row.origin),
                issuedToSupplierId: row.supplier_id ?? "",
                issuedToLabel: row.issued_to_label ?? row.supplier_name_snapshot ?? "",
                supplierContact: row.supplier_contact ?? "",
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
                totalPrice: Number(row.total_purchase_order_price ?? 0),
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
          .select("id, name, company_name, legal_name, email, phone, address, website, default_tax_rate_id, default_payment_terms, is_active, source, created_by, created_at, updated_at")
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

  useEffect(() => {
    if (!supabase || !organizationId || !activeVariation?.id) {
      setPurchaseOrderInvoiceMatches([]);
      setMatchedSupplierInvoices([]);
      setOrganizationMembersByUserId({});
      setCanReviewSupplierInvoiceAllocations(false);
      setMatchApprovalDrafts({});
      return;
    }

    let cancelled = false;

    const loadInvoiceMatches = async () => {
      const [
        { data: matchRowsRaw, error: matchRowsError },
        { data: canReviewData, error: canReviewError },
        { data: memberRowsRaw, error: memberRowsError },
      ] = await Promise.all([
        supabase
          .from("supplier_invoice_purchase_order_matches")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("purchase_order_id", activeVariation.id)
          .order("created_at", { ascending: true }),
        supabase.rpc("has_org_permission", {
          p_organization_id: organizationId,
          p_permission_key: "supplier_invoices.review",
        }),
        supabase
          .from("organization_members")
          .select("user_id, display_name")
          .eq("organization_id", organizationId)
          .order("display_name", { ascending: true }),
      ]);

      if (canReviewError) {
        if (!cancelled) {
          setError(canReviewError.message);
        }
        return;
      }

      if (memberRowsError) {
        if (!cancelled) {
          setError(memberRowsError.message);
        }
        return;
      }

      if (matchRowsError) {
        if (!cancelled) {
          setError(matchRowsError.message);
        }
        return;
      }

      const matchRows = (matchRowsRaw ?? []) as PurchaseOrderInvoiceMatchRow[];
      if (cancelled) {
        return;
      }

      setCanReviewSupplierInvoiceAllocations(Boolean(canReviewData));
      const memberDirectory = Object.fromEntries(
        ((memberRowsRaw ?? []) as OrganizationMemberSummary[]).map((member) => [
          member.user_id,
          member,
        ])
      );
      setOrganizationMembersByUserId(memberDirectory);
      setPurchaseOrderInvoiceMatches(matchRows);
      setMatchApprovalDrafts(
        matchRows.reduce<Record<string, MatchApprovalDraft>>((accumulator, match) => {
          accumulator[match.id] = {
            approvalNotes: match.approval_notes ?? "",
            approvalChecks: normalizeSupplierInvoiceApprovalChecks(match.approval_checks_json),
          };
          return accumulator;
        }, {})
      );

      const supplierInvoiceIds = [...new Set(matchRows.map((match) => match.supplier_invoice_id).filter(Boolean))];
      if (supplierInvoiceIds.length === 0) {
        setMatchedSupplierInvoices([]);
        return;
      }

      const { data: invoiceRowsRaw, error: invoiceRowsError } = await supabase
        .from("supplier_invoices")
        .select("id, invoice_number, status, supplier_id, invoice_date, due_date, total")
        .eq("organization_id", organizationId)
        .in("id", supplierInvoiceIds);

      if (invoiceRowsError) {
        if (!cancelled) {
          setError(invoiceRowsError.message);
        }
        return;
      }

      if (!cancelled) {
        setMatchedSupplierInvoices((invoiceRowsRaw ?? []) as MatchedSupplierInvoiceRow[]);
      }
    };

    void loadInvoiceMatches();

    return () => {
      cancelled = true;
    };
  }, [activeVariation?.id, organizationId, supabase]);

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
  const matchedSupplierInvoiceById = useMemo(
    () => new Map(matchedSupplierInvoices.map((invoice) => [invoice.id, invoice])),
    [matchedSupplierInvoices]
  );
  const purchaseOrderInvoiceMatchRows = useMemo(
    () =>
      purchaseOrderInvoiceMatches.map((match) => ({
        ...match,
        invoice: matchedSupplierInvoiceById.get(match.supplier_invoice_id) ?? null,
        approverName: match.approved_by_user_id
          ? organizationMembersByUserId[match.approved_by_user_id]?.display_name ?? "Unknown reviewer"
          : null,
      })),
    [matchedSupplierInvoiceById, organizationMembersByUserId, purchaseOrderInvoiceMatches]
  );
  const invoiceRollup = useMemo(() => {
    const invoicedTotal = purchaseOrderInvoiceMatchRows.reduce((sum, match) => {
      if (!matchCountsTowardInvoiceTotal(match.match_status)) {
        return sum;
      }
      return sum + Number(match.matched_amount ?? 0);
    }, 0);

    const approvedInvoiceTotal = purchaseOrderInvoiceMatchRows.reduce((sum, match) => {
      if (!matchCountsTowardInvoiceTotal(match.match_status) || match.approval_status !== "approved") {
        return sum;
      }
      return sum + Number(match.matched_amount ?? 0);
    }, 0);

    const outstandingAmount = Math.max(0, Number(activeVariation?.totalPrice ?? 0) - approvedInvoiceTotal);

    return {
      invoicedTotal,
      approvedInvoiceTotal,
      outstandingAmount,
    };
  }, [activeVariation?.totalPrice, purchaseOrderInvoiceMatchRows]);

  const updateMatchApprovalDraft = useCallback(
    (
      matchId: string,
      updater: (current: MatchApprovalDraft) => MatchApprovalDraft
    ) => {
      setMatchApprovalDrafts((current) => {
        const existing = current[matchId] ?? {
          approvalNotes: "",
          approvalChecks: { ...DEFAULT_SUPPLIER_INVOICE_APPROVAL_CHECKS },
        };
        return {
          ...current,
          [matchId]: updater(existing),
        };
      });
    },
    []
  );

  const reviewAllocation = useCallback(
    async (match: PurchaseOrderInvoiceMatchRow, nextStatus: "approved" | "disputed") => {
      if (!supabase || !organizationId || !session?.id || !canReviewSupplierInvoiceAllocations) {
        return;
      }

      const draft = matchApprovalDrafts[match.id] ?? {
        approvalNotes: match.approval_notes ?? "",
        approvalChecks: normalizeSupplierInvoiceApprovalChecks(match.approval_checks_json),
      };

      if (
        nextStatus === "approved" &&
        Object.values(draft.approvalChecks).some((value) => value !== true)
      ) {
        setError("Complete every allocation review check before approving this matched amount.");
        return;
      }

      setIsSavingMatchApprovalId(match.id);
      setError(null);
      setSaveMessage(null);

      try {
        const { error: updateError } = await supabase
          .from("supplier_invoice_purchase_order_matches")
          .update({
            approval_status: nextStatus,
            approved_by_user_id: session.id,
            approved_at: new Date().toISOString(),
            approval_notes: draft.approvalNotes.trim(),
            approval_checks_json: draft.approvalChecks,
          })
          .eq("id", match.id)
          .eq("organization_id", organizationId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        const { data: refreshedMatchRowsRaw, error: refreshedMatchRowsError } = await supabase
          .from("supplier_invoice_purchase_order_matches")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("purchase_order_id", activeVariation?.id)
          .order("created_at", { ascending: true });

        if (refreshedMatchRowsError) {
          throw new Error(refreshedMatchRowsError.message);
        }

        const refreshedMatchRows = (refreshedMatchRowsRaw ?? []) as PurchaseOrderInvoiceMatchRow[];
        const refreshedSupplierInvoiceIds = [
          ...new Set(refreshedMatchRows.map((row) => row.supplier_invoice_id).filter(Boolean)),
        ];

        if (refreshedSupplierInvoiceIds.length > 0) {
          const { data: refreshedInvoiceRowsRaw, error: refreshedInvoiceRowsError } = await supabase
            .from("supplier_invoices")
            .select("id, invoice_number, status, supplier_id, invoice_date, due_date, total")
            .eq("organization_id", organizationId)
            .in("id", refreshedSupplierInvoiceIds);

          if (refreshedInvoiceRowsError) {
            throw new Error(refreshedInvoiceRowsError.message);
          }

          setMatchedSupplierInvoices((refreshedInvoiceRowsRaw ?? []) as MatchedSupplierInvoiceRow[]);
        } else {
          setMatchedSupplierInvoices([]);
        }

        setPurchaseOrderInvoiceMatches(refreshedMatchRows);
        setExpandedMatchApprovalId(null);
        setSaveMessage(
          nextStatus === "approved"
            ? "Supplier invoice allocation approved."
            : "Supplier invoice allocation marked disputed."
        );
      } catch (reviewError) {
        setError(
          reviewError instanceof Error
            ? reviewError.message
            : "Unable to update the supplier invoice allocation."
        );
      } finally {
        setIsSavingMatchApprovalId(null);
      }
    },
    [
      activeVariation?.id,
      canReviewSupplierInvoiceAllocations,
      matchApprovalDrafts,
      organizationId,
      session?.id,
      supabase,
    ]
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
          supabase.rpc("list_project_members", {
            p_organization_id: organizationId,
            p_project_id: dbProjectId,
          }),
          supabase.rpc("list_purchase_order_assignments", {
            p_organization_id: organizationId,
            p_project_id: dbProjectId,
            p_purchase_order_id: activeVariation.id,
          }),
        ]);

        if (projectMembersResult.error || assignmentsResult.error) {
          throw new Error(projectMembersResult.error?.message ?? assignmentsResult.error?.message ?? "Unable to load assigned workers.");
        }

        if (cancelled) {
          return;
        }

        const nextProjectMembers = ((projectMembersResult.data ?? []) as ProjectMemberListItem[]).filter((member) => member.is_active);
        const nextAssignedMemberIds = new Set(
          ((assignmentsResult.data ?? []) as Array<{ organization_member_id: string; is_active: boolean }>)
            .filter((assignment) => assignment.is_active)
            .map((assignment) => assignment.organization_member_id)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: createdRows, error: createError } = await (supabase as any).rpc("create_project_purchase_order_draft", {
        p_organization_id: organizationId,
        p_project_id: dbProjectId,
        p_title: "New Purchase Order",
        p_origin: "Material Supply",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(createdRows) ? createdRows[0] : null;
      if (!createdRow?.id) {
        throw new Error("Purchase order was created but no identifier was returned.");
      }
      if (typeof createdRow.updated_at !== "string" || createdRow.updated_at.length === 0) {
        throw new Error("Purchase order was created but no updated timestamp was returned.");
      }

      const nextVariation = makeDefaultVariation(variations.length, jobCode);
      nextVariation.id = createdRow.id;
      nextVariation.updatedAt = createdRow.updated_at;
      nextVariation.code = createdRow.purchase_order_number || `${jobCode}-PO-00`;
      nextVariation.title = createdRow.purchase_order_title || "New Purchase Order";
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
      if (dbProjectId) {
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
        if (!session?.id) {
          throw new Error("You must be signed in to create a supplier.");
        }

        const duplicateWarnings = getSupplierDuplicateWarnings({
          suppliers,
          name: supplierDisplay,
          email: newSupplierEmail.trim(),
        });
        if (
          duplicateWarnings.length > 0 &&
          !window.confirm(
            `Possible duplicate supplier:\n\n${duplicateWarnings.map((warning) => `• ${warning.message}`).join("\n")}\n\nCreate anyway?`
          )
        ) {
          setIsSaving(false);
          return;
        }

        const { data: newSupplierRow, error: newSupplierError } = await supabase
          .from("organization_suppliers")
          .insert({
            organization_id: organizationId,
            created_by: session.id,
            name: supplierDisplay,
            company_name: supplierDisplay,
            email: newSupplierEmail.trim() || null,
            phone: newSupplierPhone.trim() || null,
            source: "purchase_order_inline",
          })
          .select("*")
          .single();

        if (newSupplierError || !newSupplierRow?.id) {
          throw new Error(newSupplierError?.message ?? "Unable to create supplier.");
        }

        const createdSupplier = newSupplierRow as OrganizationSupplierRow;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: saveRows, error: saveError } = await (supabase as any).rpc("save_project_purchase_order_draft", {
        p_organization_id: organizationId,
        p_project_id: dbProjectId,
        p_purchase_order_id: activeVariation.id,
        p_expected_updated_at: activeVariation.updatedAt,
        p_purchase_order_title: activeVariation.title.trim() || activeVariation.code,
        p_purchase_order_number: activeVariation.code,
        p_status: activeVariation.status,
        p_origin: activeVariation.origin,
        p_supplier_id: resolvedSupplierId,
        p_issued_to_label: issuedToLabel,
        p_supplier_contact: supplierContact,
        p_supplier_name_snapshot: supplierNameSnapshot,
        p_supplier_email_snapshot: supplierEmailSnapshot,
        p_supplier_phone_snapshot: supplierPhoneSnapshot,
        p_requested_by: activeVariation.requestedBy,
        p_requested_date: activeVariation.requestedDate || null,
        p_due_date: activeVariation.dueDate || null,
        p_sent_to_client_at: activeVariation.clientSentAt || null,
        p_approved_at: activeVariation.approvedAt || null,
        p_invoice_ready: activeVariation.invoiceReady,
        p_notes: activeVariation.notes,
        p_margin_percent: 0,
        p_discount_amount: 0,
        p_contingency_amount: 0,
        p_gst_percent: Number(numberOrZero(activeVariation.gstPercent).toFixed(3)),
        p_include_margin_in_export: false,
        p_include_discount_in_export: false,
        p_include_contingency_in_export: false,
        p_line_items: activeVariation.costLines.map((line) => ({
          id: line.id,
          line_uid: line.lineUid ?? null,
          cost_item_id: line.costItemId ?? null,
          section: line.section,
          description: line.description,
          quantity: Number(line.quantity),
          unit: line.unit,
          rate: Number(line.rate),
          source_cost_item_id: line.sourceCostItemId ?? null,
          source_time_sheet_entry_id: line.sourceTimeSheetEntryId ?? null,
        })),
        p_attachments: activeVariation.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          storagePath: attachment.storagePath,
          externalUrl: attachment.externalUrl,
        })),
      });

      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = (Array.isArray(saveRows) ? saveRows[0] : null) as RpcResultRow | null;
      const savedPurchaseOrderId = typeof savedRow?.id === "string" ? savedRow.id : null;
      if (!savedPurchaseOrderId) {
        throw new Error("Purchase order was saved but no identifier was returned.");
      }
      const nextUpdatedAt = typeof savedRow?.updated_at === "string" ? savedRow.updated_at : null;
      if (!nextUpdatedAt) {
        throw new Error("Purchase order was saved but no updated timestamp was returned.");
      }
      const nextTotal = Number(savedRow?.total_purchase_order_price ?? pricingSummary.grandTotal);

      triggerDocumentClassification({
        documentKind: "project_purchase_order",
        documentId: savedPurchaseOrderId,
      });

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
        <OperationalPageHeader
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
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[#64748B]`}>Loading purchase orders...</p>
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
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalPageHeader
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
        <div className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      ) : null}
      {!canManagePurchaseOrder && session ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--warning)]">
          You can review this purchase order, but only owner, admin, QS, and project manager roles can edit or delete it.
        </div>
      ) : null}

      {hasVariations && activeVariation ? (
      isActiveVariationHydrated ? (
      <div className="space-y-6 [&_input]:border-[#D7E1EC] [&_input]:bg-[#FBFEFE] [&_select]:border-[#D7E1EC] [&_select]:bg-[#FBFEFE] [&_textarea]:border-[#D7E1EC] [&_textarea]:bg-[#FBFEFE]">
        <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
          <section className="border-b border-[#E8EDF5] pb-5">
            <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Purchase Order Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={styles.quoteBodyLabel}>Purchase order title</label>
                  <Input value={activeVariation.title} onChange={(event) => updateActiveVariation("title", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>Status</label>
                  <select value={activeVariation.status} onChange={(event) => setStatus(event.target.value as VariationStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={styles.quoteBodyLabel}>Purchase Order Number</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[6px] bg-[#f8fafc]" /></div>
                <div className="space-y-1.5">
                  <label className={styles.quoteBodyLabel}>PO Type</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
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
                    <div className="min-h-10 rounded-[6px] border border-[#d1d9e6] bg-[#FBFEFE] px-3 py-2">
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
                                className="font-body text-sm font-normal leading-none text-text-muted hover:text-[#B42318] disabled:cursor-not-allowed disabled:text-[#94A3B8]"
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
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-[8px] border border-[#d1d9e6] bg-white shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
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
                                className={`${interMedium.className} block w-full px-3 py-2 text-left text-sm text-[#1d2433] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
                              >
                                {member.display_name}
                              </button>
                            );
                          })
                        ) : (
                          <p className={`${interMedium.className} px-3 py-2 text-sm text-[#64748B]`}>
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
                <div className="rounded-[6px] border border-[#d7deea] bg-[#f8faff] p-3">
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
              <div className="h-10" />
            </div>

            <div className="mt-4 overflow-hidden rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE]">
              <div>
                <div>
                  <div
                    className={`${interMedium.className} grid items-center gap-0 border-b border-[#D7E1EC] bg-[#F3F4F6] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[#475569]`}
                    style={{ gridTemplateColumns: `${LINE_GRID_TEMPLATE} 44px` }}
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
                      <div key={line.id} className="group grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: `${LINE_GRID_TEMPLATE} 44px` }}>
                        <div className="flex items-center px-3 py-1.5">
                          <DescriptionInputWithPreview
                            value={line.description}
                            onChange={(value) => updateCostLine(line.id, "description", value)}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                          />
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          {line.sourceTimeSheetEntryId ? (
                            <span className={`${interMedium.className} text-[12px] text-[#64748B]`}>
                              Synced from timesheet
                            </span>
                          ) : (
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className={`${interMedium.className} truncate text-[12px] text-[#64748B]`}>
                                {resolveSourceLabel(line)}
                              </span>
                              <div className="flex items-center gap-2">
                                {resolveSourceHint(line) ? (
                                  <span className={`${interMedium.className} text-[11px] text-[#94A3B8]`}>
                                    {resolveSourceHint(line)}
                                  </span>
                                ) : null}
                                {canManagePurchaseOrder ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={`${interMedium.className} inline-flex items-center gap-1 text-[11px] text-[#475569] underline-offset-2 hover:text-[#22324A] hover:underline`}
                                      >
                                        {line.sourceCostItemId ? "Change" : "Link source"}
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      side="bottom"
                                      align="start"
                                      sideOffset={8}
                                      className="!z-[200] max-h-[320px] min-w-[320px] overflow-y-auto rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                                    >
                                      <DropdownMenuItem
                                        onSelect={() => assignSourceCostItem(line.id, null)}
                                        className={`${interMedium.className} min-h-10 cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
                                      >
                                        <div className="flex min-w-0 flex-col">
                                          <span>Manual</span>
                                          <span className="text-[11px] text-[#64748B]">No source link</span>
                                        </div>
                                      </DropdownMenuItem>
                                      {quoteSourceOptions.length > 0 ? (
                                        <>
                                          <DropdownMenuSeparator className="my-1 bg-[#E8EDF5]" />
                                          <div className={`${interMedium.className} px-3 py-1 text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]`}>
                                            Quote Items
                                          </div>
                                          {quoteSourceOptions.map((option) => (
                                            <DropdownMenuItem
                                              key={option.id}
                                              onSelect={() => assignSourceCostItem(line.id, option.id)}
                                              className={`${interMedium.className} min-h-10 cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
                                            >
                                              <div className="flex min-w-0 flex-col">
                                                <span className="truncate">{option.documentNumber}</span>
                                                <span className="truncate text-[11px] text-[#64748B]">
                                                  {option.description || option.documentTitle || option.section || "Quote line"}
                                                </span>
                                              </div>
                                            </DropdownMenuItem>
                                          ))}
                                        </>
                                      ) : null}
                                      {variationSourceOptions.length > 0 ? (
                                        <>
                                          <DropdownMenuSeparator className="my-1 bg-[#E8EDF5]" />
                                          <div className={`${interMedium.className} px-3 py-1 text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]`}>
                                            Variation Items
                                          </div>
                                          {variationSourceOptions.map((option) => (
                                            <DropdownMenuItem
                                              key={option.id}
                                              onSelect={() => assignSourceCostItem(line.id, option.id)}
                                              className={`${interMedium.className} min-h-10 cursor-pointer rounded-[8px] px-3 py-2 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
                                            >
                                              <div className="flex min-w-0 flex-col">
                                                <span className="truncate">{option.documentNumber}</span>
                                                <span className="truncate text-[11px] text-[#64748B]">
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
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <select
                            value={line.section}
                            onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                            className={`${interMedium.className} h-9 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[#1d2433] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:cursor-not-allowed disabled:!bg-transparent disabled:text-[#7A889C]`}
                          >
                            {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <Input
                            type="number"
                            value={line.quantity}
                            onChange={(event) => updateCostLine(line.id, "quantity", numberOrZero(event.target.value))}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                            className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[#7A889C]"
                          />
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <Input
                            value={line.unit}
                            onChange={(event) => updateCostLine(line.id, "unit", event.target.value)}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                            className="h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[#7A889C]"
                          />
                        </div>
                        <div className="flex items-center border-l border-[#EEF2F7] px-3 py-1.5">
                          <div className="relative w-full">
                            <span className={`${interMedium.className} pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={line.rate === 0 ? "" : line.rate}
                              onChange={(event) => updateCostLine(line.id, "rate", numberOrZero(event.target.value))}
                              disabled={Boolean(line.sourceTimeSheetEntryId) ? !canManagePurchaseOrder : false}
                              className="h-9 w-full !border-0 !bg-transparent pl-4 pr-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[#7A889C]"
                              title={line.sourceTimeSheetEntryId ? "Synced from timesheet: rate is editable, other fields are locked." : undefined}
                            />
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
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                            className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[#9AA8BC]/80 opacity-0 shadow-none hover:bg-transparent hover:text-[#B42318] group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-40"
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
                      className={`${interMedium.className} block min-h-[140px] w-full max-w-[600px] rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 py-3 text-[14px] text-[#1d2433] focus:outline-none focus:border-[#0B2739]`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Button
                      type="button"
                      onClick={() => addAttachment("Drawing")}
                      className={`${ibmPlexSans.className} inline-flex h-9 items-center gap-2 rounded-full bg-[#0B2739] px-5 text-[14px] font-semibold !text-white hover:bg-[#0B2739] hover:opacity-90`}
                    >
                      <Upload className="h-4 w-4" />
                      Attachments
                    </Button>

                    {activeVariation.attachments.length > 0 ? (
                      <div className="space-y-2 pt-2">
                        {activeVariation.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E5EAF2] bg-[#F8F9FC] px-3 py-2">
                            <span className={`${interMedium.className} min-w-0 flex-1 truncate text-sm text-[#1D2433]`}>{attachment.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeAttachment(attachment.id)}
                              className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
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

              <div className="rounded-[14px] border border-[#E8EDF5] bg-[#F9FAFC] px-4 py-4">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle} mb-4`}>Pricing Summary</h2>
                <div className={`${interMedium.className} space-y-2.5 text-[13px]`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Subtotal</span>
                    <span className="font-medium text-[#1d2433]">{toMoney(purchaseOrderPreGstTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                      GST
                      <Input
                        type="number"
                        value={activeVariation.gstPercent}
                        onChange={(event) => updateActiveVariation("gstPercent", event.target.value)}
                        className="h-6 w-12 rounded-[4px] border-[#D7E1EC] bg-white px-1 text-center text-[12px]"
                      />
                      %
                    </span>
                    <span className="font-medium text-[#1d2433]">{toMoney(pricingSummary.gst)}</span>
                  </div>
                  <div className="h-px bg-[#E2E8F1]" />
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[15px] font-semibold text-[#1d2433]">Total</span>
                    <span className="text-[15px] font-semibold text-[#1d2433]">{toMoney(pricingSummary.grandTotal)}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <Button type="button" onClick={saveVariation} disabled={!canManagePurchaseOrder || isSaving} className={`${ibmPlexSans.className} h-9 w-full rounded-full bg-[#0B2739] text-[14px] font-semibold !text-white hover:bg-[#0B2739] hover:opacity-90`}>
                    {isSaving ? "Saving..." : "Save Purchase Order"}
                  </Button>
                  <Button
                    type="button"
                    onClick={exportVariationPdf}
                    disabled={isSaving}
                    variant="outline"
                    className={`${ibmPlexSans.className} h-9 w-full rounded-full border-[#d3dbe8] bg-white px-5 text-[14px] font-semibold text-[#1d2433]`}
                  >
                    Export PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className={`${styles.quotePanelCard} overflow-hidden px-6 py-5`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Supplier Invoice Approvals</h2>
                <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full border border-[#E2E8F1] bg-white px-3 py-1 text-[12px] font-medium text-[#475569]`}>
                  {canReviewSupplierInvoiceAllocations ? "QS / PM approval" : "Read only"}
                </span>
              </div>

              <div className="rounded-[14px] border border-[#E8EDF5] bg-[#F9FAFC] px-4 py-4">
                <div className={`${interMedium.className} space-y-3 text-[14px]`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Invoiced Total</span>
                    <span className="font-medium text-[#1d2433]">{toMoney(invoiceRollup.invoicedTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Approved Invoice Total</span>
                    <span className="font-medium text-[#1d2433]">{toMoney(invoiceRollup.approvedInvoiceTotal)}</span>
                  </div>
                  <div className="h-px bg-[#E2E8F1]" />
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[15px] font-semibold text-[#1d2433]">Outstanding Amount</span>
                    <span className="text-[15px] font-semibold text-[#1d2433]">{toMoney(invoiceRollup.outstandingAmount)}</span>
                  </div>
                </div>
              </div>

              {purchaseOrderInvoiceMatchRows.length === 0 ? (
                <div className="mt-4 rounded-[14px] border border-dashed border-[#D7E1EC] bg-white px-4 py-5 text-center">
                  <p className={`${ibmPlexSans.className} text-[14px] text-[#64748B]`}>
                    No supplier invoices matched yet.
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                          {[
                            "Invoice Number",
                            "Invoice Date",
                            "Matched Amount",
                            "Allocation",
                            "Approval",
                            "Approver",
                            "Actions",
                          ].map((heading) => (
                            <th
                              key={heading}
                              className={`${ibmPlexSans.className} px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseOrderInvoiceMatchRows.map((match) => {
                          const isExpanded = expandedMatchApprovalId === match.id && canReviewSupplierInvoiceAllocations;
                          return (
                            <Fragment key={match.id}>
                              <tr className="group border-b border-[#E2E8F1] last:border-0 transition-colors hover:bg-[#F8FBFB]">
                                <td className="px-6 py-4">
                                  <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                                    {match.invoice?.invoice_number || "Supplier Invoice"}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>
                                    {toDayMonthYearLabel(match.invoice?.invoice_date ?? null)}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                                    {toMoney(Number(match.matched_amount ?? 0))}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${getSupplierInvoiceMatchStatusClassName(match.match_status)}`}>
                                    {formatMatchStatusLabel(match.match_status)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${getSupplierInvoiceMatchApprovalStatusClassName(match.approval_status)}`}>
                                    {formatSupplierInvoiceMatchApprovalStatusLabel(match.approval_status)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className={`${ibmPlexSans.className} text-[13px] text-[#4B5D79]`}>
                                    {match.approverName
                                      ? `${match.approverName}${match.approved_at ? ` · ${toDayMonthYearLabel(match.approved_at)}` : ""}`
                                      : "Awaiting approval"}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label="Row actions"
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F1] bg-white text-[#475569] transition hover:bg-[#F8FAFC]"
                                      >
                                        <MoreVertical className="h-4 w-4" strokeWidth={2.2} />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="!z-[200] min-w-[160px] rounded-[12px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]">
                                      {match.invoice?.id ? (
                                        <DropdownMenuItem asChild className={`${ibmPlexSans.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}>
                                          <Link href={`/app/company/supplier-invoices/${match.invoice.id}`}>
                                            Open
                                          </Link>
                                        </DropdownMenuItem>
                                      ) : null}
                                      {canReviewSupplierInvoiceAllocations ? (
                                        <DropdownMenuItem
                                          className={`${ibmPlexSans.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
                                          onSelect={(event) => {
                                            event.preventDefault();
                                            setExpandedMatchApprovalId((current) =>
                                              current === match.id ? null : match.id
                                            );
                                          }}
                                        >
                                          {isExpanded ? "Hide review" : "Review"}
                                        </DropdownMenuItem>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                              {isExpanded ? (
                                <tr className="border-b border-[#E2E8F1] last:border-0 bg-[#F9FAFC]">
                                  <td colSpan={7} className="px-6 py-5">
                                    <div className="space-y-4">
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {SUPPLIER_INVOICE_APPROVAL_CHECK_OPTIONS.map((option) => {
                                          const draft = matchApprovalDrafts[match.id] ?? {
                                            approvalNotes: match.approval_notes ?? "",
                                            approvalChecks: normalizeSupplierInvoiceApprovalChecks(match.approval_checks_json),
                                          };

                                          return (
                                            <label key={option.key} className="flex items-start gap-2">
                                              <input
                                                type="checkbox"
                                                checked={draft.approvalChecks[option.key]}
                                                onChange={(event) =>
                                                  updateMatchApprovalDraft(match.id, (current) => ({
                                                    ...current,
                                                    approvalChecks: {
                                                      ...current.approvalChecks,
                                                      [option.key]: event.target.checked,
                                                    },
                                                  }))
                                                }
                                                className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] text-[#0B2739] focus:ring-[#0B2739]"
                                              />
                                              <span className={`${interMedium.className} text-[13px] text-[#334155]`}>
                                                {option.label}
                                              </span>
                                            </label>
                                          );
                                        })}
                                      </div>

                                      <div className="space-y-1.5">
                                        <label className={`${ibmPlexSans.className} block text-[13px] font-semibold text-[#1d2433]`}>
                                          Approval notes
                                        </label>
                                        <textarea
                                          rows={3}
                                          value={
                                            matchApprovalDrafts[match.id]?.approvalNotes ??
                                            match.approval_notes ??
                                            ""
                                          }
                                          onChange={(event) =>
                                            updateMatchApprovalDraft(match.id, (current) => ({
                                              ...current,
                                              approvalNotes: event.target.value,
                                            }))
                                          }
                                          className={`${interMedium.className} min-h-[84px] w-full max-w-[600px] rounded-[8px] border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] text-[#1d2433] focus:border-[#0B2739] focus:outline-none`}
                                        />
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          onClick={() => void reviewAllocation(match, "approved")}
                                          disabled={isSavingMatchApprovalId === match.id}
                                          className={`${ibmPlexSans.className} h-9 rounded-full bg-[#0B2739] px-5 text-[14px] font-semibold !text-white hover:bg-[#0B2739] hover:opacity-90`}
                                        >
                                          {isSavingMatchApprovalId === match.id ? "Saving..." : "Approve Allocation"}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => void reviewAllocation(match, "disputed")}
                                          disabled={isSavingMatchApprovalId === match.id}
                                          className={`${ibmPlexSans.className} h-9 rounded-full border-[#F5C2C7] bg-white px-5 text-[14px] font-semibold text-[#B42318] hover:bg-[#FFF1F2]`}
                                        >
                                          Mark Disputed
                                        </Button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
        </section>
      </div>
      ) : (
        <div className="space-y-6">
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
              <p className={`${styles.quoteBodyLabel} pt-2`}>Loading purchase order details...</p>
            </div>
          </div>
          <div className={`${styles.quotePanelCard} overflow-hidden`}>
            <div className="border-b border-[#E8EDF5] px-5 py-4">
              <h2 className={`${interMedium.className} ${styles.quoteSectionTitle}`}>Pricing Summary</h2>
            </div>
            <div className="space-y-3 px-5 py-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
            </div>
          </div>
        </div>
      )
      ) : (
        <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#EEF3FA] text-[#29446E]">
              <FileStack className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-[#0F172A]">No purchase orders yet</h2>
            <p className={`${interMedium.className} mt-2 max-w-[520px] text-sm text-[#64748B]`}>
              Start your purchase order register by creating the first purchase order for this project. You can then build costs,
              attach supporting documents, send to client, and track approval through to invoicing.
            </p>
            <Button
              type="button"
              onClick={() => void createPurchaseOrder()}
              className={`${interMedium.className} mt-6 h-10 rounded-[6px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create First Purchase Order
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
