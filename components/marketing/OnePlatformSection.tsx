"use client";

import Image from "next/image";
import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

export function OnePlatformSection() {
  return (
    <section className="bg-[#F5EFE6] px-6 pb-[58px] pt-[19px] text-[#0B2639] sm:px-[29px] sm:pb-[70px] sm:pt-24 lg:px-[77px] lg:pb-[83px] lg:pt-[29px]">
      <div className="mx-auto w-full max-w-[1380px]">
        <div className="rounded-[30px] border border-transparent bg-white p-6 shadow-none sm:border-[#0B2639]/10 sm:shadow-[0_18px_40px_rgba(11,38,57,0.08)] sm:p-8 lg:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-14">
            <div className="max-w-[500px] lg:pl-4">
              <h2
                className={`${akzidenzProBoldEx.className} text-[2rem] uppercase leading-[0.96] tracking-[-0.03em] text-[#0B2639] sm:text-[2.75rem] lg:text-[3.3rem]`}
              >
                <span className="block whitespace-nowrap">The Power Of</span>
                <span className="block whitespace-nowrap">An All In One</span>
                <span className="block">Platform</span>
              </h2>
              <p
                className="mt-5 max-w-[34rem] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
                style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
              >
                Everything you need to run a job from pricing and planning to tracking and delivery, all in one
                place. No switching between tools, no missed details.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/early-access"
                  className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                >
                  Get Early Access
                </Link>
                <Link
                  href="/#book-a-chat"
                  className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] border-[1.5px] bg-transparent px-7 text-[15px] font-bold transition-opacity hover:opacity-80"
                  style={{
                    fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif',
                    borderColor: "#0B2639",
                    color: "#0B2639",
                  }}
                >
                  Contact us
                </Link>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-[560px] overflow-hidden rounded-[28px] bg-white">
                <div className="relative aspect-square">
                  <Image
                    src="/All In One Platform Blue v2.png"
                    alt="TradeStack all-in-one platform overview"
                    fill
                    priority={false}
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 44vw"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
