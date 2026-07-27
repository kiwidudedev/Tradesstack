import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import {
  buildLearnOverTimeSchemaDumpFailureMessage,
  buildLearnOverTimeDirectConnectionFailureMessage,
  detectLearnOverTimeCatalogDirectUrlState,
  formatLearnOverTimeCatalogAuditReport,
  getLearnOverTimeSchemaDumpLinkStatus,
  parseLearnOverTimeSchemaDumpLinkStatus,
  resolveLearnOverTimeCatalogExecutionMode,
  runLearnOverTimeCatalogAudit,
  runLearnOverTimeCatalogAuditFromSchemaDump,
  type CatalogQueryResultRow,
} from "@/lib/learn-over-time-db-catalog-audit";

const execFileAsync = promisify(execFile);

function loadLocalEnvFiles() {
  const loadEnvFile = (process as typeof process & {
    loadEnvFile?: (file?: string) => void;
  }).loadEnvFile;

  if (typeof loadEnvFile !== "function") {
    return;
  }

  for (const filename of [".env.local", ".env"]) {
    const absolutePath = path.resolve(process.cwd(), filename);
    if (!existsSync(absolutePath)) {
      continue;
    }

    loadEnvFile(absolutePath);
  }
}

function resolveSupabaseCliCommand() {
  return {
    command: "npx",
    isNpx: true,
  };
}

async function dumpLinkedSupabasePublicSchema(cwd: string) {
  const linkStatus = getLearnOverTimeSchemaDumpLinkStatus(cwd);
  if (!linkStatus.linked) {
    throw new Error(linkStatus.message);
  }

  const projectRef = parseLearnOverTimeSchemaDumpLinkStatus(
    readFileSync(linkStatus.projectRefPath, "utf8"),
  );
  if (!projectRef.linked) {
    throw new Error(projectRef.message);
  }

  const tempDirectory = mkdtempSync(path.join(tmpdir(), "learn-over-time-db-catalog-"));
  const dumpPath = path.join(tempDirectory, "public-schema.sql");
  const cli = resolveSupabaseCliCommand();

  try {
    const result = await execFileAsync(
      cli.command,
      [
        ...(cli.isNpx ? ["supabase"] : []),
        "db",
        "dump",
        "--linked",
        "--schema",
        "public",
        "--file",
        dumpPath,
      ],
      {
        cwd,
        env: {
          ...process.env,
        },
      },
    );

    if (!existsSync(dumpPath)) {
      const commandLabel = cli.isNpx
        ? "npx supabase db dump --linked --schema public --file <tmp-file>"
        : `${cli.command} db dump --linked --schema public --file <tmp-file>`;
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      throw new Error(
        `Supabase CLI schema dump did not produce a schema file. Command: ${commandLabel}${output.length > 0 ? `\n${output}` : ""}`,
      );
    }

    return readFileSync(dumpPath, "utf8");
  } catch (error) {
    const message = (() => {
      if (error && typeof error === "object" && ("stderr" in error || "stdout" in error)) {
        const structuredError = error as {
          message?: unknown;
          stderr?: unknown;
          stdout?: unknown;
        };
        const stderr = typeof structuredError.stderr === "string" ? structuredError.stderr.trim() : "";
        const stdout = typeof structuredError.stdout === "string" ? structuredError.stdout.trim() : "";
        const baseMessage = typeof structuredError.message === "string"
          ? structuredError.message
          : "Supabase CLI schema dump failed.";

        return [baseMessage, stderr, stdout].filter(Boolean).join("\n");
      }

      return error instanceof Error ? error.message : "Supabase CLI schema dump failed.";
    })();
    throw new Error(buildLearnOverTimeSchemaDumpFailureMessage(message));
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function runDirectMode(connectionString: string) {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    return await runLearnOverTimeCatalogAudit(
      async <TRow extends CatalogQueryResultRow>(sql: string, params: unknown[] = []) => {
        const queryResult = await client.query(sql, params);
        return queryResult.rows as TRow[];
      },
      {
        mode: "live-catalog-direct",
        verificationSource: "CHECKED_FROM_PG_CATALOG",
      },
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  try {
    loadLocalEnvFiles();

    const linkStatus = getLearnOverTimeSchemaDumpLinkStatus(process.cwd());
    const resolvedMode = resolveLearnOverTimeCatalogExecutionMode({
      env: process.env,
      requestedMode: process.env.AUDIT_DB_CATALOG_MODE,
      schemaDumpLinked: linkStatus.linked,
    });

    if (resolvedMode.executionMode === "live-catalog-direct") {
      try {
        const result = await runDirectMode(resolvedMode.connectionString);
        console.log(formatLearnOverTimeCatalogAuditReport(result));
        process.exitCode = result.pass ? 0 : 1;
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown direct DB connection failure.";
        const requestedMode = (process.env.AUDIT_DB_CATALOG_MODE ?? "auto").trim().toLowerCase();
        if (requestedMode === "auto") {
          const directState = detectLearnOverTimeCatalogDirectUrlState(process.env);
          if (!directState.available && linkStatus.linked) {
            const dumpedSchema = await dumpLinkedSupabasePublicSchema(process.cwd());
            const result = runLearnOverTimeCatalogAuditFromSchemaDump(dumpedSchema, {
              limitations: ["Verified from Supabase CLI schema dump, not direct pg_catalog SQL."],
            });
            console.log(formatLearnOverTimeCatalogAuditReport(result));
            process.exitCode = result.pass ? 0 : 1;
            return;
          }
        }

        throw new Error(buildLearnOverTimeDirectConnectionFailureMessage(message));
      }
    }

    const dumpedSchema = await dumpLinkedSupabasePublicSchema(process.cwd());
    const result = runLearnOverTimeCatalogAuditFromSchemaDump(dumpedSchema, {
      limitations: ["Verified from Supabase CLI schema dump, not direct pg_catalog SQL."],
    });
    console.log(formatLearnOverTimeCatalogAuditReport(result));
    process.exitCode = result.pass ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown catalog audit failure.";
    console.error(message);
    process.exitCode = 1;
  }
}

void main();
