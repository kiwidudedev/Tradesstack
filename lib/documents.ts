import { supabase } from "./supabase";
import { calcLineAmount, calcTotals } from "./calc";

export type DocumentType = "quote" | "invoice" | "po";

export type LineItemInput = {
  description: string;
  qty: number;
  unit?: string | null;
  rate: number;
  sort_order?: number;
};

export type DocumentRow = {
  id: string;
  business_id: string;
  job_id: string;
  client_id: string | null;
  type: DocumentType;
  status: string;
  number: string;
  issue_date?: string | null;
  due_date?: string | null;
  subtotal: number;
  gst: number;
  total: number;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type DocumentWithItems = DocumentRow & {
  items: Array<{
    id: string;
    document_id: string;
    description: string;
    qty: number;
    unit?: string | null;
    rate: number;
    amount: number;
    sort_order: number;
    created_at?: string;
  }>;
};

const getNumberForType = (type: DocumentType) => {
  const stamp = Date.now();
  if (type === "invoice") return `INV-${stamp}`;
  if (type === "po") return `PO-${stamp}`;
  return `Q-${stamp}`;
};

export async function listDocuments(businessId: string, type: DocumentType) {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, business_id, job_id, client_id, type, status, number, issue_date, due_date, subtotal, gst, total, notes, created_at, updated_at"
    )
    .eq("business_id", businessId)
    .eq("type", type)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentRow[];
}

export async function listDocumentsByJobId(jobId: string, type: DocumentType) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, job_id, type, status, number, total, created_at")
    .eq("job_id", jobId)
    .eq("type", type)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Array<{
    id: string;
    job_id: string;
    type: DocumentType;
    status: string;
    number: string;
    total: number;
    created_at: string;
  }>;
}

type CreateDocumentParams = {
  businessId: string;
  jobId: string;
  clientId: string;
  type: DocumentType;
  notes: string;
  items: LineItemInput[];
  dueDate?: string | null;
  issueDate?: string | null;
};

export async function createDocumentWithItems(params: CreateDocumentParams) {
  const totals = calcTotals(params.items, 0.15);
  const number = getNumberForType(params.type);
  const issueDate = params.issueDate ?? new Date().toISOString().slice(0, 10);

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      business_id: params.businessId,
      job_id: params.jobId,
      client_id: params.clientId,
      type: params.type,
      status: "draft",
      number,
      issue_date: issueDate,
      due_date: params.dueDate ?? null,
      subtotal: totals.subtotal,
      gst: totals.gst,
      total: totals.total,
      notes: params.notes?.trim() || null
    })
    .select(
      "id, business_id, job_id, client_id, type, status, number, issue_date, due_date, subtotal, gst, total, notes, created_at, updated_at"
    )
    .single();

  if (error || !document) {
    throw new Error(error?.message ?? "Failed to create document.");
  }

  const lineItems = params.items.map((item, index) => ({
    document_id: document.id,
    description: item.description.trim(),
    qty: item.qty,
    unit: item.unit ?? null,
    rate: item.rate,
    amount: calcLineAmount(item.qty, item.rate),
    sort_order: item.sort_order ?? index + 1
  }));

  const { error: itemError } = await supabase.from("document_items").insert(lineItems);

  if (itemError) {
    throw new Error(itemError.message);
  }

  return document as DocumentRow;
}

export async function getDocumentWithItems(documentId: string) {
  const { data: document, error } = await supabase
    .from("documents")
    .select(
      "id, business_id, job_id, client_id, type, status, number, issue_date, due_date, subtotal, gst, total, notes, created_at, updated_at"
    )
    .eq("id", documentId)
    .single();

  if (error || !document) {
    throw new Error(error?.message ?? "Failed to load document.");
  }

  const { data: items, error: itemsError } = await supabase
    .from("document_items")
    .select("id, document_id, description, qty, unit, rate, amount, sort_order, created_at")
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  return { ...(document as DocumentRow), items: (items ?? []) as DocumentWithItems["items"] };
}

export async function convertQuoteToInvoice(quoteId: string): Promise<{ invoiceId: string }> {
  const { data: quote, error: quoteError } = await supabase
    .from("documents")
    .select(
      "id, business_id, job_id, client_id, type, status, number, issue_date, due_date, subtotal, gst, total, notes, created_at, updated_at"
    )
    .eq("id", quoteId)
    .eq("type", "quote")
    .single();

  if (quoteError || !quote) {
    throw new Error(quoteError?.message ?? "Failed to load quote.");
  }

  if (!quote.job_id) {
    throw new Error("Quote is missing a job.");
  }

  const { data: items, error: itemsError } = await supabase
    .from("document_items")
    .select("id, document_id, description, qty, unit, rate, amount, sort_order, created_at")
    .eq("document_id", quote.id)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const number = `INV-${Date.now()}`;
  const issueDate = new Date().toISOString().slice(0, 10);
  const noteSuffix = quote.number ? `Converted from ${quote.number}` : "Converted from quote";
  const notes = quote.notes ? `${quote.notes}\n${noteSuffix}` : noteSuffix;

  const { data: invoice, error: invoiceError } = await supabase
    .from("documents")
    .insert({
      business_id: quote.business_id,
      job_id: quote.job_id,
      client_id: quote.client_id,
      type: "invoice",
      status: "draft",
      number,
      issue_date: issueDate,
      due_date: null,
      subtotal: quote.subtotal,
      gst: quote.gst,
      total: quote.total,
      notes
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message ?? "Failed to create invoice.");
  }

  const lineItems = (items ?? []).map((item, index) => ({
    document_id: invoice.id,
    description: item.description,
    qty: item.qty,
    unit: item.unit ?? null,
    rate: item.rate,
    amount: item.amount ?? calcLineAmount(item.qty, item.rate),
    sort_order: item.sort_order ?? index + 1
  }));

  if (lineItems.length > 0) {
    const { error: itemInsertError } = await supabase.from("document_items").insert(lineItems);
    if (itemInsertError) {
      throw new Error(itemInsertError.message);
    }
  }

  return { invoiceId: invoice.id as string };
}
