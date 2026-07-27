import { existsSync } from "node:fs";
import path from "node:path";

export type LearnOverTimeCatalogAuditMode = "direct" | "schema-dump" | "auto";
export type LearnOverTimeCatalogAuditExecutionMode = "live-catalog-direct" | "live-schema-dump";
export type LearnOverTimeCatalogVerificationSource = "CHECKED_FROM_PG_CATALOG" | "CHECKED_FROM_SCHEMA_DUMP";

export const LEARN_OVER_TIME_CATALOG_TABLES = [
  "worksheet_mutation_evidence_v2_outbox",
  "worksheet_event_classification_queue",
  "worksheet_event_classifications",
  "worksheet_memory_evidence_pool_queue",
  "worksheet_memory_evidence_pools",
  "worksheet_memory_evidence_pool_events",
  "worksheet_memory_semantic_pool_queue",
  "worksheet_memory_semantic_pools",
  "worksheet_memory_semantic_pool_events",
  "worksheet_memory_synthesis_queue",
  "worksheet_memory_synthesis_runs",
  "organization_memory_items",
  "organization_memory_links",
  "organization_memory_synthesis_history",
  "organization_memory_lifecycle_history",
  "organization_memory_confidence_history",
  "organization_memory_retirement_queue",
] as const;

export const LEARN_OVER_TIME_POLICY_TABLES = [
  "worksheet_event_classifications",
  "organization_memory_items",
  "organization_memory_links",
] as const;

export const LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS = [
  {
    tableName: "organization_memory_synthesis_history",
    triggerName: "organization_memory_synthesis_history_immutable_guard",
    functionName: "prevent_organization_memory_synthesis_history_mutation",
  },
  {
    tableName: "organization_memory_lifecycle_history",
    triggerName: "organization_memory_lifecycle_history_immutable_guard",
    functionName: "prevent_organization_memory_lifecycle_history_mutation",
  },
  {
    tableName: "organization_memory_confidence_history",
    triggerName: "organization_memory_confidence_history_immutable_guard",
    functionName: "prevent_organization_memory_confidence_history_mutation",
  },
] as const;

export const LEARN_OVER_TIME_INDEX_NAMES = [
  "omsh_org_queue_run_uidx",
  "omlh_org_memory_synthesis_event_uidx",
  "omch_org_memory_lifecycle_reason_uidx",
  "omlh_org_memory_reinforcement_basis_uidx",
  "omlh_org_memory_contradiction_basis_uidx",
  "omlh_org_memory_supersession_basis_uidx",
  "omlh_org_memory_retirement_basis_uidx",
  "worksheet_event_classification_queue_source_version_idx",
  "worksheet_memory_evidence_pool_queue_classification_uidx",
  "worksheet_memory_semantic_pool_queue_seed_revision_uidx",
  "worksheet_memory_synthesis_queue_pool_revision_uidx",
  "organization_memory_items_org_domain_signature_active_idx",
  "organization_memory_retirement_queue_org_memory_uidx",
  "organization_memory_retirement_queue_claimable_idx",
  "organization_memory_retirement_queue_org_completed_idx",
] as const;

export const LEARN_OVER_TIME_CONSTRAINT_NAMES = [
  "worksheet_event_classification_queue_state_check",
  "worksheet_memory_evidence_pool_queue_state_check",
  "worksheet_memory_semantic_pool_queue_state_check",
  "worksheet_memory_synthesis_queue_state_check",
  "organization_memory_retirement_queue_state_check",
  "omsh_synthesis_decision_check",
  "omsh_persistence_outcome_check",
  "omlh_lifecycle_event_type_check",
  "omch_reason_type_check",
] as const;

