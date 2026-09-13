import type { DocumentSourcePart, InterpretationField, SourceEvidence } from "@/lib/document-intelligence/contracts";
import {
  MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION,
  type MaterialSupplierPricingPrice,
  type MaterialSupplierPricingRow,
  type MaterialSupplierPricingV1,
} from "@/lib/materials/supplier-pricing-intelligence/contract";
import { SOURCE_TAX_BASES, type SourceTaxBasis } from "@/lib/tax/types";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function confidence(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null; }

function locatorParts(value: unknown) {
  const locator = text(value) ?? "";
  const pageMatch = locator.match(/(?:^|;)page:(\d+)/i);
  const sheetMatch = locator.match(/(?:^|;)sheet:([^;]+)/i);
  const cellsMatch = locator.match(/(?:^|;)cells?:([^;]+)/i);
  return {
    page: pageMatch ? Number(pageMatch[1]) : null,
    sheet: sheetMatch?.[1]?.trim() || null,
    cellRange: cellsMatch?.[1]?.trim() || null,
  };
}

function decodedEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "string") return [entry];
    const [fieldName = "", state = "missing", rawConfidence = "0", sourcePartId = "", locator = "", ...excerpt] = entry.split("|");
    return [{ field: fieldName.trim(), state: state.trim().toLowerCase(), confidence: Number(rawConfidence), sourcePartId: sourcePartId.trim(), locator: locator.trim(), excerpt: excerpt.join("|").trim() }];
  });
}

function evidence(value: unknown, sourceIds: Set<string>): SourceEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return item.state !== "missing" && Boolean(text(item.sourcePartId));
  }).slice(0, 5).map((entry) => {
    const item = record(entry, "Evidence");
    const sourcePartId = text(item.sourcePartId);
    if (!sourcePartId || !sourceIds.has(sourcePartId)) throw new Error("Evidence references an unknown source part.");
    const locator = locatorParts(item.locator);
    return {
      sourcePartId,
      page: Number.isInteger(item.page) && Number(item.page) > 0 ? Number(item.page) : locator.page,
      sheet: text(item.sheet) ?? locator.sheet, cellRange: text(item.cellRange) ?? locator.cellRange, excerpt: text(item.excerpt),
      boundingRegion: Array.isArray(item.boundingRegion) && item.boundingRegion.every((n) => typeof n === "number" && Number.isFinite(n)) ? item.boundingRegion as number[] : null,
    };
  });
}

function wireField(container: Record<string, unknown>, name: string, type: "string" | "number", evidenceName = name) {
  const entries = decodedEvidence(container.evidence)
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).field === evidenceName);
  const primary = entries[0] ? record(entries[0], `${name} evidence`) : null;
  const raw = container[name];
  const hasValue = type === "string" ? Boolean(text(raw)) : typeof raw === "number" && Number.isFinite(raw) && (raw !== 0 || primary?.state === "found" || primary?.state === "inferred");
  const state = ["found", "inferred", "unreadable", "missing"].includes(String(primary?.state))
    ? primary!.state
    : hasValue ? "found" : "missing";
  return { value: raw, state, confidence: primary?.confidence ?? (hasValue ? 0.8 : 0), evidence: entries };
}

