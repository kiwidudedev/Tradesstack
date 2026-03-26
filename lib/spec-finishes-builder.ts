export interface SpecFinishesTradeProfile {
  id: string;
  label: string;
  slug: string;
  masterspecGroups: string[];
  sheetPrefixes: string[];
  weakSheetPrefixes: string[];
  primaryKeywords: string[]; // structuredKeywords = spec section titles / schedule titles / formal headings
  secondaryKeywords: string[]; // product / system / material language
  abbreviations: string[]; // shorthand and drawing abbreviations
  specHeadings: string[];
  scheduleKeywords: string[];
  fixtureKeywords: string[];
  materialKeywords: string[];
  systemKeywords: string[];
  excludeKeywords: string[];
}

export interface SpecFinishesTradeSignal {
  isRelevant: boolean;
  confidence: number;
  score: number;
  matchedHeadings: string[];
  matchedSchedules: string[];
  matchedFixtures: string[];
  matchedMaterials: string[];
  matchedSystems: string[];
  matchedTradeKeywords: string[];
  reason: string;
}

interface SpecFinishesBaseTrade {
  id: string;
  label: string;
  slug: string;
  masterspecGroups: string[];
  sheetPrefixes: string[];
  weakSheetPrefixes?: string[];
  primaryKeywords: string[];
  secondaryKeywords: string[];
  abbreviations: string[];
}

const TITLE_BLOCK_CHAR_LIMIT = 1800;

const GLOBAL_SPEC_HEADINGS = [
  "WORK SECTION",
  "WORK SECTIONS",
  "SECTION",
  "SPECIFICATION",
  "SPECIFICATIONS",
  "PROJECT SPECIFICATION",
  "ARCHITECTURAL SPECIFICATION",
  "INTERIOR SPECIFICATION",
  "TRADE SPECIFICATION",
  "SELECTION SCHEDULE",
  "SELECTION SCHEDULES",
  "SCHEDULE OF SELECTIONS",
  "SCHEDULE SECTIONS",
  "EXPLANATION OF SCHEDULE SECTIONS",
  "FINISH SCHEDULE",
  "FINISHES SCHEDULE",
  "ROOM FINISH SCHEDULE",
  "FLOOR FINISH SCHEDULE",
  "WALL FINISH SCHEDULE",
  "CEILING FINISH SCHEDULE",
  "SCHEDULE OF FINISHES",
  "MATERIAL SCHEDULE",
  "SCHEDULE OF MATERIALS",
  "MATERIAL SELECTIONS",
  "FINISH SELECTIONS",
  "CRITERIA SCHEDULE",
  "CREDIT SCHEDULE",
] as const;

const CBI_FAMILY_HEADINGS = [
  "1 GENERAL",
  "2 SITE",
  "3 STRUCTURE",
  "4 ENCLOSURE",
  "5 INTERIOR",
  "6 FINISH",
  "7 SERVICES",
  "8 EXTERNAL",

  "11 PROJECT MANAGEMENT AND ADMINISTRATION",
  "12 PROCUREMENT AND CONTRACTING",
  "13 QUALITY MANAGEMENT",
  "14 PRODUCT REQUIREMENTS",
  "15 TEMPORARY FACILITIES AND SERVICES",
  "16 SITE ESTABLISHMENT",
  "17 EXECUTION REQUIREMENTS",

  "20 DEMOLITION AND REMOVALS",
  "21 EARTHWORKS",
  "22 SITE PREPARATION",
  "23 PILING AND GROUND IMPROVEMENT",
  "24 DRAINAGE",
  "25 SITE SERVICES",
  "26 SITE RETAINING STRUCTURES",
  "27 LANDSCAPE AND EXTERNAL WORKS",

  "30 CONCRETE",
  "31 REINFORCEMENT",
  "32 PRECAST CONCRETE",
  "33 STRUCTURAL STEEL",
  "34 STRUCTURAL TIMBER",
  "35 STRUCTURAL METALWORK",
  "36 COMPOSITE STRUCTURES",

  "40 ROOF CONSTRUCTION",
  "41 ROOF COVERINGS",
  "42 ROOF WINDOWS AND SKYLIGHTS",
  "43 WALL CONSTRUCTION",
  "44 WALL CLADDING",
  "45 WINDOWS AND EXTERNAL DOORS",
  "46 CURTAIN WALLING",
  "47 ROOF AND WALL FLASHINGS",
  "48 INSULATION AND MOISTURE CONTROL",

  "51 WALL AND CEILING LININGS",
  "52 PARTITIONS, SCREENS AND DOORS",
  "53 CEILING SYSTEMS",
  "54 FLOORS",
  "55 JOINERY FIXTURES AND HARDWARE",
  "56 GENERAL INTERIOR FITTINGS",

  "61 APPLIED COATINGS",
  "62 WALL FINISHES",
  "63 CEILING FINISHES",
  "64 FLOOR FINISHES",
  "65 SPECIALIST FINISHES",

  "70 GENERAL SERVICES",
  "71 LIQUID SUPPLY",
  "72 HEAT, AIR, HUMIDITY AND VENTILATION",
  "73 ELECTRICAL SUPPLY, LIGHTING AND COMMUNICATIONS",
  "74 TRANSPORT",
  "75 FIRE PROTECTION",
  "76 COMMUNICATIONS, SECURITY AND SAFETY",

  "80 EXTERNAL STRUCTURES",
  "81 ROADS, PATHS AND PAVING",
  "82 SITE FURNITURE",
  "83 EXTERNAL SERVICES",
  "84 LANDSCAPE WORK",
] as const;

const GLOBAL_SCHEDULE_KEYWORDS = [
  "DOOR SCHEDULE",
  "WINDOW SCHEDULE",
  "HARDWARE SCHEDULE",
  "JOINERY SCHEDULE",
  "CABINETRY SCHEDULE",
  "SANITARY SCHEDULE",
  "SANITARY FIXTURE SCHEDULE",
  "LIGHTING SCHEDULE",
  "POWER SCHEDULE",
  "ROOM FINISH SCHEDULE",
  "FLOOR FINISH SCHEDULE",
  "WALL FINISH SCHEDULE",
  "CEILING FINISH SCHEDULE",
  "FLOOR FINISH",
  "WALL FINISH",
  "CEILING FINISH",
  "PAINT SCHEDULE",
  "COATING SCHEDULE",
  "FIXTURE SCHEDULE",
  "FITTING SCHEDULE",
  "APPLIANCE SCHEDULE",
] as const;

const GLOBAL_FIXTURE_KEYWORDS = [
  "FIXTURE",
  "FIXTURES",
  "FITTING",
  "FITTINGS",
  "HARDWARE",
  "JOINERY",
  "CABINETRY",
  "TAPWARE",
  "BASIN",
  "WC",
  "TOILET",
  "SHOWER",
  "VANITY",
  "ACCESSORY",
  "ACCESSORIES",
  "APPLIANCE",
  "APPLIANCES",
  "SANITARYWARE",
  "LIGHT FITTING",
  "LUMINAIRE",
] as const;

const GLOBAL_MATERIAL_KEYWORDS = [
  "TIMBER",
  "STEEL",
  "ALUMINIUM",
  "GLASS",
  "GYPSUM",
  "PLASTERBOARD",
  "FIBRE CEMENT",
  "VINYL",
  "CARPET",
  "CERAMIC TILE",
  "PORCELAIN TILE",
  "LAMINATE",
  "VENEER",
  "MDF",
  "PLYWOOD",
  "STONE",
  "ENGINEERED STONE",
  "PAINT SYSTEM",
  "COATING SYSTEM",
  "MEMBRANE",
] as const;