export const LEARN_OVER_TIME_FUNCTION_NAMES = [
  "enqueue_worksheet_mutation_evidence_v2_outbox",
  "claim_worksheet_mutation_evidence_v2_outbox_batch",
  "finalize_worksheet_mutation_evidence_v2_outbox_batch",
  "write_worksheet_mutation_outbox_intelligence_events",
  "enqueue_worksheet_event_classification_queue",
  "claim_worksheet_event_classification_batch",
  "finalize_worksheet_event_classification_claims",
  "list_classified_worksheet_memory_events",
  "enqueue_worksheet_memory_evidence_pool_queue",
  "claim_worksheet_memory_evidence_pool_batch",
  "finalize_worksheet_memory_evidence_pool_batch",
  "enqueue_worksheet_memory_semantic_pool_queue",
  "claim_worksheet_memory_semantic_pool_batch",
  "finalize_worksheet_memory_semantic_pool_batch",
  "replace_worksheet_memory_semantic_pool_events",
  "enqueue_worksheet_memory_synthesis_queue",
  "claim_worksheet_memory_synthesis_batch",
  "finalize_worksheet_memory_synthesis_batch",
  "replace_organization_memory_provenance_links",
  "enqueue_organization_memory_retirement_queue",
  "claim_organization_memory_retirement_batch",
  "finalize_organization_memory_retirement_batch",
  "prevent_organization_memory_synthesis_history_mutation",
  "prevent_organization_memory_lifecycle_history_mutation",
  "prevent_organization_memory_confidence_history_mutation",
] as const;

export type CatalogQueryResultRow = Record<string, unknown>;

export type CatalogQueryRunner = <TRow extends CatalogQueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<TRow[]>;

export type CatalogRlsRow = {
  tableName: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
};

export type CatalogPolicyRow = {
  tableName: string;
  policyName: string;
  command: string;
  roles: string[];
};

export type CatalogTriggerRow = {
  tableName: string;
  triggerName: string;
  functionName: string;
  enabledMode: string;
};

export type CatalogIndexRow = {
  tableName: string;
  indexName: string;
  indexDefinition: string;
};

export type CatalogConstraintRow = {
  tableName: string;
  constraintName: string;
  constraintType: string;
  definition: string;
};

export type CatalogFunctionRow = {
  schemaName: string;
  functionName: string;
  identityArguments: string;
};

export type LearnOverTimeCatalogSnapshot = {
  rlsRows: CatalogRlsRow[];
  policyRows: CatalogPolicyRow[];
  triggerRows: CatalogTriggerRow[];
  indexRows: CatalogIndexRow[];
  constraintRows: CatalogConstraintRow[];
  functionRows: CatalogFunctionRow[];
};

export type LearnOverTimeCatalogAuditIssue = {
  category: "rls" | "policy" | "trigger" | "index" | "constraint" | "function";
  item: string;
  message: string;
  source: LearnOverTimeCatalogVerificationSource;
};

export type LearnOverTimeCatalogAuditResult = {
  pass: boolean;
  mode: LearnOverTimeCatalogAuditExecutionMode;
  verificationSource: LearnOverTimeCatalogVerificationSource;
  issues: LearnOverTimeCatalogAuditIssue[];
  snapshot: LearnOverTimeCatalogSnapshot;
  limitations: string[];
  summary: {
    tableCount: number;
    policyTableCount: number;
    triggerCount: number;
    indexCount: number;
    constraintCount: number;
    functionCount: number;
  };
};

export type LearnOverTimeCatalogSchemaDumpLinkStatus =
  | { linked: true; projectRef: string }
  | { linked: false; message: string };

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toBooleanValue(value: unknown) {
  return value === true;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toLowerSql(value: string) {
  return value.toLowerCase();
}

function getDirectUrlCandidate(env: NodeJS.ProcessEnv) {
  return env.SUPABASE_DB_URL?.trim() || env.DATABASE_URL?.trim() || "";
}

export function parseLearnOverTimeCatalogAuditMode(value: string | undefined): LearnOverTimeCatalogAuditMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "direct" || normalized === "schema-dump" || normalized === "auto") {
    return normalized;
  }

  return "auto";
}

