import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260311113000_trade_pack_workspace_compat_and_quota.sql",
  "utf8",
);

describe("trade pack workspace compatibility migration", () => {
  it("creates the legacy cover column before the compatibility backfill reads it", () => {
    const addColumnIndex = migration.indexOf(
      "add column if not exists cover_image_url text",
    );
    const backfillReadIndex = migration.indexOf("p.cover_image_url");

    expect(addColumnIndex).toBeGreaterThan(-1);
    expect(backfillReadIndex).toBeGreaterThan(addColumnIndex);
  });
});
