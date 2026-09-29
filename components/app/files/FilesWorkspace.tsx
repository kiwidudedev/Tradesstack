"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveRestore,
  Download,
  File,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalBreadcrumbs } from "@/components/app/OperationalBreadcrumbs";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { OperationalToolbar } from "@/components/app/OperationalToolbar";
import { LazyFileUploadButton } from "@/components/app/files/LazyFileUploadButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DOCUMENT_FILE_TYPES,
  DOCUMENT_SORTS,
  documentFilesRoute,
  documentFileCategory,
  formatDocumentBytes,
  getDocumentFolderPath,
  isDocumentFolderDescendant,
  validateDocumentNodeName,
  type DocumentBreadcrumb,
  type DocumentDeletedBatch,
  type DocumentEntityContext,
  type DocumentFilesPageMetadata,
  type DocumentFolderOption,
  type DocumentWorkspaceNode,
  type DocumentWorkspaceQuery,
} from "@/lib/documents/workspace";
import {
  createDocumentFolderAction,
  deleteDocumentNodeAction,
  moveDocumentNodeAction,
  purgeDocumentNodeAction,
  renameDocumentNodeAction,
  restoreDocumentNodeAction,
} from "@/lib/documents/workspace-actions";

type ModalState =
  | { type: "new-folder" }
  | { type: "rename"; node: DocumentWorkspaceNode }
  | { type: "move"; node: DocumentWorkspaceNode }
  | { type: "delete"; node: DocumentWorkspaceNode }
  | { type: "restore"; batch: DocumentDeletedBatch }
  | { type: "purge"; batch: DocumentDeletedBatch }
  | null;

const selectClass =
  "h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]";

function buildUrl(
  entity: DocumentEntityContext,
  values: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  const path = documentFilesRoute(entity);
  return `${path}${query ? `?${query}` : ""}`;
}

