/**
 * trade-pack-builder.ts
 *
 * TradesStack builder-style trade package taxonomy.
 *
 * Goal:
 * - Match real NZ/AU residential trade tender packages
 * - Maximise page capture accuracy across:
 *   - drawing titles
 *   - sheet prefixes
 *   - schedules
 *   - legends
 *   - notes
 *   - technical annotations
 *   - detail callouts
 *
 * Current trade packages:
 * 1. Preliminaries / General
 * 2. Demolition
 * 3. Earthworks
 * 4. Drainage / Underground Services
 * 5. Concrete / Foundations
 * 6. Structural Frame
 * 7. Structural Steel
 * 8. Roofing
 * 9. Windows / Glazing
 * 10. Insulation
 * 11. Internal Linings
 * 12. Plastering / Stopping
 * 13. Internal Carpentry
 * 14. Joinery / Cabinetry
 * 15. Waterproofing
 * 16. Tiling
 * 17. Flooring
 * 18. Painting
 * 19. Plumbing
 * 20. Electrical
 * 21. Mechanical / HVAC
 * 22. ELV / Security
 * 23. External Works
 */

export interface TradePackTrade {
  id: string;
  label: string;
  slug: string;

  /** Typical drawing-set prefixes for this trade package */
  sheetPrefixes: string[];
  weakSheetPrefixes?: string[];

  /** Some trades must have a title-block hit unless it's a support sheet */
  requireStructuredHit?: boolean;

  structuredKeywords: string[];
  secondaryKeywords: string[];
  excludeKeywords?: string[];
  abbreviations: string[];

  qsSection?:
    | "Preliminaries / General"
    | "Demolition"
    | "Earthworks"
    | "Drainage / Underground Services"
    | "Concrete / Foundations"
    | "Structural Frame"
    | "Structural Steel"
    | "Roofing"
    | "Windows / Glazing"
    | "Insulation"
    | "Internal Linings"
    | "Plastering / Stopping"
    | "Internal Carpentry"
    | "Joinery / Cabinetry"
    | "Waterproofing"
    | "Tiling"
    | "Flooring"
    | "Painting"
    | "Plumbing"
    | "Electrical"
    | "Mechanical / HVAC"
    | "ELV / Security"
    | "External Works";
  qsTradePackage?: string;
}

export interface TradePageSignal {
  isRelevant: boolean;
  score: number;
  matchedSheetPrefixes: string[];
  matchedStructuredKeywords: string[];
  matchedSecondaryKeywords: string[];
  matchedAbbreviations: string[];
  reason: string;
}

export interface TradePagePrefilterSignal {
  shouldSendToVlm: boolean;
  score: number;
  matchedSheetPrefixes: string[];
  matchedStructuredKeywords: string[];
  matchedSecondaryKeywords: string[];
  matchedAbbreviations: string[];
  supportMatches: string[];
  isSupportSheet: boolean;
  reason: string;
}

const SHEET_PREFIX_EXCLUSIONS = new Set([
  "NO",
  "REV",
  "RFI",
  "NTS",
  "DWG",
  "SHT",
  "SHE",
  "SHEET",
  "KEY",
  "MAX",
  "MIN",
  "TYP",
]);

const MIXED_DISCIPLINE_PREFIX_THRESHOLD = 3;
const COMPETING_SIGNAL_MARGIN = 2;
const CLEARLY_STRONGER_SIGNAL_MARGIN = 3;
const TITLE_BLOCK_CHAR_LIMIT = 1400;

const SUPPORT_SHEET_KEYWORDS = [
  "LEGEND",
  "LEGENDS",
  "SYMBOL",
  "SYMBOLS",
  "SYMBOL LEGEND",
  "ABBREVIATION",
  "ABBREVIATIONS",
  "GENERAL NOTES",
  "NOTES",
  "SPECIFICATION",
  "SPECIFICATIONS",
  "SCHEDULE",
  "SCHEDULES",
  "DRAWING INDEX",
  "DRAWING LIST",
  "SHEET LIST",
  "TYPICAL DETAILS",
  "TYPICAL DETAIL",
  "DETAILS",
  "DETAIL SHEET",
  "ROOM FINISH SCHEDULE",
  "FINISH SCHEDULE",
  "DOOR SCHEDULE",
  "WINDOW SCHEDULE",
  "SANITARY SCHEDULE",
  "LIGHTING SCHEDULE",
  "POWER SCHEDULE",
] as const;

const DIMENSION_SET_OUT_KEYWORDS = [
  "DIMENSION",
  "DIMENSIONS",
  "DIMENSION PLAN",
  "SETOUT",
  "SET OUT",
  "SET-OUT",
  "GRID",
  "GRIDLINE",
  "DATUM",
  "BENCHMARK",
  "BM",
  "RL",
  "R.L.",
  "REDUCED LEVEL",
  "LEVEL",
  "LEVELS",
  "SPOT LEVEL",
  "SPOT LEVELS",
  "FFL",
] as const;

const ALLOWANCE_KEYWORDS = [
  "PC SUM",
  "PRIME COST",
  "P.C.",
  "PS",
  "P.S.",
  "PROVISIONAL SUM",
  "ALLOWANCE",
  "CLIENT SUPPLY",
  "BY OWNER",
  "OWNER SUPPLIED",
] as const;

function normalizeText(source: string): string {
  return source.toUpperCase().replace(/\s+/g, " ").trim();
}

