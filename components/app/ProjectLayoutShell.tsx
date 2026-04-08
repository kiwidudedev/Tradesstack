"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function ProjectLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const projectId = params?.projectId ?? "";
  const projectDashboardPath = projectId ? `/app/projects/${projectId}/dashboard` : null;
  const projectBackHref = pathname === projectDashboardPath ? "/app/dashboard" : (projectDashboardPath ?? "/app/projects");
  const isProjectTimeSheetsPage = projectId ? pathname === `/app/projects/${projectId}/job-management/time-sheets` : false;

  if (isProjectTimeSheetsPage) {
    return <>{children}</>;
  }

  return (
    <main className="project-theme space-y-8 bg-[#F8F9FC] pb-8">
      {children}
      <Link
        href={projectBackHref}
        className="fixed bottom-6 right-6 z-50 inline-flex items-center justify-center rounded-[999px] border border-[#0B2639] bg-[#0B2639] p-[0.55rem] text-white transition-opacity hover:opacity-90"
        aria-label="Back to project dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only">Back to project dashboard</span>
      </Link>
    </main>
  );
}
