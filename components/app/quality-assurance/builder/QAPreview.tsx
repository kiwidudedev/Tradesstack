"use client";

import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QAFormContent, QAFormIdentity } from "@/components/app/quality-assurance/presentation/QAFormPresentation";
import { QASectionPresentation } from "@/components/app/quality-assurance/presentation/QASectionPresentation";
import { PreviewQAFieldRenderer, type QAPreviewFieldValue } from "@/components/app/quality-assurance/presentation/PreviewQAFieldRenderer";
import type { QADefinition } from "@/lib/quality-assurance/definitions/types";

export function QAPreview({ definition, open, onOpenChange }: { definition: QADefinition; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [values, setValues] = useState<Record<string, QAPreviewFieldValue>>({});

  const updateField = useCallback((fieldId: string, patch: Partial<QAPreviewFieldValue>) => {
    setValues((current) => ({ ...current, [fieldId]: { ...current[fieldId], ...patch } }));
  }, []);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) setValues({});
    onOpenChange(nextOpen);
  };

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent fullScreenMobile style={{ width: "min(100vw, 56rem)" }} className="max-w-4xl overflow-y-auto p-0">
      <div className="bg-[var(--surface-muted)] p-4 sm:p-6 lg:p-8">
        <DialogHeader className="sr-only">
          <DialogTitle>{definition.name || "Untitled QA"}</DialogTitle>
          <DialogDescription>Preview of the QA form. Responses are temporary and are not saved.</DialogDescription>
        </DialogHeader>
        <QAFormContent className="space-y-8">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-sm sm:p-6">
            <QAFormIdentity name={definition.name} description={definition.description} eyebrow="QA preview" sourceText={definition.sourceTemplateName ? `Created from ${definition.sourceTemplateName}` : null} />
            <p role="status" className="mt-4 rounded-[var(--radius-md)] bg-[var(--info-light)] px-3 py-2 text-sm text-[var(--text-secondary)]">Preview only — responses are not saved.</p>
          </div>
          {definition.sections.length === 0 ? <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-secondary)]">This QA has no sections yet.</p> : definition.sections.map((section, sectionIndex) => <QASectionPresentation key={section.id} section={section} sectionIndex={sectionIndex}>{section.fields.map((field, fieldIndex) => <PreviewQAFieldRenderer key={field.id} field={field} fieldNumber={fieldIndex + 1} value={values[field.id] ?? {}} onChange={(patch) => updateField(field.id, patch)} />)}</QASectionPresentation>)}
        </QAFormContent>
      </div>
    </DialogContent>
  </Dialog>;
}