const GLOBAL_SYSTEM_KEYWORDS = [
  "HVAC",
  "MECHANICAL",
  "VENTILATION",
  "PLUMBING",
  "HYDRAULIC",
  "ELECTRICAL",
  "LIGHTING",
  "POWER",
  "ELV",
  "DATA",
  "COMMS",
  "COMMUNICATIONS",
  "FIRE PROTECTION",
  "SECURITY",
  "ACCESS CONTROL",
] as const;

const GLOBAL_EXCLUDE_KEYWORDS = [
  "FOUNDATION PLAN",
  "FOUNDATIONS PLAN",
  "FOOTING PLAN",
  "EARTHWORKS",
  "REBAR",
  "PILE SCHEDULE",
  "CONCRETE REINFORCEMENT",
  "REINFORCEMENT PLAN",
  "SLAB PLAN",
  "GROUND BEAM PLAN",
  "BRACING PLAN",
] as const;

const SPEC_FINISHES_BASE_TRADES: ReadonlyArray<SpecFinishesBaseTrade> = [
  {
    id: "preliminaries-general",
    label: "Preliminaries / General",
    slug: "preliminaries-general",
    masterspecGroups: ["1 General", "15 Temporary facilities and services", "16 Site establishment"],
    sheetPrefixes: ["G", "GN", "GEN", "PR"],
    weakSheetPrefixes: ["A", "C"],
    primaryKeywords: [
      "PRELIMINARIES",
      "GENERAL REQUIREMENTS",
      "GENERAL NOTES",
      "GENERAL CONSTRUCTION NOTES",
      "PROJECT SPECIFICATION",
      "SPECIFICATION",
      "WORK SECTION",
      "PROJECT PARTICULARS",
      "SCOPE OF WORK",
      "SITE ESTABLISHMENT",
      "TEMPORARY WORKS",
      "TEMPORARY SERVICES",
      "HEALTH AND SAFETY",
      "QUALITY ASSURANCE",
      "ENVIRONMENTAL MANAGEMENT",
      "SITE FACILITIES",
      "SITE LOGISTICS",
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
      "PROTECTION",
      "WEATHER PROTECTION",
      "DUST CONTROL",
      "NOISE CONTROL",
      "WASTE MANAGEMENT",
      "SITE CLEANING",
      "SCAFFOLD",
      "SCAFFOLDING",
      "EDGE PROTECTION",
      "FIRE EXTINGUISHER",
      "FIRST AID",
      "TRAFFIC MANAGEMENT",
      "SUBMITTALS",
      "MATERIALS",
    ],
    abbreviations: ["NTS", "GA", "TMP", "QA", "ITP", "PPE", "SWMS", "H&S"],
  },

  {
    id: "demolition",
    label: "Demolition",
    slug: "demolition",
    masterspecGroups: ["2 Site", "20 Demolition and removals"],
    sheetPrefixes: ["D", "DM"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "DEMOLITION",
      "DEMOLITION PLAN",
      "DEMOLITION NOTES",
      "SELECTIVE DEMOLITION",
      "EXISTING DEMOLITION",
      "REMOVE EXISTING",
      "EXISTING TO BE REMOVED",
      "EXISTING TO BE DEMOLISHED",
    ],
    secondaryKeywords: [
      "STRIP OUT",
      "MAKE GOOD",
      "DISMANTLE",
      "SALVAGE",
      "SOFT STRIP",
      "BREAK OUT",
      "SAW CUT",
      "TEMPORARY PROPPING",
    ],
    abbreviations: ["DEMO", "DEM", "DM"],
  },

  {
    id: "earthworks",
    label: "Earthworks",
    slug: "earthworks",
    masterspecGroups: ["2 Site", "21 Earthworks"],
    sheetPrefixes: ["C", "E", "EW"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "EARTHWORKS",
      "EXCAVATION",
      "CUT AND FILL",
      "SITE PREPARATION",
      "GRADING PLAN",
      "CONTOUR PLAN",
    ],
    secondaryKeywords: [
      "SUBGRADE",
      "BACKFILL",
      "COMPACTION",
      "FORMATION LEVELS",
      "TOPSOIL",
      "FILL MATERIAL",
      "ENGINEERED FILL",
      "GEOTEXTILE",
    ],
    abbreviations: ["EWK", "RL", "FFL"],
  },

  {
    id: "drainage-underground-services",
    label: "Drainage / Underground Services",
    slug: "drainage-underground-services",
    masterspecGroups: ["2 Site", "24 Drainage", "25 Site services"],
    sheetPrefixes: ["C", "D", "HY"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "DRAINAGE",
      "STORMWATER",
      "SEWER",
      "UNDERGROUND SERVICES",
      "UNDERGROUND DRAINAGE",
      "SANITARY DRAINAGE",
    ],
    secondaryKeywords: [
      "MANHOLE",
      "PIPEWORK",
      "CATCHPIT",
      "FOUL WATER",
      "INSPECTION CHAMBER",
      "SOAK PIT",
      "RODDING EYE",
    ],
    abbreviations: ["SW", "FW", "MH", "CP"],
  },

  {
    id: "concrete-foundations",
    label: "Concrete / Foundations",
    slug: "concrete-foundations",
    masterspecGroups: ["3 Structure", "30 Concrete", "31 Reinforcement"],
    sheetPrefixes: ["S", "C", "F"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "CONCRETE",
      "FOUNDATION",
      "FOOTING",
      "SLAB PLAN",
      "REINFORCEMENT PLAN",
      "FOUNDATION PLAN",
      "FOOTING SCHEDULE",
    ],
    secondaryKeywords: [
      "SLAB",
      "REINFORCEMENT",
      "FORMWORK",
      "EDGE BEAM",
      "PAD FOOTING",
      "REBAR",
      "MESH",
      "DPM",
    ],
    abbreviations: ["RC", "FFL", "N12", "D12"],
  },

  {
    id: "structural-frame",
    label: "Structural Frame",
    slug: "structural-frame",
    masterspecGroups: ["3 Structure", "34 Structural timber"],
    sheetPrefixes: ["S", "ST"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "STRUCTURAL FRAME",
      "FRAMING",
      "STRUCTURAL TIMBER",
      "TIMBER STRUCTURE",
      "FRAMING PLAN",
      "TRUSS PLAN",
    ],
    secondaryKeywords: [
      "BEAM",
      "COLUMN",
      "BRACING",
      "TRUSS",
      "JOIST",
      "RAFTER",
      "STUD",
      "HOLD DOWN",
    ],
    abbreviations: ["STR", "FRM", "LVL", "GLULAM"],
  },

  {
    id: "structural-steel",
    label: "Structural Steel",
    slug: "structural-steel",
    masterspecGroups: ["3 Structure", "33 Structural steel"],
    sheetPrefixes: ["S", "SS"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "STRUCTURAL STEEL",
      "STEELWORK",
      "STEEL FRAME",
      "STEEL DETAILS",
      "MEMBER SCHEDULE",
      "CONNECTION DETAILS",
    ],
    secondaryKeywords: [
      "UB",
      "UC",
      "PFC",
      "CONNECTION",
      "BASE PLATE",
      "WELD",
      "ANCHOR BOLT",
      "GALVANISED",
    ],
    abbreviations: ["SS", "RHS", "SHS", "CHS"],
  },

  {
    id: "roofing",
    label: "Roofing",
    slug: "roofing",
    masterspecGroups: ["4 Enclosure", "40 Roof construction", "41 Roof coverings", "47 Roof and wall flashings"],
    sheetPrefixes: ["A", "R"],
    weakSheetPrefixes: ["AR"],
    primaryKeywords: [
      "ROOFING",
      "ROOF",
      "ROOF COVERING",
      "ROOF PLAN",
      "FLASHING DETAILS",
      "ROOF CLADDING",
      "ROOF MEMBRANE",
    ],
    secondaryKeywords: [
      "FLASHING",
      "GUTTER",
      "DOWNPIPE",
      "MEMBRANE ROOF",
      "PARAPET",
      "SCUPPER",
      "LONGRUN",
      "COLORSTEEL",
    ],
    abbreviations: ["RFG", "RWP", "DP"],
  },

  {
    id: "windows-glazing",
    label: "Windows / Glazing",
    slug: "windows-glazing",
    masterspecGroups: ["4 Enclosure", "45 Windows and external doors", "46 Curtain walling", "52 Partitions, screens and doors"],
    sheetPrefixes: ["A", "W", "GL"],
    weakSheetPrefixes: ["AR", "J"],
    primaryKeywords: [
      "WINDOW SCHEDULE",
      "WINDOW SCHEDULES",
      "WINDOW TYPES",
      "WINDOW DETAILS",
      "GLAZING SCHEDULE",
      "GLASS SCHEDULE",
      "GLAZING DETAILS",
      "EXTERNAL DOOR SCHEDULE",
      "ALUMINIUM JOINERY",
      "ALUMINUM JOINERY",
      "JOINERY SCHEDULE",
      "JOINERY DETAILS",
      "SHOPFRONT",
      "CURTAIN WALL",
      "LOUVRE SCHEDULE",
    ],
    secondaryKeywords: [
      "WINDOW",
      "GLAZING",
      "GLASS",
      "FRAME",
      "DOUBLE GLAZED",
      "SEALANT",
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
      "SLIDING DOOR",
      "BIFOLD",
      "AWNING",
      "CASEMENT",
      "FIXED LIGHT",
      "FANLIGHT",
      "SIDELIGHT",
      "SILL TRAY",
      "HEAD FLASHING",
      "JAMB FLASHING",
    ],
    abbreviations: ["GLZ", "WND", "DGU", "IGU", "LOW-E", "GL"],
  },

  {
    id: "insulation",
    label: "Insulation",
    slug: "insulation",
    masterspecGroups: ["4 Enclosure", "48 Insulation and moisture control"],
    sheetPrefixes: ["A", "I"],
    weakSheetPrefixes: ["AI"],
    primaryKeywords: [
      "INSULATION",
      "THERMAL INSULATION",
      "ACOUSTIC INSULATION",
      "INSULATION SCHEDULE",
      "R-VALUE",
      "THERMAL ENVELOPE",
    ],
    secondaryKeywords: [
      "R-VALUE",
      "BATT",
      "BLANKET",
      "GLASSWOOL",
      "POLYESTER",
      "ROCKWOOL",
      "MINERAL WOOL",
    ],
    abbreviations: ["INS", "R2.2", "R3.2", "R4.0"],
  },

  {
    id: "internal-linings",
    label: "Internal Linings",
    slug: "internal-linings",
    masterspecGroups: ["5 Interior", "51 Wall and ceiling linings", "53 Ceiling systems"],
    sheetPrefixes: ["A", "L"],
    weakSheetPrefixes: ["AI"],
    primaryKeywords: [
      "LININGS",
      "WALL LINING",
      "CEILING LINING",
      "WALL AND CEILING LININGS",
      "LINING SCHEDULE",
      "CEILING SYSTEMS",
      "REFLECTED CEILING PLAN",
    ],
    secondaryKeywords: [
      "PLASTERBOARD",
      "SHEETING",
      "CLADDING",
      "GIB BOARD",
      "FIBRE CEMENT",
      "SUSPENDED CEILING",
      "GRID CEILING",
      "ACOUSTIC PANEL",
    ],
    abbreviations: ["LIN", "RCP", "GIB"],
  },

  {
    id: "plastering-stopping",
    label: "Plastering / Stopping",
    slug: "plastering-stopping",
    masterspecGroups: ["5 Interior", "51 Wall and ceiling linings", "61 Applied coatings"],
    sheetPrefixes: ["A", "P"],
    weakSheetPrefixes: ["AI"],
    primaryKeywords: [
      "PLASTERING",
      "STOPPING",
      "LEVEL 4 FINISH",
      "LEVEL 5 FINISH",
      "PLASTERING SCHEDULE",
      "SURFACE FINISH LEVEL",
    ],
    secondaryKeywords: [
      "JOINTING",
      "SKIM COAT",
      "SURFACE FINISH",
      "SET JOINT",
      "COMPOUND",
      "SANDING",
      "CRITICAL LIGHT",
    ],
    abbreviations: ["PLS", "L4", "L5"],
  },

  {
    id: "internal-carpentry",
    label: "Internal Carpentry",
    slug: "internal-carpentry",
    masterspecGroups: ["5 Interior", "52 Partitions, screens and doors", "55 Joinery fixtures and hardware"],
    sheetPrefixes: ["A", "AI", "INT"],
    weakSheetPrefixes: ["J", "ID"],
    primaryKeywords: [
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
      "PARTITIONS, SCREENS AND DOORS",
    ],
    secondaryKeywords: [
      "CARPENTRY",
      "TRIM",
      "SKIRTING",
      "ARCHITRAVE",
      "MOULDING",
      "LINING",
      "CORNICE",
      "SCOTIA",
      "SCRIBE",
      "REVEAL",
      "DOOR FRAME",
      "JAMB",
      "CAVITY SLIDER",
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
    ],
    abbreviations: ["CP", "INT", "FD", "PC", "PS"],
  },

  {
    id: "joinery-cabinetry",
    label: "Joinery / Cabinetry",
    slug: "joinery-cabinetry",
    masterspecGroups: ["5 Interior", "55 Joinery fixtures and hardware"],
    sheetPrefixes: ["J", "AJ", "JN"],
    weakSheetPrefixes: ["A", "ID"],
    primaryKeywords: [
      "JOINERY FIXTURES AND HARDWARE",
      "JOINERY",
      "JOINERY PLAN",
      "JOINERY DETAILS",
      "JOINERY SCHEDULE",
      "CABINETRY",
      "CABINETRY SCHEDULE",
      "JOINERY & CABINETRY FIXTURES",
      "PURPOSE-MADE FIXTURES",
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
      "CASEWORK",
      "BENCHTOP",
      "WARDROBE",
      "PANTRY",
      "CABINET",
      "CARCASS",
      "DRAWER",
      "HINGE",
      "SOFT CLOSE",
      "PANEL",
      "DOOR FRONT",
      "SPLASHBACK",
      "ISLAND",
      "WIR",
      "OPEN SHELVING",
      "PLINTH",
      "KICKBOARD",
      "HANDLELESS",
      "PUSH TO OPEN",
      "LAMINATE",
      "VENEER",
      "MDF",
      "PLYWOOD",
      "MELAMINE",
      "HPL",
      "STONE TOP",
      "ENGINEERED STONE",
      "SOLID SURFACE",
    ],
    abbreviations: ["JRY", "CAB", "WIR", "HPL", "MDF", "PC", "PS"],
  },

  {
    id: "waterproofing",
    label: "Waterproofing",
    slug: "waterproofing",
    masterspecGroups: ["4 Enclosure", "47 Roof and wall flashings", "48 Insulation and moisture control"],
    sheetPrefixes: ["A", "WP"],
    weakSheetPrefixes: ["AR", "WPF"],
    primaryKeywords: [
      "WATERPROOFING",
      "WATERPROOFING SPECIFICATION",
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
      "MEMBRANE",
      "WET AREA",
      "FLASHING",
      "PENETRATION",
      "SEAL",
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
    ],
    abbreviations: ["WP", "WPF", "EPDM", "TPO"],
  },

  {
    id: "tiling",
    label: "Tiling",
    slug: "tiling",
    masterspecGroups: ["6 Finish", "62 Wall finishes", "64 Floor finishes"],
    sheetPrefixes: ["A", "T", "FIN"],
    weakSheetPrefixes: ["AR", "ID"],
    primaryKeywords: [
      "TILING",
      "TILING SPECIFICATION",
      "TILE PLAN",
      "TILE SCHEDULE",
      "TILE LAYOUT",
      "TILE SETOUT",
      "TILE SET OUT",
      "TILING DETAILS",
      "WET AREA FINISHES",
      "WALL FINISH SCHEDULE",
      "ROOM FINISH SCHEDULE",
      "FINISH SCHEDULE",
    ],
    secondaryKeywords: [
      "TILE",
      "FINISH SCHEDULE",
      "GROUT",
      "ADHESIVE",
      "SETTING OUT",
      "PORCELAIN",
      "CERAMIC",
      "MOSAIC",
      "STONE TILE",
      "SUBWAY TILE",
      "FORMAT TILE",
      "EPOXY GROUT",
      "WATERPROOF MEMBRANE",
      "TILE TRIM",
      "EDGE TRIM",
      "PATTERN",
      "STACK BOND",
      "BRICK BOND",
      "HERRINGBONE",
    ],
    abbreviations: ["TIL", "PC", "PS"],
  },

  {
    id: "flooring",
    label: "Flooring",
    slug: "flooring",
    masterspecGroups: ["6 Finish", "54 Floors", "64 Floor finishes"],
    sheetPrefixes: ["A", "F", "FF"],
    weakSheetPrefixes: ["AR", "FIN"],
    primaryKeywords: [
      "FLOORS",
      "FLOORING",
      "FLOOR FINISH PLAN",
      "FLOOR FINISH SCHEDULE",
      "FLOORING SCHEDULE",
      "ROOM FINISH SCHEDULE",
      "FINISH SCHEDULE",
      "FLOOR FINISHES",
      "FLOOR SCREEDS",
      "FLOOR SCREEDS & TOPPINGS",
      "FLOOR TOPPINGS",
    ],
    secondaryKeywords: [
      "FLOOR FINISH",
      "CARPET",
      "VINYL",
      "TIMBER FLOOR",
      "UNDERLAY",
      "CARPET TILE",
      "SHEET VINYL",
      "LVT",
      "LVP",
      "ENGINEERED TIMBER",
      "LAMINATE FLOORING",
      "HYBRID FLOORING",
      "POLISHED CONCRETE",
      "EPOXY FLOOR",
      "SCREED",
      "SELF LEVELLING",
      "LEVELLING COMPOUND",
      "TOPPING",
      "TRANSITION STRIP",
      "NOSING",
      "THRESHOLD",
    ],
    abbreviations: ["FLR", "LVT", "LVP", "PC", "PS"],
  },

  {
    id: "painting",
    label: "Painting",
    slug: "painting",
    masterspecGroups: ["6 Finish", "61 Applied coatings"],
    sheetPrefixes: ["A", "P", "PA"],
    weakSheetPrefixes: ["AR", "FIN"],
    primaryKeywords: [
      "APPLIED COATINGS",
      "PAINT SPECIFICATION",
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
      "PAINT",
      "PAINT SYSTEM",
      "FINISH",
      "COATING",
      "PRIMER",
      "TOPCOAT",
      "UNDERCOAT",
      "EPOXY",
      "ACRYLIC",
      "SEALER",
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
    ],
    abbreviations: ["PNT", "VOC"],
  },

  {
    id: "plumbing",
    label: "Plumbing",
    slug: "plumbing",
    masterspecGroups: ["7 Services", "71 Liquid supply"],
    sheetPrefixes: ["P", "H", "HY"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "PLUMBING",
      "PLUMBING PLAN",
      "PLUMBING SPECIFICATION",
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
      "LIQUID SUPPLY",
    ],
    secondaryKeywords: [
      "SANITARY",
      "TAPWARE",
      "BASIN",
      "WC",
      "WASTE",
      "SHOWER MIXER",
      "SINK",
      "TOILET ACCESSORY",
      "TOILET",
      "VANITY BASIN",
      "SHOWER",
      "BATH",
      "LAUNDRY TUB",
      "FLOOR WASTE",
      "FLOOR DRAIN",
      "MIXER",
      "VALVE",
      "ISOLATION VALVE",
      "SANITARYWARE",
      "WATER SUPPLY",
      "WASTEWATER",
      "PIPEWORK",
    ],
    abbreviations: ["HW", "CW", "HWS", "TMV", "PRV", "RPZ", "SVP"],
  },

  {
    id: "electrical",
    label: "Electrical",
    slug: "electrical",
    masterspecGroups: ["7 Services", "73 Electrical supply, lighting and communications"],
    sheetPrefixes: ["E", "EL"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "ELECTRICAL",
      "ELECTRICAL PLAN",
      "ELECTRICAL SPECIFICATION",
      "POWER PLAN",
      "LIGHTING PLAN",
      "LIGHTING LAYOUT",
      "ELECTRICAL LAYOUT",
      "SWITCHBOARD SCHEDULE",
      "PANEL SCHEDULE",
      "DISTRIBUTION BOARD",
      "SINGLE LINE DIAGRAM",
      "CIRCUIT SCHEDULE",
      "SMOKE DETECTOR LAYOUT",
      "RCP LIGHTING",
      "ELECTRICAL SUPPLY, LIGHTING AND COMMUNICATIONS",
    ],
    secondaryKeywords: [
      "LIGHTING",
      "POWER",
      "SWITCH",
      "GPO",
      "LUMINAIRE",
      "LIGHT FITTING",
      "SOCKET OUTLET",
      "POWER OUTLET",
      "DOWNLIGHT",
      "LED STRIP",
      "DIMMER",
      "SENSOR",
      "PENDANT",
      "EMERGENCY LIGHT",
      "EXIT LIGHT",
      "SMOKE ALARM",
      "HEAT DETECTOR",
      "DATA",
      "COMMS",
    ],
    abbreviations: ["GPO", "DB", "MSB", "SLD", "RCD", "RCBO", "MCB", "MCCB", "DALI"],
  },

  {
    id: "mechanical-hvac",
    label: "Mechanical / HVAC",
    slug: "mechanical-hvac",
    masterspecGroups: ["7 Services", "72 Heat, air, humidity and ventilation"],
    sheetPrefixes: ["M", "HV"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "HVAC",
      "MECHANICAL",
      "MECHANICAL SPECIFICATION",
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
      "HEAT, AIR, HUMIDITY AND VENTILATION",
    ],
    secondaryKeywords: [
      "DUCT",
      "DIFFUSER",
      "FCU",
      "GRILLE",
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
      "AHU",
      "HRV",
      "ERV",
      "AIRFLOW",
      "TAB",
    ],
    abbreviations: ["HVAC", "AHU", "FCU", "VRF", "TAB", "HRV", "ERV"],
  },

  {
    id: "elv-security",
    label: "ELV / Security",
    slug: "elv-security",
    masterspecGroups: ["7 Services", "76 Communications, security and safety"],
    sheetPrefixes: ["E", "ELV", "SEC"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
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
      "COMMUNICATIONS, SECURITY AND SAFETY",
    ],
    secondaryKeywords: [
      "SECURITY",
      "ACCESS CONTROL",
      "CCTV",
      "DATA",
      "COMMS",
      "INTERCOM",
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
      "CAMERA",
      "NVR",
      "DVR",
      "DOOR STATION",
      "CARD READER",
      "MAGLOCK",
      "STRIKE",
      "INTRUDER",
      "ALARM",
      "PIR",
      "REX",
    ],
    abbreviations: ["ELV", "CCTV", "ICT", "WAP", "RJ45", "NVR"],
  },

  {
    id: "external-works",
    label: "External Works",
    slug: "external-works",
    masterspecGroups: ["8 External", "81 Roads, paths and paving", "84 Landscape work"],
    sheetPrefixes: ["C", "L", "EX"],
    weakSheetPrefixes: ["A"],
    primaryKeywords: [
      "EXTERNAL WORKS",
      "LANDSCAPE",
      "PAVING",
      "LANDSCAPE PLAN",
      "PAVING PLAN",
      "DRIVEWAY PLAN",
      "EXTERNAL FINISHES",
    ],
    secondaryKeywords: [
      "KERB",
      "FOOTPATH",
      "FENCING",
      "DRIVEWAY",
      "PAVER",
      "ASPHALT",
      "PATHWAY",
      "DECKING",
      "PLANTING",
      "IRRIGATION",
    ],
    abbreviations: ["EXT"],
  },
] as const;

