import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import type { PricingWorksheetAiProvider } from "@/lib/ai/providers/pricing-worksheet/provider";
import type { PricingWorksheetAiEvidenceSource } from "@/lib/pricing-worksheet-edit-plan";
import {
  createPricingWorksheetProviderError,
  isPricingWorksheetProviderError,
  type PricingWorksheetProviderCitation,
  type PricingWorksheetProviderRequest,
  type PricingWorksheetProviderResponse,
} from "@/lib/ai/providers/pricing-worksheet/types";
import { extractBalancedJsonObject } from "@/lib/ai/providers/pricing-worksheet/openai-provider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
} as const;
const MAX_ANTHROPIC_SERVER_TOOL_CONTINUATIONS = 3;
const RETRYABLE_PROVIDER_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const ANTHROPIC_UNSUPPORTED_REMOVABLE_SCHEMA_KEYWORDS = new Set(["maxItems", "minItems"]);
const ANTHROPIC_ALLOWED_SCHEMA_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "enum",
  "items",
  "anyOf",
  "oneOf",
  "allOf",
  "description",
  "additionalProperties",
  "title",
  "$defs",
  "definitions",
]);
const MAX_ANTHROPIC_SCHEMA_SIZE_BYTES = 50_000;
const MAX_ANTHROPIC_OPTIONAL_PARAMETER_COUNT = 24;
const SUPPORTED_OPERATION_TYPES = [
  "update_cell",
  "update_cells",
  "insert_row",
  "copy_row_variant",
  "fix_formula",
  "explain_formula",
  "insert_subtotal",
  "format_cell",
  "format_cells",
] as const;
const ANTHROPIC_MUTATION_INTENTS = new Set([
  "worksheet_generation",
  "worksheet_edit",
  "formula_generate",
  "formula_fix",
  "quantity_update",
  "labour_adjustment",
  "wastage_adjustment",
  "margin_adjustment",
]);

type AnthropicResponseFailureReason =
  | "provider_returned_empty_response"
  | "missing_structured_output"
  | "malformed_json"
  | "truncated_json"
  | "unsupported_provider_shape";

type AnthropicSchemaKeywordIssue = {
  keyword: string;
  path: string;
};

type AnthropicFreeFormObjectIssue = {
  path: string;
  additionalProperties: unknown;
};

type AnthropicSchemaKind =
  | "draft_generation"
  | "formula_generation"
  | "formatting_generation"
  | "review_generation"
  | "compact_edit_intent"
  | "worksheet_pricing_pattern_shadow_proposals"
  | "worksheet_memory_synthesis"
  | "cost_construction_intelligence"
  | "worksheet_event_interpretation"
  | "answer_only";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logAnthropicProviderDebug(action: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[pricing-worksheet-anthropic-provider]", {
    action,
    ...payload,
  });
}

function isJsonSchemaPrimitiveType(value: unknown): value is string {
  return (
    value === "string" ||
    value === "number" ||
    value === "integer" ||
    value === "boolean" ||
    value === "object" ||
    value === "array" ||
    value === "null"
  );
}

function inferSchemaTypeForEnumValue(value: unknown, allowedTypes: string[]): string | null {
  if (value === null) {
    return allowedTypes.includes("null") ? "null" : null;
  }

  if (typeof value === "string") {
    return allowedTypes.includes("string") ? "string" : null;
  }

  if (typeof value === "boolean") {
    return allowedTypes.includes("boolean") ? "boolean" : null;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && allowedTypes.includes("integer")) {
      return "integer";
    }
    if (allowedTypes.includes("number")) {
      return "number";
    }
    return null;
  }

  if (Array.isArray(value)) {
    return allowedTypes.includes("array") ? "array" : null;
  }

  if (isRecord(value)) {
    return allowedTypes.includes("object") ? "object" : null;
  }

  return null;
}

function sanitizeAnthropicSchemaNode(node: unknown, path: string): unknown {
  if (Array.isArray(node)) {
    return node.map((entry, index) => sanitizeAnthropicSchemaNode(entry, `${path}[${index}]`));
  }

  if (!isRecord(node)) {
    return node;
  }

  const sanitizedEntries = Object.entries(node).map(([key, value]) => [
    key,
    sanitizeAnthropicSchemaNode(value, `${path}.${key}`),
  ]);
  const sanitizedNode = Object.fromEntries(sanitizedEntries) as Record<string, unknown>;

  if (!Array.isArray(sanitizedNode.enum)) {
    const typeValue = sanitizedNode.type;
    if (!Array.isArray(typeValue)) {
      return sanitizedNode;
    }

    const allowedTypes = typeValue.filter(isJsonSchemaPrimitiveType);
    const nonNullAllowedTypes = allowedTypes.filter((entry) => entry !== "null");
    if (nonNullAllowedTypes.length >= 1) {
      return {
        ...sanitizedNode,
        type: nonNullAllowedTypes[0],
      };
    }

    return {
      ...sanitizedNode,
      type: "string",
    };
  }

  const enumValues = sanitizedNode.enum;
  const typeValue = sanitizedNode.type;
  const allowedTypes = Array.isArray(typeValue)
    ? typeValue.filter(isJsonSchemaPrimitiveType)
    : typeof typeValue === "string" && isJsonSchemaPrimitiveType(typeValue)
      ? [typeValue]
      : [];

  if (allowedTypes.length === 0) {
    return sanitizedNode;
  }

  const enumGroups = new Map<string, unknown[]>();
  for (const enumValue of enumValues) {
    const compatibleType = inferSchemaTypeForEnumValue(enumValue, allowedTypes);
    if (!compatibleType) {
      throw createPricingWorksheetProviderError({
        code: "provider_schema_validation_failed",
        provider: "anthropic",
        model: "",
        retryable: false,
        message: `Anthropic schema preflight failed at ${path}: enum value does not match declared type.`,
        rawError: {
          path,
          type: typeValue,
          enumValue,
        },
      });
    }

    const existingValues = enumGroups.get(compatibleType) ?? [];
    existingValues.push(enumValue);
    enumGroups.set(compatibleType, existingValues);
  }

  if (!Array.isArray(typeValue)) {
    if (enumGroups.size > 1) {
      throw createPricingWorksheetProviderError({
        code: "provider_schema_validation_failed",
        provider: "anthropic",
        model: "",
        retryable: false,
        message: `Anthropic schema preflight failed at ${path}: enum values span multiple types.`,
        rawError: {
          path,
          type: typeValue,
          enum: enumValues,
        },
      });
    }
    return sanitizedNode;
  }

  const nonNullEnumValues = enumValues.filter((entry) => entry !== null);
  if (nonNullEnumValues.length === 0) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: `Anthropic schema preflight failed at ${path}: nullable enum has no non-null values to send.`,
      rawError: {
        path,
        type: typeValue,
        enum: enumValues,
      },
    });
  }

  const nonNullEnumTypes = Array.from(enumGroups.keys()).filter((entry) => entry !== "null");
  if (nonNullEnumTypes.length === 1) {
    return {
      ...sanitizedNode,
      type: nonNullEnumTypes[0],
      enum: nonNullEnumValues,
    };
  }

  const { type: _type, ...rest } = sanitizedNode;
  return {
    ...rest,
    enum: nonNullEnumValues,
  };
}

function collectAnthropicFreeFormObjectIssues(node: unknown, path = "$"): AnthropicFreeFormObjectIssue[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectAnthropicFreeFormObjectIssues(entry, `${path}[${index}]`));
  }

  if (!isRecord(node)) {
    return [];
  }

  const issues: AnthropicFreeFormObjectIssue[] = [];
  if (node.type === "object" && node.additionalProperties === true) {
    issues.push({
      path,
      additionalProperties: node.additionalProperties,
    });
  }

  return issues.concat(
    Object.entries(node).flatMap(([key, value]) => collectAnthropicFreeFormObjectIssues(value, `${path}.${key}`)),
  );
}

