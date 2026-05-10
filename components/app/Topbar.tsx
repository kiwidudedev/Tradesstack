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
          <div className="flex items-center justify-between bg-[#04234D] px-4 py-3 text-white shadow-[0_6px_20px_rgba(4,35,77,0.26)]">
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
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-[6px] border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
          </div>
        </div>
        <SheetContent
          side="left"
          className="w-[320px] rounded-r-none border-0 bg-[var(--app-surface)] p-3"
        >
          <SidebarNavContent onNavigate={() => setIsNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
