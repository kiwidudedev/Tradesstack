import { notFound } from "next/navigation";
import { ProjectFinancialsReport } from "@/components/app/ProjectFinancialsReport";
import { getProjectCostReport } from "@/lib/project-cost-report";

export default async function ProjectFinancialsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const report = await getProjectCostReport(projectId);

  if (!report) {
    notFound();
  }

  return <ProjectFinancialsReport report={report} />;
}
