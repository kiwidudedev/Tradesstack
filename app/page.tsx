"use client";

import { Footer } from "@/components/marketing/Footer";
import { FeatureShowcaseSection } from "@/components/marketing/FeatureShowcaseSection";
import { EarlyAccessSection } from "@/components/marketing/EarlyAccessSection";
import { FinalCtaSection } from "@/components/marketing/FinalCtaSection";
import { Hero } from "@/components/marketing/Hero";
import { Navbar } from "@/components/marketing/Navbar";
import { OnePlatformSection } from "@/components/marketing/OnePlatformSection";
import { PreHeroInsights } from "@/components/marketing/PreHeroInsights";
import { ScrollToTopButton } from "@/components/marketing/ScrollToTopButton";
import { SoftwareSyncSection } from "@/components/marketing/SoftwareSyncSection";
import { StatsResultsSection } from "@/components/marketing/StatsResultsSection";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { session } = useAuth();

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[#0B2639] text-white">
      <style jsx global>{`
        .landing-page h2 {
          font-size: 45px !important;
        }

        @media (min-width: 1024px) {
          .landing-page h2 {
            font-size: 65px !important;
          }
        }
      `}</style>
      <main>
        <Navbar session={session} loginHref="/login" />
        <Hero />
        <PreHeroInsights />
        <OnePlatformSection />
        <FeatureShowcaseSection />
        <SoftwareSyncSection />
        <StatsResultsSection />
        <EarlyAccessSection />
        <FinalCtaSection />
        <Footer />
        <ScrollToTopButton />
      </main>
    </div>
  );
}
