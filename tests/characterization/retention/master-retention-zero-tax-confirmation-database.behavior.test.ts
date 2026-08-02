import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_MASTER_CONFIRMATION_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

type Fixture = {
  claimId: string;
  claimNumber: string;
  originClaimId: string;
  projectId: string;
  proposalId: string;
  previewHash: string;
};

type Confirmation = {
  accountingDocumentId: string;
  accountingRevisionId: string;
  attemptId: string;
  jobId: string;
  invoiceNumber: string;
  revisionSequence: number;
  status: string;
};

describeDatabase("master Retention Claim zero-tax confirmation database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  const actorId = randomUUID();
  const organizationId = randomUUID();
  const clientId = randomUUID();
  const connectionId = randomUUID();
  const costCodeId = randomUUID();
  const mappingId = randomUUID();
  const taxRateId = randomUUID();
  const tenantId = `zero-tax-tenant-${randomUUID()}`;
  const contactId = `zero-tax-contact-${randomUUID()}`;
  const fixtureInstant = "2026-08-01T08:05:14.08185Z";
  const successfulFixture: Fixture = {
    claimId: randomUUID(),
    claimNumber: "ZERO-TAX-RC-01",
    originClaimId: randomUUID(),
    projectId: randomUUID(),
    proposalId: randomUUID(),
    previewHash: "a".repeat(64),
  };
  const rollbackFixture: Fixture = {
    claimId: randomUUID(),
    claimNumber: "ZERO-TAX-RC-ROLLBACK",
    originClaimId: randomUUID(),
    projectId: randomUUID(),
    proposalId: randomUUID(),
    previewHash: "b".repeat(64),
  };

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      "select set_config('request.jwt.claim.role', 'service_role', true)",
    );
    await seedOrganizationDependencies();
    await seedClaimFixture(successfulFixture);
    await seedClaimFixture(rollbackFixture);
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function seedOrganizationDependencies() {
    await client.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values
        ($1, '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', $2, '', now(),
         '{}'::jsonb, '{}'::jsonb)`,
      [actorId, `master-retention-zero-tax-${actorId}@example.test`],
    );
    await client.query(
      "delete from public.organizations where created_by = $1",
      [actorId],
    );
    await client.query(
      `insert into public.organizations (id, name, created_by)
       values ($1, 'Master Retention zero-tax fixture', $2)`,
      [organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values ($1, $2, 'owner', 'Zero-tax fixture owner')`,
      [organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_clients
        (id, organization_id, created_by, name, company_name)
       values ($1, $2, $3, 'Zero Tax Client', 'Zero Tax Client Ltd')`,
      [clientId, organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_xero_connections
        (id, organization_id, status, tenant_id, tenant_name, tenant_type,
         tenant_connection_id, scope, connected_by_user_id)
       values ($1, $2, 'connected', $3, 'Zero Tax Xero', 'ORGANISATION',
         $4, array['accounting.invoices']::text[], $5)`,
      [connectionId, organizationId, tenantId, randomUUID(), actorId],
    );
    await client.query(
      `update public.organization_accounting_phase2b_settings
       set retention_claim_immutable_xero_enabled = true
       where organization_id = $1`,
      [organizationId],
    );
    await client.query(
      `insert into public.organization_cost_codes
        (id, organization_id, code, name, external_provider, external_code,
         is_active, metadata, created_by)
       values ($1, $2, '700', 'Retention Receivable', 'xero', '700', true,
         jsonb_build_object(
           'tenantId', $3::text,
           'accountId', $4::text,
           'class', 'ASSET',
           'type', 'CURRENT',
           'taxType', 'NONE'
         ), $5)`,
      [costCodeId, organizationId, tenantId, randomUUID(), actorId],
    );
    await client.query(
      `insert into public.organization_tradesstack_accounting_mappings
        (id, organization_id, provider, tradesstack_cost_code,
         organization_cost_code_id, project_id, is_active,
         created_by_user_id)
       values ($1, $2, 'xero', 700, $3, null, true, $4)`,
      [mappingId, organizationId, costCodeId, actorId],
    );
    await client.query(
      `insert into public.organization_accounting_tax_rates
        (id, organization_id, provider, external_id, name, display_name,
         effective_rate, tax_type, status, is_active, metadata,
         accounting_connection_id, tenant_id, created_by_user_id, synced_at)
       values ($1, $2, 'xero', 'NONE', 'No GST', 'No GST', 0, 'NONE',
         'ACTIVE', true,
         '{"canApplyToRevenue":true,"displayTaxRate":0}'::jsonb,
         $3, $4, $5, now())`,
      [taxRateId, organizationId, connectionId, tenantId, actorId],
    );
    await client.query(
      `insert into public.organization_xero_contacts
        (organization_id, connection_id, tenant_id, contact_id, name,
         contact_status, is_customer)
       values ($1, $2, $3, $4, 'Zero Tax Client', 'ACTIVE', true)`,
      [organizationId, connectionId, tenantId, contactId],
    );
    await client.query(
      `insert into public.organization_external_contacts
        (organization_id, accounting_connection_id, provider,
         local_entity_type, local_entity_id, tenant_id, external_contact_id,
         external_contact_name, external_contact_status, link_status,
         match_method, linked_by, linked_at)
       values ($1, $2, 'xero', 'client', $3, $4, $5,
         'Zero Tax Client', 'ACTIVE', 'linked', 'manual', $6, now())`,
      [organizationId, connectionId, clientId, tenantId, contactId, actorId],
    );
  }

  async function seedClaimFixture(fixture: Fixture) {
    await client.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code, client_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        fixture.projectId,
        organizationId,
        actorId,
        `Zero Tax Project ${fixture.claimNumber}`,
        `zero-tax-${fixture.projectId}`,
        fixture.claimNumber,
        clientId,
      ],
    );
    await client.query(
      `insert into public.project_claims
        (id, organization_id, project_id, created_by, claim_number,
         claim_title, status, claim_date, due_date, claim_amount,
         retention_percent, retention_method, retention_withheld_amount,
         retention_released_amount, retention_held_to_date,
         retention_released_to_date, retention_balance, net_claim_excl_gst,
         gst_amount, total_payable, created_at, updated_at)
       values ($1, $2, $3, $4, $5, 'Zero-tax originating Payment Claim',
         'Draft', '2026-08-01', '2026-08-31', 10000, 10,
         'sliding_scale', 1000, 0, 1000, 0, 1000, 9000, 1350, 10350,
         $6::timestamptz, $6::timestamptz)`,
      [
        fixture.originClaimId,
        organizationId,
        fixture.projectId,
        actorId,
        fixture.claimNumber.replace("RC", "PC"),
        fixtureInstant,
      ],
    );
    await client.query(
      `insert into public.retention_claims
        (id, organization_id, project_id, claim_number, title, issue_date,
         due_date, status, subtotal_excl_tax, submission_state_hash,
         submitted_by, submitted_at, created_by, created_at, updated_at,
         master_role)
       values ($1, $2, $3, $4, 'Retention Claim', '2026-08-01',
         '2026-08-31', 'submitted', 1000, repeat('1', 64), $5,
         $6::timestamptz, $5, $6::timestamptz, $6::timestamptz,
         'master_retention_claim')`,
      [
        fixture.claimId,
        organizationId,
        fixture.projectId,
        fixture.claimNumber,
        actorId,
        fixtureInstant,
      ],
    );
    await client.query(
      `update public.project_claims
       set status = 'Submitted', updated_at = $2::timestamptz
       where id = $1`,
      [fixture.originClaimId, fixtureInstant],
    );
    await client.query(
      `insert into public.organization_accounting_push_proposals
        (id, organization_id, project_id, source_document_type,
         source_document_id, accounting_document_id, active_revision_id,
         operation, external_document_number, preview_hash,
         source_optimistic_revision, decision_snapshot, evidence_hashes,
         expires_at, created_by)
       values ($1, $2, $3, 'retention_claim', $4, null, null,
         'INITIAL_EXPORT', $5, $6,
         (private.master_retention_claim_source($4)->'claim'->>'submittedAt'),
         jsonb_build_object(
           'operation', 'INITIAL_EXPORT',
           'connectionId', $7::text,
           'tenantId', $8::text
         ),
         jsonb_build_object(
           'sourceEvidenceHash', repeat('2', 64),
           'dependencyHash', repeat('3', 64),
           'commercialHash', repeat('4', 64),
           'linesHash', repeat('5', 64),
           'payloadHash', repeat('6', 64),
           'previewHash', $6::text
         ),
         now() + interval '10 minutes', $9)`,
      [
        fixture.proposalId,
        organizationId,
        fixture.projectId,
        fixture.claimId,
        fixture.claimNumber,
        fixture.previewHash,
        connectionId,
        tenantId,
        actorId,
      ],
    );
  }

  async function confirmationInput(fixture: Fixture) {
    const evidence = await client.query<{
      source_hash: string;
      source_revision: string;
    }>(
      `select
         encode(digest(convert_to(source::text, 'UTF8'), 'sha256'), 'hex')
           source_hash,
         source->'claim'->>'submittedAt' source_revision
       from (select private.master_retention_claim_source($1) source) value`,
      [fixture.claimId],
    );
    const source = evidence.rows[0];
    return {
      operation: "INITIAL_EXPORT",
      organizationId,
      projectId: fixture.projectId,
      retentionClaimId: fixture.claimId,
      commercialClaimNumber: fixture.claimNumber,
      confirmedBy: actorId,
      connectionId,
      tenantId,
      sourceOptimisticRevision: source.source_revision,
      retentionSourceEvidenceHash: source.source_hash,
      proposalId: fixture.proposalId,
      previewHash: fixture.previewHash,
      canonicalSchemaVersion: "accounting-evidence-v1:master-retention-structured-v2",
      sourceEvidenceHash: "2".repeat(64),
      dependencyHash: "3".repeat(64),
      commercialHash: "4".repeat(64),
      linesHash: "5".repeat(64),
      payloadHash: "6".repeat(64),
      commercialSnapshot: {
        commercialClaimNumber: fixture.claimNumber,
        subtotalMinor: 100000,
        taxMinor: 0,
        totalMinor: 100000,
      },
      contactSnapshot: { contactId, connectionId, tenantId },
      routingSnapshot: {
        retention: {
          route: 700,
          mappingId,
          organizationCostCodeId: costCodeId,
          accountCode: "700",
        },
      },
      taxSnapshot: { taxRateId, taxType: "NONE", effectiveRate: 0 },
      payloadTemplate: {
        Type: "ACCREC",
        Status: "AUTHORISED",
        Contact: { ContactID: contactId },
        InvoiceNumber: fixture.claimNumber,
        Reference: `Retention Claim ${fixture.claimNumber}`,
        Date: "2026-08-01",
        DueDate: "2026-08-31",
        CurrencyCode: "NZD",
        LineAmountTypes: "Exclusive",
        LineItems: [{
          Description: `Retention release - Payment Claim ${fixture.claimNumber.replace("RC", "PC")}`,
          Quantity: 1,
          UnitAmount: 1000,
          AccountCode: "700",
          TaxType: "NONE",
        }],
      },
      lines: [{
        sequence: 1,
        lineKind: "retention",
        sourceLineType: "payment_claim_retention",
        sourceLineId: fixture.originClaimId,
        originatingPaymentClaimId: fixture.originClaimId,
        description: `Retention release - Payment Claim ${fixture.claimNumber.replace("RC", "PC")}`,
        quantity: 1,
        unitAmountMinor: 100000,
        lineAmountMinor: 100000,
        taxMinor: 0,
        totalMinor: 100000,
        accountSnapshot: { accountCode: "700" },
        taxSnapshot: { taxType: "NONE" },
        trackingSnapshot: {},
        sourceSnapshot: { originatingPaymentClaimId: fixture.originClaimId },
      }],
      subtotalMinor: 100000,
      taxMinor: 0,
      totalMinor: 100000,
      previousRevisionId: null,
      previousInvoiceId: null,
      previousInvoiceNumber: null,
      previousObservationId: null,
      externalDocumentNumber: fixture.claimNumber,
    };
  }

  async function confirm(fixture: Fixture) {
    const result = await client.query<{ result: Confirmation }>(
      "select public.confirm_master_retention_claim_push($1::jsonb) result",
      [JSON.stringify(await confirmationInput(fixture))],
    );
    return result.rows[0].result;
  }

  async function insertRetentionLine(params: {
    revisionId: string;
    sequence: number;
    lineAmountMinor: number;
    taxMinor: number;
    totalMinor: number;
  }) {
    return client.query(
      `insert into public.organization_accounting_revision_lines(
         organization_id, accounting_revision_id, sequence, line_kind,
         source_line_type, description, quantity, unit_amount_minor,
         line_amount_minor, tax_minor, total_minor, account_snapshot,
         tax_snapshot, tracking_snapshot, source_snapshot
       ) values (
         $1, $2, $3, 'retention', 'zero_tax_sign_characterization',
         'Retention sign characterization', 1, $4, $4, $5, $6,
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
       )`,
      [
        organizationId,
        params.revisionId,
        params.sequence,
        params.lineAmountMinor,
        params.taxMinor,
        params.totalMinor,
      ],
    );
  }

  async function expectRejectedLine(params: Parameters<typeof insertRetentionLine>[0]) {
    const savepoint = `rejected_line_${params.sequence}`;
    await client.query(`savepoint ${savepoint}`);
    await expect(insertRetentionLine(params)).rejects.toMatchObject({
      code: "23514",
      constraint: "accounting_revision_line_amounts_check",
    });
    await client.query(`rollback to savepoint ${savepoint}`);
  }

  it("atomically confirms one valid NONE-tax master Retention Claim line", async () => {
    const confirmation = await confirm(successfulFixture);
    expect(confirmation).toMatchObject({
      invoiceNumber: successfulFixture.claimNumber,
      revisionSequence: 1,
      status: "queued",
    });

    const state = await client.query<{
      documents: string;
      revisions: string;
      lines: string;
      attempts: string;
      initial_jobs: string;
      attachment_jobs: string;
      line_amount_minor: string;
      tax_minor: string;
      total_minor: string;
      tax_type: string;
    }>(
      `select
         (select count(*) from public.organization_accounting_documents
          where retention_claim_id = $1::uuid)::text documents,
         (select count(*) from public.organization_accounting_document_revisions
          where source_document_id = $1::uuid)::text revisions,
         (select count(*) from public.organization_accounting_revision_lines line
          join public.organization_accounting_document_revisions revision
            on revision.id = line.accounting_revision_id
          where revision.source_document_id = $1::uuid)::text lines,
         (select count(*) from public.organization_accounting_revision_attempts attempt
          join public.organization_accounting_document_revisions revision
            on revision.id = attempt.accounting_revision_id
          where revision.source_document_id = $1::uuid)::text attempts,
         (select count(*) from public.organization_accounting_sync_jobs
          where id = $2::uuid and job_kind = 'xero.retention_claim.initial_push')::text
            initial_jobs,
         (select count(*) from public.organization_accounting_sync_jobs
          where request_payload->>'accountingRevisionId' = $3::text
            and job_kind like 'xero.retention_claim%.attachment')::text
            attachment_jobs,
         line.line_amount_minor::text,
         line.tax_minor::text,
         line.total_minor::text,
         line.tax_snapshot->>'taxType' tax_type
       from public.organization_accounting_revision_lines line
       where line.accounting_revision_id = $3::uuid and line.sequence = 1`,
      [successfulFixture.claimId, confirmation.jobId, confirmation.accountingRevisionId],
    );
    expect(state.rows[0]).toEqual({
      documents: "1",
      revisions: "1",
      lines: "1",
      attempts: "1",
      initial_jobs: "1",
      attachment_jobs: "0",
      line_amount_minor: "100000",
      tax_minor: "0",
      total_minor: "100000",
      tax_type: "NONE",
    });
  });

  it("preserves all retention amount, tax-sign, and total rules", async () => {
    const revision = await client.query<{ id: string }>(
      `select id from public.organization_accounting_document_revisions
       where source_document_id = $1`,
      [successfulFixture.claimId],
    );
    const revisionId = revision.rows[0].id;

    await insertRetentionLine({
      revisionId, sequence: 2, lineAmountMinor: 100000,
      taxMinor: 15000, totalMinor: 115000,
    });
    await insertRetentionLine({
      revisionId, sequence: 3, lineAmountMinor: -100000,
      taxMinor: 0, totalMinor: -100000,
    });
    await insertRetentionLine({
      revisionId, sequence: 4, lineAmountMinor: -100000,
      taxMinor: -15000, totalMinor: -115000,
    });
    await expectRejectedLine({
      revisionId, sequence: 5, lineAmountMinor: 100000,
      taxMinor: -15000, totalMinor: 85000,
    });
    await expectRejectedLine({
      revisionId, sequence: 6, lineAmountMinor: -100000,
      taxMinor: 15000, totalMinor: -85000,
    });
    await expectRejectedLine({
      revisionId, sequence: 7, lineAmountMinor: 0,
      taxMinor: 0, totalMinor: 0,
    });
    await expectRejectedLine({
      revisionId, sequence: 8, lineAmountMinor: 100000,
      taxMinor: 0, totalMinor: 99999,
    });
  });

  it("rolls back document, reservation, revision, line, attempt, and job when queue insertion fails", async () => {
    await client.query(
      `create function pg_temp.reject_master_retention_queue_fixture()
       returns trigger language plpgsql as $$
       begin
         if new.organization_id = '${organizationId}'::uuid
           and new.created_by_user_id = '${actorId}'::uuid
           and new.job_kind = 'xero.retention_claim.initial_push' then
           raise exception 'Synthetic queue insertion failure.'
             using errcode = 'P0001';
         end if;
         return new;
       end;
       $$`,
    );
    await client.query(
      `create trigger reject_master_retention_queue_fixture
       before insert on public.organization_accounting_sync_jobs
       for each row execute function pg_temp.reject_master_retention_queue_fixture()`,
    );
    const jobsBefore = await client.query<{ count: string }>(
      `select count(*)::text count
       from public.organization_accounting_sync_jobs
       where organization_id = $1`,
      [organizationId],
    );

    await client.query("savepoint queue_failure");
    await expect(confirm(rollbackFixture)).rejects.toMatchObject({
      code: "P0001",
      message: "Synthetic queue insertion failure.",
    });
    await client.query("rollback to savepoint queue_failure");
    await client.query(
      `drop trigger reject_master_retention_queue_fixture
       on public.organization_accounting_sync_jobs`,
    );

    const state = await client.query<{
      documents: string;
      reservations: string;
      revisions: string;
      lines: string;
      attempts: string;
      jobs: string;
    }>(
      `select
         (select count(*) from public.organization_accounting_documents
          where retention_claim_id = $1)::text documents,
         (select count(*) from public.organization_accounting_number_reservations
          where source_document_type = 'retention_claim'
            and source_document_id = $1)::text reservations,
         (select count(*) from public.organization_accounting_document_revisions
          where source_document_type = 'retention_claim'
            and source_document_id = $1)::text revisions,
         (select count(*) from public.organization_accounting_revision_lines line
          join public.organization_accounting_document_revisions revision
            on revision.id = line.accounting_revision_id
          where revision.source_document_id = $1)::text lines,
         (select count(*) from public.organization_accounting_revision_attempts attempt
          join public.organization_accounting_document_revisions revision
            on revision.id = attempt.accounting_revision_id
          where revision.source_document_id = $1)::text attempts,
         (select count(*) from public.organization_accounting_sync_jobs
          where organization_id = $2)::text jobs`,
      [rollbackFixture.claimId, organizationId],
    );
    expect(state.rows[0]).toEqual({
      documents: "0",
      reservations: "0",
      revisions: "0",
      lines: "0",
      attempts: "0",
      jobs: jobsBefore.rows[0].count,
    });
  });
});
