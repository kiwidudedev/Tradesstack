import { redirect } from "next/navigation";
import { RegisterShowcasePanel } from "@/components/auth/RegisterShowcasePanel";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/**
 * Invitation-only account activation.
 *
 * There is no public registration route in a dedicated customer application.
 * A visitor without an invitation is sent to sign in, and an invited visitor
 * receives a form whose submission is validated against the invitation on the
 * server before any account is created.
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const inviteToken = rawToken?.trim() ?? "";

  if (!inviteToken) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center bg-[#F4EFE6] px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-[1320px]">
        <RegisterShowcasePanel inviteToken={inviteToken} />
      </div>
    </main>
  );
}
