-- Controlled development-only cleanup generated from artifacts/materials/phase1-fixture-cleanup-audit.json
-- Allowlist SHA-256: 72fa97e6b4266c95eb23932d4cd3df454aa55690440bdc85cce08dc74b9eafaa
-- Protected JS price hash: d66ed436c90f1277ece3be6b76c91349b0842691e10cd377b452f0821b5dc312
-- Exact UUIDs only. No name or pattern-based deletion is permitted here.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create temporary table cleanup_material_ids (id uuid primary key) on commit drop;
insert into cleanup_material_ids (id) values
  ('11523933-4ce2-4a1c-af03-4c6f7b978313'::uuid),
  ('227da592-9d9f-426e-bbbc-416f568354ea'::uuid),
  ('299acf4a-2933-4ddf-97ef-b6718e89b393'::uuid),
  ('496bb381-803d-46df-a11c-bb99d834b55e'::uuid),
  ('4f4eb281-1c82-4fb1-88b5-117bece7ab2a'::uuid),
  ('552d1fa4-152e-4bf6-9ba8-602e1168a3a1'::uuid),
  ('592f390a-2eea-4e82-8235-2e308d3833b6'::uuid),
  ('62cd0384-2263-41c5-bd66-2e2aadabfef6'::uuid),
  ('63d9bf5e-e99d-4ac9-8fe1-5078f92196af'::uuid),
  ('67caefb1-fc8b-4437-92c1-e686798631fa'::uuid),
  ('78f571be-fe62-4f1d-8bf7-2b92c02dd626'::uuid),
  ('7965c6ec-31e6-45af-b15b-530bb5711e3b'::uuid),
  ('79f69bcc-5472-4ed9-a47c-c1eec60a542d'::uuid),
  ('88b0d1f4-6f44-4590-b77e-621c428c94c6'::uuid),
  ('8958e3bf-6d8c-4061-b2aa-d9e1f4413987'::uuid),
  ('a2315b94-7ce1-4269-8ae0-f9ddb3eb4c2c'::uuid),
  ('a91204ab-934e-4644-8fc2-50fa8e56e379'::uuid),
  ('bc2f570a-6a90-48c5-a9e6-e88794b2c4c8'::uuid),
  ('be82cc92-d3d7-4d01-a23c-2d9006341f5e'::uuid),
  ('c8227124-17ef-4afb-a6d1-fca821366517'::uuid),
  ('d8270df8-a710-440c-b568-02b893259969'::uuid),
  ('efd76550-02db-466a-bb0c-51fb2c184d6e'::uuid),
  ('fbd6a933-1ba2-4c99-b7a5-b391c7def6e6'::uuid);


create temporary table cleanup_supplier_product_ids (id uuid primary key) on commit drop;
insert into cleanup_supplier_product_ids (id) values
  ('0fbf8e91-6ab3-4920-9393-43399ea03b63'::uuid),
  ('11f23bdb-856e-4ba1-a521-e020d4628f34'::uuid),
  ('1ace8c54-63ec-489d-b7bd-509d6e539403'::uuid),
  ('1f8fa6e4-80f0-460e-a9fc-c7f118313405'::uuid),
  ('29994c3b-f6ea-4798-ac5b-143eb29853a7'::uuid),
  ('2f2ead62-4281-47d2-9e27-b580ad59117b'::uuid),
  ('3bf2c980-9f8a-4e08-8f1a-a2461b435012'::uuid),
  ('412cc8bd-191e-4414-b915-17d69bd40510'::uuid),
  ('4b4089cb-7590-408f-a596-981dbd13f442'::uuid),
  ('4dc941f2-9257-4498-acbd-58db8b495330'::uuid),
  ('55246b69-6e6f-49c1-9531-8e1183b3ce6c'::uuid),
  ('57630afc-ae01-4576-931f-6572c50e38c4'::uuid),
  ('7f772e2b-51a7-4b58-9f5c-9f4b5d4f2325'::uuid),
  ('81b41bd6-2d56-45d0-884a-b50abbcfdb7d'::uuid),
  ('82751ae7-d8e7-450b-a6dd-ad48807179c0'::uuid),
  ('85c18822-6d85-4ad2-918b-3e878f00a24e'::uuid),
  ('89b369f4-41f9-4bda-a916-1df1af3e3a6d'::uuid),
  ('8bb6bf22-a261-4507-a394-b45509fdeb02'::uuid),
  ('911e82e2-f9a5-49c8-b80e-be9407f9f496'::uuid),
  ('91303272-f341-46b7-80c6-2fbd0a48e34a'::uuid),
  ('96b4ba90-911d-457f-b30c-662d12765c1e'::uuid),
  ('96e1496c-83d0-4e65-ad6e-cc4c3b98f0cb'::uuid),
  ('9b901d93-d59d-47bf-8094-074eb83e6f38'::uuid),
  ('a54d5057-88dc-44e2-80b5-2ec0edd2fa00'::uuid),
  ('acacdfc3-fdcb-488c-af7f-1809d0fe6ba4'::uuid),
  ('b9370ff5-00e3-4668-a9d2-c38836dd160b'::uuid),
  ('c54fca50-8a3a-4a26-9dd1-54f7bdb9054c'::uuid),
  ('d8bddc75-1f0f-4967-9a18-6d887e4696ef'::uuid),
  ('d8cbab95-c314-4435-a4cf-233e87afee8f'::uuid),
  ('dfb24270-7b14-4ae8-aeb3-fcf5fc2f905a'::uuid),
  ('eac6bb72-4b33-4353-b606-4a2e3dff04bf'::uuid),
  ('ed7ddad5-34d3-4b06-aae9-9d6ba0980f94'::uuid);


