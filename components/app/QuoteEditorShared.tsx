"use client";
import { useEffect, useRef } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import type { QuoteLineItemSection, QuoteStatus } from "@/lib/supabase/types";
import styles from "@/components/app/trade-pack-builder.module.css";

export type LineItemSection = QuoteLineItemSection;

export interface LineItem {
  id: string;
  section: LineItemSection;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  isOptional: boolean;
  sourceOpportunityQuoteId?: string | null;
  sourceOpportunityQuoteLineItemId?: string | null;
  sourceOpportunityQuoteNumber?: string | null;
}

export interface ScopeCostCategoryItem {
  id: string;
  title: string;
  description: string;
  tradeLabel: string;
  generatedAt: string;
}

export interface PricingSummary {
  baseSubtotal: number;
  optionalSubtotal: number;
  margin: number;
  contingency: number;
  discount: number;
  gst: number;
  grandTotal: number;
}

export const STANDARD_QUOTE_PRICING_LABELS = {
  markup: "Mark up",
  contingency: "P&G",
  subtotalExcludingGst: "Subtotal (excl. GST)",
  totalIncludingMargin: "Total (incl. margin)",
  totalQuotePrice: "Total Quote Price (incl. GST)",
} as const;

export const STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = [
  { value: "Draft", label: "Draft" },
  { value: "Sent", label: "Sent" },
  { value: "Accepted", label: "Accepted" },
  { value: "Rejected", label: "Lost" },
  { value: "Expired", label: "Expired" },
];

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

