import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: null as unknown,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => mocks.database,
}));
vi.mock("server-only", () => ({}));

import {
  resolveRetentionClaimAccountingOperation,
} from "../../../lib/xero/retention-claim-accounting-decision";
import {
  resolveRetentionClaimAccountingDrift,
} from "../../../lib/xero/retention-claim-accounting-drift";
import {
  getRetentionClaimRefreshIdentity,
} from "../../../lib/xero/retention-claim-immutable-panel";

const dbUrl =
  process.env.RETENTION_REFRESH_IDENTITY_DB_URL
  ?? process.env.RETENTION_MASTER_CONFIRMATION_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { code?: string; message: string } | null;
};

class PgSupabaseQuery implements PromiseLike<QueryResult> {
  private columns = "*";
  private filters: Array<[string, unknown]> = [];

  constructor(
    private readonly client: pg.Client,
    private readonly table: string,
  ) {}

  select(columns: string) {
    this.columns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  maybeSingle() {
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    const identifiers = this.columns === "*"
      ? "*"
      : this.columns.split(",").map((column) => {
          const identifier = column.trim();
          if (!/^[a-z_]+$/.test(identifier)) {
            throw new Error(`Unsafe test identifier: ${identifier}`);
          }
          return `"${identifier}"`;
        }).join(",");
    const table = this.table;
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error(`Unsafe test table: ${table}`);
    }
    const where = this.filters.map(([column], index) => {
      if (!/^[a-z_]+$/.test(column)) {
        throw new Error(`Unsafe test filter: ${column}`);
      }
      return `"${column}" = $${index + 1}`;
    });
    try {
      const result = await this.client.query(
        `select ${identifiers} from public."${table}"`
          + (where.length ? ` where ${where.join(" and ")}` : "")
          + " limit 2",
        this.filters.map(([, value]) => value),
      );
      return {
        data: result.rows.length === 1 ? result.rows[0] : null,
        error: result.rows.length > 1
          ? { message: "Multiple rows returned by maybeSingle()." }
          : null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          code: error instanceof Error && "code" in error
            ? String(error.code)
            : undefined,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

describeDatabase("Retention Claim refresh identity database projection", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  const actorId = randomUUID();
  let organizationId: string = randomUUID();
  const clientId = randomUUID();
  const projectId = randomUUID();
  const claimId = randomUUID();
  const documentId = randomUUID();
  const revisionId = randomUUID();
  const reservationId = randomUUID();
  const attemptId = randomUUID();
  const jobId = randomUUID();
  const observationId = randomUUID();
  const projectionId = randomUUID();
  const connectionId = randomUUID();
  const tenantId = `refresh-identity-${randomUUID()}`;
  const invoiceId = randomUUID();
  const invoiceNumber = "REFRESH-IDENTITY-RC-01";
  const hash = "a".repeat(64);

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      "select set_config('request.jwt.claim.role', 'service_role', true)",
    );
    mocks.database = {
      from: (table: string) => new PgSupabaseQuery(client, table),
    };
    await seedFixture();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function seedFixture() {
    await client.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', $2, '', now(),
         '{}'::jsonb, '{}'::jsonb)`,
      [actorId, `retention-refresh-${actorId}@example.test`],
    );
    const createdOrganization = await client.query<{ id: string }>(
      "select id from public.organizations where created_by = $1",
      [actorId],
    );
    organizationId = createdOrganization.rows[0].id;
    await client.query(
      `update public.organizations
       set name = 'Retention refresh identity fixture' where id = $1`,
      [organizationId],
    );
    await client.query(
      `insert into public.organization_clients
        (id, organization_id, created_by, name, company_name)
       values ($1, $2, $3, 'Refresh Client', 'Refresh Client Ltd')`,
      [clientId, organizationId, actorId],
    );
    await client.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code, client_id)
       values ($1, $2, $3, 'Refresh Project', $4, 'REFRESH', $5)`,
      [projectId, organizationId, actorId, `refresh-${projectId}`, clientId],
    );
    await client.query(
      `insert into public.organization_xero_connections
        (id, organization_id, status, tenant_id, tenant_name, tenant_type,
         tenant_connection_id, scope, connected_by_user_id)
       values ($1, $2, 'connected', $3, 'Refresh Xero', 'ORGANISATION',
         $4, array['accounting.invoices']::text[], $5)`,
      [connectionId, organizationId, tenantId, randomUUID(), actorId],
    );
    await client.query(
      `insert into public.retention_claims
        (id, organization_id, project_id, claim_number, title, issue_date,
         due_date, status, subtotal_excl_tax, submission_state_hash,
         submitted_by, submitted_at, created_by, master_role)
       values ($1, $2, $3, $4, 'Refresh fixture', '2026-08-01',
         '2026-08-31', 'submitted', 1000, $5, $6, now(), $6,
         'master_retention_claim')`,
      [claimId, organizationId, projectId, invoiceNumber, hash, actorId],
    );
    await client.query(
      `insert into public.organization_accounting_documents
        (id, organization_id, accounting_connection_id, provider, tenant_id,
         local_document_type, local_document_id, project_claim_id,
         retention_claim_id, current_version_id, external_document_id,
         external_document_number, raw_external_status,
         normalized_external_status, export_status, currency_code,
         integration_contract)
       values ($1, $2, $3, 'xero', $4, 'retention_claim', null, null, $5,
         null, $6, $7, 'AUTHORISED', 'awaiting_payment', 'exported', 'NZD',
         'retention_claim_revision_v1')`,
      [
        documentId,
        organizationId,
        connectionId,
        tenantId,
        claimId,
        invoiceId,
        invoiceNumber,
      ],
    );
    await client.query(
      `insert into public.organization_accounting_number_reservations
        (id, organization_id, provider, tenant_id, document_class,
         sequence_number, formatted_number, accounting_document_id,
         source_document_type, source_document_id, reservation_reason,
         reserved_by)
       values ($1, $2, 'xero', $3, 'sales_invoice', 1, $4, $5,
         'retention_claim', $6, 'retention_claim_initial_push', $7)`,
      [
        reservationId,
        organizationId,
        tenantId,
        invoiceNumber,
        documentId,
        claimId,
        actorId,
      ],
    );
    await client.query(
      `insert into public.organization_accounting_document_revisions
        (id, organization_id, project_id, accounting_document_id,
         revision_sequence, source_document_type, source_document_id,
         revision_intent, resolution_strategy, provider, connection_id,
         tenant_id, number_reservation_id, external_document_id, external_document_number,
         commercial_snapshot, contact_snapshot, routing_snapshot, tax_snapshot,
         attachment_snapshot, payload_snapshot, canonical_schema_version,
         source_evidence_hash, commercial_hash, lines_hash, payload_hash,
         provider_content_hash, currency_code, provider_document_type,
         requested_provider_status, line_amount_type, subtotal_minor, tax_minor,
         total_minor, confirmation_preview_hash, confirmed_by, confirmed_at,
         lifecycle_state, succeeded_at, activated_at)
       values ($1, $2, $3, $4, 1, 'retention_claim', $5, 'initial_push',
         'new_document', 'xero', $6, $7, $8, $9, $10,
         jsonb_build_object('currentStateHash', $11::text,
           'issueDate', '2026-08-01', 'dueDate', '2026-08-31'),
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
         jsonb_build_object('Date', '2026-08-01', 'DueDate', '2026-08-31'),
         'accounting-evidence-v1', $11, repeat('b',64), repeat('c',64),
         repeat('d',64), $11, 'NZD', 'ACCREC', 'AUTHORISED', 'Exclusive',
         100000, 0, 100000, repeat('e',64), $12, now(), 'succeeded', now(), now())`,
      [
        revisionId,
        organizationId,
        projectId,
        documentId,
        claimId,
        connectionId,
        tenantId,
        reservationId,
        invoiceId,
        invoiceNumber,
        hash,
        actorId,
      ],
    );
    await client.query(
      "select set_config('app.accounting_phase2a_pointer_write', 'true', true)",
    );
    await client.query(
      `update public.organization_accounting_documents
       set active_accounting_revision_id = $1 where id = $2`,
      [revisionId, documentId],
    );
    await client.query(
      "select set_config('app.accounting_phase2a_pointer_write', '', true)",
    );
    await client.query(
      `insert into public.organization_accounting_revision_attempts
        (id, organization_id, accounting_revision_id, attempt_sequence,
         attempt_intent, queue_state, idempotency_key, request_evidence,
         response_evidence, completed_at, outcome_code)
       values ($1, $2, $3, 1, 'create', 'succeeded', $4, '{}'::jsonb,
         '{}'::jsonb, now(), 'verified_authorised_invoice')`,
      [attemptId, organizationId, revisionId, `refresh-attempt-${attemptId}`],
    );
    await client.query(
      `insert into public.organization_accounting_sync_jobs
        (id, organization_id, provider, connection_id, job_kind,
         trigger_source, queue_state, request_payload, result_summary,
         idempotency_key, attempt_count, max_attempts, last_completed_at,
         created_by_user_id)
       values ($1, $2, 'xero', $3, 'xero.retention_claim.initial_push',
         'user_export', 'completed',
         jsonb_build_object('accountingDocumentId', $4::text,
           'accountingRevisionId', $5::text), '{}'::jsonb, $6, 1, 5, now(), $7)`,
      [
        jobId,
        organizationId,
        connectionId,
        documentId,
        revisionId,
        `refresh-job-${jobId}`,
        actorId,
      ],
    );
    await client.query(
      `insert into public.organization_accounting_remote_observations
        (id, organization_id, accounting_document_id, accounting_revision_id,
         provider, tenant_id, external_document_id, raw_status,
         normalized_status, content_hash, settlement_hash, raw_observation)
       values ($1, $2, $3, $4, 'xero', $5, $6, 'AUTHORISED',
         'awaiting_payment', $7, repeat('f',64),
         '{"Type":"ACCREC","Status":"AUTHORISED","AmountPaid":0,"AmountCredited":0}'::jsonb)`,
      [observationId, organizationId, documentId, revisionId, tenantId, invoiceId, hash],
    );
    await client.query(
      `insert into public.organization_accounting_projections
        (id, organization_id, accounting_document_id, accounting_revision_id,
         remote_observation_id, raw_provider_status,
         normalized_invoice_status, normalized_payment_status,
         amount_paid_minor, amount_due_minor, amount_credited_minor,
         divergent, divergence_reasons, observed_content_hash)
       values ($1, $2, $3, $4, $5, 'AUTHORISED', 'authorised',
         'unpaid', 0, 100000, 0, false, '[]'::jsonb, $6)`,
      [projectionId, organizationId, documentId, revisionId, observationId, hash],
    );
  }

  async function durableCounts() {
    const result = await client.query<{
      proposals: string;
      revisions: string;
      attempts: string;
      jobs: string;
      events: string;
      observations: string;
    }>(
      `select
        (select count(*) from public.organization_accounting_push_proposals
          where source_document_id = $1)::text proposals,
        (select count(*) from public.organization_accounting_document_revisions
          where accounting_document_id = $2)::text revisions,
        (select count(*) from public.organization_accounting_revision_attempts
          where accounting_revision_id = $3)::text attempts,
        (select count(*) from public.organization_accounting_sync_jobs
          where request_payload->>'accountingDocumentId' = $2::text)::text jobs,
        (select count(*) from public.organization_accounting_events
          where accounting_document_id = $2)::text events,
        (select count(*) from public.organization_accounting_remote_observations
          where accounting_document_id = $2)::text observations`,
      [claimId, documentId, revisionId],
    );
    return result.rows[0];
  }

  it("resolves the immutable refresh identity without document project_id", async () => {
    const before = await durableCounts();
    const identity = await getRetentionClaimRefreshIdentity({
      organizationId,
      retentionClaimId: claimId,
      prepared: {
        featureEnabled: true,
        permissions: { "retention.claims.xero.manage": true },
      },
    });

    expect(identity).toEqual({
      organizationId,
      projectId,
      retentionClaimId: claimId,
      accountingDocumentId: documentId,
      activeRevisionId: revisionId,
      invoiceId,
      connectionId,
      tenantId,
    });
    expect(await durableCounts()).toEqual(before);

    const drift = resolveRetentionClaimAccountingDrift({
      activeStructuredSourceHash: hash,
      currentStructuredSourceHash: hash,
      activeIssueDate: "2026-08-01",
      currentIssueDate: "2026-08-01",
      activeDueDate: "2026-08-31",
      currentDueDate: "2026-08-31",
    });
    expect(resolveRetentionClaimAccountingOperation({
      featureEnabled: true,
      hasPushPermission: true,
      readinessReady: true,
      retentionOwnershipValid: true,
      hasActiveFinancialWork: false,
      hasUncertainFinancialResult: false,
      hasStableDocument: true,
      hasActiveRevision: true,
      legacyAdoptionEligible: false,
      activeInvoiceId: invoiceId,
      activeInvoiceNumber: invoiceNumber,
      replacementNumber: `${invoiceNumber}-R1`,
      connectionMatches: true,
      tenantMatches: true,
      hasInvoiceScope: true,
      providerAvailable: true,
      providerState: "authorised",
      amountPaidMinor: 0,
      amountDueMinor: 100000,
      amountCreditedMinor: 0,
      hasPayments: false,
      hasCredits: false,
      financialDivergence: false,
      contentDivergence: false,
      claimChangedAfterExport: drift.claimChangedAfterExport,
      canRefresh: true,
    })).toMatchObject({
      operation: "BLOCKED",
      blockers: [{ code: "already_exported" }],
    });
  });

  it("retains organization and claim scoping", async () => {
    await expect(getRetentionClaimRefreshIdentity({
      organizationId: randomUUID(),
      retentionClaimId: claimId,
      prepared: {
        featureEnabled: true,
        permissions: { "retention.claims.xero.manage": true },
      },
    })).rejects.toThrow("The Retention Claim could not be loaded.");
    await expect(getRetentionClaimRefreshIdentity({
      organizationId,
      retentionClaimId: randomUUID(),
      prepared: {
        featureEnabled: true,
        permissions: { "retention.claims.xero.manage": true },
      },
    })).rejects.toThrow("The Retention Claim could not be loaded.");
  });

  it("retains contract, active-revision, InvoiceID, and schema identity guards", async () => {
    const prepared = {
      featureEnabled: true,
      permissions: { "retention.claims.xero.manage": true },
    };

    await client.query("savepoint wrong_contract");
    await client.query(
      `update public.organization_accounting_documents
       set integration_contract = 'payment_claim_revision_v1'
       where id = $1`,
      [documentId],
    );
    await expect(getRetentionClaimRefreshIdentity({
      organizationId,
      retentionClaimId: claimId,
      prepared,
    })).rejects.toThrow(
      "The immutable Retention Claim accounting document was not found.",
    );
    await client.query("rollback to savepoint wrong_contract");

    for (const [savepoint, column] of [
      ["missing_revision", "active_accounting_revision_id"],
      ["missing_invoice", "external_document_id"],
    ] as const) {
      await client.query(`savepoint ${savepoint}`);
      await client.query(
        "select set_config('app.accounting_phase2a_pointer_write', 'true', true)",
      );
      await client.query(
        `update public.organization_accounting_documents
         set "${column}" = null where id = $1`,
        [documentId],
      );
      await client.query(
        "select set_config('app.accounting_phase2a_pointer_write', '', true)",
      );
      await expect(getRetentionClaimRefreshIdentity({
        organizationId,
        retentionClaimId: claimId,
        prepared,
      })).rejects.toThrow(
        "The Retention Claim has no active immutable Xero invoice.",
      );
      await client.query(`rollback to savepoint ${savepoint}`);
    }

    for (const [savepoint, assignment, code] of [
      ["wrong_provider", "provider = 'other'", "23514"],
      ["wrong_type", "local_document_type = 'supplier_invoice'", "23514"],
      ["missing_connection", "accounting_connection_id = null", "23502"],
      ["missing_tenant", "tenant_id = null", "23502"],
    ] as const) {
      await client.query(`savepoint ${savepoint}`);
      await expect(client.query(
        `update public.organization_accounting_documents
         set ${assignment} where id = $1`,
        [documentId],
      )).rejects.toMatchObject({ code });
      await client.query(`rollback to savepoint ${savepoint}`);
    }
  });
});