create temporary table cleanup_price_ids (id uuid primary key) on commit drop;
insert into cleanup_price_ids (id) values
  ('0f3671cd-506c-4e59-99a7-5a93ad55de3e'::uuid),
  ('155f417e-d29b-40e1-9b75-8d2a4dcf9a49'::uuid),
  ('16027fb4-8ed6-4ade-a435-e7ea7ddab6cf'::uuid),
  ('19405d46-9d54-492c-99ea-f2f26de2672f'::uuid),
  ('1c0ef5f1-ffb4-4e06-bd81-3b99f6699bc1'::uuid),
  ('1db32e59-84b0-48ba-b442-e682dbf96cb1'::uuid),
  ('1eb2a86f-17e2-444b-83e0-893694925195'::uuid),
  ('20e16fbb-b515-46de-89c0-7550ba3113f7'::uuid),
  ('2c5ab6f2-e1b0-4223-b02b-dcad4eee44f4'::uuid),
  ('2dbc4675-f1e7-4f5e-b562-713745b13dd3'::uuid),
  ('300a2d8a-ff68-4076-bf04-61105d3864bf'::uuid),
  ('35663d13-3cc9-4828-9d3a-1fde0fa5a364'::uuid),
  ('35e3033d-1d8a-42af-a1e4-a62497495a5a'::uuid),
  ('394004fc-b631-4018-8e12-32ac1178d872'::uuid),
  ('3b875518-a2b1-434d-9a98-307c8c9ae31b'::uuid),
  ('3e30b465-117f-4f70-b4b8-e36251197254'::uuid),
  ('467515cc-9861-4754-8cf7-624dbf5946aa'::uuid),
  ('46eaf949-1a0c-4ff8-a39c-2bbbc4f43304'::uuid),
  ('505620bb-fbed-4663-9b39-1fe130dfc694'::uuid),
  ('50f1aa0d-049b-4793-a397-faebd8bf4d19'::uuid),
  ('5542e5ae-7270-4179-bb6a-5d63a86dcd74'::uuid),
  ('555d5bdd-690d-4f72-ae1f-1818850e05f9'::uuid),
  ('59258691-d19b-40ca-bd6b-79e9721c59bd'::uuid),
  ('607751fd-ed4b-498c-9082-9c84db619471'::uuid),
  ('64278add-edb3-449a-aaaa-ad6f4e216e02'::uuid),
  ('6bbd218f-112e-44e2-a0a9-f08b0753a3aa'::uuid),
  ('80cdaca6-9586-4356-8441-b23f78657542'::uuid),
  ('a2d0c65f-e267-46b7-abd5-5221ec5e2a00'::uuid),
  ('a9965e93-2e98-42d7-95e0-62354d2d752c'::uuid),
  ('ab089640-7e46-43b4-b6a9-619607361d0e'::uuid),
  ('b25c0660-0e4f-4922-b4a8-67bb67553073'::uuid),
  ('b89a7052-5746-478b-90d6-a580ac5b67e1'::uuid),
  ('beaad948-c69f-4bb1-b1b6-163e80f33da2'::uuid),
  ('c1548a07-54dc-45fa-bc44-f13b6368c4e4'::uuid),
  ('c27f6365-f844-4202-a21d-ab5554efceb0'::uuid),
  ('c3eb6673-836c-4556-8872-42ac56306fe9'::uuid),
  ('c6a83dbe-6210-459a-b557-d33e2777777d'::uuid),
  ('cb390376-bb1c-41c4-8725-457bdf618cb9'::uuid),
  ('cc63f5f0-5297-4223-b05c-0e07a010689e'::uuid),
  ('d544eb24-8ce3-480e-9d4b-b9c79f90440c'::uuid),
  ('d7c9fc3e-bc5a-4411-91b0-7d605792f970'::uuid),
  ('dca870cb-0567-4689-8ce0-4f182b811675'::uuid),
  ('e42dc935-b851-4e8b-92df-81e140bee63d'::uuid),
  ('e7ff46bc-5922-4d46-8cfe-ffed00431c57'::uuid),
  ('efb2a774-b88a-4d29-b91c-ce334d88368f'::uuid),
  ('f0dc7d5d-8dd7-406a-801f-08dc92caf3bb'::uuid),
  ('f1a7dc4c-55fe-44b8-b944-fa72469dc5cd'::uuid),
  ('f3643d1c-aab5-4ad3-aab0-89d234e63df0'::uuid),
  ('f3e72020-abe5-41d3-b569-981f85fb228a'::uuid);


