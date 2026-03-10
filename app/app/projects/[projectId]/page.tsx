import { redirect } from "next/navigation";

export default async function ProjectDashboardHomePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/app/projects/${projectId}/dashboard`);
}
