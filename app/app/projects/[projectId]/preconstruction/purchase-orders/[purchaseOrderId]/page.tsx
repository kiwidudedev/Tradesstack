"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  FileStack,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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
}

interface AttachmentItem {
  id: string;
  name: string;
  type: "Drawing" | "Email" | "Site Instruction";
}

interface VariationItem {
  id: string;
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

function DescriptionInputWithPreview({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const hasContent = value.trim().length > 0;

  return (
    <div className="group relative">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
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

function statusClassName(status: VariationStatus) {
  switch (status) {
    case "Issued":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Approved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Received":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "Cancelled":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "Invoiced":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Pending Approval":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
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
    includeMarginInExport: false,
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
  const [jobCode, setJobCode] = useState(() => deriveJobCode(routeProjectSlug));
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<OrganizationSupplier[]>([]);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCompanyName, setNewSupplierCompanyName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [isLoadingVariations, setIsLoadingVariations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const [savedStatusById, setSavedStatusById] = useState<Map<string, VariationStatus>>(new Map());
  const [isRegisterOpen, setIsRegisterOpen] = useState(true);
  const [isCostBuildUpOpen, setIsCostBuildUpOpen] = useState(true);
  const [isDocsOpen, setIsDocsOpen] = useState(true);
  const isCreatingPurchaseOrderRef = useRef(false);
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

      const { data: projectRow } = await supabase
        .from("organization_projects")
        .select("id, project_code")
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
      const resolvedCode = projectRow?.project_code ? deriveJobCode(projectRow.project_code) : deriveJobCode(routeProjectSlug);
      setJobCode(resolvedCode);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variationsTable = (supabase as any).from("project_purchase_orders");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineItemsTable = (supabase as any).from("project_purchase_order_line_items");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentsTable = (supabase as any).from("project_purchase_order_attachments");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const suppliersTable = (supabase as any).from("organization_suppliers");

      const { data: suppliersRaw } = await suppliersTable
        .select("id, name, company_name, email, phone")
        .eq("organization_id", resolvedOrganizationId)
        .order("company_name", { ascending: true })
        .order("name", { ascending: true });

      const supplierRows = (suppliersRaw ?? []) as OrganizationSupplier[];
      setSuppliers(supplierRows);

      const { data: variationRowsRaw, error: variationError } = await variationsTable
        .select(
          "id, purchase_order_number, purchase_order_title, status, origin, supplier_id, issued_to_label, supplier_contact, supplier_name_snapshot, supplier_email_snapshot, supplier_phone_snapshot, requested_by, requested_date, due_date, total_purchase_order_price, sent_to_client_at, approved_at, invoice_ready, margin_percent, discount_amount, contingency_amount, gst_percent, include_margin_in_export, include_discount_in_export, include_contingency_in_export, notes"
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
        setSavedStatusById(new Map());
        setIsLoadingVariations(false);
        return;
      }

      const variationIds = variationRows.map((row) => row.id);

      const hydratedVariations: VariationItem[] = variationRows.map((row) => ({
        id: row.id,
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
        costLines: [makeDefaultCostLine("Labour")],
        notes: row.notes ?? "",
        attachments: [],
      }));

      setVariations(hydratedVariations);
      setActiveVariationId((current) => (current && hydratedVariations.some((item) => item.id === current) ? current : hydratedVariations[0].id));
      setPersistedVariationIds(new Set(hydratedVariations.map((item) => item.id)));
      setSavedStatusById(new Map(hydratedVariations.map((item) => [item.id, item.status])));
      setIsLoadingVariations(false);

      const hydrateDetailsForIds = async (purchaseOrderIds: string[]) => {
        if (purchaseOrderIds.length === 0) {
          return;
        }

        const [{ data: lineRowsRaw }, { data: attachmentRowsRaw }] = await Promise.all([
          lineItemsTable
            .select("id, purchase_order_id, section, description, quantity, unit, rate")
            .in("purchase_order_id", purchaseOrderIds)
            .order("sort_order", { ascending: true }),
          attachmentsTable
            .select("id, purchase_order_id, file_name, file_kind")
            .in("purchase_order_id", purchaseOrderIds)
            .order("created_at", { ascending: true }),
        ]);

        if (cancelled) {
          return;
        }

        const lineRows = (lineRowsRaw ?? []) as Array<{
          id: string;
          purchase_order_id: string;
          section: string;
          description: string;
          quantity: number;
          unit: string;
          rate: number;
        }>;
        const attachmentRows = (attachmentRowsRaw ?? []) as Array<{
          id: string;
          purchase_order_id: string;
          file_name: string;
          file_kind: string;
        }>;

        const linesByVariationId = new Map<string, CostLine[]>();
        for (const lineRow of lineRows) {
          const current = linesByVariationId.get(lineRow.purchase_order_id) ?? [];
          current.push({
            id: lineRow.id,
            section: COST_SECTIONS.includes(lineRow.section as CostSection) ? (lineRow.section as CostSection) : "Labour",
            description: lineRow.description ?? "",
            quantity: Number(lineRow.quantity ?? 0),
            unit: lineRow.unit ?? "",
            rate: Number(lineRow.rate ?? 0),
          });
          linesByVariationId.set(lineRow.purchase_order_id, current);
        }

        const attachmentsByVariationId = new Map<string, AttachmentItem[]>();
        for (const attachmentRow of attachmentRows) {
          const current = attachmentsByVariationId.get(attachmentRow.purchase_order_id) ?? [];
          current.push({
            id: attachmentRow.id,
            name: attachmentRow.file_name ?? "",
            type:
              attachmentRow.file_kind === "Drawing" || attachmentRow.file_kind === "Email" || attachmentRow.file_kind === "Site Instruction"
                ? (attachmentRow.file_kind as AttachmentItem["type"])
                : "Email",
          });
          attachmentsByVariationId.set(attachmentRow.purchase_order_id, current);
        }

        const idSet = new Set(purchaseOrderIds);
        setVariations((current) =>
          current.map((variation) => {
            if (!idSet.has(variation.id)) {
              return variation;
            }

            return {
              ...variation,
              costLines: linesByVariationId.get(variation.id) ?? [makeDefaultCostLine("Labour")],
              attachments: attachmentsByVariationId.get(variation.id) ?? [],
            };
          })
        );
      };

      const selectedId = routePurchaseOrderId && variationIds.includes(routePurchaseOrderId)
        ? routePurchaseOrderId
        : variationIds[0];
      void hydrateDetailsForIds([selectedId]);

      const remainingIds = variationIds.filter((id) => id !== selectedId);
      if (remainingIds.length > 0) {
        void hydrateDetailsForIds(remainingIds);
      }
    };

    void loadProjectCode();

    return () => {
      cancelled = true;
    };
  }, [routeProjectSlug, routePurchaseOrderId, session?.organizationId, supabase]);

  const activeVariation = useMemo(
    () => variations.find((variation) => variation.id === activeVariationId) ?? variations[0] ?? null,
    [activeVariationId, variations]
  );
  const hasVariations = variations.length > 0;

  useEffect(() => {
    if (!routePurchaseOrderId || variations.length === 0) {
      return;
    }
    if (variations.some((variation) => variation.id === routePurchaseOrderId)) {
      setActiveVariationId(routePurchaseOrderId);
    }
  }, [routePurchaseOrderId, variations]);

  const summary = useMemo(() => {
    const totals = {
      totalValue: 0,
      draft: 0,
      awaitingClient: 0,
      approved: 0,
      invoiceReady: 0,
    };

    for (const variation of variations) {
      const variationTotal = Number(variation.totalPrice ?? 0);
      totals.totalValue += variationTotal;

      if (variation.status === "Draft") {
        totals.draft += 1;
      }
      if (variation.status === "Issued") {
        totals.awaitingClient += 1;
      }
      if (variation.status === "Approved") {
        totals.approved += 1;
      }
      if (variation.invoiceReady) {
        totals.invoiceReady += 1;
      }
    }

    return totals;
  }, [variations]);

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
    const margin = 0;
    const contingency = 0;
    const discount = 0;
    const preGstTotal = baseSubtotal;
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

      const prefix = `${jobCode}-PO-`;
      let maxSuffix = 0;
      for (const variation of variations) {
        if (!variation.code.startsWith(prefix)) {
          continue;
        }
        const suffix = Number.parseInt(variation.code.slice(prefix.length), 10);
        if (Number.isFinite(suffix) && suffix > maxSuffix) {
          maxSuffix = suffix;
        }
      }

      const nextVariation = makeDefaultVariation(variations.length, jobCode);
      nextVariation.code = `${prefix}${String(maxSuffix + 1).padStart(2, "0")}`;
      nextVariation.title = nextVariation.title.trim() || "New Purchase Order";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
      const insertPayload = {
        id: nextVariation.id,
        organization_id: organizationId,
        project_id: dbProjectId,
        created_by: session.id,
        purchase_order_title: nextVariation.title,
        purchase_order_number: nextVariation.code,
        status: nextVariation.status,
        origin: nextVariation.origin,
        supplier_id: null,
        issued_to_label: "",
        supplier_contact: "",
        supplier_name_snapshot: "",
        supplier_email_snapshot: "",
        supplier_phone_snapshot: "",
        requested_by: nextVariation.requestedBy,
        requested_date: nextVariation.requestedDate || null,
        due_date: nextVariation.dueDate || null,
        sent_to_client_at: nextVariation.clientSentAt || null,
        approved_at: nextVariation.approvedAt || null,
        invoice_ready: nextVariation.invoiceReady,
        notes: nextVariation.notes,
        subtotal: 0,
        margin_percent: 0,
        discount_amount: 0,
        contingency_amount: 0,
        gst_percent: Number(numberOrZero(nextVariation.gstPercent).toFixed(3)),
        gst_total: 0,
        total_purchase_order_price: 0,
        include_margin_in_export: false,
        include_discount_in_export: false,
        include_contingency_in_export: false,
      };

      const { error: insertError } = await purchaseOrdersTable.insert(insertPayload);
      if (insertError) {
        throw new Error(insertError.message);
      }

      setVariations((current) => [...current, nextVariation]);
      setPersistedVariationIds((current) => new Set([...current, nextVariation.id]));
      setSavedStatusById((current) => {
        const next = new Map(current);
        next.set(nextVariation.id, nextVariation.status);
        return next;
      });
      setActiveVariationId(nextVariation.id);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${nextVariation.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create purchase order.");
    } finally {
      isCreatingPurchaseOrderRef.current = false;
    }
  }, [dbProjectId, jobCode, organizationId, routeProjectSlug, router, session?.id, supabase, variations]);

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
      setSavedStatusById((current) => {
        const next = new Map(current);
        next.delete(purchaseOrderId);
        return next;
      });

      if (nextRows.length === 0) {
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders`);
      } else {
        const fallback = nextRows[0];
        setActiveVariationId(fallback.id);
        router.replace(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${fallback.id}`);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete purchase order.");
    }
  }, [organizationId, persistedVariationIds, routeProjectSlug, router, supabase, variations]);

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
    if (!activeVariation) return;

    const ext = type === "Drawing" ? "dwg" : "pdf";
    const nextName = `${type.toLowerCase().replaceAll(" ", "-")}-${activeVariation.attachments.length + 1}.${ext}`;

    updateActiveVariation("attachments", [
      ...activeVariation.attachments,
      { id: crypto.randomUUID(), name: nextName, type },
    ]);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variationTable = (supabase as any).from("project_purchase_orders");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineItemsTable = (supabase as any).from("project_purchase_order_line_items");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentsTable = (supabase as any).from("project_purchase_order_attachments");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusEventsTable = (supabase as any).from("project_purchase_order_status_events");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoiceItemsTable = (supabase as any).from("project_purchase_order_invoice_items");

      const sectionTotals = {
        Labour: 0,
        Materials: 0,
        Subcontractors: 0,
        Plant: 0,
        Margin: 0,
      } satisfies Record<CostSection, number>;

      for (const line of activeVariation.costLines) {
        sectionTotals[line.section] += lineTotal(line);
      }

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

      const payload = {
        id: activeVariation.id,
        organization_id: organizationId,
        project_id: dbProjectId,
        created_by: session?.id,
        purchase_order_title: activeVariation.title.trim() || activeVariation.code,
        purchase_order_number: activeVariation.code,
        status: activeVariation.status,
        origin: activeVariation.origin,
        supplier_id: resolvedSupplierId,
        issued_to_label: issuedToLabel,
        supplier_contact: supplierContact,
        supplier_name_snapshot: supplierNameSnapshot,
        supplier_email_snapshot: supplierEmailSnapshot,
        supplier_phone_snapshot: supplierPhoneSnapshot,
        requested_by: activeVariation.requestedBy,
        requested_date: activeVariation.requestedDate || null,
        due_date: activeVariation.dueDate || null,
        sent_to_client_at: activeVariation.clientSentAt || null,
        approved_at: activeVariation.approvedAt || null,
        invoice_ready: activeVariation.invoiceReady,
        notes: activeVariation.notes,
        subtotal: Number(pricingSummary.baseSubtotal.toFixed(2)),
        margin_percent: 0,
        discount_amount: 0,
        contingency_amount: 0,
        gst_percent: Number(numberOrZero(activeVariation.gstPercent).toFixed(3)),
        include_margin_in_export: false,
        include_discount_in_export: false,
        include_contingency_in_export: false,
        gst_total: Number(pricingSummary.gst.toFixed(2)),
        total_purchase_order_price: Number(pricingSummary.grandTotal.toFixed(2)),
      };

      if (persistedVariationIds.has(activeVariation.id)) {
        const { error: updateError } = await variationTable
          .update(payload)
          .eq("organization_id", organizationId)
          .eq("id", activeVariation.id);
        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        const { error: insertError } = await variationTable.insert(payload);
        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      const { error: deleteLineItemsError } = await lineItemsTable
        .delete()
        .eq("organization_id", organizationId)
        .eq("purchase_order_id", activeVariation.id);
      if (deleteLineItemsError) {
        throw new Error(deleteLineItemsError.message);
      }

      if (activeVariation.costLines.length > 0) {
        const lineItemsPayload = activeVariation.costLines.map((line, index) => ({
          id: line.id,
          organization_id: organizationId,
          project_id: dbProjectId,
          purchase_order_id: activeVariation.id,
          section: line.section,
          description: line.description,
          quantity: Number(line.quantity),
          unit: line.unit,
          rate: Number(line.rate),
          total: Number(lineTotal(line).toFixed(2)),
          sort_order: index,
        }));
        const { error: insertLineItemsError } = await lineItemsTable.insert(lineItemsPayload);
        if (insertLineItemsError) {
          throw new Error(insertLineItemsError.message);
        }
      }

      const { error: deleteAttachmentsError } = await attachmentsTable
        .delete()
        .eq("organization_id", organizationId)
        .eq("purchase_order_id", activeVariation.id);
      if (deleteAttachmentsError) {
        throw new Error(deleteAttachmentsError.message);
      }

      if (activeVariation.attachments.length > 0) {
        const attachmentsPayload = activeVariation.attachments.map((attachment) => ({
          id: attachment.id,
          organization_id: organizationId,
          project_id: dbProjectId,
          purchase_order_id: activeVariation.id,
          file_kind: attachment.type,
          file_name: attachment.name,
          external_url: `manual://${attachment.name}`,
          uploaded_by: session?.id ?? null,
        }));
        const { error: insertAttachmentsError } = await attachmentsTable.insert(attachmentsPayload);
        if (insertAttachmentsError) {
          throw new Error(insertAttachmentsError.message);
        }
      }

      const previousSavedStatus = savedStatusById.get(activeVariation.id);
      if (previousSavedStatus !== activeVariation.status) {
        const { error: insertStatusEventError } = await statusEventsTable.insert({
          organization_id: organizationId,
          project_id: dbProjectId,
          purchase_order_id: activeVariation.id,
          from_status: previousSavedStatus ?? null,
          to_status: activeVariation.status,
          changed_by: session?.id ?? null,
        });
        if (insertStatusEventError) {
          throw new Error(insertStatusEventError.message);
        }
      }

      if (activeVariation.invoiceReady) {
        const { error: upsertInvoiceItemError } = await invoiceItemsTable.upsert(
          {
            organization_id: organizationId,
            project_id: dbProjectId,
            purchase_order_id: activeVariation.id,
            amount: Number(pricingSummary.grandTotal.toFixed(2)),
            status: "Ready",
          },
          { onConflict: "purchase_order_id" }
        );
        if (upsertInvoiceItemError) {
          throw new Error(upsertInvoiceItemError.message);
        }
      } else {
        await invoiceItemsTable
          .delete()
          .eq("organization_id", organizationId)
          .eq("purchase_order_id", activeVariation.id);
      }

      setPersistedVariationIds((current) => new Set([...current, activeVariation.id]));
      setSavedStatusById((current) => {
        const next = new Map(current);
        next.set(activeVariation.id, activeVariation.status);
        return next;
      });
      setVariations((current) =>
        current.map((item) => (item.id === activeVariation.id ? { ...item, totalPrice: Number(pricingSummary.grandTotal.toFixed(2)) } : item))
      );
      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save purchase order.");
    } finally {
      setIsSaving(false);
    }
  };

  const exportVariationPdf = useCallback(() => {
    if (typeof window === "undefined" || !activeVariation) {
      return;
    }

    const lineItemsRows = activeVariation.costLines.length > 0
      ? activeVariation.costLines
          .map((line) => {
            const description = line.description.trim() || "Untitled line item";
            return `
              <tr>
                <td>${escapeHtml(description)}</td>
                <td>${escapeHtml(line.section)}</td>
                <td class="right">${line.quantity}</td>
                <td>${escapeHtml(line.unit || "-")}</td>
                <td class="right">${toMoney(line.rate)}</td>
                <td class="right">${toMoney(lineTotal(line))}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="6" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = (routeProjectSlug ?? "").replaceAll("-", " ") || "Project";
    const printableNumber = activeVariation.code || "Unassigned";
    const printableTitle = activeVariation.title.trim() || "Purchase Order";
    const issuedDate = toDayMonthYearLabel(activeVariation.requestedDate || new Date().toISOString().slice(0, 10));
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;

    const notesMarkup = activeVariation.notes.trim()
      ? escapeHtml(activeVariation.notes).replaceAll("\n", "<br />")
      : "No notes added.";
    const attachmentsRows = activeVariation.attachments.length > 0
      ? activeVariation.attachments
          .map(
            (attachment) =>
              `<tr><td>${escapeHtml(attachment.name || "-")}</td><td>${escapeHtml(attachment.type || "-")}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="text-align:center;color:#64748b;">No attachments added.</td></tr>`;

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
      .notes-box {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px;
        color: var(--text);
        background: #fff;
      }
      .attachments-table th { width: 50%; }
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
            <div class="row"><dt>Purchase Order #</dt><dd>${escapeHtml(printableNumber)}</dd></div>
            <div class="row"><dt>Issued</dt><dd>${escapeHtml(issuedDate)}</dd></div>
            <div class="row"><dt>Status</dt><dd>${escapeHtml(activeVariation.status)}</dd></div>
          </dl>
        </div>
      </header>

      <section class="title-block">
        <h1 class="quote-title">${escapeHtml(printableTitle)}</h1>
      </section>

      <section class="details">
        <div class="details-grid">
          <div class="details-row"><span class="k">Project</span><span class="v">${escapeHtml(printableProjectName || "-")}</span></div>
          <div class="details-row"><span class="k">PO Type</span><span class="v">${escapeHtml(activeVariation.origin || "-")}</span></div>
          <div class="details-row"><span class="k">Issued To</span><span class="v">${escapeHtml(activeVariation.issuedToLabel || "-")}</span></div>
          <div class="details-row"><span class="k">Raised By</span><span class="v">${escapeHtml(activeVariation.requestedBy || "-")}</span></div>
          <div class="details-row"><span class="k">Supplier Contact</span><span class="v">${escapeHtml(activeVariation.supplierContact || "-")}</span></div>
          <div class="details-row"><span class="k">Requested</span><span class="v">${escapeHtml(toDayMonthYearLabel(activeVariation.requestedDate))}</span></div>
          <div class="details-row"><span class="k">Required By</span><span class="v">${escapeHtml(toDayMonthYearLabel(activeVariation.dueDate))}</span></div>
          <div class="details-row"><span class="k">Approved</span><span class="v">${escapeHtml(toDayMonthYearLabel(activeVariation.approvedAt))}</span></div>
        </div>
      </section>

      <h2 class="section-title">Cost Build-Up</h2>
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

      <h2 class="section-title">Attachments</h2>
      <table class="attachments-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>${attachmentsRows}</tbody>
      </table>

      <h2 class="section-title">Notes</h2>
      <section class="notes-box">${notesMarkup}</section>

      <section class="totals">
        <div class="row"><span class="k">Subtotal</span><span class="v">${toMoney(pricingSummary.baseSubtotal)}</span></div>
        <div class="row"><span class="k">GST</span><span class="v">${toMoney(pricingSummary.gst)}</span></div>
        <div class="divider final">
          <div class="row"><span class="k">Total</span><span class="v">${toMoney(pricingSummary.grandTotal)}</span></div>
        </div>
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
    organizationName,
    pricingSummary.baseSubtotal,
    pricingSummary.grandTotal,
    pricingSummary.gst,
    routeProjectSlug,
  ]);

  if (isLoadingVariations) {
    return (
      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardContent className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading purchase orders...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          asChild
          className={`${interMedium.className} h-8 rounded-[8px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
        >
          <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Purchase Order Register
          </Link>
        </Button>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Purchase Order Register</h1>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Create, track, price, approve, and invoice project purchase orders in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void createPurchaseOrder()} variant="outline" className={`${interMedium.className} h-10 rounded-[10px] border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}>
                <Plus className="mr-1 h-4 w-4" />
                New Purchase Order
              </Button>
              <Button
                type="button"
                onClick={saveVariation}
                disabled={isSaving}
                className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
              >
                {isSaving ? "Saving..." : "Save Purchase Order"}
              </Button>
              <Button
                type="button"
                onClick={exportVariationPdf}
                variant="outline"
                className={`${interMedium.className} h-10 rounded-[10px] border-[#d3dbe8] bg-white px-4 text-sm font-medium text-[#1d2433] hover:bg-[#F8FAFC]`}
              >
                Export PDF
              </Button>
            </div>
          </div>
          {error ? (
            <p className={`${interMedium.className} mt-4 rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
          ) : null}
          {saveMessage ? <p className={`${interMedium.className} mt-2 text-xs font-medium text-[#5f6f89]`}>{saveMessage}</p> : null}
        </CardHeader>
      </Card>

      {hasVariations && activeVariation ? (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[12px] border border-[#E6EAF0] bg-white px-5 py-4">
          <section className="border-b border-[#E8EDF5] pb-5">
            <button type="button" onClick={() => setIsRegisterOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Purchase Order Register</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isRegisterOpen ? "rotate-180" : ""}`} />
            </button>

            {isRegisterOpen ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-[10px] border border-[#E5EAF2] overflow-hidden">
                  <div className={`${interMedium.className} grid grid-cols-[120px_minmax(190px,1fr)_130px_140px] gap-2 bg-[#F8FAFC] px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] text-[#607089]`}>
                    <span>Code</span><span>Purchase Order</span><span>Status</span><span className="text-right">Value</span>
                  </div>
                  <div className="divide-y divide-[#EEF2F7]">
                    {variations.map((variation) => {
                      const total = variation.id === activeVariation.id ? pricingSummary.grandTotal : Number(variation.totalPrice ?? 0);
                      const isActive = variation.id === activeVariation.id;
                      return (
                        <div
                          key={variation.id}
                          onClick={() => {
                            setActiveVariationId(variation.id);
                            router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${variation.id}`);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActiveVariationId(variation.id);
                              router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${variation.id}`);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`grid w-full cursor-pointer grid-cols-[120px_minmax(190px,1fr)_130px_140px] items-center gap-2 px-3 py-2 text-left transition-colors ${isActive ? "bg-[#F8FBFF]" : "hover:bg-[#f8fafc]"}`}
                        >
                          <span className={`${interMedium.className} text-xs font-semibold tracking-[0.06em] text-[#475569]`}>{variation.code}</span>
                          <span className="text-sm text-[#0F172A]">{variation.title || "—"}</span>
                          <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${statusClassName(variation.status)}`}>{variation.status}</span>
                          <span className="flex items-center justify-end gap-2">
                            <span className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(total)}</span>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void deletePurchaseOrder(variation.id);
                              }}
                              className="h-10 w-10 rounded-[8px] border-[#d6dfeb] bg-white p-0 text-[#9AA8BC] hover:bg-[#F8FAFC] hover:text-[#64748B]"
                              aria-label={`Delete purchase order ${variation.code}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Purchase Order Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Purchase order title</label>
                  <Input value={activeVariation.title} onChange={(event) => updateActiveVariation("title", event.target.value)} className="h-10 rounded-[8px]" />
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Status</label>
                  <select value={activeVariation.status} onChange={(event) => setStatus(event.target.value as VariationStatus)} className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d1d9e6] bg-white px-3 text-sm text-[#1d2433]`}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Purchase Order Number</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[8px] bg-[#f8fafc]" /></div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>PO Type</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d1d9e6] bg-white px-3 text-sm text-[#1d2433]`}>
                    {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Raised By</label><Input value={activeVariation.requestedBy} onChange={(event) => updateActiveVariation("requestedBy", event.target.value)} className="h-10 rounded-[8px]" /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Issued To</label>
                  <select
                    value={activeVariation.issuedToSupplierId}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      updateActiveVariation("issuedToSupplierId", nextValue);
                      if (nextValue === NEW_SUPPLIER_OPTION) {
                        updateActiveVariation("issuedToLabel", "");
                        return;
                      }
                      const selected = suppliers.find((supplier) => supplier.id === nextValue);
                      if (selected) {
                        updateActiveVariation("issuedToLabel", supplierDisplayName(selected));
                      }
                    }}
                    className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d1d9e6] bg-white px-3 text-sm text-[#1d2433]`}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplierDisplayName(supplier)}
                      </option>
                    ))}
                    <option value={NEW_SUPPLIER_OPTION}>Add new supplier</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Supplier Contact</label>
                  <Input value={activeVariation.supplierContact} onChange={(event) => updateActiveVariation("supplierContact", event.target.value)} className="h-10 rounded-[8px]" placeholder="Contact name, email, or phone" />
                </div>
              </div>

              {activeVariation.issuedToSupplierId === NEW_SUPPLIER_OPTION ? (
                <div className="rounded-[10px] border border-[#d7deea] bg-[#f8faff] p-3">
                  <p className={`${interMedium.className} mb-3 text-sm font-semibold text-[#1d2433]`}>Add New Supplier</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Contact Name</label>
                      <Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} className="h-10 rounded-[8px]" placeholder="Account contact or trading name" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Company name</label>
                      <Input value={newSupplierCompanyName} onChange={(event) => setNewSupplierCompanyName(event.target.value)} className="h-10 rounded-[8px]" placeholder="Supplier company" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Email</label>
                      <Input type="email" value={newSupplierEmail} onChange={(event) => setNewSupplierEmail(event.target.value)} className="h-10 rounded-[8px]" placeholder="accounts@supplier.com" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Phone</label>
                      <Input value={newSupplierPhone} onChange={(event) => setNewSupplierPhone(event.target.value)} className="h-10 rounded-[8px]" placeholder="+64 21 123 4567" />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Requested Date</label><Input type="date" value={activeVariation.requestedDate} onChange={(event) => updateActiveVariation("requestedDate", event.target.value)} className="h-10 rounded-[8px]" /></div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Required By</label><Input type="date" value={activeVariation.dueDate} onChange={(event) => updateActiveVariation("dueDate", event.target.value)} className="h-10 rounded-[8px]" /></div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Invoice Status</label>
                  <select
                    value={activeVariation.status === "Invoiced" ? "Invoiced" : activeVariation.invoiceReady ? "Ready to Invoice" : "Not Ready"}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "Invoiced") {
                        updateActiveVariation("invoiceReady", true);
                        setStatus("Invoiced");
                        return;
                      }
                      if (next === "Ready to Invoice") {
                        updateActiveVariation("invoiceReady", true);
                        if (activeVariation.status === "Invoiced") {
                          setStatus("Issued");
                        }
                        return;
                      }
                      updateActiveVariation("invoiceReady", false);
                      if (activeVariation.status === "Invoiced") {
                        setStatus("Issued");
                      }
                    }}
                    className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d1d9e6] bg-white px-3 text-sm text-[#1d2433]`}
                  >
                    <option value="Not Ready">Not Ready</option>
                    <option value="Ready to Invoice">Ready to Invoice</option>
                    <option value="Invoiced">Invoiced</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-[#E8EDF5] py-5">
            <button type="button" onClick={() => setIsCostBuildUpOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Cost Build-Up</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isCostBuildUpOpen ? "rotate-180" : ""}`} />
            </button>

            {isCostBuildUpOpen ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => addCostLine("Labour")} className={`${interMedium.className} h-9 rounded-[8px] bg-[#F74917] px-3 text-xs font-medium text-white hover:bg-[#e63f10]`}><Plus className="mr-1 h-4 w-4" />Add Cost Line</Button>
                </div>

                <div className="rounded-[10px] border border-[#E5EAF2] overflow-visible">
                  <div className={`${interMedium.className} grid items-center gap-2 bg-[#F8FAFC] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.1em] text-[#607089]`} style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}>
                    <span>Description</span><span>Section</span><span>Qty</span><span>Unit</span><span>Rate</span><span className="text-right">Total</span>
                  </div>

                  <div className="divide-y divide-[#EEF2F7]">
                    {activeVariation.costLines.map((line) => (
                      <div key={line.id} className="group grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}>
                        <DescriptionInputWithPreview
                          value={line.description}
                          onChange={(value) => updateCostLine(line.id, "description", value)}
                        />
                        <select value={line.section} onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)} className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#d6dfeb] bg-white px-2 text-sm text-[#1d2433]`}>
                          {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                        </select>
                        <Input type="number" value={line.quantity} onChange={(event) => updateCostLine(line.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[8px] px-2" />
                        <Input value={line.unit} onChange={(event) => updateCostLine(line.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[8px] px-2" />
                        <div className="relative w-[100px]">
                          <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                          <Input type="number" value={line.rate === 0 ? "" : line.rate} onChange={(event) => updateCostLine(line.id, "rate", numberOrZero(event.target.value))} className="h-10 w-[100px] rounded-[8px] pl-6 pr-2" />
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineTotal(line))}</div>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeCostLine(line.id)}
                            className="h-8 w-8 rounded-[8px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
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
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Attachments & Notes</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isDocsOpen ? "rotate-180" : ""}`} />
            </button>

            {isDocsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => addAttachment("Drawing")} className={`${interMedium.className} h-9 rounded-[8px] border-[#d3dbe8] bg-white px-3 text-xs font-medium text-[#1d2433]`}><Upload className="mr-1 h-4 w-4" />Attach Drawing</Button>
                  <Button type="button" variant="outline" onClick={() => addAttachment("Email")} className={`${interMedium.className} h-9 rounded-[8px] border-[#d3dbe8] bg-white px-3 text-xs font-medium text-[#1d2433]`}><Mail className="mr-1 h-4 w-4" />Attach Email</Button>
                  <Button type="button" variant="outline" onClick={() => addAttachment("Site Instruction")} className={`${interMedium.className} h-9 rounded-[8px] border-[#d3dbe8] bg-white px-3 text-xs font-medium text-[#1d2433]`}><Clock3 className="mr-1 h-4 w-4" />Attach SI</Button>
                </div>

                <div className="rounded-[10px] border border-[#E5EAF2] bg-[#FAFCFF] px-3 py-3">
                  <p className={`${interMedium.className} mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Linked Documentation</p>
                  <div className="space-y-2">
                    {activeVariation.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E5EAF2] bg-white px-3 py-2">
                        <span className={`${interMedium.className} min-w-0 flex-1 truncate text-sm text-[#1D2433]`}>{attachment.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#EEF3FA] px-2 py-1 text-[11px] font-semibold text-[#4A5D78]">{attachment.type}</span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeAttachment(attachment.id)}
                            className={`${interMedium.className} h-10 w-10 rounded-[8px] border-[#d6dfeb] bg-white p-0 text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1d2433]`}
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
                      className="h-8 w-8 rounded-[8px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]"
                      aria-label="Delete notes"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <textarea value={activeVariation.notes} onChange={(event) => updateActiveVariation("notes", event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[8px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="border-[#E6EAF0] bg-white shadow-none">
            <CardHeader className="pb-3 pt-5"><CardTitle className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">Purchase Order Status</CardTitle></CardHeader>
            <CardContent className="space-y-2 pb-5">
              <p className={`${interMedium.className} text-sm text-[#334155]`}>
                <span className="text-[#64748B]">Current:</span>{" "}
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClassName(activeVariation.status)}`}>{activeVariation.status}</span>
              </p>
              <div className={`${interMedium.className} space-y-1.5 text-xs text-[#52627A]`}>
                <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Requested: {activeVariation.requestedDate || "-"}</p>
                <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Issued: {activeVariation.clientSentAt || "-"}</p>
                <p className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" />Approved: {activeVariation.approvedAt || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E6EAF0] bg-white shadow-none">
            <CardHeader className="pb-3 pt-5"><CardTitle className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">Pricing Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 pb-5">
              <div className="grid gap-2">
                <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>GST (%)</label>
                <Input
                  type="number"
                  value={activeVariation.gstPercent}
                  onChange={(event) => updateActiveVariation("gstPercent", event.target.value)}
                  className="h-10 rounded-[8px]"
                />
              </div>

              <div className="h-px bg-[#E7ECF3]" />

              <div className={`${interMedium.className} space-y-1.5 text-sm font-medium text-[#334155]`}>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Subtotal</span><span>{toMoney(pricingSummary.baseSubtotal)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">GST</span><span>{toMoney(pricingSummary.gst)}</span></p>
                <p className="flex items-center justify-between"><span className="text-[#64748B]">Purchase Order Register Total</span><span>{toMoney(summary.totalValue)}</span></p>
              </div>
              <div className="rounded-[10px] bg-[#04234D] px-4 py-3 text-white">
                <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.08em] text-white/70`}>Total Purchase Order Price</p>
                <p className="mt-1 text-[32px] font-semibold leading-none">{toMoney(pricingSummary.grandTotal)}</p>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveVariation} disabled={isSaving} className={`${interMedium.className} h-10 w-full rounded-[10px] bg-[#F74917] text-sm font-medium text-white hover:bg-[#e63f10]`}>
                  {isSaving ? "Saving..." : "Save Purchase Order"}
                </Button>
                <Button type="button" onClick={exportVariationPdf} disabled={isSaving} variant="outline" className={`${interMedium.className} h-10 w-full rounded-[10px] border-[#d3dbe8] bg-white text-sm font-medium text-[#1d2433]`}>
                  Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      ) : (
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF3FA] text-[#29446E]">
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
              className={`${interMedium.className} mt-6 h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}
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
