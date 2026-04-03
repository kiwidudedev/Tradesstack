"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ExternalLink, PenLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { QuoteStatus } from "@/lib/supabase/types";
import styles from "@/components/app/trade-pack-builder.module.css";

interface QuoteRegisterRow {
  id: string;
  quote_number: string;
  quote_title: string;
  status: QuoteStatus;
  quote_date: string | null;
  expiry_date: string | null;
  total_quote_price: number;
  updated_at: string;
  terms_inclusions: string | null;
  terms_exclusions: string | null;
  assumptions: string | null;
  clarifications: string | null;
  scope_exclusions: string | null;
  scope_notes: string | null;
}

function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function toAccountingMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    currencySign: "accounting",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
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

function toDayShortMonthYearLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
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

function toHistoryStatusLabel(isCurrent: boolean) {
  return isCurrent ? "Accepted" : "Superseded";
}

function historyStatusClassName(isCurrent: boolean) {
  return isCurrent
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-[#D9DEE5] bg-[#F3F4F6] text-[#6b7280]";
}

function toLines(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n|[;]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function ProjectQuoteRegisterPage() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId;
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const sessionOrganizationId = session?.organizationId ?? null;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteRows, setQuoteRows] = useState<QuoteRegisterRow[]>([]);
  const [isQuoteHistoryOpen, setIsQuoteHistoryOpen] = useState(false);
  const [isDeletingSummaryQuote, setIsDeletingSummaryQuote] = useState(false);

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
          .select("id, quote_number, quote_title, status, quote_date, expiry_date, total_quote_price, updated_at, terms_inclusions, terms_exclusions, assumptions, clarifications, scope_exclusions, scope_notes")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .order("updated_at", { ascending: false });

        if (quotesError) {
          throw new Error(quotesError.message);
        }

        if (cancelled) {
          return;
        }

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

  const acceptedQuote = quoteRows.find((row) => row.status === "Accepted") ?? null;
  const summaryQuote = acceptedQuote ?? quoteRows[0] ?? null;
  const includedLines = toLines(summaryQuote?.terms_inclusions);
  const excludedLines = toLines(summaryQuote?.scope_exclusions || summaryQuote?.terms_exclusions);
  const assumptionLines = toLines(summaryQuote?.assumptions);
  const keyNotesLines = toLines(summaryQuote?.scope_notes ?? summaryQuote?.clarifications);

  async function handleDeleteSummaryQuote() {
    if (!summaryQuote || !supabase || isDeletingSummaryQuote) {
      return;
    }

    const shouldDelete = window.confirm(`Delete quote ${summaryQuote.quote_number}? This cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    setIsDeletingSummaryQuote(true);
    setError(null);

    try {
      const { error: deleteItemsError } = await supabase
        .from("project_quote_line_items")
        .delete()
        .eq("quote_id", summaryQuote.id);

      if (deleteItemsError) {
        throw new Error(deleteItemsError.message);
      }

      const { error: deleteQuoteError } = await supabase
        .from("project_quotes")
        .delete()
        .eq("id", summaryQuote.id);

      if (deleteQuoteError) {
        throw new Error(deleteQuoteError.message);
      }

      setQuoteRows((currentRows) => currentRows.filter((row) => row.id !== summaryQuote.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete quote.");
    } finally {
      setIsDeletingSummaryQuote(false);
    }
  }

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Quotation</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Baseline pricing agreed for this job
          </p>
        </div>
        <div className={styles.heroActions}>
          {summaryQuote ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}
                  aria-label="Quote actions"
                >
                  Actions
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={8}
                className={`${styles.menuPanel} !z-[200] min-w-[220px] !bg-[#F3F4F6] p-1.5 opacity-100`}
              >
                <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote/${summaryQuote.id}?mode=edit`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#1d2433] focus:bg-[#F3F4F6]">
                  <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote/${summaryQuote.id}?mode=edit`}>
                    <PenLine className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleDeleteSummaryQuote();
                  }}
                  disabled={isDeletingSummaryQuote}
                  className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#b42318] focus:bg-[#FEF3F2] focus:text-[#b42318]"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeletingSummaryQuote ? "Deleting..." : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}

      <section
        className="overflow-hidden rounded-[32px] border border-[#d9dee5] bg-[#F3F4F6] px-7 pb-7 pt-5 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_16px_34px_-28px_rgba(17,17,17,0.28)] md:px-8 md:pb-8 md:pt-6"
      >
        <div className="bg-[#F3F4F6]">
          <div className="space-y-6">
            {isLoading ? (
              <p className={`${interMedium.className} py-8 text-sm font-medium text-[#6b6b6b]`}>Loading quote register...</p>
            ) : (
              <>
                {summaryQuote ? (
                  <div className="py-1">
                    <div className="grid gap-6 md:grid-cols-[1.45fr_1fr] md:items-end">
                      <div className="min-w-0 space-y-3">
                        <p className="truncate text-[30px] font-semibold leading-[1.04] tracking-[-0.02em] text-[#1d2433]">
                          {summaryQuote.quote_title || "Untitled quote"}
                        </p>
                        <div className={`${interMedium.className} space-y-0.5 text-sm text-[#64748B]`}>
                          <p>{summaryQuote.quote_number} · {getRevision(summaryQuote.quote_number)}</p>
                          <p>Accepted {toDayShortMonthYearLabel(summaryQuote.quote_date || summaryQuote.updated_at)} · {session?.name || "—"}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 md:items-end">
                        <p className="text-[36px] font-semibold leading-none tracking-[-0.02em] text-[#061A25]">
                          {toAccountingMoney(summaryQuote.total_quote_price ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.cardMuted} ${styles.producedRowProjectTone} px-5 py-6 text-center`}>
                    <p className={`${interMedium.className} text-sm font-medium text-[#5b6879]`}>
                      No accepted quote yet — create or link one to start tracking this job
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Scope Summary</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                    <div className={`${styles.cardMuted} px-4 py-4`} style={{ backgroundColor: "#F3F4F6" }}>
                      <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700`}>Included</p>
                      <ul className={`${interMedium.className} mt-2 space-y-1 text-sm text-[#334155]`}>
                        {includedLines.length > 0 ? (
                          includedLines.map((line) => <li key={`include-${line}`}>{line}</li>)
                        ) : (
                          <li className="text-[#64748B]">No inclusions captured in this quote.</li>
                        )}
                      </ul>
                    </div>
                    <div className={`${styles.cardMuted} px-4 py-4`} style={{ backgroundColor: "#F3F4F6" }}>
                      <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-rose-700`}>Excluded</p>
                      <ul className={`${interMedium.className} mt-2 space-y-1 text-sm text-[#334155]`}>
                        {excludedLines.length > 0 ? (
                          excludedLines.map((line) => <li key={`exclude-${line}`}>{line}</li>)
                        ) : (
                          <li className="text-[#64748B]">No exclusions captured in this quote.</li>
                        )}
                      </ul>
                    </div>
                    <div className={`${styles.cardMuted} px-4 py-4`} style={{ backgroundColor: "#F3F4F6" }}>
                      <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-amber-700`}>Assumptions</p>
                      <ul className={`${interMedium.className} mt-2 space-y-1 text-sm text-[#334155]`}>
                        {assumptionLines.length > 0 ? (
                          assumptionLines.map((line) => <li key={`assumption-${line}`}>{line}</li>)
                        ) : (
                          <li className="text-[#64748B]">No assumptions captured in this quote.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Key Notes / Qualifications</h3>
                  <div className={`${styles.cardMuted} px-4 py-4`} style={{ backgroundColor: "#F3F4F6" }}>
                    {keyNotesLines.length > 0 ? (
                      <ul className={`${interMedium.className} space-y-1 text-sm text-[#334155]`}>
                        {keyNotesLines.map((line) => <li key={`note-${line}`}>{line}</li>)}
                      </ul>
                    ) : (
                      <p className={`${interMedium.className} text-sm text-[#64748B]`}>
                        No key notes captured in this quote.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Quote History</h3>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsQuoteHistoryOpen((current) => !current)}
                      className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}
                      aria-expanded={isQuoteHistoryOpen}
                      aria-controls="quote-history-table"
                    >
                      {isQuoteHistoryOpen ? "Hide" : "Show"}
                      <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isQuoteHistoryOpen ? "rotate-180" : "rotate-0"}`} />
                    </Button>
                  </div>
                  {isQuoteHistoryOpen ? (
                    <div id="quote-history-table" className="overflow-x-auto rounded-[12px] border border-[#D9DEE5] bg-[#F6F7F9]">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]`}>
                            <th className="px-4 py-3 text-left">Quote #</th>
                            <th className="px-4 py-3 text-left">Revision</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Date</th>
                            <th className="px-4 py-3 text-right">Value</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quoteRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className={`${interMedium.className} px-4 py-6 text-center text-sm text-[#6b6b6b]`}>
                                No quote revisions yet.
                              </td>
                            </tr>
                          ) : quoteRows.map((row) => {
                            const isCurrent = acceptedQuote?.id === row.id;

                            return (
                              <tr
                                key={row.id}
                                className="border-t border-[#D9DEE5] bg-[#F3F4F6] transition-colors"
                              >
                                <td className="px-4 py-3 text-sm font-semibold text-[#1d1d1d]">
                                  {row.quote_number}
                                </td>
                                <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                                  {getRevision(row.quote_number)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold ${historyStatusClassName(isCurrent)}`}>
                                    {toHistoryStatusLabel(isCurrent)}
                                  </span>
                                </td>
                                <td className={`${interMedium.className} px-4 py-3 text-sm font-medium text-[#1d1d1d]`}>
                                  {toDayMonthYearLabel(row.quote_date || row.updated_at)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-[#1d1d1d]">
                                  {toMoney(row.total_quote_price ?? 0)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      asChild
                                      variant="outline"
                                      className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}
                                    >
                                      <Link href={`/app/projects/${routeProjectSlug}/preconstruction/quote/${row.id}?mode=edit`}>
                                        View
                                      </Link>
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <h3 className={`${interMedium.className} text-sm font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]`}>Linked Workflows</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                      <Link href={`/app/projects/${routeProjectSlug}/preconstruction/variations`}>View Variations</Link>
                    </Button>
                    <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                      <Link href={`/app/projects/${routeProjectSlug}/preconstruction/claims`}>View Claims</Link>
                    </Button>
                    <Button asChild variant="outline" className={`${interMedium.className} ${styles.controlButton} ${styles.producedActionButtonProjectTone} h-8 px-3 text-[13px]`}>
                      <Link href={`/app/projects/${routeProjectSlug}/scope-builder`}>View Scope</Link>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