const PROFILE_OVERRIDES: Partial<
  Record<
    SpecFinishesTradeProfile["id"],
    Partial<
      Pick<
        SpecFinishesTradeProfile,
        | "specHeadings"
        | "scheduleKeywords"
        | "fixtureKeywords"
        | "materialKeywords"
        | "systemKeywords"
        | "excludeKeywords"
      >
    >
  >
> = {
  "preliminaries-general": {
    specHeadings: [
      "PRELIMINARIES",
      "GENERAL REQUIREMENTS",
      "GENERAL NOTES",
      "GENERAL CONSTRUCTION NOTES",
      "PROJECT SPECIFICATION",
      "WORK SECTION",
      "SITE ESTABLISHMENT",
      "TEMPORARY WORKS",
      "TEMPORARY SERVICES",
      "HEALTH AND SAFETY",
      "QUALITY ASSURANCE",
      "ENVIRONMENTAL MANAGEMENT",
    ],
    scheduleKeywords: ["DRAWING INDEX", "DRAWING LIST", "SHEET LIST", "SPECIFICATION", "WORK SECTIONS", "SITE FACILITIES"],
    fixtureKeywords: [
      "SITE SHED",
      "SITE OFFICE",
      "AMENITIES",
      "TEMPORARY FENCING",
      "SCAFFOLD",
      "EDGE PROTECTION",
      "FIRE EXTINGUISHER",
      "FIRST AID",
    ],
    materialKeywords: ["HOARDING", "PROTECTION", "WEATHER PROTECTION", "DUST CONTROL", "NOISE CONTROL"],
    systemKeywords: ["TEMPORARY POWER", "TEMPORARY WATER", "SITE LOGISTICS", "TRAFFIC MANAGEMENT", "QUALITY ASSURANCE", "HEALTH AND SAFETY"],
    excludeKeywords: ["FOUNDATION PLAN", "FOOTING SCHEDULE", "REINFORCEMENT PLAN"],
  },

  demolition: {
    specHeadings: [
      "DEMOLITION",
      "DEMOLITION PLAN",
      "DEMOLITION NOTES",
      "SELECTIVE DEMOLITION",
      "EXISTING DEMOLITION",
      "REMOVE EXISTING",
      "EXISTING TO BE REMOVED",
      "EXISTING TO BE DEMOLISHED",
    ],
    scheduleKeywords: ["DEMOLITION PLAN", "DEMOLITION NOTES"],
    fixtureKeywords: ["REMOVE FIXTURE", "REMOVE FITTING", "REMOVE JOINERY"],
    materialKeywords: ["ASBESTOS", "HAZARDOUS MATERIAL", "LEAD PAINT"],
    systemKeywords: ["STRIP OUT", "MAKE GOOD", "DISPOSAL", "TEMPORARY PROPPING"],
    excludeKeywords: ["NEW WORK", "SUPPLY", "INSTALL"],
  },

  earthworks: {
    specHeadings: ["EARTHWORKS", "EXCAVATION", "CUT AND FILL", "SITE PREPARATION", "GRADING PLAN", "CONTOUR PLAN"],
    scheduleKeywords: ["SET OUT", "SETOUT", "SPOT LEVELS"],
    fixtureKeywords: [],
    materialKeywords: ["TOPSOIL", "FILL MATERIAL", "ENGINEERED FILL", "GEOTEXTILE", "GEOGRID"],
    systemKeywords: ["SUBGRADE", "BACKFILL", "COMPACTION", "FORMATION LEVELS"],
    excludeKeywords: ["WINDOW SCHEDULE", "JOINERY SCHEDULE"],
  },

  "drainage-underground-services": {
    specHeadings: ["DRAINAGE", "STORMWATER", "SEWER", "UNDERGROUND SERVICES", "UNDERGROUND DRAINAGE", "SANITARY DRAINAGE"],
    scheduleKeywords: ["MANHOLE SCHEDULE", "CATCHPIT SCHEDULE", "PIPE PROFILE", "LONG SECTION"],
    fixtureKeywords: ["MANHOLE", "CATCHPIT", "INSPECTION CHAMBER", "SOAK PIT"],
    materialKeywords: ["PVC-U", "UPVC", "HDPE"],
    systemKeywords: ["PIPEWORK", "FOUL WATER", "RODDING EYE", "BACKFLOW"],
    excludeKeywords: ["ROOF PLAN", "GUTTER", "DOWNPIPE"],
  },

  "concrete-foundations": {
    specHeadings: ["FOUNDATION PLAN", "FOOTING PLAN", "FOOTING SCHEDULE", "SLAB PLAN", "REINFORCEMENT PLAN"],
    scheduleKeywords: ["FOOTING SCHEDULE", "REINFORCEMENT DETAILS"],
    fixtureKeywords: [],
    materialKeywords: ["REBAR", "MESH", "FORMWORK", "DPM", "POLYTHENE"],
    systemKeywords: ["EDGE BEAM", "PAD FOOTING", "CONTROL JOINT", "VAPOUR BARRIER"],
    excludeKeywords: ["WINDOW SCHEDULE", "JOINERY SCHEDULE"],
  },

  "structural-frame": {
    specHeadings: ["FRAMING PLAN", "TRUSS PLAN", "STRUCTURAL TIMBER", "TIMBER STRUCTURE", "BRACING PLAN"],
    scheduleKeywords: ["FIXING SCHEDULE"],
    fixtureKeywords: ["HOLD DOWN"],
    materialKeywords: ["LVL", "GLULAM", "STUD", "JOIST", "RAFTER"],
    systemKeywords: ["BRACING", "TRUSS", "BEAM", "COLUMN"],
    excludeKeywords: ["STRUCTURAL STEEL", "BASE PLATE", "WELD"],
  },

  "structural-steel": {
    specHeadings: ["STRUCTURAL STEEL", "STEEL FRAME", "STEEL DETAILS", "MEMBER SCHEDULE", "CONNECTION DETAILS"],
    scheduleKeywords: ["MEMBER SCHEDULE", "STEEL SCHEDULE"],
    fixtureKeywords: ["BASE PLATE", "ANCHOR BOLT"],
    materialKeywords: ["UB", "UC", "PFC", "RHS", "SHS", "CHS"],
    systemKeywords: ["CONNECTION", "WELD", "GALVANISED"],
    excludeKeywords: ["REBAR", "TRUSS", "LVL"],
  },

  roofing: {
    specHeadings: ["ROOFING", "ROOF PLAN", "FLASHING DETAILS", "ROOF CLADDING", "ROOF MEMBRANE"],
    scheduleKeywords: ["ROOF PLAN"],
    fixtureKeywords: ["SCUPPER"],
    materialKeywords: ["LONGRUN", "COLORSTEEL", "COLOURSTEEL", "TPO", "EPDM", "BUTYNOL"],
    systemKeywords: ["FLASHING", "GUTTER", "DOWNPIPE", "PARAPET"],
    excludeKeywords: ["WINDOW SCHEDULE", "CURTAIN WALL"],
  },

  insulation: {
    specHeadings: ["INSULATION", "THERMAL INSULATION", "ACOUSTIC INSULATION", "INSULATION SCHEDULE", "R-VALUE"],
    scheduleKeywords: ["INSULATION SCHEDULE"],
    fixtureKeywords: [],
    materialKeywords: ["BATT", "BLANKET", "GLASSWOOL", "POLYESTER", "ROCKWOOL", "MINERAL WOOL"],
    systemKeywords: ["THERMAL ENVELOPE"],
    excludeKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE"],
  },

  "internal-linings": {
    specHeadings: [
      "WALL AND CEILING LININGS",
      "LINING SCHEDULE",
      "CEILING SYSTEMS",
      "REFLECTED CEILING PLAN",
      "WALL LINING",
      "CEILING LINING",
    ],
    scheduleKeywords: ["ROOM FINISH SCHEDULE", "CEILING TYPES"],
    fixtureKeywords: ["ACCESS PANEL"],
    materialKeywords: ["PLASTERBOARD", "GIB BOARD", "FIBRE CEMENT", "ACOUSTIC PANEL"],
    systemKeywords: ["SUSPENDED CEILING", "GRID CEILING"],
    excludeKeywords: ["JOINERY SCHEDULE", "WINDOW SCHEDULE"],
  },

  "plastering-stopping": {
    specHeadings: ["PLASTERING", "STOPPING", "PLASTERING SCHEDULE", "SURFACE FINISH LEVEL", "LEVEL 4 FINISH", "LEVEL 5 FINISH"],
    scheduleKeywords: ["PLASTERING SCHEDULE"],
    fixtureKeywords: [],
    materialKeywords: ["SET JOINT", "COMPOUND", "SKIM COAT"],
    systemKeywords: ["JOINTING", "SURFACE FINISH", "SANDING", "CRITICAL LIGHT"],
    excludeKeywords: ["EXTERNAL CLADDING", "ROOF MEMBRANE"],
  },

  "joinery-cabinetry": {
    specHeadings: [
      "JOINERY FIXTURES AND HARDWARE",
      "JOINERY",
      "JOINERY DETAILS",
      "JOINERY SCHEDULE",
      "CABINETRY",
      "CABINETRY SCHEDULE",
      "JOINERY & CABINETRY FIXTURES",
      "PURPOSE-MADE FIXTURES",
      "KITCHEN DETAILS",
      "KITCHEN ELEVATIONS",
      "BENCHTOP DETAILS",
    ],
    scheduleKeywords: ["JOINERY SCHEDULE", "CABINETRY SCHEDULE", "DOOR HARDWARE SCHEDULE", "APPLIANCE SCHEDULE"],
    fixtureKeywords: [
      "CABINET",
      "CARCASS",
      "DRAWER",
      "HINGE",
      "SOFT CLOSE",
      "PANEL",
      "DOOR FRONT",
      "BENCHTOP",
      "SPLASHBACK",
      "PANTRY",
      "WARDROBE",
      "OPEN SHELVING",
      "PLINTH",
      "KICKBOARD",
    ],
    materialKeywords: ["LAMINATE", "VENEER", "MDF", "PLYWOOD", "SOLID SURFACE", "MELAMINE", "HPL", "STONE TOP"],
    systemKeywords: ["ALLOWANCE", "PRIME COST", "PROVISIONAL SUM"],
    excludeKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE"],
  },

  "internal-carpentry": {
    specHeadings: [
      "INTERNAL DOOR SCHEDULE",
      "DOOR SCHEDULE",
      "DOOR TYPES",
      "HARDWARE SCHEDULE",
      "INTERNAL CARPENTRY",
      "FINISH CARPENTRY",
      "TRIM DETAILS",
      "SKIRTING DETAILS",
      "ARCHITRAVE DETAILS",
      "DOOR DETAILS",
      "PARTITIONS, SCREENS AND DOORS",
    ],
    scheduleKeywords: ["INTERNAL DOOR SCHEDULE", "DOOR SCHEDULE", "DOOR TYPES", "HARDWARE SCHEDULE"],
    fixtureKeywords: [
      "SKIRTING",
      "ARCHITRAVE",
      "CORNICE",
      "SCOTIA",
      "DOOR FRAME",
      "JAMB",
      "HINGE",
      "HANDLE",
      "LOCKSET",
      "LEVERSET",
      "DOOR STOP",
      "CLOSER",
    ],
    materialKeywords: ["TIMBER TRIM", "REVEAL"],
    systemKeywords: ["FIRE DOOR", "INTUMESCENT STRIP", "ALLOWANCE", "PRIME COST", "PROVISIONAL SUM"],
    excludeKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE", "JOINERY BENCHTOP"],
  },

  "windows-glazing": {
    specHeadings: [
      "WINDOW SCHEDULE",
      "WINDOW TYPES",
      "WINDOW DETAILS",
      "GLAZING SCHEDULE",
      "GLASS SCHEDULE",
      "GLAZING DETAILS",
      "EXTERNAL DOOR SCHEDULE",
      "ALUMINIUM JOINERY",
      "JOINERY SCHEDULE",
      "CURTAIN WALL",
      "LOUVRE SCHEDULE",
    ],
    scheduleKeywords: ["WINDOW SCHEDULE", "GLAZING SCHEDULE", "GLASS SCHEDULE", "EXTERNAL DOOR SCHEDULE", "JOINERY SCHEDULE"],
    fixtureKeywords: ["SLIDING DOOR", "BIFOLD", "AWNING", "CASEMENT", "FIXED LIGHT", "FANLIGHT", "SIDELIGHT"],
    materialKeywords: [
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
    ],
    systemKeywords: ["SILL TRAY", "HEAD FLASHING", "JAMB FLASHING", "SEALANT", "MANIFESTATION"],
    excludeKeywords: ["ROOF PLAN", "WRB", "CAVITY BATTEN", "CLADDING DETAILS"],
  },

  "external-works": {
    specHeadings: ["EXTERNAL WORKS", "LANDSCAPE PLAN", "PAVING PLAN", "DRIVEWAY PLAN", "EXTERNAL FINISHES"],
    scheduleKeywords: ["LANDSCAPE PLAN", "PAVING PLAN"],
    fixtureKeywords: ["FENCING"],
    materialKeywords: ["PAVER", "ASPHALT", "DECKING", "PLANTING"],
    systemKeywords: ["KERB", "FOOTPATH", "IRRIGATION"],
    excludeKeywords: ["FOUNDATION PLAN", "SLAB PLAN"],
  },

  waterproofing: {
    specHeadings: [
      "WATERPROOFING",
      "WATERPROOFING SPECIFICATION",
      "WATERPROOFING DETAILS",
      "WET AREA WATERPROOFING",
      "MEMBRANE DETAILS",
      "WET AREA DETAILS",
      "SHOWER DETAILS",
      "BATHROOM DETAILS",
      "DECK WATERPROOFING",
      "BALCONY WATERPROOFING",
      "TANKING",
    ],
    scheduleKeywords: ["WATERPROOFING DETAILS", "MEMBRANE DETAILS", "WET AREA DETAILS", "SHOWER DETAILS", "BATHROOM DETAILS"],
    fixtureKeywords: ["PUDDLE FLANGE", "FLOOR WASTE", "SHOWER WASTE"],
    materialKeywords: ["LIQUID MEMBRANE", "SHEET MEMBRANE", "TORCH ON", "BUTYNOL", "TPO", "EPDM", "PRIMER", "BOND BREAKER", "COVE", "FILLET"],
    systemKeywords: ["UPSTAND", "TURN UP", "SCREED FALLS", "DRAIN FALL", "WATERSTOP"],
    excludeKeywords: ["STORMWATER", "SEWER", "MANHOLE", "CATCHPIT"],
  },

  tiling: {
    specHeadings: [
      "TILING",
      "TILING SPECIFICATION",
      "TILE PLAN",
      "TILE SCHEDULE",
      "TILE LAYOUT",
      "TILE SETOUT",
      "TILE SET OUT",
      "TILING DETAILS",
      "WET AREA FINISHES",
      "WALL FINISH SCHEDULE",
      "ROOM FINISH SCHEDULE",
      "FINISH SCHEDULE",
    ],
    scheduleKeywords: ["TILE SCHEDULE", "WALL FINISH SCHEDULE", "ROOM FINISH SCHEDULE", "FINISH SCHEDULE"],
    fixtureKeywords: ["SPLASHBACK TILE", "TILE TRIM", "EDGE TRIM"],
    materialKeywords: ["TILE", "PORCELAIN", "CERAMIC", "MOSAIC", "STONE TILE", "GROUT", "EPOXY GROUT", "ADHESIVE"],
    systemKeywords: ["SETTING OUT", "PATTERN", "STACK BOND", "BRICK BOND", "HERRINGBONE", "WATERPROOF MEMBRANE"],
    excludeKeywords: ["REINFORCEMENT", "SLAB PLAN", "FORMWORK", "PAINT SCHEDULE"],
  },

  flooring: {
    specHeadings: [
      "FLOORS",
      "FLOOR FINISH PLAN",
      "FLOOR FINISH SCHEDULE",
      "FLOORING SCHEDULE",
      "ROOM FINISH SCHEDULE",
      "FINISH SCHEDULE",
      "FLOOR FINISHES",
      "FLOOR SCREEDS",
      "FLOOR SCREEDS & TOPPINGS",
      "FLOOR TOPPINGS",
    ],
    scheduleKeywords: ["FLOOR FINISH SCHEDULE", "FLOORING SCHEDULE", "ROOM FINISH SCHEDULE", "FINISH SCHEDULE"],
    fixtureKeywords: ["TRANSITION STRIP", "NOSING", "THRESHOLD"],
    materialKeywords: [
      "CARPET",
      "CARPET TILE",
      "VINYL",
      "SHEET VINYL",
      "LVT",
      "LVP",
      "TIMBER FLOOR",
      "ENGINEERED TIMBER",
      "LAMINATE FLOORING",
      "HYBRID FLOORING",
      "UNDERLAY",
      "SCREED",
      "TOPPING",
    ],
    systemKeywords: ["SELF LEVELLING", "LEVELLING COMPOUND", "SUBSTRATE PREPARATION"],
    excludeKeywords: ["REINFORCEMENT", "SLAB PLAN", "FORMWORK", "TILE SCHEDULE"],
  },

  painting: {
    specHeadings: [
      "APPLIED COATINGS",
      "PAINT SPECIFICATION",
      "PAINT SCHEDULE",
      "PAINTING SCHEDULE",
      "COATING SCHEDULE",
      "PAINT SYSTEM",
      "COATING SYSTEM",
      "FINISHES SCHEDULE",
      "DECORATION SCHEDULE",
      "SURFACE FINISH SCHEDULE",
    ],
    scheduleKeywords: ["PAINT SCHEDULE", "PAINTING SCHEDULE", "COATING SCHEDULE", "SURFACE FINISH SCHEDULE"],
    fixtureKeywords: [],
    materialKeywords: [
      "PRIMER",
      "UNDERCOAT",
      "TOPCOAT",
      "EPOXY",
      "ACRYLIC",
      "SEALER",
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
    ],
    systemKeywords: ["SURFACE PREPARATION", "NUMBER OF COATS"],
    excludeKeywords: ["WATERPROOFING", "MEMBRANE", "STORMWATER"],
  },

  plumbing: {
    specHeadings: [
      "PLUMBING",
      "PLUMBING PLAN",
      "PLUMBING SPECIFICATION",
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
      "LIQUID SUPPLY",
    ],
    scheduleKeywords: ["SANITARY SCHEDULE", "PLUMBING FIXTURE SCHEDULE", "TAPWARE SCHEDULE", "FIXTURE SCHEDULE", "RISER DIAGRAM"],
    fixtureKeywords: [
      "BASIN",
      "WC",
      "SHOWER MIXER",
      "SINK",
      "TOILET ACCESSORY",
      "TOILET",
      "VANITY BASIN",
      "SHOWER",
      "BATH",
      "LAUNDRY TUB",
      "FLOOR WASTE",
      "FLOOR DRAIN",
      "TAPWARE",
      "MIXER",
      "VALVE",
    ],
    materialKeywords: ["COPPER", "PEX", "MLCP", "PIPEWORK", "HOT WATER CYLINDER"],
    systemKeywords: ["PLUMBING", "HYDRAULIC", "WATER SUPPLY", "WASTEWATER", "HWS", "TMV", "PRV", "RPZ", "BACKFLOW"],
    excludeKeywords: ["STORMWATER", "SEWER MAIN", "MANHOLE", "CATCHPIT", "DETENTION TANK"],
  },

  electrical: {
    specHeadings: [
      "ELECTRICAL",
      "ELECTRICAL PLAN",
      "ELECTRICAL SPECIFICATION",
      "POWER PLAN",
      "LIGHTING PLAN",
      "LIGHTING LAYOUT",
      "ELECTRICAL LAYOUT",
      "SWITCHBOARD SCHEDULE",
      "PANEL SCHEDULE",
      "DISTRIBUTION BOARD",
      "SINGLE LINE DIAGRAM",
      "CIRCUIT SCHEDULE",
      "SMOKE DETECTOR LAYOUT",
      "RCP LIGHTING",
      "ELECTRICAL SUPPLY, LIGHTING AND COMMUNICATIONS",
    ],
    scheduleKeywords: ["LIGHTING SCHEDULE", "POWER SCHEDULE", "SWITCHBOARD SCHEDULE", "PANEL SCHEDULE", "CIRCUIT SCHEDULE"],
    fixtureKeywords: ["LUMINAIRE", "LIGHT FITTING", "SWITCH", "GPO", "SOCKET OUTLET", "POWER OUTLET", "DOWNLIGHT", "LED STRIP", "DIMMER", "SENSOR", "PENDANT"],
    materialKeywords: ["CABLE", "CONDUIT", "CABLE TRAY", "METER BOARD", "SUBMAIN"],
    systemKeywords: ["ELECTRICAL", "ELV", "DATA", "COMMS", "DB", "MSB", "SLD", "RCD", "RCBO", "MCB", "MCCB"],
    excludeKeywords: ["CCTV", "SECURITY", "ACCESS CONTROL", "SPRINKLER"],
  },

  "mechanical-hvac": {
    specHeadings: [
      "HVAC",
      "MECHANICAL",
      "MECHANICAL SPECIFICATION",
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
      "HEAT, AIR, HUMIDITY AND VENTILATION",
    ],
    scheduleKeywords: ["MECHANICAL SCHEDULE", "VENTILATION SCHEDULE", "DUCT LAYOUT", "MECHANICAL PLAN", "VENTILATION PLAN"],
    fixtureKeywords: ["GRILLE", "DIFFUSER", "INLINE FAN", "EXTRACT FAN", "CONDENSER", "OUTDOOR UNIT", "INDOOR UNIT"],
    materialKeywords: ["DUCT", "DUCT SIZE", "REFRIGERANT", "CONDENSATE"],
    systemKeywords: ["HVAC", "MECHANICAL", "VENTILATION", "SUPPLY AIR", "RETURN AIR", "FRESH AIR", "EXHAUST AIR", "VRF", "FCU", "AHU", "HRV", "ERV", "TAB"],
    excludeKeywords: ["POWER PLAN", "LIGHTING PLAN", "SWITCHBOARD", "CCTV"],
  },

  "elv-security": {
    specHeadings: [
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
      "COMMUNICATIONS, SECURITY AND SAFETY",
    ],
    scheduleKeywords: ["DATA PLAN", "SECURITY PLAN", "CCTV PLAN", "ACCESS CONTROL", "INTERCOM PLAN", "STRUCTURED CABLING"],
    fixtureKeywords: ["PATCH PANEL", "RACK", "CABINET", "WAP", "ACCESS POINT", "DATA OUTLET", "CAMERA", "NVR", "DVR", "INTERCOM", "DOOR STATION", "CARD READER"],
    materialKeywords: ["CAT6", "CAT6A", "RJ45", "FIBRE"],
    systemKeywords: ["SECURITY", "ACCESS CONTROL", "CCTV", "DATA", "COMMS", "INTRUDER", "ALARM", "MAGLOCK", "STRIKE", "PIR", "REX"],
    excludeKeywords: ["SWITCHBOARD SCHEDULE", "SINGLE LINE DIAGRAM", "SPRINKLER", "HYDRANT"],
  },
};

