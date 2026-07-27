import type { PricingWorksheetAiCompactContext } from "@/lib/pricing-worksheet-ai-context";

export type PricingWorksheetConstructionPrimaryIntent =
  | "answer_only"
  | "review_estimate"
  | "worksheet_edit"
  | "worksheet_generation"
  | "formula_explain"
  | "formula_generate"
  | "formula_fix"
  | "quantity_update"
  | "labour_adjustment"
  | "wastage_adjustment"
  | "margin_adjustment"
  | "quote_prepare"
  | "takeoff_bind"
  | "unknown";

export type PricingWorksheetConstructionPromptPath =
  | "answer"
  | "review"
  | "edit"
  | "generation"
  | "quote_takeoff"
  | "unknown";

export type PricingWorksheetConstructionIntent = {
  primaryIntent: PricingWorksheetConstructionPrimaryIntent;
  defaultJurisdiction: "AUS_NZ";
  requiresConstructionReasoning: boolean;
  requiresRetrieval: boolean;
  tradeHints: string[];
  systemHints: string[];
  confidence: "low" | "medium" | "high";
  riskLevel: "low" | "medium" | "high";
  shouldAskFollowUp: boolean;
  reason: string;
  matchedIntentSignals?: string[];
  matchedTradeSignals?: string[];
  matchedSystemSignals?: string[];
  matchedRiskSignals?: string[];
  retrievalReasons?: string[];
  recommendedPromptPath: PricingWorksheetConstructionPromptPath;
};

export type PricingWorksheetConstructionIntentInput = {
  userPrompt: string;
  worksheetTradePackage?: string | null;
  worksheetName?: string | null;
  worksheetContext?: PricingWorksheetAiCompactContext | null;
  selection?: PricingWorksheetAiCompactContext["visibleSelection"] | null;
  opportunityContext?: {
    projectName?: string | null;
    opportunityName?: string | null;
    location?: string | null;
  } | null;
};

type WeightedSignal = {
  phrase: string;
  weight: number;
  label?: string;
};

type IntentSignalSet = {
  intent: PricingWorksheetConstructionPrimaryIntent;
  priority: number;
  strong: WeightedSignal[];
  weak?: WeightedSignal[];
};

type IntentPatternBoost = {
  intent: PricingWorksheetConstructionPrimaryIntent;
  priority: number;
  scoreBoost: number;
  patterns: Array<{
    label: string;
    regex: RegExp;
  }>;
};

type TradeSignalSet = {
  trade: string;
  aliases: string[];
};

