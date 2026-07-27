const JURISDICTION_ALIASES = new Map<string, "NZ" | "AU">([
  ["NZ", "NZ"],
  ["NZL", "NZ"],
  ["NEW ZEALAND", "NZ"],
  ["AU", "AU"],
  ["AUS", "AU"],
  ["AUSTRALIA", "AU"],
]);

export type SupportedTaxJurisdiction = "NZ" | "AU";
export type TaxJurisdiction = SupportedTaxJurisdiction | "unsupported";

export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized.toUpperCase();
}

export function isNewZealandCountry(value: string | null | undefined): boolean {
  return resolveTaxJurisdiction(value) === "NZ";
}

export function isAustralianCountry(value: string | null | undefined): boolean {
  return resolveTaxJurisdiction(value) === "AU";
}

export function resolveTaxJurisdiction(value: string | null | undefined): TaxJurisdiction {
  const normalized = normalizeCountryCode(value);
  return (normalized ? JURISDICTION_ALIASES.get(normalized) : null) ?? "unsupported";
}
