import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES } from "@/lib/universal-learning/types";

describe("learning_review_queue migration contract", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260624183000_add_universal_learning_review_queue.sql"),
    "utf8",
  );

  it("creates the queue table without adding learning_review_chunks", () => {
    expect(migration).toContain("create table if not exists public.learning_review_queue");
    expect(migration).not.toContain("learning_review_chunks");
  });

  it("allows every supported Universal Construction Learning container type", () => {
    for (const containerType of UNIVERSAL_LEARNING_CONTAINER_TYPES) {
      expect(migration).toContain(`'${containerType}'`);
    }
  });

  it("enforces one queue row per organization/container/scope/month", () => {
    expect(migration).toContain("learning_review_queue_org_container_scope_month_uidx");
    expect(migration).toContain("(organization_id, container_type, scope_key, review_month)");
  });

  it("implements claim-token leasing, expired-claim recovery, and skip-locked claiming", () => {
    expect(migration).toContain("claim_token uuid");
    expect(migration).toContain("claim_expires_at");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("q.claim_expires_at <= now()");
  });

  it("implements retry and dead-letter states through finalize_learning_review_batch", () => {
    expect(migration).toContain("'retry_scheduled'");
    expect(migration).toContain("'dead_lettered'");
    expect(migration).toContain("create or replace function public.finalize_learning_review_batch");
    expect(migration).toContain("q.claim_token = nullif(input_item->>'claimToken', '')::uuid");
  });
});