const INTENT_SIGNAL_SETS: IntentSignalSet[] = [
  {
    intent: "formula_fix",
    priority: 120,
    strong: [
      { phrase: "fix this formula", weight: 8 },
      { phrase: "fix formula", weight: 7 },
      { phrase: "formula error", weight: 7 },
      { phrase: "broken formula", weight: 7 },
      { phrase: "iferror", weight: 6 },
      { phrase: "return blank if error", weight: 7 },
      { phrase: "correct this formula", weight: 7 },
    ],
    weak: [
      { phrase: "fix", weight: 2 },
      { phrase: "error", weight: 2 },
      { phrase: "blank if error", weight: 3 },
    ],
  },
  {
    intent: "formula_explain",
    priority: 110,
    strong: [
      { phrase: "explain this formula", weight: 8 },
      { phrase: "what does this formula mean", weight: 8 },
      { phrase: "describe this formula", weight: 7 },
      { phrase: "summarise this formula", weight: 7 },
      { phrase: "summarize this formula", weight: 7 },
    ],
    weak: [
      { phrase: "explain", weight: 2 },
      { phrase: "describe", weight: 2 },
      { phrase: "summarise", weight: 2 },
      { phrase: "summarize", weight: 2 },
      { phrase: "why is this wrong", weight: 3 },
    ],
  },
  {
    intent: "review_estimate",
    priority: 100,
    strong: [
      { phrase: "review this estimate", weight: 8 },
      { phrase: "what am i missing", weight: 8 },
      { phrase: "check this worksheet", weight: 7 },
      { phrase: "does this look right", weight: 7 },
      { phrase: "review estimate", weight: 7 },
      { phrase: "missing scope", weight: 7 },
      { phrase: "missing items", weight: 7 },
    ],
    weak: [
      { phrase: "review", weight: 3 },
      { phrase: "check labour", weight: 4 },
      { phrase: "check wastage", weight: 4 },
      { phrase: "review formulas", weight: 4 },
      { phrase: "look right", weight: 3 },
    ],
  },
  {
    intent: "takeoff_bind",
    priority: 95,
    strong: [
      { phrase: "use takeoff", weight: 8 },
      { phrase: "from takeoff", weight: 7 },
      { phrase: "use measured quantity", weight: 8 },
      { phrase: "use measured quantities", weight: 8 },
      { phrase: "use measured area", weight: 8 },
      { phrase: "use measurements", weight: 7 },
      { phrase: "from measuring", weight: 7 },
      { phrase: "from plans", weight: 6 },
    ],
    weak: [
      { phrase: "takeoff", weight: 4 },
      { phrase: "measured", weight: 3 },
      { phrase: "measurements", weight: 3 },
      { phrase: "plans", weight: 2 },
    ],
  },
  {
    intent: "quote_prepare",
    priority: 90,
    strong: [
      { phrase: "send this subtotal to quote", weight: 9 },
      { phrase: "send to quote", weight: 8 },
      { phrase: "prepare quote", weight: 8 },
      { phrase: "quote line", weight: 8 },
      { phrase: "quote lines", weight: 8 },
      { phrase: "quote section", weight: 8 },
    ],
    weak: [
      { phrase: "to quote", weight: 4 },
      { phrase: "proposal", weight: 3 },
      { phrase: "quote", weight: 2 },
    ],
  },
  {
    intent: "worksheet_generation",
    priority: 85,
    strong: [
      { phrase: "create me spreadsheet", weight: 11 },
      { phrase: "create spreadsheet", weight: 10 },
      { phrase: "build spreadsheet", weight: 10 },
      { phrase: "create me worksheet", weight: 10 },
      { phrase: "build calculator", weight: 8 },
      { phrase: "create worksheet", weight: 8 },
      { phrase: "build worksheet", weight: 9 },
      { phrase: "generate estimate", weight: 8 },
      { phrase: "build pricing sheet", weight: 8 },
      { phrase: "create template", weight: 7 },
      { phrase: "build pricing worksheet", weight: 8 },
    ],
    weak: [
      { phrase: "spreadsheet", weight: 5 },
      { phrase: "create calculator", weight: 5 },
      { phrase: "generate worksheet", weight: 5 },
      { phrase: "estimate worksheet", weight: 5 },
      { phrase: "build", weight: 2 },
      { phrase: "worksheet", weight: 2 },
      { phrase: "template", weight: 3 },
    ],
  },
  {
    intent: "formula_generate",
    priority: 80,
    strong: [
      { phrase: "create formula", weight: 8 },
      { phrase: "create formulas", weight: 8 },
      { phrase: "add formula", weight: 8 },
      { phrase: "put formula", weight: 8 },
      { phrase: "formula for", weight: 7 },
      { phrase: "calculate", weight: 5 },
    ],
    weak: [
      { phrase: "multiply", weight: 3 },
      { phrase: "divide", weight: 3 },
      { phrase: "sum", weight: 2 },
      { phrase: "round", weight: 2 },
      { phrase: "formula", weight: 2 },
    ],
  },
  {
    intent: "quantity_update",
    priority: 75,
    strong: [
      { phrase: "update quantity", weight: 8 },
      { phrase: "update quantities", weight: 8 },
      { phrase: "use perimeter", weight: 7 },
      { phrase: "measured quantity", weight: 7 },
    ],
    weak: [
      { phrase: "quantity", weight: 2 },
      { phrase: "quantities", weight: 2 },
      { phrase: "measured area", weight: 4 },
      { phrase: "perimeter", weight: 3 },
    ],
  },
  {
    intent: "labour_adjustment",
    priority: 70,
    strong: [
      { phrase: "change labour", weight: 8 },
      { phrase: "add labour", weight: 8 },
      { phrase: "adjust labour", weight: 8 },
      { phrase: "install rate", weight: 7 },
      { phrase: "productivity", weight: 6 },
    ],
    weak: [
      { phrase: "labour", weight: 4 },
      { phrase: "crew", weight: 3 },
      { phrase: "hours", weight: 3 },
      { phrase: "man days", weight: 3 },
      { phrase: "man-hours", weight: 3 },
      { phrase: "man hours", weight: 3 },
    ],
  },
  {
    intent: "wastage_adjustment",
    priority: 65,
    strong: [
      { phrase: "add 10% wastage", weight: 8 },
      { phrase: "add wastage", weight: 7 },
      { phrase: "adjust wastage", weight: 7 },
      { phrase: "adjust waste", weight: 7 },
    ],
    weak: [
      { phrase: "wastage", weight: 4 },
      { phrase: "waste", weight: 4 },
      { phrase: "allowance", weight: 2 },
      { phrase: "overage", weight: 2 },
    ],
  },
  {
    intent: "margin_adjustment",
    priority: 67,
    strong: [
      { phrase: "adjust margin", weight: 8 },
      { phrase: "change margin", weight: 8 },
      { phrase: "update margin", weight: 8 },
      { phrase: "adjust markup", weight: 8 },
      { phrase: "change markup", weight: 8 },
      { phrase: "update markup", weight: 8 },
    ],
    weak: [
      { phrase: "margin", weight: 4 },
      { phrase: "markup", weight: 4 },
      { phrase: "mark up", weight: 4 },
    ],
  },
  {
    intent: "worksheet_edit",
    priority: 60,
    strong: [
      { phrase: "add row", weight: 8 },
      { phrase: "add item", weight: 8 },
      { phrase: "include", weight: 4 },
      { phrase: "remove", weight: 5 },
      { phrase: "update this estimate", weight: 8 },
      { phrase: "amend", weight: 5 },
      { phrase: "adjust", weight: 4 },
      { phrase: "highlight input cells", weight: 10 },
      { phrase: "highlight fillable cells", weight: 10 },
      { phrase: "identify input cells", weight: 9 },
      { phrase: "show cells to fill in", weight: 9 },
      { phrase: "color input cells", weight: 9 },
      { phrase: "colour input cells", weight: 9 },
    ],
    weak: [
      { phrase: "add", weight: 2 },
      { phrase: "update", weight: 3 },
      { phrase: "change", weight: 3 },
      { phrase: "insert", weight: 3 },
      { phrase: "highlight", weight: 4 },
      { phrase: "color", weight: 3 },
      { phrase: "colour", weight: 3 },
      { phrase: "mark", weight: 3 },
      { phrase: "shade", weight: 3 },
    ],
  },
  {
    intent: "answer_only",
    priority: 10,
    strong: [
      { phrase: "what is", weight: 4 },
      { phrase: "why is", weight: 4 },
    ],
    weak: [
      { phrase: "explain", weight: 2 },
      { phrase: "describe", weight: 2 },
      { phrase: "summarise", weight: 2 },
      { phrase: "summarize", weight: 2 },
      { phrase: "why", weight: 2 },
    ],
  },
];

