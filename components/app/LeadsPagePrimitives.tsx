import * as React from "react";
import { cn } from "@/lib/utils";

export const leadsPageSurfaceTheme = {
  canvas: "var(--app-canvas)",
  panel: "var(--app-surface)",
  border: "var(--app-border)",
  text: "var(--text-primary)",
  muted: "var(--text-secondary)",
  accent: "var(--brand-blue)",
  actionBorder: "var(--app-border)",
  actionText: "var(--text-secondary)",
  actionHover: "var(--surface-subtle)",
} as const;

export const leadsPanelClassName =
  "rounded-[var(--radius-lg)] border-[1.3px] border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-sm)]";

export const leadsMetricPanelClassName =
  "rounded-[var(--radius-lg)] border-[1.3px] border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-sm)]";

export const leadsShellHeaderClassName = "bg-[var(--app-canvas)]";
export const leadsShellActionClassName =
  "inline-flex items-center gap-[0.4rem] rounded-[var(--radius-lg)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-subtle)]";
export const leadsShellTabRowClassName = "sticky top-14 z-20 border-b-2 border-[var(--app-border)] bg-[var(--app-canvas)] px-5";
export const leadsShellTabClassName =
  "group -mx-[0.35rem] inline-flex items-center gap-2 border-b-2 border-transparent px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors";

export const leadsShellTitleStyle: React.CSSProperties = {
  fontSize: "clamp(1.24rem, 2.24vw, 2.08rem)",
  fontWeight: 700,
  lineHeight: 0.98,
  letterSpacing: "-0.04em",
  color: leadsPageSurfaceTheme.text,
};

export const leadsCompactTitleClassName =
  "truncate text-[1.7rem] font-bold leading-none tracking-[-0.03em] text-[var(--text-primary)]";

export const leadsSectionTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "1.4rem",
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.03em",
  color: leadsPageSurfaceTheme.text,
};

export const leadsCardTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "15px",
  fontWeight: 600,
  color: leadsPageSurfaceTheme.text,
};

export const leadsBodyLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "15px",
  fontWeight: 500,
  lineHeight: 1.2,
  color: "var(--text-secondary)",
};

export const leadsBodyValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: 1.1,
  letterSpacing: "-0.03em",
  color: "var(--text-primary)",
};

export const leadsTabLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "15px",
  fontWeight: 500,
  lineHeight: 1,
  color: leadsPageSurfaceTheme.muted,
};

export const leadsButtonLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "14px",
  fontWeight: 600,
  color: leadsPageSurfaceTheme.actionText,
};

export function LeadsPageContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 flex-1 space-y-4", className)} {...props} />;
}

export function LeadsPanel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(leadsPanelClassName, className)} {...props} />;
}
