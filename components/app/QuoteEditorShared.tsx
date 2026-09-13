"use client";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { QuoteCommercialItemPickerItem } from "@/lib/commercial-items/quote-linking";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorksheetSourceLink } from "@/components/app/WorksheetSourceLink";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import styles from "@/components/app/trade-pack-builder.module.css";
import {
  COMMERCIAL_LINE_GRID_WITHOUT_SOURCE,
  COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE,
} from "@/components/app/commercial-line-table-layout";
import {
  LINE_ITEM_SECTIONS,
  STANDARD_QUOTE_PRICING_LABELS,
  STATUS_OPTIONS,
  formatQuoteRateDisplay,
  lineItemTotal,
  numberOrZero,
  parseQuoteRateDraft,
  toDayMonthYearLabel,
  toMoney,
  type LineItem,
  type LineItemSection,
  type PricingSummary,
  type QuoteStatus,
} from "@/lib/quote-editor-core";
export {
  LINE_ITEM_SECTIONS,
  STANDARD_QUOTE_PRICING_LABELS,
  STATUS_OPTIONS,
  lineItemTotal,
  makeDefaultLineItem,
  numberOrZero,
  toDayMonthYearLabel,
  toMoney,
  type LineItem,
  type LineItemSection,
  type PricingSummary,
  type QuoteStatus,
  type ScopeCostCategoryItem,
} from "@/lib/quote-editor-core";

function quoteStatusBadge(status: QuoteStatus): NonNullable<StatusBadgeProps["status"]> {
  switch (status) {
    case "Accepted":
      return "approved";
    case "Sent":
      return "sent";
    case "Rejected":
      return "overdue";
    case "Expired":
      return "overdue";
    case "Draft":
    default:
      return "draft";
  }
}

const ROW_CELL_PADDING_CLASS = "px-2 py-1";
const DESCRIPTION_CELL_PADDING_CLASS = "px-3 py-1";
const ROW_DIVIDER_CLASS = "self-stretch border-l border-[var(--border)]";
const ROW_FIELD_SHELL_CLASS = "flex h-full w-full items-center";
const DESCRIPTION_FIELD_SHELL_CLASS = "flex min-h-[34px] w-full items-center";
const COMPACT_FIELD_CLASS = "h-[34px] w-full appearance-none !border-0 !bg-transparent px-1.5 text-[13px] leading-[1.1] text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none";
const COMPACT_NUMERIC_FIELD_CLASS = `${COMPACT_FIELD_CLASS} text-right tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
const COMPACT_VALUE_FIELD_CLASS = `${interMedium.className} flex h-[34px] w-full items-center justify-end px-1.5 text-right text-[13px] leading-[1.1] text-[var(--text-primary)] tabular-nums`;
const SECTION_FIELD_CLASS = `${interMedium.className} h-[34px] w-full !border-0 !bg-transparent pl-0 pr-5 text-left text-sm leading-[1.15] text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`;

function QuoteRateInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatQuoteRateDisplay(value));

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={isFocused ? draft : formatQuoteRateDisplay(value)}
      onFocus={() => {
        setIsFocused(true);
        setDraft(String(value));
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const parsed = parseQuoteRateDraft(nextDraft);
        if (parsed !== null) {
          onChange(parsed);
        }
      }}
      onBlur={() => {
        const parsed = parseQuoteRateDraft(draft);
        const committedValue = parsed ?? (draft.trim() === "" ? 0 : value);
        if (draft.trim() === "") {
          onChange(0);
        }
        setIsFocused(false);
        setDraft(formatQuoteRateDisplay(committedValue));
      }}
      className={className}
    />
  );
}

function commercialItemStatusLabel(value: string) {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}` : "Current";
}

function DescriptionInputWithPreview({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const minHeight = 16;
    const maxHeight = 112;

    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value]);

  return (
    <div className="relative w-full">
      <div className={DESCRIPTION_FIELD_SHELL_CLASS}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          title={value.trim() || placeholder || ""}
          rows={1}
          className={`${interMedium.className} min-h-0 max-h-28 min-w-[200px] w-full resize-none border-0 bg-transparent px-2.5 py-0 text-sm leading-[1.15] text-[var(--text-primary)] shadow-none outline-none focus:border-0 focus:bg-transparent focus:shadow-none focus:outline-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-none`}
        />
      </div>
    </div>
  );
}

function CommercialItemLineMeta({
  lineItem,
  sourceHref,
}: {
  lineItem: LineItem;
  sourceHref?: string | null;
}) {
  const link = lineItem.commercialItemLink;
  if (!link) {
    return null;
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] leading-none">
      <WorksheetSourceLink href={sourceHref} />
    </div>
  );
}

