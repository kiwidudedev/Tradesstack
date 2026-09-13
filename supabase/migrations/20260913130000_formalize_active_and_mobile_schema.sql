-- Forward capture of operator-exported contracts. Existing rows are never dropped/recreated.

begin;

CREATE TABLE IF NOT EXISTS "public"."organization_client_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "address_line_1" "text" NOT NULL,
    "city" "text",
    "region" "text",
    "country" "text",
    "postal_code" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_client_locations_address_not_blank" CHECK (("char_length"(TRIM(BOTH FROM "address_line_1")) > 0))
);

CREATE TABLE IF NOT EXISTS "public"."worker_project_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "worker_user_id" "uuid" NOT NULL,
    "worker_member_id" "uuid",
    "project_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."worker_purchase_order_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "worker_user_id" "uuid" NOT NULL,
    "worker_member_id" "uuid",
    "project_id" "uuid" NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

alter table public.organizations add column if not exists brand_primary_color text;

alter table public.organizations add column if not exists brand_accent_color text;

alter table public.organizations add column if not exists business_number text;

alter table public.organizations add column if not exists address_line_1 text;

alter table public.organizations add column if not exists address_line_2 text;

alter table public.organizations add column if not exists city text;

alter table public.organizations add column if not exists postcode text;

alter table public.organizations add column if not exists country text;

alter table public.organizations add column if not exists contact_name text;

alter table public.organizations add column if not exists contact_email text;

alter table public.organizations add column if not exists contact_phone text;

alter table public.organizations add column if not exists default_currency text DEFAULT CAST('NZD' AS text) NOT NULL;

alter table public.organizations add column if not exists default_tax_mode text DEFAULT CAST('GST Inclusive' AS text) NOT NULL;

alter table public.organizations add column if not exists default_tax_rate numeric(5, 2) DEFAULT 15.00 NOT NULL;

alter table public.organizations add column if not exists gst_number text;

alter table public.organization_clients add column if not exists first_name text;

alter table public.organization_clients add column if not exists last_name text;

alter table public.organization_clients add column if not exists primary_name_source text;

alter table public.organization_clients add column if not exists client_type text;

alter table public.organization_clients add column if not exists client_status text;

alter table public.organization_clients add column if not exists payment_terms_days integer;

alter table public.organization_clients add column if not exists credit_risk text;

alter table public.organization_clients add column if not exists default_margin_percent numeric(5, 2);

alter table public.organization_clients add column if not exists lead_source text;

alter table public.organization_clients add column if not exists referred_by text;

alter table public.organization_clients add column if not exists notes text;

alter table public.project_time_sheet_entries add column if not exists client_entry_id uuid;

alter table public.project_time_sheet_entries add column if not exists source text DEFAULT CAST('web' AS text) NOT NULL;

alter table public.project_time_sheet_entries add column if not exists created_from_device_id text;

