import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_AWARD_PRICING_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

function deterministicUuid(value: string) {
  const hex = createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const USER_ID = randomUUID();
const ORG_ID = randomUUID();
const OPPORTUNITY_ID = randomUUID();
const PROJECT_ID = randomUUID();
const ACCEPTED_ID = randomUUID();
const ACCEPTED_LINE_ID = randomUUID();
const MANIFEST_ID = randomUUID();
const LEGACY_P1_ID = deterministicUuid(`${MANIFEST_ID}:working-quote`);
const LEGACY_P1_LINE_ID = deterministicUuid(`${LEGACY_P1_ID}:line:${ACCEPTED_LINE_ID}`);
const SOURCE_WORKBOOK_ID = randomUUID();
const LEGACY_WORKBOOK_ID = randomUUID();
const LEGACY_SHEET_ID = randomUUID();

describeDatabase("legacy automatic Project quote Draft routing", () => {
  const db = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await db.connect();
    await db.query("begin");
    await db.query("set local session_replication_role=replica");
    await db.query(
      `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','legacy-route@example.test','',now(),'{}','{}')`,
      [USER_ID],
    );
    await db.query("insert into public.organizations(id,name,created_by) values($1,'Legacy Route Org',$2)", [ORG_ID, USER_ID]);
    await db.query(
      "insert into public.organization_members(organization_id,user_id,role,display_name) values($1,$2,'owner','Legacy Route Owner')",
      [ORG_ID, USER_ID],
    );
    await db.query(
      `insert into public.organization_opportunities(id,organization_id,created_by,owner_user_id,name,slug,opportunity_code,stage)
       values($1,$2,$3,$3,'Legacy Route','legacy-route','LR-1','Won')`,
      [OPPORTUNITY_ID, ORG_ID, USER_ID],
    );
    await db.query(
      `insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code,source_opportunity_id)
       values($1,$2,$3,'Legacy Route Project','legacy-route-project','LR-P',$4)`,
      [PROJECT_ID, ORG_ID, USER_ID, OPPORTUNITY_ID],
    );
    await db.query(
      `insert into public.project_quotes(
         id,organization_id,project_id,created_by,quote_title,quote_number,status,
         originating_opportunity_id,source_opportunity_id,quote_date,subtotal,gst_amount,
         total_quote_price,revision_number,revision_kind,award_locked_at,created_at,updated_at
       ) values
       ($1,$2,$3,$4,'Accepted Tender','Q-LR-1','Accepted',$5,$5,'2026-08-19',100,15,115,1,'tender','2026-08-19T09:13:11Z','2026-08-19T09:12:52Z','2026-08-19T09:13:11Z'),
       ($6,$2,$3,$4,'Accepted Tender','Q-LR-1-P1','Draft',$5,$5,'2026-08-19',100,15,115,2,'project_working',null,'2026-08-19T09:13:11Z','2026-08-20T06:51:05Z')`,
      [ACCEPTED_ID, ORG_ID, PROJECT_ID, USER_ID, OPPORTUNITY_ID, LEGACY_P1_ID],
    );
    await db.query("update public.project_quotes set predecessor_quote_id=$1 where id=$2", [ACCEPTED_ID, LEGACY_P1_ID]);
    await db.query(
      `insert into public.project_quote_line_items(
         id,organization_id,project_id,quote_id,section,description,quantity,unit,rate,total,
         sort_order,pricing_source_kind,created_at,updated_at
       ) values
       ($1,$2,$3,$4,'Labour','Same commercial line',1,'item',100,100,1,'manual','2026-08-19T09:13:07Z','2026-08-19T09:13:07Z'),
       ($5,$2,$3,$6,'Labour','Same commercial line',1,'item',100,100,1,'manual','2026-08-20T06:51:03Z','2026-08-20T06:51:04Z')`,
      [ACCEPTED_LINE_ID, ORG_ID, PROJECT_ID, ACCEPTED_ID, LEGACY_P1_LINE_ID, LEGACY_P1_ID],
    );
    await db.query(
      `insert into public.opportunity_award_pricing_manifests(
         id,organization_id,opportunity_id,project_id,accepted_quote_id,working_quote_id,
         classification,manual_line_count,quote_subtotal_snapshot,quote_gst_snapshot,
         quote_total_snapshot,created_by,created_at
       ) values($1,$2,$3,$4,$5,$6,'MANUAL_ONLY',1,100,15,115,$7,'2026-08-19T09:13:11Z')`,
      [MANIFEST_ID, ORG_ID, OPPORTUNITY_ID, PROJECT_ID, ACCEPTED_ID, LEGACY_P1_ID, USER_ID],
    );
    await db.query(
      `insert into public.opportunity_pricing_worksheets(
         id,organization_id,opportunity_id,name,worksheet_data,created_by,updated_by,created_at,updated_at
       ) values($1,$2,$3,'Tender Source','{"version":1,"sheetName":"Tender Source","cells":{}}',$4,$4,'2026-08-19T09:12:00Z','2026-08-19T09:12:00Z')`,
      [SOURCE_WORKBOOK_ID, ORG_ID, OPPORTUNITY_ID, USER_ID],
    );
    await db.query(
      `insert into public.opportunity_pricing_worksheets(
         id,organization_id,opportunity_id,project_id,quote_id,name,worksheet_data,
         created_by,updated_by,source_workbook_id,source_workbook_version,
         source_award_manifest_id,clone_kind,created_at,updated_at
       ) values($1,$2,$3,$4,$5,'Legacy Working','{"version":1,"sheetName":"Legacy Working","cells":{}}',$6,$6,$7,1,$8,'project_working','2026-08-19T09:13:11Z','2026-08-19T09:13:11Z')`,
      [LEGACY_WORKBOOK_ID, ORG_ID, OPPORTUNITY_ID, PROJECT_ID, LEGACY_P1_ID, USER_ID, SOURCE_WORKBOOK_ID, MANIFEST_ID],
    );
    await db.query(
      `insert into public.opportunity_pricing_workbook_sheets(
         id,workbook_id,organization_id,opportunity_id,name,is_default,worksheet_data,created_by,updated_by,created_at,updated_at
       ) values($1,$2,$3,$4,'Legacy Working',true,'{"version":1,"sheetName":"Legacy Working","cells":{}}',$5,$5,'2026-08-19T09:13:11Z','2026-08-19T09:13:11Z')`,
      [LEGACY_SHEET_ID, LEGACY_WORKBOOK_ID, ORG_ID, OPPORTUNITY_ID, USER_ID],
    );
    await db.query("set local session_replication_role=origin");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_ID]);
    await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
  });

  afterAll(async () => {
    await db.query("rollback");
    await db.end();
  });

  it("recognizes identical commercial values despite later system timestamps", async () => {
    const result = await db.query(
      "select * from public.classify_legacy_automatic_project_quote_draft_v1($1,$2)",
      [ORG_ID, LEGACY_P1_ID],
    );
    expect(result.rows[0]).toMatchObject({
      manifest_linked: true,
      deterministic_id_match: true,
      expected_predecessor: true,
      expected_revision_kind: true,
      expected_status: true,
      quote_values_match: true,
      line_values_match: true,
      workbook_untouched: true,
      successor_absent: true,
      is_legacy_automatic_draft: true,
    });
  });

  it("does not classify a meaningfully edited Draft as automatic", async () => {
    await db.query("savepoint meaningful_edit");
    await db.query("update public.project_quotes set quote_title='User changed title' where id=$1", [LEGACY_P1_ID]);
    const result = await db.query(
      "select quote_values_match,is_legacy_automatic_draft from public.classify_legacy_automatic_project_quote_draft_v1($1,$2)",
      [ORG_ID, LEGACY_P1_ID],
    );
    expect(result.rows[0]).toEqual({ quote_values_match: false, is_legacy_automatic_draft: false });
    await db.query("rollback to savepoint meaningful_edit");
    await db.query("release savepoint meaningful_edit");
  });

  it("creates and idempotently reuses P2 without deleting historical P1", async () => {
    const first = await db.query<{ quote_id: string; quote_number: string; revision_number: number }>(
      "select * from public.create_project_quote_revision_v1($1,$2,$3,$4)",
      [ORG_ID, PROJECT_ID, ACCEPTED_ID, "Q-LR-1-P1"],
    );
    expect(first.rows[0]).toMatchObject({ quote_number: "Q-LR-1-P2", revision_number: 3 });

    const second = await db.query<{ quote_id: string; quote_number: string; revision_number: number }>(
      "select * from public.create_project_quote_revision_v1($1,$2,$3,$4)",
      [ORG_ID, PROJECT_ID, ACCEPTED_ID, "Q-LR-1-P1"],
    );
    expect(second.rows[0]).toEqual(first.rows[0]);

    const history = await db.query(
      "select quote_number,status from public.project_quotes where id=$1",
      [LEGACY_P1_ID],
    );
    expect(history.rows).toEqual([{ quote_number: "Q-LR-1-P1", status: "Draft" }]);
  });
});
