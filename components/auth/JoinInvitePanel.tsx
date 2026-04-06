"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftCircle } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { akzidenz, akzidenzProBoldEx } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface JoinInvitePanelProps {
  closeHref?: string;
}

const graphikStyle = {
  fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif',
};

const fieldLabelStyle = {
  ...graphikStyle,
  fontFamily: '"Graphik Semibold", "Graphik Regular", Inter, system-ui, sans-serif',
};

function parseToken(raw: string | null) {
  if (!raw) return "";
  return raw.trim();
}

export function JoinInvitePanel({ closeHref }: JoinInvitePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = useMemo(() => parseToken(searchParams.get("token")), [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const acceptInvite = async (supabase: ReturnType<typeof createBrowserSupabaseClient>, token: string) => {
    const { error: acceptError } = await supabase.rpc("accept_organization_invite", { invite_token: token });
    if (!acceptError) return true;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    return Boolean(membership);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!inviteToken) {
      setError("Invite token is missing. Please use the full invite link from your email.");
      return;
    }

    let supabase: ReturnType<typeof createBrowserSupabaseClient> | null = null;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      setError("Supabase client is not configured.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const accepted = await acceptInvite(supabase, inviteToken);
      if (!accepted) {
        setError("Invite could not be accepted. It may be expired or tied to another email.");
        return;
      }

      router.push("/app/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not complete invite flow.");
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
                <span className={`${akzidenzProBoldEx.className} block whitespace-nowrap font-black tracking-[-0.036em]`}>Accept your invite</span>
                <span className={`${akzidenzProBoldEx.className} block whitespace-nowrap font-black tracking-[-0.036em]`}>to TradeStack</span>
              </h1>
              <p className="max-w-[30rem] text-[1.02rem] leading-[1.5] text-[#495d6f]" style={graphikStyle}>
                Sign in to accept this organization invite.
              </p>
            </div>

            <form className="mt-7 flex flex-col space-y-5" onSubmit={onSubmit}>
              <div className="relative pt-3">
                <label
                  htmlFor="join-email"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Work Email*
                </label>
                <Input
                  id="join-email"
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
                  htmlFor="join-password"
                  className="absolute left-4 top-0 z-10 bg-white px-2 text-[15px] text-black"
                  style={fieldLabelStyle}
                >
                  Password*
                </label>
                <Input
                  id="join-password"
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
              {info ? (
                <p className="text-sm text-emerald-700" style={graphikStyle}>
                  {info}
                </p>
              ) : null}

              <Button
                type="submit"
                className="h-[58px] w-full rounded-[0.55rem] bg-[#F74917] px-6 text-[0.98rem] font-semibold text-white hover:bg-[#E84B1D]"
                style={graphikStyle}
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? "Working..." : "Join"}</span>
              </Button>
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
                  You&apos;re one step away from joining TradesStack.
                </span>
                <p className="mt-6 max-w-[33rem] text-[1.02rem] leading-[1.5] text-white sm:pr-8 sm:text-[1.0625rem] lg:pr-14" style={graphikStyle}>
                  Accept your invite to collaborate on projects, documents, and workflows in one secure platform.
                </p>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
