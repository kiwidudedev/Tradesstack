import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { getTradePackWorkspacesForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { CreateProjectDialog } from "./CreateProjectDialog";

function getStageTone(stage: string | null) {
  switch (stage) {
    case "Construction":
      return "bg-[#FFE7DE] text-[#D95B2E]";
    case "Completion":
      return "bg-[#E8F4EC] text-[#2E7A52]";
    default:
      return "bg-[#E7EFF7] text-[#3D627C]";
  }
}

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
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} project-theme space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="flex items-start justify-between gap-4 pt-[25px]">
        <div>
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            Projects
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Open a project from here, then use the dedicated project navigation to move between that
            project&apos;s dashboard.
          </p>
        </div>

        <CreateProjectDialog initialOpen={shouldOpenCreateProject} />
      </section>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {projects.length > 0 ? (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/projects/${project.slug}/dashboard`}
                className="group rounded-[14px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-none transition-colors duration-200 hover:bg-[var(--app-surface)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`${interMedium.className} text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]`}>
                      {project.name}
                    </p>
                    <p className={`${interMedium.className} mt-3 text-[15px] text-[#6A7A89]`}>
                      {project.client_name || "No client linked yet"}
                    </p>
                  </div>
                  <span className={`${interMedium.className} inline-flex shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${getStageTone(project.stage)}`}>
                    {project.stage ?? "Planning"}
                  </span>
                </div>

                <div className="mt-6 flex items-center gap-2 text-[14px] text-[#738191]">
                  <MapPin className="h-4 w-4 text-[#F74917]" strokeWidth={2.2} />
                  <span style={{ fontFamily: '"Graphik Regular", Inter, system-ui, sans-serif', fontWeight: 400 }}>
                    {project.location || "Location to be confirmed"}
                  </span>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-[#EEF3F7] pt-5">
                  <span className={`${interMedium.className} text-[14px] font-semibold text-[#10283B]`}>
                    Open project workspace
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#10283B] transition-transform group-hover:translate-x-1" strokeWidth={2.3} />
                </div>
              </Link>
            ))
          ) : (
            <div className="md:col-span-2 2xl:col-span-3">
              <div className="rounded-[28px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                <p className={`${interMedium.className} text-base font-semibold text-[#20384A]`}>No projects yet.</p>
                <p className={`${interMedium.className} mt-2 text-sm text-[#6A7A89]`}>
                  Create your first project, then open it here to access its own dedicated project navigation.
                </p>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}
