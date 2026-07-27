"use client";

import { ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OpportunityPricingWorkbookSheet } from "@/lib/opportunity-pricing-workbook";
import { cn } from "@/lib/utils";

type WorkbookPagesTrayProps = {
  canWriteWorksheet: boolean;
  isLoadingWorksheet: boolean;
  isMutatingPages: boolean;
  isOpen: boolean;
  onAddBlankPage: () => void;
  onDeletePage: (sheetId: string) => void;
  onDuplicatePage: (sheetId: string) => void;
  onRenamePage: (sheetId: string, currentName: string) => void;
  onSwitchPage: (sheetId: string) => void;
  sheets: OpportunityPricingWorkbookSheet[];
  worksheetSheetId: string | null;
};

export function WorkbookPagesTray({
  canWriteWorksheet,
  isLoadingWorksheet,
  isMutatingPages,
  isOpen,
  onAddBlankPage,
  onDeletePage,
  onDuplicatePage,
  onRenamePage,
  onSwitchPage,
  sheets,
  worksheetSheetId,
}: WorkbookPagesTrayProps) {
  const canMutatePages = canWriteWorksheet && !isMutatingPages && !isLoadingWorksheet;

  return (
    <div
      data-testid="workbook-pages-tray"
      data-open={isOpen ? "true" : "false"}
      data-theme="light"
      className={cn(
        "mx-3 mt-2 shrink-0 rounded-[16px] border border-transparent bg-[#ECEEF3] text-[var(--text-primary)] shadow-[0_1px_0_rgba(15,23,42,0.03)]",
        isOpen ? "block px-3 py-2" : "hidden",
      )}
    >
      <div className="overflow-x-auto pb-0.5">
        <div className="flex min-w-full justify-center">
          <div className="flex min-w-max items-start gap-2.5 px-0.5">
          {sheets.map((sheet, index) => {
            const isActive = sheet.id === worksheetSheetId;

            return (
              <div
                key={sheet.id}
                data-testid={`workbook-page-card-${sheet.id}`}
                data-active={isActive ? "true" : "false"}
                className="group flex w-[142px] shrink-0 flex-col"
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => onSwitchPage(sheet.id)}
                    className={cn(
                      "relative block h-[86px] w-full overflow-hidden rounded-[12px] border bg-[linear-gradient(180deg,#FFFFFF_0%,#FAFCFF_100%)] p-2 text-left shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2",
                      isActive
                        ? "border-[var(--brand-blue)] bg-[linear-gradient(180deg,#FFFFFF_0%,#F6FAFF_100%)] ring-2 ring-[color-mix(in_srgb,var(--brand-blue)_16%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--app-border)_90%,var(--brand-blue)_10%)] hover:border-[color-mix(in_srgb,var(--brand-blue)_30%,var(--app-border))] hover:shadow-[0_4px_10px_rgba(15,23,42,0.06)]",
                    )}
                  >
                    <div className="pointer-events-none absolute inset-x-2 top-2 h-2 rounded-[4px] bg-[linear-gradient(180deg,#EFF3F8_0%,#E9EEF5_100%)]" />
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 top-[18px] overflow-hidden rounded-[7px] border border-[rgba(221,227,236,0.8)] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFE_100%)]">
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0,transparent_23%,rgba(221,227,236,0.4)_23%,rgba(221,227,236,0.4)_24%,transparent_24%,transparent_48%,rgba(221,227,236,0.4)_48%,rgba(221,227,236,0.4)_49%,transparent_49%,transparent_73%,rgba(221,227,236,0.4)_73%,rgba(221,227,236,0.4)_74%,transparent_74%)]" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0,transparent_24%,rgba(221,227,236,0.32)_24%,rgba(221,227,236,0.32)_25%,transparent_25%,transparent_49%,rgba(221,227,236,0.32)_49%,rgba(221,227,236,0.32)_50%,transparent_50%,transparent_74%,rgba(221,227,236,0.32)_74%,rgba(221,227,236,0.32)_75%,transparent_75%)]" />
                      <div className="absolute inset-x-0 top-0 h-3 bg-[linear-gradient(180deg,#FAFBFD_0%,#F4F7FB_100%)]" />
                    </div>
                    <span
                      className={cn(
                        "absolute bottom-2 left-2 inline-flex h-5 min-w-5 items-center justify-center rounded-[7px] px-1.5 text-[10px] font-semibold shadow-[0_4px_10px_rgba(15,23,42,0.1)]",
                        isActive
                          ? "bg-[var(--brand-blue)] text-white"
                          : "border border-[color-mix(in_srgb,var(--app-border)_84%,var(--brand-blue)_16%)] bg-white text-[var(--navy-primary)]",
                      )}
                    >
                      {index + 1}
                    </span>
                  </button>

                  <div className="absolute right-2 top-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={isMutatingPages}
                          className="h-6 w-6 rounded-[8px] border border-[color-mix(in_srgb,var(--app-border)_76%,white_24%)] bg-white/92 p-0 text-[var(--text-secondary)] shadow-[0_4px_10px_rgba(15,23,42,0.06)] hover:bg-white hover:text-[var(--navy-primary)]"
                          aria-label={`Open page menu for ${sheet.name}`}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="min-w-[11rem] rounded-[12px] p-1">
                        <DropdownMenuItem
                          onSelect={() => onRenamePage(sheet.id, sheet.name)}
                          className="h-8 rounded-[6px] px-2 text-[12px] font-medium"
                        >
                          Rename page
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => onDuplicatePage(sheet.id)}
                          className="h-8 rounded-[6px] px-2 text-[12px] font-medium"
                        >
                          Duplicate page
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => onDeletePage(sheet.id)}
                          disabled={sheets.length <= 1}
                          className="h-8 rounded-[6px] px-2 text-[12px] font-medium text-[var(--error)] focus:text-[var(--error)]"
                        >
                          Delete page
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                  <button
                    type="button"
                    onClick={() => onSwitchPage(sheet.id)}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                  >
                    <div className="truncate text-[12px] font-semibold text-[var(--navy-primary)]">
                      {sheet.name}
                    </div>
                    {isActive ? (
                      <Badge className="shrink-0 rounded-full bg-[var(--brand-blue)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-white">
                        ACTIVE
                      </Badge>
                    ) : null}
                  </button>
                </div>
              </div>
            );
          })}

          <div
            data-testid="workbook-pages-new-split-control"
            className="flex h-[86px] w-[118px] shrink-0 overflow-hidden rounded-[12px] border border-[rgba(221,227,236,0.9)] bg-[linear-gradient(180deg,#F5F7FB_0%,#ECEFF4_100%)] shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
          >
            <Button
              type="button"
              onClick={onAddBlankPage}
              disabled={!canMutatePages}
              className="h-full flex-1 items-center justify-center rounded-none border-0 bg-transparent px-0 text-[var(--navy-primary)] shadow-none hover:bg-[rgba(255,255,255,0.45)] disabled:bg-transparent"
              aria-label="Add workbook page"
            >
              <Plus className="h-6 w-6" />
            </Button>
            <div className="w-px shrink-0 bg-[rgba(221,227,236,0.95)]" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!canMutatePages}
                  className="h-full w-[36px] items-center justify-center rounded-none px-0 text-[var(--navy-primary)] hover:bg-[rgba(255,255,255,0.45)]"
                  aria-label="More new page options"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={8} className="min-w-[11rem] rounded-[12px] p-1">
                <DropdownMenuItem
                  onSelect={onAddBlankPage}
                  className="h-8 rounded-[6px] px-2 text-[12px] font-medium"
                >
                  New blank page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
