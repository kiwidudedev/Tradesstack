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
import type { QuoteStatus } from "@/lib/supabase/types";

interface QuoteRegisterRow {
  id: string;
  quote_number: string;
  quote_title: string;
  status: QuoteStatus;
  quote_date: string | null;
  expiry_date: string | null;
  total_quote_price: number;
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

function getRevision(quoteNumber: string) {
  const match = quoteNumber.match(/-(\d+)$/);
  if (!match) {
    return "—";
  }
  return `Rev ${match[1]}`;
}

function toRegisterStatus(status: QuoteStatus): string {
  switch (status) {
    case "Draft":
      return "Draft";
    case "Ready to Send":
    case "Viewed":
      return "In Review";
    case "Sent":
      return "Sent";
    case "Accepted":
      return "Accepted";
    case "Rejected":
      return "Declined";
    case "Expired":
      return "Expired";
    default:
      return status;
  }
}

function statusClassName(status: string) {
  switch (status) {
    case "Accepted":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Declined":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "Sent":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Expired":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "In Review":
      return "bg-violet-100 text-violet-800 border-violet-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function ProjectQuoteRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [projectName, setProjectName] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteRows, setQuoteRows] = useState<QuoteRegisterRow[]>([]);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase || !userId || !routeProjectSlug) {
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
          const { data: memberRow } = await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          resolvedOrganizationId = memberRow?.organization_id ?? null;
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

        const { data: quotes, error: quotesError } = await supabase
          .from("project_quotes")
          .select("id, quote_number, quote_title, status, quote_date, expiry_date, total_quote_price, updated_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false });

        if (quotesError) {
          throw new Error(quotesError.message);
        }

        if (cancelled) {
          return;
        }

        setProjectName(projectRow.name || "");
        setQuoteRows((quotes ?? []) as QuoteRegisterRow[]);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load quotes.");
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
  }, [routeProjectSlug, sessionOrganizationId, supabase, userId]);

  const summary = useMemo(() => {
    const totalQuotes = quoteRows.length;
    const draftValue = quoteRows
      .filter((row) => {
        const status = toRegisterStatus(row.status);
        return status === "Draft" || status === "In Review";
      })
      .reduce((sum, row) => sum + (row.total_quote_price ?? 0), 0);
    const sentValue = quoteRows
      .filter((row) => toRegisterStatus(row.status) === "Sent")
      .reduce((sum, row) => sum + (row.total_quote_price ?? 0), 0);
    const acceptedValue = quoteRows
      .filter((row) => toRegisterStatus(row.status) === "Accepted")
      .reduce((sum, row) => sum + (row.total_quote_price ?? 0), 0);

    return {
      totalQuotes,
      draftValue,
      sentValue,
      acceptedValue,
    };
  }, [quoteRows]);

  const deleteQuote = async (quoteId: string) => {
    const quote = quoteRows.find((item) => item.id === quoteId);
    if (!quote) {
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete quote ${quote.quote_number}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    if (!supabase || !organizationId) {
      setError("Quote delete is not ready. Please refresh and try again.");
      return;
    }

    setError(null);
    setDeletingQuoteId(quoteId);

    try {
      const { error: deleteLineItemsError } = await supabase
        .from("project_quote_line_items")
        .delete()
        .eq("organization_id", organizationId)
        .eq("quote_id", quoteId);

      if (deleteLineItemsError) {
        throw new Error(deleteLineItemsError.message);
      }

      const { error: deleteQuoteError } = await supabase
        .from("project_quotes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", quoteId);

      if (deleteQuoteError) {
        throw new Error(deleteQuoteError.message);
      }

      setQuoteRows((current) => current.filter((row) => row.id !== quoteId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete quote.");
    } finally {
      setDeletingQuoteId(null);
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
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Quote Register</h1>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Create, track, revise, send, and approve project quotes in one place{projectName ? ` for ${projectName}` : ""}.
              </p>
            </div>
            <Button asChild className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]`}>
              <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote/new`}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Quote
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
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Total Quotes</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{summary.totalQuotes}</p>
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
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Sent Value</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{toMoney(summary.sentValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="py-4">
            <p className={`${interMedium.className} text-xs font-medium uppercase tracking-[0.08em] text-[#64748B]`}>Accepted Value</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{toMoney(summary.acceptedValue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Quote Register</h2>
        </CardHeader>
        <CardContent className="pb-5">
          {isLoading ? (
            <p className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading quote register...</p>
          ) : quoteRows.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#D7DFEC] bg-[#FAFCFF] px-4 py-8 text-center">
              <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No quotes yet for this project.</p>
              <Button asChild className={`${interMedium.className} mt-3 h-9 rounded-[9px] bg-[#F74917] px-4 text-sm text-white hover:bg-[#e63f10]`}>
                <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote/new`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create First Quote
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[#E8EDF5]">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className={`${interMedium.className} bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
                    <th className="px-3 py-2 text-left">Quote #</th>
                    <th className="px-3 py-2 text-left">Quote Name</th>
                    <th className="px-3 py-2 text-left">Revision</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Issued</th>
                    <th className="px-3 py-2 text-left">Expiry</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteRows.map((row) => {
                    const registerStatus = toRegisterStatus(row.status);

                    return (
                      <tr
                        key={row.id}
                        onClick={() => router.push(`/app/projects/${routeProjectSlug}/preconstruction/quote/${row.id}`)}
                        className="cursor-pointer border-t border-[#EEF2F7] transition-colors hover:bg-[#F8FBFF]"
                      >
                        <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A]">
                          <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote/${row.id}`} className="hover:underline">
                            {row.quote_number}
                          </Link>
                        </td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#1F2E45]`}>{row.quote_title || "Untitled quote"}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{getRevision(row.quote_number)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClassName(registerStatus)}`}>
                            {registerStatus}
                          </span>
                        </td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{toDayMonthYearLabel(row.quote_date)}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{toDayMonthYearLabel(row.expiry_date)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-right text-sm font-semibold text-[#0F172A]">{toMoney(row.total_quote_price ?? 0)}</span>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void deleteQuote(row.id);
                              }}
                              disabled={deletingQuoteId === row.id}
                              className="h-9 w-9 rounded-[8px] border-[#d6dfeb] bg-white p-0 text-[#9AA8BC] hover:bg-[#F8FAFC] hover:text-[#64748B] disabled:opacity-60"
                              aria-label={`Delete quote ${row.quote_number}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
