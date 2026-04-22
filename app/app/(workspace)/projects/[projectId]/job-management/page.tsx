import { redirect } from "next/navigation";

export default async function ProjectJobManagementPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/app/projects/${projectId}/job-management/time-sheets`);
}
