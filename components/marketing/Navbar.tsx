"use client";

import Image from "next/image";
import Link from "next/link";
import type { AuthSession } from "@/lib/types";
import { akzidenzBlack } from "@/lib/fonts";

interface NavbarProps {
  session: AuthSession | null;
  onLoginClick?: () => void;
  loginHref?: string;
}

const links = [
  { href: "/#platform-features", label: "Platform Features" },
  { href: "/contact-us", label: "Contact Us" },
];

export function Navbar({ session, onLoginClick, loginHref }: NavbarProps) {
  return (
    <header role="banner" className="marketing-navbar relative z-40 w-full bg-[#0B2639]">
      <div className="mx-auto flex h-[96px] w-full max-w-[1380px] items-center justify-between gap-4 px-5 sm:px-6 lg:h-[78px] lg:px-16">
        <Link href="/" aria-label="TradeStack home" className="inline-flex items-center lg:translate-x-[-18px]">
          <Image
            src="/tradesstacklogowhite.png"
            alt="TradeStack"
            width={1200}
            height={400}
            priority
            className="h-[58px] w-auto sm:h-[66px] lg:h-[80.64px]"
          />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex items-center gap-1.5 text-[15.6px] font-bold text-white transition-opacity hover:opacity-80"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              <span>{item.label}</span>
              <span aria-hidden="true" className="text-[1.35em] font-normal leading-none">
                +
              </span>
            </Link>
          ))}
        </nav>

        {!session ? (
          <div className="hidden items-center gap-3 sm:gap-4 lg:flex">
            <Link
              href="/early-access"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[#F74918] px-4 text-[14px] font-bold text-white transition-opacity hover:opacity-80 sm:text-[15.6px]"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              Get Early Access
            </Link>
          </div>
        ) : (
          <Link
            href="/app/dashboard"
            className={`${akzidenzBlack.className} hidden min-h-[44px] items-center justify-center rounded-[12px] border border-white/60 bg-white/8 px-4 text-[15px] font-bold text-white transition-opacity hover:opacity-80 lg:inline-flex`}
          >
            Projects
          </Link>
        )}

        {!session ? (
          <div className="flex items-center gap-3 lg:hidden">
            <Link
              href="/early-access"
              className="inline-flex min-h-[48px] items-center justify-center rounded-[8px] bg-white px-4 text-[1rem] font-bold text-[#0B2639]"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              Get Early Access
            </Link>
          </div>
        ) : null}
      </div>
    </header>
  );
}
