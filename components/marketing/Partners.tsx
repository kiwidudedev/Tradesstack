import { bertholdHeading } from "@/lib/fonts";

const partners = ["Build Green Homes", "BizCover", "Upscale", "Xero", "The Professional Builder"];

export function Partners() {
  return (
    <section id="support" className="bg-[#04234D] py-20">
      <div className="mx-auto max-w-[1320px] px-4 lg:px-8">
        <h2 className={`${bertholdHeading.className} mb-14 text-center text-4xl font-bold uppercase italic leading-none text-[#F74917] sm:text-5xl`}>
          Our partners
        </h2>

        <div className="flex items-center justify-between gap-4">
          <button type="button" aria-label="Previous partners" className="text-5xl leading-none text-[#F74917]">‹</button>
          <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {partners.map((partner) => (
              <div
                key={partner}
                className="flex min-h-[96px] items-center justify-center rounded-2xl border border-[#F74917]/20 bg-[#04234D] px-4 text-center text-lg font-semibold text-[#F74917]"
              >
                {partner}
              </div>
            ))}
          </div>
          <button type="button" aria-label="Next partners" className="text-5xl leading-none text-[#F74917]">›</button>
        </div>
      </div>
    </section>
  );
}
