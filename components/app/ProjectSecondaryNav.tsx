"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  DollarSign,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Landmark,
  Ruler,
  Shield,
  ShieldCheck,
  TimerReset,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { prefetchProjectQuoteHref } from "@/lib/project-quote-prefetch";
import { prefetchFilesOnIntent } from "@/lib/documents/files-intent-prefetch";
import { cn } from "@/lib/utils";

const PROJECT_TOP_NAV_ITEMS = [
  { label: "Overview", segment: "dashboard", icon: LayoutGrid },
  { label: "Files", segment: "files", icon: FileText },
  { label: "Takeoff", segment: "takeoff", icon: Ruler },
  { label: "Quotation", segment: "preconstruction/quote", icon: FileText },
  { label: "Tasks", segment: "job-management/todos", icon: ClipboardCheck },
  { label: "Variations", segment: "preconstruction/variations", icon: WandSparkles },
  { label: "Purchase Orders", segment: "preconstruction/purchase-orders", icon: FileSpreadsheet },
  { label: "Payment Claim", segment: "preconstruction/claims", icon: DollarSign },
  { label: "Financials", segment: "financials", icon: Landmark },
  { label: "Timesheets", segment: "job-management/time-sheets", icon: TimerReset },
  { label: "QA", segment: "job-management/quality-assurance", icon: ShieldCheck },
  { label: "Site Safety", segment: "site-safety", icon: Shield },
  { label: "AI Assistant", segment: "ai-chatbot", icon: Bot },
] as const;

export function shouldPrefetchProjectPricingWorksheetHref({
  href,
  projectId,
  prefetchedHrefs,
}: {
  href?: string;
  projectId: string;
  prefetchedHrefs: Set<string>;
}) {
  if (!href || !projectId) {
    return false;
  }

  const canonicalPrefix = `/app/projects/${projectId}/preconstruction/quote/`;
  if (!href.startsWith(canonicalPrefix)) {
    return false;
  }

  const routeSuffix = href.slice(canonicalPrefix.length);
  const [quoteId, pricingWorksheetSegment, ...extraSegments] = routeSuffix.split("/");
  if (
    !quoteId ||
    quoteId === "new" ||
    pricingWorksheetSegment !== "pricing-worksheet" ||
    extraSegments.length > 0 ||
    prefetchedHrefs.has(href)
  ) {
    return false;
  }

  prefetchedHrefs.add(href);
  return true;
}

