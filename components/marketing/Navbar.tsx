"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthSession } from "@/lib/types";
import { akzidenzBlack } from "@/lib/fonts";

interface NavbarProps {
  session: AuthSession | null;
  onLoginClick?: () => void;
  loginHref?: string;
}

const links = [
  { href: "/#trade-pack", label: "How it works" },
  { href: "/#choose-plan", label: "Pricing" },
];

export function Navbar({ session, onLoginClick, loginHref }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      role="banner"
      className={`fixed left-0 top-0 z-30 w-full text-white transition-colors duration-200 ${
        isScrolled ? "bg-[#04234D]/95 backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <div className="flex h-[68px] w-full items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6 lg:px-16">
        <Link href="/" aria-label="TradesStack home" className="inline-flex items-center">
          <Image
            src="/tradesstacklogowhite.png"
            alt="TradesStack"
            width={1200}
            height={400}
            className="h-12 w-auto sm:h-16"
            priority
          />
        </Link>

        <nav className={`${akzidenzBlack.className} hidden items-center gap-6 text-base font-medium tracking-[0.02em] lg:flex`}>
          {links.map((item) => (
            <a key={item.label} href={item.href} className="text-white/80 transition hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

        {!session ? (
          <div className={`${akzidenzBlack.className} flex items-center gap-3 text-[15px] sm:gap-4 sm:text-base`}>
            {loginHref ? (
              <Link
                href={loginHref}
                className={`${akzidenzBlack.className} hidden rounded-[10px] bg-white/8 px-[18px] py-[10px] font-medium text-white transition hover:bg-white/12 lg:inline-flex`}
              >
                Login
              </Link>
            ) : (
              <button
                type="button"
                onClick={onLoginClick}
                className={`${akzidenzBlack.className} hidden rounded-[10px] bg-white/8 px-[18px] py-[10px] font-medium text-white transition hover:bg-white/12 lg:inline-flex`}
              >
                Login
              </button>
            )}
            <Link
              href="/register"
              className={`${akzidenzBlack.className} inline-flex rounded-[10px] bg-[#F74917] px-[18px] py-[10px] font-semibold text-white transition hover:bg-[#E84212]`}
            >
              Sign Up
            </Link>
          </div>
        ) : (
          <Link
            href="/app/dashboard"
            className={`${akzidenzBlack.className} rounded-[10px] bg-[#F74917] px-[18px] py-[10px] font-semibold text-white transition hover:bg-[#E84212]`}
          >
            Workspace
          </Link>
        )}
      </div>
    </div>
  );
}
