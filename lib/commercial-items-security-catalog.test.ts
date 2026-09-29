import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { listCommercialItemsByIds } from "./commercial-items/service";
import type { CommercialItemsClient } from "./commercial-items/types";

function resolveCatalogDatabaseUrl() {
  const raw = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
  const trimmed = raw.trim();

  if (
    trimmed.length === 0 ||
    trimmed.includes("YOUR_PASSWORD") ||
    trimmed.includes("xxxxxxxxx")
  ) {
    return null;
  }

  return trimmed;
}

const catalogDbUrl = resolveCatalogDatabaseUrl();

describe.runIf(Boolean(catalogDbUrl))("commercial items security catalog", () => {
  const client = new Client({
    connectionString: catalogDbUrl!,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("does not grant authenticated access to locked metadata column reads", async () => {
    const result = await client.query<{
      locked_metadata_select: boolean;
      description_select: boolean;
    }>(`
      select
        has_column_privilege('authenticated', 'public.commercial_items', 'locked_metadata_json', 'SELECT') as locked_metadata_select,
        has_column_privilege('authenticated', 'public.commercial_items', 'description', 'SELECT') as description_select
    `);

    expect(result.rows[0]?.locked_metadata_select).toBe(false);
    expect(result.rows[0]?.description_select).toBe(true);
  });

  it("keeps the internal locked metadata rpc inaccessible to anon and authenticated", async () => {
    const result = await client.query<{
      anon_execute: boolean;
      authenticated_execute: boolean;
    }>(`
      select
        has_function_privilege('anon', 'public.get_commercial_item_locked_metadata_internal(uuid)', 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', 'public.get_commercial_item_locked_metadata_internal(uuid)', 'EXECUTE') as authenticated_execute
    `);

    expect(result.rows[0]?.anon_execute).toBe(false);
    expect(result.rows[0]?.authenticated_execute).toBe(false);
  });

  it("allows authenticated reads of every column used to reload published commercial items", async () => {
    let projection = "";
    const queryClient = {
      from: () => ({
        select: (columns: string) => {
          projection = columns;
          return { eq: () => ({ in: async () => ({ data: [], error: null }) }) };
        },
      }),
    } as unknown as CommercialItemsClient;

    await listCommercialItemsByIds(queryClient, {
      organizationId: "catalog-test",
      commercialItemIds: ["catalog-test"],
    });
    const columns = projection.split(",").map((column) => column.trim());
    expect(columns).toContain("source_takeoff_measurement_id");
    expect(columns).not.toContain("locked_metadata_json");

    const result = await client.query<{ column_name: string; can_read: boolean }>(`
      select column_name,
        has_column_privilege('authenticated', 'public.commercial_items', column_name, 'SELECT') as can_read
      from unnest($1::text[]) as column_name
    `, [columns]);

    expect(result.rows.filter((row) => !row.can_read)).toEqual([]);
  });

  it("keeps default commercial item rpc results free of locked metadata", async () => {
    const result = await client.query<{ proname: string; result_signature: string }>(`
      select
        p.proname,
        pg_get_function_result(p.oid) as result_signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('get_commercial_item', 'list_commercial_items_for_opportunity')
      order by p.proname
    `);

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.result_signature).not.toContain("locked_metadata_json");
    }
  });

  it("captures purchase order lineage checks against the originating opportunity", async () => {
    const result = await client.query<{ definition: string }>(`
      select pg_get_functiondef('public.can_insert_commercial_item_document_link(uuid,uuid,text,uuid,uuid,text)'::regprocedure) as definition
    `);

    expect(result.rows[0]?.definition).toContain("project.source_opportunity_id = item.opportunity_id");
  });
});