create temporary table cleanup_assignment_ids (id uuid primary key) on commit drop;
insert into cleanup_assignment_ids (id) values
  ('19d01933-4b6d-4a45-bb76-3a28e411a256'::uuid),
  ('19d10d10-16b9-4e32-8349-0e2e49c24e5f'::uuid),
  ('1aa358a3-992d-4fdb-a073-342a0eb8e001'::uuid),
  ('1bc0967c-25c0-4ee9-afef-aa295b12abff'::uuid),
  ('287902e8-210d-4cc0-b886-93e22182d0d1'::uuid),
  ('4985a402-d556-4a5a-8703-94cc80fd3336'::uuid),
  ('49af33a0-eca0-4185-886a-3e62d8c53db8'::uuid),
  ('4fbadd40-6a7c-4561-9b43-c399dd14239b'::uuid),
  ('56aad9d2-f1e5-4b38-be55-6a17dc85258e'::uuid),
  ('67710718-1f22-48bb-8a16-b282e3ab7dc3'::uuid),
  ('6c3d17b1-b228-4b01-9efb-745088a43453'::uuid),
  ('70453f41-21d5-4ae8-9ed3-1b7733ca21ce'::uuid),
  ('7073e783-cb7c-43b0-a64a-2136f3e11e22'::uuid),
  ('722782a1-e275-4e25-a4e1-71cf1d8e0cde'::uuid),
  ('74b3dfae-3bbb-4fe5-9f32-961fe9fa2941'::uuid),
  ('7fbf13e2-9893-4cd6-ad39-eaf026b865ce'::uuid),
  ('811b5570-41af-4951-985f-b8b189248958'::uuid),
  ('871f6fc9-7600-407d-9b2e-63f809ae610f'::uuid),
  ('9bb571b6-1117-461f-b284-f5d2b0b26303'::uuid),
  ('9c296baa-fb52-45ad-8a18-3e23fe8b7181'::uuid),
  ('9ea1e568-61ec-4af2-a920-212a7054d43f'::uuid),
  ('a0f962a2-634a-44c2-8aeb-f224b5297c5b'::uuid),
  ('adb7a3cf-453b-4a9f-a511-674f78360bbf'::uuid),
  ('b0a56d8d-7202-4718-9664-3c70da072c3b'::uuid),
  ('b4529930-bd89-41ff-9d36-0fd4b8bd0d47'::uuid),
  ('b76f7319-f9b4-486d-bec6-e59d437de123'::uuid),
  ('c5ce23cc-8f05-418e-86ea-0dec7a1a016a'::uuid),
  ('cf092db4-de2d-455a-a051-42146ee5f47d'::uuid),
  ('d37fe3c4-ebcf-4b2b-b586-162389866da8'::uuid),
  ('db06da2c-f28a-4544-80d1-193af0552a7a'::uuid),
  ('dd6349fd-9913-4d86-87a2-6fee88c5b155'::uuid),
  ('f19c57ec-f524-424f-9def-01fdac7c52d7'::uuid);


create temporary table cleanup_import_batch_ids (id uuid primary key) on commit drop;
insert into cleanup_import_batch_ids (id) values
  ('0c23aee7-89cd-4f94-8b4c-8ec547db2693'::uuid),
  ('6123a57b-4a54-4668-8e80-9ecab853647c'::uuid),
  ('753a39a1-d9d7-4dd1-8062-5eaad9a70502'::uuid),
  ('82cbf088-0052-4a87-bd06-a3c3b0e84b58'::uuid),
  ('99c08313-fbb4-4145-a12c-d987a46ae686'::uuid),
  ('f8a47489-4316-43d5-a8dd-afed8c40b88a'::uuid);


