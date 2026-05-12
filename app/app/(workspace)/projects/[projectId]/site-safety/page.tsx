import Link from "next/link";
import { OperationalPageHeader } from "@/components/app/OperationalPageHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";

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
    <main className="space-y-6 bg-[var(--background)] pb-8">
      <OperationalPageHeader
        title="Site Safety"
        description="Set up project-side health and safety workflows for subcontractor teams without overbuilding the system up front."
      />

      <OperationalPanel title="Start building here">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SITE_SAFETY_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-5 py-5 transition-colors hover:border-[var(--orange-primary)] hover:bg-[var(--accent)]"
            >
              <p className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                {section.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {section.description}
              </p>
              <span className="mt-4 inline-flex text-sm font-semibold text-[var(--orange-primary)]">
                Open placeholder
              </span>
            </Link>
          ))}
        </div>
      </OperationalPanel>
    </main>
  );
}
