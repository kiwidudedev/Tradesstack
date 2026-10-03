import { describe, expect, it } from "vitest";
import { validateReleaseManifest, validateRegistry } from "./lib.mjs";

const validRelease = {
  schemaVersion: 1,
  releaseId: "test-release",
  sourceSha: "361bf3f094a8abbb58d20606413686cebc242e66",
  applicationShell: { releaseId: "0.0.0-phase1r.2", fingerprint: "730107a9922d91f8b4a30f50b418a849639c82ba54d82e3d0679b051246525d6" },
  database: { baseline: "phase1o-1", migrationTarget: "20260926100000_fix_organization_logo_storage_policy_scope.sql" },
  clientConfig: { contract: "@tradesstack/client-config@0.0.0" },
  toolchain: { node: "22.22.2", npm: "11.6.2", next: "16.3.3" },
  validation: { status: "LOCAL_CHECKS_REQUIRED" },
  approval: { realClient: "BLOCKED" },
};

describe("local production operations foundation", () => {
  it("rejects an invalid release manifest", () => {
    const errors = validateReleaseManifest({ ...validRelease, sourceSha: "bad" });
    expect(errors.some((error) => error.includes("sourceSha"))).toBe(true);
  });

  it("rejects an unknown release and duplicate client ID", () => {
    const registry = {
      schemaVersion: 1,
      clients: [
        { clientId: "client-alpha", lifecycleStatus: "NOT_PROVISIONED", targetRelease: "missing" },
        { clientId: "client-alpha", lifecycleStatus: "NOT_PROVISIONED", targetRelease: "missing" },
      ],
    };
    const errors = validateRegistry(registry, ["known"]);
    expect(errors.some((error) => error.includes("unknown targetRelease"))).toBe(true);
    expect(errors.some((error) => error.includes("duplicate client ID"))).toBe(true);
  });

  it("rejects secret-like registry material", () => {
    const errors = validateRegistry({ schemaVersion: 1, clients: [{ clientId: "client-alpha", lifecycleStatus: "NOT_PROVISIONED", targetRelease: "UNKNOWN", note: "sk-proj-12345678901234567890" }] });
    expect(errors.some((error) => error.includes("secret-like"))).toBe(true);
  });

  it("validates non-secret scheduler metadata", () => {
    const valid = {
      schemaVersion: 1,
      clients: [{
        clientId: "client-alpha",
        lifecycleStatus: "ACTIVE",
        defaultBranch: "main",
        rolloutStatus: "ENABLED",
        releaseChannel: "stable",
        clientOwnedPaths: ["client/**"],
        targetRelease: "known",
        operations: {
          scheduler: {
            adapter: "vercel-cron",
            dispatcherPath: "/api/cron/dispatch",
            enabledJobs: ["retention-rolling-drafts"],
            activationStatus: "NOT_ACTIVATED",
          },
        },
      }],
    };
    expect(validateRegistry(valid, ["known"])).toEqual([]);
    expect(validateRegistry({
      ...valid,
      clients: [{
        ...valid.clients[0],
        operations: { scheduler: { ...valid.clients[0].operations.scheduler, dispatcherPath: "/unsafe" } },
      }],
    }, ["known"])).toContain("client-alpha: operations.scheduler.dispatcherPath invalid");
  });
});
