"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Building2, Globe, Mail, Phone, Plus, Search, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
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

const fieldInputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`;
const fieldTextAreaClass = `${ibmPlexSans.className} w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`;

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
    <label
      htmlFor={htmlFor}
      className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}
    >
      {children}
      {required ? <span className="ml-1 text-[#FF4C14]">*</span> : null}
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
    <span
      className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-full border border-[#E2E8F1] bg-white px-3 py-2 text-[14px] font-medium text-[#4B5D79]`}
    >
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
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="flex items-start justify-between gap-4 pt-[25px]">
        <div>
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            Suppliers
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Keep your supplier register organized for purchase orders and procurement work.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={!canEdit}
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[#F15A29] bg-[#F15A29] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          Add Supplier
        </button>
      </section>

      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <CardContent className="p-0">
              <div className="grid gap-3 p-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#FFE5D9]">
                  <Users className="h-5 w-5 text-[#F15A29]" strokeWidth={2.2} />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>
                  Total Suppliers
                </p>
                <p className={`${ibmPlexSans.className} text-[clamp(2.1rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>
                  {totalCount}
                </p>
                <p className={`${ibmPlexSans.className} text-[14px] font-medium text-[#4B5D79]`}>
                  {activeCount} active
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <CardContent className="p-0">
              <div className="grid gap-3 p-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#DFF1E5]">
                  <Building2 className="h-5 w-5 text-[#18384C]" strokeWidth={2.2} />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>
                  Active Suppliers
                </p>
                <p className={`${ibmPlexSans.className} text-[clamp(2.1rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>
                  {activeCount}
                </p>
                <p className={`${ibmPlexSans.className} text-[14px] font-medium text-[#18384C]`}>
                  Ready for new purchase orders
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
            <CardContent className="p-0">
              <div className="grid gap-3 p-4">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[#E8EEF2]">
                  <Mail className="h-5 w-5 text-[#0E172B]" strokeWidth={2.2} />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>
                  Inactive Suppliers
                </p>
                <p className={`${ibmPlexSans.className} text-[clamp(2.1rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>
                  {inactiveCount}
                </p>
                <p className={`${ibmPlexSans.className} text-[14px] font-medium text-[#4B5D79]`}>
                  Preserved for historical records
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex flex-col items-start gap-3 md:flex-row md:items-center">
          <div className="flex h-[42px] flex-1 items-center gap-2 rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3">
            <Search className="h-4 w-4 text-[#9AAAB8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search suppliers..."
              className={`${ibmPlexSans.className} h-full flex-1 border-0 bg-transparent text-[14px] text-[#1d1d1d] outline-none placeholder:text-[#9AAAB8]`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "active", "inactive"] as const).map((filter) => {
              const isActive = statusFilter === filter;
              const label = filter.charAt(0).toUpperCase() + filter.slice(1);

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`${ibmPlexSans.className} inline-flex h-[42px] items-center rounded-[0.8rem] px-5 text-[14px] font-semibold transition ${
                    isActive
                      ? "bg-[#0B2739] text-white"
                      : "border border-[#E2E8F1] bg-white text-[#10283B] hover:bg-[#EEF3F9]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
          <CardContent className="p-0">
            {filteredSuppliers.length === 0 ? (
              <div className="px-6 pb-6 pt-6">
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                    No matching suppliers found.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                      {["Supplier", "Contact", "Payment Terms", "Status", "Actions"].map((heading) => (
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
                    {filteredSuppliers.map((supplier) => {
                      const displayName = getSupplierDisplayName(supplier) || "Unknown Supplier";
                      const initials = getSupplierInitials(displayName);

                      return (
                        <tr
                          key={supplier.id}
                          className="group border-b border-[#E2E8F1] last:border-0 transition-colors hover:bg-[#F8FBFB]"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span
                                className={`${ibmPlexSans.className} inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F15A29] text-[13px] font-semibold text-white`}
                              >
                                {initials}
                              </span>
                              <div>
                                <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                                  {displayName}
                                </p>
                                {supplier.legal_name ? (
                                  <p className={`${ibmPlexSans.className} text-[13px] text-[#6A7A89]`}>
                                    {supplier.legal_name}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {supplier.email ? (
                                <p className={`${ibmPlexSans.className} text-[13px] text-[#4B5D79]`}>
                                  {supplier.email}
                                </p>
                              ) : null}
                              {supplier.phone ? (
                                <p className={`${ibmPlexSans.className} text-[13px] text-[#4B5D79]`}>
                                  {supplier.phone}
                                </p>
                              ) : null}
                              {!supplier.email && !supplier.phone ? (
                                <p className={`${ibmPlexSans.className} text-[13px] text-[#B0BEC8]`}>—</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>
                              {supplier.default_payment_terms || "No payment terms"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                                supplier.is_active
                                  ? "bg-[#DCFCE7] text-[#15803D]"
                                  : "bg-[#F1F5F9] text-[#64748B]"
                              }`}
                            >
                              {supplier.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openDetailModal(supplier)}
                                className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                              >
                                Open
                              </button>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(supplier)}
                                  className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                                >
                                  Edit
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalState !== null} onOpenChange={(open) => (!open ? closeModal() : undefined)}>
        <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
          {isEditMode ? (
            <div>
              <div className="px-7 pb-6 pt-7">
                <h2
                  className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}
                >
                  {modalTitle}
                </h2>
              </div>

              <div className="space-y-3.5 px-7 pb-4">
                {message ? (
                  <div className={`${interMedium.className} rounded-[10px] border border-[#CDE9DA] bg-[#EAF8F1] px-4 py-3 text-sm text-[#166534]`}>
                    {message}
                  </div>
                ) : null}

                {error ? (
                  <div className={`${interMedium.className} rounded-[10px] border border-[#F5C2C7] bg-[#FFF1F2] px-4 py-3 text-sm text-[#B42318]`}>
                    {error}
                  </div>
                ) : null}

                {duplicateWarnings.length > 0 ? (
                  <div className="space-y-2 rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                    <p className={`${interMedium.className} text-sm font-semibold text-[#92400E]`}>
                      Possible duplicate supplier
                    </p>
                    <ul className={`${interMedium.className} space-y-1 text-sm text-[#92400E]`}>
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
                    className={fieldInputClass}
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
                    className={fieldInputClass}
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
                      className={fieldInputClass}
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
                      className={fieldInputClass}
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
                    className={fieldInputClass}
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
                    className={fieldTextAreaClass}
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
                    className={fieldInputClass}
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
                    className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-7 pb-7 pt-5">
                <div>
                  {modalState?.type === "edit" && selectedSupplier && canEdit ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void toggleSupplierActive(!selectedSupplier.is_active)}
                      className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {selectedSupplier.is_active ? "Archive Supplier" : "Reactivate Supplier"}
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSupplier && modalState?.type === "edit") {
                        setModalState({ type: "detail", supplierId: selectedSupplier.id });
                        resetFeedback();
                      } else {
                        closeModal();
                      }
                    }}
                    className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSupplier()}
                    disabled={!canEdit || isSaving}
                    className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isSaving
                      ? "Saving..."
                      : modalState?.type === "edit"
                        ? "Save Changes"
                        : "Add Supplier"}
                  </button>
                </div>
              </div>
            </div>
          ) : selectedSupplier ? (
            <div className="space-y-4 px-7 pb-7 pt-7">
              {message ? (
                <div className={`${interMedium.className} rounded-[10px] border border-[#CDE9DA] bg-[#EAF8F1] px-4 py-3 text-sm text-[#166534]`}>
                  {message}
                </div>
              ) : null}

              {error ? (
                <div className={`${interMedium.className} rounded-[10px] border border-[#F5C2C7] bg-[#FFF1F2] px-4 py-3 text-sm text-[#B42318]`}>
                  {error}
                </div>
              ) : null}

              <div className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <div className="p-[1.35rem_1.5rem_1.15rem]">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f15a29_0%,#ff4c14_100%)] text-[1.65rem] font-bold text-white">
                      {getSupplierInitials(getSupplierDisplayName(selectedSupplier))}
                    </span>
                    <div className="min-w-0 flex-1 space-y-[0.65rem]">
                      <div className="flex items-center justify-between gap-4">
                        <h2 className={`${ibmPlexSans.className} m-0 text-[1.7rem] font-bold leading-none tracking-[-0.03em] text-[#1d1d1d]`}>
                          {getSupplierDisplayName(selectedSupplier)}
                        </h2>
                        <span
                          className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-4 py-[0.55rem] text-[14px] font-semibold whitespace-nowrap ${
                            selectedSupplier.is_active
                              ? "bg-[#DFF7E4] text-[#15803D]"
                              : "bg-[#F1F5F9] text-[#64748B]"
                          }`}
                        >
                          {selectedSupplier.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-[1.1rem_1.4rem]">
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
              </div>

              <Card className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F1] px-6 py-4">
                    <p className={`${ibmPlexSans.className} text-[1.4rem] font-semibold leading-none tracking-[-0.03em] text-[#1d1d1d]`}>
                      Supplier Information
                    </p>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(selectedSupplier)}
                        className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                      >
                        Edit details
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                    {[
                      ["Legal Name", selectedSupplier.legal_name || "-"],
                      ["Email", selectedSupplier.email || "-"],
                      ["Phone", selectedSupplier.phone || "-"],
                      ["Website", selectedSupplier.website || "-"],
                      ["Payment Terms", selectedSupplier.default_payment_terms || "-"],
                      ["Status", selectedSupplier.is_active ? "Active" : "Inactive"],
                    ].map(([label, value]) => (
                      <div key={label} className="space-y-1">
                        <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#6A7A89]`}>
                          {label}
                        </p>
                        <p className={`${ibmPlexSans.className} text-[15px] text-[#10283B]`}>
                          {value}
                        </p>
                      </div>
                    ))}
                    <div className="space-y-1 md:col-span-2">
                      <p className={`${ibmPlexSans.className} text-[13px] font-semibold text-[#6A7A89]`}>
                        Address
                      </p>
                      <p className={`${ibmPlexSans.className} whitespace-pre-wrap text-[15px] text-[#10283B]`}>
                        {selectedSupplier.address || "-"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void toggleSupplierActive(!selectedSupplier.is_active)}
                      className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {selectedSupplier.is_active ? "Archive Supplier" : "Reactivate Supplier"}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
