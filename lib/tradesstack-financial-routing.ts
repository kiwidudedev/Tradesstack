export const TRADESSTACK_FINANCIAL_ROUTING_CODES = [
  { code: "100", label: "Materials" },
  { code: "200", label: "Labour" },
  { code: "300", label: "Subcontractors" },
  { code: "400", label: "Plant & Equipment" },
  { code: "500", label: "Overheads" },
  { code: "600", label: "Payment Claims" },
  { code: "700", label: "Retentions" },
  { code: "800", label: "Others" },
] as const;

export type TradesstackFinancialRoutingCode =
  (typeof TRADESSTACK_FINANCIAL_ROUTING_CODES)[number]["code"];

export type TradesstackFinancialRoutingLabel =
  (typeof TRADESSTACK_FINANCIAL_ROUTING_CODES)[number]["label"];

export type FinancialRoutingReviewStatus =
  | "auto_approved"
  | "needs_routing_review"
  | "needs_accounting_mapping"
  | "high_value_review"
  | "resolved";

export type FinancialRoutingSource =
  | "material_library"
  | "material_import"
  | "supplier_invoice"
  | "payment_claim"
  | "retention_workflow"
  | "plant_hire"
  | "labour_context"
  | "subcontract_context"
  | "user_override"
  | "rules"
  | "ai_fallback";

export type FinancialRoutingResult = {
  tradesstackCostCode: TradesstackFinancialRoutingCode;
  tradesstackCostCodeLabel: TradesstackFinancialRoutingLabel;
  confidence: number;
  source: FinancialRoutingSource;
  reviewStatus: FinancialRoutingReviewStatus;
  reviewReason: string | null;
  evidence: string[];
};

type ExplicitRoutingMatch = {
  code: TradesstackFinancialRoutingCode;
  label: TradesstackFinancialRoutingLabel;
  evidence: string[];
  confidence: number;
  source: FinancialRoutingSource;
};

const LABEL_BY_CODE = new Map<string, TradesstackFinancialRoutingLabel>(
  TRADESSTACK_FINANCIAL_ROUTING_CODES.map((entry) => [entry.code, entry.label])
);

const CODE_SET = new Set<string>(TRADESSTACK_FINANCIAL_ROUTING_CODES.map((entry) => entry.code));

export function listTradesstackFinancialRoutingCodes() {
  return TRADESSTACK_FINANCIAL_ROUTING_CODES.slice();
}

export function isTradesstackFinancialRoutingCode(value: unknown): value is TradesstackFinancialRoutingCode {
  return typeof value === "string" && CODE_SET.has(value);
}

export function coerceTradesstackFinancialRoutingCode(
  value: unknown
): TradesstackFinancialRoutingCode | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = String(value);
    return isTradesstackFinancialRoutingCode(normalized) ? normalized : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return isTradesstackFinancialRoutingCode(normalized) ? normalized : null;
  }

  return null;
}

export function assertTradesstackFinancialRoutingCode(value: unknown): TradesstackFinancialRoutingCode {
  if (!isTradesstackFinancialRoutingCode(value)) {
    throw new Error("Invalid TradesStack financial routing code.");
  }

  return value;
}

