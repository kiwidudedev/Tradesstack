"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarNavContent } from "@/components/app/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { interMedium } from "@/lib/fonts";
import { mockUser } from "@/lib/mock";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const displayName = session?.name ?? mockUser.name;
  const initials = getInitials(displayName) || mockUser.initials;
  const roleLabel = session?.role === "admin" ? "ADMIN" : "MEMBER";

  const onLogout = async () => {
    setIsLoggingOut(true);

    try {
      await logout();
      router.push("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="mb-8 rounded-[12px] border border-[#E6EAF0] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-[10px] border-[#E2E8F0] bg-white lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[292px] rounded-r-none border-0 bg-[#04234D] p-5"
          >
            <SidebarNavContent />
          </SheetContent>
        </Sheet>

        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#718096]" />
          <Input
            placeholder="Search active jobs, trade packs, or people"
            className={`${interMedium.className} h-11 w-full rounded-[10px] border-[#E2E8F0] bg-[#F1F4F8] pl-10 text-sm font-medium text-[#0F172A] placeholder:font-medium placeholder:text-[#64748B]`}
          />
        </div>

        <Button className="h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]" asChild>
          <Link href="/app/trade-packs/new">Create a Trade Pack</Link>
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#E2E8F0] bg-white px-3.5 pr-4 text-sm text-[#0F172A] hover:bg-[#F8FAFC]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#111827] text-[0.65rem] font-bold tracking-[0.04em] text-white">
              {initials}
            </span>
            <span className="hidden sm:flex sm:flex-col sm:leading-tight">
              <span className={`${interMedium.className} text-sm font-medium`}>{displayName}</span>
              <span className={`${interMedium.className} text-[0.67rem] font-medium tracking-[0.15em] text-[#F74917]`}>
                {roleLabel}
              </span>
            </span>
          </button>
          <Button
            variant="outline"
            className={`${interMedium.className} h-10 rounded-[10px] border-[#E2E8F0] bg-white px-5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]`}
            onClick={onLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </Button>
        </div>
      </div>
    </header>
  );
}
