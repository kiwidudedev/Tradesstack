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
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[16%] top-[24%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_72%)] blur-[80px]" />
        <div className="absolute right-[10%] top-[38%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(9,78,163,0.38),transparent_72%)] blur-[86px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>

      <div className="grid min-h-[100svh] w-full grid-cols-1 items-center gap-10 px-5 pb-10 pt-[88px] sm:px-6 lg:grid-cols-[minmax(0,48fr)_minmax(0,52fr)] lg:gap-10 lg:px-16 lg:pb-11 lg:pt-[108px]">
        <div className="relative max-w-[520px] lg:-translate-y-4">
          <h1
            className={`${bertholdExtraBoldCondensed.className} text-[44px] leading-[1.02] tracking-[-0.02em] text-white sm:text-[56px] md:text-[62px] lg:text-[65px]`}
          >
            <span className="block lg:whitespace-nowrap">AI THAT READS</span>
            <span className="block lg:whitespace-nowrap">CONSTRUCTION DRAWINGS</span>
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

          <p className={`${akzidenzBlack.className} mt-4 max-w-[470px] text-[15px] leading-[1.55] text-white/78`}>
            TradesStack scans full drawing sets and automatically builds trade packs, extracts scope, and flags
            pricing risks before you send tenders.
          </p>

          <div
            className={`${akzidenzBlack.className} mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-[14px]`}
          >
            <Link
              href="/register"
              className={`${akzidenzBlack.className} inline-flex h-[52px] items-center justify-center rounded-[10px] bg-[#F74917] px-7 text-base font-semibold text-white transition hover:bg-[#E84212]`}
            >
              Run Analysis Now
            </Link>
          </div>
        </div>

        <div className="relative w-full max-w-[980px] justify-self-center lg:justify-self-end lg:pr-8 xl:pr-12">
          <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(247,73,23,0.2),transparent_70%)] blur-[80px]" />

          <div className="relative rounded-[22px] border border-white/12 bg-[#0A2E63] p-[3px] shadow-[0_45px_110px_rgba(2,16,36,0.62)] xl:origin-left xl:scale-[1.08]">
            <div className="relative overflow-hidden rounded-[12px] border border-white/10 bg-[#082654]">
              <video
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/tradepackbuilder.png"
                aria-label="TradesStack product preview"
              >
                <source src="/tradessstackvideo.mp4" type="video/mp4" />
              </video>

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,35,77,0.02)_0%,rgba(4,35,77,0.28)_100%)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
