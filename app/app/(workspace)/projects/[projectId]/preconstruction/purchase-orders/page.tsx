"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
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
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { formatMoneyOperational } from "@/lib/format/currency";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { canManageCommercialData } from "@/lib/role-permissions";

type PurchaseOrderStatus = "Draft" | "Pending Approval" | "Approved" | "Issued" | "Received" | "Invoiced" | "Cancelled";

interface PurchaseOrderRegisterRow {
  id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  issued_to_label: string | null;
  status: PurchaseOrderStatus;
  requested_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
  total_purchase_order_price: number | null;
  updated_at: string;
}

function calculatePurchaseOrderPreGstTotal(row: PurchaseOrderRegisterRow) {
  const subtotal = Number(row.subtotal ?? 0);
  const marginPercent = Number(row.margin_percent ?? 0);
  const discountAmount = Number(row.discount_amount ?? 0);
  const contingencyAmount = Number(row.contingency_amount ?? 0);
  return Math.max(0, subtotal + subtotal * (marginPercent / 100) + contingencyAmount - discountAmount);
}

function toMoney(value: number) {
  return formatMoneyOperational(value, { decimals: 2 });
}

function statusBadgeStatus(status: PurchaseOrderStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Issued":
      return "pending";
    case "Approved":
      return "approved";
    case "Received":
      return "active";
    case "Cancelled":
      return "overdue";
    case "Invoiced":
      return "sent";
    case "Pending Approval":
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

export default function ProjectVariationRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session } = useAuth();
  const sessionOrganizationId = session?.organizationId ?? null;
  const canManagePurchaseOrders = canManageCommercialData(session?.role);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseOrderRows, setPurchaseOrderRows] = useState<PurchaseOrderRegisterRow[]>([]);

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
        const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");

        const { data: purchaseOrdersRaw, error: purchaseOrdersError } = await purchaseOrdersTable
          .select("id, purchase_order_number, purchase_order_title, issued_to_label, status, requested_date, due_date, subtotal, margin_percent, discount_amount, contingency_amount, total_purchase_order_price, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false });

        if (purchaseOrdersError) {
          throw new Error(purchaseOrdersError.message);
        }

        const purchaseOrderRows = (purchaseOrdersRaw ?? []) as PurchaseOrderRegisterRow[];

        if (cancelled) {
          return;
        }

        setOrganizationId(resolvedOrganizationId);
        setProjectId(projectRow.id);
        setPurchaseOrderRows(purchaseOrderRows);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load purchase orders.");
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

  const totalPurchaseOrderValue = useMemo(() => {
    return purchaseOrderRows.reduce((sum, row) => sum + calculatePurchaseOrderPreGstTotal(row), 0);
  }, [purchaseOrderRows]);

  const createPurchaseOrderAndOpen = useCallback(async () => {
    if (!supabase || !organizationId || !projectId || isCreating) {
      return;
    }

    if (!canManagePurchaseOrders) {
      setError("You do not have permission to create purchase orders.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: createdRows, error: createError } = await (supabase as any).rpc("create_project_purchase_order_draft", {
        p_organization_id: organizationId,
        p_project_id: projectId,
        p_title: "New Purchase Order",
        p_origin: "Material Supply",
      });

      if (createError) {
        throw new Error(createError.message);
      }

      const createdRow = Array.isArray(createdRows) ? createdRows[0] : null;
      if (!createdRow?.id) {
        throw new Error("Purchase order was created but no identifier was returned.");
      }

      router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${createdRow.id}`);
    } catch (createErr) {
      setError(createErr instanceof Error ? createErr.message : "Unable to create purchase order.");
      setIsCreating(false);
    }
  }, [canManagePurchaseOrders, isCreating, organizationId, projectId, routeProjectSlug, router, supabase]);

  const updatePurchaseOrderStatus = useCallback(async (purchaseOrderId: string, newStatus: PurchaseOrderStatus) => {
    if (!supabase || !organizationId || !canManagePurchaseOrders) return;
    setPurchaseOrderRows((prev) => prev.map((r) => r.id === purchaseOrderId ? { ...r, status: newStatus } : r));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("project_purchase_orders").update({ status: newStatus }).eq("id", purchaseOrderId).eq("organization_id", organizationId);
  }, [canManagePurchaseOrders, organizationId, supabase]);

  const ALL_STATUSES: PurchaseOrderStatus[] = ["Draft", "Pending Approval", "Approved", "Issued", "Received", "Invoiced", "Cancelled"];

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title="Purchase Orders"
        description="Create, track, issue, approve, and invoice purchase orders for this job"
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void createPurchaseOrderAndOpen()}
            disabled={isCreating || isLoading || !canManagePurchaseOrders}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating..." : "New Purchase Order"}
          </Button>
        }
      />

      {error ? (
        <OperationalAlert variant="error">
          {error}
        </OperationalAlert>
      ) : null}
      {!canManagePurchaseOrders && session ? (
        <OperationalAlert variant="warning">
          Only owner, admin, QS, and project manager roles can create or edit purchase orders.
        </OperationalAlert>
      ) : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading purchase orders...</p>
      ) : (
        <div className="space-y-6">
          {purchaseOrderRows.length === 0 ? (
            <OperationalEmptyState
              title="No purchase orders yet for this project."
              actions={
                <Button
                  onClick={() => void createPurchaseOrderAndOpen()}
                  disabled={isCreating || isLoading}
                >
                  <Plus className="h-4 w-4" />
                  {isCreating ? "Creating..." : "Create First Purchase Order"}
                </Button>
              }
            />
          ) : (
            <OperationalPanel contentClassName="p-0">
              <OperationalTable>
                <OperationalTableHeader>
                  <OperationalTableRow>
                    <OperationalTableHead className="w-[130px]">PO #</OperationalTableHead>
                    <OperationalTableHead className="w-[200px]">Name</OperationalTableHead>
                    <OperationalTableHead className="w-[150px]">Supplier</OperationalTableHead>
                    <OperationalTableHead className="w-[140px]">Status</OperationalTableHead>
                    <OperationalTableHead className="w-[140px]">PO Value</OperationalTableHead>
                    <OperationalTableHead className="w-[52px]" />
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {purchaseOrderRows.map((row) => {
                    const rowBadge = statusBadgeStatus(row.status);
                    return (
                      <OperationalTableRow key={row.id}>
                        <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                          {row.purchase_order_number}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-primary)]">
                          {row.purchase_order_title || "Untitled purchase order"}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          {row.issued_to_label?.trim() || "—"}
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
                              className="!z-[200] min-w-[170px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                            >
                              {ALL_STATUSES.map((s) => {
                                const optionBadge = statusBadgeStatus(s);
                                return (
                                  <DropdownMenuItem
                                    key={s}
                                    onSelect={() => void updatePurchaseOrderStatus(row.id, s)}
                                    className={`h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)] ${row.status === s ? "text-[var(--brand-blue)]" : "text-[var(--text-primary)]"}`}
                                  >
                                    <span className={`mr-2 inline-block h-2 w-2 rounded-full border ${STATUS_DOT_CLASS_BY_BADGE[optionBadge]}`} />
                                    {s}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </OperationalTableCell>
                        <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                          {toMoney(calculatePurchaseOrderPreGstTotal(row))}
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
                                  onSelect={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${row.id}`)}
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
              <span>{toMoney(totalPurchaseOrderValue)}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
