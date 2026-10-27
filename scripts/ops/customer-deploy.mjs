/**
 * Reusable customer deployment configuration.
 *
 * The Main release deliberately excludes Cloudflare deployment entry points and
 * customer infrastructure identity. This module is the single owner of that
 * boundary: it generates a parameterised, customer-owned overlay, validates it,
 * and updates only the release identity during a controlled Main promotion.
 *
 * It is imported by `customer-provision.mjs`, `promote-release.mjs` and tests.
 * It contains no provider credentials and no Alpha/Main customer values.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SECRET_PATTERNS, semver, sha } from "./lib.mjs";

export const CUSTOMER_REPOSITORY_OWNER = "tradesstack";
export const DEPLOYMENT_TEMPLATE_VERSION = 1;
export const DEPLOYMENT_ENVIRONMENT = "production";
export const DEPLOYMENT_TEMPLATE_ROOT = path.resolve(
  new URL("../..", import.meta.url).pathname,
  "ops/templates/customer-deploy",
);

/** Platform identities a customer repository must never inherit. */
export const PLATFORM_SUPABASE_REFS = Object.freeze([
  "mvxyxvrxaorzglppxzzz", // TradesStack Main / reference
  "ibjyzpyuqupsxqakpzxj", // Client Alpha
  "pcekmljoyrlacdsrlmiy", // Business Hub
]);
export const PLATFORM_WORKER_NAMES = Object.freeze([
  "tradesstack-main",
  "tradesstack-alpha",
  "tradesstack-business-hub",
]);
export const PLATFORM_R2_BUCKETS = Object.freeze([
  "tradesstack-main-documents",
  "tradesstack-alpha-documents",
]);

export const CUSTOMER_KEY_PATTERN = /^[a-z][a-z0-9-]{2,62}$/;
export const WORKER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const SUPABASE_REF_PATTERN = /^[a-z0-9]{20}$/;
export const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export function defaultWorkerName(customerKey) {
  return `tradesstack-${customerKey}`;
}

export function defaultR2BucketName(workerName) {
  return `${workerName}-documents`;
}

export function defaultSiteUrl(workerName, subdomain = process.env.TRADESSTACK_WORKERS_DEV_SUBDOMAIN || "tradesstack") {
  return `https://${workerName}.${subdomain}.workers.dev`;
}

export function deploymentIdentity({
  customerKey,
  displayName,
  environmentId,
  supabaseProjectRef,
  workerName,
  r2BucketName,
  siteUrl,
  release,
  sourceSha,
  releaseFingerprint,
  takeoff = false,
}) {
  const resolvedWorkerName = workerName || defaultWorkerName(customerKey);
  const resolvedSiteUrl = siteUrl || defaultSiteUrl(resolvedWorkerName);
  return {
    schemaVersion: 1,
    customerKey,
    displayName,
    environmentId: environmentId || `${customerKey}-production`,
    supabaseProjectRef,
    cloudflareEnvironment: DEPLOYMENT_ENVIRONMENT,
    workerName: resolvedWorkerName,
    r2BucketName: r2BucketName || defaultR2BucketName(resolvedWorkerName),
    siteUrl: resolvedSiteUrl.replace(/\/+$/, ""),
    deploymentUrl: `${resolvedSiteUrl.replace(/\/+$/, "")}/api/health`,
    release,
    sourceSha,
    releaseFingerprint,
    takeoff: Boolean(takeoff),
    templateVersion: DEPLOYMENT_TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/ops/customer-provision.mjs",
  };
}

