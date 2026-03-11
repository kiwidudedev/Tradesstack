"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginCard } from "@/components/auth/LoginCard";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { Navbar } from "@/components/marketing/Navbar";
import { Sections } from "@/components/marketing/Sections";
import { useAuth } from "@/hooks/use-auth";

function LoginModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Close login dialog"
        className="absolute inset-0 bg-[#04234D]"
        onClick={onClose}
      />

      <div role="dialog" aria-modal="true" aria-label="Sign in to TradesStack" className="relative z-10 w-full px-4">
        <LoginCard
          onClose={onClose}
          onSuccess={() => {
            onClose();
            router.push("/app/dashboard");
          }}
          emailInputId="landing-email"
          passwordInputId="landing-password"
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  const { session } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!showLoginModal) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowLoginModal(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showLoginModal]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#04234D_0%,#062A5C_100%)] text-white">
      <main>
        <Navbar session={session} onLoginClick={() => setShowLoginModal(true)} />
        <Hero />
        <Sections />
        <Footer />
      </main>

      {showLoginModal ? <LoginModal onClose={() => setShowLoginModal(false)} /> : null}
    </div>
  );
}
