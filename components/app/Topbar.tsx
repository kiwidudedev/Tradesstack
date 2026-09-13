"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Clock3, HelpCircle, LogOut, Menu, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { SidebarNavContent } from "@/components/app/Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { mockUser } from "@/lib/mock";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({
  canViewPaymentClaims = false,
}: {
  canViewPaymentClaims?: boolean;
}) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { session, logout } = useAuth();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleDesktopChange = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) {
        setIsNavOpen(false);
        document.body.style.removeProperty("overflow");
      }
    };

    handleDesktopChange(mediaQuery);

    const listener = (event: MediaQueryListEvent) => {
      handleDesktopChange(event);
    };

    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  const displayName = session?.name ?? mockUser.name;
  const initials = getInitials(displayName) || mockUser.initials;
  const isSettingsActive = pathname.startsWith("/app/settings");

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-white/[0.06] bg-[var(--topbar)]">
      <div className="flex h-full w-full items-center justify-between pl-3 pr-4 sm:pl-4 sm:pr-5">
        {/* Left cluster: mobile menu + logo */}
        <div className="flex items-center gap-2">
          <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
            <Tooltip label="Menu">
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white lg:hidden"
                >
                  <Menu className="h-5 w-5" strokeWidth={2.1} />
                </button>
              </SheetTrigger>
            </Tooltip>
            <SheetContent
              side="left"
              className="w-[280px] rounded-r-none border-0 bg-[var(--sidebar)] p-0"
            >
              <SidebarNavContent
                onNavigate={() => setIsNavOpen(false)}
                canViewPaymentClaims={canViewPaymentClaims}
              />
            </SheetContent>
          </Sheet>

          <Tooltip label="Dashboard">
            <Link
              href="/app/dashboard"
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors hover:bg-white/[0.06]"
              aria-label="Dashboard"
            >
              <Image
                src="/favicon-512.png"
                alt="TradesStack"
                width={64}
                height={64}
                className="h-8 w-8 brightness-0 invert"
                priority
              />
              <span className="hidden whitespace-nowrap text-[14px] font-medium text-white/65 sm:inline">
                work management
              </span>
            </Link>
          </Tooltip>
        </div>

        {/* Right cluster: actions + user */}
        <div className="flex items-center gap-1">
          <Tooltip label="Notifications">
            <button
              type="button"
              aria-label="Notifications"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </button>
          </Tooltip>
          <Tooltip label="Help">
            <button
              type="button"
              aria-label="Help"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <HelpCircle className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </button>
          </Tooltip>
          <Tooltip label="Settings">
            <Link
              href="/app/settings/organization"
              aria-label="Settings"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
                isSettingsActive
                  ? "bg-white/[0.1] text-white"
                  : "text-white/75 hover:bg-white/[0.08] hover:text-white"
              )}
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </Link>
          </Tooltip>

          <div className="mx-2 h-5 w-px bg-white/10" />

          <DropdownMenu>
            <Tooltip label="Profile">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Profile — ${displayName}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-[13px] font-semibold text-white transition-transform hover:scale-[1.04]"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-56 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-overlay)]"
            >
              <div className="px-3 py-2">
                <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{displayName}</p>
                {session?.email ? (
                  <p className="truncate text-[12px] text-[var(--text-muted)]">{session.email}</p>
                ) : null}
              </div>
              <div className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenuItem className="h-10 rounded-[var(--radius-md)] px-3 text-[13.5px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]">
                <Bell className="mr-3 h-4 w-4" strokeWidth={2.2} />
                <span>Notifications</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="h-10 rounded-[var(--radius-md)] px-0 text-[13.5px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]"
              >
                <Link href="/app/settings/organization" className="flex h-full w-full items-center px-3">
                  <Settings className="mr-3 h-4 w-4" strokeWidth={2.2} />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="h-10 rounded-[var(--radius-md)] px-0 text-[13.5px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]"
              >
                <Link href="/app/settings" className="flex h-full w-full items-center px-3">
                  <Clock3 className="mr-3 h-4 w-4" strokeWidth={2.2} />
                  <span>Time settings</span>
                </Link>
              </DropdownMenuItem>
              <div className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="h-10 rounded-[var(--radius-md)] px-3 text-[13.5px] text-[var(--text-primary)] focus:bg-[var(--surface-muted)] focus:text-[var(--text-primary)]"
              >
                <LogOut className="mr-3 h-4 w-4" strokeWidth={2.2} />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
