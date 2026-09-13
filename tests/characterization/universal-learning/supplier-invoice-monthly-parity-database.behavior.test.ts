import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildUniversalLearningContainerRecords } from "@/lib/universal-learning/builders";
import { getUniversalLearningCursor } from "@/lib/universal-learning/delta-cursors";
import { applyUniversalLearningMemoryActions } from "@/lib/universal-learning/memory-actions";
import { hasCompletedUniversalLearningReviewRun } from "@/lib/universal-learning/review-runs";
import { assertValidSupplierBillUclBusinessRecord } from "@/lib/universal-learning/supplier-bill-schema";

vi.mock("@/lib/universal-learning/construction-profile", () => ({
  loadUniversalLearningConstructionProfile: async () => ({
    rawProfile: "Commercial construction test organization",
    normalizedProfile: {},
  }),
}));
vi.mock("@/lib/universal-learning/memory-pack", () => ({
  buildUniversalLearningMemoryPack: async () => [],
}));

const dbUrl = process.env.SUPPLIER_INVOICE_UCL_DATABASE_TEST_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const explicitlyEnabled = process.env.SUPPLIER_INVOICE_UCL_DATABASE_TEST === "1";
const localDatabase =
  Boolean(dbUrl)
  && /(?:localhost|127\.0\.0\.1)/i.test(dbUrl ?? "")
  && /(?:localhost|127\.0\.0\.1)/i.test(supabaseUrl ?? "");
const describeDatabase =
  explicitlyEnabled && localDatabase && serviceRoleKey
    ? describe.sequential
    : describe.skip;

const USER_ID = "f7000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "f7000000-0000-4000-8000-000000000010";
const SUPPLIER_ID = "f7000000-0000-4000-8000-000000000020";
const PROJECT_ID = "f7000000-0000-4000-8000-000000000030";
const REVIEW_MONTH = "2026-07";

function fixtureUuid(group: number, index: number) {
  return `f7000000-0000-4000-${String(group).padStart(4, "0")}-${String(index).padStart(12, "0")}`;
}

function compareCursor(
  left: { updatedAt: string | null; id: string | null },
  right: { updatedAt: string | null; id: string | null },
) {
  return (
    (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "")
    || (left.id ?? "").localeCompare(right.id ?? "")
  );
}

