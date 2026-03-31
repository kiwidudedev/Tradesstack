import { EarlyAccessShowcasePanel } from "@/components/auth/EarlyAccessShowcasePanel";

export default function EarlyAccessPage() {
  return (
    <main className="flex min-h-screen items-center bg-[#F4EFE6] px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-[1320px]">
        <EarlyAccessShowcasePanel closeHref="/" />
      </div>
    </main>
  );
}
