"use client";

import { useState } from "react";
import { SharedQABuilder } from "@/components/app/quality-assurance/builder/SharedQABuilder";
import { makeProjectQAReadyAction, saveProjectQAAction, setProjectQALifecycleAction } from "@/lib/quality-assurance/definitions/actions";
import type { QADefinition } from "@/lib/quality-assurance/definitions/types";
import { StartQADialog } from "./StartQADialog";

export function ProjectQAEditor({ definition, projectSlug, canWrite, canInspect, initialPreview = false }: {
  definition: QADefinition;
  projectSlug: string;
  canWrite: boolean;
  canInspect: boolean;
  initialPreview?: boolean;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const detailHref = `/app/projects/${projectSlug}/job-management/quality-assurance/${definition.id}`;
  return <>
    <SharedQABuilder
      mode="project-qa"
      initialDefinition={definition}
      backHref={detailHref}
      canWrite={canWrite}
      initialPreview={initialPreview}
      onSave={(next) => saveProjectQAAction({ projectSlug, definition: next })}
      onLifecycle={(action) => setProjectQALifecycleAction({ projectSlug, projectQaId: definition.id, action })}
      onMakeReady={() => makeProjectQAReadyAction({ projectSlug, projectQaId: definition.id })}
      onStartQA={definition.status === "active" && canInspect ? () => setStartOpen(true) : undefined}
    />
    <StartQADialog open={startOpen} onOpenChange={setStartOpen} projectSlug={projectSlug} projectQaId={definition.id} qaName={definition.name} />
  </>;
}
