import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE9_DB_URL
  ?? process.env.RETENTION_PHASE8_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

describeDatabase("Phase 9 Retention Claim Xero database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("installs the isolated accounting identity and all restrictive foreign keys", async () => {
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(
      `select table_name,column_name,is_nullable
       from information_schema.columns
       where table_schema='public'
         and (
           (table_name='organization_accounting_documents'
             and column_name='retention_claim_id')
           or table_name in (
             'retention_claim_accounting_snapshots',
             'retention_claim_accounting_lines',
             'retention_claim_accounting_events'
           )
         )`,
    );
    expect(columns.rows.some((row) =>
      row.table_name === "organization_accounting_documents"
      && row.column_name === "retention_claim_id"
      && row.is_nullable === "YES"
    )).toBe(true);
    expect(new Set(columns.rows.map((row) => row.table_name))).toEqual(new Set([
      "organization_accounting_documents",
      "retention_claim_accounting_snapshots",
      "retention_claim_accounting_lines",
      "retention_claim_accounting_events",
    ]));

    const foreignKeys = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) definition
       from pg_constraint
       where connamespace='public'::regnamespace
         and conrelid in (
           'public.organization_accounting_documents'::regclass,
           'public.retention_claim_accounting_snapshots'::regclass,
           'public.retention_claim_accounting_lines'::regclass,
           'public.retention_claim_accounting_events'::regclass
         )
         and contype='f'`,
    );
    const definitions = foreignKeys.rows.map((row) => row.definition).join("\n");
    expect(definitions).toContain("retention_claims");
    expect(definitions).toContain("retention_claim_documents");
    expect(definitions).toContain("retention_claim_allocations");
    expect(definitions).toContain("project_claims");
    expect(definitions.match(/ON DELETE RESTRICT/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("forces RLS and grants no direct evidence-table privileges", async () => {
    const relations = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
       from pg_class
       where oid in (
         'public.retention_claim_accounting_snapshots'::regclass,
         'public.retention_claim_accounting_lines'::regclass,
         'public.retention_claim_accounting_events'::regclass
       )`,
    );
    expect(relations.rows).toHaveLength(3);
    expect(relations.rows.every((row) =>
      row.relrowsecurity && row.relforcerowsecurity
    )).toBe(true);

    const grants = await client.query<{ count: string }>(
      `select count(*)::text count
       from information_schema.role_table_grants
       where table_schema='public'
         and table_name in (
           'retention_claim_accounting_snapshots',
           'retention_claim_accounting_lines',
           'retention_claim_accounting_events'
         )
         and grantee in ('anon','authenticated')`,
    );
    expect(Number(grants.rows[0].count)).toBe(0);
  });

  it("keeps financial mutation RPCs service-role-only", async () => {
    const privileges = await client.query<{
      proname: string;
      authenticated_execute: boolean;
      service_execute: boolean;
    }>(
      `select p.proname,
        has_function_privilege(
          'authenticated',
          p.oid,
          'EXECUTE'
        ) authenticated_execute,
        has_function_privilege(
          'service_role',
          p.oid,
          'EXECUTE'
        ) service_execute
       from pg_proc p
       where p.pronamespace='public'::regnamespace
         and p.proname in (
           'prepare_retention_claim_xero_sync',
           'record_retention_claim_xero_event',
           'queue_retention_claim_xero_attachment'
         )`,
    );
    expect(privileges.rows).toHaveLength(3);
    expect(privileges.rows.every((row) =>
      !row.authenticated_execute && row.service_execute
    )).toBe(true);
  });

  it("installs append-only triggers on every immutable evidence table", async () => {
    const triggers = await client.query<{ table_name: string; trigger_name: string }>(
      `select event_object_table table_name,trigger_name
       from information_schema.triggers
       where trigger_schema='public'
         and event_object_table in (
           'retention_claim_accounting_snapshots',
           'retention_claim_accounting_lines',
           'retention_claim_accounting_events'
         )
         and action_statement like
           '%prevent_retention_claim_accounting_mutation%'`,
    );
    expect(new Set(triggers.rows.map((row) => row.table_name))).toEqual(new Set([
      "retention_claim_accounting_snapshots",
      "retention_claim_accounting_lines",
      "retention_claim_accounting_events",
    ]));
  });

  it("enforces one accounting snapshot and one active operation per Retention Claim document", async () => {
    const indexes = await client.query<{ indexname: string; indexdef: string }>(
      `select indexname,indexdef
       from pg_indexes
       where schemaname='public'
         and (
           tablename='retention_claim_accounting_snapshots'
           or indexname in (
             'organization_accounting_documents_unique_retention_claim_uidx',
             'org_accounting_sync_jobs_active_retention_claim_doc_uidx'
           )
         )`,
    );
    const definitions = indexes.rows.map((row) => row.indexdef).join("\n");
    expect(definitions).toContain("retention_claim_accounting_snapshots_claim_unique");
    expect(definitions).toContain("organization_accounting_documents_unique_retention_claim_uidx");
    expect(definitions).toContain("org_accounting_sync_jobs_active_retention_claim_doc_uidx");
    expect(definitions).toContain("pending");
    expect(definitions).toContain("claimed");
    expect(definitions).toContain("retry_scheduled");
  });

  it("preserves the Phase 9 create and attachment kinds alongside the later isolated refresh kind", async () => {
    const constraint = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) definition
       from pg_constraint
       where conrelid='public.organization_accounting_sync_jobs'::regclass
         and conname='organization_accounting_sync_jobs_job_kind_check'`,
    );
    expect(constraint.rows[0].definition).toContain("xero.retention_claim.sync");
    expect(constraint.rows[0].definition).toContain("xero.retention_claim.attachment");
    expect(constraint.rows[0].definition).toContain("xero.retention_claim.refresh");
  });
});