export function sanitizeAnthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeAnthropicSchemaNode(schema, "$");
  if (!isRecord(sanitized)) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: "Anthropic schema preflight failed: root schema must be an object.",
      rawError: { schema },
    });
  }
  return sanitized;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildAnthropicOperationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "target", "values", "formulas", "format", "rationale"],
    properties: {
      type: {
        type: "string",
        enum: [...SUPPORTED_OPERATION_TYPES],
      },
      target: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "cell",
              "cells",
              "row",
              "sourceRow",
              "insertAfterRow",
              "insertBeforeRow",
              "startRow",
              "endRow",
              "sectionName",
              "totalColumn",
              "labelColumn",
            ],
            properties: {
              cell: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              cells: {
                anyOf: [{ type: "null" }, { type: "array", items: { type: "string" } }],
              },
              row: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              sourceRow: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              insertAfterRow: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              insertBeforeRow: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              startRow: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              endRow: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              sectionName: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              totalColumn: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              labelColumn: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
            },
          },
        ],
      },
      values: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["cells"],
            properties: {
              cells: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["ref", "column", "value"],
                      properties: {
                        ref: {
                          anyOf: [{ type: "string" }, { type: "null" }],
                        },
                        column: {
                          anyOf: [{ type: "string" }, { type: "null" }],
                        },
                        value: {
                          anyOf: [
                            { type: "string" },
                            { type: "number" },
                            { type: "boolean" },
                            { type: "null" },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      formulas: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["cells"],
            properties: {
              cells: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["ref", "column", "formula"],
                      properties: {
                        ref: {
                          anyOf: [{ type: "string" }, { type: "null" }],
                        },
                        column: {
                          anyOf: [{ type: "string" }, { type: "null" }],
                        },
                        formula: { type: "string" },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      format: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["backgroundColor", "textColor", "bold", "italic", "border"],
            properties: {
              backgroundColor: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              textColor: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              bold: {
                anyOf: [{ type: "boolean" }, { type: "null" }],
              },
              italic: {
                anyOf: [{ type: "boolean" }, { type: "null" }],
              },
              border: {
                anyOf: [{ type: "boolean" }, { type: "null" }],
              },
            },
          },
        ],
      },
      rationale: { type: "string" },
    },
  } as const;
}

function buildAnthropicDraftRowSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "label",
      "description",
      "unit",
      "rowPurpose",
      "quantityValue",
      "materialRate",
      "labourRate",
      "formulaIntent",
    ],
    properties: {
      label: { type: "string" },
      description: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      unit: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      rowPurpose: {
        type: "string",
        enum: ["input", "line_item", "material", "labour", "allowance", "subtotal", "summary", "formula_helper"],
      },
      quantityValue: {
        anyOf: [{ type: "number" }, { type: "null" }],
      },
      materialRate: {
        anyOf: [{ type: "number" }, { type: "null" }],
      },
      labourRate: {
        anyOf: [{ type: "number" }, { type: "null" }],
      },
      formulaIntent: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  } as const;
}

function buildAnthropicWorksheetDraftSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "proposalName", "answer", "sections", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["worksheet_draft", "answer_only"],
      },
      proposalName: { type: "string" },
      answer: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "rows"],
          properties: {
            title: { type: "string" },
            rows: {
              type: "array",
              items: buildAnthropicDraftRowSchema(),
            },
          },
        },
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

function buildAnthropicFormulaSuggestionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "suggestions", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["formula_suggestions", "answer_only"],
      },
      answer: { type: "string" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["targetRowNumber", "targetColumn", "expression", "rationale"],
          properties: {
            targetRowNumber: { type: "number" },
            targetColumn: { type: "string" },
            expression: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

function buildAnthropicFormattingSuggestionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "operations", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["formatting_suggestions", "answer_only"],
      },
      answer: { type: "string" },
      operations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "targetCells", "rationale"],
          properties: {
            type: {
              type: "string",
              enum: ["format_cell", "format_cells"],
            },
            targetCells: {
              type: "array",
              items: { type: "string" },
            },
            backgroundColor: { type: "string" },
            textColor: { type: "string" },
            bold: { type: "boolean" },
            italic: { type: "boolean" },
            rationale: { type: "string" },
          },
        },
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

function buildAnthropicAnswerOnlySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "proposalName", "answer", "summary", "confidence", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["answer_only"],
      },
      proposalName: { type: "string" },
      answer: { type: "string" },
      summary: { type: "string" },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

function buildAnthropicReviewSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "reviewFindings", "reviewSummary", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["review_summary", "answer_only"],
      },
      answer: { type: "string" },
      reviewFindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "finding", "category", "severity", "confidence"],
          properties: {
            title: { type: "string" },
            finding: { type: "string" },
            category: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            assumption: { type: "string" },
            needsConfirmation: { type: "string" },
            suggestedAction: { type: "string" },
            relatedCells: {
              type: "array",
              items: { type: "string" },
            },
            relatedRows: {
              type: "array",
              items: { type: "number" },
            },
          },
        },
      },
      reviewSummary: {
        type: "object",
        additionalProperties: false,
        required: ["presentItems", "possibleMissingItems", "keyRisks", "assumptions", "confirmationsNeeded"],
        properties: {
          presentItems: { type: "array", items: { type: "string" } },
          possibleMissingItems: { type: "array", items: { type: "string" } },
          keyRisks: { type: "array", items: { type: "string" } },
          assumptions: { type: "array", items: { type: "string" } },
          confirmationsNeeded: { type: "array", items: { type: "string" } },
        },
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

function buildAnthropicCompactEditIntentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "answer", "editIntents", "assumptions", "warnings"],
    properties: {
      mode: {
        type: "string",
        enum: ["edit_intent", "answer_only"],
      },
      answer: { type: "string" },
      editIntents: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action", "rationale"],
          properties: {
            action: {
              type: "string",
              enum: ["set_cell_value", "set_cells_value", "insert_row_after", "insert_subtotal"],
            },
            targetCell: { type: "string" },
            targetCells: {
              type: "array",
              items: { type: "string" },
            },
            values: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["value"],
                properties: {
                  ref: { type: "string" },
                  column: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
            afterRowNumber: { type: "number" },
            subtotalLabel: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } as const;
}

function buildAnthropicWorksheetPricingPatternShadowProposalSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "proposalKind",
            "patternFamily",
            "patternType",
            "title",
            "summary",
            "retrievalGuidance",
            "confidence",
            "scope",
            "patternValueSummary",
            "patternSignals",
            "supportingEvidenceEventIds",
            "contradictoryEvidenceEventIds",
            "contradictionReason",
            "dominantAlternativePatternType",
          ],
          properties: {
            proposalKind: {
              type: "string",
              enum: ["pattern", "no_pattern"],
            },
            patternFamily: {
              anyOf: [
                {
                  type: "string",
                  enum: [
                    "pricing_preference",
                    "rate_adjustment_pattern",
                    "allowance_pattern",
                    "labour_productivity_pattern",
                    "formula_pattern",
                    "component_completeness_pattern",
                    "review_correction_pattern",
                    "worksheet_structure_pattern",
                    "estimator_behavior_pattern",
                  ],
                },
                { type: "null" },
              ],
            },
            patternType: { anyOf: [{ type: "string" }, { type: "null" }] },
            title: { anyOf: [{ type: "string" }, { type: "null" }] },
            summary: { anyOf: [{ type: "string" }, { type: "null" }] },
            retrievalGuidance: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
            scope: {
              type: "object",
              additionalProperties: false,
              required: [
                "tradePackage",
                "pageType",
                "worksheetNameHint",
                "itemCategory",
                "normalizedUnit",
                "costRole",
                "sectionType",
              ],
              properties: {
                tradePackage: { anyOf: [{ type: "string" }, { type: "null" }] },
                pageType: { anyOf: [{ type: "string" }, { type: "null" }] },
                worksheetNameHint: { anyOf: [{ type: "string" }, { type: "null" }] },
                itemCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
                normalizedUnit: { anyOf: [{ type: "string" }, { type: "null" }] },
                costRole: { anyOf: [{ type: "string" }, { type: "null" }] },
                sectionType: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
            },
            patternValueSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
            patternSignals: {
              type: "array",
              items: { type: "string" },
            },
            supportingEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            contradictoryEvidenceEventIds: {
              type: "array",
              items: { type: "string" },
            },
            contradictionReason: { anyOf: [{ type: "string" }, { type: "null" }] },
            dominantAlternativePatternType: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
      },
    },
  } as const;
}

function buildAnthropicWorksheetEventInterpretationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["classifications"],
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "eventId",
            "overallConfidence",
            "reasoningSummary",
            "interpretationPayload",
            "semanticSummary",
          ],
          properties: {
            eventId: { type: "string" },
            overallConfidence: { type: "number" },
            reasoningSummary: { type: "string" },
            interpretationPayload: {
              type: "object",
              additionalProperties: false,
              required: [
                "whatChanged",
                "plainEnglishSummary",
                "businessMeaning",
                "constructionMeaning",
                "pricingMeaning",
                "futureUse",
                "memoryCandidate",
                "memoryType",
                "retrievalGuidance",
              ],
              properties: {
                whatChanged: { type: "string" },
                plainEnglishSummary: { type: "string" },
                businessMeaning: { type: "string" },
                constructionMeaning: { type: "string" },
                pricingMeaning: { type: "string" },
                formulaMeaning: { type: "string" },
                aiCorrectionMeaning: { type: "string" },
                futureUse: { type: "string" },
                memoryCandidate: { type: "boolean" },
                memoryType: { type: "string" },
                retrievalGuidance: { type: "string" },
                shouldInfluenceFutureGeneration: { type: "boolean" },
                shouldInfluenceFutureReview: { type: "boolean" },
                changeType: { type: "string" },
                oldValue: { type: "string" },
                newValue: { type: "string" },
                oldFormula: { type: "string" },
                newFormula: { type: "string" },
                unit: { type: "string" },
                contextConfidence: { type: "number" },
                futureUseConfidence: { type: "number" },
              },
            },
            semanticSummary: {
              type: "object",
              additionalProperties: false,
              required: [
                "costRole",
                "pageType",
                "itemCategory",
                "normalizedUnit",
                "normalizedTradePackage",
              ],
              properties: {
                costRole: { type: "string" },
                pageType: { type: "string" },
                itemCategory: { type: "string" },
                normalizedUnit: { type: "string" },
                normalizedTradePackage: { type: "string" },
              },
            },
          },
        },
      },
    },
  } as const;
}

function buildAnthropicCompactWorksheetSchema(options: {
  mutationIntent: boolean;
}) {
  const operationSchema = buildAnthropicOperationSchema();
  const baseRequired = ["mode", "proposalName", "answer", "summary", "confidence", "operations", "assumptions", "warnings"];
  const baseProperties = {
    proposalName: { type: "string" },
    answer: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    operations: {
      type: "array",
      items: operationSchema,
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  } as const;

  if (!options.mutationIntent) {
    return {
      type: "object",
      additionalProperties: false,
      required: baseRequired,
      properties: {
        mode: {
          type: "string",
          enum: ["answer_only", "propose_edit", "answer_and_propose_edit"],
        },
        ...baseProperties,
      },
    };
  }

  return {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        required: baseRequired,
        properties: {
          mode: {
            type: "string",
            enum: ["answer_only"],
          },
          ...baseProperties,
          operations: {
            type: "array",
            items: operationSchema,
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: baseRequired,
        properties: {
          mode: {
            type: "string",
            enum: ["propose_edit", "answer_and_propose_edit"],
          },
          ...baseProperties,
          operations: {
            type: "array",
            items: operationSchema,
          },
        },
      },
    ],
  };
}

function removeUnsupportedAnthropicSchemaKeywords(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => removeUnsupportedAnthropicSchemaKeywords(entry));
  }

  if (!isRecord(node)) {
    return node;
  }

  const sanitizedEntries = Object.entries(node)
    .filter(([key]) => !ANTHROPIC_UNSUPPORTED_REMOVABLE_SCHEMA_KEYWORDS.has(key))
    .map(([key, value]) => [key, removeUnsupportedAnthropicSchemaKeywords(value)]);

  return Object.fromEntries(sanitizedEntries);
}

function collectUnsupportedAnthropicSchemaKeywords(
  node: unknown,
  path = "$",
): AnthropicSchemaKeywordIssue[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectUnsupportedAnthropicSchemaKeywords(entry, `${path}[${index}]`));
  }

  if (!isRecord(node)) {
    return [];
  }

  const issues: AnthropicSchemaKeywordIssue[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" || key === "$defs" || key === "definitions") {
      if (isRecord(value)) {
        for (const [childKey, childValue] of Object.entries(value)) {
          issues.push(...collectUnsupportedAnthropicSchemaKeywords(childValue, `${path}.${key}.${childKey}`));
        }
      }
      continue;
    }

    if (!ANTHROPIC_ALLOWED_SCHEMA_KEYWORDS.has(key)) {
      issues.push({
        keyword: key,
        path: `${path}.${key}`,
      });
      continue;
    }

    issues.push(...collectUnsupportedAnthropicSchemaKeywords(value, `${path}.${key}`));
  }

  return issues;
}

function countAnthropicOperationTypeEnums(node: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce((total, entry) => total + countAnthropicOperationTypeEnums(entry), 0);
  }

  if (!isRecord(node)) {
    return 0;
  }

  let count = 0;
  if (
    node.type === "string" &&
    Array.isArray(node.enum) &&
    node.enum.every((entry) => typeof entry === "string" && SUPPORTED_OPERATION_TYPES.includes(entry as (typeof SUPPORTED_OPERATION_TYPES)[number]))
  ) {
    count += node.enum.length;
  }

  for (const value of Object.values(node)) {
    count += countAnthropicOperationTypeEnums(value);
  }

  return count;
}

function hasAnthropicOperationSchema(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((entry) => hasAnthropicOperationSchema(entry));
  }

  if (!isRecord(node)) {
    return false;
  }

  if (
    isRecord(node.properties) &&
    isRecord((node.properties as Record<string, unknown>).type) &&
    Array.isArray((((node.properties as Record<string, unknown>).type as Record<string, unknown>).enum))
  ) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicOperationSchema(value));
}

function hasAnthropicWorksheetDraftSchema(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((entry) => hasAnthropicWorksheetDraftSchema(entry));
  }

  if (!isRecord(node)) {
    return false;
  }

  if (
    node.type === "string" &&
    Array.isArray(node.enum) &&
    node.enum.includes("worksheet_draft")
  ) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicWorksheetDraftSchema(value));
}

function hasAnthropicFormulaSuggestionSchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  if (
    node.type === "object" &&
    isRecord(node.properties) &&
    isRecord(node.properties.mode) &&
    Array.isArray(node.properties.mode.enum) &&
    node.properties.mode.enum.includes("formula_suggestions")
  ) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicFormulaSuggestionSchema(value));
}

function hasAnthropicReviewSchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  if (isRecord(node.properties) && isRecord((node.properties as Record<string, unknown>).reviewFindings)) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicReviewSchema(value));
}

function hasAnthropicCompactEditIntentSchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  if (isRecord(node.properties) && isRecord((node.properties as Record<string, unknown>).editIntents)) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicCompactEditIntentSchema(value));
}

function hasAnthropicWorksheetPricingPatternShadowProposalSchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  if (isRecord(node.properties) && isRecord((node.properties as Record<string, unknown>).proposals)) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicWorksheetPricingPatternShadowProposalSchema(value));
}

function hasAnthropicWorksheetMemorySynthesisSchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  if (
    isRecord(node.properties)
    && isRecord((node.properties as Record<string, unknown>).decision)
    && isRecord((node.properties as Record<string, unknown>).supportingEvidenceEventIds)
  ) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicWorksheetMemorySynthesisSchema(value));
}

function hasAnthropicAnswerOnlySchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  const properties = isRecord(node.properties) ? (node.properties as Record<string, unknown>) : null;
  const modeSchema = properties && isRecord(properties.mode) ? (properties.mode as Record<string, unknown>) : null;
  if (
    modeSchema &&
    Array.isArray(modeSchema.enum) &&
    modeSchema.enum.length === 1 &&
    modeSchema.enum[0] === "answer_only"
  ) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicAnswerOnlySchema(value));
}

function hasAnthropicWorksheetEventInterpretationSchema(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }

  if (isRecord(node.properties) && isRecord((node.properties as Record<string, unknown>).classifications)) {
    return true;
  }

  return Object.values(node).some((value) => hasAnthropicWorksheetEventInterpretationSchema(value));
}

function countAnthropicOptionalParameters(node: unknown): number {
  if (!isRecord(node)) {
    return 0;
  }

  let count = 0;
  if (node.type === "object" && isRecord(node.properties)) {
    const required = Array.isArray(node.required)
      ? new Set(node.required.filter((entry): entry is string => typeof entry === "string"))
      : new Set<string>();
    for (const propertyName of Object.keys(node.properties)) {
      if (!required.has(propertyName)) {
        count += 1;
      }
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        count += countAnthropicOptionalParameters(entry);
      }
      continue;
    }

    count += countAnthropicOptionalParameters(value);
  }

  return count;
}

export function sanitizeSchemaForAnthropic(schema: Record<string, unknown>): Record<string, unknown> {
  return removeUnsupportedAnthropicSchemaKeywords(cloneJsonValue(schema)) as Record<string, unknown>;
}

