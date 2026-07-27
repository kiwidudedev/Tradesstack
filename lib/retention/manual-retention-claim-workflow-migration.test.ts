import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726320000_remove_automatic_rolling_retention_claim_creation.sql",
  ),
  "utf8",
);
const worker = readFileSync(
  join(process.cwd(), "lib/retention/rolling-retention-worker.ts"),
  "utf8",
);
const vercel = JSON.parse(
  readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
) as { crons?: Array<{ path: string }> };
const register = readFileSync(
  join(
    process.cwd(),
    "app/app/(workspace)/projects/[projectId]/preconstruction/claims/RetentionWorkspaceSection.tsx",
  ),
  "utf8",
);
const detail = readFileSync(
  join(
    process.cwd(),
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  ),
  "utf8",
);

describe("explicit project-ledger Retention Claim workflow migration", () => {
  it("removes the Payment Claim projection trigger without editing history", () => {
    expect(sql).toContain(
      "drop trigger if exists project_claims_retention_rolling_draft_projection",
    );
    expect(sql).not.toContain("delete from public.retention_claims");
    expect(sql).not.toContain("delete from public.retention_claim_events");
  });

  it("retires every automatic enqueue and worker entry point", () => {
    expect(sql).toContain(
      "create or replace function public.enqueue_retention_rolling_draft_after_claim()",
    );
    expect(sql).toContain(
      "create or replace function private.enqueue_retention_rolling_draft(",
    );
    expect(sql).toContain(
      "create or replace function private.maintain_retention_rolling_draft(",
    );
    expect(sql).toContain("'result', 'retired'");
    expect(sql).toContain("'processed', 0");
    expect(worker).not.toContain("createAdminSupabaseClient");
    expect(worker).not.toContain("process_retention_rolling_draft_jobs");
    expect(vercel.crons?.some(
      (cron) => cron.path === "/api/cron/retention-rolling-drafts/run",
    )).toBe(false);
  });

  it("serializes deliberate creation and enforces one editable Draft", () => {
    expect(sql).toContain(":explicit_retention_claim_draft");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain(
      "retention_claims_one_editable_draft_per_project_idx",
    );
    expect(sql).toContain("where status = 'draft'");
  });

  it("reuses an existing Draft before allocating a number", () => {
    const create = sql.slice(
      sql.indexOf(
        "create or replace function public.create_retention_claim_draft",
      ),
      sql.indexOf(
        "create or replace function public.get_retention_claim_draft_origin_set_hash",
      ),
    );
    expect(create.indexOf("and claim.status = 'draft'")).toBeLessThan(
      create.indexOf("private.generate_retention_claim_number"),
    );
    expect(create).toContain("'reused', true");
    expect(create).toContain("'reused', false");
  });

  it("allocates an RC number only after proving available retention", () => {
    const create = sql.slice(
      sql.indexOf(
        "create or replace function public.create_retention_claim_draft",
      ),
      sql.indexOf(
        "create or replace function public.get_retention_claim_draft_origin_set_hash",
      ),
    );
    expect(create.indexOf("v_available <= 0")).toBeLessThan(
      create.indexOf("private.generate_retention_claim_number"),
    );
    expect(create).toContain("'no_available_retention'");
    expect(create).toContain("'explicitCreation', true");
  });

  it("adopts an untouched historical automatic Draft only on explicit action", () => {
    expect(sql).toContain("app.retention_explicit_draft_adoption");
    expect(sql).toContain(
      "old.draft_kind = 'automatic_rolling'",
    );
    expect(sql).toContain("new.draft_kind = 'manual'");
    expect(sql).toContain("'adoptedAutomaticDraft', true");
  });

  it("exposes project-ledger candidates without creating allocations", () => {
    const candidates = sql.slice(
      sql.indexOf(
        "create or replace function public.get_retention_claim_draft_origin_set_hash",
      ),
      sql.indexOf("revoke all on function public.create_retention_claim_draft"),
    );
    expect(candidates).toContain("from public.project_claims origin");
    expect(candidates).toContain(
      "private.retention_claim_origin_state_hash(origin.id)",
    );
    expect(candidates).not.toContain(
      "insert into public.retention_claim_allocations",
    );
    expect(detail).toContain("availableOrigins");
    expect(detail).toContain(
      ": [...allocatedLines, ...unallocatedLines]",
    );
  });

  it("renders one accumulating master ledger without a second-claim action", () => {
    expect(register).toContain('label="Current Retention"');
    expect(register).toContain('label="Pushed to Xero"');
    expect(register).toContain('label="New Since Last Push"');
    expect(register).toContain('label="Paid"');
    expect(register).toContain('label="Outstanding"');
    expect(register).not.toContain("New Retention Claim");
    expect(register).toContain(
      "Submitted Payment Claims will accumulate into this project's master Retention Claim.",
    );
    expect(register).not.toContain(
      "will create a Retention Claim automatically",
    );
  });

  it("does not touch Xero, accounting revisions, or submitted claims", () => {
    expect(sql).not.toMatch(/createXeroInvoices|xero\.retention_claim/i);
    expect(sql).not.toContain("organization_accounting_document_revisions");
    expect(sql).not.toContain("organization_accounting_push_proposals");
    expect(sql).not.toMatch(
      /update public\.retention_claims[\s\S]{0,250}status = 'submitted'/,
    );
  });
});
