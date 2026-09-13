import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE7_DB_URL
  ?? process.env.RETENTION_PHASE6_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "a7000000-0000-4000-8000-000000000001";
const OTHER_OWNER_ID = "a7000000-0000-4000-8000-000000000002";
const ORGANIZATION_ID = "a7000000-0000-4000-8000-000000000010";
const OTHER_ORGANIZATION_ID = "a7000000-0000-4000-8000-000000000011";
const PROJECT_ID = "a7000000-0000-4000-8000-000000000100";
const OTHER_PROJECT_ID = "a7000000-0000-4000-8000-000000000101";
const ORIGIN_ID = "a7000000-0000-4000-8000-000000001001";

type Register = {
  succeeded: boolean;
  errorCode: string | null;
  projectId?: string;
  positionStateHash?: string;
  eligibilityStateHash?: string;
  rows?: Array<{
    originatingPaymentClaimId: string;
    claimNumber: string;
    currentRetentionOwned: number;
    currentEligibleRetention: number;
    nativeClaimedAmount: number;
    legacyReconciledAmount: number;
    remainingAmount: number;
    availableRetention: number;
    paidAmount: null;
    latestRetentionClaim: null;
    scheduleNames: string[];
    variance: null;
    legacyReconciliation: null;
  }>;
};

describeDatabase("Phase 7 Retention Register database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seed();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId: string | null) {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId ?? "",
    ]);
    await client.query("select set_config('request.jwt.claim.role',$1,true)", [
      userId ? "authenticated" : "",
    ]);
  }

  async function read(projectId = PROJECT_ID) {
    const result = await client.query<{ result: Register }>(
      "select public.get_project_retention_register($1) result",
      [projectId],
    );
    return result.rows[0].result;
  }

  async function seed() {
    await client.query(
      `insert into auth.users
        (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
         raw_app_meta_data,raw_user_meta_data)
       values
        ($1,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase7-owner@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase7-other@example.test','',now(),'{}','{}')`,
      [OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by=any($1::uuid[])",
      [[OWNER_ID, OTHER_OWNER_ID]],
    );
    await client.query(
      `insert into public.organizations(id,name,created_by)
       values ($1,'Phase 7',$3),($2,'Phase 7 Other',$4)`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id,user_id,role,display_name)
       values ($1,$3,'owner','Owner'),($2,$4,'owner','Other')`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_projects
        (id,organization_id,created_by,name,slug,project_code)
       values
        ($1,$3,$5,'Register','phase7-register','P7'),
        ($2,$4,$6,'Other','phase7-other','P7-O')`,
      [
        PROJECT_ID,
        OTHER_PROJECT_ID,
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        OTHER_OWNER_ID,
      ],
    );
    await client.query(
      `update public.organization_capabilities
       set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await client.query(
      `update public.project_retention_workflow_states
       set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=$3`,
      [ORGANIZATION_ID, OWNER_ID, PROJECT_ID],
    );
    await client.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,
        claim_type,status,claim_date,due_date,claim_amount,retention_method,
        retention_percent,retention_withheld_amount,retention_released_amount,
        retention_held_to_date,retention_released_to_date,retention_balance,
        net_claim_excl_gst,gst_amount,total_payable,created_at,updated_at
      ) values
        ($1,$2,$3,$4,'P7-PC-01','Retention origin','Progress','Submitted',
         '2026-01-15','2026-02-15',1000,'flat',10,100,0,100,0,100,
         900,135,1035,'2026-01-15T00:00:00Z','2026-01-15T01:00:00Z')`,
      [ORIGIN_ID, ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
  }

  it("returns accumulated held retention with zero paid attribution before reconciliation", async () => {
    await asUser(OWNER_ID);
    const first = await read();
    const second = await read();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      succeeded: true,
      errorCode: null,
      projectId: PROJECT_ID,
    });
    expect(first.positionStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.eligibilityStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rows).toEqual([
      expect.objectContaining({
        originatingPaymentClaimId: ORIGIN_ID,
        claimNumber: "P7-PC-01",
        currentRetentionOwned: 100,
        // 20260726310000 made accumulated held retention less immutable prior
        // claims authoritative; release schedules are planning metadata only.
        currentEligibleRetention: 100,
        nativeClaimedAmount: 0,
        legacyReconciledAmount: 0,
        remainingAmount: 100,
        availableRetention: 100,
        paidAmount: 0,
        latestRetentionClaim: null,
        scheduleNames: [],
        variance: null,
        legacyReconciliation: null,
      }),
    ]);
  });

  it("does not expose another tenant and honors a disabled capability", async () => {
    await asUser(OTHER_OWNER_ID);
    expect(await read()).toMatchObject({
      succeeded: false,
      errorCode: "schedule_not_found",
    });

    await asUser(OWNER_ID);
    await client.query(
      `update public.organization_capabilities
       set enabled=false,enabled_by=null,enabled_at=null
       where organization_id=$1 and capability_key='retention_management'`,
      [ORGANIZATION_ID],
    );
    expect(await read()).toMatchObject({
      succeeded: false,
      errorCode: "capability_disabled",
    });
  });

  it("does not change the authoritative Payment Claim row", async () => {
    const result = await client.query<{
      retention_withheld_amount: string;
      retention_released_amount: string;
      retention_balance: string;
      updated_at: Date;
    }>(
      `select retention_withheld_amount,retention_released_amount,
        retention_balance,updated_at
       from public.project_claims where id=$1`,
      [ORIGIN_ID],
    );
    expect(result.rows[0]).toMatchObject({
      retention_withheld_amount: "100.00",
      retention_released_amount: "0.00",
      retention_balance: "100.00",
    });
    expect(result.rows[0].updated_at.toISOString()).toBe(
      "2026-01-15T01:00:00.000Z",
    );
  });
});
