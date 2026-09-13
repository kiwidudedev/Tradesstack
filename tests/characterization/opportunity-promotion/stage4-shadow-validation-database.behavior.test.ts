import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_PROMOTION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f5000000-0000-4000-8000-000000000001";
const ORG_ID = "f5000000-0000-4000-8000-000000000010";
const CLIENT_ID = "f5000000-0000-4000-8000-000000000020";

function id(kind: number, index: number) {
  return `f5000000-0000-4${String(kind).padStart(3, "0")}-8000-${String(index).padStart(12, "0")}`;
}

describeDatabase("Stage 4 shadow validation database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actor = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await Promise.all([setup.connect(), actor.connect()]);
    await cleanup();
    await setup.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values($1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','stage4-shadow@example.test','',now(),'{}','{}')`,
      [USER_ID],
    );
    await setup.query("delete from public.organization_members where user_id=$1", [USER_ID]);
    await setup.query("delete from public.organizations where created_by=$1", [USER_ID]);
    await setup.query(
      "insert into public.organizations(id,name,created_by) values($1,'Stage 4 Shadow',$2)",
      [ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Stage 4 Owner')`,
      [ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.organization_clients(
        id,organization_id,created_by,name,company_name
      ) values($1,$2,$3,'Stage 4 Client','Stage 4 Client Limited')`,
      [CLIENT_ID, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.opportunity_lifecycle_rollout_controls(
        organization_id,allowed_strategy,creation_enabled,promotion_enabled,
        pilot_scope,pilot_environment,override_enabled,updated_by
      ) values($1,'legacy_two_project_v1',true,false,
        'local_admin_pilot','local_development',true,$2)`,
      [ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.opportunity_promotion_shadow_controls(
        organization_id,shadow_enabled,comparison_enabled,evaluator_version,updated_by
      ) values($1,true,true,'shadow-v2',$2)`,
      [ORG_ID, USER_ID],
    );
    await actor.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_ID]);
    await actor.query("select set_config('request.jwt.claim.role','authenticated',false)");
    await actor.query("set role authenticated");
  });

  afterAll(async () => {
    await actor.query("reset role").catch(() => undefined);
    await cleanup();
    await Promise.all([actor.end(), setup.end()]);
  });

  async function cleanup() {
    await setup.query("reset role");
    await setup.query("set session_replication_role=replica");
    const tables = await setup.query<{ table_name: string }>(
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
    for (const { table_name: tableName } of tables.rows) {
      await setup.query(
        `delete from public."${tableName.replaceAll('"', '""')}" where organization_id=$1`,
        [ORG_ID],
      );
    }
    await setup.query("delete from public.organization_members where user_id=$1", [USER_ID]);
    await setup.query("delete from public.organizations where id=$1 or created_by=$2", [ORG_ID, USER_ID]);
    await setup.query("delete from auth.users where id=$1", [USER_ID]);
    await setup.query("set session_replication_role=origin");
  }

  async function seed(index: number, acceptedQuoteCount = 1) {
    const creation = await actor.query<{
      opportunity_id: string;
      workspace_project_id: string;
    }>(
      `select opportunity_id,workspace_project_id
       from public.create_opportunity_workspace_v1(
         $1,$2,'legacy_two_project_v1',$3,$4,null,$5,'Auckland',null,$6,''
       )`,
      [ORG_ID, id(1, index), `Stage 4 Opportunity ${index}`, CLIENT_ID, USER_ID, 1000 + index],
    );
    const opportunityId = creation.rows[0].opportunity_id;
    const workspaceProjectId = creation.rows[0].workspace_project_id;
    const quoteIds: string[] = [];
    for (let quoteIndex = 0; quoteIndex < acceptedQuoteCount; quoteIndex += 1) {
      const quoteId = id(2 + quoteIndex, index);
      quoteIds.push(quoteId);
      await setup.query(
        `insert into public.project_quotes(
          id,organization_id,project_id,created_by,quote_title,quote_number,status,
          originating_opportunity_id,source_opportunity_id,quote_date,subtotal,
          gst_percent,gst_amount,total_quote_price,updated_at
        ) values($1,$2,$3,$4,$5,$6,'Accepted',$7,$7,current_date,100,15,15,115,
          now()+($8::text || ' milliseconds')::interval)`,
        [quoteId, ORG_ID, workspaceProjectId, USER_ID, `Stage 4 Quote ${index}-${quoteIndex}`, `S4-${index}-${quoteIndex}`, opportunityId, quoteIndex],
      );
      await setup.query(
        `insert into public.project_quote_line_items(
          id,organization_id,project_id,quote_id,section,description,quantity,unit,
          rate,total,sort_order
        ) values($1,$2,$3,$4,'Labour','fixture',1,'item',100,100,0)`,
        [id(5 + quoteIndex, index), ORG_ID, workspaceProjectId, quoteId],
      );
    }
    const documentWorkspaceId = id(7, index);
    await setup.query(
      `insert into public.document_workspaces(id,organization_id,created_by)
       values($1,$2,$3)`,
      [documentWorkspaceId, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.document_workspace_entities(
        organization_id,workspace_id,opportunity_id,linked_by
      ) values($1,$2,$3,$4)`,
      [ORG_ID, documentWorkspaceId, opportunityId, USER_ID],
    );
    const drawingSetId = id(20, index);
    const tradePackId = drawingSetId;
    await setup.query(
      `insert into public.project_drawing_sets(
        id,organization_id,project_id,uploaded_by,file_name,storage_path,file_size_bytes,mime_type
      ) values($1,$2,$3,$4,$5,$6,100,'application/pdf')`,
      [drawingSetId, ORG_ID, workspaceProjectId, USER_ID, `drawing-${index}.pdf`, `${ORG_ID}/${workspaceProjectId}/drawing-${index}.pdf`],
    );
    await setup.query(
      `insert into public.trade_packs(
        id,organization_id,project_id,trade_id,trade_label,pdf_url,page_index_json,created_by
      ) values($1,$2,$3,'carpentry','Carpentry',$4,'[]'::jsonb,$5)`,
      [tradePackId, ORG_ID, workspaceProjectId, `${ORG_ID}/${workspaceProjectId}/drawing-${index}.pdf`, USER_ID],
    );
    await setup.query(
      `insert into public.scope_runs(
        id,organization_id,project_id,trade_pack_id,created_by,status,result_json
      ) values($1,$2,$3,$4,$5,'complete','{}'::jsonb)`,
      [id(22, index), ORG_ID, workspaceProjectId, tradePackId, USER_ID],
    );
    const firstPageId = id(23, index);
    const secondPageId = id(24, index);
    await setup.query(
      `insert into public.takeoff_pages(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_number,
        page_width_pts,page_height_pts,created_by
      ) values
        ($1,$3,$4,$5,$6,1,595,842,$7),
        ($2,$3,$4,$5,$6,2,595,842,$7)`,
      [firstPageId, secondPageId, ORG_ID, workspaceProjectId, opportunityId, drawingSetId, USER_ID],
    );
    const calibrationId = id(25, index);
    await setup.query(
      `insert into public.takeoff_calibrations(
        id,organization_id,project_id,opportunity_id,page_id,name,scale_ratio,
        unit_system,base_unit,display_unit,reference_length_input,reference_length_base,
        point_a_x,point_a_y,point_b_x,point_b_y,is_active,created_by
      ) values($1,$2,$3,$4,$5,'Fixture scale',100,'metric','mm','m',1,1000,
        0.1,0.1,0.2,0.1,true,$6)`,
      [calibrationId, ORG_ID, workspaceProjectId, opportunityId, firstPageId, USER_ID],
    );
    const lineMeasurementId = id(26, index);
    const countMeasurementId = id(27, index);
    await setup.query(
      `insert into public.takeoff_measurements(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_id,
        calibration_id,measurement_kind,quantity,measured_length_base,display_value,
        display_unit,created_by
      ) values($1,$2,$3,$4,$5,$6,$7,'line',$8,1000,1,'m',$9)`,
      [lineMeasurementId, ORG_ID, workspaceProjectId, opportunityId, drawingSetId, firstPageId, calibrationId, 1 + (index % 3), USER_ID],
    );
    await setup.query(
      `insert into public.takeoff_measurement_points(
        organization_id,measurement_id,point_order,x,y
      ) values($1,$2,0,0.1,0.1),($1,$2,1,0.2,0.1)`,
      [ORG_ID, lineMeasurementId],
    );
    await setup.query(
      `insert into public.takeoff_measurements(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_id,
        measurement_kind,quantity,count_value,created_by
      ) values($1,$2,$3,$4,$5,$6,'count',$7::numeric,$7::integer,$8)`,
      [countMeasurementId, ORG_ID, workspaceProjectId, opportunityId, drawingSetId, secondPageId, 1 + (index % 4), USER_ID],
    );
    await setup.query(
      `insert into public.takeoff_measurement_events(
        organization_id,project_id,opportunity_id,measurement_id,event_type,version,
        actor_user_id,snapshot
      ) values($1,$2,$3,$4,'created',1,$5,'{}'::jsonb)`,
      [ORG_ID, workspaceProjectId, opportunityId, countMeasurementId, USER_ID],
    );
    for (let taskIndex = 0; taskIndex < 1 + (index % 3); taskIndex += 1) {
      await setup.query(
        `insert into public.project_job_todos(
          id,organization_id,project_id,opportunity_id,created_by,title,assigned_user_id
        ) values($1,$2,$3,$4,$5,$6,$5)`,
        [id(28 + taskIndex, index), ORG_ID, workspaceProjectId, opportunityId, USER_ID, `Continuity task ${index}-${taskIndex}`],
      );
    }
    const workbookId = id(35, index);
    const sheetId = id(36, index);
    await setup.query(
      `insert into public.opportunity_pricing_worksheets(
        id,organization_id,opportunity_id,project_id,name,created_by,updated_by
      ) values($1,$2,$3,$4,$5,$6,$6)`,
      [workbookId, ORG_ID, opportunityId, workspaceProjectId, `Workbook ${index}`, USER_ID],
    );
    await setup.query(
      `insert into public.opportunity_pricing_workbook_sheets(
        id,workbook_id,organization_id,opportunity_id,name,is_default,created_by,updated_by
      ) values($1,$2,$3,$4,'Pricing',true,$5,$5)`,
      [sheetId, workbookId, ORG_ID, opportunityId, USER_ID],
    );
    await setup.query(
      `insert into public.commercial_items(
        id,organization_id,opportunity_id,project_id,created_by,updated_by,
        source_workbook_id,source_worksheet_id,source_sheet_id,source_range,
        source_signature,quantity,rate,total,snapshot_json,source_link_json,
        locked_metadata_json
      ) values($1,$2,$3,$4,$5,$5,$6::uuid,$6::uuid,$7::uuid,'A1','fixture',1,100,100,
        jsonb_build_object(
          'version',1,'sheetName','Pricing','rangeLabel','A1','rowCount',0,
          'columnCount',0,'cellCount',0,'nonEmptyCellCount',0,
          'columns','[]'::jsonb,'rows','[]'::jsonb,'cells','[]'::jsonb
        ),
        jsonb_build_object(
          'version',1,'sourceType','worksheet_selection','ownerType','opportunity',
          'opportunityId',$3::uuid::text,'opportunitySlug','fixture',
          'projectId',$4::uuid::text,'projectSlug','fixture-tender',
          'quoteId',to_jsonb(null::text),'variationId',to_jsonb(null::text),
          'worksheetId',$6::uuid::text,
          'workbookId',$6::uuid::text,'sheetId',$7::uuid::text,'worksheetName','Pricing',
          'sheetName','Pricing','range','A1','rowCount',0,'columnCount',0,
          'cellCount',0,'worksheetVersion',1,'capturedAt',now()::text
        ),
        jsonb_build_object(
          'version',1,'worksheetVersion',1,'sheetName','Pricing','rangeLabel','A1',
          'worksheetMetadata','{}'::jsonb,'cells','[]'::jsonb
        ))`,
      [id(37, index), ORG_ID, opportunityId, workspaceProjectId, USER_ID, workbookId, sheetId],
    );
    await setup.query(
      `insert into public.cost_items(
        id,organization_id,project_id,source_document_kind,source_document_id,
        linked_quote_line_item_id,source_line_id,source_line_table,quantity,unit_rate,
        line_total,source_fingerprint,source_revision_key
      ) values($1,$2,$3,'project_quote',$4,$5,$5,'project_quote_line_items',1,100,100,$6,'v1')`,
      [id(38, index), ORG_ID, workspaceProjectId, quoteIds[0], id(5, index), `fixture-${index}`],
    );
    return { opportunityId, workspaceProjectId, quoteIds };
  }

  async function capture(index: number, opportunityId: string, quoteId: string) {
    return setup.query<{
      run_id: string;
      captured: boolean;
      eligible: boolean;
      failure_codes: string[];
    }>(
      "select * from public.capture_opportunity_promotion_shadow_v2($1,$2,$3,$4,$5)",
      [ORG_ID, opportunityId, quoteId, id(8, index), USER_ID],
    );
  }

  async function convert(opportunityId: string, quoteId: string) {
    return actor.query<{ project_id: string }>(
      "select project_id from public.convert_accepted_opportunity_to_project($1,$2,$3)",
      [ORG_ID, opportunityId, quoteId],
    );
  }

  async function completeLegacyMetadataClone(index: number, finalProjectId: string) {
    const clonedDrawingId = id(40, index);
    await setup.query(
      `insert into public.project_drawing_sets(
        id,organization_id,project_id,uploaded_by,file_name,storage_path,file_size_bytes,mime_type
      ) values($1,$2,$3,$4,$5,$6,100,'application/pdf')`,
      [clonedDrawingId, ORG_ID, finalProjectId, USER_ID, `cloned-${index}.pdf`, `${ORG_ID}/${finalProjectId}/cloned-${index}.pdf`],
    );
    await setup.query(
      `insert into public.trade_packs(
        id,organization_id,project_id,trade_id,trade_label,pdf_url,page_index_json,created_by
      ) values($1,$2,$3,'carpentry','Carpentry',$4,'[]'::jsonb,$5)`,
      [clonedDrawingId, ORG_ID, finalProjectId, `${ORG_ID}/${finalProjectId}/cloned-${index}.pdf`, USER_ID],
    );
    await setup.query(
      `insert into public.scope_runs(
        id,organization_id,project_id,trade_pack_id,created_by,status,result_json
      ) values($1,$2,$3,$4,$5,'complete','{}'::jsonb)`,
      [id(41, index), ORG_ID, finalProjectId, clonedDrawingId, USER_ID],
    );
  }

  async function finalize(runId: string, finalProjectId: string) {
    return setup.query<{
      finalized: boolean;
      comparison_result: string;
      mismatch_codes: string[];
      expected_difference_codes: string[];
    }>(
      "select * from public.finalize_opportunity_promotion_shadow_v2($1,$2,$3,$4)",
      [ORG_ID, runId, finalProjectId, USER_ID],
    );
  }

  it("captures and completes 30 deterministic legacy comparisons without promotion", async () => {
    for (let index = 1; index <= 30; index += 1) {
      const fixture = await seed(index);
      const firstEvaluation = await setup.query(
        "select * from public.evaluate_opportunity_promotion_shadow_v2($1,$2,$3,$4)",
        [ORG_ID, fixture.opportunityId, fixture.quoteIds[0], USER_ID],
      );
      const secondEvaluation = await setup.query(
        "select * from public.evaluate_opportunity_promotion_shadow_v2($1,$2,$3,$4)",
        [ORG_ID, fixture.opportunityId, fixture.quoteIds[0], USER_ID],
      );
      expect(firstEvaluation.rows[0]).toEqual(secondEvaluation.rows[0]);
      expect(firstEvaluation.rows[0].eligible).toBe(true);

      const observed = await capture(index, fixture.opportunityId, fixture.quoteIds[0]);
      expect(observed.rows[0]).toMatchObject({ captured: true, eligible: true });
      const converted = await convert(fixture.opportunityId, fixture.quoteIds[0]);
      expect(converted.rows[0].project_id).not.toBe(fixture.workspaceProjectId);
      await completeLegacyMetadataClone(index, converted.rows[0].project_id);
      const compared = await finalize(observed.rows[0].run_id, converted.rows[0].project_id);
      expect(compared.rows[0]).toEqual({
        finalized: true,
        comparison_result: "expected_difference",
        mismatch_codes: [],
        expected_difference_codes: expect.arrayContaining([
          "legacy_final_does_not_own_workspace_tasks",
          "legacy_final_does_not_own_takeoff_pages",
          "legacy_final_does_not_own_takeoff_measurements",
          "promoted_workspace_task_continuity_verified",
          "promoted_workspace_takeoff_continuity_verified",
          "promoted_workspace_measurement_continuity_verified",
        ]),
      });
    }

    const summary = await setup.query(
      "select * from public.get_opportunity_promotion_shadow_summary_v1($1)",
      [ORG_ID],
    );
    expect(summary.rows[0]).toMatchObject({
      evaluator_version: "shadow-v2",
      total_runs: "30",
      eligible_runs: "30",
      completed_comparisons: "30",
      expected_differences: "30",
      mismatches: "0",
      comparison_errors: "0",
    });
    const promotionEvents = await setup.query(
      "select count(*)::integer count from public.opportunity_promotion_events where organization_id=$1",
      [ORG_ID],
    );
    expect(promotionEvents.rows[0].count).toBe(0);
  }, 120_000);

  it("classifies multiple Accepted quotes as ineligible while legacy conversion stays authoritative", async () => {
    const fixture = await seed(31, 2);
    const selectedQuote = fixture.quoteIds[1];
    const observed = await capture(31, fixture.opportunityId, selectedQuote);
    expect(observed.rows[0].eligible).toBe(false);
    expect(observed.rows[0].failure_codes).toContain("multiple_accepted_quotes");

    const converted = await convert(fixture.opportunityId, selectedQuote);
    await completeLegacyMetadataClone(31, converted.rows[0].project_id);
    const compared = await finalize(observed.rows[0].run_id, converted.rows[0].project_id);
    expect(compared.rows[0]).toMatchObject({
      finalized: true,
      comparison_result: "ineligible",
    });
  });

  it("is idempotent on conversion and shadow retries", async () => {
    const fixture = await seed(32);
    const observed = await capture(32, fixture.opportunityId, fixture.quoteIds[0]);
    const converted = await convert(fixture.opportunityId, fixture.quoteIds[0]);
    await completeLegacyMetadataClone(32, converted.rows[0].project_id);
    await finalize(observed.rows[0].run_id, converted.rows[0].project_id);

    const repeatedCapture = await capture(33, fixture.opportunityId, fixture.quoteIds[0]);
    const repeatedConversion = await convert(fixture.opportunityId, fixture.quoteIds[0]);
    const repeatedFinalization = await finalize(
      repeatedCapture.rows[0].run_id,
      repeatedConversion.rows[0].project_id,
    );
    expect(repeatedCapture.rows[0].captured).toBe(false);
    expect(repeatedConversion.rows[0].project_id).toBe(converted.rows[0].project_id);
    expect(repeatedFinalization.rows[0].finalized).toBe(false);
    const count = await setup.query(
      "select count(*)::integer count from public.opportunity_promotion_shadow_runs where opportunity_id=$1",
      [fixture.opportunityId],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("keeps genuine permanent-workspace loss classified as a critical mismatch", async () => {
    const fixture = await seed(33);
    const observed = await capture(34, fixture.opportunityId, fixture.quoteIds[0]);
    await setup.query(
      "delete from public.project_job_todos where organization_id=$1 and opportunity_id=$2",
      [ORG_ID, fixture.opportunityId],
    );
    await setup.query(
      "delete from public.takeoff_pages where organization_id=$1 and id=$2",
      [ORG_ID, id(23, 33)],
    );
    const converted = await convert(fixture.opportunityId, fixture.quoteIds[0]);
    await completeLegacyMetadataClone(33, converted.rows[0].project_id);
    const compared = await finalize(observed.rows[0].run_id, converted.rows[0].project_id);
    expect(compared.rows[0].comparison_result).toBe("mismatch");
    expect(compared.rows[0].mismatch_codes).toEqual(expect.arrayContaining([
      "task_continuity_mismatch",
      "takeoff_page_continuity_mismatch",
      "measurement_continuity_mismatch",
      "calibration_continuity_mismatch",
    ]));
    expect(compared.rows[0].expected_difference_codes).toEqual([]);
  });

  it("proves isolated W=W task and takeoff identity, reads, and mutations", async () => {
    const fixture = await seed(34);
    const taskId = id(28, 34);
    const pageIds = [id(23, 34), id(24, 34)];
    const calibrationId = id(25, 34);
    const measurementIds = [id(26, 34), id(27, 34)];
    const before = await setup.query(
      `select
        (select array_agg(id order by id) from public.takeoff_pages where opportunity_id=$1) page_ids,
        (select array_agg(id order by id) from public.takeoff_calibrations where opportunity_id=$1) calibration_ids,
        (select array_agg(id order by id) from public.takeoff_measurements where opportunity_id=$1) measurement_ids,
        (select sum(quantity) from public.takeoff_measurements where opportunity_id=$1) quantity_total`,
      [fixture.opportunityId],
    );

    await setup.query("set session_replication_role=replica");
    await setup.query(
      `update public.opportunity_lifecycles
       set strategy='promote_workspace_v1'
       where opportunity_id=$1`,
      [fixture.opportunityId],
    );
    await setup.query(
      `update public.organization_opportunities
       set stage='Won',converted_project_id=$2,converted_at=now()
       where id=$1`,
      [fixture.opportunityId, fixture.workspaceProjectId],
    );
    await setup.query(
      `update public.organization_projects set stage='Construction' where id=$1`,
      [fixture.workspaceProjectId],
    );
    await setup.query(
      `insert into public.opportunity_final_projects(
        opportunity_id,organization_id,project_id,accepted_quote_id,created_by
      ) values($1,$2,$3,$4,$5)`,
      [fixture.opportunityId, ORG_ID, fixture.workspaceProjectId, fixture.quoteIds[0], USER_ID],
    );
    await setup.query("set session_replication_role=origin");

    const projectTasks = await actor.query<{ tasks: Array<{ id: string; projectId: string; opportunityId: string }> }>(
      "select public.list_tasks($1,null,null,false,false) tasks",
      [fixture.workspaceProjectId],
    );
    const opportunityTasks = await actor.query<{ tasks: Array<{ id: string; projectId: string; opportunityId: string }> }>(
      "select public.list_tasks(null,$1,null,false,false) tasks",
      [fixture.opportunityId],
    );
    expect(projectTasks.rows[0].tasks.map((task) => task.id)).toContain(taskId);
    expect(opportunityTasks.rows[0].tasks.map((task) => task.id)).toContain(taskId);
    const updatedTask = await actor.query<{ task: { id: string; title: string; projectId: string; opportunityId: string } }>(
      `select public.update_task($1,jsonb_build_object('title','Promoted W task updated')) task`,
      [taskId],
    );
    expect(updatedTask.rows[0].task).toMatchObject({
      id: taskId,
      title: "Promoted W task updated",
      projectId: fixture.workspaceProjectId,
      opportunityId: fixture.opportunityId,
    });

    const projectTakeoff = await actor.query(
      `select
        (select array_agg(id order by id) from public.takeoff_pages where project_id=$1) page_ids,
        (select array_agg(id order by id) from public.takeoff_calibrations where project_id=$1) calibration_ids,
        (select array_agg(id order by id) from public.takeoff_measurements where project_id=$1) measurement_ids,
        (select sum(quantity) from public.takeoff_measurements where project_id=$1) quantity_total`,
      [fixture.workspaceProjectId],
    );
    expect(projectTakeoff.rows[0]).toEqual(before.rows[0]);
    expect(projectTakeoff.rows[0].page_ids).toEqual(pageIds.sort());
    expect(projectTakeoff.rows[0].calibration_ids).toEqual([calibrationId]);
    expect(projectTakeoff.rows[0].measurement_ids).toEqual(measurementIds.sort());

    await actor.query(
      `update public.takeoff_measurements
       set quantity=9,count_value=9,version=version+1,updated_by=$2
       where id=$1 and measurement_kind='count'`,
      [id(27, 34), USER_ID],
    );
    const newMeasurementId = id(42, 34);
    await actor.query(
      `insert into public.takeoff_measurements(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_id,
        measurement_kind,quantity,count_value,created_by
      ) values($1,$2,$3,$4,$5,$6,'count',2,2,$7)`,
      [newMeasurementId, ORG_ID, fixture.workspaceProjectId, fixture.opportunityId, id(20, 34), id(24, 34), USER_ID],
    );
    const afterMutation = await actor.query(
      `select id,project_id,opportunity_id,page_id,quantity,count_value,version
       from public.takeoff_measurements where id in ($1,$2) order by id`,
      [id(27, 34), newMeasurementId],
    );
    expect(afterMutation.rows).toHaveLength(2);
    expect(afterMutation.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: id(27, 34), project_id: fixture.workspaceProjectId, page_id: id(24, 34), quantity: "9.000000", count_value: 9, version: 2 }),
      expect.objectContaining({ id: newMeasurementId, project_id: fixture.workspaceProjectId, page_id: id(24, 34), quantity: "2.000000", count_value: 2, version: 1 }),
    ]));
    const duplicateTaskCount = await setup.query(
      "select count(*)::integer count from public.project_job_todos where id=$1",
      [taskId],
    );
    expect(duplicateTaskCount.rows[0].count).toBe(1);
  });

  it("prevents ordinary users from falsifying, updating, deleting, or reading observations", async () => {
    await expect(actor.query(
      "select * from public.opportunity_promotion_shadow_runs where organization_id=$1",
      [ORG_ID],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(actor.query(
      "update public.opportunity_promotion_shadow_runs set mismatch_codes='{}' where organization_id=$1",
      [ORG_ID],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(actor.query(
      "delete from public.opportunity_promotion_shadow_runs where organization_id=$1",
      [ORG_ID],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(actor.query(
      "select * from public.capture_opportunity_promotion_shadow_v2($1,$2,$3,$4,$5)",
      [ORG_ID, id(1, 1), id(2, 1), id(8, 1), USER_ID],
    )).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps finalized observations immutable even for trusted direct writes", async () => {
    const run = await setup.query(
      "select id from public.opportunity_promotion_shadow_runs where status='completed' limit 1",
    );
    await expect(setup.query(
      "update public.opportunity_promotion_shadow_runs set comparison_result='match' where id=$1",
      [run.rows[0].id],
    )).rejects.toMatchObject({ code: "TS409" });
    await expect(setup.query(
      "delete from public.opportunity_promotion_shadow_runs where id=$1",
      [run.rows[0].id],
    )).rejects.toMatchObject({ code: "TS409" });
  });
});
