"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
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

type LinkState = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let client: SupabaseClient | null = null;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      setLinkState("invalid");
      return;
    }

    setSupabase(client);
    let active = true;

    client.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setLinkState(data.session ? "ready" : "invalid");
      })
      .catch(() => {
        if (active) setLinkState("invalid");
      });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (session) setLinkState("ready");
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Password recovery is not configured for this workspace.");
      return;
    }
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("Unable to update your password. Request a new reset link and try again.");
        return;
      }

      await supabase.auth.signOut();
      router.push("/login?reset=1");
      router.refresh();
    } catch {
      setError("Unable to update your password right now. Try again shortly.");
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
          <span className={`${akzidenzProBoldEx.className} block font-black tracking-[-0.036em]`}>Choose a new password</span>
        </h1>

        {linkState === "checking" ? (
          <p className="mt-6 text-[1.02rem] leading-[1.5] text-[#495d6f]" style={graphikStyle} role="status">
            Checking your password reset link...
          </p>
        ) : null}

        {linkState === "invalid" ? (
          <div className="mt-6 space-y-5">
            <p role="alert" className="rounded-[0.55rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" style={graphikStyle}>
              This password reset link is invalid or has expired.
            </p>
            <p className="text-[14px] text-[#0B2639]" style={graphikStyle}>
              <Link href="/forgot-password" className="font-semibold text-[#F74917] transition hover:text-[#d95a1c]">
                Request a new reset link
              </Link>
            </p>
          </div>
        ) : null}

        {linkState === "ready" ? (
          <form className="mt-6 flex flex-col space-y-5" onSubmit={onSubmit}>
            <div className="relative pt-3">
              <label
                htmlFor="reset-password"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                New password*
              </label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                className="h-[53px] rounded-[0.55rem] border-[2px] border-[#d2d0d4] bg-white px-5 text-[1rem] font-semibold text-[#1F2430] focus-visible:ring-[#F74917]/20"
                style={graphikStyle}
                required
              />
            </div>

            <div className="relative pt-3">
              <label
                htmlFor="reset-password-confirm"
                className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                style={fieldLabelStyle}
              >
                Confirm new password*
              </label>
              <Input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
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
              <span>{isSubmitting ? "Updating..." : "Update password"}</span>
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