export function getTradesstackFinancialRoutingLabel(
  code: TradesstackFinancialRoutingCode | null | undefined
): TradesstackFinancialRoutingLabel | null {
  if (typeof code !== "string") {
    return null;
  }

  return LABEL_BY_CODE.get(code) ?? null;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isLikelyPlantDescription(description: string) {
  return /\b(scaffold|scaffolding|crane|lift hire|plant hire|telehandler|excavator|equipment hire|generator hire)\b/i.test(description);
}

function isLikelyRetentionDescription(description: string) {
  return /\b(retention|retained|holdback|release of retention)\b/i.test(description);
}

function isLikelyPaymentClaimDescription(description: string) {
  return /\b(payment claim|progress claim|claim schedule)\b/i.test(description);
}

function isLikelyOverheadDescription(description: string) {
  return /\b(prelim|preliminary|site office|admin|insurance|permit|compliance|office)\b/i.test(description);
}

function isLikelyLabourDescription(description: string) {
  return /\b(labour|labor|install|installation|crew|hours|hourly|timesheet)\b/i.test(description);
}

function isLikelySubcontractDescription(description: string) {
  return /\b(subcontract|subbie|subcontractor|vendor package|by others)\b/i.test(description);
}

function isLikelyMaterialDescription(description: string) {
  return /\b(material|materials|product|products|supply|supplied|sheet|sheets|stud|studs|track|tracks|cladding|plasterboard|gib|coloursteel|timber|panel|panels)\b/i.test(
    description
  );
}

function buildHighValueAwareResult(params: {
  code: TradesstackFinancialRoutingCode;
  confidence: number;
  source: FinancialRoutingSource;
  evidence: string[];
  highValue: boolean;
}) {
  return buildRouted(
    params.code,
    params.confidence,
    params.source,
    params.evidence,
    params.highValue
  );
}

function matchExplicitRoutingLabel(values: Array<string | null | undefined>): ExplicitRoutingMatch | null {
  for (const rawValue of values) {
    const normalized = normalizeText(rawValue);
    if (!normalized) {
      continue;
    }

    if (["materials", "material"].includes(normalized)) {
      return {
        code: "100",
        label: "Materials",
        evidence: [`explicit:${normalized}`],
        confidence: 0.99,
        source: "rules",
      };
    }

    if (["labour", "labor"].includes(normalized)) {
      return {
        code: "200",
        label: "Labour",
        evidence: [`explicit:${normalized}`],
        confidence: 0.99,
        source: "labour_context",
      };
    }

    if (
      ["subcontractor", "sub contractor", "subcontractors", "sub contractors", "subbie", "subbies"].includes(normalized)
    ) {
      return {
        code: "300",
        label: "Subcontractors",
        evidence: [`explicit:${normalized}`],
        confidence: 0.99,
        source: "subcontract_context",
      };
    }

    if (
      [
        "plant",
        "equipment",
        "plant & equipment",
        "plant and equipment",
        "scaffold",
        "scaffolding",
      ].includes(normalized)
    ) {
      return {
        code: "400",
        label: "Plant & Equipment",
        evidence: [`explicit:${normalized}`],
        confidence: 0.99,
        source: "plant_hire",
      };
    }

    if (
      [
        "overhead",
        "overheads",
        "preliminaries",
        "preliminary",
        "general expenses",
        "general expense",
        "margin",
        "admin",
        "administration",
      ].includes(normalized)
    ) {
      return {
        code: "500",
        label: "Overheads",
        evidence: [`explicit:${normalized}`],
        confidence: 0.97,
        source: "rules",
      };
    }

    if (
      ["payment claim", "payment claims", "progress claim", "progress claims", "claim schedule"].includes(
        normalized
      )
    ) {
      return {
        code: "600",
        label: "Payment Claims",
        evidence: [`explicit:${normalized}`],
        confidence: 0.99,
        source: "payment_claim",
      };
    }

    if (["retention", "retentions", "retention release", "holdback"].includes(normalized)) {
      return {
        code: "700",
        label: "Retentions",
        evidence: [`explicit:${normalized}`],
        confidence: 0.99,
        source: "retention_workflow",
      };
    }

    if (["others", "other", "unknown"].includes(normalized)) {
      return {
        code: "800",
        label: "Others",
        evidence: [`explicit:${normalized}`],
        confidence: 0.8,
        source: "rules",
      };
    }
  }

  return null;
}

export function routeFinancialRecord(params: {
  sourceModule?: string | null;
  documentType?: string | null;
  transactionType?: string | null;
  objectType?: string | null;
  supplierName?: string | null;
  title?: string | null;
  description?: string | null;
  amount?: number | null;
  userOverrideCode?: TradesstackFinancialRoutingCode | null;
}) : FinancialRoutingResult {
  if (params.userOverrideCode) {
    return {
      tradesstackCostCode: params.userOverrideCode,
      tradesstackCostCodeLabel: getTradesstackFinancialRoutingLabel(params.userOverrideCode) ?? "Others",
      confidence: 1,
      source: "user_override",
      reviewStatus: "resolved",
      reviewReason: null,
      evidence: ["user_override"],
    };
  }

  const sourceModule = normalizeText(params.sourceModule);
  const documentType = normalizeText(params.documentType);
  const transactionType = normalizeText(params.transactionType);
  const objectType = normalizeText(params.objectType);
  const supplierName = normalizeText(params.supplierName);
  const description = normalizeText([params.title, params.description].filter(Boolean).join(" "));
  const highValue = typeof params.amount === "number" && Number.isFinite(params.amount) && params.amount >= 25000;

  if (sourceModule.includes("materials") || objectType.includes("material")) {
    return buildRouted("100", 0.98, sourceModule.includes("import") ? "material_import" : "material_library", ["material_context"], highValue);
  }

  if (documentType.includes("payment_claim") || transactionType.includes("payment_claim") || isLikelyPaymentClaimDescription(description)) {
    return buildRouted("600", 0.97, "payment_claim", ["payment_claim_context"], highValue);
  }

  if (transactionType.includes("retention") || isLikelyRetentionDescription(description)) {
    return buildRouted("700", 0.97, "retention_workflow", ["retention_context"], highValue);
  }

  if (isLikelyPlantDescription(description)) {
    return buildRouted("400", 0.92, "plant_hire", ["plant_description"], highValue);
  }

  if (sourceModule.includes("timesheet") || objectType.includes("labour_rate") || isLikelyLabourDescription(description)) {
    return buildRouted("200", 0.92, "labour_context", ["labour_context"], highValue);
  }

  if (sourceModule.includes("supplier_invoice") && (supplierName.includes("hire") || isLikelySubcontractDescription(description))) {
    return buildRouted("300", 0.88, "subcontract_context", ["supplier_invoice_context"], highValue);
  }

  if (isLikelyOverheadDescription(description)) {
    return buildRouted("500", 0.82, "rules", ["overhead_description"], highValue);
  }

  return {
    tradesstackCostCode: "800",
    tradesstackCostCodeLabel: "Others",
    confidence: 0.35,
    source: "ai_fallback",
    reviewStatus: highValue ? "high_value_review" : "needs_routing_review",
    reviewReason: highValue ? "High-value item needs routing review." : "Routing context was ambiguous.",
    evidence: ["ambiguous_context"],
  };
}

export function routeFinancialLineItem(params: {
  sourceDocumentKind?: string | null;
  sourceLineTable?: string | null;
  originKind?: string | null;
  sourceModule?: string | null;
  documentType?: string | null;
  transactionType?: string | null;
  objectType?: string | null;
  itemType?: string | null;
  category?: string | null;
  section?: string | null;
  title?: string | null;
  description?: string | null;
  supplierName?: string | null;
  amount?: number | null;
  userOverrideCode?: TradesstackFinancialRoutingCode | null;
}): FinancialRoutingResult {
  if (params.userOverrideCode) {
    return routeFinancialRecord({
      userOverrideCode: params.userOverrideCode,
      amount: params.amount,
    });
  }

  const highValue =
    typeof params.amount === "number" && Number.isFinite(params.amount) && params.amount >= 25000;
  const sourceDocumentKind = normalizeText(params.sourceDocumentKind);
  const originKind = normalizeText(params.originKind);
  const explicitMatch = matchExplicitRoutingLabel([
    params.category,
    params.section,
    params.itemType,
    params.objectType,
    params.transactionType,
  ]);

  if (sourceDocumentKind === "project_claim") {
    return buildHighValueAwareResult({
      code: "600",
      confidence: 0.99,
      source: "payment_claim",
      evidence: ["source_document:project_claim"],
      highValue,
    });
  }

  if (originKind === "time_sheet_sync") {
    return buildHighValueAwareResult({
      code: "200",
      confidence: 0.99,
      source: "labour_context",
      evidence: ["origin_kind:time_sheet_sync"],
      highValue,
    });
  }

  if (explicitMatch) {
    return buildHighValueAwareResult({
      code: explicitMatch.code,
      confidence: explicitMatch.confidence,
      source: explicitMatch.source,
      evidence: explicitMatch.evidence,
      highValue,
    });
  }

  const description = normalizeText([params.title, params.description].filter(Boolean).join(" "));
  if (description && isLikelySubcontractDescription(description) && isLikelyLabourDescription(description)) {
    return buildHighValueAwareResult({
      code: "300",
      confidence: 0.94,
      source: "subcontract_context",
      evidence: ["description:supply_install_package"],
      highValue,
    });
  }

  if (description && isLikelyLabourDescription(description)) {
    return buildHighValueAwareResult({
      code: "200",
      confidence: 0.92,
      source: "labour_context",
      evidence: ["description:labour_signal"],
      highValue,
    });
  }

  if (description && isLikelyMaterialDescription(description)) {
    return buildHighValueAwareResult({
      code: "100",
      confidence: 0.88,
      source: "rules",
      evidence: ["description:material_signal"],
      highValue,
    });
  }

  return routeFinancialRecord({
    sourceModule: params.sourceModule,
    documentType: params.documentType ?? params.sourceDocumentKind,
    transactionType: params.transactionType,
    objectType: params.objectType ?? params.sourceLineTable,
    supplierName: params.supplierName,
    title: params.title,
    description: params.description,
    amount: params.amount,
  });
}

function buildRouted(
  code: TradesstackFinancialRoutingCode,
  confidence: number,
  source: FinancialRoutingSource,
  evidence: string[],
  highValue: boolean
): FinancialRoutingResult {
  return {
    tradesstackCostCode: code,
    tradesstackCostCodeLabel: getTradesstackFinancialRoutingLabel(code) ?? "Others",
    confidence,
    source,
    reviewStatus: highValue ? "high_value_review" : "auto_approved",
    reviewReason: highValue ? "High-value item requires reviewer acknowledgement." : null,
    evidence,
  };
}
