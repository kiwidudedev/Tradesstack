"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  Clock3,
  DollarSign,
  FolderKanban,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Package,
  Sparkles,
  Settings,
  TrendingUp,
  Users,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { mockUser } from "@/lib/mock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ibmPlexSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

const sidebarItemBaseClass =
  "group flex min-h-[38px] items-center justify-between gap-2 rounded-[var(--radius-md)] px-3.5 text-[15px] font-medium transition-all";

const sidebarItemActiveClass = "bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)] shadow-none";

const sidebarItemInactiveClass =
  "text-[var(--text-muted)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]";

const sidebarSubItemClass =
  "flex min-h-[36px] w-full min-w-0 items-center rounded-[var(--radius-md)] px-3 pl-[44px] text-[13.5px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]";

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
    ],
  },
  { label: "Resources", icon: Package },
  { label: "Team", icon: UsersRound },
  { label: "Reports", icon: BarChart3 },
  { label: "AI Assistant", icon: Sparkles },
] as const;

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SidebarNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useAuth();
  const [isFinancialsExpanded, setIsFinancialsExpanded] = useState(false);
  const [isCompanyExpanded, setIsCompanyExpanded] = useState(() =>
    pathname.startsWith("/app/company")
  );

  const displayName = session?.name ?? mockUser.name;
  const initials = getInitials(displayName) || mockUser.initials;

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  return (
    <div className={`${ibmPlexSans.className} flex h-full min-h-0 w-full min-w-0 flex-col bg-[var(--sidebar)] px-3 py-3`}>
      <div className="pb-[1rem] pl-0 pr-3 pt-[calc(1.55rem+5px)]">
        <Link href="/app/dashboard" className="inline-flex items-center" onClick={onNavigate}>
          <Image
            src="/tradesstacklogowhite.png"
            alt="TradesStack"
            width={220}
            height={52}
            className="h-auto w-auto max-h-[3.65rem]"
            unoptimized
            priority
          />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pt-6">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = "href" in item && item.href ? pathname.startsWith(item.href) : false;
          const hasChildren = "children" in item && Boolean(item.children?.length);

          if (hasChildren) {
            const isFinancialsSection = item.label === "Financials";
            const isExpanded = isFinancialsSection ? isFinancialsExpanded : isCompanyExpanded;
            const toggleExpanded = isFinancialsSection
              ? () => setIsFinancialsExpanded((current) => !current)
              : () => setIsCompanyExpanded((current) => !current);

            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={toggleExpanded}
                  className={cn(
                    sidebarItemBaseClass,
                    "w-full",
                    sidebarItemInactiveClass
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      strokeWidth={2.2}
                      className="h-5 w-5 text-[var(--text-muted)] group-hover:text-[var(--sidebar-accent-foreground)]"
                    />
                    <span className="text-[15px] leading-none">{item.label}</span>
                  </span>
                  <ChevronDown
                    className={cn("mr-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:text-[var(--sidebar-accent-foreground)]", isExpanded ? "rotate-180" : "rotate-0")}
                  />
                </button>

                {isExpanded ? (
                  <div className="space-y-0.5 py-1">
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
                                ? "rounded-[var(--radius-md)] bg-[var(--sidebar-accent)] pr-3 text-[var(--sidebar-accent-foreground)]"
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
                    strokeWidth={2.2}
                    className={cn(
                      "h-5 w-5",
                      isActive
                        ? "text-[var(--sidebar-primary-foreground)]"
                        : "text-[var(--text-muted)] group-hover:text-[var(--sidebar-accent-foreground)]"
                    )}
                  />
                  <span className="text-[15px] leading-none">{item.label}</span>
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
                  strokeWidth={2.2}
                  className="h-5 w-5 text-[var(--text-muted)] group-hover:text-[var(--sidebar-accent-foreground)]"
                />
                <span className="text-[15px] leading-none">{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-3 border-t border-[var(--sidebar-border)] pt-4">
        <div className="flex items-center justify-between gap-3 px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-primary)] text-[15px] font-semibold text-[var(--sidebar-primary-foreground)] transition-transform hover:scale-[1.02]"
                title={displayName}
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="top"
              sideOffset={12}
              className="w-52 rounded-[var(--radius-lg)] border border-[var(--app-border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]"
            >
              <DropdownMenuItem className="h-11 rounded-[var(--radius-md)] px-3 text-[15px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]">
                <Bell className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                <span>Notifications</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-11 rounded-[var(--radius-md)] px-0 text-[15px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]">
                <Link href="/app/settings/organization" className="flex h-full w-full items-center px-3">
                  <Settings className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-11 rounded-[var(--radius-md)] px-0 text-[15px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]">
                <Link href="/app/settings" className="flex h-full w-full items-center px-3">
                  <Clock3 className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                  <span>Time settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleLogout}
                className="h-11 rounded-[var(--radius-md)] px-3 text-[15px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]"
              >
                <LogOut className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
              aria-label="Help"
            >
              <HelpCircle className="h-6 w-6" strokeWidth={2.1} />
            </button>

            <Link
              href="/app/settings/organization"
              onClick={onNavigate}
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                pathname.startsWith("/app/settings")
                  ? "bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
              )}
              aria-label="Settings"
            >
              <Settings className="h-6 w-6" strokeWidth={2.1} />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "sticky top-0 z-20 hidden h-screen w-[240px] shrink-0 self-start bg-[var(--sidebar)] lg:flex",
        className
      )}
    >
      <SidebarNavContent />
    </aside>
  );
}
