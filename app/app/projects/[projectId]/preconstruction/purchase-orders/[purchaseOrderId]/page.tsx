"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "@/components/app/trade-pack-builder.module.css";

type VariationStatus = "Draft" | "Pending Approval" | "Approved" | "Issued" | "Received" | "Invoiced" | "Cancelled";
type VariationOrigin = "Material Supply" | "Subcontract Work" | "Plant / Equipment Hire" | "Site Expense" | "Freight / Delivery" | "Variation Order" | "General Purchase" | "Other";
type CostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";

interface CostLine {
  id: string;
  section: CostSection;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourceTimeSheetEntryId?: string | null;
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

interface OrganizationSupplier {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
}

const STATUS_OPTIONS: VariationStatus[] = ["Draft", "Pending Approval", "Approved", "Issued", "Received", "Invoiced", "Cancelled"];
const ORIGIN_OPTIONS: VariationOrigin[] = ["Material Supply", "Subcontract Work", "Plant / Equipment Hire", "Site Expense", "Freight / Delivery", "Variation Order", "General Purchase", "Other"];
const COST_SECTIONS: CostSection[] = ["Labour", "Materials", "Subcontractors", "Plant", "Margin"];
const NEW_SUPPLIER_OPTION = "__new_supplier__";
const LINE_GRID_TEMPLATE = "minmax(220px, 1.6fr) 130px 78px 78px 110px 110px";
const PURCHASE_ORDER_ATTACHMENTS_BUCKET = "project-variation-attachments";

function DescriptionInputWithPreview({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const hasContent = value.trim().length > 0;

  return (
    <div className="group relative">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-[200px] rounded-[6px]"
        disabled={disabled}
      />
      {hasContent ? (
        <div className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-30 w-[min(560px,70vw)] rounded-[6px] border border-[#E6ECF5] bg-[#F8F9FC] p-3 shadow-[0_14px_28px_rgba(15,23,42,0.14)] opacity-0 translate-y-1 transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <p className={`${interMedium.className} text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7F8FA7]`}>
            Full Description
          </p>
          <p className={`${interMedium.className} mt-1 text-sm font-medium leading-relaxed text-[#1F2E45]`}>{value}</p>
        </div>
      ) : null}
    </div>
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

function supplierDisplayName(supplier: OrganizationSupplier) {
  return supplier.company_name?.trim() || supplier.name?.trim() || "";
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

export default function ProjectVariationsPage() {
  const params = useParams<{ projectId: string; purchaseOrderId: string }>();
  const routeProjectSlug = params?.projectId;
  const routePurchaseOrderId = params?.purchaseOrderId;
  const isNewVariationRoute = routePurchaseOrderId === "new";
  const router = useRouter();
  const { session } = useAuth();

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
  const [suppliers, setSuppliers] = useState<OrganizationSupplier[]>([]);
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
  const [hydratedPurchaseOrderIds, setHydratedPurchaseOrderIds] = useState<Set<string>>(new Set());
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const [isCostBuildUpOpen, setIsCostBuildUpOpen] = useState(true);
  const [isDocsOpen, setIsDocsOpen] = useState(true);
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
          .select("id, purchase_order_id, section, description, quantity, unit, rate, source_time_sheet_entry_id")
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
      const suppliersTable = (supabase as any).from("organization_suppliers");

      const { data: suppliersRaw } = await suppliersTable
        .select("id, name, company_name, email, phone")
        .eq("organization_id", resolvedOrganizationId)
        .order("company_name", { ascending: true })
        .order("name", { ascending: true });

      const supplierRows = (suppliersRaw ?? []) as OrganizationSupplier[];
      setSuppliers(supplierRows);

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
  const hasVariations = variations.length > 0;
  const filteredSuppliers = useMemo(() => {
    const query = supplierSearchQuery.trim().toLowerCase();
    if (!query) {
      return suppliers;
    }
    return suppliers.filter((supplier) => supplierDisplayName(supplier).toLowerCase().includes(query));
  }, [supplierSearchQuery, suppliers]);

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
      setSupplierSearchQuery(supplierDisplayName(selectedSupplier));
      return;
    }

    setSupplierSearchQuery(activeVariation.issuedToLabel || "");
  }, [activeVariation, suppliers]);

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
  const isActiveVariationHydrated = activeVariation ? hydratedPurchaseOrderIds.has(activeVariation.id) : false;

  const createPurchaseOrder = useCallback(async () => {
    if (isCreatingPurchaseOrderRef.current) {
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

      const nextVariation = makeDefaultVariation(variations.length, jobCode);
      nextVariation.id = createdRow.id;
      nextVariation.updatedAt = null;
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
  }, [dbProjectId, jobCode, organizationId, refreshSummary, routeProjectSlug, router, session?.id, supabase, variations]);

  const deletePurchaseOrder = useCallback(async (purchaseOrderId: string) => {
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
  }, [dbProjectId, organizationId, persistedVariationIds, refreshSummary, routeProjectSlug, router, supabase, variations]);

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

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      let resolvedSupplierId: string | null = activeVariation.issuedToSupplierId || null;
      let resolvedSupplier: OrganizationSupplier | null = suppliers.find((supplier) => supplier.id === resolvedSupplierId) ?? null;
      if (resolvedSupplierId === NEW_SUPPLIER_OPTION) {
        const supplierName = newSupplierName.trim();
        const supplierCompanyName = newSupplierCompanyName.trim();
        const supplierDisplay = supplierCompanyName || supplierName;
        if (!supplierDisplay) {
          throw new Error("Supplier name is required when adding a new supplier.");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const suppliersTable = (supabase as any).from("organization_suppliers");
        const { data: newSupplierRow, error: newSupplierError } = await suppliersTable
          .insert({
            organization_id: organizationId,
            created_by: session?.id,
            name: supplierName || supplierDisplay,
            company_name: supplierCompanyName,
            email: newSupplierEmail.trim() || null,
            phone: newSupplierPhone.trim() || null,
          })
          .select("id, name, company_name, email, phone")
          .single();

        if (newSupplierError || !newSupplierRow?.id) {
          throw new Error(newSupplierError?.message ?? "Unable to create supplier.");
        }

        const createdSupplier = newSupplierRow as OrganizationSupplier;
        setSuppliers((current) => {
          const withoutExisting = current.filter((supplier) => supplier.id !== createdSupplier.id);
          return [...withoutExisting, createdSupplier].sort((left, right) =>
            supplierDisplayName(left).localeCompare(supplierDisplayName(right))
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
          ? supplierDisplayName(resolvedSupplier)
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
          section: line.section,
          description: line.description,
          quantity: Number(line.quantity),
          unit: line.unit,
          rate: Number(line.rate),
          source_time_sheet_entry_id: line.sourceTimeSheetEntryId ?? null,
        })),
        p_attachments: activeVariation.attachments.map((attachment) => ({
          id: attachment.id,
          type: attachment.type,
          name: attachment.name,
          external_url: attachment.externalUrl ?? `manual://${attachment.name}`,
        })),
      });

      if (saveError) {
        throw new Error(saveError.message);
      }

      const savedRow = Array.isArray(saveRows) ? saveRows[0] : null;
      const nextUpdatedAt = typeof savedRow?.updated_at === "string" ? savedRow.updated_at : activeVariation.updatedAt;
      const nextTotal = Number(savedRow?.total_purchase_order_price ?? pricingSummary.grandTotal);

      setPersistedVariationIds((current) => new Set([...current, activeVariation.id]));
      setVariations((current) =>
        current.map((item) =>
          item.id === activeVariation.id
            ? {
                ...item,
                updatedAt: nextUpdatedAt,
                status: activeVariation.status,
                invoiceReady: activeVariation.invoiceReady,
                totalPrice: nextTotal,
              }
            : item
        )
      );
      setHydratedPurchaseOrderIds((current) => new Set([...current, activeVariation.id]));
      await refreshSummary(organizationId, dbProjectId);
      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save purchase order.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

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
      <div className={`${styles.scope} -mb-8 space-y-6`}>
        <section className={styles.heroBlock}>
          <div>
            <h1 className={styles.heroTitle}>Purchase Order</h1>
            <p className={`${interMedium.className} ${styles.heroSummary}`}>Manage procurement, approvals, and supplier scope for this job</p>
          </div>
          <div className={styles.heroActions}>
            <Button
              type="button"
              variant="outline"
              disabled
              className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px] opacity-60`}
            >
              Actions
              <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
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
          <Card className={`${styles.card} overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#f6f7f9] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)]`}>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className={`${interMedium.className} ${styles.sectionTitle}`}>Pricing Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Purchase Order</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>Manage procurement, approvals, and supplier scope for this job</p>
        </div>
        <div className={styles.heroActions}>
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
            <DropdownMenuContent side="top" align="end" sideOffset={8} className={`${styles.menuPanel} !z-[200] min-w-[240px] !bg-[#F3F4F6] p-1.5 opacity-100`}>
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Purchase Order Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void createPurchaseOrder();
                }}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Purchase Order
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void saveVariation();
                }}
                disabled={isSaving}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                {isSaving ? "Saving..." : "Save Purchase Order"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  exportVariationPdf();
                }}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                Export PDF
              </DropdownMenuItem>
              {activeVariation ? (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void deletePurchaseOrder(activeVariation.id);
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

      {hasVariations && activeVariation ? (
      isActiveVariationHydrated ? (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] [&_input]:bg-[#F8F9FC] [&_select]:bg-[#F8F9FC] [&_textarea]:bg-[#F8F9FC]">
        <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
          <section className="border-b border-[#E8EDF5] py-5">
            <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Purchase Order Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Purchase order title</label>
                  <Input value={activeVariation.title} onChange={(event) => updateActiveVariation("title", event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Status</label>
                  <select value={activeVariation.status} onChange={(event) => setStatus(event.target.value as VariationStatus)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Purchase Order Number</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[6px] bg-[#f8fafc]" /></div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>PO Type</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Raised By</label><Input value={activeVariation.requestedBy} onChange={(event) => updateActiveVariation("requestedBy", event.target.value)} className="h-10 rounded-[6px]" /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Issued To</label>
                  <div className="relative">
                    <Input
                      value={supplierSearchQuery}
                      onFocus={() => setIsSupplierMenuOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setIsSupplierMenuOpen(false), 100);
                      }}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSupplierSearchQuery(value);
                        updateActiveVariation("issuedToSupplierId", "");
                        updateActiveVariation("issuedToLabel", value);
                        setIsSupplierMenuOpen(true);
                      }}
                      className="h-10 rounded-[6px]"
                      placeholder="Search supplier..."
                    />
                    {isSupplierMenuOpen ? (
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-[8px] border border-[#d1d9e6] bg-white shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
                        {filteredSuppliers.length > 0 ? (
                          filteredSuppliers.map((supplier) => {
                            const label = supplierDisplayName(supplier);
                            return (
                              <button
                                key={supplier.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  updateActiveVariation("issuedToSupplierId", supplier.id);
                                  updateActiveVariation("issuedToLabel", label);
                                  setSupplierSearchQuery(label);
                                  setIsSupplierMenuOpen(false);
                                }}
                                className={`${interMedium.className} block w-full px-3 py-2 text-left text-sm text-[#1d2433] hover:bg-[#F8FAFC]`}
                              >
                                {label}
                              </button>
                            );
                          })
                        ) : (
                          <p className={`${interMedium.className} px-3 py-2 text-sm text-[#64748B]`}>No suppliers found.</p>
                        )}
                        <div className="border-t border-[#e7edf5]">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              updateActiveVariation("issuedToSupplierId", NEW_SUPPLIER_OPTION);
                              updateActiveVariation("issuedToLabel", supplierSearchQuery.trim());
                              setIsSupplierMenuOpen(false);
                            }}
                            className={`${interMedium.className} block w-full px-3 py-2 text-left text-sm text-[#1d2433] hover:bg-[#F8FAFC]`}
                          >
                            Add new supplier
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Supplier Contact</label>
                  <Input value={activeVariation.supplierContact} onChange={(event) => updateActiveVariation("supplierContact", event.target.value)} className="h-10 rounded-[6px]" placeholder="Contact name, email, or phone" />
                </div>
              </div>

              {activeVariation.issuedToSupplierId === NEW_SUPPLIER_OPTION ? (
                <div className="rounded-[6px] border border-[#d7deea] bg-[#f8faff] p-3">
                  <p className={`${interMedium.className} mb-3 text-sm font-semibold text-[#1d2433]`}>Add New Supplier</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Contact Name</label>
                      <Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} className="h-10 rounded-[6px]" placeholder="Account contact or trading name" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Company name</label>
                      <Input value={newSupplierCompanyName} onChange={(event) => setNewSupplierCompanyName(event.target.value)} className="h-10 rounded-[6px]" placeholder="Supplier company" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Email</label>
                      <Input type="email" value={newSupplierEmail} onChange={(event) => setNewSupplierEmail(event.target.value)} className="h-10 rounded-[6px]" placeholder="accounts@supplier.com" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Phone</label>
                      <Input value={newSupplierPhone} onChange={(event) => setNewSupplierPhone(event.target.value)} className="h-10 rounded-[6px]" placeholder="+64 21 123 4567" />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Requested Date</label><Input type="date" value={activeVariation.requestedDate} onChange={(event) => updateActiveVariation("requestedDate", event.target.value)} className="h-10 rounded-[6px]" /></div>
              </div>
            </div>
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <button type="button" onClick={() => setIsCostBuildUpOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Line Items</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isCostBuildUpOpen ? "rotate-180" : ""}`} />
            </button>

            {isCostBuildUpOpen ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => addCostLine("Labour")} className={`${interMedium.className} h-9 rounded-[8px] bg-[#0B2739] px-3 text-sm font-medium text-white hover:bg-[#0B2739]`}><Plus className="mr-1 h-4 w-4" />Add Item</Button>
                </div>

                <div className="rounded-[6px] border border-[#E5EAF2] overflow-visible">
                  <div className={`${interMedium.className} grid items-center gap-2 bg-[#F8FAFC] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.1em] text-[#607089]`} style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}>
                    <span>Description</span><span>Section</span><span>Qty</span><span>Unit</span><span>Rate</span><span className="text-right">Total</span>
                  </div>

                  <div className="divide-y divide-[#EEF2F7]">
                    {activeVariation.costLines.map((line) => (
                      <div key={line.id} className="group grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}>
                        <DescriptionInputWithPreview
                          value={line.description}
                          onChange={(value) => updateCostLine(line.id, "description", value)}
                          disabled={Boolean(line.sourceTimeSheetEntryId)}
                        />
                        <select value={line.section} onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)} disabled={Boolean(line.sourceTimeSheetEntryId)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-2 text-sm text-[#1d2433] disabled:cursor-not-allowed disabled:bg-[#EEF2F7] disabled:text-[#7A889C]`}>
                          {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                        </select>
                        <Input type="number" value={line.quantity} onChange={(event) => updateCostLine(line.id, "quantity", numberOrZero(event.target.value))} disabled={Boolean(line.sourceTimeSheetEntryId)} className="h-10 w-[72px] rounded-[6px] px-2 disabled:bg-[#EEF2F7] disabled:text-[#7A889C]" />
                        <Input value={line.unit} onChange={(event) => updateCostLine(line.id, "unit", event.target.value)} disabled={Boolean(line.sourceTimeSheetEntryId)} className="h-10 w-[72px] rounded-[6px] px-2 disabled:bg-[#EEF2F7] disabled:text-[#7A889C]" />
                        <div className="relative w-[100px]">
                          <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                          <Input type="number" value={line.rate === 0 ? "" : line.rate} onChange={(event) => updateCostLine(line.id, "rate", numberOrZero(event.target.value))} className="h-10 w-[100px] rounded-[6px] pl-6 pr-2" />
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineTotal(line))}</div>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeCostLine(line.id)}
                            disabled={Boolean(line.sourceTimeSheetEntryId)}
                            className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
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
            ) : null}
          </section>

          <section className="py-5">
            <button type="button" onClick={() => setIsDocsOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Attachments & Notes</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isDocsOpen ? "rotate-180" : ""}`} />
            </button>

            {isDocsOpen ? (
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
                  <Button type="button" variant="outline" onClick={() => addAttachment("Drawing")} className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}><Upload className="mr-1 h-4 w-4" />Attach Drawing</Button>
                  <Button type="button" variant="outline" onClick={() => addAttachment("Email")} className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}><Mail className="mr-1 h-4 w-4" />Attach Email</Button>
                  <Button type="button" variant="outline" onClick={() => addAttachment("Site Instruction")} className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}><Clock3 className="mr-1 h-4 w-4" />Attach SI</Button>
                </div>

                <div className="rounded-[6px] border border-[#E5EAF2] bg-[#FAFCFF] px-3 py-3">
                  <p className={`${interMedium.className} mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Linked Documentation</p>
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
                    <label className={`${interMedium.className} block text-xs font-medium text-[#64748B]`}>Purchase order notes</label>
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
            ) : null}
          </section>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className={`${styles.card} overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#f6f7f9] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)]`}>
            <CardHeader className="pb-3 pt-5"><CardTitle className={`${interMedium.className} ${styles.sectionTitle}`}>Pricing Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 pb-5">
              <div className="grid gap-2">
                <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>GST (%)</label>
                <Input
                  type="number"
                  value={activeVariation.gstPercent}
                  onChange={(event) => updateActiveVariation("gstPercent", event.target.value)}
                  className="h-10 rounded-[6px]"
                />
              </div>

              <div className="h-px bg-[#E7ECF3]" />

              <div className={`${interMedium.className} space-y-1.5 text-sm font-medium text-[#334155]`}>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Subtotal (excl. GST)</span><span>{toMoney(pricingSummary.baseSubtotal)}</span></p>
                <div className="my-1 h-px bg-[#CBD5E1]" />
                <p className="flex items-center justify-between"><span className="text-[#64748B]">GST ({activeVariation.gstPercent.trim() || "15"}%)</span><span>{toMoney(pricingSummary.gst)}</span></p>
              </div>
              <div className="rounded-[6px] border-2 border-[#C9D6E3] bg-[#F6F7F9] px-4 py-3">
                <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Total Purchase Order Price (incl. GST)</p>
                <p className="mt-[11px] text-[34px] font-semibold leading-none tracking-[-0.02em] text-[#0B2739]">{toMoney(pricingSummary.grandTotal)}</p>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveVariation} disabled={isSaving} className={`${interMedium.className} h-10 w-full rounded-full bg-[#0B2739] text-sm font-medium text-white hover:bg-[#0B2739]`}>
                  {isSaving ? "Saving..." : "Save Purchase Order"}
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
            </CardContent>
          </Card>
        </div>
      </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
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
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[#64748B]`}>Loading purchase order details...</p>
            </div>
          </div>
          <Card className={`${styles.card} overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#f6f7f9] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)]`}>
            <CardHeader className="pb-3 pt-5">
              <CardTitle className={`${interMedium.className} ${styles.sectionTitle}`}>Pricing Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-5">
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
              <div className="h-10 animate-pulse rounded-[8px] bg-[#E8EDF5]" />
            </CardContent>
          </Card>
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
