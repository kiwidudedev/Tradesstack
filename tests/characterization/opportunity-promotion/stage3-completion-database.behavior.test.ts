import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_PROMOTION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f4000000-0000-4000-8000-000000000001";
const ORG_ID = "f4000000-0000-4000-8000-000000000010";
const OPPORTUNITY_ID = "f4000000-0000-4000-8000-000000000020";
const WORKSPACE_ID = "f4000000-0000-4000-8000-000000000030";
const FINAL_ID = "f4000000-0000-4000-8000-000000000040";

describeDatabase("Stage 3 completion database behavior", () => {
  const database = new pg.Client({ connectionString: dbUrl });
  const actor = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await Promise.all([database.connect(), actor.connect()]);
    await database.query("set session_replication_role=replica");
    await database.query("delete from public.organization_members where user_id=$1", [USER_ID]);
    await database.query("delete from public.organizations where created_by=$1", [USER_ID]);
    await database.query("delete from auth.users where id=$1", [USER_ID]);
    await database.query("set session_replication_role=origin");
    await database.query(`insert into auth.users(
      id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data
    ) values($1,'00000000-0000-0000-0000-000000000000','authenticated',
      'authenticated','stage3-completion@example.test','',now(),'{}','{}')`, [USER_ID]);
    await database.query("delete from public.organization_members where user_id=$1", [USER_ID]);
    await database.query("delete from public.organizations where created_by=$1", [USER_ID]);
    await database.query(
      "insert into public.organizations(id,name,created_by) values($1,'Stage 3 Completion',$2)",
      [ORG_ID, USER_ID],
    );
    await database.query(
      "insert into public.organization_members(organization_id,user_id,role,display_name) values($1,$2,'owner','Stage 3 Owner')",
      [ORG_ID, USER_ID],
    );
    await database.query(`insert into public.organization_projects(
      id,organization_id,created_by,name,slug,project_code,stage,location
    ) values
      ($1,$2,$3,'Stage 3 Tender','stage-3-tender','S3-W','Pricing','Auckland'),
      ($4,$2,$3,'Stage 3 Final','stage-3-final','S3-F','Construction','Auckland')`,
    [WORKSPACE_ID, ORG_ID, USER_ID, FINAL_ID]);
    await database.query(`insert into public.organization_opportunities(
      id,organization_id,created_by,owner_user_id,workspace_project_id,
      converted_project_id,converted_at,name,slug,opportunity_code,stage,location
    ) values($1,$2,$3,$3,$4,$5,now(),'Stage 3 Award','stage-3-award','S3-O','Won','Auckland')`,
    [OPPORTUNITY_ID, ORG_ID, USER_ID, WORKSPACE_ID, FINAL_ID]);
    await database.query(`insert into public.opportunity_final_projects(
      organization_id,opportunity_id,project_id,created_by
    ) values($1,$2,$3,$4)`, [ORG_ID, OPPORTUNITY_ID, FINAL_ID, USER_ID]);

    await actor.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_ID]);
    await actor.query("select set_config('request.jwt.claim.role','authenticated',false)");
    await actor.query("set role authenticated");
  });

  afterAll(async () => {
    await actor.query("reset role").catch(() => undefined);
    await database.query("set session_replication_role=replica");
    await database.query("delete from public.organization_opportunities where organization_id=$1", [ORG_ID]);
    await database.query("delete from public.organization_projects where organization_id=$1", [ORG_ID]);
    await database.query("delete from public.organization_members where organization_id=$1", [ORG_ID]);
    await database.query("delete from public.organizations where id=$1", [ORG_ID]);
    await database.query("delete from auth.users where id=$1", [USER_ID]);
    await database.query("set session_replication_role=origin");
    await Promise.all([actor.end(), database.end()]);
  });

  it("blocks ordinary authenticated Won reversal and preserves final identity", async () => {
    await expect(actor.query(
      "update public.organization_opportunities set stage='Quoted',converted_project_id=null,converted_at=null where id=$1",
      [OPPORTUNITY_ID],
    )).rejects.toMatchObject({ code: "TS409" });

    const state = await database.query(
      "select stage,converted_project_id,converted_at is not null converted_at_present from public.organization_opportunities where id=$1",
      [OPPORTUNITY_ID],
    );
    expect(state.rows[0]).toEqual({
      stage: "Won",
      converted_project_id: FINAL_ID,
      converted_at_present: true,
    });
  });

  it("leaves trusted reconciliation capable of representing historical states", async () => {
    await database.query(
      "update public.organization_opportunities set stage='Quoted' where id=$1",
      [OPPORTUNITY_ID],
    );
    await database.query(
      "update public.organization_opportunities set stage='Won' where id=$1",
      [OPPORTUNITY_ID],
    );
  });
});
