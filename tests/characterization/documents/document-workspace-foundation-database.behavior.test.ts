import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.DOCUMENT_WORKSPACE_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_A = "d1000000-0000-4000-8000-000000000001";
const WORKER_A = "d1000000-0000-4000-8000-000000000002";
const OWNER_B = "d1000000-0000-4000-8000-000000000003";
const EXTRA_OWNER = "d1000000-0000-4000-8000-000000000004";
const ORG_A = "d1000000-0000-4000-8000-000000000010";
const ORG_B = "d1000000-0000-4000-8000-000000000011";
const OPPORTUNITY_A = "d1000000-0000-4000-8000-000000000100";
const OPPORTUNITY_A_SECOND = "d1000000-0000-4000-8000-000000000101";
const OPPORTUNITY_B = "d1000000-0000-4000-8000-000000000102";
const PROJECT_A = "d1000000-0000-4000-8000-000000000200";
const PROJECT_A_CONFLICT = "d1000000-0000-4000-8000-000000000201";

describeDatabase("shared document workspace Phase 1 database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const owner = new pg.Client({ connectionString: dbUrl });
  let workspaceA = "";
  let workspaceASecond = "";
  let rootFolder = "";
  let nestedFolder = "";
  let fileNode = "";
  let versionId = "";

  beforeAll(async () => {
    await Promise.all([setup.connect(), owner.connect()]);
    await seed();
    await configureUser(owner, OWNER_A);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await Promise.all([owner.end(), setup.end()]);
  });

  async function cleanupFixtures() {
    await setup.query("set session_replication_role=replica");
    for (const table of [
      "document_activity_events",
      "document_storage_cleanup_jobs",
      "document_versions",
      "document_nodes",
      "document_workspace_entities",
      "document_workspaces",
    ]) {
      await setup.query(
        `delete from public.${table} where organization_id = any($1::uuid[])`,
        [[ORG_A, ORG_B]],
      );
    }
    await setup.query(
      "delete from public.organization_projects where id = any($1::uuid[])",
      [[PROJECT_A, PROJECT_A_CONFLICT]],
    );
    await setup.query(
      "delete from public.organization_opportunities where id = any($1::uuid[])",
      [[OPPORTUNITY_A, OPPORTUNITY_A_SECOND, OPPORTUNITY_B]],
    );
    await setup.query(
      "delete from public.organization_members where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])",
      [
        [ORG_A, ORG_B],
        [OWNER_A, WORKER_A, OWNER_B, EXTRA_OWNER],
      ],
    );
    await setup.query(
      "delete from public.organizations where id = any($1::uuid[]) or created_by = any($2::uuid[])",
      [
        [ORG_A, ORG_B],
        [OWNER_A, WORKER_A, OWNER_B, EXTRA_OWNER],
      ],
    );
    await setup.query(
      "delete from auth.users where id = any($1::uuid[])",
      [[OWNER_A, WORKER_A, OWNER_B, EXTRA_OWNER]],
    );
    await setup.query("set session_replication_role=origin");
  }

  async function seed() {
    await cleanupFixtures();
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values
        ($1,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','document-owner-a@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','document-worker-a@example.test','',now(),'{}','{}'),
        ($3,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','document-owner-b@example.test','',now(),'{}','{}'),
        ($4,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','document-extra@example.test','',now(),'{}','{}')`,
      [OWNER_A, WORKER_A, OWNER_B, EXTRA_OWNER],
    );
    await setup.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_A, WORKER_A, OWNER_B, EXTRA_OWNER]],
    );
    await setup.query(
      `insert into public.organizations(id,name,created_by)
       values($1,'Document Org A',$3),($2,'Document Org B',$4)`,
      [ORG_A, ORG_B, OWNER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values
        ($1,$3,'owner','Document Owner A'),
        ($1,$4,'worker','Document Worker A'),
        ($2,$5,'owner','Document Owner B')`,
      [ORG_A, ORG_B, OWNER_A, WORKER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,name,slug
      ) values
        ($1,$4,$6,'Document Opportunity A','document-opportunity-a'),
        ($2,$4,$6,'Document Opportunity A Second','document-opportunity-a-second'),
        ($3,$5,$7,'Document Opportunity B','document-opportunity-b')`,
      [
        OPPORTUNITY_A,
        OPPORTUNITY_A_SECOND,
        OPPORTUNITY_B,
        ORG_A,
        ORG_B,
        OWNER_A,
        OWNER_B,
      ],
    );
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,source_opportunity_id
      ) values
        ($1,$3,$4,'Document Project A','document-project-a',$5),
        ($2,$3,$4,'Document Project Conflict','document-project-conflict',$5)`,
      [PROJECT_A, PROJECT_A_CONFLICT, ORG_A, OWNER_A, OPPORTUNITY_A],
    );
  }

  async function configureUser(client: pg.Client, userId: string | null) {
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [userId ?? ""],
    );
    await client.query(
      "select set_config('request.jwt.claim.role',$1,false)",
      [userId ? "authenticated" : "anon"],
    );
    await client.query(userId ? "set role authenticated" : "set role anon");
  }

  async function createUserClient(userId: string | null) {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await configureUser(client, userId);
    return client;
  }

  async function expectDatabaseError(
    action: () => Promise<unknown>,
    messagePattern?: RegExp,
  ) {
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    if (messagePattern) {
      expect((caught as Error).message).toMatch(messagePattern);
    }
  }

  async function createFolder(
    client: pg.Client,
    workspaceId: string,
    parentId: string | null,
    name: string,
  ) {
    const result = await client.query<{ id: string }>(
      "select (public.create_document_folder($1,$2,$3)).id",
      [workspaceId, parentId, name],
    );
    return result.rows[0].id;
  }

  it("creates exactly one Opportunity workspace under concurrent authorized calls", async () => {
    const left = await createUserClient(OWNER_A);
    const right = await createUserClient(OWNER_A);
    try {
      const [first, second] = await Promise.all([
        left.query<{ workspace_id: string }>(
          "select public.get_or_create_opportunity_document_workspace($1) workspace_id",
          [OPPORTUNITY_A],
        ),
        right.query<{ workspace_id: string }>(
          "select public.get_or_create_opportunity_document_workspace($1) workspace_id",
          [OPPORTUNITY_A],
        ),
      ]);
      workspaceA = first.rows[0].workspace_id;
      expect(second.rows[0].workspace_id).toBe(workspaceA);

      const counts = await setup.query<{
        workspace_count: string;
        link_count: string;
      }>(
        `select
          (select count(*) from public.document_workspaces
           where organization_id=$1) workspace_count,
          (select count(*) from public.document_workspace_entities
           where opportunity_id=$2) link_count`,
        [ORG_A, OPPORTUNITY_A],
      );
      expect(Number(counts.rows[0].workspace_count)).toBe(1);
      expect(Number(counts.rows[0].link_count)).toBe(1);
    } finally {
      await Promise.all([left.end(), right.end()]);
    }
  });

  it("returns the same workspace on repeated calls without duplicate events", async () => {
    const before = await setup.query(
      "select count(*)::integer count from public.document_activity_events where workspace_id=$1",
      [workspaceA],
    );
    const repeated = await owner.query<{ workspace_id: string }>(
      "select public.get_or_create_opportunity_document_workspace($1) workspace_id",
      [OPPORTUNITY_A],
    );
    const after = await setup.query(
      "select count(*)::integer count from public.document_activity_events where workspace_id=$1",
      [workspaceA],
    );
    expect(repeated.rows[0].workspace_id).toBe(workspaceA);
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("rejects cross-organization and unauthenticated workspace creation", async () => {
    await expectDatabaseError(
      () => owner.query(
        "select public.get_or_create_opportunity_document_workspace($1)",
        [OPPORTUNITY_B],
      ),
      /not found|access denied/i,
    );

    const anonymous = await createUserClient(null);
    try {
      await expectDatabaseError(
        () => anonymous.query(
          "select public.get_or_create_opportunity_document_workspace($1)",
          [OPPORTUNITY_A],
        ),
        /authentication required|permission denied/i,
      );
    } finally {
      await anonymous.end();
    }
  });

  it("rejects a same-organization role without files.write", async () => {
    const worker = await createUserClient(WORKER_A);
    try {
      await expectDatabaseError(
        () => worker.query(
          "select public.get_or_create_opportunity_document_workspace($1)",
          [OPPORTUNITY_A],
        ),
        /not found|access denied/i,
      );
    } finally {
      await worker.end();
    }
  });

  it("creates root and nested folders", async () => {
    rootFolder = await createFolder(owner, workspaceA, null, "Contracts");
    nestedFolder = await createFolder(owner, workspaceA, rootFolder, "Executed");

    const rows = await owner.query(
      `select id,parent_node_id,kind,normalized_name
       from public.document_nodes
       where id=any($1::uuid[])
       order by parent_node_id nulls first`,
      [[rootFolder, nestedFolder]],
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({
        id: rootFolder,
        parent_node_id: null,
        kind: "folder",
        normalized_name: "contracts",
      }),
      expect.objectContaining({
        id: nestedFolder,
        parent_node_id: rootFolder,
        kind: "folder",
        normalized_name: "executed",
      }),
    ]);
  });

  it("rejects duplicate root and child names case-insensitively", async () => {
    await expectDatabaseError(
      () => createFolder(owner, workspaceA, null, "CONTRACTS"),
      /document_nodes_active_root_name_uidx|duplicate key/i,
    );
    await expectDatabaseError(
      () => createFolder(owner, workspaceA, rootFolder, "executed"),
      /document_nodes_active_child_name_uidx|duplicate key/i,
    );
  });

  it("trims visible names and rejects reserved, path, control, and oversized names", async () => {
    const trimmed = await createFolder(owner, workspaceA, null, "  Drawings  ");
    const row = await owner.query<{ display_name: string; normalized_name: string }>(
      "select display_name,normalized_name from public.document_nodes where id=$1",
      [trimmed],
    );
    expect(row.rows[0]).toEqual({
      display_name: "Drawings",
      normalized_name: "drawings",
    });

    for (const invalidName of [
      ".",
      "..",
      "folder/name",
      "folder\\name",
      "control\u0007name",
      "x".repeat(251),
    ]) {
      await expectDatabaseError(
        () => createFolder(owner, workspaceA, null, invalidName),
        /document_nodes_name|violates check constraint/i,
      );
    }
  });

  it("allows the same active name in different folders", async () => {
    const otherParent = await createFolder(owner, workspaceA, null, "Design");
    const sameName = await createFolder(owner, workspaceA, otherParent, "Executed");
    expect(sameName).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("prevents a file and folder from sharing the same active namespace", async () => {
    const inserted = await setup.query<{ id: string }>(
      `insert into public.document_nodes(
        organization_id,workspace_id,parent_node_id,kind,display_name,
        created_by,updated_by
      ) values($1,$2,$3,'file','Tender.pdf',$4,$4)
      returning id`,
      [ORG_A, workspaceA, rootFolder, OWNER_A],
    );
    fileNode = inserted.rows[0].id;

    await expectDatabaseError(
      () => createFolder(owner, workspaceA, rootFolder, "TENDER.PDF"),
      /document_nodes_active_child_name_uidx|duplicate key/i,
    );
  });

  it("rejects cross-workspace parents and file parents at the database layer", async () => {
    const second = await owner.query<{ workspace_id: string }>(
      "select public.get_or_create_opportunity_document_workspace($1) workspace_id",
      [OPPORTUNITY_A_SECOND],
    );
    workspaceASecond = second.rows[0].workspace_id;
    const secondRoot = await createFolder(owner, workspaceASecond, null, "Second Root");

    await expectDatabaseError(
      () => setup.query(
        `insert into public.document_nodes(
          organization_id,workspace_id,parent_node_id,kind,display_name,
          created_by,updated_by
        ) values($1,$2,$3,'folder','Cross workspace',$4,$4)`,
        [ORG_A, workspaceA, secondRoot, OWNER_A],
      ),
      /parent|foreign key/i,
    );

    await expectDatabaseError(
      () => setup.query(
        `insert into public.document_nodes(
          organization_id,workspace_id,parent_node_id,kind,display_name,
          created_by,updated_by
        ) values($1,$2,$3,'folder','File child',$4,$4)`,
        [ORG_A, workspaceA, fileNode, OWNER_A],
      ),
      /file cannot be used.*parent/i,
    );
  });

  it("rejects moving a folder into itself or a descendant", async () => {
    await expectDatabaseError(
      () => owner.query("select public.move_document_node($1,$1)", [rootFolder]),
      /itself or its descendant/i,
    );
    await expectDatabaseError(
      () => owner.query(
        "select public.move_document_node($1,$2)",
        [rootFolder, nestedFolder],
      ),
      /itself or its descendant/i,
    );
  });

  it("enforces active-parent and deleted-subtree consistency outside RPCs", async () => {
    await expectDatabaseError(
      () => setup.query(
        `update public.document_nodes
         set deleted_at=now(),deleted_by=$2,deletion_batch_id=gen_random_uuid()
         where id=$1`,
        [rootFolder, OWNER_A],
      ),
      /deleted folder cannot contain active/i,
    );

    const parent = await createFolder(owner, workspaceA, null, "Consistency Parent");
    const child = await createFolder(owner, workspaceA, parent, "Consistency Child");
    await owner.query("select public.soft_delete_document_node($1)", [parent]);
    await expectDatabaseError(
      () => setup.query(
        `update public.document_nodes
         set deleted_at=null,deleted_by=null,deletion_batch_id=null
         where id=$1`,
        [child],
      ),
      /active document node requires an active parent/i,
    );
  });

  it("serializes concurrent rename collisions and accepts exactly one", async () => {
    const firstNode = await createFolder(owner, workspaceA, null, "Rename A");
    const secondNode = await createFolder(owner, workspaceA, null, "Rename B");
    const left = await createUserClient(OWNER_A);
    const right = await createUserClient(OWNER_A);
    try {
      const results = await Promise.allSettled([
        left.query("select public.rename_document_node($1,$2)", [
          firstNode,
          "Collision",
        ]),
        right.query("select public.rename_document_node($1,$2)", [
          secondNode,
          "COLLISION",
        ]),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    } finally {
      await Promise.all([left.end(), right.end()]);
    }
  });

  it("soft deletes a subtree, hides it from active queries, and restores it", async () => {
    const deleteRoot = await createFolder(owner, workspaceA, null, "Restore Me");
    const deleteChild = await createFolder(owner, workspaceA, deleteRoot, "Child");
    const result = await owner.query<{ deletion_batch: string }>(
      "select public.soft_delete_document_node($1) deletion_batch",
      [deleteRoot],
    );
    expect(result.rows[0].deletion_batch).toMatch(/^[0-9a-f-]{36}$/);

    const active = await owner.query(
      "select id from public.document_nodes where id=any($1::uuid[]) and deleted_at is null",
      [[deleteRoot, deleteChild]],
    );
    expect(active.rowCount).toBe(0);

    const restored = await owner.query<{ restored_count: number }>(
      "select public.restore_document_node($1) restored_count",
      [deleteRoot],
    );
    expect(restored.rows[0].restored_count).toBe(2);
  });

  it("allows deleted-name reuse and safely rejects restoration after reuse", async () => {
    const original = await createFolder(owner, workspaceA, null, "Reusable");
    await owner.query("select public.soft_delete_document_node($1)", [original]);
    const replacement = await createFolder(owner, workspaceA, null, "REUSABLE");
    expect(replacement).not.toBe(original);

    await expectDatabaseError(
      () => owner.query("select public.restore_document_node($1)", [original]),
      /same name already exists/i,
    );
  });

  it("enforces unique immutable version identities and storage keys", async () => {
    const version = await setup.query<{ id: string }>(
      `insert into public.document_versions(
        organization_id,workspace_id,node_id,version_number,storage_key,
        upload_state,byte_size,claimed_mime_type,verified_mime_type,
        file_extension,sha256_checksum,uploaded_by,uploaded_at,verified_at,
        storage_object_id,activated_at
      ) values(
        $1,$2,$3,1,$4,'active',12,'application/pdf','application/pdf',
        'pdf',$5,$6,now(),now(),gen_random_uuid(),now()
      ) returning id`,
      [
        ORG_A,
        workspaceA,
        fileNode,
        `${ORG_A}/${workspaceA}/d1000000-0000-4000-8000-000000009001`,
        "a".repeat(64),
        OWNER_A,
      ],
    );
    versionId = version.rows[0].id;

    await expectDatabaseError(
      () => setup.query(
        `insert into public.document_versions(
          organization_id,workspace_id,node_id,version_number,storage_key,
          uploaded_by
        ) values($1,$2,$3,1,$4,$5)`,
        [
          ORG_A,
          workspaceA,
          fileNode,
          `${ORG_A}/${workspaceA}/d1000000-0000-4000-8000-000000009002`,
          OWNER_A,
        ],
      ),
      /document_versions_node_version_unique|duplicate key/i,
    );
    await expectDatabaseError(
      () => setup.query(
        "update public.document_versions set version_number=2 where id=$1",
        [versionId],
      ),
      /identity is immutable/i,
    );
    await expectDatabaseError(
      () => setup.query(
        "update public.document_versions set uploaded_at=uploaded_at + interval '1 second' where id=$1",
        [versionId],
      ),
      /content metadata is immutable/i,
    );

    const anotherFile = await setup.query<{ id: string }>(
      `insert into public.document_nodes(
        organization_id,workspace_id,kind,display_name,created_by,updated_by
      ) values($1,$2,'file','Another.pdf',$3,$3) returning id`,
      [ORG_A, workspaceA, OWNER_A],
    );
    const storageKey = `${ORG_A}/${workspaceA}/d1000000-0000-4000-8000-000000009001`;
    await expectDatabaseError(
      () => setup.query(
        `insert into public.document_versions(
          organization_id,workspace_id,node_id,version_number,storage_key,uploaded_by
        ) values($1,$2,$3,1,$4,$5)`,
        [ORG_A, workspaceA, anotherFile.rows[0].id, storageKey, OWNER_A],
      ),
      /document_versions_storage_key_unique|duplicate key/i,
    );
  });

  it("prevents cross-organization version reads through RLS", async () => {
    const otherOrg = await createUserClient(OWNER_B);
    try {
      const result = await otherOrg.query(
        "select id from public.document_versions where id=$1",
        [versionId],
      );
      expect(result.rowCount).toBe(0);
    } finally {
      await otherOrg.end();
    }
  });

  it("prevents activity-event mutation and ordinary cleanup-job manipulation", async () => {
    const event = await setup.query<{ id: string }>(
      "select id from public.document_activity_events where workspace_id=$1 limit 1",
      [workspaceA],
    );
    await expectDatabaseError(
      () => setup.query(
        "update public.document_activity_events set metadata='{}' where id=$1",
        [event.rows[0].id],
      ),
      /append-only/i,
    );
    await expectDatabaseError(
      () => setup.query(
        "delete from public.document_activity_events where id=$1",
        [event.rows[0].id],
      ),
      /append-only/i,
    );
    await expectDatabaseError(
      () => owner.query(
        `insert into public.document_storage_cleanup_jobs(
          organization_id,workspace_id,version_id,job_type,job_identity,storage_key
        ) values($1,$2,$3,'version_purge','forged-cleanup',$4)`,
        [ORG_A, workspaceA, versionId, "forged/object"],
      ),
      /permission denied/i,
    );
  });

  it("links a lineage Project idempotently without duplicating events or metadata", async () => {
    const first = await owner.query<{ workspace_id: string }>(
      "select public.link_project_to_opportunity_document_workspace($1,$2) workspace_id",
      [OPPORTUNITY_A, PROJECT_A],
    );
    const beforeEvents = await setup.query<{ count: number }>(
      `select count(*)::integer count
       from public.document_activity_events
       where workspace_id=$1 and event_type='project_linked'`,
      [workspaceA],
    );
    const second = await owner.query<{ workspace_id: string }>(
      "select public.link_project_to_opportunity_document_workspace($1,$2) workspace_id",
      [OPPORTUNITY_A, PROJECT_A],
    );
    const afterEvents = await setup.query<{ count: number }>(
      `select count(*)::integer count
       from public.document_activity_events
       where workspace_id=$1 and event_type='project_linked'`,
      [workspaceA],
    );
    expect(first.rows[0].workspace_id).toBe(workspaceA);
    expect(second.rows[0].workspace_id).toBe(workspaceA);
    expect(beforeEvents.rows[0].count).toBe(1);
    expect(afterEvents.rows[0].count).toBe(1);
  });

  it("rejects a Project already linked to another workspace", async () => {
    await setup.query(
      `insert into public.document_workspace_entities(
        organization_id,workspace_id,project_id,linked_by
      ) values($1,$2,$3,$4)`,
      [ORG_A, workspaceASecond, PROJECT_A_CONFLICT, OWNER_A],
    );
    await expectDatabaseError(
      () => owner.query(
        "select public.link_project_to_opportunity_document_workspace($1,$2)",
        [OPPORTUNITY_A, PROJECT_A_CONFLICT],
      ),
      /different document workspace/i,
    );
  });

  it("rejects organization-mismatched entity links at the foreign-key layer", async () => {
    await expectDatabaseError(
      () => setup.query(
        `insert into public.document_workspace_entities(
          organization_id,workspace_id,opportunity_id,linked_by
        ) values($1,$2,$3,$4)`,
        [ORG_A, workspaceASecond, OPPORTUNITY_B, OWNER_A],
      ),
      /document_workspace_entities_opportunity_fkey|foreign key/i,
    );
  });
});
