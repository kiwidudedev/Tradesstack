import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 34;
const MARGIN_TOP = 32;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const DEFAULT_BRAND = "#0B2739";

export type RetentionClaimPdfAllocation = {
  id: string;
  sequence: number;
  originatingPaymentClaimId: string;
  paymentClaimNumber: string;
  paymentClaimDate: string | null;
  retentionOwnedAtSubmission: number;
  previouslyClaimed: number;
  claimedInThisRetentionClaim: number;
  remainingAfterAllocation: number;
};

export type RetentionClaimPdfModel = {
  schemaVersion: 1;
  organizationName: string;
  organizationBrandPrimaryColor: string | null;
  organizationBusinessNumber: string;
  organizationGstNumber: string;
  organizationContactName: string;
  organizationContactEmail: string;
  organizationContactPhone: string;
  projectName: string;
  projectLocation: string;
  clientCompanyName: string;
  clientContactName: string;
  claimId: string;
  claimNumber: string;
  title: string;
  reference: string | null;
  issueDate: string | null;
  dueDate: string | null;
  submittedAt: string;
  subtotalExclTax: number;
  submissionStateHash: string;
  submissionEligibilityStateHash: string | null;
  sourceEvidenceHash: string;
  allocations: RetentionClaimPdfAllocation[];
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

function pdfText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRetentionClaimPdfFileName(claimNumber: string) {
  const safe = sanitizeFilePart(claimNumber);
  return safe ? `Retention-Claim-${safe}.pdf` : "Retention-Claim.pdf";
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function date(value: string | null) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("en-NZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Pacific/Auckland",
      });
}

function brandColor(value: string | null) {
  const input = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : DEFAULT_BRAND;
  return rgb(
    Number.parseInt(input.slice(1, 3), 16) / 255,
    Number.parseInt(input.slice(3, 5), 16) / 255,
    Number.parseInt(input.slice(5, 7), 16) / 255,
  );
}

function width(font: PDFFont, value: string, size: number) {
  return font.widthOfTextAtSize(pdfText(value), size);
}

function drawRight(params: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  xRight: number;
  y: number;
  size?: number;
  color?: ReturnType<typeof rgb>;
}) {
  const size = params.size ?? 8;
  const text = pdfText(params.text);
  params.page.drawText(text, {
    x: params.xRight - width(params.font, text, size),
    y: params.y,
    size,
    font: params.font,
    color: params.color ?? rgb(0.16, 0.2, 0.27),
  });
}

function drawPageHeader(params: {
  page: PDFPage;
  fonts: Fonts;
  model: RetentionClaimPdfModel;
  color: ReturnType<typeof rgb>;
}) {
  params.page.drawRectangle({
    x: MARGIN_X,
    y: PAGE_HEIGHT - MARGIN_TOP - 4,
    width: CONTENT_WIDTH,
    height: 4,
    color: params.color,
  });
  params.page.drawText(pdfText(params.model.organizationName || "TradesStack"), {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 65,
    size: 17,
    font: params.fonts.bold,
    color: params.color,
  });
  drawRight({
    page: params.page,
    font: params.fonts.bold,
    text: "RETENTION CLAIM",
    xRight: PAGE_WIDTH - MARGIN_X,
    y: PAGE_HEIGHT - 61,
    size: 15,
    color: params.color,
  });
  drawRight({
    page: params.page,
    font: params.fonts.regular,
    text: params.model.claimNumber,
    xRight: PAGE_WIDTH - MARGIN_X,
    y: PAGE_HEIGHT - 78,
    size: 9,
    color: rgb(0.38, 0.43, 0.5),
  });
}

function drawFooter(params: {
  page: PDFPage;
  fonts: Fonts;
  model: RetentionClaimPdfModel;
  pageNumber: number;
  pageCount: number;
}) {
  params.page.drawLine({
    start: { x: MARGIN_X, y: 25 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 25 },
    thickness: 0.8,
    color: rgb(0.82, 0.84, 0.87),
  });
  params.page.drawText(
    pdfText(`Retention Claim ${params.model.claimNumber} | Immutable submitted evidence`),
    {
      x: MARGIN_X,
      y: 10,
      size: 7.5,
      font: params.fonts.regular,
      color: rgb(0.4, 0.45, 0.52),
    },
  );
  drawRight({
    page: params.page,
    font: params.fonts.regular,
    text: `Page ${params.pageNumber} of ${params.pageCount}`,
    xRight: PAGE_WIDTH - MARGIN_X,
    y: 10,
    size: 7.5,
    color: rgb(0.4, 0.45, 0.52),
  });
}

