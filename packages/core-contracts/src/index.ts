/**
 * Package-foundation marker only.
 *
 * This is deliberately not a business or database contract. It proves that
 * the reference application can consume a private @tradesstack/* package
 * before any product functionality is moved behind package boundaries.
 */
export const CORE_CONTRACTS_PACKAGE_VERSION = "0.0.0" as const;

export type CoreContractsPackageMarker = typeof CORE_CONTRACTS_PACKAGE_VERSION;
