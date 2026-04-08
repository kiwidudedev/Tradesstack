"use client";

import Image from "next/image";
import { akzidenzProBoldEx } from "@/lib/fonts";

const features = [
  {
    label: "All-in-one Platform",
    title: "Run the full job in one connected system",
    description:
      "From quoting and pricing through to invoicing and variations, TradeStack brings everything into one place — so you can run jobs properly without jumping between systems.",
    bullets: [
      "Quotes and job pricing",
      "Variations and change tracking",
      "Invoicing and payment tracking",
      "Project scheduling and job tracking",
      "Client and job management",
      "Document and file management",
      "All-in-one platform — no extra subscriptions",
    ],
    visual: (
      <div className="relative aspect-[1.06/1] overflow-hidden rounded-[24px] bg-[#AACFDF]">
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="TradeStack all-in-one platform preview"
        >
          <source src="/Tradesstack-quote-feature.mp4" type="video/mp4" />
        </video>
      </div>
    ),
  },
  {
    label: "Trade Pack Builder",
    title: "Instantly generate trade packs from full drawing sets",
    description:
      "Upload a full set of drawings and automatically generate trade-specific packs — removing unnecessary pages and organising everything clearly.",
    bullets: [
      "Turn full drawing sets into trade packs instantly",
      "Remove irrelevant sheets and duplicate information",
      "Ensure subcontractors price the correct scope",
      "Deliver clean, organised packs in minutes",
      "Reduce back-and-forth during tendering",
    ],
    visual: (
      <div className="relative aspect-[1.06/1] overflow-hidden rounded-[24px] bg-[#AACFDF]">
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="TradeStack trade pack builder preview"
        >
          <source src="/Tradesstack-tradepack-feature.mp4" type="video/mp4" />
        </video>
      </div>
    ),
  },
  {
    label: "Scope Builder",
    title: "Generate subcontract scopes directly from drawings",
    description:
      "Extract structured scope directly from drawings and generate clear, tender-ready subcontract scopes — without building everything manually.",
    bullets: [
      "Turn drawings into structured subcontract scopes",
      "Identify materials, systems, and requirements instantly",
      "Catch missing information before it becomes a problem",
      "Reduce coordination issues between trades",
      "Deliver clear, tender-ready scopes faster",
    ],
    visual: (
      <div className="relative aspect-[1.06/1] overflow-hidden rounded-[24px] bg-[#AACFDF]">
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="TradeStack scope builder preview"
        >
          <source src="/Tradesstack-scope-feature.mp4" type="video/mp4" />
        </video>
      </div>
    ),
  },
  {
    label: "Change Detection",
    title: "Catch drawing changes before they become problems",
    description:
      "Quickly compare drawing revisions and spot changes early — helping your team avoid rework, missed costs, and scope issues before they hit site.",
    bullets: [
      "Compare drawing revisions instantly",
      "Detect added, removed, and modified scope",
      "Highlight changes across the full drawing set",
      "Catch issues before they impact the job",
      "Generate clear change summaries in seconds",
    ],
    visual: (
      <div className="flex aspect-[1.06/1] items-center rounded-[24px] bg-[#F5EFE6] p-5 sm:p-6">
        <div className="w-full rounded-[18px] border border-[#0B2639]/10 bg-white p-4 shadow-[0_12px_28px_rgba(11,38,57,0.08)]">
          <div className="flex items-center justify-between border-b border-[#0B2639]/10 pb-3">
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0B2639]/50"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                Revision compare
              </p>
              <p
                className="mt-2 text-[1.2rem] font-bold text-[#0B2639]"
                style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
              >
                14 changes picked up
              </p>
            </div>
            <span
              className="rounded-full bg-[#F74918] px-3 py-1 text-[11px] font-bold text-white"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              New rev
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              "Structural grid moved on Level 2",
              "Mechanical riser note updated",
              "Door schedule now includes six changes",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-[14px] bg-[#F5EFE6] px-3 py-3">
                <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#F74918]" aria-hidden="true" />
                <p
                  className="text-[13px] leading-[1.18] text-[#0B2639]"
                  style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                >
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    label: "AI Assistant",
    title: "Ask questions on the job & get answers instantly",
    description:
      "From site details to methods and edge cases, get clear answers when you're unsure — without digging through documents or second guessing.",
    bullets: [
      "Get help with real on-site situations",
      "Understand what to do, not just what it means",
      "Quick answers across all trades",
      "Reduce delays caused by uncertainty",
      "Make confident calls, faster",
    ],
    visual: (
      <div className="relative aspect-[1.06/1] overflow-hidden rounded-[24px] bg-[#AACFDF]">
        <div className="relative h-full w-full">
          <video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          >
            <source src="/Tradesstack-assistant-feature.mp4" type="video/mp4" />
          </video>
        </div>
      </div>
    ),
  },
  {
    label: "NZ/AU Knowledge",
    title: "Built for NZ & AU construction",
    description:
      "Get clear answers based on NZ and AU construction practices, materials, and standards — without second-guessing decisions or relying on generic information.",
    bullets: [
      "Get answers aligned with NZ/AU construction standards",
      "Understand materials, systems, and specifications",
      "Clarify terminology across different trades",
      "Learn how systems and trades interact on real jobs",
      "Ask practical questions about methods and compliance",
    ],
    visual: (
      <div className="relative aspect-[1.06/1] overflow-hidden rounded-[24px] bg-[#AACFDF]">
        <div className="relative h-full w-full">
          <video
            className="h-full w-full object-cover"
            src="/Tradesstack-newzealand-feature.mov"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        </div>
      </div>
    ),
  },
];

export function FeatureShowcaseSection() {
  return (
    <section id="platform-features" className="bg-[#F5EFE6] px-6 pb-16 pt-8 text-[#0B2639] sm:px-8 sm:pb-20 sm:pt-10 lg:px-24 lg:pb-24 lg:pt-12">
      <div className="mx-auto w-full max-w-[1380px]">
        <div className="mx-auto max-w-[940px] text-center">
          <h2
            className={`${akzidenzProBoldEx.className} mt-5 text-[2rem] leading-[1.02] tracking-[-0.04em] text-[#0B2639] sm:text-[2.9rem] lg:text-[3.7rem]`}
          >
            Platform Features
          </h2>
          <p
            className="mx-auto mt-5 max-w-[780px] pb-[16px] text-[1rem] leading-[1.36] text-[#0B2639] sm:pb-[21px] sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            TradeStack combines practical AI tools with connected job workflows — helping your team quote faster,
            build clearer scopes, stay on top of project changes, and keep everything moving in one place.
          </p>
        </div>

        <div className="mt-10 space-y-6 lg:space-y-8">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[30px] border border-transparent bg-white p-6 shadow-none sm:border-[#0B2639]/10 sm:p-8 sm:shadow-[0_18px_40px_rgba(11,38,57,0.06)] lg:p-10"
            >
              <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-12">
                <div className="max-w-[500px]">
                  <div
                    className="inline-flex rounded-full bg-[#F5EFE6] px-4 py-2 text-[12px] font-bold text-[#0B2639]"
                    style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                  >
                    {feature.label}
                  </div>
                  <h3
                    className={`${akzidenzProBoldEx.className} mt-5 max-w-[16ch] text-[2rem] leading-[0.98] tracking-[-0.04em] text-[#0B2639] sm:text-[2.7rem]`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="mt-5 max-w-[34rem] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
                    style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                  >
                    {feature.description}
                  </p>
                  {"bullets" in feature ? (
                    <ul className="mt-5 space-y-2.5">
                      {feature.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <span className="mt-[3px] inline-flex text-[0.95rem] leading-none text-[#F74918]" aria-hidden="true">
                            ✔️
                          </span>
                          <p
                            className="max-w-[29ch] text-[1rem] leading-[1.3] text-[#0B2639] sm:max-w-none sm:text-[15px] sm:leading-[0.96]"
                            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                          >
                            {bullet}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="mx-auto w-full max-w-[620px]">{feature.visual}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
