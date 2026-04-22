"use client";

import {
  Hash,
  MousePointer,
  PencilRuler,
  Ruler,
  Spline,
  SquareDashedMousePointer,
  type LucideIcon,
} from "lucide-react";

type ToolMode = "select" | "calibrate" | "distance" | "polyline" | "area" | "count";

interface MeasureBottomToolbarProps {
  activeTool: ToolMode;
  disabledTools: Partial<Record<ToolMode, boolean>>;
  onSelectTool: (tool: ToolMode) => void;
}

interface ToolbarItem {
  mode: ToolMode;
  label: string;
  icon: LucideIcon;
}

const toolbarItems: ToolbarItem[] = [
  { mode: "select", label: "Select", icon: MousePointer },
  { mode: "calibrate", label: "Calibrate", icon: PencilRuler },
  { mode: "distance", label: "Distance", icon: Ruler },
  { mode: "polyline", label: "Polyline", icon: Spline },
  { mode: "area", label: "Area", icon: SquareDashedMousePointer },
  { mode: "count", label: "Count", icon: Hash },
];

export function MeasureBottomToolbar({
  activeTool,
  disabledTools,
  onSelectTool,
}: MeasureBottomToolbarProps) {
  return (
    <div
      data-testid="measure-bottom-toolbar"
      className="pointer-events-auto mx-auto w-fit max-w-full"
    >
      <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/75 bg-white/92 px-2 py-2 shadow-[0_12px_34px_rgba(15,23,42,0.10)] backdrop-blur-sm">
        {toolbarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.mode;
          const isDisabled = disabledTools[item.mode] ?? false;

          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => onSelectTool(item.mode)}
              disabled={isDisabled}
              aria-pressed={isActive}
              aria-label={item.label}
              title={item.label}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed sm:h-10 ${
                isActive
                  ? "border-[#FDBA74] bg-[#FFF4EE] text-[#F15A29]"
                  : isDisabled
                    ? "border-[#E2E8F1] bg-white text-[#94A3B8]"
                    : "border-[#D7E0EA] bg-white text-[#475569] hover:bg-[#F8FAFC]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2.1} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
