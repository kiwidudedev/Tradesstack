"use client";

import Image from "next/image";
import Link from "next/link";
import type { AuthSession } from "@/lib/types";
import { akzidenzBlack } from "@/lib/fonts";

interface NavbarProps {
  session: AuthSession | null;
  loginHref?: string;
}

/**
 * Minimal site chrome for the legal pages that remain available in the
 * customer application. Public marketing navigation, early-access calls to
 * action and self-service registration links are intentionally absent.
 */
export function Navbar({ session, loginHref }: NavbarProps) {
  return (
    <header role="banner" className="marketing-navbar relative z-40 w-full bg-[#0B2639]">
      <div className="mx-auto flex h-[96px] w-full max-w-[1380px] items-center justify-between gap-4 px-5 sm:px-6 lg:h-[78px] lg:px-16">
        <Link href="/" aria-label="TradesStack home" className="inline-flex items-center lg:translate-x-[-18px]">
          <Image
            src="/tradesstacklogowhite.png"
            alt="TradesStack"
            width={1200}
            height={400}
            priority
            className="h-[58px] w-auto sm:h-[66px] lg:h-[80.64px]"
          />
        </Link>

        <Link
          href={session ? "/app/dashboard" : loginHref ?? "/login"}
          className={`${akzidenzBlack.className} inline-flex min-h-[44px] items-center justify-center rounded-[8px] border border-white/60 bg-white/8 px-4 text-[14px] font-bold text-white transition-opacity hover:opacity-80 sm:text-[15.6px]`}
        >
          {session ? "Open workspace" : "Sign in"}
        </Link>
      </div>
    </header>
  );
}
