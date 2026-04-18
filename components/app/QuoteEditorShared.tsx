"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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

export const LINE_ITEM_SECTIONS: LineItemSection[] = ["Item", "Materials", "Labour", "Plant", "Subcontractors", "Preliminaries"];
const MAIN_LINE_GRID_TEMPLATE = "minmax(170px, 1.3fr) 120px 72px 72px 104px 104px";
const OPTIONAL_LINE_GRID_TEMPLATE = MAIN_LINE_GRID_TEMPLATE;

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
  const hasContent = value.trim().length > 0;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePreviewPosition = useCallback(() => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }
    const rect = inputElement.getBoundingClientRect();
    setPreviewPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.min(560, Math.max(rect.width, 280)),
    });
  }, []);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const handleReposition = () => updatePreviewPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isPreviewOpen, updatePreviewPosition]);

  const openPreview = useCallback(() => {
    if (!hasContent) {
      return;
    }
    updatePreviewPosition();
    setIsPreviewOpen(true);
  }, [hasContent, updatePreviewPosition]);

  const closePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
        onFocus={openPreview}
        onBlur={closePreview}
        placeholder={placeholder}
        title={value.trim() || placeholder || ""}
        className="h-9 min-w-[200px] !border-0 !bg-transparent px-3 !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none"
      />
      {hasContent && isPreviewOpen && previewPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[300] rounded-[12px] border border-[#D7E1EC] bg-[#FBFEFE] p-3.5 shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
              style={{
                top: previewPosition.top,
                left: previewPosition.left,
                width: previewPosition.width,
              }}
            >
              <p className={`${interMedium.className} text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7F8FA7]`}>
                Full Description
              </p>
              <p className={`${interMedium.className} mt-1 text-sm font-medium leading-relaxed text-[#1F2E45]`}>{value}</p>
            </div>,
            document.body,
          )
        : null}
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
  const totalIncludingMarginLabel = STANDARD_QUOTE_PRICING_LABELS.totalIncludingMargin;
  const totalQuotePriceLabel = STANDARD_QUOTE_PRICING_LABELS.totalQuotePrice;
  const currentStatusLabel = STATUS_OPTIONS.find((status) => status.value === quoteStatus)?.label ?? quoteStatus;
  const headerTitle = quoteNumber.trim() || quoteTitle.trim() || heroTitle;
  const statusTagClassName = {
    Draft: "border-[#CBD5E1] bg-[#F8FAFC] text-[#475569]",
    Accepted: "border-[#BBF7D0] bg-[#DCFCE7] text-[#15803D]",
    Sent: "border-[#BFDBFE] bg-[#DBEAFE] text-[#1D4ED8]",
    Rejected: "border-[#FECACA] bg-[#FEE2E2] text-[#DC2626]",
    Expired: "border-[#FECACA] bg-[#FEE2E2] text-[#DC2626]",
  }[quoteStatus];
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
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`} aria-busy={isLoadingQuote}>
      <section className={styles.heroBlock}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={styles.quotePageTitle}>{headerTitle}</h1>
            <span className={`${styles.quoteButtonLabel} inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] ${statusTagClassName ?? "border-[#D7E1EC] bg-[#FBFEFE] text-[#4B5D79]"}`}>
              {currentStatusLabel}
            </span>
          </div>
          {saveMessage ? <p className={`${styles.quoteBodyLabel} text-xs`}>{saveMessage}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (shouldShowEditor) {
                void onSave();
                return;
              }
              onEdit();
            }}
            disabled={shouldShowEditor ? !canManageQuote || isSaving : !canManageQuote}
            className={`${styles.quoteButtonLabel} h-9 rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}
          >
            {shouldShowEditor ? (isSaving ? "Saving..." : "Save Quote") : "Edit Quote"}
          </Button>
          <Button
            type="button"
            onClick={onExport}
            disabled={isSaving}
            className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
          >
            Export PDF
          </Button>
        </div>
      </section>

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
      ) : null}
      {readOnlyMessage ? (
        <p className={`${interMedium.className} rounded-[10px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800`}>
          {readOnlyMessage}
        </p>
      ) : null}

      {isHydratingExistingQuote ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={`${styles.quotePanelCard} px-6 py-6`}>
            <p className={styles.quoteBodyLabel}>Loading saved quote...</p>
          </div>
          <div className={`${styles.quotePanelCard} px-6 py-6`}>
            <p className={styles.quoteBodyLabel}>Loading pricing...</p>
          </div>
        </div>
      ) : shouldShowEditor ? (
        <div className="space-y-6 [&_input]:border-[#D7E1EC] [&_input]:bg-[#FBFEFE] [&_input]:text-[#1D1D1D] [&_input]:outline-none [&_input]:ring-0 [&_input:focus]:outline-none [&_input:focus]:ring-0 [&_input:focus-visible]:outline-none [&_input:focus-visible]:ring-0 [&_select]:border-[#D7E1EC] [&_select]:bg-[#FBFEFE] [&_select]:text-[#1D1D1D] [&_select]:outline-none [&_select]:ring-0 [&_select:focus]:outline-none [&_select:focus]:ring-0 [&_select:focus-visible]:outline-none [&_select:focus-visible]:ring-0 [&_textarea]:border-[#D7E1EC] [&_textarea]:bg-[#FBFEFE] [&_textarea]:text-[#1D1D1D] [&_textarea]:outline-none [&_textarea]:ring-0 [&_textarea:focus]:outline-none [&_textarea:focus]:ring-0 [&_textarea:focus-visible]:outline-none [&_textarea:focus-visible]:ring-0">
          <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
            <div className="border-b border-[#E8EDF5] pb-6">
              <button
                type="button"
                onClick={() => setIsQuoteDetailsOpen((current) => !current)}
                className="flex w-full items-center justify-between pb-4"
              >
                <h2 className={styles.quoteSectionTitle}>Quote Details</h2>
                <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isQuoteDetailsOpen ? "rotate-180" : ""}`} />
              </button>

              {isQuoteDetailsOpen ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Client</label>
                    <div className={`${styles.quoteBodyValue} flex h-11 items-center rounded-[12px] border border-[#D7E1EC] bg-[#FBFEFE] px-3.5 text-sm font-medium`}>
                      {clientName || "No client linked yet"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Quote Date</label>
                    <Input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} className="h-11 rounded-[12px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Expiry Date</label>
                    <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="h-11 rounded-[12px]" />
                  </div>
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Site Address</label>
                    <div className={`${styles.quoteBodyValue} min-h-11 rounded-[12px] border border-[#D7E1EC] bg-[#FBFEFE] px-3.5 py-3 text-sm font-medium leading-relaxed`}>
                      {siteAddress || "No site address yet"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Quote Number</label>
                    <Input value={quoteNumber} readOnly placeholder="Q-26001-1" className="h-11 rounded-[12px] bg-[#FBFEFE]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.quoteBodyLabel}>Status</label>
                    <div className="relative">
                      <select
                        value={quoteStatus}
                        onChange={(event) => setQuoteStatus(event.target.value as QuoteStatus)}
                        className={`${styles.quoteTabLabel} h-11 w-full appearance-none rounded-[12px] border border-[#D7E1EC] bg-[#FBFEFE] pl-3.5 pr-12`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    </div>
                  </div>
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Quote Title</label>
                    <Input value={quoteTitle} onChange={(event) => setQuoteTitle(event.target.value)} placeholder="Kitchen renovation quote" className="h-11 rounded-[12px]" />
                  </div>
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className={styles.quoteBodyLabel}>Project Name</label>
                    <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="h-11 rounded-[12px]" />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-4 pb-4 pt-6">
              <h2 className={styles.quoteSectionTitle}>Line Items</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsScopeImportOpen((current) => !current)}
                className={`${styles.quoteButtonLabel} h-10 rounded-full border-[#D7E1EC] bg-[#FBFEFE] px-4`}
              >
                <Plus className="mr-1 h-4 w-4" />
                Import Scope Items
              </Button>
            </div>

            <section>
                  <div className="space-y-5">
                  {isScopeImportOpen ? (
                    <div className="min-h-0 rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8EDF5] pb-4">
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
                        <div className="rounded-[14px] bg-[#F8FAFC] px-4 py-5">
                          <p className={styles.quoteBodyLabel}>Loading Scope Builder items...</p>
                        </div>
                      ) : availableScopeCostItems.length > 0 ? (
                        <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                          {availableScopeCostItems.map((item) => (
                            <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#E2E8F1] bg-[#FBFEFE] px-4 py-3 transition-colors hover:bg-[#F8FAFC]">
                              <input
                                type="checkbox"
                                checked={selectedScopeCostItemIds.includes(item.id)}
                                onChange={() => toggleScopeCostItem(item.id)}
                                className="mt-0.5 h-4 w-4 rounded-[6px] border-[#cfd8e6]"
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
                        <div className="mt-4 rounded-[14px] border border-dashed border-[#D7E1EC] bg-[#F8FAFC] px-4 py-5">
                          <p className={styles.quoteBodyLabel}>No completed Scope Builder items found for this lead workspace.</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="hidden md:block">
                    <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE]">
                      <div className="overflow-x-auto">
                        <div className="min-w-[764px]">
                          <div
                            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[#D7E1EC] bg-[#F3F4F6] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[#475569]`}
                            style={{ gridTemplateColumns: `${MAIN_LINE_GRID_TEMPLATE} 44px` }}
                          >
                            <span className="px-3 py-2.5 font-semibold">Description</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Item</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Qty.</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Unit</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Price</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Amount</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5" />
                          </div>
                          <div className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
                            {mainLineItems.map((item) => (
                              <div key={item.id} className="grid items-center gap-0 px-0 py-0" style={{ gridTemplateColumns: `${MAIN_LINE_GRID_TEMPLATE} 44px` }}>
                                <div className="px-3 py-1.5">
                                  <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <select
                                    value={item.section}
                                    onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                                    className={`${interMedium.className} h-9 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[#1d2433] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}
                                  >
                                    {LINE_ITEM_SECTIONS.map((section) => (
                                      <option key={section} value={section}>
                                        {section}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-9 w-full !border-0 !bg-transparent px-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-9 w-full !border-0 !bg-transparent px-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <div className="relative w-full">
                                    <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                                    <Input
                                      type="number"
                                      value={item.rate === 0 ? "" : item.rate}
                                      onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                                      className="h-9 w-full !border-0 !bg-transparent pl-6 pr-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none"
                                    />
                                  </div>
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <div className="flex items-center justify-end">
                                    <div className={`${interMedium.className} text-right text-sm text-[#1d2433]`}>{toMoney(lineItemTotal(item))}</div>
                                  </div>
                                </div>
                                <div className="border-l border-[#EEF2F7] px-0 py-1.5">
                                  <div className="flex items-center justify-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => removeLineItem(item.id)}
                                      className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[#9AA8BC]/80 shadow-none hover:bg-transparent hover:text-[#B42318] focus-visible:outline-none focus-visible:ring-0"
                                      aria-label="Delete line item"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {mainLineItems.length === 0 ? (
                              <div className={`${interMedium.className} px-3 py-5 text-center text-sm text-[#73839a]`}>No main line items yet.</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 md:hidden">
                    <p className={`${styles.quoteTabLabel} px-1 text-[11px] uppercase tracking-[0.08em]`}>Main line items</p>
                    {mainLineItems.map((item) => (
                      <div key={item.id} className="space-y-2 rounded-[14px] border border-[#E2E8F1] bg-[#FBFEFE] p-4">
                        <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
                        <select
                          value={item.section}
                          onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                          className={`${interMedium.className} h-11 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[#1d2433] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}
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
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-11 w-full !border-0 !bg-transparent pl-6 pr-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`${interMedium.className} text-sm text-[#1d2433]`}>{toMoney(lineItemTotal(item))}</div>
                          <Button type="button" variant="ghost" onClick={() => removeLineItem(item.id)} className="h-8 w-8 rounded-[10px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]" aria-label="Delete line item">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {mainLineItems.length === 0 ? (
                      <div className={`${interMedium.className} rounded-[6px] border border-[#E5EAF2] px-3 py-4 text-center text-sm text-[#73839a]`}>No main line items yet.</div>
                    ) : null}
                  </div>

                  <div className="-mt-4 flex justify-end md:pr-10">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => addLineItem(false)}
                      className={`${styles.quoteButtonLabel} h-8 rounded-none border-0 bg-transparent px-0 text-[#4B5D79] shadow-none hover:bg-transparent hover:text-[#22324A] focus-visible:outline-none focus-visible:ring-0`}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-4 pt-2">
                    <p className={styles.quoteSectionTitle}>Optional Items</p>
                  <div className="hidden md:block">
                    <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC] bg-[#FBFEFE]">
                      <div className="overflow-x-auto">
                        <div className="min-w-[764px]">
                          <div
                            className={`${styles.quoteTabLabel} grid items-center gap-0 border-b border-[#D7E1EC] bg-[#F3F4F6] px-0 py-0 text-left text-[13px] normal-case tracking-[-0.01em] text-[#475569]`}
                            style={{ gridTemplateColumns: `${OPTIONAL_LINE_GRID_TEMPLATE} 44px` }}
                          >
                            <span className="px-3 py-2.5 font-semibold">Description</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Item</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Qty.</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Unit</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 font-semibold">Price</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5 text-right font-semibold">Amount</span>
                            <span className="border-l border-[#D7E1EC] px-3 py-2.5" />
                          </div>
                          <div className="divide-y divide-[#E8EDF5] bg-[#FBFEFE]">
                            {optionalLineItems.map((item) => (
                              <div key={item.id} className="grid items-center gap-0 px-0 py-0" style={{ gridTemplateColumns: `${OPTIONAL_LINE_GRID_TEMPLATE} 44px` }}>
                                <div className="px-3 py-1.5">
                                  <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <select
                                    value={item.section}
                                    onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                                    className={`${interMedium.className} h-9 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[#1d2433] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}
                                  >
                                    {LINE_ITEM_SECTIONS.map((section) => (
                                      <option key={section} value={section}>
                                        {section}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-9 w-full !border-0 !bg-transparent px-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-9 w-full !border-0 !bg-transparent px-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none" />
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <div className="relative w-full">
                                    <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                                    <Input
                                      type="number"
                                      value={item.rate === 0 ? "" : item.rate}
                                      onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                                      className="h-9 w-full !border-0 !bg-transparent pl-6 pr-3 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none"
                                    />
                                  </div>
                                </div>
                                <div className="border-l border-[#EEF2F7] px-3 py-1.5">
                                  <div className="flex items-center justify-end">
                                    <div className={`${interMedium.className} text-right text-sm text-[#1d2433]`}>{toMoney(lineItemTotal(item))}</div>
                                  </div>
                                </div>
                                <div className="border-l border-[#EEF2F7] px-0 py-1.5">
                                  <div className="flex items-center justify-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => removeLineItem(item.id)}
                                      className="h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[#9AA8BC]/80 shadow-none hover:bg-transparent hover:text-[#B42318] focus-visible:outline-none focus-visible:ring-0"
                                      aria-label="Delete optional line item"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {optionalLineItems.length === 0 ? (
                              <div className={`${interMedium.className} px-3 py-3 text-center text-xs text-[#7e8ca2]`}>No optional items yet.</div>
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
                      <div key={item.id} className="space-y-2 rounded-[14px] border border-[#E2E8F1] bg-[#FBFEFE] p-4">
                        <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
                        <select
                          value={item.section}
                          onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                          className={`${interMedium.className} h-11 w-full !border-0 !bg-transparent pl-0 pr-6 text-left text-sm text-[#1d2433] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none`}
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
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-11 w-full rounded-[12px] pl-6 pr-3"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`${interMedium.className} text-sm text-[#1d2433]`}>{toMoney(lineItemTotal(item))}</div>
                          <Button type="button" variant="ghost" onClick={() => removeLineItem(item.id)} className="h-8 w-8 rounded-[10px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]" aria-label="Delete optional line item">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {optionalLineItems.length === 0 ? (
                      <div className={`${interMedium.className} rounded-[6px] border border-[#E5EAF2] px-3 py-4 text-center text-xs text-[#7e8ca2]`}>No optional items yet.</div>
                    ) : null}
                  </div>

                  <div className="-mt-4 flex justify-end md:pr-10">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => addLineItem(true)}
                      className={`${styles.quoteButtonLabel} h-8 rounded-none border-0 bg-transparent px-0 text-[#4B5D79] shadow-none hover:bg-transparent hover:text-[#22324A] focus-visible:outline-none focus-visible:ring-0`}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Optional
                    </Button>
                  </div>

                  </div>
              </section>

            <div className="mt-6 border-t border-[#E8EDF5] pt-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
              <div>
                <section>
                  <h3 className={styles.quoteSectionTitle}>Terms & Clarifications</h3>
                  <div className="mt-5 space-y-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Validity period</label>
                        <Input value={validityPeriod} onChange={(event) => setValidityPeriod(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Payment terms</label>
                        <Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Lead time</label>
                        <Input value={leadTime} onChange={(event) => setLeadTime(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Inclusions</label>
                        <textarea value={termsInclusions} onChange={(event) => setTermsInclusions(event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[12px] border border-[#D7E1EC] px-3.5 py-3 text-sm`} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Exclusions</label>
                        <textarea value={termsExclusions} onChange={(event) => setTermsExclusions(event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[12px] border border-[#D7E1EC] px-3.5 py-3 text-sm`} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Clarifications</label>
                        <textarea value={clarifications} onChange={(event) => setClarifications(event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[12px] border border-[#D7E1EC] px-3.5 py-3 text-sm`} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Assumptions</label>
                        <textarea value={assumptions} onChange={(event) => setAssumptions(event.target.value)} className={`${interMedium.className} min-h-[96px] w-full rounded-[12px] border border-[#D7E1EC] px-3.5 py-3 text-sm`} />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="border-t border-[#E8EDF5] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <div className="space-y-5 bg-[#FBFEFE]">
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
                          <input type="checkbox" checked={includeMarginInExport} onChange={() => setIncludeMarginInExport((c) => !c)} className="h-4 w-4 rounded accent-[#0B2739]" />
                          {markupLabel} (%)
                        </label>
                        <Input type="number" value={marginPercent === "0" ? "" : marginPercent} onChange={(event) => setMarginPercent(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                      <div className="grid gap-2">
                        <label className={`${styles.quoteBodyLabel} flex cursor-pointer items-center gap-2`}>
                          <input type="checkbox" checked={includeDiscountInExport} onChange={() => setIncludeDiscountInExport((c) => !c)} className="h-4 w-4 rounded accent-[#0B2739]" />
                          Discount
                        </label>
                        <Input type="number" value={discountAmount === "0" ? "" : discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                      <div className="grid gap-2">
                        <label className={`${styles.quoteBodyLabel} flex cursor-pointer items-center gap-2`}>
                          <input type="checkbox" checked={includeContingencyInExport} onChange={() => setIncludeContingencyInExport((c) => !c)} className="h-4 w-4 rounded accent-[#0B2739]" />
                          {contingencyLabel}
                        </label>
                        <Input type="number" value={contingencyAmount === "0" ? "" : contingencyAmount} onChange={(event) => setContingencyAmount(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                      <div className="grid gap-2">
                        <label className={styles.quoteBodyLabel}>GST (%)</label>
                        <Input type="number" value={gstPercent} onChange={(event) => setGstPercent(event.target.value)} className="h-11 rounded-[12px]" />
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-[#E8EDF5] bg-[#F9FAFC] px-4 py-4">
                      <div className="space-y-2 text-sm">
                        <p className="flex items-center justify-between">
                          <span className={styles.quoteBodyLabel}>Subtotal</span>
                          <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.baseSubtotal)}</span>
                        </p>
                        {includeMarginInExport ? (
                          <p className="flex items-center justify-between">
                            <span className={styles.quoteBodyLabel}>{markupLabel}</span>
                            <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.margin)}</span>
                          </p>
                        ) : null}
                        {includeContingencyInExport && pricingSummary.contingency > 0 ? (
                          <p className="flex items-center justify-between">
                            <span className={styles.quoteBodyLabel}>{contingencyLabel}</span>
                            <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.contingency)}</span>
                          </p>
                        ) : null}
                        {includeDiscountInExport && pricingSummary.discount > 0 ? (
                          <p className="flex items-center justify-between">
                            <span className={styles.quoteBodyLabel}>Discount</span>
                            <span className={styles.quoteBodyValue}>-{toMoney(pricingSummary.discount)}</span>
                          </p>
                        ) : null}
                        <p className="flex items-center justify-between">
                          <span className={styles.quoteBodyLabel}>Total GST {Number(gstPercent.trim() || "15").toFixed(2)}%</span>
                          <span className={styles.quoteBodyValue}>{toMoney(pricingSummary.gst)}</span>
                        </p>
                        <div className="my-5 h-px bg-[#D7E1EC]" />
                        <p className="flex items-center justify-between">
                          <span className="text-[15px] font-medium text-[#1d2433]">Total</span>
                          <span className="text-[18px] font-semibold text-[#0F172A]">{toMoney(pricingSummary.grandTotal)}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" onClick={onSave} disabled={!canManageQuote || isSaving} variant="outline" className={`${styles.quoteButtonLabel} h-10 rounded-full border-[#d3dbe8] bg-[#F8F9FC] sm:min-w-[150px]`}>
                      {isSaving ? "Saving..." : "Save Quote"}
                    </Button>
                    <Button type="button" onClick={onExport} disabled={isSaving} className={`${styles.quoteButtonLabel} h-10 rounded-full bg-[#0B2739] px-6 !text-white hover:bg-[#0B2739] sm:min-w-[150px]`}>
                      Export PDF
                    </Button>
                  </div>
                </div>
              </div>

            </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section className={`${styles.quotePanelCard} overflow-hidden`}>
            <div className="px-6 py-6">
              <h2 className={`${styles.quoteSectionTitle} mb-5 border-b border-[#E8EDF5] pb-5`}>Quote Details</h2>
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
              <h2 className={`${styles.quoteSectionTitle} border-b border-[#E8EDF5] pb-5`}>Line Items</h2>
            </div>
            <div className="px-6 pb-2">
              <div className="overflow-hidden rounded-[18px] border border-[#D7E1EC]">
                <div className="overflow-x-auto">
                  <table className={`${ibmPlexSans.className} min-w-full border-collapse text-left text-sm`}>
                    <thead>
                      <tr className="bg-[#F3F4F6]">
                        <th className={`${styles.quoteTabLabel} px-5 py-2.5 font-semibold`}>Description</th>
                        <th className={`${styles.quoteTabLabel} px-5 py-2.5 font-semibold`}>Section</th>
                        <th className={`${styles.quoteTabLabel} px-5 py-2.5 text-right font-semibold`}>Qty</th>
                        <th className={`${styles.quoteTabLabel} px-5 py-2.5 font-semibold`}>Unit</th>
                        <th className={`${styles.quoteTabLabel} px-5 py-2.5 text-right font-semibold`}>Rate</th>
                        <th className={`${styles.quoteTabLabel} px-5 py-2.5 text-right font-semibold`}>Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EDF5]">
                      {lineItems.map((item) => (
                        <tr key={item.id}>
                          <td className={`${styles.quoteBodyValue} px-5 py-3.5`}>{item.description || "Untitled item"}</td>
                          <td className={`${styles.quoteBodyLabel} px-5 py-3.5`}>{item.section}{item.isOptional ? " (Optional)" : ""}</td>
                          <td className={`${styles.quoteBodyValue} px-5 py-3.5 text-right`}>{item.quantity}</td>
                          <td className={`${styles.quoteBodyLabel} px-5 py-3.5`}>{item.unit || "—"}</td>
                          <td className={`${styles.quoteBodyValue} px-5 py-3.5 text-right`}>{toMoney(item.rate)}</td>
                          <td className={`${styles.quoteBodyValue} px-5 py-3.5 text-right`}>{toMoney(lineItemTotal(item))}</td>
                        </tr>
                      ))}
                      {lineItems.length === 0 ? (
                        <tr>
                          <td className={`${styles.quoteBodyLabel} px-5 py-5 text-center`} colSpan={6}>No line items added yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {(termsInclusions || termsExclusions || clarifications || assumptions) ? (
              <div className="px-6 py-6">
                <h2 className={`${styles.quoteSectionTitle} mb-5 border-b border-[#E8EDF5] pb-5`}>Terms & Clarifications</h2>
                <div className="space-y-4">
                  {termsInclusions ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#E8EDF5] pb-4">
                      <p className={styles.quoteBodyLabel}>Inclusions</p>
                      <p className={styles.quoteBodyValue}>{termsInclusions}</p>
                    </div>
                  ) : null}
                  {termsExclusions ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#E8EDF5] pb-4">
                      <p className={styles.quoteBodyLabel}>Exclusions</p>
                      <p className={styles.quoteBodyValue}>{termsExclusions}</p>
                    </div>
                  ) : null}
                  {clarifications ? (
                    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#E8EDF5] pb-4">
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
            <div className="border-t border-[#E8EDF5] px-6 py-4">
              <div className="ml-auto max-w-[280px] space-y-1">
                <p className={`${styles.quoteBodyLabel} text-right`}>Quote Summary</p>
                <p className="text-right text-[22px] font-bold leading-none tracking-[-0.03em] text-[#0B2739]">{toMoney(pricingSummary.grandTotal)}</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {!shouldShowEditor && !isLoadingQuote && !isHydratingExistingQuote ? (
        <div className="sticky bottom-0 z-10 mt-4 border-t border-[#E2E8F1] bg-[#FBFEFE]/95 px-6 py-4 backdrop-blur-sm">
          <div className="ml-auto flex items-end justify-end gap-8">
            <div className="space-y-1 text-right">
              <p className={styles.quoteBodyLabel}>GST ({gstPercent || "15"}%)</p>
              <p className="text-[18px] font-semibold leading-none tracking-[-0.02em] text-[#0B2739]">{toMoney(pricingSummary.gst)}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className={styles.quoteBodyLabel}>Quote Summary</p>
              <p className="text-[22px] font-bold leading-none tracking-[-0.03em] text-[#0B2739]">{toMoney(pricingSummary.grandTotal)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
