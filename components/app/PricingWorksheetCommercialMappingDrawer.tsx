"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { formatCommercialDocumentMoney } from "@/components/app/CommercialLineItemsTable";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { WorksheetCellMappingField } from "@/components/app/WorksheetCellMappingField";
import { QuoteDestinationSection } from "@/components/app/QuoteDestinationSection";
import type { QuotePublishOption } from "@/lib/commercial-items/quote-destination-adapter";
import type { PurchaseOrderPublishOption } from "@/lib/commercial-items/purchase-order-destination-adapter";
import {
  COMMERCIAL_MAPPING_FIELDS,
  EMPTY_COMMERCIAL_MAPPING_ERROR,
  getWorksheetCommercialFieldSource,
  type CommercialMappingField,
  type ResolvedWorksheetCommercialLine,
  type WorksheetCommercialMappingSession,
} from "@/lib/commercial-items/worksheet-commercial-mapping";
import { formatMoneyOperational } from "@/lib/format/currency";
import type { PurchaseOrderCostSection } from "@/lib/purchase-orders/types";
import type { WorksheetVariationCommercialMappingLine } from "@/hooks/use-worksheet-commercial-mapping";
import {
  VARIATION_COST_SECTIONS,
  type VariationCostSection,
} from "@/lib/commercial-items/variation-sections";

type ProcurementSection = Exclude<PurchaseOrderCostSection, "Margin">;

const FIELD_LABELS: Record<CommercialMappingField, string> = {
  description: "Description",
  quantity: "Qty.",
  unit: "Unit",
  rate: "Rate",
  total: "Total",
};

const commercialQuantityFormatter = new Intl.NumberFormat("en-NZ", {
  maximumFractionDigits: 3,
});

const COMPACT_SELECT_CLASS = "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]";

function formatQuantity(value: number) {
  return commercialQuantityFormatter.format(value);
}

function formatMappedFieldValue(field: CommercialMappingField, value: string | number | null, displayValue: string) {
  if (typeof value === "number") {
    if (field === "rate") return formatMoneyOperational(value, { decimals: 2 });
    if (field === "total") return formatCommercialDocumentMoney(value);
    return formatQuantity(value);
  }
  return value || displayValue || "Blank cell";
}

function MappingField({
  field,
  session,
  resolved,
  onArm,
  onClear,
  onAssign,
  onHighlight,
  isDescriptionEditing,
  descriptionDraft,
  descriptionEditButtonRef,
  onDescriptionDraftChange,
  onBeginDescriptionEdit,
  onCommitDescriptionEdit,
  onCancelDescriptionEdit,
  testIdPrefix = "commercial-mapping-field",
}: {
  field: CommercialMappingField;
  session: WorksheetCommercialMappingSession;
  resolved: ResolvedWorksheetCommercialLine;
  onArm: (field: CommercialMappingField) => void;
  onClear: (field: CommercialMappingField) => void;
  onAssign: (field: CommercialMappingField, cellKey: string) => void;
  onHighlight: (field: CommercialMappingField | null) => void;
  isDescriptionEditing: boolean;
  descriptionDraft: string;
  descriptionEditButtonRef: RefObject<HTMLButtonElement | null>;
  onDescriptionDraftChange: (value: string) => void;
  onBeginDescriptionEdit: () => void;
  onCommitDescriptionEdit: () => void;
  onCancelDescriptionEdit: () => void;
  testIdPrefix?: string;
}) {
  const source = getWorksheetCommercialFieldSource(session, field);
  const manual = field === "description" && session.description.mode === "manual";
  const editing = field === "description" && isDescriptionEditing;
  const value = resolved.fields[field];
  const armed = session.activeField === field;
  const displayValue = formatMappedFieldValue(field, value.value, value.displayValue);
  const descriptionInputId = testIdPrefix === "commercial-mapping-field"
    ? "commercial-mapping-description-input"
    : `${testIdPrefix}-description-input`;
  return (
    <WorksheetCellMappingField
      field={field}
      label={FIELD_LABELS[field]}
      testId={`${testIdPrefix}-${field}`}
      mappedCellKey={source?.cellKey ?? null}
      displayValue={source || manual ? displayValue : null}
      manualLabel={manual ? "Manual entry" : null}
      armed={armed}
      error={value.error}
      onArm={onArm}
      onClear={onClear}
      onAssign={onAssign}
      onHighlight={onHighlight}
      valueClassName={field === "description" ? "break-words font-medium leading-snug" : `truncate tabular-nums ${field === "total" ? "text-[15px] font-semibold" : "font-medium"}`}
      editingContent={editing ? (
          <div className="min-w-0 flex-1 px-3 py-2.5">
            <label htmlFor={descriptionInputId} className="block text-[13px] font-semibold leading-none text-[var(--text-secondary)]">Description</label>
            <Input
              id={descriptionInputId}
              data-testid={descriptionInputId}
              aria-label="Description"
              autoFocus
              value={descriptionDraft}
              onChange={(event) => onDescriptionDraftChange(event.target.value)}
              onBlur={onCommitDescriptionEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  onCommitDescriptionEdit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  onCancelDescriptionEdit();
                }
              }}
              className="mt-2 h-9 rounded-[var(--radius-sm)] text-sm"
            />
          </div>
        ) : undefined}
      trailingAction={field === "description" && !editing ? (
          <Tooltip label="Edit description">
            <Button ref={descriptionEditButtonRef} type="button" variant="secondary" size="icon" onClick={onBeginDescriptionEdit} aria-label="Edit description" className="my-auto h-10 w-10 shrink-0 rounded-[8px] border-0 bg-transparent text-[var(--text-muted)] shadow-none hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
              <Pencil className="h-4 w-4" />
            </Button>
          </Tooltip>
        ) : undefined}
    />
  );
}

