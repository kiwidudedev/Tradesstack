"use client";

import type { KeyboardEventHandler, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorksheetSidePanel({
  ariaLabel,
  closeLabel,
  onClose,
  children,
  className,
  onKeyDown,
  variant = "workspace",
  persistentFrom = "md",
}: {
  ariaLabel: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  variant?: "workspace" | "overlay";
  persistentFrom?: "md" | "lg" | "xl";
}) {
  const persistentBackdropClasses = {
    md: "md:hidden",
    lg: "lg:hidden",
    xl: "xl:hidden",
  } as const;
  const persistentPanelClasses = {
    md: "md:static md:z-auto md:h-full md:w-[400px] md:shadow-none",
    lg: "lg:static lg:z-auto lg:h-full lg:w-[400px] lg:shadow-none",
    xl: "xl:static xl:z-auto xl:h-full xl:w-[400px] xl:shadow-none",
  } as const;
  return (
    <>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--navy-primary)_18%,transparent)] backdrop-blur-[1px]",
          variant === "workspace" && persistentBackdropClasses[persistentFrom],
        )}
      />
      <aside
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(100vw,420px)] shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-overlay)]",
          variant === "workspace" && persistentPanelClasses[persistentFrom],
          variant === "overlay" && "md:w-[420px]",
          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}

export function WorksheetSidePanelHeader({
  icon,
  title,
  description,
  closeLabel,
  onClose,
  showClose = true,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  closeLabel: string;
  onClose: () => void;
  showClose?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="truncate text-[12px] text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {showClose ? <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
      >
        <X className="h-4 w-4" />
      </button> : null}
    </div>
  );
}

export function WorksheetSidePanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]", className)}>{children}</div>;
}

export function WorksheetSidePanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3">
      {children}
    </div>
  );
}
