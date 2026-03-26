export interface SpecFinishesPageSignal {
  isRelevant: boolean;
  score: number;
  confidence: number;
  headingMatches: string[];
  scheduleMatches: string[];
  fixtureMatches: string[];
  systemMatches: string[];
  reason: string;
}

const TITLE_BLOCK_CHAR_LIMIT = 1800;

const HEADINGS = [
  "SPECIFICATION",
  "SPECIFICATIONS",
  "PROJECT SPECIFICATION",
  "WORK SECTION",
  "TRADE SPECIFICATION",
  "FINISH SCHEDULE",
  "FINISHES SCHEDULE",
  "ROOM FINISH SCHEDULE",
  "MATERIAL SCHEDULE",
  "SCHEDULE OF FINISHES",
  "INTERIOR FINISHES",
  "EXTERNAL FINISHES",
] as const;

const SCHEDULE_TERMS = [
  "DOOR SCHEDULE",
  "WINDOW SCHEDULE",
  "JOINERY SCHEDULE",
  "SANITARY SCHEDULE",
  "SANITARY FIXTURE",
  "LIGHTING SCHEDULE",
  "POWER SCHEDULE",
  "ELECTRICAL SCHEDULE",
  "FLOOR FINISH",
  "WALL FINISH",
  "CEILING FINISH",
  "PAINT SYSTEM",
  "TILE SCHEDULE",
  "HARDWARE SCHEDULE",
] as const;

const FIXTURE_TERMS = [
  "FIXTURE",
  "FITTING",
  "APPLIANCE",
  "TAPWARE",
  "ACCESSORY",
  "BASIN",
  "WC",
  "TOILET",
  "SHOWER",
  "VANITY",
  "LUMINAIRE",
  "LIGHT FITTING",
] as const;

const SYSTEM_TERMS = [
  "HVAC",
  "MECHANICAL",
  "VENTILATION",
  "PLUMBING",
  "HYDRAULIC",
  "ELECTRICAL",
  "ELV",
  "FIRE PROTECTION",
  "SECURITY",
  "DATA",
] as const;

const EXCLUSION_TERMS = [
  "STRUCTURAL GENERAL NOTES",
  "REBAR",
  "FOUNDATION PLAN",
  "PILE SCHEDULE",
  "EARTHWORKS",
  "SETOUT",
  "SET OUT",
] as const;

function normalizeText(source: string): string {
  return source.toUpperCase().replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function findMatches(haystack: string, terms: readonly string[]): string[] {
  return terms.filter((term) => haystack.includes(term));
}

function toConfidence(score: number): number {
  const raw = 0.2 + score * 0.08;
  return Math.max(0.01, Math.min(0.99, raw));
}

export function analyzePageForSpecFinishes(pageText: string): SpecFinishesPageSignal {
  const normalized = normalizeText(pageText);
  const titleBlock = normalized.slice(0, TITLE_BLOCK_CHAR_LIMIT);

  const headingMatches = uniqueSorted(findMatches(titleBlock, HEADINGS));
  const scheduleMatches = uniqueSorted(findMatches(normalized, SCHEDULE_TERMS));
  const fixtureMatches = uniqueSorted(findMatches(normalized, FIXTURE_TERMS));
  const systemMatches = uniqueSorted(findMatches(normalized, SYSTEM_TERMS));
  const exclusions = findMatches(normalized, EXCLUSION_TERMS);

  const headingScore = headingMatches.length * 3;
  const scheduleScore = scheduleMatches.length * 2;
  const fixtureScore = Math.min(fixtureMatches.length, 4);
  const systemScore = Math.min(systemMatches.length, 3);
  const exclusionPenalty = exclusions.length > 0 ? 2 : 0;

  const score = Math.max(0, headingScore + scheduleScore + fixtureScore + systemScore - exclusionPenalty);
  const isRelevant = headingMatches.length > 0 || scheduleMatches.length >= 2 || score >= 5;

  const reasonParts: string[] = [];
  if (headingMatches.length > 0) {
    reasonParts.push(`Heading matches: ${headingMatches.slice(0, 3).join(", ")}`);
  }
  if (scheduleMatches.length > 0) {
    reasonParts.push(`Schedule signals: ${scheduleMatches.slice(0, 4).join(", ")}`);
  }
  if (fixtureMatches.length > 0) {
    reasonParts.push(`Fixture terms: ${fixtureMatches.slice(0, 3).join(", ")}`);
  }
  if (systemMatches.length > 0) {
    reasonParts.push(`System terms: ${systemMatches.slice(0, 3).join(", ")}`);
  }
  if (reasonParts.length === 0) {
    reasonParts.push("No specification or finishes signals detected.");
  }

  return {
    isRelevant,
    score,
    confidence: toConfidence(score),
    headingMatches,
    scheduleMatches,
    fixtureMatches,
    systemMatches,
    reason: reasonParts.join(" "),
  };
}
