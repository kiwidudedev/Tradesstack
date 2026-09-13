import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_AWARD_PRICING_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USE_HOSTED_LOGIN_ROLE = process.env.OPPORTUNITY_AWARD_PRICING_DB_SET_POSTGRES_ROLE === "1";
const USER_ID = randomUUID();
const ORG_ID = randomUUID();
const OPPORTUNITY_ID = randomUUID();
const WORKSPACE_ID = randomUUID();
const ACCEPTED_QUOTE_ID = randomUUID();
const ACCEPTED_LINE_ID = randomUUID();
const SOURCE_WORKBOOK_ID = randomUUID();
const SOURCE_SHEET_ID = randomUUID();

describeDatabase("Opportunity award pricing lifecycle database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actor = setup;

  beforeAll(async () => {
    await setup.connect();
    if (USE_HOSTED_LOGIN_ROLE) {
      await setup.query("set role postgres");
    }
    await setup.query("begin");
    await setup.query("set local session_replication_role=replica");
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values ($1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','award-pricing@example.test','',now(),'{}','{}')`,
      [USER_ID],
    );
    await setup.query("set local session_replication_role=origin");
    await setup.query("insert into public.organizations(id,name,created_by) values($1,'Award Pricing Org',$2)", [ORG_ID, USER_ID]);
    await setup.query(
      "insert into public.organization_members(organization_id,user_id,role,display_name) values($1,$2,'owner','Award Owner')",
      [ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,owner_user_id,name,slug,opportunity_code,stage
      ) values($1,$2,$3,$3,'Award Pricing','award-pricing','AW-1','Quoted')`,
      [OPPORTUNITY_ID, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code,source_opportunity_id
      ) values($1,$2,$3,'Tender Workspace','award-pricing-tender','AW-T',$4)`,
      [WORKSPACE_ID, ORG_ID, USER_ID, OPPORTUNITY_ID],
    );
    await setup.query("update public.organization_opportunities set workspace_project_id=$1 where id=$2", [WORKSPACE_ID, OPPORTUNITY_ID]);
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,quote_date,subtotal,gst_amount,total_quote_price
      ) values($1,$2,$3,$4,'Accepted Tender','Q-AW-1','Accepted',$5,$5,current_date,100,15,115)`,
      [ACCEPTED_QUOTE_ID, ORG_ID, WORKSPACE_ID, USER_ID, OPPORTUNITY_ID],
    );
    await setup.query(
      `insert into public.project_quote_line_items(
        id,organization_id,project_id,quote_id,section,description,quantity,unit,rate,total,pricing_source_kind
      ) values($1,$2,$3,$4,'Labour','Manual accepted line',1,'item',100,100,'manual')`,
      [ACCEPTED_LINE_ID, ORG_ID, WORKSPACE_ID, ACCEPTED_QUOTE_ID],
    );
    await setup.query(
      `insert into public.opportunity_pricing_worksheets(
        id,organization_id,opportunity_id,name,worksheet_data,created_by,updated_by
      ) values($1,$2,$3,'Tender Pricing','{"version":1,"sheetName":"Tender Pricing","cells":{}}',$4,$4)`,
      [SOURCE_WORKBOOK_ID, ORG_ID, OPPORTUNITY_ID, USER_ID],
    );
    await setup.query(
      `insert into public.opportunity_pricing_workbook_sheets(
        id,workbook_id,organization_id,opportunity_id,name,is_default,worksheet_data,created_by,updated_by
      ) values($1,$2,$3,$4,'Tender Pricing',true,'{"version":1,"sheetName":"Tender Pricing","cells":{}}',$5,$5)`,
      [SOURCE_SHEET_ID, SOURCE_WORKBOOK_ID, ORG_ID, OPPORTUNITY_ID, USER_ID],
    );
    await actor.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_ID]);
    await actor.query("select set_config('request.jwt.claim.role','authenticated',false)");
  });

  afterAll(async () => {
    await setup.query("rollback");
    await setup.end();
  });

  async function expectDatabaseRejection(query: string, values: unknown[]) {
    await actor.query("savepoint expected_rejection");
    let rejection: unknown = null;
    try {
      await actor.query(query, values);
    } catch (error) {
      rejection = error;
    } finally {
      await actor.query("rollback to savepoint expected_rejection");
      await actor.query("release savepoint expected_rejection");
    }
    expect(rejection).toBeTruthy();
  }

  it("creates one immutable manifest and no Draft quote on conversion retry", async () => {
    const first = await actor.query<{ project_id: string }>(
      "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
      [ORG_ID, OPPORTUNITY_ID, ACCEPTED_QUOTE_ID],
    );
    const second = await actor.query<{ project_id: string }>(
      "select * from public.convert_accepted_opportunity_to_project($1,$2,$3)",
      [ORG_ID, OPPORTUNITY_ID, ACCEPTED_QUOTE_ID],
    );
    expect(second.rows[0]?.project_id).toBe(first.rows[0]?.project_id);

    const evidence = await setup.query(
      `select manifest.id as manifest_id,manifest.classification,manifest.manual_line_count,manifest.working_quote_id,
              accepted.award_locked_at
       from public.opportunity_award_pricing_manifests manifest
       join public.project_quotes accepted on accepted.id=manifest.accepted_quote_id
       where manifest.organization_id=$1 and manifest.opportunity_id=$2`,
      [ORG_ID, OPPORTUNITY_ID],
    );
    expect(evidence.rowCount).toBe(1);
    expect(evidence.rows[0]).toMatchObject({
      classification: "MANUAL_ONLY",
      manual_line_count: 1,
      working_quote_id: null,
    });
    expect(evidence.rows[0].award_locked_at).toBeTruthy();
    const automaticDrafts = await setup.query(
      "select id from public.project_quotes where organization_id=$1 and predecessor_quote_id=$2",
      [ORG_ID, ACCEPTED_QUOTE_ID],
    );
    expect(automaticDrafts.rowCount).toBe(0);

    const continuations = await setup.query(
      `select project_id,quote_id,clone_kind,source_workbook_id,source_award_manifest_id
       from public.opportunity_pricing_worksheets
       where organization_id=$1 and project_id=$2 and source_workbook_id=$3`,
      [ORG_ID, first.rows[0]?.project_id, SOURCE_WORKBOOK_ID],
    );
    expect(continuations.rows).toEqual([
      expect.objectContaining({
        project_id: first.rows[0]?.project_id,
        quote_id: null,
        clone_kind: "project_workspace",
        source_workbook_id: SOURCE_WORKBOOK_ID,
        source_award_manifest_id: evidence.rows[0]?.manifest_id,
      }),
    ]);
    const source = await setup.query(
      "select award_locked_at from public.opportunity_pricing_worksheets where id=$1",
      [SOURCE_WORKBOOK_ID],
    );
    expect(source.rows[0]?.award_locked_at).toBeTruthy();
  });

  it("edits and creates Project worksheets without changing tender evidence or creating a quote", async () => {
    const project = await setup.query<{ project_id: string }>(
      "select project_id from public.opportunity_final_projects where opportunity_id=$1",
      [OPPORTUNITY_ID],
    );
    const continuation = await setup.query<{ id: string }>(
      `update public.opportunity_pricing_worksheets
       set worksheet_data='{"version":2,"sheetName":"Project Working Pricing","cells":{"A1":{"value":"changed"}}}',
           version=2,updated_by=$1
       where organization_id=$2 and project_id=$3 and clone_kind='project_workspace'
       returning id`,
      [USER_ID, ORG_ID, project.rows[0]?.project_id],
    );
    expect(continuation.rows[0]?.id).toBeTruthy();

    await actor.query(
      `select public.save_pricing_workbook_active_sheet(
        p_organization_id => $1,p_opportunity_id => $2,p_project_id => $3,
        p_quote_id => null,p_user_id => $4,p_name => 'Project Alternative',
        p_worksheet_data => '{"version":1,"sheetName":"Project Alternative","cells":{}}'::jsonb,
        p_version => 1,p_save_request_id => $5
      )`,
      [ORG_ID, OPPORTUNITY_ID, project.rows[0]?.project_id, USER_ID, randomUUID()],
    );

    const source = await setup.query<{ worksheet_data: { cells?: Record<string, unknown> } }>(
      "select worksheet_data from public.opportunity_pricing_worksheets where id=$1",
      [SOURCE_WORKBOOK_ID],
    );
    expect(source.rows[0]?.worksheet_data.cells ?? {}).toEqual({});
    const accepted = await setup.query("select subtotal,gst_amount,total_quote_price from public.project_quotes where id=$1", [ACCEPTED_QUOTE_ID]);
    expect(accepted.rows[0]).toMatchObject({ subtotal: "100.00", gst_amount: "15.00", total_quote_price: "115.00" });
    const drafts = await setup.query(
      "select id from public.project_quotes where organization_id=$1 and predecessor_quote_id=$2",
      [ORG_ID, ACCEPTED_QUOTE_ID],
    );
    expect(drafts.rowCount).toBe(0);
    const projectOwned = await setup.query(
      "select quote_id from public.opportunity_pricing_worksheets where organization_id=$1 and project_id=$2 and name='Project Alternative'",
      [ORG_ID, project.rows[0]?.project_id],
    );
    expect(projectOwned.rows).toEqual([{ quote_id: null }]);
  });

  it("rejects accepted quote and line mutation while explicit revision creation remains available", async () => {
    await expectDatabaseRejection(
      "update public.project_quotes set quote_title='Changed' where id=$1",
      [ACCEPTED_QUOTE_ID],
    );
    await expectDatabaseRejection(
      "update public.project_quote_line_items set rate=999 where id=$1",
      [ACCEPTED_LINE_ID],
    );
    const project = await setup.query<{ project_id: string }>(
      "select project_id from public.opportunity_final_projects where opportunity_id=$1",
      [OPPORTUNITY_ID],
    );
    const created = await actor.query<{ quote_id: string; revision_number: number; cloned_workbook_count: number }>(
      "select * from public.create_project_quote_revision_v1($1,$2,$3,$4)",
      [ORG_ID, project.rows[0]?.project_id, ACCEPTED_QUOTE_ID, "Q-AW-1-P1"],
    );
    expect(created.rows[0]?.quote_id).toBeTruthy();
    expect(created.rows[0]?.revision_number).toBe(2);
    expect(created.rows[0]?.cloned_workbook_count).toBe(1);

    const revisionWorkbooks = await setup.query(
      `select quote_id,clone_kind,source_workbook_id
       from public.opportunity_pricing_worksheets
       where organization_id=$1 and quote_id=$2`,
      [ORG_ID, created.rows[0]?.quote_id],
    );
    expect(revisionWorkbooks.rows).toEqual([
      expect.objectContaining({
        quote_id: created.rows[0]?.quote_id,
        clone_kind: "quote_revision",
      }),
    ]);

    const updated = await actor.query(
      "update public.project_quotes set quote_title='Working Revision' where id=$1 returning quote_title",
      [created.rows[0]?.quote_id],
    );
    expect(updated.rows[0]?.quote_title).toBe("Working Revision");
  });

  it("idempotently reuses the explicitly created successor", async () => {
    const project = await setup.query<{ project_id: string }>(
      "select project_id from public.opportunity_final_projects where opportunity_id=$1",
      [OPPORTUNITY_ID],
    );
    const first = await actor.query<{ quote_id: string; revision_number: number }>(
      "select * from public.create_project_quote_revision_v1($1,$2,$3,$4)",
      [ORG_ID, project.rows[0]?.project_id, ACCEPTED_QUOTE_ID, "Q-AW-1-P1"],
    );
    const second = await actor.query<{ quote_id: string; revision_number: number }>(
      "select * from public.create_project_quote_revision_v1($1,(select project_id from public.opportunity_final_projects where opportunity_id=$2),$3,$4)",
      [ORG_ID, OPPORTUNITY_ID, ACCEPTED_QUOTE_ID, "Q-AW-1-P1"],
    );
    expect(second.rows[0]?.quote_id).toBe(first.rows[0]?.quote_id);
    expect(first.rows[0]?.revision_number).toBe(2);
  });
});
