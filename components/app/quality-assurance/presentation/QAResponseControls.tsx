import { AlertTriangle, CalendarDays, Camera, ChevronDown, FileUp, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { QAFieldOption } from "@/lib/quality-assurance/definitions/types";
import type { QACommentRule, QAProductMaterialConfiguration } from "@/lib/quality-assurance/definitions/types";
import { EMPTY_QA_PRODUCT_MATERIAL_VALUE, type QAProductMaterialValue } from "@/lib/quality-assurance/execution/types";

const staticInputClass = "flex h-11 w-full items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-muted)]";
const staticTextareaClass = "flex min-h-24 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-left text-sm leading-6 text-[var(--text-muted)]";
const staticButtonClass = "flex h-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--text-primary)]";

type CommonControlProps = {
  interactive: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
};

export function QATextResponseControl({
  interactive,
  multiline = false,
  value = "",
  placeholder,
  maxLength,
  disabled,
  ariaLabel,
  ariaLabelledBy,
  onChange,
}: CommonControlProps & {
  multiline?: boolean;
  value?: string;
  placeholder: string;
  maxLength?: number;
  onChange?: (value: string) => void;
}) {
  if (!interactive) {
    return <div aria-hidden className={multiline ? staticTextareaClass : staticInputClass}>{placeholder}</div>;
  }
  if (multiline) {
    return <Textarea aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} disabled={disabled} maxLength={maxLength} placeholder={placeholder} value={value} onChange={(event) => onChange?.(event.target.value)} />;
  }
  return <Input aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} disabled={disabled} maxLength={maxLength} placeholder={placeholder} value={value} onChange={(event) => onChange?.(event.target.value)} />;
}

export function QANumericResponseControl({
  interactive,
  value = "",
  unit,
  configured,
  validation,
  disabled,
  ariaLabelledBy,
  onChange,
}: CommonControlProps & {
  value?: number | string | null;
  unit?: string;
  configured?: string;
  validation?: string | null;
  onChange?: (value: number | null) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {interactive ? (
          <Input
            aria-labelledby={ariaLabelledBy}
            disabled={disabled}
            type="number"
            inputMode="decimal"
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value === "" ? null : Number(event.target.value))}
          />
        ) : <div aria-hidden className={staticInputClass}>0</div>}
        {unit ? <span className="shrink-0 text-sm font-medium text-[var(--text-secondary)]">{unit}</span> : null}
      </div>
      {configured ? <p className="mt-2 text-xs text-[var(--text-muted)]">{configured}</p> : null}
      {validation ? <p className="mt-2 text-sm font-medium text-[var(--error)]">{validation}</p> : null}
    </div>
  );
}

export function QADateResponseControl({ interactive, value = "", disabled, ariaLabelledBy, onChange }: CommonControlProps & {
  value?: string;
  onChange?: (value: string) => void;
}) {
  if (interactive) {
    return <Input aria-labelledby={ariaLabelledBy} disabled={disabled} type="date" value={value} onChange={(event) => onChange?.(event.target.value)} />;
  }
  return <div aria-hidden className={cn(staticInputClass, "justify-between")}><span>dd/mm/yyyy</span><CalendarDays className="h-4 w-4" /></div>;
}

export function QABooleanResponseControl({ interactive, value = null, disabled, ariaLabelledBy, onChange }: CommonControlProps & {
  value?: boolean | null;
  onChange?: (value: boolean) => void;
}) {
  return <div role={interactive ? "group" : undefined} aria-labelledby={interactive ? ariaLabelledBy : undefined} aria-hidden={interactive ? undefined : true} className="grid grid-cols-2 gap-2">
    {[["Yes", true], ["No", false]].map(([label, option]) => interactive ? (
      <Button key={String(option)} type="button" variant={value === option ? "default" : "outline"} className="h-12" disabled={disabled} onClick={() => onChange?.(option as boolean)}>{label as string}</Button>
    ) : <span key={String(option)} className={staticButtonClass}>{label as string}</span>)}
  </div>;
}