export function resolveLearnOverTimeCatalogDatabaseUrl(
  env: NodeJS.ProcessEnv,
) {
  const directUrl = getDirectUrlCandidate(env);
  if (directUrl.length === 0) {
    throw new Error("Direct Postgres catalog access is required for live catalog verification.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(directUrl);
  } catch {
    throw new Error("Direct Postgres catalog access is required for live catalog verification.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const username = parsedUrl.username;
  const password = parsedUrl.password;
  const placeholderDetected =
    hostname.includes("xxxxxxxxx")
    || username.includes("YOUR_")
    || password.includes("YOUR_")
    || password.includes("xxxxx");

  if (placeholderDetected) {
    throw new Error("SUPABASE_DB_URL/DATABASE_URL appears to contain placeholder values. Set a real direct Postgres connection string before running the live catalog audit.");
  }

  return directUrl;
}

export function detectLearnOverTimeCatalogDirectUrlState(env: NodeJS.ProcessEnv) {
  const directUrl = getDirectUrlCandidate(env);
  if (directUrl.length === 0) {
    return {
      available: false,
      reason: "missing" as const,
      message: "Direct Postgres catalog access is required for live catalog verification.",
    };
  }

  try {
    resolveLearnOverTimeCatalogDatabaseUrl(env);
    return {
      available: true,
      reason: "usable" as const,
      message: null,
      connectionString: directUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Direct Postgres catalog access is required for live catalog verification.";
    return {
      available: false,
      reason: "invalid" as const,
      message,
    };
  }
}

export function getLearnOverTimeSchemaDumpLinkStatus(cwd: string) {
  const projectRefPath = path.resolve(cwd, "supabase/.temp/project-ref");
  if (!existsSync(projectRefPath)) {
    return {
      linked: false,
      message: "Supabase CLI project is not linked. Run `npx supabase link --project-ref <project-ref>` or provide SUPABASE_DB_URL.",
    } satisfies LearnOverTimeCatalogSchemaDumpLinkStatus;
  }

  return {
    linked: true,
    projectRefPath,
  } as const;
}

export function parseLearnOverTimeSchemaDumpLinkStatus(projectRefContents: string) {
  const projectRef = projectRefContents.trim();
  if (projectRef.length === 0) {
    return {
      linked: false,
      message: "Supabase CLI project is not linked. Run `npx supabase link --project-ref <project-ref>` or provide SUPABASE_DB_URL.",
    } satisfies LearnOverTimeCatalogSchemaDumpLinkStatus;
  }

  return {
    linked: true,
    projectRef,
  } satisfies LearnOverTimeCatalogSchemaDumpLinkStatus;
}

export function resolveLearnOverTimeCatalogExecutionMode(params: {
  env: NodeJS.ProcessEnv;
  requestedMode?: string | undefined;
  schemaDumpLinked: boolean;
}) {
  const requestedMode = parseLearnOverTimeCatalogAuditMode(params.requestedMode);
  const directState = detectLearnOverTimeCatalogDirectUrlState(params.env);

  if (requestedMode === "direct") {
    if (!directState.available) {
      throw new Error(directState.message);
    }

    return {
      requestedMode,
      executionMode: "live-catalog-direct" as const,
      connectionString: directState.connectionString,
    };
  }

  if (requestedMode === "schema-dump") {
    if (!params.schemaDumpLinked) {
      throw new Error("Supabase CLI project is not linked. Run `npx supabase link --project-ref <project-ref>` or provide SUPABASE_DB_URL.");
    }

    return {
      requestedMode,
      executionMode: "live-schema-dump" as const,
    };
  }

  if (directState.available) {
    return {
      requestedMode,
      executionMode: "live-catalog-direct" as const,
      connectionString: directState.connectionString,
    };
  }

  if (params.schemaDumpLinked) {
    return {
      requestedMode,
      executionMode: "live-schema-dump" as const,
      fallbackReason: directState.message,
    };
  }

  throw new Error(directState.message);
}

export function buildLearnOverTimeDirectConnectionFailureMessage(message: string) {
  return `Direct DB connection failed. To use Supabase CLI fallback, unset SUPABASE_DB_URL/DATABASE_URL or run with AUDIT_DB_CATALOG_MODE=schema-dump. Underlying error: ${message}`;
}

export function buildLearnOverTimeSchemaDumpFailureMessage(message: string) {
  if (message.includes("Access token not provided")) {
    return "Supabase CLI schema dump failed because no CLI access token is available. Run `npx supabase login` or set SUPABASE_ACCESS_TOKEN, then rerun the audit.";
  }

  return `Supabase CLI schema dump failed. ${message}`;
}

export async function collectLearnOverTimeCatalogSnapshot(
  query: CatalogQueryRunner,
): Promise<LearnOverTimeCatalogSnapshot> {
  const tableNames = [...LEARN_OVER_TIME_CATALOG_TABLES];
  const policyTableNames = [...LEARN_OVER_TIME_POLICY_TABLES];
  const triggerTableNames = [...new Set(LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS.map((item) => item.tableName))];
  const indexNames = [...LEARN_OVER_TIME_INDEX_NAMES];
  const constraintNames = [...LEARN_OVER_TIME_CONSTRAINT_NAMES];
  const functionNames = [...LEARN_OVER_TIME_FUNCTION_NAMES];

  const [
    rlsRowsRaw,
    policyRowsRaw,
    triggerRowsRaw,
    indexRowsRaw,
    constraintRowsRaw,
    functionRowsRaw,
  ] = await Promise.all([
    query(
      `
        select
          c.relname as "tableName",
          c.relrowsecurity as "rlsEnabled",
          c.relforcerowsecurity as "rlsForced"
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname = any($1::text[])
        order by c.relname asc
      `,
      [tableNames],
    ),
    query(
      `
        select
          tablename as "tableName",
          policyname as "policyName",
          cmd as "command",
          roles as "roles"
        from pg_policies
        where schemaname = 'public'
          and tablename = any($1::text[])
        order by tablename asc, policyname asc
      `,
      [policyTableNames],
    ),
    query(
      `
        select
          c.relname as "tableName",
          t.tgname as "triggerName",
          p.proname as "functionName",
          t.tgenabled as "enabledMode"
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        where n.nspname = 'public'
          and c.relname = any($1::text[])
          and not t.tgisinternal
        order by c.relname asc, t.tgname asc
      `,
      [triggerTableNames],
    ),
    query(
      `
        select
          tablename as "tableName",
          indexname as "indexName",
          indexdef as "indexDefinition"
        from pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
        order by indexname asc
      `,
      [indexNames],
    ),
    query(
      `
        select
          c.relname as "tableName",
          con.conname as "constraintName",
          con.contype as "constraintType",
          pg_get_constraintdef(con.oid) as definition
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and con.conname = any($1::text[])
        order by con.conname asc
      `,
      [constraintNames],
    ),
    query(
      `
        select
          n.nspname as "schemaName",
          p.proname as "functionName",
          pg_get_function_identity_arguments(p.oid) as "identityArguments"
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1::text[])
        order by p.proname asc, pg_get_function_identity_arguments(p.oid) asc
      `,
      [functionNames],
    ),
  ]);

  return {
    rlsRows: rlsRowsRaw.map((row) => ({
      tableName: toStringValue(row.tableName),
      rlsEnabled: toBooleanValue(row.rlsEnabled),
      rlsForced: toBooleanValue(row.rlsForced),
    })),
    policyRows: policyRowsRaw.map((row) => ({
      tableName: toStringValue(row.tableName),
      policyName: toStringValue(row.policyName),
      command: toStringValue(row.command),
      roles: toStringArray(row.roles),
    })),
    triggerRows: triggerRowsRaw.map((row) => ({
      tableName: toStringValue(row.tableName),
      triggerName: toStringValue(row.triggerName),
      functionName: toStringValue(row.functionName),
      enabledMode: toStringValue(row.enabledMode),
    })),
    indexRows: indexRowsRaw.map((row) => ({
      tableName: toStringValue(row.tableName),
      indexName: toStringValue(row.indexName),
      indexDefinition: toStringValue(row.indexDefinition),
    })),
    constraintRows: constraintRowsRaw.map((row) => ({
      tableName: toStringValue(row.tableName),
      constraintName: toStringValue(row.constraintName),
      constraintType: toStringValue(row.constraintType),
      definition: toStringValue(row.definition),
    })),
    functionRows: functionRowsRaw.map((row) => ({
      schemaName: toStringValue(row.schemaName),
      functionName: toStringValue(row.functionName),
      identityArguments: toStringValue(row.identityArguments),
    })),
  };
}

export function collectLearnOverTimeCatalogSnapshotFromSchemaDump(schemaSql: string): LearnOverTimeCatalogSnapshot {
  const rawSql = schemaSql;
  const normalizedSql = normalizeWhitespace(rawSql);
  const lowerSql = toLowerSql(normalizedSql);

  const rlsRows: CatalogRlsRow[] = LEARN_OVER_TIME_CATALOG_TABLES.map((tableName) => {
    const escaped = escapeRegex(tableName.toLowerCase());
    const enabled = new RegExp(`alter table public\\.${escaped} enable row level security;`).test(lowerSql);
    const forced = new RegExp(`alter table public\\.${escaped} force row level security;`).test(lowerSql);

    return {
      tableName,
      rlsEnabled: enabled,
      rlsForced: forced,
    };
  });

  const policyRows: CatalogPolicyRow[] = [];
  const policyRegex = /create policy\s+"([^"]+)"\s+on\s+public\.([a-z0-9_]+)\s+for\s+([a-z]+)\s+to\s+([a-z0-9_,\s]+)\s+/gi;
  for (const match of normalizedSql.matchAll(policyRegex)) {
    policyRows.push({
      policyName: match[1] ?? "",
      tableName: match[2] ?? "",
      command: (match[3] ?? "").toUpperCase(),
      roles: (match[4] ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    });
  }

  const triggerRows: CatalogTriggerRow[] = [];
  const triggerRegex = /create trigger\s+([a-z0-9_]+)\s+before\s+update\s+or\s+delete\s+on\s+public\.([a-z0-9_]+)\s+for each row\s+execute function\s+public\.([a-z0-9_]+)\s*\(\s*\);/gi;
  for (const match of normalizedSql.matchAll(triggerRegex)) {
    triggerRows.push({
      triggerName: match[1] ?? "",
      tableName: match[2] ?? "",
      functionName: match[3] ?? "",
      enabledMode: "SCHEMA_DUMP",
    });
  }

  const indexRows: CatalogIndexRow[] = [];
  for (const indexName of LEARN_OVER_TIME_INDEX_NAMES) {
    const escaped = escapeRegex(indexName.toLowerCase());
    const regex = new RegExp(`create(?: unique)? index if not exists ${escaped} on public\\.([a-z0-9_]+)`, "i");
    const match = normalizedSql.match(regex);
    if (match) {
      indexRows.push({
        indexName,
        tableName: match[1] ?? "",
        indexDefinition: match[0] ?? "",
      });
    }
  }

  const constraintRows: CatalogConstraintRow[] = [];
  for (const constraintName of LEARN_OVER_TIME_CONSTRAINT_NAMES) {
    const escaped = escapeRegex(constraintName.toLowerCase());
    const regex = new RegExp(`constraint ${escaped}\\s+check\\s*\\((.*?)\\)`, "i");
    const match = normalizedSql.match(regex);
    if (match) {
      const tableMatch = normalizedSql.match(new RegExp(`create table if not exists public\\.([a-z0-9_]+)\\s*\\((?:(?!create table).)*constraint ${escaped}`, "i"));
      const alterMatch = normalizedSql.match(new RegExp(`alter table public\\.([a-z0-9_]+)(?:(?!alter table).)*constraint ${escaped}`, "i"));
      constraintRows.push({
        constraintName,
        tableName: tableMatch?.[1] ?? alterMatch?.[1] ?? "",
        constraintType: "c",
        definition: match[0] ?? "",
      });
    }
  }

  const functionRows: CatalogFunctionRow[] = [];
  const functionRegex = /create(?: or replace)? function public\.([a-z0-9_]+)\s*\(([^)]*)\)/gi;
  for (const match of normalizedSql.matchAll(functionRegex)) {
    const functionName = match[1] ?? "";
    if (!LEARN_OVER_TIME_FUNCTION_NAMES.includes(functionName as (typeof LEARN_OVER_TIME_FUNCTION_NAMES)[number])) {
      continue;
    }

    functionRows.push({
      schemaName: "public",
      functionName,
      identityArguments: normalizeWhitespace(match[2] ?? ""),
    });
  }

  return {
    rlsRows,
    policyRows,
    triggerRows,
    indexRows,
    constraintRows,
    functionRows,
  };
}

function summarizeSnapshot(snapshot: LearnOverTimeCatalogSnapshot) {
  return {
    tableCount: snapshot.rlsRows.length,
    policyTableCount: new Set(snapshot.policyRows.map((row) => row.tableName)).size,
    triggerCount: snapshot.triggerRows.length,
    indexCount: snapshot.indexRows.length,
    constraintCount: snapshot.constraintRows.length,
    functionCount: snapshot.functionRows.length,
  };
}

export function evaluateLearnOverTimeCatalogSnapshot(
  snapshot: LearnOverTimeCatalogSnapshot,
  options?: {
    mode?: LearnOverTimeCatalogAuditExecutionMode;
    verificationSource?: LearnOverTimeCatalogVerificationSource;
    limitations?: string[];
  },
): LearnOverTimeCatalogAuditResult {
  const mode = options?.mode ?? "live-catalog-direct";
  const verificationSource = options?.verificationSource ?? "CHECKED_FROM_PG_CATALOG";
  const issues: LearnOverTimeCatalogAuditIssue[] = [];
  const rlsByTable = new Map(snapshot.rlsRows.map((row) => [row.tableName, row] as const));
  const policiesByTable = new Map<string, CatalogPolicyRow[]>();
  const triggerKeys = new Set(snapshot.triggerRows.map((row) => `${row.tableName}:${row.triggerName}:${row.functionName}`));
  const indexNames = new Set(snapshot.indexRows.map((row) => row.indexName));
  const constraintNames = new Set(snapshot.constraintRows.map((row) => row.constraintName));
  const functionNames = new Set(snapshot.functionRows.map((row) => row.functionName));

  for (const policyRow of snapshot.policyRows) {
    const current = policiesByTable.get(policyRow.tableName) ?? [];
    current.push(policyRow);
    policiesByTable.set(policyRow.tableName, current);
  }

  for (const tableName of LEARN_OVER_TIME_CATALOG_TABLES) {
    const table = rlsByTable.get(tableName);
    if (!table) {
      issues.push({
        category: "rls",
        item: tableName,
        message: `Missing expected table ${tableName} from live catalog results.`,
        source: verificationSource,
      });
      continue;
    }

    if (!table.rlsEnabled) {
      issues.push({
        category: "rls",
        item: tableName,
        message: `Table ${tableName} does not have RLS enabled.`,
        source: verificationSource,
      });
    }

    if (!table.rlsForced) {
      issues.push({
        category: "rls",
        item: tableName,
        message: `Table ${tableName} does not have forced RLS enabled.`,
        source: verificationSource,
      });
    }
  }

  for (const tableName of LEARN_OVER_TIME_POLICY_TABLES) {
    const policies = policiesByTable.get(tableName) ?? [];
    if (policies.length === 0) {
      issues.push({
        category: "policy",
        item: tableName,
        message: `Table ${tableName} is expected to have at least one policy, but none were found.`,
        source: verificationSource,
      });
    }
  }

  for (const trigger of LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS) {
    const triggerKey = `${trigger.tableName}:${trigger.triggerName}:${trigger.functionName}`;
    if (!triggerKeys.has(triggerKey)) {
      issues.push({
        category: "trigger",
        item: trigger.triggerName,
        message: `Missing append-only trigger ${trigger.triggerName} on ${trigger.tableName}.`,
        source: verificationSource,
      });
    }
  }

  for (const indexName of LEARN_OVER_TIME_INDEX_NAMES) {
    if (!indexNames.has(indexName)) {
      issues.push({
        category: "index",
        item: indexName,
        message: `Missing expected index ${indexName}.`,
        source: verificationSource,
      });
    }
  }

  for (const constraintName of LEARN_OVER_TIME_CONSTRAINT_NAMES) {
    if (!constraintNames.has(constraintName)) {
      issues.push({
        category: "constraint",
        item: constraintName,
        message: `Missing expected constraint ${constraintName}.`,
        source: verificationSource,
      });
    }
  }

  for (const functionName of LEARN_OVER_TIME_FUNCTION_NAMES) {
    if (!functionNames.has(functionName)) {
      issues.push({
        category: "function",
        item: functionName,
        message: `Missing expected function ${functionName}.`,
        source: verificationSource,
      });
    }
  }

  return {
    pass: issues.length === 0,
    mode,
    verificationSource,
    issues,
    snapshot,
    limitations: options?.limitations ?? [],
    summary: summarizeSnapshot(snapshot),
  };
}

export async function runLearnOverTimeCatalogAudit(
  query: CatalogQueryRunner,
  options?: {
    mode?: LearnOverTimeCatalogAuditExecutionMode;
    verificationSource?: LearnOverTimeCatalogVerificationSource;
    limitations?: string[];
  },
) {
  const snapshot = await collectLearnOverTimeCatalogSnapshot(query);
  return evaluateLearnOverTimeCatalogSnapshot(snapshot, options);
}

export function runLearnOverTimeCatalogAuditFromSchemaDump(
  schemaSql: string,
  options?: {
    limitations?: string[];
  },
) {
  const snapshot = collectLearnOverTimeCatalogSnapshotFromSchemaDump(schemaSql);
  return evaluateLearnOverTimeCatalogSnapshot(snapshot, {
    mode: "live-schema-dump",
    verificationSource: "CHECKED_FROM_SCHEMA_DUMP",
    limitations: options?.limitations ?? [
      "Verified from Supabase CLI schema dump, not direct pg_catalog SQL.",
    ],
  });
}

export function formatLearnOverTimeCatalogAuditReport(
  result: LearnOverTimeCatalogAuditResult,
) {
  const lines: string[] = [];

  lines.push(`Audit mode: ${result.mode}`);
  lines.push(`Verification source: ${result.verificationSource}`);
  lines.push(`Result: ${result.pass ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push(`Tables checked: ${result.summary.tableCount}/${LEARN_OVER_TIME_CATALOG_TABLES.length}`);
  lines.push(`Policy tables checked: ${result.summary.policyTableCount}`);
  lines.push(`Triggers found: ${result.summary.triggerCount}`);
  lines.push(`Indexes found: ${result.summary.indexCount}/${LEARN_OVER_TIME_INDEX_NAMES.length}`);
  lines.push(`Constraints found: ${result.summary.constraintCount}/${LEARN_OVER_TIME_CONSTRAINT_NAMES.length}`);
  lines.push(`Functions found: ${result.summary.functionCount}/${LEARN_OVER_TIME_FUNCTION_NAMES.length}`);
  lines.push("");

  lines.push("RLS");
  for (const tableName of LEARN_OVER_TIME_CATALOG_TABLES) {
    const row = result.snapshot.rlsRows.find((entry) => entry.tableName === tableName);
    if (!row) {
      lines.push(`- ${tableName}: MISSING`);
      continue;
    }

    lines.push(`- ${tableName}: enabled=${row.rlsEnabled} forced=${row.rlsForced}`);
  }

  lines.push("");
  lines.push("Policies");
  for (const tableName of LEARN_OVER_TIME_POLICY_TABLES) {
    const rows = result.snapshot.policyRows.filter((entry) => entry.tableName === tableName);
    if (rows.length === 0) {
      lines.push(`- ${tableName}: MISSING`);
      continue;
    }

    lines.push(`- ${tableName}: ${rows.map((row) => `${row.policyName} [${row.command}] roles=${row.roles.join(",")}`).join("; ")}`);
  }

  lines.push("");
  lines.push("Append-only triggers");
  for (const trigger of LEARN_OVER_TIME_APPEND_ONLY_TRIGGERS) {
    const row = result.snapshot.triggerRows.find((entry) =>
      entry.tableName === trigger.tableName
      && entry.triggerName === trigger.triggerName
      && entry.functionName === trigger.functionName,
    );
    lines.push(`- ${trigger.tableName}.${trigger.triggerName}: ${row ? `present (function=${row.functionName}, enabled=${row.enabledMode})` : "MISSING"}`);
  }

  lines.push("");
  lines.push("Indexes");
  for (const indexName of LEARN_OVER_TIME_INDEX_NAMES) {
    const row = result.snapshot.indexRows.find((entry) => entry.indexName === indexName);
    lines.push(`- ${indexName}: ${row ? `present on ${row.tableName}` : "MISSING"}`);
  }

  lines.push("");
  lines.push("Constraints");
  for (const constraintName of LEARN_OVER_TIME_CONSTRAINT_NAMES) {
    const row = result.snapshot.constraintRows.find((entry) => entry.constraintName === constraintName);
    lines.push(`- ${constraintName}: ${row ? `present on ${row.tableName}` : "MISSING"}`);
  }

  lines.push("");
  lines.push("Functions");
  for (const functionName of LEARN_OVER_TIME_FUNCTION_NAMES) {
    const rows = result.snapshot.functionRows.filter((entry) => entry.functionName === functionName);
    lines.push(`- ${functionName}: ${rows.length > 0 ? rows.map((row) => `${row.schemaName}.${row.functionName}(${row.identityArguments})`).join("; ") : "MISSING"}`);
  }

  lines.push("");
  lines.push("Limitations");
  if (result.limitations.length === 0) {
    lines.push("- none");
  } else {
    for (const limitation of result.limitations) {
      lines.push(`- ${limitation}`);
    }
  }

  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Missing items");
    for (const issue of result.issues) {
      lines.push(`- [${issue.category}] ${issue.item}: ${issue.message} (${issue.source})`);
    }
  }

  return lines.join("\n");
}
