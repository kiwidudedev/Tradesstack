import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.RETENTION_PHASE4_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;
const USER = "f4100000-0000-4000-8000-000000000001";
const ORG = "f4100000-0000-4000-8000-000000000010";
const PROJECT = "f4100000-0000-4000-8000-000000000100";
const ORIGIN = "f4100000-0000-4000-8000-000000001001";

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  schedule?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  reminders?: Array<Record<string, unknown>>;
};

describeDatabase("Phase 4 schedule and reminder concurrency", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const first = new pg.Client({ connectionString: dbUrl });
  const second = new pg.Client({ connectionString: dbUrl });
  let activationSchedule = "";
  let activationRevision = 0;

  beforeAll(async () => {
    await Promise.all([setup.connect(), first.connect(), second.connect()]);
    await setup.query(
      `insert into auth.users
       (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'phase4-concurrency@example.test','',now(),'{}','{}')`, [USER],
    );
    await setup.query("delete from public.organizations where created_by=$1", [USER]);
    await setup.query(
      "insert into public.organizations(id,name,created_by,timezone) values($1,'P4 concurrency',$2,'Pacific/Auckland')",
      [ORG, USER],
    );
    await setup.query(
      "insert into public.organization_members(organization_id,user_id,role,display_name) values($1,$2,'owner','Owner')",
      [ORG, USER],
    );
    await setup.query(
      `insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
       values($1,$2,$3,'P4 concurrency','p4-concurrency','P4C')`,
      [PROJECT, ORG, USER],
    );
    await setup.query(
      `update public.organization_capabilities set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`, [ORG, USER],
    );
    await setup.query(
      `update public.project_retention_workflow_states set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=$3`, [ORG, USER, PROJECT],
    );
    await setup.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,claim_type,status,
        claim_date,claim_amount,retention_method,retention_percent,retention_withheld_amount,
        retention_released_amount,retention_held_to_date,retention_released_to_date,
        retention_balance,net_claim_excl_gst,gst_amount,total_payable
       ) values($1,$2,$3,$4,'P4C-CL-01','Origin','Progress','Submitted','2026-01-01',
       1000,'flat',10,100,0,100,0,100,900,135,1035)`,
      [ORIGIN, ORG, PROJECT, USER],
    );
    await Promise.all([configureUser(first), configureUser(second)]);

    let prepared = await rpc(first, "select public.create_retention_release_schedule($1::jsonb) result", [{
      projectId: PROJECT, name: "Activation race", triggerType: "fixed_date",
      entitlementMethod: "percentage", percentageBps: 10000,
      scheduledTriggerDate: "2026-01-01", confirmationRequired: false,
      scopePolicy: "all_current_origins",
    }]);
    activationSchedule = String(prepared.schedule?.id);
    prepared = await rpc(first, "select public.update_retention_release_schedule_draft($1::jsonb) result", [{
      scheduleId: activationSchedule, expectedRevision: prepared.schedule?.revision, status: "scheduled",
    }]);
    activationRevision = Number(prepared.schedule?.revision);
  });

  afterAll(async () => {
    await setup.query("set session_replication_role=replica");
    for (const table of [
      "retention_reminder_events", "retention_reminders", "retention_schedule_events",
      "project_retention_schedule_origins", "project_retention_release_schedules",
      "project_claims", "project_retention_workflow_states", "organization_capabilities",
      "organization_members", "organization_projects",
    ]) await setup.query(`delete from public.${table} where organization_id=$1`, [ORG]);
    await setup.query("delete from public.organizations where id=$1", [ORG]);
    await setup.query("delete from auth.users where id=$1", [USER]);
    await setup.query("set session_replication_role=origin");
    await Promise.all([setup.end(), first.end(), second.end()]);
  });

  async function configureUser(client: pg.Client) {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [USER]);
    await client.query("select set_config('request.jwt.claim.role','authenticated',false)");
    await client.query("select set_config('request.jwt.claim.retention_phase4_internal','true',false)");
  }

  async function rpc(client: pg.Client, sql: string, input?: Record<string, unknown>[]) {
    const values = input?.map((value) => JSON.stringify(value)) ?? [];
    const response = await client.query<{ result: Result }>(sql, values);
    return response.rows[0].result;
  }

  it("allocates distinct project schedule sequences under concurrent creation", async () => {
    const create = (client: pg.Client, name: string) => rpc(
      client, "select public.create_retention_release_schedule($1::jsonb) result", [{
        projectId: PROJECT, name, triggerType: "fixed_date",
        entitlementMethod: "percentage", percentageBps: 100,
        scheduledTriggerDate: "2026-01-01", confirmationRequired: false,
        scopePolicy: "explicit",
      }],
    );
    const [left, right] = await Promise.all([create(first, "Concurrent A"), create(second, "Concurrent B")]);
    expect(left.succeeded).toBe(true);
    expect(right.succeeded).toBe(true);
    expect([
      Number(left.schedule?.schedule_sequence),
      Number(right.schedule?.schedule_sequence),
    ].sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("serializes activation and returns one immutable winner", async () => {
    const activate = (client: pg.Client) => rpc(
      client, "select public.activate_retention_release_schedule($1::jsonb) result", [{
        scheduleId: activationSchedule, expectedRevision: activationRevision,
      }],
    );
    const results = await Promise.all([activate(first), activate(second)]);
    expect(results.filter((result) => result.succeeded)).toHaveLength(1);
    expect(results.filter((result) =>
      ["schedule_not_activatable", "concurrent_update"].includes(result.errorCode ?? ""),
    )).toHaveLength(1);
    const rows = await setup.query(
      "select count(*)::int count from public.project_retention_schedule_origins where schedule_id=$1 and activated_entitlement_amount is not null",
      [activationSchedule],
    );
    expect(rows.rows[0].count).toBe(1);
  });

  it("claims due reminders once across concurrent dispatchers", async () => {
    await Promise.all([
      first.query("select set_config('request.jwt.claim.role','service_role',false)"),
      second.query("select set_config('request.jwt.claim.role','service_role',false)"),
    ]);
    const select = (client: pg.Client) => rpc(
      client, "select public.select_due_retention_reminders(1,'concurrency') result",
    );
    const [left, right] = await Promise.all([select(first), select(second)]);
    const ids = [...(left.reminders ?? []), ...(right.reminders ?? [])].map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
