import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  applyDeterministicPdfMetadata,
  mergePdfDocuments,
  type DeterministicPdfMetadata,
} from "@/lib/exports/merge-pdfs";
import {
  getPaymentClaimStatutoryDocuments,
  type StatutoryDocument,
} from "@/lib/legal/payment-claim-statutory-documents";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN_X = 32;
const PAGE_MARGIN_TOP = 30;
const PAGE_MARGIN_BOTTOM = 34;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;
const DEFAULT_BRAND_COLOR = "#0B2739";

export type PaymentClaimPdfLineItem = {
  id: string;
  description: string;
  sourceLabel: string;
  secondaryLabel?: string | null;
  contractValueLabel: string;
  progressLabel: string;
  totalLabel: string;
};

export type PaymentClaimPdfExportModel = {
  organizationCountry: string | null | undefined;
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationBrandPrimaryColor: string | null;
  organizationBusinessNumber: string;
  organizationBankAccountDetails: string;
  organizationGstNumber: string;
  organizationContactName: string;
  organizationContactEmail: string;
  organizationContactPhone: string;
  projectName: string;
  projectLocation: string;
  clientCompanyName: string;
  clientContactName: string;
  claimNumber: string;
  issueDateIso?: string | null;
  issueDateLabel: string;
  dueDateLabel: string;
  periodRangeLabel: string;
  notes: string;
  legalNoticeText: string | null;
  originalContractLabel: string;
  approvedVariationsLabel: string;
  revisedContractValueLabel: string;
  valueEarnedToDateLabel: string;
  previousClaimsTotalLabel: string;
  grossCurrentClaimLabel: string;
  retentionWithheldLabel: string;
  retentionHeldToDateLabel: string;
  netCurrentClaimLabel: string;
  gstLabel: string;
  gstAmountLabel: string;
  totalPayableLabel: string;
  lineItems: PaymentClaimPdfLineItem[];
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
};

type PdfPageState = {
  page: PDFPage;
  y: number;
};

