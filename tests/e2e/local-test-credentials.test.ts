import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { requireLocalTestPassword } from "./local-test-credentials";

function contextFunction() {
  const file = "tests/e2e/supplier-invoice-e2e-helpers.ts";
  const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "ensureSupplierInvoiceE2EContext")!;
  return ts.transpileModule(fn.getText(tree).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe("local E2E fixture password", () => {
  it.each([undefined, "", "   "])("rejects absent/blank configuration (%s)", (password) => {
    expect(() => requireLocalTestPassword({ LOCAL_E2E_OWNER_PASSWORD: password })).toThrow("Missing required environment variable: LOCAL_E2E_OWNER_PASSWORD");
  });
  it("preserves a supplied synthetic password exactly", () => {
    expect(requireLocalTestPassword({ LOCAL_E2E_OWNER_PASSWORD: " synthetic local fixture " })).toBe(" synthetic local fixture ");
  });
  it("fails before client creation with missing configuration", async () => {
    const createAdminClient = vi.fn();
    await expect(vm.runInNewContext(contextFunction() + "\nensureSupplierInvoiceE2EContext();", {
      cachedContext: null, loadLocalEnv: vi.fn(), requireLocalTestPassword: () => requireLocalTestPassword({}), createAdminClient,
    })).rejects.toThrow("LOCAL_E2E_OWNER_PASSWORD");
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("retains the target guard before reading a password or creating a client", async () => {
    const password = vi.fn(), createAdminClient = vi.fn();
    await expect(vm.runInNewContext(contextFunction() + "\nensureSupplierInvoiceE2EContext();", {
      cachedContext: null, loadLocalEnv: () => { throw new Error("TARGET_REFUSED"); }, requireLocalTestPassword: password, createAdminClient,
    })).rejects.toThrow("TARGET_REFUSED");
    expect(password).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
