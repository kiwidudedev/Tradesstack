"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, FileText, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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

  const summary = useMemo(() => {
    const totalVariations = variationRows.length;
    const draftValue = variationRows
      .filter((row) => row.status === "Draft")
      .reduce((sum, row) => sum + (variationTotalById.get(row.id) ?? 0), 0);
    const awaitingClientValue = variationRows
      .filter((row) => row.status === "Sent" || row.status === "Client Review")
      .reduce((sum, row) => sum + (variationTotalById.get(row.id) ?? 0), 0);
    const approvedValue = variationRows
      .filter((row) => row.status === "Approved")
      .reduce((sum, row) => sum + (variationTotalById.get(row.id) ?? 0), 0);

    return {
      totalVariations,
      draftValue,
      awaitingClientValue,
      approvedValue,
    };
  }, [variationRows, variationTotalById]);

  return (
    <div className="space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          asChild
          className={`${interMedium.className} h-8 rounded-[6px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
        >
          <Link href={`/app/projects/${routeProjectSlug}/dashboard`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Variation Register</h1>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Create, track, price, approve, and invoice project variations in one place{projectName ? ` for ${projectName}` : ""}.
              </p>
            </div>
            <Button asChild className={`${interMedium.className} h-10 rounded-[6px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}>
              <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations/new`}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Variation
              </Link>
            </Button>
          </div>
          {error ? (
            <p className={`${interMedium.className} mt-4 rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
          ) : null}
        </CardHeader>
      </Card>

      <div className="overflow-x-auto rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC]">
        <div className="flex min-w-[900px] divide-x divide-[#E3E8F0]">
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <FileText className="h-5 w-5 text-[#334155]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Total Variations</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{summary.totalVariations}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Clock3 className="h-5 w-5 text-[#B45309]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Draft Value</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(summary.draftValue)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Send className="h-5 w-5 text-[#1D4ED8]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Awaiting Client Value</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(summary.awaitingClientValue)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Approved Value</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{toMoney(summary.approvedValue)}</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-2 pt-5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Variation Register</h2>
        </CardHeader>
        <CardContent className="pb-5">
          {isLoading ? (
            <p className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading variation register...</p>
          ) : variationRows.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[#D7DFEC] bg-[#FAFCFF] px-4 py-8 text-center">
              <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No variations yet for this project.</p>
              <Button asChild className={`${interMedium.className} mt-3 h-9 rounded-[6px] bg-[#F74917] px-4 text-sm text-white hover:bg-[#e63f10]`}>
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations/new`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create First Variation
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[6px] border border-[#E8EDF5]">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className={`${interMedium.className} bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
                    <th className="px-3 py-2 text-left">Variation #</th>
                    <th className="px-3 py-2 text-left">Variation Name</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Requested</th>
                    <th className="px-3 py-2 text-left">Due</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {variationRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/variations/${row.id}`)}
                      className="cursor-pointer border-t border-[#EEF2F7] transition-colors hover:bg-[#F8FBFF]"
                    >
                      <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A]">
                        <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations/${row.id}`} className="hover:underline">
                          {row.variation_number}
                        </Link>
                      </td>
                      <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#1F2E45]`}>
                        {row.variation_title || "Untitled variation"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-[6px] border px-2 py-0.5 text-xs font-semibold ${statusClassName(row.status)}`}>
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
                        <div className="flex items-center justify-end">
                          <span className="text-right text-sm font-semibold text-[#0F172A]">{toMoney(variationTotalById.get(row.id) ?? 0)}</span>
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
