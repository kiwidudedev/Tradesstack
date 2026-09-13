"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  QA_MEASUREMENT_UNITS,
  type QACommentRule,
  type QAFieldDefinition,
  type QAPhotoRule,
  type QAProductMaterialConfiguration,
} from "@/lib/quality-assurance/definitions/types";
import {
  getInspectionCommentRule,
  getInspectionPhotoRule,
  getProductMaterialConfiguration,
  moveItem,
  newQAId,
  optionValue,
} from "@/lib/quality-assurance/definitions/model";

const labelClass = "mb-1 block text-[13px] font-semibold text-[var(--text-primary)]";

function ToggleRow({ label, description, checked, disabled, onChange }: { label: string; description?: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4 py-2"><div><p className="text-sm font-medium">{label}</p>{description ? <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p> : null}</div><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} /></div>;
}

function RuleChoice<T extends string>({ name, label, value, checked, disabled, onChange }: { name: string; label: string; value: T; checked: boolean; disabled: boolean; onChange: (value: T) => void }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-sm"><Radio name={name} value={value} checked={checked} disabled={disabled} onChange={() => onChange(value)} /><span>{label}</span></label>;
}

export function QAInspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-[var(--border-subtle)] py-4 first:pt-1 last:border-0"><h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{title}</h3><div className="space-y-3">{children}</div></section>;
}

