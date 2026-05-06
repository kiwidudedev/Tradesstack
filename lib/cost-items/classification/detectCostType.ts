import { getWorkTypeDefaultCostType } from "./workTypeDefaultCostTypes";

export type CostType = "LAB" | "MAT" | "LAB_MAT" | "SUB" | "PLN" | "FRT" | "WST" | "DES" | "CMS";

export type DetectCostTypeResult = {
  costType: CostType;
  needsReview: boolean;
  source: "explicit" | "work_type_default" | "fallback";
};

const RULES: Array<{ type: CostType; keywords: string[] }> = [
  { type: "LAB", keywords: ["install", "installation", "fit", "fix", "labour", "labor", "apply", "lay", "paint", "stop", "sand"] },
  { type: "SUB", keywords: ["subcontract", "subbie", "specialist install", "by others"] },
  { type: "PLN", keywords: ["scissor lift", "lift hire", "excavator", "telehandler", "plant hire", "equipment hire"] },
  { type: "FRT", keywords: ["freight", "delivery", "cartage", "shipping"] },
  { type: "WST", keywords: ["waste", "dump", "skip", "disposal"] },
  { type: "DES", keywords: ["shop drawing", "design", "engineering", "ps1", "ps2", "calc", "calculations"] },
  { type: "CMS", keywords: ["commissioning", "testing", "balancing", "certification", "sign off", "signoff"] },
  { type: "MAT", keywords: ["supply", "supply only", "material", "materials", "sheet", "door", "window", "tile", "tapware", "cable", "pipe"] },
];

const COMBINED_LAB_MAT_PHRASES = [
  "supply and install",
  "supply & install",
  "supply and fix",
  "supply & fix",
  "provide and install",
];

const SUBCONTRACT_PHRASES = [
  "subcontract",
  "subbie",
  "by others",
  "supply by others",
  "install by others",
  "specialist install",
];

const PLANT_PHRASES = [
  "hire",
  "scissor lift",
  "plant hire",
  "equipment hire",
  "lift hire",
  "excavator",
  "telehandler",
];

const MATERIAL_ONLY_PHRASES = [
  "supply only",
  "material only",
];

const LABOUR_ONLY_PHRASES = [
  "install only",
  "install ",
  "installation",
  "fix ",
  " fit ",
  "lay ",
  "apply ",
];

function containsAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function detectCostType(
  text: string,
  context?: {
    workType?: string | null;
  }
): DetectCostTypeResult {
  const t = ` ${text.toLowerCase().trim()} `;

  if (containsAny(t, COMBINED_LAB_MAT_PHRASES)) {
    return { costType: "LAB_MAT", needsReview: false, source: "explicit" };
  }

  if (containsAny(t, SUBCONTRACT_PHRASES)) {
    return { costType: "SUB", needsReview: false, source: "explicit" };
  }

  if (containsAny(t, PLANT_PHRASES)) {
    return { costType: "PLN", needsReview: false, source: "explicit" };
  }

  if (containsAny(t, MATERIAL_ONLY_PHRASES) || t.startsWith(" supply ")) {
    return { costType: "MAT", needsReview: false, source: "explicit" };
  }

  if (containsAny(t, LABOUR_ONLY_PHRASES) || t.startsWith(" install ")) {
    return { costType: "LAB", needsReview: false, source: "explicit" };
  }

  const workTypeDefault = getWorkTypeDefaultCostType(context?.workType);
  if (workTypeDefault) {
    return {
      costType: workTypeDefault.costType,
      needsReview: workTypeDefault.needsReview === true,
      source: "work_type_default",
    };
  }

  let bestType: CostType = "MAT";
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (t.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = rule.type;
    }
  }

  return {
    costType: bestType,
    needsReview: bestScore === 0,
    source: "fallback",
  };
}
