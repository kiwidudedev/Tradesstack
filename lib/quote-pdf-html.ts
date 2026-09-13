import {
  lineItemTotal,
  toDayMonthYearLabel,
  toMoney,
  type LineItem,
  type PricingSummary,
} from "@/lib/quote-editor-core";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export interface BuildQuotePdfHtmlParams {
  lineItems: LineItem[];
  pricingSummary: PricingSummary;
  showMarginBreakout: boolean;
  includeDiscountInExport: boolean;
  includeContingencyInExport: boolean;
  quoteDate: string;
  quoteNumber: string;
  revisionNumber?: number;
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
          ${params.revisionNumber ? `<div class="row"><span class="k">Revision:</span><span class="v">${params.revisionNumber}</span></div>` : ""}
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
