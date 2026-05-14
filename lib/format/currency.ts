const operationalFormatters = new Map<number, Intl.NumberFormat>();
const documentFormatters = new Map<number, Intl.NumberFormat>();

function getFormatter(
  cache: Map<number, Intl.NumberFormat>,
  decimals: number,
  currencyDisplay: "narrowSymbol" | "symbol",
): Intl.NumberFormat {
  let formatter = cache.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
      currencyDisplay,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    cache.set(decimals, formatter);
  }
  return formatter;
}

/**
 * Currency formatter for operational UI surfaces — dashboards, KPI cards,
 * tables, boards, summaries.
 *
 * Renders without the country prefix: `$33,235` by default, or `$33,235.00`
 * when called with `{ decimals: 2 }`.
 *
 * Defaults to 0 decimals so KPI cards stay scannable. Pass `{ decimals: 2 }`
 * in detail tables, editable financial forms, and other precision contexts
 * (claims, purchase orders, variations, invoices on screen).
 */
export function formatMoneyOperational(
  value: number,
  options?: { decimals?: 0 | 2 },
): string {
  return getFormatter(operationalFormatters, options?.decimals ?? 0, "narrowSymbol").format(value);
}

/**
 * Currency formatter for documents — invoices, PDFs, exports, print layouts,
 * accounting and compliance outputs.
 *
 * Renders with the explicit NZ currency prefix: `NZ$33,235.00` by default.
 * Use this anywhere the output represents a financial document rather than
 * operational UI.
 */
export function formatMoneyDocument(
  value: number,
  options?: { decimals?: 0 | 2 },
): string {
  return getFormatter(documentFormatters, options?.decimals ?? 2, "symbol").format(value);
}
