import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.OPPORTUNITY_PROMOTION_DB_URL
  ?? process.env.OPPORTUNITY_CONVERSION_DB_URL
  ?? process.env.DOCUMENT_WORKSPACE_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f3000000-0000-4000-8000-000000000001";
const ORG_ID = "f3000000-0000-4000-8000-000000000010";
const CLIENT_ID = "f3000000-0000-4000-8000-000000000020";

function id(group: number, index: number) {
  return `f3000000-0000-4${String(group).padStart(3, "0")}-8000-${String(index).padStart(12, "0")}`;
}

type Fixture = {
  directProjectId: string;
  historicalOpportunityId: string;
  historicalWorkspaceId: string;
  historicalFinalId: string;
  historicalQuoteId: string;
  legacyOpportunityId: string;
  legacyWorkspaceId: string;
  unawardedOpportunityId: string;
  unawardedWorkspaceId: string;
  promotedOpportunityId: string;
  promotedWorkspaceId: string;
  promotedQuoteId: string;
};

describeDatabase("Stage 2 Opportunity compatibility database behavior", () => {
  const database = new pg.Client({ connectionString: dbUrl });
  const actor = new pg.Client({ connectionString: dbUrl });
  let fixture: Fixture;

  beforeAll(async () => {
    await Promise.all([database.connect(), actor.connect()]);
    await cleanup();

    await database.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values(
        $1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','stage2-compatibility@example.test','',now(),'{}','{}'
      )`,
      [USER_ID],
    );
    await database.query(
      "delete from public.organization_members where user_id=$1",
      [USER_ID],
    );
    await database.query(
      "delete from public.organizations where created_by=$1",
      [USER_ID],
    );
    await database.query(
      "insert into public.organizations(id,name,created_by) values($1,'Stage 2 Compatibility Org',$2)",
      [ORG_ID, USER_ID],
    );
    await database.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Stage 2 Owner')`,
      [ORG_ID, USER_ID],
    );
    await database.query(
      `insert into public.organization_clients(
        id,organization_id,created_by,name,company_name
      ) values($1,$2,$3,'Stage 2 Client','Stage 2 Client Limited')`,
      [CLIENT_ID, ORG_ID, USER_ID],
    );

    fixture = await seedFixtures();
    await actor.query("select set_config('request.jwt.claim.sub', $1, false)", [
      USER_ID,
    ]);
    await actor.query(
      "select set_config('request.jwt.claim.role', 'authenticated', false)",
    );
    await actor.query("set role authenticated");
  });

  afterAll(async () => {
    await cleanup();
    await Promise.all([actor.end(), database.end()]);
  });

  async function cleanup() {
    await database.query("reset role");
    await database.query("set session_replication_role=replica");
    const tables = await database.query<{ table_name: string }>(
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
      await database.query(
        `delete from public."${tableName.replaceAll('"', '""')}"
         where organization_id=$1`,
        [ORG_ID],
      );
    }
    await database.query(
      "delete from public.organization_members where user_id=$1",
      [USER_ID],
    );
    await database.query(
      "delete from public.organizations where id=$1 or created_by=$2",
      [ORG_ID, USER_ID],
    );
    await database.query("delete from auth.users where id=$1", [USER_ID]);
    await database.query("set session_replication_role=origin");
  }

  async function createOpportunity(index: number) {
    const opportunityId = id(1, index);
    const workspaceId = id(2, index);
    await database.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,owner_user_id,client_id,name,slug,
        opportunity_code,stage
      ) values($1,$2,$3,$3,$4,$5,$6,$7,'Quoted')`,
      [
        opportunityId,
        ORG_ID,
        USER_ID,
        CLIENT_ID,
        `Stage 2 Opportunity ${index}`,
        `stage-2-opportunity-${index}`,
        `S2-O-${index}`,
      ],
    );
    await database.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,client_id,name,slug,project_code,
        source_opportunity_id
      ) values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        workspaceId,
        ORG_ID,
        USER_ID,
        CLIENT_ID,
        `Stage 2 Tender ${index}`,
        `stage-2-tender-${index}`,
        `S2-W-${index}`,
        opportunityId,
      ],
    );
    await database.query(
      "update public.organization_opportunities set workspace_project_id=$1 where id=$2",
      [workspaceId, opportunityId],
    );
    return { opportunityId, workspaceId };
  }

  async function addQuote(params: {
    opportunityId: string | null;
    projectId: string;
    index: number;
    status?: string;
  }) {
    const quoteId = id(4, params.index);
    await database.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,
        status,originating_opportunity_id,source_opportunity_id,subtotal
      ) values($1,$2,$3,$4,$5,$6,$7,$8,$8,1000)`,
      [
        quoteId,
        ORG_ID,
        params.projectId,
        USER_ID,
        `Stage 2 Quote ${params.index}`,
        `S2-Q-${params.index}`,
        params.status ?? "Accepted",
        params.opportunityId,
      ],
    );
    return quoteId;
  }

  async function seedFixtures(): Promise<Fixture> {
    const directProjectId = id(3, 1);
    await database.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,client_id,name,slug,project_code
      ) values($1,$2,$3,$4,'Stage 2 Direct','stage-2-direct','S2-D')`,
      [directProjectId, ORG_ID, USER_ID, CLIENT_ID],
    );
    await addQuote({
      opportunityId: null,
      projectId: directProjectId,
      index: 1,
      status: "Sent",
    });

    const historical = await createOpportunity(2);
    const historicalFinalId = id(3, 2);
    await database.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,client_id,name,slug,project_code,
        source_opportunity_id
      ) values($1,$2,$3,$4,'Stage 2 Historical Final',
        'stage-2-historical-final','S2-F-2',$5)`,
      [historicalFinalId, ORG_ID, USER_ID, CLIENT_ID, historical.opportunityId],
    );
    const historicalQuoteId = await addQuote({
      opportunityId: historical.opportunityId,
      projectId: historicalFinalId,
      index: 2,
    });
    await database.query(
      `update public.organization_opportunities
       set converted_project_id=$1,stage='Won' where id=$2`,
      [historicalFinalId, historical.opportunityId],
    );
    await database.query(
      `insert into public.opportunity_final_projects(
        opportunity_id,organization_id,project_id,accepted_quote_id,created_by
      ) values($1,$2,$3,$4,$5)`,
      [
        historical.opportunityId,
        ORG_ID,
        historicalFinalId,
        historicalQuoteId,
        USER_ID,
      ],
    );

    const legacy = await createOpportunity(3);

    const unawarded = await createOpportunity(4);
    await database.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,strategy,
        strategy_version,creation_request_id,created_by
      ) values($1,$2,$3,'promote_workspace_v1',1,$4,$5)`,
      [ORG_ID, unawarded.opportunityId, unawarded.workspaceId, id(5, 4), USER_ID],
    );

    const promoted = await createOpportunity(5);
    const lifecycleId = id(6, 5);
    await database.query(
      `insert into public.opportunity_lifecycles(
        id,organization_id,opportunity_id,original_workspace_project_id,
        strategy,strategy_version,creation_request_id,created_by
      ) values($1,$2,$3,$4,'promote_workspace_v1',1,$5,$6)`,
      [
        lifecycleId,
        ORG_ID,
        promoted.opportunityId,
        promoted.workspaceId,
        id(5, 5),
        USER_ID,
      ],
    );
    const promotedQuoteId = await addQuote({
      opportunityId: promoted.opportunityId,
      projectId: promoted.workspaceId,
      index: 5,
    });
    await database.query(
      `update public.organization_opportunities
       set converted_project_id=$1,stage='Won' where id=$2`,
      [promoted.workspaceId, promoted.opportunityId],
    );
    await database.query(
      `insert into public.opportunity_final_projects(
        opportunity_id,organization_id,project_id,accepted_quote_id,created_by
      ) values($1,$2,$3,$4,$5)`,
      [
        promoted.opportunityId,
        ORG_ID,
        promoted.workspaceId,
        promotedQuoteId,
        USER_ID,
      ],
    );
    await database.query(
      `insert into public.opportunity_promotion_events(
        organization_id,lifecycle_id,opportunity_id,project_id,
        accepted_quote_id,strategy,strategy_version,correlation_id,completed_by
      ) values($1,$2,$3,$4,$5,'promote_workspace_v1',1,$6,$7)`,
      [
        ORG_ID,
        lifecycleId,
        promoted.opportunityId,
        promoted.workspaceId,
        promotedQuoteId,
        id(7, 5),
        USER_ID,
      ],
    );

    return {
      directProjectId,
      historicalOpportunityId: historical.opportunityId,
      historicalWorkspaceId: historical.workspaceId,
      historicalFinalId,
      historicalQuoteId,
      legacyOpportunityId: legacy.opportunityId,
      legacyWorkspaceId: legacy.workspaceId,
      unawardedOpportunityId: unawarded.opportunityId,
      unawardedWorkspaceId: unawarded.workspaceId,
      promotedOpportunityId: promoted.opportunityId,
      promotedWorkspaceId: promoted.workspaceId,
      promotedQuoteId,
    };
  }

  async function classifyOpportunity(opportunityId: string) {
    const result = await database.query<{
      classification: string;
      is_valid: boolean;
    }>(
      "select classification,is_valid from public.classify_opportunity_lifecycle_v1($1,$2)",
      [ORG_ID, opportunityId],
    );
    return result.rows[0]!;
  }

  async function resolveProject(projectId: string) {
    const result = await database.query<{
      classification: string;
      is_valid: boolean;
      is_visible: boolean;
      is_delivery_eligible: boolean;
    }>(
      `select classification,is_valid,is_visible,is_delivery_eligible
       from public.resolve_project_lifecycle_v1($1,$2)`,
      [ORG_ID, projectId],
    );
    return result.rows[0]!;
  }

  it("classifies historical, unmarked, unawarded, awarded, and direct shapes", async () => {
    await expect(classifyOpportunity(fixture.historicalOpportunityId))
      .resolves.toMatchObject({
        classification: "historical_two_project",
        is_valid: true,
      });
    await expect(classifyOpportunity(fixture.legacyOpportunityId))
      .resolves.toMatchObject({
        classification: "legacy_unmarked",
        is_valid: true,
      });
    await expect(classifyOpportunity(fixture.unawardedOpportunityId))
      .resolves.toMatchObject({
        classification: "future_unawarded_promotion",
        is_valid: true,
      });
    await expect(classifyOpportunity(fixture.promotedOpportunityId))
      .resolves.toMatchObject({
        classification: "future_awarded_promotion",
        is_valid: true,
      });
    await expect(resolveProject(fixture.directProjectId)).resolves.toMatchObject({
      classification: "direct_project",
      is_valid: true,
    });
  });

  it("applies mapping-aware visibility independently of Opportunity stage", async () => {
    await database.query(
      "update public.organization_opportunities set stage='Quoted' where id=$1",
      [fixture.historicalOpportunityId],
    );

    await expect(resolveProject(fixture.historicalWorkspaceId))
      .resolves.toMatchObject({ is_visible: false });
    await expect(resolveProject(fixture.historicalFinalId))
      .resolves.toMatchObject({
        is_visible: true,
        is_delivery_eligible: true,
      });
    await expect(resolveProject(fixture.unawardedWorkspaceId))
      .resolves.toMatchObject({
        is_visible: false,
        is_delivery_eligible: false,
      });
    await expect(resolveProject(fixture.promotedWorkspaceId))
      .resolves.toMatchObject({
        is_visible: true,
        is_delivery_eligible: true,
      });
    await expect(resolveProject(fixture.directProjectId))
      .resolves.toMatchObject({
        is_visible: true,
        is_delivery_eligible: true,
      });
  });

  it("returns each visible Project once", async () => {
    const result = await database.query<{ project_id: string }>(
      "select project_id from public.get_visible_project_ids_v1($1,null)",
      [ORG_ID],
    );
    const ids = result.rows.map((row) => row.project_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(fixture.historicalFinalId);
    expect(ids).toContain(fixture.promotedWorkspaceId);
    expect(ids).toContain(fixture.directProjectId);
    expect(ids).not.toContain(fixture.historicalWorkspaceId);
    expect(ids).not.toContain(fixture.unawardedWorkspaceId);
  });

  it("uses mapped quotes and preserves direct-Project fallback", async () => {
    const promoted = await database.query<{
      quote_id: string;
      resolution_kind: string;
      is_valid: boolean;
    }>(
      "select * from public.resolve_project_contractual_baseline_v1($1,$2)",
      [ORG_ID, fixture.promotedWorkspaceId],
    );
    expect(promoted.rows[0]).toMatchObject({
      quote_id: fixture.promotedQuoteId,
      resolution_kind: "mapped_accepted_quote",
      is_valid: true,
    });

    const direct = await database.query<{
      resolution_kind: string;
      is_valid: boolean;
    }>(
      "select * from public.resolve_project_contractual_baseline_v1($1,$2)",
      [ORG_ID, fixture.directProjectId],
    );
    expect(direct.rows[0]).toMatchObject({
      resolution_kind: "direct_project_fallback",
      is_valid: true,
    });
  });

  it("preserves the historical null-mapping fallback and fails closed on an unrelated mapped quote", async () => {
    await database.query(
      `update public.opportunity_final_projects
       set accepted_quote_id=null where opportunity_id=$1`,
      [fixture.historicalOpportunityId],
    );
    const historicalFallback = await database.query<{
      quote_id: string;
      resolution_kind: string;
      is_valid: boolean;
    }>(
      "select * from public.resolve_project_contractual_baseline_v1($1,$2)",
      [ORG_ID, fixture.historicalFinalId],
    );
    expect(historicalFallback.rows[0]).toMatchObject({
      quote_id: fixture.historicalQuoteId,
      resolution_kind: "historical_null_mapping_fallback",
      is_valid: true,
    });

    const directQuote = await database.query<{ id: string }>(
      "select id from public.project_quotes where project_id=$1 limit 1",
      [fixture.directProjectId],
    );
    await database.query(
      `update public.opportunity_final_projects
       set accepted_quote_id=$1 where opportunity_id=$2`,
      [directQuote.rows[0]!.id, fixture.historicalOpportunityId],
    );
    await expect(classifyOpportunity(fixture.historicalOpportunityId))
      .resolves.toMatchObject({
        classification: "invalid_or_ambiguous",
        is_valid: false,
      });

    await database.query(
      `update public.opportunity_final_projects
       set accepted_quote_id=$1 where opportunity_id=$2`,
      [fixture.historicalQuoteId, fixture.historicalOpportunityId],
    );
  });

  it("recognizes an explicit legacy strategy without treating it as promotion", async () => {
    await database.query(
      `insert into public.opportunity_lifecycles(
        organization_id,opportunity_id,original_workspace_project_id,strategy,
        strategy_version,creation_request_id,created_by
      ) values($1,$2,$3,'legacy_two_project_v1',1,$4,$5)`,
      [
        ORG_ID,
        fixture.legacyOpportunityId,
        fixture.legacyWorkspaceId,
        id(5, 30),
        USER_ID,
      ],
    );
    await expect(classifyOpportunity(fixture.legacyOpportunityId))
      .resolves.toMatchObject({
        classification: "future_explicit_legacy",
        is_valid: true,
      });
    await expect(resolveProject(fixture.legacyWorkspaceId))
      .resolves.toMatchObject({
        is_visible: false,
        is_delivery_eligible: false,
      });
  });

  it("makes claim and retention baseline helpers agree", async () => {
    const result = await database.query<{
      quote_id: string;
      quote_total: string;
      retention_default: string;
    }>(
      `select baseline.quote_id,
              public.get_project_claim_base_quote_total($1,$2) quote_total,
              public.get_project_claim_base_quote_retention_percent_default($1,$2)
                retention_default
       from public.resolve_project_contractual_baseline_v1($1,$2) baseline`,
      [ORG_ID, fixture.promotedWorkspaceId],
    );
    expect(result.rows[0]).toMatchObject({
      quote_id: fixture.promotedQuoteId,
      quote_total: "1000.00",
      retention_default: "0.000",
    });
  });

  it("blocks delivery writes before award and allows direct and awarded writes", async () => {
    await expect(database.query(
      `insert into public.project_variations(
        organization_id,project_id,created_by,variation_title,variation_number
      ) values($1,$2,$3,'Blocked before award','S2-V-BLOCK')`,
      [ORG_ID, fixture.unawardedWorkspaceId, USER_ID],
    )).rejects.toThrow(/not delivery-eligible/i);

    await expect(database.query(
      `insert into public.project_variations(
        organization_id,project_id,created_by,variation_title,variation_number
      ) values($1,$2,$3,'Direct variation','S2-V-DIRECT')`,
      [ORG_ID, fixture.directProjectId, USER_ID],
    )).resolves.toBeDefined();

    await expect(database.query(
      `insert into public.project_variations(
        organization_id,project_id,created_by,variation_title,variation_number
      ) values($1,$2,$3,'Promoted variation','S2-V-PROMOTED')`,
      [ORG_ID, fixture.promotedWorkspaceId, USER_ID],
    )).resolves.toBeDefined();

    await expect(database.query(
      "delete from public.organization_projects where id=$1",
      [fixture.unawardedWorkspaceId],
    )).rejects.toThrow(/not delivery-eligible for deletion/i);
  });

  it("enforces compatibility through authenticated browser access without broadening control access", async () => {
    const visible = await actor.query<{ project_id: string }>(
      "select project_id from public.get_visible_project_ids_v1($1,null)",
      [ORG_ID],
    );
    expect(visible.rows.map((row) => row.project_id)).toContain(
      fixture.promotedWorkspaceId,
    );

    await expect(actor.query(
      `insert into public.project_variations(
        organization_id,project_id,created_by,variation_title,variation_number
      ) values($1,$2,$3,'Browser blocked before award','S2-V-BROWSER-BLOCK')`,
      [ORG_ID, fixture.unawardedWorkspaceId, USER_ID],
    )).rejects.toThrow(/not delivery-eligible/i);

    const member = await database.query<{ id: string }>(
      "select id from public.organization_members where organization_id=$1 and user_id=$2",
      [ORG_ID, USER_ID],
    );
    await expect(actor.query(
      `insert into public.project_members(
        organization_id,project_id,organization_member_id,created_by
      ) values($1,$2,$3,$4)`,
      [ORG_ID, fixture.unawardedWorkspaceId, member.rows[0]!.id, USER_ID],
    )).rejects.toThrow(/not delivery-eligible/i);

    await expect(actor.query(
      "select * from public.opportunity_lifecycle_rollout_controls where organization_id=$1",
      [ORG_ID],
    )).rejects.toThrow(/permission denied/i);

    await expect(actor.query(
      "update public.opportunity_lifecycles set metadata='{}' where opportunity_id=$1",
      [fixture.promotedOpportunityId],
    )).rejects.toThrow(/permission denied|immutable/i);
  });

  it("keeps lifecycle and rollout controls unchanged by reads", async () => {
    const before = await database.query(
      `select
        (select count(*) from public.opportunity_lifecycle_rollout_controls
          where organization_id=$1)::integer rollout_count,
        (select count(*) from public.opportunity_lifecycles
          where organization_id=$1)::integer lifecycle_count,
        (select count(*) from public.opportunity_promotion_events
          where organization_id=$1)::integer event_count`,
      [ORG_ID],
    );
    await database.query(
      "select * from public.get_visible_project_ids_v1($1,null)",
      [ORG_ID],
    );
    const after = await database.query(
      `select
        (select count(*) from public.opportunity_lifecycle_rollout_controls
          where organization_id=$1)::integer rollout_count,
        (select count(*) from public.opportunity_lifecycles
          where organization_id=$1)::integer lifecycle_count,
        (select count(*) from public.opportunity_promotion_events
          where organization_id=$1)::integer event_count`,
      [ORG_ID],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(after.rows[0]).toEqual({
      rollout_count: 0,
      lifecycle_count: 3,
      event_count: 1,
    });
  });
});