export function validateDeploymentIdentity(identity) {
  const errors = [];
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) return ["deployment identity must be an object"];
  if (identity.schemaVersion !== 1) errors.push("deployment identity schemaVersion must be 1");
  if (!CUSTOMER_KEY_PATTERN.test(identity.customerKey ?? "")) errors.push("customerKey is invalid");
  if (["client-alpha", "tradesstack-master"].includes(identity.customerKey)) errors.push("customerKey is reserved");
  if (typeof identity.displayName !== "string" || identity.displayName.trim().length < 2) errors.push("displayName is invalid");
  if (typeof identity.environmentId !== "string" || identity.environmentId.length < 3 || identity.environmentId.length > 63) {
    errors.push("environmentId must be 3-63 characters");
  }
  if (!SUPABASE_REF_PATTERN.test(identity.supabaseProjectRef ?? "")) errors.push("supabaseProjectRef must be 20 lowercase alphanumeric characters");
  if (PLATFORM_SUPABASE_REFS.includes(identity.supabaseProjectRef)) errors.push("supabaseProjectRef is a platform identity");
  if (identity.cloudflareEnvironment !== DEPLOYMENT_ENVIRONMENT) errors.push(`cloudflareEnvironment must be ${DEPLOYMENT_ENVIRONMENT}`);
  if (!WORKER_NAME_PATTERN.test(identity.workerName ?? "")) errors.push("workerName is invalid");
  if (PLATFORM_WORKER_NAMES.includes(identity.workerName)) errors.push("workerName is a platform identity");
  if (!String(identity.workerName ?? "").includes(identity.customerKey)) errors.push("workerName must include the customer key");
  if (!BUCKET_NAME_PATTERN.test(identity.r2BucketName ?? "")) errors.push("r2BucketName is invalid");
  if (PLATFORM_R2_BUCKETS.includes(identity.r2BucketName)) errors.push("r2BucketName is a platform identity");
  if (!String(identity.workerName ?? "").includes(identity.customerKey)) errors.push("worker name must contain the customer key");
  if (!String(identity.r2BucketName ?? "").startsWith("tradesstack-")) errors.push("r2BucketName must start with tradesstack-");
  if (!String(identity.r2BucketName ?? "").includes(identity.customerKey)) errors.push("r2BucketName must include the customer key");
  let parsedSite = null;
  try {
    parsedSite = new URL(identity.siteUrl);
  } catch {
    errors.push("siteUrl must be a valid absolute URL");
  }
  if (parsedSite && parsedSite.protocol !== "https:") errors.push("siteUrl must use HTTPS");
  if (parsedSite && identity.deploymentUrl !== `${identity.siteUrl}/api/health`) {
    errors.push("deploymentUrl must be the customer /api/health endpoint");
  }
  if (!semver(identity.release)) errors.push("release must be a semantic version");
  if (!sha(identity.sourceSha)) errors.push("sourceSha must be a 40-character SHA-1");
  if (!FINGERPRINT_PATTERN.test(identity.releaseFingerprint ?? "")) errors.push("releaseFingerprint must be SHA-256");
  if (typeof identity.takeoff !== "boolean") errors.push("takeoff must be boolean");
  for (const [key, value] of Object.entries(identity)) {
    if (typeof value === "string" && SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
      errors.push(`deployment identity ${key} contains a secret-like value`);
    }
  }
  return [...new Set(errors)];
}