function sanitizeHexColor(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(trimmed) ? trimmed : DEFAULT_BRAND_COLOR;
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized
        .split("")
        .map((segment) => `${segment}${segment}`)
        .join("")
    : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPaymentClaimPdfFileName(claimNumber: string) {
  const safeClaimNumber = sanitizeFilePart(claimNumber);
  return safeClaimNumber ? `Payment-Claim-${safeClaimNumber}.pdf` : "Payment-Claim.pdf";
}

const PAYMENT_CLAIM_PDF_FALLBACK_DATE = new Date("2000-01-01T00:00:00.000Z");

function paymentClaimPdfEvidenceDate(model: PaymentClaimPdfExportModel) {
  const isoDate = model.issueDateIso?.trim();
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(PAYMENT_CLAIM_PDF_FALLBACK_DATE.getTime());
}

function paymentClaimPdfMetadata(
  model: PaymentClaimPdfExportModel,
): DeterministicPdfMetadata {
  const evidenceDate = paymentClaimPdfEvidenceDate(model);
  return {
    title: `${model.organizationName} - ${model.projectName} - ${model.claimNumber || "Payment Claim"}`,
    author: model.organizationName,
    subject: `Payment Claim ${model.claimNumber || ""}`.trim(),
    creator: "Tradesstack",
    producer: "Tradesstack Payment Claim Export",
    creationDate: evidenceDate,
    modificationDate: evidenceDate,
  };
}

function wrapText(params: {
  text: string;
  font: PDFFont;
  fontSize: number;
  maxWidth: number;
}) {
  const normalized = params.text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  for (const rawLine of normalized) {
    const line = rawLine.trimEnd();
    if (!line) {
      lines.push("");
      continue;
    }

    const words = line.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (params.font.widthOfTextAtSize(candidate, params.fontSize) <= params.maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }

    lines.push(currentLine);
  }

  return lines;
}

async function loadImageBytes(logoUrl: string | null, fetchImpl: typeof fetch) {
  if (!logoUrl) {
    return null;
  }

  try {
    const response = await fetchImpl(logoUrl);
    if (!response.ok) {
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    return { bytes, contentType };
  } catch {
    return null;
  }
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
}) {
  const image = await loadImageBytes(params.logoUrl, params.fetchImpl);
  if (!image) {
    return false;
  }

  try {
    const embeddedImage = image.contentType.includes("png")
      ? await params.pdf.embedPng(image.bytes)
      : image.contentType.includes("jpeg") || image.contentType.includes("jpg")
        ? await params.pdf.embedJpg(image.bytes)
        : null;

    if (!embeddedImage) {
      return false;
    }

    const scaled = embeddedImage.scaleToFit(params.width, params.height);
    params.page.drawImage(embeddedImage, {
      x: params.x,
      y: params.y + (params.height - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
    });
    return true;
  } catch {
    return false;
  }
}

function createPage(pdf: PDFDocument) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return {
    page,
    y: PAGE_HEIGHT - PAGE_MARGIN_TOP,
  };
}

function drawTextLines(params: {
  page: PDFPage;
  lines: string[];
  font: PDFFont;
  fontSize: number;
  color?: ReturnType<typeof rgb>;
  x: number;
  y: number;
  lineHeight: number;
}) {
  let currentY = params.y;
  for (const line of params.lines) {
    params.page.drawText(line || " ", {
      x: params.x,
      y: currentY,
      size: params.fontSize,
      font: params.font,
      color: params.color,
    });
    currentY -= params.lineHeight;
  }

  return currentY;
}

function drawLabeledValueRow(params: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  label: string;
  value: string;
  fonts: PdfFonts;
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

function drawSummaryRow(params: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  label: string;
  value: string;
  fonts: PdfFonts;
  strong?: boolean;
  fillColor?: ReturnType<typeof rgb> | null;
  textColor?: ReturnType<typeof rgb>;
}) {
  if (params.fillColor) {
    params.page.drawRectangle({
      x: params.x,
      y: params.y - 4,
      width: params.width,
      height: 18,
      color: params.fillColor,
    });
  }

  const labelColor = params.textColor ?? rgb(0.38, 0.44, 0.54);
  const valueColor = params.textColor ?? rgb(0.15, 0.2, 0.29);
  const labelFont = params.strong ? params.fonts.bold : params.fonts.regular;
  const valueFont = params.strong ? params.fonts.bold : params.fonts.bold;

  params.page.drawText(params.label, {
    x: params.x + 6,
    y: params.y,
    size: params.strong ? 10 : 9.5,
    font: labelFont,
    color: labelColor,
  });
  const valueWidth = valueFont.widthOfTextAtSize(params.value, params.strong ? 10 : 9.5);
  params.page.drawText(params.value, {
    x: params.x + params.width - valueWidth - 6,
    y: params.y,
    size: params.strong ? 10 : 9.5,
    font: valueFont,
    color: valueColor,
  });
}

async function renderPaymentClaimDocument(params: {
  model: PaymentClaimPdfExportModel;
  fetchImpl: typeof fetch;
}) {
  const pdf = await PDFDocument.create();
  applyDeterministicPdfMetadata(pdf, paymentClaimPdfMetadata(params.model));

  const fonts: PdfFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const brandColor = hexToRgb(sanitizeHexColor(params.model.organizationBrandPrimaryColor));

  const quotedRows = params.model.lineItems.filter((line) => line.sourceLabel.startsWith("Quote"));
  const variationRows = params.model.lineItems.filter((line) => line.sourceLabel.startsWith("Variation"));

  let state = createPage(pdf);

  async function drawPageHeader(currentState: PdfPageState) {
    currentState.page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: currentState.y - 4,
      width: CONTENT_WIDTH,
      height: 4,
      color: brandColor,
    });
    currentState.y -= 20;

    const logoBoxWidth = 160;
    const logoBoxHeight = 54;
    const logoDrawn = await embedLogo({
      pdf,
      page: currentState.page,
      logoUrl: params.model.organizationLogoUrl,
      fetchImpl: params.fetchImpl,
      x: PAGE_MARGIN_X,
      y: currentState.y - logoBoxHeight + 6,
      width: logoBoxWidth,
      height: logoBoxHeight,
    });

    if (!logoDrawn) {
      currentState.page.drawRectangle({
        x: PAGE_MARGIN_X,
        y: currentState.y - 42,
        width: 42,
        height: 42,
        borderColor: rgb(0.81, 0.84, 0.88),
        borderWidth: 1,
      });
      currentState.page.drawText(params.model.organizationName.slice(0, 2).toUpperCase() || "TS", {
        x: PAGE_MARGIN_X + 10,
        y: currentState.y - 26,
        size: 12,
        font: fonts.bold,
        color: brandColor,
      });
    }

    currentState.page.drawText("Payment Claim", {
      x: PAGE_WIDTH - PAGE_MARGIN_X - fonts.bold.widthOfTextAtSize("Payment Claim", 21),
      y: currentState.y - 14,
      size: 21,
      font: fonts.bold,
      color: brandColor,
    });

    currentState.page.drawLine({
      start: { x: PAGE_MARGIN_X, y: currentState.y - 56 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: currentState.y - 56 },
      thickness: 1,
      color: rgb(0.81, 0.84, 0.88),
    });

    currentState.y -= 74;

    currentState.page.drawText("ISSUED TO:", {
      x: PAGE_MARGIN_X,
      y: currentState.y,
      size: 9,
      font: fonts.bold,
      color: rgb(0.12, 0.16, 0.22),
    });

    const issuedToLines = [
      params.model.clientCompanyName || params.model.projectName,
      params.model.projectLocation || params.model.organizationName,
      params.model.clientContactName ? `Contact: ${params.model.clientContactName}` : "",
    ].filter(Boolean);

    drawTextLines({
      page: currentState.page,
      lines: issuedToLines,
      font: fonts.regular,
      fontSize: 10,
      x: PAGE_MARGIN_X,
      y: currentState.y - 16,
      lineHeight: 13,
      color: rgb(0.29, 0.33, 0.39),
    });

    const metaX = PAGE_WIDTH - PAGE_MARGIN_X - 228;
    drawLabeledValueRow({
      page: currentState.page,
      x: metaX,
      y: currentState.y,
      width: 228,
      label: "PAYMENT CLAIM NO:",
      value: params.model.claimNumber || "Unassigned",
      fonts,
    });
    drawLabeledValueRow({
      page: currentState.page,
      x: metaX,
      y: currentState.y - 16,
      width: 228,
      label: "DATE:",
      value: params.model.issueDateLabel,
      fonts,
    });
    drawLabeledValueRow({
      page: currentState.page,
      x: metaX,
      y: currentState.y - 32,
      width: 228,
      label: "PERIOD:",
      value: params.model.periodRangeLabel,
      fonts,
    });
    drawLabeledValueRow({
      page: currentState.page,
      x: metaX,
      y: currentState.y - 48,
      width: 228,
      label: "DUE DATE:",
      value: params.model.dueDateLabel,
      fonts,
    });

    currentState.y -= 70;
    currentState.page.drawText(`Project: ${params.model.projectName}`, {
      x: PAGE_MARGIN_X,
      y: currentState.y,
      size: 18,
      font: fonts.bold,
      color: rgb(0.12, 0.16, 0.22),
    });
    currentState.y -= 24;
  }

  function drawTableHeader(currentState: PdfPageState) {
    const colWidths = [0.46, 0.2, 0.14, 0.2].map((ratio) => ratio * CONTENT_WIDTH);
    const colX = [
      PAGE_MARGIN_X,
      PAGE_MARGIN_X + colWidths[0],
      PAGE_MARGIN_X + colWidths[0] + colWidths[1],
      PAGE_MARGIN_X + colWidths[0] + colWidths[1] + colWidths[2],
    ];

    currentState.page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: currentState.y - 18,
      width: CONTENT_WIDTH,
      height: 18,
      color: brandColor,
    });

    const headers = ["Description", "Contract Value", "Progress %", "Total"];
    headers.forEach((header, index) => {
      const width = colWidths[index];
      const textWidth = fonts.bold.widthOfTextAtSize(header, 8.5);
      const x = index === 0
        ? colX[index] + 6
        : colX[index] + width - textWidth - 6;
      currentState.page.drawText(header, {
        x,
        y: currentState.y - 12,
        size: 8.5,
        font: fonts.bold,
        color: rgb(1, 1, 1),
      });
    });

    currentState.y -= 18;
    return { colWidths, colX };
  }

  await drawPageHeader(state);
  let { colWidths, colX } = drawTableHeader(state);

  function advanceToNewTablePage() {
    state = createPage(pdf);
    return drawPageHeader(state).then(() => {
      ({ colWidths, colX } = drawTableHeader(state));
    });
  }

  async function drawGroup(label: string, rows: PaymentClaimPdfLineItem[]) {
    if (rows.length === 0) {
      return;
    }

    if (state.y - 18 < PAGE_MARGIN_BOTTOM) {
      await advanceToNewTablePage();
    }

    state.page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: state.y - 18,
      width: CONTENT_WIDTH,
      height: 18,
      color: rgb(0.96, 0.97, 0.99),
    });
    state.page.drawText(label.toUpperCase(), {
      x: PAGE_MARGIN_X + 6,
      y: state.y - 12,
      size: 8,
      font: fonts.bold,
      color: rgb(0.36, 0.43, 0.53),
    });
    state.y -= 18;

    for (const row of rows) {
      const descriptionLines = wrapText({
        text: row.description,
        font: fonts.bold,
        fontSize: 9,
        maxWidth: colWidths[0] - 12,
      });
      const sourceLines = wrapText({
        text: row.sourceLabel,
        font: fonts.regular,
        fontSize: 7.5,
        maxWidth: colWidths[0] - 12,
      });
      const secondaryLines = row.secondaryLabel
        ? wrapText({
            text: row.secondaryLabel,
            font: fonts.italic,
            fontSize: 7.5,
            maxWidth: colWidths[0] - 12,
          })
        : [];
      const totalTextLines = descriptionLines.length + sourceLines.length + secondaryLines.length;
      const rowHeight = Math.max(24, 10 + totalTextLines * 10);

      if (state.y - rowHeight < PAGE_MARGIN_BOTTOM) {
        await advanceToNewTablePage();
      }

      state.page.drawLine({
        start: { x: PAGE_MARGIN_X, y: state.y },
        end: { x: PAGE_MARGIN_X + CONTENT_WIDTH, y: state.y },
        thickness: 1,
        color: rgb(0.81, 0.84, 0.88),
      });

      let textY = state.y - 12;
      textY = drawTextLines({
        page: state.page,
        lines: descriptionLines,
        font: fonts.bold,
        fontSize: 9,
        x: colX[0] + 6,
        y: textY,
        lineHeight: 10,
        color: rgb(0.12, 0.16, 0.22),
      });
      textY = drawTextLines({
        page: state.page,
        lines: sourceLines,
        font: fonts.regular,
        fontSize: 7.5,
        x: colX[0] + 6,
        y: textY + 1,
        lineHeight: 9,
        color: rgb(0.42, 0.45, 0.5),
      });
      if (secondaryLines.length > 0) {
        drawTextLines({
          page: state.page,
          lines: secondaryLines,
          font: fonts.italic,
          fontSize: 7.5,
          x: colX[0] + 6,
          y: textY + 1,
          lineHeight: 9,
          color: rgb(0.42, 0.45, 0.5),
        });
      }

      [row.contractValueLabel, row.progressLabel, row.totalLabel].forEach((value, index) => {
        const columnIndex = index + 1;
        const width = colWidths[columnIndex];
        const fontSize = 8.5;
        const textWidth = fonts.regular.widthOfTextAtSize(value, fontSize);
        state.page.drawText(value, {
          x: colX[columnIndex] + width - textWidth - 6,
          y: state.y - 12,
          size: fontSize,
          font: fonts.regular,
          color: rgb(0.19, 0.22, 0.27),
        });
      });

      state.y -= rowHeight;
    }
  }

  if (params.model.lineItems.length === 0) {
    if (state.y - 30 < PAGE_MARGIN_BOTTOM) {
      await advanceToNewTablePage();
    }
    state.page.drawText("No claimable line items.", {
      x: PAGE_MARGIN_X + CONTENT_WIDTH / 2 - fonts.regular.widthOfTextAtSize("No claimable line items.", 10) / 2,
      y: state.y - 16,
      size: 10,
      font: fonts.regular,
      color: rgb(0.39, 0.47, 0.55),
    });
    state.y -= 30;
  } else {
    await drawGroup("Quote Value", quotedRows);
    await drawGroup("Variations Value", variationRows);
  }

  const summaryBlockHeight = 210;
  if (state.y - summaryBlockHeight < PAGE_MARGIN_BOTTOM) {
    state = createPage(pdf);
    await drawPageHeader(state);
  }

  const leftColumnX = PAGE_MARGIN_X;
  const leftColumnWidth = CONTENT_WIDTH - 250;
  const rightColumnWidth = 232;
  const rightColumnX = PAGE_WIDTH - PAGE_MARGIN_X - rightColumnWidth;

  state.page.drawRectangle({
    x: leftColumnX,
    y: state.y - 18,
    width: leftColumnWidth,
    height: 18,
    color: brandColor,
  });
  state.page.drawText("PAYMENT DETAILS", {
    x: leftColumnX + 8,
    y: state.y - 12,
    size: 8.5,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const paymentLines = [
    params.model.organizationName ? `Company: ${params.model.organizationName}` : "",
    params.model.organizationContactName ? `Contact: ${params.model.organizationContactName}` : "",
    params.model.organizationContactPhone ? `Phone: ${params.model.organizationContactPhone}` : "",
    params.model.organizationContactEmail ? `Email: ${params.model.organizationContactEmail}` : "",
    params.model.organizationBusinessNumber ? `ABN / NZBN: ${params.model.organizationBusinessNumber}` : "",
    params.model.organizationBankAccountDetails ? `Bank Account Details: ${params.model.organizationBankAccountDetails}` : "",
    params.model.organizationGstNumber ? `GST Number: ${params.model.organizationGstNumber}` : "",
    "Thank you for your business!",
    params.model.legalNoticeText ?? "",
  ].filter(Boolean);

  drawTextLines({
    page: state.page,
    lines: paymentLines.flatMap((line) => wrapText({
      text: line,
      font: line === "Thank you for your business!" || line === params.model.legalNoticeText ? fonts.bold : fonts.regular,
      fontSize: 9.2,
      maxWidth: leftColumnWidth - 16,
    })),
    font: fonts.regular,
    fontSize: 9.2,
    x: leftColumnX + 8,
    y: state.y - 34,
    lineHeight: 12,
    color: rgb(0.22, 0.25, 0.32),
  });

  state.page.drawRectangle({
    x: rightColumnX,
    y: state.y - 18,
    width: rightColumnWidth,
    height: 18,
    color: brandColor,
  });
  state.page.drawText("CLAIM SUMMARY", {
    x: rightColumnX + 8,
    y: state.y - 12,
    size: 8.5,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const rightRows: Array<{ label: string; value: string; strong?: boolean; fillColor?: ReturnType<typeof rgb> | null; textColor?: ReturnType<typeof rgb> }> = [
    { label: "Original Contract", value: params.model.originalContractLabel },
    { label: "Approved Variations", value: params.model.approvedVariationsLabel },
    { label: "Revised Contract Value", value: params.model.revisedContractValueLabel },
    { label: "Value Earned to Date", value: params.model.valueEarnedToDateLabel },
    { label: "Less Previous Claims", value: `-${params.model.previousClaimsTotalLabel}` },
    { label: "Gross Current Claim (excl. GST)", value: params.model.grossCurrentClaimLabel },
    { label: "Less Retention (This Claim)", value: `-${params.model.retentionWithheldLabel}` },
    { label: "Retention Held to Date", value: params.model.retentionHeldToDateLabel },
    { label: "Net Current Claim (excl. GST)", value: params.model.netCurrentClaimLabel },
    { label: params.model.gstLabel, value: params.model.gstAmountLabel },
    { label: "Total (incl. GST)", value: params.model.totalPayableLabel, strong: true, fillColor: brandColor, textColor: rgb(1, 1, 1) },
  ];

  let summaryY = state.y - 34;
  for (const row of rightRows) {
    drawSummaryRow({
      page: state.page,
      x: rightColumnX,
      y: summaryY,
      width: rightColumnWidth,
      label: row.label,
      value: row.value,
      fonts,
      strong: row.strong,
      fillColor: row.fillColor ?? null,
      textColor: row.textColor,
    });
    summaryY -= 18;
  }

  state.y -= summaryBlockHeight;

  if (params.model.notes.trim()) {
    const noteLines = wrapText({
      text: params.model.notes.trim(),
      font: fonts.regular,
      fontSize: 9.5,
      maxWidth: CONTENT_WIDTH - 16,
    });
    const requiredHeight = 34 + noteLines.length * 12;
    if (state.y - requiredHeight < PAGE_MARGIN_BOTTOM) {
      state = createPage(pdf);
      await drawPageHeader(state);
    }

    state.page.drawText("Claim Notes", {
      x: PAGE_MARGIN_X,
      y: state.y,
      size: 10,
      font: fonts.bold,
      color: rgb(0.12, 0.16, 0.22),
    });
    drawTextLines({
      page: state.page,
      lines: noteLines,
      font: fonts.regular,
      fontSize: 9.5,
      x: PAGE_MARGIN_X,
      y: state.y - 16,
      lineHeight: 12,
      color: rgb(0.22, 0.25, 0.32),
    });
    state.y -= requiredHeight;
  }

  const pages = pdf.getPages();
  const footerLabel = `${params.model.organizationName} - ${params.model.projectName} - ${params.model.claimNumber || "Payment Claim"}`;
  pages.forEach((page, index) => {
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
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE_WIDTH - PAGE_MARGIN_X - fonts.regular.widthOfTextAtSize(pageLabel, 8),
      y: 8,
      size: 8,
      font: fonts.regular,
      color: rgb(0.41, 0.46, 0.53),
    });
  });

  return pdf.save();
}

async function fetchRequiredStatutoryPdf(params: {
  document: StatutoryDocument;
  fetchImpl: typeof fetch;
}) {
  const response = await params.fetchImpl(params.document.publicPath);
  if (!response.ok) {
    throw new Error(
      "Payment claim export could not be completed because the required New Zealand Form 1 notice could not be attached. No incomplete document was exported.",
    );
  }

  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    await PDFDocument.load(bytes);
    return bytes;
  } catch {
    throw new Error(
      "Payment claim export could not be completed because the required New Zealand Form 1 notice could not be attached. No incomplete document was exported.",
    );
  }
}