function extractTitleBlockText(normalizedText: string): string {
  return normalizedText.slice(0, TITLE_BLOCK_CHAR_LIMIT);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function escapeRegexPattern(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPhrase(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

function matchesToken(haystack: string, token: string): boolean {
  const escapedToken = escapeRegexPattern(token);
  const pattern = new RegExp(`(^|[^A-Z0-9])${escapedToken}([^A-Z0-9]|$)`);
  return pattern.test(haystack);
}

function findSupportMatches(normalizedText: string): string[] {
  const support = SUPPORT_SHEET_KEYWORDS.filter((k) => normalizedText.includes(k));
  const dim = DIMENSION_SET_OUT_KEYWORDS.filter((k) => normalizedText.includes(k));
  return uniqueSorted([...support, ...dim]);
}

function findTradeSupportHints(normalizedText: string, trade: TradePackTrade): string[] {
  const hints = uniqueSorted([...trade.structuredKeywords, ...trade.abbreviations]);
  return hints.filter((hint) =>
    hint.length <= 4 ? matchesToken(normalizedText, hint) : matchesPhrase(normalizedText, hint)
  );
}

/** ===================== TRADE PACKS ===================== */

export const TRADE_PACK_TRADES: ReadonlyArray<TradePackTrade> = [
  {
    id: "preliminaries-general",
    label: "Preliminaries / General",
    slug: "preliminaries-general",
    qsSection: "Preliminaries / General",
    qsTradePackage: "Main Contractor",
    sheetPrefixes: ["G", "GN", "GEN", "PR", "A0", "C0"],
    weakSheetPrefixes: ["A", "C"],
    structuredKeywords: [
      "PRELIMINARIES",
      "GENERAL REQUIREMENTS",
      "GENERAL NOTES",
      "GENERAL ARRANGEMENT",
      "PROJECT SPECIFICATION",
      "SPECIFICATION",
      "PROJECT PARTICULARS",
      "SCOPE OF WORK",
      "WORK SECTIONS",
      "TRADE SUMMARY",
      "CONDITIONS OF CONTRACT",
      "SITE ESTABLISHMENT",
      "SITE LOGISTICS",
      "TEMPORARY WORKS",
      "TEMPORARY SERVICES",
      "HEALTH AND SAFETY",
      "QUALITY ASSURANCE",
      "SITE MANAGEMENT",
      "SITE FACILITIES",
      "ENVIRONMENTAL MANAGEMENT",
      "TRAFFIC MANAGEMENT",
      "CONSTRUCTION NOTES",
      "DEMARCATION",
      "BUILDERS WORK",
      "GENERAL CONSTRUCTION NOTES",
    ],
    secondaryKeywords: [
      "HOARDING",
      "SITE FENCING",
      "TEMPORARY FENCING",
      "TEMPORARY POWER",
      "TEMP POWER",
      "TEMPORARY WATER",
      "SITE SHED",
      "SITE OFFICE",
      "AMENITIES",
      "PORTALOO",
      "TOILET",
      "TOOLBOX",
      "INDUCTION",
      "PPE",
      "SAFE WORK METHOD",
      "SWMS",
      "TMP",
      "SITE ACCESS",
      "DELIVERY ACCESS",
      "MATERIAL STORAGE",
      "PROTECTION",
      "PUBLIC PROTECTION",
      "WEATHER PROTECTION",
      "FLOOR PROTECTION",
      "TREE PROTECTION",
      "DUST CONTROL",
      "NOISE CONTROL",
      "WASTE MANAGEMENT",
      "SKIP BIN",
      "SITE CLEANING",
      "SITE CLEAN",
      "SCAFFOLD",
      "SCAFFOLDING",
      "EDGE PROTECTION",
      "FIRE EXTINGUISHER",
      "FIRST AID",
      "SITE SUPERVISION",
      "FOREMAN",
      "SUPERVISOR",
      "PROGRAMME",
      "PROGRAM",
      "QA",
      "ITP",
    ],
    excludeKeywords: ["SLAB REINFORCEMENT", "FOOTING SCHEDULE"],
    abbreviations: ["TMP", "QA", "ITP", "PPE", "SWMS", "H&S"],
  },

  {
    id: "demolition",
    label: "Demolition",
    slug: "demolition",
    qsSection: "Demolition",
    qsTradePackage: "Demolition Subcontractor",
    sheetPrefixes: ["D", "DM", "DEM"],
    weakSheetPrefixes: ["A", "S"],
    requireStructuredHit: true,
    structuredKeywords: [
      "DEMOLITION",
      "DEMOLITION PLAN",
      "DEMOLITION NOTES",
      "EXISTING DEMOLITION",
      "STRIP OUT",
      "SOFT STRIP",
      "REMOVE EXISTING",
      "EXISTING TO BE REMOVED",
      "EXISTING TO BE DEMOLISHED",
      "MAKE GOOD",
      "SELECTIVE DEMOLITION",
      "STRUCTURAL DEMOLITION",
      "HAZARDOUS MATERIAL",
      "ASBESTOS",
      "SALVAGE",
      "DECONSTRUCTION",
    ],
    secondaryKeywords: [
      "SAW CUT",
      "SAW CUTTING",
      "CORE DRILLING",
      "BREAK OUT",
      "BREAKOUT",
      "REMOVE WALL",
      "REMOVE SLAB",
      "REMOVE CEILING",
      "REMOVE LINING",
      "REMOVE JOINERY",
      "REMOVE FIXTURE",
      "REMOVE FLOOR FINISH",
      "REMOVE FRAME",
      "REMOVE BEAM",
      "REMOVE COLUMN",
      "TEMPORARY PROPPING",
      "PROPPING",
      "BRACING FOR DEMO",
      "ACM",
      "LEAD PAINT",
      "CONTAMINATED",
      "HAZMAT",
      "DISPOSAL",
      "SKIP",
    ],
    excludeKeywords: ["PROPOSED", "NEW WORK", "SUPPLY", "INSTALL"],
    abbreviations: ["DEM", "DM", "ACM", "EX"],
  },

  {
    id: "earthworks",
    label: "Earthworks",
    slug: "earthworks",
    qsSection: "Earthworks",
    qsTradePackage: "Civil Subcontractor",
    sheetPrefixes: ["C", "CE", "CV", "CIV", "L", "SIT"],
    weakSheetPrefixes: ["A", "S"],
    requireStructuredHit: true,
    structuredKeywords: [
      "EARTHWORKS",
      "EARTHWORKS PLAN",
      "SITE WORKS",
      "SITE PLAN",
      "GRADING PLAN",
      "CONTOUR PLAN",
      "EXCAVATION PLAN",
      "CUT AND FILL",
      "CUT/FILL",
      "SUBGRADE PREPARATION",
      "SUBGRADE",
      "FORMATION LEVELS",
      "BULK EXCAVATION",
      "SET OUT",
      "SETOUT",
      "DIMENSION PLAN",
      "SPOT LEVELS",
      "BENCHMARK",
      "RETAINING PLAN",
      "CIVIL WORKS",
      "EROSION AND SEDIMENT CONTROL",
      "SEDIMENT CONTROL",
    ],
    secondaryKeywords: [
      "CUT",
      "FILL",
      "TOPSOIL",
      "STRIP TOPSOIL",
      "FILL MATERIAL",
      "IMPORTED FILL",
      "ENGINEERED FILL",
      "STABILISED FILL",
      "COMPACTION",
      "COMPACTED HARD FILL",
      "PROOF ROLLING",
      "PROOF ROLL",
      "SUBBASE",
      "BASECOURSE",
      "GAP40",
      "GAP65",
      "AP40",
      "GAP20",
      "SAND BLINDING",
      "GEOTEXTILE",
      "GEOGRID",
      "LIME STABILISATION",
      "CEMENT STABILISATION",
      "BATTER",
      "SLOPE",
      "BATTER TIE-IN",
      "EMBANKMENT",
      "EXCAVATE",
      "BACKFILL",
      "SERVICE TRENCH",
      "RETAINING WALL",
      "TIMBER RETAINING",
      "BLOCK RETAINING",
      "SHEET PILE",
      "BOULDER WALL",
      "KERB",
      "CHANNEL",
      "DRIVEWAY FORMATION",
      "RL",
      "FFL",
      "DATUM",
    ],
    excludeKeywords: ["REINFORCEMENT", "REBAR", "SLAB", "FORMWORK", "WINDOW SCHEDULE"],
    abbreviations: ["ESC", "CBR", "RL", "FFL", "AP40", "GAP40", "GAP65"],
  },

  {
    id: "drainage-underground-services",
    label: "Drainage / Underground Services",
    slug: "drainage-underground-services",
    qsSection: "Drainage / Underground Services",
    qsTradePackage: "Drainlayer Subcontractor",
    sheetPrefixes: ["DR", "DG", "BG", "C", "CE", "CV", "P", "H"],
    weakSheetPrefixes: ["A"],
    requireStructuredHit: true,
    structuredKeywords: [
      "DRAINAGE PLAN",
      "UNDERGROUND DRAINAGE",
      "UNDERGROUND SERVICES",
      "UNDERGROUND SERVICE PLAN",
      "STORMWATER",
      "STORMWATER DRAINAGE",
      "SEWER",
      "SEWER DRAINAGE",
      "FOUL WATER",
      "SANITARY DRAINAGE",
      "DRAINAGE LAYOUT",
      "SERVICES PLAN",
      "UTILITY PLAN",
      "LONG SECTION",
      "LONGSECTIONS",
      "PIPE PROFILE",
      "PROFILE",
      "MANHOLE SCHEDULE",
      "CATCHPIT SCHEDULE",
      "SERVICE COORDINATION",
    ],
    secondaryKeywords: [
      "MANHOLE",
      "MH",
      "CATCHPIT",
      "CP",
      "INSPECTION CHAMBER",
      "IC",
      "INSPECTION OPENING",
      "IO",
      "RODDING EYE",
      "RE",
      "SOAK PIT",
      "SOAKHOLE",
      "DETENTION TANK",
      "RETENTION TANK",
      "ATTENUATION TANK",
      "PUMP STATION",
      "PUMP CHAMBER",
      "SEWER MAIN",
      "STORMWATER MAIN",
      "PIPE",
      "PIPEWORK",
      "PVC-U",
      "uPVC",
      "HDPE",
      "DN100",
      "DN150",
      "DN225",
      "DN300",
      "GRAVITY MAIN",
      "FALL",
      "GRADE",
      "INVERT",
      "IL",
      "CL",
      "BENCHING",
      "BEDDING",
      "HAUNCHING",
      "TRENCH",
      "BACKFILL",
      "TOBY",
      "WATER METER",
      "BOUNDARY TRAP",
      "ORB",
      "BACKFLOW",
      "RPZ",
      "GULLY",
      "FLOOR WASTE GULLY",
    ],
    excludeKeywords: ["ROOF PLAN", "GUTTER", "DOWNPIPE", "RWP", "REFLECTED CEILING PLAN"],
    abbreviations: ["SW", "FW", "MH", "CP", "IC", "IO", "RE", "IL", "CL", "RPZ", "DN"],
  },

  {
    id: "concrete-foundations",
    label: "Concrete / Foundations",
    slug: "concrete-foundations",
    qsSection: "Concrete / Foundations",
    qsTradePackage: "Concretor Subcontractor",
    sheetPrefixes: ["S", "ST", "CS", "RC"],
    weakSheetPrefixes: ["C", "A"],
    requireStructuredHit: true,
    structuredKeywords: [
      "FOUNDATION PLAN",
      "FOUNDATIONS PLAN",
      "FOOTING PLAN",
      "FOOTING SCHEDULE",
      "SLAB PLAN",
      "GROUND FLOOR SLAB",
      "GROUND BEAM PLAN",
      "CONCRETE PLAN",
      "CONCRETE DETAILS",
      "REINFORCEMENT PLAN",
      "REINFORCEMENT DETAILS",
      "REINFORCEMENT",
      "REINFORCED CONCRETE",
      "RC DETAILS",
      "POD SLAB",
      "WAFFLE SLAB",
      "RIBRAFT",
      "RAFT SLAB",
      "PILE CAP",
      "PILE LAYOUT",
      "FOUNDING PLAN",
    ],
    secondaryKeywords: [
      "STRIP FOOTING",
      "PAD FOOTING",
      "EDGE BEAM",
      "GROUND BEAM",
      "FOUNDATION WALL",
      "SLAB THICKENING",
      "THICKENING",
      "REBATE",
      "STEPDOWN",
      "MESH",
      "REBAR",
      "STARTER BAR",
      "DOWEL",
      "LAP",
      "COVER",
      "CHAIR",
      "N12",
      "N16",
      "D12",
      "D16",
      "D20",
      "R10",
      "R12",
      "SL72",
      "SL82",
      "SL92",
      "FORMWORK",
      "BOXING",
      "CONCRETE STRENGTH",
      "MPA",
      "CONTROL JOINT",
      "SAW CUT JOINT",
      "EXPANSION JOINT",
      "VAPOUR BARRIER",
      "DPM",
      "POLYTHENE",
      "TOS",
      "TOC",
      "FFL",
      "SET OUT",
      "DIMENSION",
    ],
    excludeKeywords: ["STORMWATER", "SEWER", "CATCHPIT", "WINDOW SCHEDULE"],
    abbreviations: ["RC", "FFL", "TOC", "TOS", "SL82", "SL92", "N12", "N16", "D12", "D16"],
  },

  {
    id: "structural-frame",
    label: "Structural Frame",
    slug: "structural-frame",
    qsSection: "Structural Frame",
    qsTradePackage: "Carpentry Subcontractor",
    sheetPrefixes: ["T", "TF", "TR", "TS", "S", "ST"],
    weakSheetPrefixes: ["A"],
    requireStructuredHit: true,
    structuredKeywords: [
      "FRAMING PLAN",
      "TIMBER FRAMING",
      "FLOOR FRAMING",
      "WALL FRAMING",
      "ROOF FRAMING",
      "FRAMING LAYOUT",
      "TRUSS LAYOUT",
      "TRUSS PLAN",
      "BRACING PLAN",
      "FRAMING ELEVATION",
      "STRUCTURAL TIMBER",
      "TIMBER STRUCTURE",
      "WALL BRACING",
      "FRAMING DETAILS",
      "TIMBER DETAILS",
    ],
    secondaryKeywords: [
      "STUD",
      "NOG",
      "NOGGING",
      "TOP PLATE",
      "BOTTOM PLATE",
      "DOUBLE TOP PLATE",
      "LINTEL",
      "HEADER",
      "JACK STUD",
      "KING STUD",
      "BRACE",
      "BRACE LINE",
      "HOLD DOWN",
      "STRAP BRACE",
      "PANEL BRACE",
      "GIB BRACE",
      "BEARER",
      "JOIST",
      "FLOOR JOIST",
      "BOUNDARY JOIST",
      "RAFTER",
      "RIDGE BEAM",
      "TRUSS",
      "TRUSS TYPE",
      "TRUSS HEEL",
      "NAILPLATE",
      "LVL",
      "GLULAM",
      "LAMINATED VENEER LUMBER",
      "H1.2",
      "H3.2",
      "H5",
      "SG8",
      "SG10",
      "MGP10",
      "MGP12",
      "BATTEN",
      "PACKER",
      "FIXING SCHEDULE",
      "NAIL",
      "SCREW",
      "BOLT",
      "SET OUT",
      "DIMENSION",
    ],
    excludeKeywords: ["STRUCTURAL STEEL", "UB", "UC", "RHS", "SHS", "BASE PLATE", "WELD"],
    abbreviations: ["LVL", "GLULAM", "SG8", "SG10", "MGP10", "MGP12", "H1.2", "H3.2", "H5"],
  },

  {
    id: "structural-steel",
    label: "Structural Steel",
    slug: "structural-steel",
    qsSection: "Structural Steel",
    qsTradePackage: "Steel Fabricator Subcontractor",
    sheetPrefixes: ["SS", "ST", "S"],
    weakSheetPrefixes: ["A", "C"],
    requireStructuredHit: true,
    structuredKeywords: [
      "STRUCTURAL STEEL",
      "STEELWORK",
      "STEEL FRAME",
      "STEEL FRAMING PLAN",
      "STEEL PLAN",
      "STEEL LAYOUT",
      "MEMBER SCHEDULE",
      "STEEL SCHEDULE",
      "CONNECTION DETAILS",
      "STEEL DETAILS",
      "BASE PLATE",
      "PORTAL FRAME",
      "STEEL ELEVATION",
      "STEEL SECTIONS",
    ],
    secondaryKeywords: [
      "UB",
      "UC",
      "PFC",
      "EA",
      "RHS",
      "SHS",
      "CHS",
      "I BEAM",
      "CHANNEL",
      "ANGLE",
      "PLATE",
      "CLEAT",
      "GUSSET",
      "STIFFENER",
      "WELD",
      "BOLT",
      "HIGH STRENGTH BOLT",
      "ANCHOR BOLT",
      "HOLDING DOWN BOLT",
      "BASEPLATE",
      "END PLATE",
      "MOMENT CONNECTION",
      "BRACE",
      "KNEE BRACE",
      "GALVANISED",
      "HDG",
      "PRIMER",
      "INTUMESCENT",
      "FIRE RATED",
      "DURA GAL",
      "SHOP WELD",
      "SITE WELD",
      "SET OUT",
      "DIMENSION",
    ],
    excludeKeywords: ["REINFORCEMENT", "REBAR", "SLAB", "RIBRAFT", "LVL", "TRUSS"],
    abbreviations: ["UB", "UC", "PFC", "RHS", "SHS", "CHS", "HDG", "SS"],
  },

  {
    id: "roofing",
    label: "Roofing",
    slug: "roofing",
    qsSection: "Roofing",
    qsTradePackage: "Roofing Subcontractor",
    sheetPrefixes: ["R", "RF", "AR"],
    weakSheetPrefixes: ["A"],
    requireStructuredHit: true,
    structuredKeywords: [
      "ROOF PLAN",
      "ROOFING PLAN",
      "ROOF LAYOUT",
      "ROOF DETAILS",
      "ROOF CLADDING",
      "FLASHING DETAILS",
      "FLASHING PLAN",
      "METAL ROOF",
      "MEMBRANE ROOF",
      "ROOF MEMBRANE",
      "ROOF PENETRATION",
      "ROOF SAFETY",
      "ROOF EDGE",
      "PARAPET DETAILS",
      "SKYLIGHT",
      "ROOFLIGHT",
      "ROOF HATCH",
    ],
    secondaryKeywords: [
      "LONGRUN",
      "LONG RUN",
      "CORRUGATED",
      "TRAPEZOIDAL",
      "STANDING SEAM",
      "COLORSTEEL",
      "COLOURSTEEL",
      "ALUMINIUM ROOF",
      "TPO",
      "EPDM",
      "PVC MEMBRANE",
      "BUTYNOL",
      "TORCH ON",
      "RIDGE",
      "HIP",
      "VALLEY",
      "VERGE",
      "BARGE FLASHING",
      "APRON FLASHING",
      "PARAPET FLASHING",
      "SOAKER",
      "ROOF PENETRATION",
      "VENT PIPE FLASHING",
      "DEKTITE",
      "SNOWSTRAP",
      "PITCH",
      "ROOF FALL",
      "SARKING",
      "UNDERLAY",
      "ROOF BLANKET",
      "SCUPPER",
      "OVERFLOW",
      "GUTTER",
      "DOWNPIPE",
      "RAINHEAD",
    ],
    excludeKeywords: ["WINDOW SCHEDULE", "DOOR SCHEDULE", "CURTAIN WALL", "WALL CLADDING"],
    abbreviations: ["RF", "TPO", "EPDM", "RWP", "DP"],
  },

  {
    id: "windows-glazing",
    label: "Windows / Glazing",
    slug: "windows-glazing",
    qsSection: "Windows / Glazing",
    qsTradePackage: "Joinery Subcontractor",
    sheetPrefixes: ["W", "GL", "AR", "J"],
    weakSheetPrefixes: ["A"],
    requireStructuredHit: true,
    structuredKeywords: [
      "WINDOW SCHEDULE",
      "WINDOW SCHEDULES",
      "WINDOW TYPES",
      "WINDOW DETAILS",
      "GLAZING SCHEDULE",
      "GLASS SCHEDULE",
      "GLAZING DETAILS",
      "EXTERNAL DOOR SCHEDULE",
      "EXTERNAL DOOR",
      "ALUMINIUM JOINERY",
      "ALUMINUM JOINERY",
      "JOINERY SCHEDULE",
      "JOINERY DETAILS",
      "SHOPFRONT",
      "CURTAIN WALL",
      "LOUVRE SCHEDULE",
    ],
    secondaryKeywords: [
      "DGU",
      "IGU",
      "LOW-E",
      "LOW E",
      "ARGON",
      "LAMINATED",
      "TOUGHENED",
      "TEMPERED",
      "OBSCURE GLASS",
      "SAFETY GLASS",
      "THERMAL BREAK",
      "THERMALLY BROKEN",
      "STACKER",
      "SLIDING DOOR",
      "BIFOLD",
      "HINGED DOOR",
      "AWNING",
      "CASEMENT",
      "FIXED LIGHT",
      "FANLIGHT",
      "SIDELIGHT",
      "REVEAL",
      "SILL TRAY",
      "HEAD FLASHING",
      "JAMB FLASHING",
      "BACKER ROD",
      "SEALANT",
      "GLAZING BEAD",
      "SPACER BAR",
      "MANIFESTATION",
    ],
    excludeKeywords: ["CLADDING DETAILS", "WRB", "CAVITY BATTEN", "ROOF PLAN"],
    abbreviations: ["DGU", "IGU", "LOW-E", "GL"],
  },

  {
    id: "insulation",
    label: "Insulation",
    slug: "insulation",
    qsSection: "Insulation",
    qsTradePackage: "Insulation Subcontractor",
    sheetPrefixes: ["A", "AR", "I", "ID", "INT"],
    weakSheetPrefixes: ["S", "M"],
    requireStructuredHit: true,
    structuredKeywords: [
      "INSULATION",
      "INSULATION PLAN",
      "THERMAL INSULATION",
      "ACOUSTIC INSULATION",
      "INSULATION SCHEDULE",
      "R-VALUE",
      "R VALUE",
      "THERMAL ENVELOPE",
      "BUILDING THERMAL PERFORMANCE",
      "ACOUSTIC TREATMENT",
    ],
    secondaryKeywords: [
      "WALL INSULATION",
      "CEILING INSULATION",
      "ROOF INSULATION",
      "UNDERFLOOR INSULATION",
      "ACOUSTIC BATTS",
      "BATTS",
      "BLANKET",
      "GLASSWOOL",
      "POLYESTER",
      "ROCKWOOL",
      "MINERAL WOOL",
      "R2.2",
      "R2.6",
      "R3.2",
      "R4.0",
      "R5.0",
      "THERMAL BREAK",
      "SOUND",
      "ACOUSTIC",
      "FIRE ACOUSTIC",
      "INSULATION TO CAVITY",
    ],
    excludeKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE", "PAINT SCHEDULE"],
    abbreviations: ["R", "R2.2", "R2.6", "R3.2", "R4.0", "R5.0"],
  },

  {
    id: "internal-linings",
    label: "Internal Linings",
    slug: "internal-linings",
    qsSection: "Internal Linings",
    qsTradePackage: "GIB Fixer Subcontractor",
    sheetPrefixes: ["A", "AR", "I", "ID", "INT"],
    weakSheetPrefixes: ["E", "M", "S"],
    requireStructuredHit: true,
    structuredKeywords: [
      "INTERNAL LININGS",
      "LININGS",
      "LINING PLAN",
      "LINING SCHEDULE",
      "PLASTERBOARD",
      "GIB BOARD",
      "GYPROCK",
      "PARTITION PLAN",
      "PARTITION TYPES",
      "WALL TYPES",
      "CEILING PLAN",
      "REFLECTED CEILING PLAN",
      "RCP",
      "CEILING TYPES",
      "BULKHEAD DETAILS",
      "SOFFIT LINING",
      "LINING DETAILS",
    ],
    secondaryKeywords: [
      "GIB",
      "GYPROCK",
      "PLASTERBOARD",
      "13MM GIB",
      "10MM GIB",
      "AQUALINE",
      "NOISELINE",
      "FIRELINE",
      "CEILING BATTEN",
      "RONDONDO",
      "T-BAR",
      "SUSPENDED CEILING",
      "GRID CEILING",
      "ACCESS HATCH",
      "ACCESS PANEL",
      "BULKHEAD",
      "COVE CORNICE",
      "SQUARE STOP",
      "CONTROL JOINT",
      "SEISMIC BRACE",
      "FIRE RATED",
      "ACOUSTIC RATING",
      "SET OUT",
      "DIMENSION",
    ],
    excludeKeywords: ["JOINERY SCHEDULE", "KITCHEN ELEVATIONS", "WINDOW SCHEDULE"],
    abbreviations: ["RCP", "GIB"],
  },

  {
    id: "plastering-stopping",
    label: "Plastering / Stopping",
    slug: "plastering-stopping",
    qsSection: "Plastering / Stopping",
    qsTradePackage: "Stopping Subcontractor",
    sheetPrefixes: ["A", "AR", "I", "ID", "INT"],
    weakSheetPrefixes: ["PA", "PT"],
    requireStructuredHit: true,
    structuredKeywords: [
      "STOPPING",
      "PLASTERING",
      "PLASTERING NOTES",
      "STOPPING SCHEDULE",
      "PLASTERING SCHEDULE",
      "INTERNAL PLASTER",
      "SKIM COAT",
      "LEVEL 4 FINISH",
      "LEVEL 5 FINISH",
      "STOPPING DETAILS",
      "PAINT READY",
      "SURFACE FINISH LEVEL",
    ],
    secondaryKeywords: [
      "SET JOINT",
      "JOINTING",
      "JOINT TAPE",
      "COMPOUND",
      "SKIM",
      "SKIM COAT",
      "STOPPED",
      "SANDING",
      "CORNICE",
      "STOP BEAD",
      "ANGLE BEAD",
      "PLASTER FINISH",
      "SMOOTH FINISH",
      "TROWEL FINISH",
      "LEVEL 4",
      "LEVEL 5",
      "UNDER LIGHTING",
      "CRITICAL LIGHT",
    ],
    excludeKeywords: ["EXTERNAL CLADDING", "MASONRY VENEER", "ROOF MEMBRANE"],
    abbreviations: ["L4", "L5"],
  },

  {
    id: "internal-carpentry",
    label: "Internal Carpentry",
    slug: "internal-carpentry",
    qsSection: "Internal Carpentry",
    qsTradePackage: "Carpentry Subcontractor",
    sheetPrefixes: ["A", "AR", "I", "ID", "INT", "J"],
    weakSheetPrefixes: ["W"],
    requireStructuredHit: true,
    structuredKeywords: [
      "INTERNAL DOOR SCHEDULE",
      "DOOR SCHEDULE",
      "DOOR TYPES",
      "HARDWARE SCHEDULE",
      "INTERNAL DOOR",
      "INTERNAL CARPENTRY",
      "FINISH CARPENTRY",
      "TRIM DETAILS",
      "SKIRTING DETAILS",
      "ARCHITRAVE DETAILS",
      "DOOR DETAILS",
      "INTERIOR TRIM",
    ],
    secondaryKeywords: [
      "SKIRTING",
      "ARCHITRAVE",
      "CORNICE",
      "SCOTIA",
      "SCRIBE",
      "REVEAL",
      "DOOR FRAME",
      "JAMB",
      "CAVITY SLIDER",
      "SWING DOOR",
      "HINGE",
      "HANDLE",
      "LOCKSET",
      "LEVERSET",
      "PRIVACY SET",
      "DOOR STOP",
      "CLOSER",
      "SEAL",
      "THRESHOLD",
      "INTUMESCENT STRIP",
      "FIRE DOOR",
      "FD",
      "FITOFF",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE", "JOINERY BENCHTOP"],
    abbreviations: ["FD", "PC", "PS"],
  },

  {
    id: "joinery-cabinetry",
    label: "Joinery / Cabinetry",
    slug: "joinery-cabinetry",
    qsSection: "Joinery / Cabinetry",
    qsTradePackage: "Joinery Subcontractor",
    sheetPrefixes: ["J", "JN", "AR", "ID"],
    weakSheetPrefixes: ["A"],
    requireStructuredHit: true,
    structuredKeywords: [
      "JOINERY",
      "JOINERY PLAN",
      "JOINERY DETAILS",
      "JOINERY SCHEDULE",
      "CABINETRY",
      "CABINETRY SCHEDULE",
      "KITCHEN PLAN",
      "KITCHEN DETAILS",
      "KITCHEN ELEVATIONS",
      "VANITY DETAILS",
      "LAUNDRY DETAILS",
      "WARDROBE DETAILS",
      "BENCHTOP DETAILS",
      "SHOP DRAWINGS JOINERY",
    ],
    secondaryKeywords: [
      "CABINET",
      "CARCASS",
      "DRAWER",
      "HINGE",
      "SOFT CLOSE",
      "PANEL",
      "DOOR FRONT",
      "MELAMINE",
      "LAMINATE",
      "HPL",
      "MDF",
      "PLYWOOD",
      "VENEER",
      "STONE TOP",
      "ENGINEERED STONE",
      "BENCHTOP",
      "SPLASHBACK",
      "ISLAND",
      "PANTRY",
      "WIR",
      "WARDROBE",
      "OPEN SHELVING",
      "PLINTH",
      "KICKBOARD",
      "HANDLELESS",
      "PUSH TO OPEN",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE"],
    abbreviations: ["WIR", "HPL", "MDF", "PC", "PS"],
  },

  {
    id: "waterproofing",
    label: "Waterproofing",
    slug: "waterproofing",
    qsSection: "Waterproofing",
    qsTradePackage: "Waterproofing Subcontractor",
    sheetPrefixes: ["WP", "WPF", "A", "AR"],
    weakSheetPrefixes: ["R", "RF"],
    requireStructuredHit: true,
    structuredKeywords: [
      "WATERPROOFING",
      "WATERPROOFING DETAILS",
      "WET AREA WATERPROOFING",
      "MEMBRANE DETAILS",
      "WET AREA DETAILS",
      "SHOWER DETAILS",
      "BATHROOM DETAILS",
      "DECK WATERPROOFING",
      "BALCONY WATERPROOFING",
      "TANKING",
      "MEMBRANE",
    ],
    secondaryKeywords: [
      "UPSTAND",
      "TURN UP",
      "PUDDLE FLANGE",
      "BOND BREAKER",
      "COVE",
      "FILLET",
      "FLOOR WASTE",
      "SHOWER WASTE",
      "SCREED FALLS",
      "DRAIN FALL",
      "LIQUID MEMBRANE",
      "SHEET MEMBRANE",
      "TORCH ON",
      "BUTYNOL",
      "TPO",
      "EPDM",
      "PRIMER",
      "WATERSTOP",
      "BALCONY MEMBRANE",
      "DECK MEMBRANE",
      "THRESHOLD DETAIL",
    ],
    excludeKeywords: ["STORMWATER", "SEWER", "MANHOLE", "CATCHPIT"],
    abbreviations: ["WP", "EPDM", "TPO"],
  },

  {
    id: "tiling",
    label: "Tiling",
    slug: "tiling",
    qsSection: "Tiling",
    qsTradePackage: "Tiling Subcontractor",
    sheetPrefixes: ["A", "AR", "FF", "FIN", "ID", "INT"],
    weakSheetPrefixes: ["WP", "WPF"],
    requireStructuredHit: true,
    structuredKeywords: [
      "TILING",
      "TILE PLAN",
      "TILE SCHEDULE",
      "TILE LAYOUT",
      "TILE SETOUT",
      "TILE SET OUT",
      "TILING DETAILS",
      "WALL FINISH SCHEDULE",
      "ROOM FINISH SCHEDULE",
      "FINISH SCHEDULE",
      "SPLASHBACK TILE",
    ],
    secondaryKeywords: [
      "PORCELAIN",
      "CERAMIC",
      "MOSAIC",
      "STONE TILE",
      "SUBWAY TILE",
      "FORMAT TILE",
      "GROUT",
      "EPOXY GROUT",
      "TILE TRIM",
      "EDGE TRIM",
      "MITRE",
      "TILE SPACER",
      "ADHESIVE",
      "SCREED",
      "SET OUT",
      "SETOUT",
      "PATTERN",
      "STACK BOND",
      "BRICK BOND",
      "HERRINGBONE",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["REINFORCEMENT", "SLAB PLAN", "FORMWORK", "PAINT SCHEDULE"],
    abbreviations: ["PC", "PS"],
  },

  {
    id: "flooring",
    label: "Flooring",
    slug: "flooring",
    qsSection: "Flooring",
    qsTradePackage: "Flooring Subcontractor",
    sheetPrefixes: ["FF", "FIN", "A", "AR"],
    weakSheetPrefixes: ["ID", "INT"],
    requireStructuredHit: true,
    structuredKeywords: [
      "FLOOR FINISH PLAN",
      "FLOOR FINISH SCHEDULE",
      "FLOORING SCHEDULE",
      "ROOM FINISH SCHEDULE",
      "FINISH SCHEDULE",
      "FLOORING",
      "FLOOR FINISHES",
    ],
    secondaryKeywords: [
      "CARPET",
      "CARPET TILE",
      "UNDERLAY",
      "VINYL",
      "SHEET VINYL",
      "LVT",
      "LVP",
      "TIMBER FLOOR",
      "ENGINEERED TIMBER",
      "LAMINATE FLOOR",
      "HYBRID FLOORING",
      "POLISHED CONCRETE",
      "EPOXY FLOOR",
      "SCREED",
      "SELF LEVELLING",
      "LEVELLING COMPOUND",
      "FLOOR PREP",
      "TRANSITION STRIP",
      "NOSING",
      "THRESHOLD",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["REINFORCEMENT", "SLAB PLAN", "FORMWORK", "TILE SCHEDULE"],
    abbreviations: ["LVT", "LVP", "PC", "PS"],
  },

  {
    id: "painting",
    label: "Painting",
    slug: "painting",
    qsSection: "Painting",
    qsTradePackage: "Painting Subcontractor",
    sheetPrefixes: ["PA", "PT", "FIN", "A", "AR"],
    weakSheetPrefixes: ["ID", "INT"],
    requireStructuredHit: true,
    structuredKeywords: [
      "PAINT SCHEDULE",
      "PAINTING SCHEDULE",
      "COATING SCHEDULE",
      "PAINT SYSTEM",
      "COATING SYSTEM",
      "FINISHES SCHEDULE",
      "DECORATION SCHEDULE",
      "SURFACE FINISH SCHEDULE",
    ],
    secondaryKeywords: [
      "PRIMER",
      "SEALER",
      "UNDERCOAT",
      "TOPCOAT",
      "NUMBER OF COATS",
      "INTERIOR PAINT",
      "EXTERIOR PAINT",
      "LOW VOC",
      "GLOSS",
      "SEMI GLOSS",
      "SATIN",
      "EGGSHELL",
      "MATT",
      "FLAT",
      "STAIN",
      "CLEAR FINISH",
      "ENAMEL",
      "EPOXY COAT",
      "SURFACE PREPARATION",
      "PREP",
      "FILL AND SAND",
      "PLASTER SEALER",
    ],
    excludeKeywords: ["WATERPROOFING", "MEMBRANE", "STORMWATER"],
    abbreviations: ["VOC"],
  },

  {
    id: "plumbing",
    label: "Plumbing",
    slug: "plumbing",
    qsSection: "Plumbing",
    qsTradePackage: "Plumbing Subcontractor",
    sheetPrefixes: ["H", "HY", "HD", "HP", "P", "PL"],
    weakSheetPrefixes: ["A", "C"],
    requireStructuredHit: true,
    structuredKeywords: [
      "PLUMBING",
      "PLUMBING PLAN",
      "HYDRAULIC",
      "HYDRAULIC PLAN",
      "WATER SERVICES",
      "HOT WATER",
      "COLD WATER",
      "SANITARY PLUMBING",
      "SANITARY FIXTURES",
      "FIXTURE SCHEDULE",
      "RISER DIAGRAM",
      "GAS PLAN",
      "HOT WATER SYSTEM",
      "PLUMBING SCHEMATIC",
    ],
    secondaryKeywords: [
      "WC",
      "TOILET",
      "BASIN",
      "VANITY BASIN",
      "SHOWER",
      "BATH",
      "SINK",
      "TUB",
      "LAUNDRY TUB",
      "FLOOR WASTE",
      "FLOOR DRAIN",
      "TRAP",
      "VENT",
      "SVP",
      "STACK",
      "HWS",
      "HOT WATER CYLINDER",
      "HEAT PUMP HOT WATER",
      "CALIFONT",
      "GAS INSTANTANEOUS",
      "TMV",
      "PRV",
      "RPZ",
      "BACKFLOW",
      "MIXER",
      "TAPWARE",
      "VALVE",
      "ISOLATION VALVE",
      "COPPER",
      "PEX",
      "MLCP",
      "PIPEWORK",
      "LAGGING",
      "SANITARYWARE",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["STORMWATER", "SEWER MAIN", "MANHOLE", "CATCHPIT", "DETENTION TANK"],
    abbreviations: ["HWS", "TMV", "PRV", "RPZ", "SVP", "CW", "HW"],
  },

  {
    id: "electrical",
    label: "Electrical",
    slug: "electrical",
    qsSection: "Electrical",
    qsTradePackage: "Electrical Subcontractor",
    sheetPrefixes: ["E", "EL", "EE", "EP", "ED"],
    weakSheetPrefixes: ["A", "AR"],
    requireStructuredHit: true,
    structuredKeywords: [
      "ELECTRICAL",
      "ELECTRICAL PLAN",
      "POWER PLAN",
      "LIGHTING PLAN",
      "LIGHTING LAYOUT",
      "ELECTRICAL LAYOUT",
      "SWITCHBOARD SCHEDULE",
      "PANEL SCHEDULE",
      "DISTRIBUTION BOARD",
      "SINGLE LINE DIAGRAM",
      "SLD",
      "CIRCUIT SCHEDULE",
      "SMOKE DETECTOR LAYOUT",
      "RCP LIGHTING",
    ],
    secondaryKeywords: [
      "DB",
      "MSB",
      "SWBD",
      "RCD",
      "RCBO",
      "MCB",
      "MCCB",
      "GPO",
      "SOCKET OUTLET",
      "POWER OUTLET",
      "LIGHT FITTING",
      "DOWNLIGHT",
      "LED STRIP",
      "EXHAUST FAN ISOLATOR",
      "DIMMER",
      "SENSOR",
      "PENDANT",
      "EMERGENCY LIGHT",
      "EXIT LIGHT",
      "SMOKE ALARM",
      "HEAT DETECTOR",
      "CABLE",
      "CONDUIT",
      "CABLE TRAY",
      "SOLAR PV",
      "INVERTER",
      "BATTERY STORAGE",
      "EV CHARGER",
      "METER BOARD",
      "SUBMAIN",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["CCTV", "SECURITY", "ACCESS CONTROL", "DATA", "SPRINKLER"],
    abbreviations: ["DB", "MSB", "SLD", "RCD", "RCBO", "MCB", "MCCB", "GPO", "DALI"],
  },

  {
    id: "mechanical-hvac",
    label: "Mechanical / HVAC",
    slug: "mechanical-hvac",
    qsSection: "Mechanical / HVAC",
    qsTradePackage: "Mechanical Subcontractor",
    sheetPrefixes: ["M", "ME", "MC", "MH", "HV"],
    weakSheetPrefixes: ["A", "AR", "E"],
    requireStructuredHit: true,
    structuredKeywords: [
      "HVAC",
      "MECHANICAL",
      "MECHANICAL PLAN",
      "VENTILATION",
      "VENTILATION PLAN",
      "DUCTWORK",
      "AIR CONDITIONING",
      "HEAT PUMP",
      "MECHANICAL SERVICES",
      "MECHANICAL LAYOUT",
      "MECHANICAL SCHEDULE",
      "VENTILATION SCHEDULE",
      "DUCT LAYOUT",
    ],
    secondaryKeywords: [
      "DUCT",
      "DUCT SIZE",
      "GRILLE",
      "DIFFUSER",
      "INLINE FAN",
      "EXTRACT FAN",
      "SUPPLY AIR",
      "RETURN AIR",
      "FRESH AIR",
      "EXHAUST AIR",
      "CONDENSATE",
      "REFRIGERANT",
      "CONDENSER",
      "OUTDOOR UNIT",
      "INDOOR UNIT",
      "HI WALL",
      "CASSETTE",
      "VRF",
      "FCU",
      "AHU",
      "HRV",
      "ERV",
      "BALANCED PRESSURE",
      "AIRFLOW",
      "L/S",
      "CFM",
      "TAB",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["POWER PLAN", "LIGHTING PLAN", "SWITCHBOARD", "CCTV"],
    abbreviations: ["HVAC", "VRF", "FCU", "AHU", "TAB", "HRV", "ERV"],
  },

  {
    id: "elv-security",
    label: "ELV / Security",
    slug: "elv-security",
    qsSection: "ELV / Security",
    qsTradePackage: "Low Voltage Subcontractor",
    sheetPrefixes: ["ICT", "ELV", "SEC", "IT", "AV", "CCTV"],
    weakSheetPrefixes: ["E", "EL"],
    requireStructuredHit: true,
    structuredKeywords: [
      "ELV",
      "ICT",
      "DATA PLAN",
      "DATA LAYOUT",
      "STRUCTURED CABLING",
      "SECURITY PLAN",
      "CCTV PLAN",
      "ACCESS CONTROL",
      "COMMUNICATIONS",
      "AV PLAN",
      "INTERCOM PLAN",
      "LOW VOLTAGE",
      "SECURITY LAYOUT",
    ],
    secondaryKeywords: [
      "CAT6",
      "CAT6A",
      "PATCH PANEL",
      "RACK",
      "CABINET",
      "WAP",
      "ACCESS POINT",
      "DATA OUTLET",
      "RJ45",
      "FIBRE",
      "FIBER",
      "CAMERA",
      "CCTV",
      "NVR",
      "DVR",
      "INTERCOM",
      "DOOR STATION",
      "CARD READER",
      "MAGLOCK",
      "STRIKE",
      "INTRUDER",
      "ALARM",
      "PIR",
      "REX",
      "SPEAKER",
      "AMPLIFIER",
      ...ALLOWANCE_KEYWORDS,
    ],
    excludeKeywords: ["SWITCHBOARD SCHEDULE", "SINGLE LINE DIAGRAM", "SPRINKLER", "HYDRANT"],
    abbreviations: ["ELV", "ICT", "CCTV", "WAP", "AV", "CAT6", "NVR", "RJ45"],
  },

  {
    id: "external-works",
    label: "External Works",
    slug: "external-works",
    qsSection: "External Works",
    qsTradePackage: "Civil / Landscaping Subcontractor",
    sheetPrefixes: ["L", "LA", "LS", "C", "CE", "CV", "A"],
    weakSheetPrefixes: ["AR"],
    requireStructuredHit: true,
    structuredKeywords: [
      "EXTERNAL WORKS",
      "LANDSCAPE PLAN",
      "LANDSCAPING PLAN",
      "PAVING PLAN",
      "DRIVEWAY PLAN",
      "FENCING PLAN",
      "DECK PLAN",
      "SITE PLAN",
      "HARDSCAPE PLAN",
      "SOFTSCAPE PLAN",
      "EXTERNAL DETAILS",
      "EXTERNAL FINISHES",
      "SET OUT",
      "SETOUT",
    ],
    secondaryKeywords: [
      "DRIVEWAY",
      "PAVING",
      "PAVER",
      "ASPHALT",
      "CONCRETE DRIVEWAY",
      "PATH",
      "PATHWAY",
      "KERB",
      "CHANNEL",
      "APRON",
      "CROSSOVER",
      "DECK",
      "DECKING",
      "STAIR",
      "STEP",
      "HANDRAIL",
      "BALUSTRADE",
      "FENCE",
      "BOUNDARY FENCE",
      "GATE",
      "LETTERBOX",
      "CLOTHESLINE",
      "PLANTING",
      "TREE",
      "SHRUB",
      "TURF",
      "GRASS",
      "TOPSOIL",
      "MULCH",
      "IRRIGATION",
      "EDGING",
      "GRAVEL",
      "PEBBLE",
      "RETAINING WALL",
      "TIMBER RETAINING",
      "SEAT",
      "BOLLARD",
      "OUTDOOR FURNITURE",
    ],
    excludeKeywords: ["FOOTING PLAN", "SLAB REINFORCEMENT", "REBAR", "WINDOW SCHEDULE"],
    abbreviations: [],
  },
];

const LEGACY_TRADE_ID_ALIASES: Readonly<Record<string, string>> = {
  "below-ground-services": "drainage-underground-services",
  "timber-framing": "structural-frame",
  "windows-external-doors": "windows-glazing",
  "linings-ceilings": "internal-linings",
  "plumbing-hydraulic": "plumbing",
  "hvac-mechanical": "mechanical-hvac",
  "elv-ict": "elv-security",
};

/** ===================== Scoring Engine ===================== */

interface TradeSignalBreakdown {
  trade: TradePackTrade;
  matchedStrongSheetPrefixes: string[];
  matchedWeakSheetPrefixes: string[];
  matchedSheetPrefixes: string[];
  matchedStructuredKeywords: string[];
  matchedSecondaryKeywords: string[];
  matchedAbbreviations: string[];
  matchedExcludeKeywords: string[];
  hasStrongPrefixSignal: boolean;
  hasWeakPrefixSignal: boolean;
  hasPrefixSignal: boolean;
  hasStructuredSignal: boolean;
  hasSecondaryCluster: boolean;
  hasExcludeSignal: boolean;
  hardSignal: boolean;
  score: number;
}

function buildTradeSignalBreakdown(params: {
  normalizedText: string;
  titleBlockText: string;
  sheetPrefixes: string[];
  trade: TradePackTrade;
}): TradeSignalBreakdown {
  const { normalizedText, titleBlockText, sheetPrefixes, trade } = params;

  const matchedStrongSheetPrefixes = sheetPrefixes.filter((p) => trade.sheetPrefixes.includes(p));
  const matchedWeakSheetPrefixes = sheetPrefixes.filter((p) => (trade.weakSheetPrefixes ?? []).includes(p));
  const matchedSheetPrefixes = uniqueSorted([...matchedStrongSheetPrefixes, ...matchedWeakSheetPrefixes]);

  const matchedStructuredKeywords = trade.structuredKeywords.filter((k) => matchesPhrase(titleBlockText, k));
  const matchedSecondaryKeywords = trade.secondaryKeywords.filter((k) => matchesPhrase(normalizedText, k));
  const matchedAbbreviations = trade.abbreviations.filter((a) => matchesToken(normalizedText, a));
  const matchedExcludeKeywords = (trade.excludeKeywords ?? []).filter((k) => matchesPhrase(normalizedText, k));

  const hasStrongPrefixSignal = matchedStrongSheetPrefixes.length > 0;
  const hasWeakPrefixSignal = matchedWeakSheetPrefixes.length > 0;
  const hasPrefixSignal = hasStrongPrefixSignal || hasWeakPrefixSignal;
  const hasStructuredSignal = matchedStructuredKeywords.length > 0;
  const hasSecondaryCluster = matchedSecondaryKeywords.length >= 2 || matchedAbbreviations.length >= 2;
  const hasExcludeSignal = matchedExcludeKeywords.length > 0;

  const hardSignal =
    hasStructuredSignal || hasStrongPrefixSignal || (hasWeakPrefixSignal && !trade.requireStructuredHit);

  const structuredScore = hasStructuredSignal ? 8 + Math.min(3, matchedStructuredKeywords.length - 1) : 0;
  const prefixScore =
    (hasStrongPrefixSignal ? 5 + Math.min(2, matchedStrongSheetPrefixes.length - 1) : 0) +
    (!hasStrongPrefixSignal && hasWeakPrefixSignal ? 1 : 0);

  const secondaryBooster = hardSignal ? Math.min(4, matchedSecondaryKeywords.length) : 0;
  const abbreviationBooster = hardSignal ? Math.min(3, matchedAbbreviations.length) : 0;
  const excludePenalty = hasExcludeSignal && !hasStructuredSignal ? Math.min(8, matchedExcludeKeywords.length * 2) : 0;

  const score = Math.max(
    0,
    prefixScore +
      structuredScore +
      secondaryBooster +
      abbreviationBooster +
      (hasStrongPrefixSignal && hasStructuredSignal ? 2 : 0) -
      excludePenalty
  );

  return {
    trade,
    matchedStrongSheetPrefixes,
    matchedWeakSheetPrefixes,
    matchedSheetPrefixes,
    matchedStructuredKeywords,
    matchedSecondaryKeywords,
    matchedAbbreviations,
    matchedExcludeKeywords,
    hasStrongPrefixSignal,
    hasWeakPrefixSignal,
    hasPrefixSignal,
    hasStructuredSignal,
    hasSecondaryCluster,
    hasExcludeSignal,
    hardSignal,
    score,
  };
}

function getStrongestSignal(signals: TradeSignalBreakdown[]): TradeSignalBreakdown | null {
  if (signals.length === 0) return null;
  return signals.reduce((best, cur) => (cur.score > best.score ? cur : best));
}

function buildRelevantReason(signal: TradeSignalBreakdown): string {
  if (signal.hasStructuredSignal && signal.hasPrefixSignal) {
    return `Title "${signal.matchedStructuredKeywords[0]}" + sheet prefix ${signal.matchedSheetPrefixes.slice(0, 2).join(", ")}`;
  }
  if (signal.hasStructuredSignal) {
    return `Title "${signal.matchedStructuredKeywords[0]}"`;
  }
  if (signal.hasPrefixSignal && signal.matchedAbbreviations.length > 0) {
    return `Sheet prefix ${signal.matchedSheetPrefixes.slice(0, 2).join(", ")} + abbreviation ${signal.matchedAbbreviations[0]}`;
  }
  if (signal.hasPrefixSignal) {
    return `Sheet prefix ${signal.matchedSheetPrefixes.slice(0, 2).join(", ")}`;
  }
  if (signal.matchedAbbreviations.length > 0) {
    return `Abbreviation ${signal.matchedAbbreviations[0]}`;
  }
  return `Keyword cluster ${signal.matchedSecondaryKeywords.slice(0, 3).join(", ")}`;
}

export function analyzePagePrefilterForTrade(pageText: string, trade: TradePackTrade): TradePagePrefilterSignal {
  const normalizedText = normalizeText(pageText);
  const titleBlockText = extractTitleBlockText(normalizedText);
  const sheetPrefixes = extractSheetPrefixes(normalizedText);

  const matchedStrongSheetPrefixes = sheetPrefixes.filter((p) => trade.sheetPrefixes.includes(p));
  const matchedWeakSheetPrefixes = sheetPrefixes.filter((p) => (trade.weakSheetPrefixes ?? []).includes(p));
  const matchedSheetPrefixes = uniqueSorted([...matchedStrongSheetPrefixes, ...matchedWeakSheetPrefixes]);

  const matchedStructuredKeywords = trade.structuredKeywords.filter((k) => matchesPhrase(titleBlockText, k));
  const matchedSecondaryKeywords = trade.secondaryKeywords.filter((k) => matchesPhrase(normalizedText, k));
  const matchedAbbreviations = trade.abbreviations.filter((a) => matchesToken(normalizedText, a));
  const matchedExcludeKeywords = (trade.excludeKeywords ?? []).filter((k) => matchesPhrase(normalizedText, k));

  const supportMatches = findSupportMatches(normalizedText);
  const tradeSupportHints = findTradeSupportHints(normalizedText, trade);

  const hasStrongPrefixSignal = matchedStrongSheetPrefixes.length > 0;
  const hasWeakPrefixSignal = matchedWeakSheetPrefixes.length > 0;
  const hasPrefixSignal = hasStrongPrefixSignal || hasWeakPrefixSignal;
  const hasStructuredSignal = matchedStructuredKeywords.length > 0;

  const requiresStructuredHit = Boolean(trade.requireStructuredHit);
  const excludedByKeyword = matchedExcludeKeywords.length > 0 && !hasStructuredSignal;

  const isSupportSheet =
    supportMatches.length > 0 &&
    (tradeSupportHints.length > 0 || hasPrefixSignal || hasStructuredSignal);

  const meetsStructuredRequirement = !requiresStructuredHit || hasStructuredSignal || isSupportSheet;

  const shouldSendToVlm =
    (hasPrefixSignal || hasStructuredSignal || isSupportSheet) &&
    !excludedByKeyword &&
    meetsStructuredRequirement;

  const score = Math.max(
    0,
    (hasStrongPrefixSignal ? 4 : 0) +
      (hasWeakPrefixSignal && !hasStrongPrefixSignal ? 1 : 0) +
      (hasStructuredSignal ? 7 : 0) +
      (hasStructuredSignal || hasPrefixSignal ? Math.min(2, matchedSecondaryKeywords.length) : 0) +
      (hasStructuredSignal || hasPrefixSignal ? Math.min(2, matchedAbbreviations.length) : 0) +
      (isSupportSheet ? 2 : 0) -
      (excludedByKeyword ? Math.min(3, matchedExcludeKeywords.length) : 0)
  );

  let reason = "No prefilter signal";
  if (excludedByKeyword) {
    reason = `Prefilter: excluded by keyword "${matchedExcludeKeywords[0]}"`;
  } else if (requiresStructuredHit && !hasStructuredSignal && hasPrefixSignal) {
    reason = "Prefilter: requires title-block keyword hit";
  } else if (hasStructuredSignal) {
    reason = `Prefilter: title "${matchedStructuredKeywords[0]}"`;
  } else if (hasPrefixSignal) {
    reason = hasStrongPrefixSignal
      ? `Prefilter: sheet prefix ${matchedStrongSheetPrefixes.slice(0, 2).join(", ")}`
      : `Prefilter: weak sheet prefix ${matchedWeakSheetPrefixes.slice(0, 2).join(", ")}`;
  } else if (isSupportSheet) {
    reason = `Prefilter: support sheet "${supportMatches[0]}"`;
  }

  return {
    shouldSendToVlm,
    score,
    matchedSheetPrefixes,
    matchedStructuredKeywords,
    matchedSecondaryKeywords,
    matchedAbbreviations,
    supportMatches,
    isSupportSheet,
    reason,
  };
}

export function getTradeById(tradeId: string): TradePackTrade | null {
  const normalizedTradeId = tradeId.trim();
  const resolvedTradeId = LEGACY_TRADE_ID_ALIASES[normalizedTradeId] ?? normalizedTradeId;
  return TRADE_PACK_TRADES.find((t) => t.id === resolvedTradeId) ?? null;
}

export function extractSheetPrefixes(pageText: string): string[] {
  const normalizedText = normalizeText(pageText);

  const matches = normalizedText.matchAll(
    /\b([A-Z]{1,4})\s*[-_.]?\s*\d{1,4}(?:\.\d{1,2})?\b/g
  );

  const prefixes: string[] = [];
  for (const m of matches) {
    const prefix = m[1];
    if (!prefix || SHEET_PREFIX_EXCLUSIONS.has(prefix)) continue;
    prefixes.push(prefix);
  }
  return uniqueSorted(prefixes);
}

export function analyzePageForTrade(pageText: string, trade: TradePackTrade): TradePageSignal {
  const normalizedText = normalizeText(pageText);
  const titleBlockText = extractTitleBlockText(normalizedText);
  const sheetPrefixes = extractSheetPrefixes(normalizedText);

  const allSignals = TRADE_PACK_TRADES.map((candidateTrade) =>
    buildTradeSignalBreakdown({
      normalizedText,
      titleBlockText,
      sheetPrefixes,
      trade: candidateTrade,
    })
  );

  const selectedSignal =
    allSignals.find((s) => s.trade.id === trade.id) ??
    buildTradeSignalBreakdown({ normalizedText, titleBlockText, sheetPrefixes, trade });

  const competingSignals = allSignals.filter((s) => s.trade.id !== selectedSignal.trade.id);
  const strongestCompetingSignal = getStrongestSignal(competingSignals);
  const strongestCompetingHardSignal = getStrongestSignal(competingSignals.filter((s) => s.hardSignal));

  const mixedDisciplinePrefixPage =
    allSignals.filter((s) => s.hasPrefixSignal).length >= MIXED_DISCIPLINE_PREFIX_THRESHOLD;

  const selectedDominatesCompetition =
    !strongestCompetingSignal || selectedSignal.score >= strongestCompetingSignal.score + COMPETING_SIGNAL_MARGIN;

  let isRelevant = selectedSignal.hardSignal;
  let reason = "No trade signal";

  if (trade.requireStructuredHit && !selectedSignal.hasStructuredSignal) {
    const supportMatches = findSupportMatches(normalizedText);
    const tradeSupportHints = findTradeSupportHints(normalizedText, trade);
    const canPassAsSupport = supportMatches.length > 0 && tradeSupportHints.length > 0;
    if (!canPassAsSupport) {
      isRelevant = false;
      reason = "Requires title-block keyword hit";
    }
  }

  if (isRelevant && selectedSignal.hasExcludeSignal && !selectedSignal.hasStructuredSignal) {
    isRelevant = false;
    reason = `Excluded by keyword "${selectedSignal.matchedExcludeKeywords[0]}" without title signal`;
  }

  if (
    isRelevant &&
    mixedDisciplinePrefixPage &&
    !selectedSignal.hasStructuredSignal &&
    selectedSignal.matchedSheetPrefixes.length <= 1 &&
    strongestCompetingHardSignal &&
    !selectedDominatesCompetition
  ) {
    isRelevant = false;
    reason = "Mixed-discipline index page (no dominant title signal)";
  }

  if (
    isRelevant &&
    strongestCompetingHardSignal &&
    strongestCompetingHardSignal.score >= selectedSignal.score + CLEARLY_STRONGER_SIGNAL_MARGIN &&
    !selectedSignal.hasStructuredSignal
  ) {
    isRelevant = false;
    reason = `${strongestCompetingHardSignal.trade.label} has a stronger primary signal`;
  }

  if (
    !isRelevant &&
    reason === "No trade signal" &&
    (selectedSignal.hasSecondaryCluster || selectedSignal.matchedAbbreviations.length > 0)
  ) {
    reason = `${selectedSignal.trade.label} secondary terms found but no title signal`;
  }

  if (isRelevant) {
    reason = buildRelevantReason(selectedSignal);
  }

  return {
    isRelevant,
    score: selectedSignal.score,
    matchedSheetPrefixes: selectedSignal.matchedSheetPrefixes,
    matchedStructuredKeywords: selectedSignal.matchedStructuredKeywords,
    matchedSecondaryKeywords: selectedSignal.matchedSecondaryKeywords,
    matchedAbbreviations: selectedSignal.matchedAbbreviations,
    reason,
  };
}