export function buildWranglerConfig(identity) {
  const vars = {
    TRADESSTACK_CUSTOMER_KEY: identity.customerKey,
    TRADESSTACK_ENVIRONMENT_ID: identity.environmentId,
    TRADESSTACK_SUPABASE_PROJECT_REF: identity.supabaseProjectRef,
    TRADESSTACK_RELEASE: identity.release,
    TRADESSTACK_SOURCE_SHA: identity.sourceSha,
    TRADESSTACK_RELEASE_FINGERPRINT: identity.releaseFingerprint,
    TRADESSTACK_WORKER_NAME: identity.workerName,
    NEXT_PUBLIC_SITE_URL: identity.siteUrl,
    TRADESSTACK_STORAGE_PROVIDER: "r2",
    TRADESSTACK_R2_DOCUMENTS_ENABLED: "1",
    TRADESSTACK_R2_BUCKET_NAME: identity.r2BucketName,
    NEXT_PUBLIC_TRADESSTACK_STORAGE_PROVIDER: "r2",
    NEXT_PUBLIC_TRADESSTACK_R2_DOCUMENTS_ENABLED: "1",
  };
  const environment = {
    name: identity.workerName,
    vars,
    limits: { cpu_ms: 30000 },
    r2_buckets: [{ binding: "TRADESSTACK_R2_BUCKET", bucket_name: identity.r2BucketName }],
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: true },
  };
  if (identity.takeoff) {
    const queue = `tradesstack-${identity.customerKey}-takeoff-jobs`;
    const dlq = `${queue}-dlq`;
    vars.TAKEOFF_QUEUE_ENABLED = "1";
    vars.TAKEOFF_STORAGE_PROXY_URL = `${identity.siteUrl}/api/takeoff/drawing-sets`;
    environment.queues = {
      producers: [{ binding: "TRADESSTACK_TAKEOFF_QUEUE", queue }],
      consumers: [{
        queue,
        max_batch_size: 1,
        max_batch_timeout: 5,
        max_retries: 5,
        retry_delay: 30,
        visibility_timeout_ms: 300000,
        max_concurrency: 1,
        dead_letter_queue: dlq,
      }],
    };
    environment.triggers = { crons: ["*/5 * * * *"] };
    environment.containers = [{
      class_name: "TakeoffRendererContainer",
      image: "./takeoff.Dockerfile",
      instance_type: "basic",
      max_instances: 1,
    }];
    environment.durable_objects = {
      bindings: [{ name: "TAKEOFF_CONTAINER", class_name: "TakeoffRendererContainer" }],
    };
    environment.migrations = [{ tag: "takeoff-renderer-v1", new_sqlite_classes: ["TakeoffRendererContainer"] }];
  } else {
    vars.TAKEOFF_QUEUE_ENABLED = "0";
  }
  return {
    "$schema": "./node_modules/wrangler/config-schema.json",
    name: identity.workerName,
    main: "cloudflare/worker.ts",
    compatibility_date: "2026-10-09",
    compatibility_flags: ["nodejs_compat"],
    assets: { directory: ".open-next/assets", binding: "ASSETS" },
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: true },
    env: { [DEPLOYMENT_ENVIRONMENT]: environment },
  };
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true });
}

export function deploymentTemplateFingerprint(templateRoot = DEPLOYMENT_TEMPLATE_ROOT) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(path.relative(templateRoot, full).split(path.sep).join("/"));
    }
  };
  if (!fs.existsSync(templateRoot)) return null;
  visit(templateRoot);
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    digest.update(`${file}:${crypto.createHash("sha256").update(fs.readFileSync(path.join(templateRoot, file))).digest("hex")}\n`);
  }
  return digest.digest("hex");
}

function deploymentGuide(identity) {
  return `# ${identity.displayName} — deployment

This directory and the files listed below are customer-owned. TradesStack Main
upgrades preserve them and update only the release/source identity.

- Customer key: \`${identity.customerKey}\`
- Environment: \`${identity.environmentId}\`
- Supabase project: \`${identity.supabaseProjectRef}\` (Sydney unless separately approved)
- Cloudflare Worker: \`${identity.workerName}\`
- R2 bucket: \`${identity.r2BucketName}\` (private)
- Initial URL: ${identity.siteUrl}
- Health/version endpoint: ${identity.deploymentUrl}
- Installed Main release: ${identity.release} (${identity.sourceSha})

## Before deployment

1. Create the private R2 bucket \`${identity.r2BucketName}\` in the authorised Cloudflare account.
2. Set the Worker secrets outside Git:
   - \`SUPABASE_SERVICE_ROLE_KEY\`
   - \`CRON_SECRET\` (only if scheduled jobs are enabled)
   - Xero/AI/email secrets only for the approved scope
3. Set the build variables in the deployment environment:
   - \`NEXT_PUBLIC_SUPABASE_URL=https://${identity.supabaseProjectRef}.supabase.co\`
   - \`NEXT_PUBLIC_SUPABASE_ANON_KEY=<customer anon key>\`
   - \`CLOUDFLARE_ENV=${identity.cloudflareEnvironment}\`

## Deploy

\`\`\`bash
CLOUDFLARE_ENV=${identity.cloudflareEnvironment} corepack npm run cloudflare:deploy
\`\`\`

The deploy preflight validates \`deploy/customer.json\` and \`wrangler.jsonc\`
and refuses Alpha/Main project references, Worker names and R2 buckets.

## Custom domain

\`app.tradelynk.com.au\` remains pending written customer DNS approval. Do not
attach a production hostname until that approval is recorded. The initial
\`workers.dev\` URL is the staging/verification endpoint.
`;
}

