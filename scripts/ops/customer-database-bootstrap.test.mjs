import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./lib.mjs";
import {
  DEFAULT_BASELINE_CUT,
  EXCLUDED_FIXTURE_MIGRATION,
  migrationPlan,
  validateBootstrapPlan,
} from "./bootstrap-customer-database.mjs";

const release = JSON.parse(fs.readFileSync(path.join(ROOT, "ops/releases/1.2.4.json"), "utf8"));
const migrationsDirectory = path.join(ROOT, "supabase/migrations");
const baselinePath = path.join(ROOT, "supabase/baselines/phase1o-1/baseline.sql");
const plan = migrationPlan(migrationsDirectory, release.database.migrationTarget, DEFAULT_BASELINE_CUT);
const databaseUrl = "postgresql://postgres:test@db.abcdefghij0123456789.supabase.co:5432/postgres";

describe("hosted customer database bootstrap plan", () => {
  it("uses the approved baseline cut and only forward migrations after it", () => {
    expect(plan.target).toBe(release.database.migrationTarget);
    expect(plan.baseline).toHaveLength(504);
    expect(plan.forward.length).toBeGreaterThan(0);
    expect(plan.baseline.every((entry) => entry.version <= DEFAULT_BASELINE_CUT)).toBe(true);
    expect(plan.forward.every((entry) => entry.version > DEFAULT_BASELINE_CUT)).toBe(true);
    expect(plan.forward.some((entry) => entry.version === plan.targetVersion)).toBe(true);
    expect(plan.files.includes(EXCLUDED_FIXTURE_MIGRATION)).toBe(true);
    expect(plan.baseline.some((entry) => entry.file === EXCLUDED_FIXTURE_MIGRATION)).toBe(false);
  });

  it("accepts a dedicated project and the approved baseline hash", () => {
    const errors = validateBootstrapPlan({
      plan,
      projectRef: "abcdefghij0123456789",
      databaseUrl,
      release,
      baselinePath,
    });
    expect(errors).toEqual([]);
  });

  it("refuses platform projects, a mismatched host and an unapproved baseline", () => {
    const platform = validateBootstrapPlan({
      plan,
      projectRef: "ibjyzpyuqupsxqakpzxj",
      databaseUrl: "postgresql://postgres:test@db.ibjyzpyuqupsxqakpzxj.supabase.co:5432/postgres",
      release,
      baselinePath,
    });
    expect(platform.join("; ")).toMatch(/platform identity/);

    const host = validateBootstrapPlan({
      plan,
      projectRef: "abcdefghij0123456789",
      databaseUrl: "postgresql://postgres:test@db.zzzzzzzzzzzzzzzzzzzz.supabase.co:5432/postgres",
      release,
      baselinePath,
    });
    expect(host.join("; ")).toMatch(/host does not contain/);

    // IPv4-only operators connect through the Supabase pooler, where the
    // project ref lives in the username rather than the hostname.
    const pooler = validateBootstrapPlan({
      plan,
      projectRef: "abcdefghij0123456789",
      databaseUrl: "postgresql://postgres.abcdefghij0123456789:test@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres",
      release,
      baselinePath,
    });
    expect(pooler).toEqual([]);

    const wrongPooler = validateBootstrapPlan({
      plan,
      projectRef: "abcdefghij0123456789",
      databaseUrl: "postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:test@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres",
      release,
      baselinePath,
    });
    expect(wrongPooler.join("; ")).toMatch(/host does not contain/);

    const badRelease = { ...release, database: { ...release.database, baselineSha256: "0".repeat(64) } };
    const baseline = validateBootstrapPlan({
      plan,
      projectRef: "abcdefghij0123456789",
      databaseUrl,
      release: badRelease,
      baselinePath,
    });
    expect(baseline.join("; ")).toMatch(/baseline SHA-256/);
  });
});
