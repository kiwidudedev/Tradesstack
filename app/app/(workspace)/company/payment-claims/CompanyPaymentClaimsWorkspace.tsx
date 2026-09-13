"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Banknote,
  CircleDollarSign,
  FileText,
  WalletCards,
} from "lucide-react";
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
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  claimStatusTone,
  formatRegisterDate,
  formatRegisterMoney,
  formatRegisterMonth,
  hasActiveRegisterFilters,
  paymentStatusLabel,
  type CompanyPaymentClaimsFilters,
} from "@/lib/payment-claims/company-register-presentation";
import type { CompanyPaymentClaimsRegister } from "./payment-claim-register-types";

const selectClassName =
  "h-10 max-w-[190px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]";

export function CompanyPaymentClaimsWorkspace({
  register,
  filters,
}: {
  register: CompanyPaymentClaimsRegister;
  filters: CompanyPaymentClaimsFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const updateQuery = (changes: Record<string, string | null>, resetPage = true) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (resetPage) params.delete("page");
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  };

  const selectedMonth = filters.month ?? register.context.month;
  const monthOptions = [...new Set([
    selectedMonth,
    register.context.month,
    ...register.options.months,
  ])].filter((month) => month !== "all");
  const filtered = hasActiveRegisterFilters(filters);
  const metrics = register.metrics;

  return (
    <main className="space-y-6 pb-8">
      <OperationalModuleHeader
        title="Payment Claims"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OperationalKpiCard
          label="Amount Payable"
          value={formatRegisterMoney(metrics.amountPayable, register.context.currency)}
          helper="Non-cancelled filtered claims"
          tone="navy"
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Paid"
          value={formatRegisterMoney(metrics.paid, register.context.currency)}
          helper="Trusted payment projections"
          tone="sage"
          icon={<Banknote className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Outstanding"
          value={formatRegisterMoney(metrics.outstanding, register.context.currency)}
          helper="Trusted payment projections"
          tone="amber"
          icon={<WalletCards className="h-5 w-5" />}
        />
      </div>

      <OperationalToolbar
        className={isPending ? "opacity-70" : undefined}
        filters={
          <>
            <select
              aria-label="Claim period month"
              className={selectClassName}
              value={selectedMonth}
              onChange={(event) => updateQuery({ month: event.target.value })}
            >
              <option value="all">All periods</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>{formatRegisterMonth(month)}</option>
              ))}
            </select>
            <select
              aria-label="Client"
              className={selectClassName}
              value={filters.clientId ?? ""}
              onChange={(event) => updateQuery({ client: event.target.value || null })}
            >
              <option value="">All clients</option>
              {register.options.clients.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="Payment status"
              className={selectClassName}
              value={filters.paymentStatus ?? ""}
              onChange={(event) => updateQuery({ paymentStatus: event.target.value || null })}
            >
              <option value="">All payment states</option>
              {["unpaid", "partially_paid", "paid", "attention_required"].map((status) => (
                <option key={status} value={status}>{paymentStatusLabel(status, false)}</option>
              ))}
            </select>
            {[
              ["outstanding", "Outstanding only", filters.outstandingOnly],
              ["overdue", "Overdue only", filters.overdueOnly],
            ].map(([key, label, active]) => (
              <Button
                key={String(key)}
                type="button"
                size="sm"
                variant={active ? "primary" : "secondary"}
                onClick={() => updateQuery({ [String(key)]: active ? null : "1" })}
              >
                {String(label)}
              </Button>
            ))}
          </>
        }
        actions={
          <>
            <select
              aria-label="Sort Payment Claims"
              className={selectClassName}
              value={`${filters.sort}:${filters.direction}`}
              onChange={(event) => {
                const [sort, direction] = event.target.value.split(":");
                updateQuery({ sort, direction });
              }}
            >
              <option value="period:desc">Newest period</option>
              <option value="period:asc">Oldest period</option>
              <option value="due:asc">Due soonest</option>
              <option value="due:desc">Due latest</option>
              <option value="amount:desc">Highest amount</option>
              <option value="amount:asc">Lowest amount</option>
              <option value="claim_number:asc">Claim number A–Z</option>
              <option value="claim_number:desc">Claim number Z–A</option>
            </select>
            {filtered ? (
              <Button type="button" variant="secondary" onClick={() => router.replace(pathname)}>
                Clear all
              </Button>
            ) : null}
          </>
        }
      />

      <OperationalPanel contentClassName="p-0">
        {register.rows.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState
              icon={<FileText className="h-6 w-6" />}
              title={filtered ? "No Payment Claims match these filters." : "No Payment Claims for this period."}
              description={filtered
                ? "Clear or adjust the filters to broaden the register."
                : "Claims will appear here when they are created in a project."}
              actions={filtered ? (
                <Button type="button" variant="secondary" onClick={() => router.replace(pathname)}>
                  Clear all filters
                </Button>
              ) : undefined}
            />
          </div>
        ) : (
          <OperationalTable className="min-w-[880px]">
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>Job Number</OperationalTableHead>
                <OperationalTableHead>Project</OperationalTableHead>
                <OperationalTableHead>Client</OperationalTableHead>
                <OperationalTableHead>Submitted Date</OperationalTableHead>
                <OperationalTableHead>Due Date</OperationalTableHead>
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead>Total Claim</OperationalTableHead>
                <OperationalTableHead>Action</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {register.rows.map((row) => (
                <OperationalTableRow key={row.id}>
                  <OperationalTableCell>{row.project_code}</OperationalTableCell>
                  <OperationalTableCell className="max-w-[260px] truncate font-medium text-[var(--text-primary)]">
                    {row.project_name}
                  </OperationalTableCell>
                  <OperationalTableCell className="max-w-[220px] truncate">
                    {row.client_name ?? "—"}
                  </OperationalTableCell>
                  <OperationalTableCell>{formatRegisterDate(row.claim_date)}</OperationalTableCell>
                  <OperationalTableCell>{formatRegisterDate(row.effective_due_date)}</OperationalTableCell>
                  <OperationalTableCell>
                    <StatusBadge status={claimStatusTone(row.claim_status)}>{row.claim_status}</StatusBadge>
                  </OperationalTableCell>
                  <OperationalTableCell className="text-right font-semibold tabular-nums text-[var(--text-primary)]">
                    {formatRegisterMoney(Number(row.total_payable), row.currency)}
                  </OperationalTableCell>
                  <OperationalTableCell>
                    <div className="flex justify-end">
                      <Button asChild variant="secondary" size="sm">
                        <Link
                          aria-label={`Open Payment Claim ${row.claim_number}`}
                          href={`/app/projects/${row.project_slug}/preconstruction/claims/${row.id}`}
                        >
                          Open
                        </Link>
                      </Button>
                    </div>
                  </OperationalTableCell>
                </OperationalTableRow>
              ))}
            </OperationalTableBody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]">
                <td
                  colSpan={6}
                  className="px-4 py-3 text-right align-middle text-sm font-semibold tracking-[-0.01em] text-[var(--text-secondary)]"
                >
                  Totals
                </td>
                <td className="px-4 py-3 text-right align-middle text-sm font-semibold text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
                  {formatRegisterMoney(metrics.amountPayable, register.context.currency)}
                </td>
                <td className="px-4 py-3 align-middle" />
              </tr>
            </tfoot>
          </OperationalTable>
        )}
      </OperationalPanel>

      <div className="flex flex-col gap-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
        <span>
          {register.pageInfo.totalRows} claim{register.pageInfo.totalRows === 1 ? "" : "s"} · Page {register.pageInfo.page} of {register.pageInfo.totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={register.pageInfo.page <= 1 || isPending}
            onClick={() => updateQuery({ page: String(register.pageInfo.page - 1) }, false)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={register.pageInfo.page >= register.pageInfo.totalPages || isPending}
            onClick={() => updateQuery({ page: String(register.pageInfo.page + 1) }, false)}
          >
            Next
          </Button>
        </div>
      </div>
    </main>
  );
}
