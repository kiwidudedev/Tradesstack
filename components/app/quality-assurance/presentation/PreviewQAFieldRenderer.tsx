import type { QAFieldDefinition } from "@/lib/quality-assurance/definitions/types";
import { getInspectionCommentRule, getProductMaterialConfiguration, isHoldPointEnabled } from "@/lib/quality-assurance/definitions/model";
import type { QAProductMaterialValue } from "@/lib/quality-assurance/execution/types";
import { QAFieldPresentation, qaFieldLabelId } from "./QAFieldPresentation";
import { PreviewQASignatureControl } from "./PreviewQASignatureControl";
import {
  QABooleanResponseControl,
  QACheckboxResponseControl,
  QAConfiguredEvidence,
  QADateResponseControl,
  QAEvidencePlaceholder,
  QAInspectionResultControl,
  QAHoldPointWarning,
  QAMultiSelectResponseControl,
  QANumericResponseControl,
  QASingleSelectResponseControl,
  QATextResponseControl,
  QAProductMaterialResponseControl,
  measurementConfigurationText,
  type QAInspectionResultValue,
} from "./QAResponseControls";

export type QAPreviewFieldValue = {
  text?: string;
  number?: number | null;
  date?: string;
  boolean?: boolean | null;
  selected?: string[];
  inspectionResult?: QAInspectionResultValue;
  comment?: string;
  person?: string;
  location?: string;
  productMaterial?: QAProductMaterialValue;
};

export function PreviewQAFieldRenderer({ field, fieldNumber, value, onChange }: {
  field: QAFieldDefinition;
  fieldNumber: number;
  value: QAPreviewFieldValue;
  onChange: (patch: Partial<QAPreviewFieldValue>) => void;
}) {
  const labelId = qaFieldLabelId(field.id);
  let response: React.ReactNode;
  switch (field.fieldType) {
    case "short_text": response = <QATextResponseControl interactive value={value.text} placeholder="Enter response..." ariaLabelledBy={labelId} onChange={(text) => onChange({ text })} />; break;
    case "long_text": response = <QATextResponseControl interactive multiline value={value.text} placeholder="Enter response..." ariaLabelledBy={labelId} onChange={(text) => onChange({ text })} />; break;
    case "number": response = <QANumericResponseControl interactive value={value.number} ariaLabelledBy={labelId} onChange={(number) => onChange({ number })} />; break;
    case "measurement": response = <QANumericResponseControl interactive value={value.number} unit={String(field.configuration.unit ?? "")} configured={measurementConfigurationText(field.configuration)} ariaLabelledBy={labelId} onChange={(number) => onChange({ number })} />; break;
    case "date": response = <QADateResponseControl interactive value={value.date} ariaLabelledBy={labelId} onChange={(date) => onChange({ date })} />; break;
    case "yes_no": response = <QABooleanResponseControl interactive value={value.boolean} ariaLabelledBy={labelId} onChange={(boolean) => onChange({ boolean })} />; break;
    case "single_select": response = <QASingleSelectResponseControl interactive value={value.selected?.[0]} options={field.options} placeholder="Select an option" ariaLabelledBy={labelId} onChange={(selected) => onChange({ selected: selected ? [selected] : [] })} />; break;
    case "multi_select": response = <QAMultiSelectResponseControl interactive selectedValues={value.selected} options={field.options} ariaLabelledBy={labelId} onChange={(selected) => onChange({ selected })} />; break;
    case "checkbox": response = <QACheckboxResponseControl interactive checked={value.boolean === true} ariaLabelledBy={labelId} onChange={(boolean) => onChange({ boolean })} />; break;
    case "inspection_check": response = <div className="space-y-3">{isHoldPointEnabled(field) ? <QAHoldPointWarning /> : null}<QAInspectionResultControl interactive value={value.inspectionResult} allowNa={field.allowNa} comment={value.comment} commentRule={getInspectionCommentRule(field)} commentAriaLabel={`${field.label} comment`} ariaLabelledBy={labelId} onResultChange={(inspectionResult) => onChange({ inspectionResult })} onCommentChange={(comment) => onChange({ comment })} /><QAConfiguredEvidence photoRequired={field.photoRequired} minimumPhotos={field.minimumPhotos} fileRequired={field.fileRequired} requirePhotoOnFail={field.requirePhotoOnFail} /></div>; break;
    case "photo": response = <QAEvidencePlaceholder kind="photo" size="standard" />; break;
    case "file": response = <QAEvidencePlaceholder kind="file" size="standard" />; break;
    case "person": response = <QASingleSelectResponseControl interactive value={value.person} options={[{ id: "preview-person", label: "Example site user", value: "preview-person", sortOrder: 0 }]} placeholder="Select a person" ariaLabelledBy={labelId} onChange={(person) => onChange({ person })} />; break;
    case "location": response = <QATextResponseControl interactive value={value.location} placeholder="Enter location..." ariaLabelledBy={labelId} onChange={(location) => onChange({ location })} />; break;
    case "product_material": response = <QAProductMaterialResponseControl interactive value={value.productMaterial} configuration={getProductMaterialConfiguration(field.configuration)} onChange={(productMaterial) => onChange({ productMaterial })} />; break;
    case "signature": response = <PreviewQASignatureControl />; break;
  }
  return <QAFieldPresentation field={field} fieldNumber={fieldNumber} response={response} />;
}
