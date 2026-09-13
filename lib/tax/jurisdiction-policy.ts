export type TaxJurisdictionCapability = {
  jurisdictionCode: string;
  taxName: string;
  supportsInclusiveExclusive: boolean;
};

const COUNTRY_ALIASES: Record<string, TaxJurisdictionCapability> = {
  NZ: { jurisdictionCode: "NZ", taxName: "GST", supportsInclusiveExclusive: true },
  NZL: { jurisdictionCode: "NZ", taxName: "GST", supportsInclusiveExclusive: true },
  "NEW ZEALAND": { jurisdictionCode: "NZ", taxName: "GST", supportsInclusiveExclusive: true },
  AU: { jurisdictionCode: "AU", taxName: "GST", supportsInclusiveExclusive: true },
  AUS: { jurisdictionCode: "AU", taxName: "GST", supportsInclusiveExclusive: true },
  AUSTRALIA: { jurisdictionCode: "AU", taxName: "GST", supportsInclusiveExclusive: true },
};

export function resolveTaxJurisdictionCapability(country: string | null | undefined): TaxJurisdictionCapability {
  const normalized = country?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
  return COUNTRY_ALIASES[normalized] ?? {
    jurisdictionCode: normalized || "unsupported",
    taxName: "Tax",
    supportsInclusiveExclusive: false,
  };
}
