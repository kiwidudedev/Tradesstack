import { notFound } from "next/navigation";
import { interMedium } from "@/lib/fonts";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  return (
    <main className="space-y-8 pb-8">
      <header className="space-y-1">
        <h1 className={`${interMedium.className} text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{project.name}</h1>
        <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>Trade Pack Workspace</p>
      </header>
      {children}
    </main>
  );
}