const INTENT_PATTERN_BOOSTS: IntentPatternBoost[] = [
  {
    intent: "worksheet_generation",
    priority: 160,
    scoreBoost: 20,
    patterns: [
      {
        label: "action:create_build_generate_worksheet",
        regex:
          /\b(?:create|build|generate)\b[\s\S]{0,60}\b(?:pricing worksheet|estimate worksheet|estimate template|pricing template|pricing sheet|worksheet|template|spreadsheet|calculator)\b/,
      },
      {
        label: "action:full_pricing_template",
        regex: /\b(?:create|build|generate)\b[\s\S]{0,60}\b(?:full|starter|commercial)?[\s\S]{0,20}\b(?:pricing|estimate)\b[\s\S]{0,20}\b(?:template|worksheet|sheet)\b/,
      },
    ],
  },
  {
    intent: "review_estimate",
    priority: 150,
    scoreBoost: 18,
    patterns: [
      {
        label: "action:review_audit_worksheet",
        regex:
          /\b(?:review|audit|check|inspect)\b[\s\S]{0,60}\b(?:worksheet|estimate|pricing|formula|formulas|totals?|risks?)\b/,
      },
      {
        label: "action:find_missing_review",
        regex: /\bfind\b[\s\S]{0,20}\bmissing\b[\s\S]{0,40}\b(?:items?|rows?|labou?r|materials?|scope|formulas?|totals?)\b/,
      },
    ],
  },
  {
    intent: "worksheet_edit",
    priority: 140,
    scoreBoost: 16,
    patterns: [
      {
        label: "action:edit_worksheet_structure",
        regex:
          /\b(?:add|insert|update|modify|adjust|change|remove|fix|fill|apply)\b[\s\S]{0,60}\b(?:worksheet|sheet|row|rows|cell|cells|section|sections|totals?|subtotal|template)\b/,
      },
      {
        label: "action:edit_formula_in_worksheet",
        regex:
          /\b(?:add|insert|update|apply|write|fix)\b[\s\S]{0,30}\bformula\b[\s\S]{0,40}\b(?:worksheet|sheet|cell|cells|row|rows|totals?|section)\b/,
      },
      {
        label: "action:update_allowances",
        regex:
          /\b(?:add|insert|update|modify|adjust|change)\b[\s\S]{0,30}\b(?:labou?r|wastage|waste|margin|markup|mark up|materials?)\b[\s\S]{0,20}\ballowances?\b/,
      },
      {
        label: "action:insert_missing_rows",
        regex: /\b(?:insert|add)\b[\s\S]{0,20}\bmissing\b[\s\S]{0,20}\b(?:rows?|materials?|items?)\b/,
      },
      {
        label: "action:highlight_or_color_inputs",
        regex:
          /\b(?:highlight|colour|color|mark|shade|identify|show)\b[\s\S]{0,60}\b(?:input|fillable|fill in|manual input|cells?|areas?)\b/,
      },
    ],
  },
  {
    intent: "answer_only",
    priority: 130,
    scoreBoost: 15,
    patterns: [
      {
        label: "action:formula_question",
        regex: /\b(?:what formula should i use|how do i calculate|how to calculate|difference between|vs\.?|versus)\b/,
      },
      {
        label: "action:pricing_question",
        regex: /\b(?:what is|how do i|how should i|when should i|why does)\b/,
      },
    ],
  },
];

