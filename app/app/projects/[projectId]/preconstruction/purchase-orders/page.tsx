"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
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

export default function ProjectVariationRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session } = useAuth();
  const sessionOrganizationId = session?.organizationId ?? null;

  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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

  const totalPurchaseOrderValue = useMemo(() => {
    return purchaseOrderRows.reduce((sum, row) => sum + (row.total_purchase_order_price ?? 0), 0);
  }, [purchaseOrderRows]);

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Purchase Orders</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Create, track, issue, approve, and invoice purchase orders for this job
          </p>
        </div>
        <div className={styles.heroActions}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}
              >
                Actions
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={8} className={`${styles.menuPanel} !z-[200] min-w-[220px] !bg-[#F3F4F6] p-1.5 opacity-100`}>
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Project Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
              <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/new`}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Purchase Order
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#F3F4F6] px-7 pb-7 pt-5 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)] md:px-8 md:pb-8 md:pt-6">
        <div className="space-y-6">
          {isLoading ? (
            <p className={`${interMedium.className} py-8 text-sm font-medium text-[#6b6b6b]`}>Loading purchase order register...</p>
          ) : (
            <>
              <div className="py-1">
                <div className="grid gap-6 md:grid-cols-[1.45fr_1fr] md:items-end">
                  <div className="min-w-0 space-y-3">
                    <p className="truncate text-[30px] font-semibold leading-[1.04] tracking-[-0.02em] text-[#1d2433]">
                      {projectName || "Project"}
                    </p>
                    <p className={`${interMedium.className} text-sm text-[#64748B]`}>
                      {purchaseOrderRows.length} purchase order{purchaseOrderRows.length === 1 ? "" : "s"} in register
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <p className="text-[36px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">
                      {toMoney(totalPurchaseOrderValue)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Purchase Order Register</h3>
                {purchaseOrderRows.length === 0 ? (
                  <div className={`${styles.cardMuted} ${styles.producedRowProjectTone} px-5 py-6 text-center`}>
                    <p className={`${interMedium.className} text-sm font-medium text-[#5b6879]`}>
                      No purchase orders yet for this project.
                    </p>
                    <Button asChild className={`${interMedium.className} mt-3 h-8 rounded-full bg-[#0B2739] px-3 text-[13px] text-white hover:bg-[#0B2739]`}>
                      <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/new`}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Create First Purchase Order
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[12px] border border-[#D9DEE5] bg-[#F6F7F9]">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]`}>
                          <th className="px-4 py-3 text-left">Purchase Order #</th>
                          <th className="px-4 py-3 text-left">Purchase Order Name</th>
                          <th className="px-4 py-3 text-left">Issued To</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Requested</th>
                          <th className="px-4 py-3 text-left">Due</th>
                          <th className="px-4 py-3 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseOrderRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${row.id}`)}
                            className="cursor-pointer border-t border-[#D9DEE5] bg-[#F3F4F6] transition-colors hover:bg-[#EEF2F7]"
                          >
                            <td className="px-4 py-3 text-sm font-semibold text-[#1d1d1d]">
                              <Link href={`/app/projects/${routeProjectSlug}/preconstruction/purchase-orders/${row.id}`} className="hover:underline">
                                {row.purchase_order_number}
                              </Link>
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {row.purchase_order_title || "Untitled purchase order"}
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {row.issued_to_label?.trim() || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold ${statusClassName(row.status)}`}>
                                {row.status}
                              </span>
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {toDayMonthYearLabel(row.requested_date)}
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {toDayMonthYearLabel(row.due_date)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-[#1d1d1d]">
                              {toMoney(row.total_purchase_order_price ?? 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Linked Workflows</h3>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                    <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote`}>View Quote</Link>
                  </Button>
                  <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                    <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations`}>View Variations</Link>
                  </Button>
                  <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                    <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>Project Dashboard</Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
