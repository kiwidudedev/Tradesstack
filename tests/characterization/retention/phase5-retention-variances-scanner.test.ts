import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.RETENTION_PHASE5_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER = "f5100000-0000-4000-8000-000000000001";
const ORG = "f5100000-0000-4000-8000-000000000010";
const PROJECT = "f5100000-0000-4000-8000-000000000100";

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  count?: number;
  originCount?: number;
  claimToken?: string;
  projects?: Array<Record<string, unknown>>;
};

describeDatabase("Phase 5 retention variance scanner", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      `insert into auth.users
       (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'phase5-scanner@example.test','',now(),'{}','{}')`,
      [USER],
    );
    await client.query("delete from public.organizations where created_by=$1", [USER]);
    await client.query(
      "insert into public.organizations(id,name,created_by,timezone) values($1,'Phase 5 Scanner',$2,'Pacific/Auckland')",
      [ORG, USER],
    );
    await client.query(
      `insert into public.organization_members(organization_id,user_id,role,display_name)
       values($1,$2,'owner','Scanner Owner')`,
      [ORG, USER],
    );
    await client.query(
      `insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
       values($1,$2,$3,'Scanner Project','phase-5-scanner','P5S')`,
      [PROJECT, ORG, USER],
    );
    await client.query(
      `update public.organization_capabilities set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`,
      [ORG, USER],
    );
    await client.query(
      `update public.project_retention_workflow_states
       set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=$3`,
      [ORG, USER, PROJECT],
    );
    await client.query(
      `insert into public.project_claims(
        organization_id,project_id,created_by,claim_number,claim_title,claim_type,status,
        claim_date,due_date,claim_amount,retention_method,retention_percent,
        retention_withheld_amount,retention_released_amount,retention_held_to_date,
        retention_released_to_date,retention_balance,net_claim_excl_gst,gst_amount,total_payable
       )
       select $1,$2,$3,'SCAN-'||lpad(g::text,3,'0'),'Origin '||g,'Progress','Submitted',
        '2026-01-01','2026-02-01',100,'flat',10,10,0,10,0,10,90,13.5,103.5
       from generate_series(1,205) g`,
      [ORG, PROJECT, USER],
    );
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function role(role: "authenticated" | "service_role") {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [USER]);
    await client.query("select set_config('request.jwt.claim.role',$1,true)", [role]);
  }

  async function rpc(sql: string, values: unknown[] = []) {
    const response = await client.query<{ result: Result }>(sql, values);
    return response.rows[0].result;
  }

  it("keeps scanner mutation RPCs service-role only", async () => {
    await role("authenticated");
    const denied = await rpc(
      "select public.enqueue_retention_variance_scan_projects(1,null,$1) result",
      [ORG],
    );
    expect(denied.errorCode).toBe("permission_denied");
    const privileges = await client.query<{ allowed: boolean }>(
      `select has_table_privilege('authenticated','public.retention_variances','INSERT,UPDATE,DELETE') allowed`,
    );
    expect(privileges.rows[0].allowed).toBe(false);
  });

  it("uses a bounded deterministic project cursor and a single active lease", async () => {
    await role("service_role");
    const enqueued = await rpc(
      "select public.enqueue_retention_variance_scan_projects(1,null,$1) result",
      [ORG],
    );
    expect(enqueued.succeeded).toBe(true);
    expect(enqueued.count).toBe(1);

    const first = await rpc(
      "select public.claim_retention_variance_scan_batch(1,'worker-a',600,$1) result",
      [ORG],
    );
    const second = await rpc(
      "select public.claim_retention_variance_scan_batch(1,'worker-b',600,$1) result",
      [ORG],
    );
    expect(first.projects).toHaveLength(1);
    expect(second.projects).toHaveLength(0);

    const item = first.projects?.[0] as Record<string, unknown>;
    const processed = await rpc(
      "select public.process_retention_variance_scan_item($1,$2,$3) result",
      [item.id, item.claimToken, "scanner-205"],
    );
    expect(processed.succeeded).toBe(true);
    expect(processed.originCount).toBe(0);
    const projectOrigins = await client.query(
      "select count(*)::integer count from public.project_claims where project_id=$1",
      [PROJECT],
    );
    expect(projectOrigins.rows[0].count).toBe(205);

    const finalized = await rpc(
      "select public.finalize_retention_variance_scan_item($1::jsonb) result",
      [JSON.stringify({
        queueId: item.id,
        claimToken: item.claimToken,
        completed: true,
      })],
    );
    expect(finalized.succeeded).toBe(true);
  });

  it("is idempotent and retains durable failed-run evidence", async () => {
    await role("service_role");
    await rpc(
      "select public.enqueue_retention_variance_scan_projects(1,null,$1) result",
      [ORG],
    );
    const claimed = await rpc(
      "select public.claim_retention_variance_scan_batch(1,'retry-worker',600,$1) result",
      [ORG],
    );
    const failedItem = claimed.projects?.[0] as Record<string, unknown>;
    const failed = await rpc(
      "select public.finalize_retention_variance_scan_item($1::jsonb) result",
      [JSON.stringify({
        queueId: failedItem.id,
        claimToken: failedItem.claimToken,
        completed: false,
        errorCode: "scan_failed",
        errorMessage: "retryable test failure",
      })],
    );
    expect(failed.succeeded).toBe(true);
    const retry = await client.query(
      "select queue_state,last_error_code,last_error_message from public.retention_variance_scan_queue where id=$1",
      [failedItem.id],
    );
    expect(retry.rows[0]).toMatchObject({
      queue_state: "retry_scheduled",
      last_error_code: "scan_failed",
      last_error_message: "retryable test failure",
    });
    await client.query(
      "update public.retention_variance_scan_queue set available_at=now() where id=$1",
      [failedItem.id],
    );
    const reclaimed = await rpc(
      "select public.claim_retention_variance_scan_batch(1,'retry-worker',600,$1) result",
      [ORG],
    );
    expect(reclaimed.projects).toHaveLength(1);
    await rpc(
      "select public.finalize_retention_variance_scan_item($1::jsonb) result",
      [JSON.stringify({
        queueId: reclaimed.projects?.[0].id,
        claimToken: reclaimed.projects?.[0].claimToken,
        completed: true,
      })],
    );

    const first = await rpc(
      "select public.run_retention_variance_scan_batch(1,'runner',null,$1,'stable-run') result",
      [ORG],
    );
    expect(first.succeeded).toBe(true);
    const duplicate = await rpc(
      "select public.run_retention_variance_scan_batch(1,'runner',null,$1,'stable-run') result",
      [ORG],
    );
    expect(duplicate.errorCode).toBe("scan_already_claimed");

    const runs = await client.query(
      "select state,project_limit,project_count,origin_count from public.retention_variance_scan_runs where correlation_id='stable-run'",
    );
    expect(runs.rows[0]).toMatchObject({
      state: "completed",
      project_limit: 1,
      project_count: 1,
      origin_count: 0,
    });
  });
});
