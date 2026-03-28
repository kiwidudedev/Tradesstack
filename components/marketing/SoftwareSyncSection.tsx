"use client";

import Image from "next/image";
import { akzidenzProBoldEx } from "@/lib/fonts";

const software = [
  {
    name: "Xero",
    logo: (
      <div className="relative mx-auto h-24 w-full max-w-[264px]">
        <Image
          src="/xero logo.png"
          alt="Xero"
          fill
          className="object-contain object-center"
          sizes="264px"
        />
      </div>
    ),
  },
  {
    name: "MYOB",
    logo: (
      <div className="relative mx-auto h-24 w-full max-w-[264px]">
        <Image
          src="/myob logo.webp"
          alt="MYOB"
          fill
          className="object-contain object-center"
          sizes="264px"
        />
      </div>
    ),
  },
  {
    name: "More tools",
    logo: (
      <div className="mx-auto flex h-24 w-full max-w-[264px] items-center justify-center">
        <span
          className="text-[2rem] font-bold leading-none text-[#0B2639]"
          style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
        >
          +
        </span>
      </div>
    ),
  },
];

export function SoftwareSyncSection() {
  return (
    <section className="bg-[#F5EFE6] px-6 pb-16 pt-0 text-[#0B2639] sm:px-8 sm:pb-20 lg:px-24 lg:pb-24">
      <div className="mx-auto w-full max-w-[1380px] rounded-[30px] bg-[#AACFDF] p-6 shadow-none sm:p-8 sm:shadow-[0_18px_40px_rgba(11,38,57,0.06)] lg:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="max-w-[520px]">
            <div
              className="inline-flex rounded-full bg-white px-4 py-2 text-[12px] font-bold text-[#0B2639]"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              Software Sync
            </div>
            <h2
              className={`${akzidenzProBoldEx.className} mt-5 max-w-[12ch] text-[2rem] leading-[0.98] tracking-[-0.04em] text-[#0B2639] sm:text-[2.7rem]`}
            >
              Sync with your favourite softwares
            </h2>
            <p
              className="mt-5 max-w-[34rem] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            >
              Keep TradeStack connected to the tools your team already uses. Bring quoting, job workflows, and
              financial data together without double-handling information across systems.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {software.map((item) => (
              <article
                key={item.name}
                className="flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-transparent bg-white px-5 py-6 text-center shadow-none sm:border-[#0B2639]/10 sm:shadow-[0_12px_28px_rgba(11,38,57,0.05)]"
              >
                <div className="mx-auto mb-[22px] flex w-full justify-center">{item.logo}</div>
                <p
                  className={`${akzidenzProBoldEx.className} text-[1.9rem] leading-[0.95] tracking-[-0.04em] text-[#0B2639]`}
                >
                  {item.name}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
