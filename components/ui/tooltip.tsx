"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TooltipSide = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  label: React.ReactNode;
  side?: TooltipSide;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ label, side = "bottom", children, className }: TooltipProps) {
  const popoverPosition: Record<TooltipSide, string> = {
    bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
    top: "left-1/2 bottom-full mb-2 -translate-x-1/2",
    right: "top-1/2 left-full ml-2 -translate-y-1/2",
    left: "top-1/2 right-full mr-2 -translate-y-1/2",
  };

  const arrowPosition: Record<TooltipSide, string> = {
    bottom: "-top-1 left-1/2 -translate-x-1/2 border-b-0 border-r-0",
    top: "-bottom-1 left-1/2 -translate-x-1/2 border-t-0 border-l-0",
    right: "-left-1 top-1/2 -translate-y-1/2 border-r-0 border-b-0",
    left: "-right-1 top-1/2 -translate-y-1/2 border-l-0 border-t-0",
  };

  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] font-medium text-[var(--text-primary)] shadow-[var(--shadow-md)] opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100",
          popoverPosition[side],
          className
        )}
      >
        {label}
        <span
          aria-hidden="true"
          className={cn(
            "absolute h-2 w-2 rotate-45 border border-[var(--border)] bg-[var(--surface)]",
            arrowPosition[side]
          )}
        />
      </span>
    </span>
  );
}
