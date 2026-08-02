import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.RETENTION_DIRECT_INHERITANCE_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

describeDatabase("direct Retention GST inheritance database contract", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  const actorId = randomUUID();
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const clientId = randomUUID();
  const connectionId = randomUUID();
  const taxRateId = randomUUID();
  const tenantId = `direct-retention-${randomUUID()}`;
  const paymentClaimId = randomUUID();
  const retentionClaimId = randomUUID();
  const originDocumentId = randomUUID();
  const originRevisionId = randomUUID();
  const originLineId = randomUUID();
  const retentionDocumentId = randomUUID();
  const retentionRevisionId = randomUUID();
  const retentionReservationId = randomUUID();
  const hash = "d".repeat(64);

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      "select set_config('request.jwt.claim.role', 'service_role', true)",
    );
    await seedFixture();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function seedFixture() {
    await client.query(
      `insert into auth.users(
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data
       ) values (
         $1, '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', $2, '', now(),
         '{}'::jsonb, '{}'::jsonb
       )`,
      [actorId, `direct-retention-${actorId}@example.test`],
    );
    await client.query(
      "delete from public.organizations where created_by = $1",
      [actorId],
    );
    await client.query(
      `insert into public.organizations(id, name, created_by)
       values ($1, 'Direct Retention inheritance fixture', $2)`,
      [organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_members(
         organization_id, user_id, role, display_name
       ) values ($1, $2, 'owner', 'Direct Retention owner')`,
      [organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_clients(
         id, organization_id, created_by, name, company_name
       ) values ($1, $2, $3, 'Direct Retention Client', 'Direct Retention Ltd')`,
      [clientId, organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_projects(
         id, organization_id, created_by, name, slug, project_code, client_id
       ) values ($1, $2, $3, 'Direct Retention Project', $4, 'DIRECT-RC', $5)`,
      [projectId, organizationId, actorId, `direct-${projectId}`, clientId],
    );
    await client.query(
      `insert into public.organization_xero_connections(
         id, organization_id, status, tenant_id, tenant_name, tenant_type,
         tenant_connection_id, scope, connected_by_user_id
       ) values ($1, $2, 'connected', $3, 'Direct Xero', 'ORGANISATION',
         $4, array['accounting.invoices']::text[], $5)`,
      [connectionId, organizationId, tenantId, randomUUID(), actorId],
    );
    await client.query(
      `insert into public.organization_accounting_tax_rates(
         id, organization_id, provider, external_id, name, display_name,
         effective_rate, tax_type, status, is_active, metadata,
         accounting_connection_id, tenant_id, created_by_user_id, synced_at
       ) values ($1, $2, 'xero', 'OUTPUT2', 'GST on Income', 'GST on Income',
         15, 'OUTPUT2', 'ACTIVE', true,
         '{"canApplyToRevenue":true}'::jsonb, $3, $4, $5, now())`,
      [taxRateId, organizationId, connectionId, tenantId, actorId],
    );
    await client.query(
      `insert into public.project_claims(
         id, organization_id, project_id, created_by, claim_number,
         claim_title, status, claim_date, due_date, claim_amount,
         retention_percent, retention_method, retention_withheld_amount,
         retention_released_amount, retention_held_to_date,
         retention_released_to_date, retention_balance, net_claim_excl_gst,
         gst_amount, total_payable
       ) values ($1, $2, $3, $4, '26030-PC-01', 'Origin Payment Claim',
         'Draft', '2026-08-01', '2026-08-31', 10000, 10,
         'sliding_scale', 1000, 0, 1000, 0, 1000, 9000, 1350, 10350)`,
      [paymentClaimId, organizationId, projectId, actorId],
    );
    await client.query(
      `insert into public.retention_claims(
         id, organization_id, project_id, claim_number, title, issue_date,
         due_date, status, subtotal_excl_tax, submission_state_hash,
         submitted_by, submitted_at, created_by, master_role
       ) values ($1, $2, $3, '26030-RC-01', 'Retention Claim',
         '2026-08-01', '2026-08-31', 'submitted', 1000, $4, $5, now(), $5,
         'master_retention_claim')`,
      [retentionClaimId, organizationId, projectId, hash, actorId],
    );
    await client.query(
      "update public.project_claims set status = 'Submitted' where id = $1",
      [paymentClaimId],
    );

    await client.query(
      `insert into public.organization_accounting_documents(
         id, organization_id, accounting_connection_id, provider, tenant_id,
         local_document_type, project_claim_id, export_status,
         external_document_id, external_document_number, integration_contract
       ) values ($1, $2, $3, 'xero', $4, 'project_claim', $5, 'exported',
         $6, '26030-PC-01', 'payment_claim_revision_v1')`,
      [
        originDocumentId, organizationId, connectionId, tenantId,
        paymentClaimId, `invoice-${randomUUID()}`,
      ],
    );
    await insertRevision({
      id: originRevisionId,
      documentId: originDocumentId,
      sourceType: "project_claim",
      sourceId: paymentClaimId,
      subtotal: 900000,
      tax: 135000,
      total: 1035000,
      lifecycle: "succeeded",
      taxSnapshot: {
        taxRateId,
        taxType: "OUTPUT2",
        effectiveRate: 15,
      },
    });
    await client.query(
      `insert into public.organization_accounting_revision_lines(
         id, organization_id, accounting_revision_id, sequence, line_kind,
         source_line_type, originating_payment_claim_id, description,
         quantity, unit_amount_minor, line_amount_minor, tax_minor,
         total_minor, account_snapshot, tax_snapshot, tracking_snapshot,
         source_snapshot
       ) values ($1, $2, $3, 1, 'retention', 'payment_claim', $4,
         'Retention withheld', 1, -100000, -100000, -15000, -115000,
         '{"accountCode":"700"}'::jsonb,
         '{"taxType":"OUTPUT2"}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [originLineId, organizationId, originRevisionId, paymentClaimId],
    );
    await activateRevision(originDocumentId, originRevisionId);

    await client.query(
      `insert into public.organization_accounting_documents(
         id, organization_id, accounting_connection_id, provider, tenant_id,
         local_document_type, retention_claim_id, export_status,
         integration_contract
       ) values ($1, $2, $3, 'xero', $4, 'retention_claim', $5, 'queued',
         'retention_claim_revision_v1')`,
      [
        retentionDocumentId, organizationId, connectionId, tenantId,
        retentionClaimId,
      ],
    );
    await client.query(
      `insert into public.organization_accounting_number_reservations(
         id, organization_id, provider, tenant_id, document_class,
         sequence_number, formatted_number, accounting_document_id,
         source_document_type, source_document_id, reservation_reason,
         reserved_by
       ) values ($1, $2, 'xero', $3, 'sales_invoice', 82603001,
         '26030-RC-01', $4, 'retention_claim', $5,
         'Direct inheritance database fixture', $6)`,
      [
        retentionReservationId, organizationId, tenantId,
        retentionDocumentId, retentionClaimId, actorId,
      ],
    );
    await insertRevision({
      id: retentionRevisionId,
      documentId: retentionDocumentId,
      sourceType: "retention_claim",
      sourceId: retentionClaimId,
      subtotal: 100000,
      tax: 15000,
      total: 115000,
      lifecycle: "confirmed",
      taxSnapshot: {},
    });
  }

  async function insertRevision(input: {
    id: string;
    documentId: string;
    sourceType: "project_claim" | "retention_claim";
    sourceId: string;
    subtotal: number;
    tax: number;
    total: number;
    lifecycle: "confirmed" | "succeeded";
    taxSnapshot: Record<string, unknown>;
  }) {
    await client.query(
      `insert into public.organization_accounting_document_revisions(
         id, organization_id, project_id, accounting_document_id,
         revision_sequence, source_document_type, source_document_id,
         revision_intent, resolution_strategy, provider, connection_id,
         tenant_id, number_reservation_id, external_document_number, commercial_snapshot,
         contact_snapshot, routing_snapshot, tax_snapshot, attachment_snapshot,
         payload_snapshot, canonical_schema_version, source_evidence_hash,
         commercial_hash, lines_hash, payload_hash, provider_content_hash,
         currency_code, provider_document_type, requested_provider_status,
         line_amount_type, subtotal_minor, tax_minor, total_minor,
         confirmation_preview_hash, confirmed_by, confirmed_at,
         lifecycle_state, succeeded_at
       ) values ($1, $2, $3, $4, 1, $5, $6, 'initial_push', 'new_document',
         'xero', $7, $8,
         case when $5 = 'retention_claim' then $16::uuid else null end,
         case when $5 = 'project_claim' then '26030-PC-01' else '26030-RC-01' end,
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
         $9::jsonb, '{}'::jsonb, '{}'::jsonb, 'accounting-canonical-v1',
         $10, $10, $10, $10, $10, 'NZD', 'ACCREC', 'AUTHORISED', 'Exclusive',
         $11, $12, $13, $10, $14, now(), $15,
         case when $15 = 'succeeded' then now() end)`,
      [
        input.id, organizationId, projectId, input.documentId,
        input.sourceType, input.sourceId, connectionId, tenantId,
        JSON.stringify(input.taxSnapshot), hash, input.subtotal, input.tax,
        input.total, actorId, input.lifecycle, retentionReservationId,
      ],
    );
  }

  async function activateRevision(documentId: string, revisionId: string) {
    await client.query(
      "select set_config('app.accounting_phase2a_pointer_write', 'true', true)",
    );
    await client.query(
      `update public.organization_accounting_documents
       set active_accounting_revision_id = $2 where id = $1`,
      [documentId, revisionId],
    );
  }

  function directSourceSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      originEvidenceContract: "direct_immutable_retention_v1",
      originAccountingDocumentId: originDocumentId,
      originAccountingRevisionId: originRevisionId,
      originAccountingRevisionLineId: originLineId,
      ...overrides,
    };
  }

  async function insertReleaseLine(overrides: {
    lineAmount?: number;
    tax?: number;
    total?: number;
    taxType?: string;
    taxRateSnapshotId?: string;
    sourceSnapshot?: Record<string, unknown>;
  } = {}) {
    const lineAmount = overrides.lineAmount ?? 100000;
    const tax = overrides.tax ?? 15000;
    const total = overrides.total ?? 115000;
    return client.query(
      `insert into public.organization_accounting_revision_lines(
         id, organization_id, accounting_revision_id, sequence, line_kind,
         source_line_type, source_line_id, originating_payment_claim_id,
         description, quantity, unit_amount_minor, line_amount_minor,
         tax_minor, total_minor, account_snapshot, tax_snapshot,
         tracking_snapshot, source_snapshot
       ) values ($1, $2, $3,
         coalesce((select max(sequence) + 1
           from public.organization_accounting_revision_lines
           where accounting_revision_id = $3), 1),
         'retention', 'payment_claim_retention', $4, $4,
         'Retention release — Payment Claim 26030-PC-01', 1, $5, $5, $6, $7,
         '{"accountCode":"700"}'::jsonb,
         jsonb_build_object('taxType', $8::text, 'taxRateId', $9::text),
         '{}'::jsonb, $10::jsonb)
       returning id`,
      [
        randomUUID(), organizationId, retentionRevisionId, paymentClaimId,
        lineAmount, tax, total, overrides.taxType ?? "OUTPUT2",
        overrides.taxRateSnapshotId ?? taxRateId,
        JSON.stringify(overrides.sourceSnapshot ?? directSourceSnapshot()),
      ],
    );
  }

  async function expectFailure(
    run: () => Promise<unknown>,
    message: RegExp,
  ) {
    const savepoint = `sp_${randomUUID().replaceAll("-", "")}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      await expect(run()).rejects.toMatchObject({ message: expect.stringMatching(message) });
    } finally {
      await client.query(`rollback to savepoint ${savepoint}`);
    }
  }

  it("persists the exact OUTPUT2 sign inverse from immutable origin evidence", async () => {
    const inserted = await insertReleaseLine();
    const result = await client.query<{
      line_amount_minor: string;
      tax_minor: string;
      total_minor: string;
      tax_type: string;
      tax_rate_id: string;
    }>(
      `select line_amount_minor::text, tax_minor::text, total_minor::text,
         tax_snapshot->>'taxType' tax_type,
         tax_snapshot->>'taxRateId' tax_rate_id
       from public.organization_accounting_revision_lines where id = $1`,
      [inserted.rows[0].id],
    );
    expect(result.rows).toEqual([{
      line_amount_minor: "100000",
      tax_minor: "15000",
      total_minor: "115000",
      tax_type: "OUTPUT2",
      tax_rate_id: taxRateId,
    }]);
  });

  it("rejects amount, tax, total, TaxType, and immutable identity drift", async () => {
    await expectFailure(
      () => insertReleaseLine({ lineAmount: 99999 }),
      /RETENTION_ORIGIN_INVERSION_MISMATCH/,
    );
    await expectFailure(
      () => insertReleaseLine({ tax: 0, total: 100000 }),
      /RETENTION_ORIGIN_INVERSION_MISMATCH/,
    );
    await expectFailure(
      () => insertReleaseLine({ total: 114999 }),
      /RETENTION_ORIGIN_INVERSION_MISMATCH|accounting_revision_line_amounts_check/,
    );
    await expectFailure(
      () => insertReleaseLine({ taxType: "NONE" }),
      /RETENTION_ORIGIN_INVERSION_MISMATCH/,
    );
    await expectFailure(
      () => insertReleaseLine({
        sourceSnapshot: directSourceSnapshot({
          originAccountingRevisionLineId: randomUUID(),
        }),
      }),
      /ORIGIN_RETENTION_LINE_MISSING/,
    );
  });

  it("does not mutate the immutable origin revision or line", async () => {
    const result = await client.query<{
      lifecycle_state: string;
      line_amount_minor: string;
      tax_minor: string;
      total_minor: string;
    }>(
      `select revision.lifecycle_state, line.line_amount_minor::text,
         line.tax_minor::text, line.total_minor::text
       from public.organization_accounting_document_revisions revision
       join public.organization_accounting_revision_lines line
         on line.accounting_revision_id = revision.id
       where revision.id = $1 and line.id = $2`,
      [originRevisionId, originLineId],
    );
    expect(result.rows).toEqual([{
      lifecycle_state: "succeeded",
      line_amount_minor: "-100000",
      tax_minor: "-15000",
      total_minor: "-115000",
    }]);
  });
});
