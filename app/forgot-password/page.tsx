"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { akzidenz, akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const fieldLabelStyle = {
  ...graphikStyle,
  fontFamily: '"Graphik Semibold", "Graphik Regular", Inter, system-ui, sans-serif',
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError("Unable to send a password reset email right now. Try again shortly.");
        return;
      }

      setIsSubmitted(true);
    } catch {
      setError("Password recovery is not configured for this workspace. Contact your workspace administrator.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EFE6] px-4 py-8 sm:px-8">
      <section className="w-full max-w-[560px] rounded-[1.2rem] border border-[#0B2639]/8 bg-white px-6 py-8 sm:px-10 sm:py-10">
        <h1
          className={`${akzidenz.className} text-[2.4rem] font-bold leading-[0.95] tracking-[-0.06em] text-[#0B2639]`}
        >
          <span className={`${akzidenzProBoldEx.className} block font-black tracking-[-0.036em]`}>Reset password</span>
        </h1>
        <p className="mt-4 text-[1.02rem] leading-[1.5] text-[#495d6f]" style={graphikStyle}>
          Enter your work email and we will send you a link to choose a new password.
        </p>

        {isSubmitted ? (
          <div className="mt-8 space-y-5">
            <p role="status" className="rounded-[0.55rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" style={graphikStyle}>
              If an account exists for that email, a password reset link is on its way. Check your inbox and spam
              folder.
            </p>
            <p className="text-center text-[14px] text-[#0B2639]" style={graphikStyle}>
              <Link href="/login" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <form className="mt-8 flex flex-col space-y-5" onSubmit={onSubmit}>
            <div className="relative pt-3">
              <label
                htmlFor="forgot-email"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                Work email*
              </label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
              <span>{isSubmitting ? "Sending..." : "Send reset link"}</span>
            </Button>

            <p className="text-center text-[14px] text-[#0B2639]" style={graphikStyle}>
              <Link href="/login" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
