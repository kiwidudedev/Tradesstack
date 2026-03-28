"use client";

import Image from "next/image";
import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

const heroCards = [
  {
    title: "Estimated margin",
    value: "24%",
    subtext: "Within target range",
    position: "left-[-8px] top-[18px] sm:left-[-24px] sm:top-[36px]",
  },
  {
    title: "Project status",
    value: "On track",
    subtext: "Tender → Scope → Delivery",
    position: "bottom-[88px] left-[-6px] sm:bottom-[112px] sm:left-[-34px]",
  },
  {
    title: "AI pricing check",
    value: "No major gaps found",
    subtext: "Materials and labour aligned",
    position: "bottom-[-18px] right-[12px] sm:bottom-[26px] sm:right-[-26px]",
  },
];

export function Hero() {
  return (
    <section id="product" className="bg-[#0B2639] px-5 pb-12 pt-10 text-white sm:px-6 lg:px-16 lg:pb-20 lg:pt-[126px]">
      <div className="mx-auto grid w-full max-w-[1380px] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(520px,620px)] lg:items-center lg:gap-14">
        <div className="max-w-[640px]">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center rounded-full border border-[#AACFDF]/35 bg-white/10 px-4 py-2 text-[13px] font-medium tracking-[0.01em] text-white sm:text-[13px]"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              AI-powered construction workflow platform
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full border border-[#AACFDF]/35 bg-white/10 px-4 py-2 text-[13px] font-medium text-white sm:text-[13px]"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              <span aria-hidden="true" className="text-[#F74918]">
                ★
              </span>
              <span>4.8</span>
            </div>
          </div>

          <h1
            className={`${akzidenzProBoldEx.className} mt-7 max-w-[11ch] text-[2.7rem] leading-[0.93] tracking-[-0.055em] text-white sm:text-[2.93rem] lg:max-w-none lg:text-[3.85rem]`}
          >
            Know every job. Price it right. Let AI keep the work on track.
          </h1>

          <p
            className="mt-6 max-w-[620px] text-[1.02rem] leading-[1.52] text-white sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            From tender to delivery, TradesStack uses AI to give you the clarity to understand every job, price with
            confidence, and stay in control every step of the way.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/register"
              className="inline-flex min-h-[56px] w-full items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[1.05rem] font-bold text-white transition-opacity hover:opacity-90 sm:min-h-[52px] sm:w-auto sm:text-[15px]"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              Get Early Access
            </Link>
            <Link
              href="/#book-a-chat"
              className="inline-flex min-h-[56px] w-full items-center justify-center rounded-[8px] border-[1.5px] bg-transparent px-7 text-[1.05rem] font-bold sm:min-h-[52px] sm:w-auto sm:text-[15px]"
              style={{
                fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif',
                borderColor: "#FFFFFF",
                color: "#FFFFFF",
              }}
            >
              Contact us
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 rounded-[32px] bg-[#AACFDF]/10 blur-3xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#F5EFE6]/8 p-3 shadow-[0_30px_80px_rgba(11,38,57,0.35)] sm:rounded-[32px] sm:p-4">
            <div className="relative aspect-[5/5.9] overflow-hidden rounded-[20px] bg-[#F5EFE6] sm:aspect-[5/4.9] sm:rounded-[24px]">
              <Image
                src="/hero banner man on phont.jpg"
                alt="TradeStack construction workflow overview"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 46vw"
              />
            </div>
          </div>

          {heroCards.map((card) => (
            <article
              key={card.title}
              className={`absolute z-10 w-[198px] rounded-[20px] border border-[#AACFDF]/55 bg-[#F5EFE6] p-4 text-[#0B2639] shadow-[0_18px_40px_rgba(11,38,57,0.16)] backdrop-blur ${card.position} sm:w-[232px]`}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#0B2639]/68"
                  style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                >
                  {card.title}
                </p>
                <span className="h-2.5 w-2.5 rounded-full bg-[#AACFDF]" aria-hidden="true" />
              </div>
              <p
                className="mt-3 text-[1.5rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[1.75rem]"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                {card.value}
              </p>
              <p
                className="mt-2 text-[13px] leading-[1.45] text-[#0B2639]/72"
                style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
              >
                {card.subtext}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
