"use client";

import { memo, type MouseEvent } from "react";
import { ibmPlexSans } from "@/lib/fonts";

export interface TakeoffMeasureSummaryRow {
  id: string;
  pageId: string;
  pageLabel: string;
  name: string;
  measurementKind: "line" | "area" | "count";
  color: string;
  label: string;
  isPolyline: boolean;
  showPerimeter: boolean;
  perimeterLabel: string | null;
}

interface TakeoffMeasureSummaryProps {
  measurements: TakeoffMeasureSummaryRow[];
  currentPageId: string;
  selectedMeasurementId: string | null;
  selectedChildMeasurementId: string | null;
  appendMeasurementId: string | null;
  onMeasurementClick: (measurementId: string, measurementPageId: string) => void;
  onMeasurementContextMenu: (event: MouseEvent<HTMLButtonElement>, measurementId: string) => void;
}

function getTakeoffSummaryDescription(measurement: TakeoffMeasureSummaryRow) {
  const trimmedName = measurement.name.trim();
  if (trimmedName) return trimmedName;
  if (measurement.measurementKind === "area") return "Area";
  if (measurement.measurementKind === "count") return "Count";
  return measurement.isPolyline ? "Polyline" : "Distance";
}

function TakeoffMeasureSummaryComponent({
  measurements,
  currentPageId,
  selectedMeasurementId,
  selectedChildMeasurementId,
  appendMeasurementId,
  onMeasurementClick,
  onMeasurementContextMenu,
}: TakeoffMeasureSummaryProps) {
  return (
    <div className="space-y-5">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#334155]">
          Takeoff
        </p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-slate-900">Summary</h1>
      </div>

      <section className="min-w-0 overflow-hidden rounded-[14px] border border-slate-200 bg-white">
        {measurements.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {measurements.map((measurement) => {
              const isCurrentPage = measurement.pageId === currentPageId;
              const isAppending = isCurrentPage && appendMeasurementId === measurement.id;
              const isSelected = isCurrentPage && selectedMeasurementId === measurement.id;

              return (
                <div
                  key={measurement.id}
                  className={`${
                    isAppending ? "bg-[#FFF7ED]" : isSelected ? "bg-[#F8FAFC]" : "bg-white"
                  } transition-colors`}
                >
                  <button
                    type="button"
                    data-testid={`measurement-summary-${measurement.id}`}
                    onClick={() => onMeasurementClick(measurement.id, measurement.pageId)}
                    onContextMenu={(event) => {
                      if (isCurrentPage) onMeasurementContextMenu(event, measurement.id);
                    }}
                    className={`flex w-full items-center justify-between gap-4 px-5 py-[18px] text-left transition-colors ${
                      isAppending
                        ? "hover:bg-[#FFEDD5]"
                        : isSelected
                          ? "hover:bg-[#F1F5F9]"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: measurement.color }}
                          aria-label={`${getTakeoffSummaryDescription(measurement)} colour`}
                          title={measurement.color}
                        />
                        <span className={`${ibmPlexSans.className} truncate text-sm font-medium text-slate-800`}>
                          {getTakeoffSummaryDescription(measurement)}
                        </span>
                      </div>
                      <p className={`mt-1.5 pl-[20px] text-[11px] font-medium ${
                        isCurrentPage ? "text-[#F15A29]" : "text-[#64748B]"
                      }`}>
                        {measurement.pageLabel}{isCurrentPage ? " · Current page" : ""}
                      </p>
                      {isAppending || isSelected ? (
                        <p className={`mt-1 pl-[20px] text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          isAppending ? "text-[#C2410C]" : "text-[#64748B]"
                        }`}>
                          {isAppending
                            ? "Adding"
                            : selectedChildMeasurementId === measurement.id
                              ? "Child Selected"
                              : "Selected"}
                        </p>
                      ) : null}
                    </div>

                    <div className="min-w-0 shrink-0 py-0.5 text-right">
                      <p className={`${ibmPlexSans.className} text-sm font-semibold text-slate-900`}>
                        {measurement.label}
                      </p>
                      {measurement.showPerimeter ? (
                        <p className="mt-1.5 text-[11px] font-semibold text-[#64748B]">
                          {measurement.perimeterLabel ?? "Perimeter unavailable"}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-6 text-center text-sm font-medium text-[#4B5D79]">
            No takeoff items saved yet.
          </div>
        )}
      </section>
    </div>
  );
}

export const TakeoffMeasureSummary = memo(TakeoffMeasureSummaryComponent);
TakeoffMeasureSummary.displayName = "TakeoffMeasureSummary";
