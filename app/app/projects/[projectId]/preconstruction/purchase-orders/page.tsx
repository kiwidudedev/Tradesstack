"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { canManageCommercialData } from "@/lib/role-permissions";
import styles from "@/components/app/trade-pack-builder.module.css";

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

function statusClassName(status: PurchaseOrderStatus) {
  switch (status) {
    case "Issued":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Approved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Received":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "Cancelled":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "Invoiced":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Pending Approval":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function ProjectVariationRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session } = useAuth();
  const sessionOrganizationId = session?.organizationId ?? null;
  const canManagePurchaseOrders = canManageCommercialData(session?.role);

  const [projectName, setProjectName] = useState("");
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
        setProjectName(projectRow.name || "");
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
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>

      {/* Hero */}
      <section className={`${styles.heroBlock} mb-2`}>
        <div className="min-w-0 flex-1">
          <h1 className={`${ibmPlexSans.className} ${styles.quotePageTitle}`}>Purchase Orders</h1>
          <p className={`${interMedium.className} mt-1 text-[15px] text-[#6b6b6b]`}>Create, track, issue, approve, and invoice purchase orders for this job</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void createPurchaseOrderAndOpen()}
            disabled={isCreating || isLoading || !canManagePurchaseOrders}
            className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}
          >
            <Plus className="mr-1 h-4 w-4" />
            {isCreating ? "Creating..." : "New Purchase Order"}
          </Button>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}
      {!canManagePurchaseOrders && session ? (
        <p className={`${interMedium.className} rounded-[10px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800`}>
          Only owner, admin, QS, and project manager roles can create or edit purchase orders.
        </p>
      ) : null}

      <div className="px-0 py-0">
        {isLoading ? (
          <p className={`${interMedium.className} py-8 text-center text-sm font-medium text-[#6b6b6b]`}>Loading purchase orders...</p>
        ) : (
          <div className="space-y-6">

            {/* Table */}
            {purchaseOrderRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#D7E1EC] bg-[#F8FAFC] px-6 py-14 text-center">
                <p className={`${interMedium.className} text-sm font-medium text-[#6b6b6b]`}>No purchase orders yet for this project.</p>
                <Button
                  onClick={() => void createPurchaseOrderAndOpen()}
                  disabled={isCreating || isLoading}
                  className={`${styles.quoteButtonLabel} mt-4 h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {isCreating ? "Creating..." : "Create First Purchase Order"}
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC]">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className={`${interMedium.className} border-b border-[#D7E1EC] bg-[#F3F4F6] text-[13px] font-semibold text-[#475569]`}>
                      <th className="w-[130px] px-4 py-2.5 text-left">PO #</th>
                      <th className="w-[200px] px-4 py-2.5 text-left">Name</th>
                      <th className="w-[150px] px-4 py-2.5 text-left">Issued To</th>
                      <th className="w-[140px] px-4 py-2.5 text-left">Status</th>
                      <th className="w-[110px] px-4 py-2.5 text-left">Requested</th>
                      <th className="w-[140px] px-4 py-2.5 text-left">Value (excl. GST)</th>
                      <th className="w-[52px] px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
                    {purchaseOrderRows.map((row) => (
                      <tr key={row.id} className="transition-colors">
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[#1d2433]`}>
                          {row.purchase_order_number}
                        </td>
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] font-medium text-[#1d2433]`}>
                          {row.purchase_order_title || "Untitled purchase order"}
                        </td>
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[#475569]`}>
                          {row.issued_to_label?.trim() || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={`inline-flex cursor-pointer items-center gap-1 rounded-[8px] border px-2.5 py-0.5 text-[12px] font-semibold transition-opacity hover:opacity-80 ${statusClassName(row.status)}`}>
                                {row.status}
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="!z-[200] min-w-[170px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                            >
                              {ALL_STATUSES.map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onSelect={() => void updatePurchaseOrderStatus(row.id, s)}
                                  className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium focus:bg-[#F8FAFC] ${row.status === s ? "text-[#F15A29]" : "text-[#1d2433]"}`}
                                >
                                  <span className={`mr-2 inline-block h-2 w-2 rounded-full border ${statusClassName(s)}`} />
                                  {s}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[#475569]`}>
                          {toDayMonthYearLabel(row.requested_date)}
                        </td>
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[#1d2433]`}>
                          {toMoney(calculatePurchaseOrderPreGstTotal(row))}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-full border-[#D7E1EC] bg-white text-[#9AA8BC] hover:bg-[#F8FAFC] hover:text-[#1d2433]"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="!z-[200] min-w-[160px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                              >
                                <DropdownMenuItem
                                  onSelect={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${row.id}`)}
                                  className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-[#1d2433] focus:bg-[#F8FAFC]`}
                                >
                                  <Pencil className="mr-2 h-3.5 w-3.5 text-[#64748B]" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1 bg-[#E8EDF5]" />
                                <DropdownMenuItem
                                  onSelect={() => {}}
                                  className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-rose-600 focus:bg-rose-50`}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total Value */}
            <div className="flex items-center justify-end border-t border-[#E8EDF5] pt-4">
              <p className={`${interMedium.className} flex items-center gap-6 text-[18px] font-semibold text-[#1d2433]`}>
                <span>Total (excl. GST)</span>
                <span>{toMoney(totalPurchaseOrderValue)}</span>
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
