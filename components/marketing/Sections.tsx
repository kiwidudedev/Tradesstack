"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { akzidenzBlack, bertholdExtraBoldCondensed } from "@/lib/fonts";

const familiarBullets = [
  "Automatically extract drawings for each trade",
  "Remove irrelevant sheets from tender packs",
  "Ensure subcontractors price the correct scope",
  "Generate clean trade packages in seconds",
];

const subscriptionBullets = [
  "Extract structured scope directly from drawings",
  "Identify materials, systems, and build requirements",
  "Surface coordination issues between trades",
  "Detect missing information and scope gaps",
  "Produce tender-ready subcontract scopes",
];

const duplicatedSubscriptionBullets = [
  "Get answers about NZ/AUS construction practices",
  "Understand common materials and building systems",
  "Clarify construction terminology and standards",
  "Learn how different trades and systems interact",
  "Ask questions about construction and building methods",
];

const changeDetectionBullets = [
  "AI compares drawing revisions instantly",
  "Detects added, removed, and modified scope",
  "Highlights revisions across the full drawing set",
  "Produces a clear change report in seconds",
];
const starterPlanFeatures = [
  "Up to 5 active projects",
  "5 trades per project",
  "AI Trade Pack Builder",
  "AI Scope Builder",
  "Change Detection",
  "AI Construction Assistant",
  "Export trade tender packages",
  "Standard AI processing",
];

const professionalPlanFeatures = [
  "Up to 20 active projects",
  "5 trades per project",
  "AI Trade Pack Builder",
  "AI Scope Builder",
  "Change Detection",
  "AI Construction Assistant",
  "Export trade tender packages",
  "Priority AI processing",
];

const enterprisePlanFeatures = [
  "Flexible project limits",
  "Expanded trade capacity",
  "Priority AI processing",
  "Team onboarding support",
  "Dedicated account support",
  "Custom workflow setup",
  "Tailored commercial pricing",
];

