import { supabase } from "./supabase";
import { calcLineAmount, calcTotals } from "./calc";

export type QuoteDocument = {
  id: string;
  business_id: string;
  client_id: string | null;
  type: string;
  status: string;
  number: string;
  issue_date?: string | null;
  due_date?: string | null;
  subtotal: number;
  gst: number;
  total: number;
  notes?: string | null;
  created_at: string;
};

export type QuoteItemInput = {
  description: string;
  qty: number;
  unit?: string | null;
  rate: number;
};

export async function listQuotes(businessId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, business_id, client_id, type, status, number, issue_date, due_date, subtotal, gst, total, notes, created_at"
    )
    .eq("business_id", businessId)
    .eq("type", "quote")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as QuoteDocument[];
}

export async function createQuote(
  businessId: string,
  clientId: string,
  notes: string,
  items: QuoteItemInput[]
) {
  const number = `Q-${Date.now()}`;
  const totals = calcTotals(items, 0.15);

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      business_id: businessId,
      client_id: clientId,
      type: "quote",
      status: "draft",
      number,
      subtotal: totals.subtotal,
      gst: totals.gst,
      total: totals.total,
      notes: notes?.trim() || null
    })
    .select("id, number")
    .single();

  if (error || !document) {
    throw new Error(error?.message ?? "Failed to create quote.");
  }

  const lineItems = items.map((item, index) => ({
    document_id: document.id,
    description: item.description.trim(),
    qty: item.qty,
    unit: item.unit ?? null,
    rate: item.rate,
    amount: calcLineAmount(item.qty, item.rate),
    sort_order: index + 1
  }));

  const { error: itemError } = await supabase.from("document_items").insert(lineItems);

  if (itemError) {
    throw new Error(itemError.message);
  }

  return document as { id: string; number: string };
}
