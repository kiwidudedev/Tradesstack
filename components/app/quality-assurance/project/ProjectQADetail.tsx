"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import type { QADefinition } from "@/lib/quality-assurance/definitions/types";
import type { QARunListItem } from "@/lib/quality-assurance/execution/types";
import { StartQADialog } from "./StartQADialog";

function formatDate(value: string) { return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function runName(run: QARunListItem, qaName: string) { return run.title || run.locationLabel || `${qaName} · ${formatDate(run.startedAt)}`; }

export function ProjectQADetail({ definition, projectSlug, updatedAt, runs, canWrite, canInspect }: {
  definition: QADefinition;
  projectSlug: string;
  updatedAt: string;
  runs: QARunListItem[];
  canWrite: boolean;
  canInspect: boolean;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const base = `/app/projects/${projectSlug}/job-management/quality-assurance/${definition.id}`;
  const inProgress = runs.filter((run) => run.status === "in_progress");
  const completed = runs.filter((run) => run.status === "completed");
  const cancelled = runs.filter((run) => run.status === "cancelled");
  const status = definition.status === "active" ? "Ready" : definition.status === "draft" ? "Draft" : "Archived";

  const runCard = (run: QARunListItem) => {
    const percent = run.responseCount ? Math.round((run.answeredCount / run.responseCount) * 100) : 0;
    return <article key={run.id} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-semibold">{runName(run, definition.name)}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{run.status === "completed" ? `Completed ${formatDate(run.completedAt ?? run.startedAt)}` : run.status === "cancelled" ? `Cancelled ${formatDate(run.cancelledAt ?? run.startedAt)}` : `Started ${formatDate(run.startedAt)} · ${run.answeredCount} of ${run.responseCount} ready (${percent}%)`}</p>{run.locationLabel ? <p className="mt-1 text-xs text-[var(--text-muted)]">{run.locationLabel}</p> : null}</div>
      <Button asChild variant={run.status === "in_progress" ? "default" : "outline"} size="sm"><Link href={`${base}/records/${run.id}`}>{run.status === "in_progress" ? "Continue" : "View"}</Link></Button>
    </article>;
  };

  return <div className="space-y-6">
    <OperationalModuleHeader title={definition.name} description={definition.description || "Project QA"} actions={<div className="flex flex-wrap gap-2">
      {definition.status === "active" && canInspect ? <Button onClick={() => setStartOpen(true)}>Start QA</Button> : null}
      {definition.status !== "archived" && canWrite ? <Button asChild variant="outline"><Link href={`${base}/edit`}>Edit QA</Link></Button> : null}
      <Button asChild variant="ghost"><Link href={`/app/projects/${projectSlug}/job-management/quality-assurance`}>Back to Project QA</Link></Button>
    </div>} />

    <OperationalPanel><div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Status</p><div className="mt-2"><Badge variant={definition.status === "active" ? "default" : "secondary"}>{status}</Badge></div></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Source</p><p className="mt-2 text-sm font-medium">{definition.sourceTemplateName ?? "Started blank"}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Definition</p><p className="mt-2 text-sm font-medium">{definition.sections.length} sections · {definition.sections.reduce((sum, section) => sum + section.fields.length, 0)} checks</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Updated</p><p className="mt-2 text-sm font-medium">{formatDate(updatedAt)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Version {definition.definitionVersion}</p></div>
    </div></OperationalPanel>

    {definition.status === "draft" ? <div className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] p-4"><p className="font-semibold">This Project QA is still a Draft.</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Finish configuring it and select Make Ready before starting QA Records.</p>{canWrite ? <Button asChild size="sm" className="mt-3"><Link href={`${base}/edit`}>Continue setup</Link></Button> : null}</div> : null}
    {definition.status === "archived" ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">Archived Project QA cannot start new records. Historical records remain available below.</div> : null}

    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">QA in progress</h2>{definition.status === "active" && canInspect ? <Button size="sm" onClick={() => setStartOpen(true)}>Start QA</Button> : null}</div>{inProgress.length ? inProgress.map(runCard) : <OperationalEmptyState title="No QA in progress" description="Started QA Records will appear here." />}</section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Completed QA</h2>{completed.length ? completed.map(runCard) : <OperationalEmptyState title="No completed QA yet" description="Completed QA Records will appear here." />}</section>
    {cancelled.length ? <section className="space-y-3"><h2 className="text-lg font-semibold">Cancelled QA</h2>{cancelled.map(runCard)}</section> : null}

    <StartQADialog open={startOpen} onOpenChange={setStartOpen} projectSlug={projectSlug} projectQaId={definition.id} qaName={definition.name} />
  </div>;
}
