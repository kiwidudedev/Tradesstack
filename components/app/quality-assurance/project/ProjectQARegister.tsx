"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { OperationalTable, OperationalTableBody, OperationalTableCell, OperationalTableHead, OperationalTableHeader, OperationalTableRow } from "@/components/app/OperationalTable";
import { ProjectQualityAssuranceBoard } from "@/components/app/ProjectQualityAssuranceBoard";
import type { QARegisterRow } from "@/lib/quality-assurance/definitions/server";
import { ProjectQACreateDialog } from "./ProjectQACreateDialog";
import { StartQADialog } from "./StartQADialog";

function statusLabel(status: QARegisterRow["status"]) { return status === "active" ? "Ready" : status === "draft" ? "Draft" : "Archived"; }
function statusBadge(status: QARegisterRow["status"]) { return <Badge variant={status === "active" ? "default" : "secondary"}>{statusLabel(status)}</Badge>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function recordsLabel(plan: QARegisterRow) { return `${plan.completedCount} completed · ${plan.inProgressCount} in progress${plan.cancelledCount ? ` · ${plan.cancelledCount} cancelled` : ""}`; }

export function ProjectQARegister({ projectSlug, plans, templates, canWrite, canInspect, canViewTemplates, canManageTemplates }: {
  projectSlug: string; plans: QARegisterRow[]; templates: QARegisterRow[]; canWrite: boolean; canInspect: boolean; canViewTemplates: boolean; canManageTemplates: boolean;
}) {
  const [tab, setTab] = useState<"project" | "legacy">("project");
  const [open, setOpen] = useState(false);
  const [startPlan, setStartPlan] = useState<QARegisterRow | null>(null);
  const detailHref = (id: string) => `/app/projects/${projectSlug}/job-management/quality-assurance/${id}`;
  const editHref = (id: string) => `${detailHref(id)}/edit`;

  const actions = (plan: QARegisterRow, compact = false) => <div className={`flex flex-wrap items-center ${compact ? "gap-2" : "justify-end gap-2"}`}>
    {plan.status === "draft" ? canWrite ? <Button asChild size="sm"><Link href={editHref(plan.id)}>Continue setup</Link></Button> : <Button asChild size="sm" variant="outline"><Link href={detailHref(plan.id)}>View</Link></Button> : null}
    {plan.status === "active" ? <>
      {canInspect ? <Button size="sm" onClick={() => setStartPlan(plan)}>Start QA</Button> : null}
      <Button asChild size="sm" variant="outline"><Link href={detailHref(plan.id)}>View</Link></Button>
      {canWrite ? <Button asChild size="sm" variant="ghost"><Link href={editHref(plan.id)}>Edit</Link></Button> : null}
    </> : null}
    {plan.status === "archived" ? <Button asChild size="sm" variant="outline"><Link href={detailHref(plan.id)}>View</Link></Button> : null}
  </div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
      <Button variant={tab === "project" ? "default" : "outline"} size="toolbar" onClick={() => setTab("project")}>Project QA</Button>
      <Button variant={tab === "legacy" ? "default" : "outline"} size="toolbar" onClick={() => setTab("legacy")}>Existing QA Activity</Button>
    </div>
    {tab === "legacy" ? <ProjectQualityAssuranceBoard /> : <>
      <OperationalModuleHeader title="Project QA" description="Configure, start, and track QA Records for this project." actions={canWrite ? <Button variant="orange" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New Project QA</Button> : null} />
      <OperationalPanel>{plans.length === 0 ? <OperationalEmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No Project QA yet" description="Create a Project QA from a company template or start blank." actions={canWrite ? <Button variant="orange" onClick={() => setOpen(true)}>Create Project QA</Button> : null} /> : <>
        <div className="space-y-3 md:hidden">{plans.map((plan) => <article key={plan.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
          <div className="flex items-start justify-between gap-3"><div><Link className="font-semibold hover:underline" href={plan.status === "draft" && canWrite ? editHref(plan.id) : detailHref(plan.id)}>{plan.name}</Link><p className="mt-1 text-xs text-[var(--text-muted)]">{plan.sourceTemplateName ? `Created from ${plan.sourceTemplateName}` : "Started blank"}</p></div>{statusBadge(plan.status)}</div>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">{plan.sectionCount} sections · {plan.fieldCount} checks</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{recordsLabel(plan)}</p>
          <div className="mt-4">{actions(plan, true)}</div>
        </article>)}</div>
        <div className="hidden md:block"><OperationalTable><OperationalTableHeader><OperationalTableRow><OperationalTableHead>Name</OperationalTableHead><OperationalTableHead>Status</OperationalTableHead><OperationalTableHead>Scope</OperationalTableHead><OperationalTableHead>Records</OperationalTableHead><OperationalTableHead>Updated</OperationalTableHead><OperationalTableHead className="text-right">Actions</OperationalTableHead></OperationalTableRow></OperationalTableHeader><OperationalTableBody>{plans.map((plan) => <OperationalTableRow key={plan.id}>
          <OperationalTableCell><Link className="font-medium hover:underline" href={plan.status === "draft" && canWrite ? editHref(plan.id) : detailHref(plan.id)}>{plan.name}</Link><p className="mt-1 text-xs text-[var(--text-muted)]">{plan.sourceTemplateName ? `Created from ${plan.sourceTemplateName}` : "Started blank"}</p></OperationalTableCell>
          <OperationalTableCell>{statusBadge(plan.status)}</OperationalTableCell>
          <OperationalTableCell>{plan.sectionCount} sections · {plan.fieldCount} checks</OperationalTableCell>
          <OperationalTableCell>{recordsLabel(plan)}</OperationalTableCell>
          <OperationalTableCell>{formatDate(plan.updatedAt)}</OperationalTableCell>
          <OperationalTableCell>{actions(plan)}</OperationalTableCell>
        </OperationalTableRow>)}</OperationalTableBody></OperationalTable></div>
      </>}</OperationalPanel>
    </>}

    <ProjectQACreateDialog open={open} onOpenChange={setOpen} projectSlug={projectSlug} templates={templates} canViewTemplates={canViewTemplates} canManageTemplates={canManageTemplates} />
    {startPlan ? <StartQADialog open onOpenChange={(next) => { if (!next) setStartPlan(null); }} projectSlug={projectSlug} projectQaId={startPlan.id} qaName={startPlan.name} /> : null}
  </div>;
}
