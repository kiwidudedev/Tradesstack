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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
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

const STATUS_OPTIONS: VariationStatus[] = ["Draft", "Priced", "Sent", "Client Review", "Approved", "Rejected", "Invoiced"];
const ORIGIN_OPTIONS: VariationOrigin[] = ["Client Request", "Drawing Revision", "Site Instruction", "RFI", "Unknown"];
const COST_SECTIONS: CostSection[] = ["Labour", "Materials", "Subcontractors", "Plant", "Margin"];
const LINE_GRID_TEMPLATE = "minmax(220px, 1.6fr) 130px 78px 78px 110px 110px";
const VARIATION_ATTACHMENTS_BUCKET = "project-variation-attachments";

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
        className="h-10 min-w-[200px] rounded-[6px]"
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

export default function ProjectVariationsPage() {
  const params = useParams<{ projectId: string; variationId: string }>();
  const routeProjectSlug = params?.projectId;
  const routeVariationId = params?.variationId;
  const isNewVariationRoute = routeVariationId === "new";
  const router = useRouter();
  const { session } = useAuth();

  const [variations, setVariations] = useState<VariationItem[]>([]);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const [jobCode, setJobCode] = useState(() => deriveJobCode(routeProjectSlug));
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [isLoadingVariations, setIsLoadingVariations] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingVariation, setIsCreatingVariation] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistedVariationIds, setPersistedVariationIds] = useState<Set<string>>(new Set());
  const [savedStatusById, setSavedStatusById] = useState<Map<string, VariationStatus>>(new Map());
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
      const variationsTable = (supabase as any).from("project_variations");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineItemsTable = (supabase as any).from("project_variation_line_items");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentsTable = (supabase as any).from("project_variation_attachments");

        const { data: variationRowsRaw, error: variationError } = await variationsTable
          .select(
          "id, variation_number, variation_title, status, origin, requested_by, requested_date, due_date, sent_to_client_at, approved_at, invoice_ready, margin_percent, discount_amount, contingency_amount, gst_percent, include_margin_in_export, include_discount_in_export, include_contingency_in_export, notes, validity_period, payment_terms, lead_time, terms_inclusions, terms_exclusions, clarifications, assumptions"
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
      const [{ data: lineRowsRaw }, { data: attachmentRowsRaw }] = await Promise.all([
        lineItemsTable
          .select("id, variation_id, section, description, quantity, unit, rate")
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
      setSavedStatusById(new Map(hydratedVariations.map((item) => [item.id, item.status])));
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

  useEffect(() => {
    if (!routeVariationId || variations.length === 0) {
      return;
    }
    if (variations.some((variation) => variation.id === routeVariationId)) {
      setActiveVariationId(routeVariationId);
    }
  }, [routeVariationId, variations]);

  const summary = useMemo(() => {
    const totals = {
      totalValue: 0,
      draft: 0,
      awaitingClient: 0,
      approved: 0,
      invoiceReady: 0,
    };

    for (const variation of variations) {
      const variationTotal = variation.costLines.reduce((acc, line) => acc + lineTotal(line), 0);
      totals.totalValue += variationTotal;

      if (variation.status === "Draft") {
        totals.draft += 1;
      }
      if (variation.status === "Sent" || variation.status === "Client Review") {
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
      setSavedStatusById((current) => {
        const next = new Map(current);
        next.set(createdVariation.id, createdVariation.status);
        return next;
      });

      setActiveVariationId(createdVariation.id);
      router.replace(`/app/projects/${routeProjectSlug}/preconstruction/variations/${createdVariation.id}`);
    } catch (createVariationError) {
      setError(createVariationError instanceof Error ? createVariationError.message : "Unable to create variation.");
    } finally {
      setIsCreatingVariation(false);
    }
  }, [dbProjectId, isCreatingVariation, jobCode, organizationId, routeProjectSlug, router, supabase]);

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

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variationTable = (supabase as any).from("project_variations");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineItemsTable = (supabase as any).from("project_variation_line_items");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachmentsTable = (supabase as any).from("project_variation_attachments");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusEventsTable = (supabase as any).from("project_variation_status_events");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoiceItemsTable = (supabase as any).from("project_variation_invoice_items");

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

      const payload = {
        id: activeVariation.id,
        organization_id: organizationId,
        project_id: dbProjectId,
        created_by: session?.id,
        variation_title: activeVariation.title.trim() || activeVariation.code,
        variation_number: activeVariation.code,
        status: activeVariation.status,
        origin: activeVariation.origin,
        requested_by: activeVariation.requestedBy,
        requested_date: activeVariation.requestedDate || null,
        due_date: activeVariation.dueDate || null,
        sent_to_client_at: activeVariation.clientSentAt || null,
        approved_at: activeVariation.approvedAt || null,
        invoice_ready: activeVariation.invoiceReady,
        notes: activeVariation.notes,
        labour_total: Number(sectionTotals.Labour.toFixed(2)),
        materials_total: Number(sectionTotals.Materials.toFixed(2)),
        subcontractors_total: Number(sectionTotals.Subcontractors.toFixed(2)),
        plant_total: Number(sectionTotals.Plant.toFixed(2)),
        margin_total: Number(sectionTotals.Margin.toFixed(2)),
        subtotal: Number(pricingSummary.baseSubtotal.toFixed(2)),
        margin_percent: Number(numberOrZero(activeVariation.marginPercent).toFixed(3)),
        discount_amount: Number(numberOrZero(activeVariation.discountAmount).toFixed(2)),
        contingency_amount: Number(numberOrZero(activeVariation.contingencyAmount).toFixed(2)),
        gst_percent: Number(numberOrZero(activeVariation.gstPercent).toFixed(3)),
        include_margin_in_export: activeVariation.includeMarginInExport,
        include_discount_in_export: activeVariation.includeDiscountInExport,
        include_contingency_in_export: activeVariation.includeContingencyInExport,
        validity_period: activeVariation.validityPeriod,
        payment_terms: activeVariation.paymentTerms,
        lead_time: activeVariation.leadTime,
        terms_inclusions: activeVariation.inclusions,
        terms_exclusions: activeVariation.exclusions,
        clarifications: activeVariation.clarifications,
        assumptions: activeVariation.assumptions,
        gst_total: Number(pricingSummary.gst.toFixed(2)),
        total_variation_price: Number(pricingSummary.grandTotal.toFixed(2)),
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
        .eq("variation_id", activeVariation.id);
      if (deleteLineItemsError) {
        throw new Error(deleteLineItemsError.message);
      }

      if (activeVariation.costLines.length > 0) {
        const lineItemsPayload = activeVariation.costLines.map((line, index) => ({
          id: line.id,
          organization_id: organizationId,
          project_id: dbProjectId,
          variation_id: activeVariation.id,
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
        .eq("variation_id", activeVariation.id);
      if (deleteAttachmentsError) {
        throw new Error(deleteAttachmentsError.message);
      }

      if (activeVariation.attachments.length > 0) {
        const attachmentsPayload = activeVariation.attachments.map((attachment) => ({
          id: attachment.id,
          organization_id: organizationId,
          project_id: dbProjectId,
          variation_id: activeVariation.id,
          file_kind: attachment.type,
          file_name: attachment.name,
          storage_path: attachment.storagePath,
          external_url: attachment.externalUrl,
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
          variation_id: activeVariation.id,
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
            variation_id: activeVariation.id,
            amount: Number(pricingSummary.grandTotal.toFixed(2)),
            status: "Ready",
          },
          { onConflict: "variation_id" }
        );
        if (upsertInvoiceItemError) {
          throw new Error(upsertInvoiceItemError.message);
        }
      } else {
        await invoiceItemsTable
          .delete()
          .eq("organization_id", organizationId)
          .eq("variation_id", activeVariation.id);
      }

      setPersistedVariationIds((current) => new Set([...current, activeVariation.id]));
      setSavedStatusById((current) => {
        const next = new Map(current);
        next.set(activeVariation.id, activeVariation.status);
        return next;
      });
      setSaveMessage(`Last saved ${new Date().toLocaleTimeString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save variation.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteVariation = useCallback(async (variationId: string) => {
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
      setSavedStatusById((current) => {
        const next = new Map(current);
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
  }, [organizationId, persistedVariationIds, routeProjectSlug, router, supabase, variations]);

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
            return `
              <tr>
                <td>${escapeHtml(description)}</td>
                <td>${escapeHtml(line.section)}</td>
                <td class="right">${line.quantity}</td>
                <td>${escapeHtml(line.unit || "-")}</td>
                <td class="right">${toMoney(exportedRate)}</td>
                <td class="right">${toMoney(exportedLineTotal)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="6" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

    const printableOrgName = organizationName.trim() || "Tradesstack";
    const printableProjectName = (routeProjectSlug ?? "").replaceAll("-", " ") || "Project";
    const printableNumber = activeVariation.code || "Unassigned";
    const printableTitle = activeVariation.title.trim() || "Variation";
    const issuedDate = toDayMonthYearLabel(activeVariation.requestedDate || new Date().toISOString().slice(0, 10));
    const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
    const logoMarkup = organizationLogoUrl
      ? `<img src="${escapeHtml(organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
      : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;

    const discountRowForExport = activeVariation.includeDiscountInExport
      ? `<div class="row"><span class="k">Discount</span><span class="v">-${toMoney(pricingSummary.discount)}</span></div>`
      : "";
    const contingencyRowForExport = activeVariation.includeContingencyInExport
      ? `<div class="row"><span class="k">P&G</span><span class="v">${toMoney(pricingSummary.contingency)}</span></div>`
      : "";
    const markUpRowForExport = showMarginBreakout
      ? `<div class="row"><span class="k">Mark up</span><span class="v">${toMoney(pricingSummary.margin)}</span></div>`
      : "";
    const subtotalExcludingGstForExport = showMarginBreakout
      ? pricingSummary.baseSubtotal
      : pricingSummary.baseSubtotal + pricingSummary.margin;
    const totalIncludingMarginForExport = pricingSummary.baseSubtotal + pricingSummary.margin;
    const totalIncludingMarginRowForExport = showMarginBreakout
      ? `<div class="row"><span class="k">Total (incl. margin)</span><span class="v">${toMoney(totalIncludingMarginForExport)}</span></div>`
      : "";
    const notesMarkup = activeVariation.notes.trim()
      ? escapeHtml(activeVariation.notes).replaceAll("\n", "<br />")
      : "No notes added.";
    const validityPeriodMarkup = escapeHtml(activeVariation.validityPeriod.trim() || "Not provided");
    const paymentTermsMarkup = escapeHtml(activeVariation.paymentTerms.trim() || "Not provided");
    const leadTimeMarkup = escapeHtml(activeVariation.leadTime.trim() || "Not provided");
    const inclusionsMarkup = escapeHtml(activeVariation.inclusions.trim() || "No inclusions captured.").replaceAll("\n", "<br />");
    const exclusionsMarkup = escapeHtml(activeVariation.exclusions.trim() || "No exclusions captured.").replaceAll("\n", "<br />");
    const clarificationsMarkup = escapeHtml(activeVariation.clarifications.trim() || "No clarifications captured.").replaceAll("\n", "<br />");
    const assumptionsMarkup = escapeHtml(activeVariation.assumptions.trim() || "No assumptions captured.").replaceAll("\n", "<br />");
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
      .totals .row-divider { border-top: 1px solid #CBD5E1; margin: 4px 0; }
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
      .terms-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 8px;
      }
      .terms-grid.two-col {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .term-card {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 10px;
        background: #fff;
      }
      .term-card .k {
        margin: 0 0 4px;
        color: var(--muted);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
      }
      .term-card .v {
        margin: 0;
        color: var(--text);
        font-weight: 600;
      }
      .term-card .v.multiline {
        white-space: normal;
        font-weight: 500;
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
            <div class="row"><dt>Variation #</dt><dd>${escapeHtml(printableNumber)}</dd></div>
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
          <div class="details-row"><span class="k">Origin</span><span class="v">${escapeHtml(activeVariation.origin || "-")}</span></div>
          <div class="details-row"><span class="k">Requested by</span><span class="v">${escapeHtml(activeVariation.requestedBy || "-")}</span></div>
          <div class="details-row"><span class="k">Requested</span><span class="v">${escapeHtml(toDayMonthYearLabel(activeVariation.requestedDate))}</span></div>
          <div class="details-row"><span class="k">Due</span><span class="v">${escapeHtml(toDayMonthYearLabel(activeVariation.dueDate))}</span></div>
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

      <section class="totals">
        ${discountRowForExport}
        ${contingencyRowForExport}
        <div class="row-divider"></div>
        <div class="row"><span class="k">Subtotal (excl. GST)</span><span class="v">${toMoney(subtotalExcludingGstForExport)}</span></div>
        ${markUpRowForExport ? '<div class="row-divider"></div>' : ''}
        ${markUpRowForExport}
        ${totalIncludingMarginRowForExport ? '<div class="row-divider"></div>' : ''}
        ${totalIncludingMarginRowForExport}
        <div class="row-divider"></div>
        <div class="row"><span class="k">GST (${escapeHtml(activeVariation.gstPercent.trim() || "15")}%)</span><span class="v">${toMoney(pricingSummary.gst)}</span></div>
        <div class="divider final">
          <div class="row"><span class="k">Total (incl. GST)</span><span class="v">${toMoney(pricingSummary.grandTotal)}</span></div>
        </div>
      </section>

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

      <h2 class="section-title">Terms & Clarifications</h2>
      <section class="terms-grid">
        <div class="term-card">
          <p class="k">Validity period</p>
          <p class="v">${validityPeriodMarkup}</p>
        </div>
        <div class="term-card">
          <p class="k">Payment terms</p>
          <p class="v">${paymentTermsMarkup}</p>
        </div>
        <div class="term-card">
          <p class="k">Lead time</p>
          <p class="v">${leadTimeMarkup}</p>
        </div>
      </section>
      <section class="terms-grid two-col">
        <div class="term-card">
          <p class="k">Inclusions</p>
          <p class="v multiline">${inclusionsMarkup}</p>
        </div>
        <div class="term-card">
          <p class="k">Exclusions</p>
          <p class="v multiline">${exclusionsMarkup}</p>
        </div>
      </section>
      <section class="terms-grid two-col">
        <div class="term-card">
          <p class="k">Clarifications</p>
          <p class="v multiline">${clarificationsMarkup}</p>
        </div>
        <div class="term-card">
          <p class="k">Assumptions</p>
          <p class="v multiline">${assumptionsMarkup}</p>
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
    pricingSummary.contingency,
    pricingSummary.discount,
    pricingSummary.grandTotal,
    pricingSummary.gst,
    pricingSummary.margin,
    routeProjectSlug,
  ]);

  if (isLoadingVariations) {
    return (
      <div className={`${styles.scope} -mb-8 space-y-6`}>
        <section className={styles.heroBlock}>
          <div>
            <h1 className={styles.heroTitle}>Variation</h1>
            <p className={`${interMedium.className} ${styles.heroSummary}`}>
              Manage pricing changes and approvals for this job
            </p>
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
              <p className={`${interMedium.className} pt-2 text-sm font-medium text-[#64748B]`}>Loading variations...</p>
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
          <h1 className={styles.heroTitle}>Variation</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Manage pricing changes and approvals for this job
          </p>
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
            <DropdownMenuContent side="top" align="end" sideOffset={8} className={`${styles.menuPanel} !z-[200] min-w-[230px] !bg-[#F3F4F6] p-1.5 opacity-100`}>
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Variation Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void createVariation();
                }}
                disabled={isCreatingVariation}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                <Plus className="mr-2 h-4 w-4" />
                {isCreatingVariation ? "Creating..." : "New Variation"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void saveVariation();
                }}
                disabled={isSaving}
                className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]"
              >
                {isSaving ? "Saving..." : "Save Variation"}
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
                      void deleteVariation(activeVariation.id);
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] [&_input]:bg-[#F8F9FC] [&_select]:bg-[#F8F9FC] [&_textarea]:bg-[#F8F9FC]">
        <div className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] px-5 py-5 sm:px-6">
          <section className="border-b border-[#E8EDF5] pb-5">
            <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Variation Details</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Variation title</label>
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
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Variation code</label><Input value={activeVariation.code} readOnly className="h-10 rounded-[6px] bg-[#f8fafc]" /></div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Origin</label>
                  <select value={activeVariation.origin} onChange={(event) => updateActiveVariation("origin", event.target.value as VariationOrigin)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3 text-sm text-[#1d2433]`}>
                    {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Requested by</label><Input value={activeVariation.requestedBy} onChange={(event) => updateActiveVariation("requestedBy", event.target.value)} className="h-10 rounded-[6px]" /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Requested date</label><Input type="date" value={activeVariation.requestedDate} onChange={(event) => updateActiveVariation("requestedDate", event.target.value)} className="h-10 rounded-[6px]" /></div>
                <div className="space-y-1.5"><label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Due date</label><Input type="date" value={activeVariation.dueDate} onChange={(event) => updateActiveVariation("dueDate", event.target.value)} className="h-10 rounded-[6px]" /></div>
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Invoice ready</label>
                  <button type="button" onClick={() => updateActiveVariation("invoiceReady", !activeVariation.invoiceReady)} className={`flex h-10 w-full items-center justify-between rounded-[6px] border px-3 text-sm ${activeVariation.invoiceReady ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d1d9e6] bg-[#F8F9FC] text-[#334155]"}`}>
                    <span className={interMedium.className}>{activeVariation.invoiceReady ? "Ready for invoice" : "Not ready"}</span>
                    <Check className="h-4 w-4" />
                  </button>
                </div>
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
                        />
                        <select value={line.section} onChange={(event) => updateCostLine(line.id, "section", event.target.value as CostSection)} className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-2 text-sm text-[#1d2433]`}>
                          {COST_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                        </select>
                        <Input type="number" value={line.quantity} onChange={(event) => updateCostLine(line.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[6px] px-2" />
                        <Input value={line.unit} onChange={(event) => updateCostLine(line.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[6px] px-2" />
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

          <section className="border-b border-[#E8EDF5] py-5">
            <button type="button" onClick={() => setIsTermsOpen((current) => !current)} className="flex w-full items-center justify-between">
              <h2 className={`${interMedium.className} ${styles.sectionTitle}`}>Terms & Clarifications</h2>
              <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isTermsOpen ? "rotate-180" : ""}`} />
            </button>
            {isTermsOpen ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Validity period</label>
                    <Input value={activeVariation.validityPeriod} onChange={(event) => updateActiveVariation("validityPeriod", event.target.value)} className="h-10 rounded-[6px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Payment terms</label>
                    <Input value={activeVariation.paymentTerms} onChange={(event) => updateActiveVariation("paymentTerms", event.target.value)} className="h-10 rounded-[6px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Lead time</label>
                    <Input value={activeVariation.leadTime} onChange={(event) => updateActiveVariation("leadTime", event.target.value)} className="h-10 rounded-[6px]" />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Inclusions</label>
                    <textarea value={activeVariation.inclusions} onChange={(event) => updateActiveVariation("inclusions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Exclusions</label>
                    <textarea value={activeVariation.exclusions} onChange={(event) => updateActiveVariation("exclusions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Clarifications</label>
                    <textarea value={activeVariation.clarifications} onChange={(event) => updateActiveVariation("clarifications", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Assumptions</label>
                    <textarea value={activeVariation.assumptions} onChange={(event) => updateActiveVariation("assumptions", event.target.value)} className={`${interMedium.className} min-h-[90px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
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
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Drawing")} className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}><Upload className="mr-1 h-4 w-4" />Attach Drawing</Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Email")} className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}><Mail className="mr-1 h-4 w-4" />Attach Email</Button>
                  <Button type="button" variant="outline" onClick={() => openAttachmentPicker("Site Instruction")} className={`${interMedium.className} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3 text-xs font-medium text-[#1d2433]`}><Clock3 className="mr-1 h-4 w-4" />Attach SI</Button>
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
                    <label className={`${interMedium.className} block text-xs font-medium text-[#64748B]`}>Variation notes</label>
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
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Mark up (%)</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateActiveVariation("includeMarginInExport", !activeVariation.includeMarginInExport)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      activeVariation.includeMarginInExport
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
                    }`}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Include
                  </Button>
                </div>
                <Input
                  type="number"
                  value={activeVariation.marginPercent === "0" ? "" : activeVariation.marginPercent}
                  onChange={(event) => updateActiveVariation("marginPercent", event.target.value)}
                  className="h-10 rounded-[6px]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Discount</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateActiveVariation("includeDiscountInExport", !activeVariation.includeDiscountInExport)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      activeVariation.includeDiscountInExport
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
                    }`}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Include
                  </Button>
                </div>
                <Input
                  type="number"
                  value={activeVariation.discountAmount === "0" ? "" : activeVariation.discountAmount}
                  onChange={(event) => updateActiveVariation("discountAmount", event.target.value)}
                  className="h-10 rounded-[6px]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>P&G</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateActiveVariation("includeContingencyInExport", !activeVariation.includeContingencyInExport)}
                    className={`${interMedium.className} h-6 rounded-[6px] px-2 text-[11px] ${
                      activeVariation.includeContingencyInExport
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
                    }`}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Include
                  </Button>
                </div>
                <Input
                  type="number"
                  value={activeVariation.contingencyAmount === "0" ? "" : activeVariation.contingencyAmount}
                  onChange={(event) => updateActiveVariation("contingencyAmount", event.target.value)}
                  className="h-10 rounded-[6px]"
                />
              </div>
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
                <p className="flex items-center justify-between"><span className="text-[#64748B]">GST ({activeVariation.gstPercent.trim() || "15"}%)</span><span>{toMoney(pricingSummary.gst)}</span></p>
              </div>
              <div className="rounded-[6px] border-2 border-[#C9D6E3] bg-[#F6F7F9] px-4 py-3">
                <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4D617A]`}>Total Variation Price (incl. GST)</p>
                <p className="mt-[11px] text-[34px] font-semibold leading-none tracking-[-0.02em] text-[#0B2739]">{toMoney(pricingSummary.grandTotal)}</p>
              </div>

              <div className="space-y-2 pt-1">
                <Button type="button" onClick={saveVariation} disabled={isSaving} className={`${interMedium.className} h-10 w-full rounded-full bg-[#0B2739] text-sm font-medium text-white hover:bg-[#0B2739]`}>
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
            </CardContent>
          </Card>
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
