import type { XeroInvoice } from "@/lib/xero/types";

export type NormalizedXeroBillStatus =
  | "draft"
  | "awaiting_approval"
  | "awaiting_payment"
  | "partially_paid"
  | "paid"
  | "voided"
  | "deleted"
  | "unknown";

export type NormalizedXeroBillState = {
  rawStatus: string;
  normalizedStatus: NormalizedXeroBillStatus;
  amountPaid: number;
  amountDue: number;
  amountCredited: number;
  total: number;
};

const MONEY_TOLERANCE = 0.005;

function finiteMoney(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function normalizeXeroBillState(invoice: XeroInvoice): NormalizedXeroBillState {
  const rawStatus = String(invoice.Status ?? "").trim().toUpperCase() || "UNKNOWN";
  const amountPaid = finiteMoney(invoice.AmountPaid);
  const amountDue = finiteMoney(invoice.AmountDue);
  const amountCredited = finiteMoney(invoice.AmountCredited);
  const total = finiteMoney(invoice.Total);
  let normalizedStatus: NormalizedXeroBillStatus;

  if (rawStatus === "VOIDED") {
    normalizedStatus = "voided";
  } else if (rawStatus === "DELETED") {
    normalizedStatus = "deleted";
  } else if (rawStatus === "DRAFT") {
    normalizedStatus = "draft";
  } else if (rawStatus === "SUBMITTED") {
    normalizedStatus = "awaiting_approval";
  } else if (rawStatus === "PAID" || (total > MONEY_TOLERANCE && amountDue <= MONEY_TOLERANCE)) {
    normalizedStatus = "paid";
  } else if (rawStatus === "AUTHORISED" && amountPaid > MONEY_TOLERANCE && amountDue > MONEY_TOLERANCE) {
    normalizedStatus = "partially_paid";
  } else if (rawStatus === "AUTHORISED") {
    normalizedStatus = "awaiting_payment";
  } else {
    normalizedStatus = "unknown";
  }

  return { rawStatus, normalizedStatus, amountPaid, amountDue, amountCredited, total };
}

export function parseXeroDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const dotNetMatch = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(trimmed);
  const parsed = dotNetMatch ? Number(dotNetMatch[1]) : Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}
