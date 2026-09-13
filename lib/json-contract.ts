import type { Json } from "./supabase/types";

/** Validate an unknown persistence payload without coercing or dropping values. */
export function assertJsonValue(value: unknown): asserts value is Json {
  const ancestors = new Set<object>();
  function visit(entry: unknown, objectProperty = false): boolean {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return true;
    if (typeof entry === "number") return Number.isFinite(entry);
    if (entry === undefined) return objectProperty;
    if (typeof entry !== "object" || ancestors.has(entry)) return false;
    if (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) return false;
    ancestors.add(entry);
    const valid = Array.isArray(entry)
      ? Array.from(entry).every((item) => visit(item))
      : Object.getOwnPropertySymbols(entry).length === 0 && Object.values(entry).every((item) => visit(item, true));
    ancestors.delete(entry);
    return valid;
  }
  if (!visit(value)) throw new TypeError("Persistence payload must contain only JSON values.");
}