alter table public.project_time_sheet_entries add column if not exists synced_at timestamp with time zone;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_client_locations'::regclass and conname='organization_client_locations_client_org_fk') then
    ALTER TABLE ONLY "public"."organization_client_locations"
    ADD CONSTRAINT "organization_client_locations_client_org_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "public"."organization_clients"("id", "organization_id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_client_locations'::regclass and conname='organization_client_locations_organization_id_fkey') then
    ALTER TABLE ONLY "public"."organization_client_locations"
    ADD CONSTRAINT "organization_client_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_client_locations'::regclass and conname='organization_client_locations_pkey') then
    ALTER TABLE ONLY "public"."organization_client_locations"
    ADD CONSTRAINT "organization_client_locations_pkey" PRIMARY KEY ("id");
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_id_organization_id_unique') then
    ALTER TABLE ONLY "public"."organization_clients"
    ADD CONSTRAINT "organization_clients_id_organization_id_unique" UNIQUE ("id", "organization_id");
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_project_assignments'::regclass and conname='worker_project_assignments_organization_id_fkey') then
    ALTER TABLE ONLY "public"."worker_project_assignments"
    ADD CONSTRAINT "worker_project_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_project_assignments'::regclass and conname='worker_project_assignments_pkey') then
    ALTER TABLE ONLY "public"."worker_project_assignments"
    ADD CONSTRAINT "worker_project_assignments_pkey" PRIMARY KEY ("id");
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_project_assignments'::regclass and conname='worker_project_assignments_project_id_fkey') then
    ALTER TABLE ONLY "public"."worker_project_assignments"
    ADD CONSTRAINT "worker_project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."organization_projects"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_project_assignments'::regclass and conname='worker_project_assignments_worker_member_id_fkey') then
    ALTER TABLE ONLY "public"."worker_project_assignments"
    ADD CONSTRAINT "worker_project_assignments_worker_member_id_fkey" FOREIGN KEY ("worker_member_id") REFERENCES "public"."organization_members"("id") ON DELETE SET NULL;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_project_assignments'::regclass and conname='worker_project_assignments_worker_user_id_fkey') then
    ALTER TABLE ONLY "public"."worker_project_assignments"
    ADD CONSTRAINT "worker_project_assignments_worker_user_id_fkey" FOREIGN KEY ("worker_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_purchase_order_assignments'::regclass and conname='worker_purchase_order_assignments_organization_id_fkey') then
    ALTER TABLE ONLY "public"."worker_purchase_order_assignments"
    ADD CONSTRAINT "worker_purchase_order_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_purchase_order_assignments'::regclass and conname='worker_purchase_order_assignments_pkey') then
    ALTER TABLE ONLY "public"."worker_purchase_order_assignments"
    ADD CONSTRAINT "worker_purchase_order_assignments_pkey" PRIMARY KEY ("id");
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_purchase_order_assignments'::regclass and conname='worker_purchase_order_assignments_project_id_fkey') then
    ALTER TABLE ONLY "public"."worker_purchase_order_assignments"
    ADD CONSTRAINT "worker_purchase_order_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."organization_projects"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_purchase_order_assignments'::regclass and conname='worker_purchase_order_assignments_purchase_order_id_fkey') then
    ALTER TABLE ONLY "public"."worker_purchase_order_assignments"
    ADD CONSTRAINT "worker_purchase_order_assignments_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."project_purchase_orders"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_purchase_order_assignments'::regclass and conname='worker_purchase_order_assignments_worker_member_id_fkey') then
    ALTER TABLE ONLY "public"."worker_purchase_order_assignments"
    ADD CONSTRAINT "worker_purchase_order_assignments_worker_member_id_fkey" FOREIGN KEY ("worker_member_id") REFERENCES "public"."organization_members"("id") ON DELETE SET NULL;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.worker_purchase_order_assignments'::regclass and conname='worker_purchase_order_assignments_worker_user_id_fkey') then
    ALTER TABLE ONLY "public"."worker_purchase_order_assignments"
    ADD CONSTRAINT "worker_purchase_order_assignments_worker_user_id_fkey" FOREIGN KEY ("worker_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_client_status_check') then
    alter table public.organization_clients add CONSTRAINT organization_clients_client_status_check CHECK (client_status IS NULL OR client_status = ANY(ARRAY[CAST('Active' AS text), CAST('Prospect' AS text), CAST('Past' AS text)]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_client_type_check') then
    alter table public.organization_clients add CONSTRAINT organization_clients_client_type_check CHECK (client_type IS NULL OR client_type = ANY(ARRAY[CAST('Builder' AS text), CAST('Developer' AS text), CAST('Homeowner' AS text), CAST('Commercial' AS text)]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_credit_risk_check') then
    alter table public.organization_clients add CONSTRAINT organization_clients_credit_risk_check CHECK (credit_risk IS NULL OR credit_risk = ANY(ARRAY[CAST('Low' AS text), CAST('Medium' AS text), CAST('High' AS text)]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_default_margin_percent_check') then
    alter table public.organization_clients add CONSTRAINT organization_clients_default_margin_percent_check CHECK (default_margin_percent IS NULL OR (default_margin_percent >= CAST(0 AS numeric) AND default_margin_percent <= CAST(100 AS numeric)));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_payment_terms_days_check') then
    alter table public.organization_clients add CONSTRAINT organization_clients_payment_terms_days_check CHECK (payment_terms_days IS NULL OR payment_terms_days = ANY(ARRAY[7, 14, 30]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organization_clients'::regclass and conname='organization_clients_primary_name_source_check') then
    alter table public.organization_clients add CONSTRAINT organization_clients_primary_name_source_check CHECK (primary_name_source IS NULL OR primary_name_source = ANY(ARRAY[CAST('person' AS text), CAST('company' AS text)]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organizations'::regclass and conname='organizations_default_currency_check') then
    alter table public.organizations add CONSTRAINT organizations_default_currency_check CHECK (default_currency = ANY(ARRAY[CAST('NZD' AS text), CAST('AUD' AS text)]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organizations'::regclass and conname='organizations_default_tax_mode_check') then
    alter table public.organizations add CONSTRAINT organizations_default_tax_mode_check CHECK (default_tax_mode = ANY(ARRAY[CAST('GST Inclusive' AS text), CAST('GST Exclusive' AS text)]));
  end if;
end $guard$;

do $guard$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.organizations'::regclass and conname='organizations_default_tax_rate_check') then
    alter table public.organizations add CONSTRAINT organizations_default_tax_rate_check CHECK (default_tax_rate >= CAST(0 AS numeric) AND default_tax_rate <= CAST(100 AS numeric));
  end if;
end $guard$;

CREATE INDEX IF NOT EXISTS "organization_client_locations_client_primary_idx" ON "public"."organization_client_locations" USING "btree" ("client_id", "is_primary" DESC, "sort_order");

CREATE INDEX IF NOT EXISTS "organization_client_locations_org_client_idx" ON "public"."organization_client_locations" USING "btree" ("organization_id", "client_id");

CREATE INDEX IF NOT EXISTS "organization_clients_org_status_idx" ON "public"."organization_clients" USING "btree" ("organization_id", "client_status");

CREATE INDEX IF NOT EXISTS "organization_clients_org_type_idx" ON "public"."organization_clients" USING "btree" ("organization_id", "client_type");

CREATE UNIQUE INDEX IF NOT EXISTS "project_time_sheet_entries_client_entry_id_uidx" ON "public"."project_time_sheet_entries" USING "btree" ("client_entry_id") WHERE ("client_entry_id" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "project_time_sheet_entries_one_open_shift_per_worker_uidx" ON "public"."project_time_sheet_entries" USING "btree" ("organization_id", "worker_user_id") WHERE ("clock_out_at" IS NULL);

CREATE INDEX IF NOT EXISTS "project_time_sheet_entries_org_project_clock_in_desc_idx" ON "public"."project_time_sheet_entries" USING "btree" ("organization_id", "project_id", "clock_in_at" DESC);

CREATE INDEX IF NOT EXISTS "worker_project_assignments_member_idx" ON "public"."worker_project_assignments" USING "btree" ("worker_member_id") WHERE ("worker_member_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "worker_project_assignments_org_project_active_idx" ON "public"."worker_project_assignments" USING "btree" ("organization_id", "project_id", "is_active");

CREATE INDEX IF NOT EXISTS "worker_project_assignments_worker_active_idx" ON "public"."worker_project_assignments" USING "btree" ("worker_user_id", "is_active", "project_id");

CREATE INDEX IF NOT EXISTS "worker_purchase_order_assignments_member_idx" ON "public"."worker_purchase_order_assignments" USING "btree" ("worker_member_id") WHERE ("worker_member_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "worker_purchase_order_assignments_org_project_active_idx" ON "public"."worker_purchase_order_assignments" USING "btree" ("organization_id", "project_id", "is_active");

CREATE INDEX IF NOT EXISTS "worker_purchase_order_assignments_po_active_idx" ON "public"."worker_purchase_order_assignments" USING "btree" ("purchase_order_id", "is_active");

CREATE INDEX IF NOT EXISTS "worker_purchase_order_assignments_worker_active_idx" ON "public"."worker_purchase_order_assignments" USING "btree" ("worker_user_id", "is_active", "project_id", "purchase_order_id");

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.organization_client_locations'::regclass and tgname='set_organization_client_locations_updated_at' and not tgisinternal) then
 CREATE OR REPLACE TRIGGER "set_organization_client_locations_updated_at" BEFORE UPDATE ON "public"."organization_client_locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.worker_project_assignments'::regclass and tgname='set_worker_project_assignments_updated_at' and not tgisinternal) then
 CREATE OR REPLACE TRIGGER "set_worker_project_assignments_updated_at" BEFORE UPDATE ON "public"."worker_project_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
 end if;
end $guard$;

do $guard$ begin
 if not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.worker_purchase_order_assignments'::regclass and tgname='set_worker_purchase_order_assignments_updated_at' and not tgisinternal) then
 CREATE OR REPLACE TRIGGER "set_worker_purchase_order_assignments_updated_at" BEFORE UPDATE ON "public"."worker_purchase_order_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
 end if;
end $guard$;

alter table public.organization_client_locations enable row level security;

alter table public.organization_client_locations force row level security;

revoke all on public.organization_client_locations from public, anon, authenticated;

grant all on public.organization_client_locations to service_role;

alter table public.worker_project_assignments enable row level security;

alter table public.worker_project_assignments force row level security;

revoke all on public.worker_project_assignments from public, anon, authenticated;

grant all on public.worker_project_assignments to service_role;

alter table public.worker_purchase_order_assignments enable row level security;

alter table public.worker_purchase_order_assignments force row level security;

revoke all on public.worker_purchase_order_assignments from public, anon, authenticated;

grant all on public.worker_purchase_order_assignments to service_role;

grant select, insert, update, delete on public.organization_client_locations to authenticated;

grant select on public.worker_project_assignments to authenticated;

grant select on public.worker_purchase_order_assignments to authenticated;

commit;
