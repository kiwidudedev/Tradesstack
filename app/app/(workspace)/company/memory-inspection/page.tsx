import { requirePlatformAdmin } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  getOrganizationMemoryDetail,
  getOrganizationMemoryHistory,
  getOrganizationMemoryLinkedClassifications,
  getOrganizationMemoryLinkedEvents,
  getOrganizationMemoryProvenance,
  listOrganizationMemories,
} from "@/lib/organization-memory-server";
import { MemoryExplorerWorkspace } from "./MemoryExplorerWorkspace";

const DEFAULT_FALLBACK = "/app/dashboard";

function normalizeOptionalString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" && value[0].trim().length > 0 ? value[0].trim() : null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalBoolean(value: string | string[] | undefined) {
  const normalized = normalizeOptionalString(value);
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
}

function normalizePositiveInteger(value: string | string[] | undefined, fallback: number) {
  const normalized = normalizeOptionalString(value);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

export default async function CompanyMemoryInspectionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin("admin", DEFAULT_FALLBACK);

  const resolvedSearchParams = (await searchParams) ?? {};
  const currentMember = await getCurrentOrganizationMember();
  const organizationId = normalizeOptionalString(resolvedSearchParams.organizationId) ?? currentMember?.organization_id ?? null;

  if (!organizationId) {
    return (
      <MemoryExplorerWorkspace
        organizationId=""
        list={{
          organizationId: "",
          page: 1,
          pageSize: 12,
          totalCount: 0,
          totalPages: 1,
          query: null,
          memoryCategory: null,
          memoryType: null,
          isActive: null,
          items: [],
        }}
        selectedMemoryId={null}
        detail={null}
        provenance={null}
        events={null}
        classifications={null}
        history={null}
        availableCategories={[]}
        availableTypes={[]}
        detailErrorMessage="An organizationId is required to inspect organization memory."
      />
    );
  }

  const list = await listOrganizationMemories({
    organizationId,
    page: normalizePositiveInteger(resolvedSearchParams.page, 1),
    pageSize: normalizePositiveInteger(resolvedSearchParams.pageSize, 12),
    query: normalizeOptionalString(resolvedSearchParams.q),
    memoryCategory: normalizeOptionalString(resolvedSearchParams.memoryCategory),
    memoryType: normalizeOptionalString(resolvedSearchParams.memoryType),
    isActive: normalizeOptionalBoolean(resolvedSearchParams.isActive),
  });

  const selectedMemoryId = normalizeOptionalString(resolvedSearchParams.memoryId) ?? list.items[0]?.id ?? null;
  const requestedSelectedMemoryId = normalizeOptionalString(resolvedSearchParams.memoryId);
  const availableCategories = Array.from(new Set(list.items.map((item) => item.memoryCategory))).sort();
  const availableTypes = Array.from(new Set(list.items.map((item) => item.memoryType))).sort();

  let detailErrorMessage: string | null = null;
  let detail = null;
  let provenance = null;
  let events = null;
  let classifications = null;
  let history = null;

  if (selectedMemoryId) {
    [detail, provenance, events, classifications, history] = await Promise.all([
      getOrganizationMemoryDetail(organizationId, selectedMemoryId),
      getOrganizationMemoryProvenance(organizationId, selectedMemoryId),
      getOrganizationMemoryLinkedEvents(organizationId, selectedMemoryId),
      getOrganizationMemoryLinkedClassifications(organizationId, selectedMemoryId),
      getOrganizationMemoryHistory(organizationId, selectedMemoryId),
    ]);

    if (requestedSelectedMemoryId && !detail) {
      detailErrorMessage = "The requested memory was not found in the selected organization.";
    }
  }

  return (
    <MemoryExplorerWorkspace
      organizationId={organizationId}
      list={list}
      selectedMemoryId={selectedMemoryId}
      detail={detail}
      provenance={provenance}
      events={events}
      classifications={classifications}
      history={history}
      availableCategories={availableCategories}
      availableTypes={availableTypes}
      detailErrorMessage={detailErrorMessage}
    />
  );
}
