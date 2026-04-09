"use client";

import { ProjectSecondaryNav } from "@/components/app/ProjectSecondaryNav";

export default function ProjectLayoutShell({
  children,
  projectName,
  projectStage,
}: {
  children: React.ReactNode;
  projectName: string;
  projectStage?: string | null;
}) {
  return (
    <div className="project-theme app-canvas pb-8">
      <div className="space-y-6">
        <ProjectSecondaryNav projectName={projectName} projectStage={projectStage} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
