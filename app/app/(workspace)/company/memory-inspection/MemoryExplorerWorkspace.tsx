import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Database,
  FileStack,
  Filter,
  GitBranch,
  Search,
  Sparkles,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalBreadcrumbs } from "@/components/app/OperationalBreadcrumbs";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalKpiCard } from "@/components/app/OperationalKpiCard";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
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
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  ListOrganizationMemoriesOutput,
  OrganizationMemoryDetail,
  OrganizationMemoryHistoryOutput,
  OrganizationMemoryLinkedClassificationsOutput,
  OrganizationMemoryLinkedEventsOutput,
  OrganizationMemoryProvenance,
} from "@/lib/organization-memory-server";

type MemoryExplorerWorkspaceProps = {
  organizationId: string;
  list: ListOrganizationMemoriesOutput;
  selectedMemoryId: string | null;
  detail: OrganizationMemoryDetail | null;
  provenance: OrganizationMemoryProvenance | null;
  events: OrganizationMemoryLinkedEventsOutput | null;
  classifications: OrganizationMemoryLinkedClassificationsOutput | null;
  history: OrganizationMemoryHistoryOutput | null;
  availableCategories: string[];
  availableTypes: string[];
  detailErrorMessage?: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(2);
}

function getConfidenceTone(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "draft" as const;
  }
  if (value >= 0.8) {
    return "approved" as const;
  }
  if (value >= 0.6) {
    return "pending" as const;
  }
  return "overdue" as const;
}

function getMemoryStateBadge(isActive: boolean) {
  return isActive ? "active" as const : "completed" as const;
}