function VariationMappingLineCard({
  line,
  resolved,
  lineNumber,
  canRemove,
  onArmField,
  onClearField,
  onAssignField,
  onHighlightField,
  onBeginDescriptionEdit,
  onCommitDescription,
  onSectionChange,
  onRemove,
}: {
  line: WorksheetVariationCommercialMappingLine;
  resolved: ResolvedWorksheetCommercialLine;
  lineNumber: number;
  canRemove: boolean;
  onArmField: (lineId: string, field: CommercialMappingField) => void;
  onClearField: (lineId: string, field: CommercialMappingField) => void;
  onAssignField: (lineId: string, field: CommercialMappingField, cellKey: string) => void;
  onHighlightField: (lineId: string, field: CommercialMappingField | null) => void;
  onBeginDescriptionEdit: (lineId: string) => void;
  onCommitDescription: (lineId: string, value: string, worksheetValue: string | null) => void;
  onSectionChange: (lineId: string, section: VariationCostSection) => void;
  onRemove: (lineId: string) => void;
}) {
  const descriptionEditButtonRef = useRef<HTMLButtonElement>(null);
  const descriptionEditingRef = useRef(false);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const beginDescriptionEdit = useCallback(() => {
    onBeginDescriptionEdit(line.id);
    setDescriptionDraft(resolved.line.description);
    descriptionEditingRef.current = true;
    setIsDescriptionEditing(true);
    onHighlightField(line.id, null);
  }, [line.id, onBeginDescriptionEdit, onHighlightField, resolved.line.description]);
  const restoreDescriptionEditFocus = useCallback(() => {
    requestAnimationFrame(() => descriptionEditButtonRef.current?.focus({ preventScroll: true }));
  }, []);
  const commitDescriptionEdit = useCallback(() => {
    if (!descriptionEditingRef.current) return;
    descriptionEditingRef.current = false;
    setIsDescriptionEditing(false);
    const worksheetValue = line.mapping.description.mode === "worksheet" ? resolved.line.description : null;
    onCommitDescription(line.id, descriptionDraft, worksheetValue);
    restoreDescriptionEditFocus();
  }, [descriptionDraft, line.id, line.mapping.description.mode, onCommitDescription, resolved.line.description, restoreDescriptionEditFocus]);
  const cancelDescriptionEdit = useCallback(() => {
    descriptionEditingRef.current = false;
    setDescriptionDraft(resolved.line.description);
    setIsDescriptionEditing(false);
    restoreDescriptionEditFocus();
  }, [resolved.line.description, restoreDescriptionEditFocus]);
  const mappingField = (field: CommercialMappingField) => (
    <MappingField
      field={field}
      session={line.mapping}
      resolved={resolved}
      onArm={(nextField) => onArmField(line.id, nextField)}
      onClear={(nextField) => onClearField(line.id, nextField)}
      onAssign={(nextField, cellKey) => onAssignField(line.id, nextField, cellKey)}
      onHighlight={(nextField) => onHighlightField(line.id, nextField)}
      isDescriptionEditing={isDescriptionEditing}
      descriptionDraft={descriptionDraft}
      descriptionEditButtonRef={descriptionEditButtonRef}
      onDescriptionDraftChange={setDescriptionDraft}
      onBeginDescriptionEdit={beginDescriptionEdit}
      onCommitDescriptionEdit={commitDescriptionEdit}
      onCancelDescriptionEdit={cancelDescriptionEdit}
      testIdPrefix={`variation-mapping-line-${line.id}-field`}
    />
  );
  const hasPreview = Boolean(resolved.line.description || resolved.line.unit || resolved.effective?.quantity !== null || resolved.effective?.rate !== null || resolved.effective?.total !== null);

  return (
    <section data-testid={`variation-mapping-line-${line.id}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Commercial line {lineNumber}</h3>
        {canRemove ? <Button type="button" variant="ghost" size="icon" aria-label={`Remove commercial line ${lineNumber}`} onClick={() => onRemove(line.id)} className="h-8 w-8 text-[var(--text-muted)]"><Trash2 className="h-4 w-4" /></Button> : null}
      </div>
      <div className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)]">{mappingField("description")}</div>
        <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">{mappingField("quantity")}{mappingField("unit")}</div>
        <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]">{mappingField("rate")}{mappingField("total")}</div>
      </div>
      <div className="border-t border-[var(--border-subtle)] p-3">
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Variation section</span>
          <select aria-label={`Variation section for commercial line ${lineNumber}`} value={line.section} onChange={(event) => onSectionChange(line.id, event.target.value as VariationCostSection)} className={COMPACT_SELECT_CLASS}>
            {VARIATION_COST_SECTIONS.map((section) => <option key={section} value={section}>{section === "Plant" ? "Plant / Equipment" : section}</option>)}
          </select>
        </label>
        {resolved.errors.includes(EMPTY_COMMERCIAL_MAPPING_ERROR) ? <p className="mt-2 text-xs text-[var(--text-muted)]">{EMPTY_COMMERCIAL_MAPPING_ERROR}</p> : null}
        {resolved.errors.filter((item) => item !== EMPTY_COMMERCIAL_MAPPING_ERROR).map((item) => <p key={item} className="mt-2 text-xs text-[var(--error)]">{item}</p>)}
        {hasPreview ? <div data-testid={`variation-mapping-line-${line.id}-preview`} className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
          {resolved.line.description ? <p className="break-words font-medium text-[var(--text-primary)]">{resolved.line.description}</p> : null}
          <div className="mt-1.5 flex items-end justify-between gap-3 text-[12px] text-[var(--text-secondary)]">
            <span>{resolved.effective?.quantity ?? "—"} {resolved.line.unit ?? ""} × {resolved.effective?.rate === null || resolved.effective?.rate === undefined ? "—" : formatMoneyOperational(resolved.effective.rate, { decimals: 2 })}</span>
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">{resolved.effective?.total === null || resolved.effective?.total === undefined ? "—" : formatCommercialDocumentMoney(resolved.effective.total)}</span>
          </div>
        </div> : null}
      </div>
    </section>
  );
}

export function PricingWorksheetVariationMappingDrawer({
  variationNumber,
  variationTitle,
  variationStatus,
  sheetName,
  lines,
  isPublishing,
  onClose,
  onEscape,
  onArmField,
  onClearField,
  onAssignField,
  onHighlightField,
  onBeginDescriptionEdit,
  onCommitDescription,
  onSectionChange,
  onAddLine,
  onRemoveLine,
  onPublish,
}: {
  variationNumber: string;
  variationTitle: string;
  variationStatus: string;
  sheetName: string;
  lines: Array<{ line: WorksheetVariationCommercialMappingLine; resolved: ResolvedWorksheetCommercialLine }>;
  isPublishing: boolean;
  onClose: () => void;
  onEscape: () => void;
  onArmField: (lineId: string, field: CommercialMappingField) => void;
  onClearField: (lineId: string, field: CommercialMappingField) => void;
  onAssignField: (lineId: string, field: CommercialMappingField, cellKey: string) => void;
  onHighlightField: (lineId: string, field: CommercialMappingField | null) => void;
  onBeginDescriptionEdit: (lineId: string) => void;
  onCommitDescription: (lineId: string, value: string, worksheetValue: string | null) => void;
  onSectionChange: (lineId: string, section: VariationCostSection) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onPublish: () => void;
}) {
  const hasErrors = lines.length === 0 || lines.some(({ resolved }) => resolved.errors.length > 0);
  return (
    <WorksheetSidePanel ariaLabel="Variation commercial mapping" closeLabel="Cancel Commercial Mapping Mode" onClose={onClose} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    }}>
      <WorksheetSidePanelHeader icon={<Link2 className="h-4 w-4" />} title="Add to Variation" description={sheetName} closeLabel="Cancel Commercial Mapping Mode" onClose={onClose} />
      <WorksheetSidePanelBody className="space-y-3 py-2.5">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{variationNumber}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{variationTitle.trim() || "Untitled variation"}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Status: {variationStatus}</p>
        </div>
        <p className="text-xs leading-5 text-[var(--text-secondary)]">Map worksheet cells into the current Variation. Each line keeps its own worksheet sources and section.</p>
        {lines.map(({ line, resolved }, index) => <VariationMappingLineCard key={line.id} line={line} resolved={resolved} lineNumber={index + 1} canRemove={lines.length > 1} onArmField={onArmField} onClearField={onClearField} onAssignField={onAssignField} onHighlightField={onHighlightField} onBeginDescriptionEdit={onBeginDescriptionEdit} onCommitDescription={onCommitDescription} onSectionChange={onSectionChange} onRemove={onRemoveLine} />)}
        <Button type="button" variant="secondary" onClick={onAddLine} disabled={isPublishing} className="w-full"><Plus className="h-4 w-4" />Add Another</Button>
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPublishing}>Cancel</Button>
        <Button data-testid="variation-commercial-mapping-publish" type="button" onClick={onPublish} disabled={isPublishing || hasErrors}>{isPublishing ? "Adding…" : "Add to Variation"}</Button>
      </WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}

export function PricingWorksheetCommercialMappingDrawer({
  session,
  resolved,
  sheetName,
  quoteOptions,
  quoteTargetMode,
  quoteTargetIds,
  purchaseOrderOptions,
  suppliers,
  purchaseOrderTargetMode,
  purchaseOrderTargetId,
  purchaseOrderSupplierId,
  purchaseOrderTitle,
  purchaseOrderSection,
  isPublishing,
  onClose,
  onEscape,
  onArmField,
  onClearField,
  onAssignField,
  onHighlightField,
  onBeginDescriptionEdit,
  onCommitDescription,
  onQuoteTargetModeChange,
  onQuoteTargetIdsChange,
  onPurchaseOrderTargetModeChange,
  onPurchaseOrderTargetIdChange,
  onPurchaseOrderSupplierIdChange,
  onPurchaseOrderTitleChange,
  onPurchaseOrderSectionChange,
  onPublish,
}: {
  session: WorksheetCommercialMappingSession;
  resolved: ResolvedWorksheetCommercialLine;
  sheetName: string;
  quoteOptions: QuotePublishOption[];
  quoteTargetMode: "new" | "existing";
  quoteTargetIds: string[];
  purchaseOrderOptions: PurchaseOrderPublishOption[];
  suppliers: Array<{ id: string; label: string }>;
  purchaseOrderTargetMode: "new" | "existing";
  purchaseOrderTargetId: string;
  purchaseOrderSupplierId: string;
  purchaseOrderTitle: string;
  purchaseOrderSection: ProcurementSection | "";
  isPublishing: boolean;
  onClose: () => void;
  onEscape: () => void;
  onArmField: (field: CommercialMappingField) => void;
  onClearField: (field: CommercialMappingField) => void;
  onAssignField: (field: CommercialMappingField, cellKey: string) => void;
  onHighlightField: (field: CommercialMappingField | null) => void;
  onBeginDescriptionEdit: () => void;
  onCommitDescription: (value: string, worksheetValue: string | null) => void;
  onQuoteTargetModeChange: (mode: "new" | "existing") => void;
  onQuoteTargetIdsChange: (ids: string[]) => void;
  onPurchaseOrderTargetModeChange: (mode: "new" | "existing") => void;
  onPurchaseOrderTargetIdChange: (id: string) => void;
  onPurchaseOrderSupplierIdChange: (id: string) => void;
  onPurchaseOrderTitleChange: (title: string) => void;
  onPurchaseOrderSectionChange: (section: ProcurementSection | "") => void;
  onPublish: () => void;
}) {
  const firstFieldRef = useRef<HTMLDivElement>(null);
  const descriptionEditButtonRef = useRef<HTMLButtonElement>(null);
  const descriptionEditingRef = useRef(false);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const initialFocusFieldRef = useRef<CommercialMappingField>(
    session.activeField
      ?? COMMERCIAL_MAPPING_FIELDS.find((field) => field === "description"
        ? session.description.mode === "empty"
        : !session.mappings[field])
      ?? "description",
  );
  useEffect(() => {
    firstFieldRef.current
      ?.querySelector<HTMLButtonElement>(`[data-testid="commercial-mapping-field-${initialFocusFieldRef.current}"] button[aria-pressed]`)
      ?.focus({ preventScroll: true });
  }, []); // Focus only when the adaptive drawer enters; cell assignments keep worksheet focus.
  const restoreDescriptionEditFocus = useCallback(() => {
    requestAnimationFrame(() => descriptionEditButtonRef.current?.focus({ preventScroll: true }));
  }, []);
  const beginDescriptionEdit = useCallback(() => {
    onBeginDescriptionEdit();
    setDescriptionDraft(resolved.line.description);
    descriptionEditingRef.current = true;
    setIsDescriptionEditing(true);
    onHighlightField(null);
  }, [onBeginDescriptionEdit, onHighlightField, resolved.line.description]);
  const commitDescriptionEdit = useCallback(() => {
    if (!descriptionEditingRef.current) return;
    descriptionEditingRef.current = false;
    setIsDescriptionEditing(false);
    const worksheetValue = session.description.mode === "worksheet" ? resolved.line.description : null;
    onCommitDescription(descriptionDraft, worksheetValue);
    restoreDescriptionEditFocus();
  }, [descriptionDraft, onCommitDescription, resolved.line.description, restoreDescriptionEditFocus, session.description.mode]);
  const cancelDescriptionEdit = useCallback(() => {
    if (!descriptionEditingRef.current) return;
    descriptionEditingRef.current = false;
    setDescriptionDraft(resolved.line.description);
    setIsDescriptionEditing(false);
    restoreDescriptionEditFocus();
  }, [resolved.line.description, restoreDescriptionEditFocus]);
  const destinationLabel = session.destination === "quote" ? "Quote" : "Purchase Order";
  const destinationInvalid = session.destination === "quote"
    ? quoteTargetMode === "existing" && quoteTargetIds.length === 0
    : !purchaseOrderSupplierId || !purchaseOrderSection || (purchaseOrderTargetMode === "existing" ? !purchaseOrderTargetId : !purchaseOrderTitle.trim());
  const previewQuantity = resolved.effective?.quantity ?? null;
  const previewRate = resolved.effective?.rate ?? null;
  const previewTotal = resolved.effective?.total ?? null;
  const previewUnit = resolved.line.unit?.trim() || "Item";
  const hasMappedNumericValue = (["quantity", "rate", "total"] as const).some((field) => (
    Boolean(session.mappings[field]) && typeof resolved.fields[field].value === "number"
  ));
  const hasDescription = Boolean(resolved.line.description);
  const hasMappedUnit = Boolean(session.mappings.unit && resolved.line.unit);
  const hasPreviewContent = hasDescription || hasMappedUnit || hasMappedNumericValue;
  const fieldErrors = new Set(COMMERCIAL_MAPPING_FIELDS.flatMap((field) => resolved.fields[field].error ? [resolved.fields[field].error!] : []));
  const combinationError = resolved.errors.find((error) => error !== EMPTY_COMMERCIAL_MAPPING_ERROR && !fieldErrors.has(error)) ?? null;
  const hasExceptionalMappedTotal = resolved.line.total !== null
    && previewTotal !== null
    && Math.abs(resolved.line.total - previewTotal) > 0.01;

  const mappingField = (field: CommercialMappingField) => (
    <MappingField
      field={field}
      session={session}
      resolved={resolved}
      onArm={onArmField}
      onClear={onClearField}
      onAssign={onAssignField}
      onHighlight={onHighlightField}
      isDescriptionEditing={isDescriptionEditing}
      descriptionDraft={descriptionDraft}
      descriptionEditButtonRef={descriptionEditButtonRef}
      onDescriptionDraftChange={setDescriptionDraft}
      onBeginDescriptionEdit={beginDescriptionEdit}
      onCommitDescriptionEdit={commitDescriptionEdit}
      onCancelDescriptionEdit={cancelDescriptionEdit}
    />
  );

  return (
    <WorksheetSidePanel
      ariaLabel={`${destinationLabel} commercial mapping`}
      closeLabel="Cancel Commercial Mapping Mode"
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }}
    >
      <WorksheetSidePanelHeader icon={<Link2 className="h-4 w-4" />} title={`Add to ${destinationLabel}`} description={sheetName} closeLabel="Cancel Commercial Mapping Mode" onClose={onClose} />
      <WorksheetSidePanelBody className="py-2.5">
        <div ref={firstFieldRef} data-testid="commercial-mapping-fields" className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
          <div data-testid="commercial-mapping-description-row" className="border-b border-[var(--border-subtle)]">
            {mappingField("description")}
          </div>
          <div data-testid="commercial-mapping-quantity-unit-row" className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
            {mappingField("quantity")}
            {mappingField("unit")}
          </div>
          <div data-testid="commercial-mapping-rate-total-row" className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]">
            {mappingField("rate")}
            {mappingField("total")}
          </div>
        </div>
        {resolved.errors.includes(EMPTY_COMMERCIAL_MAPPING_ERROR) ? <p data-testid="commercial-mapping-empty-helper" className="mt-2 px-1 text-xs text-[var(--text-muted)]">{EMPTY_COMMERCIAL_MAPPING_ERROR}</p> : null}
        {combinationError ? <p data-testid="commercial-mapping-combination-error" className="mt-2 px-1 text-xs text-[var(--error)]">{combinationError}</p> : null}
        {hasPreviewContent ? <section data-testid="commercial-mapping-preview" className="mt-3 border-t border-[var(--border-subtle)] pt-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Preview</h3>
          {hasDescription ? <p className="mt-1.5 break-words text-sm font-medium leading-snug text-[var(--text-primary)]">{resolved.line.description}</p> : null}
          {hasMappedUnit && !hasMappedNumericValue ? <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Unit: <span className="font-medium text-[var(--text-primary)]">{resolved.line.unit}</span></p> : null}
          {hasMappedNumericValue ? <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
            <p className="min-w-0 text-[12px] text-[var(--text-secondary)]">
              {previewQuantity === null ? "—" : formatQuantity(previewQuantity)} {previewUnit} × {previewRate === null ? "—" : formatMoneyOperational(previewRate, { decimals: 2 })}
            </p>
            <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
              {previewTotal === null ? "—" : formatCommercialDocumentMoney(previewTotal)}
            </p>
          </div> : null}
          {hasMappedNumericValue && resolved.effective?.derivedRate ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">Rate derived from Total ÷ Quantity.</p> : null}
          {hasMappedNumericValue && resolved.effective?.derivedQuantity ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">Quantity defaults to 1 for this total-only mapping.</p> : null}
          {hasExceptionalMappedTotal ? (
            <dl className="mt-2 space-y-1 border-t border-[var(--border-subtle)] pt-2 text-[12px]">
              <div className="flex items-center justify-between gap-3"><dt className="text-[var(--text-secondary)]">Mapped total</dt><dd className="font-medium tabular-nums text-[var(--text-primary)]">{formatCommercialDocumentMoney(resolved.line.total!)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-[var(--text-secondary)]">Persisted total</dt><dd className="font-semibold tabular-nums text-[var(--text-primary)]">{formatCommercialDocumentMoney(previewTotal!)}</dd></div>
            </dl>
          ) : null}
        </section> : null}

        {resolved.warnings.map((warning) => <OperationalAlert key={warning} variant="warning" className="mt-3">{warning}</OperationalAlert>)}

        <section className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{destinationLabel} destination</h3>
          {session.destination === "quote" ? (
            <QuoteDestinationSection options={quoteOptions} mode={quoteTargetMode} selectedIds={quoteTargetIds} disabled={isPublishing} onModeChange={onQuoteTargetModeChange} onSelectedIdsChange={onQuoteTargetIdsChange} />
          ) : (
            <>
              <label className="block space-y-1.5"><span className="text-[12px] font-medium text-[var(--text-secondary)]">Supplier</span><select aria-label="Supplier" value={purchaseOrderSupplierId} onChange={(event) => onPurchaseOrderSupplierIdChange(event.target.value)} className={COMPACT_SELECT_CLASS}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.label}</option>)}</select></label>
              <label className="block space-y-1.5"><span className="text-[12px] font-medium text-[var(--text-secondary)]">Procurement section</span><select aria-label="Procurement section" value={purchaseOrderSection} onChange={(event) => onPurchaseOrderSectionChange(event.target.value as ProcurementSection | "")} className={COMPACT_SELECT_CLASS}><option value="">Select procurement section</option><option value="Labour">Labour</option><option value="Materials">Materials</option><option value="Subcontractors">Subcontractors</option><option value="Plant">Plant / Equipment</option></select></label>
              <fieldset className="space-y-1.5"><legend className="text-[12px] font-medium text-[var(--text-secondary)]">Purchase Order</legend><div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-subtle)] p-1"><Button type="button" size="sm" aria-pressed={purchaseOrderTargetMode === "new"} variant={purchaseOrderTargetMode === "new" ? "secondary" : "ghost"} onClick={() => onPurchaseOrderTargetModeChange("new")}>New draft</Button><Button type="button" size="sm" aria-pressed={purchaseOrderTargetMode === "existing"} variant={purchaseOrderTargetMode === "existing" ? "secondary" : "ghost"} onClick={() => onPurchaseOrderTargetModeChange("existing")}>Existing draft</Button></div></fieldset>
              {purchaseOrderTargetMode === "new" ? <label className="block space-y-1.5"><span className="text-[12px] font-medium text-[var(--text-secondary)]">Title</span><Input size="toolbar" aria-label="Purchase Order title" value={purchaseOrderTitle} onChange={(event) => onPurchaseOrderTitleChange(event.target.value)} className="rounded-[var(--radius-sm)]" /></label> : <label className="block space-y-1.5"><span className="text-[12px] font-medium text-[var(--text-secondary)]">Draft Purchase Order</span><select aria-label="Draft Purchase Order" value={purchaseOrderTargetId} onChange={(event) => onPurchaseOrderTargetIdChange(event.target.value)} className={COMPACT_SELECT_CLASS}><option value="">Select draft Purchase Order</option>{purchaseOrderOptions.map((purchaseOrder) => <option key={purchaseOrder.id} value={purchaseOrder.id}>{purchaseOrder.purchaseOrderNumber} · {purchaseOrder.purchaseOrderTitle || "Untitled purchase order"}</option>)}</select></label>}
            </>
          )}
        </section>
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPublishing}>Cancel</Button>
        <Button data-testid="commercial-mapping-publish" type="button" onClick={onPublish} disabled={isPublishing || resolved.errors.length > 0 || destinationInvalid}>{isPublishing ? "Adding…" : session.destination === "quote" && quoteTargetMode === "existing" && quoteTargetIds.length > 1 ? "Add to Quotes" : `Add to ${destinationLabel}`}</Button>
      </WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
