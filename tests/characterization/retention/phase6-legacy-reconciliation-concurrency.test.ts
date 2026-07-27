import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE6_DB_URL
  ?? process.env.RETENTION_PHASE5_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "a6100000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a6100000-0000-4000-8000-000000000010";
const PROJECT_ID = "a6100000-0000-4000-8000-000000000100";
const ORIGIN_ID = "a6100000-0000-4000-8000-000000001001";
const RELEASE_ID = "a6100000-0000-4000-8000-000000001002";

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  created: boolean;
  case: { id: string; case_sequence: number; revision: number };
};

describeDatabase("Phase 6 legacy reconciliation concurrency", () => {
  const setup = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await setup.connect();
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values(
        $1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','phase6-concurrency@example.test','',now(),'{}','{}'
      )`,
      [OWNER_ID],
    );
    await setup.query(
      "delete from public.organizations where created_by=$1",
      [OWNER_ID],
    );
    await setup.query(
      "insert into public.organizations(id,name,created_by) values($1,'Phase 6 concurrency',$2)",
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
      ) values($1,$2,$3,'Concurrent reconciliation','phase6-concurrent','P6-C')`,
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
      ) values
        ($1,$3,$4,$5,'P6C-01','Origin','Progress','Submitted','2025-01-01',
         1000,'flat',10,100,0,100,0,100,900,135,1035,
         '2025-01-01T00:00:00Z','2025-01-01T01:00:00Z'),
        ($2,$3,$4,$5,'P6C-02','Release','Final','Paid','2026-01-01',
         0,'flat',0,0,50,100,50,50,50,7.5,57.5,
         '2026-01-01T00:00:00Z','2026-01-01T01:00:00Z')`,
      [ORIGIN_ID, RELEASE_ID, ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
  });

  afterAll(async () => {
    await setup.query("set session_replication_role=replica");
    for (const table of [
      "retention_legacy_reconciliation_events",
      "retention_legacy_release_allocations",
      "retention_legacy_release_sources",
      "retention_legacy_reconciliation_cases",
      "retention_variance_events",
      "retention_variances",
      "project_claims",
      "project_retention_workflow_states",
      "organization_capabilities",
      "organization_projects",
      "organization_members",
      "organizations",
    ]) {
      const column = table === "organizations"
        ? "id"
        : table === "organization_members" || table === "organization_capabilities"
          ? "organization_id"
          : table === "organization_projects"
            ? "organization_id"
            : table === "project_retention_workflow_states"
              ? "organization_id"
              : table.startsWith("retention_") || table === "project_claims"
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
      "select set_config('request.jwt.claim.retention_phase6_internal','true',false)",
    );
    return client;
  }

  it("serializes concurrent creation into one deterministic current case", async () => {
    const first = await createClient();
    const second = await createClient();
    try {
      const [a, b] = await Promise.all([
        first.query<{ result: Result }>(
          "select public.create_retention_legacy_reconciliation_case($1,'race-a') result",
          [PROJECT_ID],
        ),
        second.query<{ result: Result }>(
          "select public.create_retention_legacy_reconciliation_case($1,'race-b') result",
          [PROJECT_ID],
        ),
      ]);
      expect(a.rows[0].result.succeeded).toBe(true);
      expect(b.rows[0].result.succeeded).toBe(true);
      expect([a.rows[0].result.created, b.rows[0].result.created].sort()).toEqual([
        false,
        true,
      ]);
      expect(a.rows[0].result.case.id).toBe(b.rows[0].result.case.id);
      expect(a.rows[0].result.case.case_sequence).toBe(1);

      const count = await setup.query<{ count: string }>(
        `select count(*)::text count
         from public.retention_legacy_reconciliation_cases
         where project_id=$1 and status in ('draft','in_review','approved')`,
        [PROJECT_ID],
      );
      expect(count.rows[0].count).toBe("1");
    } finally {
      await first.end();
      await second.end();
    }
  });
});
