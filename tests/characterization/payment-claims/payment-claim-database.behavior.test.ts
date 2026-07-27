import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FLAT_FIRST_CLAIM_EXPECTED,
  FLAT_SOURCE_LINES,
  FULL_REMAINING_SOURCE_LINES,
  PHASE0_ORGANIZATION_ID,
  PHASE0_OTHER_ORGANIZATION_ID,
  PHASE0_OTHER_USER_ID,
  PHASE0_PROJECT_IDS,
  PHASE0_SOURCE_IDS,
  PHASE0_USER_ID,
  SLIDING_RETENTION_BANDS,
} from "../../fixtures/payment-claims/phase0-payment-claim-fixtures";

const dbUrl = process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

type ClaimRow = {
  id: string;
  claim_number: string;
  status: string;
  updated_at: Date | string;
  claim_amount: string;
  previous_claims_total: string;
  percent_complete: string;
  retention_method: string;
  retention_withheld_amount: string;
  retention_released_amount: string;
  retention_held_to_date: string;
  retention_released_to_date: string;
  retention_balance: string;
  net_claim_excl_gst: string;
  gst_amount: string;
  total_payable: string;
};

describeDatabase("Payment Claim database behavior (local Supabase)", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seedIdentityAndTenants();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId = PHASE0_USER_ID) {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  }

  async function seedIdentityAndTenants() {
    await client.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values
        ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'phase0-payment-claims@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
        ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'phase0-payment-claims-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb)`,
      [PHASE0_USER_ID, PHASE0_OTHER_USER_ID],
    );
    // The existing auth-user trigger creates one default organization per user.
    // Replace those trigger-created rows so every fixture identity remains fixed.
    await client.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[PHASE0_USER_ID, PHASE0_OTHER_USER_ID]],
    );
    await client.query(
      `insert into public.organizations (id, name, created_by)
       values ($1, 'Phase 0 Payment Claims', $3), ($2, 'Phase 0 Other Tenant', $4)`,
      [PHASE0_ORGANIZATION_ID, PHASE0_OTHER_ORGANIZATION_ID, PHASE0_USER_ID, PHASE0_OTHER_USER_ID],
    );
    await client.query(
      `insert into public.organization_members (organization_id, user_id, role, display_name)
       values ($1, $3, 'owner', 'Phase 0 Owner'), ($2, $4, 'owner', 'Other Owner')`,
      [PHASE0_ORGANIZATION_ID, PHASE0_OTHER_ORGANIZATION_ID, PHASE0_USER_ID, PHASE0_OTHER_USER_ID],
    );
    await asUser();
  }

  async function seedProject(projectId: string, organizationId = PHASE0_ORGANIZATION_ID) {
    const creator = organizationId === PHASE0_ORGANIZATION_ID ? PHASE0_USER_ID : PHASE0_OTHER_USER_ID;
    await client.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code)
       values ($1, $2, $3, $4, $5, $6)`,
      [projectId, organizationId, creator, `Phase 0 ${projectId.slice(-3)}`, `phase-0-${projectId.slice(-3)}`, `P0-${projectId.slice(-3)}`],
    );
  }

  async function seedCommercialSources(projectId: string) {
    await client.query(
      `insert into public.project_quotes
        (id, organization_id, project_id, created_by, quote_title, quote_number, status,
         subtotal, margin_percent, discount_amount, contingency_amount, retention_percent_default)
       values ($1, $2, $3, $4, 'Accepted source quote', 'Q-P0', 'Accepted', 1000.01, 0, 0, 0, 10)`,
      [PHASE0_SOURCE_IDS.quote, PHASE0_ORGANIZATION_ID, projectId, PHASE0_USER_ID],
    );
    await client.query(
      `insert into public.project_quote_line_items
        (id, organization_id, project_id, quote_id, section, description, quantity, unit, rate, total, sort_order)
       values
        ($1, $3, $4, $5, 'Labour', 'Snapshot labour', 1, 'item', 600.01, 600.01, 0),
        ($2, $3, $4, $5, 'Materials', 'Snapshot materials', 1, 'item', 400.00, 400.00, 1)`,
      [
        PHASE0_SOURCE_IDS.quoteLineLabour,
        PHASE0_SOURCE_IDS.quoteLineMaterials,
        PHASE0_ORGANIZATION_ID,
        projectId,
        PHASE0_SOURCE_IDS.quote,
      ],
    );
    await client.query(
      `insert into public.project_variations
        (id, organization_id, project_id, created_by, variation_title, variation_number, status,
         subtotal, margin_percent, discount_amount, contingency_amount)
       values ($1, $2, $3, $4, 'Approved source variation', 'V-P0', 'Approved', 100.00, 0, 0, 0)`,
      [PHASE0_SOURCE_IDS.variation, PHASE0_ORGANIZATION_ID, projectId, PHASE0_USER_ID],
    );
    await client.query(
      `insert into public.project_variation_line_items
        (id, organization_id, project_id, variation_id, section, description, quantity, unit, rate, total, sort_order)
       values ($1, $2, $3, $4, 'Labour', 'Snapshot variation', 1, 'item', 100.00, 100.00, 0)`,
      [
        PHASE0_SOURCE_IDS.variationLine,
        PHASE0_ORGANIZATION_ID,
        projectId,
        PHASE0_SOURCE_IDS.variation,
      ],
    );
  }

  async function createDraft(projectId: string) {
    const result = await client.query<ClaimRow>(
      "select * from public.create_project_claim_draft($1, $2, 'New Claim')",
      [PHASE0_ORGANIZATION_ID, projectId],
    );
    return result.rows[0];
  }

  async function expectDatabaseError(action: () => Promise<unknown>, message: string) {
    await client.query("savepoint phase0_expected_error");
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    if (!caught) {
      await client.query("release savepoint phase0_expected_error");
      throw new Error(`Expected database error containing: ${message}`);
    }
    try {
      await client.query("rollback to savepoint phase0_expected_error");
      await client.query("release savepoint phase0_expected_error");
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain(message);
    } catch (assertionError) {
      throw assertionError;
    }
  }

  async function saveDraft(
    projectId: string,
    claim: Pick<ClaimRow, "id" | "updated_at">,
    options: {
      status?: string;
      claimDate?: string;
      paidAmount?: string;
      retentionMethod?: string;
      retentionBands?: unknown;
      retentionPercent?: string;
      retentionReleased?: string;
      lines?: readonly unknown[];
      expectedUpdatedAt?: Date | string;
    } = {},
  ) {
    const result = await client.query<ClaimRow>(
      `select * from public.save_project_claim_draft(
        $1, $2, $3, $4, 'Characterized claim', 'Progress', $5,
        $6::date, ($6::date + 7), $6::date, ($6::date + 7),
        0, $7, $8, $9::jsonb, $10, $11, '', $12::jsonb
      )`,
      [
        PHASE0_ORGANIZATION_ID,
        projectId,
        claim.id,
        options.expectedUpdatedAt ?? claim.updated_at,
        options.status ?? "Draft",
        options.claimDate ?? "2026-01-01",
        options.paidAmount ?? "0.00",
        options.retentionMethod ?? "flat",
        JSON.stringify(options.retentionBands ?? []),
        options.retentionPercent ?? "10.000",
        options.retentionReleased ?? "0.00",
        JSON.stringify(options.lines ?? FLAT_SOURCE_LINES),
      ],
    );
    return result.rows[0];
  }

  async function readClaim(claimId: string) {
    const result = await client.query<ClaimRow>(
      `select id, claim_number, status, updated_at::text as updated_at, claim_amount, previous_claims_total,
        percent_complete, retention_method, retention_withheld_amount, retention_released_amount,
        retention_held_to_date, retention_released_to_date, retention_balance,
        net_claim_excl_gst, gst_amount, total_payable
       from public.project_claims where id = $1`,
      [claimId],
    );
    return result.rows[0];
  }

  it("creates project-scoped Draft numbers and reuses a deleted Draft number", async () => {
    await seedProject(PHASE0_PROJECT_IDS.numbering);
    const first = await createDraft(PHASE0_PROJECT_IDS.numbering);
    expect(first).toMatchObject({ claim_number: "P0-100-PC-01", status: "Draft" });

    await client.query("select public.delete_project_claim_safe($1, $2, $3)", [
      PHASE0_ORGANIZATION_ID,
      PHASE0_PROJECT_IDS.numbering,
      first.id,
    ]);
    const replacement = await createDraft(PHASE0_PROJECT_IDS.numbering);
    expect(replacement.claim_number).toBe("P0-100-PC-01");

    await client.query(
      "update public.project_claims set claim_number = 'P0-100-CL-01' where id = $1",
      [replacement.id],
    );
    const afterHistoricalClaim = await createDraft(PHASE0_PROJECT_IDS.numbering);
    expect(afterHistoricalClaim.claim_number).toBe("P0-100-PC-02");
    expect((await readClaim(replacement.id)).claim_number).toBe("P0-100-CL-01");

    await seedProject(PHASE0_PROJECT_IDS.ordering);
    const otherProjectFirst = await createDraft(PHASE0_PROJECT_IDS.ordering);
    expect(otherProjectFirst.claim_number).toBe("P0-103-PC-01");
    await expectDatabaseError(
      () => client.query(
        "update public.project_claims set claim_number = 'P0-100-CL-01' where id = $1",
        [otherProjectFirst.id],
      ),
      "project_claims_org_claim_number_unique_idx",
    );
  });

  it("sources quote and approved variation snapshots and calculates flat retention at cent boundaries", async () => {
    await seedProject(PHASE0_PROJECT_IDS.flat);
    await seedCommercialSources(PHASE0_PROJECT_IDS.flat);
    const draft = await createDraft(PHASE0_PROJECT_IDS.flat);
    const persistedDraft = await readClaim(draft.id);
    expect(new Date(persistedDraft.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(draft.updated_at).getTime());
    const saved = await saveDraft(PHASE0_PROJECT_IDS.flat, persistedDraft);

    expect(saved).toMatchObject({
      claim_amount: FLAT_FIRST_CLAIM_EXPECTED.grossPreGst,
      previous_claims_total: "0.00",
      retention_withheld_amount: FLAT_FIRST_CLAIM_EXPECTED.retentionWithheld,
      retention_released_amount: FLAT_FIRST_CLAIM_EXPECTED.retentionReleased,
      retention_held_to_date: FLAT_FIRST_CLAIM_EXPECTED.cumulativeRetentionHeld,
      retention_released_to_date: FLAT_FIRST_CLAIM_EXPECTED.cumulativeRetentionReleased,
      retention_balance: FLAT_FIRST_CLAIM_EXPECTED.retentionBalance,
      net_claim_excl_gst: FLAT_FIRST_CLAIM_EXPECTED.netPreGst,
      gst_amount: FLAT_FIRST_CLAIM_EXPECTED.gst,
      total_payable: FLAT_FIRST_CLAIM_EXPECTED.totalPayableTaxInclusive,
    });

    const lines = await client.query(
      `select source_kind, source_number, description, source_total, previously_claimed_amount,
        claim_amount, cumulative_claimed_amount, claim_percent, cumulative_claimed_percent
       from public.project_claim_line_items where claim_id = $1
       order by source_kind, sort_order`,
      [saved.id],
    );
    expect(lines.rows).toEqual([
      {
        source_kind: "Quote",
        source_number: "Q-P0",
        description: "Snapshot labour",
        source_total: "600.01",
        previously_claimed_amount: "0.00",
        claim_amount: "300.01",
        cumulative_claimed_amount: "300.01",
        claim_percent: "50.000",
        // Percent is derived from the unrounded line calculation, while the
        // adjacent cumulative amount is persisted after cent rounding.
        cumulative_claimed_percent: "50.000",
      },
      {
        source_kind: "Quote",
        source_number: "Q-P0",
        description: "Snapshot materials",
        source_total: "400.00",
        previously_claimed_amount: "0.00",
        claim_amount: "200.00",
        cumulative_claimed_amount: "200.00",
        claim_percent: "50.000",
        cumulative_claimed_percent: "50.000",
      },
      {
        source_kind: "Variation",
        source_number: "V-P0",
        description: "Approved source variation",
        source_total: "100.00",
        previously_claimed_amount: "0.00",
        claim_amount: "100.00",
        cumulative_claimed_amount: "100.00",
        claim_percent: "100.000",
        cumulative_claimed_percent: "100.000",
      },
    ]);
  });

  it("recalculates later claims after an earlier correction and excludes Cancelled claims from running totals", async () => {
    const firstQuery = await client.query<{ id: string }>(
      "select id from public.project_claims where project_id = $1 order by created_at limit 1",
      [PHASE0_PROJECT_IDS.flat],
    );
    const first = await readClaim(firstQuery.rows[0].id);
    const secondDraft = await createDraft(PHASE0_PROJECT_IDS.flat);
    const second = await saveDraft(PHASE0_PROJECT_IDS.flat, await readClaim(secondDraft.id), {
      claimDate: "2026-02-01",
      lines: FULL_REMAINING_SOURCE_LINES,
    });
    expect(second).toMatchObject({
      previous_claims_total: "600.01",
      claim_amount: "500.00",
      retention_withheld_amount: "50.00",
      retention_held_to_date: "110.00",
      retention_balance: "110.00",
    });

    const correctedFirst = await saveDraft(PHASE0_PROJECT_IDS.flat, await readClaim(first.id), {
      claimDate: "2026-01-01",
      lines: FLAT_SOURCE_LINES.map((line) => ({
        ...line,
        claim_percent: line.source_kind === "Variation" ? 100 : 40,
      })),
    });
    expect(correctedFirst.claim_amount).toBe("500.00");
    expect(await readClaim(second.id)).toMatchObject({
      previous_claims_total: "500.00",
      claim_amount: "600.01",
      retention_withheld_amount: "60.00",
      retention_held_to_date: "110.00",
    });

    await client.query("select * from public.update_project_claim_status($1, $2, $3, 'Cancelled')", [
      PHASE0_ORGANIZATION_ID,
      PHASE0_PROJECT_IDS.flat,
      first.id,
    ]);
    expect(await readClaim(first.id)).toMatchObject({
      status: "Cancelled",
      claim_amount: "500.00",
      retention_held_to_date: "0.00",
      retention_balance: "0.00",
    });
    expect(await readClaim(second.id)).toMatchObject({
      previous_claims_total: "0.00",
      claim_amount: "1100.01",
      retention_withheld_amount: "110.00",
      retention_held_to_date: "110.00",
    });
  });

  it("reorders previous and current amounts when a claim date moves after a later claim", async () => {
    const quote = await client.query<{ id: string }>(
      `insert into public.project_quotes
        (organization_id, project_id, created_by, quote_title, quote_number, status, subtotal)
       values ($1, $2, $3, 'Ordering quote', 'Q-ORDER', 'Accepted', 1000.00)
       returning id`,
      [PHASE0_ORGANIZATION_ID, PHASE0_PROJECT_IDS.ordering, PHASE0_USER_ID],
    );
    const line = await client.query<{ id: string }>(
      `insert into public.project_quote_line_items
        (organization_id, project_id, quote_id, section, description, quantity, unit, rate, total)
       values ($1, $2, $3, 'Labour', 'Ordering line', 1, 'item', 1000, 1000)
       returning id`,
      [PHASE0_ORGANIZATION_ID, PHASE0_PROJECT_IDS.ordering, quote.rows[0].id],
    );
    const firstDraft = await client.query<{ id: string }>(
      "select id from public.project_claims where project_id = $1 order by created_at limit 1",
      [PHASE0_PROJECT_IDS.ordering],
    );
    const sourceLine = {
      source_kind: "Quote",
      source_document_id: quote.rows[0].id,
      source_line_item_id: line.rows[0].id,
    };
    const first = await saveDraft(
      PHASE0_PROJECT_IDS.ordering,
      await readClaim(firstDraft.rows[0].id),
      { claimDate: "2026-01-01", lines: [{ ...sourceLine, claim_percent: 40 }] },
    );
    const secondDraft = await createDraft(PHASE0_PROJECT_IDS.ordering);
    const second = await saveDraft(
      PHASE0_PROJECT_IDS.ordering,
      await readClaim(secondDraft.id),
      { claimDate: "2026-02-01", lines: [{ ...sourceLine, claim_percent: 100 }] },
    );
    expect(first).toMatchObject({ previous_claims_total: "0.00", claim_amount: "400.00" });
    expect(second).toMatchObject({ previous_claims_total: "400.00", claim_amount: "600.00" });

    const movedFirst = await saveDraft(
      PHASE0_PROJECT_IDS.ordering,
      await readClaim(first.id),
      { claimDate: "2026-03-01", lines: [{ ...sourceLine, claim_percent: 40 }] },
    );
    expect(await readClaim(second.id)).toMatchObject({
      previous_claims_total: "0.00",
      claim_amount: "1000.00",
    });
    expect(movedFirst).toMatchObject({
      previous_claims_total: "1000.00",
      claim_amount: "0.00",
    });
  });

  it("preserves current legacy release behavior, including a negative retention balance", async () => {
    const current = await client.query<{ id: string }>(
      "select id from public.project_claims where project_id = $1 and status <> 'Cancelled' order by created_at desc limit 1",
      [PHASE0_PROJECT_IDS.flat],
    );
    const released = await saveDraft(PHASE0_PROJECT_IDS.flat, await readClaim(current.rows[0].id), {
      claimDate: "2026-02-01",
      lines: FULL_REMAINING_SOURCE_LINES,
      retentionReleased: "200.00",
    });
    expect(released).toMatchObject({
      retention_withheld_amount: "110.00",
      retention_released_amount: "200.00",
      retention_held_to_date: "110.00",
      retention_released_to_date: "200.00",
      retention_balance: "-90.00",
      net_claim_excl_gst: "1190.01",
      gst_amount: "178.50",
      total_payable: "1368.51",
    });
  });

  it("calculates sliding-scale retention cumulatively and rounds every persisted boundary", async () => {
    await seedProject(PHASE0_PROJECT_IDS.sliding);
    await client.query(
      `insert into public.project_quotes
        (organization_id, project_id, created_by, quote_title, quote_number, status, subtotal)
       values ($1, $2, $3, 'Sliding quote', 'Q-SLIDE', 'Accepted', 1000.00)
       returning id`,
      [PHASE0_ORGANIZATION_ID, PHASE0_PROJECT_IDS.sliding, PHASE0_USER_ID],
    );
    const quote = await client.query<{ id: string }>(
      "select id from public.project_quotes where project_id = $1",
      [PHASE0_PROJECT_IDS.sliding],
    );
    const line = await client.query<{ id: string }>(
      `insert into public.project_quote_line_items
        (organization_id, project_id, quote_id, section, description, quantity, unit, rate, total)
       values ($1, $2, $3, 'Labour', 'Sliding line', 1, 'item', 1000, 1000)
       returning id`,
      [PHASE0_ORGANIZATION_ID, PHASE0_PROJECT_IDS.sliding, quote.rows[0].id],
    );
    const draft = await createDraft(PHASE0_PROJECT_IDS.sliding);
    const saved = await saveDraft(PHASE0_PROJECT_IDS.sliding, await readClaim(draft.id), {
      retentionMethod: "sliding_scale",
      retentionBands: SLIDING_RETENTION_BANDS,
      lines: [{
        source_kind: "Quote",
        source_document_id: quote.rows[0].id,
        source_line_item_id: line.rows[0].id,
        claim_percent: 75,
      }],
    });
    expect(await readClaim(saved.id)).toMatchObject({
      claim_amount: "750.00",
      retention_method: "sliding_scale",
      retention_withheld_amount: "62.50",
      net_claim_excl_gst: "687.50",
      gst_amount: "103.13",
      total_payable: "790.63",
    });
  });

  it("characterizes the current ineffective optimistic timestamp check, unrestricted valid status transitions, and Draft-only deletion", async () => {
    await seedProject(PHASE0_PROJECT_IDS.permissions);
    const draft = await createDraft(PHASE0_PROJECT_IDS.permissions);
    const persistedDraft = await readClaim(draft.id);
    const saved = await saveDraft(PHASE0_PROJECT_IDS.permissions, persistedDraft, { status: "Paid", lines: [] });
    expect(saved.status).toBe("Paid");

    const secondSaveUsingOriginalVersion = await saveDraft(PHASE0_PROJECT_IDS.permissions, saved, {
        expectedUpdatedAt: persistedDraft.updated_at,
        status: "Draft",
        lines: [],
      });
    expect(secondSaveUsingOriginalVersion.status).toBe("Draft");

    await client.query("select * from public.update_project_claim_status($1, $2, $3, 'Paid')", [
      PHASE0_ORGANIZATION_ID,
      PHASE0_PROJECT_IDS.permissions,
      saved.id,
    ]);
    await expectDatabaseError(
      () => client.query("select public.delete_project_claim_safe($1, $2, $3)", [
        PHASE0_ORGANIZATION_ID,
        PHASE0_PROJECT_IDS.permissions,
        saved.id,
      ]),
      "Only draft claims can be deleted",
    );
  });

  it("characterizes tenant-scoped RPC rejection and current direct-table write access", async () => {
    await seedProject(PHASE0_PROJECT_IDS.otherTenant, PHASE0_OTHER_ORGANIZATION_ID);
    await expectDatabaseError(
      () => client.query("select * from public.create_project_claim_draft($1, $2, 'Cross tenant')", [
        PHASE0_OTHER_ORGANIZATION_ID,
        PHASE0_PROJECT_IDS.otherTenant,
      ]),
      "Not authorized for this organization",
    );

    const ownDraft = await createDraft(PHASE0_PROJECT_IDS.permissions);
    await client.query("set local role authenticated");
    const directWrite = await client.query(
      `update public.project_claims
       set paid_amount = 12.34, retention_released_amount = 56.78
       where id = $1
       returning paid_amount, retention_released_amount`,
      [ownDraft.id],
    );
    await client.query("reset role");
    expect(directWrite.rows[0]).toEqual({
      paid_amount: "12.34",
      retention_released_amount: "56.78",
    });
  });
});
