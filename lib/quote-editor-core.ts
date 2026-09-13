import type { QuoteCommercialItemLink } from "@/lib/commercial-items/quote-linking";

export type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired";
export type LineItemSection = "Item" | "Materials" | "Labour" | "Plant" | "Subcontractors" | "Preliminaries";

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
  commercialItemLink?: QuoteCommercialItemLink | null;
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

export function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuoteRateDisplay(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

export function parseQuoteRateDraft(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function lineItemTotal(item: LineItem) {
  return item.quantity * item.rate;
}

export function isQuoteImmutable(params: {
  quoteId: string | null;
  status: QuoteStatus;
  awardLockedAt: string | null;
}) {
  return Boolean(params.awardLockedAt) || Boolean(params.quoteId && params.status !== "Draft");
}

export function toMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function toDayMonthYearLabel(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric" });
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
