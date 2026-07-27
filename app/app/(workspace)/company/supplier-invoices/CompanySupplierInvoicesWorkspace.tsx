"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Search, Upload } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
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
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import {
  deriveSupplierInvoiceDisplayStatus,
  getSourceLabel,
  toDayMonthYearLabel,
  toMoney,
  type SupplierInvoiceDisplayStatus,
  type SupplierInvoiceRow,
} from "@/lib/supplier-invoices";
import { NewSupplierInvoiceDialog } from "./NewSupplierInvoiceDialog";

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

export function CompanySupplierInvoicesWorkspace({
  initialInvoices,
  invoiceMatchSummaries,
  suppliers,
  canWrite,
}: CompanySupplierInvoicesWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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
        initialInvoices.map((invoice) => {
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
    [initialInvoices, invoiceMatchSummaries]
  );

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return initialInvoices.filter((invoice) => {
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
  }, [initialInvoices, invoiceDisplayStatuses, searchQuery, statusFilter, supplierNameById]);

  const displayStatusCounts = useMemo(
    () =>
      initialInvoices.reduce<Record<SupplierInvoiceDisplayStatus, number>>(
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
    [initialInvoices, invoiceDisplayStatuses]
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

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      {toastMessage ? (
        <div className="fixed right-4 top-20 z-50 w-[min(420px,calc(100vw-2rem))]">
          <OperationalAlert variant="success" role="status" aria-live="polite" className="shadow-[var(--shadow-lg)]">
            {toastMessage}
          </OperationalAlert>
        </div>
      ) : null}

      <OperationalModuleHeader
        title="Supplier Invoices"
        description="Capture supplier invoices separately from purchase orders and review them before approval."
        actions={
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
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

      <NewSupplierInvoiceDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreateSuccessMessage={setToastMessage}
        suppliers={suppliers}
        canWrite={canWrite}
      />
    </main>
  );
}
