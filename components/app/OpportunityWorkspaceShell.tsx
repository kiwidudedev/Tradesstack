"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, FolderOpen, LayoutGrid, Ruler } from "lucide-react";
import { ibmPlexSans } from "@/lib/fonts";
import {
  leadsButtonLabelStyle,
  leadsPageSurfaceTheme,
  leadsShellActionClassName,
  leadsShellHeaderClassName,
  leadsShellTabClassName,
  leadsShellTabRowClassName,
  leadsShellTitleStyle,
  leadsTabLabelStyle,
} from "@/components/app/LeadsPagePrimitives";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";

type OpportunityTab = "overview" | "generate-trade-pack" | "build-scope" | "start-pricing" | "takeoff";

interface StoredMeasureContext {
  drawingSetId: string;
  pageId: string | null;
  calibrationStatus: "saved" | "replaced" | "error" | null;
  measurementStatus: "created" | "archived" | "deleted" | "restored" | "error" | null;
}

function getMeasureContextStorageKey(opportunityId: string) {
  return `tradesstack-measure-context:${opportunityId}`;
}

function readStoredMeasureContext(opportunityId: string): StoredMeasureContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getMeasureContextStorageKey(opportunityId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredMeasureContext>;
    if (!parsed || typeof parsed.drawingSetId !== "string" || parsed.drawingSetId.trim().length === 0) {
      window.localStorage.removeItem(getMeasureContextStorageKey(opportunityId));
      return null;
    }

    return {
      drawingSetId: parsed.drawingSetId,
      pageId: typeof parsed.pageId === "string" && parsed.pageId.trim().length > 0 ? parsed.pageId : null,
      calibrationStatus:
        parsed.calibrationStatus === "saved" || parsed.calibrationStatus === "replaced" || parsed.calibrationStatus === "error"
          ? parsed.calibrationStatus
          : null,
      measurementStatus:
        parsed.measurementStatus === "created" ||
        parsed.measurementStatus === "archived" ||
        parsed.measurementStatus === "deleted" ||
        parsed.measurementStatus === "restored" ||
        parsed.measurementStatus === "error"
          ? parsed.measurementStatus
          : null,
    };
  } catch {
    return null;
  }
}

export function OpportunityWorkspaceShell({
  title,
  opportunityId,
  activeTab,
  children,
  titleClassName,
  contentClassName = "bg-[#FBFEFE] px-5 pt-6",
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
  const currentMeasureContext = useMemo<StoredMeasureContext | null>(() => {
    if (!isMeasureActive) {
      return null;
    }

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
  }, [isMeasureActive, searchParams]);

  useEffect(() => {
    if (!currentMeasureContext) {
      return;
    }

    const storageKey = getMeasureContextStorageKey(opportunityId);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(currentMeasureContext));
    } catch {
      // Keep Measure navigation functional even if localStorage is unavailable.
    }
  }, [currentMeasureContext, opportunityId]);

  const storedMeasureContext = readStoredMeasureContext(opportunityId);
  const measureNavContext = currentMeasureContext ?? storedMeasureContext;
  const quantitiesQuery = isTakeoffActive
    ? {
        drawingSetId: searchParams.get("drawingSetId"),
        pageId: searchParams.get("pageId"),
        calibrationStatus: searchParams.get("calibrationStatus") as "saved" | "replaced" | "error" | null,
        measurementStatus: searchParams.get("measurementStatus") as "created" | "archived" | "deleted" | "restored" | "error" | null,
      }
    : {};
  const measureHref = buildTakeoffHref(opportunityId, "measure", measureNavContext ?? {});
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
      label: "Quotation",
      href: `/app/leads-clients/opportunities/${opportunityId}/quote`,
      icon: FileText,
      active: activeTab === "start-pricing",
    },
  ] as const;

  return (
    <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme -mx-[0.384rem] bg-[#FBFEFE] pb-8 sm:-mx-[1.024rem]`} style={{ "--app-canvas": "#FBFEFE" } as React.CSSProperties}>
      <div className={leadsShellHeaderClassName}>
        <div className={`${leadsShellHeaderClassName} shadow-none`}>
          <div className={`flex flex-col gap-3 ${leadsShellHeaderClassName} px-5 py-4 xl:flex-row xl:items-center xl:justify-between`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center">
                <h2
                  className={titleClassName ?? `${ibmPlexSans.className} truncate`}
                  style={titleClassName ? undefined : leadsShellTitleStyle}
                >
                  {title}
                </h2>
              </div>
            </div>

            <Link
              href="/app/leads-clients/opportunities"
              prefetch
              className={leadsShellActionClassName}
            >
              <ArrowLeft className="h-4 w-4" />
              <span style={leadsButtonLabelStyle}>Back to Opportunities</span>
            </Link>
          </div>

          <div className={leadsShellTabRowClassName} style={{ borderBottomColor: leadsPageSurfaceTheme.border }}>
            <nav className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-8">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      prefetch
                      className={`${leadsShellTabClassName} ${
                        item.active
                          ? "border-b-2 text-[#F15A29]"
                          : "border-b-0 text-[#4B5D79] hover:text-[#4B5D79]"
                      }`}
                      style={
                        item.active
                          ? { borderBottomStyle: "solid", borderBottomColor: leadsPageSurfaceTheme.accent }
                          : undefined
                      }
                    >
                      <Icon
                        strokeWidth={2.2}
                        className={`h-4 w-4 shrink-0 ${item.active ? "text-[#F15A29]" : "text-[#4B5D79] group-hover:text-[#4B5D79]"}`}
                      />
                      <span
                        className="whitespace-nowrap"
                        style={item.active ? { ...leadsTabLabelStyle, color: leadsPageSurfaceTheme.accent } : leadsTabLabelStyle}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`${leadsShellTabClassName} cursor-pointer ${
                        isTakeoffActive
                          ? "border-b-2 text-[#F15A29]"
                          : "border-b-0 text-[#4B5D79] hover:text-[#4B5D79]"
                      }`}
                      style={
                        isTakeoffActive
                          ? { borderBottomStyle: "solid", borderBottomColor: leadsPageSurfaceTheme.accent }
                          : undefined
                      }
                    >
                      <Ruler
                        strokeWidth={2.2}
                        className={`h-4 w-4 shrink-0 ${isTakeoffActive ? "text-[#F15A29]" : "text-[#4B5D79] group-hover:text-[#4B5D79]"}`}
                      />
                      <span
                        className="whitespace-nowrap"
                        style={isTakeoffActive ? { ...leadsTabLabelStyle, color: leadsPageSurfaceTheme.accent } : leadsTabLabelStyle}
                      >
                        Takeoff
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    className="!z-[200] min-w-[220px] rounded-[14px] border border-[#E2E8F1] !bg-white p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]"
                  >
                    <DropdownMenuItem
                      asChild
                      className={`h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium focus:bg-[#F8FAFC] ${
                        isMeasureActive ? "bg-[#F8FAFC] text-[#F15A29]" : "text-[#1d2433]"
                      }`}
                    >
                      <Link href={measureHref} prefetch>
                        Measure
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      asChild
                      className={`h-10 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium focus:bg-[#F8FAFC] ${
                        isQuantitiesActive ? "bg-[#F8FAFC] text-[#F15A29]" : "text-[#1d2433]"
                      }`}
                    >
                      <Link href={quantitiesHref} prefetch>
                        Quantities
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
