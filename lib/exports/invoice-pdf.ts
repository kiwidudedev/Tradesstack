import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { applyDeterministicPdfMetadata } from "@/lib/exports/merge-pdfs";
import type { PdfExportTiming } from "@/lib/exports/pdf-export-timing";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN_X = 32;
const PAGE_MARGIN_TOP = 30;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;
const DEFAULT_BRAND_COLOR = "#0B2739";

export type InvoicePdfLine = {
  label: string;
  amountMinor: number;
  kind: "gross_claim" | "retention_withheld" | "retention_released";
};

export type InvoicePdfExportModel = {
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationBrandPrimaryColor: string | null;
  organizationBusinessNumber: string;
  organizationBankAccountDetails: string;
  organizationTaxNumber: string;
  organizationContactName: string;
  organizationContactEmail: string;
  organizationContactPhone: string;
  clientCompanyName: string;
  clientContactName: string;
  projectName: string;
  projectLocation: string;
  invoiceNumber: string;
  invoiceDateIso: string;
  invoiceDateLabel: string;
  dueDateLabel: string;
  paymentClaimReference: string;
  claimTitle: string;
  currencyCode: string;
  taxLabel: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: InvoicePdfLine[];
};

type InvoicePdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

function sanitizeHexColor(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(trimmed)
    ? trimmed
    : DEFAULT_BRAND_COLOR;
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((segment) => `${segment}${segment}`).join("")
    : normalized;
  return rgb(
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255,
  );
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function buildInvoicePdfFileName(invoiceNumber: string) {
  const safeInvoiceNumber = sanitizeFilePart(invoiceNumber);
  return safeInvoiceNumber ? `Invoice-${safeInvoiceNumber}.pdf` : "Invoice.pdf";
}

function money(minor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function wrapText(params: {
  text: string;
  font: PDFFont;
  size: number;
  maxWidth: number;
}) {
  const lines: string[] = [];
  for (const paragraph of params.text.replace(/\r/g, "").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (params.font.widthOfTextAtSize(next, params.size) <= params.maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawLines(params: {
  page: PDFPage;
  lines: string[];
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  lineHeight: number;
  color: ReturnType<typeof rgb>;
}) {
  let y = params.y;
  for (const line of params.lines) {
    params.page.drawText(line || " ", {
      x: params.x,
      y,
      font: params.font,
      size: params.size,
      color: params.color,
    });
    y -= params.lineHeight;
  }
  return y;
}

async function embedLogo(params: {
  pdf: PDFDocument;
  page: PDFPage;
  logoUrl: string | null;
  fetchImpl: typeof fetch;
  x: number;
  y: number;
  width: number;
  height: number;
  timing?: PdfExportTiming;
}) {
  if (!params.logoUrl) return false;
  let logoFetchCompleted = false;
  try {
    params.timing?.start("logo-fetch");
    const response = await params.fetchImpl(params.logoUrl);
    if (!response.ok) {
      params.timing?.end("logo-fetch");
      return false;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    params.timing?.end("logo-fetch");
    params.timing?.mark("logo-fetch-completed");
    logoFetchCompleted = true;
    const contentType = response.headers.get("content-type") ?? "";
    const image = contentType.includes("png")
      ? await params.pdf.embedPng(bytes)
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? await params.pdf.embedJpg(bytes)
        : null;
    if (!image) return false;
    const scaled = image.scaleToFit(params.width, params.height);
    params.page.drawImage(image, {
      x: params.x,
      y: params.y + (params.height - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
    });
    return true;
  } catch {
    if (!logoFetchCompleted) {
      params.timing?.end("logo-fetch");
    }
    return false;
  }
}

function drawMetaRow(params: {
  page: PDFPage;
  fonts: InvoicePdfFonts;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
}) {
  params.page.drawText(params.label, {
    x: params.x,
    y: params.y,
    size: 9,
    font: params.fonts.bold,
    color: rgb(0.12, 0.16, 0.22),
  });
  const valueWidth = params.fonts.regular.widthOfTextAtSize(params.value, 10);
  params.page.drawText(params.value, {
    x: params.x + params.width - valueWidth,
    y: params.y,
    size: 10,
    font: params.fonts.regular,
    color: rgb(0.29, 0.33, 0.39),
  });
}

function drawAmountRow(params: {
  page: PDFPage;
  fonts: InvoicePdfFonts;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  strong?: boolean;
  fill?: ReturnType<typeof rgb>;
}) {
  if (params.fill) {
    params.page.drawRectangle({
      x: params.x,
      y: params.y - 5,
      width: params.width,
      height: 20,
      color: params.fill,
    });
  }
  const font = params.strong ? params.fonts.bold : params.fonts.regular;
  const color = params.fill ? rgb(1, 1, 1) : rgb(0.16, 0.2, 0.28);
  const size = params.strong ? 10.5 : 9.5;
  params.page.drawText(params.label, {
    x: params.x + 7,
    y: params.y,
    size,
    font,
    color,
  });
  const valueWidth = font.widthOfTextAtSize(params.value, size);
  params.page.drawText(params.value, {
    x: params.x + params.width - valueWidth - 7,
    y: params.y,
    size,
    font,
    color,
  });
}

export async function composeInvoicePdfExport(params: {
  model: InvoicePdfExportModel;
  fetchImpl?: typeof fetch;
  timing?: PdfExportTiming;
}) {
  const { model } = params;
  const fetchImpl = params.fetchImpl
    ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  params.timing?.start("pdf-render");
  const pdf = await PDFDocument.create();
  const evidenceDate = new Date(`${model.invoiceDateIso}T00:00:00.000Z`);
  applyDeterministicPdfMetadata(pdf, {
    title: `${model.organizationName} - Invoice ${model.invoiceNumber}`,
    author: model.organizationName,
    subject: `Invoice ${model.invoiceNumber}`,
    creator: "Tradesstack",
    producer: "Tradesstack Invoice Export",
    creationDate: evidenceDate,
    modificationDate: evidenceDate,
  });

  const fonts: InvoicePdfFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const brandColor = hexToRgb(sanitizeHexColor(model.organizationBrandPrimaryColor));
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN_TOP;

  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 4,
    color: brandColor,
  });
  y -= 20;

  const logoDrawn = await embedLogo({
    pdf,
    page,
    logoUrl: model.organizationLogoUrl,
    fetchImpl,
    x: PAGE_MARGIN_X,
    y: y - 48,
    width: 160,
    height: 54,
    timing: params.timing,
  });
  if (!logoDrawn) {
    page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: y - 42,
      width: 42,
      height: 42,
      borderColor: rgb(0.81, 0.84, 0.88),
      borderWidth: 1,
    });
    page.drawText(model.organizationName.slice(0, 2).toUpperCase() || "TS", {
      x: PAGE_MARGIN_X + 10,
      y: y - 26,
      size: 12,
      font: fonts.bold,
      color: brandColor,
    });
  }
  page.drawText("Invoice", {
    x: PAGE_WIDTH - PAGE_MARGIN_X - fonts.bold.widthOfTextAtSize("Invoice", 21),
    y: y - 14,
    size: 21,
    font: fonts.bold,
    color: brandColor,
  });
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: y - 56 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: y - 56 },
    thickness: 1,
    color: rgb(0.81, 0.84, 0.88),
  });
  y -= 74;

  page.drawText("BILL TO:", {
    x: PAGE_MARGIN_X,
    y,
    size: 9,
    font: fonts.bold,
    color: rgb(0.12, 0.16, 0.22),
  });
  const clientLines = [
    model.clientCompanyName,
    model.clientContactName && model.clientContactName !== model.clientCompanyName
      ? `Contact: ${model.clientContactName}`
      : "",
    model.projectLocation,
  ].filter(Boolean);
  drawLines({
    page,
    lines: clientLines,
    x: PAGE_MARGIN_X,
    y: y - 16,
    font: fonts.regular,
    size: 10,
    lineHeight: 13,
    color: rgb(0.29, 0.33, 0.39),
  });

  const metaX = PAGE_WIDTH - PAGE_MARGIN_X - 244;
  [
    ["INVOICE NO:", model.invoiceNumber],
    ["INVOICE DATE:", model.invoiceDateLabel],
    ["DUE DATE:", model.dueDateLabel],
    ["PAYMENT CLAIM REF:", model.paymentClaimReference],
  ].forEach(([label, value], index) => drawMetaRow({
    page,
    fonts,
    label,
    value,
    x: metaX,
    y: y - index * 16,
    width: 244,
  }));
  y -= 76;

  page.drawText(`Project: ${model.projectName}`, {
    x: PAGE_MARGIN_X,
    y,
    size: 18,
    font: fonts.bold,
    color: rgb(0.12, 0.16, 0.22),
  });
  y -= 20;
  if (model.claimTitle) {
    const titleLines = wrapText({
      text: model.claimTitle,
      font: fonts.regular,
      size: 9.5,
      maxWidth: CONTENT_WIDTH,
    });
    y = drawLines({
      page,
      lines: titleLines,
      x: PAGE_MARGIN_X,
      y,
      font: fonts.regular,
      size: 9.5,
      lineHeight: 12,
      color: rgb(0.38, 0.44, 0.54),
    }) - 8;
  }

  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 20,
    width: CONTENT_WIDTH,
    height: 20,
    color: brandColor,
  });
  page.drawText("Description", {
    x: PAGE_MARGIN_X + 8,
    y: y - 14,
    size: 8.5,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  const amountHeading = "Amount";
  page.drawText(amountHeading, {
    x: PAGE_WIDTH - PAGE_MARGIN_X - fonts.bold.widthOfTextAtSize(amountHeading, 8.5) - 8,
    y: y - 14,
    size: 8.5,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  y -= 20;

  for (const line of model.lines) {
    const descriptionLines = wrapText({
      text: line.label,
      font: fonts.regular,
      size: 9.5,
      maxWidth: CONTENT_WIDTH - 150,
    });
    const rowHeight = Math.max(32, 14 + descriptionLines.length * 11);
    page.drawLine({
      start: { x: PAGE_MARGIN_X, y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y },
      thickness: 1,
      color: rgb(0.86, 0.88, 0.91),
    });
    drawLines({
      page,
      lines: descriptionLines,
      x: PAGE_MARGIN_X + 8,
      y: y - 14,
      font: fonts.regular,
      size: 9.5,
      lineHeight: 11,
      color: rgb(0.16, 0.2, 0.28),
    });
    const amountText = line.kind === "retention_withheld"
      ? `-${money(Math.abs(line.amountMinor), model.currencyCode)}`
      : line.kind === "retention_released"
        ? `+${money(line.amountMinor, model.currencyCode)}`
        : money(line.amountMinor, model.currencyCode);
    const amountWidth = fonts.regular.widthOfTextAtSize(amountText, 9.5);
    page.drawText(amountText, {
      x: PAGE_WIDTH - PAGE_MARGIN_X - amountWidth - 8,
      y: y - 14,
      size: 9.5,
      font: fonts.regular,
      color: rgb(0.16, 0.2, 0.28),
    });
    y -= rowHeight;
  }
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y },
    thickness: 1,
    color: rgb(0.86, 0.88, 0.91),
  });
  y -= 28;

  const paymentWidth = CONTENT_WIDTH - 250;
  const totalWidth = 232;
  const totalX = PAGE_WIDTH - PAGE_MARGIN_X - totalWidth;
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 18,
    width: paymentWidth,
    height: 18,
    color: brandColor,
  });
  page.drawText("PAYMENT DETAILS", {
    x: PAGE_MARGIN_X + 8,
    y: y - 12,
    size: 8.5,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: totalX,
    y: y - 18,
    width: totalWidth,
    height: 18,
    color: brandColor,
  });
  page.drawText("INVOICE TOTAL", {
    x: totalX + 8,
    y: y - 12,
    size: 8.5,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const paymentLines = [
    model.organizationName ? `Company: ${model.organizationName}` : "",
    model.organizationContactName ? `Contact: ${model.organizationContactName}` : "",
    model.organizationContactPhone ? `Phone: ${model.organizationContactPhone}` : "",
    model.organizationContactEmail ? `Email: ${model.organizationContactEmail}` : "",
    model.organizationBusinessNumber ? `Business Number: ${model.organizationBusinessNumber}` : "",
    model.organizationTaxNumber ? `Tax Number: ${model.organizationTaxNumber}` : "",
    model.organizationBankAccountDetails
      ? `Bank Account Details: ${model.organizationBankAccountDetails}`
      : "",
    `Currency: ${model.currencyCode}`,
    "Thank you for your business!",
  ].filter(Boolean);
  drawLines({
    page,
    lines: paymentLines.flatMap((line) => wrapText({
      text: line,
      font: line === "Thank you for your business!" ? fonts.bold : fonts.regular,
      size: 9.2,
      maxWidth: paymentWidth - 16,
    })),
    x: PAGE_MARGIN_X + 8,
    y: y - 34,
    font: fonts.regular,
    size: 9.2,
    lineHeight: 12,
    color: rgb(0.22, 0.25, 0.32),
  });

  drawAmountRow({
    page,
    fonts,
    label: "Subtotal (excl. tax)",
    value: money(model.subtotalMinor, model.currencyCode),
    x: totalX,
    y: y - 34,
    width: totalWidth,
  });
  drawAmountRow({
    page,
    fonts,
    label: model.taxLabel,
    value: money(model.taxMinor, model.currencyCode),
    x: totalX,
    y: y - 54,
    width: totalWidth,
  });
  drawAmountRow({
    page,
    fonts,
    label: "Total Due",
    value: money(model.totalMinor, model.currencyCode),
    x: totalX,
    y: y - 78,
    width: totalWidth,
    strong: true,
    fill: brandColor,
  });

  const footerLabel = `${model.organizationName} - ${model.projectName} - Invoice ${model.invoiceNumber}`;
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: 20 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: 20 },
    thickness: 1,
    color: rgb(0.81, 0.84, 0.88),
  });
  page.drawText(footerLabel, {
    x: PAGE_MARGIN_X,
    y: 8,
    size: 8,
    font: fonts.regular,
    color: rgb(0.41, 0.46, 0.53),
  });
  const pageLabel = "Page 1 of 1";
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - PAGE_MARGIN_X - fonts.regular.widthOfTextAtSize(pageLabel, 8),
    y: 8,
    size: 8,
    font: fonts.regular,
    color: rgb(0.41, 0.46, 0.53),
  });
  params.timing?.end("pdf-render");

  params.timing?.start("serialization");
  const bytes = await pdf.save();
  params.timing?.end("serialization");
  params.timing?.mark("serialization-completed");
  return {
    bytes,
    fileName: buildInvoicePdfFileName(model.invoiceNumber),
  };
}
