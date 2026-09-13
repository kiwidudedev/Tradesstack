import { memo, useCallback, useMemo } from "react";
import type { QARecordPersonOption, QARunRecord, QARunResponse } from "@/lib/quality-assurance/execution/types";
import { measurementValidationMessage } from "@/lib/quality-assurance/execution/model";
import { QAHoldReleaseControl, QARecordEvidenceControl, QARecordSignatureControl } from "@/components/app/quality-assurance/project/QARecordOperationalControls";
import { getInspectionCommentRule, getProductMaterialConfiguration, isHoldPointEnabled } from "@/lib/quality-assurance/definitions/model";
import { QAFieldPresentation, qaFieldLabelId } from "./QAFieldPresentation";
import {
  QABooleanResponseControl,
  QACheckboxResponseControl,
  QADateResponseControl,
  QAInspectionResultControl,
  QAHoldPointWarning,
  QAMultiSelectResponseControl,
  QANumericResponseControl,
  QASingleSelectResponseControl,
  QATextResponseControl,
  QAProductMaterialResponseControl,
  measurementConfigurationText,
} from "./QAResponseControls";

export const RecordQAFieldRenderer = memo(function RecordQAFieldRenderer({ response, people, currentUserName, disabled, projectSlug, projectQaId, runId, canVerify, onRunChange, onUploadStateChange, onUpdateResponse }: {
  response: QARunResponse;
  people: QARecordPersonOption[];
  currentUserName: string;
  disabled: boolean;
  projectSlug: string;
  projectQaId: string;
  runId: string;
  canVerify: boolean;
  onRunChange: (run: QARunRecord) => void;
  onUploadStateChange: (active: boolean, failed?: boolean) => void;
  onUpdateResponse: (responseId: string, patch: Partial<QARunResponse>) => void;
}) {
  const field = response.fieldSnapshot;
  const labelId = qaFieldLabelId(field.id);
  const optionByValue = useMemo(() => new Map(field.options.map((option) => [option.value, option])), [field.options]);
  const update = useCallback((patch: Partial<QARunResponse>) => onUpdateResponse(response.id, patch), [onUpdateResponse, response.id]);
  let control: React.ReactNode;

  const operationalProps = { response, projectSlug, projectQaId, runId, disabled, currentUserName, onRunChange, onUploadStateChange };
  switch (response.fieldType) {
    case "short_text": control = <QATextResponseControl interactive disabled={disabled} value={response.textValue ?? ""} placeholder="Enter response..." ariaLabelledBy={labelId} onChange={(textValue) => update({ textValue })} />; break;
    case "long_text": control = <QATextResponseControl interactive multiline disabled={disabled} value={response.textValue ?? ""} placeholder="Enter response..." ariaLabelledBy={labelId} onChange={(textValue) => update({ textValue })} />; break;
    case "number": control = <QANumericResponseControl interactive disabled={disabled} value={response.numericValue} ariaLabelledBy={labelId} onChange={(numericValue) => update({ numericValue })} />; break;
    case "measurement": control = <QANumericResponseControl interactive disabled={disabled} value={response.numericValue} unit={typeof field.configuration.unit === "string" ? field.configuration.unit : ""} configured={measurementConfigurationText(field.configuration)} validation={measurementValidationMessage(response)} ariaLabelledBy={labelId} onChange={(numericValue) => update({ numericValue })} />; break;
    case "date": control = <QADateResponseControl interactive disabled={disabled} value={response.dateValue ?? ""} ariaLabelledBy={labelId} onChange={(dateValue) => update({ dateValue: dateValue || null })} />; break;
    case "yes_no": control = <QABooleanResponseControl interactive disabled={disabled} value={response.booleanValue} ariaLabelledBy={labelId} onChange={(booleanValue) => update({ booleanValue })} />; break;
    case "single_select": control = <QASingleSelectResponseControl interactive disabled={disabled} value={response.selectedOptions[0]?.value ?? ""} options={field.options} placeholder="Select an option" ariaLabelledBy={labelId} onChange={(selected) => update({ selectedOptions: selected && optionByValue.has(selected) ? [optionByValue.get(selected)!] : [] })} />; break;
    case "multi_select": control = <QAMultiSelectResponseControl interactive disabled={disabled} selectedValues={response.selectedOptions.map((option) => option.value)} options={field.options} ariaLabelledBy={labelId} onChange={(selected) => update({ selectedOptions: selected.flatMap((value) => optionByValue.get(value) ?? []) })} />; break;
    case "checkbox": control = <QACheckboxResponseControl interactive disabled={disabled} checked={response.booleanValue === true} ariaLabelledBy={labelId} onChange={(booleanValue) => update({ booleanValue })} />; break;
    case "inspection_check": control = <div className="space-y-3">{isHoldPointEnabled(field) ? <><QAHoldPointWarning /><QAHoldReleaseControl {...operationalProps} canVerify={canVerify} /></> : null}<QAInspectionResultControl interactive disabled={disabled} value={response.inspectionResult} allowNa={field.allowNa} comment={response.comment} commentRule={getInspectionCommentRule(field)} commentAriaLabel={`${field.label} comment`} ariaLabelledBy={labelId} onResultChange={(inspectionResult) => update({ inspectionResult })} onCommentChange={(comment) => update({ comment })} /><div className="space-y-2"><p className="text-xs font-semibold text-[var(--text-secondary)]">Photo evidence{field.photoRequired || (field.requirePhotoOnFail && response.inspectionResult === "fail") ? ` · minimum ${Math.max(field.minimumPhotos, 1)}` : " · optional"}</p><QARecordEvidenceControl {...operationalProps} type="photo" /></div>{field.fileRequired || response.evidence.some((item) => item.evidenceType === "file") ? <div className="space-y-2"><p className="text-xs font-semibold text-[var(--text-secondary)]">Supporting files</p><QARecordEvidenceControl {...operationalProps} type="file" /></div> : null}</div>; break;
    case "person": control = <div className="space-y-2"><QASingleSelectResponseControl interactive disabled={disabled} value={response.personUserId ?? ""} options={people.map((person, index) => ({ id: person.userId, label: person.name, value: person.userId, sortOrder: index }))} placeholder="Select a team member (optional)" ariaLabelledBy={labelId} onChange={(personUserId) => { const person = people.find((item) => item.userId === personUserId); update({ personUserId: person?.userId ?? null, personDisplayName: person?.name ?? response.personDisplayName }); }} /><QATextResponseControl interactive disabled={disabled} value={response.personDisplayName ?? ""} placeholder="Or enter a person's name" ariaLabelledBy={labelId} onChange={(personDisplayName) => update({ personUserId: null, personDisplayName })} /></div>; break;
    case "location": control = <QATextResponseControl interactive disabled={disabled} value={response.locationLabel ?? ""} placeholder="Enter location..." ariaLabelledBy={labelId} onChange={(locationLabel) => update({ locationLabel })} />; break;
    case "product_material": control = <QAProductMaterialResponseControl interactive disabled={disabled} value={response.productMaterialValue} configuration={getProductMaterialConfiguration(field.configuration)} onChange={(productMaterialValue) => update({ productMaterialValue })} />; break;
    case "photo": control = <QARecordEvidenceControl {...operationalProps} type="photo" />; break;
    case "file": control = <QARecordEvidenceControl {...operationalProps} type="file" />; break;
    case "signature": control = <QARecordSignatureControl {...operationalProps} />; break;
    default: control = <p className="text-sm text-[var(--text-secondary)]">This field type is not available for QA capture.</p>;
  }

  const followUp = response.fieldType === "inspection_check" && (field.createIssueOnFail || field.requireRectificationOnFail || field.requireSupervisorReviewOnFail)
    ? <p className="text-xs text-[var(--text-muted)]">Failure follow-up configuration is preserved; failed results remain auditable and can complete once their comment/evidence rules are satisfied.</p>
    : undefined;

  return <QAFieldPresentation field={field} fieldNumber={response.fieldSortOrder + 1} response={control} supportingMessage={followUp} />;
});
