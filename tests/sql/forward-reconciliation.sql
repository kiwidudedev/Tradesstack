-- Disposable local fixtures only. No production/provider calls; every fixture rolls back.
begin;
-- Exercise the real trigger function with a legacy status the current table CHECK may reject.
create temporary table forward_todo_fixture(status text,is_completed boolean,completed_at timestamptz);
create trigger forward_todo_sync before insert or update on forward_todo_fixture
for each row execute function public.sync_project_job_todo_completion_fields();
insert into forward_todo_fixture values ('Complete',true,null);
update forward_todo_fixture set is_completed=false;
do $legacy$ begin
 if exists(select 1 from forward_todo_fixture where status<>'To Do' or is_completed or completed_at is not null) then
   raise exception 'Legacy Complete reopening behavior failed';
 end if;
end $legacy$;
do $test$
declare
  owner_id uuid := gen_random_uuid(); worker_id uuid := gen_random_uuid(); org uuid;
  member_id uuid; project uuid := gen_random_uuid(); client uuid := gen_random_uuid();
  po uuid := gen_random_uuid(); own_assignment uuid := gen_random_uuid();
  invite uuid := gen_random_uuid(); entry uuid := gen_random_uuid();
  supplier uuid := gen_random_uuid(); invoice uuid := gen_random_uuid(); foreign_project uuid := gen_random_uuid(); foreign_org uuid;
  n integer; denied boolean; body text; signature text;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,'forward-owner@example.test','{"organization_name":"Forward fixture"}'),
    (worker_id,'forward-worker@example.test','{"organization_name":"Other fixture"}');
  select id into strict org from public.organizations where created_by=owner_id;
  update public.organization_members set organization_id=org,role='worker' where user_id=worker_id returning id into member_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
    values(project,org,owner_id,'Forward project','forward-fixture','FORWARD');
  insert into public.organization_clients(id,organization_id,created_by,name,company_name)
    values(client,org,owner_id,'Forward client','Forward client');
  insert into public.project_purchase_orders(id,organization_id,project_id,created_by,purchase_order_title,purchase_order_number,origin)
    values(po,org,project,owner_id,'Forward PO','PO-FORWARD','General Purchase');
  insert into public.worker_project_assignments(id,organization_id,worker_user_id,worker_member_id,project_id)
    values(own_assignment,org,worker_id,member_id,project),(gen_random_uuid(),org,owner_id,null,project);
  insert into public.worker_purchase_order_assignments(organization_id,worker_user_id,worker_member_id,project_id,purchase_order_id)
    values(org,worker_id,member_id,project,po),(org,owner_id,null,project,po);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',worker_id::text,true);
  if public.has_org_permission(org,'leads.clients.write') then raise exception 'Worker unexpectedly has client-write permission'; end if;
  update public.organizations set name='unauthorized change' where id=org;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Broad organization update still permitted'; end if;
  update public.organization_clients set phone='unauthorized' where id=client;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Broad client update still permitted'; end if;
  denied:=false;
  begin
    insert into public.organization_client_locations(organization_id,client_id,address_line_1) values(org,client,'Unauthorized address');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Unauthorized location creation accepted'; end if;
  select count(*) into n from public.worker_project_assignments where organization_id=org;
  if n<>1 then raise exception 'Mobile worker can see another worker assignment'; end if;
  select count(*) into n from public.worker_purchase_order_assignments where organization_id=org;
  if n<>1 then raise exception 'Mobile worker PO assignment scope failed'; end if;
  denied:=false;
  begin
    insert into public.worker_project_assignments(organization_id,worker_user_id,project_id) values(org,worker_id,project);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Worker can self-assign projects'; end if;
  insert into public.project_time_sheet_entries(organization_id,project_id,created_by,worker_user_id,worker_name,client_entry_id,source,created_from_device_id,synced_at)
    values(org,project,worker_id,worker_id,'Fixture worker',entry,'mobile','synthetic-device',now());
  denied:=false;
  begin
    insert into public.project_time_sheet_entries(organization_id,project_id,created_by,worker_user_id,worker_name,client_entry_id,source,clock_out_at)
      values(org,project,worker_id,worker_id,'Fixture worker',entry,'mobile',now());
  exception when unique_violation then denied:=true; end;
  if not denied then raise exception 'Duplicate mobile client entry accepted'; end if;
  execute 'reset role';

  -- Schema-only target fixtures do not contain the real permission-catalog data.
  insert into public.app_permissions(permission_key) values('leads.clients.write'),('settings.organization.update') on conflict do nothing;
  insert into public.member_permission_overrides(organization_member_id,permission_key,is_allowed,created_by)
    values(member_id,'leads.clients.write',true,owner_id),(member_id,'settings.organization.update',true,owner_id);
  execute 'set local role authenticated';
  if not public.has_org_permission(org,'leads.clients.write') then raise exception 'Permission override not honored'; end if;
  update public.organization_clients set phone='authorized' where id=client;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Authorized client update blocked'; end if;
  update public.organizations set contact_phone='authorized' where id=org;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Authorized organization update blocked'; end if;
  insert into public.organization_client_locations(organization_id,client_id,address_line_1) values(org,client,'Authorized address');
  execute 'reset role';

  -- The definer-owner identity must not bypass a missing end-user identity.
  perform set_config('request.jwt.claim.sub','',true);
  denied:=false;
  begin perform * from public.resolve_cost_item_document_context('project_quote',gen_random_uuid());
  exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Cost-item definer bypasses authentication'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.organization_invites(id,organization_id,invited_email,invited_by)
    values(invite,org,'invite-forward@example.test',owner_id);
  delete from public.organization_invites where id=invite;
  if not exists(select 1 from public.organization_invite_audit_logs where organization_id=org and event_type='deleted' and invite_id is null and details->>'deleted_invite_id'=invite::text) then
    raise exception 'Invite deletion audit lost deleted identifier';
  end if;

  -- Execute the invoice org guard with a real foreign-organization project fixture.
  select id into strict foreign_org from public.organizations where created_by=worker_id;
  insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
    values(foreign_project,foreign_org,worker_id,'Other project','other-forward','OTHER');
  insert into public.organization_suppliers(id,organization_id,created_by,name) values(supplier,org,owner_id,'Fixture supplier');
  insert into public.app_permissions(permission_key) values('supplier_invoices.capture') on conflict do nothing;
  insert into public.role_permissions(role,permission_key,is_allowed) values('owner','supplier_invoices.capture',true) on conflict do nothing;
  denied:=false;
  begin
    perform private.save_supplier_invoice_capture_phase_ab_legacy(invoice,supplier,'FORWARD-INVOICE',null,current_date,null,'NZD',0,0,0,'','manual',
      jsonb_build_array(jsonb_build_object('description','Foreign project line','projectId',foreign_project::text)),true);
  exception when raise_exception then
    if position('project does not belong to this organization' in sqlerrm)>0 then denied:=true; else raise; end if;
  end;
  if not denied or exists(select 1 from public.supplier_invoices where id=invoice) then
    raise exception 'Invoice org check did not roll back the rejected invoice';
  end if;

  -- Stored guards are also checked in the actual database, not just migration text.
  select pg_get_functiondef('private.save_supplier_invoice_capture_phase_ab_legacy(uuid,uuid,text,text,date,date,text,numeric,numeric,numeric,text,text,jsonb,boolean)'::regprocedure) into body;
  if position('cost code does not belong to this organization' in body)=0 or position('project does not belong to this organization' in body)=0 then raise exception 'Supplier invoice org checks missing'; end if;
  select pg_get_functiondef('private.decide_supplier_invoice_site_review_phase_ab_legacy(uuid,text,text,jsonb,uuid[])'::regprocedure) into body;
  if position('has already been recorded' in body)=0 then raise exception 'Site decision idempotency missing'; end if;
  select pg_get_functiondef('private.record_supplier_invoice_accounts_approval_phase_ab_legacy(uuid,uuid,text,text)'::regprocedure) into body;
  if position('if v_approval_id is not null then return v_approval_id' in body)=0 then raise exception 'Accounts approval idempotency missing'; end if;
  select pg_get_functiondef('private.submit_supplier_invoice_for_site_review_phase_ab_legacy(uuid,text)'::regprocedure) into body;
  if position('if v_submission_id is not null then return v_submission_id' in body)=0 then raise exception 'Submission idempotency missing'; end if;
  select pg_get_functiondef('public.create_takeoff_commercial_item(jsonb)'::regprocedure) into body;
  if position('#variable_conflict use_variable' in body)=0 then raise exception 'Takeoff conflict directive lost'; end if;
  select pg_get_functiondef('public.sync_project_job_todo_completion_fields()'::regprocedure) into body;
  if position('''Complete''' in body)=0 then raise exception 'Todo legacy compatibility lost'; end if;

  execute 'set local role service_role';
  perform set_config('request.jwt.claim.role','service_role',true);
  select count(*) into n from public.worker_project_assignments where organization_id=org;
  if n<>2 then raise exception 'Service role cannot inspect assignments'; end if;
  execute 'reset role';
end $test$;

-- CHECK contracts must be enforced for new writes even when historical rows await validation.
do $checks$ begin
 if (select count(*) from (values
('public.change_detection_runs','change_detection_runs_baseline_revision_not_blank'),
('public.change_detection_runs','change_detection_runs_result_json_object'),
('public.change_detection_runs','change_detection_runs_revised_file_name_not_blank'),
('public.change_detection_runs','change_detection_runs_revised_revision_not_blank'),
('public.change_detection_runs','change_detection_runs_validation_json_object'),
('public.spec_finishes_runs','spec_finishes_runs_trade_id_not_blank'),
('public.spec_finishes_runs','spec_finishes_runs_trade_label_not_blank'),
('public.takeoff_measurements','takeoff_measurements_calibration_required')
 ) expected(table_name, constraint_name) join pg_catalog.pg_constraint c
 on c.conrelid=expected.table_name::regclass and c.conname=expected.constraint_name and c.contype='c') <> 8 then
  raise exception 'Required forward CHECK contracts missing';
 end if;
 if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.project_purchase_order_assignments'::regclass and conname='project_purchase_order_assignments_unique_active' and contype='u') then
  raise exception 'Assignment deduplication constraint missing';
 end if;
end $checks$;
rollback;
