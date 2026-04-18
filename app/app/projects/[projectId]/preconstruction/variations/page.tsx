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

function statusClassName(status: VariationStatus) {
  switch (status) {
    case "Approved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Rejected":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "Invoiced":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Sent":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Client Review":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Priced":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function numberOrZero(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateVariationTotal(row: VariationRegisterRow, baseSubtotal: number) {
  const margin = baseSubtotal * (numberOrZero(row.margin_percent) / 100);
  const contingency = numberOrZero(row.contingency_amount);
  const discount = numberOrZero(row.discount_amount);
  const preGstTotal = Math.max(0, baseSubtotal + margin + contingency - discount);
  const gst = preGstTotal * (numberOrZero(row.gst_percent) / 100);
  return preGstTotal + gst;
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
                return [row.id, calculateVariationTotal(row, baseSubtotal)];
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
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>

      {/* Hero */}
      <section className={`${styles.heroBlock} mb-2`}>
        <div className="min-w-0 flex-1">
          <h1 className={`${ibmPlexSans.className} ${styles.quotePageTitle}`}>Variations</h1>
          <p className={`${interMedium.className} mt-1 text-[15px] text-[#6b6b6b]`}>Manage and create project variations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void createVariationAndOpen()}
            disabled={isCreating || isLoading || !canManageVariations}
            className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}
          >
            <Plus className="mr-1 h-4 w-4" />
            {isCreating ? "Creating..." : "New Variation"}
          </Button>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}
      {!canManageVariations && session ? (
        <p className={`${interMedium.className} rounded-[10px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800`}>
          Only owner, admin, QS, and project manager roles can create or edit variations.
        </p>
      ) : null}

      <div className="px-0 py-0">
        {isLoading ? (
          <p className={`${interMedium.className} py-8 text-center text-sm font-medium text-[#6b6b6b]`}>Loading variation register...</p>
        ) : (
          <div className="space-y-6">

            {/* Table */}
            {variationRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#D7E1EC] bg-[#F8FAFC] px-6 py-14 text-center">
                <p className={`${interMedium.className} text-sm font-medium text-[#6b6b6b]`}>No variations yet for this project.</p>
                <Button
                  onClick={() => void createVariationAndOpen()}
                  disabled={isCreating || isLoading}
                  className={`${styles.quoteButtonLabel} mt-4 h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {isCreating ? "Creating..." : "Create First Variation"}
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC]">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className={`${interMedium.className} border-b border-[#D7E1EC] bg-[#F3F4F6] text-[13px] font-semibold text-[#475569]`}>
                      <th className="w-[130px] px-4 py-2.5 text-left">Variation #</th>
                      <th className="w-[200px] px-4 py-2.5 text-left">Name</th>
                      <th className="w-[120px] px-4 py-2.5 text-left">Status</th>
                      <th className="w-[110px] px-4 py-2.5 text-left">Requested</th>
                      <th className="w-[90px] px-4 py-2.5 text-left">Due</th>
                      <th className="w-[110px] px-4 py-2.5 text-left">Value</th>
                      <th className="w-[52px] px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
                    {variationRows.map((row) => (
                      <tr
                        key={row.id}
                        className="transition-colors"
                      >
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[#1d2433]`}>
                          {row.variation_number}
                        </td>
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] font-medium text-[#1d2433]`}>
                          {row.variation_title || "Untitled variation"}
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
                              className="!z-[200] min-w-[160px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                            >
                              {ALL_STATUSES.map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onSelect={() => void updateVariationStatus(row.id, s)}
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
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[#475569]`}>
                          {toDayMonthYearLabel(row.due_date)}
                        </td>
                        <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[#1d2433]`}>
                          {toMoney(variationTotalById.get(row.id) ?? 0)}
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
                                  onSelect={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/variations/${row.id}`)}
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
                <span>Total</span>
                <span>{toMoney(totalVariationValue)}</span>
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
