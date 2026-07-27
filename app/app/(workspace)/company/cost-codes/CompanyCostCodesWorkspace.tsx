"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
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
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import type {
  AccountingResolutionPreviewRow,
  OrganizationCostCodeRow,
  OrganizationTradesstackAccountingMappingRow,
} from "@/lib/accounting/types";
import {
  archiveTradesstackAccountingMappingAction,
  saveTradesstackAccountingMappingAction,
} from "./actions";
import {
  coerceTradesstackFinancialRoutingCode,
  listTradesstackFinancialRoutingCodes,
  type TradesstackFinancialRoutingCode,
} from "@/lib/tradesstack-financial-routing";
import { ProviderMappingPreviewItem } from "./ProviderMappingPreviewItem";
import {
  formatExternalAccountingCode,
  isCostCodeAvailableForAccountingTenant,
} from "@/lib/accounting/xero-account-tenant";

type CompanyCostCodesWorkspaceProps = {
  organizationId: string;
  canEdit: boolean;
  costCodes: OrganizationCostCodeRow[];
  mappings: OrganizationTradesstackAccountingMappingRow[];
  previewProvider: string;
  previewRows: AccountingResolutionPreviewRow[];
  unresolvedRows: AccountingResolutionPreviewRow[];
  currentXeroTenantId: string | null;
  currentXeroTenantName: string | null;
};

const SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2";

