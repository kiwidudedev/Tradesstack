import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/AuthPanel";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#04234D] px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <Suspense fallback={null}>
          <AuthPanel mode="register" closeHref="/" />
        </Suspense>
      </div>
    </main>
  );
}
