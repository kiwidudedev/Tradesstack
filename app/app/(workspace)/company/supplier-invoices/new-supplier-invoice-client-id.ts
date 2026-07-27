"use client";

export function makeNewSupplierInvoiceClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `supplier-invoice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
