import { describe, expect, it } from "vitest";
import {
  LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS,
  LEARN_OVER_TIME_CATALOG_TABLES,
  LEARN_OVER_TIME_CONSTRAINT_NAMES,
  LEARN_OVER_TIME_FUNCTION_NAMES,
  LEARN_OVER_TIME_INDEX_NAMES,
  LEARN_OVER_TIME_POLICY_TABLES,
  buildLearnOverTimeDirectConnectionFailureMessage,
  buildLearnOverTimeSchemaDumpFailureMessage,
  collectLearnOverTimeCatalogSnapshotFromSchemaDump,
  evaluateLearnOverTimeCatalogSnapshot,
  formatLearnOverTimeCatalogAuditReport,
  getLearnOverTimeSchemaDumpLinkStatus,
  parseLearnOverTimeCatalogAuditMode,
  parseLearnOverTimeSchemaDumpLinkStatus,
  resolveLearnOverTimeCatalogDatabaseUrl,
  resolveLearnOverTimeCatalogExecutionMode,
  runLearnOverTimeCatalogAuditFromSchemaDump,
  type LearnOverTimeCatalogSnapshot,
} from "@/lib/learn-over-time-db-catalog-audit";

function buildPassingSnapshot(): LearnOverTimeCatalogSnapshot {
  return {
    rlsRows: LEARN_OVER_TIME_CATALOG_TABLES.map((tableName) => ({
      tableName,
      rlsEnabled: true,
      rlsForced: true,
    })),
    policyRows: LEARN_OVER_TIME_POLICY_TABLES.map((tableName) => ({
      tableName,
      policyName: `${tableName}-viewer`,
      command: "SELECT",
      roles: ["authenticated"],
    })),
    triggerRows: LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS.map((trigger) => ({
      tableName: trigger.tableName,
      triggerName: trigger.triggerName,
      functionName: trigger.functionName,
      enabledMode: "O",
    })),
    indexRows: LEARN_OVER_TIME_INDEX_NAMES.map((indexName) => ({
      tableName: "placeholder_table",
      indexName,
      indexDefinition: `create index ${indexName} on placeholder_table (id)`,
    })),
    constraintRows: LEARN_OVER_TIME_CONSTRAINT_NAMES.map((constraintName) => ({
      tableName: "placeholder_table",
      constraintName,
      constraintType: "c",
      definition: "CHECK (true)",
    })),
    functionRows: LEARN_OVER_TIME_FUNCTION_NAMES.map((functionName) => ({
      schemaName: "public",
      functionName,
      identityArguments: "",
    })),
  };
}

function buildPassingSchemaDump() {
  const lines: string[] = [];

  for (const tableName of LEARN_OVER_TIME_CATALOG_TABLES) {
    lines.push(`alter table public.${tableName} enable row level security;`);
    lines.push(`alter table public.${tableName} force row level security;`);
  }

  for (const tableName of LEARN_OVER_TIME_POLICY_TABLES) {
    lines.push(`create policy "${tableName} viewer" on public.${tableName} for select to authenticated using (true);`);
  }

  for (const trigger of LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS) {
    lines.push(`create or replace function public.${trigger.functionName}() returns trigger language plpgsql as $$ begin return new; end; $$;`);
    lines.push(`create trigger ${trigger.triggerName} before update or delete on public.${trigger.tableName} for each row execute function public.${trigger.functionName}();`);
  }

  for (const indexName of LEARN_OVER_TIME_INDEX_NAMES) {
    lines.push(`create unique index if not exists ${indexName} on public.placeholder_table (id);`);
  }

  for (const constraintName of LEARN_OVER_TIME_CONSTRAINT_NAMES) {
    lines.push(`alter table public.placeholder_table add constraint ${constraintName} check (true);`);
  }

  for (const functionName of LEARN_OVER_TIME_FUNCTION_NAMES) {
    lines.push(`create or replace function public.${functionName}() returns void language plpgsql as $$ begin null; end; $$;`);
  }

  return lines.join("\n");
}