export function QASingleSelectResponseControl({ interactive, value = "", options, placeholder, disabled, ariaLabelledBy, onChange }: CommonControlProps & {
  value?: string;
  options: QAFieldOption[];
  placeholder: string;
  onChange?: (value: string) => void;
}) {
  if (!interactive) {
    return <div aria-hidden className={cn(staticInputClass, "justify-between text-[var(--text-primary)]")}><span className="text-[var(--text-muted)]">{placeholder}</span><ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /></div>;
  }
  return <Select aria-labelledby={ariaLabelledBy} disabled={disabled} value={value} onChange={(event) => onChange?.(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}</Select>;
}

export function QAMultiSelectResponseControl({ interactive, selectedValues = [], options, disabled, ariaLabelledBy, onChange }: CommonControlProps & {
  selectedValues?: string[];
  options: QAFieldOption[];
  onChange?: (values: string[]) => void;
}) {
  const selected = new Set(selectedValues);
  const shownOptions = options.length ? options : [{ id: "empty-option", label: "Add options in field settings", value: "", sortOrder: 0 }];
  return <div role={interactive ? "group" : undefined} aria-labelledby={interactive ? ariaLabelledBy : undefined} aria-hidden={interactive ? undefined : true} className="space-y-2">{shownOptions.map((option) => interactive ? (
    <label key={option.id} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-sm">
      <Checkbox disabled={disabled || !option.value} checked={selected.has(option.value)} onChange={(event) => onChange?.(event.target.checked ? [...selectedValues, option.value] : selectedValues.filter((value) => value !== option.value))} />
      <span>{option.label}</span>
    </label>
  ) : <div key={option.id} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-sm"><span className="h-4 w-4 rounded-[4px] border border-[var(--border)]" /><span>{option.label}</span></div>)}</div>;
}

export function QACheckboxResponseControl({ interactive, checked = false, disabled, ariaLabelledBy, onChange }: CommonControlProps & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  if (!interactive) return <div aria-hidden className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium"><span className="h-4 w-4 rounded-[4px] border border-[var(--border)]" /><span>Confirmed</span></div>;
  return <label className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium"><Checkbox aria-labelledby={ariaLabelledBy} disabled={disabled} checked={checked} onChange={(event) => onChange?.(event.target.checked)} /><span>Confirmed</span></label>;
}

export type QAInspectionResultValue = "pass" | "fail" | "na" | null;

export function QAInspectionResultControl({
  interactive,
  value = null,
  allowNa,
  comment = "",
  commentRule,
  commentAriaLabel = "Inspection comment",
  disabled,
  ariaLabelledBy,
  onResultChange,
  onCommentChange,
}: CommonControlProps & {
  value?: QAInspectionResultValue;
  allowNa: boolean;
  comment?: string;
  commentRule: QACommentRule;
  commentAriaLabel?: string;
  onResultChange?: (value: Exclude<QAInspectionResultValue, null>) => void;
  onCommentChange?: (value: string) => void;
}) {
  const results = ["pass", "fail", ...(allowNa ? ["na"] : [])] as Array<"pass" | "fail" | "na">;
  const commentRequired = commentRule === "required";
  const commentPlaceholder = commentRule === "required" ? "Enter required comment..." : commentRule === "required_on_fail" ? "Comment (required on fail)" : "Comment (optional)";
  return <div className="space-y-3">
    <div role={interactive ? "group" : undefined} aria-labelledby={interactive ? ariaLabelledBy : undefined} aria-hidden={interactive ? undefined : true} className={cn("grid gap-2", allowNa ? "grid-cols-3" : "grid-cols-2")}>
      {results.map((result) => interactive ? <Button key={result} type="button" variant={value === result ? "default" : "outline"} className="h-12 capitalize" disabled={disabled} onClick={() => onResultChange?.(result)}>{result === "na" ? "N/A" : result}</Button> : <span key={result} className={cn(staticButtonClass, "capitalize")}>{result === "na" ? "N/A" : result}</span>)}
    </div>
    <div>
      <p className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Comment{commentRequired ? <span className="ml-1 text-[var(--error)]" aria-label="Required">*</span> : null}</p>
      {interactive ? <Textarea aria-label={commentAriaLabel} disabled={disabled} placeholder={commentPlaceholder} value={comment} onChange={(event) => onCommentChange?.(event.target.value)} /> : <div aria-hidden className={staticTextareaClass}>{commentPlaceholder}</div>}
      {commentRule === "required_on_fail" ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Required if this check fails</p> : null}
    </div>
  </div>;
}

export type QAEvidencePlaceholderProps = {
  kind: "photo" | "file" | "signature";
  size?: "standard" | "compact";
  title?: string;
  detail?: string;
  unavailable?: boolean;
};

export function QAEvidencePlaceholder({ kind, size = "compact", title, detail, unavailable = false }: QAEvidencePlaceholderProps) {
  const config = kind === "photo"
    ? {
        icon: Camera,
        standardTitle: "Add photo evidence",
        compactTitle: "Photo evidence",
        standardUnavailable: "Photo capture is not yet available in QA Records.",
        compactUnavailable: "Capture not yet available",
      }
    : kind === "file"
      ? {
          icon: FileUp,
          standardTitle: "Upload supporting file",
          compactTitle: "Supporting file",
          standardUnavailable: "File upload is not yet available in QA Records.",
          compactUnavailable: "Upload not yet available",
        }
      : {
          icon: PenLine,
          standardTitle: "Signature",
          compactTitle: "Signature",
          standardUnavailable: "Not yet available in QA Records",
          compactUnavailable: "Not yet available in QA Records",
        };
  const Icon = config.icon;
  const primaryText = title ?? (size === "standard" ? config.standardTitle : config.compactTitle);
  const unavailableText = size === "standard" ? config.standardUnavailable : config.compactUnavailable;

  if (size === "standard" && kind !== "signature") {
    return <div className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-center sm:min-h-36 sm:p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)]"><Icon aria-hidden className="h-5 w-5" /></span>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{primaryText}</p>
      {detail ? <p className="text-xs text-[var(--text-muted)]">{detail}</p> : null}
      {unavailable ? <p className="max-w-sm text-xs leading-5 text-[var(--text-muted)]">{unavailableText}</p> : null}
    </div>;
  }

  return <div className="flex min-h-20 w-full items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)]"><Icon aria-hidden className="h-4 w-4" /></span>
    <div className="min-w-0 text-sm"><p className="font-semibold text-[var(--text-primary)]">{primaryText}</p>{detail ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p> : null}{unavailable ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{unavailableText}</p> : null}</div>
  </div>;
}

export function QAStaticSignatureControl() {
  return <div aria-hidden className="space-y-3">
    <div><p className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Signer name</p><div className={staticInputClass}>Signer name</div></div>
    <div><p className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Signature method</p><div className="grid grid-cols-2 gap-2"><div className={staticButtonClass}><span className="mr-2 h-4 w-4 rounded-full border-[5px] border-[var(--brand-blue)]" />Draw signature</div><div className={staticButtonClass}><span className="mr-2 h-4 w-4 rounded-full border border-[var(--border)]" />Typed acknowledgement</div></div></div>
    <div className="flex h-[180px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-white text-sm text-[var(--text-muted)] sm:h-auto sm:aspect-[3/1]">Draw signature here</div>
    <div className="flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 text-sm font-medium">Clear</div>
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3 text-sm"><span className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-[var(--border)]" /><span>I confirm that the information recorded in this QA response is accurate to the best of my knowledge.</span></div>
    <div className="flex min-h-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-sm font-semibold text-white">Save signature</div>
  </div>;
}

export function QAConfiguredEvidence({ photoRequired, minimumPhotos, fileRequired, requirePhotoOnFail }: { photoRequired: boolean; minimumPhotos: number; fileRequired: boolean; requirePhotoOnFail: boolean }) {
  if (!photoRequired && !fileRequired && !requirePhotoOnFail) return null;
  const photoDetail = `${photoRequired ? "Required" : "Required on Fail"}${minimumPhotos > 0 ? ` · minimum ${minimumPhotos}` : ""}`;
  return <div className="space-y-2"><p className="text-xs font-semibold text-[var(--text-secondary)]">Evidence</p>{photoRequired || requirePhotoOnFail ? <QAEvidencePlaceholder kind="photo" size="compact" title="Photo evidence configured" detail={photoDetail} /> : null}{fileRequired ? <QAEvidencePlaceholder kind="file" size="compact" title="Supporting file configured" /> : null}</div>;
}

export function QAHoldPointWarning({ recordMode = false }: { recordMode?: boolean }) {
  return <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-light)] p-3 text-sm text-[var(--text-primary)]"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden />HOLD POINT</div><p className="mt-1 text-[var(--text-secondary)]">Do not continue until this check has been released by an authorized QA verifier.</p>{recordMode ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Release is required before final QA completion.</p> : null}</div>;
}