export function collectUnsupportedAnthropicSchemaKeywordsForTest(
  schema: Record<string, unknown>,
): AnthropicSchemaKeywordIssue[] {
  return collectUnsupportedAnthropicSchemaKeywords(schema);
}

function preflightAnthropicSchema(
  schema: Record<string, unknown>,
  options: {
    allowWorksheetEventInterpretationSchema?: boolean;
    allowCustomSchema?: boolean;
  } = {},
) {
  const unsupportedIssues = collectUnsupportedAnthropicSchemaKeywords(schema);
  const freeFormObjectIssues = collectAnthropicFreeFormObjectIssues(schema);
  const unsupportedKeywords = Array.from(new Set(unsupportedIssues.map((issue) => issue.keyword))).slice(0, 16);
  const unsupportedPaths = unsupportedIssues.map((issue) => issue.path).slice(0, 24);
  const freeFormObjectPaths = freeFormObjectIssues.map((issue) => issue.path).slice(0, 24);
  const schemaSizeBytes = Buffer.byteLength(JSON.stringify(schema), "utf8");
  const hasOperationSchema = hasAnthropicOperationSchema(schema);
  const hasDraftSchema = hasAnthropicWorksheetDraftSchema(schema);
  const hasFormulaSuggestionSchema = hasAnthropicFormulaSuggestionSchema(schema);
  const hasReviewSchema = hasAnthropicReviewSchema(schema);
  const hasCompactEditIntentSchema = hasAnthropicCompactEditIntentSchema(schema);
  const hasWorksheetPricingPatternShadowProposalSchema = hasAnthropicWorksheetPricingPatternShadowProposalSchema(schema);
  const hasWorksheetMemorySynthesisSchema = hasAnthropicWorksheetMemorySynthesisSchema(schema);
  const hasAnswerOnlySchema = hasAnthropicAnswerOnlySchema(schema);
  const hasWorksheetEventInterpretationSchema = hasAnthropicWorksheetEventInterpretationSchema(schema);
  const operationTypeEnumCount = countAnthropicOperationTypeEnums(schema);
  const optionalParameterCount = countAnthropicOptionalParameters(schema);

  logAnthropicProviderDebug("anthropic_schema_preflight", {
    unsupportedKeywordCount: unsupportedIssues.length,
    unsupportedKeywords,
    unsupportedPaths,
    freeFormObjectCount: freeFormObjectIssues.length,
    freeFormObjectPaths,
    hasOperationSchema,
    hasDraftSchema,
    hasFormulaSuggestionSchema,
    hasReviewSchema,
    hasCompactEditIntentSchema,
    hasWorksheetPricingPatternShadowProposalSchema,
    hasWorksheetMemorySynthesisSchema,
    hasAnswerOnlySchema,
    hasWorksheetEventInterpretationSchema,
    operationTypeEnumCount,
    optionalParameterCount,
    schemaSizeBytes,
  });

  if (unsupportedIssues.length > 0) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: "Anthropic schema preflight failed: unsupported schema keywords remain.",
      rawError: {
        unsupportedKeywordCount: unsupportedIssues.length,
        unsupportedKeywords,
        unsupportedPaths,
        schemaSizeBytes,
        hasOperationSchema,
        hasDraftSchema,
        hasFormulaSuggestionSchema,
        hasReviewSchema,
        hasCompactEditIntentSchema,
        hasWorksheetPricingPatternShadowProposalSchema,
        hasWorksheetMemorySynthesisSchema,
        hasAnswerOnlySchema,
        hasWorksheetEventInterpretationSchema,
        operationTypeEnumCount,
        optionalParameterCount,
      },
    });
  }

  if (freeFormObjectIssues.length > 0) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: "Anthropic schema preflight failed: free-form object schemas are not allowed.",
      rawError: {
        freeFormObjectCount: freeFormObjectIssues.length,
        freeFormObjectPaths,
        schemaSizeBytes,
      },
    });
  }

  if (
    !hasOperationSchema &&
    !hasDraftSchema &&
    !hasFormulaSuggestionSchema &&
    !hasReviewSchema &&
    !hasCompactEditIntentSchema &&
    !hasWorksheetPricingPatternShadowProposalSchema &&
    !hasWorksheetMemorySynthesisSchema &&
    !hasAnswerOnlySchema &&
    !options.allowCustomSchema &&
    !(options.allowWorksheetEventInterpretationSchema && hasWorksheetEventInterpretationSchema)
  ) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: "Anthropic schema preflight failed: no supported Anthropic response schema was found.",
      rawError: {
        schemaSizeBytes,
        hasOperationSchema,
        hasDraftSchema,
        hasFormulaSuggestionSchema,
        hasReviewSchema,
        hasCompactEditIntentSchema,
        hasWorksheetPricingPatternShadowProposalSchema,
        hasWorksheetMemorySynthesisSchema,
        hasAnswerOnlySchema,
        hasWorksheetEventInterpretationSchema,
        operationTypeEnumCount,
        optionalParameterCount,
      },
    });
  }

  if (schemaSizeBytes > MAX_ANTHROPIC_SCHEMA_SIZE_BYTES) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: "Anthropic schema preflight failed: schema is too large.",
      rawError: {
        schemaSizeBytes,
        maxSchemaSizeBytes: MAX_ANTHROPIC_SCHEMA_SIZE_BYTES,
        hasOperationSchema,
        hasDraftSchema,
        hasFormulaSuggestionSchema,
        hasReviewSchema,
        hasCompactEditIntentSchema,
        hasWorksheetPricingPatternShadowProposalSchema,
        hasAnswerOnlySchema,
        operationTypeEnumCount,
        optionalParameterCount,
      },
    });
  }

  if (optionalParameterCount > MAX_ANTHROPIC_OPTIONAL_PARAMETER_COUNT) {
    throw createPricingWorksheetProviderError({
      code: "provider_schema_validation_failed",
      provider: "anthropic",
      model: "",
      retryable: false,
      message: "Anthropic schema preflight failed: schema has too many optional parameters.",
      rawError: {
        schemaSizeBytes,
        optionalParameterCount,
        maxOptionalParameterCount: MAX_ANTHROPIC_OPTIONAL_PARAMETER_COUNT,
        hasOperationSchema,
        hasDraftSchema,
        hasFormulaSuggestionSchema,
        hasReviewSchema,
        hasCompactEditIntentSchema,
        hasWorksheetMemorySynthesisSchema,
        hasAnswerOnlySchema,
        operationTypeEnumCount,
      },
    });
  }
}

export function preflightAnthropicSchemaForTest(schema: Record<string, unknown>) {
  preflightAnthropicSchema(schema);
}

export function countAnthropicOptionalParametersForTest(schema: Record<string, unknown>) {
  return countAnthropicOptionalParameters(schema);
}

function isAnthropicMutationIntent(metadata: Record<string, unknown> | null) {
  const classification = isRecord(metadata?.classification) ? metadata.classification : null;
  const recommendedPromptPath =
    typeof metadata?.recommendedPromptPath === "string"
      ? metadata.recommendedPromptPath
      : typeof classification?.recommendedPromptPath === "string"
        ? classification.recommendedPromptPath
        : null;
  const primaryIntent =
    typeof classification?.primaryIntent === "string" ? classification.primaryIntent : null;

  return (
    (typeof primaryIntent === "string" && ANTHROPIC_MUTATION_INTENTS.has(primaryIntent)) ||
    recommendedPromptPath === "edit" ||
    recommendedPromptPath === "generation"
  );
}

function getAnthropicSchemaKind(metadata: Record<string, unknown> | null): AnthropicSchemaKind {
  if (metadata?.workflowStage === "worksheet_event_interpretation") {
    return "worksheet_event_interpretation";
  }
  if (metadata?.workflowStage === "formula_generation") {
    return "formula_generation";
  }
  if (metadata?.workflowStage === "formatting_generation") {
    return "formatting_generation";
  }
  if (metadata?.workflowStage === "review_generation") {
    return "review_generation";
  }
  if (metadata?.workflowStage === "edit_intent_generation") {
    return "compact_edit_intent";
  }
  if (metadata?.workflowStage === "worksheet_pricing_pattern_shadow_proposals") {
    return "worksheet_pricing_pattern_shadow_proposals";
  }
  if (metadata?.workflowStage === "worksheet_memory_synthesis") {
    return "worksheet_memory_synthesis";
  }
  if (metadata?.engine === "cost_construction_intelligence") {
    return "cost_construction_intelligence";
  }
  if (metadata?.workflowStage === "answer_only_generation") {
    return "answer_only";
  }

  const classification = isRecord(metadata?.classification) ? metadata.classification : null;
  const recommendedPromptPath =
    typeof metadata?.recommendedPromptPath === "string"
      ? metadata.recommendedPromptPath
      : typeof classification?.recommendedPromptPath === "string"
        ? classification.recommendedPromptPath
        : null;
  const primaryIntent =
    typeof classification?.primaryIntent === "string" ? classification.primaryIntent : null;

  if (primaryIntent === "worksheet_generation" || recommendedPromptPath === "generation") {
    return "draft_generation";
  }

  return "answer_only";
}

