"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type PurchaseOrderStatus = "Draft" | "Pending Approval" | "Approved" | "Issued" | "Received" | "Invoiced" | "Cancelled";

interface PurchaseOrderRegisterRow {
  id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  issued_to_label: string | null;
  status: PurchaseOrderStatus;
  requested_date: string | null;
  due_date: string | null;
  total_purchase_order_price: number | null;
  updated_at: string;
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

function toSummaryStatus(status: string) {
  switch (status) {
    case "Draft":
      return "draft";
    case "Pending Approval":
    case "Priced":
      return "pending";
    case "Issued":
    case "Sent":
    case "Client Review":
      return "issued";
    case "Received":
      return "received";
    case "Approved":
      return "approved";
    case "Invoiced":
      return "invoiced";
    default:
      return "other";
  }
}

export default function ProjectVariationRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session } = useAuth();
  const sessionOrganizationId = session?.organizationId ?? null;

  const [projectName, setProjectName] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingPurchaseOrderId, setDeletingPurchaseOrderId] = useState<string | null>(null);
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

        if (!cancelled) {
          setOrganizationId(resolvedOrganizationId);
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
          .select("id, purchase_order_number, purchase_order_title, issued_to_label, status, requested_date, due_date, total_purchase_order_price, updated_at")
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

  const summary = useMemo(() => {
    const totalVariations = purchaseOrderRows.length;
    const draftValue = purchaseOrderRows
      .filter((row) => {
        const mapped = toSummaryStatus(row.status);
        return mapped === "draft" || mapped === "pending";
      })
      .reduce((sum, row) => sum + (row.total_purchase_order_price ?? 0), 0);
    const awaitingClientValue = purchaseOrderRows
      .filter((row) => {
        const mapped = toSummaryStatus(row.status);
        return mapped === "issued" || mapped === "received";
      })
      .reduce((sum, row) => sum + (row.total_purchase_order_price ?? 0), 0);
    const approvedValue = purchaseOrderRows
      .filter((row) => {
        const mapped = toSummaryStatus(row.status);
        return mapped === "approved" || mapped === "invoiced";
      })
      .reduce((sum, row) => sum + (row.total_purchase_order_price ?? 0), 0);

    return {
      totalVariations,
      draftValue,
      awaitingClientValue,
      approvedValue,
    };
  }, [purchaseOrderRows]);

  const deletePurchaseOrder = async (purchaseOrderId: string) => {
    const purchaseOrder = purchaseOrderRows.find((item) => item.id === purchaseOrderId);
    if (!purchaseOrder) {
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete purchase order ${purchaseOrder.purchase_order_number}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    if (!supabase || !organizationId) {
      setError("Purchase order delete is not ready. Please refresh and try again.");
      return;
    }

    setError(null);
    setDeletingPurchaseOrderId(purchaseOrderId);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
      const { error: deleteError } = await purchaseOrdersTable
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", purchaseOrderId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setPurchaseOrderRows((current) => current.filter((row) => row.id !== purchaseOrderId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete purchase order.");
    } finally {
      setDeletingPurchaseOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          asChild
          className={`${interMedium.className} h-8 rounded-[8px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
        >
          <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Purchase Order Register</h1>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Create, track, issue, approve, and invoice project purchase orders in one place{projectName ? ` for ${projectName}` : ""}.
              </p>
            </div>
            <Button asChild className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}>
              <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/new`}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Purchase Order
              </Link>
            </Button>
          </div>
          {error ? (
            <p className={`${interMedium.className} mt-4 rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
          ) : null}
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="py-4">
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Total Purchase Orders</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{summary.totalVariations}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="py-4">
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Draft Value</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{toMoney(summary.draftValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="py-4">
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Issued Value</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{toMoney(summary.awaitingClientValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="py-4">
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Invoiced Value</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{toMoney(summary.approvedValue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Purchase Order Register</h2>
        </CardHeader>
        <CardContent className="pb-5">
          {isLoading ? (
            <p className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading purchase order register...</p>
          ) : purchaseOrderRows.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#D7DFEC] bg-[#FAFCFF] px-4 py-8 text-center">
              <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No purchase orders yet for this project.</p>
              <Button asChild className={`${interMedium.className} mt-3 h-9 rounded-[9px] bg-[#F74917] px-4 text-sm text-white hover:bg-[#e63f10]`}>
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/new`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create First Purchase Order
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[#E8EDF5]">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className={`${interMedium.className} bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
                    <th className="px-3 py-2 text-left">Purchase Order #</th>
                    <th className="px-3 py-2 text-left">Purchase Order Name</th>
                    <th className="px-3 py-2 text-left">Issued To</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Requested</th>
                    <th className="px-3 py-2 text-left">Due</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrderRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${row.id}`)}
                      className="cursor-pointer border-t border-[#EEF2F7] transition-colors hover:bg-[#F8FBFF]"
                    >
                      <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A]">
                        <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${row.id}`} className="hover:underline">
                          {row.purchase_order_number}
                        </Link>
                      </td>
                      <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#1F2E45]`}>
                        {row.purchase_order_title || "Untitled purchase order"}
                      </td>
                      <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>
                        {row.issued_to_label?.trim() || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClassName(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>
                        {toDayMonthYearLabel(row.requested_date)}
                      </td>
                      <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>
                        {toDayMonthYearLabel(row.due_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-right text-sm font-semibold text-[#0F172A]">
                            {toMoney(row.total_purchase_order_price ?? 0)}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void deletePurchaseOrder(row.id);
                            }}
                            disabled={deletingPurchaseOrderId === row.id}
                            className="h-9 w-9 rounded-[8px] border-[#d6dfeb] bg-white p-0 text-[#9AA8BC] hover:bg-[#F8FAFC] hover:text-[#64748B] disabled:opacity-60"
                            aria-label={`Delete purchase order ${row.purchase_order_number}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
