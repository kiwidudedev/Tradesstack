"use client";

import Image from "next/image";
import { useState } from "react";
import { akzidenzBlack, bertholdExtraBoldCondensed } from "@/lib/fonts";

const testimonials = [
  {
    quote:
      "The biggest value for us is the risk flags tied directly to the drawings. Instead of manually combing through everything, TradesStack highlights the areas we need to review so the team can focus on solving issues instead of hunting for them. We’re spotting conflicts earlier in the tender phase and reducing surprises once projects start. It’s quickly become part of our normal workflow.",
    name: "Luke P",
    company: "Commercial Builder",
    avatar: "/review1.png",
  },
  {
    quote:
      "The risk flags are practical and tied to source drawings, so our team can resolve issues before tender lock-in.",
    name: "Luke P.",
    company: "Tier 2 Contractor",
    avatar: "/review2.png",
  },
  {
    quote:
      "Trade pack quality improved immediately. Subcontractor pricing is cleaner and variation exposure is easier to track.",
    name: "Aroha K.",
    company: "Residential Group",
    avatar: "/marketing/profile-placeholder.svg",
  },
];

export function Testimonials() {
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});

  const toggleCard = (name: string) => {
    setFlippedCards((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      <section className="bg-transparent py-5 text-white">
        <div className="mx-auto w-full max-w-[1200px] px-6 text-center lg:px-12">
          <p className={`${bertholdExtraBoldCondensed.className} text-[42px] font-black uppercase italic leading-[0.9] tracking-[-0.04em] text-white/90 sm:text-[65px]`}>
            Don&apos;t take our word for it, read about others like you!
          </p>
        </div>
      </section>

      <section className="relative overflow-hidden bg-transparent py-10 text-white lg:py-[44px]">
        <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">

        <div className="grid gap-6 lg:grid-cols-3">
          {testimonials.map((item) => {
            const isFlipped = Boolean(flippedCards[item.name]);

            return (
              <button
                key={item.name}
                type="button"
                aria-label={`Flip testimonial card for ${item.name}`}
                onClick={() => toggleCard(item.name)}
                className="relative min-h-[460px] w-full text-left [perspective:1400px]"
              >
                <div
                  className={`relative min-h-[460px] w-full rounded-[28px] border border-white/12 shadow-[0_28px_60px_rgba(0,0,0,0.35)] transition-transform duration-700 [transform-style:preserve-3d] ${
                    isFlipped ? "[transform:rotateY(180deg)]" : ""
                  }`}
                >
                  <article className="absolute inset-0 overflow-hidden rounded-[28px] [backface-visibility:hidden]">
                    <Image
                      src={item.avatar}
                      alt={`${item.name} profile`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(8,24,48,0.55)_0%,rgba(8,24,48,0.18)_38%,rgba(3,10,22,0.88)_100%)]" />
                    <div className="relative z-10 flex min-h-[460px] flex-col justify-between p-6 sm:p-7">
                      <div className="text-center">
                        <p className={`${bertholdExtraBoldCondensed.className} text-[34px] font-bold uppercase leading-[0.95] tracking-[-0.02em] text-white`}>
                          {item.name}
                        </p>
                        <p className={`${akzidenzBlack.className} mt-1 text-sm uppercase tracking-[0.12em] text-white/80`}>
                          {item.company}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="mb-3 text-[26px] leading-none tracking-[0.16em] text-[#F74917]">★★★★★</p>
                        <p className={`${akzidenzBlack.className} text-xs uppercase tracking-[0.12em] text-white/70`}>
                          Tap to read review
                        </p>
                      </div>
                    </div>
                  </article>

                  <article className="absolute inset-0 overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#0A2E63_0%,#0A2448_100%)] p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-7">
                    <div className="flex h-full flex-col">
                      <div className="mb-4 border-b border-white/15 pb-4">
                        <p className={`${bertholdExtraBoldCondensed.className} text-[34px] font-bold uppercase leading-[0.95] tracking-[-0.02em] text-white`}>
                          {item.name}
                        </p>
                        <p className={`${akzidenzBlack.className} mt-1 text-sm uppercase tracking-[0.12em] text-white/75`}>
                          {item.company}
                        </p>
                      </div>
                      <p className={`${akzidenzBlack.className} flex-1 overflow-auto text-[14px] leading-[1.6] text-white/92`}>
                        {item.quote}
                      </p>
                      <p className="mt-4 text-[22px] leading-none tracking-[0.16em] text-[#F74917]">★★★★★</p>
                    </div>
                  </article>
                </div>
              </button>
            );
          })}
        </div>

      </div>
      </section>
    </>
  );
}
