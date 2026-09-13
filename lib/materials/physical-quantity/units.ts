export type MaterialUnitKind = "packaging" | "physical" | "unknown";

const UNIT_ALIASES: Record<string, string> = {
  each: "each", ea: "each", item: "each", items: "each", pc: "each", pcs: "each", piece: "each", pieces: "each", unit: "each", units: "each",
  sheet: "sheet", sheets: "sheet", sht: "sheet", shts: "sheet",
  box: "box", boxes: "box", bx: "box",
  pack: "pack", packs: "pack", pkt: "pack", pkts: "pack",
  roll: "roll", rolls: "roll",
  bag: "bag", bags: "bag",
  pallet: "pallet", pallets: "pallet",
  carton: "carton", cartons: "carton",
  "l/m": "lm", "l m": "lm", lm: "lm", "lin m": "lm", "linear m": "lm",
  "linear metre": "lm", "linear metres": "lm", "linear meter": "lm", "linear meters": "lm",
  "lineal metre": "lm", "lineal metres": "lm", "lineal meter": "lm", "lineal meters": "lm",
  m: "m", metre: "m", metres: "m", meter: "m", meters: "m",
  mm: "mm", millimetre: "mm", millimetres: "mm", millimeter: "mm", millimeters: "mm",
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
  "m²": "m2", "m^2": "m2", m2: "m2", sqm: "m2", "sq m": "m2",
  "square metre": "m2", "square metres": "m2", "square meter": "m2", "square meters": "m2",
  "m³": "m3", "m^3": "m3", m3: "m3", "cubic metre": "m3", "cubic metres": "m3", "cubic meter": "m3", "cubic meters": "m3",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gram: "g", grams: "g",
  tonne: "tonne", tonnes: "tonne", ton: "tonne", tons: "tonne", t: "tonne",
};

export const PACKAGING_UNITS = new Set(["each", "sheet", "box", "pack", "roll", "bag", "pallet", "carton"]);
export const PHYSICAL_UNITS = new Set(["m", "mm", "cm", "lm", "m2", "m3", "kg", "g", "tonne"]);

export function normalizeMaterialUnitAlias(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return UNIT_ALIASES[normalized] ?? normalized;
}

export function materialUnitKind(value: string | null | undefined): MaterialUnitKind {
  const normalized = normalizeMaterialUnitAlias(value);
  if (PACKAGING_UNITS.has(normalized)) return "packaging";
  if (PHYSICAL_UNITS.has(normalized)) return "physical";
  return "unknown";
}

export function lengthToMetres(value: number, unit: string) {
  switch (normalizeMaterialUnitAlias(unit)) {
    case "mm": return value / 1000;
    case "cm": return value / 100;
    case "m":
    case "lm": return value;
    default: return null;
  }
}

export function massToKilograms(value: number, unit: string) {
  switch (normalizeMaterialUnitAlias(unit)) {
    case "g": return value / 1000;
    case "kg": return value;
    case "tonne": return value * 1000;
    default: return null;
  }
}
