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

  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Variations</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Manage and create project variations
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
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations/new`}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Variation
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
            <p className={`${interMedium.className} py-8 text-sm font-medium text-[#6b6b6b]`}>Loading variation register...</p>
          ) : (
            <>
              <div className="py-1">
                <div className="grid gap-6 md:grid-cols-[1.45fr_1fr] md:items-start">
                  <div className="min-w-0 space-y-3">
                    <p className="truncate text-[30px] font-semibold leading-[1.04] tracking-[-0.02em] text-[#1d2433]">
                      {projectName || "Project"}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>
                      Total Variation Value
                    </p>
                    <p className="text-[36px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">
                      {toMoney(totalVariationValue)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Variation Summary</h3>
                {variationRows.length === 0 ? (
                  <div className={`${styles.cardMuted} ${styles.producedRowProjectTone} px-5 py-6 text-center`}>
                    <p className={`${interMedium.className} text-sm font-medium text-[#5b6879]`}>
                      No variations yet for this project.
                    </p>
                    <Button asChild className={`${interMedium.className} mt-3 h-8 rounded-full bg-[#0B2739] px-3 text-[13px] text-white hover:bg-[#0B2739]`}>
                      <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations/new`}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Create First Variation
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[12px] border border-[#D9DEE5] bg-[#F6F7F9]">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]`}>
                          <th className="px-4 py-3 text-left">Variation #</th>
                          <th className="px-4 py-3 text-left">Variation Name</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Requested</th>
                          <th className="px-4 py-3 text-left">Due</th>
                          <th className="px-4 py-3 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variationRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/variations/${row.id}`)}
                            className="cursor-pointer border-t border-[#D9DEE5] bg-[#F3F4F6] transition-colors hover:bg-[#EEF2F7]"
                          >
                            <td className="px-4 py-3 text-sm font-semibold text-[#1d1d1d]">
                              <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations/${row.id}`} className="hover:underline">
                                {row.variation_number}
                              </Link>
                            </td>
                            <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                              {row.variation_title || "Untitled variation"}
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
                              {toMoney(variationTotalById.get(row.id) ?? 0)}
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
                    <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>View Claims</Link>
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
