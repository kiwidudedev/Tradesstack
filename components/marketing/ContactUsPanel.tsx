"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftCircle } from "lucide-react";
import { akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ContactUsPanelProps {
  closeHref?: string;
}

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const fieldLabelStyle = {
  ...graphikStyle,
  fontFamily: '"Graphik Semibold", "Graphik Regular", Inter, system-ui, sans-serif',
};

export function ContactUsPanel({ closeHref = "/" }: ContactUsPanelProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const emailValue = email.trim();
    if (!firstName.trim() || !emailValue || !message.trim()) {
      setError("Please complete first name, email address, and your message.");
      return;
    }

    const subject = encodeURIComponent(`TradeStack contact from ${firstName.trim()} ${lastName.trim()}`.trim());
    const body = encodeURIComponent(
      [
        `First name: ${firstName.trim()}`,
        `Last name: ${lastName.trim() || "-"}`,
        `Email address: ${emailValue}`,
        `Phone number: ${phone.trim() || "-"}`,
        `Country: ${country.trim() || "-"}`,
        "",
        "Message:",
        message.trim(),
      ].join("\n"),
    );

    window.location.href = `mailto:hi@tradesstack.com?subject=${subject}&body=${body}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(320px,1fr)_minmax(620px,640px)] lg:gap-16">
        <section className="px-2 lg:px-6">
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

          <div className="mt-10 max-w-[520px]">
            <h1
              className={`${akzidenzProBoldEx.className} text-[3.25rem] leading-[0.9] tracking-[-0.06em] text-[#16061D] sm:text-[4.6rem]`}
            >
              Get in touch
            </h1>
            <p className="mt-8 max-w-[34rem] text-[1.25rem] leading-[1.45] text-[#24122C]" style={graphikStyle}>
              Need more information? We&apos;d love to hear from you. Share your contact details and any questions
              below. We&apos;ll get back to you very soon.
            </p>

            <div className="mt-10 space-y-3">
              <p className="text-[1.05rem] font-semibold text-[#16061D]" style={graphikStyle}>
                Our contact details to get in touch
              </p>
              <p className="text-[1rem] leading-[1.45] text-[#24122C]" style={graphikStyle}>
                Email - hi@tradesstack.com
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[1.2rem] border border-[#0B2639]/8 bg-white px-6 py-6 shadow-[0_18px_40px_rgba(11,38,57,0.08)] sm:px-9 sm:py-8">
          <form className="flex flex-col space-y-5" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative pt-3">
                <label
                  htmlFor="contact-first-name"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  First name
                </label>
                <Input
                  id="contact-first-name"
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
                  htmlFor="contact-last-name"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Last name
                </label>
                <Input
                  id="contact-last-name"
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
                htmlFor="contact-email"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                Email address
              </label>
              <Input
                id="contact-email"
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
                htmlFor="contact-phone"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                Phone number
              </label>
              <Input
                id="contact-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                style={graphikStyle}
              />
            </div>

            <div className="relative pt-3">
              <label
                htmlFor="contact-country"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                Country
              </label>
              <Input
                id="contact-country"
                type="text"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                style={graphikStyle}
              />
            </div>

            <div className="relative pt-3">
              <label
                htmlFor="contact-message"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                Your message
              </label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[108px] w-full rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 py-4 text-[1rem] font-semibold text-[#1F2430] outline-none transition focus-visible:ring-2 focus-visible:ring-[#F74917]/20"
                style={graphikStyle}
                required
              />
            </div>

            {error ? (
              <p className="text-sm text-red-600" style={graphikStyle}>
                {error}
              </p>
            ) : null}

            <p className="text-[13px] text-[#0B2639]" style={graphikStyle}>
              By submitting this form I confirm I have read and accepted TradeStack&apos;s{" "}
              <Link href="/privacy-policy" className="font-semibold underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>

            <div>
              <Button
                type="submit"
                className="h-[50px] rounded-[0.55rem] bg-[#16061D] px-6 text-[1rem] font-semibold text-white hover:bg-[#24122C]"
                style={graphikStyle}
              >
                Submit
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