function expandWireContract(root: Record<string, unknown>) {
  if (typeof root.docTitle === "string") {
    const documentWire = { title: root.docTitle, extractedSupplierName: root.docSupplier, currency: root.docCurrency, effectiveFrom: root.docEffectiveFrom, validTo: root.docValidTo, evidence: root.documentEvidence };
    const rows = Array.isArray(root.rows) ? root.rows.map((rawRow) => {
      const item = record(rawRow, "Material pricing row");
      const rowWire = { ...item, proposedMaterialName: item.materialName, proposedMaterialDescription: item.materialDescription, supplierUnit: item.unit };
      const prices = Array.isArray(item.prices) ? item.prices.map((rawPrice) => {
        const priceItem = record(rawPrice, "Price");
        return {
          priceKey: priceItem.key,
          label: wireField(priceItem, "label", "string"), amount: wireField(priceItem, "amount", "number"), currency: wireField(priceItem, "currency", "string"),
          effectiveFrom: wireField(priceItem, "effectiveFrom", "string"), validTo: wireField(priceItem, "validTo", "string"),
          taxBasis: wireField(priceItem, "taxBasis", "string"), sourceTaxRate: wireField(priceItem, "sourceTaxRate", "number"),
        };
      }) : [];
      const recommendationEvidence = decodedEvidence(item.evidence).filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).field === "priceRecommendation");
      return {
        rowKey: item.rowKey,
        supplierDescription: wireField(rowWire, "supplierDescription", "string"), supplierSku: wireField(rowWire, "supplierSku", "string"),
        proposedMaterialName: wireField(rowWire, "proposedMaterialName", "string", "materialName"), proposedMaterialDescription: wireField(rowWire, "proposedMaterialDescription", "string", "materialDescription"),
        supplierUnit: wireField(rowWire, "supplierUnit", "string", "unit"), packQuantity: wireField(rowWire, "packQuantity", "number"), packUnit: wireField(rowWire, "packUnit", "string"),
        prices,
        priceRecommendation: { priceKey: item.recommendationKey, reason: item.recommendationReason, confidence: item.recommendationConfidence, evidence: recommendationEvidence },
        warnings: item.warnings,
      };
    }) : [];
    return {
      contractVersion: root.contractVersion,
      document: {
        title: wireField(documentWire, "title", "string", "docTitle"), extractedSupplierName: wireField(documentWire, "extractedSupplierName", "string", "docSupplier"),
        currency: wireField(documentWire, "currency", "string", "docCurrency"), effectiveFrom: wireField(documentWire, "effectiveFrom", "string", "docEffectiveFrom"), validTo: wireField(documentWire, "validTo", "string", "docValidTo"),
      },
      rows,
      warnings: root.warnings,
      extractionMeta: { method: root.method, sourcePartCount: 1, rowCount: rows.length, partial: root.partial },
    };
  }
  const document = record(root.document, "Document metadata");
  if (typeof document.title !== "string") return root;
  const rows = Array.isArray(root.rows) ? root.rows.map((rawRow) => {
    const item = record(rawRow, "Material pricing row");
    const prices = Array.isArray(item.prices) ? item.prices.map((rawPrice) => {
      const priceItem = record(rawPrice, "Price");
      return {
        priceKey: priceItem.priceKey,
        label: wireField(priceItem, "label", "string"), amount: wireField(priceItem, "amount", "number"),
        currency: wireField(priceItem, "currency", "string"), effectiveFrom: wireField(priceItem, "effectiveFrom", "string"), validTo: wireField(priceItem, "validTo", "string"),
        taxBasis: wireField(priceItem, "taxBasis", "string"), sourceTaxRate: wireField(priceItem, "sourceTaxRate", "number"),
      };
    }) : [];
    const recommendation = record(item.priceRecommendation, "Price recommendation");
    return {
      rowKey: item.rowKey,
      supplierDescription: wireField(item, "supplierDescription", "string"), supplierSku: wireField(item, "supplierSku", "string"),
      proposedMaterialName: wireField(item, "proposedMaterialName", "string"), proposedMaterialDescription: wireField(item, "proposedMaterialDescription", "string"),
      supplierUnit: wireField(item, "supplierUnit", "string"), packQuantity: wireField(item, "packQuantity", "number"), packUnit: wireField(item, "packUnit", "string"),
      prices,
      priceRecommendation: { priceKey: recommendation.priceKey, reason: recommendation.reason, confidence: recommendation.confidence, evidence: recommendation.evidence },
      warnings: item.warnings,
    };
  }) : [];
  return {
    ...root,
    document: {
      title: wireField(document, "title", "string"), extractedSupplierName: wireField(document, "extractedSupplierName", "string"),
      currency: wireField(document, "currency", "string"), effectiveFrom: wireField(document, "effectiveFrom", "string"), validTo: wireField(document, "validTo", "string"),
    },
    rows,
  };
}

function field<T extends string | number>(value: unknown, type: "string" | "number", sourceIds: Set<string>): InterpretationField<T> {
  const item = record(value, "Interpretation field");
  const states = new Set(["found", "inferred", "unreadable", "missing"]);
  if (!states.has(String(item.state))) throw new Error("Interpretation field has an invalid state.");
  let normalized: string | number | null = null;
  if (type === "string") normalized = text(item.value);
  else if (typeof item.value === "number" && Number.isFinite(item.value)) normalized = item.value;
  const state = item.state as InterpretationField<T>["state"];
  if (state === "missing" || state === "unreadable") normalized = null;
  return { value: normalized as T | null, state, confidence: state === "missing" || state === "unreadable" ? null : confidence(item.confidence), evidence: evidence(item.evidence, sourceIds) };
}

function warnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") {
      const [rawSeverity = "warning", code = "unspecified_warning", ...message] = entry.split("|");
      const severity = ["info", "warning", "error"].includes(rawSeverity) ? rawSeverity as "info" | "warning" | "error" : "warning";
      return { code: code || "unspecified_warning", severity, message: message.join("|").trim() || "Review this interpreted value." };
    }
    const item = record(entry, "Warning");
    const severity = ["info", "warning", "error"].includes(String(item.severity)) ? item.severity as "info" | "warning" | "error" : "warning";
    return { code: text(item.code) ?? "unspecified_warning", severity, message: text(item.message) ?? "Review this interpreted value." };
  });
}

