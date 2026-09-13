import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.DOCUMENT_WORKSPACE_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_A = "e5000000-0000-4000-8000-000000000001";
const ADMIN_A = "e5000000-0000-4000-8000-000000000002";
const OWNER_B = "e5000000-0000-4000-8000-000000000003";
const ORG_A = "e5000000-0000-4000-8000-000000000010";
const ORG_B = "e5000000-0000-4000-8000-000000000011";
const OPPORTUNITY_A = "e5000000-0000-4000-8000-000000000100";
const OPPORTUNITY_B = "e5000000-0000-4000-8000-000000000101";

type Reservation = {
  node_id: string;
  version_id: string;
  storage_key: string;
  byte_size: string;
  claimed_mime_type: string;
};

describeDatabase("shared document workspace Phase 5 lifecycle behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const owner = new pg.Client({ connectionString: dbUrl });
  const admin = new pg.Client({ connectionString: dbUrl });
  const service = new pg.Client({ connectionString: dbUrl });
  let workspaceId = "";

  beforeAll(async () => {
    await Promise.all([
      setup.connect(),
      owner.connect(),
      admin.connect(),
      service.connect(),
    ]);
    await seed();
    await configureUser(owner, OWNER_A, "authenticated");
    await configureUser(admin, ADMIN_A, "authenticated");
    await configureUser(service, null, "service_role");
    const result = await owner.query<{ workspace_id: string }>(
      "select public.get_or_create_opportunity_document_workspace($1) as workspace_id",
      [OPPORTUNITY_A],
    );
    workspaceId = result.rows[0].workspace_id;
    await setup.query(
      `insert into public.organization_document_storage_usage(
        organization_id,quota_bytes
      ) values($1,150)
      on conflict (organization_id) do update set quota_bytes=excluded.quota_bytes`,
      [ORG_A],
    );
  });

  afterAll(async () => {
    await cleanup();
    await Promise.all([
      owner.end(),
      admin.end(),
      service.end(),
      setup.end(),
    ]);
  });

  async function configureUser(
    client: pg.Client,
    userId: string | null,
    role: "authenticated" | "service_role",
  ) {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      userId ?? "",
    ]);
    await client.query("select set_config('request.jwt.claim.role',$1,false)", [
      role,
    ]);
    await client.query(`set role ${role}`);
  }

  async function cleanup() {
    await setup.query("set session_replication_role=replica");
    await setup.query(
      "delete from storage.objects where name like 'e5000000-%'",
    );
    for (const table of [
      "document_storage_reconciliation_findings",
      "document_activity_events",
      "document_storage_cleanup_jobs",
      "document_storage_cleanup_batches",
      "document_versions",
      "document_nodes",
      "document_workspace_entities",
      "document_workspaces",
      "organization_document_storage_usage",
    ]) {
      await setup.query(
        `delete from public.${table} where organization_id=any($1::uuid[])`,
        [[ORG_A, ORG_B]],
      );
    }
    await setup.query(
      "delete from public.organization_opportunities where id=any($1::uuid[])",
      [[OPPORTUNITY_A, OPPORTUNITY_B]],
    );
    await setup.query(
      `delete from public.organization_members
       where organization_id=any($1::uuid[]) or user_id=any($2::uuid[])`,
      [[ORG_A, ORG_B], [OWNER_A, ADMIN_A, OWNER_B]],
    );
    await setup.query(
      `delete from public.organizations
       where id=any($1::uuid[]) or created_by=any($2::uuid[])`,
      [[ORG_A, ORG_B], [OWNER_A, ADMIN_A, OWNER_B]],
    );
    await setup.query(
      "delete from auth.users where id=any($1::uuid[])",
      [[OWNER_A, ADMIN_A, OWNER_B]],
    );
    await setup.query("set session_replication_role=origin");
  }

  async function seed() {
    await cleanup();
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values
        ($1,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase5-owner-a@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase5-admin-a@example.test','',now(),'{}','{}'),
        ($3,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase5-owner-b@example.test','',now(),'{}','{}')`,
      [OWNER_A, ADMIN_A, OWNER_B],
    );
    await setup.query(
      "delete from public.organizations where created_by=any($1::uuid[])",
      [[OWNER_A, ADMIN_A, OWNER_B]],
    );
    await setup.query(
      `insert into public.organizations(id,name,created_by)
       values($1,'Phase 5 Org A',$3),($2,'Phase 5 Org B',$4)`,
      [ORG_A, ORG_B, OWNER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values
        ($1,$3,'owner','Phase 5 Owner A'),
        ($1,$4,'admin','Phase 5 Admin A'),
        ($2,$5,'owner','Phase 5 Owner B')`,
      [ORG_A, ORG_B, OWNER_A, ADMIN_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,name,slug
      ) values
        ($1,$3,$5,'Phase 5 Opportunity A','phase-5-opportunity-a'),
        ($2,$4,$6,'Phase 5 Opportunity B','phase-5-opportunity-b')`,
      [OPPORTUNITY_A, OPPORTUNITY_B, ORG_A, ORG_B, OWNER_A, OWNER_B],
    );
  }

  async function initiate(
    client: pg.Client,
    name: string,
    size: number,
  ): Promise<Reservation> {
    const result = await client.query<Reservation>(
      `select * from public.initiate_document_upload(
        $1,null,null,$2,'application/pdf','pdf',$3,null,$4
      )`,
      [OPPORTUNITY_A, name, size, crypto.randomUUID()],
    );
    return result.rows[0];
  }

  async function activate(reservation: Reservation) {
    const objectId = crypto.randomUUID();
    await setup.query(
      `insert into storage.objects(id,bucket_id,name,owner,metadata)
       values($1,'organization-documents',$2,$3,$4::jsonb)`,
      [
        objectId,
        reservation.storage_key,
        OWNER_A,
        JSON.stringify({
          size: Number(reservation.byte_size),
          mimetype: reservation.claimed_mime_type,
          eTag: `"${objectId}"`,
        }),
      ],
    );
    await setup.query(
      "select * from public.complete_document_upload($1,$2)",
      [reservation.version_id, OWNER_A],
    );
  }

  async function expectError(
    action: () => Promise<unknown>,
    pattern: RegExp,
  ) {
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(pattern);
  }

  it("reserves quota atomically and releases failed reservations", async () => {
    const first = await initiate(owner, "Quota One.pdf", 100);
    await expectError(
      () => initiate(owner, "Quota Two.pdf", 60),
      /storage quota exceeded/i,
    );
    const pending = await owner.query<{ pending_bytes: string }>(
      "select pending_bytes from public.get_document_storage_usage($1)",
      [workspaceId],
    );
    expect(Number(pending.rows[0].pending_bytes)).toBe(100);

    await owner.query(
      "select public.mark_document_upload_failed($1,'test_failure','test',false)",
      [first.version_id],
    );
    const released = await owner.query<{ pending_bytes: string }>(
      "select pending_bytes from public.get_document_storage_usage($1)",
      [workspaceId],
    );
    expect(Number(released.rows[0].pending_bytes)).toBe(0);
  });

  it("lists and restores whole deletion batches with correct usage", async () => {
    const active = await initiate(owner, "Lifecycle.pdf", 100);
    await activate(active);
    await owner.query("select public.soft_delete_document_node($1)", [
      active.node_id,
    ]);

    const deleted = await owner.query<{
      root_node_id: string;
      item_count: string;
      deleted_by_name: string;
    }>(
      `select root_node_id,item_count,deleted_by_name
       from public.list_deleted_document_batches($1)`,
      [workspaceId],
    );
    expect(deleted.rows).toHaveLength(1);
    expect(deleted.rows[0].root_node_id).toBe(active.node_id);
    expect(Number(deleted.rows[0].item_count)).toBe(1);
    expect(deleted.rows[0].deleted_by_name).toBe("Phase 5 Owner A");

    const usage = await owner.query<{
      active_bytes: string;
      deleted_bytes: string;
    }>("select active_bytes,deleted_bytes from public.get_document_storage_usage($1)", [
      workspaceId,
    ]);
    expect(Number(usage.rows[0].active_bytes)).toBe(0);
    expect(Number(usage.rows[0].deleted_bytes)).toBe(100);

    await owner.query("select public.restore_document_node($1)", [active.node_id]);
    const activeUsage = await owner.query<{
      active_bytes: string;
      deleted_bytes: string;
    }>("select active_bytes,deleted_bytes from public.get_document_storage_usage($1)", [
      workspaceId,
    ]);
    expect(Number(activeUsage.rows[0].active_bytes)).toBe(100);
    expect(Number(activeUsage.rows[0].deleted_bytes)).toBe(0);
  });

  it("rejects restore name conflicts and cross-organization deleted access", async () => {
    const original = await owner.query<{ id: string }>(
      "select (public.create_document_folder($1,null,'Restore Conflict')).id",
      [workspaceId],
    );
    await owner.query("select public.soft_delete_document_node($1)", [
      original.rows[0].id,
    ]);
    await owner.query(
      "select public.create_document_folder($1,null,'restore conflict')",
      [workspaceId],
    );
    await expectError(
      () => owner.query("select public.restore_document_node($1)", [
        original.rows[0].id,
      ]),
      /same name|restore destination/i,
    );

    const ownerB = new pg.Client({ connectionString: dbUrl });
    await ownerB.connect();
    await configureUser(ownerB, OWNER_B, "authenticated");
    await expectError(
      () => ownerB.query(
        "select * from public.list_deleted_document_batches($1)",
        [workspaceId],
      ),
      /access denied/i,
    );
    await ownerB.end();
  });

  it("purges metadata asynchronously, idempotently, and preserves audit history", async () => {
    const node = await owner.query<{ id: string }>(
      `select id from public.document_nodes
       where workspace_id=$1 and display_name='Lifecycle.pdf'`,
      [workspaceId],
    );
    const nodeId = node.rows[0].id;
    await owner.query("select public.soft_delete_document_node($1)", [nodeId]);

    await expectError(
      () => admin.query("select public.purge_document_node($1)", [nodeId]),
      /access denied/i,
    );

    const purged = await owner.query<{ cleanup_batch_id: string }>(
      "select public.purge_document_node($1) as cleanup_batch_id",
      [nodeId],
    );
    const batchId = purged.rows[0].cleanup_batch_id;
    const repeated = await owner.query<{ cleanup_batch_id: string }>(
      "select public.purge_document_node($1) as cleanup_batch_id",
      [nodeId],
    );
    expect(repeated.rows[0].cleanup_batch_id).toBe(batchId);

    const metadata = await setup.query(
      "select 1 from public.document_nodes where id=$1",
      [nodeId],
    );
    expect(metadata.rowCount).toBe(0);
    const queued = await setup.query<{
      processing_status: string;
      byte_size: string;
    }>(
      `select processing_status,byte_size
       from public.document_storage_cleanup_jobs
       where cleanup_batch_id=$1`,
      [batchId],
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0].processing_status).toBe("pending");
    expect(Number(queued.rows[0].byte_size)).toBe(100);

    const audit = await setup.query<{ event_type: string; node_id: string | null }>(
      `select event_type,node_id
       from public.document_activity_events
       where workspace_id=$1 and event_type='purge_requested'`,
      [workspaceId],
    );
    expect(audit.rows).toContainEqual({
      event_type: "purge_requested",
      node_id: nodeId,
    });
  });

  it("claims, completes, and dead-letters cleanup jobs under service-only leases", async () => {
    const claimed = await service.query<{
      job_id: string;
      claim_token: string;
      storage_key: string;
      cleanup_batch_id: string | null;
    }>(
      "select job_id,claim_token,storage_key,cleanup_batch_id from public.claim_document_storage_cleanup_jobs(10,'phase5-test',300)",
    );
    const purgeJob = claimed.rows.find((row) => row.cleanup_batch_id !== null);
    expect(purgeJob).toBeDefined();
    await setup.query("set session_replication_role=replica");
    await setup.query(
      "delete from storage.objects where bucket_id='organization-documents' and name=$1",
      [purgeJob!.storage_key],
    );
    await setup.query("set session_replication_role=origin");
    await service.query(
      "select public.complete_document_storage_cleanup_job($1,$2)",
      [purgeJob!.job_id, purgeJob!.claim_token],
    );

    const usage = await owner.query<{ deleted_bytes: string }>(
      "select deleted_bytes from public.get_document_storage_usage($1)",
      [workspaceId],
    );
    expect(Number(usage.rows[0].deleted_bytes)).toBe(0);
    const completed = await setup.query<{ processing_status: string }>(
      `select processing_status
       from public.document_storage_cleanup_batches
       where workspace_id=$1`,
      [workspaceId],
    );
    expect(completed.rows[0].processing_status).toBe("completed");

    await setup.query(
      `insert into public.document_storage_cleanup_jobs(
        organization_id,workspace_id,job_type,job_identity,
        storage_key,max_attempts
      ) values($1,$2,'orphan_reconciliation',$3,$4,1)`,
      [ORG_A, workspaceId, `dead-letter-${crypto.randomUUID()}`, `${ORG_A}/${workspaceId}/${crypto.randomUUID()}`],
    );
    const deadClaim = await service.query<{ job_id: string; claim_token: string }>(
      "select job_id,claim_token from public.claim_document_storage_cleanup_jobs(10,'phase5-test',300)",
    );
    const last = deadClaim.rows.at(-1)!;
    const failed = await service.query<{ state: string }>(
      "select public.fail_document_storage_cleanup_job($1,$2,'test','test') as state",
      [last.job_id, last.claim_token],
    );
    expect(failed.rows[0].state).toBe("dead_lettered");
  });

  it("reconciles orphan objects without authorizing destructive repair", async () => {
    const orphanKey = `${ORG_A}/${workspaceId}/${crypto.randomUUID()}`;
    await setup.query(
      `insert into storage.objects(id,bucket_id,name,owner,metadata)
       values($1,'organization-documents',$2,$3,'{"size":12}'::jsonb)`,
      [crypto.randomUUID(), orphanKey, OWNER_A],
    );
    const failedVersion = await setup.query<{
      id: string;
      storage_key: string;
      byte_size: string;
    }>(
      `select id,storage_key,byte_size
       from public.document_versions
       where organization_id=$1 and upload_state in ('failed','abandoned')
       order by created_at
       limit 1`,
      [ORG_A],
    );
    if (failedVersion.rows[0]) {
      await setup.query(
        `insert into storage.objects(id,bucket_id,name,owner,metadata)
         values($1,'organization-documents',$2,$3,$4::jsonb)
         on conflict (bucket_id,name) do nothing`,
        [
          crypto.randomUUID(),
          failedVersion.rows[0].storage_key,
          OWNER_A,
          JSON.stringify({ size: Number(failedVersion.rows[0].byte_size) }),
        ],
      );
    }
    const result = await service.query<{ result: Record<string, number> }>(
      "select public.reconcile_document_storage_catalog(100) as result",
    );
    expect(result.rows[0].result.orphanObjectCount).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].result.metadataMismatchCount).toBeGreaterThanOrEqual(1);
    const finding = await setup.query<{ details: { destructiveRepairAllowed: boolean } }>(
      `select details
       from public.document_storage_reconciliation_findings
       where storage_key=$1`,
      [orphanKey],
    );
    expect(finding.rows[0].details.destructiveRepairAllowed).toBe(false);
    const objectStillExists = await setup.query(
      "select 1 from storage.objects where bucket_id='organization-documents' and name=$1",
      [orphanKey],
    );
    expect(objectStillExists.rowCount).toBe(1);
    const wrongState = await setup.query(
      `select 1
       from public.document_storage_reconciliation_findings
       where version_id=$1 and discrepancy_type='wrong_state'`,
      [failedVersion.rows[0]?.id ?? null],
    );
    expect(wrongState.rowCount).toBe(failedVersion.rows[0] ? 1 : 0);
  });

  it("serializes concurrent reservations against one organization allowance", async () => {
    await setup.query(
      `delete from public.document_storage_cleanup_jobs
       where organization_id=$1`,
      [ORG_A],
    );
    await setup.query(
      `delete from public.document_versions
       where organization_id=$1 and upload_state <> 'active'`,
      [ORG_A],
    );
    await service.query("select public.reconcile_document_storage_usage($1)", [
      ORG_A,
    ]);
    await setup.query(
      `update public.organization_document_storage_usage
       set quota_bytes=150
       where organization_id=$1`,
      [ORG_A],
    );

    const left = new pg.Client({ connectionString: dbUrl });
    const right = new pg.Client({ connectionString: dbUrl });
    await Promise.all([left.connect(), right.connect()]);
    await Promise.all([
      configureUser(left, OWNER_A, "authenticated"),
      configureUser(right, OWNER_A, "authenticated"),
    ]);
    const results = await Promise.allSettled([
      initiate(left, "Concurrent Left.pdf", 100),
      initiate(right, "Concurrent Right.pdf", 100),
    ]);
    await Promise.all([left.end(), right.end()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
