export type MaterialUnitConversionErrorCode =
  | "provider_unavailable"
  | "needs_information"
  | "unsafe_conversion"
  | "not_convertible"
  | "invalid_context";

export class MaterialUnitConversionError extends Error {
  code: MaterialUnitConversionErrorCode;
  status: number;

  constructor(code: MaterialUnitConversionErrorCode, message: string, status = 422) {
    super(message);
    this.name = "MaterialUnitConversionError";
    this.code = code;
    this.status = status;
  }
}

export function isMaterialUnitConversionError(value: unknown): value is MaterialUnitConversionError {
  return value instanceof MaterialUnitConversionError;
}