export function QAFieldInspector({ field, canWrite, onChange }: { field: QAFieldDefinition; canWrite: boolean; onChange: (field: QAFieldDefinition) => void }) {
  const update = <K extends keyof QAFieldDefinition>(key: K, value: QAFieldDefinition[K]) => {
    if (!canWrite) return;
    onChange({ ...field, [key]: value });
  };
  const isInspection = field.fieldType === "inspection_check";
  const isPhoto = field.fieldType === "photo";
  const isProductMaterial = field.fieldType === "product_material";
  const isSelect = field.fieldType === "single_select" || field.fieldType === "multi_select";
  const measurement = field.configuration as { unit?: string; minimum?: number | null; maximum?: number | null; target?: number | null; tolerance?: number | null };
  const productMaterial = getProductMaterialConfiguration(field.configuration);
  const photoRule = getInspectionPhotoRule(field);
  const commentRule = getInspectionCommentRule(field);
  const setMeasurement = (key: string, value: string) => update("configuration", { ...measurement, [key]: key === "unit" ? value : value === "" ? null : Number(value) });
  const setProductMaterial = (key: keyof QAProductMaterialConfiguration, value: boolean) => update("configuration", { ...field.configuration, productMaterial: { ...productMaterial, [key]: value } });
  const setPhotoRule = (rule: QAPhotoRule) => {
    if (!canWrite) return;
    const activeMinimum = Number.isInteger(field.minimumPhotos) && field.minimumPhotos >= 1 && field.minimumPhotos <= 50 ? field.minimumPhotos : 1;
    onChange({ ...field, photoRequired: rule === "required", requirePhotoOnFail: rule === "required_on_fail", minimumPhotos: rule === "optional" ? field.minimumPhotos : activeMinimum });
  };
  const setCommentRule = (rule: QACommentRule) => {
    if (!canWrite) return;
    onChange({ ...field, requireCommentOnFail: rule === "required_on_fail", configuration: { ...field.configuration, commentRule: rule } });
  };

  return <div className="px-5">
    <QAInspectorSection title="General">
      <div><label className={labelClass} htmlFor="qa-field-label">{isInspection ? "Check" : "Label"}</label><Input id="qa-field-label" value={field.label} disabled={!canWrite} onChange={(event) => update("label", event.target.value)} /></div>
      <div><label className={labelClass} htmlFor="qa-field-instructions">Instructions</label><Textarea id="qa-field-instructions" value={field.instructions} disabled={!canWrite} onChange={(event) => update("instructions", event.target.value)} className="min-h-20" /></div>
      <ToggleRow label="Required" checked={field.required} disabled={!canWrite} onChange={(value) => update("required", value)} />
      {!isInspection ? <div><label className={labelClass} htmlFor="qa-field-description">Description</label><Textarea id="qa-field-description" value={field.description} disabled={!canWrite} onChange={(event) => update("description", event.target.value)} className="min-h-20" /></div> : null}
    </QAInspectorSection>

    {isPhoto ? <QAInspectorSection title="Photo evidence"><div><label className={labelClass} htmlFor="qa-photo-minimum">Minimum photos</label><Input id="qa-photo-minimum" type="number" min={1} max={50} value={Math.max(field.minimumPhotos || 0, 1)} disabled={!canWrite} onChange={(event) => update("minimumPhotos", Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /><p className="mt-1 text-xs text-[var(--text-secondary)]">Required Photo fields must contain at least this many persisted photos before completion.</p></div></QAInspectorSection> : null}

    {isProductMaterial ? <QAInspectorSection title="Capture">
      <ToggleRow label="Product name" description="Always shown. Manual entry is always available." checked disabled onChange={() => undefined} />
      <ToggleRow label="Batch / Lot" checked={productMaterial.captureBatchLot} disabled={!canWrite} onChange={(value) => setProductMaterial("captureBatchLot", value)} />
      <ToggleRow label="Manufacturer" checked={productMaterial.captureManufacturer} disabled={!canWrite} onChange={(value) => setProductMaterial("captureManufacturer", value)} />
      <ToggleRow label="Supplier" checked={productMaterial.captureSupplier} disabled={!canWrite} onChange={(value) => setProductMaterial("captureSupplier", value)} />
      <ToggleRow label="Product Code" checked={productMaterial.captureProductCode} disabled={!canWrite} onChange={(value) => setProductMaterial("captureProductCode", value)} />
      <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">Material suggestions are deferred. Site users can always enter any product manually.</p>
    </QAInspectorSection> : null}

    {field.fieldType === "measurement" ? <QAInspectorSection title="Measurement">
      <div><label className={labelClass} htmlFor="qa-field-unit">Unit</label><Input id="qa-field-unit" list="qa-measurement-units" value={measurement.unit ?? "mm"} disabled={!canWrite} maxLength={32} onChange={(event) => setMeasurement("unit", event.target.value)} /><datalist id="qa-measurement-units">{QA_MEASUREMENT_UNITS.map((unit) => <option key={unit} value={unit} />)}</datalist><p className="mt-1 text-xs text-[var(--text-secondary)]">Choose a common unit or type a custom unit.</p></div>
      <div className="grid grid-cols-2 gap-3">{[["minimum", "Minimum acceptable"], ["maximum", "Maximum acceptable"], ["target", "Target"], ["tolerance", "Tolerance"]].map(([key, label]) => <div key={key}><label className={labelClass}>{label}</label><Input type="number" disabled={!canWrite} value={measurement[key as keyof typeof measurement] ?? ""} onChange={(event) => setMeasurement(key, event.target.value)} /></div>)}</div>
      <p className="text-xs text-[var(--text-secondary)]">Minimum/maximum are authoritative when set. Otherwise Target ± Tolerance defines the acceptable range.</p>
    </QAInspectorSection> : null}

    {isSelect ? <QAInspectorSection title="Options">
      {field.options.map((option, index) => <div key={option.id} className="flex items-center gap-2"><Input aria-label={`Option ${index + 1}`} value={option.label} disabled={!canWrite} onChange={(event) => update("options", field.options.map((item) => item.id === option.id ? { ...item, label: event.target.value, value: optionValue(event.target.value, item.id) } : item))} /><div className="flex"><Button size="icon" variant="ghost" aria-label="Move option up" disabled={!canWrite || index === 0} onClick={() => update("options", moveItem(field.options, index, -1))}>↑</Button><Button size="icon" variant="ghost" aria-label="Move option down" disabled={!canWrite || index === field.options.length - 1} onClick={() => update("options", moveItem(field.options, index, 1))}>↓</Button><Button size="icon" variant="ghost" aria-label="Delete option" disabled={!canWrite} onClick={() => update("options", field.options.filter((item) => item.id !== option.id))}><Trash2 className="h-4 w-4" /></Button></div></div>)}
      <Button variant="outline" size="sm" disabled={!canWrite} onClick={() => { const id = newQAId(); update("options", [...field.options, { id, label: `Option ${field.options.length + 1}`, value: `option-${field.options.length + 1}-${id.slice(0, 4)}`, sortOrder: field.options.length }]); }}><Plus className="h-4 w-4" />Add option</Button>
    </QAInspectorSection> : null}

    {isInspection ? <>
      <QAInspectorSection title="Requirement"><div><label className={labelClass}>Requirement</label><Textarea value={field.requirement} disabled={!canWrite} onChange={(event) => update("requirement", event.target.value)} /></div></QAInspectorSection>
      <QAInspectorSection title="Response"><ToggleRow label="Allow N/A" checked={field.allowNa} disabled={!canWrite} onChange={(value) => update("allowNa", value)} /></QAInspectorSection>
      <QAInspectorSection title="Evidence">
        <div role="radiogroup" aria-label="Photo evidence" className="space-y-2">{([["optional", "Optional"], ["required", "Required"], ["required_on_fail", "Required on Fail"]] as Array<[QAPhotoRule, string]>).map(([value, label]) => <RuleChoice key={value} name={`${field.id}-photo-rule`} label={label} value={value} checked={photoRule === value} disabled={!canWrite} onChange={setPhotoRule} />)}</div>
        {photoRule !== "optional" ? <div><label className={labelClass} htmlFor="qa-minimum-photos">Minimum photos</label><Input id="qa-minimum-photos" type="number" min={1} max={50} value={Number.isInteger(field.minimumPhotos) && field.minimumPhotos >= 1 ? Math.min(50, field.minimumPhotos) : 1} disabled={!canWrite} onChange={(event) => update("minimumPhotos", Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /><p className="mt-1 text-xs text-[var(--text-secondary)]">The QA Record cannot be completed until this evidence rule is satisfied.</p></div> : null}
      </QAInspectorSection>
      <QAInspectorSection title="Comments"><div role="radiogroup" aria-label="Comments" className="space-y-2">{([["optional", "Optional"], ["required", "Required"], ["required_on_fail", "Required on Fail"]] as Array<[QACommentRule, string]>).map(([value, label]) => <RuleChoice key={value} name={`${field.id}-comment-rule`} label={label} value={value} checked={commentRule === value} disabled={!canWrite} onChange={setCommentRule} />)}</div></QAInspectorSection>
      <QAInspectorSection title="Hold Point"><ToggleRow label="Hold Point" description="Requires a user with QA verification permission to release this check before completion." checked={field.configuration.holdPointEnabled === true} disabled={!canWrite} onChange={(value) => update("configuration", { ...field.configuration, holdPointEnabled: value })} /></QAInspectorSection>
      {field.blockCompletionOnFail ? <QAInspectorSection title="Legacy compatibility"><div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-light)] p-3 text-sm"><p className="font-semibold">Legacy completion blocker detected</p><p className="mt-1 text-xs text-[var(--text-secondary)]">This hidden legacy setting must be disabled before the QA can be made Ready. Existing run snapshots are not rewritten.</p><Button type="button" size="sm" variant="outline" className="mt-3" disabled={!canWrite} onClick={() => update("blockCompletionOnFail", false)}>Disable legacy blocker</Button></div></QAInspectorSection> : null}
      <details className="group border-b border-[var(--border-subtle)] py-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"><span>Advanced</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3 space-y-3"><div><label className={labelClass} htmlFor="qa-field-description">Description</label><Textarea id="qa-field-description" value={field.description} disabled={!canWrite} onChange={(event) => update("description", event.target.value)} className="min-h-20" /></div><div><label className={labelClass}>Acceptance Criteria</label><Textarea value={field.acceptanceCriteria} disabled={!canWrite} onChange={(event) => update("acceptanceCriteria", event.target.value)} /></div><div><label className={labelClass}>Reference</label><Input value={field.referenceText} disabled={!canWrite} onChange={(event) => update("referenceText", event.target.value)} /></div></div>
      </details>
    </> : null}
  </div>;
}
