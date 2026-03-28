"use client";

import Image from "next/image";
import { akzidenzProBoldEx } from "@/lib/fonts";

export function EarlyAccessSection() {
  return (
    <section className="overflow-hidden bg-[#F5EFE6] px-6 py-16 text-[#0B2639] sm:px-8 sm:py-20 lg:px-24 lg:py-24">
      <div className="mx-auto w-full max-w-[1380px] rounded-[32px] bg-[linear-gradient(180deg,#F5EFE6_0%,#D7E8F0_52%,#FFFFFF_100%)] px-6 pb-0 pt-8 shadow-none sm:px-8 sm:pt-10 sm:shadow-[0_18px_40px_rgba(11,38,57,0.08)] lg:px-12 lg:pt-12">
        <div className="mx-auto max-w-[860px] text-center">
          <div
            className="inline-flex rounded-full bg-white/72 px-4 py-2 text-[12px] font-bold text-[#0B2639]"
            style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
          >
            Early access
          </div>
          <h2
            className={`${akzidenzProBoldEx.className} mx-auto mt-5 max-w-[12ch] text-[2rem] leading-[1.06] tracking-[-0.04em] text-[#0B2639] sm:text-[2.9rem] lg:text-[3.55rem]`}
          >
            Get early access to TradeStack
          </h2>
          <p
            className="mx-auto mt-5 max-w-[720px] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            We&apos;re opening access soon. Join the waitlist to be one of the first to use TradeStack and start
            running jobs with more clarity, control, and speed.
          </p>

          <form className="mx-auto mt-8 flex max-w-[680px] flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="Your email address"
              className="min-h-[56px] w-full rounded-full border border-white/60 bg-white/55 px-6 text-[0.98rem] text-[#0B2639] placeholder:text-[#0B2639]/48 outline-none transition focus:border-[#0B2639]/22"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            />
            <button
              type="submit"
              className="inline-flex min-h-[56px] whitespace-nowrap items-center justify-center rounded-full bg-[#F74918] px-8 text-[0.98rem] font-bold text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              Join waitlist
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3">
            <p
              className="text-[0.95rem] text-[#0B2639]"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            >
              Join 200+ tradies already on the waitlist
            </p>
          </div>

        </div>

        <div className="mx-auto mt-10 w-full max-w-[980px]">
          <div className="relative h-[260px] sm:h-[360px] lg:h-[470px]">
            <Image
              src="/Tradesstack Landing Page.png"
              alt="TradeStack dashboard preview"
              fill
              priority={false}
              className="object-cover object-bottom opacity-90"
              sizes="(max-width: 1024px) 100vw, 70vw"
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.8)_100%)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