create temporary table cleanup_import_row_ids (id uuid primary key) on commit drop;
insert into cleanup_import_row_ids (id) values
  ('04da16f3-3f4f-413e-a69d-e1a9e96ed3cd'::uuid),
  ('07157e69-86b0-4ebc-8b3b-de3a2f79bb29'::uuid),
  ('20083047-5d4a-455d-9d0c-90e0a3372f86'::uuid),
  ('25f12d2c-dae1-488a-8dc7-572b452c8505'::uuid),
  ('458029ad-eb65-4135-bae4-d27ba47176b7'::uuid),
  ('493eafa3-c717-41f7-b2b8-454c201960ac'::uuid),
  ('530ee645-57bc-4a14-80bd-11bfe8008cdb'::uuid),
  ('6fa4d73c-f4a7-4248-a8aa-1cf742b8250f'::uuid),
  ('7a1ed314-ef04-46db-869f-f8c10bbebb69'::uuid),
  ('ec6dce54-5f32-4342-be0b-3674534b22ee'::uuid),
  ('ef4c54d5-296f-40e9-b901-033d97f0f013'::uuid),
  ('f7f5741c-c797-459d-85ab-a12bfa5a252b'::uuid);


create temporary table cleanup_ci_event_ids (id uuid primary key) on commit drop;
insert into cleanup_ci_event_ids (id) values
  ('33e8f97d-4ef8-4ed3-aedb-5d1cff14d674'::uuid),
  ('3d3a3451-4c20-4c48-93d1-06359d4cd4f5'::uuid),
  ('403f5300-bddb-4225-9873-6f4127b3dc4c'::uuid),
  ('56681dc9-dec2-468d-a605-bec00a6b2658'::uuid),
  ('58e13e13-06f8-452d-82d4-2b5100025d55'::uuid),
  ('5a645e16-62f9-4205-a4fe-bb608edada0a'::uuid),
  ('6035263c-c547-403e-b7b8-41a2e04b17c5'::uuid),
  ('6104135a-4189-453e-9ef7-b87fa219e920'::uuid),
  ('687ba5d6-514e-4999-896f-4337d4de8dbd'::uuid),
  ('6e71e2e2-5a34-4949-adf4-5c5bfa34874d'::uuid),
  ('74cb4f92-b6ac-43d1-9974-09811ac9330d'::uuid),
  ('a58780e2-9723-4cda-8085-e9730bd34cbc'::uuid),
  ('b763b69e-282e-47e0-a0a5-d1ca9a386b5e'::uuid),
  ('cd015215-0c18-472c-b4aa-4127104bb090'::uuid),
  ('dfdc54f5-ee6d-45ce-999c-50df580b8b45'::uuid),
  ('f9eb4987-7161-47b3-80a0-492897e3d1a1'::uuid),
  ('fbf8ccd2-cb8b-42cc-ac3b-8969edd9e6f1'::uuid);


create temporary table cleanup_ci_queue_ids (id uuid primary key) on commit drop;
insert into cleanup_ci_queue_ids (id) values
  ('26a5920a-5998-466d-b67c-05869bcee70d'::uuid),
  ('2e9de90c-7167-4730-a568-0ae7cc49dcbb'::uuid),
  ('3c675fab-63c5-4d24-a684-50b83f6e340a'::uuid),
  ('40edf847-a42f-452c-81a5-d95e405ec940'::uuid),
  ('4bb64381-dea5-4858-970b-8805ec8eaf90'::uuid),
  ('50c6431e-8261-4776-8d8a-a618d46fa433'::uuid),
  ('65618322-de85-4e84-a653-36057c51c894'::uuid),
  ('70f24160-eca7-4950-b9f4-dacbb73ff777'::uuid),
  ('7968202f-4124-4807-ba54-9d35e148fe7e'::uuid),
  ('81c91c5a-0527-4c86-afd6-4efd50b57fc9'::uuid),
  ('89734124-2d1b-4cb9-a2d1-e40147d54b5f'::uuid),
  ('8f26daef-ae1f-41cb-ac4f-d799ae04b347'::uuid),
  ('9242b363-b087-4dc4-9994-1440be527165'::uuid),
  ('dc9b464a-55db-4dde-8d6d-9a8d15317c0e'::uuid),
  ('e818f1b7-6468-4cb9-8fb7-84c62c65d11b'::uuid),
  ('ea43fd1c-e81a-4cb2-abe6-7bdac801391c'::uuid),
  ('fbc2059d-42db-4b52-a90b-d429b2a8b891'::uuid);


create temporary table cleanup_protected_product_ids (id uuid primary key) on commit drop;
insert into cleanup_protected_product_ids (id) values
  ('06dc6add-ce8b-59c2-92b9-255b5dfa797e'::uuid),
  ('197ca966-fbcf-51d5-aed6-d1816f7ae562'::uuid),
  ('19b94cde-510f-52bb-91e4-122561a31f2b'::uuid),
  ('2f8a4b95-138d-5dd4-855d-f830163c0ff6'::uuid),
  ('37cc197f-6703-58eb-87c1-c8da97774d22'::uuid),
  ('3a162a42-a03e-5b36-b6ae-64dc23f46c91'::uuid),
  ('64884ee6-9c2c-5a61-8e95-e436050ce4ff'::uuid),
  ('68487ec4-0ba9-5687-bf46-cf2940972f79'::uuid),
  ('988e36de-86df-5eb1-b903-a784a88ac354'::uuid),
  ('aa753a62-1500-5ebf-809a-7aff6205979b'::uuid),
  ('be6be7b5-e46d-5279-a955-c3b7a56e3495'::uuid),
  ('bf7bcdbc-c738-55ae-9a79-3d526b4e216f'::uuid),
  ('d6d0658e-b93c-5d10-856e-b08084009b2a'::uuid),
  ('e95d9183-6f2d-5488-bc57-ac176d330279'::uuid),
  ('f6913e2b-4f92-5eb8-b1e2-24ddf3038790'::uuid);


