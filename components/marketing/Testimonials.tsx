import { akzidenzBlack, bertholdExtraBoldCondensed } from "@/lib/fonts";

const testimonials = [
  {
    quote:
      "TradesStack helped us standardize scope reviews across estimating and project delivery. We move faster and miss less.",
    name: "Mia T.",
    company: "Commercial Builder",
  },
  {
    quote:
      "The risk flags are practical and tied to source drawings, so our team can resolve issues before tender lock-in.",
    name: "Luke P.",
    company: "Tier 2 Contractor",
  },
  {
    quote:
      "Trade pack quality improved immediately. Subcontractor pricing is cleaner and variation exposure is easier to track.",
    name: "Aroha K.",
    company: "Residential Group",
  },
];

export function Testimonials() {
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
          {testimonials.map((item) => (
            <article key={item.name} className="rounded-2xl border border-white/10 bg-[#0A2E63] p-7 shadow-[0_24px_50px_rgba(0,0,0,0.2)]">
              <p className={`${akzidenzBlack.className} mb-5 text-lg leading-relaxed text-white/82`}>{item.quote}</p>
              <p className={`${bertholdExtraBoldCondensed.className} text-2xl font-bold uppercase italic`}>{item.name}</p>
              <p className={`${akzidenzBlack.className} mb-4 text-sm uppercase tracking-[0.12em] text-white/65`}>{item.company}</p>
              <p className="text-xl text-[#F74917]">★★★★★</p>
            </article>
          ))}
        </div>

      </div>
      </section>
    </>
  );
}