describeDatabase("Supplier Invoice UCL monthly parity (local Supabase)", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  async function cleanup() {
    await client.query("delete from auth.users where id = $1", [USER_ID]);
  }

  beforeAll(async () => {
    await client.connect();
    await cleanup();
    await client.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data)
       values
        ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'supplier-invoice-ucl-parity@example.test', '', now(), '{}'::jsonb, '{}'::jsonb)`,
      [USER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by = $1",
      [USER_ID],
    );
    await client.query(
      `insert into public.organizations (id, name, created_by, construction_profile)
       values ($1, 'Supplier Invoice UCL Parity', $2, 'Commercial construction test organization')`,
      [ORGANIZATION_ID, USER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values ($1, $2, 'admin', 'UCL Parity Owner')`,
      [ORGANIZATION_ID, USER_ID],
    );
    await client.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, stage)
       values ($1, $2, $3, 'UCL Cursor Project', 'ucl-cursor-project', 'In Delivery')`,
      [PROJECT_ID, ORGANIZATION_ID, USER_ID],
    );
    await client.query(
      `insert into public.organization_suppliers
        (id, organization_id, created_by, name, company_name)
       values ($1, $2, $3, 'UCL Cursor Supplier', 'UCL Cursor Supplier Limited')`,
      [SUPPLIER_ID, ORGANIZATION_ID, USER_ID],
    );

    for (let offset = 0; offset < 27; offset += 1) {
      const index = offset + 1;
      const invoiceId = fixtureUuid(8100, index);
      const lineId = fixtureUuid(8200, index);
      const ownerUpdatedAt = `2026-07-02T00:${String(index).padStart(2, "0")}:00.000Z`;
      const childUpdatedAt = [3, 13, 23].includes(index)
        ? "2026-07-20T00:11:00.000Z"
        : `2026-07-20T00:${String(27 - index).padStart(2, "0")}:00.000Z`;
      await client.query(
        `insert into public.supplier_invoices
          (id, organization_id, supplier_id, invoice_number, invoice_date, due_date,
           subtotal, tax_total, total, currency, status, source, created_by, created_at, updated_at)
         values
          ($1, $2, $3, $4, '2026-07-01', '2026-07-31',
           100, 15, 115, 'NZD', 'Captured', 'manual', $5, $6, $6)`,
        [invoiceId, ORGANIZATION_ID, SUPPLIER_ID, `UCL-${index}`, USER_ID, ownerUpdatedAt],
      );
      await client.query(
        `insert into public.supplier_invoice_lines
          (id, organization_id, supplier_invoice_id, description, quantity, unit_price,
           line_total, tax_amount, project_id, sort_order, created_at, updated_at)
         values ($1, $2, $3, $4, 1, 100, 100, 15, $5, 1, $6, $6)`,
        [
          lineId,
          ORGANIZATION_ID,
          invoiceId,
          `UCL cursor line ${index}`,
          PROJECT_ID,
          childUpdatedAt,
        ],
      );
    }
  });

  afterAll(async () => {
    await cleanup();
    await client.end();
  });

  it("runs the real v2 builder and shared monthly runner through 12/12/3 exact-once batches", async () => {
    const { runUniversalConstructionLearningReview } = await import(
      "@/lib/universal-learning/runner"
    );
    const selection = {
      organizationId: ORGANIZATION_ID,
      containerType: "supplier_invoice" as const,
      reviewMonth: REVIEW_MONTH,
      runType: "monthly" as const,
      scopeKey: "organization",
    };
    const initial = await buildUniversalLearningContainerRecords({
      containerType: "supplier_invoice",
      context: {
        organizationId: ORGANIZATION_ID,
        cursor: { updatedAt: null, id: null },
        reviewMonth: REVIEW_MONTH,
      },
    });
    expect(initial.records).toHaveLength(27);
    for (const record of initial.records) {
      expect(() => assertValidSupplierBillUclBusinessRecord(record)).not.toThrow();
      expect(record.containerType).toBe("supplier_invoice");
      expect(record.payload.schemaVersion).toBe("supplier_bill.v2");
    }

    const expected = [...initial.records].sort((left, right) =>
      compareCursor(
        { updatedAt: left.updatedAt, id: left.source.sourceId },
        { updatedAt: right.updatedAt, id: right.source.sourceId },
      ));
    const expectedFinalCursor = {
      updatedAt: expected.at(-1)!.updatedAt,
      id: expected.at(-1)!.source.sourceId,
    };
    const promptedSourceIds: string[][] = [];
    const completionStates: boolean[] = [];

    for (let batch = 0; batch < 3; batch += 1) {
      const result = await runUniversalConstructionLearningReview({
        selection,
        modelInvoker: async (prompt) => {
          const promptedRecords = prompt.promptPacket.newBusinessActivity;
          promptedSourceIds.push(
            promptedRecords.map((record) => record.source.sourceId),
          );
          for (const record of promptedRecords) {
            expect(record.containerType).toBe("supplier_invoice");
            expect(record.payload.schemaVersion).toBe("supplier_bill.v2");
          }
          const sourceId = promptedRecords[0].source.sourceId;
          return {
            provider: "anthropic",
            model: "deterministic-local-fixture",
            rawText: "{}",
            parsedJson: {
              reviewSummary: {
                overallAssessment: "Database-backed deterministic no-op review.",
                dominantThemes: [],
                confidenceNotes: "No external model was invoked.",
              },
              learnings: {
                observations: [{
                  learningId: `database-no-op-${batch + 1}`,
                  title: "Database fixture observation",
                  statement: "The fixture proves monthly cursor continuation.",
                  whyItMatters: "Eligible Supplier Invoices must not be skipped.",
                  confidence: {
                    score: 0.8,
                    label: "high",
                    reasoning: "Direct database and shared-runner evidence.",
                  },
                  evidence: {
                    recordCount: promptedRecords.length,
                    supportingRecords: [{
                      containerType: "supplier_invoice",
                      sourceId,
                      reason: "First record in the deterministic batch.",
                    }],
                  },
                  relationshipToExistingMemory: {
                    status: "insufficient",
                    memoryId: null,
                    explanation: "Verification-only fixture.",
                  },
                  provenance: {
                    reviewPeriodStart: "2026-07-01T00:00:00.000Z",
                    reviewPeriodEnd: "2026-08-01T00:00:00.000Z",
                    relevantEntities: {
                      projectIds: [PROJECT_ID],
                      supplierIds: [SUPPLIER_ID],
                      clientIds: [],
                      materialIds: [],
                    },
                  },
                }],
                emergingPatterns: [],
                reinforcedPatterns: [],
                durablePatterns: [],
                changingBehaviors: [],
                contradictions: [],
                needsMoreEvidence: [],
              },
              memoryActions: {
                create: [],
                reinforce: [],
                update: [],
                retireOrDeactivate: [],
                noAction: [{
                  action: "no_action",
                  targetMemoryId: null,
                  basedOnLearningId: `database-no-op-${batch + 1}`,
                  proposedMemoryTitle: null,
                  proposedMemorySummary: "Verification-only no-op.",
                  confidenceAdjustment: 0,
                  reason: "Do not create product memory from a test fixture.",
                }],
              },
            },
            inputTokens: 100,
            outputTokens: 10,
            totalTokens: 110,
          };
        },
        applyMemoryActions: async (input) =>
          applyUniversalLearningMemoryActions(input),
      });
      expect(result.skipped).toBe(false);
      completionStates.push(await hasCompletedUniversalLearningReviewRun({
        ...selection,
      }));
    }

    expect(promptedSourceIds.map((batch) => batch.length)).toEqual([12, 12, 3]);
    expect(promptedSourceIds.flat()).toEqual(
      expected.map((record) => record.source.sourceId),
    );
    expect(new Set(promptedSourceIds.flat()).size).toBe(27);
    expect(completionStates).toEqual([false, false, true]);
    expect(await getUniversalLearningCursor(selection)).toEqual(expectedFinalCursor);

    const runRows = await client.query<{
      run_status: string;
      selected_record_count: number;
      candidate_next_cursor_id: string;
      final_next_cursor_id: string;
    }>(
      `select run_status, selected_record_count, candidate_next_cursor_id, final_next_cursor_id
       from public.learning_review_runs
       where organization_id = $1
         and container_type = 'supplier_invoice'
         and scope_key = 'organization'
         and review_month = '2026-07-01'
       order by created_at`,
      [ORGANIZATION_ID],
    );
    expect(runRows.rows.map((row) => row.selected_record_count)).toEqual([12, 12, 3]);
    expect(runRows.rows.every((row) => row.run_status === "completed")).toBe(true);
    expect(runRows.rows.slice(0, 2).every(
      (row) => row.candidate_next_cursor_id !== row.final_next_cursor_id,
    )).toBe(true);
    expect(runRows.rows[2].candidate_next_cursor_id).toBe(
      runRows.rows[2].final_next_cursor_id,
    );

    const runRecordCount = await client.query<{ count: string; distinct_count: string }>(
      `select count(*)::text as count, count(distinct source_id)::text as distinct_count
       from public.learning_review_run_records
       where organization_id = $1 and container_type = 'supplier_invoice'`,
      [ORGANIZATION_ID],
    );
    expect(runRecordCount.rows[0]).toEqual({ count: "27", distinct_count: "27" });

    const actionResults = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.learning_review_action_results
       where organization_id = $1
         and action_type = 'no_action'
         and result_status = 'skipped'`,
      [ORGANIZATION_ID],
    );
    expect(actionResults.rows[0].count).toBe("3");
  });
});
