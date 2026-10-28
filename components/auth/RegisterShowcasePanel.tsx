"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { akzidenz, akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerWithInvite } from "@/app/register/actions";

interface RegisterShowcasePanelProps {
  inviteToken: string;
}

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const fieldLabelStyle = {
  ...graphikStyle,
  fontFamily: '"Graphik Semibold", "Graphik Regular", Inter, system-ui, sans-serif',
};

export function RegisterShowcasePanel({ inviteToken }: RegisterShowcasePanelProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await registerWithInvite({
        inviteToken,
        fullName: name,
        email,
        password,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(result.redirectPath ?? "/login");
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to create your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1260px]">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[1.2rem] border border-[#0B2639]/8 bg-white px-6 py-6 sm:px-9 sm:py-8 lg:min-h-[560px] lg:px-10 lg:py-8">
          <div className="mx-auto flex h-full max-w-[560px] flex-col">
            <div className="mt-4 space-y-3">
              <h1
                className={`${akzidenz.className} max-w-[15ch] text-[2.65rem] font-bold leading-[0.924] tracking-[-0.07em] text-[#0B2639] sm:max-w-none sm:text-[3.25rem]`}
              >
                <span className={`${akzidenzProBoldEx.className} block whitespace-nowrap font-black tracking-[-0.036em]`}>Join your</span>
                <span className={`${akzidenzProBoldEx.className} block whitespace-nowrap font-black tracking-[-0.036em]`}>workspace</span>
              </h1>
              <p className="max-w-[30rem] text-[1.02rem] leading-[1.5] text-[#495d6f]" style={graphikStyle}>
                You have been invited to a private TradesStack workspace. Create your account to get started.
              </p>
            </div>

            <form className="mt-6 flex flex-1 flex-col space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label htmlFor="register-name" className="text-sm font-semibold text-[#5A5061]" style={fieldLabelStyle}>
                  Your full name*
                </label>
                <Input
                  id="register-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Jane Builder"
                  autoComplete="name"
                  className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] placeholder:text-[#6b7d8c] focus-visible:ring-[#F74917]/20"
                  style={graphikStyle}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="register-email" className="text-sm font-semibold text-[#5A5061]" style={fieldLabelStyle}>
                  Work email*
                </label>
                <Input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] placeholder:text-[#6b7d8c] focus-visible:ring-[#F74917]/20"
                  style={graphikStyle}
                  required
                />
                <p className="text-[13px] leading-5 text-[#495d6f]" style={graphikStyle}>
                  Use the email address your invitation was sent to.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="register-password" className="text-sm font-semibold text-[#5A5061]" style={fieldLabelStyle}>
                  Password*
                </label>
                <Input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Choose a secure password"
                  autoComplete="new-password"
                  minLength={8}
                  className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] placeholder:text-[#6b7d8c] focus-visible:ring-[#F74917]/20"
                  style={graphikStyle}
                  required
                />
                <p className="text-[13px] leading-5 text-[#495d6f]" style={graphikStyle}>
                  Use at least 8 characters.
                </p>
              </div>

              {error ? (
                <p role="alert" aria-live="polite" className="text-sm text-red-600" style={graphikStyle}>
                  {error}
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
                className="h-[54px] w-full rounded-[0.55rem] bg-[#F74917] px-6 text-[0.98rem] font-semibold text-white hover:bg-[#E84B1D]"
                style={graphikStyle}
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? "Creating account..." : "Create account"}</span>
              </Button>

              <p className="text-[13px] text-[#0B2639]" style={graphikStyle}>
                Already have a TradeStack account?{" "}
                <Link href="/login" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[1.2rem] bg-[#0B2639] px-8 py-8 text-white sm:px-10 sm:py-10 lg:min-h-[560px] lg:px-11 lg:py-11">
          <div className="absolute inset-0 bg-[#0B2639]" />
          <div className="relative flex h-full min-h-[560px] flex-col justify-between gap-10">
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
                  Your workspace. Your business.
                </span>
                <p className="mt-6 max-w-[33rem] text-[1.02rem] leading-[1.5] text-white sm:pr-8 sm:text-[1.0625rem] lg:pr-14" style={graphikStyle}>
                  Everything you need to manage your work in one place.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="max-w-[33rem] text-sm leading-6 text-white/70 sm:pr-8 lg:pr-14" style={graphikStyle}>
                Your invitation connects this account to your team&apos;s workspace. If it has expired, ask your
                administrator to send a new one.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
