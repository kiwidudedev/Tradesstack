import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(repositoryRoot, "packages");
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenRoots = [
  path.join(repositoryRoot, "app"),
  path.join(repositoryRoot, "components", "app"),
  path.join(repositoryRoot, "lib"),
  path.join(repositoryRoot, "clients"),
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function resolveRelativeImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [base, ...[".js", ".jsx", ".mjs", ".ts", ".tsx"].map((ext) => `${base}${ext}`)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  return null;
}

function isForbidden(target) {
  const normalized = path.resolve(target);
  return forbiddenRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`));
}

const violations = [];
for (const file of walk(packagesRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const imports = [...source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((match) => match[1]);

  for (const specifier of imports) {
    const target = resolveRelativeImport(file, specifier);
    const aliasesReferenceForbiddenRoot =
      specifier === "@/app" ||
      specifier.startsWith("@/app/") ||
      specifier === "@/components/app" ||
      specifier.startsWith("@/components/app/") ||
      specifier === "@/lib" ||
      specifier.startsWith("@/lib/");
    if ((target && isForbidden(target)) || aliasesReferenceForbiddenRoot) {
      violations.push(`${path.relative(repositoryRoot, file)} -> ${specifier}`);
    }
  }

  const relativeFile = path.relative(repositoryRoot, file);
  if (relativeFile.startsWith("packages/pdf-utils/")) {
    const forbiddenPdfUtilsImports = imports.filter((specifier) =>
      specifier.startsWith("@/")
      || specifier === "next"
      || specifier.startsWith("next/")
      || specifier === "react"
      || specifier.startsWith("react/")
      || specifier === "@supabase/supabase-js"
      || specifier.startsWith("@supabase/")
      || specifier === "server-only"
    );
    for (const specifier of forbiddenPdfUtilsImports) {
      violations.push(relativeFile + " -> " + specifier);
    }
    if (/\bprocess\.env\b|\bwindow\b|\bdocument\b|\bBlob\b/.test(source)) {
      violations.push(relativeFile + " -> runtime/application global");
    }
  }
}

if (violations.length > 0) {
  console.error("Forbidden package dependency direction detected:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Package boundary check passed: packages/* has no imports from app, components/app, or client application paths.");
}
