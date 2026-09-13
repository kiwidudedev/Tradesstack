import { memo } from "react";
import { cn } from "@/lib/utils";
import type { QAFieldDefinition } from "@/lib/quality-assurance/definitions/types";
import { getInspectionCommentRule, getProductMaterialConfiguration, isHoldPointEnabled } from "@/lib/quality-assurance/definitions/model";
import { QAFieldPresentation } from "./QAFieldPresentation";
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
  QAStaticSignatureControl,
  measurementConfigurationText,
} from "./QAResponseControls";

function BuilderResponse({ field }: { field: QAFieldDefinition }) {
  switch (field.fieldType) {
    case "short_text": return <QATextResponseControl interactive={false} placeholder="Enter response..." />;
    case "long_text": return <QATextResponseControl interactive={false} multiline placeholder="Enter response..." />;
    case "number": return <QANumericResponseControl interactive={false} />;
    case "measurement": return <QANumericResponseControl interactive={false} unit={String(field.configuration.unit ?? "")} configured={measurementConfigurationText(field.configuration)} />;
    case "date": return <QADateResponseControl interactive={false} />;
    case "yes_no": return <QABooleanResponseControl interactive={false} />;
    case "single_select": return <QASingleSelectResponseControl interactive={false} options={field.options} placeholder="Select an option" />;
    case "multi_select": return <QAMultiSelectResponseControl interactive={false} options={field.options} />;
    case "checkbox": return <QACheckboxResponseControl interactive={false} />;
    case "inspection_check": return <div className="space-y-3">{isHoldPointEnabled(field) ? <QAHoldPointWarning /> : null}<QAInspectionResultControl interactive={false} allowNa={field.allowNa} commentRule={getInspectionCommentRule(field)} /><QAConfiguredEvidence photoRequired={field.photoRequired} minimumPhotos={field.minimumPhotos} fileRequired={field.fileRequired} requirePhotoOnFail={field.requirePhotoOnFail} /></div>;
    case "photo": return <QAEvidencePlaceholder kind="photo" size="standard" />;
    case "file": return <QAEvidencePlaceholder kind="file" size="standard" />;
    case "person": return <QASingleSelectResponseControl interactive={false} options={[]} placeholder="Select a person" />;
    case "location": return <QATextResponseControl interactive={false} placeholder="Enter location..." />;
    case "product_material": return <QAProductMaterialResponseControl interactive={false} configuration={getProductMaterialConfiguration(field.configuration)} />;
    case "signature": return <QAStaticSignatureControl />;
  }
}

export const BuilderQAFieldRenderer = memo(function BuilderQAFieldRenderer({ field, fieldNumber, selected }: { field: QAFieldDefinition; fieldNumber: number; selected: boolean }) {
  return <QAFieldPresentation
    field={field}
    fieldNumber={fieldNumber}
    headerEndInset
    response={<BuilderResponse field={field} />}
    className={cn("transition-colors", selected ? "border-[var(--brand-blue)] bg-[var(--info-light)] ring-1 ring-[var(--brand-blue)]" : "group-hover:bg-[var(--surface-subtle)]")}
  />;
});
