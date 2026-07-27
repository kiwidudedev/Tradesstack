"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ProjectSecondaryNav } from "@/components/app/ProjectSecondaryNav";
import { ibmPlexSans, interMedium } from "@/lib/fonts";

const SECTION_MAP: { segment: string; label: string }[] = [
  { segment: "preconstruction/quote", label: "Quotation" },
  { segment: "preconstruction/variations", label: "Variations" },
  { segment: "preconstruction/purchase-orders", label: "Purchase Orders" },
  { segment: "preconstruction/claims", label: "Payment Claim" },
  { segment: "preconstruction/retention", label: "Retention" },
  { segment: "financials", label: "Financials" },
  { segment: "job-management/todos", label: "Tasks" },
  { segment: "job-management/time-sheets", label: "Timesheets" },
  { segment: "job-management/quality-assurance", label: "QA" },
  { segment: "site-safety", label: "Site Safety" },
  { segment: "ai-chatbot", label: "AI Assistant" },
  { segment: "dashboard", label: "Overview" },
];

export default function ProjectLayoutShell({
  children,
  projectName,
  projectStage,
}: {
  children: React.ReactNode;
  projectName: string;
  projectStage?: string | null;
}) {
  const pathname = usePathname();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? "";

  const match = SECTION_MAP.find((s) => pathname.includes(`/${s.segment}`));
  const sectionLabel = match?.label ?? null;
  const sectionHref = match
    ? match.segment === "preconstruction/retention"
      ? `/app/projects/${projectId}/preconstruction/claims#retention`
      : `/app/projects/${projectId}/${match.segment}`
    : null;
  const isAiChatbotRoute = pathname.includes("/ai-chatbot");

  return (
    <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme -mx-1.5 bg-[var(--background)] pb-8 sm:-mx-4`}>
      <div className="space-y-6 bg-[var(--background)]">
        <ProjectSecondaryNav
          projectName={projectName}
          projectStage={projectStage}
        />
        <div className="min-w-0 flex-1 bg-[var(--background)] px-5">
          {sectionLabel && !isAiChatbotRoute ? (
            <nav className={`${interMedium.className} mb-3 flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]`}>
              <Link href={`/app/projects/${projectId}/dashboard`} className="transition-colors hover:text-[var(--text-secondary)]">
                {projectName || "Project"}
              </Link>
              <span>/</span>
              {sectionHref && pathname !== sectionHref ? (
                <>
                  <Link href={sectionHref} className="transition-colors hover:text-[var(--text-secondary)]">
                    {sectionLabel}
                  </Link>
                  <span>/</span>
                  <span className="text-[var(--text-secondary)]">Detail</span>
                </>
              ) : (
                <span className="text-[var(--text-secondary)]">{sectionLabel}</span>
              )}
            </nav>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