export function writeDeploymentOverlay({ root, templateRoot = DEPLOYMENT_TEMPLATE_ROOT, identity }) {
  const errors = validateDeploymentIdentity(identity);
  if (errors.length) throw new Error(`Customer deployment identity is invalid: ${errors.join("; ")}`);
  copyDirectory(path.join(templateRoot, "base"), root);
  if (identity.takeoff) copyDirectory(path.join(templateRoot, "takeoff"), root);
  atomicWriteJson(path.join(root, "wrangler.jsonc"), buildWranglerConfig(identity));
  atomicWriteJson(path.join(root, "deploy/customer.json"), identity);
  fs.mkdirSync(path.join(root, "client"), { recursive: true });
  fs.writeFileSync(path.join(root, "client/DEPLOYMENT.md"), deploymentGuide(identity));
}

export function readDeploymentIdentity(root) {
  const file = path.join(root, "deploy/customer.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function updateDeploymentRelease(root, { version, sourceSha, releaseFingerprint }) {
  const identity = readDeploymentIdentity(root);
  if (!identity) return null;
  const updated = {
    ...identity,
    release: version,
    sourceSha,
    releaseFingerprint,
    updatedAt: new Date().toISOString(),
  };
  const errors = validateDeploymentIdentity(updated);
  if (errors.length) throw new Error(`Refusing to update an invalid customer deployment identity: ${errors.join("; ")}`);
  atomicWriteJson(path.join(root, "deploy/customer.json"), updated);
  atomicWriteJson(path.join(root, "wrangler.jsonc"), buildWranglerConfig(updated));
  return updated;
}

export function validateDeploymentOverlay(root) {
  const identity = readDeploymentIdentity(root);
  if (!identity) return { present: false, errors: [] };
  const errors = validateDeploymentIdentity(identity);
  for (const file of [
    "wrangler.jsonc",
    "open-next.config.ts",
    "cloudflare/worker.ts",
    "cloudflare-env.d.ts",
    "scripts/ops/prepare-cloudflare-assets.mjs",
    "scripts/ops/validate-cloudflare-deploy.mjs",
    ".github/workflows/customer-ci.yml",
    ".github/workflows/customer-deploy.yml",
    "client/DEPLOYMENT.md",
  ]) {
    if (!fs.existsSync(path.join(root, file))) errors.push(`deployment overlay is missing ${file}`);
  }
  if (fs.existsSync(path.join(root, "wrangler.jsonc"))) {
    try {
      const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
      const environment = wrangler?.env?.[identity.cloudflareEnvironment];
      if (!environment) errors.push("wrangler.jsonc has no customer environment");
      else {
        if (environment.name !== identity.workerName) errors.push("wrangler Worker name does not match deploy/customer.json");
        const binding = (environment.r2_buckets ?? []).find((entry) => entry.binding === "TRADESSTACK_R2_BUCKET");
        if (!binding || binding.bucket_name !== identity.r2BucketName) errors.push("wrangler R2 binding does not match deploy/customer.json");
        if (environment.vars?.TRADESSTACK_RELEASE !== identity.release) errors.push("wrangler release var does not match deploy/customer.json");
        if (environment.vars?.TRADESSTACK_SOURCE_SHA !== identity.sourceSha) errors.push("wrangler source SHA var does not match deploy/customer.json");
      }
    } catch (error) {
      errors.push(`wrangler.jsonc is not valid JSON: ${String(error.message).slice(0, 120)}`);
    }
  }
  if (fs.existsSync(path.join(root, "package.json"))) {
    const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {};
    if (!scripts["cloudflare:deploy"]) errors.push("package.json does not expose cloudflare:deploy");
  }
  const forbidden = [...PLATFORM_SUPABASE_REFS, ...PLATFORM_WORKER_NAMES, ...PLATFORM_R2_BUCKETS];
  for (const file of ["wrangler.jsonc", "deploy/customer.json", "cloudflare/worker.ts", "open-next.config.ts"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const token of forbidden) {
      if (text.includes(token)) errors.push(`${file} contains platform identity ${token}`);
    }
  }
  return { present: true, errors: [...new Set(errors)] };
}
