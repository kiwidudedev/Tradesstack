import Link from "next/link";
import { ArrowRight, MapPin, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getTradePackWorkspacesForCurrentUser } from "@/lib/trade-pack-workspaces-server";

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

export default async function ProjectSpacePage() {
  const projects = await getTradePackWorkspacesForCurrentUser();

  return (
    <main className="space-y-8 bg-[#FBFEFE] pb-8">
      <Card className="overflow-hidden rounded-[34px] border-[var(--app-border)] bg-[var(--app-surface)] shadow-none">
        <CardHeader className="border-b border-[#EEF3F7] pb-6 pt-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`${interMedium.className} text-[13px] font-semibold uppercase tracking-[0.18em] text-[#93A1AE]`}>
                Project Directory
              </p>
              <CardTitle className="mt-3 text-[44px] leading-none text-[#10283B]">Projects</CardTitle>
              <p className={`${interMedium.className} mt-3 max-w-2xl text-[16px] text-[#607080]`}>
                Open a project from here, then use the dedicated project navigation to move between that
                project&apos;s dashboard, financials, delivery tools, and AI workflows.
              </p>
            </div>

            <Link
              href="/app/projects/new"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F74917] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#E63F10]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Create Project
            </Link>
          </div>
        </CardHeader>

        <CardContent className="grid gap-5 pb-8 pt-7 md:grid-cols-2 2xl:grid-cols-3">
          {projects.length > 0 ? (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/projects/${project.slug}/dashboard`}
                className="group rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-none transition-colors duration-200 hover:bg-[var(--app-surface)]"
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
        </CardContent>
      </Card>
    </main>
  );
}