export function QAProductMaterialResponseControl({ interactive, value = EMPTY_QA_PRODUCT_MATERIAL_VALUE, configuration, disabled, onChange }: {
  interactive: boolean;
  value?: QAProductMaterialValue | null;
  configuration: QAProductMaterialConfiguration;
  disabled?: boolean;
  onChange?: (value: QAProductMaterialValue) => void;
}) {
  const current = value ?? EMPTY_QA_PRODUCT_MATERIAL_VALUE;
  const update = (patch: Partial<QAProductMaterialValue>) => onChange?.({ ...current, ...patch, schemaVersion: 1, source: current.source === "material" ? "material" : "manual" });
  const fields: Array<{ key: keyof Pick<QAProductMaterialValue, "productName" | "batchLot" | "manufacturerName" | "supplierName" | "productCode">; label: string; placeholder: string; visible: boolean }> = [
    { key: "productName", label: "Product", placeholder: "Select or enter product", visible: true },
    { key: "batchLot", label: "Batch / Lot", placeholder: "Enter batch or lot", visible: configuration.captureBatchLot },
    { key: "manufacturerName", label: "Manufacturer", placeholder: "Enter manufacturer", visible: configuration.captureManufacturer },
    { key: "supplierName", label: "Supplier", placeholder: "Enter supplier", visible: configuration.captureSupplier },
    { key: "productCode", label: "Product Code", placeholder: "Enter product code", visible: configuration.captureProductCode },
  ];
  return <div className="space-y-3">{fields.filter((field) => field.visible).map((field) => <div key={field.key}><p className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">{field.label}</p><QATextResponseControl interactive={interactive} disabled={disabled} ariaLabel={field.label} maxLength={500} value={current[field.key]} placeholder={field.placeholder} onChange={(next) => update({ [field.key]: next })} /></div>)}<p className="text-xs text-[var(--text-secondary)]">Manual entry is always available.</p></div>;
}

export function measurementConfigurationText(configuration: Record<string, unknown>) {
  const bounds = configuration as { minimum?: number | null; maximum?: number | null; target?: number | null; tolerance?: number | null };
  return [
    bounds.minimum != null ? `Min ${bounds.minimum}` : "",
    bounds.maximum != null ? `Max ${bounds.maximum}` : "",
    bounds.target != null ? `Target ${bounds.target}${bounds.tolerance != null ? ` ± ${bounds.tolerance}` : ""}` : "",
  ].filter(Boolean).join(" · ");
}
