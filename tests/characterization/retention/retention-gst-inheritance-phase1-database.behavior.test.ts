import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.RETENTION_GST_PHASE1_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

type OriginFixture = {
  id: string;
  claimNumber: string;
};

type RevisionFixture = {
  documentId: string;
  revisionId: string;
  lineId: string | null;
};

describeDatabase("Retention GST inheritance Phase 1 database foundation", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  const actorId = randomUUID();
  const organizationId = randomUUID();
  const otherActorId = randomUUID();
  const otherOrganizationId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const clientId = randomUUID();
  const otherClientId = randomUUID();
  const connectionId = randomUUID();
  const secondConnectionId = randomUUID();
  const otherConnectionId = randomUUID();
  const tenantId = `gst-v2-${randomUUID()}`;
  const secondTenantId = `gst-v2-second-${randomUUID()}`;
  const otherTenantId = `gst-v2-other-${randomUUID()}`;
  const retentionClaimId = randomUUID();
  const hash = "a".repeat(64);

  const origins = {
    initial: origin("PC-V2-INITIAL"),
    updated: origin("PC-V2-UPDATED"),
    replacement: origin("PC-V2-REPLACEMENT"),
    pending: origin("PC-V2-PENDING"),
    failed: origin("PC-V2-FAILED"),
    none: origin("PC-V2-NONE"),
    zeroRated: origin("PC-V2-ZERORATED"),
    noLine: origin("PC-V2-NO-LINE"),
    multipleLines: origin("PC-V2-MULTIPLE-LINES"),
    ambiguous: origin("PC-V2-AMBIGUOUS"),
    missing: origin("PC-V2-MISSING"),
    classified: origin("PC-V2-CLASSIFIED"),
  };

  const seeded = new Map<string, RevisionFixture>();
  let retentionRevision: RevisionFixture;

  function origin(claimNumber: string): OriginFixture {
    return { id: randomUUID(), claimNumber };
  }

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seedIdentity();
    await seedClaims();
    await seedTaxRates(connectionId, tenantId);
    await seedOrigins();
    retentionRevision = await seedRetentionRevision();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function seedIdentity() {
    for (const [id, email] of [
      [actorId, `gst-phase1-${actorId}@example.test`],
      [otherActorId, `gst-phase1-${otherActorId}@example.test`],
    ]) {
      await client.query(
        `insert into auth.users(
           id, instance_id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_app_meta_data, raw_user_meta_data
         ) values (
           $1, '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', $2, '', now(),
           '{}'::jsonb, '{}'::jsonb
         )`,
        [id, email],
      );
    }
    await client.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[actorId, otherActorId]],
    );
    await client.query(
      `insert into public.organizations(id, name, created_by)
       values ($1, 'Retention GST Phase 1', $2),
              ($3, 'Retention GST Other', $4)`,
      [organizationId, actorId, otherOrganizationId, otherActorId],
    );
    await client.query(
      `insert into public.organization_members(
         organization_id, user_id, role, display_name
       ) values ($1, $2, 'owner', 'Phase 1 Owner'),
                ($3, $4, 'owner', 'Other Owner')`,
      [organizationId, actorId, otherOrganizationId, otherActorId],
    );
    await client.query(
      `insert into public.organization_clients(
         id, organization_id, created_by, name, company_name
       ) values ($1, $2, $3, 'Phase 1 Client', 'Phase 1 Client Ltd'),
                ($4, $5, $6, 'Other Client', 'Other Client Ltd')`,
      [
        clientId, organizationId, actorId,
        otherClientId, otherOrganizationId, otherActorId,
      ],
    );
    await client.query(
      `insert into public.organization_projects(
         id, organization_id, created_by, name, slug, project_code, client_id
       ) values ($1, $2, $3, 'GST Phase 1 Project', $4, 'GST-V2', $5),
                ($6, $7, $8, 'Other Project', $9, 'OTHER-V2', $10)`,
      [
        projectId, organizationId, actorId, `gst-v2-${projectId}`, clientId,
        otherProjectId, otherOrganizationId, otherActorId,
        `gst-v2-other-${otherProjectId}`, otherClientId,
      ],
    );
    for (const [id, orgId, tenant, userId] of [
      [connectionId, organizationId, tenantId, actorId],
      [otherConnectionId, otherOrganizationId, otherTenantId, otherActorId],
    ]) {
      await client.query(
        `insert into public.organization_xero_connections(
           id, organization_id, status, tenant_id, tenant_name, tenant_type,
           tenant_connection_id, scope, connected_by_user_id
         ) values ($1, $2, 'connected', $3, 'Phase 1 Xero', 'ORGANISATION',
           $4, array['accounting.invoices']::text[], $5)`,
        [id, orgId, tenant, randomUUID(), userId],
      );
    }
  }

  async function seedClaims() {
    for (const fixture of Object.values(origins)) {
      await client.query(
        `insert into public.project_claims(
           id, organization_id, project_id, created_by, claim_number,
           claim_title, status, claim_date, due_date, claim_amount,
           retention_percent, retention_method, retention_withheld_amount,
           retention_released_amount, retention_held_to_date,
           retention_released_to_date, retention_balance, net_claim_excl_gst,
           gst_amount, total_payable
         ) values (
           $1, $2, $3, $4, $5, $5, 'Draft', '2026-08-01', '2026-08-31',
           10000, 10, 'sliding_scale', 1000, 0, 1000, 0, 1000,
           9000, 1350, 10350
         )`,
        [fixture.id, organizationId, projectId, actorId, fixture.claimNumber],
      );
    }
    await client.query(
      `insert into public.retention_claims(
         id, organization_id, project_id, claim_number, title, issue_date,
         due_date, status, subtotal_excl_tax, submission_state_hash,
         submitted_by, submitted_at, created_by, master_role
       ) values (
         $1, $2, $3, 'RC-GST-V2', 'GST Phase 1 Retention Claim',
         '2026-08-01', '2026-08-31', 'submitted', 12000, $4, $5, now(), $5,
         'master_retention_claim'
       )`,
      [retentionClaimId, organizationId, projectId, hash, actorId],
    );
    await client.query(
      `update public.project_claims set status = 'Submitted'
       where organization_id = $1 and project_id = $2`,
      [organizationId, projectId],
    );
  }

  async function seedTaxRates(targetConnectionId: string, targetTenantId: string) {
    for (const [taxType, rate] of [
      ["OUTPUT2", 15],
      ["NONE", 0],
      ["ZERORATED", 0],
    ] as const) {
      await client.query(
        `insert into public.organization_accounting_tax_rates(
           id, organization_id, provider, external_id, name, display_name,
           effective_rate, tax_type, status, is_active, metadata,
           accounting_connection_id, tenant_id, created_by_user_id, synced_at
         ) values (
           $1, $2, 'xero', $3, $3, $3, $4, $3, 'ACTIVE', true,
           '{"canApplyToRevenue":true,"canApplyToAssets":true}'::jsonb,
           $5, $6, $7, now()
         )`,
        [
          randomUUID(), organizationId, taxType, rate,
          targetConnectionId, targetTenantId, actorId,
        ],
      );
    }
  }

  async function seedOrigins() {
    seeded.set(origins.initial.id, await seedPaymentRevision(origins.initial, {
      taxType: "OUTPUT2",
    }));
    seeded.set(origins.none.id, await seedPaymentRevision(origins.none, {
      taxType: "NONE",
      taxMinor: 0,
      effectiveRate: 0,
    }));
    seeded.set(origins.zeroRated.id, await seedPaymentRevision(origins.zeroRated, {
      taxType: "ZERORATED",
      taxMinor: 0,
      effectiveRate: 0,
    }));
    seeded.set(origins.noLine.id, await seedPaymentRevision(origins.noLine, {
      includeLine: false,
    }));
    seeded.set(origins.multipleLines.id, await seedPaymentRevision(
      origins.multipleLines,
      { lineCount: 2 },
    ));

    const updatedInitial = await seedPaymentRevision(origins.updated, {
      taxType: "NONE",
      taxMinor: 0,
      effectiveRate: 0,
    });
    const updated = await addRevision(origins.updated, updatedInitial.documentId, {
      sequence: 2,
      previousRevisionId: updatedInitial.revisionId,
      intent: "direct_update",
      strategy: "update_existing",
      taxType: "OUTPUT2",
      taxMinor: -15000,
      effectiveRate: 15,
    });
    await activateRevision(updatedInitial.documentId, updated.revisionId);
    seeded.set(origins.updated.id, updated);

    const replacementInitial = await seedPaymentRevision(origins.replacement, {
      taxType: "NONE",
      taxMinor: 0,
      effectiveRate: 0,
    });
    const replacement = await addRevision(
      origins.replacement,
      replacementInitial.documentId,
      {
        sequence: 2,
        previousRevisionId: replacementInitial.revisionId,
        intent: "replacement",
        strategy: "replacement",
        taxType: "OUTPUT2",
        taxMinor: -15000,
        effectiveRate: 15,
        numberReservationId: await reserveNumber(
          replacementInitial.documentId,
          origins.replacement,
          `${origins.replacement.claimNumber}-R1`,
        ),
        invoiceNumber: `${origins.replacement.claimNumber}-R1`,
      },
    );
    await activateRevision(replacementInitial.documentId, replacement.revisionId);
    seeded.set(origins.replacement.id, replacement);

    const pendingInitial = await seedPaymentRevision(origins.pending, {});
    await addRevision(origins.pending, pendingInitial.documentId, {
      sequence: 2,
      previousRevisionId: pendingInitial.revisionId,
      intent: "direct_update",
      strategy: "update_existing",
      lifecycle: "confirmed",
    });
    seeded.set(origins.pending.id, pendingInitial);

    const failedInitial = await seedPaymentRevision(origins.failed, {});
    await addRevision(origins.failed, failedInitial.documentId, {
      sequence: 2,
      previousRevisionId: failedInitial.revisionId,
      intent: "direct_update",
      strategy: "update_existing",
      lifecycle: "failed",
    });
    seeded.set(origins.failed.id, failedInitial);

    seeded.set(
      origins.ambiguous.id,
      await seedPaymentRevision(origins.ambiguous, {}),
    );

    await insertClassification(origins.classified, {
      evidenceKind: "reviewed_classification",
      taxType: "ZERORATED",
      effectiveRateBasisPoints: 0,
      taxMinor: 0,
    });
  }

  async function seedPaymentRevision(
    fixture: OriginFixture,
    options: {
      connectionId?: string;
      tenantId?: string;
      taxType?: string;
      taxMinor?: number;
      effectiveRate?: number;
      includeLine?: boolean;
      lineCount?: number;
    },
  ): Promise<RevisionFixture> {
    const documentId = randomUUID();
    const targetConnectionId = options.connectionId ?? connectionId;
    const targetTenantId = options.tenantId ?? tenantId;
    await client.query(
      `insert into public.organization_accounting_documents(
         id, organization_id, accounting_connection_id, provider, tenant_id,
         local_document_type, local_document_id, project_claim_id,
         export_status, external_document_id, external_document_number,
         integration_contract
       ) values (
         $1, $2, $3, 'xero', $4, 'project_claim', null, $5,
         'exported', $6, $7, 'payment_claim_revision_v1'
       )`,
      [
        documentId, organizationId, targetConnectionId, targetTenantId,
        fixture.id, `invoice-${randomUUID()}`, fixture.claimNumber,
      ],
    );
    const revision = await addRevision(fixture, documentId, {
      sequence: 1,
      previousRevisionId: null,
      intent: "initial_push",
      strategy: "new_document",
      connectionId: targetConnectionId,
      tenantId: targetTenantId,
      taxType: options.taxType,
      taxMinor: options.taxMinor,
      effectiveRate: options.effectiveRate,
      includeLine: options.includeLine,
      lineCount: options.lineCount,
    });
    await activateRevision(documentId, revision.revisionId);
    return revision;
  }

  async function addRevision(
    fixture: OriginFixture,
    documentId: string,
    options: {
      sequence: number;
      previousRevisionId: string | null;
      intent: "initial_push" | "direct_update" | "replacement";
      strategy: "new_document" | "update_existing" | "replacement";
      connectionId?: string;
      tenantId?: string;
      taxType?: string;
      taxMinor?: number;
      effectiveRate?: number;
      lifecycle?: "succeeded" | "confirmed" | "failed";
      numberReservationId?: string | null;
      invoiceNumber?: string;
      includeLine?: boolean;
      lineCount?: number;
    },
  ): Promise<RevisionFixture> {
    const revisionId = randomUUID();
    const lifecycle = options.lifecycle ?? "succeeded";
    const targetConnectionId = options.connectionId ?? connectionId;
    const targetTenantId = options.tenantId ?? tenantId;
    const taxType = options.taxType ?? "OUTPUT2";
    const taxMinor = options.taxMinor ?? -15000;
    const effectiveRate = options.effectiveRate ?? 15;
    const invoiceNumber = options.invoiceNumber ?? fixture.claimNumber;
    await client.query(
      `insert into public.organization_accounting_document_revisions(
         id, organization_id, project_id, accounting_document_id,
         revision_sequence, source_document_type, source_document_id,
         revision_intent, resolution_strategy, previous_revision_id,
         provider, connection_id, tenant_id, number_reservation_id,
         external_document_id, external_document_number, commercial_snapshot,
         contact_snapshot, routing_snapshot, tax_snapshot, attachment_snapshot,
         payload_snapshot, canonical_schema_version, source_evidence_hash,
         commercial_hash, lines_hash, payload_hash, provider_content_hash,
         currency_code, provider_document_type, requested_provider_status,
         line_amount_type, subtotal_minor, tax_minor, total_minor,
         confirmation_preview_hash, confirmed_by, confirmed_at,
         lifecycle_state, succeeded_at, created_at
       ) values (
         $1, $2, $3, $4, $5, 'project_claim', $6, $7, $8, $9,
         'xero', $10, $11, $12, $13, $14,
         '{}'::jsonb, '{}'::jsonb,
         jsonb_build_object('retention', jsonb_build_object(
           'route', 700, 'accountId', 'retention-account',
           'accountCode', '700'
         )),
         jsonb_build_object(
           'taxRateId', $15::text, 'taxType', $16::text,
           'effectiveRate', $17::numeric
         ),
         '{}'::jsonb, '{}'::jsonb, 'accounting-canonical-v1',
         $18, $18, $18, $18, $18, 'NZD', 'ACCREC', 'AUTHORISED',
         'Exclusive', 900000, 135000, 1035000, $18, $19,
         '2026-08-01T00:00:00Z', $20,
         case when $20 = 'succeeded' then '2026-08-01T00:01:00Z'::timestamptz end,
         '2026-08-01T00:00:00Z'
       )`,
      [
        revisionId, organizationId, projectId, documentId, options.sequence,
        fixture.id, options.intent, options.strategy, options.previousRevisionId,
        targetConnectionId, targetTenantId, options.numberReservationId ?? null,
        `invoice-${documentId}`, invoiceNumber, randomUUID(), taxType,
        effectiveRate, hash, actorId, lifecycle,
      ],
    );

    let firstLineId: string | null = null;
    if (options.includeLine !== false) {
      for (let sequence = 1; sequence <= (options.lineCount ?? 1); sequence += 1) {
        const lineId = randomUUID();
        firstLineId ??= lineId;
        await client.query(
          `insert into public.organization_accounting_revision_lines(
             id, organization_id, accounting_revision_id, sequence, line_kind,
             source_line_type, source_line_id, originating_payment_claim_id,
             description, quantity, unit_amount_minor, line_amount_minor,
             tax_minor, total_minor, account_snapshot, tax_snapshot,
             tracking_snapshot, source_snapshot
           ) values (
             $1, $2, $3, $4, 'retention', 'payment_claim', null, $5,
             'Retention withheld', 1, -100000, -100000, $6::bigint,
             -100000::bigint + $6::bigint, '{"accountCode":"700"}'::jsonb,
             jsonb_build_object('taxType', $7::text), '{}'::jsonb, '{}'::jsonb
           )`,
          [
            lineId, organizationId, revisionId, sequence, fixture.id,
            taxMinor, taxType,
          ],
        );
      }
    }
    return { documentId, revisionId, lineId: firstLineId };
  }

  async function activateRevision(documentId: string, revisionId: string) {
    await client.query(
      "select set_config('app.accounting_phase2a_pointer_write', 'true', true)",
    );
    await client.query(
      `update public.organization_accounting_documents
       set active_accounting_revision_id = $2
       where id = $1`,
      [documentId, revisionId],
    );
  }

  async function reserveNumber(
    documentId: string,
    fixture: OriginFixture,
    invoiceNumber: string,
  ) {
    const id = randomUUID();
    await client.query(
      `insert into public.organization_accounting_number_reservations(
         id, organization_id, provider, tenant_id, document_class,
         sequence_number, formatted_number, accounting_document_id,
         source_document_type, source_document_id, reservation_reason,
         reserved_by
       ) values (
         $1, $2, 'xero', $3, 'sales_invoice', 900001, $4, $5,
         'project_claim', $6, 'Phase 1 replacement fixture', $7
       )`,
      [id, organizationId, tenantId, invoiceNumber, documentId, fixture.id, actorId],
    );
    return id;
  }

  async function seedRetentionRevision(): Promise<RevisionFixture> {
    const documentId = randomUUID();
    const reservationId = randomUUID();
    const revisionId = randomUUID();
    const lineId = randomUUID();
    await client.query(
      `insert into public.organization_accounting_documents(
         id, organization_id, accounting_connection_id, provider, tenant_id,
         local_document_type, local_document_id, retention_claim_id,
         export_status, integration_contract
       ) values (
         $1, $2, $3, 'xero', $4, 'retention_claim', null, $5,
         'queued', 'retention_claim_revision_v1'
       )`,
      [documentId, organizationId, connectionId, tenantId, retentionClaimId],
    );
    await client.query(
      `insert into public.organization_accounting_number_reservations(
         id, organization_id, provider, tenant_id, document_class,
         sequence_number, formatted_number, accounting_document_id,
         source_document_type, source_document_id, reservation_reason,
         reserved_by
       ) values (
         $1, $2, 'xero', $3, 'sales_invoice', 900002, 'RC-GST-V2', $4,
         'retention_claim', $5, 'Phase 1 Retention fixture', $6
       )`,
      [reservationId, organizationId, tenantId, documentId, retentionClaimId, actorId],
    );
    await client.query(
      `insert into public.organization_accounting_document_revisions(
         id, organization_id, project_id, accounting_document_id,
         revision_sequence, source_document_type, source_document_id,
         revision_intent, resolution_strategy, provider, connection_id,
         tenant_id, number_reservation_id, external_document_number,
         commercial_snapshot, contact_snapshot, routing_snapshot, tax_snapshot,
         attachment_snapshot, payload_snapshot, canonical_schema_version,
         source_evidence_hash, commercial_hash, lines_hash, payload_hash,
         provider_content_hash, currency_code, provider_document_type,
         requested_provider_status, line_amount_type, subtotal_minor, tax_minor,
         total_minor, confirmation_preview_hash, confirmed_by, confirmed_at,
         lifecycle_state, created_at
       ) values (
         $1, $2, $3, $4, 1, 'retention_claim', $5, 'initial_push',
         'new_document', 'xero', $6, $7, $8, 'RC-GST-V2',
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
         '{}'::jsonb, 'accounting-canonical-v1', $9, $9, $9, $9, $9,
         'NZD', 'ACCREC', 'AUTHORISED', 'Exclusive', 100000, 15000, 115000,
         $9, $10, '2026-08-01T00:00:00Z', 'confirmed',
         '2026-08-01T00:00:00Z'
       )`,
      [
        revisionId, organizationId, projectId, documentId, retentionClaimId,
        connectionId, tenantId, reservationId, hash, actorId,
      ],
    );
    await client.query(
      `insert into public.organization_accounting_revision_lines(
         id, organization_id, accounting_revision_id, sequence, line_kind,
         source_line_type, source_line_id, originating_payment_claim_id,
         description, quantity, unit_amount_minor, line_amount_minor, tax_minor,
         total_minor, account_snapshot, tax_snapshot, tracking_snapshot,
         source_snapshot
       ) values (
         $1, $2, $3, 1, 'retention', 'payment_claim_retention', $4, $4,
         'Retention release', 1, 100000, 100000, 15000, 115000,
         '{"accountCode":"700"}'::jsonb, '{"taxType":"OUTPUT2"}'::jsonb,
         '{}'::jsonb, '{}'::jsonb
       )`,
      [lineId, organizationId, revisionId, origins.initial.id],
    );
    return { documentId, revisionId, lineId };
  }

  async function insertClassification(
    fixture: OriginFixture,
    options: {
      id?: string;
      sequence?: number;
      supersedes?: string | null;
      evidenceKind: "submission_snapshot" | "reviewed_classification";
      taxType: string;
      effectiveRateBasisPoints: number;
      taxMinor: number;
      organizationId?: string;
      projectId?: string;
      connectionId?: string;
      tenantId?: string;
      reviewedBy?: string;
    },
  ) {
    const id = options.id ?? randomUUID();
    await client.query(
      `insert into public.organization_retention_tax_classifications_v2(
         id, organization_id, project_id, originating_payment_claim_id,
         xero_connection_id, tenant_id, currency_code, tax_type,
         effective_rate_basis_points, tax_rate_snapshot_id,
         tax_rate_name_snapshot, origin_retained_amount_minor,
         origin_retained_tax_minor, origin_retained_total_minor, evidence_kind,
         evidence_reference, classification_reason, evidence_snapshot,
         evidence_hash, reviewed_by, schema_version, classification_sequence,
         supersedes_classification_id
       ) values (
         $1, $2, $3, $4, $5, $6, 'NZD', $7, $8, $9, $7, -100000,
         $10::bigint, -100000::bigint + $10::bigint, $11,
         'reviewed-fixture', 'Phase 1 test review',
         '{"accountCode":"700"}'::jsonb, $12, $13, 2, $14, $15
       )`,
      [
        id, options.organizationId ?? organizationId,
        options.projectId ?? projectId, fixture.id,
        options.connectionId ?? connectionId, options.tenantId ?? tenantId,
        options.taxType, options.effectiveRateBasisPoints, randomUUID(),
        options.taxMinor, options.evidenceKind, hash,
        options.reviewedBy ?? actorId, options.sequence ?? 1,
        options.supersedes ?? null,
      ],
    );
    return id;
  }

  async function sourceV2() {
    const result = await client.query<{ source: {
      allocations: Array<Record<string, unknown>>;
    } }>(
      "select private.master_retention_claim_source_v2($1) source",
      [retentionClaimId],
    );
    return result.rows[0].source;
  }

  async function allocation(originId: string) {
    const source = await sourceV2();
    return source.allocations.find(
      (row) => row.originatingPaymentClaimId === originId,
    );
  }

  async function insertLedger(options: {
    id?: string;
    origin?: OriginFixture;
    originRevision?: RevisionFixture;
    amount?: number;
    tax?: number;
    total?: number;
    state?: "pending" | "reserved" | "completed" | "cancelled" | "superseded";
    rootId?: string;
    reservationSequence?: number;
    supersedes?: string | null;
    allocationId?: string;
  } = {}) {
    const id = options.id ?? randomUUID();
    const originFixture = options.origin ?? origins.initial;
    const originRevision = options.originRevision ?? seeded.get(originFixture.id)!;
    const amount = options.amount ?? 100000;
    const tax = options.tax ?? 15000;
    const total = options.total ?? amount + tax;
    const rootId = options.rootId ?? id;
    const originEvidence = await client.query<{
      tax_type: string;
      tax_rate_snapshot_id: string;
      effective_rate_basis_points: number;
    }>(
      `select
         line.tax_snapshot->>'taxType' tax_type,
         revision.tax_snapshot->>'taxRateId' tax_rate_snapshot_id,
         round((revision.tax_snapshot->>'effectiveRate')::numeric * 100)::integer
           effective_rate_basis_points
       from public.organization_accounting_document_revisions revision
       join public.organization_accounting_revision_lines line
         on line.id = $2 and line.accounting_revision_id = revision.id
       where revision.id = $1`,
      [originRevision.revisionId, originRevision.lineId],
    );
    const retentionLineId = randomUUID();
    await client.query(
      `insert into public.organization_accounting_revision_lines(
         id, organization_id, accounting_revision_id, sequence, line_kind,
         source_line_type, source_line_id, originating_payment_claim_id,
         description, quantity, unit_amount_minor, line_amount_minor, tax_minor,
         total_minor, account_snapshot, tax_snapshot, tracking_snapshot,
         source_snapshot
       ) select
         $1, $2, $3, coalesce(max(sequence), 0) + 1, 'retention',
         'payment_claim_retention', $4, $4, 'Retention release evidence',
         1, $5, $5, $6, $7, '{"accountCode":"700"}'::jsonb,
         jsonb_build_object('taxType', $8::text), '{}'::jsonb, '{}'::jsonb
       from public.organization_accounting_revision_lines
       where accounting_revision_id = $3`,
      [
        retentionLineId, organizationId, retentionRevision.revisionId,
        originFixture.id, amount, tax, total,
        originEvidence.rows[0].tax_type,
      ],
    );
    await client.query(
      `insert into public.organization_retention_release_allocation_ledger_v2(
         id, organization_id, project_id, retention_claim_id,
         xero_connection_id, tenant_id, currency_code,
         retention_accounting_document_id, retention_accounting_revision_id,
         retention_accounting_revision_line_id, originating_payment_claim_id,
         origin_accounting_document_id, origin_accounting_revision_id,
         origin_accounting_revision_line_id, allocation_id,
         allocation_sequence, evidence_kind, tax_type, tax_rate_snapshot_id,
         effective_rate_basis_points, origin_account_code_snapshot,
         origin_retained_amount_minor, origin_retained_tax_minor,
         origin_retained_total_minor, released_amount_minor,
         released_tax_minor, released_total_minor, reservation_state,
         reservation_root_id, reservation_sequence, supersedes_ledger_id,
         replacement_root_accounting_document_id, actor_user_id,
         evidence_snapshot, evidence_hash, schema_version
       ) values (
         $1, $2, $3, $4, $5, $6, 'NZD', $7, $8, $9, $10,
         $11, $12, $13, $14, 1, 'immutable_revision', $15, $16,
         $17, '700', -100000, $18::bigint,
         -100000::bigint + $18::bigint, $19::bigint, $20::bigint,
         $21::bigint, $22,
         $23, $24, $25, $7, $26, '{}'::jsonb, $27, 2
       )`,
      [
        id, organizationId, projectId, retentionClaimId, connectionId,
        tenantId, retentionRevision.documentId, retentionRevision.revisionId,
        retentionLineId, originFixture.id, originRevision.documentId,
        originRevision.revisionId, originRevision.lineId,
        options.allocationId ?? originFixture.id,
        originEvidence.rows[0].tax_type,
        originEvidence.rows[0].tax_rate_snapshot_id,
        originEvidence.rows[0].effective_rate_basis_points,
        originEvidence.rows[0].tax_type === "OUTPUT2" ? -15000 : 0,
        amount, tax, total, options.state ?? "completed", rootId,
        options.reservationSequence ?? 1, options.supersedes ?? null, actorId,
        hash,
      ],
    );
    return id;
  }

  async function expectDatabaseFailure(
    run: () => Promise<unknown>,
    code = "23514",
  ) {
    const savepoint = `sp_${randomUUID().replaceAll("-", "")}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      await expect(run()).rejects.toMatchObject({ code });
    } finally {
      await client.query(`rollback to savepoint ${savepoint}`);
    }
  }

  const expectConstraintFailure = (run: () => Promise<unknown>) =>
    expectDatabaseFailure(run, "23514");

  it("resolves active initial OUTPUT2 evidence from the immutable line", async () => {
    await expect(allocation(origins.initial.id)).resolves.toMatchObject({
      status: "resolved",
      evidenceKind: "immutable_revision",
      taxType: "OUTPUT2",
      effectiveRateBasisPoints: 1500,
      originAmountMinor: -100000,
      originTaxMinor: -15000,
      originTotalMinor: -115000,
    });
  });

  it("selects the active successful update instead of its initial revision", async () => {
    await expect(allocation(origins.updated.id)).resolves.toMatchObject({
      status: "resolved",
      effectiveOriginRevisionId: seeded.get(origins.updated.id)!.revisionId,
      taxType: "OUTPUT2",
    });
  });

  it("selects the active replacement and reports predecessor lineage", async () => {
    const result = await allocation(origins.replacement.id);
    expect(result).toMatchObject({
      status: "resolved",
      effectiveOriginRevisionId: seeded.get(origins.replacement.id)!.revisionId,
      taxType: "OUTPUT2",
    });
    expect(result?.originPredecessorRevisionId).toBeTruthy();
  });

  it("excludes pending and failed successor revisions", async () => {
    await expect(allocation(origins.pending.id)).resolves.toMatchObject({
      status: "resolved",
      effectiveOriginRevisionId: seeded.get(origins.pending.id)!.revisionId,
    });
    await expect(allocation(origins.failed.id)).resolves.toMatchObject({
      status: "resolved",
      effectiveOriginRevisionId: seeded.get(origins.failed.id)!.revisionId,
    });
  });

  it("prevents multiple terminals and retains a defensive ambiguity blocker", async () => {
    await expectDatabaseFailure(
      () => client.query(
        `insert into public.organization_xero_connections(
           id, organization_id, status, tenant_id, tenant_name, tenant_type,
           tenant_connection_id, scope, connected_by_user_id
         ) values ($1, $2, 'connected', $3, 'Second Phase 1 Xero',
           'ORGANISATION', $4, array['accounting.invoices']::text[], $5)`,
        [secondConnectionId, organizationId, secondTenantId, randomUUID(), actorId],
      ),
      "23505",
    );
    const definition = await client.query<{ definition: string }>(
      `select pg_get_functiondef(
         'private.master_retention_claim_source_v2(uuid)'::regprocedure
       ) definition`,
    );
    expect(definition.rows[0].definition).toContain(
      "v_document_count > 1",
    );
    expect(definition.rows[0].definition).toContain(
      "origin_revision_ambiguous",
    );
  });

  it("blocks a missing effective revision", async () => {
    await expect(allocation(origins.missing.id)).resolves.toMatchObject({
      status: "blocked",
      blockerCode: "origin_revision_missing",
    });
  });

  it("blocks zero or multiple matching origin retention lines", async () => {
    await expect(allocation(origins.noLine.id)).resolves.toMatchObject({
      status: "blocked",
      blockerCode: "origin_retention_line_missing",
    });
    await expect(allocation(origins.multipleLines.id)).resolves.toMatchObject({
      status: "blocked",
      blockerCode: "origin_retention_line_ambiguous",
    });
  });

  it("preserves NONE and ZERORATED as distinct historical identities", async () => {
    await expect(allocation(origins.none.id)).resolves.toMatchObject({
      status: "resolved",
      taxType: "NONE",
      originTaxMinor: 0,
    });
    await expect(allocation(origins.zeroRated.id)).resolves.toMatchObject({
      status: "resolved",
      taxType: "ZERORATED",
      originTaxMinor: 0,
    });
  });

  it("does not let account 700 defaults or tax-row order override history", async () => {
    const before = await allocation(origins.initial.id);
    await client.query(
      `update public.organization_accounting_tax_rates
       set metadata = metadata || '{"sortHint":-999}'::jsonb
       where organization_id = $1 and tax_type = 'NONE'`,
      [organizationId],
    );
    const after = await allocation(origins.initial.id);
    expect(before?.taxType).toBe("OUTPUT2");
    expect(after?.taxType).toBe("OUTPUT2");
    expect(after?.evidenceHash).toBe(before?.evidenceHash);
  });

  it("blocks when the exact historical TaxType is no longer available", async () => {
    await client.query("savepoint archived_tax_type");
    try {
      await client.query(
        `update public.organization_accounting_tax_rates
         set is_active = false, status = 'DELETED'
         where organization_id = $1 and tax_type = 'OUTPUT2'`,
        [organizationId],
      );
      await expect(allocation(origins.initial.id)).resolves.toMatchObject({
        status: "blocked",
        blockerCode: "origin_tax_type_unavailable",
        taxType: "OUTPUT2",
      });
    } finally {
      await client.query("rollback to savepoint archived_tax_type");
    }
  });

  it("resolves an explicit reviewed classification without inference", async () => {
    await expect(allocation(origins.classified.id)).resolves.toMatchObject({
      status: "resolved",
      evidenceKind: "reviewed_classification",
      taxType: "ZERORATED",
      originTaxMinor: 0,
    });
  });

  it("requires classification supersession and keeps prior rows immutable", async () => {
    const first = await client.query<{ id: string }>(
      `select id from public.organization_retention_tax_classifications_v2
       where originating_payment_claim_id = $1`,
      [origins.classified.id],
    );
    const secondId = await insertClassification(origins.classified, {
      sequence: 2,
      supersedes: first.rows[0].id,
      evidenceKind: "reviewed_classification",
      taxType: "NONE",
      effectiveRateBasisPoints: 0,
      taxMinor: 0,
    });
    expect(secondId).not.toBe(first.rows[0].id);
    await expect(allocation(origins.classified.id)).resolves.toMatchObject({
      status: "resolved",
      taxType: "NONE",
    });
    await expectDatabaseFailure(
      () => client.query(
        `update public.organization_retention_tax_classifications_v2
         set classification_reason = 'mutated' where id = $1`,
        [secondId],
      ),
      "55000",
    );
  });

  it("rejects cross-organization classification scope", async () => {
    await expectConstraintFailure(() => insertClassification(origins.initial, {
      organizationId: otherOrganizationId,
      projectId: otherProjectId,
      connectionId: otherConnectionId,
      tenantId: otherTenantId,
      reviewedBy: otherActorId,
      evidenceKind: "reviewed_classification",
      taxType: "NONE",
      effectiveRateBasisPoints: 0,
      taxMinor: 0,
    }));
  });

  it("does not expose one organization's v2 evidence to another organization", async () => {
    await client.query("set local role authenticated");
    try {
      await client.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [otherActorId],
      );
      await client.query(
        "select set_config('request.jwt.claim.role', 'authenticated', true)",
      );
      const visible = await client.query<{ count: string }>(
        `select count(*)::text count
         from public.organization_retention_tax_classifications_v2
         where organization_id = $1`,
        [organizationId],
      );
      expect(visible.rows[0].count).toBe("0");
    } finally {
      await client.query("reset role");
      await client.query(
        "select set_config('request.jwt.claim.role', 'service_role', true)",
      );
    }
  });

  it("accepts valid taxed and zero-tax release evidence", async () => {
    await expect(insertLedger()).resolves.toBeTruthy();
    await expect(insertLedger({
      origin: origins.none,
      originRevision: seeded.get(origins.none.id),
      tax: 0,
      total: 100000,
    })).resolves.toBeTruthy();
  });

  it("rejects wrong signs, totals, and aggregate over-release", async () => {
    await expectConstraintFailure(() => insertLedger({
      origin: origins.zeroRated,
      originRevision: seeded.get(origins.zeroRated.id),
      amount: 1000,
      tax: -150,
      total: 850,
    }));
    await expectConstraintFailure(() => insertLedger({
      origin: origins.zeroRated,
      originRevision: seeded.get(origins.zeroRated.id),
      amount: 1000,
      tax: 0,
      total: 999,
    }));
    await expectConstraintFailure(() => insertLedger({ amount: 1, tax: 0, total: 1 }));
  });

  it("keeps completed release rows append-only", async () => {
    const id = await insertLedger({
      origin: origins.updated,
      originRevision: seeded.get(origins.updated.id),
      amount: 50000,
      tax: 7500,
      total: 57500,
    });
    await expectDatabaseFailure(
      () => client.query(
        `update public.organization_retention_release_allocation_ledger_v2
         set released_amount_minor = 40000 where id = $1`,
        [id],
      ),
      "55000",
    );
    await expectDatabaseFailure(
      () => client.query(
        `delete from public.organization_retention_release_allocation_ledger_v2
         where id = $1`,
        [id],
      ),
      "55000",
    );
  });

  it("uses leaf reservation evidence so superseded states do not double count", async () => {
    const rootId = randomUUID();
    await insertLedger({
      id: rootId,
      origin: origins.replacement,
      originRevision: seeded.get(origins.replacement.id),
      amount: 40000,
      tax: 6000,
      total: 46000,
      state: "completed",
      rootId,
      allocationId: origins.replacement.id,
    });
    const replacementId = await insertLedger({
      origin: origins.replacement,
      originRevision: seeded.get(origins.replacement.id),
      amount: 60000,
      tax: 9000,
      total: 69000,
      state: "completed",
      rootId,
      reservationSequence: 2,
      supersedes: rootId,
      allocationId: origins.replacement.id,
    });
    expect(replacementId).toBeTruthy();
    await expect(allocation(origins.replacement.id)).resolves.toMatchObject({
      releasedToDateAmountMinor: 60000,
      releasedToDateTaxMinor: 9000,
    });
  });

  it("leaves v1 output, confirmations, queues, and dormant tables untouched", async () => {
    const v1Before = await client.query<{ source: unknown }>(
      "select private.master_retention_claim_source($1) source",
      [retentionClaimId],
    );
    const jobsBefore = await client.query<{ count: string }>(
      "select count(*)::text count from public.organization_accounting_sync_jobs",
    );
    await sourceV2();
    const v1After = await client.query<{ source: unknown }>(
      "select private.master_retention_claim_source($1) source",
      [retentionClaimId],
    );
    const state = await client.query<{
      jobs: string;
      proposals: string;
    }>(
      `select
         (select count(*)::text from public.organization_accounting_sync_jobs) jobs,
         (select count(*)::text from public.organization_accounting_push_proposals) proposals`,
    );
    expect(v1After.rows[0].source).toEqual(v1Before.rows[0].source);
    expect(state.rows[0].jobs).toBe(jobsBefore.rows[0].count);
    expect(state.rows[0].proposals).toBe("0");
  });
});
