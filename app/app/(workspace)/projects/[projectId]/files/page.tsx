import { notFound } from "next/navigation";
import { FilesWorkspace } from "@/components/app/files/FilesWorkspace";
import {
  getDocumentBreadcrumbs,
  listDeletedDocumentBatches,
  listDocumentWorkspace,
} from "@/lib/documents/workspace-server";
import { getProjectFilesEntry } from "@/lib/documents/files-context-server";
import { parseDocumentWorkspaceQuery } from "@/lib/documents/workspace";

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId: projectSlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = parseDocumentWorkspaceQuery(rawSearchParams);
  const filesEntry = await getProjectFilesEntry(projectSlug, async ({ client, workspaceId }) => {
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
    .catch(() => null);
  if (!filesEntry) notFound();
  const { context: { entity, workspaceId, metadata }, data } = filesEntry;
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
