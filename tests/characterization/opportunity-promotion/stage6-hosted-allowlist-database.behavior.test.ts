import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_PROMOTION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f7000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "f7000000-0000-4000-8000-000000000002";
const ORG_ID = "f7000000-0000-4000-8000-000000000010";
const OTHER_ORG_ID = "f7000000-0000-4000-8000-000000000011";
const CLIENT_ID = "f7000000-0000-4000-8000-000000000020";
const REQUEST_ID = "f7000000-0000-4000-8000-000000000030";
const QUOTE_ID = "f7000000-0000-4000-8000-000000000040";
const QUOTE_LINE_ID = "f7000000-0000-4000-8000-000000000041";

describeDatabase("Stage 6 hosted-development allowlist behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actor = new pg.Client({ connectionString: dbUrl });
  const outsider = new pg.Client({ connectionString: dbUrl });
  let opportunityId = "";
  let workspaceProjectId = "";
  let workspaceSlug = "";
  let workspaceCode = "";

  beforeAll(async () => {
    await Promise.all([setup.connect(), actor.connect(), outsider.connect()]);
    await cleanup();

    for (const [id, email] of [
      [USER_ID, "stage6-owner@tradesstack.local"],
      [OTHER_USER_ID, "stage6-outsider@tradesstack.local"],
    ]) {
      await setup.query(
        `insert into auth.users(
          id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data
        ) values($1,'00000000-0000-0000-0000-000000000000','authenticated',
          'authenticated',$2,'',now(),'{}','{}')`,
        [id, email],
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
       values($1,'Stage 6 Hosted Development',$2),
             ($3,'Stage 6 Other Development',$4)`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Stage 6 Owner'),
              ($3,$4,'owner','Stage 6 Outsider')`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_clients(
        id,organization_id,created_by,name,company_name
      ) values($1,$2,$3,'Stage 6 Client','Stage 6 Client Limited')`,
      [CLIENT_ID, ORG_ID, USER_ID],
    );

    await configureActor(actor, USER_ID);
    await configureActor(outsider, OTHER_USER_ID);
  });

  afterAll(async () => {
    await cleanup();
    await Promise.all([actor.end(), outsider.end(), setup.end()]);
  });

  async function configureActor(client: pg.Client, userId: string) {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
    await client.query("select set_config('request.jwt.claim.role','authenticated',false)");
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

  async function setControl(mode: "hosted" | "legacy") {
    const hosted = mode === "hosted";
    await setup.query(
      `insert into public.opportunity_lifecycle_rollout_controls(
        organization_id,allowed_strategy,creation_enabled,promotion_enabled,
        pilot_scope,pilot_environment,override_enabled,updated_by,updated_at
      ) values($1,$2,true,$3,$4,$5,$3,$6,now())
      on conflict(organization_id) do update set
        allowed_strategy=excluded.allowed_strategy,
        creation_enabled=excluded.creation_enabled,
        promotion_enabled=excluded.promotion_enabled,
        pilot_scope=excluded.pilot_scope,
        pilot_environment=excluded.pilot_environment,
        override_enabled=excluded.override_enabled,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at`,
      [
        ORG_ID,
        hosted ? "promote_workspace_v1" : "legacy_two_project_v1",
        hosted,
        hosted ? "hosted_development_allowlist" : "disabled",
        hosted ? "hosted_development" : "disabled",
        USER_ID,
      ],
    );
  }

  it("accepts only exact local or hosted-development rollout pairs", async () => {
    await expect(setup.query(
      `insert into public.opportunity_lifecycle_rollout_controls(
        organization_id,allowed_strategy,creation_enabled,promotion_enabled,
        pilot_scope,pilot_environment,updated_by
      ) values($1,'promote_workspace_v1',true,true,
        'hosted_development_allowlist','local_development',$2)`,
      [ORG_ID, USER_ID],
    )).rejects.toMatchObject({ code: "23514" });

    await setControl("hosted");
    const control = await setup.query(
      `select allowed_strategy,creation_enabled,promotion_enabled,
              pilot_scope,pilot_environment
       from public.opportunity_lifecycle_rollout_controls
       where organization_id=$1`,
      [ORG_ID],
    );
    expect(control.rows[0]).toEqual({
      allowed_strategy: "promote_workspace_v1",
      creation_enabled: true,
      promotion_enabled: true,
      pilot_scope: "hosted_development_allowlist",
      pilot_environment: "hosted_development",
    });
  });

  it("server-selects one immutable promotion lifecycle and returns it on retry", async () => {
    const create = () => actor.query(
      `select * from public.create_opportunity_workspace_controlled_v1(
        $1,$2,'S6-HOSTED Opportunity',$3,null,$4,'Auckland',null,5000,'Stage 6 fixture'
      )`,
      [ORG_ID, REQUEST_ID, CLIENT_ID, USER_ID],
    );
    const first = await create();
    const second = await create();
    opportunityId = first.rows[0].opportunity_id;
    workspaceProjectId = first.rows[0].workspace_project_id;
    workspaceSlug = first.rows[0].workspace_project_slug;

    expect(first.rows[0].records_created).toBe(true);
    expect(second.rows[0]).toMatchObject({
      opportunity_id: opportunityId,
      workspace_project_id: workspaceProjectId,
      records_created: false,
    });

    const state = await setup.query(
      `select opportunity.workspace_project_id,opportunity.converted_project_id,
              project.source_opportunity_id,project.slug,project.project_code,
              lifecycle.strategy,lifecycle.original_workspace_project_id
       from public.organization_opportunities opportunity
       join public.organization_projects project
         on project.id=opportunity.workspace_project_id
       join public.opportunity_lifecycles lifecycle
         on lifecycle.opportunity_id=opportunity.id
       where opportunity.id=$1`,
      [opportunityId],
    );
    workspaceCode = state.rows[0].project_code;
    expect(state.rows[0]).toMatchObject({
      workspace_project_id: workspaceProjectId,
      converted_project_id: null,
      source_opportunity_id: opportunityId,
      slug: workspaceSlug,
      strategy: "promote_workspace_v1",
      original_workspace_project_id: workspaceProjectId,
    });
  });

  it("pauses an unawarded promotion lifecycle without legacy fallback", async () => {
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,quote_date,total_quote_price
      ) values($1,$2,null,$3,'S6 Contract','S6-Q-1','Accepted',$4,$4,current_date,5000)`,
      [QUOTE_ID, ORG_ID, USER_ID, opportunityId],
    );
    await setup.query(
      `insert into public.project_quote_line_items(
        id,organization_id,project_id,quote_id,section,description,quantity,unit,rate,total
      ) values($1,$2,null,$3,'Labour','S6 baseline',1,'item',5000,5000)`,
      [QUOTE_LINE_ID, ORG_ID, QUOTE_ID],
    );
    await setControl("legacy");

    await expect(actor.query(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,'s6-disabled-award')",
      [ORG_ID, opportunityId, QUOTE_ID],
    )).rejects.toMatchObject({ code: "TS409" });

    const paused = await setup.query(
      `select opportunity.converted_project_id,
        (select count(*)::integer from public.opportunity_final_projects mapping
          where mapping.opportunity_id=opportunity.id) mapping_count,
        (select count(*)::integer from public.opportunity_promotion_events event
          where event.opportunity_id=opportunity.id) event_count,
        (select count(*)::integer from public.organization_projects project
          where project.source_opportunity_id=opportunity.id) project_count
       from public.organization_opportunities opportunity where opportunity.id=$1`,
      [opportunityId],
    );
    expect(paused.rows[0]).toEqual({
      converted_project_id: null,
      mapping_count: 0,
      event_count: 0,
      project_count: 1,
    });
  });

  it("promotes W once after re-enable and preserves identity on retry", async () => {
    await setControl("hosted");
    const award = (correlation: string) => actor.query(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,$4)",
      [ORG_ID, opportunityId, QUOTE_ID, correlation],
    );
    const first = await award("s6-hosted-award");
    const second = await award("s6-hosted-award-retry");
    expect(first.rows[0]).toMatchObject({
      project_id: workspaceProjectId,
      project_slug: workspaceSlug,
      project_created: false,
      storage_clone_required: false,
      lifecycle_strategy: "promote_workspace_v1",
    });
    expect(second.rows[0]).toMatchObject({
      project_id: workspaceProjectId,
      project_created: false,
    });

    const state = await setup.query(
      `select opportunity.converted_project_id,mapping.project_id,
              mapping.accepted_quote_id,project.slug,project.project_code,
              count(event.id)::integer event_count
       from public.organization_opportunities opportunity
       join public.opportunity_final_projects mapping
         on mapping.opportunity_id=opportunity.id
       join public.organization_projects project on project.id=mapping.project_id
       join public.opportunity_promotion_events event
         on event.opportunity_id=opportunity.id
       where opportunity.id=$1
       group by opportunity.converted_project_id,mapping.project_id,
                mapping.accepted_quote_id,project.slug,project.project_code`,
      [opportunityId],
    );
    expect(state.rows[0]).toEqual({
      converted_project_id: workspaceProjectId,
      project_id: workspaceProjectId,
      accepted_quote_id: QUOTE_ID,
      slug: workspaceSlug,
      project_code: workspaceCode,
      event_count: 1,
    });
  });

  it("keeps controls browser-inaccessible, organization-isolated, and audited", async () => {
    await expect(actor.query(
      "select * from public.opportunity_lifecycle_rollout_controls where organization_id=$1",
      [ORG_ID],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(outsider.query(
      `select * from public.create_opportunity_workspace_controlled_v1(
        $1,$2,'Cross Org',null,null,$3,'Auckland',null,0,''
      )`,
      [ORG_ID, "f7000000-0000-4000-8000-000000000099", OTHER_USER_ID],
    )).rejects.toMatchObject({ code: "42501" });

    const audit = await setup.query(
      `select count(*)::integer count,
              bool_and(changed_by=$2) actor_matches
       from public.opportunity_lifecycle_rollout_control_events
       where organization_id=$1`,
      [ORG_ID, USER_ID],
    );
    expect(audit.rows[0].count).toBeGreaterThanOrEqual(3);
    expect(audit.rows[0].actor_matches).toBe(true);
  });
});
