"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText, Plus, Search, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import {
  buildSupplierInvoiceDocumentStoragePath,
  deriveSupplierInvoiceDisplayStatus,
  getSourceLabel,
  getSupplierInvoiceStatusClassName,
  SUPPLIER_INVOICE_DOCUMENTS_BUCKET,
  toDayMonthYearLabel,
  toMoney,
  type SupplierInvoiceDisplayStatus,
  type SupplierInvoiceRow,
  validateSupplierInvoiceDocument,
} from "@/lib/supplier-invoices";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type CompanySupplierInvoicesWorkspaceProps = {
  organizationId: string;
  initialInvoices: SupplierInvoiceRow[];
  invoiceMatchSummaries: Record<
    string,
    {
      activeMatchCount: number;
      approvedAllocationTotal: number;
      disputedAllocationTotal: number;
    }
  >;
  suppliers: OrganizationSupplierRow[];
  canWrite: boolean;
};

type CreateInvoiceFormState = {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string;
  file: File | null;
};

const emptyFormState: CreateInvoiceFormState = {
  supplierId: "",
  invoiceNumber: "",
  invoiceDate: "",
  dueDate: "",
  subtotal: "0.00",
  taxTotal: "0.00",
  total: "0.00",
  notes: "",
  file: null,
};

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}
    >
      {children}
    </label>
  );
}

const inputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`;

function numberString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CompanySupplierInvoicesWorkspace({
  organizationId,
  initialInvoices,
  invoiceMatchSummaries,
  suppliers,
  canWrite,
}: CompanySupplierInvoicesWorkspaceProps) {
  const router = useRouter();
  const { session } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<CreateInvoiceFormState>(emptyFormState);
  const statusFilters = useMemo(
    () =>
      [
        "all",
        "Captured",
        "Needs Review",
        "Partially Approved",
        "Approved",
        "Disputed",
      ] as const,
    []
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | SupplierInvoiceDisplayStatus
  >("all");

  const supplierNameById = useMemo(
    () =>
      new Map(
        suppliers.map((supplier) => [
          supplier.id,
          supplier.company_name?.trim() || supplier.name?.trim() || "Unknown Supplier",
        ])
      ),
    [suppliers]
  );
  const invoiceDisplayStatuses = useMemo(
    () =>
      Object.fromEntries(
        invoices.map((invoice) => {
          const summary = invoiceMatchSummaries[invoice.id] ?? {
            activeMatchCount: 0,
            approvedAllocationTotal: 0,
            disputedAllocationTotal: 0,
          };

          return [
            invoice.id,
            deriveSupplierInvoiceDisplayStatus({
              storedStatus: invoice.status,
              invoiceTotal: Number(invoice.total ?? 0),
              activeMatchCount: summary.activeMatchCount,
              approvedAllocationTotal: summary.approvedAllocationTotal,
              disputedAllocationTotal: summary.disputedAllocationTotal,
            }),
          ] as const;
        })
      ) as Record<string, SupplierInvoiceDisplayStatus>,
    [invoiceMatchSummaries, invoices]
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const displayStatus = invoiceDisplayStatuses[invoice.id] ?? invoice.status;

      if (statusFilter !== "all" && displayStatus !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const supplierName = invoice.supplier_id
        ? supplierNameById.get(invoice.supplier_id) ?? ""
        : "";

      return [
        invoice.invoice_number ?? "",
        supplierName,
        displayStatus,
        invoice.source,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [invoiceDisplayStatuses, invoices, searchQuery, statusFilter, supplierNameById]);

  function closeCreateModal() {
    setIsCreateOpen(false);
    setFormState(emptyFormState);
    setError(null);
  }

  async function createInvoice(nextStatus: "Captured" | "Needs Review") {
    if (!canWrite || isSaving) {
      return;
    }

    if (!session?.id) {
      setError("You must be signed in to create an invoice.");
      return;
    }

    const invoiceId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const file = formState.file;
    let uploadedStoragePath: string | null = null;
    let createdInvoiceId: string | null = null;

    setIsSaving(true);
    setError(null);

    try {
      if (file) {
        validateSupplierInvoiceDocument(file);
      }

      const normalizedSubtotal = numberString(formState.subtotal);
      const normalizedTaxTotal = numberString(formState.taxTotal);
      const normalizedTotal = numberString(formState.total);

      const { data: insertedInvoice, error: insertError } = await supabase
        .from("supplier_invoices")
        .insert({
          id: invoiceId,
          organization_id: organizationId,
          supplier_id: formState.supplierId || null,
          invoice_number: formState.invoiceNumber.trim(),
          invoice_date: formState.invoiceDate || null,
          due_date: formState.dueDate || null,
          subtotal: normalizedSubtotal,
          tax_total: normalizedTaxTotal,
          total: normalizedTotal,
          currency: "NZD",
          status: nextStatus,
          source: file ? "upload" : "manual",
          notes: formState.notes.trim(),
          created_by: session.id,
        })
        .select("*")
        .single();

      if (insertError || !insertedInvoice) {
        throw new Error(insertError?.message ?? "Unable to create invoice.");
      }

      createdInvoiceId = insertedInvoice.id;

      if (file) {
        const storagePath = buildSupplierInvoiceDocumentStoragePath({
          organizationId,
          supplierInvoiceId: invoiceId,
          documentId,
          fileName: file.name,
        });
        uploadedStoragePath = storagePath;

        const { error: uploadError } = await supabase.storage
          .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { error: documentInsertError } = await supabase
          .from("supplier_invoice_documents")
          .insert({
            id: documentId,
            organization_id: organizationId,
            supplier_invoice_id: invoiceId,
            file_path: storagePath,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            document_type: "invoice",
            uploaded_by: session.id,
          });

        if (documentInsertError) {
          throw new Error(documentInsertError.message);
        }

        const { error: headerUpdateError } = await supabase
          .from("supplier_invoices")
          .update({
            document_file_path: storagePath,
            document_file_name: file.name,
            document_mime_type: file.type || null,
            document_size_bytes: file.size,
          })
          .eq("id", invoiceId)
          .eq("organization_id", organizationId);

        if (headerUpdateError) {
          throw new Error(headerUpdateError.message);
        }

        insertedInvoice.document_file_path = storagePath;
        insertedInvoice.document_file_name = file.name;
        insertedInvoice.document_mime_type = file.type || null;
        insertedInvoice.document_size_bytes = file.size;
      }

      setInvoices((current) => [insertedInvoice, ...current]);
      closeCreateModal();
      router.push(`/app/company/supplier-invoices/${invoiceId}`);
    } catch (createError) {
      if (uploadedStoragePath) {
        await supabase.storage
          .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
          .remove([uploadedStoragePath]);
      }

      if (createdInvoiceId) {
        await supabase
          .from("supplier_invoices")
          .delete()
          .eq("id", createdInvoiceId)
          .eq("organization_id", organizationId);
      }

      setError(createError instanceof Error ? createError.message : "Unable to create invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  const displayStatusCounts = useMemo(
    () =>
      invoices.reduce<Record<SupplierInvoiceDisplayStatus, number>>(
        (counts, invoice) => {
          const displayStatus = invoiceDisplayStatuses[invoice.id] ?? invoice.status;
          counts[displayStatus] += 1;
          return counts;
        },
        {
          Captured: 0,
          "Needs Review": 0,
          "Partially Approved": 0,
          Approved: 0,
          Disputed: 0,
        }
      ),
    [invoiceDisplayStatuses, invoices]
  );

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="flex items-start justify-between gap-4 pt-[25px]">
        <div>
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            Supplier Invoices
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Capture supplier invoices separately from purchase orders and review them before approval.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setIsCreateOpen(true);
          }}
          disabled={!canWrite}
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[#F15A29] bg-[#F15A29] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          New Supplier Invoice
        </button>
      </section>

      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Captured",
              value: displayStatusCounts.Captured,
              meta: "Saved but not yet reviewed",
              icon: Upload,
              iconClassName: "bg-[#FFE5D9] text-[#F15A29]",
              metaClassName: "text-[#4B5D79]",
            },
            {
              label: "Needs Review",
              value: displayStatusCounts["Needs Review"],
              meta: "Ready for review and approval",
              icon: FileText,
              iconClassName: "bg-[#FEF3C7] text-[#92400E]",
              metaClassName: "text-[#92400E]",
            },
            {
              label: "Partially Approved",
              value: displayStatusCounts["Partially Approved"],
              meta: "Approved in part, still under review",
              icon: FileText,
              iconClassName: "bg-[#DBEAFE] text-[#1D4ED8]",
              metaClassName: "text-[#1D4ED8]",
            },
            {
              label: "Approved",
              value: displayStatusCounts.Approved,
              meta: "Approved AP records",
              icon: FileText,
              iconClassName: "bg-[#DFF1E5] text-[#18384C]",
              metaClassName: "text-[#18384C]",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]"
              >
                <CardContent className="p-0">
                  <div className="grid gap-3 p-4">
                    <span
                      className={`inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] ${card.iconClassName}`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2.2} />
                    </span>
                    <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[#6b6b6b]`}>
                      {card.label}
                    </p>
                    <p className={`${ibmPlexSans.className} text-[clamp(2.1rem,3vw,2.75rem)] font-semibold leading-none tracking-[-0.03em] text-[#111827]`}>
                      {card.value}
                    </p>
                    <p className={`${ibmPlexSans.className} text-[14px] font-medium ${card.metaClassName}`}>
                      {card.meta}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col items-start gap-3 md:flex-row md:items-center">
          <div className="flex h-[42px] flex-1 items-center gap-2 rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3">
            <Search className="h-4 w-4 text-[#9AAAB8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search invoices..."
              className={`${ibmPlexSans.className} h-full flex-1 border-0 bg-transparent text-[14px] text-[#1d1d1d] outline-none placeholder:text-[#9AAAB8]`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusFilters.map((filter) => {
              const isActive = statusFilter === filter;
              const label = filter === "all" ? "All" : filter;

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
            {filteredInvoices.length === 0 ? (
              <div className="px-6 pb-6 pt-6">
                <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                  <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                    No matching supplier invoices found.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                      {[
                        "Invoice Number",
                        "Supplier",
                        "Invoice Date",
                        "Due Date",
                        "Total",
                        "Status",
                        "Source",
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
                    {filteredInvoices.map((invoice) => {
                      const displayStatus = invoiceDisplayStatuses[invoice.id] ?? invoice.status;

                      return (
                        <tr
                          key={invoice.id}
                          className="group border-b border-[#E2E8F1] last:border-0 transition-colors hover:bg-[#F8FBFB]"
                        >
                        <td className="px-6 py-4">
                          <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>
                            {invoice.invoice_number || "Draft invoice"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>
                            {invoice.supplier_id
                              ? supplierNameById.get(invoice.supplier_id) ?? "Unknown Supplier"
                              : "Unassigned"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>
                            {toDayMonthYearLabel(invoice.invoice_date)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>
                            {toDayMonthYearLabel(invoice.due_date)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                            {toMoney(Number(invoice.total ?? 0))}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${getSupplierInvoiceStatusClassName(displayStatus)}`}
                          >
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`${ibmPlexSans.className} text-[13px] text-[#4B5D79]`}>
                            {getSourceLabel(invoice.source)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/app/company/supplier-invoices/${invoice.id}`}
                            className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                          >
                            Open
                          </Link>
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

      <Dialog open={isCreateOpen} onOpenChange={(open) => (!open ? closeCreateModal() : undefined)}>
        <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
          <div className="px-7 pb-6 pt-7">
            <h2
              className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}
            >
              New Supplier Invoice
            </h2>
          </div>

          <div className="space-y-3.5 px-7 pb-4">
            {error ? (
              <div className={`${interMedium.className} rounded-[10px] border border-[#F5C2C7] bg-[#FFF1F2] px-4 py-3 text-sm text-[#B42318]`}>
                {error}
              </div>
            ) : null}

            <div>
              <FieldLabel htmlFor="supplier-id">Supplier</FieldLabel>
              <select
                id="supplier-id"
                value={formState.supplierId}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, supplierId: event.target.value }))
                }
                className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.company_name?.trim() || supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel htmlFor="invoice-number">Invoice Number</FieldLabel>
              <Input
                id="invoice-number"
                value={formState.invoiceNumber}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, invoiceNumber: event.target.value }))
                }
                placeholder="INV-1042"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="invoice-date">Invoice Date</FieldLabel>
                <Input
                  id="invoice-date"
                  type="date"
                  value={formState.invoiceDate}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, invoiceDate: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="due-date">Due Date</FieldLabel>
                <Input
                  id="due-date"
                  type="date"
                  value={formState.dueDate}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="subtotal">Subtotal</FieldLabel>
                <Input
                  id="subtotal"
                  inputMode="decimal"
                  value={formState.subtotal}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, subtotal: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="tax-total">Tax</FieldLabel>
                <Input
                  id="tax-total"
                  inputMode="decimal"
                  value={formState.taxTotal}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, taxTotal: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="invoice-total">Total</FieldLabel>
                <Input
                  id="invoice-total"
                  inputMode="decimal"
                  value={formState.total}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, total: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="invoice-document">Document</FieldLabel>
              <Input
                id="invoice-document"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
                className={`${inputClass} h-auto py-2.5`}
              />
            </div>

            <div>
              <FieldLabel htmlFor="invoice-notes">Notes</FieldLabel>
              <textarea
                id="invoice-notes"
                rows={3}
                value={formState.notes}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Any notes for review"
                className={`${ibmPlexSans.className} w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <button
                type="button"
                className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => void createInvoice("Captured")}
              disabled={!canWrite || isSaving}
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isSaving ? "Saving..." : "Save Captured"}
            </button>
            <button
              type="button"
              onClick={() => void createInvoice("Needs Review")}
              disabled={!canWrite || isSaving}
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isSaving ? "Saving..." : "Save Needs Review"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
