import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.OPPORTUNITY_PROMOTION_DB_URL
  ?? process.env.OPPORTUNITY_CONVERSION_DB_URL
  ?? process.env.DOCUMENT_WORKSPACE_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f2000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "f2000000-0000-4000-8000-000000000002";
const ORG_ID = "f2000000-0000-4000-8000-000000000010";
const OTHER_ORG_ID = "f2000000-0000-4000-8000-000000000020";
const CLIENT_ID = "f2000000-0000-4000-8000-000000000030";

function id(kind: number, index: number) {
  return `f2000000-0000-4${String(kind).padStart(3, "0")}-8000-${String(index).padStart(12, "0")}`;
}

describeDatabase("Stage 1 dormant Opportunity promotion database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actorA = new pg.Client({ connectionString: dbUrl });
  const actorB = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await Promise.all([setup.connect(), actorA.connect(), actorB.connect()]);
    await cleanup();

    for (const [userId, email] of [
      [USER_ID, "stage1-promotion@example.test"],
      [OTHER_USER_ID, "stage1-promotion-other@example.test"],
    ]) {
      await setup.query(
        `insert into auth.users(
          id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data
        ) values (
          $1,'00000000-0000-0000-0000-000000000000','authenticated',
          'authenticated',$2,'',now(),'{}','{}'
        )`,
        [userId, email],
      );
    }

    await setup.query(
      "delete from public.organization_members where user_id in ($1,$2)",
      [USER_ID, OTHER_USER_ID],
    );
    await setup.query(
      "delete from public.organizations where created_by in ($1,$2)",
      [USER_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organizations(id,name,created_by)
       values($1,'Stage 1 Promotion Org',$2),
             ($3,'Stage 1 Other Org',$4)`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Stage 1 Owner'),
              ($3,$4,'owner','Other Owner')`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_clients(
        id,organization_id,created_by,name,company_name
      ) values($1,$2,$3,'Stage 1 Client','Stage 1 Client Limited')`,
      [CLIENT_ID, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.opportunity_lifecycle_rollout_controls(
        organization_id,allowed_strategy,creation_enabled,promotion_enabled,
        pilot_scope,pilot_environment,override_enabled,updated_by
      ) values(
        $1,'promote_workspace_v1',true,true,
        'local_admin_pilot','local_development',true,$2
      )`,
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
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [
      USER_ID,
    ]);
    await client.query(
      "select set_config('request.jwt.claim.role', 'authenticated', false)",
    );
    await client.query("set role authenticated");
  }

  async function cleanup() {
    await setup.query("reset role");
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
      await setup.query(
        `delete from public.${quotedTable} where organization_id in ($1,$2)`,
        [ORG_ID, OTHER_ORG_ID],
      );
    }
    await setup.query(
      "delete from public.organization_members where user_id in ($1,$2)",
      [USER_ID, OTHER_USER_ID],
    );
    await setup.query(
      `delete from public.organizations
       where id in ($1,$2) or created_by in ($3,$4)`,
      [ORG_ID, OTHER_ORG_ID, USER_ID, OTHER_USER_ID],
    );
    await setup.query("delete from auth.users where id in ($1,$2)", [
      USER_ID,
      OTHER_USER_ID,
    ]);
    await setup.query("set session_replication_role=origin");
  }

  async function setRollout(
    strategy: "legacy_two_project_v1" | "promote_workspace_v1",
    creationEnabled = true,
    promotionEnabled = strategy === "promote_workspace_v1",
  ) {
    await setup.query(
      `update public.opportunity_lifecycle_rollout_controls
       set allowed_strategy=$2,creation_enabled=$3,promotion_enabled=$4,
           override_enabled=$3,
           pilot_scope=case when $2='promote_workspace_v1' and $4
             then 'local_admin_pilot' else 'disabled' end,
           pilot_environment=case when $2='promote_workspace_v1' and $4
             then 'local_development' else 'disabled' end,
           updated_by=$5,updated_at=now()
       where organization_id=$1`,
      [ORG_ID, strategy, creationEnabled, promotionEnabled, USER_ID],
    );
  }

  async function createOpportunity(
    client: pg.Client,
    index: number,
    strategy: "legacy_two_project_v1" | "promote_workspace_v1" =
      "promote_workspace_v1",
    requestId = id(1, index),
  ) {
    return client.query<{
      opportunity_id: string;
      opportunity_slug: string;
      workspace_project_id: string;
      workspace_project_slug: string;
      lifecycle_id: string;
      records_created: boolean;
    }>(
      `select * from public.create_opportunity_workspace_v1(
        $1,$2,$3,$4,$5,null,$6,$7,null,$8,$9
      )`,
      [
        ORG_ID,
        requestId,
        strategy,
        `Stage 1 Opportunity ${index}`,
        CLIENT_ID,
        USER_ID,
        "Auckland",
        1000 + index,
        `Stage 1 fixture ${index}`,
      ],
    );
  }

  async function addQuote(
    opportunityId: string,
    index: number,
    status = "Accepted",
    projectId: string | null = null,
  ) {
    const quoteId = id(3, index);
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,quote_date
      ) values($1,$2,$3,$4,$5,$6,$7,$8,$8,current_date)`,
      [
        quoteId,
        ORG_ID,
        projectId,
        USER_ID,
        `Stage 1 Quote ${index}`,
        `Q-STAGE1-${index}`,
        status,
        opportunityId,
      ],
    );
    return quoteId;
  }

  async function promote(
    client: pg.Client,
    opportunityId: string,
    quoteId: string,
    correlationId: string,
  ) {
    return client.query<{
      project_id: string;
      project_slug: string;
      accepted_quote_id: string;
      promotion_completed: boolean;
    }>(
      "select * from public.promote_opportunity_workspace_v1($1,$2,$3,$4)",
      [ORG_ID, opportunityId, quoteId, correlationId],
    );
  }

  async function seedLegacyOpportunity(index: number, withLifecycle: boolean) {
    const opportunityId = id(6, index);
    const workspaceId = id(7, index);
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,owner_user_id,client_id,name,slug,
        opportunity_code,stage
      ) values($1,$2,$3,$3,$4,$5,$6,$7,'Quoted')`,
      [
        opportunityId,
        ORG_ID,
        USER_ID,
        CLIENT_ID,
        `Legacy Opportunity ${index}`,
        `legacy-opportunity-${index}`,
        `LO-${index}`,
      ],
    );
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,client_id,name,slug,project_code,
        source_opportunity_id
      ) values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        workspaceId,
        ORG_ID,
        USER_ID,
        CLIENT_ID,
        `Legacy Tender ${index}`,
        `legacy-tender-${index}`,
        `LT-${index}`,
        opportunityId,
      ],
    );
    await setup.query(
      `update public.organization_opportunities
       set workspace_project_id=$1 where id=$2`,
      [workspaceId, opportunityId],
    );
    if (withLifecycle) {
      await setup.query(
        `insert into public.opportunity_lifecycles(
          organization_id,opportunity_id,original_workspace_project_id,
          strategy,creation_request_id,created_by
        ) values($1,$2,$3,'legacy_two_project_v1',$4,$5)`,
        [ORG_ID, opportunityId, workspaceId, id(9, index), USER_ID],
      );
    }
    await addQuote(opportunityId, 500 + index);
    const quote = await setup.query<{ id: string }>(
      "select id from public.project_quotes where originating_opportunity_id=$1",
      [opportunityId],
    );
    return { opportunityId, workspaceId, quoteId: quote.rows[0]!.id };
  }

  it("starts with no automatically backfilled lifecycle or promotion rows", async () => {
    const rows = await setup.query(
      `select
        (select count(*)::integer from public.opportunity_lifecycles
         where organization_id=$1) lifecycle_count,
        (select count(*)::integer from public.opportunity_promotion_events
         where organization_id=$1) event_count`,
      [ORG_ID],
    );
    expect(rows.rows[0]).toEqual({ lifecycle_count: 0, event_count: 0 });
  });

  it("keeps both new entry points disabled when rollout controls are disabled", async () => {
    await setRollout("promote_workspace_v1", false, false);
    await expect(createOpportunity(actorA, 1)).rejects.toMatchObject({
      code: "TS409",
    });
    const count = await setup.query(
      `select count(*)::integer count
       from public.organization_opportunities
       where organization_id=$1 and name='Stage 1 Opportunity 1'`,
      [ORG_ID],
    );
    expect(count.rows[0]?.count).toBe(0);
    await setRollout("promote_workspace_v1", true, true);
  });

  it("atomically creates one O/W lifecycle and returns it on retry", async () => {
    const first = await createOpportunity(actorA, 2);
    const second = await createOpportunity(actorA, 2);
    expect(first.rows[0]?.records_created).toBe(true);
    expect(second.rows[0]).toMatchObject({
      opportunity_id: first.rows[0]?.opportunity_id,
      workspace_project_id: first.rows[0]?.workspace_project_id,
      lifecycle_id: first.rows[0]?.lifecycle_id,
      records_created: false,
    });

    const state = await setup.query(
      `select opportunity.workspace_project_id,
              project.source_opportunity_id,
              lifecycle.original_workspace_project_id,
              lifecycle.strategy
       from public.organization_opportunities opportunity
       join public.organization_projects project
         on project.id=opportunity.workspace_project_id
       join public.opportunity_lifecycles lifecycle
         on lifecycle.opportunity_id=opportunity.id
       where opportunity.id=$1`,
      [first.rows[0]?.opportunity_id],
    );
    expect(state.rows[0]).toMatchObject({
      workspace_project_id: first.rows[0]?.workspace_project_id,
      source_opportunity_id: first.rows[0]?.opportunity_id,
      original_workspace_project_id: first.rows[0]?.workspace_project_id,
      strategy: "promote_workspace_v1",
    });
  });

  it("serializes concurrent creation requests into one O/W", async () => {
    const requestId = id(1, 3);
    const [left, right] = await Promise.all([
      createOpportunity(actorA, 3, "promote_workspace_v1", requestId),
      createOpportunity(actorB, 3, "promote_workspace_v1", requestId),
    ]);
    expect(left.rows[0]?.opportunity_id).toBe(right.rows[0]?.opportunity_id);
    expect(left.rows[0]?.workspace_project_id).toBe(
      right.rows[0]?.workspace_project_id,
    );
    expect(
      [left.rows[0]?.records_created, right.rows[0]?.records_created].sort(),
    ).toEqual([false, true]);
  });

  it("rolls back client creation and all identities when validation fails", async () => {
    await expect(actorA.query(
      `select * from public.create_opportunity_workspace_v1(
        $1,$2,'promote_workspace_v1','Rollback Opportunity',null,
        '{"name":"Rollback Client","company_name":"Rollback Limited"}'::jsonb,
        $3,'Auckland',null,0,''
      )`,
      [ORG_ID, id(1, 4), OTHER_USER_ID],
    )).rejects.toMatchObject({ code: "TS422" });

    const state = await setup.query(
      `select
        (select count(*)::integer from public.organization_clients
         where organization_id=$1 and name='Rollback Client') client_count,
        (select count(*)::integer from public.organization_opportunities
         where organization_id=$1 and name='Rollback Opportunity') opportunity_count`,
      [ORG_ID],
    );
    expect(state.rows[0]).toEqual({ client_count: 0, opportunity_count: 0 });
  });

  it("enforces lifecycle constraints, immutability, organization scope, and browser mutation denial", async () => {
    const created = await createOpportunity(actorA, 5);
    const lifecycleId = created.rows[0]!.lifecycle_id;

    await expect(setup.query(
      "update public.opportunity_lifecycles set strategy='legacy_two_project_v1' where id=$1",
      [lifecycleId],
    )).rejects.toMatchObject({ code: "TS409" });
    await expect(setup.query(
      "delete from public.opportunity_lifecycles where id=$1",
      [lifecycleId],
    )).rejects.toMatchObject({ code: "TS409" });

    const privileges = await setup.query(
      `select
        has_table_privilege('authenticated','public.opportunity_lifecycles','insert') can_insert,
        has_table_privilege('authenticated','public.opportunity_lifecycles','update') can_update,
        has_table_privilege('authenticated','public.opportunity_lifecycles','delete') can_delete`,
    );
    expect(privileges.rows[0]).toEqual({
      can_insert: false,
      can_update: false,
      can_delete: false,
    });

    await expect(actorA.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,
        strategy,creation_request_id,created_by
      ) values($1,$2,$3,'promote_workspace_v1',$4,$5)`,
      [
        ORG_ID,
        created.rows[0]?.opportunity_id,
        created.rows[0]?.workspace_project_id,
        id(1, 500),
        USER_ID,
      ],
    )).rejects.toMatchObject({ code: "42501" });

    await expect(setup.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,
        strategy,creation_request_id,created_by
      ) values($1,$2,$3,'promote_workspace_v1',$4,$5)`,
      [
        ORG_ID,
        created.rows[0]?.opportunity_id,
        created.rows[0]?.workspace_project_id,
        id(1, 501),
        USER_ID,
      ],
    )).rejects.toMatchObject({ code: "23505" });

    const unmarked = await seedLegacyOpportunity(20, false);
    await expect(setup.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,
        strategy,creation_request_id,created_by
      ) values($1,$2,$3,'unknown_strategy',$4,$5)`,
      [
        ORG_ID,
        unmarked.opportunityId,
        unmarked.workspaceId,
        id(1, 502),
        USER_ID,
      ],
    )).rejects.toMatchObject({ code: "23514" });

    await expect(setup.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,
        strategy,creation_request_id,created_by
      ) values($1,$2,$3,'promote_workspace_v1',$4,$5)`,
      [
        ORG_ID,
        unmarked.opportunityId,
        created.rows[0]?.workspace_project_id,
        id(1, 503),
        USER_ID,
      ],
    )).rejects.toMatchObject({ code: "TS409" });

    await expect(setup.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,
        strategy,creation_request_id,created_by
      ) values($1,$2,$3,'promote_workspace_v1',$4,$5)`,
      [
        OTHER_ORG_ID,
        unmarked.opportunityId,
        unmarked.workspaceId,
        id(1, 504),
        USER_ID,
      ],
    )).rejects.toMatchObject({ code: "TS409" });
  });

  it("promotes the same W atomically and returns it on retry", async () => {
    const created = await createOpportunity(actorA, 6);
    const opportunityId = created.rows[0]!.opportunity_id;
    const workspaceId = created.rows[0]!.workspace_project_id;
    const quoteId = await addQuote(opportunityId, 6);
    await setup.query(
      "update public.project_quotes set total_quote_price=1234.56 where id=$1",
      [quoteId],
    );
    await setup.query(
      `insert into public.project_quote_line_items(
        id,organization_id,project_id,quote_id,section,description,
        quantity,unit,rate,total
      ) values($1,$2,null,$3,'Labour','Contract baseline',1,'item',1234.56,1234.56)`,
      [id(5, 6), ORG_ID, quoteId],
    );
    const projectCountBefore = await setup.query(
      "select count(*)::integer count from public.organization_projects where organization_id=$1",
      [ORG_ID],
    );

    const first = await promote(actorA, opportunityId, quoteId, id(2, 6));
    const second = await promote(actorA, opportunityId, quoteId, id(2, 600));
    expect(first.rows[0]).toMatchObject({
      project_id: workspaceId,
      accepted_quote_id: quoteId,
      promotion_completed: true,
    });
    expect(second.rows[0]).toMatchObject({
      project_id: workspaceId,
      accepted_quote_id: quoteId,
      promotion_completed: false,
    });

    const state = await setup.query(
      `select opportunity.stage,opportunity.workspace_project_id,
              opportunity.converted_project_id,final_project.project_id,
              final_project.accepted_quote_id,quote.project_id quote_project_id,
              promotion_event.project_id event_project_id
       from public.organization_opportunities opportunity
       join public.opportunity_final_projects final_project
         on final_project.opportunity_id=opportunity.id
       join public.project_quotes quote on quote.id=$2
       join public.opportunity_promotion_events promotion_event
         on promotion_event.opportunity_id=opportunity.id
       where opportunity.id=$1`,
      [opportunityId, quoteId],
    );
    expect(state.rows[0]).toMatchObject({
      stage: "Won",
      workspace_project_id: workspaceId,
      converted_project_id: workspaceId,
      project_id: workspaceId,
      accepted_quote_id: quoteId,
      quote_project_id: workspaceId,
      event_project_id: workspaceId,
    });

    const projectCountAfter = await setup.query(
      "select count(*)::integer count from public.organization_projects where organization_id=$1",
      [ORG_ID],
    );
    expect(projectCountAfter.rows[0]?.count).toBe(
      projectCountBefore.rows[0]?.count,
    );
    const baseline = await setup.query(
      `select quote.total_quote_price,
              count(line.id)::integer line_count,
              min(line.project_id::text) line_project_id
       from public.project_quotes quote
       left join public.project_quote_line_items line on line.quote_id=quote.id
       where quote.id=$1
       group by quote.total_quote_price`,
      [quoteId],
    );
    expect(baseline.rows[0]).toEqual({
      total_quote_price: "1234.56",
      line_count: 1,
      line_project_id: workspaceId,
    });
  });

  it("serializes concurrent promotions and creates no second Project", async () => {
    const created = await createOpportunity(actorA, 7);
    const quoteId = await addQuote(created.rows[0]!.opportunity_id, 7);
    const [left, right] = await Promise.all([
      promote(actorA, created.rows[0]!.opportunity_id, quoteId, id(2, 7)),
      promote(actorB, created.rows[0]!.opportunity_id, quoteId, id(2, 700)),
    ]);
    expect(left.rows[0]?.project_id).toBe(
      created.rows[0]?.workspace_project_id,
    );
    expect(right.rows[0]?.project_id).toBe(
      created.rows[0]?.workspace_project_id,
    );
    expect(
      [
        left.rows[0]?.promotion_completed,
        right.rows[0]?.promotion_completed,
      ].sort(),
    ).toEqual([false, true]);

    const projects = await setup.query(
      `select count(*)::integer count from public.organization_projects
       where organization_id=$1 and source_opportunity_id=$2`,
      [ORG_ID, created.rows[0]?.opportunity_id],
    );
    expect(projects.rows[0]?.count).toBe(1);
  });

  it("rejects missing, legacy, non-Accepted, ambiguous, and unrelated quote shapes", async () => {
    const missingMarker = await seedLegacyOpportunity(1, false);
    await expect(promote(
      actorA,
      missingMarker.opportunityId,
      missingMarker.quoteId,
      id(2, 801),
    )).rejects.toMatchObject({ code: "TS409" });

    const legacyMarker = await seedLegacyOpportunity(2, true);
    await expect(promote(
      actorA,
      legacyMarker.opportunityId,
      legacyMarker.quoteId,
      id(2, 802),
    )).rejects.toMatchObject({ code: "TS409" });

    const sent = await createOpportunity(actorA, 8);
    const sentQuote = await addQuote(
      sent.rows[0]!.opportunity_id,
      8,
      "Sent",
    );
    await expect(promote(
      actorA,
      sent.rows[0]!.opportunity_id,
      sentQuote,
      id(2, 803),
    )).rejects.toMatchObject({ code: "TS409" });

    const ambiguous = await createOpportunity(actorA, 9);
    const firstQuote = await addQuote(ambiguous.rows[0]!.opportunity_id, 9);
    await addQuote(ambiguous.rows[0]!.opportunity_id, 90);
    await expect(promote(
      actorA,
      ambiguous.rows[0]!.opportunity_id,
      firstQuote,
      id(2, 804),
    )).rejects.toMatchObject({ code: "TS409" });

    const unrelated = await createOpportunity(actorA, 10);
    const unrelatedProjectId = id(4, 10);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code
      ) values($1,$2,$3,'Unrelated Project','unrelated-project-10','UP-10')`,
      [unrelatedProjectId, ORG_ID, USER_ID],
    );
    const unrelatedQuote = await addQuote(
      unrelated.rows[0]!.opportunity_id,
      10,
      "Accepted",
      unrelatedProjectId,
    );
    await expect(promote(
      actorA,
      unrelated.rows[0]!.opportunity_id,
      unrelatedQuote,
      id(2, 805),
    )).rejects.toMatchObject({ code: "TS409" });
  });

  it("rejects orphan final candidates and unrelated CostItem ownership", async () => {
    const orphaned = await createOpportunity(actorA, 11);
    const orphanProjectId = id(4, 11);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code,
        source_opportunity_id
      ) values($1,$2,$3,'Orphan Candidate','orphan-candidate-11','OC-11',$4)`,
      [
        orphanProjectId,
        ORG_ID,
        USER_ID,
        orphaned.rows[0]?.opportunity_id,
      ],
    );
    const orphanQuote = await addQuote(
      orphaned.rows[0]!.opportunity_id,
      11,
    );
    await expect(promote(
      actorA,
      orphaned.rows[0]!.opportunity_id,
      orphanQuote,
      id(2, 811),
    )).rejects.toMatchObject({ code: "TS409" });

    const costMismatch = await createOpportunity(actorA, 12);
    const costQuote = await addQuote(
      costMismatch.rows[0]!.opportunity_id,
      12,
    );
    const unrelatedProjectId = id(4, 12);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code
      ) values($1,$2,$3,'Cost Owner','cost-owner-12','CO-12')`,
      [unrelatedProjectId, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.cost_items(
        id,organization_id,project_id,source_document_kind,
        source_document_id,source_revision_key
      ) values($1,$2,$3,'project_quote',$4,'stage1')`,
      [id(5, 12), ORG_ID, unrelatedProjectId, costQuote],
    );
    await expect(promote(
      actorA,
      costMismatch.rows[0]!.opportunity_id,
      costQuote,
      id(2, 812),
    )).rejects.toMatchObject({ code: "TS409" });
  });

  it("rolls back mapping, quote attachment, and Won state on injected event failure", async () => {
    const created = await createOpportunity(actorA, 13);
    const opportunityId = created.rows[0]!.opportunity_id;
    const quoteId = await addQuote(opportunityId, 13);
    await setup.query(`
      create or replace function public.test_fail_stage1_promotion_event()
      returns trigger language plpgsql as $$
      begin
        if new.correlation_id = '${id(2, 13)}'::uuid then
          raise exception 'Injected promotion event failure';
        end if;
        return new;
      end;
      $$;
      create trigger test_fail_stage1_promotion_event
      before insert on public.opportunity_promotion_events
      for each row execute function public.test_fail_stage1_promotion_event();
    `);
    try {
      await expect(promote(
        actorA,
        opportunityId,
        quoteId,
        id(2, 13),
      )).rejects.toMatchObject({
        message: "Injected promotion event failure",
      });
      const state = await setup.query(
        `select opportunity.stage,opportunity.converted_project_id,
                quote.project_id quote_project_id,
                (select count(*)::integer
                 from public.opportunity_final_projects
                 where opportunity_id=$1) mapping_count
         from public.organization_opportunities opportunity
         join public.project_quotes quote on quote.id=$2
         where opportunity.id=$1`,
        [opportunityId, quoteId],
      );
      expect(state.rows[0]).toMatchObject({
        stage: "New",
        converted_project_id: null,
        quote_project_id: null,
        mapping_count: 0,
      });
    } finally {
      await setup.query(
        "drop trigger if exists test_fail_stage1_promotion_event on public.opportunity_promotion_events",
      );
      await setup.query(
        "drop function if exists public.test_fail_stage1_promotion_event()",
      );
    }
  });

  it("preserves legacy conversion for unmarked and explicit legacy records", async () => {
    for (const [index, withLifecycle] of [
      [3, false],
      [4, true],
    ] as const) {
      const legacy = await seedLegacyOpportunity(index, withLifecycle);
      const first = await actorA.query<{
        project_id: string;
        project_created: boolean;
      }>(
        "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
        [ORG_ID, legacy.opportunityId, legacy.quoteId],
      );
      const second = await actorA.query<{
        project_id: string;
        project_created: boolean;
      }>(
        "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
        [ORG_ID, legacy.opportunityId, legacy.quoteId],
      );
      expect(first.rows[0]?.project_created).toBe(true);
      expect(first.rows[0]?.project_id).not.toBe(legacy.workspaceId);
      expect(second.rows[0]).toMatchObject({
        project_id: first.rows[0]?.project_id,
        project_created: false,
      });
    }
  });

  it("preserves historical retry fallback when the final mapping has no accepted quote", async () => {
    const legacy = await seedLegacyOpportunity(5, false);
    const finalProjectId = id(7, 500);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,client_id,name,slug,project_code,
        source_opportunity_id
      ) values($1,$2,$3,$4,'Historical Final','historical-final-5','HF-5',$5)`,
      [finalProjectId, ORG_ID, USER_ID, CLIENT_ID, legacy.opportunityId],
    );
    await setup.query(
      `insert into public.opportunity_final_projects(
        opportunity_id,organization_id,project_id,accepted_quote_id,created_by
      ) values($1,$2,$3,null,$4)`,
      [legacy.opportunityId, ORG_ID, finalProjectId, USER_ID],
    );
    await setup.query(
      `update public.organization_opportunities
       set converted_project_id=$1,converted_at=now()
       where id=$2`,
      [finalProjectId, legacy.opportunityId],
    );

    const result = await actorA.query<{
      project_id: string;
      project_created: boolean;
    }>(
      "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
      [ORG_ID, legacy.opportunityId, legacy.quoteId],
    );
    expect(result.rows[0]).toMatchObject({
      project_id: finalProjectId,
      project_created: false,
    });
    const mapping = await setup.query(
      `select accepted_quote_id
       from public.opportunity_final_projects where opportunity_id=$1`,
      [legacy.opportunityId],
    );
    expect(mapping.rows[0]?.accepted_quote_id).toBeNull();
  });

  it("blocks legacy conversion for explicit promotion strategy", async () => {
    const created = await createOpportunity(actorA, 14);
    const quoteId = await addQuote(created.rows[0]!.opportunity_id, 14);
    await expect(actorA.query(
      "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
      [ORG_ID, created.rows[0]?.opportunity_id, quoteId],
    )).rejects.toMatchObject({ code: "TS409" });
  });

  it("leaves direct Projects and unrelated direct CostItems untouched", async () => {
    const directProjectId = id(4, 15);
    const missingQuoteId = id(3, 1500);
    const directCostId = id(5, 15);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code
      ) values($1,$2,$3,'Direct Project','direct-project-15','DP-15')`,
      [directProjectId, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.cost_items(
        id,organization_id,project_id,source_document_kind,
        source_document_id,source_revision_key
      ) values($1,$2,$3,'project_quote',$4,'existing-direct-orphan')`,
      [directCostId, ORG_ID, directProjectId, missingQuoteId],
    );

    const before = await setup.query(
      "select row_to_json(cost_items.*) value from public.cost_items where id=$1",
      [directCostId],
    );
    const created = await createOpportunity(actorA, 15);
    const quoteId = await addQuote(created.rows[0]!.opportunity_id, 15);
    await promote(
      actorA,
      created.rows[0]!.opportunity_id,
      quoteId,
      id(2, 15),
    );
    const after = await setup.query(
      "select row_to_json(cost_items.*) value from public.cost_items where id=$1",
      [directCostId],
    );
    expect(after.rows[0]?.value).toEqual(before.rows[0]?.value);

    const lifecycle = await setup.query(
      `select count(*)::integer count
       from public.opportunity_lifecycles
       where original_workspace_project_id=$1`,
      [directProjectId],
    );
    expect(lifecycle.rows[0]?.count).toBe(0);
  });

  it("classifies historical, marked, promoted, and direct shapes read-only", async () => {
    const classifications = await actorA.query<{
      record_shape: string;
      count: number;
    }>(
      `select record_shape,count(*)::integer count
       from public.opportunity_lifecycle_reconciliation_v1
       where organization_id=$1
       group by record_shape`,
      [ORG_ID],
    );
    const shapes = new Map(
      classifications.rows.map((row) => [row.record_shape, row.count]),
    );
    expect(shapes.get("historical_two_project")).toBeGreaterThan(0);
    expect(shapes.get("completed_promoted_opportunity")).toBeGreaterThan(0);
    expect(shapes.get("marked_for_workspace_promotion")).toBeGreaterThan(0);
    expect(shapes.get("marked_for_legacy_conversion")).toBeGreaterThan(0);

    const direct = await actorA.query(
      `select count(*)::integer count
       from public.project_lifecycle_reconciliation_v1
       where organization_id=$1 and project_shape='direct_project'`,
      [ORG_ID],
    );
    expect(direct.rows[0]?.count).toBeGreaterThan(0);
  });
});
