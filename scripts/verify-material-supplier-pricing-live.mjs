import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

if (process.env.RUN_LIVE_MATERIAL_GIB_IMPORT !== "true") {
  throw new Error("Set RUN_LIVE_MATERIAL_GIB_IMPORT=true to authorize the one paid live GIB import.");
}

const baseURL = process.env.MATERIAL_GIB_BASE_URL ?? "http://127.0.0.1:3000";
const fixturePath = "tests/fixtures/materials/supplier-pricing/trade-direct-gib-2026.pdf";
const expectedHash = "f263f45a21c0ca711ffa428e08f41a03c5092d0532f2ccae8111a779abc418af";
const expected = [
  { name: "GIB Standard 10mm", unit: "m2", fis: 8.30, dts1: 8.74, dts2: 9.10 },
  { name: "GIB Standard 13mm", unit: "m2", fis: 10.48, dts1: 11.06, dts2: 11.53 },
  { name: "GIB Fyreline 10mm", unit: "m2", fis: 9.34, dts1: 9.82, dts2: 10.21 },
  { name: "GIB Fyreline 13mm", unit: "m2", fis: 12.82, dts1: 13.54, dts2: 14.12 },
  { name: "GIB Fyreline 16mm", unit: "m2", fis: 21.09, dts1: 22.11, dts2: 22.93 },
  { name: "GIB Fyreline 19mm", unit: "m2", fis: 24.80, dts1: 25.94, dts2: 26.85 },
  { name: "GIB Braceline 10mm", unit: "m2", fis: 12.06, dts1: 12.66, dts2: 13.15 },
  { name: "GIB Braceline 13mm", unit: "m2", fis: 14.66, dts1: 15.49, dts2: 16.15 },
  { name: "GIB Aqualine 10mm", unit: "m2", fis: 15.40, dts1: 15.92, dts2: 16.34 },
  { name: "GIB Aqualine 13mm", unit: "m2", fis: 21.14, dts1: 21.86, dts2: 22.44 },
];

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[®™]/g, "").replace(/m²/g, "m2").replace(/[^a-z0-9]+/g, " ").trim();
}

function fieldValue(value) {
  return value && typeof value === "object" && "value" in value ? value.value : null;
}

