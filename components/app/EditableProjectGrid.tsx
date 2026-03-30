"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import type { OrganizationProject } from "@/lib/projects";
import { Button } from "@/components/ui/button";

function formatLastUpdated(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)));
    return `${hours}h ago`;
  }

  const days = Math.floor(diffMs / dayMs);
  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function normalizeJobStage(value: string): string {
  if (value === "Planning" || value === "Estimating") {
    return "Pricing";
  }

  if (value === "In Delivery") {
    return "Construction";
  }

  if (value === "Pricing" || value === "Construction" || value === "Completion") {
    return value;
  }

  return "Pricing";
}

export function EditableProjectGrid({ initialProjects }: { initialProjects: OrganizationProject[] }) {
  const { session } = useAuth();
  const projects = useMemo(
    () =>
      [...initialProjects]
        .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
        .slice(0, 3),
    [initialProjects]
  );
  const hasProjects = projects.length > 0;
  const featuredProject = projects[0] ?? null;
  const secondaryProjects = projects.slice(1);
  const displayName = session?.name?.trim() || "User";

  return (
    <section className="space-y-2 xl:col-span-12">
      <div>
        <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6C7D93]`}>Workspace</p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#0F172A]">Your Projects</h2>
        <p className={`${interMedium.className} mt-1 text-xs font-medium text-[#64748B]`}>
          {displayName}, here&apos;s where to pick up build work today.
        </p>
      </div>
      {hasProjects ? (
        <div className="space-y-1.5 border-t border-[#E5EAF2] pt-1.5">
          {featuredProject ? (
            <Link
              href={`/app/projects/${featuredProject.slug}/dashboard`}
              className="group block rounded-[6px] px-1 py-1.5 transition-colors hover:bg-[#F7FAFE]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{featuredProject.name}</p>
                  <p className={`${interMedium.className} mt-0.5 text-xs text-[#64748B]`}>
                    {featuredProject.location?.trim() ? featuredProject.location : "Unspecified"}
                  </p>
                </div>
                <span className={`${interMedium.className} text-xs font-medium text-[#31507A]`}>{normalizeJobStage(featuredProject.stage)}</span>
              </div>
              <p className={`${interMedium.className} mt-1 text-xs text-[#6C7D93]`}>
                Last activity {formatLastUpdated(featuredProject.updated_at)} • {featuredProject.client_name?.trim() ? featuredProject.client_name : "Unassigned"}
              </p>
            </Link>
          ) : null}

          {secondaryProjects.length > 0 ? (
            <div className="space-y-0.5">
              {secondaryProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/app/projects/${project.slug}/dashboard`}
                  className="flex items-center justify-between rounded-[6px] px-1 py-1 transition-colors hover:bg-[#F7FAFE]"
                >
                  <span className={`${interMedium.className} truncate text-xs font-medium text-[#23324A]`}>{project.name}</span>
                  <span className={`${interMedium.className} text-[11px] text-[#6C7D93]`}>{formatLastUpdated(project.updated_at)}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="border-t border-[#E5EAF2] pt-2">
          <p className={`${interMedium.className} text-sm font-medium text-[#2d3445]`}>No projects yet.</p>
          <p className={`${interMedium.className} mt-1 text-xs font-medium text-[#687996]`}>
            Create your first project to open your project dashboard.
          </p>
          <Button className="mt-3 h-8 rounded-[6px] bg-[#F74917] px-3 text-xs font-medium text-white hover:bg-[#e63f10]" asChild>
            <Link href="/app/projects/new">Create Project</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
