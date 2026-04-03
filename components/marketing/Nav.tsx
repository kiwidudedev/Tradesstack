"use client";

import Image from "next/image";
import Link from "next/link";

import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { marketingLinks } from "@/lib/nav";

export function Nav() {
  return (
    <header className="marketing-navbar relative z-20 px-4 pt-6 sm:px-8 lg:px-14 lg:pt-10">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-full py-3">
        <Link href="/" className="-ml-[42px] inline-flex items-center">
          <Image
            src="/tradesstacklogo.png"
            alt="TradesStack"
            width={1200}
            height={400}
            className="h-[4.21875rem] w-auto sm:h-[4.6875rem]"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-white/90 md:flex">
          {marketingLinks.map((link) => (
            <Link key={link.label} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className="md:hidden">
            <Button variant="outline" size="sm" className="h-9 bg-[#04234D] text-[var(--brand-blue)]">
              Log in
            </Button>
          </Link>

          <div className="hidden md:block">
            <AuthDialog
              trigger={
                <Button
                  size="sm"
                  className="h-10 border border-white/20 bg-[var(--brand-blue)] px-5 text-white hover:bg-[var(--brand-blue)]"
                >
                  Log in
                </Button>
              }
            />
          </div>

          <Link href="/early-access">
            <Button variant="outline" size="sm" className="h-10 px-5 text-[var(--brand-blue)]">
              Get Early Access
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
