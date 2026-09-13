import { physicalEvidenceSupportsRelationship } from "@/lib/materials/physical-quantity/validate-relationship";

export function physicalEvidenceSupportsConversion(input: {
  requestedMaterialUnit: string;
  supplierQuantity: number;
  materialQuantity: number;
  evidenceTexts: string[];
}) {
  return physicalEvidenceSupportsRelationship({
    requestedMaterialUnit: input.requestedMaterialUnit,
    supplierQuantity: input.supplierQuantity,
    materialQuantity: input.materialQuantity,
    evidence: input.evidenceTexts.map((text, index) => ({ id: `legacy.${index}`, text })),
  });
}