function formatProviderLabel(provider: string) {
  return provider
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function findActiveMapping(
  mappings: OrganizationTradesstackAccountingMappingRow[],
  provider: string,
  tradesstackCostCode: TradesstackFinancialRoutingCode
) {
  return (
    mappings.find(
      (row) =>
        row.is_active &&
        row.provider === provider &&
        coerceTradesstackFinancialRoutingCode(row.tradesstack_cost_code) === tradesstackCostCode &&
        row.project_id === null
    ) ?? null
  );
}

export function CompanyCostCodesWorkspace({
  organizationId,
  canEdit,
  costCodes,
  mappings,
  previewProvider,
  previewRows,
  unresolvedRows,
  currentXeroTenantId,
  currentXeroTenantName,
}: CompanyCostCodesWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState(previewProvider);
  const [draftSelectionsByProvider, setDraftSelectionsByProvider] = useState<Record<string, Record<string, string>>>({});

  const providers = useMemo(() => {
    const values = Array.from(
      new Set(
        [
          ...costCodes.map((row) => row.external_provider).filter((value): value is string => Boolean(value)),
          ...mappings.map((row) => row.provider).filter((value): value is string => Boolean(value)),
          previewProvider,
        ].map((value) => value.trim().toLowerCase())
      )
    );

    return values.length > 0 ? values : ["manual"];
  }, [costCodes, mappings, previewProvider]);

  const providerCostCodes = useMemo(
    () =>
      costCodes.filter((row) => {
        const externalProvider = row.external_provider?.trim().toLowerCase() ?? null;
        return (
          externalProvider === selectedProvider
          && isCostCodeAvailableForAccountingTenant({
            costCode: row,
            provider: selectedProvider,
            currentXeroTenantId,
          })
        );
      }),
    [costCodes, currentXeroTenantId, selectedProvider]
  );

  const baseSelections = useMemo(
    () =>
      listTradesstackFinancialRoutingCodes().reduce<Record<string, string>>((accumulator, routing) => {
        accumulator[routing.code] =
          findActiveMapping(mappings, selectedProvider, routing.code)?.organization_cost_code_id ?? "";
        return accumulator;
      }, {}),
    [mappings, selectedProvider]
  );

  const draftSelections = useMemo(
    () => ({
      ...baseSelections,
      ...(draftSelectionsByProvider[selectedProvider] ?? {}),
    }),
    [baseSelections, draftSelectionsByProvider, selectedProvider]
  );

  const unresolvedCount = unresolvedRows.filter((row) => row.provider === selectedProvider).length;

  const handleSelectionChange = (tradesstackCostCode: string, organizationCostCodeId: string) => {
    setDraftSelectionsByProvider((current) => ({
      ...current,
      [selectedProvider]: {
        ...(current[selectedProvider] ?? {}),
        [tradesstackCostCode]: organizationCostCodeId,
      },
    }));
  };

  const handleSaveMapping = (tradesstackCostCode: TradesstackFinancialRoutingCode) => {
    if (!canEdit) {
      setError("You do not have permission to update accounting mappings.");
      return;
    }

    startTransition(() => {
      void (async () => {
        setError(null);
        setNotice(null);
        const selectedCostCodeId = draftSelections[tradesstackCostCode] ?? "";
        const existing = findActiveMapping(mappings, selectedProvider, tradesstackCostCode);

        if (!selectedCostCodeId) {
          if (!existing) {
            setError("Choose an external accounting code first.");
            return;
          }

          const result = await archiveTradesstackAccountingMappingAction({
            organizationId,
            provider: selectedProvider,
            tradesstackCostCode,
          });

          if (!result.ok) {
            setError(result.error ?? "Unable to remove the accounting mapping.");
            return;
          }

          setNotice(result.notice ?? `Removed ${tradesstackCostCode} mapping for ${formatProviderLabel(selectedProvider)}.`);
          router.refresh();
          return;
        }

        const result = await saveTradesstackAccountingMappingAction({
          organizationId,
          provider: selectedProvider,
          tradesstackCostCode,
          organizationCostCodeId: selectedCostCodeId,
        });

        if (!result.ok) {
          setError(result.error ?? "Unable to save the accounting mapping.");
          return;
        }

        setNotice(result.notice ?? `Saved ${tradesstackCostCode} mapping for ${formatProviderLabel(selectedProvider)}.`);
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-6">
      <OperationalModuleHeader
        eyebrow="Financial routing"
        title="TradesStack codes and accounting mappings"
        description="TradesStack routing codes are fixed and locked. Each provider maps those eight codes to the imported external accounting codes your team uses."
      />

      <OperationalPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Provider mapping</h2>
            <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
              Financial routing resolves as{" "}
              <code>TradesStack code -&gt; mapped external accounting code</code>. Construction intelligence
              stays separate and never controls exports.
            </p>
          </div>
          <label className="flex min-w-[240px] flex-col gap-2 text-sm text-[var(--text-secondary)]">
            Accounting provider
            <select
              className={SELECT_CLASS}
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {formatProviderLabel(provider)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <StatusBadge status={unresolvedCount > 0 ? "overdue" : "approved"}>
            {unresolvedCount > 0 ? `${unresolvedCount} unmapped preview rows` : "Preview rows mapped"}
          </StatusBadge>
          <span>{providerCostCodes.length} imported external codes available for {formatProviderLabel(selectedProvider)}.</span>
          {selectedProvider === "xero" ? (
            <span>
              Tenant: {currentXeroTenantName ?? "No connected Xero tenant"}
            </span>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-[var(--destructive)]">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-[var(--brand-green)]">{notice}</p> : null}

        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
          <OperationalTable>
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>TradesStack code</OperationalTableHead>
                <OperationalTableHead>Routing label</OperationalTableHead>
                <OperationalTableHead>Mapped external code</OperationalTableHead>
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead className="text-right">Action</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {listTradesstackFinancialRoutingCodes().map((routing) => {
                const activeMapping = findActiveMapping(mappings, selectedProvider, routing.code);
                const mappedCostCode =
                  providerCostCodes.find(
                    (row) => row.id === (draftSelections[routing.code] || activeMapping?.organization_cost_code_id)
                  ) ?? null;

                return (
                  <OperationalTableRow key={routing.code}>
                    <OperationalTableCell className="font-medium text-[var(--text-primary)]">
                      {routing.code}
                    </OperationalTableCell>
                    <OperationalTableCell>{routing.label}</OperationalTableCell>
                    <OperationalTableCell>
                      <select
                        className={SELECT_CLASS}
                        disabled={!canEdit || isPending}
                        value={draftSelections[routing.code] ?? ""}
                        onChange={(event) => handleSelectionChange(routing.code, event.target.value)}
                      >
                        <option value="">No mapping selected</option>
                        {providerCostCodes.map((row) => (
                          <option key={row.id} value={row.id}>
                            {formatExternalAccountingCode(row)}
                          </option>
                        ))}
                      </select>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={mappedCostCode ? "approved" : "overdue"}>
                        {mappedCostCode ? "Mapped" : "Needs mapping"}
                      </StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canEdit || isPending}
                        onClick={() => handleSaveMapping(routing.code)}
                      >
                        Save
                      </Button>
                    </OperationalTableCell>
                  </OperationalTableRow>
                );
              })}
            </OperationalTableBody>
          </OperationalTable>
        </div>
      </OperationalPanel>

      <OperationalPanel>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Resolution preview</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Preview rows show whether current routed cost items can resolve through the selected provider mapping.
          </p>
        </div>

        {previewRows.length === 0 ? (
          <div className="mt-4">
            <OperationalEmptyState
              title="No preview rows yet"
              description="Create or route new cost items to preview accounting mappings here."
            />
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
            <OperationalTable>
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Project</OperationalTableHead>
                  <OperationalTableHead>Item</OperationalTableHead>
                  <OperationalTableHead>TradesStack code</OperationalTableHead>
                  <OperationalTableHead>Resolution</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {previewRows.map((row) => (
                  <OperationalTableRow key={row.costItemId ?? `${row.projectId}-${row.title}`}>
                    <OperationalTableCell>{row.projectName ?? "Unassigned"}</OperationalTableCell>
                    <OperationalTableCell>
                      <ProviderMappingPreviewItem row={row} />
                    </OperationalTableCell>
                    <OperationalTableCell>{row.tradesstackCostCode ?? "Missing"}</OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={row.resolution.status === "resolved" ? "approved" : "overdue"}>
                        {row.resolution.status === "resolved"
                          ? `${row.resolution.code ?? ""} ${row.resolution.name ?? ""}`.trim()
                          : "Needs accounting mapping"}
                      </StatusBadge>
                    </OperationalTableCell>
                  </OperationalTableRow>
                ))}
              </OperationalTableBody>
            </OperationalTable>
          </div>
        )}
      </OperationalPanel>
    </div>
  );
}