function NodeIcon({ node }: { node: DocumentWorkspaceNode }) {
  if (node.kind === "folder") return <Folder className="h-5 w-5 text-[var(--brand-blue)]" />;
  const category = documentFileCategory(node.fileExtension);
  if (category === "images") return <FileImage className="h-5 w-5 text-[var(--text-muted)]" />;
  if (["pdf", "documents", "text"].includes(category)) {
    return <FileText className="h-5 w-5 text-[var(--text-muted)]" />;
  }
  return <File className="h-5 w-5 text-[var(--text-muted)]" />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function FilesWorkspace({
  entity,
  workspaceId,
  nodes,
  deletedBatches,
  totalCount,
  breadcrumbs,
  query,
  metadata,
}: {
  entity: DocumentEntityContext;
  workspaceId: string;
  nodes: DocumentWorkspaceNode[];
  deletedBatches: DocumentDeletedBatch[];
  totalCount: number;
  breadcrumbs: DocumentBreadcrumb[];
  query: DocumentWorkspaceQuery;
  metadata: DocumentFilesPageMetadata;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [details, setDetails] = useState<DocumentWorkspaceNode | null>(null);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [moveFolders, setMoveFolders] = useState<DocumentFolderOption[]>([]);
  const [moveFoldersLoading, setMoveFoldersLoading] = useState(false);
  const [moveFoldersError, setMoveFoldersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const newFolderButton = useRef<HTMLButtonElement | null>(null);

  const commonParams = {
    view: query.view === "active" ? null : query.view,
    type: query.fileType === "all" ? null : query.fileType,
    sort: query.sort === "name" ? null : query.sort,
    direction: query.direction === "asc" ? null : query.direction,
  };
  const breadcrumbItems = [
    {
      label: "Files",
      href: buildUrl(entity, commonParams),
    },
    ...breadcrumbs.map((item) => ({
      label: item.displayName,
      href: buildUrl(entity, { ...commonParams, folder: item.nodeId }),
    })),
  ];

  function refresh() {
    router.refresh();
  }

  function prefetchFolder(nodeId: string) {
    router.prefetch(buildUrl(entity, { ...commonParams, folder: nodeId }));
  }

  async function loadMoveFolders() {
    setMoveFolders([]);
    setMoveFoldersError(null);
    setMoveFoldersLoading(true);
    try {
      const response = await fetch(`/api/documents/workspaces/${workspaceId}/folders`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as {
        folders?: DocumentFolderOption[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(body.folders)) {
        throw new Error(body.error ?? "Unable to load destination folders.");
      }
      setMoveFolders(body.folders);
    } catch (loadError) {
      setMoveFoldersError(loadError instanceof Error
        ? loadError.message
        : "Unable to load destination folders.");
    } finally {
      setMoveFoldersLoading(false);
    }
  }

  function openModal(next: Exclude<ModalState, null>) {
    setError(null);
    setName(next.type === "rename" ? next.node.displayName : "");
    setDestination("");
    setModal(next);
    if (next.type === "move") void loadMoveFolders();
  }

  function closeModal() {
    setModal(null);
    setError(null);
    setMoveFolders([]);
    setMoveFoldersError(null);
    setMoveFoldersLoading(false);
    requestAnimationFrame(() => newFolderButton.current?.focus());
  }

  function submitModal() {
    if (!modal) return;
    if (modal.type === "new-folder" || modal.type === "rename") {
      const validation = validateDocumentNodeName(name);
      if (validation) {
        setError(validation);
        return;
      }
    }
    startTransition(async () => {
      const result = modal.type === "new-folder"
        ? await createDocumentFolderAction({
            entity,
            workspaceId,
            parentNodeId: query.folderId,
            displayName: name,
          })
        : modal.type === "rename"
          ? await renameDocumentNodeAction({
              entity,
              nodeId: modal.node.nodeId,
              displayName: name,
            })
          : modal.type === "move"
            ? await moveDocumentNodeAction({
                entity,
                nodeId: modal.node.nodeId,
                targetParentNodeId: destination || null,
              })
            : modal.type === "delete"
              ? await deleteDocumentNodeAction({
                  entity,
                  nodeId: modal.node.nodeId,
                })
              : modal.type === "restore"
                ? await restoreDocumentNodeAction({
                    entity,
                    nodeId: modal.batch.rootNodeId,
                  })
                : await purgeDocumentNodeAction({
                    entity,
                    nodeId: modal.batch.rootNodeId,
                  });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeModal();
      refresh();
    });
  }

  async function download(node: DocumentWorkspaceNode) {
    setError(null);
    const response = await fetch(`/api/documents/nodes/${node.nodeId}/download`, {
      method: "POST",
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !body.url) {
      setError(body.error ?? "Unable to download this file.");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = body.url;
    anchor.download = node.displayName;
    anchor.rel = "noopener";
    anchor.click();
  }

  const noResults = query.search || query.fileType !== "all";
  const pageCount = Math.max(1, Math.ceil(totalCount / 100));

  return (
    <div className="space-y-4">
      {error ? <OperationalAlert variant="error" role="alert">{error}</OperationalAlert> : null}
      {metadata.cleanupAttentionRequired ? (
        <OperationalAlert variant="warning">
          Document cleanup requires administrator attention. Storage remains private and affected objects are not exposed.
        </OperationalAlert>
      ) : null}
      <OperationalPanel
        title={query.view === "deleted" ? "Deleted files" : "Files"}
        description={query.view === "deleted"
          ? "Restore deletion batches or permanently purge them from this shared workspace."
          : "Organize documents in folders and upload files securely."}
        contentClassName="space-y-4 p-4 sm:p-6"
        toolbar={(
          <OperationalToolbar
            search={(
              <form
                className="relative"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get("q")?.toString().trim();
                  router.push(buildUrl(entity, { ...commonParams, q: value || null }));
                }}
              >
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  name="q"
                  defaultValue={query.search}
                  size="toolbar"
                  className="pl-9"
                  placeholder={query.view === "deleted" ? "Search deleted files" : "Search all files"}
                  aria-label={query.view === "deleted" ? "Search deleted files" : "Search all files"}
                />
              </form>
            )}
            filters={(
              <>
                <select
                  aria-label="Filter by file type"
                  value={query.fileType}
                  className={selectClass}
                  onChange={(event) => router.push(buildUrl(entity, {
                    ...commonParams,
                    folder: query.folderId,
                    q: query.search,
                    type: event.target.value === "all" ? null : event.target.value,
                  }))}
                >
                  {DOCUMENT_FILE_TYPES.map((value) => <option key={value} value={value}>{value === "all" ? "All types" : value[0].toUpperCase() + value.slice(1)}</option>)}
                </select>
                <select
                  aria-label="Sort files"
                  value={query.sort}
                  className={selectClass}
                  onChange={(event) => router.push(buildUrl(entity, {
                    ...commonParams,
                    folder: query.folderId,
                    q: query.search,
                    sort: event.target.value === "name" ? null : event.target.value,
                  }))}
                >
                  {DOCUMENT_SORTS.map((value) => <option key={value} value={value}>Sort: {value}</option>)}
                </select>
                <select
                  aria-label="Sort direction"
                  value={query.direction}
                  className={selectClass}
                  onChange={(event) => router.push(buildUrl(entity, {
                    ...commonParams,
                    folder: query.folderId,
                    q: query.search,
                    direction: event.target.value === "asc" ? null : event.target.value,
                  }))}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </>
            )}
            actions={(
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {query.view === "active" && metadata.canWrite ? (
                  <>
                    <LazyFileUploadButton
                      entity={entity}
                      parentNodeId={query.folderId}
                      currentFolderName={breadcrumbs.at(-1)?.displayName ?? "Files root"}
                      visibleNodes={nodes}
                      onComplete={refresh}
                    />
                    <Button ref={newFolderButton} size="toolbar" variant="secondary" onClick={() => openModal({ type: "new-folder" })}>
                      <FolderPlus className="h-4 w-4" /> New folder
                    </Button>
                  </>
                ) : null}
                {metadata.canDelete ? (
                  <Button
                    size="toolbar"
                    variant="secondary"
                    onClick={() => router.push(buildUrl(entity, {
                      view: query.view === "deleted" ? null : "deleted",
                    }))}
                  >
                    {query.view === "deleted"
                      ? <Folder className="h-4 w-4" />
                      : <Trash2 className="h-4 w-4" />}
                    {query.view === "deleted" ? "Files" : "Recycle bin"}
                  </Button>
                ) : null}
              </div>
            )}
          />
        )}
      >
        {query.view === "deleted" ? (
          <>
            {query.search ? (
              <OperationalAlert variant="info">
                Searching deleted items for “{query.search}”.{" "}
                <button className="underline" onClick={() => router.push(buildUrl(entity, { view: "deleted" }))}>Clear search</button>
              </OperationalAlert>
            ) : null}
            {deletedBatches.length === 0 ? (
              <OperationalEmptyState
                icon={<Trash2 className="h-6 w-6" />}
                title={noResults ? "No matching deleted items" : "Recycle bin is empty"}
                description={noResults
                  ? "Adjust your search or file-type filter."
                  : "Deleted files and folders will appear here as complete deletion batches."}
              />
            ) : (
              <OperationalTable aria-label="Deleted files">
                <OperationalTableHeader>
                  <OperationalTableRow>
                    <OperationalTableHead>Name</OperationalTableHead>
                    <OperationalTableHead className="hidden md:table-cell">Deleted by</OperationalTableHead>
                    <OperationalTableHead className="hidden sm:table-cell">Deleted</OperationalTableHead>
                    <OperationalTableHead className="hidden lg:table-cell">Original folder</OperationalTableHead>
                    <OperationalTableHead className="hidden xl:table-cell">Size</OperationalTableHead>
                    <OperationalTableHead className="w-14"><span className="sr-only">Actions</span></OperationalTableHead>
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {deletedBatches.map((batch) => (
                    <OperationalTableRow key={batch.deletionBatchId}>
                      <OperationalTableCell className="min-w-[220px] max-w-[480px]">
                        <div className="flex items-center gap-3">
                          {batch.kind === "folder"
                            ? <Folder className="h-5 w-5 text-[var(--text-muted)]" />
                            : <File className="h-5 w-5 text-[var(--text-muted)]" />}
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={batch.displayName}>{batch.displayName}</p>
                            {batch.itemCount > 1 ? (
                              <p className="text-xs text-[var(--text-secondary)]">{batch.itemCount} items in this deletion batch</p>
                            ) : null}
                          </div>
                        </div>
                      </OperationalTableCell>
                      <OperationalTableCell className="hidden md:table-cell">{batch.deletedByName}</OperationalTableCell>
                      <OperationalTableCell className="hidden sm:table-cell">{formatDate(batch.deletedAt)}</OperationalTableCell>
                      <OperationalTableCell className="hidden lg:table-cell">{batch.originalParentName ?? "Files root"}</OperationalTableCell>
                      <OperationalTableCell className="hidden xl:table-cell">{formatDocumentBytes(batch.byteSize)}</OperationalTableCell>
                      <OperationalTableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for deleted ${batch.displayName}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {metadata.canDelete ? (
                              <DropdownMenuItem onSelect={() => openModal({ type: "restore", batch })}>
                                <ArchiveRestore className="mr-2 h-4 w-4" />Restore batch
                              </DropdownMenuItem>
                            ) : null}
                            {metadata.canPurge ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-[var(--error)]" onSelect={() => openModal({ type: "purge", batch })}>
                                  <Trash2 className="mr-2 h-4 w-4" />Permanently purge
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </OperationalTableCell>
                    </OperationalTableRow>
                  ))}
                </OperationalTableBody>
              </OperationalTable>
            )}
          </>
        ) : (
          <>
            {query.search ? (
              <OperationalAlert variant="info">
                Searching the full workspace for “{query.search}”. <button className="underline" onClick={() => router.push(buildUrl(entity, { ...commonParams, folder: query.folderId }))}>Clear search</button>
              </OperationalAlert>
            ) : (
              <div className="overflow-x-auto pb-1">
                <OperationalBreadcrumbs items={breadcrumbItems} className="min-w-max flex-nowrap" />
              </div>
            )}

            {nodes.length === 0 ? (
              <OperationalEmptyState
                icon={<Folder className="h-6 w-6" />}
                title={noResults ? "No matching files" : query.folderId ? "This folder is empty" : "No files yet"}
                description={noResults
                  ? "Adjust your search or file-type filter."
                  : metadata.canWrite
                    ? "Create a folder or upload files to start organizing this workspace."
                    : "This shared workspace does not contain any files yet."}
              />
            ) : (
              <OperationalTable aria-label="Files workspace">
                <OperationalTableHeader>
                  <OperationalTableRow>
                    <OperationalTableHead>Name</OperationalTableHead>
                    <OperationalTableHead className="hidden md:table-cell">Owner</OperationalTableHead>
                    <OperationalTableHead className="hidden sm:table-cell">Modified</OperationalTableHead>
                    <OperationalTableHead className="hidden lg:table-cell">File size</OperationalTableHead>
                    <OperationalTableHead className="w-14"><span className="sr-only">Actions</span></OperationalTableHead>
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {nodes.map((node) => (
                    <OperationalTableRow key={node.nodeId}>
                      <OperationalTableCell className="min-w-[220px] max-w-[480px]">
                        {node.kind === "folder" ? (
                          <Link
                            href={buildUrl(entity, { ...commonParams, folder: node.nodeId })}
                            prefetch={false}
                            className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
                            onMouseEnter={() => prefetchFolder(node.nodeId)}
                            onFocus={() => prefetchFolder(node.nodeId)}
                          >
                            <NodeIcon node={node} />
                            <span className="truncate font-medium" title={node.displayName}>{node.displayName}</span>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
                            onClick={() => setDetails(node)}
                          >
                            <NodeIcon node={node} />
                            <span className="truncate font-medium" title={node.displayName}>{node.displayName}</span>
                          </button>
                        )}
                      </OperationalTableCell>
                      <OperationalTableCell className="hidden md:table-cell">{node.ownerName}</OperationalTableCell>
                      <OperationalTableCell className="hidden sm:table-cell">{formatDate(node.updatedAt)}</OperationalTableCell>
                      <OperationalTableCell className="hidden lg:table-cell">{formatDocumentBytes(node.byteSize)}</OperationalTableCell>
                      <OperationalTableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${node.displayName}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {node.kind === "file" ? <DropdownMenuItem onSelect={() => void download(node)}><Download className="mr-2 h-4 w-4" />Download</DropdownMenuItem> : null}
                            <DropdownMenuItem onSelect={() => setDetails(node)}>Details</DropdownMenuItem>
                            {metadata.canWrite ? (
                              <>
                                <DropdownMenuItem onSelect={() => openModal({ type: "rename", node })}>Rename</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => openModal({ type: "move", node })}>Move</DropdownMenuItem>
                              </>
                            ) : null}
                            {metadata.canDelete ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-[var(--error)]" onSelect={() => openModal({ type: "delete", node })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </OperationalTableCell>
                    </OperationalTableRow>
                  ))}
                </OperationalTableBody>
              </OperationalTable>
            )}
          </>
        )}
        {pageCount > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={query.page <= 1} onClick={() => router.push(buildUrl(entity, { ...commonParams, folder: query.folderId, q: query.search, page: String(query.page - 1) }))}>Previous</Button>
            <span className="text-sm text-[var(--text-secondary)]">Page {query.page} of {pageCount}</span>
            <Button variant="secondary" size="sm" disabled={query.page >= pageCount} onClick={() => router.push(buildUrl(entity, { ...commonParams, folder: query.folderId, q: query.search, page: String(query.page + 1) }))}>Next</Button>
          </div>
        ) : null}
      </OperationalPanel>

      <Dialog open={modal !== null} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-md p-6" onOpenAutoFocus={(event) => {
          if (
            modal?.type === "delete"
            || modal?.type === "move"
            || modal?.type === "restore"
            || modal?.type === "purge"
          ) return;
          event.preventDefault();
          requestAnimationFrame(() => document.getElementById("document-node-name")?.focus());
        }}>
          <DialogHeader>
            <DialogTitle>
              {modal?.type === "new-folder"
                ? "New folder"
                : modal?.type === "rename"
                  ? "Rename item"
                  : modal?.type === "move"
                    ? "Move item"
                    : modal?.type === "restore"
                      ? "Restore deletion batch"
                      : modal?.type === "purge"
                        ? "Permanently purge"
                        : "Delete item"}
            </DialogTitle>
            <DialogDescription>
              {modal?.type === "delete" && modal.node.kind === "folder"
                ? "This folder and its entire subtree will be moved to deleted items. Storage objects are retained."
                : modal?.type === "delete"
                  ? "This file will be soft deleted. Its immutable versions are retained."
                  : modal?.type === "move"
                    ? "Choose a destination folder. Moving only changes hierarchy metadata."
                    : modal?.type === "restore"
                      ? `Restore “${modal.batch.displayName}” and all ${modal.batch.itemCount} item${modal.batch.itemCount === 1 ? "" : "s"} to the original hierarchy.`
                      : modal?.type === "purge"
                        ? `Permanently remove “${modal.batch.displayName}” metadata and queue ${modal.batch.itemCount} item${modal.batch.itemCount === 1 ? "" : "s"} for asynchronous Storage deletion. This cannot be undone.`
                        : "Names must be unique within the folder."}
            </DialogDescription>
          </DialogHeader>
          {modal?.type === "new-folder" || modal?.type === "rename" ? (
            <form onSubmit={(event) => { event.preventDefault(); submitModal(); }}>
              <Input id="document-node-name" className="mt-4" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={error ? "document-modal-error" : undefined} />
            </form>
          ) : null}
          {modal?.type === "move" ? (
            moveFoldersLoading ? (
              <p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">Loading destination folders…</p>
            ) : moveFoldersError ? (
              <div className="mt-4 space-y-3" role="alert">
                <p className="text-sm text-[var(--error)]">{moveFoldersError}</p>
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadMoveFolders()}>Retry</Button>
              </div>
            ) : (
              <select className={`${selectClass} mt-4 w-full`} value={destination} onChange={(event) => setDestination(event.target.value)} aria-label="Destination folder">
                <option value="">Files root</option>
                {moveFolders
                .filter(
                  (folder) =>
                    folder.nodeId !== modal.node.nodeId &&
                    !(
                      modal.node.kind === "folder" &&
                      isDocumentFolderDescendant(
                        folder.nodeId,
                        modal.node.nodeId,
                        moveFolders,
                      )
                    ),
                )
                .map((folder) => (
                  <option key={folder.nodeId} value={folder.nodeId}>
                    {getDocumentFolderPath(folder.nodeId, moveFolders)}
                  </option>
                ))}
              </select>
            )
          ) : null}
          {error ? <p id="document-modal-error" role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p> : null}
          <DialogFooter className="mt-6">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button variant={modal?.type === "delete" || modal?.type === "purge" ? "destructive" : "default"} disabled={pending || (modal?.type === "move" && (moveFoldersLoading || Boolean(moveFoldersError)))} onClick={submitModal}>
              {pending
                ? "Saving…"
                : modal?.type === "delete"
                  ? "Delete"
                  : modal?.type === "move"
                    ? "Move"
                    : modal?.type === "restore"
                      ? "Restore"
                      : modal?.type === "purge"
                        ? "Permanently purge"
                        : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={details !== null} onOpenChange={(open) => { if (!open) setDetails(null); }}>
        <SheetContent side="right" aria-labelledby="file-details-title" className="w-full overflow-y-auto sm:w-[420px]">
          {details ? (
            <div className="space-y-6">
              <div>
                <h2 id="file-details-title" className="pr-8 text-xl font-semibold">File details</h2>
                <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">{details.displayName}</p>
              </div>
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-[var(--text-secondary)]">Type</dt><dd>{details.kind === "folder" ? "Folder" : details.fileExtension?.toUpperCase() ?? "File"}</dd>
                <dt className="text-[var(--text-secondary)]">Owner</dt><dd>{details.ownerName}</dd>
                <dt className="text-[var(--text-secondary)]">Created</dt><dd>{formatDate(details.createdAt)}</dd>
                <dt className="text-[var(--text-secondary)]">Modified</dt><dd>{formatDate(details.updatedAt)}</dd>
                <dt className="text-[var(--text-secondary)]">Size</dt><dd>{formatDocumentBytes(details.byteSize)}</dd>
                <dt className="text-[var(--text-secondary)]">Version</dt><dd>{details.versionNumber ?? "—"}</dd>
                <dt className="text-[var(--text-secondary)]">State</dt><dd className="capitalize">{details.uploadState ?? "active"}</dd>
                <dt className="text-[var(--text-secondary)]">Folder</dt><dd>{details.parentName ?? "Files root"}</dd>
                <dt className="text-[var(--text-secondary)]">SHA-256</dt><dd className="break-all font-mono text-xs">{details.sha256Checksum ?? "Not recorded"}</dd>
              </dl>
              {details.kind === "file" ? <Button onClick={() => void download(details)}><Download className="h-4 w-4" />Download</Button> : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
