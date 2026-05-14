"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ChevronDown, ChevronRight, MapPin, Search } from "lucide-react";
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
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import type { OrganizationProject } from "@/lib/projects";

type StageFilter = "All" | "Planning" | "Pricing" | "Construction" | "Completion";
type SortOption = "newest" | "oldest" | "name-asc" | "name-desc" | "updated";

const STAGE_FILTER_OPTIONS: StageFilter[] = ["All", "Planning", "Pricing", "Construction", "Completion"];
const SORT_OPTIONS: ReadonlyArray<{ value: SortOption; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "updated", label: "Recently updated" },
];

function toTimestamp(iso: string | null | undefined): number {
  if (!iso) {
    return 0;
  }
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function stageDisplayLabel(stage: string | null): StageFilter {
  if (stage === "Pricing" || stage === "Construction" || stage === "Completion") {
    return stage;
  }
  return "Planning";
}

function stageBadgeStatus(stage: string | null): NonNullable<StatusBadgeProps["status"]> {
  switch (stage) {
    case "Pricing":
      return "pending";
    case "Construction":
      return "active";
    case "Completion":
      return "completed";
    default:
      return "draft";
  }
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const diffMs = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) {
    return "Today";
  }
  if (diffMs < 2 * day) {
    return "Yesterday";
  }
  if (diffMs < 7 * day) {
    return `${Math.floor(diffMs / day)}d ago`;
  }
  if (diffMs < 30 * day) {
    return `${Math.floor(diffMs / (7 * day))}w ago`;
  }
  if (diffMs < 365 * day) {
    return `${Math.floor(diffMs / (30 * day))}mo ago`;
  }
  return `${Math.floor(diffMs / (365 * day))}y ago`;
}

export function ProjectsListTable({ rows }: { rows: OrganizationProject[] }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("All");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = rows.filter((row) => {
      const displayStage = stageDisplayLabel(row.stage);
      if (stageFilter !== "All" && displayStage !== stageFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [row.name, row.client_name, row.location]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    const sorted = matched.slice();
    sorted.sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return toTimestamp(left.created_at) - toTimestamp(right.created_at);
        case "name-asc":
          return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        case "name-desc":
          return right.name.localeCompare(left.name, undefined, { sensitivity: "base" });
        case "updated":
          return toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
        case "newest":
        default:
          return toTimestamp(right.created_at) - toTimestamp(left.created_at);
      }
    });
    return sorted;
  }, [rows, search, stageFilter, sortBy]);

  if (rows.length === 0) {
    return (
      <OperationalEmptyState
        title="No projects yet."
        description="Create your first project, then open it here to access its own dedicated project navigation."
      />
    );
  }

  const hasMatches = filteredRows.length > 0;

  return (
    <OperationalPanel
      contentClassName="p-0"
      toolbar={
        <OperationalToolbar
          search={
            <div className="relative">
              <Search
                aria-hidden="true"
                strokeWidth={2}
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects..."
                className="pl-10"
              />
            </div>
          }
          filters={
            <>
              <div className="relative">
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value as StageFilter)}
                  className={`${interMedium.className} h-11 min-w-[150px] appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] pl-3.5 pr-10 text-sm text-[var(--text-primary)]`}
                >
                  {STAGE_FILTER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "All" ? "All stages" : option}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={2}
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                />
              </div>
              <div className="relative">
                <ArrowUpDown
                  aria-hidden="true"
                  strokeWidth={2}
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  aria-label="Sort projects"
                  className={`${interMedium.className} h-11 min-w-[180px] appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] pl-10 pr-10 text-sm text-[var(--text-primary)]`}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={2}
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                />
              </div>
            </>
          }
        />
      }
    >
      {hasMatches ? (
        <OperationalTable>
          <OperationalTableHeader>
            <OperationalTableRow>
              <OperationalTableHead>Project</OperationalTableHead>
              <OperationalTableHead>Client</OperationalTableHead>
              <OperationalTableHead className="hidden md:table-cell">Location</OperationalTableHead>
              <OperationalTableHead>Stage</OperationalTableHead>
              <OperationalTableHead className="hidden lg:table-cell">Last updated</OperationalTableHead>
              <OperationalTableHead>Action</OperationalTableHead>
            </OperationalTableRow>
          </OperationalTableHeader>
          <OperationalTableBody>
            {filteredRows.map((row) => {
              const displayStage = stageDisplayLabel(row.stage);
              const href = `/app/projects/${row.slug}/dashboard`;
              return (
                <OperationalTableRow key={row.id}>
                  <OperationalTableCell>
                    <Link
                      href={href}
                      className="font-semibold text-[var(--text-primary)] transition hover:underline hover:underline-offset-4"
                    >
                      {row.name}
                    </Link>
                  </OperationalTableCell>
                  <OperationalTableCell className="text-[var(--text-secondary)]">
                    {row.client_name?.trim() || "—"}
                  </OperationalTableCell>
                  <OperationalTableCell className="hidden text-[var(--text-secondary)] md:table-cell">
                    {row.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-[var(--text-muted)]" strokeWidth={2} />
                        {row.location}
                      </span>
                    ) : (
                      "—"
                    )}
                  </OperationalTableCell>
                  <OperationalTableCell>
                    <StatusBadge status={stageBadgeStatus(row.stage)}>{displayStage}</StatusBadge>
                  </OperationalTableCell>
                  <OperationalTableCell className="hidden text-[var(--text-secondary)] lg:table-cell">
                    {formatRelativeDate(row.updated_at)}
                  </OperationalTableCell>
                  <OperationalTableCell>
                    <Link
                      href={href}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[var(--text-primary)] transition hover:underline hover:underline-offset-4"
                    >
                      Open
                      <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
                    </Link>
                  </OperationalTableCell>
                </OperationalTableRow>
              );
            })}
          </OperationalTableBody>
        </OperationalTable>
      ) : (
        <div className="p-6">
          <OperationalEmptyState
            title="No projects match those filters."
            description="Try clearing the search or selecting a different stage."
          />
        </div>
      )}
    </OperationalPanel>
  );
}
