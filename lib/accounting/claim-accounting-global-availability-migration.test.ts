import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260726470000_enable_claim_accounting_globally.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const productionAccountingSources = [
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims",
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention",
  "lib/xero",
  "components/app",
].map((entry) => path.join(process.cwd(), entry));

function sourceFiles(root: string): string[] {
  return fs.statSync(root).isDirectory()
    ? fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
        sourceFiles(path.join(root, entry.name)))
    : /\.(?:ts|tsx)$/.test(root) && !/\.test\.(?:ts|tsx)$/.test(root)
      ? [root]
      : [];
}

describe("claim accounting global availability migration", () => {
  it("backfills missing accounting rows without overwriting explicit settings", () => {
    expect(sql).toContain("from public.organizations organization");
    expect(sql).toContain("on conflict (organization_id) do nothing");
    expect(sql).not.toMatch(/on conflict\s*\([^)]*organization_id[^)]*\)\s*do update/i);
  });

  it("enables both accounting workflows for future organizations", () => {
    expect(sql).toContain(
      "alter column initial_payment_claim_push_enabled set default true",
    );
    expect(sql).toContain(
      "alter column retention_claim_immutable_xero_enabled set default true",
    );
    expect(sql).toContain(
      "seed_claim_accounting_settings_after_organization_insert",
    );
    expect(sql).toContain(
      "values (new.id, true, true, null, now())",
    );
  });

  it("keeps the accounting override server-only", () => {
    expect(sql).toContain("revoke all on function public.seed_claim_accounting_settings_for_organization()");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)[\s\S]*organization_accounting_phase2b_settings[\s\S]*authenticated/i,
    );
  });

  it("promotes only untouched Retention rollout defaults", () => {
    expect(sql).toContain("capability.enabled_by is null");
    expect(sql).toContain("capability.disabled_by is null");
    expect(sql).toContain("state.changed_by is null");
    expect(sql).toContain("state.changed_at is null");
    expect(sql).toContain("values (new.id, 'retention_management', true, null, now())");
    expect(sql).toContain("values (new.organization_id, new.id, 'observe')");
  });

  it("retires only the temporary Phase 3 pilot claim", () => {
    expect(sql).toMatch(
      /create or replace function private\.retention_claim_phase3_gate_enabled\(\)[\s\S]*select true;/,
    );
    for (const unrelated of [
      "phase4_gate_enabled",
      "phase5_gate_enabled",
      "phase6_gate_enabled",
      "phase8_gate_enabled",
      "phase9_gate_enabled",
      "phase10_gate_enabled",
    ]) {
      expect(sql).not.toContain(unrelated);
    }
  });

  it("does not alter claims, revisions, external identities or Xero data", () => {
    expect(sql).not.toMatch(/\b(update|delete from)\s+public\.project_claims\b/i);
    expect(sql).not.toMatch(/\b(update|delete from)\s+public\.retention_claims\b/i);
    expect(sql).not.toMatch(
      /\b(update|delete from)\s+public\.organization_accounting_document_revisions\b/i,
    );
    expect(sql).not.toContain("external_document_id");
    expect(sql).not.toContain("external_document_number");
  });

  it("contains no hard-coded pilot organization or project identity", () => {
    const source = productionAccountingSources
      .flatMap(sourceFiles)
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toContain(
      "5c5de347-9f21-48fa-aac9-ba87e91fe92a",
    );
    expect(source).not.toContain(
      "6f203171-8d4e-4305-8ce3-6b5a1a75f956",
    );
    expect(source).not.toContain("air-nz-fitout");
  });

  it("keeps the NZ statutory bundle jurisdiction-specific", () => {
    const proposal = fs.readFileSync(
      path.join(
        process.cwd(),
        "lib/xero/payment-claim-initial-push-proposal.ts",
      ),
      "utf8",
    );
    expect(proposal).toContain(
      '["NZ", "NZL", "NEW ZEALAND"].includes(organizationCountry)',
    );
    expect(proposal).toMatch(
      /requiresPdf\s*=[\s\S]*decision\.operation !== "ACCOUNTING_UPDATE"[\s\S]*organizationCountry/,
    );
  });
});
