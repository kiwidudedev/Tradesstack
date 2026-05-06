import * as React from "react";
import { cn } from "@/lib/utils";

export const leadsPageSurfaceTheme = {
  canvas: "#FBFEFE",
  panel: "#FBFEFE",
  border: "#E2E8F1",
  text: "#1d1d1d",
  muted: "#4B5D79",
  accent: "#F15A29",
  actionBorder: "#CBD5E1",
  actionText: "#475569",
  actionHover: "#F8FAFC",
} as const;

export const leadsPanelClassName =
  "rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]";

export const leadsMetricPanelClassName =
  "rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]";

export const leadsShellHeaderClassName = "bg-[#FBFEFE]";
export const leadsShellActionClassName =
  "inline-flex items-center gap-[0.4rem] rounded-[0.9rem] border border-[#CBD5E1] bg-[#FBFEFE] px-4 py-2 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]";
export const leadsShellTabRowClassName = "sticky top-0 z-20 border-b-2 bg-[#FBFEFE] px-5";
export const leadsShellTabClassName =
  "group -mx-[0.35rem] inline-flex items-center gap-2 border-b-2 border-transparent px-[0.35rem] py-3 text-[15px] font-medium leading-none transition-colors";

export const leadsShellTitleStyle: React.CSSProperties = {
  fontSize: "clamp(1.24rem, 2.24vw, 2.08rem)",
  fontWeight: 700,
  lineHeight: 0.98,
  letterSpacing: "-0.04em",
  color: leadsPageSurfaceTheme.text,
};

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
  color: "#6b6b6b",
};

export const leadsBodyValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: 1.1,
  letterSpacing: "-0.03em",
  color: "#111827",
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
