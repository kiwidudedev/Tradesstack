"use client";

import { ProjectSecondaryNav } from "@/components/app/ProjectSecondaryNav";
import { ibmPlexSans } from "@/lib/fonts";

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
    <div className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme app-canvas -mx-[0.384rem] pb-8 sm:-mx-[1.024rem]`}>
      <div className="space-y-6 bg-[#F9FAFC]">
        <ProjectSecondaryNav projectName={projectName} projectStage={projectStage} />
        <div className="min-w-0 flex-1 bg-[#F9FAFC] px-5">{children}</div>
      </div>
    </div>
  );
}
