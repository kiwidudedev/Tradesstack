"use client";

import { SIDEBAR_COMPACT_WIDTH, useSidebarState } from "@/components/app/SidebarState";
import { cn } from "@/lib/utils";

export function WorkspaceSidebarBackdrop() {
  const { isCollapsed, width, isDragging } = useSidebarState();
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 left-0 hidden bg-[var(--surface-muted)] lg:block",
        !isDragging && "transition-[width] duration-200 ease-out"
      )}
      style={{ width: isCollapsed ? SIDEBAR_COMPACT_WIDTH : width }}
    />
  );
}
