import Link from "next/link";
import {
  CalendarClock,
  CircleDollarSign,
  FileCheck2,
  ArrowRight,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalPanel } from "@/components/app/OperationalPanel";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoneyOperational } from "@/lib/format/currency";
import { getRetentionWorkspace } from "@/lib/retention/phase7-retention-workspace";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { resolveAccountingIdentityPresentation } from "@/lib/accounting/accounting-identity-presentation";
import type { RetentionRegisterSnapshot } from "./financials-register-types";

function money(value: number | undefined) {
  return formatMoneyOperational(Number(value ?? 0), { decimals: 2 });
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-NZ");
}

function badge(status: string) {
  if (status === "submitted") return "pending" as const;
  if (status === "draft" || status === "cancelled_draft") return "draft" as const;
  return "pending" as const;
}

function statusLabel(status: string) {
  if (status === "cancelled_draft") return "Cancelled";
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

function xeroLabel(status: string | null, visible: boolean) {
  if (!visible) return "—";
  switch (status) {
    case "queued":
      return "Queued";
    case "exporting":
      return "Syncing";
    case "exported":
      return "Synced";
    case "attention_required":
      return "Attention";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Not synced";
  }
}

function toCents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

export function retentionClaimRegisterAmounts(params: {
  status: string;
  snapshotSubtotal: number;
  paidAmount: number;
  outstandingAmount: number;
  activeRevisionSubtotal: number | null;
}) {
  const snapshotCents = toCents(params.snapshotSubtotal);
  const activeRevisionCents = params.status === "submitted"
    && params.activeRevisionSubtotal !== null
    ? toCents(params.activeRevisionSubtotal)
    : snapshotCents;
  const claimedCents = Math.max(snapshotCents, activeRevisionCents);
  const cumulativeDeltaCents = claimedCents - snapshotCents;
  return {
    claimed: claimedCents / 100,
    paid: toCents(params.paidAmount) / 100,
    outstanding: Math.max(
      toCents(params.outstandingAmount) + cumulativeDeltaCents,
      0,
    ) / 100,
  };
}

export async function RetentionWorkspaceSection({
  id,
  projectSlug,
  retentionError,
  initialSnapshot,
  initialError = null,
}: {
  id: string;
  projectSlug: string;
  retentionError?: string;
  initialSnapshot?: RetentionRegisterSnapshot | null;
  initialError?: string | null;
}) {
  const receivedServerSnapshot = initialSnapshot !== undefined;
  let workspace = initialSnapshot;
  const scopedError = initialError;
  if (initialSnapshot === undefined) {
    try {
      const project =
        await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
      if (!project) return null;
      const legacyWorkspace = await getRetentionWorkspace(project.id);
      workspace = {
        register: legacyWorkspace.register,
        claimRows: legacyWorkspace.claimRows,
        xeroVisible: legacyWorkspace.xeroVisible,
        masterAccounting: legacyWorkspace.masterAccounting,
        loadedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[retention][embedded] Retention workspace read failed.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return null;
    }
  }

  if (workspace && !workspace.register.succeeded) return null;
  if (!workspace) {
    if (!receivedServerSnapshot) return null;
    return (
      <section
        id={id}
        className="mt-14 space-y-6 border-t border-[var(--border)] pt-6 pb-8"
        data-testid="retention-register"
      >
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Retention
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Track the project retention ledger and deliberate Retention Claim documents.
          </p>
        </div>
        <OperationalAlert variant="error">
          {scopedError ?? "Unable to load Retention Claims."}
        </OperationalAlert>
      </section>
    );
  }
  const rows = workspace.register.rows ?? [];
  const totalOwned = rows.reduce(
    (sum, row) => sum + Number(row.currentRetentionOwned),
    0,
  );
  const totalPaid = rows.reduce(
    (sum, row) => sum + Number(row.paidAmount),
    0,
  );
  const latestPushed = workspace.masterAccounting?.pushedSubtotal ?? 0;
  const newSinceLastPush = Math.max(totalOwned - latestPushed, 0);
  const claimRows = workspace.claimRows;
  const presentationRows = claimRows.map((row) => ({
    row,
    amounts: retentionClaimRegisterAmounts({
      status: row.claim.status,
      snapshotSubtotal: row.claim.subtotalExclTax,
      paidAmount: row.paidAmount,
      outstandingAmount: row.outstandingAmount,
      activeRevisionSubtotal:
        workspace.masterAccounting?.pushedSubtotal ?? null,
    }),
  }));
  const submittedTotals = claimRows.reduce(
    (totals, row) => {
      if (row.claim.status !== "submitted") return totals;
      const amounts = retentionClaimRegisterAmounts({
        status: row.claim.status,
        snapshotSubtotal: row.claim.subtotalExclTax,
        paidAmount: row.paidAmount,
        outstandingAmount: row.outstandingAmount,
        activeRevisionSubtotal:
          workspace.masterAccounting?.pushedSubtotal ?? null,
      });
      return {
        claimed: totals.claimed + toCents(amounts.claimed),
        paid: totals.paid + toCents(amounts.paid),
        outstanding: totals.outstanding + toCents(amounts.outstanding),
      };
    },
    { claimed: 0, paid: 0, outstanding: 0 },
  );
  const bodyMoneyCellClassName =
    "whitespace-nowrap text-right [font-variant-numeric:tabular-nums]";
  const footerCellClassName = "px-4 py-3 align-middle";
  const footerLabelCellClassName =
    "px-4 py-3 align-middle text-sm font-semibold tracking-[-0.01em] text-[var(--text-secondary)]";
  const footerMoneyCellClassName =
    "px-4 py-3 align-middle text-right text-sm font-semibold text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]";
  const footerMoneyStrongCellClassName =
    "px-4 py-3 align-middle text-right text-sm font-semibold text-[var(--text-primary)] [font-variant-numeric:tabular-nums]";

  return (
    <section
      id={id}
      className="mt-14 space-y-6 border-t border-[var(--border)] pt-6 pb-8"
      data-testid="retention-register"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Retention
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Track the project retention ledger and deliberate Retention Claim documents.
          </p>
        </div>
      </div>

      {retentionError ? (
        <OperationalAlert variant="error">{retentionError}</OperationalAlert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <OperationalKpiCard
              label="Current Retention"
              value={money(totalOwned)}
              icon={<CircleDollarSign className="h-5 w-5" />}
            />
            <OperationalKpiCard
              label="Pushed to Xero"
              value={money(latestPushed)}
              icon={<FileCheck2 className="h-5 w-5" />}
            />
            <OperationalKpiCard
              label="New Since Last Push"
              value={money(newSinceLastPush)}
              icon={<ShieldCheck className="h-5 w-5" />}
            />
            <OperationalKpiCard
              label="Paid"
              value={money(totalPaid)}
              icon={<CalendarClock className="h-5 w-5" />}
            />
            <OperationalKpiCard
              label="Outstanding"
              value={money(submittedTotals.outstanding / 100)}
              icon={<ShieldCheck className="h-5 w-5" />}
            />
      </div>

      {claimRows.length === 0 ? (
        <OperationalEmptyState
          title="No Retention Claims yet"
          description="Submitted Payment Claims will accumulate into this project's master Retention Claim."
        />
      ) : (
        <OperationalPanel contentClassName="p-0">
          <OperationalTable>
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead className="w-[130px]">Claim #</OperationalTableHead>
                <OperationalTableHead className="w-[240px]">Title</OperationalTableHead>
                <OperationalTableHead className="w-[110px]">Date</OperationalTableHead>
                <OperationalTableHead className="w-[140px]">Status</OperationalTableHead>
                <OperationalTableHead className="w-[120px] whitespace-nowrap text-right">Claimed</OperationalTableHead>
                <OperationalTableHead className="w-[120px] whitespace-nowrap text-right">Paid</OperationalTableHead>
                <OperationalTableHead className="w-[140px] whitespace-nowrap text-right">Outstanding</OperationalTableHead>
                <OperationalTableHead className="w-[130px]">Xero</OperationalTableHead>
                <OperationalTableHead className="w-[52px]" />
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {presentationRows.map(({ row, amounts }) => {
                const accountingIdentity =
                  resolveAccountingIdentityPresentation({
                    commercialClaimNumber: row.claim.claimNumber,
                    activeRevisionInvoiceNumber:
                      workspace.masterAccounting?.externalInvoiceNumber,
                    activeRevisionInvoiceId:
                      workspace.masterAccounting?.externalInvoiceId,
                  });
                return (
                <OperationalTableRow key={row.claim.id}>
                  <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                    <Link
                      href={`/app/projects/${projectSlug}/preconstruction/retention/claims/${row.claim.id}`}
                      className="hover:underline"
                    >
                      {accountingIdentity.displayAccountingNumber}
                    </Link>
                  </OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-primary)]">
                    <div>{row.claim.title?.trim() || "Retention Claim"}</div>
                  </OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-secondary)]">
                    {date(row.claim.issueDate)}
                  </OperationalTableCell>
                  <OperationalTableCell>
                    <StatusBadge status={badge(row.claim.status)}>
                      {statusLabel(row.claim.status)}
                    </StatusBadge>
                  </OperationalTableCell>
                  <OperationalTableCell className={bodyMoneyCellClassName}>
                    {money(amounts.claimed)}
                  </OperationalTableCell>
                  <OperationalTableCell className={bodyMoneyCellClassName}>
                    {money(amounts.paid)}
                  </OperationalTableCell>
                  <OperationalTableCell className={bodyMoneyCellClassName}>
                    {money(
                      row.automaticDraft
                        ? 0
                        : amounts.outstanding,
                    )}
                  </OperationalTableCell>
                  <OperationalTableCell className="whitespace-nowrap text-[var(--text-secondary)]">
                    {xeroLabel(row.xeroStatus, row.xeroVisible)}
                  </OperationalTableCell>
                  <OperationalTableCell className="px-2">
                    <div className="flex items-center justify-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          type="button"
                          className="ui-button inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)]"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                        >
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/app/projects/${projectSlug}/preconstruction/retention/claims/${row.claim.id}`}
                              className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                            >
                              <ArrowRight className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                              Open
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </OperationalTableCell>
                </OperationalTableRow>
                );
              })}
            </OperationalTableBody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]">
                <td className={`w-[130px] ${footerCellClassName}`} />
                <td className={`w-[240px] ${footerCellClassName}`} />
                <td className={`w-[110px] ${footerCellClassName}`} />
                <td className={`w-[140px] ${footerLabelCellClassName}`}>Totals</td>
                <td className={`w-[120px] ${footerMoneyCellClassName}`}>
                  {money(submittedTotals.claimed / 100)}
                </td>
                <td className={`w-[120px] ${footerMoneyCellClassName}`}>
                  {money(submittedTotals.paid / 100)}
                </td>
                <td className={`w-[140px] ${footerMoneyStrongCellClassName}`}>
                  {money(
                    submittedTotals.outstanding / 100,
                  )}
                </td>
                <td className={`w-[130px] ${footerCellClassName}`} />
                <td className={`w-[52px] ${footerCellClassName}`} />
              </tr>
            </tfoot>
          </OperationalTable>
        </OperationalPanel>
      )}

    </section>
  );
}
