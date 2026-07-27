"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe, Link2, Mail, Phone, Plus, RefreshCcw, Search, ShieldAlert, Users } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { OperationalToolbar } from "@/components/app/OperationalToolbar";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import {
  formatSupplierPaymentTerms,
  getSupplierAddressDisplay,
  getSupplierDisplayName,
  getSupplierPrimaryEmail,
  getSupplierPrimaryPhone,
  getSupplierReadiness,
  type OrganizationSupplierRow,
  type SupplierDuplicateWarning,
} from "@/lib/suppliers";
import { normalizeSupplierWebsite } from "@/lib/supplier-validation";
import type { SupplierPaymentTermsType } from "@/lib/supplier-validation";
import type { SupplierXeroLinkWorkspaceData, SupplierXeroOverview, SupplierXeroStatus, SupplierXeroSuggestion } from "@/lib/xero/contacts";
import {
  createSupplierXeroContactAction,
  linkSupplierXeroContactAction,
  loadSupplierXeroWorkspaceAction,
  refreshSupplierXeroContactsAction,
  saveSupplierAction,
  setSupplierActiveStateAction,
  type SupplierSaveActionResult,
  unlinkSupplierXeroContactAction,
} from "./actions";

type CompanySuppliersWorkspaceProps = {
  initialSuppliers: OrganizationSupplierRow[];
  canEdit: boolean;
  canManageXeroContacts: boolean;
  initialXeroOverview: SupplierXeroOverview;
};

type SupplierStatusFilter = "all" | "active" | "inactive";

type SupplierFormState = {
  name: string;
  legalName: string;
  primaryContactFirstName: string;
  primaryContactLastName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  website: string;
  legacyAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  companyRegistrationNumber: string;
  taxNumber: string;
  taxNumberType: string;
  defaultCurrencyCode: string;
  legacyPaymentTerms: string;
  paymentTermsType: SupplierPaymentTermsType | "";
  paymentTermsDay: string;
  isActive: boolean;
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; supplierId: string }
  | { type: "edit"; supplierId: string };

type PendingCreateContactState = {
  supplierId: string;
  suggestions: SupplierXeroSuggestion[];
};

const emptyFormState: SupplierFormState = {
  name: "",
  legalName: "",
  primaryContactFirstName: "",
  primaryContactLastName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  website: "",
  legacyAddress: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
  companyRegistrationNumber: "",
  taxNumber: "",
  taxNumberType: "",
  defaultCurrencyCode: "",
  legacyPaymentTerms: "",
  paymentTermsType: "",
  paymentTermsDay: "",
  isActive: true,
};

const FIELD_SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function toFormState(supplier: OrganizationSupplierRow | null): SupplierFormState {
  if (!supplier) {
    return emptyFormState;
  }

  return {
    name: getSupplierDisplayName(supplier),
    legalName: supplier.legal_name ?? "",
    primaryContactFirstName: supplier.primary_contact_first_name ?? "",
    primaryContactLastName: supplier.primary_contact_last_name ?? "",
    primaryContactEmail: getSupplierPrimaryEmail(supplier),
    primaryContactPhone: getSupplierPrimaryPhone(supplier),
    website: supplier.website ?? "",
    legacyAddress: supplier.address ?? "",
    addressLine1: supplier.address_line_1 ?? "",
    addressLine2: supplier.address_line_2 ?? "",
    city: supplier.city ?? "",
    region: supplier.region ?? "",
    postalCode: supplier.postal_code ?? "",
    countryCode: supplier.country_code ?? "",
    companyRegistrationNumber: supplier.company_registration_number ?? "",
    taxNumber: supplier.tax_number ?? "",
    taxNumberType: supplier.tax_number_type ?? "",
    defaultCurrencyCode: supplier.default_currency_code ?? "",
    legacyPaymentTerms: supplier.default_payment_terms ?? "",
    paymentTermsType: (supplier.payment_terms_type as SupplierPaymentTermsType | null) ?? "",
    paymentTermsDay: supplier.payment_terms_day === null ? "" : String(supplier.payment_terms_day),
    isActive: supplier.is_active,
  };
}

function getSupplierInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SU";
}

function getXeroStatusLabel(status: SupplierXeroStatus) {
  switch (status) {
    case "linked":
      return "Linked";
    case "suggested":
      return "Suggested match";
    case "external_archived":
      return "Xero contact archived";
    case "attention_required":
      return "Needs attention";
    default:
      return "Unlinked";
  }
}

function getXeroStatusBadge(status: SupplierXeroStatus) {
  switch (status) {
    case "linked":
      return "approved" as const;
    case "suggested":
      return "pending" as const;
    case "external_archived":
      return "draft" as const;
    case "attention_required":
      return "overdue" as const;
    default:
      return "draft" as const;
  }
}

function FieldLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
      {required ? <span className="ml-1 text-[var(--error)]">*</span> : null}
    </label>
  );
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1.5 text-xs text-[var(--error)]">{message}</p>;
}

