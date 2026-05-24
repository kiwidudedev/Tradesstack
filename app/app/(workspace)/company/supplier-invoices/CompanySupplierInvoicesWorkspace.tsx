"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText, Plus, Search, Upload } from "lucide-react";
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
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans } from "@/lib/fonts";
import {
  buildSupplierInvoiceIntelligenceEvent,
  logSupplierInvoiceIntelligenceFailure,
  summarizeSupplierInvoiceHeader,
  writeSupplierInvoiceIntelligenceEvent,
} from "@/lib/supplier-invoice-intelligence";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import {
  buildSupplierInvoiceDocumentStoragePath,
  deriveSupplierInvoiceDisplayStatus,
  getSourceLabel,
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
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
    </label>
  );
}

const FIELD_SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_TEXTAREA_CLASS =
  "flex w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function displayStatusBadge(value: SupplierInvoiceDisplayStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "Approved":
      return "approved";
    case "Partially Approved":
      return "sent";
    case "Needs Review":
      return "pending";
    case "Disputed":
      return "overdue";
    case "Captured":
    default:
      return "draft";
  }
}

function numberString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emitSupplierInvoiceEvent(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  event: ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>
) {
  void writeSupplierInvoiceIntelligenceEvent(supabase, event).catch((error) => {
    logSupplierInvoiceIntelligenceFailure(event.eventType, error);
  });
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

      emitSupplierInvoiceEvent(
        supabase,
        buildSupplierInvoiceIntelligenceEvent({
          organizationId,
          module: "supplier_invoices",
          eventFamily: file ? "file_lifecycle" : "commercial_action",
          eventType: "supplier_invoice_created",
          action: "created",
          entityType: "supplier_invoice",
          entityId: insertedInvoice.id,
          afterData: summarizeSupplierInvoiceHeader({
            supplierId: insertedInvoice.supplier_id,
            source: insertedInvoice.source,
            status: insertedInvoice.status,
            invoiceNumber: insertedInvoice.invoice_number,
            invoiceDate: insertedInvoice.invoice_date,
            dueDate: insertedInvoice.due_date,
            total: Number(insertedInvoice.total ?? 0),
            hasDocument: Boolean(insertedInvoice.document_file_path),
          }),
          metadata: {
            documentUploaded: Boolean(file),
            documentMimeType: file?.type || null,
            documentSizeBytes: file?.size ?? null,
          },
          reason: file
            ? "Supplier invoice created from an uploaded document."
            : "Supplier invoice created manually.",
        })
      );

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

  const kpiCards = [
    {
      label: "Captured",
      value: displayStatusCounts.Captured,
      helper: "Saved but not yet reviewed",
      icon: <Upload className="h-5 w-5" strokeWidth={2.2} />,
    },
    {
      label: "Needs Review",
      value: displayStatusCounts["Needs Review"],
      helper: "Ready for review and approval",
      icon: <FileText className="h-5 w-5" strokeWidth={2.2} />,
    },
    {
      label: "Partially Approved",
      value: displayStatusCounts["Partially Approved"],
      helper: "Approved in part, still under review",
      icon: <FileText className="h-5 w-5" strokeWidth={2.2} />,
    },
    {
      label: "Approved",
      value: displayStatusCounts.Approved,
      helper: "Approved AP records",
      icon: <FileText className="h-5 w-5" strokeWidth={2.2} />,
    },
  ];

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      <OperationalModuleHeader
        title="Supplier Invoices"
        description="Capture supplier invoices separately from purchase orders and review them before approval."
        actions={
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setIsCreateOpen(true);
            }}
            disabled={!canWrite}
          >
            <Plus className="h-4 w-4" strokeWidth={2.3} />
            New Supplier Invoice
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <OperationalKpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            helper={card.helper}
            icon={card.icon}
          />
        ))}
      </div>

      <OperationalToolbar
        search={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search invoices..."
              className="pl-9"
            />
          </div>
        }
        filters={statusFilters.map((filter) => {
          const isActive = statusFilter === filter;
          const label = filter === "all" ? "All" : filter;

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
        {filteredInvoices.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState title="No matching supplier invoices found." />
          </div>
        ) : (
          <OperationalTable className="min-w-[900px]">
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>Invoice Number</OperationalTableHead>
                <OperationalTableHead>Supplier</OperationalTableHead>
                <OperationalTableHead>Invoice Date</OperationalTableHead>
                <OperationalTableHead>Due Date</OperationalTableHead>
                <OperationalTableHead>Total</OperationalTableHead>
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead>Source</OperationalTableHead>
                <OperationalTableHead className="text-right">Actions</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {filteredInvoices.map((invoice) => {
                const displayStatus = invoiceDisplayStatuses[invoice.id] ?? invoice.status;

                return (
                  <OperationalTableRow key={invoice.id}>
                    <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                      {invoice.invoice_number || "Draft invoice"}
                    </OperationalTableCell>
                    <OperationalTableCell>
                      {invoice.supplier_id
                        ? supplierNameById.get(invoice.supplier_id) ?? "Unknown Supplier"
                        : "Unassigned"}
                    </OperationalTableCell>
                    <OperationalTableCell>{toDayMonthYearLabel(invoice.invoice_date)}</OperationalTableCell>
                    <OperationalTableCell>{toDayMonthYearLabel(invoice.due_date)}</OperationalTableCell>
                    <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                      {toMoney(Number(invoice.total ?? 0))}
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={displayStatusBadge(displayStatus as SupplierInvoiceDisplayStatus)}>
                        {displayStatus}
                      </StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-secondary)]">
                      {getSourceLabel(invoice.source)}
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="flex justify-end">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/app/company/supplier-invoices/${invoice.id}`}>Open</Link>
                        </Button>
                      </div>
                    </OperationalTableCell>
                  </OperationalTableRow>
                );
              })}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <Dialog open={isCreateOpen} onOpenChange={(open) => (!open ? closeCreateModal() : undefined)}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0">
          <div className="px-7 pb-6 pt-7">
            <h2 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              New Supplier Invoice
            </h2>
          </div>

          <div className="space-y-3.5 px-7 pb-4">
            {error ? (
              <OperationalAlert variant="error">
                {error}
              </OperationalAlert>
            ) : null}

            <div>
              <FieldLabel htmlFor="supplier-id">Supplier</FieldLabel>
              <select
                id="supplier-id"
                value={formState.supplierId}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, supplierId: event.target.value }))
                }
                className={FIELD_SELECT_CLASS}
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
                className="h-auto py-2.5"
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
                className={FIELD_TEXTAREA_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void createInvoice("Captured")}
              disabled={!canWrite || isSaving}
            >
              {isSaving ? "Saving..." : "Save Captured"}
            </Button>
            <Button
              type="button"
              onClick={() => void createInvoice("Needs Review")}
              disabled={!canWrite || isSaving}
            >
              {isSaving ? "Saving..." : "Save Needs Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