const TRADE_SIGNAL_SETS: TradeSignalSet[] = [
  { trade: "partitions", aliases: ["partition", "partitions", "stud wall", "wall framing", "wall estimate"] },
  { trade: "ceilings", aliases: ["ceiling", "ceilings", "suspended ceiling", "ceiling grid", "grid ceiling"] },
  { trade: "plasterboard", aliases: ["plasterboard", "gib", "gib board", "gyprock", "drywall", "internal linings"] },
  { trade: "painting", aliases: ["paint", "painting", "coating", "primer", "sealer coat"] },
  { trade: "flooring", aliases: ["flooring", "vinyl", "carpet", "timber floor", "floor finish"] },
  { trade: "tiling", aliases: ["tile", "tiling", "tiles", "grout", "screed"] },
  { trade: "concrete", aliases: ["concrete", "slab", "footing", "rebar", "reinforcement"] },
  { trade: "carpentry", aliases: ["carpentry", "timber framing", "framing", "trimming", "nogs", "nogging"] },
  { trade: "joinery", aliases: ["joinery", "cabinetry", "millwork", "benchtop"] },
  { trade: "roofing", aliases: ["roof", "roofing", "flashings", "roof sheet", "membrane roof"] },
  { trade: "cladding", aliases: ["cladding", "weatherboard", "panel facade", "panel façade", "rainscreen"] },
  { trade: "insulation", aliases: ["insulation", "blanket", "batts", "thermal insulation"] },
  { trade: "waterproofing", aliases: ["waterproofing", "waterproof", "membrane", "tankings", "wet area membrane"] },
  { trade: "fire_stopping", aliases: ["fire stopping", "firestop", "fire seal", "fire caulk", "penetration seal"] },
  { trade: "electrical", aliases: ["electrical", "cable tray", "tray", "conduit", "switchboard", "submain", "power"] },
  { trade: "plumbing", aliases: ["plumbing", "hydraulic", "pipework", "sanitary", "water supply", "waste pipe"] },
  { trade: "hvac_mechanical", aliases: ["hvac", "mechanical", "ductwork", "duct", "air handling", "diffuser", "grille"] },
  { trade: "civil_works", aliases: ["civil", "roadworks", "subgrade", "retaining", "external civil"] },
  { trade: "excavation", aliases: ["excavation", "excavate", "dig out", "bulk excavation"] },
  { trade: "drainage", aliases: ["drainage", "stormwater", "sewer", "drain", "civil drainage"] },
  { trade: "landscaping", aliases: ["landscaping", "softscape", "hardscape", "planting", "irrigation"] },
  { trade: "demolition", aliases: ["demolition", "demo", "stripout", "strip out", "make good demo"] },
  { trade: "structural_steel", aliases: ["structural steel", "steel beam", "pfc", "ub", "uc", "rhs", "shs"] },
  { trade: "glazing", aliases: ["glazing", "glass", "window wall", "shopfront", "glazed screen"] },
  { trade: "doors_hardware", aliases: ["door", "doors", "hardware", "ironmongery", "door set"] },
  { trade: "facade_works", aliases: ["facade", "façade", "curtain wall", "screen", "external envelope"] },
  { trade: "fitout", aliases: ["fitout", "fit-out", "interior fitout", "tenancy fitout"] },
  { trade: "external_works", aliases: ["external works", "paving", "kerb", "kerb and channel", "asphalt"] },
];

const SYSTEM_SIGNALS = [
  "rondo",
  "key-lock",
  "key lock",
  "seismic",
  "acoustic",
  "fire-rated",
  "fire rated",
  "fire stopping",
  "cable tray",
  "ductwork",
  "waterproofing membrane",
  "sheet membrane",
  "liquid membrane",
  "sealant",
  "head track",
  "bulkhead",
  "suspension system",
  "expansion joint",
  "penetration seal",
];

const HIGH_RISK_SIGNALS = [
  "seismic",
  "fire",
  "acoustic",
  "structural",
  "compliance",
  "waterproofing compliance",
  "electrical compliance",
  "plumbing compliance",
  "hydraulic compliance",
  "safety",
];

const SPEC_REFERENCE_SIGNALS = [
  "aus",
  "nz",
  "australia",
  "new zealand",
  "reference",
  "references",
  "spec",
  "specification",
  "manufacturer",
  "manual",
  "compliance",
  "standard",
  "as/nzs",
  "ncc",
];

const CONSTRUCTION_LOGIC_SIGNALS = [
  "system",
  "manufacturer",
  "fire",
  "acoustic",
  "seismic",
  "structural",
  "waterproofing",
  "ductwork",
  "cable tray",
  "membrane",
  "sealant",
];

