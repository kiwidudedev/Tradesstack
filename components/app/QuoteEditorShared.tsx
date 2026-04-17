"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  { value: "Sent", label: "Sent" },
  { value: "Accepted", label: "Accepted" },
  { value: "Rejected", label: "Lost" },
  { value: "Expired", label: "Expired" },
];

export const LINE_ITEM_SECTIONS: LineItemSection[] = ["Item", "Materials", "Labour", "Plant", "Subcontractors", "Preliminaries"];
const MAIN_LINE_GRID_TEMPLATE = "minmax(220px, 1.6fr) 130px 78px 78px 110px 110px";
const OPTIONAL_LINE_GRID_TEMPLATE = "minmax(260px, 1fr) 90px 90px 120px 130px";

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
        className="h-10 min-w-[200px] rounded-[6px]"
      />
      {hasContent && isPreviewOpen && previewPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[300] rounded-[6px] border border-[#E6ECF5] bg-[#F8F9FC] p-3 shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
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
  backHref: string;
  backLabel: string;
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
  backHref,
  backLabel,
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
  const showMarginBreakout = includeMarginInExport === true;
  const markupLabel = STANDARD_QUOTE_PRICING_LABELS.markup;
  const contingencyLabel = STANDARD_QUOTE_PRICING_LABELS.contingency;
  const subtotalExcludingGstLabel = STANDARD_QUOTE_PRICING_LABELS.subtotalExcludingGst;
  const totalIncludingMarginLabel = STANDARD_QUOTE_PRICING_LABELS.totalIncludingMargin;
  const totalQuotePriceLabel = STANDARD_QUOTE_PRICING_LABELS.totalQuotePrice;

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`} aria-busy={isLoadingQuote}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.quotePageTitle}>{heroTitle}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={`${styles.controlButton} ${styles.producedActionButtonProjectTone} ${styles.quoteButtonLabel} h-8 px-3`}
              >
                Actions
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={8}
              className={`${styles.menuPanel} !z-[200] min-w-[220px] !bg-[#F3F4F6] p-1.5 opacity-100 backdrop-blur-none`}
            >
              <DropdownMenuItem asChild className={`${styles.quoteButtonLabel} h-9 cursor-pointer rounded-[8px] px-2.5 focus:bg-[#F3F4F6]`}>
                <Link href={backHref}>{backLabel}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
              {shouldShowEditor ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void onSave();
                  }}
                  disabled={!canManageQuote || isSaving}
                  className={`${styles.quoteButtonLabel} h-9 cursor-pointer rounded-[8px] px-2.5 focus:bg-[#F3F4F6]`}
                >
                  {isSaving ? "Saving..." : "Save Quote"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onEdit();
                  }}
                  disabled={!canManageQuote}
                  className={`${styles.quoteButtonLabel} h-9 cursor-pointer rounded-[8px] px-2.5 focus:bg-[#F3F4F6]`}
                >
                  Edit Quote
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  onExport();
                }}
                disabled={isSaving}
                className={`${styles.quoteButtonLabel} h-9 cursor-pointer rounded-[8px] px-2.5 focus:bg-[#F3F4F6]`}
              >
                Export PDF
              </DropdownMenuItem>

              {quoteId && onDelete ? (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[#E5E7EB]" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void onDelete();
                    }}
                    disabled={!canDeleteQuote || isDeleting}
                    className="h-9 cursor-pointer rounded-[8px] px-2.5 text-[14px] text-[#b42318] focus:bg-[#FEF3F2] focus:text-[#b42318]"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
      {saveMessage ? <p className={`${interMedium.className} text-xs font-medium text-[#5f6f89]`}>{saveMessage}</p> : null}

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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] [&_input]:bg-[#F8F9FC] [&_select]:bg-[#F8F9FC] [&_textarea]:bg-[#F8F9FC]">
          <div className={`${styles.quotePanelCard} px-5 py-5 sm:px-6`}>
            <section className="border-b border-[#E8EDF5] pb-5">
              <button
                type="button"
                onClick={() => setIsQuoteDetailsOpen((current) => !current)}
                className="flex w-full items-center justify-between"
              >
                <h2 className={styles.quoteSectionTitle}>Quote Details</h2>
                <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isQuoteDetailsOpen ? "rotate-180" : ""}`} />
              </button>

              {isQuoteDetailsOpen ? (
                <div className="mt-4 space-y-5">
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className={styles.quoteBodyLabel}>Quote title</label>
                        <Input value={quoteTitle} onChange={(event) => setQuoteTitle(event.target.value)} placeholder="Kitchen renovation quote" className="h-10 rounded-[6px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Status</label>
                        <select
                          value={quoteStatus}
                          onChange={(event) => setQuoteStatus(event.target.value as QuoteStatus)}
                          className={`${styles.quoteTabLabel} h-10 w-full rounded-[6px] border border-[#d1d9e6] bg-[#F8F9FC] px-3`}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Project name</label>
                        <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="h-10 rounded-[6px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Quote date</label>
                        <Input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} className="h-10 rounded-[6px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className={styles.quoteBodyLabel}>Expiry date</label>
                        <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="h-10 rounded-[6px]" />
                      </div>
                    </div>
                    <div className="max-w-[320px] space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Quote number</label>
                      <Input value={quoteNumber} readOnly placeholder="Q-26001-1" className="h-10 rounded-[6px] bg-[#f8fafc]" />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="border-b border-[#E8EDF5] py-5">
              <button
                type="button"
                onClick={() => setIsLineItemsOpen((current) => !current)}
                className="flex w-full items-center justify-between"
              >
                <h2 className={styles.quoteSectionTitle}>Line Items</h2>
                <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isLineItemsOpen ? "rotate-180" : ""}`} />
              </button>

              {isLineItemsOpen ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={() => addLineItem(false)} className={`${styles.quoteButtonLabel} h-9 rounded-[6px] bg-[#0B2739] px-3 text-white hover:bg-[#0B2739]`}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add Item
                    </Button>
                    <Button type="button" onClick={() => addLineItem(true)} variant="outline" className={`${styles.quoteButtonLabel} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3`}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add Optional
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsScopeImportOpen((current) => !current)}
                      className={`${styles.quoteButtonLabel} h-9 rounded-[6px] border-[#d3dbe8] bg-[#F8F9FC] px-3`}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Import Scope Items
                    </Button>
                  </div>

                  {isScopeImportOpen ? (
                    <div className={`${styles.quoteMetricTile} min-h-0 p-3`}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className={styles.quoteCardTitle}>Cost Breakdown Categories</p>
                        <Button
                          type="button"
                          onClick={importSelectedScopeItems}
                          disabled={selectedScopeCostItemIds.length === 0}
                          className={`${styles.quoteButtonLabel} h-8 rounded-[6px] bg-[#F74917] px-3 text-white hover:bg-[#e63f10] disabled:opacity-50`}
                        >
                          Add Selected ({selectedScopeCostItemIds.length})
                        </Button>
                      </div>
                      {isLoadingScopeItems ? (
                        <p className={styles.quoteBodyLabel}>Loading Scope Builder items...</p>
                      ) : availableScopeCostItems.length > 0 ? (
                        <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                          {availableScopeCostItems.map((item) => (
                            <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-[6px] border border-[#E6ECF5] bg-[#F8F9FC] px-2.5 py-2">
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
                        <p className={styles.quoteBodyLabel}>No completed Scope Builder items found for this lead workspace.</p>
                      )}
                    </div>
                  ) : null}

                  <div className="hidden rounded-[6px] border border-[#E5EAF2] overflow-visible md:block">
                    <div className="overflow-x-auto">
                      <div className="min-w-[760px]">
                        <div
                          className={`${styles.quoteTabLabel} grid items-center gap-2 bg-[#F8FAFC] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.1em]`}
                          style={{ gridTemplateColumns: MAIN_LINE_GRID_TEMPLATE }}
                        >
                          <span>Description</span>
                          <span>Section</span>
                          <span>Qty</span>
                          <span>Unit</span>
                          <span>Rate</span>
                          <span className="text-right">Total</span>
                        </div>
                        <div className="divide-y divide-[#EEF2F7]">
                          {mainLineItems.map((item) => (
                            <div key={item.id} className="group grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: MAIN_LINE_GRID_TEMPLATE }}>
                              <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
                              <select
                                value={item.section}
                                onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                                className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-2 text-sm text-[#1d2433]`}
                              >
                                {LINE_ITEM_SECTIONS.map((section) => (
                                  <option key={section} value={section}>
                                    {section}
                                  </option>
                                ))}
                              </select>
                              <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[6px] px-2" />
                              <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[6px] px-2" />
                              <div className="relative w-[100px]">
                                <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                                <Input
                                  type="number"
                                  value={item.rate === 0 ? "" : item.rate}
                                  onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                                  className="h-10 w-[100px] rounded-[6px] pl-6 pr-2"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-1.5">
                                <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => removeLineItem(item.id)}
                                  className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
                                  aria-label="Delete line item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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

                  <div className="space-y-2 md:hidden">
                    <p className={`${styles.quoteTabLabel} px-1 text-[11px] uppercase tracking-[0.08em]`}>Main line items</p>
                    {mainLineItems.map((item) => (
                      <div key={item.id} className="space-y-2 rounded-[6px] border border-[#E5EAF2] bg-[#FAFCFF] p-3">
                        <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Description" />
                        <select
                          value={item.section}
                          onChange={(event) => updateLineItem(item.id, "section", event.target.value as LineItemSection)}
                          className={`${interMedium.className} h-10 w-full rounded-[6px] border border-[#d6dfeb] bg-[#F8F9FC] px-2 text-sm text-[#1d2433]`}
                        >
                          {LINE_ITEM_SECTIONS.map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-full rounded-[6px] px-2" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-full rounded-[6px] px-2" />
                          <div className="relative">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-10 w-full rounded-[6px] pl-6 pr-2"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                          <Button type="button" variant="ghost" onClick={() => removeLineItem(item.id)} className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]" aria-label="Delete line item">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {mainLineItems.length === 0 ? (
                      <div className={`${interMedium.className} rounded-[6px] border border-[#E5EAF2] px-3 py-4 text-center text-sm text-[#73839a]`}>No main line items yet.</div>
                    ) : null}
                  </div>

                  <div className="hidden rounded-[6px] border border-[#E5EAF2] overflow-visible md:block">
                    <div className="overflow-x-auto">
                      <div className="min-w-[640px]">
                        <div
                          className={`${styles.quoteTabLabel} grid items-center gap-2 bg-[#FAFBFD] px-3 py-2 text-left text-[11px] uppercase tracking-[0.08em]`}
                          style={{ gridTemplateColumns: OPTIONAL_LINE_GRID_TEMPLATE }}
                        >
                          <span>Optional Items</span>
                          <span>Qty</span>
                          <span>Unit</span>
                          <span>Rate</span>
                          <span className="text-right">Total</span>
                        </div>
                        <div className="divide-y divide-[#EEF2F7]">
                          {optionalLineItems.map((item) => (
                            <div key={item.id} className="group grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: OPTIONAL_LINE_GRID_TEMPLATE }}>
                              <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
                              <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-[72px] rounded-[6px] px-2" />
                              <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-[72px] rounded-[6px] px-2" />
                              <div className="relative w-[100px]">
                                <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                                <Input
                                  type="number"
                                  value={item.rate === 0 ? "" : item.rate}
                                  onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                                  className="h-10 w-[100px] rounded-[6px] pl-6 pr-2"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-1.5">
                                <div className={`${interMedium.className} text-right text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => removeLineItem(item.id)}
                                  className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318] group-hover:text-[#94A3B8]"
                                  aria-label="Delete optional line item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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

                  <div className="space-y-2 md:hidden">
                    <p className={`${styles.quoteTabLabel} px-1 text-[11px] uppercase tracking-[0.08em]`}>Optional items</p>
                    {optionalLineItems.map((item) => (
                      <div key={item.id} className="space-y-2 rounded-[6px] border border-[#E5EAF2] bg-[#F8F9FC] p-3">
                        <DescriptionInputWithPreview value={item.description} onChange={(value) => updateLineItem(item.id, "description", value)} placeholder="Optional add-on" />
                        <div className="grid grid-cols-3 gap-2">
                          <Input type="number" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", numberOrZero(event.target.value))} className="h-10 w-full rounded-[6px] px-2" />
                          <Input value={item.unit} onChange={(event) => updateLineItem(item.id, "unit", event.target.value)} className="h-10 w-full rounded-[6px] px-2" />
                          <div className="relative">
                            <span className={`${interMedium.className} pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[#64748B]`}>$</span>
                            <Input
                              type="number"
                              value={item.rate === 0 ? "" : item.rate}
                              onChange={(event) => updateLineItem(item.id, "rate", numberOrZero(event.target.value))}
                              className="h-10 w-full rounded-[6px] pl-6 pr-2"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`${interMedium.className} text-sm font-semibold text-[#0F172A]`}>{toMoney(lineItemTotal(item))}</div>
                          <Button type="button" variant="ghost" onClick={() => removeLineItem(item.id)} className="h-8 w-8 rounded-[6px] p-0 text-[#9AA8BC]/80 hover:bg-[#FEF2F2] hover:text-[#B42318]" aria-label="Delete optional line item">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {optionalLineItems.length === 0 ? (
                      <div className={`${interMedium.className} rounded-[6px] border border-[#E5EAF2] px-3 py-4 text-center text-xs text-[#7e8ca2]`}>No optional items yet.</div>
                    ) : null}
                  </div>

                  <div>
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
                </div>
              ) : null}
            </section>

            <section className="pt-5">
              <button type="button" onClick={() => setIsTermsOpen((current) => !current)} className="flex w-full items-center justify-between">
                <h2 className={styles.quoteSectionTitle}>Terms & Clarifications</h2>
                <ChevronDown className={`h-4 w-4 text-[#64748B] transition-transform ${isTermsOpen ? "rotate-180" : ""}`} />
              </button>
              {isTermsOpen ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Validity period</label>
                      <Input value={validityPeriod} onChange={(event) => setValidityPeriod(event.target.value)} className="h-10 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Payment terms</label>
                      <Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} className="h-10 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Lead time</label>
                      <Input value={leadTime} onChange={(event) => setLeadTime(event.target.value)} className="h-10 rounded-[6px]" />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Inclusions</label>
                      <textarea value={termsInclusions} onChange={(event) => setTermsInclusions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Exclusions</label>
                      <textarea value={termsExclusions} onChange={(event) => setTermsExclusions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Clarifications</label>
                      <textarea value={clarifications} onChange={(event) => setClarifications(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.quoteBodyLabel}>Assumptions</label>
                      <textarea value={assumptions} onChange={(event) => setAssumptions(event.target.value)} className={`${interMedium.className} min-h-[84px] w-full rounded-[6px] border border-[#d1d9e6] px-3 py-2 text-sm`} />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className="xl:sticky xl:top-6 xl:self-start">
            <Card className={`${styles.quotePanelCard} overflow-hidden`}>
              <CardHeader className="pb-3 pt-5">
                <CardTitle className={styles.quoteSectionTitle}>Pricing Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 bg-[#FBFEFE] pb-5">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className={styles.quoteBodyLabel}>{markupLabel} (%)</label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIncludeMarginInExport((current) => !current)}
                      className={`${styles.quoteButtonLabel} h-6 rounded-[6px] px-2 text-[11px] ${
                        includeMarginInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
                      }`}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Include
                    </Button>
                  </div>
                  <Input type="number" value={marginPercent === "0" ? "" : marginPercent} onChange={(event) => setMarginPercent(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className={styles.quoteBodyLabel}>Discount</label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIncludeDiscountInExport((current) => !current)}
                      className={`${styles.quoteButtonLabel} h-6 rounded-[6px] px-2 text-[11px] ${
                        includeDiscountInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
                      }`}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Include
                    </Button>
                  </div>
                  <Input type="number" value={discountAmount === "0" ? "" : discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className={styles.quoteBodyLabel}>{contingencyLabel}</label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIncludeContingencyInExport((current) => !current)}
                      className={`${styles.quoteButtonLabel} h-6 rounded-[6px] px-2 text-[11px] ${
                        includeContingencyInExport ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#d3dbe8] bg-[#F8F9FC] text-[#64748B]"
                      }`}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Include
                    </Button>
                  </div>
                  <Input type="number" value={contingencyAmount === "0" ? "" : contingencyAmount} onChange={(event) => setContingencyAmount(event.target.value)} className="h-10 rounded-[6px]" />
                </div>
                <div className="grid gap-2">
                  <label className={styles.quoteBodyLabel}>GST (%)</label>
                  <Input type="number" value={gstPercent} onChange={(event) => setGstPercent(event.target.value)} className="h-10 rounded-[6px]" />
                </div>

                <div className="h-px bg-[#E7ECF3]" />

                <div className="space-y-1.5 text-sm">
                  <p className="flex items-center justify-between"><span className={styles.quoteBodyLabel}>Discount</span><span className={styles.quoteBodyValue}>-{toMoney(pricingSummary.discount)}</span></p>
                  <p className="flex items-center justify-between"><span className={styles.quoteBodyLabel}>{contingencyLabel}</span><span className={styles.quoteBodyValue}>{toMoney(pricingSummary.contingency)}</span></p>
                  <div className="my-1 h-px bg-[#CBD5E1]" />
                  <p className="flex items-center justify-between"><span className={styles.quoteBodyLabel}>{subtotalExcludingGstLabel}</span><span className={styles.quoteBodyValue}>{toMoney(showMarginBreakout ? pricingSummary.baseSubtotal : pricingSummary.baseSubtotal + pricingSummary.margin)}</span></p>
                  {showMarginBreakout ? (
                    <>
                      <div className="my-1 h-px bg-[#CBD5E1]" />
                      <p className="flex items-center justify-between"><span className={styles.quoteBodyLabel}>{markupLabel}</span><span className={styles.quoteBodyValue}>{toMoney(pricingSummary.margin)}</span></p>
                      <div className="my-1 h-px bg-[#CBD5E1]" />
                      <p className="flex items-center justify-between"><span className={styles.quoteBodyLabel}>{totalIncludingMarginLabel}</span><span className={styles.quoteBodyValue}>{toMoney(pricingSummary.baseSubtotal + pricingSummary.margin)}</span></p>
                    </>
                  ) : null}
                  <div className="my-1 h-px bg-[#CBD5E1]" />
                  <p className="flex items-center justify-between"><span className={styles.quoteBodyLabel}>GST ({gstPercent.trim() || "15"}%)</span><span className={styles.quoteBodyValue}>{toMoney(pricingSummary.gst)}</span></p>
                </div>

                <div className={`${styles.quoteMetricTile} min-h-0 border-[1.3px] px-4 py-3`}>
                  <p className={`${styles.quoteTabLabel} text-[11px] uppercase tracking-[0.08em]`}>{totalQuotePriceLabel}</p>
                  <p className={`${styles.quoteBodyValue} mt-[11px] text-[34px] leading-none`}>{toMoney(pricingSummary.grandTotal)}</p>
                </div>

                <div className="space-y-2 pt-1">
                  <Button type="button" onClick={onSave} disabled={!canManageQuote || isSaving} className={`${styles.quoteButtonLabel} h-10 w-full rounded-full bg-[#0B2739] text-white hover:bg-[#0B2739]`}>
                    {isSaving ? "Saving..." : "Save Quote"}
                  </Button>
                  <Button type="button" onClick={onExport} disabled={isSaving} variant="outline" className={`${styles.quoteButtonLabel} h-10 w-full rounded-full border-[#d3dbe8] bg-[#F8F9FC]`}>
                    Export PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          <section className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-5 py-4">
            <div className="mb-3 border-b border-[#E2E8F0] pb-2.5">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Quote Summary</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="mt-1 text-[40px] font-semibold leading-none text-[#082851]">{toMoney(pricingSummary.grandTotal)}</p>
              </div>
            </div>
          </section>

          <div className="space-y-7">
            <section className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3">
              <div className="mb-3 flex items-end justify-between border-b border-[#E2E8F0] pb-2.5">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Quote Details</h2>
              </div>
              <div className={`${interMedium.className} grid gap-x-8 gap-y-2 text-sm font-medium text-[#0F172A] md:grid-cols-2`}>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Client</span><span>{clientName || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Site</span><span>{siteAddress || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Project</span><span>{projectName || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Issued</span><span>{toDayMonthYearLabel(quoteDate)}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Quote #</span><span>{quoteNumber || "—"}</span></div>
                <div className="grid grid-cols-[84px_1fr] items-baseline gap-2"><span className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Expiry</span><span>{toDayMonthYearLabel(expiryDate)}</span></div>
              </div>
            </section>

            <section className="rounded-[6px] border border-[#dbe3ef] bg-[#F8F9FC]">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E2E8F0] px-5 pb-3 pt-4">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Line Items</h2>
              </div>
              <div className="overflow-x-auto">
                <table className={`${interMedium.className} min-w-full border-collapse text-left text-sm font-medium text-[#0F172A]`}>
                  <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-[0.08em] text-[#64748B]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Section</th>
                      <th className="px-4 py-3 text-right font-semibold">Qty</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 text-right font-semibold">Rate</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => (
                      <tr key={item.id} className={index === 0 ? "" : "border-t border-[#E2E8F0]"}>
                        <td className="px-4 py-3">{item.description || "Untitled item"}</td>
                        <td className="px-4 py-3">{item.section}{item.isOptional ? " (Optional)" : ""}</td>
                        <td className="px-4 py-3 text-right">{item.quantity}</td>
                        <td className="px-4 py-3">{item.unit || "—"}</td>
                        <td className="px-4 py-3 text-right">{toMoney(item.rate)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{toMoney(lineItemTotal(item))}</td>
                      </tr>
                    ))}
                    {lineItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-center text-[#64748B]" colSpan={6}>
                          No line items added yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[#E2E8F0] px-5 py-3">
                <div className={`${interMedium.className} ml-auto max-w-[320px] text-xs font-medium text-[#334155]`}>
                  <p className="flex items-center justify-between gap-3 text-sm font-semibold text-[#082851]">
                    <span>Total</span>
                    <span>{toMoney(pricingSummary.grandTotal)}</span>
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[6px] border border-[#eef2f7] bg-[#fcfdff] px-5 py-4">
              <div className="mb-3 border-b border-[#E2E8F0] pb-2.5">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#082851]">Terms & Clarifications</h2>
              </div>
              <div className={`${interMedium.className} grid gap-3 text-sm font-medium text-[#0F172A]`}>
                <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#eef3f8] pb-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Inclusions</p><p>{termsInclusions || "—"}</p></div>
                <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#eef3f8] pb-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Exclusions</p><p>{termsExclusions || "—"}</p></div>
                <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#eef3f8] pb-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Clarifications</p><p>{clarifications || "—"}</p></div>
                <div className="grid grid-cols-[130px_1fr] gap-3"><p className="text-[11px] uppercase tracking-[0.08em] text-[#64748B]">Assumptions</p><p>{assumptions || "—"}</p></div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
