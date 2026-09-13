import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { QAFieldDefinition } from "@/lib/quality-assurance/definitions/types";

export type QAPresentableField = Pick<
  QAFieldDefinition,
  | "id"
  | "fieldType"
  | "label"
  | "description"
  | "instructions"
  | "required"
  | "allowNa"
  | "requirement"
  | "acceptanceCriteria"
  | "referenceText"
  | "photoRequired"
  | "minimumPhotos"
  | "fileRequired"
  | "requireCommentOnFail"
  | "requirePhotoOnFail"
  | "createIssueOnFail"
  | "requireRectificationOnFail"
  | "blockCompletionOnFail"
  | "requireSupervisorReviewOnFail"
  | "configuration"
  | "options"
>;

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function qaFieldLabelId(fieldId: string) {
  return `qa-field-label-${safeDomId(fieldId)}`;
}

export const QAFieldPresentation = memo(function QAFieldPresentation({
  field,
  fieldNumber,
  response,
  supportingMessage,
  headerEndInset = false,
  className,
}: {
  field: QAPresentableField;
  fieldNumber?: number;
  response: ReactNode;
  supportingMessage?: ReactNode;
  headerEndInset?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-3">
        <div className={cn("flex items-start justify-between gap-3", headerEndInset && "pr-10")}>
          <div id={qaFieldLabelId(field.id)} className="font-semibold text-[var(--text-primary)]">
            {field.label || "Untitled field"}
            {field.required ? <span className="ml-1 text-[var(--error)]" aria-label="Required">*</span> : null}
          </div>
          {fieldNumber != null ? <span className="text-xs text-[var(--text-muted)]">{fieldNumber}</span> : null}
        </div>
        {field.description ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{field.description}</p> : null}
        {field.instructions ? <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm">{field.instructions}</p> : null}
        {field.requirement ? <p className="mt-2 text-xs text-[var(--text-secondary)]"><strong>Requirement:</strong> {field.requirement}</p> : null}
        {field.acceptanceCriteria ? <p className="mt-1 text-xs text-[var(--text-secondary)]"><strong>Acceptance criteria:</strong> {field.acceptanceCriteria}</p> : null}
        {field.referenceText ? <p className="mt-1 text-xs text-[var(--text-secondary)]"><strong>Reference:</strong> {field.referenceText}</p> : null}
      </div>
      {response}
      {supportingMessage ? <div className="mt-3">{supportingMessage}</div> : null}
    </div>
  );
});