const DEFINITIVE_EDIT_SIGNALS = [
  "update",
  "add",
  "change",
  "fix",
  "create",
  "generate",
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function buildColumnReferenceRegex(source: string) {
  return new RegExp(source, "i");
}

const COLUMN_REFERENCE_PATTERNS = [
  {
    label: "target:column_letter",
    regex: buildColumnReferenceRegex(String.raw`\bcol(?:umn)?\s+[a-z]{1,3}\b`),
  },
  {
    label: "target:letter_column",
    regex: buildColumnReferenceRegex(String.raw`\b[a-z]{1,3}\s+column\b`),
  },
  {
    label: "target:cell_range",
    regex: buildColumnReferenceRegex(String.raw`\bcells?\s+[a-z]{1,3}\d+\s*:\s*[a-z]{1,3}\d+\b`),
  },
  {
    label: "target:cell_ref",
    regex: buildColumnReferenceRegex(String.raw`\bcell\s+[a-z]{1,3}\d+\b`),
  },
];

const FORMULA_FIX_TARGET_PATTERNS = [
  {
    label: "action:fix_formulas_with_target",
    regex:
      /\b(?:fix|repair|correct|complete|finish)\b[\s\S]{0,20}\b(?:missing\s+)?formulas?\b[\s\S]{0,40}\b(?:column|col|cells?|[a-z]{1,3}\s+column)\b/i,
  },
  {
    label: "action:review_fix_formulas_with_target",
    regex:
      /\b(?:review|check|audit)\b[\s\S]{0,40}\b(?:column|col|cells?|[a-z]{1,3}\s+column)\b[\s\S]{0,40}\b(?:fix|repair|correct|complete)\b[\s\S]{0,20}\b(?:missing\s+)?formulas?\b/i,
  },
];

const FORMULA_GENERATE_TARGET_PATTERNS = [
  {
    label: "action:create_formulas_with_target",
    regex:
      /\b(?:create|add|fill|populate|write|insert|put|generate)\b[\s\S]{0,20}\bformulas?\b[\s\S]{0,40}\b(?:column|col|cells?|[a-z]{1,3}\s+column)\b/i,
  },
  {
    label: "action:review_create_formulas_with_target",
    regex:
      /\b(?:review|check|audit)\b[\s\S]{0,50}\b(?:create|add|fill|populate|write|insert|put|generate)\b[\s\S]{0,20}\bformulas?\b[\s\S]{0,40}\b(?:column|col|cells?|[a-z]{1,3}\s+column)\b/i,
  },
];

function hasPhrase(text: string, phrase: string) {
  return text.includes(phrase);
}

function detectPromptLevelColumnReference(promptText: string) {
  return COLUMN_REFERENCE_PATTERNS
    .filter((pattern) => pattern.regex.test(promptText))
    .map((pattern) => pattern.label);
}

function detectExplicitFormulaMutationIntent(promptText: string) {
  const targetSignals = detectPromptLevelColumnReference(promptText);
  if (targetSignals.length === 0) {
    return null;
  }

  const fixSignals = FORMULA_FIX_TARGET_PATTERNS
    .filter((pattern) => pattern.regex.test(promptText))
    .map((pattern) => pattern.label);
  if (fixSignals.length > 0) {
    return {
      intent: "formula_fix" as const,
      matchedSignals: unique([...fixSignals, ...targetSignals]),
    };
  }

  const generateSignals = FORMULA_GENERATE_TARGET_PATTERNS
    .filter((pattern) => pattern.regex.test(promptText))
    .map((pattern) => pattern.label);
  if (generateSignals.length > 0) {
    return {
      intent: "formula_generate" as const,
      matchedSignals: unique([...generateSignals, ...targetSignals]),
    };
  }

  return null;
}

function collectWorksheetSupportText(input: PricingWorksheetConstructionIntentInput) {
  const rowText = (input.worksheetContext?.rows ?? [])
    .flatMap((row) => [row.label ?? "", ...row.values])
    .join(" ");
  const headerText = (input.worksheetContext?.headers ?? []).join(" ");
  const sectionText = (input.worksheetContext?.sections ?? []).join(" ");

  return normalizeText(
    [
      input.worksheetTradePackage,
      input.worksheetName,
      headerText,
      sectionText,
      rowText,
      input.opportunityContext?.projectName,
      input.opportunityContext?.opportunityName,
      input.opportunityContext?.location,
    ].join(" "),
  );
}

function scoreIntent(promptText: string) {
  const explicitFormulaMutationIntent = detectExplicitFormulaMutationIntent(promptText);
  const scored = INTENT_SIGNAL_SETS.map((set) => {
    const matchedSignals: string[] = [];
    let score = 0;

    for (const signal of set.strong) {
      if (hasPhrase(promptText, signal.phrase)) {
        score += signal.weight;
        matchedSignals.push(signal.label ?? signal.phrase);
      }
    }

    for (const signal of set.weak ?? []) {
      if (hasPhrase(promptText, signal.phrase)) {
        score += signal.weight;
        matchedSignals.push(signal.label ?? signal.phrase);
      }
    }

    return {
      intent: set.intent,
      priority: set.priority,
      score,
      matchedSignals,
    };
  });

  for (const boost of INTENT_PATTERN_BOOSTS) {
    const matchedBoostSignals = boost.patterns
      .filter((pattern) => pattern.regex.test(promptText))
      .map((pattern) => pattern.label);
    if (matchedBoostSignals.length === 0) {
      continue;
    }

    const existing = scored.find((entry) => entry.intent === boost.intent);
    if (!existing) {
      continue;
    }

    existing.score += boost.scoreBoost;
    existing.priority = Math.max(existing.priority, boost.priority);
    existing.matchedSignals = unique([...existing.matchedSignals, ...matchedBoostSignals]);
  }

  if (explicitFormulaMutationIntent) {
    const existing = scored.find((entry) => entry.intent === explicitFormulaMutationIntent.intent);
    if (existing) {
      existing.score += 30;
      existing.priority = Math.max(existing.priority, 170);
      existing.matchedSignals = unique([...existing.matchedSignals, ...explicitFormulaMutationIntent.matchedSignals]);
    }
  }

  const top = [...scored].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.priority - left.priority;
  })[0];

  if (!top || top.score <= 0) {
    const fallback =
      promptText.includes("formula")
        ? {
            intent: "formula_generate" as const,
            matchedSignals: ["formula:fallback"],
          }
        : promptText.includes("review") || promptText.includes("check")
          ? {
              intent: "review_estimate" as const,
              matchedSignals: ["review:fallback"],
            }
          : {
              intent: "unknown" as const,
              matchedSignals: [],
            };

    return {
      primaryIntent: fallback.intent,
      matchedIntentSignals: fallback.matchedSignals,
      score: 0,
      secondBestScore: 0,
    };
  }

  const secondBestScore = [...scored]
    .filter((entry) => entry.intent !== top.intent)
    .sort((left, right) => right.score - left.score || right.priority - left.priority)[0]?.score ?? 0;

  return {
    primaryIntent: top.intent,
    matchedIntentSignals: unique(top.matchedSignals),
    score: top.score,
    secondBestScore,
  };
}

