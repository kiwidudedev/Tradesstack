"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeftCircle } from "lucide-react";
import { akzidenz, akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EarlyAccessShowcasePanelProps {
  closeHref?: string;
}

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const benefitLines = [
  "Get access before launch.",
  "Help shape the roadmap.",
  "Be first to onboard your team.",
];

export function EarlyAccessShowcasePanel({ closeHref }: EarlyAccessShowcasePanelProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/marketing/early-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not join the waitlist right now.");
      }

      setInfo("Thanks, you're on the early access list.");
      setEmail("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not join the waitlist right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1260px]">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[1.2rem] border border-[#0B2639]/8 bg-white px-6 py-6 sm:px-9 sm:py-8 lg:h-[560px] lg:px-10 lg:py-8">
          <div className="mx-auto flex h-full max-w-[560px] flex-col">
            {closeHref ? (
              <Link
                href={closeHref}
                className="inline-flex items-center gap-2 text-[15px] font-semibold text-[#24122C] underline underline-offset-2 transition hover:text-[#F74917]"
                style={graphikStyle}
              >
                <ArrowLeftCircle className="h-4 w-4" />
                Back to the website
              </Link>
            ) : null}

            <div className="mt-5 space-y-3">
              <h1
                className={`${akzidenz.className} max-w-[15ch] text-[2.65rem] font-bold leading-[0.924] tracking-[-0.07em] text-[#0B2639] sm:max-w-none sm:text-[3.25rem]`}
              >
                <span className="block whitespace-nowrap">Get early access</span>
                <span className="block whitespace-nowrap">to TradeStack</span>
              </h1>
            </div>

            <form className="mt-6 flex flex-1 flex-col space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label htmlFor="early-access-email" className="text-sm font-semibold text-[#5A5061]" style={graphikStyle}>
                  Email address
                </label>
                <Input
                  id="early-access-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="h-[58px] rounded-[0.55rem] border-[#cfd3dd] bg-[#EEF3FF] px-4 text-[0.98rem] font-semibold text-[#1F2430] placeholder:text-[#6b7d8c] focus-visible:ring-[#F74917]/20"
                  style={graphikStyle}
                  required
                />
              </div>

              {error ? (
                <p className="text-sm text-red-600" style={graphikStyle}>
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className="text-sm text-emerald-700" style={graphikStyle}>
                  {info}
                </p>
              ) : null}

              <p className="text-[13px] leading-5 text-[#495d6f]" style={graphikStyle}>
                By submitting this form I confirm I have read and accepted TradeStack&apos;s{" "}
                <Link href="/privacy-policy" className="font-semibold text-[#0B2639] underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </p>

              <Button
                type="submit"
                className="mt-auto h-[58px] w-full rounded-[0.55rem] bg-[#F74917] px-6 text-[0.98rem] font-semibold text-white hover:bg-[#E84B1D]"
                style={graphikStyle}
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? "Joining waitlist..." : "Join waitlist"}</span>
              </Button>

              <p className="text-[13px] text-[#0B2639]" style={graphikStyle}>
                Ready to create an account instead?{" "}
                <Link href="/register" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                  Sign up
                </Link>
              </p>
            </form>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[1.2rem] bg-[#0B2639] px-8 py-8 text-[#0B2639] sm:px-10 sm:py-10 lg:h-[560px] lg:px-11 lg:py-11">
          <div className="absolute inset-0 bg-[#AACFDF]" />
          <Image
            src="/Tradesstack Logo Blue.png"
            alt="TradeStack"
            width={170}
            height={40}
            className="absolute bottom-7 right-7 h-12 w-auto object-contain sm:bottom-8 sm:right-8"
            priority
          />
          <div className="relative flex h-full min-h-[640px] flex-col justify-between">
            <div>
              <div className="mt-5 max-w-none space-y-5 lg:-ml-5 lg:pr-8">
                <h2
                  className={`${akzidenzProBoldEx.className} max-w-[16ch] text-[2rem] leading-[0.98] tracking-[-0.04em] text-[#0B2639] sm:max-w-[16ch] sm:text-[2.7rem]`}
                >
                  Join the first wave using TradeStack before public launch.
                </h2>
                <p className="max-w-[33rem] text-[1.02rem] leading-[1.5] text-[#0B2639] sm:pr-8 sm:text-[1.0625rem] lg:pr-14" style={graphikStyle}>
                  Get priority access and be among the first teams running projects with smarter workflows from tender
                  to delivery.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="grid gap-3 sm:grid-cols-3">
                {benefitLines.map((benefit) => (
                  <div key={benefit} className="rounded-[1.4rem] border border-[#AACFDF]/35 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-sm font-semibold leading-6 text-[#0B2639]" style={graphikStyle}>
                      {benefit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