export function ProjectSecondaryNav({
  projectName,
  quoteHref: resolvedQuoteHref,
  pricingWorksheetHref: resolvedPricingWorksheetHref,
  canViewQA = true,
}: {
  projectName: string;
  projectStage?: string | null;
  quoteHref?: string;
  pricingWorksheetHref?: string;
  canViewQA?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? "";
  const prefetchedQuoteHrefsRef = useRef(new Set<string>());
  const prefetchedPricingWorksheetHrefsRef = useRef(new Set<string>());
  const prefetchedFilesHrefsRef = useRef(new Set<string>());
  const dashboardHref = `/app/projects/${projectId}/dashboard`;
  const isDashboardRoute = pathname === `/app/projects/${projectId}` || pathname === dashboardHref;
  const quoteRootHref = resolvedQuoteHref ?? `/app/projects/${projectId}/preconstruction/quote`;
  const pricingWorksheetHref = resolvedPricingWorksheetHref ?? `/app/projects/${projectId}/preconstruction/pricing-worksheet`;

  useEffect(() => {
    prefetchProjectQuoteHref({
      href: resolvedQuoteHref,
      projectId,
      prefetchedHrefs: prefetchedQuoteHrefsRef.current,
      prefetch: (href) => router.prefetch(href),
    });
  }, [projectId, resolvedQuoteHref, router]);

  useEffect(() => {
    if (!resolvedPricingWorksheetHref) {
      return;
    }

    if (shouldPrefetchProjectPricingWorksheetHref({
      href: resolvedPricingWorksheetHref,
      projectId,
      prefetchedHrefs: prefetchedPricingWorksheetHrefsRef.current,
    })) {
      router.prefetch(resolvedPricingWorksheetHref);
    }
  }, [projectId, resolvedPricingWorksheetHref, router]);

  return (
    <div className="shadow-none">
      <div className="flex flex-col gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[45px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]">
            {projectName}
          </h2>
        </div>

        {isDashboardRoute ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/projects" prefetch>
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="sticky top-14 z-20 border-b border-[var(--border)] bg-[var(--background)] px-5">
        <nav className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-8">
            {PROJECT_TOP_NAV_ITEMS.filter((item) => item.segment !== "job-management/quality-assurance" || canViewQA).map((item) => {
              const href = `/app/projects/${projectId}/${item.segment}`;
              const isDashboard = item.segment === "dashboard";
              const isActive = isDashboard
                ? pathname === `/app/projects/${projectId}` || pathname === href
                : pathname.startsWith(href);
              const Icon = item.icon ?? Clock3;

              const filesIntentProps = item.segment === "files" ? {
                onMouseEnter: () => prefetchFilesOnIntent({
                  href,
                  kind: "project",
                  slug: projectId,
                  prefetchedHrefs: prefetchedFilesHrefsRef.current,
                  prefetch: (target) => router.prefetch(target),
                }),
                onFocus: () => prefetchFilesOnIntent({
                  href,
                  kind: "project",
                  slug: projectId,
                  prefetchedHrefs: prefetchedFilesHrefsRef.current,
                  prefetch: (target) => router.prefetch(target),
                }),
              } : {};

              if (item.segment === "preconstruction/quote") {
                const isPricingWorksheetActive = pathname.includes("/pricing-worksheet");
                return (
                  <DropdownMenu key={item.segment}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "group -mx-[0.35rem] inline-flex cursor-pointer items-center gap-2 border-b-2 px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors",
                          isActive
                            ? "border-[var(--orange-primary)] text-[var(--brand-blue)]"
                            : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        <Icon strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{item.label}</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      side="bottom"
                      sideOffset={8}
                      className="!z-[200] min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                    >
                      <DropdownMenuItem
                        asChild
                        className={cn(
                          "h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)]",
                          !isPricingWorksheetActive && isActive
                            ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]"
                            : "text-[var(--text-primary)]"
                        )}
                      >
                        <Link href={quoteRootHref} prefetch>Quotes</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        asChild
                        className={cn(
                          "h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)]",
                          isPricingWorksheetActive
                            ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]"
                            : "text-[var(--text-primary)]"
                        )}
                      >
                        <Link href={pricingWorksheetHref} prefetch>Pricing Worksheets</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }

              if (item.segment === "takeoff") {
                const isQuantitiesActive = pathname.startsWith(`${href}/quantities`);
                return (
                  <DropdownMenu key={item.segment}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "group -mx-[0.35rem] inline-flex cursor-pointer items-center gap-2 border-b-2 px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors",
                          isActive ? "border-[var(--orange-primary)] text-[var(--brand-blue)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                        )}
                      >
                        <Icon strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">Takeoff</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="bottom" sideOffset={8} className="!z-[200] min-w-[200px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]">
                      <DropdownMenuItem asChild className={cn("h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)]", !isQuantitiesActive && isActive ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : "text-[var(--text-primary)]")}>
                        <Link href={href} prefetch={false}>Measure</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className={cn("h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)]", isQuantitiesActive ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : "text-[var(--text-primary)]")}>
                        <Link href={`${href}/quantities`} prefetch={false}>Quantities</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }

              return (
                <Link
                  key={item.segment}
                  href={href}
                  {...filesIntentProps}
                  className={cn(
                    "group -mx-[0.35rem] inline-flex items-center gap-2 border-b-2 px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors",
                    isActive
                      ? "border-[var(--orange-primary)] text-[var(--brand-blue)]"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon
                    strokeWidth={2.2}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
