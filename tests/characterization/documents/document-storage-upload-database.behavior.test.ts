import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.DOCUMENT_STORAGE_DB_URL
  ?? process.env.DOCUMENT_WORKSPACE_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_A = "e2000000-0000-4000-8000-000000000001";
const WORKER_A = "e2000000-0000-4000-8000-000000000002";
const OWNER_B = "e2000000-0000-4000-8000-000000000003";
const ORG_A = "e2000000-0000-4000-8000-000000000010";
const ORG_B = "e2000000-0000-4000-8000-000000000011";
const OPPORTUNITY_A = "e2000000-0000-4000-8000-000000000100";
const OPPORTUNITY_B = "e2000000-0000-4000-8000-000000000101";

interface Reservation {
  node_id: string;
  version_id: string;
  version_number: number;
  storage_key: string;
  upload_state: string;
  upload_expires_at: Date;
  display_name: string;
  claimed_mime_type: string;
  byte_size: string;
}

describeDatabase("document Storage and upload Phase 2 database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const owner = new pg.Client({ connectionString: dbUrl });
  let workspaceA = "";
  let activeFileNode = "";
  let activeVersion = "";

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
    await setup.query(
      "delete from storage.objects where bucket_id='organization-documents' and name like 'e2000000-%'",
    );
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
      "delete from public.organization_opportunities where id = any($1::uuid[])",
      [[OPPORTUNITY_A, OPPORTUNITY_B]],
    );
    await setup.query(
      "delete from public.organization_members where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])",
      [[ORG_A, ORG_B], [OWNER_A, WORKER_A, OWNER_B]],
    );
    await setup.query(
      "delete from public.organizations where id = any($1::uuid[]) or created_by = any($2::uuid[])",
      [[ORG_A, ORG_B], [OWNER_A, WORKER_A, OWNER_B]],
    );
    await setup.query(
      "delete from auth.users where id = any($1::uuid[])",
      [[OWNER_A, WORKER_A, OWNER_B]],
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
         'authenticated','storage-owner-a@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','storage-worker-a@example.test','',now(),'{}','{}'),
        ($3,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','storage-owner-b@example.test','',now(),'{}','{}')`,
      [OWNER_A, WORKER_A, OWNER_B],
    );
    await setup.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_A, WORKER_A, OWNER_B]],
    );
    await setup.query(
      `insert into public.organizations(id,name,created_by)
       values($1,'Storage Org A',$3),($2,'Storage Org B',$4)`,
      [ORG_A, ORG_B, OWNER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values
        ($1,$3,'owner','Storage Owner A'),
        ($1,$4,'worker','Storage Worker A'),
        ($2,$5,'owner','Storage Owner B')`,
      [ORG_A, ORG_B, OWNER_A, WORKER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,name,slug
      ) values
        ($1,$3,$5,'Storage Opportunity A','storage-opportunity-a'),
        ($2,$4,$6,'Storage Opportunity B','storage-opportunity-b')`,
      [OPPORTUNITY_A, OPPORTUNITY_B, ORG_A, ORG_B, OWNER_A, OWNER_B],
    );
  }

  async function configureUser(client: pg.Client, userId: string | null) {
    await client.query("reset role");
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

  async function initiate(params: {
    client?: pg.Client;
    opportunityId?: string;
    parentId?: string | null;
    name?: string;
    mime?: string;
    extension?: string;
    size?: number;
    existingNodeId?: string | null;
    idempotencyKey: string;
  }) {
    const client = params.client ?? owner;
    const result = await client.query<Reservation>(
      `select * from public.initiate_document_upload(
        $1,null,$2,$3,$4,$5,$6,$7,$8
      )`,
      [
        params.opportunityId ?? OPPORTUNITY_A,
        params.parentId ?? null,
        params.name ?? "Drawing Set.pdf",
        params.mime ?? "application/pdf",
        params.extension ?? "pdf",
        params.size ?? 100,
        params.existingNodeId ?? null,
        params.idempotencyKey,
      ],
    );
    return result.rows[0];
  }

  async function insertStorageMetadata(reservation: Reservation, overrides?: {
    size?: number;
    mime?: string;
  }) {
    const objectId = crypto.randomUUID();
    await setup.query(
      `insert into storage.objects(
        id,bucket_id,name,owner,metadata
      ) values($1,'organization-documents',$2,$3,$4::jsonb)`,
      [
        objectId,
        reservation.storage_key,
        OWNER_A,
        JSON.stringify({
          size: overrides?.size ?? Number(reservation.byte_size),
          mimetype: overrides?.mime ?? reservation.claimed_mime_type,
          eTag: `"${objectId}"`,
        }),
      ],
    );
    return objectId;
  }

  async function activateReservation(reservation: Reservation) {
    await insertStorageMetadata(reservation);
    await setup.query(
      "select * from public.complete_document_upload($1,$2)",
      [reservation.version_id, OWNER_A],
    );
  }

  it("authorizes a new upload, creates version 1, and hides pending records", async () => {
    const reservation = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001001",
    });
    workspaceA = reservation.storage_key.split("/")[1];
    expect(reservation.version_number).toBe(1);
    expect(reservation.upload_state).toBe("pending");
    expect(reservation.storage_key).toBe(
      `${ORG_A}/${workspaceA}/${reservation.version_id}`,
    );
    expect(reservation.storage_key).not.toContain("Drawing");

    const pendingNodes = await owner.query(
      "select id from public.document_nodes where id=$1",
      [reservation.node_id],
    );
    const pendingVersions = await owner.query(
      "select id from public.document_versions where id=$1",
      [reservation.version_id],
    );
    expect(pendingNodes.rowCount).toBe(0);
    expect(pendingVersions.rowCount).toBe(0);
  });

  it("returns the same reservation for the same idempotency request and rejects conflicting reuse", async () => {
    const key = "e2000000-0000-4000-8000-000000001002";
    const first = await initiate({ idempotencyKey: key, name: "Contract.pdf" });
    const repeated = await initiate({ idempotencyKey: key, name: "Contract.pdf" });
    expect(repeated.version_id).toBe(first.version_id);
    await expectDatabaseError(
      () => initiate({ idempotencyKey: key, name: "Different.pdf" }),
      /idempotency/i,
    );
  });

  it("rejects an unauthorized role, cross-organization entity, and anonymous caller", async () => {
    const worker = await createUserClient(WORKER_A);
    const ownerB = await createUserClient(OWNER_B);
    const anonymous = await createUserClient(null);
    try {
      await expectDatabaseError(
        () => initiate({
          client: worker,
          idempotencyKey: "e2000000-0000-4000-8000-000000001003",
        }),
        /access denied/i,
      );
      await expectDatabaseError(
        () => initiate({
          client: ownerB,
          opportunityId: OPPORTUNITY_A,
          idempotencyKey: "e2000000-0000-4000-8000-000000001004",
        }),
        /access denied/i,
      );
      await expectDatabaseError(
        () => initiate({
          client: anonymous,
          idempotencyKey: "e2000000-0000-4000-8000-000000001005",
        }),
        /permission denied|unauthorized/i,
      );
    } finally {
      await Promise.all([worker.end(), ownerB.end(), anonymous.end()]);
    }
  });

  it("rejects invalid size, extension, MIME, archive, executable, and macro inputs", async () => {
    const invalid: Array<Partial<Parameters<typeof initiate>[0]>> = [
      { size: 0 },
      { size: 2147483649 },
      { name: "bad.exe", extension: "exe", mime: "application/octet-stream" },
      { name: "archive.zip", extension: "zip", mime: "application/zip" },
      { name: "macro.docm", extension: "docm", mime: "application/msword" },
      { name: "wrong.pdf", extension: "pdf", mime: "image/png" },
      { name: "invoice.pdf.exe", extension: "exe", mime: "application/pdf" },
    ];
    for (const [index, params] of invalid.entries()) {
      await expectDatabaseError(() =>
        initiate({
          idempotencyKey: `e2000000-0000-4000-8000-${String(1100 + index).padStart(12, "0")}`,
          ...params,
        })
      );
    }
  });

  it("activates only after exact Storage metadata exists and does so idempotently", async () => {
    const reservation = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001200",
      name: "Active Drawing.pdf",
      size: 256,
    });
    await expectDatabaseError(
      () => setup.query(
        "select * from public.complete_document_upload($1,$2)",
        [reservation.version_id, OWNER_A],
      ),
      /object was not found/i,
    );
    await insertStorageMetadata(reservation);
    const completed = await setup.query(
      "select * from public.complete_document_upload($1,$2)",
      [reservation.version_id, OWNER_A],
    );
    expect(completed.rows[0]).toMatchObject({
      node_id: reservation.node_id,
      version_id: reservation.version_id,
      version_number: 1,
      verified_mime_type: "application/pdf",
    });
    const repeated = await setup.query(
      "select * from public.complete_document_upload($1,$2)",
      [reservation.version_id, OWNER_A],
    );
    expect(repeated.rows[0].version_id).toBe(reservation.version_id);
    activeFileNode = reservation.node_id;
    activeVersion = reservation.version_id;

    const events = await setup.query<{ count: string }>(
      `select count(*)::text
       from public.document_activity_events
       where version_id=$1 and event_type in ('file_uploaded','version_activated')`,
      [reservation.version_id],
    );
    expect(Number(events.rows[0].count)).toBe(2);
  });

  it("rejects wrong uploader, size, and MIME metadata without activating", async () => {
    const wrongActor = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001201",
      name: "Wrong Actor.pdf",
    });
    await insertStorageMetadata(wrongActor);
    await expectDatabaseError(
      () => setup.query(
        "select * from public.complete_document_upload($1,$2)",
        [wrongActor.version_id, OWNER_B],
      ),
      /access denied/i,
    );

    const wrongSize = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001202",
      name: "Wrong Size.pdf",
      size: 500,
    });
    await insertStorageMetadata(wrongSize, { size: 499 });
    await expectDatabaseError(
      () => setup.query(
        "select * from public.complete_document_upload($1,$2)",
        [wrongSize.version_id, OWNER_A],
      ),
      /size/i,
    );

    const wrongMime = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001203",
      name: "Wrong Mime.pdf",
    });
    await insertStorageMetadata(wrongMime, { mime: "image/png" });
    await expectDatabaseError(
      () => setup.query(
        "select * from public.complete_document_upload($1,$2)",
        [wrongMime.version_id, OWNER_A],
      ),
      /MIME/i,
    );
  });

  it("creates immutable replacement versions without disrupting the active version", async () => {
    const replacement = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001300",
      name: "Active Drawing.pdf",
      size: 300,
      existingNodeId: activeFileNode,
    });
    expect(replacement.version_number).toBe(2);
    expect(replacement.node_id).toBe(activeFileNode);
    const before = await setup.query(
      "select current_version_id,lifecycle_state from public.document_nodes where id=$1",
      [activeFileNode],
    );
    expect(before.rows[0]).toMatchObject({
      current_version_id: activeVersion,
      lifecycle_state: "active",
    });

    const failed = await owner.query(
      "select public.mark_document_upload_failed($1,$2,$3,false) as state",
      [replacement.version_id, "network_failed", "Network upload failed."],
    );
    expect(failed.rows[0].state).toBe("failed");
    const after = await setup.query(
      "select current_version_id,lifecycle_state from public.document_nodes where id=$1",
      [activeFileNode],
    );
    expect(after.rows[0].current_version_id).toBe(activeVersion);
    expect(after.rows[0].lifecycle_state).toBe("active");
    const download = await owner.query<{ version_id: string }>(
      "select version_id from public.resolve_document_download($1,null)",
      [activeFileNode],
    );
    expect(download.rows[0].version_id).toBe(activeVersion);
  });

  it("keeps folder rename and move operations entirely in hierarchy metadata", async () => {
    const archive = await owner.query<{ id: string }>(
      "select (public.create_document_folder($1,null,'Archive')).id",
      [workspaceA],
    );
    const folder = await owner.query<{ id: string }>(
      "select (public.create_document_folder($1,null,'Folder A')).id",
      [workspaceA],
    );
    const file = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001305",
      name: "Folder Asset.pdf",
      parentId: folder.rows[0].id,
      size: 321,
    });
    await activateReservation(file);

    const storageBefore = await setup.query(
      `select id,bucket_id,name,metadata
       from storage.objects
       where bucket_id='organization-documents' and name=$1`,
      [file.storage_key],
    );
    const versionsBefore = await setup.query(
      `select row_to_json(version_record)::text as snapshot
       from (
         select *
         from public.document_versions
         where node_id=$1
         order by version_number,id
       ) version_record`,
      [file.node_id],
    );
    const historyBefore = await setup.query<{ id: string }>(
      `select id
       from public.document_activity_events
       where workspace_id=$1
       order by occurred_at,id`,
      [workspaceA],
    );

    await owner.query("select public.rename_document_node($1,$2)", [
      folder.rows[0].id,
      "Renamed Folder A",
    ]);
    await owner.query("select public.move_document_node($1,$2)", [
      folder.rows[0].id,
      archive.rows[0].id,
    ]);

    const folderAfter = await setup.query(
      "select display_name,parent_node_id from public.document_nodes where id=$1",
      [folder.rows[0].id],
    );
    expect(folderAfter.rows[0]).toMatchObject({
      display_name: "Renamed Folder A",
      parent_node_id: archive.rows[0].id,
    });
    const storageAfter = await setup.query(
      `select id,bucket_id,name,metadata
       from storage.objects
       where bucket_id='organization-documents' and name=$1`,
      [file.storage_key],
    );
    const versionsAfter = await setup.query(
      `select row_to_json(version_record)::text as snapshot
       from (
         select *
         from public.document_versions
         where node_id=$1
         order by version_number,id
       ) version_record`,
      [file.node_id],
    );
    expect(storageAfter.rows).toEqual(storageBefore.rows);
    expect(versionsAfter.rows).toEqual(versionsBefore.rows);

    const historyAfter = await setup.query<{ id: string }>(
      `select id
       from public.document_activity_events
       where workspace_id=$1
       order by occurred_at,id`,
      [workspaceA],
    );
    expect(historyAfter.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(historyBefore.rows.map((row) => row.id)),
    );
    const folderEvents = await setup.query<{ event_type: string }>(
      `select event_type
       from public.document_activity_events
       where node_id=$1 and event_type in ('renamed','moved')
       order by occurred_at,id`,
      [folder.rows[0].id],
    );
    expect(folderEvents.rows.map((row) => row.event_type)).toEqual([
      "renamed",
      "moved",
    ]);
  });

  it("lists active immediate children without per-row owner or version queries", async () => {
    const root = await owner.query<{
      node_id: string;
      display_name: string;
      owner_name: string;
      version_number: number | null;
      total_count: string;
    }>(
      `select *
       from public.list_document_workspace_nodes(
         $1,null,null,'all','name','asc',100,0
       )`,
      [workspaceA],
    );
    expect(root.rows.some((row) => row.display_name === "Active Drawing.pdf")).toBe(true);
    expect(root.rows.every((row) => row.owner_name === "Storage Owner A")).toBe(true);
    expect(root.rows.find((row) => row.display_name === "Active Drawing.pdf")?.version_number).toBe(1);
    expect(Number(root.rows[0].total_count)).toBe(root.rowCount);

    const pending = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001306",
      name: "Hidden Pending.pdf",
    });
    const afterPending = await owner.query<{ node_id: string }>(
      `select node_id
       from public.list_document_workspace_nodes(
         $1,null,'Hidden Pending','all','name','asc',100,0
       )`,
      [workspaceA],
    );
    expect(afterPending.rowCount).toBe(0);
    expect(afterPending.rows).not.toContainEqual({ node_id: pending.node_id });

    const deleted = await owner.query<{ id: string }>(
      "select (public.create_document_folder($1,null,'Deleted Listing Folder')).id",
      [workspaceA],
    );
    await owner.query("select public.soft_delete_document_node($1)", [deleted.rows[0].id]);
    const afterDelete = await owner.query(
      `select node_id
       from public.list_document_workspace_nodes(
         $1,null,'Deleted Listing Folder','all','name','asc',100,0
       )`,
      [workspaceA],
    );
    expect(afterDelete.rowCount).toBe(0);
  });

  it("searches recursively, returns folder ancestors, paginates stably, and isolates organizations", async () => {
    const search = await owner.query<{
      display_name: string;
      parent_name: string;
    }>(
      `select display_name,parent_name
       from public.list_document_workspace_nodes(
         $1,null,'folder asset','pdf','name','asc',100,0
       )`,
      [workspaceA],
    );
    expect(search.rows).toEqual([
      expect.objectContaining({
        display_name: "Folder Asset.pdf",
        parent_name: "Renamed Folder A",
      }),
    ]);

    const folder = await setup.query<{ id: string }>(
      "select id from public.document_nodes where workspace_id=$1 and display_name='Renamed Folder A'",
      [workspaceA],
    );
    const breadcrumbs = await owner.query<{ display_name: string }>(
      "select * from public.get_document_folder_breadcrumbs($1,$2)",
      [workspaceA, folder.rows[0].id],
    );
    expect(breadcrumbs.rows.at(-1)?.display_name).toBe("Renamed Folder A");

    const first = await owner.query<{ node_id: string }>(
      `select node_id
       from public.list_document_workspace_nodes(
         $1,null,null,'all','name','asc',1,0
       )`,
      [workspaceA],
    );
    const repeated = await owner.query<{ node_id: string }>(
      `select node_id
       from public.list_document_workspace_nodes(
         $1,null,null,'all','name','asc',1,0
       )`,
      [workspaceA],
    );
    expect(repeated.rows).toEqual(first.rows);

    const ownerB = await createUserClient(OWNER_B);
    try {
      await expectDatabaseError(
        () => ownerB.query(
          `select *
           from public.list_document_workspace_nodes(
             $1,null,null,'all','name','asc',100,0
           )`,
          [workspaceA],
        ),
        /access denied/i,
      );
    } finally {
      await ownerB.end();
    }
  });

  it("serializes concurrent replacements and allocates distinct version numbers", async () => {
    const clients = await Promise.all([
      createUserClient(OWNER_A),
      createUserClient(OWNER_A),
    ]);
    try {
      const results = await Promise.all(
        clients.map((client, index) =>
          initiate({
            client,
            idempotencyKey: `e2000000-0000-4000-8000-00000000131${index}`,
            name: "Active Drawing.pdf",
            size: 400 + index,
            existingNodeId: activeFileNode,
          })
        ),
      );
      expect(new Set(results.map((row) => row.version_number)).size).toBe(2);
      expect(results.map((row) => row.storage_key)).not.toContain(activeVersion);
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });

  it("rejects replacement of folders, deleted files, changed names, and invalid parents", async () => {
    const folder = await owner.query<{ id: string }>(
      "select (public.create_document_folder($1,null,'Folder')).id",
      [workspaceA],
    );
    await expectDatabaseError(() =>
      initiate({
        idempotencyKey: "e2000000-0000-4000-8000-000000001400",
        name: "Folder",
        mime: "application/pdf",
        extension: "pdf",
        existingNodeId: folder.rows[0].id,
      })
    );
    await expectDatabaseError(() =>
      initiate({
        idempotencyKey: "e2000000-0000-4000-8000-000000001401",
        name: "Renamed.pdf",
        existingNodeId: activeFileNode,
      })
    );
    await expectDatabaseError(() =>
      initiate({
        idempotencyKey: "e2000000-0000-4000-8000-000000001402",
        name: "Bad Parent.pdf",
        parentId: activeFileNode,
      })
    );

    await owner.query("select public.soft_delete_document_node($1)", [activeFileNode]);
    await expectDatabaseError(() =>
      initiate({
        idempotencyKey: "e2000000-0000-4000-8000-000000001403",
        name: "Active Drawing.pdf",
        existingNodeId: activeFileNode,
      })
    );
    await owner.query("select public.restore_document_node($1)", [activeFileNode]);
  });

  it("resolves only the current active version for authorized downloads", async () => {
    const resolved = await owner.query(
      "select * from public.resolve_document_download($1,null)",
      [activeFileNode],
    );
    expect(resolved.rows[0]).toMatchObject({
      node_id: activeFileNode,
      version_id: activeVersion,
    });

    const ownerB = await createUserClient(OWNER_B);
    try {
      await expectDatabaseError(
        () => ownerB.query(
          "select * from public.resolve_document_download($1,null)",
          [activeFileNode],
        ),
        /access denied/i,
      );
    } finally {
      await ownerB.end();
    }
  });

  it("abandons expired uploads once, queues cleanup once, and rejects later activation", async () => {
    const expired = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001500",
      name: "Expired.pdf",
    });
    await setup.query("set session_replication_role=replica");
    await setup.query(
      "update public.document_versions set upload_expires_at=now()-interval '1 minute' where id=$1",
      [expired.version_id],
    );
    await setup.query("set session_replication_role=origin");

    expect(
      Number((await setup.query(
        "select public.abandon_expired_document_uploads(100) as count",
      )).rows[0].count),
    ).toBeGreaterThanOrEqual(1);
    expect(
      Number((await setup.query(
        "select public.abandon_expired_document_uploads(100) as count",
      )).rows[0].count),
    ).toBe(0);

    const jobs = await setup.query<{ count: string }>(
      "select count(*)::text from public.document_storage_cleanup_jobs where version_id=$1",
      [expired.version_id],
    );
    expect(Number(jobs.rows[0].count)).toBe(1);
    await expectDatabaseError(
      () => setup.query(
        "select * from public.complete_document_upload($1,$2)",
        [expired.version_id, OWNER_A],
      ),
      /not pending|not available for activation/i,
    );
  });

  it("leaves the previous active version downloadable when a replacement is abandoned", async () => {
    const current = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    const replacement = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001510",
      name: "Active Drawing.pdf",
      existingNodeId: activeFileNode,
      size: 510,
    });
    await owner.query(
      "select public.mark_document_upload_failed($1,$2,$3,true)",
      [replacement.version_id, "client_abandoned", "Client abandoned upload."],
    );

    const after = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    expect(after.rows[0].current_version_id).toBe(
      current.rows[0].current_version_id,
    );
    const download = await owner.query<{ version_id: string }>(
      "select version_id from public.resolve_document_download($1,null)",
      [activeFileNode],
    );
    expect(download.rows[0].version_id).toBe(current.rows[0].current_version_id);
  });

  it("leaves the previous active version downloadable when a replacement expires", async () => {
    const current = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    const replacement = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001511",
      name: "Active Drawing.pdf",
      existingNodeId: activeFileNode,
      size: 511,
    });
    await setup.query("set session_replication_role=replica");
    await setup.query(
      "update public.document_versions set upload_expires_at=now()-interval '1 minute' where id=$1",
      [replacement.version_id],
    );
    await setup.query("set session_replication_role=origin");
    await setup.query("select public.abandon_expired_document_uploads(100)");

    const after = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    expect(after.rows[0].current_version_id).toBe(
      current.rows[0].current_version_id,
    );
    const download = await owner.query<{ version_id: string }>(
      "select version_id from public.resolve_document_download($1,null)",
      [activeFileNode],
    );
    expect(download.rows[0].version_id).toBe(current.rows[0].current_version_id);
  });

  it("retries a failed replacement as a new immutable version", async () => {
    const previous = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    const failed = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001512",
      name: "Active Drawing.pdf",
      existingNodeId: activeFileNode,
      size: 512,
    });
    await owner.query(
      "select public.mark_document_upload_failed($1,$2,$3,false)",
      [failed.version_id, "network_failed", "Network upload failed."],
    );
    const retry = await initiate({
      idempotencyKey: "e2000000-0000-4000-8000-000000001513",
      name: "Active Drawing.pdf",
      existingNodeId: activeFileNode,
      size: 513,
    });
    expect(retry.version_number).toBe(failed.version_number + 1);
    expect(retry.storage_key).not.toBe(failed.storage_key);
    await activateReservation(retry);

    const versions = await setup.query<{
      id: string;
      upload_state: string;
    }>(
      `select id,upload_state
       from public.document_versions
       where id=any($1::uuid[])
       order by version_number`,
      [[previous.rows[0].current_version_id, failed.version_id, retry.version_id]],
    );
    expect(versions.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: previous.rows[0].current_version_id,
          upload_state: "active",
        }),
        expect.objectContaining({
          id: failed.version_id,
          upload_state: "failed",
        }),
        expect.objectContaining({
          id: retry.version_id,
          upload_state: "active",
        }),
      ]),
    );
    const current = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    expect(current.rows[0].current_version_id).toBe(retry.version_id);
  });

  it("prevents a later completion from rolling the current pointer back", async () => {
    const replacements = await Promise.all([
      initiate({
        idempotencyKey: "e2000000-0000-4000-8000-000000001514",
        name: "Active Drawing.pdf",
        existingNodeId: activeFileNode,
        size: 514,
      }),
      initiate({
        idempotencyKey: "e2000000-0000-4000-8000-000000001515",
        name: "Active Drawing.pdf",
        existingNodeId: activeFileNode,
        size: 515,
      }),
    ]);
    const [older, newer] = replacements.sort(
      (left, right) => left.version_number - right.version_number,
    );
    expect(newer.version_number).toBe(older.version_number + 1);
    await insertStorageMetadata(older);
    await activateReservation(newer);

    await expectDatabaseError(
      () => setup.query(
        "select * from public.complete_document_upload($1,$2)",
        [older.version_id, OWNER_A],
      ),
      /advance monotonically/i,
    );
    const state = await setup.query<{
      current_version_id: string;
      older_state: string;
    }>(
      `select
         node.current_version_id,
         version.upload_state as older_state
       from public.document_nodes node
       join public.document_versions version on version.id=$2
       where node.id=$1`,
      [activeFileNode, older.version_id],
    );
    expect(state.rows[0]).toEqual({
      current_version_id: newer.version_id,
      older_state: "pending",
    });
  });

  it("keeps the existing SHA-256 content hash immutable after activation", async () => {
    const current = await setup.query<{ current_version_id: string }>(
      "select current_version_id from public.document_nodes where id=$1",
      [activeFileNode],
    );
    await expectDatabaseError(
      () => setup.query(
        "update public.document_versions set sha256_checksum=$2 where id=$1",
        [current.rows[0].current_version_id, "a".repeat(64)],
      ),
      /content metadata is immutable/i,
    );
  });

  it("prevents ordinary users from completing uploads or manipulating cleanup jobs", async () => {
    await expectDatabaseError(
      () => owner.query(
        "select * from public.complete_document_upload($1,$2)",
        [activeVersion, OWNER_A],
      ),
      /permission denied/i,
    );
    await expectDatabaseError(
      () => owner.query(
        `insert into public.document_storage_cleanup_jobs(
          organization_id,workspace_id,job_type,job_identity,storage_key
        ) values($1,$2,'orphan_reconciliation','forged','forged')`,
        [ORG_A, workspaceA],
      ),
      /permission denied|row-level security/i,
    );
  });
});
