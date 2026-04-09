"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
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
import { interMedium } from "@/lib/fonts";
import { mockUser } from "@/lib/mock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const graphikRegularTextStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
  fontWeight: 400,
} as const;

const sidebarItemBaseClass =
  "group flex min-h-[42px] items-center justify-between gap-2.5 rounded-[16px] px-4 text-[15px] font-medium transition-all";

const sidebarItemActiveClass = "bg-[#10283B] text-white shadow-[0_6px_16px_rgba(16,40,59,0.10)]";

const sidebarItemInactiveClass = "text-[#445668] hover:bg-[#F4F7FA] hover:text-[#10283B]";

const sidebarSubItemClass =
  "flex min-h-[29px] w-full min-w-0 items-center pl-[48px] text-[14px] text-[#4B5A69] transition-colors hover:text-[#10283B]";

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
      { label: "Overview", href: "/app/settings/financial-settings" },
      { label: "Invoices" },
      { label: "Expenses" },
      { label: "Cash Flow" },
      { label: "Reports" },
    ],
  },
  { label: "Resources", icon: Package },
  { label: "Team", icon: UsersRound },
  { label: "Reports", icon: BarChart3 },
  { label: "AI Assistant", icon: Sparkles },
] as const;

const UTILITY_NAV_ITEMS = [
  { label: "Settings", href: "/app/settings/organization", icon: Settings },
  { label: "Help", icon: HelpCircle },
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
  const [isFinancialsExpanded, setIsFinancialsExpanded] = useState(() =>
    pathname.startsWith("/app/settings/financial-settings")
  );

  const displayName = session?.name ?? mockUser.name;
  const initials = getInitials(displayName) || mockUser.initials;

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[30px] border border-[var(--app-border)] bg-[#FBFEFE] px-4 py-4 shadow-[0_8px_24px_rgba(11,38,57,0.025)]">
      <div className="px-3 pb-[1rem] pt-[0.9rem]">
        <Link href="/app/dashboard" className="inline-flex items-center" onClick={onNavigate}>
          <Image
            src="/Tradesstack Logo Dash.png"
            alt="TradesStack"
            width={220}
            height={52}
            className="h-auto w-auto max-h-[3.65rem]"
            unoptimized
            priority
          />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-0 overflow-y-auto pr-1">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = "href" in item && item.href ? pathname.startsWith(item.href) : false;
          const hasChildren = "children" in item && Boolean(item.children?.length);

          if (hasChildren) {
            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setIsFinancialsExpanded((current) => !current)}
                  className={cn(
                    sidebarItemBaseClass,
                    "w-full",
                    "text-[#445668] hover:bg-[#F4F7FA] hover:text-[#10283B]"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      strokeWidth={2.2}
                      className="h-5 w-5 text-[#4E5E6D]"
                    />
                    <span className="text-[15px] font-semibold leading-none" style={graphikRegularTextStyle}>{item.label}</span>
                  </span>
                  <ChevronDown
                    className={cn("mr-0.5 h-4 w-4 shrink-0 text-[#4E5E6D] transition-transform", isFinancialsExpanded ? "rotate-180" : "rotate-0")}
                  />
                </button>

                {isFinancialsExpanded ? (
                  <div className="space-y-0.5 py-0.5">
                    {item.children.map((child) =>
                      child.href ? (
                        <Link
                          key={child.label}
                          href={child.href}
                          onClick={onNavigate}
                          className={sidebarSubItemClass}
                        >
                          <span className="truncate font-semibold" style={graphikRegularTextStyle}>{child.label}</span>
                        </Link>
                      ) : (
                        <button
                          key={child.label}
                          type="button"
                          className={cn(sidebarSubItemClass, "w-full text-left")}
                        >
                          <span className="truncate font-semibold" style={graphikRegularTextStyle}>{child.label}</span>
                        </button>
                      )
                    )}
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
                    className={cn("h-5 w-5", isActive ? "text-white" : "text-[#4E5E6D] group-hover:text-[#10283B]")}
                  />
                  <span className="text-[15px] font-semibold leading-none" style={graphikRegularTextStyle}>{item.label}</span>
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
                  className="h-5 w-5 text-[#4E5E6D] group-hover:text-[#10283B]"
                />
                <span className="text-[15px] font-semibold leading-none" style={graphikRegularTextStyle}>{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-3 border-t border-[#EEF3F7] pt-3">
        <div className="mb-2 space-y-0">
          {UTILITY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = "href" in item && item.href ? pathname.startsWith(item.href) : false;

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
                      className={cn("h-5 w-5", isActive ? "text-white" : "text-[#4E5E6D] group-hover:text-[#10283B]")}
                    />
                    <span className="text-[15px] font-semibold leading-none" style={graphikRegularTextStyle}>{item.label}</span>
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
                  <Icon strokeWidth={2.2} className="h-5 w-5 text-[#4E5E6D] group-hover:text-[#10283B]" />
                  <span className="text-[15px] font-semibold leading-none" style={graphikRegularTextStyle}>{item.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2 text-left transition-colors hover:bg-[#F6F8FA]"
              title={displayName}
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F74917] text-[15px] font-semibold text-white">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`${interMedium.className} truncate text-[15px] font-semibold text-[#10283B]`}>
                  {displayName}
                </p>
                <p className={`${interMedium.className} mt-0.5 text-[13px] text-[#738191]`}>Profile</p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#7A8897]" strokeWidth={2.2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            sideOffset={12}
            className="w-52 rounded-[16px] border border-slate-200/80 bg-white p-2 shadow-[0_18px_48px_rgba(11,38,57,0.18)]"
          >
            <DropdownMenuItem className="h-11 rounded-[12px] px-3 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900">
              <Bell className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
              <span style={graphikRegularTextStyle}>Notifications</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="h-11 rounded-[12px] px-0 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900">
              <Link href="/app/settings/organization" className="flex h-full w-full items-center px-3">
                <Settings className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                <span style={graphikRegularTextStyle}>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="h-11 rounded-[12px] px-0 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900">
              <Link href="/app/settings" className="flex h-full w-full items-center px-3">
                <Clock3 className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
                <span style={graphikRegularTextStyle}>Time settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              className="h-11 rounded-[12px] px-3 text-[15px] text-slate-700 focus:bg-slate-100 focus:text-slate-900"
            >
              <LogOut className="mr-3 h-4.5 w-4.5" strokeWidth={2.3} />
              <span style={graphikRegularTextStyle}>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-[240px] shrink-0 self-start bg-[#FBFEFE] px-3 py-3 lg:flex",
        className
      )}
    >
      <SidebarNavContent />
    </aside>
  );
}