interface QuoteEditorLayoutBaseProps {
  heroTitle: string;
  backHref?: string;
  backLabel?: string;
  createdAt?: string | null;
  error: string | null;
  saveMessage: string | null;
  readOnlyMessage?: string | null;
  shouldShowEditor: boolean;
  isLoadingQuote: boolean;
  isHydratingExistingQuote: boolean;
  canManageQuote: boolean;
  canDeleteQuote: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  quoteId: string | null;
  quoteStatus: QuoteStatus;
  setQuoteStatus: (value: QuoteStatus) => void;
  quoteTitle: string;
  setQuoteTitle: (value: string) => void;
  clientName: string;
  siteAddress: string;
  projectName: string;
  setProjectName: (value: string) => void;
  quoteDate: string;
  setQuoteDate: (value: string) => void;
  expiryDate: string;
  setExpiryDate: (value: string) => void;
  quoteNumber: string;
  onSave: () => void | Promise<void>;
  onEdit: () => void;
  onExport: () => void;
  onDelete?: (() => void | Promise<void>) | null;
  lineItems: LineItem[];
  mainLineItems: LineItem[];
  optionalLineItems: LineItem[];
  addLineItem: (isOptional?: boolean) => void;
  updateLineItem: <K extends keyof LineItem>(id: string, key: K, value: LineItem[K]) => void;
  removeLineItem: (id: string) => void;
  isQuoteDetailsOpen: boolean;
  setIsQuoteDetailsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isLineItemsOpen: boolean;
  setIsLineItemsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isTermsOpen: boolean;
  setIsTermsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  onOpenScopeImport: () => void;
  scopeImportTriggerRef?: Ref<HTMLButtonElement>;
  canUseMaterials?: boolean;
  onOpenMaterials?: () => void;
  materialsTriggerRef?: Ref<HTMLButtonElement>;
  getCommercialItemSourceHref?: (item: LineItem) => string | null;
  sectionSubtotals: Map<LineItemSection, number>;
  validityPeriod: string;
  setValidityPeriod: (value: string) => void;
  paymentTerms: string;
  setPaymentTerms: (value: string) => void;
  leadTime: string;
  setLeadTime: (value: string) => void;
  termsInclusions: string;
  setTermsInclusions: (value: string) => void;
  termsExclusions: string;
  setTermsExclusions: (value: string) => void;
  clarifications: string;
  setClarifications: (value: string) => void;
  assumptions: string;
  setAssumptions: (value: string) => void;
  marginPercent: string;
  setMarginPercent: (value: string) => void;
  discountAmount: string;
  setDiscountAmount: (value: string) => void;
  contingencyAmount: string;
  setContingencyAmount: (value: string) => void;
  gstPercent: string;
  setGstPercent: (value: string) => void;
  includeMarginInExport: boolean;
  setIncludeMarginInExport: (value: boolean | ((current: boolean) => boolean)) => void;
  includeDiscountInExport: boolean;
  setIncludeDiscountInExport: (value: boolean | ((current: boolean) => boolean)) => void;
  includeContingencyInExport: boolean;
  setIncludeContingencyInExport: (value: boolean | ((current: boolean) => boolean)) => void;
  pricingSummary: PricingSummary;
  primaryAction?: ReactNode;
  recordTabs?: ReactNode;
  contentOverride?: ReactNode;
  hideRecordHeader?: boolean;
}

type QuoteEditorLayoutProps = QuoteEditorLayoutBaseProps & (
  | {
      showWorksheetSources: true;
      isCommercialItemsOpen: boolean;
      setIsCommercialItemsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
      isLoadingCommercialItems: boolean;
      availableCommercialItems: QuoteCommercialItemPickerItem[];
      selectedCommercialItemIds: string[];
      toggleCommercialItem: (itemId: string) => void;
      importSelectedCommercialItems: () => void;
    }
  | {
      showWorksheetSources: false;
      isCommercialItemsOpen?: never;
      setIsCommercialItemsOpen?: never;
      isLoadingCommercialItems?: never;
      availableCommercialItems?: never;
      selectedCommercialItemIds?: never;
      toggleCommercialItem?: never;
      importSelectedCommercialItems?: never;
    }
);

