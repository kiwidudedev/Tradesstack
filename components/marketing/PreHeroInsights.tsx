"use client";

import { bertholdExtraBoldCondensed, mulishBody } from "@/lib/fonts";

const trustedLogos = ["Build Teams", "Estimators", "Contractors", "QS Leads", "Site Ops"];

const insightCards = [
  { title: "Complete tender clarity", value: "95%" },
  { title: "Projects delivered faster", value: "10+" },
  { title: "Revisions tracked instantly", value: "10+" },
  { title: "Drawings processed", value: "50m" },
];

export function PreHeroInsights() {
  return (
    <section className="bg-[#ECF2F6] pb-12 pt-[92px] text-[#04234D] lg:pb-16 lg:pt-[106px]">
      <div className="mx-auto w-full max-w-[1280px] px-6 lg:px-16">
        <div className="grid grid-cols-2 gap-6 border-b border-[#04234D]/10 pb-8 sm:grid-cols-3 lg:grid-cols-5 lg:pb-10">
          {trustedLogos.map((logo) => (
            <div key={logo} className="flex items-center gap-2 text-[#04234D]/45">
              <span className="inline-block h-4 w-4 rounded-full border border-[#04234D]/35" />
              <span className={`${mulishBody.className} text-[20px] font-semibold tracking-[-0.01em]`}>{logo}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] lg:items-end lg:gap-10">
          <div className="max-w-[620px]">
            <p className={`${mulishBody.className} text-[13px] font-semibold uppercase tracking-[0.14em] text-[#04234D]/55`}>
              TradesStack Consulting
            </p>
            <h2
              className={`${bertholdExtraBoldCondensed.className} mt-4 text-[46px] uppercase leading-[0.96] tracking-[-0.02em] text-[#04234D] sm:text-[62px]`}
            >
              With over a decade of experience, we deliver tailored solutions that empower your business to grow.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {insightCards.map((card) => (
              <article
                key={card.title}
                className="rounded-[20px] border border-[#04234D]/8 bg-white/78 p-6 shadow-[0_10px_28px_rgba(4,35,77,0.08)]"
              >
                <p className={`${mulishBody.className} text-[13px] font-semibold uppercase tracking-[0.11em] text-[#04234D]/60`}>
                  {card.title}
                </p>
                <p className={`${bertholdExtraBoldCondensed.className} mt-7 text-[56px] leading-none tracking-[-0.02em] text-[#04234D]`}>
                  {card.value}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