function buildQueryString(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

function extractRelatedProjects(events: OrganizationMemoryLinkedEventsOutput | null) {
  const grouped = new Map<string, { label: string; eventCount: number }>();

  for (const event of events?.events ?? []) {
    const key = event.projectId ?? event.opportunityId ?? "unscoped";
    const label = event.projectId ?? event.opportunityId ?? "Unscoped";
    const current = grouped.get(key) ?? { label, eventCount: 0 };
    current.eventCount += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((left, right) => right.eventCount - left.eventCount);
}

function renderMetadataValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "—";
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return String(value);
}

function formatDaysBetween(older: string | null | undefined, newer: string | null | undefined) {
  if (!older || !newer) {
    return "—";
  }

  const olderTs = new Date(older).getTime();
  const newerTs = new Date(newer).getTime();
  if (!Number.isFinite(olderTs) || !Number.isFinite(newerTs) || newerTs < olderTs) {
    return "—";
  }

  return `${((newerTs - olderTs) / 86_400_000).toFixed(1)} days`;
}

function getRetirementState(memory: OrganizationMemoryDetail["memory"]) {
  if (memory.retiredAt || memory.retiredLifecycleHistoryId || memory.retirementBasisHash) {
    return "Retired";
  }
  if (memory.supersededAt || memory.supersededByMemoryId) {
    return "Superseded";
  }
  return "Active";
}

function getRetirementStateBadge(state: string) {
  if (state === "Retired") {
    return "overdue" as const;
  }
  if (state === "Superseded") {
    return "pending" as const;
  }
  return "approved" as const;
}

export function MemoryExplorerWorkspace({
  organizationId,
  list,
  selectedMemoryId,
  detail,
  provenance,
  events,
  classifications,
  history,
  availableCategories,
  availableTypes,
  detailErrorMessage,
}: MemoryExplorerWorkspaceProps) {
  const selected = detail?.memory ?? null;
  const retirementState = selected ? getRetirementState(selected) : null;
  const latestRetirementEvaluation = history?.relatedRetirement.evaluations[0] ?? null;
  const relatedProjects = extractRelatedProjects(events);
  const listBaseParams = {
    organizationId,
    q: list.query,
    memoryCategory: list.memoryCategory,
    memoryType: list.memoryType,
    isActive: list.isActive,
    page: list.page,
  };
  const prevPageQuery = buildQueryString({ ...listBaseParams, page: Math.max(1, list.page - 1) });
  const nextPageQuery = buildQueryString({ ...listBaseParams, page: Math.min(list.totalPages, list.page + 1) });

  return (
    <main className="space-y-6 bg-[var(--background)] pb-8">
      <OperationalBreadcrumbs
        items={[
          { label: "Company", href: "/app/company/cost-codes" },
          { label: "Memory Inspection" },
        ]}
      />

      <OperationalModuleHeader
        title="Memory Inspection & Explainability"
        description="Inspect why an organization memory exists, which semantic pool produced it, and which raw evidence and classifications support it."
        actions={selected ? <StatusBadge status={getMemoryStateBadge(selected.isActive)}>{selected.isActive ? "Active" : "Inactive"}</StatusBadge> : null}
      />

      {detailErrorMessage ? (
        <OperationalAlert variant="warning">
          {detailErrorMessage}
        </OperationalAlert>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr),320px]">
        <OperationalPanel
          title="Organization Memories"
          description={`${list.totalCount} memories`}
          toolbar={(
            <form method="get">
              <input type="hidden" name="organizationId" value={organizationId} />
              <OperationalToolbar
                search={(
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      name="q"
                      defaultValue={list.query ?? ""}
                      placeholder="Search memories..."
                      className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>
                )}
                filters={(
                  <>
                    <select
                      name="memoryCategory"
                      defaultValue={list.memoryCategory ?? ""}
                      className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]"
                    >
                      <option value="">All categories</option>
                      {availableCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      name="memoryType"
                      defaultValue={list.memoryType ?? ""}
                      className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]"
                    >
                      <option value="">All types</option>
                      {availableTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      name="isActive"
                      defaultValue={list.isActive === null ? "" : String(list.isActive)}
                      className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]"
                    >
                      <option value="">Any state</option>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </>
                )}
                actions={(
                  <Button type="submit" variant="secondary" size="toolbar">
                    <Filter className="h-4 w-4" />
                    Apply
                  </Button>
                )}
              />
            </form>
          )}
          className="h-full"
        >
          <div className="space-y-3">
            {list.items.length === 0 ? (
              <OperationalEmptyState
                title="No memories matched these filters."
                description="Try broadening the search or clearing one of the active filters."
              />
            ) : (
              list.items.map((item) => {
                const href = `/app/company/memory-inspection?${buildQueryString({
                  organizationId,
                  memoryId: item.id,
                  page: list.page,
                  pageSize: list.pageSize,
                  q: list.query,
                  memoryCategory: list.memoryCategory,
                  memoryType: list.memoryType,
                  isActive: list.isActive,
                })}`;

                const isSelected = selectedMemoryId === item.id;
                return (
                  <Link key={item.id} href={href} className="block">
                    <Card className={isSelected ? "border-[var(--info)] shadow-[var(--shadow-md)]" : "hover:border-[var(--info-light)]"}>
                      <div className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-base font-semibold text-[var(--text-primary)]">
                              {item.title}
                            </p>
                            <p className="mt-2 text-sm text-[var(--text-secondary)]">
                              {item.memoryCategory}
                            </p>
                          </div>
                          <StatusBadge status={getMemoryStateBadge(item.isActive)}>
                            {item.isActive ? "Active" : "Inactive"}
                          </StatusBadge>
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {item.summary || "No summary stored for this memory."}
                        </p>
                        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                          <span>{item.memoryType}</span>
                          <span>Conf: {formatConfidence(item.confidenceScore)}</span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
          </div>

          {list.totalPages > 1 ? (
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button
                asChild
                variant="secondary"
                size="sm"
                className={list.page <= 1 ? "pointer-events-none opacity-50" : ""}
              >
                <Link href={`/app/company/memory-inspection?${prevPageQuery}`}>Previous</Link>
              </Button>
              <p className="text-sm text-[var(--text-secondary)]">
                Page {list.page} of {list.totalPages}
              </p>
              <Button
                asChild
                variant="secondary"
                size="sm"
                className={list.page >= list.totalPages ? "pointer-events-none opacity-50" : ""}
              >
                <Link href={`/app/company/memory-inspection?${nextPageQuery}`}>Next</Link>
              </Button>
            </div>
          ) : null}
        </OperationalPanel>

        <div className="space-y-6">
          {!selected || !detail ? (
            <OperationalEmptyState
              title="Select a memory to inspect."
              description="Choose a memory from the explorer to see its statement, provenance chain, supporting evidence, and linked classifications."
              icon={<Database className="h-5 w-5" />}
            />
          ) : (
            <>
              <OperationalPanel>
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={getMemoryStateBadge(selected.isActive)}>
                      {selected.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                    <StatusBadge status="draft">{selected.memoryCategory}</StatusBadge>
                    <StatusBadge status="pending">{selected.memoryType}</StatusBadge>
                    {selected.memorySignature ? (
                      <span className="text-sm text-[var(--text-secondary)]">{selected.memorySignature}</span>
                    ) : null}
                  </div>
                  <div>
                    <h2 className="text-[30px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                      {selected.title}
                    </h2>
                    <p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">
                      {selected.summary || "No summary stored for this memory."}
                    </p>
                  </div>
                </div>
              </OperationalPanel>

              <section className="grid gap-4 md:grid-cols-4">
                <OperationalKpiCard
                  label="Confidence"
                  value={formatConfidence(selected.confidenceScore)}
                  helper={`${provenance?.summary.rawEventCount ?? 0} evidence events`}
                  icon={<Sparkles className="h-5 w-5" />}
                  tone="sage"
                />
                <OperationalKpiCard
                  label="Classifications"
                  value={provenance?.summary.classificationCount ?? 0}
                  helper={`${classifications?.classifications.length ?? 0} resolved`}
                  icon={<FileStack className="h-5 w-5" />}
                  tone="navy"
                />
                <OperationalKpiCard
                  label="First Created"
                  value={formatShortDate(selected.createdAt)}
                  helper={formatDateTime(selected.createdAt)}
                  icon={<Activity className="h-5 w-5" />}
                  tone="amber"
                />
                <OperationalKpiCard
                  label="Last Reinforced"
                  value={formatShortDate(selected.lastReinforcedAt)}
                  helper={formatDateTime(selected.lastReinforcedAt)}
                  icon={<GitBranch className="h-5 w-5" />}
                  tone="orange"
                />
              </section>

              <OperationalPanel
                title="Confidence State"
                description="Authoritative current confidence fields plus immutable confidence evolution history."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Current confidence metadata</p>
                    <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Current confidence</dt>
                        <dd>{formatConfidence(selected.confidenceScore)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Base confidence</dt>
                        <dd>{formatConfidence(selected.baseConfidenceScore)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Calculation version</dt>
                        <dd>{selected.confidenceCalculationVersion}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Last calculated at</dt>
                        <dd>{formatDateTime(selected.lastConfidenceCalculatedAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Reason summary</dt>
                        <dd>{selected.confidenceReasonSummary ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Exact confidence linkage</p>
                      <StatusBadge status="approved">authoritative · immutable · exact</StatusBadge>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Last confidence history</dt>
                        <dd>{selected.lastConfidenceHistoryId ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Memory revision</dt>
                        <dd>{selected.sourceRevisionHash ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </OperationalPanel>

              <OperationalPanel
                title="Reinforcement State"
                description="Authoritative reinforcement fields stored directly on the memory item."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Reinforcement facts</p>
                    <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Count</dt>
                        <dd>{selected.reinforcementCount}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Last reinforced at</dt>
                        <dd>{formatDateTime(selected.lastReinforcedAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Supporting classifications credited</dt>
                        <dd>{selected.reinforcedSupportingClassificationCount}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Exact reinforcement linkage</p>
                      <StatusBadge status="approved">authoritative · immutable · exact</StatusBadge>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Synthesis history</dt>
                        <dd>{selected.lastReinforcedSynthesisHistoryId ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Lifecycle history</dt>
                        <dd>{selected.lastReinforcedLifecycleHistoryId ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Source revision</dt>
                        <dd>{selected.lastReinforcedSourceRevisionHash ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--text-primary)]">Basis hash</dt>
                        <dd className="break-all">{selected.reinforcementBasisHash ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </OperationalPanel>

              {selected.contradictionCount > 0
                || selected.lastContradictedAt
                || selected.lastContradictedSynthesisHistoryId
                || selected.lastContradictedLifecycleHistoryId
                || selected.lastContradictedSourceRevisionHash
                || selected.contradictionBasisHash
                || selected.contradictedSupportingClassificationCount > 0
                || selected.contradictionStrengthScore !== null ? (
                  <OperationalPanel
                    title="Contradiction State"
                    description="Authoritative contradiction fields stored directly on the memory item. No contradiction UI is shown until contradiction metadata exists."
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Contradiction facts</p>
                        <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Count</dt>
                            <dd>{selected.contradictionCount}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Last contradicted at</dt>
                            <dd>{formatDateTime(selected.lastContradictedAt)}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Contradicting classifications credited</dt>
                            <dd>{selected.contradictedSupportingClassificationCount}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Strength score</dt>
                            <dd>{selected.contradictionStrengthScore === null ? "—" : formatConfidence(selected.contradictionStrengthScore)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Exact contradiction linkage</p>
                          <StatusBadge status="approved">authoritative · immutable · exact</StatusBadge>
                        </div>
                        <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Synthesis history</dt>
                            <dd>{selected.lastContradictedSynthesisHistoryId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Lifecycle history</dt>
                            <dd>{selected.lastContradictedLifecycleHistoryId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Source revision</dt>
                            <dd>{selected.lastContradictedSourceRevisionHash ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Basis hash</dt>
                            <dd className="break-all">{selected.contradictionBasisHash ?? "—"}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </OperationalPanel>
                ) : null}

              {selected.supersededAt
                || selected.supersededByMemoryId
                || selected.supersededLifecycleHistoryId
                || selected.supersededBySynthesisHistoryId
                || selected.supersessionBasisHash
                || selected.supersessionReasonSummary ? (
                  <OperationalPanel
                    title="Supersession State"
                    description="Authoritative supersession fields stored directly on the memory item when exact supersession has occurred. Legacy-only linkage remains inferred until exact fields exist."
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Supersession facts</p>
                        <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Replacement memory</dt>
                            <dd>{selected.supersededByMemoryId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Superseded at</dt>
                            <dd>{formatDateTime(selected.supersededAt)}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Reason</dt>
                            <dd>{selected.supersessionReasonSummary ?? "—"}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Exact supersession linkage</p>
                          <StatusBadge status={selected.supersededAt || selected.supersededLifecycleHistoryId || selected.supersededBySynthesisHistoryId ? "approved" : "pending"}>
                            {selected.supersededAt || selected.supersededLifecycleHistoryId || selected.supersededBySynthesisHistoryId
                              ? "authoritative · immutable · exact"
                              : "legacy · inferred"}
                          </StatusBadge>
                        </div>
                        <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Lifecycle history</dt>
                            <dd>{selected.supersededLifecycleHistoryId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Synthesis history</dt>
                            <dd>{selected.supersededBySynthesisHistoryId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Domain signature</dt>
                            <dd className="break-all">{selected.memoryDomainSignature ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-[var(--text-primary)]">Basis hash</dt>
                            <dd className="break-all">{selected.supersessionBasisHash ?? "—"}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </OperationalPanel>
                ) : null}

              <OperationalPanel
                title="Retirement State"
                description="Current retirement state, exact retirement linkage when present, and the latest deterministic evaluator outcome."
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={getRetirementStateBadge(retirementState ?? "Active")}>
                      {retirementState ?? "Active"}
                    </StatusBadge>
                    <StatusBadge status={selected.retiredAt || selected.retiredLifecycleHistoryId ? "approved" : "pending"}>
                      {selected.retiredAt || selected.retiredLifecycleHistoryId
                        ? "authoritative · immutable · exact"
                        : "authoritative · exact"}
                    </StatusBadge>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Current retirement state</p>
                      <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                        <div>
                          <dt className="font-medium text-[var(--text-primary)]">State</dt>
                          <dd>{retirementState ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-[var(--text-primary)]">Retired at</dt>
                          <dd>{formatDateTime(selected.retiredAt)}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-[var(--text-primary)]">Reason</dt>
                          <dd>{selected.retirementReasonSummary ?? "No retirement is currently recorded on this memory."}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Exact retirement linkage</p>
                      <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                        <div>
                          <dt className="font-medium text-[var(--text-primary)]">Lifecycle history</dt>
                          <dd>{selected.retiredLifecycleHistoryId ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-[var(--text-primary)]">Synthesis history</dt>
                          <dd>{selected.retiredBySynthesisHistoryId ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-[var(--text-primary)]">Basis hash</dt>
                          <dd className="break-all">{selected.retirementBasisHash ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Latest retirement evaluation</p>
                      <StatusBadge status={latestRetirementEvaluation?.evaluationOutcome === "retired" ? "overdue" : latestRetirementEvaluation ? "pending" : "draft"}>
                        {latestRetirementEvaluation?.evaluationOutcome ?? "no evaluation"}
                      </StatusBadge>
                    </div>
                    {latestRetirementEvaluation ? (
                      <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                        <p>{latestRetirementEvaluation.evaluationSummary}</p>
                        <p>
                          Queue {latestRetirementEvaluation.id}
                          {" · "}Completed {formatDateTime(latestRetirementEvaluation.lastCompletedAt)}
                          {" · "}Reason {latestRetirementEvaluation.lastNoActionReason ?? latestRetirementEvaluation.evaluationOutcome}
                        </p>
                        {latestRetirementEvaluation.replacementSearchExplanation ? (
                          <p>{latestRetirementEvaluation.replacementSearchExplanation}</p>
                        ) : null}
                        {latestRetirementEvaluation.replacementCandidate ? (
                          <p>
                            Replacement {latestRetirementEvaluation.replacementCandidate.id}
                            {" · "}Conf {formatConfidence(latestRetirementEvaluation.replacementCandidate.confidenceScore)}
                            {" · "}Reinforcements {latestRetirementEvaluation.replacementCandidate.reinforcementCount}
                            {" · "}Supporting classifications {latestRetirementEvaluation.replacementCandidate.reinforcedSupportingClassificationCount}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        No retirement evaluation queue outcome has been recorded for this memory yet.
                      </p>
                    )}
                  </div>
                </div>
              </OperationalPanel>

              <OperationalPanel
                title="Memory Statement"
                description="Current stored statement and payload exactly as persisted on the memory item."
              >
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Summary
                    </p>
                    <p className="mt-2 text-[15px] leading-7 text-[var(--text-secondary)]">
                      {selected.summary || "No summary stored."}
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Evidence Summary</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-secondary)]">
                        {JSON.stringify(detail.evidenceSummary, null, 2)}
                      </pre>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Memory Value</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-secondary)]">
                        {JSON.stringify(detail.memoryValue, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </OperationalPanel>

              <OperationalPanel
                title="Provenance Chain"
                description="Direct provenance links recorded on the memory item, revalidated against org-scoped source tables."
              >
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    {
                      label: "Memory",
                      helper: "This memory",
                      value: 1,
                      badge: "active" as const,
                    },
                    {
                      label: "Semantic Pool",
                      helper: provenance?.semanticPoolLinks[0]?.semanticPoolId ?? "No pool link",
                      value: provenance?.summary.semanticPoolCount ?? 0,
                      badge: "pending" as const,
                    },
                    {
                      label: "Classifications",
                      helper: `${provenance?.summary.classificationCount ?? 0} linked`,
                      value: classifications?.classifications.length ?? 0,
                      badge: "draft" as const,
                    },
                    {
                      label: "Evidence Events",
                      helper: `${provenance?.summary.rawEventCount ?? 0} raw events`,
                      value: events?.events.length ?? 0,
                      badge: "approved" as const,
                    },
                  ].map((item, index) => (
                    <div key={item.label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={item.badge}>{item.label}</StatusBadge>
                        {index < 3 ? <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" /> : null}
                      </div>
                      <p className="mt-4 text-[24px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                        {item.value}
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.helper}</p>
                    </div>
                  ))}
                </div>
                {!provenance?.completeness.isComplete ? (
                  <OperationalAlert variant="warning" className="mt-4">
                    Some provenance links point at source rows that are no longer available. Missing rows are flagged in the provenance and history responses.
                  </OperationalAlert>
                ) : null}
              </OperationalPanel>

              {detail.semanticPoolSummary ? (
                <OperationalPanel
                  title="Semantic Pool"
                  description="Seed semantic pool linked to this memory through organization_memory_links."
                  actions={(
                    <StatusBadge status="pending">
                      {detail.semanticPoolSummary.maturityStatus}
                    </StatusBadge>
                  )}
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),220px]">
                    <div className="space-y-3">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">
                        {detail.semanticPoolSummary.domainLabel ?? "Unnamed semantic pool"}
                      </p>
                      <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
                        {detail.semanticPoolSummary.domainSummary || detail.semanticPoolSummary.groupingRationale || "No semantic pool description stored."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status="draft">Included {detail.semanticPoolSummary.includedCount}</StatusBadge>
                        <StatusBadge status="pending">Uncertain {detail.semanticPoolSummary.uncertainCount}</StatusBadge>
                        <StatusBadge status="approved">Projects {detail.semanticPoolSummary.projectCount}</StatusBadge>
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Pool Metadata</p>
                      <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                        <div className="flex items-center justify-between gap-3">
                          <dt>Pool ID</dt>
                          <dd className="text-right text-[var(--text-primary)]">{detail.semanticPoolSummary.id}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>Status</dt>
                          <dd className="text-right text-[var(--text-primary)]">{detail.semanticPoolSummary.poolStatus}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>Average confidence</dt>
                          <dd className="text-right text-[var(--text-primary)]">{formatConfidence(detail.semanticPoolSummary.averageConfidence)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </OperationalPanel>
              ) : null}

              <OperationalPanel
                title={`Supporting Evidence (${events?.events.length ?? 0} events)`}
                description="Raw intelligence events linked directly to this memory item."
              >
                {events && events.events.length > 0 ? (
                  <OperationalTable>
                    <OperationalTableHeader>
                      <OperationalTableRow>
                        <OperationalTableHead>Date</OperationalTableHead>
                        <OperationalTableHead>Project / Opportunity</OperationalTableHead>
                        <OperationalTableHead>Worksheet</OperationalTableHead>
                        <OperationalTableHead>Change</OperationalTableHead>
                        <OperationalTableHead>Source Request</OperationalTableHead>
                      </OperationalTableRow>
                    </OperationalTableHeader>
                    <OperationalTableBody>
                      {events.events.slice(0, 6).map((event) => (
                        <OperationalTableRow key={event.linkId}>
                          <OperationalTableCell>{formatShortDate(event.occurredAt)}</OperationalTableCell>
                          <OperationalTableCell>{event.projectId ?? event.opportunityId ?? "—"}</OperationalTableCell>
                          <OperationalTableCell>{event.worksheetName ?? event.sheetName ?? "—"}</OperationalTableCell>
                          <OperationalTableCell>{event.diffSummary ?? "No compact diff summary"}</OperationalTableCell>
                          <OperationalTableCell>{event.sourceRequestId ?? "—"}</OperationalTableCell>
                        </OperationalTableRow>
                      ))}
                    </OperationalTableBody>
                  </OperationalTable>
                ) : (
                  <OperationalEmptyState title="No raw event links were found for this memory." />
                )}
              </OperationalPanel>

              <OperationalPanel
                title={`Linked Classifications (${classifications?.classifications.length ?? 0})`}
                description="Classification records linked directly to this memory item."
              >
                {classifications && classifications.classifications.length > 0 ? (
                  <OperationalTable>
                    <OperationalTableHeader>
                      <OperationalTableRow>
                        <OperationalTableHead>Classification</OperationalTableHead>
                        <OperationalTableHead>Status</OperationalTableHead>
                        <OperationalTableHead>Confidence</OperationalTableHead>
                        <OperationalTableHead>Source Event</OperationalTableHead>
                        <OperationalTableHead>Reasoning</OperationalTableHead>
                      </OperationalTableRow>
                    </OperationalTableHeader>
                    <OperationalTableBody>
                      {classifications.classifications.slice(0, 6).map((classification) => (
                        <OperationalTableRow key={classification.classificationRecordId}>
                          <OperationalTableCell>{classification.classificationRecordId}</OperationalTableCell>
                          <OperationalTableCell>
                            <StatusBadge status={classification.classificationStatus === "classified" ? "approved" : "pending"}>
                              {classification.classificationStatus ?? "unknown"}
                            </StatusBadge>
                          </OperationalTableCell>
                          <OperationalTableCell>{formatConfidence(classification.overallConfidence)}</OperationalTableCell>
                          <OperationalTableCell>{classification.sourceEventId}</OperationalTableCell>
                          <OperationalTableCell>{classification.reasoningSummary ?? "—"}</OperationalTableCell>
                        </OperationalTableRow>
                      ))}
                    </OperationalTableBody>
                  </OperationalTable>
                ) : (
                  <OperationalEmptyState title="No linked classifications were found for this memory." />
                )}
              </OperationalPanel>
            </>
          )}
        </div>

        <div className="space-y-6">
          <OperationalPanel
            title="Memory Metadata"
            description="Authoritative stored metadata plus explainability notes."
            className="xl:sticky xl:top-6"
          >
            {selected ? (
              <div className="space-y-5">
                <dl className="space-y-3 text-sm">
                  {[
                    ["Memory ID", selected.id],
                    ["Category", selected.memoryCategory],
                    ["Type", selected.memoryType],
                    ["Signature", selected.memorySignature],
                    ["Revision", selected.sourceRevisionHash],
                    ["Base Confidence", formatConfidence(selected.baseConfidenceScore)],
                    ["Confidence Calc Version", String(selected.confidenceCalculationVersion)],
                    ["Last Confidence History", selected.lastConfidenceHistoryId],
                    ["Last Confidence Calculated", formatDateTime(selected.lastConfidenceCalculatedAt)],
                    ["Created", formatDateTime(selected.createdAt)],
                    ["Last Updated", formatDateTime(selected.updatedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <dt className="text-[var(--text-secondary)]">{label}</dt>
                      <dd className="max-w-[170px] text-right font-medium text-[var(--text-primary)]">
                        {renderMetadataValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Field Notes</p>
                  <div className="mt-3 space-y-3">
                    {detail?.fieldNotes.map((note) => (
                      <div key={note.field}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{note.field}</span>
                          <StatusBadge status={note.authority === "authoritative" ? "approved" : "pending"}>
                            {note.authority}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{note.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <OperationalEmptyState title="No memory selected." />
            )}
          </OperationalPanel>

          <OperationalPanel title={`Linked Projects (${relatedProjects.length})`}>
            {relatedProjects.length > 0 ? (
              <div className="space-y-3">
                {relatedProjects.map((project) => (
                  <div key={project.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--text-primary)]">{project.label}</span>
                    <span className="text-[var(--text-secondary)]">{project.eventCount} events</span>
                  </div>
                ))}
              </div>
            ) : (
              <OperationalEmptyState title="No project links available." />
            )}
          </OperationalPanel>

          <OperationalPanel title="Lifecycle History" description="Chronological lifecycle, retirement evaluation, synthesis, and confidence lineage for this memory.">
            {history ? (
              <div className="space-y-5">
                <div className="space-y-4">
                  {history.lifecycleMoments
                    .filter((moment) => moment.at)
                    .sort((left, right) => new Date(left.at ?? 0).getTime() - new Date(right.at ?? 0).getTime())
                    .map((moment) => (
                      <div key={`${moment.label}:${moment.at}`} className="flex gap-3">
                        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${moment.label === "Retired" ? "bg-[var(--status-overdue)]" : moment.authority === "authoritative" ? "bg-[var(--status-approved)]" : "bg-[var(--status-pending)]"}`} />
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{moment.label}</p>
                          <p className="text-sm text-[var(--text-secondary)]">{formatDateTime(moment.at)}</p>
                          {moment.lifecycleHistoryId ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              Exact lifecycle history: {moment.lifecycleHistoryId}
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{moment.note}</p>
                        </div>
                      </div>
                    ))}
                </div>

                {history.relatedRetirement.evaluations.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Retirement evaluation history</p>
                      <StatusBadge status="pending">authoritative · exact</StatusBadge>
                    </div>
                    <div className="mt-2 space-y-3">
                      {history.relatedRetirement.evaluations.map((entry) => (
                        <div key={entry.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{entry.evaluationOutcome}</span>
                            <span className="text-[var(--text-secondary)]">{formatDateTime(entry.lastCompletedAt ?? entry.updatedAt)}</span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Queue {entry.id} · State {entry.queueState} · Attempts {entry.attemptCount}/{entry.maxAttempts}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Current memory state {entry.currentMemoryState} · Reason {entry.lastNoActionReason ?? entry.evaluationOutcome}
                          </p>
                          <p className="mt-2 leading-6 text-[var(--text-secondary)]">{entry.evaluationSummary}</p>
                          {entry.replacementSearchExplanation ? (
                            <p className="mt-2 leading-6 text-[var(--text-secondary)]">{entry.replacementSearchExplanation}</p>
                          ) : null}
                          {entry.replacementCandidate ? (
                            <p className="mt-2 text-[var(--text-secondary)]">
                              Replacement {entry.replacementCandidate.id}
                              {" · "}Conf {formatConfidence(entry.replacementCandidate.confidenceScore)}
                              {" · "}Reinforcements {entry.replacementCandidate.reinforcementCount}
                              {" · "}Supporting classifications {entry.replacementCandidate.reinforcedSupportingClassificationCount}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {history.supersedes.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Supersedes</p>
                    <div className="mt-2 space-y-2">
                      {history.supersedes.map((memory) => (
                        <div key={memory.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{memory.title}</p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{memory.memoryCategory} · {memory.memoryType}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {history.relatedSynthesis.queueRecords.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Exact synthesis queue records</p>
                    <div className="mt-2 space-y-2">
                      {history.relatedSynthesis.queueRecords.map((record) => (
                        <div key={record.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{record.queueState}</span>
                            <span className="text-[var(--text-secondary)]">Attempts {record.attemptCount}/{record.maxAttempts}</span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">{record.sourceRevisionHash}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <OperationalAlert variant="neutral">
                    No exact worksheet memory synthesis run reference is persisted for organization memories in v1. Matching queue records are shown when semantic pool and revision hash align exactly.
                  </OperationalAlert>
                )}

                {history.relatedSynthesis.exactRunRecords.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Exact synthesis run records</p>
                    <div className="mt-2 space-y-2">
                      {history.relatedSynthesis.exactRunRecords.map((record, index) => (
                        <div key={`${String(record.id ?? index)}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{String(record.id ?? "Unknown run")}</span>
                            <span className="text-[var(--text-secondary)]">{String(record.model ?? "Unknown model")}</span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">Provider {String(record.provider ?? "unknown")} · Duration {String(record.duration_ms ?? "n/a")}ms</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {history.relatedLifecycle.immutableHistory.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Immutable lifecycle history</p>
                      <StatusBadge status="approved">authoritative · immutable · exact</StatusBadge>
                    </div>
                    <div className="mt-2 space-y-3">
                      {history.relatedLifecycle.immutableHistory.map((entry) => (
                        <div key={entry.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{entry.lifecycleEventType}</span>
                            <span className="text-[var(--text-secondary)]">{formatDateTime(entry.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Origin {entry.eventOriginType} · Pool {entry.sourceSemanticPoolId ?? "—"} · Revision {entry.sourceRevisionHash ?? "—"}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Queue {entry.synthesisQueueRowId ?? "—"} · Run {entry.synthesisRunId ?? "—"}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Synthesis history {entry.synthesisHistoryId ?? "—"} · Schema {entry.schemaVersion ?? "n/a"}
                          </p>
                          <p className="mt-2 text-[var(--text-secondary)]">
                            Before {(entry.beforeMemorySnapshot?.memoryType as string | undefined) ?? "—"} → After {(entry.afterMemorySnapshot?.memoryType as string | undefined) ?? "—"}
                          </p>
                          {entry.lifecycleEventType === "memory_reinforced" ? (
                            <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-xs leading-6 text-[var(--text-secondary)]">
                              <p>Basis {(entry.lifecycleMetadata.reinforcementBasisHash as string | undefined) ?? "—"}</p>
                              <p>
                                Net-new classifications {Array.isArray(entry.lifecycleMetadata.netNewSupportingClassificationRecordIds)
                                  ? (entry.lifecycleMetadata.netNewSupportingClassificationRecordIds as unknown[]).join(", ")
                                  : "—"}
                              </p>
                              <p>
                                Net-new events {Array.isArray(entry.lifecycleMetadata.netNewSupportingEventIds)
                                  ? (entry.lifecycleMetadata.netNewSupportingEventIds as unknown[]).join(", ")
                                  : "—"}
                              </p>
                            </div>
                          ) : null}
                          {entry.lifecycleEventType === "memory_contradicted" ? (
                            <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-xs leading-6 text-[var(--text-secondary)]">
                              <p>Basis {(entry.lifecycleMetadata.contradictionBasisHash as string | undefined) ?? "—"}</p>
                              <p>
                                Strength {typeof entry.lifecycleMetadata.contradictionStrength === "number"
                                  ? formatConfidence(entry.lifecycleMetadata.contradictionStrength)
                                  : "—"}
                                {" · "}
                                {(entry.lifecycleMetadata.conflictMagnitude as string | undefined) ?? "—"}
                                {" · "}
                                {(entry.lifecycleMetadata.conflictType as string | undefined) ?? "—"}
                              </p>
                              <p>
                                Contradicting classifications {Array.isArray(entry.lifecycleMetadata.contradictingClassificationRecordIds)
                                  ? (entry.lifecycleMetadata.contradictingClassificationRecordIds as unknown[]).join(", ")
                                  : "—"}
                              </p>
                              <p>
                                Contradicting events {Array.isArray(entry.lifecycleMetadata.contradictingEventIds)
                                  ? (entry.lifecycleMetadata.contradictingEventIds as unknown[]).join(", ")
                                  : "—"}
                              </p>
                            </div>
                          ) : null}
                          {entry.lifecycleEventType === "memory_superseded" ? (
                            <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-xs leading-6 text-[var(--text-secondary)]">
                              <p>Basis {(entry.lifecycleMetadata.supersessionBasisHash as string | undefined) ?? "—"}</p>
                              <p>Replacement {(entry.lifecycleMetadata.replacementMemoryId as string | undefined) ?? "—"}</p>
                              <p>
                                Confidence {typeof entry.lifecycleMetadata.incumbentConfidenceBefore === "number"
                                  ? formatConfidence(entry.lifecycleMetadata.incumbentConfidenceBefore)
                                  : "—"}
                                {" → "}
                                {typeof entry.lifecycleMetadata.replacementConfidenceAtDecision === "number"
                                  ? formatConfidence(entry.lifecycleMetadata.replacementConfidenceAtDecision)
                                  : "—"}
                              </p>
                              <p>
                                Contradictions {(entry.lifecycleMetadata.incumbentContradictionCount as number | undefined) ?? "—"}
                                {" · "}Reinforcements {(entry.lifecycleMetadata.replacementReinforcementCount as number | undefined) ?? "—"}
                                {" · "}Supporting classifications {(entry.lifecycleMetadata.replacementSupportingClassificationCount as number | undefined) ?? "—"}
                              </p>
                              <p>
                                Reason {(entry.lifecycleMetadata.reasonType as string | undefined) ?? "—"} · {(entry.lifecycleMetadata.reasonSummary as string | undefined) ?? "—"}
                              </p>
                            </div>
                          ) : null}
                          {entry.lifecycleEventType === "memory_retired" ? (
                            <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-xs leading-6 text-[var(--text-secondary)]">
                              <div className="mb-2 flex items-center gap-2">
                                <StatusBadge status="overdue">authoritative · immutable · exact</StatusBadge>
                              </div>
                              <p>Basis {(entry.lifecycleMetadata.retirementBasisHash as string | undefined) ?? "—"}</p>
                              <p>Reason {(entry.lifecycleMetadata.retirementReasonType as string | undefined) ?? "—"} · {(entry.lifecycleMetadata.reasonSummary as string | undefined) ?? "—"}</p>
                              <p>
                                Confidence {(typeof entry.lifecycleMetadata.confidenceAtRetirement === "number"
                                  ? formatConfidence(entry.lifecycleMetadata.confidenceAtRetirement)
                                  : "—")}
                                {" · "}Base confidence {(typeof entry.lifecycleMetadata.baseConfidenceAtRetirement === "number"
                                  ? formatConfidence(entry.lifecycleMetadata.baseConfidenceAtRetirement as number)
                                  : "—")}
                              </p>
                              <p>
                                Contradictions {formatNumber(entry.lifecycleMetadata.contradictionCount as number | undefined)}
                                {" · "}Strength {typeof entry.lifecycleMetadata.contradictionStrengthScore === "number"
                                  ? formatConfidence(entry.lifecycleMetadata.contradictionStrengthScore as number)
                                  : "—"}
                                {" · "}Reinforcements {formatNumber(entry.lifecycleMetadata.reinforcementCount as number | undefined)}
                              </p>
                              <p>
                                Last reinforced {formatDateTime(entry.lifecycleMetadata.lastReinforcedAt as string | undefined)}
                                {" · "}Last contradicted {formatDateTime(entry.lifecycleMetadata.lastContradictedAt as string | undefined)}
                                {" · "}Evidence age {formatDaysBetween(
                                  entry.lifecycleMetadata.lastContradictedAt as string | undefined,
                                  entry.createdAt,
                                )}
                              </p>
                              <p>
                                Domain {(entry.lifecycleMetadata.domainSignature as string | undefined) ?? "—"}
                                {" · "}Source {(entry.lifecycleMetadata.retirementSource as string | undefined) ?? "—"}
                              </p>
                              <p>
                                Replacement search {typeof entry.lifecycleMetadata.replacementCandidateSearchResult === "object"
                                  && entry.lifecycleMetadata.replacementCandidateSearchResult !== null
                                  ? String((entry.lifecycleMetadata.replacementCandidateSearchResult as Record<string, unknown>).outcome ?? "—")
                                  : "—"}
                              </p>
                            </div>
                          ) : null}
                          {entry.reasonSummary ? (
                            <p className="mt-2 leading-6 text-[var(--text-secondary)]">{entry.reasonSummary}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {history.relatedConfidence.immutableHistory.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Immutable confidence history</p>
                      <StatusBadge status="approved">authoritative · immutable · exact</StatusBadge>
                    </div>
                    <div className="mt-2 space-y-3">
                      {history.relatedConfidence.immutableHistory.map((entry) => (
                        <div key={entry.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{entry.reasonType}</span>
                            <span className="text-[var(--text-secondary)]">{formatDateTime(entry.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            {formatConfidence(entry.confidenceBefore)} → {formatConfidence(entry.confidenceAfter)}
                            {" · "}
                            Delta {formatConfidence(entry.confidenceDelta)}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Lifecycle {entry.lifecycleHistoryId ?? "—"} · Synthesis {entry.synthesisHistoryId ?? "—"}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Pool {entry.sourceSemanticPoolId ?? "—"} · Revision {entry.sourceRevisionHash ?? "—"}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Queue {entry.synthesisQueueRowId ?? "—"} · Run {entry.synthesisRunId ?? "—"} · Calc v{entry.calculationVersion ?? "—"}
                          </p>
                          {entry.reasonSummary ? (
                            <p className="mt-2 leading-6 text-[var(--text-secondary)]">{entry.reasonSummary}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {history.relatedSynthesis.immutableHistory.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Immutable synthesis history</p>
                      <StatusBadge status="approved">authoritative · immutable · exact</StatusBadge>
                    </div>
                    <div className="mt-2 space-y-3">
                      {history.relatedSynthesis.immutableHistory.map((entry) => (
                        <div key={entry.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--text-primary)]">{entry.synthesisDecision} · {entry.persistenceOutcome}</span>
                            <span className="text-[var(--text-secondary)]">{formatDateTime(entry.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Queue {entry.synthesisQueueRowId} · Run {entry.synthesisRunId}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Pool {entry.sourceSemanticPoolId} · Revision {entry.sourceRevisionHash}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            {entry.provider ?? "unknown"} · {entry.model ?? "unknown"} · Prompt {entry.promptVersion ?? "n/a"} · Schema {entry.schemaVersion ?? "n/a"}
                          </p>
                          <p className="mt-2 text-[var(--text-secondary)]">
                            Included {String(entry.evidenceSnapshot.evidenceCounts && typeof entry.evidenceSnapshot.evidenceCounts === "object" ? (entry.evidenceSnapshot.evidenceCounts as Record<string, unknown>).includedCount ?? "—" : "—")}
                            {" · "}
                            Supporting {String(entry.evidenceSnapshot.evidenceCounts && typeof entry.evidenceSnapshot.evidenceCounts === "object" ? (entry.evidenceSnapshot.evidenceCounts as Record<string, unknown>).supportingEvidenceCount ?? "—" : "—")}
                            {" · "}
                            Uncertain {String(entry.evidenceSnapshot.evidenceCounts && typeof entry.evidenceSnapshot.evidenceCounts === "object" ? (entry.evidenceSnapshot.evidenceCounts as Record<string, unknown>).uncertainEvidenceCount ?? "—" : "—")}
                            {" · "}
                            Adjacent {String(entry.evidenceSnapshot.evidenceCounts && typeof entry.evidenceSnapshot.evidenceCounts === "object" ? (entry.evidenceSnapshot.evidenceCounts as Record<string, unknown>).adjacentEvidenceCount ?? "—" : "—")}
                            {" · "}
                            Excluded {String(entry.evidenceSnapshot.evidenceCounts && typeof entry.evidenceSnapshot.evidenceCounts === "object" ? (entry.evidenceSnapshot.evidenceCounts as Record<string, unknown>).excludedEvidenceCount ?? "—" : "—")}
                          </p>
                          <p className="mt-2 text-[var(--text-secondary)]">
                            Before {(entry.beforeMemorySnapshot?.memoryType as string | undefined) ?? "—"} → After {(entry.afterMemorySnapshot?.memoryType as string | undefined) ?? "—"}
                          </p>
                          {entry.reasoningSummary ? (
                            <p className="mt-2 leading-6 text-[var(--text-secondary)]">{entry.reasoningSummary}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <OperationalEmptyState title="No history available." />
            )}
          </OperationalPanel>
        </div>
      </section>
    </main>
  );
}