function normalizeText(source: string): string {
  return source.toUpperCase().replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function findMatches(haystack: string, terms: readonly string[]): string[] {
  return terms.filter((term) => haystack.includes(term));
}

function mergeUnique(...groups: Array<readonly string[] | string[] | undefined>): string[] {
  const merged: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    merged.push(...group);
  }
  return uniqueSorted(merged);
}

function toConfidence(score: number): number {
  const raw = 0.18 + score * 0.06;
  return Math.max(0.01, Math.min(0.99, raw));
}

function toProfileFromTrade(trade: SpecFinishesBaseTrade): SpecFinishesTradeProfile {
  const override = PROFILE_OVERRIDES[trade.id] ?? {};

  return {
    id: trade.id,
    label: trade.label,
    slug: trade.slug,
    masterspecGroups: [...trade.masterspecGroups],
    sheetPrefixes: [...trade.sheetPrefixes],
    weakSheetPrefixes: [...(trade.weakSheetPrefixes ?? [])],
    primaryKeywords: mergeUnique(trade.primaryKeywords),
    secondaryKeywords: mergeUnique(trade.secondaryKeywords),
    abbreviations: mergeUnique(trade.abbreviations),
    specHeadings: mergeUnique(GLOBAL_SPEC_HEADINGS, CBI_FAMILY_HEADINGS, override.specHeadings, trade.primaryKeywords, trade.masterspecGroups),
    scheduleKeywords: mergeUnique(GLOBAL_SCHEDULE_KEYWORDS, override.scheduleKeywords),
    fixtureKeywords: mergeUnique(GLOBAL_FIXTURE_KEYWORDS, override.fixtureKeywords),
    materialKeywords: mergeUnique(GLOBAL_MATERIAL_KEYWORDS, override.materialKeywords, trade.secondaryKeywords),
    systemKeywords: mergeUnique(GLOBAL_SYSTEM_KEYWORDS, override.systemKeywords),
    excludeKeywords: mergeUnique(GLOBAL_EXCLUDE_KEYWORDS, override.excludeKeywords),
  };
}

