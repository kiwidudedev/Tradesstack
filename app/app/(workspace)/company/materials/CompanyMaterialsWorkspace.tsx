"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  FileWarning,
  Package2,
  Plus,
  Search,
  TrendingUp,
  Upload,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { OperationalToolbar } from "@/components/app/OperationalToolbar";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMaterialDate, formatMaterialMoney } from "@/lib/materials/normalization";
import type { MaterialLibraryPageData } from "@/lib/materials/queries";
import type {
  MaterialImportRowAction,
  OrganizationMaterialImportBatchRow,
  OrganizationMaterialImportRowRow,
  OrganizationMaterialRow,
} from "@/lib/materials/types";
import type {
  MaterialDraftInput,
  MaterialImportReviewDraft,
  MaterialSupplierPriceDraftInput,
} from "@/lib/materials/validation";
import { cn } from "@/lib/utils";
import {
  addMaterialSupplierPriceAction,
  archiveMaterialAction,
  createMaterialWithInitialSupplierPriceAction,
  makeMaterialSupplierPricePreferredAction,
  updateMaterialAction,
} from "./actions";

type CompanyMaterialsWorkspaceProps = {
  organizationId: string;
  canWrite: boolean;
  initialData: MaterialLibraryPageData;
};

type MaterialStatusFilter = "All" | "Needs Review" | "Preferred" | "Recently Updated" | "Archived";

type MaterialFormState = {
  name: string;
  description: string;
  defaultUnit: string;
  category: string;
  organizationCostCodeId: string;
  isActive: boolean;
};

type SupplierPriceFormState = {
  supplierId: string;
  supplierDescription: string;
  unit: string;
  unitCost: string;
  currency: string;
  isPreferred: boolean;
};

type SupplierPriceModalMode = "create" | "update";

type InlineMaterialRowState = {
  name: string;
  supplierId: string;
  unit: string;
  unitCost: string;
  isPreferred: boolean;
};

type ImportReviewRowState = {
  id: string;
  action: MaterialImportRowAction;
  matchedMaterialId: string;
  reviewedName: string;
  reviewedDescription: string;
  reviewedUnit: string;
  reviewedUnitCost: string;
  reviewedCurrency: string;
  reviewedSupplierDescription: string;
  reviewedSupplierSku: string;
  status: string;
};

type MaterialDrawerStatus = "Confirmed" | "Needs Review" | "Classification Conflict" | "Archived";
type MaterialMappingState =
  | "Auto-mapped"
  | "User confirmed"
  | "Needs review"
  | "Missing mapping"
  | "Conflict";

const FIELD_SELECT_CLASS =
  "h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_TEXTAREA_CLASS =
  "flex min-h-[96px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_MATERIAL_FORM: MaterialFormState = {
  name: "",
  description: "",
  defaultUnit: "",
  category: "",
  organizationCostCodeId: "",
  isActive: true,
};

const EMPTY_PRICE_FORM: SupplierPriceFormState = {
  supplierId: "",
  supplierDescription: "",
  unit: "",
  unitCost: "",
  currency: "NZD",
  isPreferred: true,
};

const EMPTY_INLINE_MATERIAL_ROW: InlineMaterialRowState = {
  name: "",
  supplierId: "",
  unit: "",
  unitCost: "",
  isPreferred: true,
};

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
    </label>
  );
}

function buildMaterialFormState(material: OrganizationMaterialRow | null): MaterialFormState {
  if (!material) {
    return EMPTY_MATERIAL_FORM;
  }

  return {
    name: material.name,
    description: material.description ?? "",
    defaultUnit: material.default_unit,
    category: material.category ?? "",
    organizationCostCodeId: material.organization_cost_code_id ?? "",
    isActive: material.is_active,
  };
}

function toReviewRowState(row: OrganizationMaterialImportRowRow): ImportReviewRowState {
  return {
    id: row.id,
    action: (row.action as MaterialImportRowAction) === "pending" ? "create_material" : (row.action as MaterialImportRowAction),
    matchedMaterialId: row.matched_material_id ?? "",
    reviewedName: row.reviewed_name ?? row.extracted_name ?? "",
    reviewedDescription: row.reviewed_description ?? row.extracted_description ?? "",
    reviewedUnit: row.reviewed_unit ?? row.extracted_unit ?? "",
    reviewedUnitCost:
      typeof row.reviewed_unit_cost === "number"
        ? String(row.reviewed_unit_cost)
        : typeof row.extracted_unit_cost === "number"
          ? String(row.extracted_unit_cost)
          : "",
    reviewedCurrency: row.reviewed_currency ?? row.extracted_currency ?? "NZD",
    reviewedSupplierDescription:
      row.reviewed_supplier_description ?? row.supplier_description ?? row.extracted_description ?? "",
    reviewedSupplierSku: row.reviewed_supplier_sku ?? row.supplier_sku ?? "",
    status: row.status,
  };
}

function toStatusBadge(status: string) {
  switch (status) {
    case "Active":
      return "active" as const;
    case "Needs Review":
      return "pending" as const;
    case "Archived":
      return "draft" as const;
    case "approved":
      return "approved" as const;
    case "rejected":
      return "overdue" as const;
    default:
      return "draft" as const;
  }
}

function formatConfidencePercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${Math.round(value * 100)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatConstructionIntelligenceSummary(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const primary = [value.trade, value.subtrade, value.system, value.product]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" / ");
  const activity = [value.activity, value.likely_use]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" · ");

  if (!primary && !activity) {
    return null;
  }

  return activity ? `${primary || "Construction metadata"} · ${activity}` : primary;
}

function toConfidenceBadgeStatus(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "draft" as const;
  }

  if (value >= 0.75) {
    return "approved" as const;
  }

  if (value >= 0.5) {
    return "pending" as const;
  }

  return "overdue" as const;
}

function formatClassificationSource(value: string | null | undefined) {
  switch (value) {
    case "user_confirmed":
      return "User confirmed";
    case "imported":
      return "Imported";
    case "rules":
      return "Rules";
    case "manual":
      return "Manual";
    case "ai":
      return "AI assisted";
    default:
      return value ? value.replace(/_/g, " ") : "—";
  }
}

function toDrawerStatusBadge(status: MaterialDrawerStatus) {
  switch (status) {
    case "Confirmed":
      return "approved" as const;
    case "Needs Review":
      return "pending" as const;
    case "Classification Conflict":
      return "overdue" as const;
    case "Archived":
      return "draft" as const;
  }
}

