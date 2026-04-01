"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { akzidenz } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthMode = "login" | "register";

interface AuthPanelProps {
  compact?: boolean;
  mode?: AuthMode;
  closeHref?: string;
}

function getPostAuthPath(nextPath: string | null): string {
  if (nextPath?.startsWith("/app")) {
    return nextPath;
  }

  return "/app/dashboard";
}

export function AuthPanel({ compact = false, mode = "login", closeHref }: AuthPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register } = useAuth();

  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegisterMode = mode === "register";
  const postAuthPath = useMemo(() => getPostAuthPath(searchParams.get("next")), [searchParams]);

  const navigateAfterAuth = () => {
    router.push(postAuthPath);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);

    try {
      if (isRegisterMode) {
        const result = await register({
          fullName: name,
          organizationName,
          email,
          password,
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        if (result.requiresEmailConfirmation) {
          setInfo("Account created. Check your inbox to confirm your email, then sign in.");
          setPassword("");
          return;
        }

        navigateAfterAuth();
        return;
      }

      const result = await login(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      navigateAfterAuth();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/30 bg-white">
      {closeHref ? (
        <Link
          href={closeHref}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d4d8de] bg-white text-[#1d1d1d] transition hover:bg-[#f3f4f6]"
        >
          <X className="h-4 w-4" />
        </Link>
      ) : null}
      <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
        <section className="relative overflow-hidden bg-[#04234D] px-5 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute inset-0">
            <div className="absolute inset-y-0 right-0 w-px bg-white/12" />
          </div>

          <div className="relative max-w-md space-y-6">
            <Image
              src="/tradesstacklogowhite.png"
              alt="TradesStack"
              width={400}
              height={110}
              className="-ml-[33px] translate-x-[50px] h-[3.18rem] w-auto object-contain sm:h-[3.6rem]"
              priority
            />

            <div className="space-y-3">
              <p className={`${akzidenz.className} text-sm font-normal uppercase tracking-[0.24em] text-[#F74917]`}>
                AI FOR CONSTRUCTION DOCUMENTS
              </p>
              <h1
                className={`${akzidenz.className} w-full max-w-[400px] text-[45px] font-bold uppercase leading-[0.95] tracking-[-0.02em] text-white`}
              >
                <span className="block whitespace-nowrap">DRAWINGS UPLOADED.</span>
                <span className="block whitespace-nowrap text-[#F74917]">AI ANALYZED.</span>
                <span className="block whitespace-nowrap">WORKFLOW SIMPLIFIED.</span>
              </h1>
            </div>

            <p className="max-w-md text-sm leading-relaxed text-white/80 sm:text-[15px]">
              Upload construction drawings, generate trade packs, and produce structured scopes with AI.
            </p>
          </div>
        </section>

        <section className="bg-[#F3F4F6] px-5 py-4 sm:px-6 sm:py-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#F74917]">TradesStack</p>
              <h2 className="mt-3 text-4xl font-semibold text-[#1d1d1d]">
                {isRegisterMode ? "Create account" : "Sign in"}
              </h2>
              <p className="mt-2 text-sm text-[#303030]">
                {isRegisterMode ? "Create your organization account." : "Sign in to your TradesStack account."}
              </p>
            </div>
          </div>

          <form className="mt-5 space-y-3.5" onSubmit={onSubmit}>
            {isRegisterMode ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="name" className="mb-2 block text-sm text-[#1d1d1d]">
                    Your full name
                  </label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Jane Builder"
                    className="h-14 rounded-[1.1rem] border-[#d4d8de] bg-white text-[#1d1d1d] placeholder:text-[#7a7a7a] focus-visible:ring-[#F74917]/30"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="organizationName" className="mb-2 block text-sm text-[#1d1d1d]">
                    Organization name
                  </label>
                  <Input
                    id="organizationName"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    placeholder="Acme Projects"
                    className="h-14 rounded-[1.1rem] border-[#d4d8de] bg-white text-[#1d1d1d] placeholder:text-[#7a7a7a] focus-visible:ring-[#F74917]/30"
                    required
                  />
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="email" className="mb-2 block text-sm text-[#1d1d1d]">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="h-14 rounded-[1.1rem] border-[#d4d8de] bg-white text-[#1d1d1d] placeholder:text-[#7a7a7a] focus-visible:ring-[#F74917]/30"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="mb-2 block text-sm text-[#1d1d1d]">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                className="h-14 rounded-[1.1rem] border-[#d4d8de] bg-white text-[#1d1d1d] placeholder:text-[#7a7a7a] focus-visible:ring-[#F74917]/30"
                required
              />
            </div>

            {error ? (
              <div className="rounded-[0.9rem] border border-[#FCA5A5] bg-[#FFF1F2] px-4 py-3.5">
                <p className="text-[15px] font-semibold leading-6 text-[#7F1D1D]">{error}</p>
                {!isRegisterMode ? (
                  <p className="mt-1.5 text-[13px] leading-5 text-[#9F1239]">
                    Need access?{" "}
                    <Link href="/register" className="font-semibold underline underline-offset-2">
                      Create an account
                    </Link>{" "}
                    or contact your organization admin.
                  </p>
                ) : null}
              </div>
            ) : null}
            {info ? <p className="text-sm text-emerald-700">{info}</p> : null}

            <Button type="submit" className="h-14 w-full rounded-full bg-[#111111] text-base text-white hover:bg-black" disabled={isSubmitting}>
              {isSubmitting
                ? isRegisterMode
                  ? "Creating account..."
                  : "Signing in..."
                : isRegisterMode
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-[#1d1d1d]">
            <Link href="/forgot-password" className="font-medium text-[#ff5406] hover:underline">
              Forgot password?
            </Link>
          </p>

          {!compact ? (
            <p className="mt-4 text-sm text-[#1d1d1d]">
              {isRegisterMode ? "Already have a TradesStack account? " : "New to TradesStack? "}
              <Link href={isRegisterMode ? "/login" : "/register"} className="font-medium text-[#ff5406] hover:underline">
                {isRegisterMode ? "Sign in" : "Create an account"}
              </Link>
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
