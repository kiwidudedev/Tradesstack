"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronDown,
  DollarSign,
  FolderKanban,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ibmPlexSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import {
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarState,
} from "@/components/app/SidebarState";

const sidebarItemBaseClass =
  "group flex min-h-[36px] items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 text-[14px] font-medium transition-colors";

const sidebarItemActiveClass =
  "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)] font-semibold";

const sidebarItemInactiveClass =
  "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]";

const sidebarSubItemClass =
  "flex min-h-[32px] w-full min-w-0 items-center rounded-[var(--radius-md)] px-3 pl-[40px] text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]";

const sidebarCompactItemBaseClass =
  "group flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors";

const sidebarCompactItemActiveClass = "bg-[var(--sidebar-accent)]";

const sidebarCompactItemInactiveClass =
  "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]";

const PRIMARY_NAV_ITEMS = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutGrid },
  { label: "Opportunities", href: "/app/leads-clients/opportunities", icon: TrendingUp },
  { label: "Clients", href: "/app/leads-clients/clients", icon: Users },
  { label: "Projects", href: "/app/projects", icon: FolderKanban },
  {
    label: "Financials",
    icon: DollarSign,
    trailing: "chevron" as const,
    children: [
      { label: "Invoices" },
      { label: "Expenses" },
      { label: "Cash Flow" },
    ],
  },
  {
    label: "Company",
    icon: Building2,
    trailing: "chevron" as const,
    children: [
      { label: "Cost Item Review", href: "/app/company/cost-items/review" },
      { label: "Cost Codes", href: "/app/company/cost-codes" },
      { label: "Suppliers", href: "/app/company/suppliers" },
      { label: "Supplier Invoices", href: "/app/company/supplier-invoices" },
      { label: "Materials", href: "/app/company/materials" },
    ],
  },
  { label: "AI Assistant", icon: Sparkles },
] as const;

interface SidebarNavContentProps {
  onNavigate?: () => void;
  isCompact?: boolean;
  footer?: ReactNode;
}