export function buildAnthropicProviderSchema(request: PricingWorksheetProviderRequest): Record<string, unknown> {
  const metadata = isRecord(request.metadata) ? request.metadata : null;
  sanitizeAnthropicSchema(request.schema);
  const schemaKind = getAnthropicSchemaKind(metadata);
  logAnthropicProviderDebug("anthropic_schema_selection", {
    workflowStage: typeof metadata?.workflowStage === "string" ? metadata.workflowStage : "default",
    schemaKind,
    primaryIntent:
      isRecord(metadata?.classification) && typeof metadata.classification.primaryIntent === "string"
        ? metadata.classification.primaryIntent
        : null,
    recommendedPromptPath:
      typeof metadata?.recommendedPromptPath === "string"
        ? metadata.recommendedPromptPath
        : isRecord(metadata?.classification) && typeof metadata.classification.recommendedPromptPath === "string"
          ? metadata.classification.recommendedPromptPath
          : null,
  });
  const providerSchema =
    schemaKind === "worksheet_event_interpretation"
      ? buildAnthropicWorksheetEventInterpretationSchema()
      : schemaKind === "draft_generation"
      ? buildAnthropicWorksheetDraftSchema()
      : schemaKind === "formula_generation"
        ? buildAnthropicFormulaSuggestionSchema()
        : schemaKind === "formatting_generation"
          ? buildAnthropicFormattingSuggestionSchema()
          : schemaKind === "review_generation"
            ? buildAnthropicReviewSchema()
            : schemaKind === "compact_edit_intent"
              ? buildAnthropicCompactEditIntentSchema()
              : schemaKind === "worksheet_pricing_pattern_shadow_proposals"
                ? buildAnthropicWorksheetPricingPatternShadowProposalSchema()
                : schemaKind === "worksheet_memory_synthesis"
                  ? request.schema
                  : schemaKind === "cost_construction_intelligence"
                  ? request.schema
                  : buildAnthropicAnswerOnlySchema();
  const compactSchema = sanitizeAnthropicSchema(providerSchema);
  const outboundSchema = sanitizeSchemaForAnthropic(compactSchema);
  preflightAnthropicSchema(outboundSchema, {
    allowWorksheetEventInterpretationSchema: schemaKind === "worksheet_event_interpretation",
    allowCustomSchema: schemaKind === "cost_construction_intelligence",
  });
  return outboundSchema;
}

export function getAnthropicSchemaKindForTest(request: PricingWorksheetProviderRequest): AnthropicSchemaKind {
  return getAnthropicSchemaKind(isRecord(request.metadata) ? request.metadata : null);
}

