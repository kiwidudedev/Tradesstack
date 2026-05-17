"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, FolderOpen, LayoutGrid, Ruler } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";

type OpportunityTab = "overview" | "generate-trade-pack" | "build-scope" | "start-pricing" | "takeoff" | "pricing-worksheet";

const TAB_BASE_CLASS =
  "group -mx-[0.35rem] inline-flex items-center gap-2 border-b-2 px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors";
const TAB_ACTIVE_CLASS = "border-[var(--orange-primary)] text-[var(--brand-blue)]";
const TAB_INACTIVE_CLASS = "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

interface StoredMeasureContext {
  drawingSetId: string;
  pageId: string | null;
  calibrationStatus: "saved" | "replaced" | "error" | null;
  measurementStatus: "created" | "archived" | "deleted" | "restored" | "error" | null;
}

export function OpportunityWorkspaceShell({
  title,
  opportunityId,
  activeTab,
  children,
  titleClassName,
  contentClassName = "bg-[var(--background)] px-5 pt-6",
}: {
  title: string;
  opportunityId: string;
  activeTab: OpportunityTab;
  children: React.ReactNode;
  titleClassName?: string;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const takeoffBasePath = `/app/leads-clients/opportunities/${opportunityId}/takeoff`;
  const isTakeoffActive = pathname.startsWith(takeoffBasePath);
  const isMeasureActive = pathname.startsWith(`${takeoffBasePath}/measure`);
  const isQuantitiesActive = pathname.startsWith(`${takeoffBasePath}/quantities`);
  const currentUrlContext = useMemo<StoredMeasureContext | null>(() => {
    const drawingSetId = searchParams.get("drawingSetId");
    if (!drawingSetId) {
      return null;
    }

    return {
      drawingSetId,
      pageId: searchParams.get("pageId"),
      calibrationStatus: searchParams.get("calibrationStatus") as "saved" | "replaced" | "error" | null,
      measurementStatus: searchParams.get("measurementStatus") as "created" | "archived" | "deleted" | "restored" | "error" | null,
    };
  }, [searchParams]);
  const currentMeasureContext = useMemo<StoredMeasureContext | null>(() => {
    if (!isMeasureActive) {
      return null;
    }

    return currentUrlContext;
  }, [currentUrlContext, isMeasureActive]);
  const measureNavContext = currentUrlContext ?? currentMeasureContext;
  const quantitiesQuery = isTakeoffActive
    ? {
        drawingSetId: searchParams.get("drawingSetId"),
        pageId: searchParams.get("pageId"),
        calibrationStatus: searchParams.get("calibrationStatus") as "saved" | "replaced" | "error" | null,
        measurementStatus: searchParams.get("measurementStatus") as "created" | "archived" | "deleted" | "restored" | "error" | null,
      }
    : {};
  const measureHref = measureNavContext?.drawingSetId
    ? buildTakeoffHref(opportunityId, "measure", measureNavContext)
    : `/app/leads-clients/opportunities/${opportunityId}/takeoff`;
  const quantitiesHref = buildTakeoffHref(opportunityId, "quantities", quantitiesQuery);
  const navItems = [
    {
      label: "Overview",
      href: `/app/leads-clients/opportunities/${opportunityId}`,
      icon: LayoutGrid,
      active: activeTab === "overview",
    },
    {
      label: "Generate Trade Pack",
      href: `/app/leads-clients/opportunities/${opportunityId}/drawing-intelligence`,
      icon: FolderOpen,
      active: activeTab === "generate-trade-pack",
    },
    {
      label: "Build Scope",
      href: `/app/leads-clients/opportunities/${opportunityId}/scope-builder`,
      icon: FileText,
      active: activeTab === "build-scope",
    },
    {
      label: "Pricing Worksheet",
      href: `/app/leads-clients/opportunities/${opportunityId}/pricing-worksheet`,
      icon: FileText,
      active: activeTab === "pricing-worksheet",
    },
    {
      label: "Quotation",
      href: `/app/leads-clients/opportunities/${opportunityId}/quote`,
      icon: FileText,
      active: activeTab === "start-pricing",
    },
  ] as const;

  return (
    <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme -mx-[0.384rem] bg-[var(--background)] pb-8 sm:-mx-[1.024rem]`}>
      <div className="bg-[var(--background)]">
        <div className="bg-[var(--background)] shadow-none">
          <div className="flex flex-col gap-3 bg-[var(--background)] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <h2
                className={
                  titleClassName ??
                  "m-0 truncate text-[45px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)]"
                }
              >
                {title}
              </h2>
            </div>

            <Button asChild variant="secondary" size="sm">
              <Link href="/app/leads-clients/opportunities" prefetch>
                <ArrowLeft className="h-4 w-4" />
                Back to Opportunities
              </Link>
            </Button>
          </div>

          <div className="sticky top-14 z-20 border-b border-[var(--border)] bg-[var(--background)] px-5">
            <nav className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-8">
                {navItems
                  .filter((item) => item.label !== "Quotation")
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        prefetch
                        className={`${TAB_BASE_CLASS} ${item.active ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
                      >
                        <Icon strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`${TAB_BASE_CLASS} cursor-pointer ${isTakeoffActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
                    >
                      <Ruler strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">Takeoff</span>
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
                      className={`h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)] ${
                        isMeasureActive ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <Link href={measureHref} prefetch>
                        Measure
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      asChild
                      className={`h-10 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium focus:bg-[var(--surface-muted)] ${
                        isQuantitiesActive ? "bg-[var(--surface-muted)] text-[var(--brand-blue)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <Link href={quantitiesHref} prefetch>
                        Quantities
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {navItems
                  .filter((item) => item.label === "Quotation")
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        prefetch
                        className={`${TAB_BASE_CLASS} ${item.active ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
                      >
                        <Icon strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
              </div>
            </nav>
          </div>
        </div>
      </div>

      <div className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
