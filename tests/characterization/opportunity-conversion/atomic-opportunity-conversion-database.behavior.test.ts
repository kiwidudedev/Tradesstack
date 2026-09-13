import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.OPPORTUNITY_CONVERSION_DB_URL
  ?? process.env.DOCUMENT_WORKSPACE_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f1000000-0000-4000-8000-000000000001";
const ORG_ID = "f1000000-0000-4000-8000-000000000010";

function id(kind: number, index: number) {
  return `f1000000-0000-4${String(kind).padStart(3, "0")}-8000-${String(index).padStart(12, "0")}`;
}

describeDatabase("atomic Opportunity conversion database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actorA = new pg.Client({ connectionString: dbUrl });
  const actorB = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await Promise.all([setup.connect(), actorA.connect(), actorB.connect()]);
    await cleanup();
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values (
        $1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','atomic-opportunity-conversion@example.test','',now(),'{}','{}'
      )`,
      [USER_ID],
    );
    await setup.query("delete from public.organizations where created_by = $1", [USER_ID]);
    await setup.query(
      "insert into public.organizations(id,name,created_by) values($1,'Atomic Conversion Org',$2)",
      [ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Atomic Conversion Owner')`,
      [ORG_ID, USER_ID],
    );
    await configureActor(actorA);
    await configureActor(actorB);
  });

  afterAll(async () => {
    await cleanup();
    await Promise.all([actorA.end(), actorB.end(), setup.end()]);
  });

  async function configureActor(client: pg.Client) {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [USER_ID]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  }

  async function cleanup() {
    await setup.query("set session_replication_role=replica");
    const organizationTables = await setup.query<{ table_name: string }>(
      `select distinct column_info.table_name
       from information_schema.columns column_info
       join information_schema.tables table_info
         on table_info.table_schema=column_info.table_schema
        and table_info.table_name=column_info.table_name
       where column_info.table_schema='public'
         and column_info.column_name='organization_id'
         and column_info.table_name<>'organizations'
         and table_info.table_type='BASE TABLE'`,
    );
    for (const { table_name: tableName } of organizationTables.rows) {
      const quotedTable = `"${tableName.replaceAll('"', '""')}"`;
      await setup.query(`delete from public.${quotedTable} where organization_id=$1`, [ORG_ID]);
    }
    await setup.query(
      "delete from public.organization_members where user_id=$1",
      [USER_ID],
    );
    await setup.query("delete from public.organizations where id = $1 or created_by = $2", [
      ORG_ID,
      USER_ID,
    ]);
    await setup.query("delete from auth.users where id = $1", [USER_ID]);
    await setup.query("set session_replication_role=origin");
  }

  async function seedOpportunity(params: {
    index: number;
    quoteStatus?: string;
    quoteProject?: "null" | "workspace" | "unrelated";
    withLine?: boolean;
  }) {
    const opportunityId = id(1, params.index);
    const workspaceId = id(2, params.index);
    const quoteId = id(3, params.index);
    const unrelatedId = id(4, params.index);

    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,owner_user_id,name,slug,opportunity_code,stage
      ) values($1,$2,$3,$3,$4,$5,$6,'Quoted')`,
      [
        opportunityId,
        ORG_ID,
        USER_ID,
        `Atomic Opportunity ${params.index}`,
        `atomic-opportunity-${params.index}`,
        `AO-${params.index}`,
      ],
    );
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code,source_opportunity_id
      ) values($1,$2,$3,$4,$5,$6,$7)`,
      [
        workspaceId,
        ORG_ID,
        USER_ID,
        `Atomic Tender ${params.index}`,
        `atomic-tender-${params.index}`,
        `TW-${params.index}`,
        opportunityId,
      ],
    );
    await setup.query(
      "update public.organization_opportunities set workspace_project_id=$1 where id=$2",
      [workspaceId, opportunityId],
    );

    if (params.quoteProject === "unrelated") {
      await setup.query(
        `insert into public.organization_projects(
          id,organization_id,created_by,name,slug,project_code
        ) values($1,$2,$3,$4,$5,$6)`,
        [
          unrelatedId,
          ORG_ID,
          USER_ID,
          `Unrelated ${params.index}`,
          `unrelated-${params.index}`,
          `UR-${params.index}`,
        ],
      );
    }

    const quoteProjectId = params.quoteProject === "workspace"
      ? workspaceId
      : params.quoteProject === "unrelated"
        ? unrelatedId
        : null;
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,quote_date
      ) values($1,$2,$3,$4,$5,$6,$7,$8,$8,current_date)`,
      [
        quoteId,
        ORG_ID,
        quoteProjectId,
        USER_ID,
        `Atomic Quote ${params.index}`,
        `Q-AO-${params.index}`,
        params.quoteStatus ?? "Accepted",
        opportunityId,
      ],
    );

    if (params.withLine) {
      await setup.query(
        `insert into public.project_quote_line_items(
          id,organization_id,project_id,quote_id,section,description,quantity,unit,rate,total
        ) values($1,$2,$3,$4,'Labour','Atomic line',1,'item',100,100)`,
        [id(5, params.index), ORG_ID, quoteProjectId, quoteId],
      );
    }

    return { opportunityId, workspaceId, quoteId, unrelatedId };
  }

  async function convert(
    client: pg.Client,
    opportunityId: string,
    quoteId: string,
  ) {
    return client.query<{
      project_id: string;
      project_slug: string;
      project_created: boolean;
    }>(
      "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
      [ORG_ID, opportunityId, quoteId],
    );
  }

  it("converts Accepted unattached history and returns the same final Project on retry", async () => {
    const fixture = await seedOpportunity({ index: 1, quoteProject: "null" });
    const first = await convert(actorA, fixture.opportunityId, fixture.quoteId);
    const second = await convert(actorA, fixture.opportunityId, fixture.quoteId);

    expect(first.rows[0]?.project_created).toBe(true);
    expect(second.rows[0]?.project_created).toBe(false);
    expect(second.rows[0]?.project_id).toBe(first.rows[0]?.project_id);

    const state = await setup.query(
      `select opportunity.stage,opportunity.converted_project_id,
              final_project.project_id,quote.project_id as quote_project_id
       from public.organization_opportunities opportunity
       join public.opportunity_final_projects final_project
         on final_project.opportunity_id=opportunity.id
       join public.project_quotes quote on quote.id=$2
       where opportunity.id=$1`,
      [fixture.opportunityId, fixture.quoteId],
    );
    expect(state.rows[0]).toMatchObject({
      stage: "Won",
      converted_project_id: first.rows[0]?.project_id,
      project_id: first.rows[0]?.project_id,
      quote_project_id: first.rows[0]?.project_id,
    });
  });

  it("reparents history from the exact tender workspace", async () => {
    const fixture = await seedOpportunity({
      index: 2,
      quoteProject: "workspace",
      withLine: true,
    });
    const result = await convert(actorA, fixture.opportunityId, fixture.quoteId);
    const history = await setup.query(
      `select quote.project_id,line.project_id as line_project_id
       from public.project_quotes quote
       join public.project_quote_line_items line on line.quote_id=quote.id
       where quote.id=$1`,
      [fixture.quoteId],
    );
    expect(history.rows[0]).toEqual({
      project_id: result.rows[0]?.project_id,
      line_project_id: result.rows[0]?.project_id,
    });
  });

  it("rejects history attached to an unrelated Project without creating a final Project", async () => {
    const fixture = await seedOpportunity({ index: 3, quoteProject: "unrelated" });
    await expect(convert(actorA, fixture.opportunityId, fixture.quoteId))
      .rejects.toMatchObject({ code: "TS409" });
    const finalCount = await setup.query(
      "select count(*)::integer as count from public.opportunity_final_projects where opportunity_id=$1",
      [fixture.opportunityId],
    );
    expect(finalCount.rows[0]?.count).toBe(0);
  });

  it("rejects a non-Accepted quote", async () => {
    const fixture = await seedOpportunity({
      index: 4,
      quoteProject: "null",
      quoteStatus: "Sent",
    });
    await expect(convert(actorA, fixture.opportunityId, fixture.quoteId))
      .rejects.toMatchObject({ code: "TS422" });
  });

  it("rejects a quote belonging to another Opportunity", async () => {
    const left = await seedOpportunity({ index: 5, quoteProject: "null" });
    const right = await seedOpportunity({ index: 6, quoteProject: "null" });
    await expect(convert(actorA, left.opportunityId, right.quoteId))
      .rejects.toMatchObject({ code: "TS422" });
  });

  it("rejects an Accepted quote superseded by a newer Accepted quote", async () => {
    const fixture = await seedOpportunity({ index: 10, quoteProject: "null" });
    const newerQuoteId = id(6, 10);
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,updated_at
      ) values($1,$2,null,$3,'Newer Accepted','Q-AO-10-NEW','Accepted',$4,$4,now()+interval '1 second')`,
      [newerQuoteId, ORG_ID, USER_ID, fixture.opportunityId],
    );
    await expect(convert(actorA, fixture.opportunityId, fixture.quoteId))
      .rejects.toMatchObject({ code: "TS409" });
  });

  it("rolls back final-Project creation when commercial reparenting fails", async () => {
    const fixture = await seedOpportunity({ index: 11, quoteProject: "null" });
    await setup.query(`
      create or replace function public.test_fail_atomic_conversion_reparent()
      returns trigger language plpgsql as $$
      begin
        if new.quote_number = 'Q-AO-11' and new.project_id is not null then
          raise exception 'Injected commercial reparent failure';
        end if;
        return new;
      end;
      $$;
      create trigger test_fail_atomic_conversion_reparent
      before update on public.project_quotes
      for each row execute function public.test_fail_atomic_conversion_reparent();
    `);
    try {
      await expect(convert(actorA, fixture.opportunityId, fixture.quoteId))
        .rejects.toMatchObject({ message: "Injected commercial reparent failure" });
      const state = await setup.query(
        `select
          (select count(*)::integer from public.opportunity_final_projects where opportunity_id=$1) as final_count,
          (select count(*)::integer from public.organization_projects
           where organization_id=$2 and source_opportunity_id=$1 and id<>$3) as delivery_count,
          (select converted_project_id from public.organization_opportunities where id=$1) as converted_project_id`,
        [fixture.opportunityId, ORG_ID, fixture.workspaceId],
      );
      expect(state.rows[0]).toEqual({
        final_count: 0,
        delivery_count: 0,
        converted_project_id: null,
      });
    } finally {
      await setup.query(
        "drop trigger if exists test_fail_atomic_conversion_reparent on public.project_quotes",
      );
      await setup.query(
        "drop function if exists public.test_fail_atomic_conversion_reparent()",
      );
    }
  });

  it("rolls back all database changes when legacy quote synchronization fails", async () => {
    const fixture = await seedOpportunity({ index: 13, quoteProject: "null" });
    const originalDefinition = await setup.query<{ definition: string }>(
      `select pg_get_functiondef(
        'public.sync_opportunity_legacy_quote_on_conversion(uuid,uuid,uuid,uuid)'::regprocedure
      ) as definition`,
    );
    await setup.query(`
      create or replace function public.sync_opportunity_legacy_quote_on_conversion(
        p_organization_id uuid,
        p_opportunity_id uuid,
        p_project_id uuid,
        p_actor_user_id uuid
      )
      returns void language plpgsql as $$
      begin
        raise exception 'Injected legacy synchronization failure';
      end;
      $$;
    `);
    try {
      await expect(convert(actorA, fixture.opportunityId, fixture.quoteId))
        .rejects.toMatchObject({ message: "Injected legacy synchronization failure" });
      const state = await setup.query(
        `select
          (select count(*)::integer from public.opportunity_final_projects where opportunity_id=$1) as final_count,
          (select count(*)::integer from public.organization_projects
           where organization_id=$2 and source_opportunity_id=$1 and id<>$3) as delivery_count,
          (select converted_project_id from public.organization_opportunities where id=$1) as converted_project_id,
          (select project_id from public.project_quotes where id=$4) as quote_project_id`,
        [fixture.opportunityId, ORG_ID, fixture.workspaceId, fixture.quoteId],
      );
      expect(state.rows[0]).toEqual({
        final_count: 0,
        delivery_count: 0,
        converted_project_id: null,
        quote_project_id: null,
      });
    } finally {
      await setup.query(originalDefinition.rows[0]?.definition ?? "");
    }
  });

  it("fails closed on the Metro regression shape without creating another Project", async () => {
    const fixture = await seedOpportunity({ index: 12, quoteProject: "workspace" });
    for (const suffix of ["first", "second"]) {
      await setup.query(
        `insert into public.organization_projects(
          organization_id,created_by,name,slug,project_code,source_opportunity_id
        ) values($1,$2,$3,$4,$5,$6)`,
        [
          ORG_ID,
          USER_ID,
          `Failed ${suffix}`,
          `failed-${suffix}-12`,
          `FP-${suffix}-12`,
          fixture.opportunityId,
        ],
      );
    }
    await setup.query(
      `insert into public.project_quotes(
        organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,updated_at
      ) values($1,null,$2,'Latest Accepted','Q-AO-12-LATEST','Accepted',$3,$3,now()+interval '1 second')`,
      [ORG_ID, USER_ID, fixture.opportunityId],
    );
    const latest = await setup.query(
      "select id from public.project_quotes where quote_number='Q-AO-12-LATEST'",
    );
    await expect(convert(actorA, fixture.opportunityId, latest.rows[0]?.id))
      .rejects.toMatchObject({
        code: "TS409",
        message: expect.stringContaining("administrative reconciliation"),
      });
    const count = await setup.query(
      `select count(*)::integer as count from public.organization_projects
       where organization_id=$1 and source_opportunity_id=$2 and id<>$3`,
      [ORG_ID, fixture.opportunityId, fixture.workspaceId],
    );
    expect(count.rows[0]?.count).toBe(2);
  });

  it("serializes concurrent conversions into exactly one final Project", async () => {
    const fixture = await seedOpportunity({ index: 7, quoteProject: "null" });
    const [left, right] = await Promise.all([
      convert(actorA, fixture.opportunityId, fixture.quoteId),
      convert(actorB, fixture.opportunityId, fixture.quoteId),
    ]);
    expect(left.rows[0]?.project_id).toBe(right.rows[0]?.project_id);
    expect([left.rows[0]?.project_created, right.rows[0]?.project_created].sort())
      .toEqual([false, true]);

    const projects = await setup.query(
      `select count(*)::integer as count
       from public.organization_projects project
       where project.organization_id=$1
         and project.source_opportunity_id=$2
         and project.id<>$3`,
      [ORG_ID, fixture.opportunityId, fixture.workspaceId],
    );
    expect(projects.rows[0]?.count).toBe(1);
  });

  it("enforces the final-Project uniqueness constraint directly", async () => {
    const first = await seedOpportunity({ index: 8, quoteProject: "null" });
    const second = await seedOpportunity({ index: 9, quoteProject: "null" });
    const converted = await convert(actorA, first.opportunityId, first.quoteId);

    await expect(setup.query(
      `insert into public.opportunity_final_projects(
        opportunity_id,organization_id,project_id,accepted_quote_id,created_by
      ) values($1,$2,$3,$4,$5)`,
      [
        second.opportunityId,
        ORG_ID,
        converted.rows[0]?.project_id,
        second.quoteId,
        USER_ID,
      ],
    )).rejects.toMatchObject({ code: "23505" });
  });
});
