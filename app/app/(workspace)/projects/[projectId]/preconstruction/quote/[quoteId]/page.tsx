import { notFound } from "next/navigation";
import ProjectQuoteDetailClient from "./ProjectQuoteDetailClient";
import { loadProjectQuoteDetail } from "@/lib/project-quote-detail-server";

export default async function ProjectQuoteDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; quoteId: string }>;
}) {
  const { projectId, quoteId } = await params;
  const initialData = await loadProjectQuoteDetail(projectId, quoteId);
  if (!initialData) notFound();

  return (
    <ProjectQuoteDetailClient
      key={`${initialData.projectId}:${initialData.quote.id ?? "new"}:${initialData.quote.updatedAt ?? "unsaved"}`}
      initialData={initialData}
    />
  );
}
