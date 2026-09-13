import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_API_PORT = "54321";
const LOCAL_PROJECT_REFERENCE = "Tradesstack-ai";
export const REQUIRED_COMMERCIAL_E2E_MIGRATIONS = [
  "20260820120000",
  "20260823160000",
] as const;

let loaded = false;
let announced = false;

export interface E2ETarget {
  url: string;
  host: string;
  port: string;
  projectReference: string;
  mutationMode: "local-fixtures";
}

export function loadE2ETestEnvironment() {
  if (loaded) return;

  const envPath = join(process.cwd(), ".env.test.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(
      "Playwright fixture tests require .env.test.local. Refusing to fall back to .env.local.",
    );
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  loaded = true;
}

export function requireLocalE2ETarget(): E2ETarget {
  loadE2ETestEnvironment();

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectReference = process.env.SUPABASE_E2E_PROJECT_REF;
  return validateLocalE2ETarget(rawUrl, projectReference);
}

export function validateLocalE2ETarget(
  rawUrl: string | undefined,
  projectReference: string | undefined,
): E2ETarget {
  if (!rawUrl || !projectReference) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_E2E_PROJECT_REF for local Playwright fixtures.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Malformed NEXT_PUBLIC_SUPABASE_URL. Fixture mutation refused.");
  }

  if (
    parsed.protocol !== "http:"
    || !LOCAL_HOSTS.has(parsed.hostname)
    || parsed.port !== LOCAL_API_PORT
    || projectReference !== LOCAL_PROJECT_REFERENCE
  ) {
    throw new Error(
      `Fixture mutation refused for Supabase target ${parsed.hostname || "unknown"}:${parsed.port || "default"} (${projectReference}). Expected local ${LOCAL_API_PORT}/${LOCAL_PROJECT_REFERENCE}.`,
    );
  }

  return {
    url: parsed.toString().replace(/\/$/, ""),
    host: parsed.hostname,
    port: parsed.port,
    projectReference,
    mutationMode: "local-fixtures",
  };
}

export function announceLocalE2ETarget() {
  const target = requireLocalE2ETarget();
  if (!announced) {
    console.info([
      "E2E database target:",
      `Host: ${target.host}:${target.port}`,
      `Project reference: ${target.projectReference}`,
      `Mutation mode: ${target.mutationMode}`,
    ].join("\n"));
    announced = true;
  }
  return target;
}

export function assertRequiredCommercialE2EMigrations(appliedVersions: Iterable<string>) {
  const applied = new Set(appliedVersions);
  const missing = REQUIRED_COMMERCIAL_E2E_MIGRATIONS.filter((version) => !applied.has(version));
  if (missing.length > 0) {
    throw new Error(
      `Local E2E database migration drift: missing required migration(s) ${missing.join(", ")}. Run the local Supabase migration chain before browser tests.`,
    );
  }
}
