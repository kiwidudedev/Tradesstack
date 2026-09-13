import { describe, expect, it } from "vitest";
import {
  assertRequiredCommercialE2EMigrations,
  validateLocalE2ETarget,
} from "./test-target-guard";

describe("Playwright fixture target guard", () => {
  it("accepts only the expected local Supabase API target", () => {
    expect(validateLocalE2ETarget(
      "http://127.0.0.1:54321",
      "Tradesstack-ai",
    )).toMatchObject({
      host: "127.0.0.1",
      port: "54321",
      mutationMode: "local-fixtures",
    });
  });

  it.each([
    ["https://mvxyxvrxaorzglppxzzz.supabase.co", "Tradesstack-ai"],
    ["https://another-project.supabase.co", "Tradesstack-ai"],
    ["http://127.0.0.1:54322", "Tradesstack-ai"],
    ["http://127.0.0.1:54321", "wrong-project"],
    ["not a url", "Tradesstack-ai"],
    [undefined, "Tradesstack-ai"],
  ])("rejects non-local or ambiguous target %s", (url, projectReference) => {
    expect(() => validateLocalE2ETarget(url, projectReference)).toThrow(
      /refused|Malformed|Missing/,
    );
  });

  it("fails clearly when the commercial E2E schema is stale", () => {
    expect(() => assertRequiredCommercialE2EMigrations(["20260820120000"]))
      .toThrow(/migration drift.*20260823160000/i);
    expect(() => assertRequiredCommercialE2EMigrations([
      "20260820120000",
      "20260823160000",
    ])).not.toThrow();
  });
});
