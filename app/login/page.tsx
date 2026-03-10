import Link from "next/link";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/AuthPanel";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#04234D] px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/" className="inline-flex pb-6 text-lg font-semibold text-white/90 hover:text-white">
          Back to home
        </Link>
        <Suspense fallback={null}>
          <AuthPanel mode="login" />
        </Suspense>
      </div>
    </main>
  );
}
