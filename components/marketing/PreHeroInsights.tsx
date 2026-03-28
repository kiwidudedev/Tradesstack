"use client";

import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

const problemCards = [
  "Too many tools to manage one job",
  "Quoting takes too long",
  "Jobs slip through cracks",
  "Clients keep chasing updates",
  "Variations get missed",
  "Margins are hard to track",
];

export function PreHeroInsights() {
  return (
    <section className="bg-[#F5EFE6] px-6 py-16 text-[#0B2639] sm:px-8 sm:py-20 lg:px-24 lg:py-24">
      <div className="mx-auto w-full max-w-[1380px]">
        <div className="mx-auto max-w-[860px] text-center">
          <h2
            className={`${akzidenzProBoldEx.className} mt-5 text-[2rem] leading-[1.06] tracking-[-0.04em] text-[#0B2639] sm:text-[2.9rem] lg:text-[3.55rem]`}
          >
            Built For How Jobs Actually Run
          </h2>
          <p
            className="mx-auto mt-5 max-w-[760px] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            Every stage of construction has the same problem: systems don&apos;t talk, info gets lost, and each phase
            creates more mess. TradesStack was built around fixing exactly these.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-[1180px] grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {problemCards.map((title) => (
            <article
              key={title}
              className="rounded-[18px] border border-transparent bg-white px-3 py-4 shadow-none sm:rounded-[22px] sm:border-[#0B2639]/10 sm:px-7 sm:py-7 sm:shadow-[0_8px_18px_rgba(11,38,57,0.04)]"
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span
                  className="inline-flex text-[0.85rem] leading-none text-[#F74918] sm:text-[0.95rem]"
                  aria-hidden="true"
                >
                  ❌
                </span>
                <span
                  className="text-[12.5px] tracking-[0.03em] text-[#0B2639]/42 sm:text-[16.5px] sm:tracking-[0.04em]"
                  style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                >
                  Problem
                </span>
              </div>
              <h3
                className="mt-4 max-w-[14ch] text-[1.22rem] font-bold leading-[1.02] tracking-[-0.03em] text-[#0B2639] sm:mt-6 sm:max-w-[16ch] sm:text-[1.5rem] sm:leading-[1.05]"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                {title}
              </h3>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-24 max-w-[860px] text-center sm:mt-28">
          <h2
            className={`${akzidenzProBoldEx.className} text-[2rem] leading-[1.06] tracking-[-0.04em] text-[#0B2639] sm:text-[2.9rem] lg:text-[3.55rem]`}
          >
            Why Tradies in NZ
            <br />
            Love TradesStack
          </h2>
          <p
            className="mx-auto mt-5 max-w-[760px] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            TradeStack brings quoting, job tracking, and client communication into one place — so your team can stop
            switching between tools, stay on top of every job, and keep work moving from tender to delivery with more
            clarity and less admin.
          </p>
          <div className="mt-8">
            <Link
              href="/#trade-pack"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90 sm:w-auto"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              See how it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
