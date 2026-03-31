"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header role="banner" className="relative z-40 w-full bg-[#0B2639]">
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
            {loginHref ? (
              <Link
                href={loginHref}
                className="inline-flex text-[14px] font-bold text-white transition-opacity hover:opacity-80 sm:text-[15.6px]"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                Login
              </Link>
            ) : (
              <button
                type="button"
                onClick={onLoginClick}
                className="inline-flex text-[14px] font-bold text-white transition-opacity hover:opacity-80 sm:text-[15.6px]"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                Login
              </button>
            )}
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
            <button
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen((value) => !value)}
              className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-[8px] text-white"
            >
              <span className="relative h-5 w-8">
                <span
                  className={`absolute left-0 top-[3px] h-[3px] w-8 rounded-full bg-white transition-all ${
                    isMobileMenuOpen ? "translate-y-[5px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-[13px] h-[3px] w-8 rounded-full bg-white transition-all ${
                    isMobileMenuOpen ? "-translate-y-[5px] -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        ) : null}
      </div>

      {!session && isMobileMenuOpen ? (
        <div className="border-t border-white/10 bg-[#0B2639] px-5 pb-6 pt-4 lg:hidden">
          <nav className="flex flex-col gap-3">
            {links.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-[1.1rem] font-bold text-white"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                {item.label}
              </Link>
            ))}
            {loginHref ? (
              <Link
                href={loginHref}
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-2 inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-5 text-[1rem] font-bold text-white"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                Contact Us
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLoginClick?.();
                }}
                className="mt-2 inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-5 text-[1rem] font-bold text-white"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                Contact Us
              </button>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
