import { notFound } from "next/navigation";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import ProjectLayoutShell from "@/components/app/ProjectLayoutShell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const timingLabel = `[projects][layout] load:${projectId}`;
  console.time(timingLabel);

  const approximateQueries = 1;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    console.info("[projects][layout] query-count", {
      projectId,
      approximateQueries,
    });
    console.timeEnd(timingLabel);
    notFound();
  }

  console.info("[projects][layout] query-count", {
    projectId,
    approximateQueries,
  });
  console.timeEnd(timingLabel);

  return (
    <ProjectLayoutShell
      projectName={project.name}
      projectStage={project.stage}
    >
      {children}
    </ProjectLayoutShell>
  );
}