function buildAnthropicSystemPrompt(request: PricingWorksheetProviderRequest) {
  const metadata = isRecord(request.metadata) ? request.metadata : null;
  const classification = isRecord(metadata?.classification) ? metadata.classification : null;
  const recommendedPromptPath =
    typeof metadata?.recommendedPromptPath === "string"
      ? metadata.recommendedPromptPath
      : typeof classification?.recommendedPromptPath === "string"
        ? classification.recommendedPromptPath
        : null;
  const primaryIntent =
    typeof classification?.primaryIntent === "string" ? classification.primaryIntent : null;
  const mutationIntent =
    primaryIntent === "worksheet_generation" ||
    recommendedPromptPath === "generation" ||
    recommendedPromptPath === "edit";
  const schemaKind = getAnthropicSchemaKind(metadata);

  const commonInstructions = [
    "Return JSON only.",
    "Do not include markdown, code fences, commentary, or prose outside the JSON object.",
    "Follow the output schema exactly.",
  ];

  const draftGenerationInstructions =
    schemaKind === "draft_generation"
      ? [
          "For worksheet generation requests, do not return low-level TradesStack operations.",
          "Return mode=\"worksheet_draft\" when you can propose a bounded worksheet structure, or mode=\"answer_only\" if you cannot do so safely.",
          "Stage A is structure-only. Do not generate final formulas, long explanations, detailed pricing commentary, or verbose notes.",
          "Populate sections with compact estimator-style starter rows for the worksheet, not generic spreadsheet filler.",
          "Separate the worksheet draft into practical groups such as inputs, calculations, subtotals, and outputs when relevant.",
          "Prefer dense commercial workbook structure with compact pricing blocks instead of long linear row-by-row walkthroughs.",
          "Each section row should describe a real worksheet line item, input, allowance, subtotal, summary row, or formula helper row using rowPurpose.",
          "Prefer visible quantity transformations, editable assumption rows, material or labour rows, waste or allowance rows, structured subtotals, and output rows where relevant.",
          "Keep related quantity, pricing, labour, and subtotal rows adjacent where possible so the draft reads like a practical pricing workbook.",
          "Use concise estimator-style row labels and avoid repeated descriptions, unnecessary note rows, and explanatory filler.",
          "Only include lightweight formulaIntent text when a row will likely need a later formula stage, for example \"quantity times material rate\", \"waste allowance applied to base quantity\", \"labour hours times labour rate\", or \"section subtotal\".",
          "Keep the draft transparent and reviewable. Do not imply hidden pricing libraries, lookup tables, database sheets, autonomous estimating engines, or opaque formula chains.",
          "Do not invent compliance-driven, specification-driven, fire-rated, acoustic-rated, seismic, or manufacturer-specific requirements unless they were explicitly provided.",
          "If information is missing, prefer editable input or assumption rows unless the missing information would materially change the worksheet structure.",
          "Keep answer extremely short, ideally one sentence or less.",
          "Keep assumptions short and only include them when necessary.",
          "Cap the output to at most 6 sections, 18 total rows across all sections, and 6 assumptions.",
          "Do not claim the worksheet was created unless the draft contains one or more rows inside sections.",
          "Keep the worksheet draft compact, auditable, and estimator-friendly.",
        ]
      : [];

  const formulaStageInstructions =
    schemaKind === "formula_generation"
      ? [
          "This request is for formula suggestions only.",
          "Do not create or modify worksheet structure.",
          "Only target real row numbers and real column letters from the provided worksheet snapshot.",
          "Use spreadsheet-compatible formulas or worksheet-aware helper expressions that can be resolved locally.",
          "Never use curly-brace placeholders, symbolic refs like 8_Qty, imaginary rows, or unsupported functions.",
          "If you cannot suggest safe formulas, return mode=\"answer_only\".",
        ]
      : [];

  const formattingStageInstructions =
    schemaKind === "formatting_generation"
      ? [
          "This request is for worksheet formatting suggestions only.",
          "Do not change worksheet values, formulas, assumptions, or structure.",
          "Only return format_cell or format_cells suggestions using real worksheet refs from the provided snapshot.",
          "Use the formatting candidate guidance to highlight manual quantity inputs in blue, assumption or system inputs in amber, pricing or rate inputs in green, and formula or output cells in grey when those groups are relevant.",
          "If you cannot suggest safe worksheet formatting, return mode=\"answer_only\".",
        ]
      : [];

  const reviewStageInstructions =
    schemaKind === "review_generation"
      ? [
          "This request is for worksheet review output only.",
          "Do not create worksheet operations.",
          "Return concise review findings, risks, assumptions, and confirmations needed based on the real worksheet snapshot.",
          "If you cannot review the worksheet safely, return mode=\"answer_only\".",
        ]
      : [];

  const compactEditIntentInstructions =
    schemaKind === "compact_edit_intent"
      ? [
          "This request is for compact worksheet edit intent only.",
          "Do not emit full low-level TradesStack operations.",
          "Return edit intents using only real rows or cells from the provided worksheet snapshot when possible.",
          "Use set_cell_value, set_cells_value, insert_row_after, or insert_subtotal only when they are clearly supported by the worksheet snapshot.",
          "If the request is too broad or unsafe to convert locally, return mode=\"answer_only\".",
        ]
      : [];

  const worksheetEventInterpretationInstructions =
    schemaKind === "worksheet_event_interpretation"
      ? [
          "This request is for worksheet event interpretation only.",
          "Do not use answer-only fallback shapes.",
          "Do not emit worksheet operations, worksheet drafts, review findings, or edit intents.",
          "Return one valid JSON object that matches the required interpretation fields in the prompt.",
          "interpretationPayload is mandatory for every event.",
          "The primary output is a compact interpretationPayload with useful text, not just tags.",
          "semanticSummary is a short secondary summary for scoping only.",
          "Low confidence still requires useful interpretation text inside interpretationPayload.",
          "Anthropic interpretation schema notes: use empty strings for unknown string fields, 0 for unknown numeric confidence fields, and false for unknown boolean future-use fields.",
        ]
      : [];

  const worksheetPricingPatternShadowProposalInstructions =
    schemaKind === "worksheet_pricing_pattern_shadow_proposals"
      ? [
          "This request is for worksheet pricing pattern shadow proposals only.",
          "Do not use answer-only fallback shapes.",
          "Do not emit worksheet operations, worksheet drafts, review findings, or edit intents.",
          "Return one valid JSON object with a proposals array only.",
          "Each proposal must either be a reusable pattern proposal or a no_pattern result.",
          "If proposalKind = no_pattern, it means no reusable pattern and no support set.",
          "If proposalKind = no_pattern, supportingEvidenceEventIds and contradictoryEvidenceEventIds must both be empty arrays.",
          "If proposalKind = no_pattern, patternFamily, patternType, confidence, and retrievalGuidance must all be null.",
          "A reusable pattern proposal must use supportingEvidenceEventIds from at least 2 worksheet instances and at least 2 projects.",
          "If two events show the same specific pricing behavior across 2 worksheet instances and 2 projects, return a weak pattern unless there is real contradiction.",
          "Do not return no_pattern for matching cross-project support evidence.",
          "If only one worksheet instance or one project genuinely supports the behavior, return no_pattern.",
          "Do not propose a pattern from a single support event.",
          "Do not propose a pattern when the broader pool is diverse but the actual supporting subset is narrow.",
          "Use supportingEvidenceEventIds and contradictoryEvidenceEventIds only from the supplied event ids.",
          "Keep summaries compact, evidence-backed, and non-speculative.",
          "Use scope, patternValueSummary, and patternSignals as compact generic descriptors, not long explanations.",
        ]
      : [];

  const worksheetMemorySynthesisInstructions =
    schemaKind === "worksheet_memory_synthesis"
      ? [
          "This request is for worksheet memory synthesis only.",
          "Do not use answer-only fallback shapes.",
          "Do not emit worksheet operations, worksheet drafts, review findings, edit intents, or pattern proposals.",
          "Return one valid JSON object only.",
          "decision must be one of: no_memory, create_memory, reinforce_existing_memory, supersede_existing_memory.",
          "scope and memoryValue must be JSON-encoded strings when they are present, or null when absent.",
          "supportingEvidenceEventIds, uncertainEvidenceEventIds, contradictoryEvidenceEventIds, and supersededMemoryIds must always be arrays.",
        ]
      : [];

  const answerOnlyInstructions =
    schemaKind === "answer_only"
      ? [
          "Return a compact answer-only response.",
          "Do not emit worksheet operations.",
        ]
      : [];

  const mutationInstructions = mutationIntent
    ? [
        "This request is asking for real worksheet changes, not a text-only explanation.",
        "If the user asks to create, build, generate, add, modify, update, or adjust a worksheet, the JSON must include at least one supported operation.",
        "Do not claim you created, updated, or adjusted the worksheet unless operations are present.",
        "For blank or minimal worksheets, use supported insert_row, update_cell, update_cells, insert_subtotal, format_cell, or format_cells operations to build a bounded starter structure.",
        "For formula requests that change the worksheet, include supported update_cell, update_cells, or fix_formula operations with real formula targets.",
        "operations cannot be empty for worksheet creation or edit intents.",
        "Example insert row operation: {\"type\":\"insert_row\",\"target\":{\"row\":1},\"values\":{\"cells\":[{\"column\":\"A\",\"value\":\"Inputs\"},{\"column\":\"B\",\"value\":\"Wall area m2\"}]},\"formulas\":{\"cells\":[]},\"rationale\":\"Add a starter input row.\"}",
        "Example formula update operation: {\"type\":\"update_cell\",\"target\":{\"cell\":\"C4\"},\"values\":{\"cells\":[]},\"formulas\":{\"cells\":[{\"ref\":\"C4\",\"formula\":\"=IFERROR(A4*B4,\\\"\\\")\"}]},\"rationale\":\"Add the worksheet formula.\"}",
        "Example value update operation: {\"type\":\"update_cells\",\"target\":{\"cells\":[\"A2\",\"B2\"]},\"values\":{\"cells\":[{\"ref\":\"A2\",\"value\":\"Labour hours\"},{\"ref\":\"B2\",\"value\":0.35}]},\"formulas\":{\"cells\":[]},\"rationale\":\"Update worksheet inputs.\"}",
        "If valid worksheet operations cannot be produced safely, return mode=\"answer_only\" and explain why.",
        "Never return propose_edit or answer_and_propose_edit with operations empty.",
      ]
    : [];

  const providerSpecificInstructions =
    schemaKind === "draft_generation"
      ? draftGenerationInstructions
      : schemaKind === "formula_generation"
        ? formulaStageInstructions
        : schemaKind === "formatting_generation"
          ? formattingStageInstructions
          : schemaKind === "review_generation"
          ? reviewStageInstructions
          : schemaKind === "compact_edit_intent"
              ? compactEditIntentInstructions
            : schemaKind === "worksheet_pricing_pattern_shadow_proposals"
              ? worksheetPricingPatternShadowProposalInstructions
              : schemaKind === "worksheet_memory_synthesis"
                ? worksheetMemorySynthesisInstructions
              : schemaKind === "cost_construction_intelligence"
                ? answerOnlyInstructions
              : schemaKind === "worksheet_event_interpretation"
                ? worksheetEventInterpretationInstructions
              : answerOnlyInstructions;

  return `${request.systemPrompt}\n\n${[...commonInstructions, ...providerSpecificInstructions].join(" ")}`;
}

function parseJsonObjectCandidate(payload: string): {
  structuredObject: Record<string, unknown> | null;
  parseError?: string;
  possibleTruncatedJson?: boolean;
} {
  const trimmed = payload.trim();
  if (!trimmed) {
    return {
      structuredObject: null,
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      structuredObject: isRecord(parsed) ? parsed : null,
      parseError: isRecord(parsed) ? undefined : "parsed_value_was_not_an_object",
    };
  } catch (error) {
    const balanced = extractBalancedJsonObject(trimmed);
    if (!balanced.jsonText) {
      return {
        structuredObject: null,
        parseError: error instanceof Error ? error.message : "json_parse_failed",
        possibleTruncatedJson: balanced.possibleTruncatedJson,
      };
    }

    try {
      const parsed = JSON.parse(balanced.jsonText);
      return {
        structuredObject: isRecord(parsed) ? parsed : null,
        parseError: isRecord(parsed) ? undefined : "parsed_balanced_json_was_not_an_object",
        possibleTruncatedJson: false,
      };
    } catch (balancedError) {
      return {
        structuredObject: null,
        parseError: balancedError instanceof Error ? balancedError.message : "balanced_json_parse_failed",
        possibleTruncatedJson: balanced.possibleTruncatedJson,
      };
    }
  }
}

function extractAnthropicTextBlocks(responseJson: unknown): string[] {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.content)) {
    return [];
  }

  return responseJson.content
    .map((block) => {
      if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
        return null;
      }
      return block.text.trim();
    })
    .filter((value): value is string => Boolean(value));
}

function sanitizeEvidenceSourceText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function sanitizeEvidenceSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().slice(0, 280);
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

