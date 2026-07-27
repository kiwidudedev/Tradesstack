import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE8_DB_URL
  ?? process.env.RETENTION_PHASE7_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "a8100000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a8100000-0000-4000-8000-000000000010";
const PROJECT_ID = "a8100000-0000-4000-8000-000000000100";
const ORIGIN_ID = "a8100000-0000-4000-8000-000000001001";
const CLAIM_ID = "a8100000-0000-4000-8000-000000002001";
const ALLOCATION_ID = "a8100000-0000-4000-8000-000000003001";
const STATE_HASH = "d".repeat(64);
const ELIGIBILITY_HASH = "e".repeat(64);
const PDF_HASH = "f".repeat(64);

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  sourceEvidenceHash?: string;
  created?: boolean;
  reused?: boolean;
  document?: { id: string };
};

describeDatabase("Phase 8 Retention Claim document concurrency", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  let sourceHash = "";
  let storagePath = "";

  beforeAll(async () => {
    await setup.connect();
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values(
        $1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','phase8-concurrency@example.test','',now(),'{}','{}'
      )`,
      [OWNER_ID],
    );
    await setup.query(
      "delete from public.organizations where created_by=$1",
      [OWNER_ID],
    );
    await setup.query(
      "insert into public.organizations(id,name,created_by) values($1,'Phase 8 concurrency',$2)",
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Owner')`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code
      ) values($1,$2,$3,'Concurrent documents','phase8-concurrent','P8-C')`,
      [PROJECT_ID, ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `update public.organization_capabilities
       set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `update public.project_retention_workflow_states
       set mode='observe',changed_by=$2,changed_at=now()
       where project_id=$1`,
      [PROJECT_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,
        claim_type,status,claim_date,claim_amount,retention_method,
        retention_percent,retention_withheld_amount,retention_released_amount,
        retention_held_to_date,retention_released_to_date,retention_balance,
        net_claim_excl_gst,gst_amount,total_payable,created_at,updated_at
      ) values(
        $1,$2,$3,$4,'P8C-PC-01','Origin','Progress','Submitted','2026-01-15',
        1000,'flat',10,100,0,100,0,100,900,135,1035,
        '2026-01-15T00:00:00Z','2026-01-15T01:00:00Z'
      )`,
      [ORIGIN_ID, ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.retention_claims(
        id,organization_id,project_id,claim_number,title,status,
        subtotal_excl_tax,draft_revision,last_position_state_hash,
        created_by,created_at,updated_at
      ) values(
        $1,$2,$3,'RC-P8C-001','Concurrent retention','draft',
        0,2,$4,$5,'2026-07-20T00:00:00Z','2026-07-20T00:00:00Z'
      )`,
      [CLAIM_ID, ORGANIZATION_ID, PROJECT_ID, STATE_HASH, OWNER_ID],
    );
    await setup.query(
      `insert into public.retention_claim_allocations(
        id,organization_id,project_id,retention_claim_id,
        originating_payment_claim_id,allocation_sequence,allocation_amount,
        draft_origin_state_hash,draft_origin_updated_at,
        draft_origin_retention_owned,origin_claim_number_snapshot,
        origin_claim_date_snapshot,origin_claim_status_snapshot,
        origin_claim_created_at_snapshot,origin_claim_updated_at_snapshot,
        retention_method_snapshot,retention_rate_snapshot,
        retention_withheld_snapshot,retention_released_snapshot,
        retention_held_to_date_snapshot,retention_released_to_date_snapshot,
        retention_balance_snapshot,existing_submitted_allocation_before,
        remaining_after_allocation,gross_claim_amount_snapshot,
        net_claim_excl_gst_snapshot,gst_amount_snapshot,total_payable_snapshot,
        project_state_hash_snapshot,origin_state_hash_snapshot,
        eligibility_state_hash_snapshot,eligibility_schedule_ids_snapshot,
        submitted_by,submitted_at,created_by,created_at,updated_at
      ) values(
        $1,$2,$3,$4,$5,1,40,$6,'2026-01-15T01:00:00Z',
        100,'P8C-PC-01','2026-01-15','Submitted',
        '2026-01-15T00:00:00Z','2026-01-15T01:00:00Z',
        'flat',10,100,0,100,0,100,0,60,1000,900,135,1035,
        $6,$6,$7,'{}'::uuid[],$8,'2026-07-21T02:30:00Z',$8,
        '2026-07-20T00:00:00Z','2026-07-21T02:30:00Z'
      )`,
      [
        ALLOCATION_ID,
        ORGANIZATION_ID,
        PROJECT_ID,
        CLAIM_ID,
        ORIGIN_ID,
        STATE_HASH,
        ELIGIBILITY_HASH,
        OWNER_ID,
      ],
    );
    await setup.query(
      "select set_config('app.retention_phase4_submission_write','true',false)",
    );
    await setup.query(
      `update public.retention_claims set
        status='submitted',subtotal_excl_tax=40,submission_state_hash=$2,
        submission_eligibility_state_hash=$3,submitted_by=$4,
        submitted_at='2026-07-21T02:30:00Z'
       where id=$1`,
      [CLAIM_ID, STATE_HASH, ELIGIBILITY_HASH, OWNER_ID],
    );
    await setup.query(
      "select set_config('app.retention_phase4_submission_write','false',false)",
    );

    const sourceClient = await createClient();
    const source = await sourceClient.query<{ result: Result }>(
      "select public.get_retention_claim_document_source($1) result",
      [CLAIM_ID],
    );
    await sourceClient.end();
    sourceHash = source.rows[0].result.sourceEvidenceHash ?? "";
    storagePath =
      `${ORGANIZATION_ID}/${PROJECT_ID}/${CLAIM_ID}/${sourceHash}.pdf`;
  });

  afterAll(async () => {
    await setup.query("set session_replication_role=replica");
    for (const table of [
      "retention_claim_document_events",
      "retention_claim_documents",
      "retention_claim_allocations",
      "retention_claims",
      "project_claims",
      "project_retention_workflow_states",
      "organization_capabilities",
      "organization_projects",
      "organization_members",
      "organizations",
    ]) {
      const column = table === "organizations"
        ? "id"
        : table === "organization_members"
          || table === "organization_capabilities"
          || table === "organization_projects"
          || table === "project_retention_workflow_states"
          ? "organization_id"
          : "organization_id";
      await setup.query(`delete from public.${table} where ${column}=$1`, [
        ORGANIZATION_ID,
      ]);
    }
    await setup.query("delete from auth.users where id=$1", [OWNER_ID]);
    await setup.query("set session_replication_role=origin");
    await setup.end();
  });

  async function createClient() {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      OWNER_ID,
    ]);
    await client.query(
      "select set_config('request.jwt.claim.role','authenticated',false)",
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase8_internal','true',false)",
    );
    return client;
  }

  it("converges simultaneous recordings onto one immutable document", async () => {
    const first = await createClient();
    const second = await createClient();
    await Promise.all([
      first.query(
        "select set_config('request.jwt.claim.role','service_role',false)",
      ),
      second.query(
        "select set_config('request.jwt.claim.role','service_role',false)",
      ),
    ]);
    const sql =
      `select public.record_retention_claim_document(
        $1,$2,$3,'RC-P8C-001.pdf',$4,2048,'{"schemaVersion":1}'::jsonb,$5
      ) result`;
    try {
      const [a, b] = await Promise.all([
        first.query<{ result: Result }>(sql, [
          CLAIM_ID,
          sourceHash,
          PDF_HASH,
          storagePath,
          OWNER_ID,
        ]),
        second.query<{ result: Result }>(sql, [
          CLAIM_ID,
          sourceHash,
          PDF_HASH,
          storagePath,
          OWNER_ID,
        ]),
      ]);

      expect(a.rows[0].result.succeeded).toBe(true);
      expect(b.rows[0].result.succeeded).toBe(true);
      expect([a.rows[0].result.created, b.rows[0].result.created].sort()).toEqual([
        false,
        true,
      ]);
      expect(a.rows[0].result.document?.id).toBe(
        b.rows[0].result.document?.id,
      );

      const evidence = await setup.query<{
        documents: string;
        events: string;
      }>(
        `select
          (select count(*)::text from public.retention_claim_documents
           where retention_claim_id=$1) documents,
          (select count(*)::text from public.retention_claim_document_events
           where retention_claim_id=$1) events`,
        [CLAIM_ID],
      );
      expect(evidence.rows[0]).toEqual({ documents: "1", events: "1" });
    } finally {
      await first.end();
      await second.end();
    }
  });
});
