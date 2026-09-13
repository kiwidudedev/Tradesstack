import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.DOCUMENT_WORKSPACE_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_A = "f4000000-0000-4000-8000-000000000001";
const VIEWER_A = "f4000000-0000-4000-8000-000000000002";
const OWNER_B = "f4000000-0000-4000-8000-000000000003";
const ORG_A = "f4000000-0000-4000-8000-000000000010";
const ORG_B = "f4000000-0000-4000-8000-000000000011";
const OPPORTUNITY_A = "f4000000-0000-4000-8000-000000000100";
const DIRECT_PROJECT_A = "f4000000-0000-4000-8000-000000000200";
const EMPTY_PROJECT_A = "f4000000-0000-4000-8000-000000000201";
const CONVERTED_PROJECT_A = "f4000000-0000-4000-8000-000000000202";
const CONFLICT_PROJECT_A = "f4000000-0000-4000-8000-000000000203";
const PROJECT_B = "f4000000-0000-4000-8000-000000000204";

describeDatabase("Project document workspace Phase 4 database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const owner = new pg.Client({ connectionString: dbUrl });
  let directWorkspace = "";
  let sharedWorkspace = "";

  beforeAll(async () => {
    await Promise.all([setup.connect(), owner.connect()]);
    await seed();
    await configureUser(owner, OWNER_A);
  });

  afterAll(async () => {
    await cleanup();
    await Promise.all([owner.end(), setup.end()]);
  });

  async function cleanup() {
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
      [[
        DIRECT_PROJECT_A,
        EMPTY_PROJECT_A,
        CONVERTED_PROJECT_A,
        CONFLICT_PROJECT_A,
        PROJECT_B,
      ]],
    );
    await setup.query(
      "delete from public.organization_opportunities where id=$1",
      [OPPORTUNITY_A],
    );
    await setup.query(
      `delete from public.member_permission_overrides
       where organization_member_id in (
         select id from public.organization_members
         where organization_id = any($1::uuid[])
            or user_id = any($2::uuid[])
       )`,
      [[ORG_A, ORG_B], [OWNER_A, VIEWER_A, OWNER_B]],
    );
    await setup.query(
      "delete from public.organization_members where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])",
      [[ORG_A, ORG_B], [OWNER_A, VIEWER_A, OWNER_B]],
    );
    await setup.query(
      "delete from public.organizations where id = any($1::uuid[]) or created_by = any($2::uuid[])",
      [[ORG_A, ORG_B], [OWNER_A, VIEWER_A, OWNER_B]],
    );
    await setup.query(
      "delete from auth.users where id = any($1::uuid[])",
      [[OWNER_A, VIEWER_A, OWNER_B]],
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
         'authenticated','phase4-owner-a@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase4-viewer-a@example.test','',now(),'{}','{}'),
        ($3,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase4-owner-b@example.test','',now(),'{}','{}')`,
      [OWNER_A, VIEWER_A, OWNER_B],
    );
    await setup.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_A, VIEWER_A, OWNER_B]],
    );
    await setup.query(
      `insert into public.organizations(id,name,created_by)
       values($1,'Phase 4 Org A',$3),($2,'Phase 4 Org B',$4)`,
      [ORG_A, ORG_B, OWNER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values
        ($1,$3,'owner','Phase 4 Owner A'),
        ($1,$4,'worker','Phase 4 Viewer A'),
        ($2,$5,'owner','Phase 4 Owner B')`,
      [ORG_A, ORG_B, OWNER_A, VIEWER_A, OWNER_B],
    );
    await setup.query(
      `insert into public.member_permission_overrides(
        organization_member_id,permission_key,is_allowed,created_by
      )
      select id,'files.view',true,$2
      from public.organization_members
      where organization_id=$1 and user_id=$2`,
      [ORG_A, VIEWER_A],
    );
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,name,slug
      ) values($1,$2,$3,'Phase 4 Opportunity','phase-4-opportunity')`,
      [OPPORTUNITY_A, ORG_A, OWNER_A],
    );
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,source_opportunity_id
      ) values
        ($1,$6,$8,'Direct Project','phase-4-direct',null),
        ($2,$6,$8,'Empty Project','phase-4-empty',null),
        ($3,$6,$8,'Converted Project','phase-4-converted',$9),
        ($4,$6,$8,'Conflict Project','phase-4-conflict',$9),
        ($5,$7,$10,'Other Org Project','phase-4-other-org',null)`,
      [
        DIRECT_PROJECT_A,
        EMPTY_PROJECT_A,
        CONVERTED_PROJECT_A,
        CONFLICT_PROJECT_A,
        PROJECT_B,
        ORG_A,
        ORG_B,
        OWNER_A,
        OPPORTUNITY_A,
        OWNER_B,
      ],
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

  async function userClient(userId: string) {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await configureUser(client, userId);
    return client;
  }

  async function expectDatabaseError(
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

  it("creates exactly one direct Project workspace under concurrent calls", async () => {
    const left = await userClient(OWNER_A);
    const right = await userClient(OWNER_A);
    try {
      const [first, second] = await Promise.all([
        left.query<{ workspace_id: string }>(
          "select public.get_or_create_project_document_workspace($1) workspace_id",
          [DIRECT_PROJECT_A],
        ),
        right.query<{ workspace_id: string }>(
          "select public.get_or_create_project_document_workspace($1) workspace_id",
          [DIRECT_PROJECT_A],
        ),
      ]);
      directWorkspace = first.rows[0].workspace_id;
      expect(second.rows[0].workspace_id).toBe(directWorkspace);
      const counts = await setup.query<{ links: number; events: number }>(
        `select
          (select count(*)::integer from public.document_workspace_entities
           where project_id=$1) links,
          (select count(*)::integer from public.document_activity_events
           where workspace_id=$2) events`,
        [DIRECT_PROJECT_A, directWorkspace],
      );
      expect(counts.rows[0]).toEqual({ links: 1, events: 2 });
    } finally {
      await Promise.all([left.end(), right.end()]);
    }
  });

  it("allows a read-only user to resolve an existing Project workspace", async () => {
    const viewer = await userClient(VIEWER_A);
    try {
      const resolved = await viewer.query<{ workspace_id: string }>(
        "select public.resolve_project_document_workspace($1) workspace_id",
        [DIRECT_PROJECT_A],
      );
      const repeated = await viewer.query<{ workspace_id: string }>(
        "select public.get_or_create_project_document_workspace($1) workspace_id",
        [DIRECT_PROJECT_A],
      );
      expect(resolved.rows[0].workspace_id).toBe(directWorkspace);
      expect(repeated.rows[0].workspace_id).toBe(directWorkspace);
    } finally {
      await viewer.end();
    }
  });

  it("denies direct Project workspace creation without files.write", async () => {
    const viewer = await userClient(VIEWER_A);
    try {
      await expectDatabaseError(
        () => viewer.query(
          "select public.get_or_create_project_document_workspace($1)",
          [EMPTY_PROJECT_A],
        ),
        /not authorized/i,
      );
    } finally {
      await viewer.end();
    }
  });

  it("creates and links one shared Opportunity/Project workspace idempotently", async () => {
    const first = await owner.query<{ workspace_id: string }>(
      "select public.ensure_opportunity_project_document_workspace($1,$2) workspace_id",
      [OPPORTUNITY_A, CONVERTED_PROJECT_A],
    );
    sharedWorkspace = first.rows[0].workspace_id;
    const second = await owner.query<{ workspace_id: string }>(
      "select public.ensure_opportunity_project_document_workspace($1,$2) workspace_id",
      [OPPORTUNITY_A, CONVERTED_PROJECT_A],
    );
    expect(second.rows[0].workspace_id).toBe(sharedWorkspace);

    const identity = await setup.query<{
      opportunity_workspace: string;
      project_workspace: string;
      project_events: number;
    }>(
      `select
        max(workspace_id::text) filter (where opportunity_id=$1)
          opportunity_workspace,
        max(workspace_id::text) filter (where project_id=$2)
          project_workspace,
        (select count(*)::integer from public.document_activity_events
         where workspace_id=$3 and event_type='project_linked') project_events
       from public.document_workspace_entities`,
      [OPPORTUNITY_A, CONVERTED_PROJECT_A, sharedWorkspace],
    );
    expect(identity.rows[0]).toEqual({
      opportunity_workspace: sharedWorkspace,
      project_workspace: sharedWorkspace,
      project_events: 1,
    });
  });

  it("exposes identical node IDs through Opportunity and Project linkage", async () => {
    const folder = await owner.query<{ id: string }>(
      "select (public.create_document_folder($1,null,'Shared Plans')).id",
      [sharedWorkspace],
    );
    const projectListing = await owner.query<{ node_id: string }>(
      `select node_id
       from public.list_document_workspace_nodes($1,null,null,'all','name','asc',100,0)`,
      [sharedWorkspace],
    );
    expect(projectListing.rows.map((row) => row.node_id)).toContain(
      folder.rows[0].id,
    );
  });

  it("rejects cross-organization Project access", async () => {
    await expectDatabaseError(
      () => owner.query(
        "select public.get_or_create_project_document_workspace($1)",
        [PROJECT_B],
      ),
      /access denied/i,
    );
  });

  it("rejects an existing Project link to a different workspace", async () => {
    const conflictWorkspace = await setup.query<{ id: string }>(
      `insert into public.document_workspaces(
        organization_id,created_by,updated_by
      ) values($1,$2,$2) returning id`,
      [ORG_A, OWNER_A],
    );
    await setup.query(
      `insert into public.document_workspace_entities(
        organization_id,workspace_id,project_id,linked_by
      ) values($1,$2,$3,$4)`,
      [ORG_A, conflictWorkspace.rows[0].id, CONFLICT_PROJECT_A, OWNER_A],
    );
    await expectDatabaseError(
      () => owner.query(
        "select public.ensure_opportunity_project_document_workspace($1,$2)",
        [OPPORTUNITY_A, CONFLICT_PROJECT_A],
      ),
      /different document workspace/i,
    );
  });

  it("cannot forge a second Project workspace link", async () => {
    const secondWorkspace = await setup.query<{ id: string }>(
      `insert into public.document_workspaces(
        organization_id,created_by,updated_by
      ) values($1,$2,$2) returning id`,
      [ORG_A, OWNER_A],
    );
    await expectDatabaseError(
      () => setup.query(
        `insert into public.document_workspace_entities(
          organization_id,workspace_id,project_id,linked_by
        ) values($1,$2,$3,$4)`,
        [ORG_A, secondWorkspace.rows[0].id, DIRECT_PROJECT_A, OWNER_A],
      ),
      /document_workspace_entities_project_uidx|duplicate key/i,
    );
  });
});