function getMaterialDrawerStatus(material: OrganizationMaterialRow): MaterialDrawerStatus {
  const originalClassification =
    material.original_classification &&
    typeof material.original_classification === "object" &&
    !Array.isArray(material.original_classification)
      ? (material.original_classification as Record<string, unknown>)
      : null;

  if (!material.is_active || material.archived_at) {
    return "Archived";
  }

  if (material.needs_review) {
    if (originalClassification?.conflictReason === "import_classification_conflict") {
      return "Classification Conflict";
    }

    return "Needs Review";
  }

  return "Confirmed";
}

function getMaterialMappingState(material: OrganizationMaterialRow): MaterialMappingState {
  const originalClassification =
    material.original_classification &&
    typeof material.original_classification === "object" &&
    !Array.isArray(material.original_classification)
      ? (material.original_classification as Record<string, unknown>)
      : null;

  if (material.needs_review) {
    if (originalClassification?.conflictReason === "import_classification_conflict") {
      return "Conflict";
    }

    return material.organization_cost_code_id ? "Needs review" : "Missing mapping";
  }

  if (material.classification_source === "user_confirmed") {
    return "User confirmed";
  }

  if (material.organization_cost_code_id) {
    return "Auto-mapped";
  }

  return "Missing mapping";
}

function toMappingStatusBadge(state: MaterialMappingState) {
  switch (state) {
    case "Auto-mapped":
      return "approved" as const;
    case "User confirmed":
      return "active" as const;
    case "Needs review":
      return "pending" as const;
    case "Missing mapping":
      return "draft" as const;
    case "Conflict":
      return "overdue" as const;
  }
}

function DrawerField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <div className="text-sm font-medium text-[var(--text-primary)]">{value ?? "—"}</div>
    </div>
  );
}

