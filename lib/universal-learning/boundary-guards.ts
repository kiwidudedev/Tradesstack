const FORBIDDEN_BOUNDARY_FIELDS = [
  "tradesstack_cost_code",
  "tradesstack_cost_code_label",
  "accounting_mapping_id",
  "organization_tradesstack_accounting_mappings",
  "postApprovedSupplierInvoiceActualCosts",
  "reverse_supplier_invoice_actual_cost_event",
  "ProjectFinancialsReport",
  "exports/",
] as const;

export function assertUniversalLearningWriteBoundary(value: string) {
  for (const forbidden of FORBIDDEN_BOUNDARY_FIELDS) {
    if (value.includes(forbidden)) {
      throw new Error(`Universal Construction Learning boundary violation: ${forbidden}`);
    }
  }
}

export function getUniversalLearningBoundaryContext() {
  return {
    routingIsImmutable: true as const,
    lockedFields: [
      "tradesstack_cost_code",
      "tradesstack_cost_code_label",
      "accounting_mapping_id",
      "organization_tradesstack_accounting_mappings",
    ],
    forbiddenOperationalChanges: [
      "supplier invoice posting",
      "actual cost posting",
      "reporting",
      "exports",
    ],
    lockedRoutingCodes: {
      "100": "Materials",
      "200": "Labour",
      "300": "Subcontractors",
      "400": "Plant & Equipment",
      "500": "Overheads",
      "600": "Payment Claims",
      "700": "Retentions",
      "800": "Others",
    },
  };
}