export function QuoteEditorLayout({
  heroTitle,
  backHref,
  backLabel,
  createdAt,
  error,
  saveMessage,
  readOnlyMessage,
  shouldShowEditor,
  isLoadingQuote,
  isHydratingExistingQuote,
  canManageQuote,
  canDeleteQuote,
  isSaving,
  isDeleting,
  quoteId,
  quoteStatus,
  setQuoteStatus,
  quoteTitle,
  setQuoteTitle,
  clientName,
  siteAddress,
  projectName,
  setProjectName,
  quoteDate,
  setQuoteDate,
  expiryDate,
  setExpiryDate,
  quoteNumber,
  onSave,
  onEdit,
  onExport,
  onDelete,
  lineItems,
  mainLineItems,
  optionalLineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
  isQuoteDetailsOpen,
  setIsQuoteDetailsOpen,
  isLineItemsOpen,
  setIsLineItemsOpen,
  isTermsOpen,
  setIsTermsOpen,
  onOpenScopeImport,
  scopeImportTriggerRef,
  showWorksheetSources,
  isCommercialItemsOpen = false,
  setIsCommercialItemsOpen,
  isLoadingCommercialItems = false,
  availableCommercialItems = [],
  selectedCommercialItemIds = [],
  toggleCommercialItem,
  importSelectedCommercialItems,
  canUseMaterials = false,
  onOpenMaterials,
  materialsTriggerRef,
  getCommercialItemSourceHref,
  sectionSubtotals,
  validityPeriod,
  setValidityPeriod,
  paymentTerms,
  setPaymentTerms,
  leadTime,
  setLeadTime,
  termsInclusions,
  setTermsInclusions,
  termsExclusions,
  setTermsExclusions,
  clarifications,
  setClarifications,
  assumptions,
  setAssumptions,
  marginPercent,
  setMarginPercent,
  discountAmount,
  setDiscountAmount,
  contingencyAmount,
  setContingencyAmount,
  gstPercent,
  setGstPercent,
  includeMarginInExport,
  setIncludeMarginInExport,
  includeDiscountInExport,
  setIncludeDiscountInExport,
  includeContingencyInExport,
  setIncludeContingencyInExport,
  pricingSummary,
  primaryAction,
  recordTabs,
  contentOverride,
  hideRecordHeader = false,
}: QuoteEditorLayoutProps) {
  const markupLabel = STANDARD_QUOTE_PRICING_LABELS.markup;
  const contingencyLabel = STANDARD_QUOTE_PRICING_LABELS.contingency;
  const subtotalExcludingGstLabel = STANDARD_QUOTE_PRICING_LABELS.subtotalExcludingGst;
  const preGstPrimaryTotal = Math.max(0, pricingSummary.grandTotal - pricingSummary.gst);
  const currentStatusLabel = STATUS_OPTIONS.find((status) => status.value === quoteStatus)?.label ?? quoteStatus;
  const headerTitle = quoteNumber.trim() || quoteTitle.trim() || heroTitle;
  const createdAtLabel = (() => {
    if (!createdAt) {
      return "";
    }

    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("en-NZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  })();

  return (
    <div className={`${ibmPlexSans.className} -mb-8 w-full space-y-6 bg-[var(--background)]`} aria-busy={isLoadingQuote}>
      {hideRecordHeader ? null : (
        <OperationalModuleHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{headerTitle}</span>
              <StatusBadge status={quoteStatusBadge(quoteStatus)}>{currentStatusLabel}</StatusBadge>
            </span>
          }
          eyebrow={backHref && backLabel ? <a href={backHref} className="underline underline-offset-2">{backLabel}</a> : undefined}
          description={saveMessage ?? undefined}
          actions={
            <>
              {primaryAction !== undefined ? primaryAction : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (shouldShowEditor) {
                      void onSave();
                      return;
                    }
                    onEdit();
                  }}
                  disabled={shouldShowEditor ? !canManageQuote || isSaving : !canManageQuote}
                >
                  {shouldShowEditor ? (isSaving ? "Saving..." : "Save Quote") : "Edit Quote"}
                </Button>
              )}
              <Button
                type="button"
                onClick={onExport}
                disabled={isSaving || isLoadingQuote}
                className={primaryAction !== undefined ? "sm:min-w-[180px]" : undefined}
              >
                Export PDF
              </Button>
            </>
          }
        />
      )}

      {recordTabs}

      {error ? (
        <OperationalAlert variant="error">
          {error}
        </OperationalAlert>
      ) : null}
      {readOnlyMessage ? (
        <OperationalAlert variant="warning">
          {readOnlyMessage}
        </OperationalAlert>
      ) : null}

      {contentOverride ? contentOverride : isHydratingExistingQuote ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <OperationalPanel>
            <p className="text-sm text-[var(--text-secondary)]">Loading saved quote...</p>
          </OperationalPanel>
          <OperationalPanel>
            <p className="text-sm text-[var(--text-secondary)]">Loading pricing...</p>
          </OperationalPanel>
        </div>
      ) : shouldShowEditor ? (
        <div className="space-y-6 [&_input]:border-[var(--border)] [&_input]:bg-[var(--card)] [&_input]:text-[var(--text-primary)] [&_input]:outline-none [&_input]:ring-0 [&_input:focus]:outline-none [&_input:focus]:ring-0 [&_input:focus-visible]:outline-none [&_input:focus-visible]:ring-0 [&_select]:border-[var(--border)] [&_select]:bg-[var(--card)] [&_select]:text-[var(--text-primary)] [&_select]:outline-none [&_select]:ring-0 [&_select:focus]:outline-none [&_select:focus]:ring-0 [&_select:focus-visible]:outline-none [&_select:focus-visible]:ring-0 [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--card)] [&_textarea]:text-[var(--text-primary)] [&_textarea]:outline-none [&_textarea]:ring-0 [&_textarea:focus]:outline-none [&_textarea:focus]:ring-0 [&_textarea:focus-visible]:outline-none [&_textarea:focus-visible]:ring-0">
          <OperationalPanel contentClassName="px-5 py-5 sm:px-6">
            <div className="border-b border-[var(--border)] pb-6">
              <button
                type="button"
                onClick={() => setIsQuoteDetailsOpen((current) => !current)}
                className="flex w-full items-center justify-between pb-4"
              >
                <h2 className={styles.quoteSectionTitle}>Quote Details</h2>
                <ChevronDown className={`h-4 w-4 text-[var(--text-secondary)] transition-transform ${isQuoteDetailsOpen ? "rotate-180" : ""}`} />
              </button>

              {isQuoteDetailsOpen ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Client</label>
                    <div className={`${styles.quoteBodyValue} flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 text-sm font-medium`}>
                      {clientName || "Client"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Quote Date</label>
                    <Input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Expiry Date</label>
                    <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
                  </div>
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Site Address</label>
                    <div className={`${styles.quoteBodyValue} min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-3 text-sm font-medium leading-relaxed`}>
                      {siteAddress || "No site address yet"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Quote Number</label>
                    <Input value={quoteNumber} readOnly placeholder="Q-26001-1" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Status</label>
                    <div className="relative">
                      <select
                        value={quoteStatus}
                        onChange={(event) => setQuoteStatus(event.target.value as QuoteStatus)}
                        className={`${styles.quoteTabLabel} h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] pl-3.5 pr-12`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
                    </div>
                  </div>
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Quote Title</label>
                    <Input value={quoteTitle} onChange={(event) => setQuoteTitle(event.target.value)} placeholder="Kitchen renovation quote" />
                  </div>
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Project Name</label>
                    <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 pb-4 pt-6">
              <h2 className={styles.quoteSectionTitle}>Line Items</h2>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {showWorksheetSources ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCommercialItemsOpen?.((current) => !current)}
                    className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add from Worksheet Sources
                  </Button>
                ) : null}
                <Button
                  ref={scopeImportTriggerRef}
                  type="button"
                  variant="outline"
                  onClick={onOpenScopeImport}
                  className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Import Scope Items
                </Button>
                {canUseMaterials && onOpenMaterials ? (
                  <Button
                    ref={materialsTriggerRef}
                    type="button"
                    variant="outline"
                    onClick={onOpenMaterials}
                    className={`${styles.quoteButtonLabel} h-10 rounded-full border-[var(--border)] bg-[var(--surface)] px-4`}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Materials
                  </Button>
                ) : null}
              </div>
            </div>

            <section>
                  <div className="space-y-5">
                  {showWorksheetSources && isCommercialItemsOpen ? (
                    <div className="min-h-0 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                        <div className="space-y-1">
                          <p className={styles.quoteCardTitle}>Worksheet Sources</p>
                          <p className={styles.quoteBodyLabel}>Create quote lines from approved worksheet-backed source rows.</p>
                        </div>
                        <Button
                          type="button"
                          onClick={importSelectedCommercialItems}
                          disabled={selectedCommercialItemIds.length === 0}
                          className={`${styles.controlButton} ${styles.producedActionButtonProjectTone} ${styles.quoteButtonLabel} h-9 px-4 disabled:opacity-50`}
                        >
                          Add Selected ({selectedCommercialItemIds.length})
                        </Button>
                      </div>
                      {isLoadingCommercialItems ? (
                        <div className="rounded-[14px] bg-[var(--surface-muted)] px-4 py-5">
                          <p className={styles.quoteBodyLabel}>Loading worksheet sources...</p>
                        </div>
                      ) : availableCommercialItems.length > 0 ? (
                        <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                          {availableCommercialItems.map((item) => (
                            <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]">
                              <input
                                type="checkbox"
                                checked={selectedCommercialItemIds.includes(item.id)}
                                onChange={() => toggleCommercialItem?.(item.id)}
                                className="mt-0.5 h-4 w-4 rounded-[6px] border-[var(--border)]"
                              />
                              <span className="min-w-0">
                                <span className={styles.quoteCardTitle}>{item.description}</span>
                                <span className={`${styles.quoteBodyLabel} mt-0.5 block`}>
                                  {item.quantity ?? 1} {item.unit ?? "Item"} at {toMoney(item.rate ?? 0)}
                                </span>
                                <span className={`${styles.quoteTabLabel} mt-1 block text-[10px] uppercase tracking-[0.08em]`}>
                                  {commercialItemStatusLabel(item.sourceStatus)} · {item.sourceSheetName ?? item.sourceWorksheetName ?? "Worksheet"} · {item.sourceRange}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5">
                          <p className={styles.quoteBodyLabel}>No worksheet sources are available for this quote yet.</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="hidden md:block">
                    <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)]">
                      <div className="overflow-x-auto">
                        <div className={COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE}>
                          <div
                            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}
                            style={{ gridTemplateColumns: COMMERCIAL_LINE_GRID_WITHOUT_SOURCE }}
                          >
                            <span className="px-3 py-2.5 font-semibold">Description</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Item</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Qty.</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Unit</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Price</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Amount</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5" />
                          </div>
                          <div className="divide-y divide-[var(--border)] bg-[var(--card)]">
                            {mainLineItems.map((item) => (
                              <div key={item.id} className="grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: COMMERCIAL_LINE_GRID_WITHOUT_SOURCE }}>
                                <div className={`${DESCRIPTION_CELL_PADDING_CLASS} flex h-full items-center`}>
                                  <div className="w-full py-1">
                                    <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
                                    <CommercialItemLineMeta lineItem={item} sourceHref={getCommercialItemSourceHref?.(item) ?? null} />
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={ROW_FIELD_SHELL_CLASS}>
                                  <select
                                    value={item.section}
                                    onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                                    className={SECTION_FIELD_CLASS}
                                  >
                                    {LINE_ITEM_SECTIONS.map((section) => (
                                      <option key={section} value={section}>
                                        {section}
                                      </option>
                                    ))}
                                  </select>
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={ROW_FIELD_SHELL_CLASS}>
                                    <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className={COMPACT_NUMERIC_FIELD_CLASS} />
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={ROW_FIELD_SHELL_CLASS}>
                                    <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className={COMPACT_FIELD_CLASS} />
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={`${ROW_FIELD_SHELL_CLASS} justify-end`}>
                                  <div className="relative w-full">
                                    <span className={`${interMedium.className} pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[12px] leading-none text-[var(--text-muted)]`}>$</span>
                                    <QuoteRateInput
                                      value={item.rate}
                                      onChange={(value) => updateLineItem(item.id, "rate", value)}
                                      className={`${COMPACT_NUMERIC_FIELD_CLASS} pl-4 pr-1.5`}
                                    />
                                  </div>
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={`${ROW_FIELD_SHELL_CLASS} justify-end`}>
                                    <div className={`${COMPACT_VALUE_FIELD_CLASS} whitespace-nowrap`}>{toMoney(lineItemTotal(item))}</div>
                                  </div>
                                </div>
                                <div className="self-stretch border-l border-[var(--border)] px-0 py-1">
                                  <div className="flex h-full items-center justify-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => removeLineItem(item.id)}
                                      className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)]/80 shadow-none hover:bg-transparent hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-0"
                                      aria-label="Delete line item"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {mainLineItems.length === 0 ? (
                              <div className={`${interMedium.className} px-3 py-5 text-center text-sm text-[var(--text-muted)]`}>No main line items yet.</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 md:hidden">
                    <p className={`${styles.quoteTabLabel} px-1 text-[11px] uppercase tracking-[0.08em]`}>Main line items</p>
                    {mainLineItems.map((item) => (
                      <div key={item.id} className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4">
                        <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
                        <CommercialItemLineMeta lineItem={item} sourceHref={getCommercialItemSourceHref?.(item) ?? null} />
                        <select
                          value={item.section}
                          onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                          className={`${interMedium.className} h-11 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}
                        >
                          {LINE_ITEM_SECTIONS.map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-11 w-full !border-0 !bg-transparent px-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-11 w-full !border-0 !bg-transparent px-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                          <div className="relative">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]`}>$</span>
                            <QuoteRateInput
                              value={item.rate}
                              onChange={(value) => updateLineItem(item.id, "rate", value)}
                              className="h-11 w-full !border-0 !bg-transparent pl-6 pr-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`${interMedium.className} text-sm text-[var(--text-primary)]`}>{toMoney(lineItemTotal(item))}</div>
                          <Button type="button" variant="ghost" onClick={() => removeLineItem(item.id)} className="h-8 w-8 rounded-[10px] p-0 text-[var(--text-muted)]/80 hover:bg-[var(--error-light)] hover:text-[var(--error)]" aria-label="Delete line item">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {mainLineItems.length === 0 ? (
                      <div className={`${interMedium.className} rounded-[6px] border border-[var(--border)] px-3 py-4 text-center text-sm text-[var(--text-muted)]`}>No main line items yet.</div>
                    ) : null}
                  </div>

                  <div className="-mt-4 flex justify-end md:pr-10">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => addLineItem(false)}
                      className={`${styles.quoteButtonLabel} h-8 rounded-none border-0 bg-transparent px-0 text-[var(--text-secondary)] shadow-none hover:bg-transparent hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-0`}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-4 pt-2">
                    <p className={styles.quoteSectionTitle}>Optional Items</p>
                  <div className="hidden md:block">
                    <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)]">
                      <div className="overflow-x-auto">
                        <div className={COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE}>
                          <div
                            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}
                            style={{ gridTemplateColumns: COMMERCIAL_LINE_GRID_WITHOUT_SOURCE }}
                          >
                            <span className="px-3 py-2.5 font-semibold">Description</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Item</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Qty.</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Unit</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 font-semibold">Price</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5 text-right font-semibold">Amount</span>
                            <span className="border-l border-[var(--border)] px-3 py-2.5" />
                          </div>
                          <div className="divide-y divide-[var(--border)] bg-[var(--card)]">
                            {optionalLineItems.map((item) => (
                              <div key={item.id} className="grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: COMMERCIAL_LINE_GRID_WITHOUT_SOURCE }}>
                                <div className={`${DESCRIPTION_CELL_PADDING_CLASS} flex h-full items-center`}>
                                  <div className="w-full py-1">
                                    <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
                                    <CommercialItemLineMeta lineItem={item} sourceHref={getCommercialItemSourceHref?.(item) ?? null} />
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={ROW_FIELD_SHELL_CLASS}>
                                  <select
                                    value={item.section}
                                    onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                                    className={SECTION_FIELD_CLASS}
                                  >
                                    {LINE_ITEM_SECTIONS.map((section) => (
                                      <option key={section} value={section}>
                                        {section}
                                      </option>
                                    ))}
                                  </select>
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={ROW_FIELD_SHELL_CLASS}>
                                    <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className={COMPACT_NUMERIC_FIELD_CLASS} />
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={ROW_FIELD_SHELL_CLASS}>
                                    <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className={COMPACT_FIELD_CLASS} />
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={`${ROW_FIELD_SHELL_CLASS} justify-end`}>
                                  <div className="relative w-full">
                                    <span className={`${interMedium.className} pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[12px] leading-none text-[var(--text-muted)]`}>$</span>
                                    <QuoteRateInput
                                      value={item.rate}
                                      onChange={(value) => updateLineItem(item.id, "rate", value)}
                                      className={`${COMPACT_NUMERIC_FIELD_CLASS} pl-4 pr-1.5`}
                                    />
                                  </div>
                                  </div>
                                </div>
                                <div className={`${ROW_DIVIDER_CLASS} ${ROW_CELL_PADDING_CLASS}`}>
                                  <div className={`${ROW_FIELD_SHELL_CLASS} justify-end`}>
                                    <div className={`${COMPACT_VALUE_FIELD_CLASS} whitespace-nowrap`}>{toMoney(lineItemTotal(item))}</div>
                                  </div>
                                </div>
                                <div className="self-stretch border-l border-[var(--border)] px-0 py-1">
                                  <div className="flex h-full items-center justify-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => removeLineItem(item.id)}
                                      className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)]/80 shadow-none hover:bg-transparent hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-0"
                                      aria-label="Delete optional line item"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {optionalLineItems.length === 0 ? (
                              <div className={`${interMedium.className} px-3 py-3 text-center text-xs text-[var(--text-muted)]`}>No optional items yet.</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="space-y-2 md:hidden">
                    <p className={`${styles.quoteTabLabel} px-1 text-[11px] uppercase tracking-[0.08em]`}>Optional items</p>
                    {optionalLineItems.map((item) => (
                      <div key={item.id} className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4">
                        <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
                        <CommercialItemLineMeta lineItem={item} sourceHref={getCommercialItemSourceHref?.(item) ?? null} />
                        <select
                          value={item.section}
                          onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                          className={`${interMedium.className} h-11 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}
                        >
                          {LINE_ITEM_SECTIONS.map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-11 w-full rounded-[12px] px-3" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-11 w-full rounded-[12px] px-3" />
                          <div className="relative">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]`}>$</span>
                            <QuoteRateInput
                              value={item.rate}
                              onChange={(value) => updateLineItem(item.id, "rate", value)}
                              className="h-11 w-full rounded-[12px] pl-6 pr-3"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`${interMedium.className} text-sm text-[var(--text-primary)]`}>{toMoney(lineItemTotal(item))}</div>
                          <Button type="button" variant="ghost" onClick={() => removeLineItem(item.id)} className="h-8 w-8 rounded-[10px] p-0 text-[var(--text-muted)]/80 hover:bg-[var(--error-light)] hover:text-[var(--error)]" aria-label="Delete optional line item">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {optionalLineItems.length === 0 ? (
                      <div className={`${interMedium.className} rounded-[6px] border border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--text-muted)]`}>No optional items yet.</div>
                    ) : null}
                  </div>

                  <div className="-mt-4 flex justify-end md:pr-10">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => addLineItem(true)}
                      className={`${styles.quoteButtonLabel} h-8 rounded-none border-0 bg-transparent px-0 text-[var(--text-secondary)] shadow-none hover:bg-transparent hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-0`}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Optional
                    </Button>
                  </div>

                  </div>
              </section>

            <div className="mt-6 border-t border-[var(--border)] pt-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
              <div>
                <section>
                  <h3 className={styles.quoteSectionTitle}>Terms & Clarifications</h3>
                  <div className="mt-5 space-y-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Validity period</label>
                        <Input value={validityPeriod} onChange={(event) => setValidityPeriod(event.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Payment terms</label>
                        <Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Lead time</label>
                        <Input value={leadTime} onChange={(event) => setLeadTime(event.target.value)} />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Inclusions</label>
                        <textarea value={termsInclusions} onChange={(event) => setTermsInclusions(event.target.value)} className="min-h-[96px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-primary)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Exclusions</label>
                        <textarea value={termsExclusions} onChange={(event) => setTermsExclusions(event.target.value)} className="min-h-[96px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-primary)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Clarifications</label>
                        <textarea value={clarifications} onChange={(event) => setClarifications(event.target.value)} className="min-h-[96px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-primary)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Assumptions</label>
                        <textarea value={assumptions} onChange={(event) => setAssumptions(event.target.value)} className="min-h-[96px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-primary)]" />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="border-t border-[var(--border)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <div className="space-y-5 bg-[var(--card)]">
                  <h3 className={styles.quoteSectionTitle}>Pricing Summary</h3>

                  <div className="space-y-4 py-2">
                    <p className={styles.quoteCardTitle}>Section totals</p>
                    <div className="space-y-1.5">
                      {LINE_ITEM_SECTIONS.map((section) => (
                        <p key={section} className="flex items-center justify-between">
                          <span className={styles.quoteBodyLabel}>{section}</span>
                          <span className={styles.quoteBodyValue}>{toMoney(sectionSubtotals.get(section) ?? 0)}</span>
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <label className={`${styles.quoteBodyLabel} flex cursor-pointer items-center gap-2`}>
                          <input type="checkbox" checked={includeMarginInExport} onChange={() => setIncludeMarginInExport((c) => !c)} className="h-4 w-4 rounded accent-[var(--navy-primary)]" />
                          {markupLabel} (%)
                        </label>
                        <Input type="number" value={marginPercent === "0" ? "" : marginPercent} onChange={(event) => setMarginPercent(event.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <label className={`${styles.quoteBodyLabel} flex cursor-pointer items-center gap-2`}>
                          <input type="checkbox" checked={includeDiscountInExport} onChange={() => setIncludeDiscountInExport((c) => !c)} className="h-4 w-4 rounded accent-[var(--navy-primary)]" />
                          Discount
                        </label>
                        <Input type="number" value={discountAmount === "0" ? "" : discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <label className={`${styles.quoteBodyLabel} flex cursor-pointer items-center gap-2`}>
                          <input type="checkbox" checked={includeContingencyInExport} onChange={() => setIncludeContingencyInExport((c) => !c)} className="h-4 w-4 rounded accent-[var(--navy-primary)]" />
                          {contingencyLabel}
                        </label>
                        <Input type="number" value={contingencyAmount === "0" ? "" : contingencyAmount} onChange={(event) => setContingencyAmount(event.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <label className={styles.quoteBodyLabel}>GST (%)</label>
                        <Input type="number" value={gstPercent} onChange={(event) => setGstPercent(event.target.value)} />
                      </div>
                    </div>

                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 sm:px-6 sm:py-5">
                      <div className="space-y-3 text-sm">
                        <p className="flex items-center justify-between gap-4">
                          <span className={styles.quoteBodyLabel}>Discount</span>
                          <span className={styles.quoteBodyValue}>-{toMoney(pricingSummary.discount)}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span className={styles.quoteBodyLabel}>{contingencyLabel}</span>
                          <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.contingency)}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span className={styles.quoteBodyLabel}>{markupLabel}</span>
                          <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.margin)}</span>
                        </p>
                        <div className="h-px bg-[var(--border)]" />
                        <p className="flex items-center justify-between gap-4">
                          <span className={styles.quoteBodyLabel}>{subtotalExcludingGstLabel}</span>
                          <span className={styles.quoteBodyValue}>{toMoney(preGstPrimaryTotal)}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span className={styles.quoteBodyLabel}>Total GST {Number(gstPercent.trim() || "15").toFixed(2)}%</span>
                          <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.gst)}</span>
                        </p>
                        <div className="h-px bg-[var(--border)]" />
                        <p className="flex items-center justify-between gap-4 pt-1">
                          <span className="text-[15px] font-semibold text-[var(--text-primary)]">Total (incl. GST)</span>
                          <span className="text-[15px] font-semibold text-[var(--text-primary)]">{toMoney(pricingSummary.grandTotal)}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" onClick={onSave} disabled={!canManageQuote || isSaving} variant="secondary" className="sm:min-w-[150px]">
                      {isSaving ? "Saving..." : "Save Quote"}
                    </Button>
                    <Button type="button" onClick={onExport} disabled={isSaving || isLoadingQuote} className="sm:min-w-[150px]">
                      Export PDF
                    </Button>
                  </div>
                </div>
              </div>

            </div>
            </div>
          </OperationalPanel>
        </div>
      ) : (
        <div className="space-y-5">
          <OperationalPanel contentClassName="p-0">
            <div className="px-6 py-6">
              <h2 className={`${styles.quoteSectionTitle} mb-5 border-b border-[var(--border)] pb-5`}>Quote Details</h2>
              <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                  <span className={styles.quoteBodyLabel}>Client</span>
                  <span className={styles.quoteBodyValue}>{clientName || "—"}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                  <span className={styles.quoteBodyLabel}>Site</span>
                  <span className={styles.quoteBodyValue}>{siteAddress || "—"}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                  <span className={styles.quoteBodyLabel}>Project</span>
                  <span className={styles.quoteBodyValue}>{projectName || "—"}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                  <span className={styles.quoteBodyLabel}>Issued</span>
                  <span className={styles.quoteBodyValue}>{toDayMonthYearLabel(quoteDate)}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                  <span className={styles.quoteBodyLabel}>Quote Number</span>
                  <span className={styles.quoteBodyValue}>{quoteNumber || "—"}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
                  <span className={styles.quoteBodyLabel}>Expiry</span>
                  <span className={styles.quoteBodyValue}>{toDayMonthYearLabel(expiryDate)}</span>
                </div>
              </div>
            </div>

            <div className="px-6 pb-4 pt-5">
              <h2 className={`${styles.quoteSectionTitle} border-b border-[var(--border)] pb-5`}>Line Items</h2>
            </div>
            <div className="px-6 pb-2">
              {lineItems.length === 0 ? (
                <OperationalEmptyState title="No line items added yet." />
              ) : (
                <OperationalTable>
                  <OperationalTableHeader>
                    <OperationalTableRow>
                      <OperationalTableHead>Description</OperationalTableHead>
                      <OperationalTableHead>Section</OperationalTableHead>
                      <OperationalTableHead className="text-right">Qty</OperationalTableHead>
                      <OperationalTableHead>Unit</OperationalTableHead>
                      <OperationalTableHead className="text-right">Rate</OperationalTableHead>
                      <OperationalTableHead className="text-right">Total</OperationalTableHead>
                    </OperationalTableRow>
                  </OperationalTableHeader>
                  <OperationalTableBody>
                    {lineItems.map((item) => (
                      <OperationalTableRow key={item.id}>
                        <OperationalTableCell className="font-semibold text-[var(--text-primary)]">
                          <div>
                            <div>{item.description || "Untitled item"}</div>
                            <CommercialItemLineMeta lineItem={item} sourceHref={getCommercialItemSourceHref?.(item) ?? null} />
                          </div>
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          {item.section}{item.isOptional ? " (Optional)" : ""}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right font-semibold text-[var(--text-primary)]">
                          {item.quantity}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-[var(--text-secondary)]">
                          {item.unit || "—"}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right font-semibold text-[var(--text-primary)]">
                          {toMoney(item.rate)}
                        </OperationalTableCell>
                        <OperationalTableCell className="text-right font-semibold text-[var(--text-primary)]">
                          {toMoney(lineItemTotal(item))}
                        </OperationalTableCell>
                      </OperationalTableRow>
                    ))}
                  </OperationalTableBody>
                </OperationalTable>
              )}
            </div>
            {(termsInclusions || termsExclusions || clarifications || assumptions) ? (
              <div className="px-6 py-6">
                <h2 className={`${styles.quoteSectionTitle} mb-5 border-b border-[var(--border)] pb-5`}>Terms & Clarifications</h2>
                <div className="space-y-4">
                  {termsInclusions ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[var(--border)] pb-4">
                      <p className={styles.quoteBodyLabel}>Inclusions</p>
                      <p className={styles.quoteBodyValue}>{termsInclusions}</p>
                    </div>
                  ) : null}
                  {termsExclusions ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[var(--border)] pb-4">
                      <p className={styles.quoteBodyLabel}>Exclusions</p>
                      <p className={styles.quoteBodyValue}>{termsExclusions}</p>
                    </div>
                  ) : null}
                  {clarifications ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[var(--border)] pb-4">
                      <p className={styles.quoteBodyLabel}>Clarifications</p>
                      <p className={styles.quoteBodyValue}>{clarifications}</p>
                    </div>
                  ) : null}
                  {assumptions ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3">
                      <p className={styles.quoteBodyLabel}>Assumptions</p>
                      <p className={styles.quoteBodyValue}>{assumptions}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="border-t border-[var(--border)] px-6 py-4">
              <div className="ml-auto max-w-[280px] space-y-1">
                <p className={`${styles.quoteBodyLabel} text-right`}>{subtotalExcludingGstLabel}</p>
                <p className="text-right text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--text-primary)]">{toMoney(preGstPrimaryTotal)}</p>
              </div>
            </div>
          </OperationalPanel>
        </div>
      )}

    </div>
  );
}