function detectTradeHints(promptText: string, supportText: string) {
  const text = normalizeText(`${promptText} ${supportText}`);
  const matches = TRADE_SIGNAL_SETS.flatMap((set) => {
    const matchedAliases = set.aliases.filter((alias) => hasPhrase(text, alias));
    if (matchedAliases.length === 0) {
      return [];
    }

    return [
      {
        trade: set.trade,
        signals: matchedAliases.map((alias) => `${set.trade}:${alias}`),
      },
    ];
  });

  return {
    tradeHints: matches.map((entry) => entry.trade).slice(0, 10),
    matchedTradeSignals: unique(matches.flatMap((entry) => entry.signals)).slice(0, 20),
  };
}

function detectSystemHints(promptText: string, supportText: string) {
  const text = normalizeText(`${promptText} ${supportText}`);
  const matched = SYSTEM_SIGNALS.filter((signal) => hasPhrase(text, signal));

  return {
    systemHints: unique(matched).slice(0, 10),
    matchedSystemSignals: unique(matched.map((signal) => `system:${signal}`)).slice(0, 20),
  };
}

function determineConfidence(params: {
  primaryIntent: PricingWorksheetConstructionPrimaryIntent;
  intentScore: number;
  secondBestScore: number;
  tradeHints: string[];
  systemHints: string[];
}) {
  if (params.primaryIntent === "unknown") {
    return "low" as const;
  }

  const scoreGap = params.intentScore - params.secondBestScore;
  const specificityBoost = params.tradeHints.length + params.systemHints.length;

  if (params.intentScore >= 8 && scoreGap >= 3) {
    return "high" as const;
  }

  if (params.intentScore >= 5 || specificityBoost > 0) {
    return "medium" as const;
  }

  return "low" as const;
}

function determineRequiresConstructionReasoning(params: {
  primaryIntent: PricingWorksheetConstructionPrimaryIntent;
  promptText: string;
  worksheetTradePackage?: string | null;
  tradeHints: string[];
  systemHints: string[];
}) {
  if (params.primaryIntent === "formula_explain" || params.primaryIntent === "answer_only") {
    return hasPhrase(params.promptText, "construction") || hasPhrase(params.promptText, "estimate");
  }

  if (
    params.primaryIntent === "review_estimate" ||
    params.primaryIntent === "worksheet_edit" ||
    params.primaryIntent === "worksheet_generation" ||
    params.primaryIntent === "quantity_update" ||
    params.primaryIntent === "labour_adjustment" ||
    params.primaryIntent === "margin_adjustment" ||
    params.primaryIntent === "wastage_adjustment" ||
    params.primaryIntent === "quote_prepare" ||
    params.primaryIntent === "takeoff_bind"
  ) {
    return true;
  }

  if (params.primaryIntent === "formula_generate" || params.primaryIntent === "formula_fix") {
    return (
      params.tradeHints.length > 0 ||
      params.systemHints.length > 0 ||
      normalizeText(params.worksheetTradePackage).length > 0 ||
      hasPhrase(params.promptText, "estimate")
    );
  }

  return params.tradeHints.length > 0 || params.systemHints.length > 0;
}

