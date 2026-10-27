// Customer deployment preflight.
//
// Reads the non-secret customer identity written by the Main provisioning
// engine and refuses to deploy if the Supabase project, Worker, R2 bucket,
// release or environment does not match it. It deliberately has no Alpha or
// Main defaults: every customer value is supplied by deploy/customer.json.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const identityFile = path.join(root, "deploy/customer.json");
const wranglerFile = path.join(root, "wrangler.jsonc");

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: "BLOCKED", reason: message, ...details }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(identityFile)) fail("deploy/customer.json is missing. Provision this repository from TradesStack Main.");
if (!fs.existsSync(wranglerFile)) fail("wrangler.jsonc is missing from the customer deployment overlay.");

let identity;
let wrangler;
try {
  identity = JSON.parse(fs.readFileSync(identityFile, "utf8"));
  wrangler = JSON.parse(fs.readFileSync(wranglerFile, "utf8"));
} catch (error) {
  fail("deploy/customer.json or wrangler.jsonc is not valid JSON.", { error: String(error.message).slice(0, 200) });
}

const errors = [];
const environment = process.env.CLOUDFLARE_ENV?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!environment) errors.push("CLOUDFLARE_ENV must be set explicitly for the customer deployment.");
if (environment && environment !== identity.cloudflareEnvironment) {
  errors.push(`CLOUDFLARE_ENV ${environment} does not match customer environment ${identity.cloudflareEnvironment}.`);
}
if (!supabaseUrl) errors.push("NEXT_PUBLIC_SUPABASE_URL is required for the customer build.");
if (!supabaseAnonKey) errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is required for the customer build.");

if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    const expected = `${identity.supabaseProjectRef}.supabase.co`;
    if (parsed.protocol !== "https:" || parsed.hostname !== expected) {
      errors.push(`NEXT_PUBLIC_SUPABASE_URL must be https://${expected}, not ${supabaseUrl}.`);
    }
  } catch {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }
}

const platformRefs = ["ibjyzpyuqupsxqakpzxj", "mvxyxvrxaorzglppxzzz", "pcekmljoyrlacdsrlmiy"];
const platformWorkers = ["tradesstack-alpha", "tradesstack-main", "tradesstack-business-hub"];
const platformBuckets = ["tradesstack-alpha-documents", "tradesstack-main-documents"];

if (platformRefs.includes(identity.supabaseProjectRef)) errors.push("The customer identity references a platform Supabase project.");
if (platformWorkers.includes(identity.workerName)) errors.push("The customer identity references a platform Worker name.");
if (platformBuckets.includes(identity.r2BucketName)) errors.push("The customer identity references a platform R2 bucket.");
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(identity.workerName ?? "")) errors.push("Customer Worker name is invalid.");
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(identity.r2BucketName ?? "")) errors.push("Customer R2 bucket name is invalid.");
if (!/^[a-z0-9]{20}$/.test(identity.supabaseProjectRef ?? "")) errors.push("Customer Supabase project reference is invalid.");
if (!/^[0-9a-f]{40}$/.test(identity.sourceSha ?? "")) errors.push("Customer source SHA is invalid.");
if (!/^[0-9a-f]{64}$/.test(identity.releaseFingerprint ?? "")) errors.push("Customer release fingerprint is invalid.");
if (identity.deploymentUrl !== `${identity.siteUrl}/api/health`) errors.push("Customer deployment URL must be the health endpoint.");

const env = wrangler?.env?.[identity.cloudflareEnvironment];
if (!env) {
  errors.push(`wrangler.jsonc has no env.${identity.cloudflareEnvironment} block.`);
} else {
  if (env.name !== identity.workerName) errors.push(`wrangler env name ${env.name} does not match ${identity.workerName}.`);
  const binding = (env.r2_buckets ?? []).find((entry) => entry.binding === "TRADESSTACK_R2_BUCKET");
  if (!binding || binding.bucket_name !== identity.r2BucketName) {
    errors.push(`wrangler R2 binding does not match ${identity.r2BucketName}.`);
  }
  const vars = env.vars ?? {};
  for (const [key, value] of Object.entries({
    TRADESSTACK_CUSTOMER_KEY: identity.customerKey,
    TRADESSTACK_ENVIRONMENT_ID: identity.environmentId,
    TRADESSTACK_SUPABASE_PROJECT_REF: identity.supabaseProjectRef,
    TRADESSTACK_RELEASE: identity.release,
    TRADESSTACK_SOURCE_SHA: identity.sourceSha,
    TRADESSTACK_RELEASE_FINGERPRINT: identity.releaseFingerprint,
    TRADESSTACK_WORKER_NAME: identity.workerName,
    NEXT_PUBLIC_SITE_URL: identity.siteUrl,
  })) {
    if (vars[key] !== value) errors.push(`wrangler var ${key} does not match the customer identity.`);
  }
  if (identity.takeoff && !(env.queues?.producers ?? []).some((entry) => entry.binding === "TRADESSTACK_TAKEOFF_QUEUE")) {
    errors.push("Takeoff-enabled customer is missing the TRADESSTACK_TAKEOFF_QUEUE producer.");
  }
}

const forbidden = [...platformRefs, ...platformWorkers, ...platformBuckets];
for (const file of [
  "wrangler.jsonc",
  "cloudflare/worker.ts",
  "open-next.config.ts",
  "deploy/customer.json",
]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, "utf8");
  for (const token of forbidden) {
    if (text.includes(token)) errors.push(`${file} contains platform identity ${token}.`);
  }
}

if (errors.length) {
  fail("Customer deployment preflight failed.", { errors });
}

console.log(JSON.stringify({
  status: "validated",
  customerKey: identity.customerKey,
  cloudflareEnvironment: identity.cloudflareEnvironment,
  workerName: identity.workerName,
  supabaseProjectReference: identity.supabaseProjectRef,
  r2BucketName: identity.r2BucketName,
  release: identity.release,
  sourceSha: identity.sourceSha,
  supabaseAnonKeyPresent: true,
}, null, 2));
