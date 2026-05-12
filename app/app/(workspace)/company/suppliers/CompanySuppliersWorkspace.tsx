"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Building2, Globe, Mail, Phone, Plus, Search, Users } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalPageHeader } from "@/components/app/OperationalPageHeader";
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
  getSupplierDisplayName,
  getSupplierDuplicateWarnings,
  type OrganizationSupplierRow,
} from "@/lib/suppliers";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type CompanySuppliersWorkspaceProps = {
  organizationId: string;
  initialSuppliers: OrganizationSupplierRow[];
  canEdit: boolean;
};

type SupplierStatusFilter = "all" | "active" | "inactive";

type SupplierFormState = {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  paymentTerms: string;
  isActive: boolean;
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; supplierId: string }
  | { type: "edit"; supplierId: string };

const emptyFormState: SupplierFormState = {
  name: "",
  legalName: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  paymentTerms: "",
  isActive: true,
};

const FIELD_TEXTAREA_CLASS =
  "flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function toFormState(supplier: OrganizationSupplierRow | null): SupplierFormState {
  if (!supplier) {
    return emptyFormState;
  }

  return {
    name: getSupplierDisplayName(supplier),
    legalName: supplier.legal_name ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    website: supplier.website ?? "",
    address: supplier.address ?? "",
    paymentTerms: supplier.default_payment_terms ?? "",
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
  organizationId,
  initialSuppliers,
  canEdit,
}: CompanySuppliersWorkspaceProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("all");
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [formState, setFormState] = useState<SupplierFormState>(emptyFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSupplierId =
    modalState?.type === "detail" || modalState?.type === "edit"
      ? modalState.supplierId
      : null;

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null,
    [selectedSupplierId, suppliers]
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
        supplier.email ?? "",
        supplier.phone ?? "",
        supplier.default_payment_terms ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [searchQuery, statusFilter, suppliers]);

  const duplicateWarnings = useMemo(
    () =>
      getSupplierDuplicateWarnings({
        suppliers,
        supplierId: modalState?.type === "edit" ? modalState.supplierId : null,
        name: formState.name,
        email: formState.email,
      }),
    [formState.email, formState.name, modalState, suppliers]
  );

  const totalCount = suppliers.length;
  const activeCount = suppliers.filter((supplier) => supplier.is_active).length;
  const inactiveCount = totalCount - activeCount;

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  function closeModal() {
    setModalState(null);
    resetFeedback();
    setFormState(emptyFormState);
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

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setError("Supplier name is required.");
      return;
    }

    setIsSaving(true);
    resetFeedback();

    try {
      const payload = {
        organization_id: organizationId,
        name: trimmedName,
        company_name: trimmedName,
        legal_name: formState.legalName.trim() || null,
        email: formState.email.trim() || null,
        phone: formState.phone.trim() || null,
        website: formState.website.trim() || null,
        address: formState.address.trim() || null,
        default_payment_terms: formState.paymentTerms.trim(),
        is_active: formState.isActive,
      };

      if (modalState?.type === "edit" && selectedSupplier) {
        const { data, error: updateError } = await supabase
          .from("organization_suppliers")
          .update(payload)
          .eq("id", selectedSupplier.id)
          .eq("organization_id", organizationId)
          .select("*")
          .single();

        if (updateError || !data) {
          throw new Error(updateError?.message ?? "Unable to update supplier.");
        }

        setSuppliers((current) =>
          current
            .map((supplier) => (supplier.id === data.id ? data : supplier))
            .sort((left, right) =>
              getSupplierDisplayName(left).localeCompare(getSupplierDisplayName(right))
            )
        );
        setFormState(toFormState(data));
        setModalState({ type: "detail", supplierId: data.id });
        setMessage("Supplier updated.");
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("You must be signed in to create a supplier.");
        }

        const { data, error: insertError } = await supabase
          .from("organization_suppliers")
          .insert({
            ...payload,
            created_by: user.id,
            source: "manual",
          })
          .select("*")
          .single();

        if (insertError || !data) {
          throw new Error(insertError?.message ?? "Unable to create supplier.");
        }

        setSuppliers((current) =>
          [...current, data].sort((left, right) =>
            getSupplierDisplayName(left).localeCompare(getSupplierDisplayName(right))
          )
        );
        setFormState(toFormState(data));
        setModalState({ type: "detail", supplierId: data.id });
        setMessage("Supplier created.");
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
      const { data, error: updateError } = await supabase
        .from("organization_suppliers")
        .update({ is_active: nextIsActive })
        .eq("id", selectedSupplier.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message ?? "Unable to update supplier status.");
      }

      setSuppliers((current) =>
        current
          .map((supplier) => (supplier.id === data.id ? data : supplier))
          .sort((left, right) =>
            getSupplierDisplayName(left).localeCompare(getSupplierDisplayName(right))
          )
      );
      if (modalState?.type === "edit") {
        setFormState(toFormState(data));
      }
      setModalState({ type: "detail", supplierId: data.id });
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
      <OperationalPageHeader
        title="Suppliers"
        description="Keep your supplier register organized for purchase orders and procurement work."
        actions={
          <Button type="button" onClick={openCreateModal} disabled={!canEdit}>
            <Plus className="h-4 w-4" strokeWidth={2.3} />
            Add Supplier
          </Button>
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
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead className="text-right">Actions</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {filteredSuppliers.map((supplier) => {
                const displayName = getSupplierDisplayName(supplier) || "Unknown Supplier";
                const initials = getSupplierInitials(displayName);

                return (
                  <OperationalTableRow key={supplier.id}>
                    <OperationalTableCell>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--orange-primary)] text-sm font-semibold text-[var(--primary-foreground)]">
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
                        {supplier.email ? <p>{supplier.email}</p> : null}
                        {supplier.phone ? <p>{supplier.phone}</p> : null}
                        {!supplier.email && !supplier.phone ? (
                          <p className="text-[var(--text-muted)]">—</p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-primary)]">
                      {supplier.default_payment_terms || "No payment terms"}
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={supplier.is_active ? "approved" : "draft"}>
                        {supplier.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
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
        <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto p-0">
          {isEditMode ? (
            <div>
              <div className="px-7 pb-6 pt-7">
                <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                  {modalTitle}
                </h2>
              </div>

              <div className="space-y-3.5 px-7 pb-4">
                {message ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--success-light)] bg-[var(--success-light)] px-4 py-3 text-sm text-[var(--success)]">
                    {message}
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--error)]">
                    {error}
                  </div>
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="supplier-email">Email</FieldLabel>
                    <Input
                      id="supplier-email"
                      type="email"
                      value={formState.email}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, email: event.target.value }))
                      }
                      placeholder="accounts@supplier.com"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="supplier-phone">Phone</FieldLabel>
                    <Input
                      id="supplier-phone"
                      value={formState.phone}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, phone: event.target.value }))
                      }
                      placeholder="+64 21 123 4567"
                      disabled={!canEdit}
                    />
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
                    placeholder="https://supplier.co.nz"
                    disabled={!canEdit}
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="supplier-address">Address</FieldLabel>
                  <textarea
                    id="supplier-address"
                    rows={3}
                    value={formState.address}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, address: event.target.value }))
                    }
                    placeholder="Level 2, 123 Example Street, Auckland"
                    disabled={!canEdit}
                    className={FIELD_TEXTAREA_CLASS}
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="supplier-payment-terms">Payment Terms</FieldLabel>
                  <Input
                    id="supplier-payment-terms"
                    value={formState.paymentTerms}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        paymentTerms: event.target.value,
                      }))
                    }
                    placeholder="20th of following month"
                    disabled={!canEdit}
                  />
                </div>

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
                <div className="rounded-[var(--radius-md)] border border-[var(--success-light)] bg-[var(--success-light)] px-4 py-3 text-sm text-[var(--success)]">
                  {message}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--error)]">
                  {error}
                </div>
              ) : null}

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)]">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--orange-primary)] text-2xl font-bold text-[var(--primary-foreground)]">
                    {getSupplierInitials(getSupplierDisplayName(selectedSupplier))}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                        {getSupplierDisplayName(selectedSupplier)}
                      </h2>
                      <StatusBadge status={selectedSupplier.is_active ? "approved" : "draft"}>
                        {selectedSupplier.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedSupplier.email ? (
                        <ContactChip icon={<Mail className="h-4 w-4" strokeWidth={2.1} />}>
                          {selectedSupplier.email}
                        </ContactChip>
                      ) : null}
                      {selectedSupplier.phone ? (
                        <ContactChip icon={<Phone className="h-4 w-4" strokeWidth={2.1} />}>
                          {selectedSupplier.phone}
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
                    ["Email", selectedSupplier.email || "-"],
                    ["Phone", selectedSupplier.phone || "-"],
                    ["Website", selectedSupplier.website || "-"],
                    ["Payment Terms", selectedSupplier.default_payment_terms || "-"],
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
                      {selectedSupplier.address || "-"}
                    </p>
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
