"use client";

import { FormEvent, useState } from "react";
import { akzidenzProBoldEx } from "@/lib/fonts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EarlyAccessSection() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setIsSuccess(false);
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/marketing/early-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not join the waitlist right now.");
      }

      setEmail("");
      setIsSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not join the waitlist right now.";
      setIsSuccess(false);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="h-[800px] overflow-hidden bg-[#F5EFE6] bg-[length:180%_auto] bg-no-repeat px-6 pb-28 pt-28 text-[#0B2639] sm:bg-[length:100%_auto] sm:px-8 sm:pb-32 sm:pt-32 lg:px-24 lg:pb-40 lg:pt-40"
      style={{
        backgroundImage: "url('/early access sign up background.png')",
        backgroundPosition: "right bottom",
      }}
    >
      <div className="mx-auto w-full max-w-[1380px] px-6 py-4 sm:px-8 sm:py-6 lg:px-12 lg:py-8">
        <div className="mx-auto -mt-24 max-w-[860px] text-center lg:-mt-40">
          <h2
            className={`${akzidenzProBoldEx.className} mx-auto mt-5 max-w-[12ch] text-[2rem] leading-[1.06] tracking-[-0.04em] text-[#0B2639] sm:text-[2.9rem] lg:text-[3.55rem]`}
          >
            Get early access to TradeStack
          </h2>
          <p
            className="mx-auto mt-5 max-w-[720px] text-[1rem] leading-[1.36] text-[#0B2639] sm:text-[1.0625rem]"
            style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
          >
            We&apos;re opening access soon. Join the waitlist to be first in. No payment needed and no commitment.
          </p>

          <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-[680px] flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="Your email address"
              className="min-h-[56px] w-full rounded-full border border-white/60 bg-white/55 px-6 text-[0.98rem] text-[#0B2639] placeholder:text-[#0B2639]/48 outline-none transition focus:border-[#0B2639]/22"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[56px] whitespace-nowrap items-center justify-center rounded-full bg-[#F74918] px-8 text-[0.98rem] font-bold text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
            >
              {isSubmitting ? "Submitting..." : "Join waitlist"}
            </button>
          </form>
          {isSuccess ? (
            <p
              role="status"
              className="mx-auto mt-4 max-w-[680px] text-[0.95rem] text-[#0B2639]"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            >
              Thanks, you&apos;re on the waitlist.
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              className="mx-auto mt-4 max-w-[680px] text-[0.95rem] text-[#9B1C1C]"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col items-center gap-3">
            <p
              className="text-[0.95rem] text-[#0B2639]"
              style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
            >
              Join a growing number of tradies on the waitlist
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
