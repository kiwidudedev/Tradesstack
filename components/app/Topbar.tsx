"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { SidebarNavContent } from "@/components/app/Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Topbar() {
  const [isNavOpen, setIsNavOpen] = useState(false);

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

  return (
    <div className="mb-8 space-y-3 lg:mb-0">
      <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
        <div className="-mx-3 -mt-3 lg:hidden">
          <div className="flex items-center justify-between bg-[var(--sidebar)] px-4 py-3 text-[var(--sidebar-foreground)] shadow-[var(--shadow-md)]">
            <Link href="/app/dashboard" className="inline-flex items-center">
              <Image
                src="/tradesstacklogowhite.png"
                alt="TradesStack"
                width={172}
                height={40}
                className="h-8 w-auto"
                priority
              />
            </Link>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-[var(--radius-sm)] border-[var(--sidebar-border)] bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
          </div>
        </div>
        <SheetContent
          side="left"
          className="w-[320px] rounded-r-none border-0 bg-[var(--sidebar)] p-3"
        >
          <SidebarNavContent onNavigate={() => setIsNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
