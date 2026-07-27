import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { listOrganizationCostCodes, listOrganizationTradesstackAccountingMappings } from "@/lib/accounting/queries";
import { resolveOrganizationAccountingCode } from "@/lib/accounting/organization-cost-code-resolver";
import { listClassificationReviewRows } from "@/lib/classification-review";
import { ibmPlexSans } from "@/lib/fonts";
import { ClassificationReviewRow } from "@/lib/materials/types";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getTradesstackFinancialRoutingLabel,
  isTradesstackFinancialRoutingCode,
  listTradesstackFinancialRoutingCodes,
  type TradesstackFinancialRoutingCode,
} from "@/lib/tradesstack-financial-routing";
import { ReviewEditorForm } from "./ReviewEditorForm";

const PAGE_PATH = "/app/company/cost-items/review";

function formatConfidence(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${Math.round(value * 100)}%`;
}

function formatMoney(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatReviewStatus(status: string | null) {
  switch (status) {
    case "needs_routing_review":
      return { label: "Needs routing review", tone: "pending" as const };
    case "needs_accounting_mapping":
      return { label: "Needs accounting mapping", tone: "overdue" as const };
    case "high_value_review":
      return { label: "High value review", tone: "sent" as const };
    case "resolved":
      return { label: "Resolved", tone: "approved" as const };
    case "auto_approved":
      return { label: "Auto approved", tone: "approved" as const };
    default:
      return { label: status ?? "Pending", tone: "draft" as const };
  }
}

function formatConstructionIntelligenceSummary(value: Record<string, unknown> | null) {
  if (!value) {
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

function parseSelectedRows(values: FormDataEntryValue[]) {
  return values
    .map((value) => String(value))
    .map((value) => value.split(":", 2))
    .filter((parts): parts is [ClassificationReviewRow["entityType"], string] => {
      return (parts[0] === "cost_item" || parts[0] === "organization_material") && Boolean(parts[1]);
    });
}

async function resolveAccountingForRouting(params: {
  organizationId: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
}) {
  const [costCodes, mappings] = await Promise.all([
    listOrganizationCostCodes(params.organizationId),
    listOrganizationTradesstackAccountingMappings(params.organizationId),
  ]);

  const provider =
    mappings.find((row) => row.is_active)?.provider ??
    costCodes.find((row) => row.external_provider)?.external_provider ??
    "manual";

  return resolveOrganizationAccountingCode({
    costCodes,
    mappings,
    input: {
      organizationId: params.organizationId,
      provider,
      tradesstackCostCode: params.tradesstackCostCode,
      projectId: null,
      reviewStatus: "resolved",
    },
  });
}

async function updateFinancialRoutingRows(params: {
  organizationId: string;
  actorUserId: string;
  rows: Array<{ entityType: ClassificationReviewRow["entityType"]; entityId: string }>;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
  mode: "resolve" | "mark_others";
}) {
  const supabase = await createServerSupabaseClient();
  const accountingResolution = await resolveAccountingForRouting({
    organizationId: params.organizationId,
    tradesstackCostCode: params.tradesstackCostCode,
  });

  const finalReviewStatus =
    accountingResolution.status === "resolved" ? "resolved" : "needs_accounting_mapping";
  const reviewReason =
    accountingResolution.status === "resolved"
      ? params.mode === "mark_others"
        ? "marked_as_others"
        : "routing_review_resolved"
      : "missing_accounting_mapping";

  const costItemIds = params.rows.filter((row) => row.entityType === "cost_item").map((row) => row.entityId);
  const materialIds = params.rows
    .filter((row) => row.entityType === "organization_material")
    .map((row) => row.entityId);

  if (costItemIds.length > 0) {
    const { error } = await supabase
      .from("cost_items")
      .update({
        tradesstack_cost_code: params.tradesstackCostCode,
        tradesstack_cost_code_label: getTradesstackFinancialRoutingLabel(params.tradesstackCostCode),
        financial_routing_confidence: 1,
        financial_routing_source: "user_override",
        review_status: finalReviewStatus,
        review_reason: reviewReason,
        accounting_mapping_id: accountingResolution.accountingMappingId,
        needs_review: false,
        confirmed_by_user_id: params.actorUserId,
        confirmed_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .in("id", costItemIds);

    if (error) {
      throw new Error(error.message);
    }
  }

  if (materialIds.length > 0) {
    const { error } = await supabase
      .from("organization_materials")
      .update({
        tradesstack_cost_code: params.tradesstackCostCode,
        tradesstack_cost_code_label: getTradesstackFinancialRoutingLabel(params.tradesstackCostCode),
        financial_routing_confidence: 1,
        financial_routing_source: "user_override",
        review_status: finalReviewStatus,
        review_reason: reviewReason,
        accounting_mapping_id: accountingResolution.accountingMappingId,
        organization_cost_code_id: accountingResolution.organizationCostCodeId,
        needs_review: false,
        classification_source: "user_confirmed",
        confirmed_by_user_id: params.actorUserId,
        confirmed_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .in("id", materialIds);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export default async function CostItemReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    return null;
  }

  const canEdit = await hasOrganizationPermission(currentMember.organization_id, "settings.organization.update");
  if (!canEdit) {
    redirect("/app");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const editRaw = resolvedSearchParams.edit;
  const editTarget = Array.isArray(editRaw) ? editRaw[0] : editRaw;

  async function saveRoutingReviewAction(formData: FormData) {
    "use server";

    const member = await getCurrentOrganizationMember();
    if (!member) {
      redirect("/login");
    }

    const canWrite = await hasOrganizationPermission(member.organization_id, "settings.organization.update");
    if (!canWrite) {
      throw new Error("You do not have permission to resolve routing review.");
    }

    const entityType = formData.get("entityType");
    const entityId = formData.get("entityId");
    const code = formData.get("tradesstackCostCode");
    const resolutionMode = formData.get("resolutionMode");
    const selectedCode =
      resolutionMode === "mark_others"
        ? "800"
        : isTradesstackFinancialRoutingCode(code)
          ? code
          : null;

    if ((entityType !== "cost_item" && entityType !== "organization_material") || typeof entityId !== "string" || !selectedCode) {
      throw new Error("Invalid routing review submission.");
    }

    await updateFinancialRoutingRows({
      organizationId: member.organization_id,
      actorUserId: member.user_id,
      rows: [{ entityType, entityId }],
      tradesstackCostCode: selectedCode,
      mode: resolutionMode === "mark_others" ? "mark_others" : "resolve",
    });

    revalidatePath(PAGE_PATH);
    redirect(PAGE_PATH);
  }

  async function applyBatchReviewAction(formData: FormData) {
    "use server";

    const member = await getCurrentOrganizationMember();
    if (!member) {
      redirect("/login");
    }

    const canWrite = await hasOrganizationPermission(member.organization_id, "settings.organization.update");
    if (!canWrite) {
      throw new Error("You do not have permission to apply routing review.");
    }

    const selectedRows = parseSelectedRows(formData.getAll("selectedRows"));
    if (selectedRows.length === 0) {
      throw new Error("Select at least one review row.");
    }

    const action = String(formData.get("batchAction") ?? "");
    const fallbackCode = formData.get("batchTradesstackCostCode");

    let code: TradesstackFinancialRoutingCode | null = null;
    let mode: "resolve" | "mark_others" = "resolve";

    if (action === "mark_others") {
      code = "800";
      mode = "mark_others";
    } else if (action === "change_code") {
      code = isTradesstackFinancialRoutingCode(fallbackCode) ? fallbackCode : null;
    } else {
      const rows = await listClassificationReviewRows(member.organization_id);
      const firstRowById = new Map(rows.map((row) => [`${row.entityType}:${row.entityId}`, row]));
      const firstSelected = firstRowById.get(`${selectedRows[0][0]}:${selectedRows[0][1]}`) ?? null;
      code =
        firstSelected && isTradesstackFinancialRoutingCode(firstSelected.tradesstackCostCode)
          ? firstSelected.tradesstackCostCode
          : "800";
    }

    if (!code) {
      throw new Error("Choose a TradesStack routing code for the batch action.");
    }

    await updateFinancialRoutingRows({
      organizationId: member.organization_id,
      actorUserId: member.user_id,
      rows: selectedRows.map(([entityType, entityId]) => ({ entityType, entityId })),
      tradesstackCostCode: code,
      mode,
    });

    revalidatePath(PAGE_PATH);
    redirect(PAGE_PATH);
  }

  const rows = await listClassificationReviewRows(currentMember.organization_id);
  const editingRow = editTarget
    ? rows.find((row) => row.entityId === editTarget || `${row.entityType}:${row.entityId}` === editTarget) ?? null
    : null;

  return (
    <div className="space-y-6">
      <OperationalModuleHeader
        eyebrow="Financial routing"
        title="Financial routing review"
        description="Review only the broad TradesStack routing code and accounting mapping state. Construction intelligence is not part of this queue."
      />

      {editingRow ? (
        <OperationalPanel>
          <div className="space-y-3">
            <h2 className={`${ibmPlexSans.className} text-lg font-semibold text-[var(--text-primary)]`}>
              Edit routing review
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {editingRow.title} · {editingRow.sourceLabel}
            </p>
            <ReviewEditorForm
              action={saveRoutingReviewAction}
              cancelHref={PAGE_PATH}
              entityType={editingRow.entityType}
              entityId={editingRow.entityId}
              initialTradesstackCostCode={editingRow.tradesstackCostCode ?? "800"}
              constructionIntelligenceSummary={formatConstructionIntelligenceSummary(editingRow.aiConstructionIntelligence)}
            />
          </div>
        </OperationalPanel>
      ) : null}

      <OperationalPanel>
        <form action={applyBatchReviewAction} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <label className="block">
              <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                Batch action
              </span>
              <select
                name="batchAction"
                className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
                defaultValue="approve_selected"
              >
                <option value="approve_selected">Approve selected rows</option>
                <option value="change_code">Change selected rows to code</option>
                <option value="mark_others">Mark selected rows as 800 Others</option>
              </select>
            </label>
            <label className="block">
              <span className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                TradesStack code
              </span>
              <select
                name="batchTradesstackCostCode"
                defaultValue="100"
                className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
              >
                {listTradesstackFinancialRoutingCodes().map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Apply Batch Review</Button>
          </div>

          {rows.length === 0 ? (
            <OperationalEmptyState
              title="No routing review items"
              description="New records are routing cleanly, or any remaining issues are now accounting mapping tasks."
            />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
              <OperationalTable>
                <OperationalTableHeader>
                  <OperationalTableRow>
                    <OperationalTableHead className="w-[44px]">Select</OperationalTableHead>
                    <OperationalTableHead>Item</OperationalTableHead>
                    <OperationalTableHead>Routing</OperationalTableHead>
                    <OperationalTableHead>Mapping</OperationalTableHead>
                    <OperationalTableHead>Context</OperationalTableHead>
                    <OperationalTableHead className="text-right">Action</OperationalTableHead>
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {rows.map((row) => {
                    const reviewStatus = formatReviewStatus(row.reviewStatus);
                    return (
                      <OperationalTableRow key={`${row.entityType}:${row.entityId}`}>
                        <OperationalTableCell>
                          <input type="checkbox" name="selectedRows" value={`${row.entityType}:${row.entityId}`} />
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--text-primary)]">{row.title}</p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {row.projectName ? `${row.projectName} · ` : ""}
                              {row.sourceLabel}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">{row.description}</p>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <StatusBadge status={reviewStatus.tone}>{reviewStatus.label}</StatusBadge>
                            <p className="text-sm text-[var(--text-primary)]">
                              {row.tradesstackCostCode ?? "—"} {row.tradesstackCostCodeLabel ?? ""}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Confidence {formatConfidence(row.confidence)} · Source {row.classificationSource ?? "—"}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Reason {row.reviewReason ?? "No reason captured"}
                            </p>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-2">
                            <StatusBadge status={row.accountingStatus === "resolved" ? "approved" : "overdue"}>
                              {row.accountingStatus === "resolved" ? "Mapped" : "Needs mapping"}
                            </StatusBadge>
                            <p className="text-sm text-[var(--text-primary)]">
                              {row.mappedOrganizationCostCodeLabel ?? "No external accounting code mapped"}
                            </p>
                            <Link href="/app/company/cost-codes" className="text-xs font-medium text-[var(--brand-blue)] hover:underline">
                              Resolve mapping in Cost Codes
                            </Link>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                            <p>Amount {formatMoney(row.amount)}</p>
                            <p>Entity {row.entityType === "cost_item" ? "Cost item" : "Material"}</p>
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right">
                          <Link
                            href={`${PAGE_PATH}?edit=${row.entityType}:${row.entityId}`}
                            className="inline-flex items-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]"
                          >
                            Edit routing
                          </Link>
                        </OperationalTableCell>
                      </OperationalTableRow>
                    );
                  })}
                </OperationalTableBody>
              </OperationalTable>
            </div>
          )}
        </form>
      </OperationalPanel>
    </div>
  );
}
