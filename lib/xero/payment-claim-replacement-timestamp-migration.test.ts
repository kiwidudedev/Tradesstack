import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726290000_fix_replacement_confirmation_timestamp_comparison.sql",
  "utf8",
);
const actions = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts",
  "utf8",
);
const proposal = readFileSync(
  "lib/xero/payment-claim-initial-push-proposal.ts",
  "utf8",
);

describe("replacement confirmation timestamp compatibility", () => {
  it("normalizes the signed instant before the unchanged confirmation transaction", () => {
    expect(migration).toContain(
      "rename to confirm_payment_claim_replacement_phase2c_v1",
    );
    expect(migration).toContain(
      "(p_input->>'sourceOptimisticRevision')::timestamptz",
    );
    expect(migration).toContain("to_jsonb(v_source_revision::text)");
    expect(migration).toContain(
      "confirm_payment_claim_replacement_phase2c_v1",
    );
  });

  it("keeps the wrapper service-only and performs no provider operation", () => {
    expect(migration).toContain(
      "revoke all on function",
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "grant execute on function public.confirm_payment_claim_replacement_phase2c(jsonb)",
    );
    expect(migration).not.toMatch(/https?:\/\/|api\.xero|method\s*[:=]\s*['"]POST/i);
  });

  it("returns specific stale codes through the server action", () => {
    for (const code of [
      "PAYMENT_CLAIM_CHANGED",
      "ACCOUNTING_STATE_CHANGED",
      "ACTIVE_REVISION_CHANGED",
      "XERO_EVIDENCE_CHANGED",
      "PROPOSAL_EXPIRED",
    ]) {
      expect(actions).toContain(`"${code}"`);
    }
    expect(actions).toContain("error.supportReference ?? supportReference");
  });

  it("adopts, reloads authoritative state, then builds and persists one fresh proposal", () => {
    const adoption = actions.indexOf(
      "const adopt = () => adoptLegacyVoidedPaymentClaimIfNeeded",
    );
    const build = actions.indexOf(
      "const build = () => buildPaymentClaimPushProposal",
    );
    const persist = actions.indexOf(
      "const persist = () => persistPaymentClaimPushProposal",
    );
    expect(adoption).toBeGreaterThan(-1);
    expect(adoption).toBeLessThan(build);
    expect(build).toBeLessThan(persist);
    expect(proposal).toContain("resolvePaymentClaimXeroReadinessContext(params)");
    expect(proposal).toContain("resolvePaymentClaimAccountingOperationForState");
    expect(actions.slice(adoption, build)).not.toContain("proposalToken");
  });
});
