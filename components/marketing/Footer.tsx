 "use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#trade-pack" },
      { label: "Features", href: "/#platform-features" },
      { label: "Pricing", href: "/#choose-plan" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Contact us", href: "/contact-us" },
    ],
  },
  {
    title: "Follow us",
    links: [
      { label: "Instagram", href: "https://www.instagram.com/tradesstack/" },
      { label: "LinkedIn", href: "#" },
      { label: "Facebook", href: "https://www.facebook.com/tradesstack" },
    ],
  },
] as const;

const bottomLinks = [
  { label: "Privacy Policy" },
  { label: "Terms and Conditions" },
] as const;

export function Footer() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubscribe(event: FormEvent<HTMLFormElement>) {
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
        throw new Error(payload?.error || "Could not subscribe right now.");
      }

      setEmail("");
      setIsSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not subscribe right now.";
      setIsSuccess(false);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <footer className="overflow-hidden bg-[#0B2639] px-4 pb-8 pt-16 text-white sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
      <div className="mx-auto w-full max-w-[1380px]">
        <div className="grid gap-12 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-28">
          <div>
            <Link
              href="/"
              className={`${akzidenzProBoldEx.className} inline-block text-[2.2rem] leading-none tracking-[-0.05em] text-white sm:text-[2.8rem]`}
            >
              TradesStack
            </Link>

            <div className="mt-12 max-w-[512px]">
              <p
                className="text-[1.235rem] text-white"
                style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
              >
                Subscribe to our newsletter
              </p>
              <form onSubmit={handleSubscribe} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="Enter your email"
                  className="min-h-[50px] w-full rounded-full border border-[#AACFDF]/18 bg-white/8 px-5 text-[0.95rem] text-white placeholder:text-white/58 outline-none transition focus:border-[#AACFDF] sm:min-w-[330px]"
                  style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-[#F74918] px-6 text-[0.95rem] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                >
                  {isSubmitting ? "Submitting..." : "Subscribe"}
                </button>
              </form>
              {isSuccess ? (
                <p
                  role="status"
                  className="mt-3 text-[0.9rem] text-white"
                  style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                >
                  Thanks, you&apos;re on the waitlist.
                </p>
              ) : null}
              {errorMessage ? (
                <p
                  role="alert"
                  className="mt-3 text-[0.9rem] text-[#FECACA]"
                  style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                >
                  {errorMessage}
                </p>
              ) : null}
              <p
                className="mt-3 text-[0.82rem] leading-[1.35] text-white/72"
                style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
              >
                By subscribing you agree to our <span className="text-white underline underline-offset-2">Privacy Policy</span> and{" "}
                <span className="text-white underline underline-offset-2">Terms and Conditions</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-2 lg:ml-36 lg:grid-cols-3 lg:gap-x-2 lg:gap-y-10">
            {footerColumns.map((column) => (
              <div
                key={column.title}
                className={
                  column.title === "Product"
                    ? "hidden lg:block lg:pr-2"
                    : column.title === "Follow us"
                      ? "col-span-2 lg:col-span-1 lg:pr-2"
                      : "lg:pr-2"
                }
              >
                {column.title === "Product" ? null : (
                  <>
                <h3
                  className="text-[1rem] font-bold text-[#AACFDF]"
                  style={{ fontFamily: '"Akzidenz-Grotesk Bold", Helvetica, Arial, sans-serif' }}
                >
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        target={column.title === "Follow us" ? "_blank" : undefined}
                        rel={column.title === "Follow us" ? "noreferrer" : undefined}
                        className="text-[0.98rem] leading-[1.3] text-white transition hover:text-white"
                        style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-white/12 pt-8 text-white/75">
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-28">
            <div />
            <div className="grid gap-4 lg:ml-28 lg:grid-cols-[1.8fr_1fr_1fr] lg:gap-x-4">
              <p
                className="whitespace-nowrap text-[0.95rem] leading-[1.35]"
                style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
              >
                © 2026 TradeStack. All rights reserved.
              </p>

              {bottomLinks.map((link) => (
                <span
                  key={link.label}
                  className="whitespace-nowrap text-[0.95rem] leading-[1.35] text-white"
                  style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif' }}
                >
                  {link.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <p
            className={`${akzidenzProBoldEx.className} text-[3rem] leading-[0.88] tracking-[-0.06em] text-[#AACFDF] sm:text-[5.6rem] lg:text-[9rem]`}
          >
            No jobs missed.
          </p>
        </div>
      </div>
    </footer>
  );
}