function price(value: unknown, sourceIds: Set<string>): MaterialSupplierPricingPrice {
  const item = record(value, "Price");
  const priceKey = text(item.priceKey);
  if (!priceKey) throw new Error("Every price requires a stable priceKey.");
  const rawTaxBasis = item.taxBasis
    ? field<string>(item.taxBasis, "string", sourceIds)
    : { value: null, state: "missing" as const, confidence: null, evidence: [] };
  const taxBasisValue = SOURCE_TAX_BASES.includes(rawTaxBasis.value as SourceTaxBasis)
    ? rawTaxBasis.value as SourceTaxBasis
    : "unknown";
  const result = {
    priceKey,
    label: field<string>(item.label, "string", sourceIds),
    amount: field<number>(item.amount, "number", sourceIds),
    currency: field<string>(item.currency, "string", sourceIds),
    effectiveFrom: field<string>(item.effectiveFrom, "string", sourceIds),
    validTo: field<string>(item.validTo, "string", sourceIds),
    taxBasis: { ...rawTaxBasis, value: taxBasisValue } as MaterialSupplierPricingPrice["taxBasis"],
    sourceTaxRate: item.sourceTaxRate
      ? field<number>(item.sourceTaxRate, "number", sourceIds)
      : { value: null, state: "missing" as const, confidence: null, evidence: [] },
  };
  if (result.amount.value !== null && result.amount.value < 0) throw new Error("Price amounts cannot be negative.");
  return result;
}

function row(value: unknown, sourceIds: Set<string>): MaterialSupplierPricingRow {
  const item = record(value, "Material pricing row");
  const rowKey = text(item.rowKey);
  if (!rowKey) throw new Error("Every material pricing row requires a stable rowKey.");
  const prices = Array.isArray(item.prices) ? item.prices.map((entry) => price(entry, sourceIds)) : [];
  if (new Set(prices.map((entry) => entry.priceKey)).size !== prices.length) throw new Error(`Row ${rowKey} contains duplicate priceKey values.`);
  const recommendation = record(item.priceRecommendation, "Price recommendation");
  const recommendedKey = text(recommendation.priceKey);
  if (recommendedKey && !prices.some((entry) => entry.priceKey === recommendedKey)) throw new Error(`Row ${rowKey} recommends an unknown priceKey.`);
  return {
    rowKey,
    supplierDescription: field<string>(item.supplierDescription, "string", sourceIds), supplierSku: field<string>(item.supplierSku, "string", sourceIds),
    proposedMaterialName: field<string>(item.proposedMaterialName, "string", sourceIds), proposedMaterialDescription: field<string>(item.proposedMaterialDescription, "string", sourceIds),
    supplierUnit: field<string>(item.supplierUnit, "string", sourceIds), packQuantity: field<number>(item.packQuantity, "number", sourceIds), packUnit: field<string>(item.packUnit, "string", sourceIds),
    prices,
    priceRecommendation: { priceKey: recommendedKey, reason: text(recommendation.reason), confidence: confidence(recommendation.confidence), evidence: evidence(recommendation.evidence, sourceIds) },
    warnings: warnings(item.warnings),
  };
}

export function validateMaterialSupplierPricingV1(value: unknown, sourceParts: DocumentSourcePart[]): MaterialSupplierPricingV1 {
  const root = expandWireContract(record(value, "Material supplier pricing result"));
  if (root.contractVersion !== MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION) throw new Error("Unsupported Material supplier pricing contract version.");
  const sourceIds = new Set(sourceParts.map((part) => part.id));
  const document = record(root.document, "Document metadata");
  const rows = Array.isArray(root.rows) ? root.rows.map((entry) => row(entry, sourceIds)) : [];
  if (new Set(rows.map((entry) => entry.rowKey)).size !== rows.length) throw new Error("Material supplier pricing rows contain duplicate rowKey values.");
  const meta = record(root.extractionMeta, "Extraction metadata");
  const method = ["pdf", "spreadsheet", "csv", "image", "email"].includes(String(meta.method)) ? meta.method as MaterialSupplierPricingV1["extractionMeta"]["method"] : sourceParts[0]?.kind === "image" ? "image" : "pdf";
  return {
    contractVersion: MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION,
    document: { title: field<string>(document.title, "string", sourceIds), extractedSupplierName: field<string>(document.extractedSupplierName, "string", sourceIds), currency: field<string>(document.currency, "string", sourceIds), effectiveFrom: field<string>(document.effectiveFrom, "string", sourceIds), validTo: field<string>(document.validTo, "string", sourceIds) },
    rows,
    warnings: warnings(root.warnings),
    extractionMeta: { method, sourcePartCount: sourceParts.length, rowCount: rows.length, partial: Boolean(meta.partial) },
  };
}
