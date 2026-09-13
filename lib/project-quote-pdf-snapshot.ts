import type { LineItem, LineItemSection, PricingSummary } from "@/lib/quote-editor-core";

export type PersistedProjectQuotePdfRow = {
  assumptions: string;
  clarifications: string;
  client_email: string;
  client_name: string;
  client_phone: string;
  company_name: string;
  contact_person: string;
  contingency_amount: number;
  discount_amount: number;
  expiry_date: string | null;
  gst_amount: number;
  gst_percent: number;
  margin_amount: number;
  optional_subtotal: number;
  project_name: string;
  quote_date: string | null;
  quote_number: string;
  site_address: string;
  subtotal: number;
  terms_exclusions: string;
  terms_inclusions: string;
  total_quote_price: number;
};

export type PersistedProjectQuotePdfLineRow = {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  is_optional: boolean;
};

export function buildPersistedProjectQuotePdfSnapshot(
  quote: PersistedProjectQuotePdfRow,
  rows: PersistedProjectQuotePdfLineRow[],
) {
  const lineItems: LineItem[] = rows.map((row) => ({
    id: row.id,
    section: row.section as LineItemSection,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    rate: Number(row.rate),
    isOptional: row.is_optional,
  }));
  const pricingSummary: PricingSummary = {
    baseSubtotal: Number(quote.subtotal),
    optionalSubtotal: Number(quote.optional_subtotal),
    margin: Number(quote.margin_amount),
    contingency: Number(quote.contingency_amount),
    discount: Number(quote.discount_amount),
    gst: Number(quote.gst_amount),
    grandTotal: Number(quote.total_quote_price),
  };

  return {
    lineItems,
    pricingSummary,
    quoteDate: quote.quote_date ?? "",
    quoteNumber: quote.quote_number,
    projectName: quote.project_name,
    companyName: quote.company_name,
    clientName: quote.client_name,
    siteAddress: quote.site_address,
    contactPerson: quote.contact_person,
    email: quote.client_email,
    phone: quote.client_phone,
    expiryDate: quote.expiry_date ?? "",
    gstPercent: String(quote.gst_percent),
    termsInclusions: quote.terms_inclusions,
    termsExclusions: quote.terms_exclusions,
    clarifications: quote.clarifications,
    assumptions: quote.assumptions,
  };
}
