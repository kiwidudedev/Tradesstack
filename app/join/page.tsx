import { JoinInvitePanel } from "@/components/auth/JoinInvitePanel";

export default function JoinPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EFE6] px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-0">
      <div className="mx-auto w-full max-w-[1320px]">
        <JoinInvitePanel closeHref="/" />
      </div>
    </main>
  );
}
