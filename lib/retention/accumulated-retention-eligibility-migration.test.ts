import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726310000_use_accumulated_retention_claim_eligibility.sql",
  "utf8",
);
const page = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  "utf8",
);
const editor = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/RetentionClaimDraftEditor.tsx",
  "utf8",
);

describe("accumulated Retention Claim eligibility migration", () => {
  it("replaces schedule authority with held less immutable prior claims", () => {
    expect(migration).toContain(
      "create or replace function private.retention_eligibility_state",
    );
    expect(migration).toContain(
      "payment_claim.retention_withheld_amount",
    );
    expect(migration).toContain(
      "retention_claim.status = 'submitted'",
    );
    expect(migration).toContain(
      "private.current_legacy_committed_by_origin",
    );
    expect(migration).toContain(
      "'eligibilityModel', 'accumulated_retention_v1'",
    );
    expect(migration).toContain(
      "'eligibilitySource', 'accumulated_retention'",
    );
    expect(migration).not.toMatch(
      /from public\.project_retention_(?:release_schedules|schedule_origins)/,
    );
    expect(migration).not.toContain("activated_entitlement_amount");
    expect(migration).not.toContain("eligibility_date");
  });

  it("does not double-subtract Payment Claim legacy release fields", () => {
    const eligibility = migration.slice(
      migration.indexOf(
        "create or replace function private.retention_eligibility_state",
      ),
      migration.indexOf(
        "alter function public.save_retention_claim_draft_document",
      ),
    );
    expect(eligibility).not.toContain("retention_released_amount");
    expect(eligibility).toContain("legacy_claimed");
  });

  it("validates whole-document saves against submitted claims only", () => {
    expect(migration).toContain(
      "save_retention_claim_draft_document_pre_accumulated_eligibility",
    );
    expect(migration).toContain(
      "submitted_claim.status = 'submitted'",
    );
    expect(migration).toContain(
      "requested.proposed_cents > greatest(",
    );
    expect(migration).toContain(
      "'allocation_exceeds_eligibility'",
    );
  });

  it("preserves the submission wrapper chain and concurrent origin locks", () => {
    expect(migration).toContain(
      "create or replace function public.submit_retention_claim_phase4_pre_variance",
    );
    expect(migration).toContain(
      "public.submit_retention_claim_phase3_pre_schedule",
    );
    expect(migration).toContain(
      "before recomputing immutable prior allocations",
    );
    expect(migration).toContain("for update of origin");
    expect(migration).toContain(
      "allocation.allocation_amount >",
    );
    expect(migration).toContain(
      "eligibility_schedule_ids_snapshot = '{}'::uuid[]",
    );
  });

  it("publishes schedule-independent accounting ownership values", () => {
    expect(migration).toContain(
      "create or replace function public.evaluate_retention_ownership_phase2a",
    );
    for (const field of [
      "retentionHeldMinor",
      "previouslyClaimedMinor",
      "remainingMinor",
      "proposedMinor",
      "afterClaimMinor",
      "blockingReasons",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(migration).toContain(
      '"proposed_release_exceeds_remaining"',
    );
  });

  it("is forward-only and preserves schedule infrastructure", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });

  it("presents remaining retention without adding the current Draft twice", () => {
    expect(page).toContain(
      "availableCents: toCents(origin.availableRetention)",
    );
    expect(page).toContain(
      "availableCents: toCents(eligibility?.availableRetention)",
    );
    expect(page).not.toContain(
      "toCents(origin.availableRetention) + proposedAmountCents",
    );
    expect(editor).toContain(
      "currentRetentionCents - claimedToDateCents",
    );
    expect(editor).toContain('"Remaining"');
    expect(editor).toContain('"After This Claim"');
    expect(page).not.toContain("Not contractually eligible");
    expect(page).not.toContain("Only currently eligible retention is available.");
  });

  it("renders the submitted master claim from cumulative Payment Claim evidence", () => {
    expect(page).toContain("automaticRolling && isDraft");
    expect(page).toContain("getMasterRetentionSource");
    expect(page).toContain('"Pushed to Xero incl. GST"');
    expect(page).toContain('"New Since Last Push incl. GST"');
    expect(page).toContain('"Current Retention incl. GST"');
    expect(page).not.toContain(">Eligible at Submission<");
    expect(page).not.toContain('["Eligible", eligibleCents]');
  });
});