function ContactChip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function CompanySuppliersWorkspace({
  initialSuppliers,
  canEdit,
  canManageXeroContacts,
  initialXeroOverview,
}: CompanySuppliersWorkspaceProps) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [xeroOverview, setXeroOverview] = useState(initialXeroOverview);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("all");
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [formState, setFormState] = useState<SupplierFormState>(emptyFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isXeroLoading, setIsXeroLoading] = useState(false);
  const [xeroSearchQuery, setXeroSearchQuery] = useState("");
  const [xeroWorkspace, setXeroWorkspace] = useState<SupplierXeroLinkWorkspaceData | null>(null);
  const [pendingCreateContact, setPendingCreateContact] = useState<PendingCreateContactState | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<SupplierDuplicateWarning[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  useEffect(() => {
    setXeroOverview(initialXeroOverview);
  }, [initialXeroOverview]);

  const selectedSupplierId =
    modalState?.type === "detail" || modalState?.type === "edit"
      ? modalState.supplierId
      : null;

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null,
    [selectedSupplierId, suppliers]
  );
  const selectedSupplierReadiness = useMemo(
    () => (selectedSupplier ? getSupplierReadiness(selectedSupplier) : null),
    [selectedSupplier],
  );

  const filteredSuppliers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return suppliers.filter((supplier) => {
      if (statusFilter === "active" && !supplier.is_active) {
        return false;
      }
      if (statusFilter === "inactive" && supplier.is_active) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [
        getSupplierDisplayName(supplier),
        supplier.legal_name ?? "",
        getSupplierPrimaryEmail(supplier),
        getSupplierPrimaryPhone(supplier),
        supplier.default_payment_terms ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [searchQuery, statusFilter, suppliers]);

  const totalCount = suppliers.length;
  const activeCount = suppliers.filter((supplier) => supplier.is_active).length;
  const inactiveCount = totalCount - activeCount;

  useEffect(() => {
    if (modalState?.type !== "detail" || !modalState.supplierId) {
      setXeroWorkspace(null);
      setXeroSearchQuery("");
      setPendingCreateContact(null);
      return;
    }

    let cancelled = false;
    setIsXeroLoading(true);
    void loadSupplierXeroWorkspaceAction({
      supplierId: modalState.supplierId,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok && result.workspace) {
        setXeroWorkspace(result.workspace);
        setError(null);
      } else if (!result.ok) {
        setError(result.error ?? "Unable to load Xero contact links.");
      }
      setIsXeroLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [modalState]);

  function resetFeedback() {
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setDuplicateWarnings([]);
  }

  async function refreshXeroWorkspace(nextSearchTerm?: string) {
    if (!selectedSupplier) {
      return;
    }

    setIsXeroLoading(true);
    const result = await loadSupplierXeroWorkspaceAction({
      supplierId: selectedSupplier.id,
      searchTerm: nextSearchTerm ?? xeroSearchQuery,
    });

    if (result.ok && result.workspace) {
      setXeroWorkspace(result.workspace);
      setError(null);
    } else {
      setError(result.error ?? "Unable to load supplier Xero contacts.");
    }

    setIsXeroLoading(false);
  }

  async function refreshAllSupplierXeroContacts() {
    if (!canManageXeroContacts) {
      return;
    }

    resetFeedback();
    setIsXeroLoading(true);
    const result = await refreshSupplierXeroContactsAction();
    setIsXeroLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to refresh Xero contacts.");
      return;
    }

    setMessage("Xero contacts refreshed.");
    router.refresh();
  }

  async function linkSelectedXeroContact(contactId: string, options?: { relink?: boolean; matchMethod?: "manual_search" | "suggested_match" | "manual_relink" }) {
    if (!selectedSupplier || !canManageXeroContacts) {
      return;
    }

    resetFeedback();
    setIsXeroLoading(true);
    const result = await linkSupplierXeroContactAction({
      supplierId: selectedSupplier.id,
      contactId,
      allowRelink: options?.relink ?? false,
      matchMethod: options?.matchMethod ?? "manual_search",
    });
    setIsXeroLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to link the Xero contact.");
      return;
    }

    if (result.workspace) {
      setXeroWorkspace(result.workspace);
    }
    setPendingCreateContact(null);
    setMessage(options?.relink ? "Xero contact relinked." : "Xero contact linked.");
    router.refresh();
  }

  async function createXeroContactFromSupplier(allowPotentialDuplicate: boolean) {
    if (!selectedSupplier || !canManageXeroContacts) {
      return;
    }

    resetFeedback();
    setIsXeroLoading(true);
    const result = await createSupplierXeroContactAction({
      supplierId: selectedSupplier.id,
      allowPotentialDuplicate,
    });
    setIsXeroLoading(false);

    if (result.requiresDuplicateConfirmation && result.suggestions) {
      setPendingCreateContact({
        supplierId: selectedSupplier.id,
        suggestions: result.suggestions,
      });
      setError("Potential duplicate Xero contacts were found. Review them before creating another contact.");
      return;
    }

    if (!result.ok) {
      setError(result.error ?? "Unable to create the Xero contact.");
      return;
    }

    setPendingCreateContact(null);
    if (result.workspace) {
      setXeroWorkspace(result.workspace);
    }
    setMessage("Xero contact created and linked.");
    router.refresh();
  }

  async function unlinkCurrentXeroContact() {
    if (!selectedSupplier || !canManageXeroContacts) {
      return;
    }

    const confirmed = window.confirm(
      "This removes the connection between the TradesStack supplier and Xero Contact. It does not delete either record.",
    );
    if (!confirmed) {
      return;
    }

    resetFeedback();
    setIsXeroLoading(true);
    const result = await unlinkSupplierXeroContactAction({
      supplierId: selectedSupplier.id,
      confirmed: true,
    });
    setIsXeroLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to unlink the Xero contact.");
      return;
    }

    setPendingCreateContact(null);
    if (result.workspace) {
      setXeroWorkspace(result.workspace);
    }
    setMessage("Xero contact unlinked.");
    router.refresh();
  }

  function closeModal() {
    setModalState(null);
    resetFeedback();
    setFormState(emptyFormState);
    setXeroWorkspace(null);
    setXeroSearchQuery("");
    setPendingCreateContact(null);
  }

  function upsertSupplier(nextSupplier: OrganizationSupplierRow) {
    setSuppliers((current) =>
      [...current.filter((supplier) => supplier.id !== nextSupplier.id), nextSupplier].sort(
        (left, right) => getSupplierDisplayName(left).localeCompare(getSupplierDisplayName(right)),
      ),
    );
  }

  function handleSupplierSaveFailure(result: SupplierSaveActionResult) {
    setFieldErrors(result.fieldErrors ?? {});
    setDuplicateWarnings(result.warnings ?? []);
    setError(result.error ?? "Unable to save supplier.");
  }

  function openCreateModal() {
    setFormState(emptyFormState);
    resetFeedback();
    setModalState({ type: "create" });
  }

  function openDetailModal(supplier: OrganizationSupplierRow) {
    resetFeedback();
    setModalState({ type: "detail", supplierId: supplier.id });
  }

  function openEditModal(supplier: OrganizationSupplierRow) {
    setFormState(toFormState(supplier));
    resetFeedback();
    setModalState({ type: "edit", supplierId: supplier.id });
  }

  async function saveSupplier() {
    if (!canEdit || isSaving) {
      return;
    }

    setIsSaving(true);
    resetFeedback();

    try {
      const result = await saveSupplierAction({
        supplierId: modalState?.type === "edit" ? selectedSupplier?.id ?? null : null,
        confirmPotentialDuplicates: duplicateWarnings.length > 0,
        input: {
          name: formState.name,
          legalName: formState.legalName,
          primaryContactFirstName: formState.primaryContactFirstName,
          primaryContactLastName: formState.primaryContactLastName,
          primaryContactEmail: formState.primaryContactEmail,
          primaryContactPhone: formState.primaryContactPhone,
          website: formState.website,
          address: formState.legacyAddress,
          addressLine1: formState.addressLine1,
          addressLine2: formState.addressLine2,
          city: formState.city,
          region: formState.region,
          postalCode: formState.postalCode,
          countryCode: formState.countryCode,
          companyRegistrationNumber: formState.companyRegistrationNumber,
          taxNumber: formState.taxNumber,
          taxNumberType: formState.taxNumberType,
          defaultCurrencyCode: formState.defaultCurrencyCode,
          defaultPaymentTerms: formState.legacyPaymentTerms,
          paymentTermsType: formState.paymentTermsType || null,
          paymentTermsDay: formState.paymentTermsDay ? Number(formState.paymentTermsDay) : null,
          isActive: formState.isActive,
        },
      });

      if (!result.ok) {
        handleSupplierSaveFailure(result);
        return;
      }

      if (result.supplier) {
        upsertSupplier(result.supplier);
        setFormState(toFormState(result.supplier));
        setModalState({ type: "detail", supplierId: result.supplier.id });
        setMessage(modalState?.type === "edit" ? "Supplier updated." : "Supplier created.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save supplier.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleSupplierActive(nextIsActive: boolean) {
    if (!selectedSupplier || !canEdit || isSaving) {
      return;
    }

    setIsSaving(true);
    resetFeedback();

    try {
      const result = await setSupplierActiveStateAction({
        supplierId: selectedSupplier.id,
        isActive: nextIsActive,
      });

      if (!result.ok || !result.supplier) {
        handleSupplierSaveFailure(result);
        return;
      }

      upsertSupplier(result.supplier);
      if (modalState?.type === "edit") {
        setFormState(toFormState(result.supplier));
      }
      setModalState({ type: "detail", supplierId: result.supplier.id });
      setMessage(nextIsActive ? "Supplier reactivated." : "Supplier archived.");
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update supplier status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const isEditMode = modalState?.type === "create" || modalState?.type === "edit";
  const modalTitle =
    modalState?.type === "create"
      ? "Add Supplier"
      : modalState?.type === "edit"
        ? "Edit Supplier"
        : null;

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      <OperationalModuleHeader
        title="Suppliers"
        description="Keep your supplier register organized for purchase orders, procurement work, and Xero supplier identity linking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManageXeroContacts ? (
              <Button type="button" variant="secondary" onClick={() => void refreshAllSupplierXeroContacts()} disabled={isXeroLoading}>
                <RefreshCcw className="h-4 w-4" strokeWidth={2.3} />
                Refresh Xero Contacts
              </Button>
            ) : null}
            <Button type="button" onClick={openCreateModal} disabled={!canEdit}>
              <Plus className="h-4 w-4" strokeWidth={2.3} />
              Add Supplier
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <OperationalKpiCard
          label="Total Suppliers"
          value={totalCount}
          helper={`${activeCount} active`}
          icon={<Users className="h-5 w-5" strokeWidth={2.2} />}
        />
        <OperationalKpiCard
          label="Active Suppliers"
          value={activeCount}
          helper="Ready for new purchase orders"
          icon={<Building2 className="h-5 w-5" strokeWidth={2.2} />}
        />
        <OperationalKpiCard
          label="Inactive Suppliers"
          value={inactiveCount}
          helper="Preserved for historical records"
          icon={<Mail className="h-5 w-5" strokeWidth={2.2} />}
        />
      </div>

      <OperationalToolbar
        search={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search suppliers..."
              className="pl-9"
            />
          </div>
        }
        filters={(["all", "active", "inactive"] as const).map((filter) => {
          const isActive = statusFilter === filter;
          const label = filter.charAt(0).toUpperCase() + filter.slice(1);

          return (
            <Button
              key={filter}
              type="button"
              variant={isActive ? "primary" : "secondary"}
              size="sm"
              onClick={() => setStatusFilter(filter)}
            >
              {label}
            </Button>
          );
        })}
      />

      <OperationalPanel contentClassName="p-0">
        {filteredSuppliers.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState title="No matching suppliers found." />
          </div>
        ) : (
          <OperationalTable className="min-w-[760px]">
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>Supplier</OperationalTableHead>
                <OperationalTableHead>Contact</OperationalTableHead>
                <OperationalTableHead>Payment Terms</OperationalTableHead>
                <OperationalTableHead>Readiness</OperationalTableHead>
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead>Xero</OperationalTableHead>
                <OperationalTableHead className="text-right">Actions</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {filteredSuppliers.map((supplier) => {
                const displayName = getSupplierDisplayName(supplier) || "Unknown Supplier";
                const initials = getSupplierInitials(displayName);
                const readiness = getSupplierReadiness(supplier);
                const xeroState = xeroOverview.bySupplierId[supplier.id] ?? {
                  status: "unlinked" as const,
                  linkedContactId: null,
                  linkedContactName: null,
                  linkedContactStatus: null,
                  suggestionCount: 0,
                  lastSyncedAt: null,
                  lastErrorMessage: null,
                };

                return (
                  <OperationalTableRow key={supplier.id}>
                    <OperationalTableCell>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)]">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--text-primary)]">{displayName}</p>
                          {supplier.legal_name ? (
                            <p className="text-sm text-[var(--text-secondary)]">{supplier.legal_name}</p>
                          ) : null}
                        </div>
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                        {getSupplierPrimaryEmail(supplier) ? <p>{getSupplierPrimaryEmail(supplier)}</p> : null}
                        {getSupplierPrimaryPhone(supplier) ? <p>{getSupplierPrimaryPhone(supplier)}</p> : null}
                        {!getSupplierPrimaryEmail(supplier) && !getSupplierPrimaryPhone(supplier) ? (
                          <p className="text-[var(--text-muted)]">—</p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-primary)]">
                      {formatSupplierPaymentTerms(supplier) || "No payment terms"}
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <StatusBadge
                          status={
                            readiness.state === "xero_contact_ready"
                              ? "approved"
                              : readiness.state === "procurement_ready"
                                ? "pending"
                                : readiness.state === "needs_attention"
                                  ? "overdue"
                                  : "draft"
                          }
                        >
                          {readiness.state === "xero_contact_ready"
                            ? "Xero ready"
                            : readiness.state === "procurement_ready"
                              ? "Procurement ready"
                              : readiness.state === "needs_attention"
                                ? "Needs attention"
                                : "Basic"}
                        </StatusBadge>
                        {readiness.missingFields[0] ? (
                          <p className="text-xs text-[var(--text-secondary)]">{readiness.missingFields[0]}</p>
                        ) : null}
                        {readiness.invalidFields[0] ? (
                          <p className="text-xs text-rose-700">{readiness.invalidFields[0]}</p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={supplier.is_active ? "approved" : "draft"}>
                        {supplier.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <StatusBadge status={getXeroStatusBadge(xeroState.status)}>
                          {getXeroStatusLabel(xeroState.status)}
                        </StatusBadge>
                        {xeroState.linkedContactName ? (
                          <p className="text-xs text-[var(--text-secondary)]">{xeroState.linkedContactName}</p>
                        ) : xeroState.suggestionCount > 0 ? (
                          <p className="text-xs text-[var(--text-secondary)]">
                            {xeroState.suggestionCount} suggested {xeroState.suggestionCount === 1 ? "match" : "matches"}
                          </p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openDetailModal(supplier)}
                        >
                          Open
                        </Button>
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditModal(supplier)}
                          >
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                  </OperationalTableRow>
                );
              })}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <Dialog open={modalState !== null} onOpenChange={(open) => (!open ? closeModal() : undefined)}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0">
          {isEditMode ? (
            <div>
              <div className="px-7 pb-6 pt-7">
                <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                  {modalTitle}
                </h2>
              </div>

              <div className="space-y-3.5 px-7 pb-4">
                {message ? (
                  <OperationalAlert variant="success">
                    {message}
                  </OperationalAlert>
                ) : null}

                {error ? (
                  <OperationalAlert variant="error">
                    {error}
                  </OperationalAlert>
                ) : null}

                {duplicateWarnings.length > 0 ? (
                  <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--warning)]">Possible duplicate supplier</p>
                    <ul className="space-y-1 text-sm text-[var(--warning)]">
                      {duplicateWarnings.map((warning) => (
                        <li key={warning.id}>{warning.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <FieldLabel htmlFor="supplier-name" required>
                    Supplier Name
                  </FieldLabel>
                  <Input
                    id="supplier-name"
                    value={formState.name}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Acme Building Supplies"
                    disabled={!canEdit}
                  />
                  <FieldError message={fieldErrors.name} />
                </div>

                <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Supplier details</p>
                  </div>
                  <div>
                    <FieldLabel htmlFor="supplier-legal-name">Legal Name</FieldLabel>
                    <Input
                      id="supplier-legal-name"
                      value={formState.legalName}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, legalName: event.target.value }))
                      }
                      placeholder="Acme Building Supplies Limited"
                      disabled={!canEdit}
                    />
                    <FieldError message={fieldErrors.legalName} />
                  </div>
                </section>

                <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Primary contact</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-contact-first-name">First Name</FieldLabel>
                      <Input
                        id="supplier-contact-first-name"
                        value={formState.primaryContactFirstName}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            primaryContactFirstName: event.target.value,
                          }))
                        }
                        placeholder="Jane"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.primaryContactFirstName} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-contact-last-name">Last Name</FieldLabel>
                      <Input
                        id="supplier-contact-last-name"
                        value={formState.primaryContactLastName}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            primaryContactLastName: event.target.value,
                          }))
                        }
                        placeholder="Smith"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.primaryContactLastName} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-email">Email</FieldLabel>
                      <Input
                        id="supplier-email"
                        type="email"
                        value={formState.primaryContactEmail}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            primaryContactEmail: event.target.value,
                          }))
                        }
                        placeholder="accounts@supplier.com"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.primaryContactEmail} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-phone">Phone</FieldLabel>
                      <Input
                        id="supplier-phone"
                        value={formState.primaryContactPhone}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            primaryContactPhone: event.target.value,
                          }))
                        }
                        placeholder="+64 21 123 4567"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.primaryContactPhone} />
                    </div>
                  </div>

                  <div>
                    <FieldLabel htmlFor="supplier-website">Website</FieldLabel>
                    <Input
                      id="supplier-website"
                      value={formState.website}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, website: event.target.value }))
                      }
                      onBlur={() =>
                        setFormState((current) => ({
                          ...current,
                          website: normalizeSupplierWebsite(current.website) ?? "",
                        }))
                      }
                      placeholder="www.supplier.co.nz"
                      disabled={!canEdit}
                    />
                    <FieldError message={fieldErrors.website} />
                  </div>
                </section>

                <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Address</p>
                  </div>
                  <div>
                    <FieldLabel htmlFor="supplier-address-line-1">Address Line 1</FieldLabel>
                    <Input
                      id="supplier-address-line-1"
                      value={formState.addressLine1}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, addressLine1: event.target.value }))
                      }
                      placeholder="11c Airbourne Road"
                      disabled={!canEdit}
                    />
                    <FieldError message={fieldErrors.addressLine1} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="supplier-address-line-2">Address Line 2</FieldLabel>
                    <Input
                      id="supplier-address-line-2"
                      value={formState.addressLine2}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, addressLine2: event.target.value }))
                      }
                      placeholder="Unit 2"
                      disabled={!canEdit}
                    />
                    <FieldError message={fieldErrors.addressLine2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-city">City</FieldLabel>
                      <Input
                        id="supplier-city"
                        value={formState.city}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, city: event.target.value }))
                        }
                        placeholder="Auckland"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.city} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-region">Region / State</FieldLabel>
                      <Input
                        id="supplier-region"
                        value={formState.region}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, region: event.target.value }))
                        }
                        placeholder="Auckland"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.region} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-postal-code">Postcode</FieldLabel>
                      <Input
                        id="supplier-postal-code"
                        value={formState.postalCode}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, postalCode: event.target.value }))
                        }
                        placeholder="1060"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.postalCode} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-country-code">Country</FieldLabel>
                      <Input
                        id="supplier-country-code"
                        value={formState.countryCode}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, countryCode: event.target.value }))
                        }
                        placeholder="NZ"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.countryCode} />
                    </div>
                  </div>
                  {formState.legacyAddress ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Legacy Address
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                        {formState.legacyAddress}
                      </p>
                    </div>
                  ) : null}
                </section>

                <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Business and tax</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-company-registration-number">
                        Company Registration Number
                      </FieldLabel>
                      <Input
                        id="supplier-company-registration-number"
                        value={formState.companyRegistrationNumber}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            companyRegistrationNumber: event.target.value,
                          }))
                        }
                        placeholder="1234567"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.companyRegistrationNumber} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-currency">Currency</FieldLabel>
                      <Input
                        id="supplier-currency"
                        value={formState.defaultCurrencyCode}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            defaultCurrencyCode: event.target.value,
                          }))
                        }
                        placeholder="NZD"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.defaultCurrencyCode} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-tax-number">Tax Number</FieldLabel>
                      <Input
                        id="supplier-tax-number"
                        value={formState.taxNumber}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, taxNumber: event.target.value }))
                        }
                        placeholder="GST123456"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.taxNumber} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-tax-number-type">Tax Number Type</FieldLabel>
                      <Input
                        id="supplier-tax-number-type"
                        value={formState.taxNumberType}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            taxNumberType: event.target.value,
                          }))
                        }
                        placeholder="GST"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.taxNumberType} />
                    </div>
                  </div>
                </section>

                <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Payment terms</p>
                  </div>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
                    <div>
                      <FieldLabel htmlFor="supplier-payment-terms-type">Structured Terms</FieldLabel>
                      <select
                        id="supplier-payment-terms-type"
                        value={formState.paymentTermsType}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            paymentTermsType: event.target.value as SupplierFormState["paymentTermsType"],
                          }))
                        }
                        disabled={!canEdit}
                        className={FIELD_SELECT_CLASS}
                      >
                        <option value="">No structured rule</option>
                        <option value="days_after_bill_date">Days after bill date</option>
                        <option value="days_after_bill_month">Days after bill month</option>
                        <option value="of_current_month">Of current month</option>
                        <option value="of_following_month">Of following month</option>
                      </select>
                      <FieldError message={fieldErrors.paymentTermsType} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="supplier-payment-terms-day">Day</FieldLabel>
                      <Input
                        id="supplier-payment-terms-day"
                        inputMode="numeric"
                        value={formState.paymentTermsDay}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            paymentTermsDay: event.target.value,
                          }))
                        }
                        placeholder="20"
                        disabled={!canEdit}
                      />
                      <FieldError message={fieldErrors.paymentTermsDay} />
                    </div>
                  </div>
                  {formState.legacyPaymentTerms ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Legacy Payment Terms
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{formState.legacyPaymentTerms}</p>
                    </div>
                  ) : null}
                </section>

                <div>
                  <FieldLabel htmlFor="supplier-status">Status</FieldLabel>
                  <select
                    id="supplier-status"
                    value={formState.isActive ? "active" : "inactive"}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        isActive: event.target.value === "active",
                      }))
                    }
                    disabled={!canEdit}
                    className={FIELD_SELECT_CLASS}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-7 pb-7 pt-5">
                <div>
                  {modalState?.type === "edit" && selectedSupplier && canEdit ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => void toggleSupplierActive(!selectedSupplier.is_active)}
                    >
                      {selectedSupplier.is_active ? "Archive Supplier" : "Reactivate Supplier"}
                    </Button>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (selectedSupplier && modalState?.type === "edit") {
                        setModalState({ type: "detail", supplierId: selectedSupplier.id });
                        resetFeedback();
                      } else {
                        closeModal();
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void saveSupplier()}
                    disabled={!canEdit || isSaving}
                  >
                    {isSaving
                      ? "Saving..."
                      : duplicateWarnings.length > 0
                        ? "Save Anyway"
                        : modalState?.type === "edit"
                          ? "Save Changes"
                          : "Add Supplier"}
                  </Button>
                </div>
              </div>
            </div>
          ) : selectedSupplier ? (
            <div className="space-y-4 px-7 pb-7 pt-7">
              {message ? (
                <OperationalAlert variant="success">
                  {message}
                </OperationalAlert>
              ) : null}

              {error ? (
                <OperationalAlert variant="error">
                  {error}
                </OperationalAlert>
              ) : null}

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)]">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-2xl font-bold text-[var(--primary-foreground)]">
                    {getSupplierInitials(getSupplierDisplayName(selectedSupplier))}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                        {getSupplierDisplayName(selectedSupplier)}
                      </h2>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          status={
                            selectedSupplierReadiness?.state === "xero_contact_ready"
                              ? "approved"
                              : selectedSupplierReadiness?.state === "procurement_ready"
                                ? "pending"
                                : selectedSupplierReadiness?.state === "needs_attention"
                                  ? "overdue"
                                  : "draft"
                          }
                        >
                          {selectedSupplierReadiness?.state === "xero_contact_ready"
                            ? "Xero ready"
                            : selectedSupplierReadiness?.state === "procurement_ready"
                              ? "Procurement ready"
                              : selectedSupplierReadiness?.state === "needs_attention"
                                ? "Needs attention"
                                : "Basic"}
                        </StatusBadge>
                        <StatusBadge status={selectedSupplier.is_active ? "approved" : "draft"}>
                          {selectedSupplier.is_active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getSupplierPrimaryEmail(selectedSupplier) ? (
                        <ContactChip icon={<Mail className="h-4 w-4" strokeWidth={2.1} />}>
                          {getSupplierPrimaryEmail(selectedSupplier)}
                        </ContactChip>
                      ) : null}
                      {getSupplierPrimaryPhone(selectedSupplier) ? (
                        <ContactChip icon={<Phone className="h-4 w-4" strokeWidth={2.1} />}>
                          {getSupplierPrimaryPhone(selectedSupplier)}
                        </ContactChip>
                      ) : null}
                      {selectedSupplier.website ? (
                        <ContactChip icon={<Globe className="h-4 w-4" strokeWidth={2.1} />}>
                          {selectedSupplier.website}
                        </ContactChip>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <OperationalPanel
                title="Supplier Information"
                actions={
                  canEdit ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditModal(selectedSupplier)}
                    >
                      Edit details
                    </Button>
                  ) : null
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["Legal Name", selectedSupplier.legal_name || "-"],
                    ["Primary Contact", [selectedSupplier.primary_contact_first_name, selectedSupplier.primary_contact_last_name].filter(Boolean).join(" ") || "-"],
                    ["Email", getSupplierPrimaryEmail(selectedSupplier) || "-"],
                    ["Phone", getSupplierPrimaryPhone(selectedSupplier) || "-"],
                    ["Website", selectedSupplier.website || "-"],
                    ["Payment Terms", formatSupplierPaymentTerms(selectedSupplier) || "-"],
                    ["Currency", selectedSupplier.default_currency_code || "-"],
                    ["Company Registration Number", selectedSupplier.company_registration_number || "-"],
                    ["Tax Number", selectedSupplier.tax_number || "-"],
                    ["Tax Number Type", selectedSupplier.tax_number_type || "-"],
                    ["Status", selectedSupplier.is_active ? "Active" : "Inactive"],
                  ].map(([label, value]) => (
                    <div key={label} className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        {label}
                      </p>
                      <p className="text-sm text-[var(--text-primary)]">{value}</p>
                    </div>
                  ))}
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Address
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                      {getSupplierAddressDisplay(selectedSupplier) || "-"}
                    </p>
                  </div>
                </div>
              </OperationalPanel>

              <OperationalPanel title="Readiness">
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Supplier readiness is computed from the current master data and never blocks normal supplier usage.
                  </p>
                  {selectedSupplierReadiness && selectedSupplierReadiness.missingFields.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Missing Recommended Fields
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedSupplierReadiness.missingFields.map((item) => (
                          <span key={item} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedSupplierReadiness && selectedSupplierReadiness.invalidFields.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Invalid Fields
                      </p>
                      <div className="mt-2 space-y-1">
                        {selectedSupplierReadiness.invalidFields.map((item) => (
                          <p key={item} className="text-sm text-rose-700">
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </OperationalPanel>

              <OperationalPanel
                title="Xero Contact Link"
                actions={
                  canManageXeroContacts ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void refreshXeroWorkspace()}
                        disabled={isXeroLoading}
                      >
                        Refresh View
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void refreshAllSupplierXeroContacts()}
                        disabled={isXeroLoading}
                      >
                        Refresh Xero Contacts
                      </Button>
                    </div>
                  ) : null
                }
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={getXeroStatusBadge(xeroWorkspace?.currentLink?.status ?? xeroOverview.bySupplierId[selectedSupplier.id]?.status ?? "unlinked")}>
                      {getXeroStatusLabel(xeroWorkspace?.currentLink?.status ?? xeroOverview.bySupplierId[selectedSupplier.id]?.status ?? "unlinked")}
                    </StatusBadge>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Imported contacts: {xeroWorkspace?.importedContactCount ?? xeroOverview.importedContactCount}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Last successful contact sync: {xeroWorkspace?.lastContactsSyncAt ? new Date(xeroWorkspace.lastContactsSyncAt).toLocaleString() : "Not yet"}
                    </p>
                  </div>

                  {xeroWorkspace?.connectionStatus !== "connected" ? (
                    <OperationalAlert variant="warning">
                      Connect Xero and select an active tenant before linking supplier contacts.
                    </OperationalAlert>
                  ) : null}

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Current link</p>
                        {xeroWorkspace?.currentLink ? (
                          <>
                            <p className="text-sm text-[var(--text-primary)]">
                              {xeroWorkspace.currentLink.externalContactName ?? xeroWorkspace.currentLink.externalContactId}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              ContactID: {xeroWorkspace.currentLink.externalContactId}
                            </p>
                            {xeroWorkspace.currentLink.externalContactStatus ? (
                              <p className="text-xs text-[var(--text-secondary)]">
                                Xero status: {xeroWorkspace.currentLink.externalContactStatus}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-sm text-[var(--text-secondary)]">No Xero contact is linked to this supplier.</p>
                        )}
                      </div>
                      {canManageXeroContacts && xeroWorkspace?.currentLink ? (
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={() => void unlinkCurrentXeroContact()} disabled={isXeroLoading}>
                            Unlink
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs text-[var(--text-secondary)]">
                      Supplier identity linking is separate from TradesStack routing codes and Xero account-code mapping. Supplier invoices still do not export to Xero in this phase.
                    </p>
                  </div>

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="flex-1">
                        <FieldLabel htmlFor="supplier-xero-search">Search imported Xero contacts</FieldLabel>
                        <Input
                          id="supplier-xero-search"
                          value={xeroSearchQuery}
                          onChange={(event) => setXeroSearchQuery(event.target.value)}
                          placeholder="Search by name, email, account number, or phone"
                          disabled={isXeroLoading}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void refreshXeroWorkspace(xeroSearchQuery)}
                        disabled={isXeroLoading || xeroWorkspace?.connectionStatus !== "connected"}
                      >
                        <Search className="h-4 w-4" strokeWidth={2.1} />
                        Search
                      </Button>
                    </div>

                    {xeroWorkspace?.searchResults && xeroWorkspace.searchResults.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {xeroWorkspace.searchResults.map((result) => {
                          const linkedElsewhere =
                            result.linkedSupplierId && result.linkedSupplierId !== selectedSupplier.id;
                          return (
                            <div key={result.contactId} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 md:flex-row md:items-center md:justify-between">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{result.name}</p>
                                <p className="text-xs text-[var(--text-secondary)]">ContactID: {result.contactId}</p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {[result.email, result.phone ?? result.mobile, result.accountNumber].filter(Boolean).join(" · ") || "No contact summary"}
                                </p>
                                {result.contactStatus === "ARCHIVED" ? (
                                  <p className="text-xs text-amber-700">Archived in Xero</p>
                                ) : null}
                                {linkedElsewhere ? (
                                  <p className="text-xs text-rose-700">Already linked to another supplier</p>
                                ) : null}
                              </div>
                              {canManageXeroContacts ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={Boolean(linkedElsewhere) || isXeroLoading}
                                  onClick={() =>
                                    void linkSelectedXeroContact(result.contactId, {
                                      relink: Boolean(xeroWorkspace?.currentLink),
                                      matchMethod: xeroWorkspace?.currentLink ? "manual_relink" : "manual_search",
                                    })
                                  }
                                >
                                  {xeroWorkspace?.currentLink ? "Relink" : "Link"}
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : xeroSearchQuery.trim() ? (
                      <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                        No imported Xero contacts matched this search.
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Suggested matches</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Suggestions are deterministic and never auto-link on fuzzy name similarity alone.
                        </p>
                      </div>
                      {canManageXeroContacts ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void createXeroContactFromSupplier(false)}
                          disabled={isXeroLoading || xeroWorkspace?.connectionStatus !== "connected"}
                        >
                          <Link2 className="h-4 w-4" strokeWidth={2.1} />
                          Create Xero Contact
                        </Button>
                      ) : null}
                    </div>

                    {pendingCreateContact?.supplierId === selectedSupplier.id ? (
                      <div className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-sm font-semibold text-amber-950">Potential duplicates found</p>
                        <p className="mt-1 text-sm text-amber-900">
                          Review the suggested matches first. Continue only if you still want to create a new Xero contact for this supplier.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button type="button" size="sm" onClick={() => void createXeroContactFromSupplier(true)} disabled={isXeroLoading}>
                            Create Anyway
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setPendingCreateContact(null)} disabled={isXeroLoading}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {xeroWorkspace?.suggestions && xeroWorkspace.suggestions.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {xeroWorkspace.suggestions.map((suggestion) => {
                          const linkedElsewhere =
                            suggestion.linkedSupplierId && suggestion.linkedSupplierId !== selectedSupplier.id;
                          return (
                            <div key={suggestion.contactId} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 md:flex-row md:items-center md:justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-[var(--text-primary)]">{suggestion.name}</p>
                                  <StatusBadge status={suggestion.matchLabel === "strong" ? "approved" : "pending"}>
                                    {suggestion.matchLabel === "strong" ? "Strong match" : "Possible match"}
                                  </StatusBadge>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)]">{suggestion.reasons.join(" · ")}</p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {[suggestion.email, suggestion.phone ?? suggestion.mobile, suggestion.accountNumber].filter(Boolean).join(" · ") || "No contact summary"}
                                </p>
                                {linkedElsewhere ? (
                                  <p className="text-xs text-rose-700">Already linked to another supplier</p>
                                ) : null}
                              </div>
                              {canManageXeroContacts ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={Boolean(linkedElsewhere) || isXeroLoading}
                                  onClick={() =>
                                    void linkSelectedXeroContact(suggestion.contactId, {
                                      relink: Boolean(xeroWorkspace?.currentLink),
                                      matchMethod: xeroWorkspace?.currentLink ? "manual_relink" : "suggested_match",
                                    })
                                  }
                                >
                                  {xeroWorkspace?.currentLink ? "Relink" : "Link suggestion"}
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                        No deterministic Xero contact suggestions are available for this supplier yet.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2.1} />
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Recent link activity</p>
                    </div>
                    {xeroWorkspace?.activity && xeroWorkspace.activity.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {xeroWorkspace.activity.map((activity) => (
                          <div key={activity.id} className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
                            <p className="text-sm text-[var(--text-primary)]">{activity.message}</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{new Date(activity.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                        No Xero supplier-link activity has been recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              </OperationalPanel>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => void toggleSupplierActive(!selectedSupplier.is_active)}
                    >
                      {selectedSupplier.is_active ? "Archive Supplier" : "Reactivate Supplier"}
                    </Button>
                  ) : null}
                </div>
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
