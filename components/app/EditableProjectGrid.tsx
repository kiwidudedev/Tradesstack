"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import type { OrganizationProject } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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
  const displayName = session?.name?.trim() || "User";

  return (
    <Card className="relative overflow-hidden rounded-none border-0 bg-transparent shadow-none xl:col-span-12">
      <CardHeader className="space-y-4 px-0 pb-5 pt-0">
        <div className="rounded-[12px] border border-[#E6EAF0] bg-white px-5 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Hi, {displayName}</p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>Here are your current projects.</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 px-0 pb-8 md:grid-cols-2 xl:grid-cols-3">
        {hasProjects ? (
          projects.map((project) => {
            const locationLabel = project.location?.trim() ? project.location : "Unspecified";

            return (
              <Link
                key={project.id}
                href={`/app/projects/${project.slug}/dashboard`}
                className="relative rounded-[12px] border border-[#E6EAF0] bg-white p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]"
              >
                <div className="mb-3 flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-1 rounded-[2px] bg-[#04234D]" />
                  <div>
                    <p className={`${interMedium.className} text-lg font-semibold tracking-[-0.01em] text-[#0F172A]`}>
                      {project.name}
                    </p>
                    <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>{locationLabel}</p>
                  </div>
                </div>

                <div className="my-3 h-px bg-[#E6EAF0]" />
                <div className={`${interMedium.className} space-y-2 text-sm font-medium text-[#334155]`}>
                  <p className="flex items-center justify-between">
                    <span className="text-[#64748B]">Job Stage</span>
                    <span>{normalizeJobStage(project.stage)}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-[#64748B]">Client</span>
                    <span>{project.client_name?.trim() ? project.client_name : "Unassigned"}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-[#64748B]">Last updated</span>
                    <span>{formatLastUpdated(project.updated_at)}</span>
                  </p>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="md:col-span-2 xl:col-span-3">
            <div className="rounded-[12px] border border-dashed border-[#c8cfdd] bg-white px-5 py-6">
              <p className={`${interMedium.className} text-base font-medium text-[#2d3445]`}>No projects yet.</p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#687996]`}>
                Create your first project to open your project dashboard.
              </p>
              <Button className="mt-4 h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]" asChild>
                <Link href="/app/projects/new">Create Project</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