export const LINE_ITEM_SECTIONS: LineItemSection[] = ["Item", "Materials", "Labour", "Plant", "Subcontractors", "Preliminaries"];
const MAIN_LINE_GRID_TEMPLATE = "minmax(156px, 1.25fr) 112px 76px 72px 124px 140px";
const OPTIONAL_LINE_GRID_TEMPLATE = MAIN_LINE_GRID_TEMPLATE;
const ROW_CELL_PADDING_CLASS = "px-2 py-1";
const DESCRIPTION_CELL_PADDING_CLASS = "px-3 py-1";
const ROW_DIVIDER_CLASS = "self-stretch border-l border-[var(--border)]";
const ROW_FIELD_SHELL_CLASS = "flex h-full w-full items-center";
const DESCRIPTION_FIELD_SHELL_CLASS = "flex min-h-[34px] w-full items-center";
const COMPACT_FIELD_CLASS = "h-[34px] w-full appearance-none !border-0 !bg-transparent px-1.5 text-[13px] leading-[1.1] text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none";
const COMPACT_NUMERIC_FIELD_CLASS = `${COMPACT_FIELD_CLASS} text-right tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
const COMPACT_VALUE_FIELD_CLASS = `${interMedium.className} flex h-[34px] w-full items-center justify-end px-1.5 text-right text-[13px] leading-[1.1] text-[var(--text-primary)] tabular-nums`;
const SECTION_FIELD_CLASS = `${interMedium.className} h-[34px] w-full !border-0 !bg-transparent pl-0 pr-5 text-left text-sm leading-[1.15] text-[var(--text-primary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`;

export function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function lineItemTotal(item: LineItem) {
  return item.quantity * item.rate;
}

export function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function toDayMonthYearLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function makeDefaultLineItem(isOptional = false): LineItem {
  return {
    id: crypto.randomUUID(),
    section: "Labour",
    description: "",
    quantity: 1,
    unit: isOptional ? "Item" : "hr",
    rate: 0,
    isOptional,
  };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

interface BuildQuotePdfHtmlParams {
  lineItems: LineItem[];
  pricingSummary: PricingSummary;
  showMarginBreakout: boolean;
  includeDiscountInExport: boolean;
  includeContingencyInExport: boolean;
  quoteDate: string;
  quoteNumber: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationBrandPrimaryColor?: string | null;
  projectName: string;
  companyName: string;
  clientName: string;
  siteAddress: string;
  contactPerson?: string;
  email: string;
  phone: string;
  expiryDate: string;
  gstPercent: string;
  termsInclusions: string;
  termsExclusions: string;
  clarifications: string;
  assumptions: string;
}

export function buildQuotePdfHtml(params: BuildQuotePdfHtmlParams) {
  const exportMarginMultiplier = !params.showMarginBreakout && params.pricingSummary.baseSubtotal > 0
    ? (params.pricingSummary.baseSubtotal + params.pricingSummary.margin) / params.pricingSummary.baseSubtotal
    : 1;

  const lineItemsRows = params.lineItems.length > 0
    ? params.lineItems
        .map((item) => {
          const description = item.description.trim() || "Untitled line item";
          const exportedRate = item.rate * exportMarginMultiplier;
          const exportedLineTotal = lineItemTotal(item) * exportMarginMultiplier;
          const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
          return `
            <tr>
              <td class="desc-cell">
                <div class="cell-primary">${escapeHtml(description)}</div>
                <div class="cell-secondary">${escapeHtml(item.section)}</div>
              </td>
              <td class="right money col-rate">${toMoney(exportedRate)}</td>
              <td class="right col-qty">${qty}</td>
              <td class="col-unit">${escapeHtml(item.unit || "-")}</td>
              <td class="right money col-total">${toMoney(exportedLineTotal)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No line items added.</td></tr>`;

  const issuedDate = toDayMonthYearLabel(params.quoteDate || new Date().toISOString().slice(0, 10));
  const printableNumber = params.quoteNumber.trim() || "Unassigned";
  const printableOrgName = params.organizationName.trim() || "Tradesstack";
  const printableProjectName = params.projectName.trim() || "Project";
  const issuedToLines = [
    params.companyName.trim() || params.clientName.trim() || printableOrgName,
    params.siteAddress.trim() || printableProjectName,
    params.contactPerson?.trim() ? `Contact: ${params.contactPerson.trim()}` : "",
  ]
    .filter((line) => line.trim().length > 0)
    .map((line) => escapeHtml(line))
    .join("\n");
  const footerCompanyName = params.companyName.trim() || printableOrgName;
  const footerEmail = params.email.trim() || "-";
  const footerContactNumber = params.phone.trim() || "-";
  const exportDocumentTitle = `${printableOrgName} - ${printableProjectName} - ${printableNumber}`;
  const sanitizedBrandPrimaryColor = (params.organizationBrandPrimaryColor ?? "").trim();
  const pdfPrimaryColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(sanitizedBrandPrimaryColor)
    ? sanitizedBrandPrimaryColor
    : "#0B2739";
  const logoMarkup = params.organizationLogoUrl
    ? `<img src="${escapeHtml(params.organizationLogoUrl)}" alt="${escapeHtml(printableOrgName)} logo" class="logo-img" />`
    : `<div class="logo-fallback">${escapeHtml(printableOrgName.slice(0, 2).toUpperCase())}</div>`;
  const markUpRowForExport = params.showMarginBreakout ? `<div class="row"><span class="k">Mark up</span><span class="v">${toMoney(params.pricingSummary.margin)}</span></div>` : "";
  const discountRowForExport = params.includeDiscountInExport && params.pricingSummary.discount > 0
    ? `<div class="row"><span class="k">Discount</span><span class="v">-${toMoney(params.pricingSummary.discount)}</span></div>`
    : "";
  const contingencyRowForExport = params.includeContingencyInExport && params.pricingSummary.contingency > 0
    ? `<div class="row"><span class="k">P&G</span><span class="v">${toMoney(params.pricingSummary.contingency)}</span></div>`
    : "";
  const subtotalExcludingGstForExport = params.pricingSummary.baseSubtotal + params.pricingSummary.margin;
  const scopeBlocksMarkup = [
    { title: "Inclusions", value: params.termsInclusions.trim() || "-" },
    { title: "Exclusions", value: params.termsExclusions.trim() || "-" },
    { title: "Clarifications", value: params.clarifications.trim() || "-" },
    { title: "Assumptions", value: params.assumptions.trim() || "-" },
  ]
    .map((block) => `
      <section class="scope-item">
        <p class="scope-item-title">${escapeHtml(block.title)}</p>
        <p class="scope-item-value">${escapeHtml(block.value).replaceAll("\n", "<br />")}</p>
      </section>
    `)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportDocumentTitle)}</title>
    <style>
      :root {
        --orange: ${pdfPrimaryColor};
        --text: #2d3137;
        --muted: #697587;
        --line: #cfd6e0;
      }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #eceff3; color: var(--text); }
      body { font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; }
      .sheet {
        width: 794px;
        min-height: 1123px;
        margin: 34px auto;
        background: #fff;
        padding: 44px 44px 32px;
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08), 0 10px 26px rgba(15, 23, 42, 0.12);
        display: flex;
        flex-direction: column;
      }
      .accent { height: 4px; background: var(--orange); margin-bottom: 16px; }
      .top {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        column-gap: 20px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 10px;
      }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo-wrap { width: 180px; height: 72px; display: flex; align-items: center; justify-content: flex-start; overflow: hidden; }
      .logo-img { width: 100%; height: 100%; object-fit: contain; }
      .logo-fallback {
        width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--line); color: var(--orange); font-size: 13px; font-weight: 700;
      }
      .title {
        margin: 0;
        color: var(--orange);
        font-size: 22px;
        line-height: 1.1;
        letter-spacing: -0.01em;
        font-weight: 700;
        text-align: right;
        justify-self: end;
      }
      .issued-row {
        margin-top: 16px;
        display: grid;
        grid-template-columns: 1fr 310px;
        column-gap: 20px;
      }
      .issued-title {
        margin: 0 0 4px;
        color: #1f2937;
        font-size: 12px;
        line-height: 1;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .issued-text {
        margin: 0;
        color: #4b5563;
        white-space: pre-line;
        font-size: 13px;
        line-height: 1.3;
      }
      .issued-meta .row {
        display: grid;
        grid-template-columns: 185px auto;
        gap: 10px;
        margin-bottom: 1px;
      }
      .issued-meta .k {
        color: #1f2937;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
        text-align: right;
        font-size: 10px;
      }
      .issued-meta .v {
        color: #4b5563;
        text-align: right;
        font-size: 12px;
      }
      .project-lead { margin: 14px 0 10px; }
      .project-lead .project-line {
        margin: 0 0 2px;
        color: #1f2937;
        font-size: 18px;
        line-height: 1.15;
        font-weight: 700;
      }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid var(--line); }
      thead th {
        background: var(--orange);
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        font-weight: 700;
        text-align: left;
        padding: 5px 8px;
      }
      tbody td {
        border-top: 1px solid var(--line);
        padding: 6px 8px;
        color: #303846;
        font-size: 10px;
        vertical-align: top;
      }
      .desc-cell { line-height: 1.25; }
      .cell-primary { font-weight: 400; color: #1f2937; }
      .cell-secondary { margin-top: 1px; font-size: 9px; color: #6b7280; }
      .right { text-align: right; }
      .money { white-space: nowrap; font-variant-numeric: tabular-nums; }
      .quote-summary-wrap { margin-top: 12px; margin-left: auto; width: 360px; }
      .terms-wrap { width: 100%; margin-top: 280px; align-self: stretch; }
      .terms-wrap .terms-bar {
        display: block; width: 100%; background: var(--orange); color: #fff; font-size: 12px; letter-spacing: 0.08em;
        text-transform: uppercase; font-weight: 700; padding: 8px 16px;
      }
      .scope-grid {
        display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 28px; margin-top: 10px; padding: 0 16px;
      }
      .scope-item-title { margin: 0 0 4px; color: #1f2937; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
      .scope-item-value { margin: 0; color: #374151; font-size: 11px; white-space: pre-wrap; }
      .totals-inline .row {
        display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 11px;
      }
      .totals-inline .k { color: #5d7292; }
      .totals-inline .v { color: #27344a; font-weight: 600; }
      .totals-inline .row.total-row { background: var(--orange); border-top: 0; border-bottom: 0; padding: 7px 8px; }
      .totals-inline .row.total-row .k,
      .totals-inline .row.total-row .v { color: #fff; font-size: 12px; line-height: 1.1; font-weight: 800; }
      .company-footer {
        margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
      }
      .company-footer .item { margin: 0; font-size: 11px; color: #374151; }
      .company-footer .item .k { color: #1f2937; font-weight: 700; }
      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        html, body { background: #fff; }
        .sheet { margin: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="accent"></div>
      <header class="top">
        <div class="brand">
          <div class="logo-wrap">${logoMarkup}</div>
        </div>
        <p class="title">Quote</p>
      </header>
      <section class="issued-row">
        <div>
          <p class="issued-title">Issued To:</p>
          <p class="issued-text">${issuedToLines}</p>
        </div>
        <div class="issued-meta">
          <div class="row"><span class="k">Quote No:</span><span class="v">${escapeHtml(printableNumber)}</span></div>
          <div class="row"><span class="k">Date:</span><span class="v">${escapeHtml(issuedDate)}</span></div>
          <div class="row"><span class="k">Expiry:</span><span class="v">${escapeHtml(toDayMonthYearLabel(params.expiryDate))}</span></div>
        </div>
      </section>
      <section class="project-lead">
        <p class="project-line">Project: ${escapeHtml(printableProjectName)}</p>
      </section>
      <table>
        <thead>
          <tr>
            <th style="width:42%">Description</th>
            <th class="right" style="width:18%">Rate</th>
            <th class="right" style="width:10%">Qty</th>
            <th style="width:10%">Unit</th>
            <th class="right" style="width:20%">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>
      <section class="quote-summary-wrap">
        <section class="totals-inline">
          ${markUpRowForExport}
          ${discountRowForExport}
          ${contingencyRowForExport}
          <div class="row"><span class="k">Subtotal (excl. GST)</span><span class="v">${toMoney(subtotalExcludingGstForExport)}</span></div>
          <div class="row"><span class="k">GST (${escapeHtml(params.gstPercent.trim() || "15")}%)</span><span class="v">${toMoney(params.pricingSummary.gst)}</span></div>
          <div class="row total-row"><span class="k">Total (incl. GST)</span><span class="v">${toMoney(params.pricingSummary.grandTotal)}</span></div>
        </section>
      </section>
      <section class="terms-wrap">
        <div class="terms-bar">Terms and Conditions</div>
        <section class="scope-grid">
          ${scopeBlocksMarkup}
        </section>
      </section>
      <section class="company-footer">
        <p class="item"><span class="k">Company Name:</span> ${escapeHtml(footerCompanyName)}</p>
        <p class="item"><span class="k">Email:</span> ${escapeHtml(footerEmail)}</p>
        <p class="item"><span class="k">Contact Number:</span> ${escapeHtml(footerContactNumber)}</p>
      </section>
    </main>
  </body>
</html>`;
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

interface QuoteEditorLayoutProps {
  heroTitle: string;
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
  isScopeImportOpen: boolean;
  setIsScopeImportOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isLoadingScopeItems: boolean;
  availableScopeCostItems: ScopeCostCategoryItem[];
  selectedScopeCostItemIds: string[];
  toggleScopeCostItem: (itemId: string) => void;
  importSelectedScopeItems: () => void;
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
}

export function QuoteEditorLayout({
  heroTitle,
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
  isScopeImportOpen,
  setIsScopeImportOpen,
  isLoadingScopeItems,
  availableScopeCostItems,
  selectedScopeCostItemIds,
  toggleScopeCostItem,
  importSelectedScopeItems,
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
      <OperationalModuleHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{headerTitle}</span>
            <StatusBadge status={quoteStatusBadge(quoteStatus)}>{currentStatusLabel}</StatusBadge>
          </span>
        }
        description={saveMessage ?? undefined}
        actions={
          <>
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
            <Button type="button" onClick={onExport} disabled={isSaving}>
              Export PDF
            </Button>
          </>
        }
      />

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

      {isHydratingExistingQuote ? (
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
                      {clientName || "No client linked yet"}
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
            <div className="flex items-center justify-between gap-4 pb-4 pt-6">
              <h2 className={styles.quoteSectionTitle}>Line Items</h2>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsScopeImportOpen((current) => !current)}
              >
                <Plus className="h-4 w-4" />
                Import Scope Items
              </Button>
            </div>

            <section>
                  <div className="space-y-5">
                  {isScopeImportOpen ? (
                    <div className="min-h-0 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                        <div className="space-y-1">
                          <p className={styles.quoteCardTitle}>Cost Breakdown Categories</p>
                          <p className={styles.quoteBodyLabel}>Import completed Scope Builder items into your line items.</p>
                        </div>
                        <Button
                          type="button"
                          onClick={importSelectedScopeItems}
                          disabled={selectedScopeCostItemIds.length === 0}
                          className={`${styles.controlButton} ${styles.producedActionButtonProjectTone} ${styles.quoteButtonLabel} h-9 px-4 disabled:opacity-50`}
                        >
                          Add Selected ({selectedScopeCostItemIds.length})
                        </Button>
                      </div>
                      {isLoadingScopeItems ? (
                        <div className="rounded-[14px] bg-[var(--surface-muted)] px-4 py-5">
                          <p className={styles.quoteBodyLabel}>Loading Scope Builder items...</p>
                        </div>
                      ) : availableScopeCostItems.length > 0 ? (
                        <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                          {availableScopeCostItems.map((item) => (
                            <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]">
                              <input
                                type="checkbox"
                                checked={selectedScopeCostItemIds.includes(item.id)}
                                onChange={() => toggleScopeCostItem(item.id)}
                                className="mt-0.5 h-4 w-4 rounded-[6px] border-[var(--border)]"
                              />
                              <span className="min-w-0">
                                <span className={styles.quoteCardTitle}>{item.title}</span>
                                {item.description ? (
                                  <span className={`${styles.quoteBodyLabel} mt-0.5 block`}>{item.description}</span>
                                ) : null}
                                <span className={`${styles.quoteTabLabel} mt-1 block text-[10px] uppercase tracking-[0.08em]`}>
                                  {item.tradeLabel} · {toDayMonthYearLabel(item.generatedAt)}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5">
                          <p className={styles.quoteBodyLabel}>No completed Scope Builder items found for this lead workspace.</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="hidden md:block">
                    <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)]">
                      <div className="overflow-x-auto">
                        <div className="min-w-[820px]">
                          <div
                            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}
                            style={{ gridTemplateColumns: `${MAIN_LINE_GRID_TEMPLATE} 44px` }}
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
                              <div key={item.id} className="grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: `${MAIN_LINE_GRID_TEMPLATE} 44px` }}>
                                <div className={`${DESCRIPTION_CELL_PADDING_CLASS} flex h-full items-center`}>
                                  <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
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
                                    <Input
                                      type="number"
                                      value={item.rate === 0 ? "" : item.rate}
                                      onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
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
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
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
                        <div className="min-w-[820px]">
                          <div
                            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[var(--text-secondary)]`}
                            style={{ gridTemplateColumns: `${OPTIONAL_LINE_GRID_TEMPLATE} 44px` }}
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
                              <div key={item.id} className="grid items-stretch gap-0 px-0 py-0" style={{ gridTemplateColumns: `${OPTIONAL_LINE_GRID_TEMPLATE} 44px` }}>
                                <div className={`${DESCRIPTION_CELL_PADDING_CLASS} flex h-full items-center`}>
                                  <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
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
                                    <Input
                                      type="number"
                                      value={item.rate === 0 ? "" : item.rate}
                                      onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
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
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
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
                    <Button type="button" onClick={onExport} disabled={isSaving} className="sm:min-w-[150px]">
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
                          {item.description || "Untitled item"}
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