export function SidebarNavContent({
  onNavigate,
  isCompact = false,
  footer = null,
}: SidebarNavContentProps) {
  const pathname = usePathname();
  const { toggle: toggleSidebar } = useSidebarState();
  const [isFinancialsExpanded, setIsFinancialsExpanded] = useState(false);
  const [isCompanyExpanded, setIsCompanyExpanded] = useState(() =>
    pathname.startsWith("/app/company")
  );

  return (
    <div
      className={cn(
        ibmPlexSans.className,
        "flex h-full min-h-0 w-full min-w-0 flex-col bg-[var(--surface-muted)] px-2 pt-3 pb-3"
      )}
    >
      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          isCompact ? "flex flex-col items-center space-y-1 pr-0" : "space-y-px pr-1"
        )}
      >
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = "href" in item && item.href ? pathname.startsWith(item.href) : false;
          const hasChildren = "children" in item && Boolean(item.children?.length);

          // ── COMPACT MODE ──────────────────────────────────
          if (isCompact) {
            const iconClass = cn(
              "h-[18px] w-[18px]",
              isActive
                ? "text-[var(--sidebar-accent-foreground)]"
                : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
            );
            const itemClass = cn(
              sidebarCompactItemBaseClass,
              isActive ? sidebarCompactItemActiveClass : sidebarCompactItemInactiveClass
            );

            // Section with children — clicking expands the sidebar so user can access children
            if (hasChildren) {
              return (
                <Tooltip key={item.label} label={item.label} side="right">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label={item.label}
                    className={itemClass}
                  >
                    <Icon strokeWidth={2} className={iconClass} />
                  </button>
                </Tooltip>
              );
            }

            // Regular nav link
            if ("href" in item && item.href) {
              return (
                <Tooltip key={item.label} label={item.label} side="right">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-label={item.label}
                    className={itemClass}
                  >
                    <Icon strokeWidth={2} className={iconClass} />
                  </Link>
                </Tooltip>
              );
            }

            // Non-href button (AI Assistant)
            return (
              <Tooltip key={item.label} label={item.label} side="right">
                <button type="button" aria-label={item.label} className={itemClass}>
                  <Icon strokeWidth={2} className={iconClass} />
                </button>
              </Tooltip>
            );
          }

          // ── EXPANDED MODE ──────────────────────────────────
          if (hasChildren) {
            const isFinancialsSection = item.label === "Financials";
            const isExpanded = isFinancialsSection ? isFinancialsExpanded : isCompanyExpanded;
            const toggleExpanded = isFinancialsSection
              ? () => setIsFinancialsExpanded((current) => !current)
              : () => setIsCompanyExpanded((current) => !current);

            return (
              <div key={item.label} className="space-y-px">
                <button
                  type="button"
                  onClick={toggleExpanded}
                  className={cn(sidebarItemBaseClass, "w-full", sidebarItemInactiveClass)}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      strokeWidth={2}
                      className="h-[18px] w-[18px] text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                    />
                    <span className="leading-none">{item.label}</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform group-hover:text-[var(--text-primary)]",
                      isExpanded ? "rotate-180" : "rotate-0"
                    )}
                  />
                </button>

                {isExpanded ? (
                  <div className="space-y-px py-0.5">
                    {item.children.map((child) => {
                      if ("href" in child && child.href) {
                        const isChildActive =
                          pathname === child.href || pathname.startsWith(`${child.href}/`);

                        return (
                          <Link
                            key={child.label}
                            href={child.href}
                            onClick={onNavigate}
                            className={cn(
                              sidebarSubItemClass,
                              isChildActive
                                ? "bg-[var(--sidebar-accent)] font-semibold text-[var(--sidebar-accent-foreground)]"
                                : ""
                            )}
                          >
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      }

                      return (
                        <button
                          key={child.label}
                          type="button"
                          className={cn(sidebarSubItemClass, "w-full text-left")}
                        >
                          <span className="truncate">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }

          if ("href" in item && item.href) {
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  sidebarItemBaseClass,
                  isActive ? sidebarItemActiveClass : sidebarItemInactiveClass
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    strokeWidth={2}
                    className={cn(
                      "h-[18px] w-[18px]",
                      isActive
                        ? "text-[var(--sidebar-accent-foreground)]"
                        : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                    )}
                  />
                  <span className="leading-none">{item.label}</span>
                </span>
              </Link>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              className={cn(sidebarItemBaseClass, sidebarItemInactiveClass, "w-full")}
            >
              <span className="flex items-center gap-3">
                <Icon
                  strokeWidth={2}
                  className="h-[18px] w-[18px] text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                />
                <span className="leading-none">{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>
      {footer}
    </div>
  );
}

function SidebarToggleFooter({
  isCompact,
  onToggle,
}: {
  isCompact: boolean;
  onToggle: () => void;
}) {
  const label = isCompact ? "Expand sidebar" : "Collapse sidebar";
  const button = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
        isCompact ? "h-10 w-10 justify-center" : "h-9 w-full justify-start gap-2 px-3 text-[13px] font-medium"
      )}
    >
      {isCompact ? (
        <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={2} />
      ) : (
        <>
          <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          <span className="leading-none">Collapse sidebar</span>
        </>
      )}
    </button>
  );

  return (
    <div
      className={cn(
        "mt-2 border-t border-[var(--border)] pt-2",
        isCompact ? "flex justify-center" : ""
      )}
    >
      {isCompact ? (
        <Tooltip label={label} side="right">
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const { isCollapsed, toggle, width, setWidth, isDragging, setDragging } = useSidebarState();
  const actualWidth = isCollapsed ? SIDEBAR_COMPACT_WIDTH : width;

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, startWidth + delta)
      );
      setWidth(next);
    };

    const onUp = () => {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setWidth(width - 16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setWidth(width + 16);
    }
  };

  return (
    <aside
      style={{ width: actualWidth }}
      className={cn(
        "sticky top-14 z-10 hidden h-[calc(100vh-3.5rem)] shrink-0 self-start bg-[var(--surface-muted)] lg:flex",
        !isDragging && "transition-[width] duration-200 ease-out",
        className
      )}
    >
      <SidebarNavContent
        isCompact={isCollapsed}
        footer={<SidebarToggleFooter isCompact={isCollapsed} onToggle={toggle} />}
      />
      {!isCollapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={width}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            "absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize transition-colors",
            "focus-visible:outline-none focus-visible:bg-[var(--brand-blue)]/40",
            isDragging
              ? "bg-[var(--brand-blue)]"
              : "bg-transparent hover:bg-[var(--brand-blue)]"
          )}
        />
      ) : null}
    </aside>
  );
}