export async function composePaymentClaimPdfExport(params: {
  model: PaymentClaimPdfExportModel;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = params.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const statutoryDocuments = getPaymentClaimStatutoryDocuments({
    organisationCountry: params.model.organizationCountry,
  });

  const claimPdfBytes = await renderPaymentClaimDocument({
    model: params.model,
    fetchImpl,
  });

  if (statutoryDocuments.length === 0) {
    return {
      bytes: Uint8Array.from(claimPdfBytes),
      fileName: buildPaymentClaimPdfFileName(params.model.claimNumber),
      statutoryDocumentsIncluded: [] as StatutoryDocument[],
    };
  }

  const statutoryPdfParts: Uint8Array[] = [];
  for (const statutoryDocument of statutoryDocuments) {
    statutoryPdfParts.push(await fetchRequiredStatutoryPdf({
      document: statutoryDocument,
      fetchImpl,
    }));
  }

  const mergedBytes = await mergePdfDocuments(
    [
      Uint8Array.from(claimPdfBytes),
      ...statutoryPdfParts,
    ],
    paymentClaimPdfMetadata(params.model),
  );

  return {
    bytes: mergedBytes,
    fileName: buildPaymentClaimPdfFileName(params.model.claimNumber),
    statutoryDocumentsIncluded: statutoryDocuments,
  };
}

export function downloadPaymentClaimPdf(bytes: Uint8Array, fileName: string) {
  const safeBytes = Uint8Array.from(bytes);
  const blob = new Blob([safeBytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}