describe("learn over time DB catalog audit", () => {
  it("parses direct mode from env", () => {
    expect(parseLearnOverTimeCatalogAuditMode("direct")).toBe("direct");
    expect(parseLearnOverTimeCatalogAuditMode("schema-dump")).toBe("schema-dump");
    expect(parseLearnOverTimeCatalogAuditMode("auto")).toBe("auto");
    expect(parseLearnOverTimeCatalogAuditMode("weird")).toBe("auto");
  });

  it("fails clearly when no direct Postgres URL is configured", () => {
    expect(() => resolveLearnOverTimeCatalogDatabaseUrl({})).toThrow(
      "Direct Postgres catalog access is required for live catalog verification.",
    );
  });

  it("fails clearly when the direct Postgres URL still contains placeholder values", () => {
    expect(() => resolveLearnOverTimeCatalogDatabaseUrl({
      SUPABASE_DB_URL: "postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxx.supabase.co:5432/postgres",
    })).toThrow(
      "SUPABASE_DB_URL/DATABASE_URL appears to contain placeholder values. Set a real direct Postgres connection string before running the live catalog audit.",
    );
  });

  it("resolves direct mode when env is present", () => {
    const resolved = resolveLearnOverTimeCatalogExecutionMode({
      env: {
        SUPABASE_DB_URL: "postgresql://postgres:secret@db.real.supabase.co:5432/postgres",
      },
      requestedMode: "direct",
      schemaDumpLinked: true,
    });

    expect(resolved.executionMode).toBe("live-catalog-direct");
  });

  it("falls back to schema dump in auto mode when direct env is placeholder and project is linked", () => {
    const resolved = resolveLearnOverTimeCatalogExecutionMode({
      env: {
        SUPABASE_DB_URL: "postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxx.supabase.co:5432/postgres",
      },
      requestedMode: "auto",
      schemaDumpLinked: true,
    });

    expect(resolved.executionMode).toBe("live-schema-dump");
  });

  it("fails clearly in schema-dump mode when Supabase is not linked", () => {
    expect(() => resolveLearnOverTimeCatalogExecutionMode({
      env: {},
      requestedMode: "schema-dump",
      schemaDumpLinked: false,
    })).toThrow(
      "Supabase CLI project is not linked. Run `npx supabase link --project-ref <project-ref>` or provide SUPABASE_DB_URL.",
    );
  });

  it("parses linked project-ref contents", () => {
    expect(parseLearnOverTimeSchemaDumpLinkStatus("mvxyxvrxaorzglppxzzz\n")).toEqual({
      linked: true,
      projectRef: "mvxyxvrxaorzglppxzzz",
    });
  });

  it("fails when an expected table is missing from the live catalog snapshot", () => {
    const snapshot = buildPassingSnapshot();
    snapshot.rlsRows = snapshot.rlsRows.filter((row) => row.tableName !== "organization_memory_links");

    const result = evaluateLearnOverTimeCatalogSnapshot(snapshot);

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "rls",
          item: "organization_memory_links",
        }),
      ]),
    );
  });

  it("fails when an append-only trigger is missing", () => {
    const snapshot = buildPassingSnapshot();
    snapshot.triggerRows = snapshot.triggerRows.filter((row) => row.triggerName !== "organization_memory_confidence_history_immutable_guard");

    const result = evaluateLearnOverTimeCatalogSnapshot(snapshot);

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "trigger",
          item: "organization_memory_confidence_history_immutable_guard",
        }),
      ]),
    );
  });

  it("passes with a complete mocked catalog snapshot and renders a PASS report", () => {
    const result = evaluateLearnOverTimeCatalogSnapshot(buildPassingSnapshot());

    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(formatLearnOverTimeCatalogAuditReport(result)).toContain("Result: PASS");
  });

  it("parses a complete schema dump and labels the result as schema-dump verified", () => {
    const snapshot = collectLearnOverTimeCatalogSnapshotFromSchemaDump(buildPassingSchemaDump());
    const result = runLearnOverTimeCatalogAuditFromSchemaDump(buildPassingSchemaDump());

    expect(snapshot.rlsRows.every((row) => row.rlsEnabled && row.rlsForced)).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.mode).toBe("live-schema-dump");
    expect(result.verificationSource).toBe("CHECKED_FROM_SCHEMA_DUMP");
  });

  it("fails schema-dump mode when RLS is missing", () => {
    const dump = buildPassingSchemaDump().replace(
      "alter table public.organization_memory_items enable row level security;",
      "",
    );

    const result = runLearnOverTimeCatalogAuditFromSchemaDump(dump);

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "rls",
          item: "organization_memory_items",
        }),
      ]),
    );
  });

  it("fails schema-dump mode when an append-only trigger is missing", () => {
    const dump = buildPassingSchemaDump().replace(
      "create trigger organization_memory_confidence_history_immutable_guard before update or delete on public.organization_memory_confidence_history for each row execute function public.prevent_organization_memory_confidence_history_mutation();",
      "",
    );

    const result = runLearnOverTimeCatalogAuditFromSchemaDump(dump);

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "trigger",
          item: "organization_memory_confidence_history_immutable_guard",
        }),
      ]),
    );
  });

  it("fails schema-dump mode when a required function is missing", () => {
    const dump = buildPassingSchemaDump().replace(
      "create or replace function public.finalize_worksheet_memory_synthesis_batch() returns void language plpgsql as $$ begin null; end; $$;",
      "",
    );

    const result = runLearnOverTimeCatalogAuditFromSchemaDump(dump);

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "function",
          item: "finalize_worksheet_memory_synthesis_batch",
        }),
      ]),
    );
  });

  it("builds a clear direct connection failure hint", () => {
    expect(buildLearnOverTimeDirectConnectionFailureMessage("password authentication failed")).toContain(
      "AUDIT_DB_CATALOG_MODE=schema-dump",
    );
  });

  it("builds a clear schema-dump auth failure hint", () => {
    expect(buildLearnOverTimeSchemaDumpFailureMessage("Access token not provided")).toContain(
      "npx supabase login",
    );
  });

  it("preserves non-auth schema-dump failures instead of rewriting them as auth issues", () => {
    expect(
      buildLearnOverTimeSchemaDumpFailureMessage(
        "failed to inspect docker image: Cannot connect to the Docker daemon",
      ),
    ).toContain("Cannot connect to the Docker daemon");
  });

  it("reports missing linked project file clearly", () => {
    const status = getLearnOverTimeSchemaDumpLinkStatus("/definitely/not-linked");
    expect(status).toEqual({
      linked: false,
      message: "Supabase CLI project is not linked. Run `npx supabase link --project-ref <project-ref>` or provide SUPABASE_DB_URL.",
    });
  });
});