create temporary table cleanup_protected_price_ids (id uuid primary key) on commit drop;
insert into cleanup_protected_price_ids (id) values
  ('1d568a52-c6ff-48eb-a92f-148343772b89'::uuid),
  ('22396317-d558-41fd-ad39-a390117e2a1a'::uuid),
  ('2aba8582-085c-4ae9-9ee1-c084aa222f66'::uuid),
  ('2ea468f7-10ba-4f21-988d-cb56e06a1a42'::uuid),
  ('5c08b6c6-dc9e-4b65-a5b0-4c9053ac838f'::uuid),
  ('639f670b-cc7a-48f2-87d4-44780bb74b12'::uuid),
  ('7faced9f-cd08-402b-b75c-14bb696acc64'::uuid),
  ('80d6aa09-6ab2-44fc-a47b-c5fd86998c16'::uuid),
  ('8a24977a-ffdd-4d90-b3ac-ceb29022cd71'::uuid),
  ('8a5aef4f-8d0d-46fc-a4b2-3fe0180aea87'::uuid),
  ('907ecf9a-e7b6-41ef-8abf-2c3f4a08a467'::uuid),
  ('a1bb20a0-0919-406c-89ee-2c42124a1534'::uuid),
  ('b0902a4c-a9d7-4a74-a02c-6b8d88d688be'::uuid),
  ('c4f327a2-b41c-4e58-b1b7-22538478d65d'::uuid),
  ('d436a621-c2ef-4abb-a1d9-2daf56246155'::uuid),
  ('f0910390-82d7-4b11-b612-90275a283e0f'::uuid),
  ('fa589a35-a705-44ed-b7f3-f1bf7c7d171f'::uuid);


lock table public.cost_construction_intelligence_events in share row exclusive mode;
lock table public.cost_construction_intelligence_queue in share row exclusive mode;
lock table public.organization_material_supplier_product_assignments in share row exclusive mode;
lock table public.organization_material_import_rows in share row exclusive mode;
lock table public.organization_material_import_batches in share row exclusive mode;
lock table public.organization_material_supplier_prices in share row exclusive mode;
lock table public.organization_material_supplier_products in share row exclusive mode;
lock table public.organization_materials in share row exclusive mode;

do $cleanup$
declare
  v_count integer;
  v_fixture_any integer;
  v_deleted_prices integer := 0;
  v_trigger_state "char";
  v_protected_checksum_before text;
  v_protected_checksum_after text;