export function Sections() {
  const howItWorksRef = useRef<HTMLElement | null>(null);
  const scopeBuilderRef = useRef<HTMLElement | null>(null);
  const changeDetectionRef = useRef<HTMLElement | null>(null);
  const duplicatedScopeBuilderRef = useRef<HTMLElement | null>(null);
  const [showTradePacksDrop, setShowTradePacksDrop] = useState(false);
  const [showSubcontractDrop, setShowSubcontractDrop] = useState(false);
  const [showChangeDetectionDrop, setShowChangeDetectionDrop] = useState(false);
  const [showDuplicatedSubcontractDrop, setShowDuplicatedSubcontractDrop] = useState(false);
  const [isTradePacksVideoOpen, setIsTradePacksVideoOpen] = useState(false);
  const [hoveredPricingCard, setHoveredPricingCard] = useState<"starter" | "professional" | "enterprise" | null>(null);

  useEffect(() => {
    const howItWorksSection = howItWorksRef.current;
    const scopeBuilderSection = scopeBuilderRef.current;
    const changeDetectionSection = changeDetectionRef.current;
    const duplicatedScopeBuilderSection = duplicatedScopeBuilderRef.current;
    if (!howItWorksSection && !scopeBuilderSection && !changeDetectionSection && !duplicatedScopeBuilderSection) {
      return;
    }

    const updateDropState = (
      section: HTMLElement | null,
      isShown: boolean,
      setIsShown: (value: boolean) => void,
    ) => {
      if (!section) {
        return;
      }

      const rect = section.getBoundingClientRect();
      const isBackTowardHero = rect.top > window.innerHeight * 0.85;
      const isPastSection = rect.bottom < 0;
      if (isBackTowardHero || isPastSection) {
        if (isShown) {
          setIsShown(false);
        }
        return;
      }

      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleRatio = visibleHeight / Math.max(rect.height, 1);
      if (visibleRatio >= 0.75 && !isShown) {
        setIsShown(true);
      }
    };

    const onScroll = () => {
      updateDropState(howItWorksSection, showTradePacksDrop, setShowTradePacksDrop);
      updateDropState(scopeBuilderSection, showSubcontractDrop, setShowSubcontractDrop);
      updateDropState(changeDetectionSection, showChangeDetectionDrop, setShowChangeDetectionDrop);
      updateDropState(duplicatedScopeBuilderSection, showDuplicatedSubcontractDrop, setShowDuplicatedSubcontractDrop);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [showTradePacksDrop, showSubcontractDrop, showChangeDetectionDrop, showDuplicatedSubcontractDrop]);

  return (
    <>
      <section id="trade-pack" ref={howItWorksRef} className="bg-transparent py-8 lg:pb-[64px] lg:pt-[54px]">
        <div className="grid w-full gap-10 px-6 lg:grid-cols-[minmax(0,56fr)_minmax(0,44fr)] lg:items-center lg:gap-12 lg:px-16">
          <div className="mt-[40px] max-w-[500px] lg:order-2">
            <h2
              className={`${bertholdExtraBoldCondensed.className} mb-7 text-left text-[42px] font-bold uppercase leading-[0.98] tracking-[-0.02em] text-white sm:text-[50px] md:text-[58px] lg:text-[65px]`}
            >
              <span className="block sm:whitespace-nowrap">Instantly Generate</span>
              <span className="block sm:whitespace-nowrap">
                <span
                  className={`inline-block text-[#F74917] transition-all duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showTradePacksDrop ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                  }`}
                >
                  Trade Packs
                </span>{" "}
                <span className="whitespace-nowrap">From Full</span>
              </span>
              <span className="block sm:whitespace-nowrap">Drawing Sets With AI</span>
            </h2>
            <ul className={`${akzidenzBlack.className} max-w-[44ch] space-y-4 text-[15px] leading-[1.6] text-white/84`}>
              {familiarBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-[18px] leading-none text-[#F74917]">✓</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative w-full max-w-[780px] justify-self-end pt-6 lg:order-1 lg:pt-10">
            <div className="pointer-events-none absolute left-1/2 top-[56%] h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_72%)] blur-[70px]" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <Image
                src="/tradesstacktradepack-original.png"
                alt="TradesStack trade pack builder preview"
                width={1200}
                height={800}
                className="h-full w-full rounded-xl object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsTradePacksVideoOpen(true)}
              className={`${akzidenzBlack.className} mt-4 inline-flex rounded-[10px] bg-[#FF5A1F] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#F04C11]`}
            >
              HOW TRADE PACKS WORK
            </button>
          </div>
        </div>
      </section>

      <section ref={scopeBuilderRef} className="bg-transparent py-8 lg:pb-[64px] lg:pt-[78px]">
        <div className="grid w-full gap-10 px-6 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:items-center lg:gap-12 lg:px-16">
          <div className="max-w-[500px] lg:order-1">
            <h2
              className={`${bertholdExtraBoldCondensed.className} mb-7 text-left text-[42px] font-bold uppercase leading-[0.98] tracking-[-0.02em] text-white sm:text-[50px] lg:text-[65px]`}
            >
              <span className="block sm:whitespace-nowrap">AI THAT GENERATES</span>
              <span
                className={`block sm:whitespace-nowrap text-[#F74917] transition-all duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  showSubcontractDrop ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                }`}
              >
                Subcontract Scopes
              </span>
              <span className="block sm:whitespace-nowrap">From Drawings</span>
            </h2>
            <ul className={`${akzidenzBlack.className} max-w-[44ch] space-y-4 text-[15px] leading-[1.6] text-white/84`}>
              {subscriptionBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-[18px] leading-none text-[#F74917]">✓</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative w-full max-w-[780px] justify-self-end pt-6 lg:order-2 lg:-mt-[80px] lg:pt-10">
            <div className="pointer-events-none absolute left-1/2 top-[56%] h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_72%)] blur-[70px]" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              {/* TODO: Replace with subscription/feature visual */}
              <Image
                src="/tradesstackscopebuilder.png"
                alt="Subscription visual placeholder"
                width={1200}
                height={800}
                className="h-full w-full rounded-xl object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section ref={changeDetectionRef} className="bg-transparent py-8 lg:pb-[64px] lg:pt-[41px]">
        <div className="grid w-full gap-10 px-6 lg:grid-cols-[minmax(0,56fr)_minmax(0,44fr)] lg:items-center lg:gap-12 lg:px-16">
          <div className="mt-[40px] max-w-[500px] lg:order-2">
            <h2
              className={`${bertholdExtraBoldCondensed.className} mb-7 text-left text-[42px] font-bold uppercase leading-[0.98] tracking-[-0.02em] text-white sm:text-[50px] md:text-[58px] lg:text-[65px]`}
            >
              <span className="block sm:whitespace-nowrap">Instantly Detect</span>
              <span className="block sm:whitespace-nowrap">
                <span
                  className={`inline-block text-[#F74917] transition-all duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showChangeDetectionDrop ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                  }`}
                >
                  Drawing Set Changes
                </span>
              </span>
              <span className="block sm:whitespace-nowrap">With AI</span>
            </h2>
            <ul className={`${akzidenzBlack.className} max-w-[44ch] space-y-4 text-[15px] leading-[1.6] text-white/84`}>
              {changeDetectionBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-[18px] leading-none text-[#F74917]">✓</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative w-full max-w-[780px] justify-self-end pt-6 lg:order-1 lg:pt-10">
            <div className="pointer-events-none absolute left-1/2 top-[56%] h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_72%)] blur-[70px]" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <Image
                src="/tradesstackchange.png"
                alt="TradesStack trade pack builder preview"
                width={1200}
                height={800}
                className="h-full w-full rounded-xl object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section ref={duplicatedScopeBuilderRef} className="bg-transparent py-8 lg:pb-[64px] lg:pt-[78px]">
        <div className="grid w-full gap-10 px-6 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:items-center lg:gap-12 lg:px-16">
          <div className="max-w-[500px] lg:order-1">
            <h2
              className={`${bertholdExtraBoldCondensed.className} mb-7 text-left text-[42px] font-bold uppercase leading-[0.98] tracking-[-0.02em] text-white sm:text-[50px] lg:text-[65px]`}
            >
              <span className="block sm:whitespace-nowrap">
                YOUR OWN
              </span>
              <span
                className={`block sm:whitespace-nowrap text-[#F74917] transition-all duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  showDuplicatedSubcontractDrop ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                }`}
              >
                CONSTRUCTION ASSISTANT
              </span>
            </h2>
            <ul className={`${akzidenzBlack.className} max-w-[44ch] space-y-4 text-[15px] leading-[1.6] text-white/84`}>
              {duplicatedSubscriptionBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-[18px] leading-none text-[#F74917]">✓</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative w-full max-w-[780px] justify-self-end pt-6 lg:order-2 lg:-mt-[80px] lg:pt-10">
            <div className="pointer-events-none absolute left-1/2 top-[56%] h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_72%)] blur-[70px]" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <Image
                src="/tradesstackbot.png"
                alt="Subscription visual placeholder"
                width={1200}
                height={800}
                className="h-full w-full rounded-xl object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="choose-plan" className="bg-transparent py-5">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-12">
          <p
            className={`${bertholdExtraBoldCondensed.className} text-center text-[42px] font-black uppercase leading-[0.9] tracking-[-0.04em] text-[#F74917] sm:text-[60px]`}
          >
            CHOOSE YOUR TRADESSTACK PLAN
          </p>
        </div>
      </section>

      <section id="pricing" className="bg-transparent pb-11 pt-2 lg:pb-[52px]">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-12">
          <p className={`${akzidenzBlack.className} pb-8 text-center text-[16px] leading-[1.6] text-white/72`}>
            AI that makes construction drawings easier to review and price.
          </p>
          <div className="mt-2 flex flex-col items-center gap-8 lg:flex-row lg:items-stretch lg:justify-center lg:gap-0 lg:-space-x-[52px]">
            <article
              onMouseEnter={() => setHoveredPricingCard("starter")}
              onMouseLeave={() => setHoveredPricingCard(null)}
              className={`flex h-full min-h-[620px] w-full max-w-[315px] flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(15,40,75,0.85)] px-6 py-7 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-[10px] transition-all duration-300 lg:px-8 lg:py-9 ${
                hoveredPricingCard === "starter"
                  ? "lg:z-[4] lg:-translate-x-[20px] lg:scale-[1.02] lg:shadow-[0_25px_60px_rgba(0,0,0,0.45)]"
                  : hoveredPricingCard === "professional"
                    ? "lg:z-[1] lg:-translate-x-[6px] lg:scale-[0.98] lg:opacity-90"
                    : hoveredPricingCard === "enterprise"
                      ? "lg:z-[1] lg:-translate-x-[24px] lg:scale-[0.97] lg:opacity-85"
                      : "lg:z-[1] lg:translate-x-[30px] lg:scale-[0.98]"
              }`}
            >
              <h3 className={`${bertholdExtraBoldCondensed.className} text-[44px] font-bold uppercase leading-[0.9] tracking-[-0.02em] text-white`}>
                Starter
              </h3>
              <p className={`${bertholdExtraBoldCondensed.className} mt-3 text-[56px] font-bold leading-none tracking-[-0.02em] text-[#F74917]`}>
                <span className="block">$199</span>
                <span className="mt-1 block text-[14px] text-white/70">/month</span>
              </p>
              <ul className={`${akzidenzBlack.className} mt-6 space-y-3 text-[16px] font-medium leading-[1.6] text-white/82`}>
                {starterPlanFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-[14px]">
                    <span className="mt-[2px] text-[14px] leading-none text-[#F74917]">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-white/8 pt-6">
                <Link
                  href="/register"
                  className={`${akzidenzBlack.className} inline-flex w-fit items-center justify-center rounded-[8px] bg-[#FF5A1F] px-[22px] py-[14px] text-base font-semibold text-white transition hover:bg-[#F04C11]`}
                >
                  Start Trial
                </Link>
              </div>
            </article>

            <article
              onMouseEnter={() => setHoveredPricingCard("professional")}
              onMouseLeave={() => setHoveredPricingCard(null)}
              className={`relative flex h-full min-h-[620px] w-full max-w-[345px] flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(15,40,75,0.85)] px-6 py-7 shadow-[0_20px_50px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,90,31,0.25)] backdrop-blur-[10px] transition-all duration-300 lg:px-8 lg:py-9 ${
                hoveredPricingCard === "professional"
                  ? "lg:z-[5] lg:-translate-y-[20px] lg:scale-[1.03] lg:shadow-[0_25px_60px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,90,31,0.25)]"
                  : hoveredPricingCard === "starter"
                    ? "lg:z-[2] lg:-translate-y-[16px] lg:translate-x-[10px] lg:scale-[1.01] lg:opacity-90"
                    : hoveredPricingCard === "enterprise"
                      ? "lg:z-[2] lg:-translate-y-[16px] lg:-translate-x-[10px] lg:scale-[1.01] lg:opacity-90"
                      : "lg:z-[3] lg:-translate-y-[16px] lg:scale-[1.02]"
              }`}
            >
              <h3 className={`${bertholdExtraBoldCondensed.className} text-[44px] font-bold uppercase leading-[0.9] tracking-[-0.02em] text-white`}>
                Professional
              </h3>
              <span className={`${akzidenzBlack.className} mt-1 inline-flex w-fit rounded-[20px] bg-[#FF5A1F]/15 px-[10px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#FF5A1F]`}>
                Most Popular
              </span>
              <p className={`${bertholdExtraBoldCondensed.className} mt-3 text-[56px] font-bold leading-none tracking-[-0.02em] text-[#F74917]`}>
                <span className="block">$499</span>
                <span className="mt-1 block text-[14px] text-white/70">/month</span>
              </p>
              <ul className={`${akzidenzBlack.className} mt-6 space-y-3 text-[16px] font-medium leading-[1.6] text-white/82`}>
                {professionalPlanFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-[14px]">
                    <span className="mt-[2px] text-[14px] leading-none text-[#F74917]">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-white/8 pt-6">
                <Link
                  href="/register"
                  className={`${akzidenzBlack.className} inline-flex w-fit items-center justify-center rounded-[8px] bg-[#FF5A1F] px-[24px] py-[15px] text-base font-semibold text-white transition hover:bg-[#F04C11]`}
                >
                  Get Started
                </Link>
              </div>
            </article>

            <article
              onMouseEnter={() => setHoveredPricingCard("enterprise")}
              onMouseLeave={() => setHoveredPricingCard(null)}
              className={`relative flex h-full min-h-[620px] w-full max-w-[315px] flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(15,40,75,0.85)] px-6 py-7 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-[10px] transition-all duration-300 lg:px-8 lg:py-9 ${
                hoveredPricingCard === "enterprise"
                  ? "lg:z-[4] lg:translate-x-[20px] lg:scale-[1.02] lg:shadow-[0_25px_60px_rgba(0,0,0,0.45)]"
                  : hoveredPricingCard === "professional"
                    ? "lg:z-[1] lg:translate-x-[8px] lg:scale-[0.98] lg:opacity-90"
                    : hoveredPricingCard === "starter"
                      ? "lg:z-[1] lg:translate-x-[24px] lg:scale-[0.97] lg:opacity-85"
                      : "lg:z-[1] lg:-translate-x-[20px] lg:scale-[0.98]"
              }`}
            >
              <h3 className={`${bertholdExtraBoldCondensed.className} text-[44px] font-bold uppercase leading-[0.9] tracking-[-0.02em] text-white`}>
                Enterprise
              </h3>
              <p className={`${bertholdExtraBoldCondensed.className} mt-3 text-[40px] font-bold leading-none tracking-[-0.02em] text-[#F74917]`}>
                <span className="block">Custom Pricing</span>
                <span className="mt-1 block text-[14px] text-white/70">/contact</span>
              </p>
              <ul className={`${akzidenzBlack.className} mt-6 space-y-3 text-[16px] font-medium leading-[1.6] text-white/82`}>
                {enterprisePlanFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-[14px]">
                    <span className="mt-[2px] text-[14px] leading-none text-[#F74917]">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-white/8 pt-6">
                <Link
                  href="/register"
                  className={`${akzidenzBlack.className} inline-flex w-fit items-center justify-center rounded-[8px] bg-[#FF5A1F] px-[22px] py-[14px] text-base font-semibold text-white transition hover:bg-[#F04C11]`}
                >
                  Book a Demo
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {isTradePacksVideoOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-6 py-8">
          <button
            type="button"
            aria-label="Close trade packs video"
            className="absolute inset-0 bg-black/70"
            onClick={() => setIsTradePacksVideoOpen(false)}
          />
          <div className="relative z-10 w-full max-w-[780px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220]">
            <button
              type="button"
              onClick={() => setIsTradePacksVideoOpen(false)}
              className="absolute right-3 top-3 z-20 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-black/80"
            >
              Close
            </button>
            <div className="aspect-[3/2] w-full">
              <iframe
                className="h-full w-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
                title="How Trade Packs Work"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
