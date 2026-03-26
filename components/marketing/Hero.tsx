"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { akzidenzBlack, bertholdExtraBoldCondensed } from "@/lib/fonts";

const HERO_TITLES = ["QUANTITY SURVEYOR", "PROJECT MANAGER"] as const;
const LONGEST_HERO_TITLE = "QUANTITY SURVEYOR";

export function Hero() {
  const [titleIndex, setTitleIndex] = useState(0);
  const activeTitle = HERO_TITLES[titleIndex % HERO_TITLES.length];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTitleIndex((currentIndex) => (currentIndex + 1) % HERO_TITLES.length);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section
      id="product"
      className="relative min-h-[100svh] overflow-hidden"
    >
      <img
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_center] sm:object-center"
        src="/Tradesstack%20Landing%20Page.png"
        alt=""
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,14,34,0.62)_0%,rgba(3,14,34,0.45)_44%,rgba(3,14,34,0.6)_100%)] sm:bg-none" />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[16%] top-[24%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_72%)] blur-[80px]" />
        <div className="absolute right-[10%] top-[38%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(9,78,163,0.38),transparent_72%)] blur-[86px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>

      <div className="grid min-h-[100svh] w-full grid-cols-1 items-center gap-8 px-5 pb-10 pt-[88px] sm:gap-10 sm:px-6 lg:px-16 lg:pb-11 lg:pt-[108px]">
        <div className="relative max-w-[350px] sm:max-w-[520px] lg:-translate-y-4">
          <h1
            className={`${bertholdExtraBoldCondensed.className} text-[34px] leading-[1.04] tracking-[-0.02em] text-white sm:text-[56px] sm:leading-[1.02] md:text-[62px] lg:text-[65px]`}
          >
            <span className="block lg:whitespace-nowrap">WIN AND RUN</span>
            <span className="block lg:whitespace-nowrap">CONSTRUCTION PROJECTS</span>
            <span className="block sm:whitespace-nowrap">
              LIKE A{" "}
              <span className="relative inline-grid align-top text-left text-[1em] leading-[1.02] text-[#F74917]">
                <span aria-hidden className="invisible col-start-1 row-start-1 select-none">
                  {LONGEST_HERO_TITLE}
                </span>
                <span className="hero-rotator col-start-1 row-start-1 h-auto w-full leading-[0.95]">
                  <span className="hero-rotator-word whitespace-pre-line">
                    {activeTitle}
                  </span>
                </span>
              </span>
            </span>
          </h1>

          <p className={`${akzidenzBlack.className} mt-4 max-w-[470px] text-[14px] leading-[1.55] text-white/82 sm:text-[15px] sm:text-white/78`}>
            From tender to delivery, TradesStack uses AI to give you the clarity to understand every job, price with
            confidence, and stay in control every step of the way.
          </p>

          <div
            className={`${akzidenzBlack.className} mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-[14px]`}
          >
            <Link
              href="/register"
              className={`${akzidenzBlack.className} inline-flex h-[52px] w-full items-center justify-center rounded-[10px] bg-[#F74917] px-7 text-base font-semibold text-white transition hover:bg-[#E84212] sm:w-auto`}
            >
              Get Started Now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