function drawLabelValue(params: {
  page: PDFPage;
  fonts: Fonts;
  label: string;
  value: string;
  x: number;
  y: number;
  valueWidth?: number;
}) {
  params.page.drawText(pdfText(params.label.toUpperCase()), {
    x: params.x,
    y: params.y,
    size: 7,
    font: params.fonts.bold,
    color: rgb(0.43, 0.48, 0.55),
  });
  const value = pdfText(params.value || "-");
  params.page.drawText(value.slice(0, params.valueWidth ?? 55), {
    x: params.x,
    y: params.y - 14,
    size: 9,
    font: params.fonts.regular,
    color: rgb(0.14, 0.18, 0.24),
  });
}

function drawAllocationTableHeader(page: PDFPage, fonts: Fonts, y: number) {
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 5,
    width: CONTENT_WIDTH,
    height: 23,
    color: rgb(0.94, 0.95, 0.96),
  });
  const labels = [
    { text: "Originating Payment Claim", x: MARGIN_X + 7 },
    { text: "Owned", x: 276 },
    { text: "Previously claimed", x: 348 },
    { text: "This claim", x: 441 },
    { text: "Remaining", x: 510 },
  ];
  for (const label of labels) {
    page.drawText(label.text, {
      x: label.x,
      y: y + 2,
      size: 6.8,
      font: fonts.bold,
      color: rgb(0.28, 0.33, 0.4),
    });
  }
}

