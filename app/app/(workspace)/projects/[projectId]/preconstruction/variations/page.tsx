"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
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
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { canManageCommercialData } from "@/lib/role-permissions";

type VariationStatus = "Draft" | "Priced" | "Sent" | "Client Review" | "Approved" | "Rejected" | "Invoiced";

interface VariationRegisterRow {
  id: string;
  variation_number: string;
  variation_title: string;
  status: VariationStatus;
  requested_date: string | null;
  due_date: string | null;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
  gst_percent: number | null;
  updated_at: string;
}

interface VariationLineItemRow {
  variation_id: string;
  quantity: number | null;
  rate: number | null;
}

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function toDayMonthYearLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusBadgeStatus(status: VariationStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Approved":
      return "approved";
    case "Rejected":
      return "overdue";
    case "Invoiced":
      return "sent";
    case "Sent":
      return "approved";
    case "Client Review":
      return "pending";
    case "Priced":
      return "pending";
    default:
      return "draft";
  }
}

const STATUS_DOT_CLASS_BY_BADGE: Record<NonNullable<StatusBadgeProps["status"]>, string> = {
  approved: "bg-[var(--success)] border-[var(--success)]",
  pending: "bg-[var(--warning)] border-[var(--warning)]",
  overdue: "bg-[var(--error)] border-[var(--error)]",
  sent: "bg-[var(--info)] border-[var(--info)]",
  completed: "bg-[var(--status-completed)] border-[var(--status-completed)]",
  active: "bg-[var(--status-active)] border-[var(--status-active)]",
  draft: "bg-[var(--text-muted)] border-[var(--text-muted)]",
};