export const SPEC_FINISHES_TRADES: ReadonlyArray<SpecFinishesTradeProfile> =
  SPEC_FINISHES_BASE_TRADES.map((trade) => toProfileFromTrade(trade));

export function getSpecFinishesTradeById(tradeId: string): SpecFinishesTradeProfile | null {
  return SPEC_FINISHES_TRADES.find((trade) => trade.id === tradeId) ?? null;
}

export function analyzePageForSpecFinishesTrade(
  pageText: string,
  trade: SpecFinishesTradeProfile
): SpecFinishesTradeSignal {
  const normalized = normalizeText(pageText);
  const titleBlock = normalized.slice(0, TITLE_BLOCK_CHAR_LIMIT);

  const matchedHeadings = uniqueSorted(findMatches(titleBlock, trade.specHeadings));
  const matchedSchedules = uniqueSorted(findMatches(normalized, trade.scheduleKeywords));
  const matchedFixtures = uniqueSorted(findMatches(normalized, trade.fixtureKeywords));
  const matchedMaterials = uniqueSorted(findMatches(normalized, trade.materialKeywords));
  const matchedSystems = uniqueSorted(findMatches(normalized, trade.systemKeywords));

  const matchedPrimaryTradeKeywords = uniqueSorted(findMatches(normalized, trade.primaryKeywords));
  const matchedSecondaryTradeKeywords = uniqueSorted(findMatches(normalized, trade.secondaryKeywords));
  const matchedAbbreviations = uniqueSorted(findMatches(normalized, trade.abbreviations));

  const matchedTradeKeywords = uniqueSorted([
    ...matchedPrimaryTradeKeywords,
    ...matchedSecondaryTradeKeywords,
    ...matchedAbbreviations,
  ]);

  const matchedExclusions = uniqueSorted(findMatches(normalized, trade.excludeKeywords));

  const score = Math.max(
    0,
    matchedHeadings.length * 4 +
      matchedSchedules.length * 2 +
      Math.min(matchedFixtures.length, 5) +
      Math.min(matchedMaterials.length, 5) +
      Math.min(matchedSystems.length, 4) +
      matchedPrimaryTradeKeywords.length * 2 +
      Math.min(matchedSecondaryTradeKeywords.length, 4) +
      Math.min(matchedAbbreviations.length, 3) -
      (matchedExclusions.length > 0 && matchedHeadings.length === 0 ? 3 : 0)
  );

  const hasSpecSignals = matchedHeadings.length > 0 || matchedSchedules.length > 0;
  const hasTradeSignals =
    matchedPrimaryTradeKeywords.length > 0 ||
    matchedSecondaryTradeKeywords.length > 0 ||
    matchedAbbreviations.length > 0;

  const isRelevant =
    (matchedHeadings.length > 0 && hasTradeSignals) ||
    (matchedSchedules.length > 0 && (matchedFixtures.length > 0 || matchedMaterials.length > 0 || matchedSystems.length > 0)) ||
    (hasSpecSignals && hasTradeSignals && score >= 6) ||
    score >= 9;

  const reasonParts: string[] = [];

  if (matchedHeadings.length > 0) {
    reasonParts.push(`Headings: ${matchedHeadings.slice(0, 3).join(", ")}`);
  }
  if (matchedSchedules.length > 0) {
    reasonParts.push(`Schedules: ${matchedSchedules.slice(0, 3).join(", ")}`);
  }
  if (matchedFixtures.length > 0) {
    reasonParts.push(`Fixtures: ${matchedFixtures.slice(0, 3).join(", ")}`);
  }
  if (matchedMaterials.length > 0) {
    reasonParts.push(`Materials: ${matchedMaterials.slice(0, 3).join(", ")}`);
  }
  if (matchedSystems.length > 0) {
    reasonParts.push(`Systems: ${matchedSystems.slice(0, 3).join(", ")}`);
  }
  if (matchedTradeKeywords.length > 0) {
    reasonParts.push(`Trade terms: ${matchedTradeKeywords.slice(0, 4).join(", ")}`);
  }
  if (matchedExclusions.length > 0) {
    reasonParts.push(`Exclusions: ${matchedExclusions.slice(0, 2).join(", ")}`);
  }
  if (reasonParts.length === 0) {
    reasonParts.push("No trade-specific spec or finishes signals.");
  }

  return {
    isRelevant,
    confidence: toConfidence(score),
    score,
    matchedHeadings,
    matchedSchedules,
    matchedFixtures,
    matchedMaterials,
    matchedSystems,
    matchedTradeKeywords,
    reason: reasonParts.join(" | "),
  };
}