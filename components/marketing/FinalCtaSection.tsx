"use client";

import Image from "next/image";
import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

export function FinalCtaSection() {
  return (
    <section className="overflow-hidden bg-[#AACFDF] px-6 pb-0 pt-16 text-[#0B2639] sm:px-8 sm:pt-20 lg:px-16 lg:pt-24">
      <div className="mx-auto grid w-full max-w-[1380px] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-12">
        <div className="max-w-[560px] pb-6 lg:pt-6">
          <h2
            className={`${akzidenzProBoldEx.className} text-[2.4rem] leading-[0.96] tracking-[-0.05em] text-[#0B2639] sm:text-[3.8rem] lg:text-[5rem]`}
          >
            Want better margins?
          </h2>
          <p
            className="mt-5 max-w-[34rem] text-[1rem] leading-[1.36] text-black sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            See how TradeStack helps your team quote faster, reduce admin, and keep every job moving with more
            control.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/early-access"
              className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              Get Early Access
            </Link>
            <Link
              href="/#book-a-chat"
              className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] border-[1.5px] bg-transparent px-7 text-[15px] font-bold"
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

        <div className="relative flex items-end justify-center lg:justify-end">
          <div className="relative w-full max-w-[980px] overflow-visible">
            <div className="relative h-[320px] sm:h-[420px] lg:h-[620px]">
              <Image
                src="/better margins.png"
                alt="TradeStack margins dashboard preview"
                fill
                priority={false}
                className="origin-bottom-right scale-[1.2] object-contain object-bottom sm:scale-[1.32] lg:scale-[1.5]"
                sizes="(max-width: 1024px) 100vw, 52vw"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
