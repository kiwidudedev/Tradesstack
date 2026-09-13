"use client";
import { SharedQABuilder } from "@/components/app/quality-assurance/builder/SharedQABuilder";
import { saveQATemplateAction } from "@/lib/quality-assurance/definitions/actions";
import type { QADefinition } from "@/lib/quality-assurance/definitions/types";
export function QATemplateEditor({ definition, canWrite, initialPreview=false }: { definition:QADefinition;canWrite:boolean;initialPreview?:boolean }) { return <SharedQABuilder mode="company-template" initialDefinition={definition} backHref="/app/settings/qa-templates" canWrite={canWrite} onSave={saveQATemplateAction} initialPreview={initialPreview}/>; }

