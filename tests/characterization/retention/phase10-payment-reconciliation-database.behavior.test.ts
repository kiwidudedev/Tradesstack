import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE10_DB_URL
  ?? process.env.RETENTION_PHASE9_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

describeDatabase("Phase 10 Retention Claim payment database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("installs three forced-RLS immutable evidence relations", async () => {
    const relations = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       where oid in (
         'public.retention_claim_payment_reconciliations'::regclass,
         'public.retention_claim_payment_attributions'::regclass,
         'public.retention_claim_payment_events'::regclass
       )`,
    );
    expect(relations.rows).toHaveLength(3);
    expect(relations.rows.every((row) =>
      row.relrowsecurity && row.relforcerowsecurity
    )).toBe(true);

    const triggers = await client.query<{ table_name: string }>(
      `select event_object_table table_name
       from information_schema.triggers
       where trigger_schema='public'
         and event_object_table like 'retention_claim_payment_%'
         and action_statement like
           '%prevent_retention_claim_payment_mutation%'`,
    );
    expect(new Set(triggers.rows.map((row) => row.table_name))).toEqual(new Set([
      "retention_claim_payment_reconciliations",
      "retention_claim_payment_attributions",
      "retention_claim_payment_events",
    ]));
  });

  it("keeps the financial record RPC service-only", async () => {
    const privilege = await client.query<{
      authenticated_execute: boolean;
      service_execute: boolean;
    }>(
      `select
        has_function_privilege(
          'authenticated',p.oid,'EXECUTE'
        ) authenticated_execute,
        has_function_privilege(
          'service_role',p.oid,'EXECUTE'
        ) service_execute
       from pg_proc p
       where p.pronamespace='public'::regnamespace
         and p.proname='record_retention_claim_payment_reconciliation'`,
    );
    expect(privilege.rows).toEqual([{
      authenticated_execute: false,
      service_execute: true,
    }]);
  });

  it("uses restrictive origin and immutable-evidence foreign keys", async () => {
    const constraints = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) definition
       from pg_constraint
       where connamespace='public'::regnamespace
         and conrelid in (
           'public.retention_claim_payment_reconciliations'::regclass,
           'public.retention_claim_payment_attributions'::regclass,
           'public.retention_claim_payment_events'::regclass
         )
         and contype='f'`,
    );
    const definitions = constraints.rows.map((row) => row.definition).join("\n");
    expect(definitions).toContain("retention_claims");
    expect(definitions).toContain("retention_claim_allocations");
    expect(definitions).toContain("project_claims");
    expect(definitions).toContain("retention_claim_accounting_snapshots");
    expect(definitions.match(/ON DELETE RESTRICT/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("extends the isolated queue with Retention Claim refresh only", async () => {
    const constraint = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) definition
       from pg_constraint
       where conrelid='public.organization_accounting_sync_jobs'::regclass
         and conname='organization_accounting_sync_jobs_job_kind_check'`,
    );
    expect(constraint.rows[0].definition).toContain(
      "xero.retention_claim.refresh",
    );
    const index = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname='public'
         and indexname='org_accounting_sync_jobs_active_retention_claim_doc_uidx'`,
    );
    expect(index.rows[0].indexdef).toContain("xero.retention_claim.refresh");
  });

  it("does not grant direct evidence mutation to browser roles", async () => {
    const grants = await client.query<{ count: string }>(
      `select count(*)::text count
       from information_schema.role_table_grants
       where table_schema='public'
         and table_name in (
           'retention_claim_payment_reconciliations',
           'retention_claim_payment_attributions',
           'retention_claim_payment_events'
         )
         and grantee in ('anon','authenticated')
         and privilege_type in ('INSERT','UPDATE','DELETE')`,
    );
    expect(grants.rows[0].count).toBe("0");
  });
});
