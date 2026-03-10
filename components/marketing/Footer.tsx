import Image from "next/image";
import Link from "next/link";
import { akzidenzBlack, bertholdExtraBoldCondensed } from "@/lib/fonts";

const exploreLinks = ["Product", "How it works", "Pricing", "Support"];
const legalLinks = ["Privacy Policy", "Terms & Conditions", "Contact"];
const socialItems = [
  { label: "Facebook", href: "#", id: "facebook" },
  { label: "Instagram", href: "#", id: "instagram" },
  { label: "LinkedIn", href: "#", id: "linkedin" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[#04234D] px-6 py-16 text-white lg:px-12">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Image src="/tradesstacklogowhite.png" alt="TradesStack" width={1200} height={400} className="h-24 w-auto" />
          <p className={`${akzidenzBlack.className} mt-6 text-lg text-white/80`}>Email: hi@tradesstack.com</p>
          <div className={`${akzidenzBlack.className} mt-6 flex gap-3 text-sm`}>
            {socialItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                aria-label={item.label}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 bg-white/5 text-white/85 transition hover:border-[#F74917]/60 hover:bg-[#F74917]/12 hover:text-[#F74917]"
              >
                {item.id === "facebook" && (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                    <path d="M13.5 8.5V6.8c0-.8.5-1 1-1h1.4V3h-2.2C10.7 3 10 5 10 6.4v2.1H8v3h2V21h3.5v-9.5H16l.4-3h-2.9z" />
                  </svg>
                )}
                {item.id === "instagram" && (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                    <path d="M7.8 3h8.4A4.8 4.8 0 0 1 21 7.8v8.4a4.8 4.8 0 0 1-4.8 4.8H7.8A4.8 4.8 0 0 1 3 16.2V7.8A4.8 4.8 0 0 1 7.8 3zm0 1.8A3 3 0 0 0 4.8 7.8v8.4a3 3 0 0 0 3 3h8.4a3 3 0 0 0 3-3V7.8a3 3 0 0 0-3-3H7.8zm9 .9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zM12 7.2A4.8 4.8 0 1 1 7.2 12 4.8 4.8 0 0 1 12 7.2zm0 1.8a3 3 0 1 0 3 3 3 3 0 0 0-3-3z" />
                  </svg>
                )}
                {item.id === "linkedin" && (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                    <path d="M5.2 8.5h3.3V21H5.2V8.5zM6.8 3a1.9 1.9 0 1 1-1.9 1.9A1.9 1.9 0 0 1 6.8 3zM10.4 8.5h3.1v1.7h.1a3.4 3.4 0 0 1 3.1-1.9c3.3 0 3.9 2.2 3.9 5V21h-3.3v-6.8c0-1.6 0-3.7-2.3-3.7s-2.6 1.8-2.6 3.6V21h-3.3V8.5z" />
                  </svg>
                )}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <p className={`${bertholdExtraBoldCondensed.className} mb-4 text-2xl font-semibold uppercase italic`}>Explore</p>
            <ul className={`${akzidenzBlack.className} space-y-2 text-lg text-white/80`}>
              {exploreLinks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className={`${bertholdExtraBoldCondensed.className} mb-4 text-2xl font-semibold uppercase italic`}>Legal</p>
            <ul className={`${akzidenzBlack.className} space-y-2 text-lg text-white/80`}>
              {legalLinks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <Link
              href="/register"
              className={`${akzidenzBlack.className} hidden rounded-[10px] bg-white/8 px-[18px] py-[10px] text-base font-medium text-white transition hover:bg-white/12 lg:inline-flex`}
            >
              Login
            </Link>
            <Link
              href="/register"
              className={`${akzidenzBlack.className} rounded-[10px] bg-[#F74917] px-[18px] py-[10px] text-base font-semibold text-white transition hover:bg-[#E84212]`}
            >
              Start your first project
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
