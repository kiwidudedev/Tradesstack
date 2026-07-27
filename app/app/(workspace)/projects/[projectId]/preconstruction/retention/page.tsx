import { redirect } from "next/navigation";

export default async function RetentionRegisterCompatibilityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(
    `/app/projects/${encodeURIComponent(projectId)}/preconstruction/claims#retention`,
  );
}
