"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { akzidenz } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

interface LoginCardProps {
  onSuccess: () => void | Promise<void>;
  onClose?: () => void;
  emailInputId?: string;
  passwordInputId?: string;
}

export function LoginCard({
  onSuccess,
  onClose,
  emailInputId = "email",
  passwordInputId = "password",
}: LoginCardProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await login(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      await onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/30 bg-white">
      {onClose ? (
        <button
          type="button"
          className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d4d8de] bg-white text-[#1d1d1d] transition hover:bg-[#f3f4f6]"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <div className="grid gap-0 md:grid-cols-[1.3fr_1fr]">
        <div className="relative overflow-hidden bg-[#04234D] p-8 text-white sm:p-10">
          <div className="absolute inset-0">
            <div className="absolute inset-y-0 right-0 w-px bg-white/12" />
          </div>

          <div className="relative max-w-md space-y-8">
            <Image
              src="/tradesstacklogowhite.png"
              alt="TradesStack"
              width={400}
              height={110}
              className="-ml-[33px] translate-x-[20px] h-[3.18rem] w-auto object-contain sm:h-[3.6rem]"
              priority
            />
            <div className="space-y-4">
              <p className={`${akzidenz.className} text-sm font-normal uppercase tracking-[0.24em] text-[#F74917]`}>
                AI FOR CONSTRUCTION DOCUMENTS
              </p>
              <h2
                className={`${akzidenz.className} text-[2.6rem] font-bold uppercase leading-[0.9] tracking-[-0.04em] text-white sm:text-[3.4rem]`}
              >
                <span className="block whitespace-nowrap">DRAWINGS UPLOADED.</span>
                <span className="block whitespace-nowrap text-[#F74917]">AI ANALYZED.</span>
                <span className="block whitespace-nowrap">WORKFLOW SIMPLIFIED.</span>
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-white/80 sm:text-[15px]">
              Upload construction drawings, generate trade packs, and produce structured scopes with AI.
            </p>
          </div>
        </div>

        <div className="bg-[#F3F4F6] p-8 sm:p-10">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#F74917]">TradesStack</p>
              <h3 className="mt-3 text-4xl font-semibold text-[#1d1d1d]">Sign in</h3>
              <p className="mt-2 text-sm text-[#303030]">Sign in to your TradesStack account.</p>
            </div>
          </div>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="mb-2 block text-sm text-[#1d1d1d]" htmlFor={emailInputId}>
                Email
              </label>
              <Input
                id={emailInputId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 rounded-[1.1rem] border-[#d4d8de] bg-white text-[#1d1d1d] placeholder:text-[#7a7a7a] focus-visible:ring-[#F74917]/30"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="mb-2 block text-sm text-[#1d1d1d]" htmlFor={passwordInputId}>
                Password
              </label>
              <Input
                id={passwordInputId}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-14 rounded-[1.1rem] border-[#d4d8de] bg-white text-[#1d1d1d] placeholder:text-[#7a7a7a] focus-visible:ring-[#F74917]/30"
                required
              />
            </div>

            {error ? (
              <div className="rounded-[0.9rem] border border-[#FCA5A5] bg-[#FFF1F2] px-4 py-3.5">
                <p className="text-[15px] font-semibold leading-6 text-[#7F1D1D]">{error}</p>
                <p className="mt-1.5 text-[13px] leading-5 text-[#9F1239]">
                  Need access?{" "}
                  <Link href="/register" className="font-semibold underline underline-offset-2">
                    Create an account
                  </Link>{" "}
                  or contact your organization admin.
                </p>
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-14 w-full rounded-full bg-[#111111] text-base text-white hover:bg-black"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-center text-xs text-[#1d1d1d]">
              <Link href="/forgot-password" className="font-medium text-[#ff5406] hover:underline">
                Forgot password?
              </Link>
            </p>
          </form>

          <p className="mt-6 text-sm text-[#1d1d1d]">
            New to TradesStack?{" "}
            <Link href="/register" className="font-medium text-[#ff5406] hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