function numberOrZero(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateVariationPreGstTotal(row: VariationRegisterRow, baseSubtotal: number) {
  const margin = baseSubtotal * (numberOrZero(row.margin_percent) / 100);
  const contingency = numberOrZero(row.contingency_amount);
  const discount = numberOrZero(row.discount_amount);
  return Math.max(0, baseSubtotal + margin + contingency - discount);
}

export default function ProjectVariationRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session } = useAuth();
  const sessionOrganizationId = session?.organizationId ?? null;
  const canManageVariations = canManageCommercialData(session?.role);

  const [projectName, setProjectName] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variationRows, setVariationRows] = useState<VariationRegisterRow[]>([]);
  const [variationTotalById, setVariationTotalById] = useState<Map<string, number>>(new Map());

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase || !routeProjectSlug) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let resolvedOrganizationId = sessionOrganizationId;
        if (!resolvedOrganizationId) {
          const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
          resolvedOrganizationId = ensuredOrganizationId ?? null;
        }

        if (!resolvedOrganizationId) {
          throw new Error("Could not resolve your organization.");
        }

        const { data: projectRow, error: projectError } = await supabase
          .from("organization_projects")
          .select("id, name")
          .eq("organization_id", resolvedOrganizationId)
          .eq("slug", routeProjectSlug)
          .maybeSingle();

        if (projectError || !projectRow) {
          throw new Error(projectError?.message ?? "Project not found.");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const variationsTable = (supabase as any).from("project_variations");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lineItemsTable = (supabase as any).from("project_variation_line_items");

        const { data: variationsRaw, error: variationsError } = await variationsTable
          .select("id, variation_number, variation_title, status, requested_date, due_date, margin_percent, discount_amount, contingency_amount, gst_percent, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false });

        if (variationsError) {
          throw new Error(variationsError.message);
        }

        const variationRows = (variationsRaw ?? []) as VariationRegisterRow[];
        const variationIds = variationRows.map((row) => row.id);

        let totalsById = new Map<string, number>();
        if (variationIds.length > 0) {
          const { data: lineItemsRaw, error: lineItemsError } = await lineItemsTable
            .select("variation_id, quantity, rate")
            .in("variation_id", variationIds);

          if (!lineItemsError) {
            const lineItems = (lineItemsRaw ?? []) as VariationLineItemRow[];
            const baseSubtotalById = new Map<string, number>();

            for (const line of lineItems) {
              const current = baseSubtotalById.get(line.variation_id) ?? 0;
              const lineTotal = numberOrZero(line.quantity) * numberOrZero(line.rate);
              baseSubtotalById.set(line.variation_id, current + lineTotal);
            }

            totalsById = new Map<string, number>(
              variationRows.map((row) => {
                const baseSubtotal = baseSubtotalById.get(row.id) ?? 0;
                return [row.id, calculateVariationPreGstTotal(row, baseSubtotal)];
              })
            );
          } else {
            totalsById = new Map<string, number>(variationRows.map((row) => [row.id, 0]));
          }
        }

        if (cancelled) {
          return;
        }

        setOrganizationId(resolvedOrganizationId);
        setProjectId(projectRow.id);
        setProjectName(projectRow.name || "");
        setVariationRows(variationRows);
        setVariationTotalById(totalsById);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load variations.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [routeProjectSlug, sessionOrganizationId, supabase]);

  const totalVariationValue = useMemo(() => {
    return variationRows.reduce((sum, row) => sum + (variationTotalById.get(row.id) ?? 0), 0);
  }, [variationRows, variationTotalById]);

  const createVariationAndOpen = useCallback(async () => {
    if (!supabase || !organizationId || !projectId || isCreating) {
      return;
    }

    if (!canManageVariations) {
      setError("You do not have permission to create variations.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: createdRows, error: createError } = await (supabase as any).rpc("create_project_variation_draft", {
        p_organization_id: organizationId,
        p_project_id: projectId,
        p_title: "New Variation",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(createdRows) ? createdRows[0] : null;
      if (!createdRow?.id) {
        throw new Error("Variation was created but no identifier was returned.");
      }

      router.push(`/app/projects/${routeProjectSlug}/preconstruction/variations/${createdRow.id}`);
    } catch (createErr) {
      setError(createErr instanceof Error ? createErr.message : "Unable to create variation.");
      setIsCreating(false);
    }
  }, [canManageVariations, isCreating, organizationId, projectId, routeProjectSlug, router, supabase]);

  const updateVariationStatus = useCallback(async (variationId: string, newStatus: VariationStatus) => {
    if (!supabase || !organizationId || !canManageVariations) return;
    setVariationRows((prev) => prev.map((r) => r.id === variationId ? { ...r, status: newStatus } : r));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("project_variations").update({ status: newStatus }).eq("id", variationId).eq("organization_id", organizationId);
  }, [canManageVariations, organizationId, supabase]);

  const ALL_STATUSES: VariationStatus[] = ["Draft", "Priced", "Sent", "Client Review", "Approved", "Rejected", "Invoiced"];

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalPageHeader
        title="Variations"
        description="Manage and create project variations"
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void createVariationAndOpen()}
            disabled={isCreating || isLoading || !canManageVariations}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating..." : "New Variation"}
          </Button>
        }
      />

      {error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      ) : null}
      {!canManageVariations && session ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--warning)]">
          Only owner, admin, QS, and project manager roles can create or edit variations.
        </div>
      ) : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading variation register...</p>
      ) : (
        <div className="space-y-6">
          {variationRows.length === 0 ? (
            <OperationalEmptyState
              title="No variations yet for this project."
              actions={
                <Button
                  onClick={() => void createVariationAndOpen()}
                  disabled={isCreating || isLoading}
                >
                  <Plus className="h-4 w-4" />
                  {isCreating ? "Creating..." : "Create First Variation"}
                </Button>
              }
            />
          ) : (
            <OperationalPanel contentClassName="p-0">
              <OperationalTable>
                <OperationalTableHeader>
                  <OperationalTableRow>
                    <OperationalTableHead className="w-[130px]">Variation #</OperationalTableHead>
                    <OperationalTableHead className="w-[200px]">Name</OperationalTableHead>
                    <OperationalTableHead className="w-[120px]">Status</OperationalTableHead>
                    <OperationalTableHead className="w-[110px]">Requested</OperationalTableHead>
                    <OperationalTableHead className="w-[90px]">Due</OperationalTableHead>
                    <OperationalTableHead className="w-[140px]">Value (excl. GST)</OperationalTableHead>
                    <OperationalTableHead className="w-[52px]" />
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {variationRows.map((row) => {
                    const rowBadge = statusBadgeStatus(row.status);
                    return (
                      <OperationalTableRow key={row.id}>
                        <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                          {row.variation_number}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-primary)]">
                          {row.variation_title || "Untitled variation"}
                        </OperationalTableCell>
                        <OperationalTableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="group inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] transition hover:opacity-80"
                              >
                                <StatusBadge status={rowBadge}>{row.status}</StatusBadge>
                                <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                            >
                              {ALL_STATUSES.map((s) => {
                                const optionBadge = statusBadgeStatus(s);
                                return (
                                  <DropdownMenuItem
                                    key={s}
                                    onSelect={() => void updateVariationStatus(row.id, s)}
                                    className={`h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)] ${row.status === s ? "text-[var(--orange-primary)]" : "text-[var(--text-primary)]"}`}
                                  >
                                    <span className={`mr-2 inline-block h-2 w-2 rounded-full border ${STATUS_DOT_CLASS_BY_BADGE[optionBadge]}`} />
                                    {s}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          {toDayMonthYearLabel(row.requested_date)}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          {toDayMonthYearLabel(row.due_date)}
                        </OperationalTableCell>
                        <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                          {toMoney(variationTotalById.get(row.id) ?? 0)}
                        </OperationalTableCell>
                        <OperationalTableCell className="px-2">
                          <div className="flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                              >
                                <DropdownMenuItem
                                  onSelect={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/variations/${row.id}`)}
                                  className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                >
                                  <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1 bg-[var(--border)]" />
                                <DropdownMenuItem
                                  onSelect={() => {}}
                                  className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--error)] focus:bg-[var(--error-light)]"
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </OperationalTableCell>
                      </OperationalTableRow>
                    );
                  })}
                </OperationalTableBody>
              </OperationalTable>
            </OperationalPanel>
          )}

          <div className="flex items-center justify-end border-t border-[var(--border)] pt-4">
            <p className="flex items-center gap-6 text-lg font-semibold text-[var(--text-primary)]">
              <span>Total (excl. GST)</span>
              <span>{toMoney(totalVariationValue)}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