function buildEvidenceSourceId(index: number, title?: string, url?: string): string {
  const seed = (url || title || `source-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return seed.length > 0 ? seed : `source-${index + 1}`;
}

function buildEvidenceSourceDedupKey(source: Pick<PricingWorksheetAiEvidenceSource, "title" | "url">): string {
  const normalizedUrl = source.url?.trim().toLowerCase();
  if (normalizedUrl) {
    return normalizedUrl;
  }

  return source.title.trim().toLowerCase();
}

function inferEvidenceSourceType(params: { title?: string; url?: string }): PricingWorksheetAiEvidenceSource["sourceType"] {
  const haystack = `${params.title ?? ""} ${params.url ?? ""}`.toLowerCase();
  if (
    haystack.includes("ncc") ||
    haystack.includes("nzbc") ||
    haystack.includes("as/nzs") ||
    haystack.includes("building code") ||
    haystack.includes("standards")
  ) {
    return "standard_or_code";
  }

  if (
    haystack.includes("rondo") ||
    haystack.includes("gib") ||
    haystack.includes("knauf") ||
    haystack.includes("sika") ||
    haystack.includes("csr") ||
    haystack.includes("bostik")
  ) {
    return "manufacturer";
  }

  if (
    haystack.includes("supplier") ||
    haystack.includes("mitre10") ||
    haystack.includes("bunnings") ||
    haystack.includes("placemakers")
  ) {
    return "supplier";
  }

  if (haystack.includes("guide") || haystack.includes("manual") || haystack.includes("technical") || haystack.includes("guidance")) {
    return "industry_guidance";
  }

  return params.url ? "web" : "unknown";
}

function inferEvidenceJurisdiction(params: { title?: string; url?: string }): PricingWorksheetAiEvidenceSource["jurisdiction"] {
  const haystack = `${params.title ?? ""} ${params.url ?? ""}`.toLowerCase();
  if (haystack.includes(".au") || haystack.includes("australia") || haystack.includes("ncc") || haystack.includes("au/")) {
    return "AU";
  }

  if (haystack.includes(".nz") || haystack.includes("new zealand") || haystack.includes("nzbc") || haystack.includes("nz/")) {
    return "NZ";
  }

  if (haystack.includes("as/nzs") || (haystack.includes(".au") && haystack.includes(".nz"))) {
    return "AUS_NZ";
  }

  return "unknown";
}

function inferEvidenceConfidence(sourceType: PricingWorksheetAiEvidenceSource["sourceType"]) {
  if (sourceType === "standard_or_code") {
    return "high" as const;
  }

  if (sourceType === "manufacturer" || sourceType === "industry_guidance" || sourceType === "project_document") {
    return "medium" as const;
  }

  if (sourceType === "supplier" || sourceType === "unknown") {
    return "low" as const;
  }

  return "medium" as const;
}

function mergeEvidenceSources(sources: PricingWorksheetAiEvidenceSource[]): PricingWorksheetAiEvidenceSource[] {
  const merged: PricingWorksheetAiEvidenceSource[] = [];

  for (const source of sources) {
    const existingIndex = merged.findIndex((entry) => buildEvidenceSourceDedupKey(entry) === buildEvidenceSourceDedupKey(source));
    if (existingIndex < 0) {
      merged.push(source);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      title: existing.title.length >= source.title.length ? existing.title : source.title,
      url: existing.url ?? source.url,
      sourceType: existing.sourceType === "unknown" ? source.sourceType : existing.sourceType,
      jurisdiction: existing.jurisdiction === "unknown" ? source.jurisdiction : existing.jurisdiction,
      confidence:
        existing.confidence === "high" || source.confidence === "low"
          ? existing.confidence
          : source.confidence === "high"
            ? "high"
            : existing.confidence === "medium" || source.confidence === "medium"
              ? "medium"
              : "low",
      supportedClaims: Array.from(new Set([...(existing.supportedClaims ?? []), ...(source.supportedClaims ?? [])])).slice(0, 4),
      retrievedAt: existing.retrievedAt ?? source.retrievedAt,
    };
  }

  return merged.slice(0, 16);
}

function extractAnthropicEvidenceSources(responseJson: unknown): PricingWorksheetAiEvidenceSource[] {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.content)) {
    return [];
  }

  const collected: PricingWorksheetAiEvidenceSource[] = [];
  const retrievedAt = new Date().toISOString();

  for (const block of responseJson.content) {
    if (!isRecord(block)) {
      continue;
    }

    if (block.type === "web_search_tool_result") {
      const content = block.content;
      const contentItems = Array.isArray(content) ? content : [content];
      for (const [index, item] of contentItems.entries()) {
        if (!isRecord(item) || item.type !== "web_search_result") {
          continue;
        }

        const title = sanitizeEvidenceSourceText(item.title, 120);
        const url = sanitizeEvidenceSourceUrl(item.url);
        if (!title && !url) {
          continue;
        }

        const sourceType = inferEvidenceSourceType({ title, url });
        collected.push({
          id: buildEvidenceSourceId(index, title, url),
          title: title || (url ?? `Search result ${index + 1}`),
          url,
          sourceType,
          jurisdiction: inferEvidenceJurisdiction({ title, url }),
          confidence: inferEvidenceConfidence(sourceType),
          retrievedAt,
          supportedClaims: [],
        });
      }
    }

    if (block.type !== "text" || !Array.isArray(block.citations)) {
      continue;
    }

    for (const [index, citation] of block.citations.entries()) {
      if (!isRecord(citation) || citation.type !== "web_search_result_location") {
        continue;
      }

      const title = sanitizeEvidenceSourceText(citation.title, 120);
      const url = sanitizeEvidenceSourceUrl(citation.url);
      if (!title && !url) {
        continue;
      }

      const sourceType = inferEvidenceSourceType({ title, url });
      collected.push({
        id: buildEvidenceSourceId(index, title, url),
        title: title || (url ?? `Citation ${index + 1}`),
        url,
        sourceType,
        jurisdiction: inferEvidenceJurisdiction({ title, url }),
        confidence: inferEvidenceConfidence(sourceType),
        retrievedAt,
        supportedClaims: [],
      });
    }
  }

  return mergeEvidenceSources(collected);
}

function extractAnthropicCitations(responseJson: unknown): PricingWorksheetProviderCitation[] {
  return extractAnthropicEvidenceSources(responseJson).map((source) => ({
    title: source.title,
    url: source.url,
  }));
}

function extractAnthropicServerToolUses(responseJson: unknown): number {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.content)) {
    return 0;
  }

  return responseJson.content.filter((block) => isRecord(block) && block.type === "server_tool_use").length;
}

function extractAnthropicStructuredObject(responseJson: unknown): Record<string, unknown> | null {
  if (!isRecord(responseJson)) {
    return null;
  }

  if (isRecord(responseJson.structured_output)) {
    return responseJson.structured_output;
  }

  if (!Array.isArray(responseJson.content)) {
    return null;
  }

  for (const block of responseJson.content) {
    if (!isRecord(block)) {
      continue;
    }

    if (isRecord(block.input)) {
      return block.input;
    }

    if (isRecord(block.json)) {
      return block.json;
    }
  }

  const rawText = extractAnthropicTextBlocks(responseJson).join("\n").trim();
  return parseJsonObjectCandidate(rawText).structuredObject;
}

function classifyAnthropicResponseFailureReason(responseJson: unknown, rawText: string): AnthropicResponseFailureReason {
  if (!isRecord(responseJson)) {
    return "unsupported_provider_shape";
  }

  if (!Array.isArray(responseJson.content) || responseJson.content.length === 0) {
    return "provider_returned_empty_response";
  }

  const parseAttempt = parseJsonObjectCandidate(rawText);
  if (parseAttempt.possibleTruncatedJson || responseJson.stop_reason === "max_tokens") {
    return "truncated_json";
  }

  if (parseAttempt.parseError) {
    return rawText ? "malformed_json" : "missing_structured_output";
  }

  return rawText ? "missing_structured_output" : "unsupported_provider_shape";
}

function mapAnthropicStatusError(params: {
  model: string;
  status: number;
  statusText: string;
  errorBody: string;
  requestSummary: Record<string, unknown>;
}) {
  const message = `Anthropic request failed with status ${params.status}.`;
  let errorType: string | null = null;
  let errorMessage: string | null = null;
  try {
    const parsed = JSON.parse(params.errorBody) as unknown;
    if (isRecord(parsed)) {
      const errorRecord = isRecord(parsed.error) ? parsed.error : parsed;
      errorType = typeof errorRecord.type === "string" ? errorRecord.type : null;
      errorMessage = typeof errorRecord.message === "string" ? errorRecord.message.slice(0, 600) : null;
    }
  } catch {
    // Keep the snippet-only fallback below.
  }
  const rawError = {
    status: params.status,
    statusText: params.statusText,
    responseBodySnippet: params.errorBody.slice(0, 1200),
    errorType,
    errorMessage,
    requestSummary: params.requestSummary,
  };

  if (params.status === 401 || params.status === 403) {
    return createPricingWorksheetProviderError({
      code: "provider_auth_error",
      provider: "anthropic",
      model: params.model,
      status: params.status,
      retryable: false,
      message,
      rawError,
    });
  }

  if (params.status === 429) {
    return createPricingWorksheetProviderError({
      code: "provider_rate_limited",
      provider: "anthropic",
      model: params.model,
      status: params.status,
      retryable: true,
      message,
      rawError,
    });
  }

  if (RETRYABLE_PROVIDER_STATUS_CODES.has(params.status)) {
    return createPricingWorksheetProviderError({
      code: "provider_server_error",
      provider: "anthropic",
      model: params.model,
      status: params.status,
      retryable: true,
      message,
      rawError,
    });
  }

  return createPricingWorksheetProviderError({
    code: "provider_bad_response",
    provider: "anthropic",
    model: params.model,
    status: params.status,
    retryable: false,
    message,
    rawError,
  });
}

function mapAnthropicRequestError(
  model: string,
  error: unknown,
  requestSummary?: Record<string, unknown>,
) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Upstream request timed out")) {
    return createPricingWorksheetProviderError({
      code: "provider_timeout",
      provider: "anthropic",
      model,
      retryable: true,
      message,
      rawError: {
        originalError:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : String(error),
        requestSummary: requestSummary ?? null,
      },
    });
  }

  return createPricingWorksheetProviderError({
    code: "provider_unknown_error",
    provider: "anthropic",
    model,
    retryable: true,
    message,
      rawError: {
        originalError:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : String(error),
        requestSummary: requestSummary ?? null,
      },
    });
}

function extractAnthropicUsage(responseJson: unknown): PricingWorksheetProviderResponse["usage"] | undefined {
  if (!isRecord(responseJson) || !isRecord(responseJson.usage)) {
    return undefined;
  }

  const usage = responseJson.usage;
  const inputTokens =
    typeof usage.input_tokens === "number"
      ? usage.input_tokens +
        (typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0) +
        (typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0)
      : undefined;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const totalTokens =
    inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export class AnthropicPricingWorksheetProvider implements PricingWorksheetAiProvider {
  name = "anthropic" as const;
  defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel?.trim() || DEFAULT_ANTHROPIC_MODEL;
  }

  async generateEditPlan(
    request: PricingWorksheetProviderRequest
  ): Promise<PricingWorksheetProviderResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const model = request.model.trim() || this.defaultModel;
    const warnings: string[] = [];

    if (!apiKey) {
      throw createPricingWorksheetProviderError({
        code: "provider_auth_error",
        provider: "anthropic",
        model,
        retryable: false,
        message: "ANTHROPIC_API_KEY is not configured.",
      });
    }

    let sanitizedSchema: Record<string, unknown>;
    let schemaKind: AnthropicSchemaKind;
    try {
      sanitizedSchema = buildAnthropicProviderSchema(request);
      schemaKind = getAnthropicSchemaKind(isRecord(request.metadata) ? request.metadata : null);
    } catch (error) {
      if (isPricingWorksheetProviderError(error)) {
        error.model = model;
      }
      throw error;
    }

    const unsupportedKeywordCount = collectUnsupportedAnthropicSchemaKeywords(sanitizedSchema).length;
    const optionalParameterCount = countAnthropicOptionalParameters(sanitizedSchema);
    const schemaSizeBytes = Buffer.byteLength(JSON.stringify(sanitizedSchema), "utf8");
    const useDirectJsonInterpretation = schemaKind === "worksheet_event_interpretation";
    const requestSummary = {
      workflowStage:
        isRecord(request.metadata) && typeof request.metadata.workflowStage === "string"
          ? request.metadata.workflowStage
          : "default",
      schemaKind,
      schemaSizeBytes,
      unsupportedKeywordCount,
      optionalParameterCount,
      hasWorksheetPricingPatternShadowProposalSchema: hasAnthropicWorksheetPricingPatternShadowProposalSchema(sanitizedSchema),
      hasWorksheetMemorySynthesisSchema: hasAnthropicWorksheetMemorySynthesisSchema(sanitizedSchema),
      hasWorksheetEventInterpretationSchema: hasAnthropicWorksheetEventInterpretationSchema(sanitizedSchema),
      hasTools: request.enableWebSearch,
      hasToolChoice: false,
      hasOutputConfig: !useDirectJsonInterpretation,
      outputConfigFormatType: useDirectJsonInterpretation ? null : "json_schema",
      maxTokens: request.maxOutputTokens,
      continuationCount: 0,
      anthropicVersion: ANTHROPIC_API_VERSION,
      hasAnthropicBetaHeader: false,
    } satisfies Record<string, unknown>;

    const baseMessages: Array<Record<string, unknown>> = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: request.userPrompt,
          },
        ],
      },
    ];
    const requestBodyPayload: Record<string, unknown> = {
      model,
      max_tokens: request.maxOutputTokens,
      system: buildAnthropicSystemPrompt(request),
      messages: baseMessages,
    };

    if (!useDirectJsonInterpretation) {
      requestBodyPayload.output_config = {
        format: {
          type: "json_schema",
          schema: sanitizedSchema,
        },
      };
    }

    if (request.enableWebSearch) {
      requestBodyPayload.tools = [ANTHROPIC_WEB_SEARCH_TOOL];
    }

    let responseJson: unknown = null;
    let continuationCount = 0;

    while (true) {
      const requestBody = JSON.stringify(requestBodyPayload);
      requestSummary.requestBodyBytes = Buffer.byteLength(requestBody, "utf8");
      requestSummary.continuationCount = continuationCount;

      let response: Response;
      try {
        response = await fetchWithTimeout(
          ANTHROPIC_API_URL,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_API_VERSION,
            },
            body: requestBody,
          },
          request.timeoutMs,
        );
      } catch (error) {
        throw mapAnthropicRequestError(model, error, requestSummary);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw mapAnthropicStatusError({
          model,
          status: response.status,
          statusText: response.statusText,
          errorBody,
          requestSummary,
        });
      }

      try {
        responseJson = (await response.json()) as unknown;
      } catch (error) {
        throw createPricingWorksheetProviderError({
          code: "provider_bad_response",
          provider: "anthropic",
          model,
          retryable: false,
          message: "Anthropic returned invalid JSON.",
          rawError: error,
        });
      }

      const stopReason = isRecord(responseJson) && typeof responseJson.stop_reason === "string" ? responseJson.stop_reason : null;
      if (stopReason !== "pause_turn") {
        break;
      }

      if (!Array.isArray((responseJson as Record<string, unknown>).content)) {
        break;
      }

      continuationCount += 1;
      if (continuationCount > MAX_ANTHROPIC_SERVER_TOOL_CONTINUATIONS) {
        throw createPricingWorksheetProviderError({
          code: "provider_tool_error",
          provider: "anthropic",
          model,
          retryable: true,
          message: "Anthropic web search paused too many times before completing.",
          rawError: {
            stopReason,
            continuationCount,
            responseJson,
          },
        });
      }

      requestBodyPayload.messages = [
        ...baseMessages,
        {
          role: "assistant",
          content: (responseJson as Record<string, unknown>).content,
        },
      ];
    }

    const parsedJson = extractAnthropicStructuredObject(responseJson);
    const outputText = extractAnthropicTextBlocks(responseJson).join("\n").trim();

    if (!parsedJson) {
      const parseFailureReason = classifyAnthropicResponseFailureReason(responseJson, outputText);
      const parseAttempt = parseJsonObjectCandidate(outputText);
      throw createPricingWorksheetProviderError({
        code: "provider_schema_parse_failed",
        provider: "anthropic",
        model,
        retryable: parseFailureReason === "truncated_json",
        message: `AI assistant returned an unreadable response (${parseFailureReason}).`,
        rawError: {
          parseFailureReason,
          stopReason:
            isRecord(responseJson) && typeof responseJson.stop_reason === "string" ? responseJson.stop_reason : null,
          outputTextLength: outputText.length,
          maxTokens: request.maxOutputTokens,
          parseErrorType: parseAttempt.parseError ?? null,
          responseJson,
        },
      });
    }

    const evidence = extractAnthropicEvidenceSources(responseJson);

    return {
      provider: "anthropic",
      model,
      rawProviderResponse: responseJson,
      parsedJson,
      outputText,
      evidence,
      citations: extractAnthropicCitations(responseJson),
      usage: extractAnthropicUsage(responseJson),
      warnings,
      webSearchUsed: request.enableWebSearch && (evidence.length > 0 || extractAnthropicServerToolUses(responseJson) > 0),
      effectiveWebSearchEnabled: request.enableWebSearch,
    };
  }
}
