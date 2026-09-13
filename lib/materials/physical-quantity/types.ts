export type PhysicalDimension = "count" | "length" | "area" | "volume" | "mass";

export type PhysicalQuantity = {
  value: number;
  unit: string;
  dimension: PhysicalDimension;
  evidenceRef: string;
};

export type DimensionTuple = {
  values: number[];
  units: Array<string | null>;
  normalizedValues: number[] | null;
  normalizedUnit: "m" | null;
  propagation: "explicit" | "shared_trailing" | "none";
  evidenceRef: string;
  sourceText: string;
  ambiguous: boolean;
};

export type PhysicalEvidence = {
  id: string;
  text: string;
};
