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

const fieldLabelStyle = {
  ...graphikStyle,
  fontFamily: '"Graphik Semibold", "Graphik Regular", Inter, system-ui, sans-serif',
};

const benefitLines = [
  "Get access before launch.",
  "Help shape the roadmap.",
  "Be first to onboard your team.",
];

export function EarlyAccessShowcasePanel({ closeHref }: EarlyAccessShowcasePanelProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [business, setBusiness] = useState("");
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
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          business: business.trim(),
          email: email.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not join the waitlist right now.");
      }

      setInfo("Thanks, you're on the early access list.");
      setFirstName("");
      setLastName("");
      setBusiness("");
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
        <section className="rounded-[1.2rem] border border-[#0B2639]/8 bg-white px-6 py-6 sm:px-9 sm:py-8 lg:min-h-[532px] lg:px-10 lg:py-8">
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

            <div className="mt-9 space-y-3">
              <h1
                className={`${akzidenz.className} max-w-[15ch] text-[2.2rem] font-bold leading-[0.924] tracking-[-0.07em] text-[#0B2639] sm:max-w-none sm:text-[3.25rem]`}
              >
                <span className={`${akzidenzProBoldEx.className} block font-black tracking-[-0.036em] sm:whitespace-nowrap`}>Get early access</span>
                <span className={`${akzidenzProBoldEx.className} block font-black tracking-[-0.036em] sm:whitespace-nowrap`}>to TradeStack</span>
              </h1>
              <p className="max-w-[30rem] text-[1.02rem] leading-[1.5] text-[#495d6f]" style={graphikStyle}>
                This isn&apos;t a commitment and we&apos;re not taking your money, just giving you early access.
              </p>
            </div>

            <form className="mt-10 flex flex-col space-y-5" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative pt-3">
                  <label
                    htmlFor="early-access-first-name"
                    className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                    style={fieldLabelStyle}
                  >
                    First Name*
                  </label>
                  <Input
                    id="early-access-first-name"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                    style={graphikStyle}
                    required
                  />
                </div>

                <div className="relative pt-3">
                  <label
                    htmlFor="early-access-last-name"
                    className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                    style={fieldLabelStyle}
                  >
                    Last Name
                  </label>
                  <Input
                    id="early-access-last-name"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                    style={graphikStyle}
                  />
                </div>
              </div>

              <div className="relative pt-3">
                <label
                  htmlFor="early-access-email"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Work email*
                </label>
                <Input
                  id="early-access-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                  style={graphikStyle}
                  required
                />
              </div>

              <div className="relative pt-3">
                <label
                  htmlFor="early-access-business"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Business*
                </label>
                <Input
                  id="early-access-business"
                  type="text"
                  value={business}
                  onChange={(event) => setBusiness(event.target.value)}
                  className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
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

              <Button
                type="submit"
                className="h-[58px] w-full rounded-[0.55rem] bg-[#F74917] px-6 text-[0.98rem] font-semibold text-white hover:bg-[#E84B1D]"
                style={graphikStyle}
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? "Getting early access..." : "Get Early Access"}</span>
              </Button>

              <p className="text-[13px] text-[#0B2639]" style={graphikStyle}>
                By submitting this form I confirm I have read and accepted TradesStacks Privacy Policy.
              </p>
            </form>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[1.2rem] bg-[#0B2639] px-8 py-8 text-white sm:px-10 sm:py-10 lg:min-h-[532px] lg:px-11 lg:py-11">
          <div className="absolute inset-0 bg-[#0B2639]" />
          <div className="relative flex h-full min-h-[532px] flex-col justify-between gap-10">
            <div>
              <div className="-mt-7 max-w-none space-y-3 lg:-ml-5 lg:pr-8">
                <Image
                  src="/tradesstacklogowhite.png"
                  alt="TradeStack"
                  width={368}
                  height={88}
                  className="h-[88px] w-auto object-contain"
                  priority
                />
                <span className={`${akzidenzProBoldEx.className} block max-w-[16ch] text-[2.52rem] leading-[0.98] tracking-[-0.036em] text-white`}>
                  A quick FREE sign-up could change your trade business forever.
                </span>
                <p className="mt-6 max-w-[33rem] text-[1.02rem] leading-[1.5] text-white sm:pr-8 sm:text-[1.0625rem] lg:pr-14" style={graphikStyle}>
                  No payment needed. Just sign up and we&apos;ll show you what we&apos;re building.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-8">
              <div className="grid gap-3 sm:grid-cols-3">
                {benefitLines.map((benefit) => (
                  <div key={benefit} className="rounded-[0.55rem] border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-sm font-semibold leading-6 text-white" style={graphikStyle}>
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
