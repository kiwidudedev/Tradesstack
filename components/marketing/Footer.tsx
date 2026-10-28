"use client";

import Link from "next/link";
import { akzidenzProBoldEx } from "@/lib/fonts";

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms and Conditions", href: "/terms-of-service" },
] as const;

/**
 * Minimal legal footer for the customer application. Marketing links, the
 * newsletter/early-access form and public growth calls to action are not part
 * of a dedicated customer workspace.
 */
export function Footer() {
  return (
    <footer className="overflow-hidden bg-[#0B2639] px-4 pb-8 pt-16 text-white sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
      <div className="mx-auto w-full max-w-[1380px]">
        <Link
          href="/"
          className={`${akzidenzProBoldEx.className} inline-block text-[2.2rem] leading-none tracking-[-0.05em] text-white sm:text-[2.8rem]`}
        >
          TradesStack
        </Link>

        <div className="mt-10 border-t border-white/12 pt-8">
          <div className="flex flex-col gap-4 text-[0.95rem] leading-[1.35] text-white/75 sm:flex-row sm:items-center sm:justify-between">
            <p style={graphikStyle}>© 2026 TradesStack. All rights reserved.</p>
            <div className="flex flex-wrap gap-6">
              {legalLinks.map((link) => (
                <Link key={link.label} href={link.href} className="text-white transition hover:opacity-80" style={graphikStyle}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