export async function composeRetentionClaimPdf(
  model: RetentionClaimPdfModel,
): Promise<{ bytes: Uint8Array; fileName: string; pageCount: number }> {
  if (model.schemaVersion !== 1 || !model.submissionStateHash) {
    throw new Error("Retention Claim PDF requires immutable submitted evidence.");
  }
  if (model.allocations.length === 0) {
    throw new Error("Retention Claim PDF requires at least one submitted allocation.");
  }

  const pdf = await PDFDocument.create();
  const submittedDate = new Date(model.submittedAt);
  if (Number.isNaN(submittedDate.getTime())) {
    throw new Error("Retention Claim PDF has an invalid submission timestamp.");
  }
  pdf.setTitle(
    pdfText(
      `${model.organizationName} - ${model.projectName} - ${model.claimNumber}`,
    ),
  );
  pdf.setSubject("Submitted Retention Claim");
  pdf.setAuthor(pdfText(model.organizationName));
  pdf.setCreator("TradesStack");
  pdf.setProducer("TradesStack Retention Claim PDF v1");
  pdf.setCreationDate(submittedDate);
  pdf.setModificationDate(submittedDate);

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const color = brandColor(model.organizationBrandPrimaryColor);
  const allocationsPerFirstPage = 15;
  const allocationsPerContinuationPage = 25;
  const pages: PDFPage[] = [];
  let allocationIndex = 0;

  const firstPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(firstPage);
  drawPageHeader({ page: firstPage, fonts, model, color });

  firstPage.drawText(pdfText(model.title), {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 112,
    size: 15,
    font: fonts.bold,
    color: rgb(0.13, 0.17, 0.23),
  });
  firstPage.drawText(
    "This document claims retention previously withheld by the originating Payment Claims listed below.",
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 132,
      size: 8.5,
      font: fonts.regular,
      color: rgb(0.36, 0.41, 0.48),
    },
  );

  drawLabelValue({
    page: firstPage,
    fonts,
    label: "Project",
    value: model.projectName,
    x: MARGIN_X,
    y: PAGE_HEIGHT - 165,
  });
  drawLabelValue({
    page: firstPage,
    fonts,
    label: "Client",
    value: model.clientCompanyName || model.clientContactName || "-",
    x: 230,
    y: PAGE_HEIGHT - 165,
  });
  drawLabelValue({
    page: firstPage,
    fonts,
    label: "Reference",
    value: model.reference ?? "-",
    x: 418,
    y: PAGE_HEIGHT - 165,
  });
  drawLabelValue({
    page: firstPage,
    fonts,
    label: "Issue date",
    value: date(model.issueDate),
    x: MARGIN_X,
    y: PAGE_HEIGHT - 205,
  });
  drawLabelValue({
    page: firstPage,
    fonts,
    label: "Due date",
    value: date(model.dueDate),
    x: 230,
    y: PAGE_HEIGHT - 205,
  });
  drawLabelValue({
    page: firstPage,
    fonts,
    label: "Submitted",
    value: date(model.submittedAt),
    x: 418,
    y: PAGE_HEIGHT - 205,
  });

  let y = PAGE_HEIGHT - 260;
  drawAllocationTableHeader(firstPage, fonts, y);
  y -= 22;

  function drawAllocation(page: PDFPage, allocation: RetentionClaimPdfAllocation) {
    const claimLabel = pdfText(
      `${allocation.paymentClaimNumber}  ${date(allocation.paymentClaimDate)}`,
    ).slice(0, 49);
    page.drawText(claimLabel, {
      x: MARGIN_X + 7,
      y,
      size: 8,
      font: fonts.regular,
      color: rgb(0.16, 0.2, 0.27),
    });
    drawRight({
      page,
      font: fonts.regular,
      text: money(allocation.retentionOwnedAtSubmission),
      xRight: 337,
      y,
      size: 7.7,
    });
    drawRight({
      page,
      font: fonts.regular,
      text: money(allocation.previouslyClaimed),
      xRight: 430,
      y,
      size: 7.7,
    });
    drawRight({
      page,
      font: fonts.bold,
      text: money(allocation.claimedInThisRetentionClaim),
      xRight: 501,
      y,
      size: 7.7,
    });
    drawRight({
      page,
      font: fonts.regular,
      text: money(allocation.remainingAfterAllocation),
      xRight: PAGE_WIDTH - MARGIN_X - 6,
      y,
      size: 7.7,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: y - 7 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: y - 7 },
      thickness: 0.4,
      color: rgb(0.88, 0.89, 0.91),
    });
    y -= 23;
  }

  while (
    allocationIndex < model.allocations.length
    && allocationIndex < allocationsPerFirstPage
  ) {
    drawAllocation(firstPage, model.allocations[allocationIndex]);
    allocationIndex += 1;
  }

  while (allocationIndex < model.allocations.length) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawPageHeader({ page, fonts, model, color });
    y = PAGE_HEIGHT - 116;
    drawAllocationTableHeader(page, fonts, y);
    y -= 22;
    const pageEnd = Math.min(
      allocationIndex + allocationsPerContinuationPage,
      model.allocations.length,
    );
    while (allocationIndex < pageEnd) {
      drawAllocation(page, model.allocations[allocationIndex]);
      allocationIndex += 1;
    }
  }

  let summaryPage = pages[pages.length - 1];
  if (y < 150) {
    summaryPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(summaryPage);
    drawPageHeader({ page: summaryPage, fonts, model, color });
    y = PAGE_HEIGHT - 125;
  }

  summaryPage.drawRectangle({
    x: 337,
    y: y - 12,
    width: PAGE_WIDTH - MARGIN_X - 337,
    height: 49,
    color: rgb(0.94, 0.95, 0.96),
  });
  summaryPage.drawText("RETENTION CLAIM SUBTOTAL (EXCL. TAX)", {
    x: 347,
    y: y + 12,
    size: 7.5,
    font: fonts.bold,
    color: rgb(0.3, 0.35, 0.42),
  });
  drawRight({
    page: summaryPage,
    font: fonts.bold,
    text: money(model.subtotalExclTax),
    xRight: PAGE_WIDTH - MARGIN_X - 10,
    y: y - 2,
    size: 13,
    color,
  });
  summaryPage.drawText(
    "Tax invoice and accounting synchronization are separate workflows.",
    {
      x: MARGIN_X,
      y: y - 34,
      size: 7.5,
      font: fonts.regular,
      color: rgb(0.4, 0.45, 0.52),
    },
  );
  summaryPage.drawText(
    pdfText(`Evidence hash: ${model.sourceEvidenceHash}`),
    {
      x: MARGIN_X,
      y: y - 51,
      size: 6.7,
      font: fonts.regular,
      color: rgb(0.45, 0.49, 0.55),
    },
  );

  pages.forEach((page, index) => {
    drawFooter({
      page,
      fonts,
      model,
      pageNumber: index + 1,
      pageCount: pages.length,
    });
  });

  return {
    bytes: Uint8Array.from(await pdf.save({ useObjectStreams: false })),
    fileName: buildRetentionClaimPdfFileName(model.claimNumber),
    pageCount: pages.length,
  };
}
