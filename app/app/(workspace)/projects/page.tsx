import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { ibmPlexSans } from "@/lib/fonts";
import { getTradePackWorkspacesForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ProjectsListTable } from "./ProjectsListTable";

export default async function ProjectSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ createProject?: string | string[] }>;
}) {
  const query = await searchParams;
  const projects = await getTradePackWorkspacesForCurrentUser();
  const shouldOpenCreateProject =
    typeof query.createProject === "string"
      ? query.createProject === "1" || query.createProject.toLowerCase() === "true"
      : false;

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme space-y-6 pb-8`}>
      <OperationalModuleHeader
        title="Projects"
        description="Open a project from here, then use the dedicated project navigation to move between that project's dashboard."
        actions={<CreateProjectDialog initialOpen={shouldOpenCreateProject} />}
      />

      <ProjectsListTable rows={projects} />
    </main>
  );
}