begin
  select
    (select count(*) from public.organization_materials m join cleanup_material_ids a on a.id = m.id) +
    (select count(*) from public.organization_material_supplier_products p join cleanup_supplier_product_ids a on a.id = p.id) +
    (select count(*) from public.organization_material_supplier_prices p join cleanup_price_ids a on a.id = p.id)
  into v_fixture_any;

  -- Safe on other environments and repeat deploys: only the all-absent state is
  -- accepted as a no-op. Any partial graph fails below.
  if v_fixture_any = 0 then
    raise notice 'Phase 1 development fixture allowlist is absent; cleanup migration is a no-op.';
    return;
  end if;

  if (select count(*) from cleanup_material_ids) <> 23
    or (select count(*) from cleanup_supplier_product_ids) <> 32
    or (select count(*) from cleanup_price_ids) <> 49
    or (select count(*) from cleanup_assignment_ids) <> 32
    or (select count(*) from cleanup_import_batch_ids) <> 6
    or (select count(*) from cleanup_import_row_ids) <> 12
    or (select count(*) from cleanup_ci_event_ids) <> 17
    or (select count(*) from cleanup_ci_queue_ids) <> 17 then
    raise exception 'phase1_fixture_cleanup: malformed embedded allowlist';
  end if;

  if exists (select 1 from cleanup_supplier_product_ids a join cleanup_protected_product_ids p using (id))
    or exists (select 1 from cleanup_price_ids a join cleanup_protected_price_ids p using (id)) then
    raise exception 'phase1_fixture_cleanup: protected ID appears in cleanup allowlist';
  end if;

  select count(*) into v_count from public.organization_materials m join cleanup_material_ids a on a.id = m.id;
  if v_count <> 23 then raise exception 'phase1_fixture_cleanup: expected 23 Materials, found %', v_count; end if;
  select count(*) into v_count from public.organization_material_supplier_products p join cleanup_supplier_product_ids a on a.id = p.id;
  if v_count <> 32 then raise exception 'phase1_fixture_cleanup: expected 32 Supplier Products, found %', v_count; end if;
  select count(*) into v_count from public.organization_material_supplier_prices p join cleanup_price_ids a on a.id = p.id;
  if v_count <> 49 then raise exception 'phase1_fixture_cleanup: expected 49 Prices, found %', v_count; end if;
  select count(*) into v_count from public.organization_material_supplier_product_assignments x join cleanup_assignment_ids a on a.id = x.id;
  if v_count <> 32 then raise exception 'phase1_fixture_cleanup: expected 32 Assignments, found %', v_count; end if;
  select count(*) into v_count from public.organization_material_import_batches b join cleanup_import_batch_ids a on a.id = b.id;
  if v_count <> 6 then raise exception 'phase1_fixture_cleanup: expected 6 Import Batches, found %', v_count; end if;
  select count(*) into v_count from public.organization_material_import_rows r join cleanup_import_row_ids a on a.id = r.id;
  if v_count <> 12 then raise exception 'phase1_fixture_cleanup: expected 12 Import Rows, found %', v_count; end if;
  select count(*) into v_count from public.cost_construction_intelligence_events e join cleanup_ci_event_ids a on a.id = e.id;
  if v_count <> 17 then raise exception 'phase1_fixture_cleanup: expected 17 CI Events, found %', v_count; end if;
  select count(*) into v_count from public.cost_construction_intelligence_queue q join cleanup_ci_queue_ids a on a.id = q.id;
  if v_count <> 17 then raise exception 'phase1_fixture_cleanup: expected 17 CI Queue rows, found %', v_count; end if;

  -- Refuse drift between the fresh external preflight and this locked transaction.
  select count(*) into v_count from public.organization_materials;
  if v_count <> 37 then raise exception 'phase1_fixture_cleanup: Material total drifted to %', v_count; end if;
  select count(*) into v_count from public.organization_material_supplier_products;
  if v_count <> 47 then raise exception 'phase1_fixture_cleanup: Supplier Product total drifted to %', v_count; end if;
  select count(*) into v_count from public.organization_material_supplier_prices;
  if v_count <> 66 then raise exception 'phase1_fixture_cleanup: Price total drifted to %', v_count; end if;
  select count(*) into v_count from public.organization_material_import_batches;
  if v_count <> 6 then raise exception 'phase1_fixture_cleanup: Import Batch total drifted to %', v_count; end if;
  select count(*) into v_count from public.organization_material_import_rows;
  if v_count <> 12 then raise exception 'phase1_fixture_cleanup: Import Row total drifted to %', v_count; end if;

  select count(*) into v_count from public.organization_material_supplier_products p join cleanup_protected_product_ids a on a.id = p.id;
  if v_count <> 15 then raise exception 'phase1_fixture_cleanup: protected Supplier Product baseline is %', v_count; end if;
  select count(*) into v_count from public.organization_material_supplier_prices p join cleanup_protected_price_ids a on a.id = p.id;
  if v_count <> 17 then raise exception 'phase1_fixture_cleanup: protected Price baseline is %', v_count; end if;

  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]'))
  into v_protected_checksum_before
  from public.organization_material_supplier_prices p
  join cleanup_protected_price_ids a on a.id = p.id;

  if exists (
    select 1 from public.organization_material_supplier_products p
    where p.id not in (select id from cleanup_supplier_product_ids)
      and p.material_id in (select id from cleanup_material_ids)
  ) or exists (
    select 1 from public.organization_material_supplier_prices p
    where p.id not in (select id from cleanup_price_ids)
      and (p.material_id in (select id from cleanup_material_ids)
        or p.supplier_product_id in (select id from cleanup_supplier_product_ids)
        or p.import_batch_id in (select id from cleanup_import_batch_ids)
        or p.import_row_id in (select id from cleanup_import_row_ids)
        or p.supersedes_price_id in (select id from cleanup_price_ids))
  ) or exists (
    select 1 from public.organization_material_supplier_product_assignments x
    where x.id not in (select id from cleanup_assignment_ids)
      and (x.supplier_product_id in (select id from cleanup_supplier_product_ids)
        or x.previous_material_id in (select id from cleanup_material_ids)
        or x.new_material_id in (select id from cleanup_material_ids)
        or x.source_import_row_id in (select id from cleanup_import_row_ids))
  ) or exists (
    select 1 from public.organization_material_import_rows r
    where r.id not in (select id from cleanup_import_row_ids)
      and (r.import_batch_id in (select id from cleanup_import_batch_ids)
        or r.matched_material_id in (select id from cleanup_material_ids)
        or r.approved_supplier_product_id in (select id from cleanup_supplier_product_ids)
        or r.approved_supplier_price_id in (select id from cleanup_price_ids))
  ) or exists (
    select 1 from public.cost_construction_intelligence_events e
    where e.id not in (select id from cleanup_ci_event_ids)
      and e.source_id in (select id from cleanup_material_ids)
  ) then
    raise exception 'phase1_fixture_cleanup: non-allowlisted relational reference found';
  end if;

  if (select count(*) from public.organization_material_import_rows r join cleanup_import_row_ids a on a.id = r.id where r.status = 'approved') <> 6
    or (select count(*) from public.organization_material_import_rows r join cleanup_import_row_ids a on a.id = r.id where r.status = 'rejected') <> 6 then
    raise exception 'phase1_fixture_cleanup: import status distribution changed';
  end if;

  if exists (
    select 1 from public.organization_material_supplier_prices p
    join cleanup_price_ids a on a.id = p.id
    where p.material_id not in (select id from cleanup_material_ids)
       or p.supplier_product_id not in (select id from cleanup_supplier_product_ids)
  ) then
    raise exception 'phase1_fixture_cleanup: Price ownership escaped allowlist';
  end if;

  delete from public.cost_construction_intelligence_events e using cleanup_ci_event_ids a where e.id = a.id;
  get diagnostics v_count = row_count;
  if v_count <> 17 then raise exception 'phase1_fixture_cleanup: deleted % CI Events', v_count; end if;
  if exists (select 1 from public.cost_construction_intelligence_queue q where q.id in (select id from cleanup_ci_queue_ids))
    or exists (select 1 from public.cost_construction_intelligence_queue q where q.event_id in (select id from cleanup_ci_event_ids)) then
    raise exception 'phase1_fixture_cleanup: CI Queue cascade incomplete';
  end if;

  select t.tgenabled into v_trigger_state
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.organization_material_supplier_product_assignments'::regclass
    and t.tgname = 'organization_material_supplier_product_assignments_append_only'
    and not t.tgisinternal;
  if v_trigger_state is distinct from 'O'::"char" then
    raise exception 'phase1_fixture_cleanup: assignment trigger missing or not enabled (%).', v_trigger_state;
  end if;

  execute 'alter table public.organization_material_supplier_product_assignments disable trigger organization_material_supplier_product_assignments_append_only';
  select t.tgenabled into v_trigger_state from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.organization_material_supplier_product_assignments'::regclass
    and t.tgname = 'organization_material_supplier_product_assignments_append_only' and not t.tgisinternal;
  if v_trigger_state is distinct from 'D'::"char" then raise exception 'phase1_fixture_cleanup: assignment trigger did not disable'; end if;

  delete from public.organization_material_supplier_product_assignments x using cleanup_assignment_ids a where x.id = a.id;
  get diagnostics v_count = row_count;
  if v_count <> 32 then raise exception 'phase1_fixture_cleanup: deleted % Assignments', v_count; end if;

  execute 'alter table public.organization_material_supplier_product_assignments enable trigger organization_material_supplier_product_assignments_append_only';
  select t.tgenabled into v_trigger_state from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.organization_material_supplier_product_assignments'::regclass
    and t.tgname = 'organization_material_supplier_product_assignments_append_only' and not t.tgisinternal;
  if v_trigger_state is distinct from 'O'::"char" then raise exception 'phase1_fixture_cleanup: assignment trigger was not restored'; end if;

  update public.organization_material_import_rows r
  set approved_supplier_product_id = null, approved_supplier_price_id = null
  where r.id in (select id from cleanup_import_row_ids)
    and (r.approved_supplier_product_id is not null or r.approved_supplier_price_id is not null);
  get diagnostics v_count = row_count;
  if v_count <> 6 then raise exception 'phase1_fixture_cleanup: expected to clear 6 approved provenance rows, cleared %', v_count; end if;

  loop
    with deleted as (
      delete from public.organization_material_supplier_prices p
      where p.id in (select id from cleanup_price_ids)
        and not exists (
          select 1 from public.organization_material_supplier_prices child
          where child.supersedes_price_id = p.id
        )
      returning 1
    ) select count(*) into v_count from deleted;
    exit when v_count = 0;
    v_deleted_prices := v_deleted_prices + v_count;
  end loop;
  if v_deleted_prices <> 49 or exists (
    select 1 from public.organization_material_supplier_prices p join cleanup_price_ids a on a.id = p.id
  ) then raise exception 'phase1_fixture_cleanup: predecessor-safe Price deletion removed %', v_deleted_prices; end if;

  delete from public.organization_material_import_rows r using cleanup_import_row_ids a where r.id = a.id;
  get diagnostics v_count = row_count;
  if v_count <> 12 then raise exception 'phase1_fixture_cleanup: deleted % Import Rows', v_count; end if;

  delete from public.organization_material_import_batches b using cleanup_import_batch_ids a where b.id = a.id;
  get diagnostics v_count = row_count;
  if v_count <> 6 then raise exception 'phase1_fixture_cleanup: deleted % Import Batches', v_count; end if;

  delete from public.organization_material_supplier_products p using cleanup_supplier_product_ids a where p.id = a.id;
  get diagnostics v_count = row_count;
  if v_count <> 32 then raise exception 'phase1_fixture_cleanup: deleted % Supplier Products', v_count; end if;

  delete from public.organization_materials m using cleanup_material_ids a where m.id = a.id;
  get diagnostics v_count = row_count;
  if v_count <> 23 then raise exception 'phase1_fixture_cleanup: deleted % Materials', v_count; end if;

  if exists (select 1 from public.organization_materials m join cleanup_material_ids a on a.id = m.id)
    or exists (select 1 from public.organization_material_supplier_products p join cleanup_supplier_product_ids a on a.id = p.id)
    or exists (select 1 from public.organization_material_supplier_prices p join cleanup_price_ids a on a.id = p.id)
    or exists (select 1 from public.organization_material_supplier_product_assignments x join cleanup_assignment_ids a on a.id = x.id)
    or exists (select 1 from public.organization_material_import_batches b join cleanup_import_batch_ids a on a.id = b.id)
    or exists (select 1 from public.organization_material_import_rows r join cleanup_import_row_ids a on a.id = r.id)
    or exists (select 1 from public.cost_construction_intelligence_events e join cleanup_ci_event_ids a on a.id = e.id)
    or exists (select 1 from public.cost_construction_intelligence_queue q join cleanup_ci_queue_ids a on a.id = q.id) then
    raise exception 'phase1_fixture_cleanup: fixture row remained before commit';
  end if;

  if (select count(*) from public.organization_materials) <> 14
    or (select count(*) from public.organization_materials where is_active and archived_at is null) <> 14
    or (select count(*) from public.organization_materials where not is_active or archived_at is not null) <> 0
    or (select count(*) from public.organization_material_supplier_products) <> 15
    or (select count(*) from public.organization_material_supplier_prices) <> 17
    or (select count(*) from public.organization_material_import_batches) <> 0
    or (select count(*) from public.organization_material_import_rows) <> 0 then
    raise exception 'phase1_fixture_cleanup: unexpected post-cleanup catalogue totals';
  end if;

  if (select count(*) from public.organization_material_supplier_products p join cleanup_protected_product_ids a on a.id = p.id) <> 15
    or (select count(*) from public.organization_material_supplier_prices p join cleanup_protected_price_ids a on a.id = p.id) <> 17 then
    raise exception 'phase1_fixture_cleanup: protected baseline count changed';
  end if;

  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]'))
  into v_protected_checksum_after
  from public.organization_material_supplier_prices p
  join cleanup_protected_price_ids a on a.id = p.id;
  if v_protected_checksum_after is distinct from v_protected_checksum_before then
    raise exception 'phase1_fixture_cleanup: protected Price facts changed in transaction';
  end if;

  if exists (select 1 from public.organization_material_supplier_prices where supplier_product_id is null)
    or exists (
      select 1 from public.organization_material_supplier_products p
      left join public.organization_materials m on m.organization_id = p.organization_id and m.id = p.material_id
      left join public.organization_suppliers s on s.organization_id = p.organization_id and s.id = p.supplier_id
      where m.id is null or s.id is null
    ) or exists (
      select 1 from public.organization_material_supplier_prices p
      left join public.organization_material_supplier_products sp
        on sp.organization_id = p.organization_id and sp.id = p.supplier_product_id
       and sp.material_id = p.material_id and sp.supplier_id = p.supplier_id
      where sp.id is null
    ) or exists (
      select 1 from public.organization_material_supplier_prices p
      join public.organization_material_supplier_prices predecessor
        on predecessor.organization_id = p.organization_id and predecessor.id = p.supersedes_price_id
      where predecessor.supplier_product_id <> p.supplier_product_id
    ) then
    raise exception 'phase1_fixture_cleanup: tenant, relationship, or predecessor violation found';
  end if;

  select t.tgenabled into v_trigger_state from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.organization_material_supplier_product_assignments'::regclass
    and t.tgname = 'organization_material_supplier_product_assignments_append_only' and not t.tgisinternal;
  if v_trigger_state is distinct from 'O'::"char" then raise exception 'phase1_fixture_cleanup: final assignment trigger state is not enabled'; end if;

  raise notice 'Phase 1 fixture cleanup committed checks: materials=23 products=32 prices=49 assignments=32 batches=6 rows=12 ci_events=17 ci_queue=17';
end
$cleanup$;

commit;
