import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_PROMOTION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f8000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "f8000000-0000-4000-8000-000000000002";
const ORG_ID = "f8000000-0000-4000-8000-000000000010";
const OTHER_ORG_ID = "f8000000-0000-4000-8000-000000000011";
const CLIENT_ID = "f8000000-0000-4000-8000-000000000020";
const PROMOTION_REQUEST_ID = "f8000000-0000-4000-8000-000000000030";
const LEGACY_REQUEST_ID = "f8000000-0000-4000-8000-000000000031";
const OVERRIDE_REQUEST_ID = "f8000000-0000-4000-8000-000000000032";

describeDatabase("Stage 7 default Opportunity lifecycle behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actor = new pg.Client({ connectionString: dbUrl });
  const outsider = new pg.Client({ connectionString: dbUrl });
  let promotionOpportunityId = "";
  let promotionWorkspaceId = "";
  let promotionSlug = "";
  let promotionCode = "";
  let promotionQuoteId = "";

  beforeAll(async () => {
    await Promise.all([setup.connect(), actor.connect(), outsider.connect()]);
    await cleanup();
    for (const [id, email] of [
      [USER_ID, "stage7-owner@tradesstack.local"],
      [OTHER_USER_ID, "stage7-outsider@tradesstack.local"],
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
       values($1,'Stage 7 Default Development',$2),
             ($3,'Stage 7 Other Development',$4)`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_members(organization_id,user_id,role,display_name)
       values($1,$2,'owner','Stage 7 Owner'),
             ($3,$4,'owner','Stage 7 Outsider')`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_clients(id,organization_id,created_by,name,company_name)
       values($1,$2,$3,'Stage 7 Client','Stage 7 Client Limited')`,
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
    await setup.query("delete from public.opportunity_lifecycle_default_policy_events");
    await setup.query("delete from public.opportunity_lifecycle_default_policy");
    const tables = await setup.query<{ table_name: string }>(
      `select distinct columns.table_name
       from information_schema.columns columns
       join information_schema.tables tables
         on tables.table_schema=columns.table_schema
        and tables.table_name=columns.table_name
       where columns.table_schema='public'
         and columns.column_name='organization_id'
         and columns.table_name<>'organizations'
         and tables.table_type='BASE TABLE'`,
    );
    for (const { table_name: tableName } of tables.rows) {
      await setup.query(
        `delete from public."${tableName.replaceAll('"', '""')}" where organization_id in ($1,$2)`,
        [ORG_ID, OTHER_ORG_ID],
      );
    }
    await setup.query("delete from public.organization_members where user_id in ($1,$2)", [USER_ID, OTHER_USER_ID]);
    await setup.query("delete from public.organizations where id in ($1,$2) or created_by in ($3,$4)", [ORG_ID, OTHER_ORG_ID, USER_ID, OTHER_USER_ID]);
    await setup.query("delete from auth.users where id in ($1,$2)", [USER_ID, OTHER_USER_ID]);
    await setup.query("set session_replication_role=origin");
  }

  async function setPolicy(strategy: "promote_workspace_v1" | "legacy_two_project_v1") {
    await setup.query(
      `insert into public.opportunity_lifecycle_default_policy(
        singleton,environment,default_strategy,creation_enabled,promotion_enabled,
        effective_from,configured_by,configured_at
      ) values(true,'local_development',$1,true,$2,now(),$3,now())
      on conflict(singleton) do update set
        environment=excluded.environment,
        default_strategy=excluded.default_strategy,
        creation_enabled=excluded.creation_enabled,
        promotion_enabled=excluded.promotion_enabled,
        effective_from=excluded.effective_from,
        configured_by=excluded.configured_by,
        configured_at=excluded.configured_at`,
      [strategy, strategy === "promote_workspace_v1", USER_ID],
    );
  }

  async function createOpportunity(requestId: string, name: string) {
    return actor.query(
      `select * from public.create_opportunity_workspace_controlled_v1(
        $1,$2,$3,$4,null,$5,'Auckland',null,5000,'Stage 7 fixture'
      )`,
      [ORG_ID, requestId, name, CLIENT_ID, USER_ID],
    );
  }

  async function addQuote(opportunityId: string, workspaceId: string, prefix: string) {
    const quoteId = `${prefix}40`;
    const lineId = `${prefix}41`;
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,quote_date,
        subtotal,gst_amount,total_quote_price
      ) values($1,$2,$3,$4,'Stage 7 Contract',$5,'Accepted',$6,$6,current_date,5000,750,5750)`,
      [quoteId, ORG_ID, workspaceId, USER_ID, `S7-${quoteId.slice(-8)}`, opportunityId],
    );
    await setup.query(
      `insert into public.project_quote_line_items(
        id,organization_id,project_id,quote_id,section,description,quantity,unit,rate,total
      ) values($1,$2,$3,$4,'Labour','Stage 7 baseline',1,'item',5000,5000)`,
      [lineId, ORG_ID, workspaceId, quoteId],
    );
    return quoteId;
  }

  it("is dormant after migration and fails closed without an active default", async () => {
    const policies = await setup.query("select count(*)::integer count from public.opportunity_lifecycle_default_policy");
    expect(policies.rows[0].count).toBe(0);
    await expect(createOpportunity(PROMOTION_REQUEST_ID, "No policy")).rejects.toMatchObject({ code: "TS409" });
  });

  it("enforces trusted policy shape, audit and browser denial", async () => {
    await expect(setup.query(
      `insert into public.opportunity_lifecycle_default_policy(
        singleton,environment,default_strategy,creation_enabled,promotion_enabled,
        effective_from,configured_by
      ) values(true,'hosted_development','legacy_two_project_v1',true,true,now(),$1)`,
      [USER_ID],
    )).rejects.toMatchObject({ code: "23514" });

    await setPolicy("promote_workspace_v1");
    const audit = await setup.query("select operation,environment,changed_by from public.opportunity_lifecycle_default_policy_events");
    expect(audit.rows).toEqual([{ operation: "insert", environment: "local_development", changed_by: USER_ID }]);
    await expect(actor.query("select * from public.opportunity_lifecycle_default_policy")).rejects.toMatchObject({ code: "42501" });
    await expect(actor.query("update public.opportunity_lifecycle_default_policy set creation_enabled=false")).rejects.toMatchObject({ code: "42501" });
  });

  it("defaults creation to one immutable promotion O/W and retries idempotently", async () => {
    const first = await createOpportunity(PROMOTION_REQUEST_ID, "S7 Default Promotion");
    const retry = await createOpportunity(PROMOTION_REQUEST_ID, "S7 Default Promotion");
    promotionOpportunityId = first.rows[0].opportunity_id;
    promotionWorkspaceId = first.rows[0].workspace_project_id;
    promotionSlug = first.rows[0].workspace_project_slug;
    expect(first.rows[0].records_created).toBe(true);
    expect(retry.rows[0]).toMatchObject({
      opportunity_id: promotionOpportunityId,
      workspace_project_id: promotionWorkspaceId,
      records_created: false,
    });
    const state = await setup.query(
      `select opportunity.converted_project_id,project.source_opportunity_id,
              project.slug,project.project_code,lifecycle.strategy,
              lifecycle.original_workspace_project_id
       from public.organization_opportunities opportunity
       join public.organization_projects project on project.id=opportunity.workspace_project_id
       join public.opportunity_lifecycles lifecycle on lifecycle.opportunity_id=opportunity.id
       where opportunity.id=$1`,
      [promotionOpportunityId],
    );
    promotionCode = state.rows[0].project_code;
    expect(state.rows[0]).toMatchObject({
      converted_project_id: null,
      source_opportunity_id: promotionOpportunityId,
      slug: promotionSlug,
      strategy: "promote_workspace_v1",
      original_workspace_project_id: promotionWorkspaceId,
    });
    promotionQuoteId = await addQuote(promotionOpportunityId, promotionWorkspaceId, "f8000000-0000-4000-8000-0000000000");
  });

  it("changes only future selection to legacy and pauses an existing promotion", async () => {
    await setPolicy("legacy_two_project_v1");
    await expect(actor.query(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,'s7-paused')",
      [ORG_ID, promotionOpportunityId, promotionQuoteId],
    )).rejects.toMatchObject({ code: "TS409" });

    const legacy = await createOpportunity(LEGACY_REQUEST_ID, "S7 Future Legacy");
    const lifecycle = await setup.query("select strategy from public.opportunity_lifecycles where opportunity_id=$1", [legacy.rows[0].opportunity_id]);
    expect(lifecycle.rows[0].strategy).toBe("legacy_two_project_v1");
    const quoteId = await addQuote(legacy.rows[0].opportunity_id, legacy.rows[0].workspace_project_id, "f8000000-0000-4000-8000-0000000001");
    const award = await actor.query(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,'s7-legacy-award')",
      [ORG_ID, legacy.rows[0].opportunity_id, quoteId],
    );
    expect(award.rows[0].project_id).not.toBe(legacy.rows[0].workspace_project_id);
    expect(award.rows[0].lifecycle_strategy).toBe("legacy_two_project_v1");
  });

  it("restores promotion execution and preserves W identity on award and retry", async () => {
    await setPolicy("promote_workspace_v1");
    const award = (correlation: string) => actor.query(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,$4)",
      [ORG_ID, promotionOpportunityId, promotionQuoteId, correlation],
    );
    const [first, retry] = await Promise.all([award("s7-promote"), award("s7-promote-retry")]);
    expect(first.rows[0]).toMatchObject({
      project_id: promotionWorkspaceId,
      project_slug: promotionSlug,
      project_created: false,
      storage_clone_required: false,
      lifecycle_strategy: "promote_workspace_v1",
    });
    expect(retry.rows[0].project_id).toBe(promotionWorkspaceId);
    const state = await setup.query(
      `select opportunity.converted_project_id,mapping.project_id,mapping.accepted_quote_id,
              project.slug,project.project_code,count(event.id)::integer event_count,
              (select count(*)::integer from public.organization_projects source
                where source.source_opportunity_id=opportunity.id) project_count
       from public.organization_opportunities opportunity
       join public.opportunity_final_projects mapping on mapping.opportunity_id=opportunity.id
       join public.organization_projects project on project.id=mapping.project_id
       join public.opportunity_promotion_events event on event.opportunity_id=opportunity.id
       where opportunity.id=$1
       group by opportunity.id,opportunity.converted_project_id,mapping.project_id,
                mapping.accepted_quote_id,project.slug,project.project_code`,
      [promotionOpportunityId],
    );
    expect(state.rows[0]).toEqual({
      converted_project_id: promotionWorkspaceId,
      project_id: promotionWorkspaceId,
      accepted_quote_id: promotionQuoteId,
      slug: promotionSlug,
      project_code: promotionCode,
      event_count: 1,
      project_count: 1,
    });
  });

  it("gives an exact active legacy organization override precedence over promotion default", async () => {
    await setup.query(
      `insert into public.opportunity_lifecycle_rollout_controls(
        organization_id,allowed_strategy,creation_enabled,promotion_enabled,
        pilot_scope,pilot_environment,override_enabled,updated_by
      ) values($1,'legacy_two_project_v1',true,false,
        'hosted_development_allowlist','hosted_development',true,$2)`,
      [ORG_ID, USER_ID],
    );
    const created = await createOpportunity(OVERRIDE_REQUEST_ID, "S7 Legacy Override");
    const lifecycle = await setup.query("select strategy from public.opportunity_lifecycles where opportunity_id=$1", [created.rows[0].opportunity_id]);
    expect(lifecycle.rows[0].strategy).toBe("legacy_two_project_v1");
    await expect(outsider.query(
      `select * from public.create_opportunity_workspace_controlled_v1(
        $1,$2,'Cross organization',null,null,$3,'Auckland',null,0,''
      )`,
      [ORG_ID, "f8000000-0000-4000-8000-000000000099", OTHER_USER_ID],
    )).rejects.toMatchObject({ code: "42501" });
  });
});
