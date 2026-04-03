"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeftCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { akzidenz, akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginShowcasePanelProps {
  closeHref?: string;
}

function getPostAuthPath(nextPath: string | null): string {
  if (nextPath?.startsWith("/app")) {
    return nextPath;
  }

  return "/app/dashboard";
}

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const fieldLabelStyle = {
  ...graphikStyle,
  fontFamily: '"Graphik Semibold", "Graphik Regular", Inter, system-ui, sans-serif',
};

const benefitLines = ["Get access before launch.", "Help shape the roadmap.", "Be first to onboard your team."];

export function LoginShowcasePanel({ closeHref }: LoginShowcasePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const postAuthPath = useMemo(() => getPostAuthPath(searchParams.get("next")), [searchParams]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(postAuthPath);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to sign in.");
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
                className={`${akzidenz.className} max-w-[15ch] text-[2.65rem] font-bold leading-[0.924] tracking-[-0.07em] text-[#0B2639] sm:max-w-none sm:text-[3.25rem]`}
              >
                <span className={`${akzidenzProBoldEx.className} block whitespace-nowrap font-black tracking-[-0.036em]`}>Sign in</span>
                <span className={`${akzidenzProBoldEx.className} block whitespace-nowrap font-black tracking-[-0.036em]`}>to TradeStack</span>
              </h1>
              <p className="max-w-[30rem] text-[1.02rem] leading-[1.5] text-[#495d6f]" style={graphikStyle}>
                Sign in to continue managing projects, trade packs, and workflows with your team.
              </p>
            </div>

            <form className="mt-10 flex flex-col space-y-5" onSubmit={onSubmit}>
              <div className="relative pt-3">
                <label
                  htmlFor="login-email"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Work email*
                </label>
                <Input
                  id="login-email"
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
                  htmlFor="login-password"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Password*
                </label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
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

              <Button
                type="submit"
                className="h-[58px] w-full rounded-[0.55rem] bg-[#F74917] px-6 text-[0.98rem] font-semibold text-white hover:bg-[#E84B1D]"
                style={graphikStyle}
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? "Signing in..." : "Sign in"}</span>
              </Button>

              <p className="text-center text-[14px] text-[#0B2639]" style={graphikStyle}>
                <Link href="/forgot-password" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                  Forgot password?
                </Link>
              </p>

              <p className="text-[13px] text-[#0B2639]" style={graphikStyle}>
                New to TradeStack?{" "}
                <Link href="/register" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                  Create an account
                </Link>
                .
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