function determineRetrieval(params: {
  primaryIntent: PricingWorksheetConstructionPrimaryIntent;
  promptText: string;
  tradeHints: string[];
  systemHints: string[];
  requiresConstructionReasoning: boolean;
}) {
  const retrievalReasons: string[] = [];

  if (SPEC_REFERENCE_SIGNALS.some((signal) => hasPhrase(params.promptText, signal))) {
    retrievalReasons.push("prompt_requests_reference_or_compliance_context");
  }

  if (params.systemHints.length > 0) {
    retrievalReasons.push("manufacturer_or_system_named");
  }

  if (HIGH_RISK_SIGNALS.some((signal) => hasPhrase(params.promptText, signal))) {
    retrievalReasons.push("high_risk_compliance_topic");
  }

  if (
    (params.primaryIntent === "formula_generate" ||
      params.primaryIntent === "formula_fix" ||
      params.primaryIntent === "worksheet_edit" ||
      params.primaryIntent === "worksheet_generation") &&
    CONSTRUCTION_LOGIC_SIGNALS.some((signal) => hasPhrase(params.promptText, signal))
  ) {
    retrievalReasons.push("edit_or_generation_depends_on_real_construction_system_logic");
  }

  if (
    params.requiresConstructionReasoning &&
    params.primaryIntent === "worksheet_generation" &&
    params.tradeHints.length === 0 &&
    params.systemHints.length === 0
  ) {
    retrievalReasons.push("high_reasoning_need_but_low_system_clarity");
  }

  return {
    requiresRetrieval: retrievalReasons.length > 0,
    retrievalReasons: unique(retrievalReasons),
  };
}

function determineRiskLevel(params: {
  primaryIntent: PricingWorksheetConstructionPrimaryIntent;
  promptText: string;
  retrievalReasons: string[];
}) {
  const matchedRiskSignals = unique(
    HIGH_RISK_SIGNALS.filter((signal) => hasPhrase(params.promptText, signal)).map((signal) => `risk:${signal}`),
  );

  if (
    matchedRiskSignals.length > 0 ||
    params.primaryIntent === "worksheet_generation" ||
    params.primaryIntent === "quote_prepare" ||
    params.primaryIntent === "takeoff_bind"
  ) {
    return {
      riskLevel: "high" as const,
      matchedRiskSignals: unique(
        [
          ...matchedRiskSignals,
          ...(params.primaryIntent === "worksheet_generation" ? ["risk:major_generation"] : []),
          ...(params.primaryIntent === "quote_prepare" || params.primaryIntent === "takeoff_bind"
            ? ["risk:commercial_binding"]
            : []),
        ].filter(Boolean),
      ),
    };
  }

  if (
    params.primaryIntent === "worksheet_edit" ||
    params.primaryIntent === "formula_generate" ||
    params.primaryIntent === "formula_fix" ||
    params.primaryIntent === "quantity_update" ||
    params.primaryIntent === "labour_adjustment" ||
    params.primaryIntent === "margin_adjustment" ||
    params.primaryIntent === "wastage_adjustment" ||
    params.primaryIntent === "review_estimate" ||
    params.retrievalReasons.length > 0
  ) {
    return {
      riskLevel: "medium" as const,
      matchedRiskSignals,
    };
  }

  return {
    riskLevel: "low" as const,
    matchedRiskSignals,
  };
}

function determineShouldAskFollowUp(params: {
  primaryIntent: PricingWorksheetConstructionPrimaryIntent;
  promptText: string;
  confidence: "low" | "medium" | "high";
  riskLevel: "low" | "medium" | "high";
  requiresRetrieval: boolean;
  tradeHints: string[];
  systemHints: string[];
  worksheetContext?: PricingWorksheetAiCompactContext | null;
}) {
  if (params.riskLevel === "high" && params.confidence !== "high") {
    return true;
  }

  if (
    params.requiresRetrieval &&
    HIGH_RISK_SIGNALS.some((signal) => hasPhrase(params.promptText, signal)) &&
    DEFINITIVE_EDIT_SIGNALS.some((signal) => hasPhrase(params.promptText, signal))
  ) {
    return true;
  }

  if (
    params.primaryIntent === "worksheet_generation" &&
    params.confidence !== "high" &&
    params.tradeHints.length === 0 &&
    params.systemHints.length === 0
  ) {
    return true;
  }

  if (
    params.primaryIntent === "formula_generate" &&
    params.systemHints.length > 0 &&
    !(
      hasPhrase(params.promptText, "using") ||
      hasPhrase(params.promptText, "based on") ||
      hasPhrase(params.promptText, "from") ||
      hasPhrase(params.promptText, "per") ||
      hasPhrase(params.promptText, "m2") ||
      hasPhrase(params.promptText, "m²") ||
      hasPhrase(params.promptText, "lm")
    )
  ) {
    return true;
  }

  if (
    params.primaryIntent === "formula_generate" &&
    params.systemHints.length > 0 &&
    (params.worksheetContext?.populatedCellCount ?? 0) <= 2
  ) {
    return true;
  }

  return false;
}