function priceLabelKey(value) {
  const label = normalize(value);
  if (label.startsWith("dts1")) return "dts1";
  if (label.startsWith("dts2")) return "dts2";
  if (label.startsWith("fis")) return "fis";
  return label;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Missing local Supabase environment.");

const fixture = await readFile(fixturePath);
if (fixture.length !== 99_364 || createHash("sha256").update(fixture).digest("hex") !== expectedHash) {
  throw new Error("The live GIB fixture does not match the pinned source document.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: suppliers, error: supplierError } = await admin.from("organization_suppliers")
  .select("id,organization_id,name,company_name")
  .or("name.eq.Trade Direct,company_name.eq.Trade Direct");
if (supplierError) throw supplierError;
if ((suppliers ?? []).length !== 1) throw new Error("Expected one Trade Direct supplier in the local verification database.");
const supplier = suppliers[0];

const { data: activeJobs, error: jobsError } = await admin.from("organization_material_import_jobs")
  .select("id")
  .in("state", ["queued", "processing"]);
if (jobsError) throw jobsError;
if ((activeJobs ?? []).length !== 0) throw new Error("Refusing the paid run while another Material import job is active.");

const { data: members, error: membersError } = await admin.from("organization_members")
  .select("user_id,role")
  .eq("organization_id", supplier.organization_id)
  .in("role", ["owner", "admin"])
  .limit(1);
if (membersError || !members?.[0]) throw membersError ?? new Error("No authorized organization member is available.");
const { data: userResult, error: userError } = await admin.auth.admin.getUserById(members[0].user_id);
if (userError || !userResult.user?.email) throw userError ?? new Error("Authorized member has no login email.");
const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: userResult.user.email });
if (linkError || !link.properties.hashed_token) throw linkError ?? new Error("Unable to create local verification login.");
const actor = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: verified, error: verifyError } = await actor.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (verifyError || !verified.session) throw verifyError ?? new Error("Unable to establish local verification session.");

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const cookieValue = `base64-${Buffer.from(JSON.stringify(verified.session)).toString("base64url")}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{
  name: `sb-${projectRef}-auth-token`,
  value: cookieValue,
  domain: new URL(baseURL).hostname,
  path: "/",
  httpOnly: false,
  secure: false,
  sameSite: "Lax",
  expires: verified.session.expires_at,
}]);
const page = await context.newPage();

try {
  await page.goto(`${baseURL}/app/company/materials`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) throw new Error("Authenticated Material Library session was not accepted.");
  await page.getByRole("heading", { name: "Material Library" }).waitFor();
  await page.getByRole("button", { name: "Import Supplier Price List" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator('input[type="file"]').setInputFiles(fixturePath);
  await dialog.getByLabel("Supplier", { exact: true }).selectOption({ label: "Trade Direct" });

  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/materials/imports") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create Import Batch" }).click();
  const createResponse = await createResponsePromise;
  const created = await createResponse.json();
  if (!createResponse.ok() || !created.batch?.id) throw new Error(created.error ?? "Create Import Batch failed.");
  const batchId = created.batch.id;

  await dialog.getByRole("heading", { name: "Interpreting supplier price list" }).waitFor({ timeout: 20_000 });
  if (await dialog.getByRole("columnheader", { name: "Material" }).count()) {
    throw new Error("The empty review table is visible during active interpretation.");
  }
  const progress = dialog.getByRole("progressbar", { name: "Supplier price list interpretation progress" });
  await progress.waitFor();
  if (await progress.getAttribute("aria-valuenow") !== null) throw new Error("The one-chunk provider call must remain indeterminate.");
  await page.screenshot({ path: ".tmp/material-import-live-progress.png", fullPage: true });

  const terminalState = await Promise.race([
    dialog.getByText(/rows ready for review/).waitFor({ timeout: 720_000 }).then(() => "ready"),
    dialog.getByRole("button", { name: "Try Again" }).waitFor({ timeout: 720_000 }).then(() => "failed"),
  ]);
  if (terminalState === "failed") {
    await page.screenshot({ path: ".tmp/material-import-live-failed.png", fullPage: true });
    throw new Error(`Live Material import ${batchId} reached its terminal failure UI.`);
  }
  await dialog.getByRole("columnheader", { name: "Material" }).waitFor();
  await page.screenshot({ path: ".tmp/material-import-live-ready.png", fullPage: true });

  const statusResponse = await page.request.get(`${baseURL}/api/materials/imports/${batchId}`);
  const statusPayload = await statusResponse.json();
  if (!statusResponse.ok() || statusPayload.processing?.status !== "ready") {
    throw new Error("Authenticated status endpoint did not reach ready.");
  }

  const [{ data: batch, error: batchError }, { data: runs, error: runsError }, { data: jobs, error: finalJobsError }, { data: rows, error: rowsError }] = await Promise.all([
    admin.from("organization_material_import_batches").select("id,status,rows_extracted,extraction_method,extraction_summary,created_at,updated_at").eq("id", batchId).single(),
    admin.from("organization_material_import_runs").select("id,status,attempt,provider,model,request_ids,usage_json,duration_ms,chunk_manifest,partial,error_code").eq("import_batch_id", batchId).order("created_at", { ascending: false }).limit(1),
    admin.from("organization_material_import_jobs").select("id,state,attempt_count,last_error_code").eq("import_batch_id", batchId).order("created_at", { ascending: false }).limit(1),
    admin.from("organization_material_import_rows").select("id,status,extracted_name,extracted_unit,source_payload").eq("import_batch_id", batchId).order("row_index"),
  ]);
  if (batchError || runsError || finalJobsError || rowsError) throw batchError ?? runsError ?? finalJobsError ?? rowsError;
  const run = runs?.[0];
  const job = jobs?.[0];
  if (batch.status !== "ready_for_review" || run?.status !== "completed" || job?.state !== "completed") {
    throw new Error("The durable batch/run/job lifecycle did not complete successfully.");
  }
  if (batch.extraction_summary?.providerCallCount !== 1 || run.attempt !== 1 || job.attempt_count !== 1) {
    throw new Error("The live import did not retain the one-call/one-attempt cost-control invariant.");
  }

  for (const item of expected) {
    const row = (rows ?? []).find((candidate) => normalize(candidate.extracted_name).includes(normalize(item.name)));
    if (!row) throw new Error(`Missing semantic regression product: ${item.name}`);
    if (normalize(row.extracted_unit) !== item.unit) throw new Error(`Incorrect unit for ${item.name}.`);
    const prices = row.source_payload?.priceOptions ?? [];
    const byLabel = Object.fromEntries(prices.map((price) => [priceLabelKey(fieldValue(price.label)), fieldValue(price.amount)]));
    if (byLabel.fis !== item.fis || byLabel.dts1 !== item.dts1 || byLabel.dts2 !== item.dts2) {
      throw new Error(`Incorrect FIS/DTS pricing relationship for ${item.name}.`);
    }
    await dialog.getByDisplayValue(row.extracted_name, { exact: true }).waitFor();
  }

  console.log(JSON.stringify({
    fixture: { fileName: "Metro 2026_GIB Plasterboard full Pricing .pdf", bytes: fixture.length, pages: 3, sha256: expectedHash },
    batchId,
    runId: run.id,
    jobId: job.id,
    statuses: { batch: batch.status, run: run.status, job: job.state },
    model: run.model,
    providerDurationMs: batch.extraction_summary?.durationMs ?? null,
    workerDurationMs: run.duration_ms,
    providerCallCount: batch.extraction_summary?.providerCallCount,
    providerAttempts: run.attempt,
    inputTokens: run.usage_json?.inputTokens ?? null,
    outputTokens: run.usage_json?.outputTokens ?? null,
    requestId: run.request_ids?.[0] ?? null,
    chunkCount: run.chunk_manifest?.chunkCount ?? null,
    partial: run.partial,
    rowsInserted: rows?.length ?? 0,
    pendingReviewRows: (rows ?? []).filter((row) => row.status === "pending_review").length,
    verifiedProducts: expected.map((item) => item.name),
    ui: { processingVisible: true, processingIndeterminate: true, emptyTableHidden: true, readyTableVisible: true },
  }, null, 2));
} finally {
  await browser.close();
}
