import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

const SITE_SAFETY_SECTIONS = [
  {
    title: "Safety Plans (SSSP)",
    href: "safety-plans",
    description: "Create reusable company safety plans and project-specific SSSPs.",
  },
  {
    title: "Daily Logs",
    href: "daily-logs",
    description: "Record daily work, site attendance, safety notes, photos, and delays.",
  },
  {
    title: "Hazards",
    href: "hazards",
    description: "Capture hazards, controls, risk level, actions, and status.",
  },
  {
    title: "Incidents",
    href: "incidents",
    description: "Log incidents and near misses with photos, actions, and follow-up records.",
  },
  {
    title: "Toolbox Talks",
    href: "toolbox-talks",
    description: "Record toolbox meetings, attendees, topics, and sign-offs.",
  },
  {
    title: "Inductions",
    href: "inductions",
    description: "Track who is inducted on each project and store proof.",
  },
  {
    title: "Company Safety",
    href: "company-safety",
    description: "Store reusable company safety info, workers, certificates, policies, risks, and controls.",
  },
] as const;

export default function ProjectSiteSafetyPage() {
  return (
    <main className="app-canvas space-y-6 pb-8">
      <Card className="app-surface app-surface-border relative overflow-hidden shadow-none">
        <CardHeader className="pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">
            Site Safety
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[#4F5F79]`}>
            Set up project-side health and safety workflows for subcontractor teams without
            overbuilding the system up front.
          </p>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">
            Start building here
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SITE_SAFETY_SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group rounded-[16px] border border-[#D9E3EE] bg-[#FCFDFE] px-5 py-5 transition-colors hover:border-[#F15A29] hover:bg-[#FFF7F4]"
              >
                <p className="text-lg font-semibold tracking-[-0.02em] text-[#0F172A]">
                  {section.title}
                </p>
                <p className={`${interMedium.className} mt-2 text-sm font-medium leading-relaxed text-[#64748B]`}>
                  {section.description}
                </p>
                <span className={`${interMedium.className} mt-4 inline-flex text-sm font-semibold text-[#F15A29]`}>
                  Open placeholder
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