function mapRecommendedPromptPath(
  primaryIntent: PricingWorksheetConstructionPrimaryIntent,
): PricingWorksheetConstructionPromptPath {
  if (primaryIntent === "answer_only" || primaryIntent === "formula_explain") {
    return "answer";
  }

  if (primaryIntent === "review_estimate") {
    return "review";
  }

  if (
    primaryIntent === "worksheet_edit" ||
    primaryIntent === "formula_generate" ||
    primaryIntent === "formula_fix" ||
    primaryIntent === "quantity_update" ||
    primaryIntent === "labour_adjustment" ||
    primaryIntent === "margin_adjustment" ||
    primaryIntent === "wastage_adjustment"
  ) {
    return "edit";
  }

  if (primaryIntent === "worksheet_generation") {
    return "generation";
  }

  if (primaryIntent === "quote_prepare" || primaryIntent === "takeoff_bind") {
    return "quote_takeoff";
  }

  return "unknown";
}

export function classifyPricingWorksheetConstructionIntent(
  input: PricingWorksheetConstructionIntentInput,
): PricingWorksheetConstructionIntent {
  const promptText = normalizeText(input.userPrompt);
  const worksheetSupportText = collectWorksheetSupportText(input);
  const intentScore = scoreIntent(promptText);
  const tradeDetection = detectTradeHints(promptText, worksheetSupportText);
  const systemDetection = detectSystemHints(promptText, worksheetSupportText);
  const confidence = determineConfidence({
    primaryIntent: intentScore.primaryIntent,
    intentScore: intentScore.score,
    secondBestScore: intentScore.secondBestScore,
    tradeHints: tradeDetection.tradeHints,
    systemHints: systemDetection.systemHints,
  });
  const requiresConstructionReasoning = determineRequiresConstructionReasoning({
    primaryIntent: intentScore.primaryIntent,
    promptText,
    worksheetTradePackage: input.worksheetTradePackage,
    tradeHints: tradeDetection.tradeHints,
    systemHints: systemDetection.systemHints,
  });
  const retrieval = determineRetrieval({
    primaryIntent: intentScore.primaryIntent,
    promptText,
    tradeHints: tradeDetection.tradeHints,
    systemHints: systemDetection.systemHints,
    requiresConstructionReasoning,
  });
  const risk = determineRiskLevel({
    primaryIntent: intentScore.primaryIntent,
    promptText,
    retrievalReasons: retrieval.retrievalReasons,
  });
  const shouldAskFollowUp = determineShouldAskFollowUp({
    primaryIntent: intentScore.primaryIntent,
    promptText,
    confidence,
    riskLevel: risk.riskLevel,
    requiresRetrieval: retrieval.requiresRetrieval,
    tradeHints: tradeDetection.tradeHints,
    systemHints: systemDetection.systemHints,
    worksheetContext: input.worksheetContext,
  });
  const recommendedPromptPath = mapRecommendedPromptPath(intentScore.primaryIntent);

  return {
    primaryIntent: intentScore.primaryIntent,
    defaultJurisdiction: "AUS_NZ",
    requiresConstructionReasoning,
    requiresRetrieval: retrieval.requiresRetrieval,
    tradeHints: tradeDetection.tradeHints,
    systemHints: systemDetection.systemHints,
    confidence,
    riskLevel: risk.riskLevel,
    shouldAskFollowUp,
    reason: [
      `Intent classified as ${intentScore.primaryIntent}.`,
      intentScore.matchedIntentSignals.length > 0
        ? `Prompt signals: ${intentScore.matchedIntentSignals.join(", ")}.`
        : "No strong prompt signals matched.",
      tradeDetection.tradeHints.length > 0
        ? `Trade hints: ${tradeDetection.tradeHints.join(", ")}.`
        : "No strong trade hints detected.",
      systemDetection.systemHints.length > 0
        ? `System hints: ${systemDetection.systemHints.join(", ")}.`
        : "No strong system hints detected.",
      requiresConstructionReasoning
        ? "Construction reasoning should be considered."
        : "Construction reasoning is likely not required.",
      retrieval.requiresRetrieval
        ? `Retrieval should be considered because ${retrieval.retrievalReasons.join(", ")}.`
        : "Retrieval is likely unnecessary for this first pass.",
      shouldAskFollowUp ? "A follow-up question is recommended." : "A follow-up question is likely unnecessary.",
    ].join(" "),
    matchedIntentSignals: intentScore.matchedIntentSignals,
    matchedTradeSignals: tradeDetection.matchedTradeSignals,
    matchedSystemSignals: systemDetection.matchedSystemSignals,
    matchedRiskSignals: risk.matchedRiskSignals,
    retrievalReasons: retrieval.retrievalReasons,
    recommendedPromptPath,
  };
}
