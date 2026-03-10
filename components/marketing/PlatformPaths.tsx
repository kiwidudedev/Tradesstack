const FEATURE_ITEMS = [
  "TRADE PACK BUILDER",
  "SCOPE EXTRACTION",
  "RISK DETECTION",
  "VARIATION COMPARISON",
] as const;

export function PlatformPaths() {
  return (
    <section id="features" className="w-full bg-[#F74917]">
      <div className="mx-auto w-full max-w-[1261px] px-10 py-[12px]">
        <div className="grid items-center gap-4 lg:grid-cols-4 lg:gap-6">
          {FEATURE_ITEMS.map((item, index) => (
            <article
              key={item}
              id={index === 1 ? "for-builders" : index === 2 ? "for-tradies" : undefined}
              className="flex items-center gap-4"
            >
              <span className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-full bg-[#04234D] text-[24px] font-black text-[#04234D]">
                ✓
              </span>
              <p className="font-heading text-[18px] font-black uppercase italic leading-none text-white">
                {item}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
