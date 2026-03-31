"use client";

import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

const stats = [
  {
    label: "Admin Time",
    number: "15-20 hours",
    text: "saved per week on admin and job coordination",
    dot: "bg-[#F74918]",
    labelColor: "text-[#0B2639]",
    numberColor: "text-[#F74918]",
    mobileLarge: true,
  },
  {
    label: "Tender Speed",
    number: "Up to 10x",
    text: "faster trade pack and scope creation",
    dot: "bg-[#AACFDF]",
    labelColor: "text-[#0B2639]",
    numberColor: "text-[#F74918]",
    mobileLarge: true,
  },
  {
    label: "Scope Accuracy",
    number: "50% fewer",
    text: "reduction in missed scope items and gaps",
    dot: "bg-[#F74918]",
    labelColor: "text-[#0B2639]",
    numberColor: "text-[#F74918]",
    mobileLarge: true,
  },
  {
    label: "Tools Replaced",
    number: "4-6 platforms",
    text: "replaced by one connected platform",
    dot: "bg-[#AACFDF]",
    labelColor: "text-[#0B2639]",
    numberColor: "text-[#F74918]",
    mobileLarge: true,
  },
];

export function StatsResultsSection() {
  return (
    <section className="bg-[#F5EFE6] px-6 pb-16 pt-8 text-[#0B2639] sm:px-8 sm:pb-20 sm:pt-12 lg:px-24 lg:pb-24 lg:pt-16">
      <div className="mx-auto w-full max-w-[1380px]">
        <div className="mx-auto max-w-[900px] text-center">
          <h2
            className={`${akzidenzProBoldEx.className} text-[2rem] leading-[1.02] tracking-[-0.04em] text-[#0B2639] sm:text-[2.9rem] lg:text-[3.7rem]`}
          >
            Where the time and money actually goes
          </h2>
          <p
            className="mx-auto mt-5 max-w-[620px] text-[1rem] leading-[1.36] text-black sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            Less admin. Fewer mistakes. Better margins.
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2 md:gap-0 xl:grid-cols-4">
          {stats.map((stat, index) => (
            <article
              key={stat.label}
              className={`px-2 md:px-8 xl:px-10 ${
                index !== 0 ? "md:border-l md:border-[#0B2639]/18" : ""
              }`}
            >
              <div className="mx-auto grid max-w-[250px] grid-rows-[auto_auto_auto] items-start justify-items-center gap-y-5 text-center">
                <p
                  className={`${akzidenzProBoldEx.className} ${stat.mobileLarge ? "text-[3.01rem]" : "text-[2.145rem]"} leading-[0.88] tracking-[-0.05em] ${stat.numberColor ?? "text-[#0B2639]"} sm:text-[2.6rem] lg:text-[2.86rem]`}
                >
                  <span className={`mb-4 block ${stat.mobileLarge ? "text-[1.26rem]" : "text-[0.9rem]"} leading-none tracking-[-0.02em] ${stat.labelColor} sm:mb-5 sm:text-[1rem]`}>
                    {stat.label}
                  </span>
                  {stat.number}
                </p>

                <p
                  className="max-w-[20ch] text-[1rem] leading-[1.28] text-[#0B2639]"
                  style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                >
                  {stat.text}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <Link
            href="/early-access"
            className="inline-flex min-h-[52px] items-center justify-center rounded-[8px] bg-[#F74918] px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
          >
            Get Early Access
          </Link>
          <p
            className="max-w-[260px] text-[14.4px] leading-[1.4] text-[#0B2639]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            No payment needed. Just sign up and we&apos;ll show you what we&apos;re building.
          </p>
        </div>
      </div>
    </section>
  );
}
