import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.OPPORTUNITY_PROMOTION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER_ID = "f6000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "f6000000-0000-4000-8000-000000000002";
const ORG_ID = "f6000000-0000-4000-8000-000000000010";
const OTHER_ORG_ID = "f6000000-0000-4000-8000-000000000011";
const CLIENT_ID = "f6000000-0000-4000-8000-000000000020";

function id(kind: number, index: number) {
  return `f6000000-0000-4${String(kind).padStart(3, "0")}-8000-${String(index).padStart(12, "0")}`;
}

type PilotFixture = {
  opportunityId: string;
  workspaceProjectId: string;
  workspaceSlug: string;
  workspaceCode: string;
  quoteId: string;
  taskId: string;
  pageIds: string[];
  calibrationId: string;
  measurementIds: string[];
  documentWorkspaceId: string;
  documentNodeId: string;
  documentVersionId: string;
  storageKey: string;
  drawingId: string;
  tradePackId: string;
  scopeRunId: string;
};

describeDatabase("Stage 5 local administrator same-Project pilot", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const actorA = new pg.Client({ connectionString: dbUrl });
  const actorB = new pg.Client({ connectionString: dbUrl });
  const promoted: PilotFixture[] = [];

  beforeAll(async () => {
    await Promise.all([setup.connect(), actorA.connect(), actorB.connect()]);
    await cleanup();
    for (const [userId, email] of [
      [USER_ID, "stage5-pilot@example.test"],
      [OTHER_USER_ID, "stage5-other@example.test"],
    ]) {
      await setup.query(
        `insert into auth.users(
          id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data
        ) values($1,'00000000-0000-0000-0000-000000000000','authenticated',
          'authenticated',$2,'',now(),'{}','{}')`,
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
       values($1,'Stage 5 Pilot',$2),($3,'Stage 5 Other',$4)`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_members(organization_id,user_id,role,display_name)
       values($1,$2,'owner','Stage 5 Owner'),($3,$4,'owner','Other Owner')`,
      [ORG_ID, USER_ID, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.organization_clients(id,organization_id,created_by,name,company_name)
       values($1,$2,$3,'Stage 5 Client','Stage 5 Client Limited')`,
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
    await Promise.all([configureActor(actorA, USER_ID), configureActor(actorB, USER_ID)]);
  });

  afterAll(async () => {
    await Promise.all([
      actorA.query("reset role").catch(() => undefined),
      actorB.query("reset role").catch(() => undefined),
    ]);
    await cleanup();
    await Promise.all([actorA.end(), actorB.end(), setup.end()]);
  });

  async function configureActor(client: pg.Client, userId: string) {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
    await client.query("select set_config('request.jwt.claim.role','authenticated',false)");
    await client.query("set role authenticated");
  }

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
        `delete from public."${tableName.replaceAll('"', '""')}" where organization_id in ($1,$2)`,
        [ORG_ID, OTHER_ORG_ID],
      );
    }
    await setup.query("delete from public.organization_members where user_id in ($1,$2)", [USER_ID, OTHER_USER_ID]);
    await setup.query(
      "delete from public.organizations where id in ($1,$2) or created_by in ($3,$4)",
      [ORG_ID, OTHER_ORG_ID, USER_ID, OTHER_USER_ID],
    );
    await setup.query("delete from auth.users where id in ($1,$2)", [USER_ID, OTHER_USER_ID]);
    await setup.query("set session_replication_role=origin");
  }

  async function setPilotEnabled(enabled: boolean) {
    await setup.query(
      `update public.opportunity_lifecycle_rollout_controls
       set creation_enabled=$2,promotion_enabled=$2,override_enabled=$2,
           updated_by=$3,updated_at=now()
       where organization_id=$1`,
      [ORG_ID, enabled, USER_ID],
    );
  }

  async function createPilot(index: number, newClient = false) {
    const result = await actorA.query<{
      opportunity_id: string;
      workspace_project_id: string;
      workspace_project_slug: string;
      lifecycle_id: string;
      records_created: boolean;
    }>(
      `select * from public.create_opportunity_workspace_controlled_v1(
        $1,$2,$3,$4,$5::jsonb,$6,'Auckland',null,$7,''
      )`,
      [
        ORG_ID,
        id(1, index),
        `Stage 5 Pilot ${index}`,
        newClient ? null : CLIENT_ID,
        newClient
          ? JSON.stringify({ name: `Pilot Client ${index}`, company_name: `Pilot Company ${index}` })
          : null,
        USER_ID,
        1000 + index,
      ],
    );
    const row = result.rows[0]!;
    const project = await setup.query<{ slug: string; project_code: string }>(
      "select slug,project_code from public.organization_projects where id=$1",
      [row.workspace_project_id],
    );
    return {
      opportunityId: row.opportunity_id,
      workspaceProjectId: row.workspace_project_id,
      workspaceSlug: project.rows[0]!.slug,
      workspaceCode: project.rows[0]!.project_code,
    };
  }

  async function addFeatureDenseData(index: number, base: Awaited<ReturnType<typeof createPilot>>): Promise<PilotFixture> {
    const { opportunityId, workspaceProjectId } = base;
    const quoteId = id(2, index);
    const quoteLineId = id(3, index);
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,source_opportunity_id,quote_date,subtotal,
        gst_percent,gst_amount,total_quote_price,retention_percent_default
      ) values($1,$2,$3,$4,$5,$6,'Accepted',$7,$7,current_date,1000,15,150,1150,10)`,
      [quoteId, ORG_ID, workspaceProjectId, USER_ID, `Pilot Quote ${index}`, `PILOT-${index}`, opportunityId],
    );
    await setup.query(
      `insert into public.project_quote_line_items(
        id,organization_id,project_id,quote_id,section,description,quantity,unit,rate,total,sort_order
      ) values($1,$2,$3,$4,'Labour','Pilot baseline',10,'hour',100,1000,0)`,
      [quoteLineId, ORG_ID, workspaceProjectId, quoteId],
    );

    const drawingId = id(4, index);
    const storagePath = `${ORG_ID}/${workspaceProjectId}/pilot-${index}.pdf`;
    await setup.query(
      `insert into public.project_drawing_sets(
        id,organization_id,project_id,uploaded_by,file_name,storage_path,file_size_bytes,mime_type
      ) values($1,$2,$3,$4,$5,$6,100,'application/pdf')`,
      [drawingId, ORG_ID, workspaceProjectId, USER_ID, `pilot-${index}.pdf`, storagePath],
    );
    const tradePackId = drawingId;
    await setup.query(
      `insert into public.trade_packs(
        id,organization_id,project_id,trade_id,trade_label,pdf_url,page_index_json,created_by
      ) values($1,$2,$3,'carpentry','Carpentry',$4,'[]'::jsonb,$5)`,
      [tradePackId, ORG_ID, workspaceProjectId, storagePath, USER_ID],
    );
    const scopeRunId = id(6, index);
    await setup.query(
      `insert into public.scope_runs(
        id,organization_id,project_id,trade_pack_id,created_by,status,result_json
      ) values($1,$2,$3,$4,$5,'complete','{}'::jsonb)`,
      [scopeRunId, ORG_ID, workspaceProjectId, tradePackId, USER_ID],
    );

    const pageIds = [id(7, index), id(8, index)];
    await setup.query(
      `insert into public.takeoff_pages(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_number,
        page_width_pts,page_height_pts,created_by
      ) values($1,$3,$4,$5,$6,1,595,842,$7),($2,$3,$4,$5,$6,2,595,842,$7)`,
      [pageIds[0], pageIds[1], ORG_ID, workspaceProjectId, opportunityId, drawingId, USER_ID],
    );
    const calibrationId = id(9, index);
    await setup.query(
      `insert into public.takeoff_calibrations(
        id,organization_id,project_id,opportunity_id,page_id,name,scale_ratio,
        unit_system,base_unit,display_unit,reference_length_input,reference_length_base,
        point_a_x,point_a_y,point_b_x,point_b_y,is_active,created_by
      ) values($1,$2,$3,$4,$5,'Pilot scale',100,'metric','mm','m',1,1000,
        0.1,0.1,0.2,0.1,true,$6)`,
      [calibrationId, ORG_ID, workspaceProjectId, opportunityId, pageIds[0], USER_ID],
    );
    const measurementIds = [id(10, index), id(11, index)];
    await setup.query(
      `insert into public.takeoff_measurements(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_id,
        calibration_id,measurement_kind,quantity,measured_length_base,display_value,
        display_unit,created_by
      ) values($1,$2,$3,$4,$5,$6,$7,'line',2,2000,2,'m',$8)`,
      [measurementIds[0], ORG_ID, workspaceProjectId, opportunityId, drawingId, pageIds[0], calibrationId, USER_ID],
    );
    await setup.query(
      `insert into public.takeoff_measurement_points(organization_id,measurement_id,point_order,x,y)
       values($1,$2,0,0.1,0.1),($1,$2,1,0.2,0.1)`,
      [ORG_ID, measurementIds[0]],
    );
    await setup.query(
      `insert into public.takeoff_measurements(
        id,organization_id,project_id,opportunity_id,drawing_set_id,page_id,
        measurement_kind,quantity,count_value,created_by
      ) values($1,$2,$3,$4,$5,$6,'count',3,3,$7)`,
      [measurementIds[1], ORG_ID, workspaceProjectId, opportunityId, drawingId, pageIds[1], USER_ID],
    );
    await setup.query(
      `insert into public.takeoff_measurement_events(
        organization_id,project_id,opportunity_id,measurement_id,event_type,version,actor_user_id,snapshot
      ) values($1,$2,$3,$4,'created',1,$5,'{}'::jsonb)`,
      [ORG_ID, workspaceProjectId, opportunityId, measurementIds[1], USER_ID],
    );

    const taskId = id(12, index);
    await setup.query(
      `insert into public.project_job_todos(
        id,organization_id,project_id,opportunity_id,created_by,title,assigned_user_id
      ) values($1,$2,$3,$4,$5,$6,$5)`,
      [taskId, ORG_ID, workspaceProjectId, opportunityId, USER_ID, `Pilot task ${index}`],
    );

    const workbookId = id(13, index);
    const sheetId = id(14, index);
    await setup.query(
      `insert into public.opportunity_pricing_worksheets(
        id,organization_id,opportunity_id,project_id,name,created_by,updated_by
      ) values($1,$2,$3,$4,$5,$6,$6)`,
      [workbookId, ORG_ID, opportunityId, workspaceProjectId, `Pilot workbook ${index}`, USER_ID],
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
        source_signature,quantity,rate,total,snapshot_json,source_link_json,locked_metadata_json
      ) values($1,$2,$3,$4,$5,$5,$6,$6,$7,'A1','pilot',1,1000,1000,
        jsonb_build_object('version',1,'sheetName','Pricing','rangeLabel','A1','rowCount',0,'columnCount',0,'cellCount',0,'nonEmptyCellCount',0,'columns','[]'::jsonb,'rows','[]'::jsonb,'cells','[]'::jsonb),
        jsonb_build_object('version',1,'sourceType','worksheet_selection','ownerType','opportunity','opportunityId',$3::uuid::text,'opportunitySlug','pilot','projectId',$4::uuid::text,'projectSlug','pilot-tender','quoteId',to_jsonb(null::text),'variationId',to_jsonb(null::text),'worksheetId',$6::uuid::text,'workbookId',$6::uuid::text,'sheetId',$7::uuid::text,'worksheetName','Pricing','sheetName','Pricing','range','A1','rowCount',0,'columnCount',0,'cellCount',0,'worksheetVersion',1,'capturedAt',now()::text),
        jsonb_build_object('version',1,'worksheetVersion',1,'sheetName','Pricing','rangeLabel','A1','worksheetMetadata','{}'::jsonb,'cells','[]'::jsonb))`,
      [id(15, index), ORG_ID, opportunityId, workspaceProjectId, USER_ID, workbookId, sheetId],
    );
    await setup.query(
      `insert into public.cost_items(
        id,organization_id,project_id,source_document_kind,source_document_id,
        linked_quote_line_item_id,source_line_id,source_line_table,quantity,unit_rate,
        line_total,source_fingerprint,source_revision_key
      ) values($1,$2,$3,'project_quote',$4,$5,$5,'project_quote_line_items',10,100,1000,$6,'v1')`,
      [id(16, index), ORG_ID, workspaceProjectId, quoteId, quoteLineId, `pilot-${index}`],
    );

    const documentWorkspaceId = id(17, index);
    const documentNodeId = id(18, index);
    const documentVersionId = id(19, index);
    const storageKey = `${ORG_ID}/${documentWorkspaceId}/${documentNodeId}/${documentVersionId}.pdf`;
    await setup.query(
      "insert into public.document_workspaces(id,organization_id,created_by) values($1,$2,$3)",
      [documentWorkspaceId, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.document_workspace_entities(organization_id,workspace_id,opportunity_id,linked_by)
       values($1,$2,$3,$4)`,
      [ORG_ID, documentWorkspaceId, opportunityId, USER_ID],
    );
    await setup.query(
      `insert into public.document_nodes(
        id,organization_id,workspace_id,kind,display_name,created_by,updated_by
      ) values($1,$2,$3,'file',$4,$5,$5)`,
      [documentNodeId, ORG_ID, documentWorkspaceId, `Pilot document ${index}.pdf`, USER_ID],
    );
    await setup.query(
      `insert into public.document_versions(
        id,organization_id,workspace_id,node_id,version_number,storage_key,
        upload_state,uploaded_by,claimed_mime_type,byte_size
      ) values($1,$2,$3,$4,1,$5,'pending',$6,'application/pdf',100)`,
      [documentVersionId, ORG_ID, documentWorkspaceId, documentNodeId, storageKey, USER_ID],
    );

    return {
      ...base,
      quoteId,
      taskId,
      pageIds,
      calibrationId,
      measurementIds,
      documentWorkspaceId,
      documentNodeId,
      documentVersionId,
      storageKey,
      drawingId,
      tradePackId,
      scopeRunId,
    };
  }

  async function award(client: pg.Client, fixture: PilotFixture, correlationId: string) {
    return client.query<{
      project_id: string;
      project_slug: string;
      project_created: boolean;
      storage_clone_required: boolean;
      lifecycle_strategy: string;
    }>(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,$4)",
      [ORG_ID, fixture.opportunityId, fixture.quoteId, correlationId],
    );
  }

  it("keeps the pilot control exact, auditable, and inaccessible to browser roles", async () => {
    const control = await setup.query(
      "select * from public.opportunity_lifecycle_rollout_controls where organization_id=$1",
      [ORG_ID],
    );
    expect(control.rows[0]).toMatchObject({
      allowed_strategy: "promote_workspace_v1",
      creation_enabled: true,
      promotion_enabled: true,
      pilot_scope: "local_admin_pilot",
      pilot_environment: "local_development",
    });
    const audit = await setup.query(
      "select operation from public.opportunity_lifecycle_rollout_control_events where organization_id=$1",
      [ORG_ID],
    );
    expect(audit.rows.map((row) => row.operation)).toContain("insert");
    await expect(actorA.query("select * from public.opportunity_lifecycle_rollout_controls"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("completes ten feature-dense same-Project promotions without creating F", async () => {
    for (let index = 1; index <= 10; index += 1) {
      const base = await createPilot(index, index === 10);
      const fixture = await addFeatureDenseData(index, base);

      const before = await setup.query(
        "select * from public.resolve_project_lifecycle_v1($1,$2)",
        [ORG_ID, fixture.workspaceProjectId],
      );
      expect(before.rows[0]).toMatchObject({ is_visible: false, is_delivery_eligible: false });

      await expect(setup.query(
        `insert into public.project_variations(
          id,organization_id,project_id,created_by,variation_number,variation_title
        ) values($1,$2,$3,$4,$5,'Blocked before award')`,
        [id(20, index), ORG_ID, fixture.workspaceProjectId, USER_ID, `PRE-${index}`],
      )).rejects.toMatchObject({ code: "TS409" });

      const first = index === 10
        ? (await Promise.all([
            award(actorA, fixture, id(21, index)),
            award(actorB, fixture, id(22, index)),
          ]))[0]
        : await award(actorA, fixture, id(21, index));
      const retried = await award(actorA, fixture, id(23, index));

      expect(first.rows[0]).toMatchObject({
        project_id: fixture.workspaceProjectId,
        project_slug: fixture.workspaceSlug,
        project_created: false,
        storage_clone_required: false,
        lifecycle_strategy: "promote_workspace_v1",
      });
      expect(retried.rows[0].project_id).toBe(fixture.workspaceProjectId);

      const state = await setup.query(
        `select
          opportunity.workspace_project_id,
          opportunity.converted_project_id,
          opportunity.stage,
          mapping.project_id mapped_project_id,
          mapping.accepted_quote_id,
          project.slug,project.project_code,
          (select count(*) from public.organization_projects candidate
            where candidate.organization_id=opportunity.organization_id
              and candidate.source_opportunity_id=opportunity.id) project_count,
          (select count(*) from public.opportunity_promotion_events event
            where event.opportunity_id=opportunity.id) event_count
         from public.organization_opportunities opportunity
         join public.opportunity_final_projects mapping on mapping.opportunity_id=opportunity.id
         join public.organization_projects project on project.id=mapping.project_id
         where opportunity.id=$1`,
        [fixture.opportunityId],
      );
      expect(state.rows[0]).toMatchObject({
        workspace_project_id: fixture.workspaceProjectId,
        converted_project_id: fixture.workspaceProjectId,
        stage: "Won",
        mapped_project_id: fixture.workspaceProjectId,
        accepted_quote_id: fixture.quoteId,
        slug: fixture.workspaceSlug,
        project_code: fixture.workspaceCode,
        project_count: "1",
        event_count: "1",
      });

      const after = await setup.query(
        "select * from public.resolve_project_lifecycle_v1($1,$2)",
        [ORG_ID, fixture.workspaceProjectId],
      );
      expect(after.rows[0]).toMatchObject({
        classification: "future_awarded_promotion",
        is_visible: true,
        is_delivery_eligible: true,
      });
      const baseline = await setup.query(
        "select * from public.resolve_project_contractual_baseline_v1($1,$2)",
        [ORG_ID, fixture.workspaceProjectId],
      );
      expect(baseline.rows[0]).toMatchObject({ quote_id: fixture.quoteId, is_valid: true });

      const identities = await setup.query(
        `select
          (select array_agg(id order by id) from public.project_job_todos where project_id=$1) task_ids,
          (select array_agg(id order by id) from public.takeoff_pages where project_id=$1) page_ids,
          (select array_agg(id order by id) from public.takeoff_calibrations where project_id=$1) calibration_ids,
          (select array_agg(id order by id) from public.takeoff_measurements where project_id=$1) measurement_ids,
          (select array_agg(id order by id) from public.project_drawing_sets where project_id=$1) drawing_ids,
          (select array_agg(id order by id) from public.trade_packs where project_id=$1) trade_pack_ids,
          (select array_agg(id order by id) from public.scope_runs where project_id=$1) scope_run_ids,
          (select storage_key from public.document_versions where id=$2) storage_key`,
        [fixture.workspaceProjectId, fixture.documentVersionId],
      );
      expect(identities.rows[0]).toMatchObject({
        task_ids: [fixture.taskId],
        page_ids: [...fixture.pageIds].sort(),
        calibration_ids: [fixture.calibrationId],
        measurement_ids: [...fixture.measurementIds].sort(),
        drawing_ids: [fixture.drawingId],
        trade_pack_ids: [fixture.tradePackId],
        scope_run_ids: [fixture.scopeRunId],
        storage_key: fixture.storageKey,
      });

      const event = await setup.query(
        `select contract_subtotal,contract_tax,contract_total,contract_currency,
                structural_evidence,evidence_hash
         from public.opportunity_promotion_events where opportunity_id=$1`,
        [fixture.opportunityId],
      );
      expect(event.rows[0]).toMatchObject({
        contract_subtotal: "1000.00",
        contract_tax: "150.00",
        contract_total: "1150.00",
        contract_currency: "NZD",
      });
      expect(event.rows[0].evidence_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(event.rows[0].structural_evidence).toMatchObject({
        quote_line_count: 1,
        task_count: 1,
        takeoff_page_count: 2,
        measurement_count: 2,
        drawing_set_count: 1,
        scope_run_count: 1,
        trade_pack_count: 1,
      });
      promoted.push(fixture);
    }
  });

  it("allows delivery writes after promotion and preserves the complete W baseline", async () => {
    const fixture = promoted[0]!;
    await setup.query(
      `insert into public.project_variations(
        id,organization_id,project_id,created_by,variation_number,variation_title,
        status,subtotal,gst_total,total_variation_price
      ) values($1,$2,$3,$4,'V-1','Pilot variation','Approved',100,15,115)`,
      [id(24, 1), ORG_ID, fixture.workspaceProjectId, USER_ID],
    );
    await setup.query(
      `insert into public.project_purchase_orders(
        id,organization_id,project_id,created_by,purchase_order_number,
        purchase_order_title,status,origin,subtotal,gst_total,total_purchase_order_price
      ) values($1,$2,$3,$4,'PO-1','Pilot PO','Approved','General Purchase',200,30,230)`,
      [id(25, 1), ORG_ID, fixture.workspaceProjectId, USER_ID],
    );
    await setup.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,status,
        linked_quote_value,linked_approved_variations,revised_contract_value,
        claim_amount,retention_percent,retention_withheld_amount,total_payable
      ) values($1,$2,$3,$4,'PC-1','Pilot claim','Draft',1000,100,1100,500,10,50,450)`,
      [id(26, 1), ORG_ID, fixture.workspaceProjectId, USER_ID],
    );
    const supplierInvoiceId = id(28, 1);
    await setup.query(
      `insert into public.supplier_invoices(
        id,organization_id,created_by,invoice_number,status,subtotal,tax_total,total
      ) values($1,$2,$3,'SI-PILOT-1','Captured',200,30,230)`,
      [supplierInvoiceId, ORG_ID, USER_ID],
    );
    await setup.query(
      `insert into public.supplier_invoice_lines(
        id,organization_id,supplier_invoice_id,project_id,line_uid,description,
        quantity,unit_price,line_total,tax_amount
      ) values($1,$2,$3,$4,$5,'Pilot supplier cost',1,200,200,30)`,
      [id(29, 1), ORG_ID, supplierInvoiceId, fixture.workspaceProjectId, id(31, 1)],
    );
    await setup.query(
      `insert into public.project_actual_cost_events(
        id,organization_id,project_id,created_by_user_id,event_type,amount,total_amount,
        event_date,source_type,posting_source,source_reference
      ) values($1,$2,$3,$4,'posting',200,200,current_date,'manual_adjustment','manual_adjustment',$5)`,
      [id(27, 1), ORG_ID, fixture.workspaceProjectId, USER_ID, "stage5-pilot"],
    );
    await setup.query(
      `insert into public.organization_xero_connections(
        id,organization_id,status,tenant_id,tenant_name,last_health_status,connected_by_user_id
      ) values($1,$2,'connected','local-stage5-tenant','Local Stage 5','healthy',$3)`,
      [id(30, 1), ORG_ID, USER_ID],
    );

    const totals = await setup.query(
      `select
        public.get_project_claim_base_quote_total($1,$2) base_total,
        public.get_project_claim_base_quote_retention_percent_default($1,$2) retention_percent,
        (select count(*) from public.project_variations where project_id=$2) variations,
        (select count(*) from public.project_purchase_orders where project_id=$2) purchase_orders,
        (select count(*) from public.supplier_invoice_lines where project_id=$2) supplier_invoice_lines,
        (select count(*) from public.project_claims where project_id=$2) claims,
        (select count(*) from public.project_actual_cost_events where project_id=$2) actual_costs,
        (select count(*) from public.organization_xero_connections
          where organization_id=$1 and status='connected' and last_health_status='healthy') xero_ready_connections`,
      [ORG_ID, fixture.workspaceProjectId],
    );
    expect(totals.rows[0]).toMatchObject({
      base_total: "1000.00",
      retention_percent: "10.000",
      variations: "1",
      purchase_orders: "1",
      supplier_invoice_lines: "1",
      claims: "1",
      actual_costs: "1",
      xero_ready_connections: "1",
    });
  });

  it("pauses unawarded promotion Opportunities instead of falling back to F", async () => {
    const base = await createPilot(30);
    const fixture = await addFeatureDenseData(30, base);
    await setPilotEnabled(false);
    await expect(award(actorA, fixture, id(21, 30))).rejects.toMatchObject({ code: "TS409" });
    const state = await setup.query(
      `select opportunity.converted_project_id,
        (select count(*) from public.opportunity_final_projects mapping where mapping.opportunity_id=opportunity.id) mapping_count,
        (select count(*) from public.organization_projects project where project.source_opportunity_id=opportunity.id) project_count,
        (select count(*) from public.opportunity_promotion_events event where event.opportunity_id=opportunity.id) event_count
       from public.organization_opportunities opportunity where opportunity.id=$1`,
      [fixture.opportunityId],
    );
    expect(state.rows[0]).toMatchObject({
      converted_project_id: null,
      mapping_count: "0",
      project_count: "1",
      event_count: "0",
    });
    await setPilotEnabled(true);
  });

  it("fails closed for invalid quote and cross-organization lineage without partial state", async () => {
    const base = await createPilot(31);
    const fixture = await addFeatureDenseData(31, base);
    await setup.query("update public.project_quotes set status='Draft' where id=$1", [fixture.quoteId]);
    await expect(award(actorA, fixture, id(21, 31))).rejects.toMatchObject({ code: "TS409" });
    await setup.query("update public.project_quotes set status='Accepted' where id=$1", [fixture.quoteId]);

    const unrelatedQuote = id(2, 32);
    const unrelatedProject = id(41, 32);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code,stage
      ) values($1,$2,$3,'Other Project','other-project-stage-5','OTHER-5','Pricing')`,
      [unrelatedProject, OTHER_ORG_ID, OTHER_USER_ID],
    );
    await setup.query(
      `insert into public.project_quotes(
        id,organization_id,project_id,created_by,quote_title,quote_number,status,
        originating_opportunity_id,quote_date
      ) values($1,$2,$3,$4,'Other quote','OTHER-1','Accepted',null,current_date)`,
      [unrelatedQuote, OTHER_ORG_ID, unrelatedProject, OTHER_USER_ID],
    );
    await expect(actorA.query(
      "select * from public.award_opportunity_by_lifecycle_v1($1,$2,$3,$4)",
      [ORG_ID, fixture.opportunityId, unrelatedQuote, id(21, 32)],
    )).rejects.toMatchObject({ code: "TS422" });

    const state = await setup.query(
      `select
        (select count(*) from public.opportunity_final_projects where opportunity_id=$1) mappings,
        (select count(*) from public.opportunity_promotion_events where opportunity_id=$1) events,
        (select count(*) from public.organization_projects where source_opportunity_id=$1) projects`,
      [fixture.opportunityId],
    );
    expect(state.rows[0]).toEqual({ mappings: "0", events: "0", projects: "1" });
  });

  it("keeps historical and direct Project classifications unchanged", async () => {
    const historical = await setup.query(
      `select count(*)::integer count from public.opportunity_lifecycles
       where organization_id=$1 and strategy='legacy_two_project_v1'`,
      [ORG_ID],
    );
    expect(historical.rows[0].count).toBe(0);

    const directId = id(40, 1);
    await setup.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code,stage
      ) values($1,$2,$3,'Direct Stage 5','direct-stage-5','DIRECT-5','Construction')`,
      [directId, ORG_ID, USER_ID],
    );
    const direct = await setup.query(
      "select * from public.resolve_project_lifecycle_v1($1,$2)",
      [ORG_ID, directId],
    );
    expect(direct.rows[0]).toMatchObject({
      classification: "direct_project",
      is_visible: true,
      is_delivery_eligible: true,
    });
  });
});