function DrawerSection({
  title,
  description,
  actions,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "emphasis";
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] p-4",
        tone === "emphasis" ? "bg-[var(--surface-muted)]" : "bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          {description ? <p className="text-sm text-[var(--text-secondary)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CompanyMaterialsWorkspace({
  organizationId,
  canWrite,
  initialData,
}: CompanyMaterialsWorkspaceProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [costCodeFilter, setCostCodeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("All");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isAddingMaterialInline, setIsAddingMaterialInline] = useState(false);
  const [isSavingInlineMaterial, setIsSavingInlineMaterial] = useState(false);
  const [inlineMaterialRow, setInlineMaterialRow] = useState<InlineMaterialRowState>(EMPTY_INLINE_MATERIAL_ROW);
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(EMPTY_MATERIAL_FORM);
  const [isAddPriceOpen, setIsAddPriceOpen] = useState(false);
  const [supplierPriceModalMode, setSupplierPriceModalMode] = useState<SupplierPriceModalMode>("create");
  const [supplierPriceForm, setSupplierPriceForm] = useState<SupplierPriceFormState>(EMPTY_PRICE_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<"Details" | "Supplier Prices" | "History">("Details");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importSupplierId, setImportSupplierId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [reviewBatch, setReviewBatch] = useState<OrganizationMaterialImportBatchRow | null>(null);
  const [reviewRows, setReviewRows] = useState<ImportReviewRowState[]>([]);
  const [selectedReviewRowIds, setSelectedReviewRowIds] = useState<string[]>([]);
  const [isEditingMaterialIdentity, setIsEditingMaterialIdentity] = useState(false);
  const [isEditingMaterialClassification, setIsEditingMaterialClassification] = useState(false);

  const selectedMaterialSummary = useMemo(
    () =>
      initialData.materialSummaries.find((summary) => summary.material.id === selectedMaterialId) ?? null,
    [initialData.materialSummaries, selectedMaterialId]
  );

  const selectedMaterial = selectedMaterialSummary?.material ?? null;

  useEffect(() => {
    setMaterialForm(buildMaterialFormState(selectedMaterial));
    setIsEditingMaterialIdentity(false);
    setIsEditingMaterialClassification(false);
    setSupplierPriceForm((current) => ({
      ...EMPTY_PRICE_FORM,
      unit: selectedMaterial?.default_unit ?? current.unit,
    }));
  }, [selectedMaterial]);

  useEffect(() => {
    setActiveDrawerTab("Details");
  }, [selectedMaterialId]);

  const supplierNameById = useMemo(
    () =>
      new Map(
        initialData.suppliers.map((supplier) => [
          supplier.id,
          supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier",
        ])
      ),
    [initialData.suppliers]
  );

  const costCodeLabelById = useMemo(
    () =>
      new Map(
        initialData.costCodes.map((costCode) => [
          costCode.id,
          `${costCode.code} - ${costCode.name}`,
        ])
      ),
    [initialData.costCodes]
  );

  const materialPriceRows = useMemo(
    () =>
      selectedMaterial
        ? initialData.supplierPrices
            .filter((price) => price.material_id === selectedMaterial.id)
            .sort((left, right) => {
              if (left.is_current !== right.is_current) {
                return left.is_current ? -1 : 1;
              }
              if (left.is_preferred !== right.is_preferred) {
                return left.is_preferred ? -1 : 1;
              }
              return right.updated_at.localeCompare(left.updated_at);
            })
        : [],
    [initialData.supplierPrices, selectedMaterial]
  );

  const needsReviewCount = initialData.importRows.filter((row) => row.status === "pending_review").length;
  const linkedSupplierCount = new Set(
    initialData.supplierPrices.filter((price) => price.is_current).map((price) => price.supplier_id)
  ).size;
  const priceUpdatesCount = initialData.supplierPrices.filter((price) => {
    const updatedAt = new Date(price.updated_at);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return updatedAt >= threshold;
  }).length;

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(initialData.materials.map((material) => material.category?.trim()).filter(Boolean) as string[])
      ).sort((left, right) => left.localeCompare(right)),
    [initialData.materials]
  );

  const drawerStatus = selectedMaterial ? getMaterialDrawerStatus(selectedMaterial) : null;
  const selectedMaterialPreferredPrice = selectedMaterialSummary?.preferredPrice ?? null;
  const selectedMaterialSupplierCount = selectedMaterialSummary?.currentPrices.length ?? 0;
  const selectedMaterialLastPriceUpdate =
    selectedMaterialSummary?.currentPrices.reduce<string | null>((latest, price) => {
      if (!latest) {
        return price.updated_at;
      }

      return latest > price.updated_at ? latest : price.updated_at;
    }, null) ?? null;
  const selectedMaterialOrganizationCostCodeLabel =
    selectedMaterial?.organization_cost_code_id
      ? costCodeLabelById.get(selectedMaterial.organization_cost_code_id) ?? "—"
      : "—";
  const selectedMaterialReviewStatus =
    drawerStatus === "Classification Conflict"
      ? "Classification conflict requires review"
      : drawerStatus === "Needs Review"
        ? "Classification requires review"
        : drawerStatus === "Archived"
          ? "Archived"
          : "Confirmed";
  const selectedMaterialMappingState = selectedMaterial
    ? getMaterialMappingState(selectedMaterial)
    : "Missing mapping";

  const filteredMaterials = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return initialData.materialSummaries.filter((summary) => {
      if (
        supplierFilter !== "all" &&
        summary.preferredPrice?.supplier_id !== supplierFilter &&
        !summary.currentPrices.some((price) => price.supplier_id === supplierFilter)
      ) {
        return false;
      }

      if (categoryFilter !== "all" && (summary.material.category ?? "") !== categoryFilter) {
        return false;
      }

      if (
        costCodeFilter !== "all" &&
        (summary.material.organization_cost_code_id ?? "") !== costCodeFilter
      ) {
        return false;
      }

      if (statusFilter === "Needs Review" && summary.status !== "Needs Review") {
        return false;
      }
      if (statusFilter === "Preferred" && !summary.currentPrices.some((price) => price.is_preferred && price.is_current)) {
        return false;
      }
      if (statusFilter === "Archived" && summary.status !== "Archived") {
        return false;
      }
      if (statusFilter === "Recently Updated") {
        const updatedAt = new Date(summary.material.updated_at);
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 30);
        if (updatedAt < threshold) {
          return false;
        }
      }
      if (statusFilter === "All" && summary.status === "Archived" && costCodeFilter !== "all") {
        // keep archived visible only when explicitly filtered or searched
      }

      if (!query) {
        return true;
      }

      return [
        summary.material.name,
        summary.material.description ?? "",
        summary.material.category ?? "",
        summary.preferredSupplierName ?? "",
        summary.costCodeLabel ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [
    categoryFilter,
    costCodeFilter,
    initialData.materialSummaries,
    searchQuery,
    statusFilter,
    supplierFilter,
  ]);

  const inlineCreateRowCanSave =
    inlineMaterialRow.name.trim().length > 0 &&
    inlineMaterialRow.supplierId.trim().length > 0 &&
    inlineMaterialRow.unit.trim().length > 0 &&
    inlineMaterialRow.unitCost.trim().length > 0;

  async function handleCreateMaterialInline() {
    setError(null);
    setMessage(null);
    if (!inlineCreateRowCanSave) {
      setError("Material name, supplier, unit, and unit cost are required.");
      return;
    }

    setIsSavingInlineMaterial(true);

    try {
      const materialInput: MaterialDraftInput = {
        name: inlineMaterialRow.name,
        defaultUnit: inlineMaterialRow.unit,
        isActive: true,
      };

      const result = await createMaterialWithInitialSupplierPriceAction({
        organizationId,
        materialInput,
        supplierPriceInput: {
          supplierId: inlineMaterialRow.supplierId,
          unit: inlineMaterialRow.unit,
          unitCost: Number(inlineMaterialRow.unitCost),
          isPreferred: inlineMaterialRow.isPreferred,
        },
      });

      if (!result.ok || !result.materialId) {
        setError(result.error ?? "Unable to create material.");
        return;
      }

      setIsAddingMaterialInline(false);
      setInlineMaterialRow(EMPTY_INLINE_MATERIAL_ROW);
      setSelectedMaterialId(result.materialId);
      setActiveDrawerTab("Details");
      setMessage(
        result.needsReview
          ? "Material created. Classification needs review."
          : "Material created."
      );
      router.refresh();
    } finally {
      setIsSavingInlineMaterial(false);
    }
  }

  async function handleSaveMaterialDetails() {
    if (!selectedMaterial) {
      return;
    }

    setError(null);
    setMessage(null);
    const result = await updateMaterialAction({
      organizationId,
      materialId: selectedMaterial.id,
      input: {
        name: materialForm.name,
        description: materialForm.description,
        defaultUnit: materialForm.defaultUnit,
        category: materialForm.category,
        organizationCostCodeId: materialForm.organizationCostCodeId || null,
        isActive: materialForm.isActive,
      },
    });

    if (!result.ok) {
      setError(result.error ?? "Unable to update material.");
      return;
    }

    setMessage("Material details updated.");
    router.refresh();
  }

  async function handleSaveMaterialMapping() {
    if (!selectedMaterial) {
      return;
    }

    setError(null);
    setMessage(null);
    const result = await updateMaterialAction({
      organizationId,
      materialId: selectedMaterial.id,
      input: {
        name: materialForm.name,
        description: materialForm.description,
        defaultUnit: materialForm.defaultUnit,
        category: materialForm.category,
        organizationCostCodeId: materialForm.organizationCostCodeId || null,
        isActive: materialForm.isActive,
      },
    });

    if (!result.ok) {
      setError(result.error ?? "Unable to update organization cost code.");
      return;
    }

    setIsEditingMaterialClassification(false);
    setMessage("Organization cost code mapping updated.");
    router.refresh();
  }

  async function handleArchiveMaterial(archived: boolean) {
    if (!selectedMaterial) {
      return;
    }

    const result = await archiveMaterialAction({
      organizationId,
      materialId: selectedMaterial.id,
      archived,
    });

    if (!result.ok) {
      setError(result.error ?? "Unable to update material status.");
      return;
    }

    setMessage(archived ? "Material archived." : "Material restored.");
    router.refresh();
  }

  async function handleAddSupplierPrice() {
    if (!selectedMaterial) {
      return;
    }

    setError(null);
    const payload: MaterialSupplierPriceDraftInput = {
      materialId: selectedMaterial.id,
      supplierId: supplierPriceForm.supplierId,
      supplierDescription: supplierPriceForm.supplierDescription,
      unit: supplierPriceForm.unit,
      unitCost: Number(supplierPriceForm.unitCost),
      currency: supplierPriceForm.currency,
      isPreferred: supplierPriceForm.isPreferred,
    };

    const result = await addMaterialSupplierPriceAction({
      organizationId,
      input: payload,
    });

    if (!result.ok) {
      setError(result.error ?? "Unable to add supplier price.");
      return;
    }

    setIsAddPriceOpen(false);
    setSupplierPriceModalMode("create");
    setSupplierPriceForm(EMPTY_PRICE_FORM);
    setMessage(supplierPriceModalMode === "update" ? "Supplier price updated." : "Supplier price added.");
    router.refresh();
  }

  function handleOpenUpdateSupplierPrice(price: typeof materialPriceRows[number]) {
    setError(null);
    setSupplierPriceModalMode("update");
    setSupplierPriceForm({
      supplierId: price.supplier_id,
      supplierDescription: price.supplier_description ?? "",
      unit: price.unit,
      unitCost: String(price.unit_cost),
      currency: price.currency,
      isPreferred: price.is_preferred,
    });
    setIsAddPriceOpen(true);
  }

  async function handleMakePreferredSupplierPrice(priceId: string) {
    setError(null);
    setMessage(null);
    const result = await makeMaterialSupplierPricePreferredAction({
      organizationId,
      supplierPriceId: priceId,
    });

    if (!result.ok) {
      setError(result.error ?? "Unable to update preferred supplier price.");
      return;
    }

    setMessage("Preferred supplier updated.");
    router.refresh();
  }

  async function handleStartImport() {
    if (!importFile) {
      setError("Choose a file to import.");
      return;
    }
    if (!importSupplierId) {
      setError("Choose a supplier before importing.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsUploadingImport(true);

    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("supplierId", importSupplierId);

      const response = await fetch("/api/materials/imports", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        error?: string;
        batch?: OrganizationMaterialImportBatchRow;
        rows?: OrganizationMaterialImportRowRow[];
      };

      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Unable to import supplier price list.");
      }

      setReviewBatch(payload.batch);
      setReviewRows((payload.rows ?? []).map(toReviewRowState));
      setSelectedReviewRowIds((payload.rows ?? []).map((row) => row.id));
      setMessage("Import batch ready for review.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import supplier price list.");
    } finally {
      setIsUploadingImport(false);
    }
  }

  async function handleAddReviewRow() {
    if (!reviewBatch) {
      return;
    }

    const response = await fetch(`/api/materials/imports/${reviewBatch.id}/rows`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string; row?: OrganizationMaterialImportRowRow };
    if (!response.ok || !payload.row) {
      setError(payload.error ?? "Unable to add a review row.");
      return;
    }

    setReviewRows((current) => [...current, toReviewRowState(payload.row!)]);
    setSelectedReviewRowIds((current) => [...current, payload.row!.id]);
  }

  async function handleApproveSelectedRows() {
    if (!reviewBatch) {
      return;
    }

    const selectedRows = reviewRows.filter((row) => selectedReviewRowIds.includes(row.id));
    if (selectedRows.length === 0) {
      setError("Choose at least one row to approve.");
      return;
    }

    const reviews: MaterialImportReviewDraft[] = selectedRows.map((row) => ({
      rowId: row.id,
      action: row.action,
      matchedMaterialId: row.matchedMaterialId || null,
      reviewedName: row.reviewedName,
      reviewedDescription: row.reviewedDescription,
      reviewedUnit: row.reviewedUnit,
      reviewedUnitCost: Number(row.reviewedUnitCost),
      reviewedCurrency: row.reviewedCurrency,
      reviewedSupplierDescription: row.reviewedSupplierDescription,
      reviewedSupplierSku: row.reviewedSupplierSku,
    }));

    const response = await fetch(`/api/materials/imports/${reviewBatch.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        reviews,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to approve import rows.");
      return;
    }

    setIsImportOpen(false);
    setReviewBatch(null);
    setReviewRows([]);
    setSelectedReviewRowIds([]);
    setImportFile(null);
    setImportSupplierId("");
    setMessage("Import rows approved.");
    router.refresh();
  }

  async function handleRejectSelectedRows() {
    if (!reviewBatch || selectedReviewRowIds.length === 0) {
      setError("Choose at least one row to reject.");
      return;
    }

    const response = await fetch(`/api/materials/imports/${reviewBatch.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "reject",
        rowIds: selectedReviewRowIds,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to reject import rows.");
      return;
    }

    setIsImportOpen(false);
    setReviewBatch(null);
    setReviewRows([]);
    setSelectedReviewRowIds([]);
    setMessage("Selected import rows rejected.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <OperationalModuleHeader
        title="Material Library"
        description="Manage supplier material costs, preferred suppliers, and company cost items."
        actions={
          <>
            <Button
              variant="outline"
              size="toolbar"
              onClick={() => setIsImportOpen(true)}
              disabled={!canWrite}
            >
              <Upload className="h-4 w-4" />
              Import Supplier Price List
            </Button>
            <Button
              variant="orange"
              size="toolbar"
              onClick={() => {
                setError(null);
                setMessage(null);
                setInlineMaterialRow(EMPTY_INLINE_MATERIAL_ROW);
                setIsAddingMaterialInline(true);
              }}
              disabled={!canWrite || isAddingMaterialInline}
            >
              <Plus className="h-4 w-4" /> Add Material
            </Button>
          </>
        }
      />

      {message ? <OperationalAlert variant="success">{message}</OperationalAlert> : null}
      {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <OperationalKpiCard
          label="Materials"
          value={initialData.materials.filter((material) => material.is_active).length.toLocaleString()}
          helper="Active cost items"
          tone="navy"
          icon={<Package2 className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Suppliers"
          value={linkedSupplierCount.toLocaleString()}
          helper="Linked suppliers"
          tone="sage"
          icon={<Building2 className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Needs Review"
          value={needsReviewCount.toLocaleString()}
          helper="Imported items to match"
          tone="amber"
          icon={<FileWarning className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Price Updates"
          value={priceUpdatesCount.toLocaleString()}
          helper="Updated in last 30 days"
          tone="orange"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="space-y-3">
        <OperationalToolbar
          className="items-start"
          search={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search materials..."
                className="pl-9"
              />
            </div>
          }
          filters={(["All", "Needs Review", "Preferred", "Recently Updated", "Archived"] as MaterialStatusFilter[]).map(
            (item) => (
              <Button
                key={item}
                variant={statusFilter === item ? "primary" : "secondary"}
                size="sm"
                onClick={() => setStatusFilter(item)}
              >
                {item}
              </Button>
            )
          )}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value)}
            className={cn(FIELD_SELECT_CLASS, "w-full")}
          >
            <option value="all">Supplier</option>
            {initialData.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={cn(FIELD_SELECT_CLASS, "w-full")}
          >
            <option value="all">Trade / Category</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={costCodeFilter}
            onChange={(event) => setCostCodeFilter(event.target.value)}
            className={cn(FIELD_SELECT_CLASS, "w-full")}
          >
            <option value="all">Cost Code</option>
            {initialData.costCodes.map((costCode) => (
              <option key={costCode.id} value={costCode.id}>
                {costCode.code} - {costCode.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <OperationalPanel contentClassName="p-0">
        {filteredMaterials.length === 0 && !isAddingMaterialInline ? (
          <div className="p-6">
            <OperationalEmptyState
              title="No materials found"
              description="Try a different search or filter, or add your first material item."
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>
        ) : (
            <OperationalTable className="min-w-[1120px]">
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Material</OperationalTableHead>
                  <OperationalTableHead>Cost Code</OperationalTableHead>
                  <OperationalTableHead>Unit</OperationalTableHead>
                  <OperationalTableHead>Preferred Supplier</OperationalTableHead>
                  <OperationalTableHead>Best Cost</OperationalTableHead>
                  <OperationalTableHead>Other Suppliers</OperationalTableHead>
                  <OperationalTableHead>Last Updated</OperationalTableHead>
                  <OperationalTableHead>Status</OperationalTableHead>
                  <OperationalTableHead>Actions</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {isAddingMaterialInline ? (
                  <OperationalTableRow className="bg-[var(--surface-muted)]/60">
                    <OperationalTableCell>
                      <Input
                        value={inlineMaterialRow.name}
                        onChange={(event) =>
                          setInlineMaterialRow((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="100 x 50 H1.2 SG8 Timber"
                        disabled={isSavingInlineMaterial}
                      />
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <StatusBadge status="draft">Auto classify</StatusBadge>
                        <p className="text-xs text-[var(--text-secondary)]">Resolved after save</p>
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <Input
                        value={inlineMaterialRow.unit}
                        onChange={(event) =>
                          setInlineMaterialRow((current) => ({ ...current, unit: event.target.value }))
                        }
                        placeholder="LM"
                        disabled={isSavingInlineMaterial}
                      />
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <select
                        value={inlineMaterialRow.supplierId}
                        onChange={(event) =>
                          setInlineMaterialRow((current) => ({ ...current, supplierId: event.target.value }))
                        }
                        className={cn(FIELD_SELECT_CLASS, "h-10 min-w-[180px]")}
                        disabled={isSavingInlineMaterial}
                      >
                        <option value="">Select supplier</option>
                        {initialData.suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
                          </option>
                        ))}
                      </select>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={inlineMaterialRow.unitCost}
                        onChange={(event) =>
                          setInlineMaterialRow((current) => ({ ...current, unitCost: event.target.value }))
                        }
                        placeholder="4.55"
                        disabled={isSavingInlineMaterial}
                      />
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <StatusBadge status={inlineMaterialRow.isPreferred ? "approved" : "draft"}>
                          {inlineMaterialRow.isPreferred ? "Preferred" : "Not preferred"}
                        </StatusBadge>
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--orange-primary)]"
                          onClick={() =>
                            setInlineMaterialRow((current) => ({
                              ...current,
                              isPreferred: !current.isPreferred,
                            }))
                          }
                          disabled={isSavingInlineMaterial}
                        >
                          {inlineMaterialRow.isPreferred ? "Unset preferred" : "Mark preferred"}
                        </button>
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-sm text-[var(--text-secondary)]">0</OperationalTableCell>
                    <OperationalTableCell className="text-sm text-[var(--text-secondary)]">On save</OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <StatusBadge status="draft">Pending Save</StatusBadge>
                        <p className="text-xs text-[var(--text-secondary)]">Review status assigned after save</p>
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="orange"
                          size="sm"
                          onClick={() => void handleCreateMaterialInline()}
                          disabled={!inlineCreateRowCanSave || isSavingInlineMaterial}
                        >
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setIsAddingMaterialInline(false);
                            setInlineMaterialRow(EMPTY_INLINE_MATERIAL_ROW);
                            setError(null);
                          }}
                          disabled={isSavingInlineMaterial}
                        >
                          Cancel
                        </Button>
                      </div>
                    </OperationalTableCell>
                  </OperationalTableRow>
                ) : null}
                {filteredMaterials.map((summary) => (
                  <OperationalTableRow key={summary.material.id}>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-[var(--text-primary)]">{summary.material.name}</p>
                        {summary.material.description ? (
                          <p className="text-xs text-[var(--text-secondary)]">{summary.material.description}</p>
                        ) : null}
                        {formatConstructionIntelligenceSummary(summary.material.ai_construction_intelligence) ? (
                          <p className="text-xs text-[var(--text-secondary)]">
                            Construction Intelligence:{" "}
                            {formatConstructionIntelligenceSummary(summary.material.ai_construction_intelligence)}
                          </p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>{summary.costCodeLabel ?? "—"}</OperationalTableCell>
                    <OperationalTableCell>{summary.material.default_unit}</OperationalTableCell>
                    <OperationalTableCell>{summary.preferredSupplierName ?? "—"}</OperationalTableCell>
                    <OperationalTableCell>
                      {formatMaterialMoney(summary.lowestCurrentCost, summary.preferredPrice?.currency ?? "NZD")}
                    </OperationalTableCell>
                    <OperationalTableCell>{summary.otherSupplierCount}</OperationalTableCell>
                    <OperationalTableCell>{formatMaterialDate(summary.material.updated_at)}</OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={toStatusBadge(summary.status)}>{summary.status}</StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <Button
                        variant="outline"
                        size="toolbar"
                        onClick={() => setSelectedMaterialId(summary.material.id)}
                      >
                      Open
                      </Button>
                    </OperationalTableCell>
                  </OperationalTableRow>
                ))}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <Dialog open={Boolean(selectedMaterialId)} onOpenChange={(open) => !open && setSelectedMaterialId(null)}>
        <DialogContent className="w-[95vw] max-w-[1180px] overflow-hidden p-0">
          {selectedMaterial ? (
            <div className="flex max-h-[90vh] flex-col">
              <div className="shrink-0 border-b border-[var(--border)] px-7 pb-5 pt-7">
                <h2 className="pr-16 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  {selectedMaterial.name}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={toDrawerStatusBadge(drawerStatus ?? "Confirmed")}>
                    {drawerStatus ?? "Confirmed"}
                  </StatusBadge>
                  <StatusBadge status={toConfidenceBadgeStatus(selectedMaterial.classification_confidence)}>
                    {formatConfidencePercent(selectedMaterial.classification_confidence)}
                  </StatusBadge>
                </div>
              </div>

              <div className="shrink-0 border-b border-[var(--border)] px-7 py-3">
                <div className="flex flex-wrap gap-2">
                  {(["Details", "Supplier Prices", "History"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveDrawerTab(tab)}
                      className={`rounded-[var(--radius-sm)] px-2 py-1 text-sm font-medium ${
                        activeDrawerTab === tab
                          ? "text-[var(--orange-primary)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
                {activeDrawerTab === "Details" ? (
                  <div className="space-y-4">
                    {selectedMaterial.needs_review ? (
                      <OperationalAlert variant="warning" className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">This material classification requires review.</p>
                            <p className="mt-1 text-sm">
                              Confirm or correct the suggested classification before it becomes part of your confirmed company intelligence.
                            </p>
                          </div>
                          <Button asChild variant="secondary" size="sm">
                            <Link href={`/app/company/cost-items/review?edit=${selectedMaterial.id}`}>
                              Review Classification
                            </Link>
                          </Button>
                        </div>
                      </OperationalAlert>
                    ) : null}

                    <DrawerSection
                      title="Material Identity"
                      description="Core material information used across the Material Library."
                      actions={
                        canWrite ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setIsEditingMaterialIdentity((current) => !current)}
                            >
                              {isEditingMaterialIdentity ? "Close Edit" : "Edit Material"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleArchiveMaterial(selectedMaterial.is_active)}
                            >
                              {selectedMaterial.is_active ? "Archive" : "Restore"}
                            </Button>
                          </>
                        ) : null
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DrawerField label="Material Name" value={selectedMaterial.name} />
                        <DrawerField
                          label="Active Status"
                          value={
                            <StatusBadge status={selectedMaterial.is_active ? "active" : "draft"}>
                              {selectedMaterial.is_active ? "Active" : "Archived"}
                            </StatusBadge>
                          }
                        />
                        <DrawerField label="Description" value={selectedMaterial.description ?? "—"} />
                        <DrawerField label="Unit" value={selectedMaterial.default_unit || "—"} />
                        <DrawerField label="Trade / Category" value={selectedMaterial.category ?? "—"} />
                      </div>

                      {canWrite && isEditingMaterialIdentity ? (
                        <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4">
                          <div className="grid gap-4">
                            <div>
                              <FieldLabel htmlFor="material-name">Material Name</FieldLabel>
                              <Input
                                id="material-name"
                                value={materialForm.name}
                                onChange={(event) => setMaterialForm((current) => ({ ...current, name: event.target.value }))}
                                disabled={!canWrite}
                              />
                            </div>
                            <div>
                              <FieldLabel htmlFor="material-description">Description</FieldLabel>
                              <textarea
                                id="material-description"
                                value={materialForm.description}
                                onChange={(event) =>
                                  setMaterialForm((current) => ({ ...current, description: event.target.value }))
                                }
                                className={FIELD_TEXTAREA_CLASS}
                                disabled={!canWrite}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <FieldLabel htmlFor="material-unit">Unit</FieldLabel>
                                <Input
                                  id="material-unit"
                                  value={materialForm.defaultUnit}
                                  onChange={(event) =>
                                    setMaterialForm((current) => ({ ...current, defaultUnit: event.target.value }))
                                  }
                                  disabled={!canWrite}
                                />
                              </div>
                              <div>
                                <FieldLabel htmlFor="material-category">Trade / Category</FieldLabel>
                                <Input
                                  id="material-category"
                                  value={materialForm.category}
                                  onChange={(event) =>
                                    setMaterialForm((current) => ({ ...current, category: event.target.value }))
                                  }
                                  disabled={!canWrite}
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
                              <input
                                type="checkbox"
                                checked={materialForm.isActive}
                                onChange={(event) =>
                                  setMaterialForm((current) => ({ ...current, isActive: event.target.checked }))
                                }
                                disabled={!canWrite}
                              />
                              Active
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="orange" size="toolbar" onClick={() => void handleSaveMaterialDetails()}>
                                Save Material Identity
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </DrawerSection>

                    <DrawerSection
                      title="TradesStack Classification"
                      description="Structured classification and accounting intelligence for this material."
                      actions={
                        canWrite ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsEditingMaterialClassification((current) => !current)}
                          >
                            {isEditingMaterialClassification
                              ? "Cancel"
                              : selectedMaterialMappingState === "Missing mapping"
                                ? "Fix Missing Mapping"
                                : selectedMaterial?.needs_review
                                  ? "Review Classification"
                                  : "Edit Mapping"}
                          </Button>
                        ) : null
                      }
                      tone="emphasis"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DrawerField label="Work Type" value={selectedMaterial.work_type ?? "—"} />
                        <DrawerField label="Cost Type" value={selectedMaterial.cost_type ?? "MAT"} />
                        <DrawerField label="Internal Cost Code" value={selectedMaterial.cost_code ?? "—"} />
                        <DrawerField
                          label="Organization Cost Code"
                          value={
                            <div className="space-y-2">
                              <div>{selectedMaterialOrganizationCostCodeLabel}</div>
                              <StatusBadge status={toMappingStatusBadge(selectedMaterialMappingState)}>
                                {selectedMaterialMappingState}
                              </StatusBadge>
                            </div>
                          }
                        />
                        <DrawerField
                          label="Classification Source"
                          value={formatClassificationSource(selectedMaterial.classification_source)}
                        />
                        <DrawerField label="Confidence" value={formatConfidencePercent(selectedMaterial.classification_confidence)} />
                        <DrawerField
                          label="Construction Intelligence"
                          value={formatConstructionIntelligenceSummary(selectedMaterial.ai_construction_intelligence) ?? "Not classified yet"}
                        />
                        <DrawerField
                          label="Review Status"
                          value={
                            <StatusBadge status={toDrawerStatusBadge(drawerStatus ?? "Confirmed")}>
                              {selectedMaterialReviewStatus}
                            </StatusBadge>
                          }
                        />
                      </div>

                      {canWrite && isEditingMaterialClassification ? (
                        <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4">
                          <div className="grid gap-4">
                            <div>
                              <FieldLabel htmlFor="material-cost-code">Organization Cost Code</FieldLabel>
                              <select
                                id="material-cost-code"
                                value={materialForm.organizationCostCodeId}
                                onChange={(event) =>
                                  setMaterialForm((current) => ({
                                    ...current,
                                    organizationCostCodeId: event.target.value,
                                  }))
                                }
                                className={FIELD_SELECT_CLASS}
                                disabled={!canWrite}
                              >
                                <option value="">None</option>
                                {initialData.costCodes.map((costCode) => (
                                  <option key={costCode.id} value={costCode.id}>
                                    {costCode.code} - {costCode.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                              Update the organization cost code only when the automatic mapping needs a human correction.
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="orange" size="toolbar" onClick={() => void handleSaveMaterialMapping()}>
                                Save Mapping
                              </Button>
                              <Button
                                variant="secondary"
                                size="toolbar"
                                onClick={() => setIsEditingMaterialClassification(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </DrawerSection>

                    <DrawerSection
                      title="Commercial Summary"
                      description="A quick commercial snapshot before you drill into supplier prices."
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DrawerField
                          label="Preferred Supplier"
                          value={
                            selectedMaterialPreferredPrice
                              ? supplierNameById.get(selectedMaterialPreferredPrice.supplier_id) ?? "Unknown supplier"
                              : "—"
                          }
                        />
                        <DrawerField
                          label="Current Preferred Cost"
                          value={formatMaterialMoney(
                            selectedMaterialPreferredPrice ? Number(selectedMaterialPreferredPrice.unit_cost) : null,
                            selectedMaterialPreferredPrice?.currency ?? "NZD"
                          )}
                        />
                        <DrawerField label="Supplier Count" value={selectedMaterialSupplierCount.toLocaleString()} />
                        <DrawerField label="Last Price Update" value={formatMaterialDate(selectedMaterialLastPriceUpdate)} />
                      </div>
                    </DrawerSection>
                  </div>
                ) : null}

                {activeDrawerTab === "Supplier Prices" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">Supplier Prices</h3>
                      {canWrite ? (
                        <Button
                          variant="outline"
                          size="toolbar"
                          onClick={() => {
                            setSupplierPriceModalMode("create");
                            setSupplierPriceForm({
                              ...EMPTY_PRICE_FORM,
                              unit: selectedMaterial?.default_unit ?? "",
                            });
                            setIsAddPriceOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" /> Add Supplier Price
                        </Button>
                      ) : null}
                    </div>
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
                      <OperationalTable className="min-w-[860px]">
                        <OperationalTableHeader>
                          <OperationalTableRow>
                            <OperationalTableHead>Supplier</OperationalTableHead>
                            <OperationalTableHead>Supplier Description</OperationalTableHead>
                            <OperationalTableHead>Unit</OperationalTableHead>
                            <OperationalTableHead>Unit Cost</OperationalTableHead>
                            <OperationalTableHead>Preferred</OperationalTableHead>
                            <OperationalTableHead>Status</OperationalTableHead>
                            <OperationalTableHead>Updated</OperationalTableHead>
                            <OperationalTableHead>Actions</OperationalTableHead>
                          </OperationalTableRow>
                        </OperationalTableHeader>
                        <OperationalTableBody>
                          {materialPriceRows
                            .filter((price) => price.is_current)
                            .map((price) => (
                              <OperationalTableRow key={price.id}>
                                <OperationalTableCell>
                                  {supplierNameById.get(price.supplier_id) ?? "Unknown supplier"}
                                </OperationalTableCell>
                                <OperationalTableCell>{price.supplier_description ?? "—"}</OperationalTableCell>
                                <OperationalTableCell>{price.unit}</OperationalTableCell>
                                <OperationalTableCell>
                                  {formatMaterialMoney(Number(price.unit_cost), price.currency)}
                                </OperationalTableCell>
                                <OperationalTableCell>
                                  <StatusBadge status={price.is_preferred ? "approved" : "draft"}>
                                    {price.is_preferred ? "Yes" : "No"}
                                  </StatusBadge>
                                </OperationalTableCell>
                                <OperationalTableCell>
                                  <StatusBadge status={price.is_current ? "active" : "draft"}>
                                    {price.is_current ? "Current" : "Historical"}
                                  </StatusBadge>
                                </OperationalTableCell>
                                <OperationalTableCell>{formatMaterialDate(price.updated_at)}</OperationalTableCell>
                                <OperationalTableCell>
                                  <div className="flex flex-wrap gap-2">
                                    {canWrite ? (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleOpenUpdateSupplierPrice(price)}
                                        >
                                          Update Price
                                        </Button>
                                        {!price.is_preferred ? (
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => void handleMakePreferredSupplierPrice(price.id)}
                                          >
                                            Make Preferred
                                          </Button>
                                        ) : null}
                                      </>
                                    ) : null}
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => setActiveDrawerTab("History")}
                                    >
                                      View History
                                    </Button>
                                  </div>
                                </OperationalTableCell>
                              </OperationalTableRow>
                            ))}
                        </OperationalTableBody>
                      </OperationalTable>
                    </div>
                  </div>
                ) : null}

                {activeDrawerTab === "History" ? (
                  <div className="space-y-3">
                    {materialPriceRows.length === 0 ? (
                      <OperationalEmptyState
                        title="No history yet"
                        description="Supplier price history will appear here as prices are added or imported."
                        icon={<TrendingUp className="h-5 w-5" />}
                      />
                    ) : (
                      materialPriceRows.map((price) => (
                        <div
                          key={price.id}
                          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-[var(--text-primary)]">
                                {supplierNameById.get(price.supplier_id) ?? "Unknown supplier"}
                              </p>
                              <p className="text-sm text-[var(--text-secondary)]">
                                {formatMaterialMoney(Number(price.unit_cost), price.currency)} / {price.unit}
                              </p>
                            </div>
                            <StatusBadge status={price.is_current ? "active" : "draft"}>
                              {price.is_current ? "Current" : "Historical"}
                            </StatusBadge>
                          </div>
                          <div className="mt-3 text-sm text-[var(--text-secondary)]">
                            Effective from {formatMaterialDate(price.effective_from)}
                            {price.effective_to ? ` to ${formatMaterialDate(price.effective_to)}` : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isAddPriceOpen} onOpenChange={setIsAddPriceOpen}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0">
          <div className="px-7 pb-6 pt-7">
            <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              {supplierPriceModalMode === "update" ? "Update Supplier Price" : "Add Supplier Price"}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {supplierPriceModalMode === "update"
                ? "Create a new supplier price version while preserving history."
                : "Add a new supplier price record while preserving history."}
            </p>
          </div>

          <div className="space-y-3.5 px-7 pb-4">
            <div className="grid gap-4">
              <div>
                <FieldLabel htmlFor="price-supplier">Supplier</FieldLabel>
                <select
                  id="price-supplier"
                  value={supplierPriceForm.supplierId}
                  onChange={(event) =>
                    setSupplierPriceForm((current) => ({ ...current, supplierId: event.target.value }))
                  }
                  className={FIELD_SELECT_CLASS}
                >
                  <option value="">Select supplier</option>
                  {initialData.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="price-description">Supplier Description</FieldLabel>
                <Input
                  id="price-description"
                  value={supplierPriceForm.supplierDescription}
                  onChange={(event) =>
                    setSupplierPriceForm((current) => ({
                      ...current,
                      supplierDescription: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <FieldLabel htmlFor="price-unit">Unit</FieldLabel>
                  <Input
                    id="price-unit"
                    value={supplierPriceForm.unit}
                    onChange={(event) =>
                      setSupplierPriceForm((current) => ({ ...current, unit: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="price-cost">Unit Cost</FieldLabel>
                  <Input
                    id="price-cost"
                    value={supplierPriceForm.unitCost}
                    onChange={(event) =>
                      setSupplierPriceForm((current) => ({ ...current, unitCost: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="price-currency">Currency</FieldLabel>
                  <Input
                    id="price-currency"
                    value={supplierPriceForm.currency}
                    onChange={(event) =>
                      setSupplierPriceForm((current) => ({ ...current, currency: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={supplierPriceForm.isPreferred}
                onChange={(event) =>
                  setSupplierPriceForm((current) => ({ ...current, isPreferred: event.target.checked }))
                }
              />
              Mark as preferred supplier price
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={() => void handleAddSupplierPrice()}>
              {supplierPriceModalMode === "update" ? "Save New Price Version" : "Add Supplier Price"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-[1120px]">
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Import Supplier Price List</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Upload a supplier file, review extracted rows, then approve selected rows into the Material Library.
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Approved imports create current supplier prices for review and do not change your preferred supplier automatically.
              </p>
            </div>

            {!reviewBatch ? (
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <FieldLabel htmlFor="import-supplier">Supplier</FieldLabel>
                  <select
                    id="import-supplier"
                    value={importSupplierId}
                    onChange={(event) => setImportSupplierId(event.target.value)}
                    className={FIELD_SELECT_CLASS}
                  >
                    <option value="">Select supplier</option>
                    {initialData.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="import-file">Upload File</FieldLabel>
                  <Input
                    id="import-file"
                    type="file"
                    accept=".csv,.xlsx,.xlsm,.pdf,image/*"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="orange"
                    size="toolbar"
                    onClick={() => void handleStartImport()}
                    disabled={isUploadingImport}
                  >
                    {isUploadingImport ? "Importing..." : "Create Import Batch"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">{reviewBatch.file_name}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {reviewRows.length} row{reviewRows.length === 1 ? "" : "s"} ready for review
                    </p>
                  </div>
                  <Button variant="outline" size="toolbar" onClick={() => void handleAddReviewRow()}>
                    <Plus className="h-4 w-4" /> Add Row
                  </Button>
                </div>

                <OperationalTable>
                  <OperationalTableHeader>
                    <OperationalTableRow>
                      <OperationalTableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedReviewRowIds.length > 0 && selectedReviewRowIds.length === reviewRows.length}
                          onChange={(event) =>
                            setSelectedReviewRowIds(
                              event.target.checked ? reviewRows.map((row) => row.id) : []
                            )
                          }
                        />
                      </OperationalTableHead>
                      <OperationalTableHead>Material</OperationalTableHead>
                      <OperationalTableHead>Unit</OperationalTableHead>
                      <OperationalTableHead>Cost</OperationalTableHead>
                      <OperationalTableHead>Supplier Description</OperationalTableHead>
                      <OperationalTableHead>Match / Create</OperationalTableHead>
                      <OperationalTableHead>Status</OperationalTableHead>
                    </OperationalTableRow>
                  </OperationalTableHeader>
                  <OperationalTableBody>
                    {reviewRows.map((row) => (
                      <OperationalTableRow key={row.id}>
                        <OperationalTableCell>
                          <input
                            type="checkbox"
                            checked={selectedReviewRowIds.includes(row.id)}
                            onChange={(event) =>
                              setSelectedReviewRowIds((current) =>
                                event.target.checked
                                  ? [...current, row.id]
                                  : current.filter((value) => value !== row.id)
                              )
                            }
                          />
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <Input
                              value={row.reviewedName}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, reviewedName: event.target.value }
                                      : item
                                  )
                                )
                              }
                            />
                            <Input
                              value={row.reviewedDescription}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, reviewedDescription: event.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="Description"
                            />
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <Input
                            value={row.reviewedUnit}
                            onChange={(event) =>
                              setReviewRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? { ...item, reviewedUnit: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <Input
                              value={row.reviewedUnitCost}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, reviewedUnitCost: event.target.value }
                                      : item
                                  )
                                )
                              }
                            />
                            <Input
                              value={row.reviewedCurrency}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, reviewedCurrency: event.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="Currency"
                            />
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <Input
                              value={row.reviewedSupplierDescription}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, reviewedSupplierDescription: event.target.value }
                                      : item
                                  )
                                )
                              }
                            />
                            <Input
                              value={row.reviewedSupplierSku}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, reviewedSupplierSku: event.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="Supplier SKU optional"
                            />
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <select
                              value={row.action}
                              onChange={(event) =>
                                setReviewRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? { ...item, action: event.target.value as MaterialImportRowAction }
                                      : item
                                  )
                                )
                              }
                              className={FIELD_SELECT_CLASS}
                            >
                              <option value="create_material">Create material</option>
                              <option value="match_material">Match existing</option>
                              <option value="skip">Skip</option>
                            </select>
                            {row.action === "match_material" ? (
                              <select
                                value={row.matchedMaterialId}
                                onChange={(event) =>
                                  setReviewRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? { ...item, matchedMaterialId: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                className={FIELD_SELECT_CLASS}
                              >
                                <option value="">Choose material</option>
                                {initialData.materials.map((material) => (
                                  <option key={material.id} value={material.id}>
                                    {material.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <StatusBadge status={toStatusBadge(row.status)}>{row.status}</StatusBadge>
                        </OperationalTableCell>
                      </OperationalTableRow>
                    ))}
                  </OperationalTableBody>
                </OperationalTable>

                <div className="flex justify-between gap-2">
                  <Button
                    variant="outline"
                    size="toolbar"
                    onClick={() => {
                      setReviewBatch(null);
                      setReviewRows([]);
                      setSelectedReviewRowIds([]);
                    }}
                  >
                    Back
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="toolbar" onClick={() => void handleRejectSelectedRows()}>
                      Reject Selected
                    </Button>
                    <Button variant="orange" size="toolbar" onClick={() => void handleApproveSelectedRows()}>
                      Approve Selected
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
