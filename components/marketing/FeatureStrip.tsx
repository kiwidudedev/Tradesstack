"use client";

import { bertholdExtraBoldCondensed } from "@/lib/fonts";

const items = [
  "TRACK PACKS",
  "SCOPE BUILDERS",
  "DRAWING CHANGE DETECTIONS",
  "PLUS MORE",
];

export function FeatureStrip() {
  const loopItems = [...items, ...items];

  return (
    <section className="relative z-10 bg-transparent py-5">
      <div className="w-full overflow-hidden px-0">
        <div className="feature-marquee flex w-max items-center gap-16 whitespace-nowrap">
          {loopItems.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className={`${bertholdExtraBoldCondensed.className} flex shrink-0 items-center gap-3 text-[32px] font-black uppercase italic leading-[0.9] tracking-[-0.04em] text-white/90 sm:text-[40px]`}
            >
              <span className="leading-none">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .feature-marquee {
          animation: feature-marquee 18s linear infinite;
        }

        @keyframes feature-marquee {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </section>
  );
}
