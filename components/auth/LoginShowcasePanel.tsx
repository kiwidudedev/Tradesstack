"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { akzidenz, akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function LoginShowcasePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const postAuthPath = useMemo(() => getPostAuthPath(searchParams.get("next")), [searchParams]);
  const passwordResetComplete = searchParams.get("reset") === "1";

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

      router.push(result.redirectPath || postAuthPath);
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

            {passwordResetComplete ? (
              <p
                role="status"
                className="mt-6 rounded-[0.55rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                style={graphikStyle}
              >
                Your password has been updated. Sign in with your new password.
              </p>
            ) : null}

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
                  autoComplete="email"
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                  style={graphikStyle}
                  required
                />
              </div>

              {error ? (
                <p role="alert" aria-live="polite" className="text-sm text-red-600" style={graphikStyle}>
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

              <p className="text-[13px] leading-[1.5] text-[#495d6f]" style={graphikStyle}>
                Access is managed by your workspace administrator. Ask them for an invitation if you need an account.
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
                  Your workspace. Your business.
                </span>
                <p className="mt-6 max-w-[33rem] text-[1.02rem] leading-[1.5] text-white sm:pr-8 sm:text-[1.0625rem] lg:pr-14" style={graphikStyle}>
                  Everything you need to manage your work in one place.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="max-w-[33rem] text-sm leading-6 text-white/70 sm:pr-8 lg:pr-14" style={graphikStyle}>
                This is a private workspace for your team. Accounts are created by invitation or by your workspace
                administrator.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
