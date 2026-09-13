import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function loadWorker(secret?: string, enabled = "true") {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  let handler: (request: Request) => Promise<Response> = async () => { throw new Error("Worker did not register."); };
  const env: Record<string, string | undefined> = { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-unit-test-only", TIME_SHEETS_CRON_SECRET: secret, TIME_SHEETS_RULES_ENABLED: enabled };
  const source = readFileSync("supabase/functions/time-sheets-rules/index.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { exports: {}, require: () => ({ createClient: () => ({ rpc }) }), Response, Deno: { env: { get: (name: string) => env[name] }, serve: (callback: typeof handler) => { handler = callback; } } });
  return { rpc, request: (authorization?: string) => handler(new Request("https://example.test", { method: "POST", body: "{}", headers: authorization ? { authorization } : {} })) };
}
describe("Deno time-sheet worker authentication", () => {
  it.each([undefined, "", " "])("fails closed without configured secret %s", async (secret) => {
    const worker = loadWorker(secret);
    expect((await worker.request("Bearer arbitrary")).status).toBe(401);
    expect(worker.rpc).not.toHaveBeenCalled();
  });
  it("rejects trailing token data", async () => {
    const worker = loadWorker("synthetic-token");
    expect((await worker.request("Bearer synthetic-token extra")).status).toBe(401);
    expect(worker.rpc).not.toHaveBeenCalled();
  });
  it("requires activation even with valid authentication", async () => {
    const worker = loadWorker("synthetic-token", "");
    expect(await (await worker.request("Bearer synthetic-token")).json()).toMatchObject({ skipped: true });
    expect(worker.rpc).not.toHaveBeenCalled();
  });
  it("preserves the configured authorized RPC path through a mock", async () => {
    const worker = loadWorker("synthetic-token");
    expect((await worker.request("Bearer synthetic-token")).status).toBe(200);
    expect(worker.rpc).toHaveBeenCalledTimes(1);
  });
});
