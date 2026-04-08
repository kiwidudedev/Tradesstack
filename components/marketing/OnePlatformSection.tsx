"use client";

import Image from "next/image";
import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

export function OnePlatformSection() {
  return (
    <section className="bg-[#F5EFE6] px-6 pb-[58px] pt-[19px] text-[#0B2639] sm:px-[29px] sm:pb-[70px] sm:pt-24 lg:px-[77px] lg:pb-[83px] lg:pt-[29px]">
      <div className="mx-auto w-full max-w-[1380px]">
        <div className="rounded-[30px] border border-transparent bg-white px-6 py-4 shadow-none sm:border-[#0B2639]/10 sm:px-8 sm:py-6 sm:shadow-[0_18px_40px_rgba(11,38,57,0.08)] lg:pb-6 lg:pl-10 lg:pr-0 lg:pt-6">
          <div className="grid items-center gap-10 lg:relative lg:min-h-[640px] lg:grid-cols-1">
            <div className="order-2 relative z-10 max-w-[560px] text-center lg:order-none lg:max-w-[520px] lg:pl-4 lg:text-left">
              <h2
                className={`one-platform-heading ${akzidenzProBoldEx.className} relative translate-y-0 uppercase leading-[0.96] tracking-[-0.03em] text-[#0B2639] lg:-translate-y-[20%]`}
              >
                <span className="block sm:whitespace-nowrap">The Power Of An</span>
                <span className="block sm:whitespace-nowrap">All In One</span>
                <span className="block">Platform</span>
              </h2>
              <style jsx>{`
                .one-platform-heading {
                  font-size: 36px !important;
                }

                @media (min-width: 640px) {
                  .one-platform-heading {
                    font-size: 2.2rem !important;
                  }
                }

                @media (min-width: 1024px) {
                  .one-platform-heading {
                    font-size: 2.64rem !important;
                  }
                }
              `}</style>
              <p
                className="mt-5 max-w-[34rem] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
                style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
              >
                Everything you need to run a job from pricing and planning to tracking and delivery, all in one
                place. No switching between tools, no missed details.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex flex-col gap-3 sm:hidden">
                  <Link
                    href="/contact-us"
                    className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] border-[1.5px] bg-transparent px-7 text-[15px] font-bold transition-opacity hover:opacity-80"
                    style={{
                      fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif',
                      borderColor: "#0B2639",
                      color: "#0B2639",
                    }}
                  >
                    Contact Us
                  </Link>
                  <Link
                    href="/early-access"
                    className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
                    style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                  >
                    Get Early Access
                  </Link>
                  <p
                    className="mx-auto max-w-[260px] text-center text-[14.4px] leading-[1.4] text-[#0B2639]"
                    style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                  >
                    No payment needed. Just sign up and we&apos;ll show you what we&apos;re building.
                  </p>
                </div>
                <div className="hidden flex-col gap-2 sm:flex">
                  <Link
                    href="/early-access"
                    className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
                    style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                  >
                    Get Early Access
                  </Link>
                  <p
                    className="mx-auto max-w-[260px] text-center text-[14.4px] leading-[1.4] text-[#0B2639] sm:mx-0 sm:text-left"
                    style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                  >
                    No payment needed. Just sign up and we&apos;ll show you what we&apos;re building.
                  </p>
                </div>
                <Link
                  href="/contact-us"
                  className="hidden min-h-[52px] items-center justify-center rounded-[8px] border-[1.5px] bg-transparent px-7 text-[15px] font-bold transition-opacity hover:opacity-80 sm:inline-flex"
                  style={{
                    fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif',
                    borderColor: "#0B2639",
                    color: "#0B2639",
                  }}
                >
                  Contact Us
                </Link>
              </div>
            </div>

            <div className="order-1 -mx-[10%] flex justify-center lg:order-none lg:mx-0 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[62%] lg:items-center lg:justify-end">
              <div className="relative w-[120%] max-w-[1045px] overflow-hidden rounded-[28px] bg-transparent lg:w-full lg:max-w-[871px]">
                <div className="relative aspect-[4/3]">
                  <Image
                    src="/all-in-one-platform.png"
                    alt="TradeStack all-in-one platform overview"
                    fill
                    priority={false}
                    className="object-cover object-center"
                    sizes="(max-width: 1024px) 100vw, 52vw"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
