import { notFound, redirect } from "next/navigation";
import { FilesWorkspace } from "@/components/app/files/FilesWorkspace";
import {
  getDocumentBreadcrumbs,
  listDeletedDocumentBatches,
  listDocumentWorkspace,
} from "@/lib/documents/workspace-server";
import { getOpportunityFilesEntry } from "@/lib/documents/files-context-server";
import { documentFilesRoute, parseDocumentWorkspaceQuery } from "@/lib/documents/workspace";

export default async function OpportunityFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ opportunityId: opportunitySlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = parseDocumentWorkspaceQuery(rawSearchParams);
  const filesEntry = await getOpportunityFilesEntry(opportunitySlug, async ({ client, workspaceId }) => {
    if (query.view === "deleted") {
      return {
        kind: "deleted" as const,
        result: await listDeletedDocumentBatches({ client, workspaceId, query }),
      };
    }
    const [listing, breadcrumbs] = await Promise.all([
      listDocumentWorkspace({ client, workspaceId, query }),
      getDocumentBreadcrumbs({ client, workspaceId, folderId: query.folderId }),
    ]);
    return { kind: "active" as const, listing, breadcrumbs };
  })
    .catch((error: unknown) => {
    console.error("Unable to resolve authoritative Opportunity Files route.", {
      opportunitySlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (!filesEntry) notFound();
  const { context: { entity, workspaceId, metadata, finalProject }, data } = filesEntry;
  if (finalProject) {
    const queryString = new URLSearchParams(
      Object.entries(rawSearchParams).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.map((item) => [key, item] as [string, string])
          : value === undefined
            ? []
            : [[key, value] as [string, string]],
      ),
    ).toString();
    redirect(`${documentFilesRoute({ kind: "project", id: finalProject.id, slug: finalProject.slug })}${queryString ? `?${queryString}` : ""}`);
  }

  if (query.view === "deleted") {
    if (!metadata.canDelete) notFound();
    if (data.kind !== "deleted") notFound();
    const deleted = data.result;
    return (
      <FilesWorkspace
        entity={entity}
        workspaceId={workspaceId}
        nodes={[]}
        deletedBatches={deleted.batches}
        totalCount={deleted.totalCount}
        breadcrumbs={[]}
        query={query}
        metadata={metadata}
      />
    );
  }
  if (data.kind !== "active") notFound();
  const { listing, breadcrumbs } = data;

  return (
    <FilesWorkspace
      entity={entity}
      workspaceId={workspaceId}
      nodes={listing.nodes}
      deletedBatches={[]}
      totalCount={listing.totalCount}
      breadcrumbs={breadcrumbs}
      query={query}
      metadata={metadata}
    />
  );
}
