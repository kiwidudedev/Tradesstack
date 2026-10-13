import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";

const baseUrl = process.env.E2E_BASE_URL || "https://tradesstack-alpha.tradesstack.workers.dev";
const projectId = process.env.E2E_PROJECT_ID || "78e46b84-5736-47c4-a106-d1a8b90916af";
const supabaseUrl = process.env.E2E_SUPABASE_URL || "https://ibjyzpyuqupsxqakpzxj.supabase.co";
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const creds = JSON.parse(await readFile(process.env.E2E_CREDS || "/tmp/tradesstack-alpha-test-creds.json", "utf8"));
const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", projectRef, "-o", "json"], { encoding: "utf8" }));
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
if (!anonKey) throw new Error("Alpha anon key unavailable");

async function cookieFor(account) {
  let cookies = [];
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookies,
      setAll: (updates) => { cookies = updates; },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw error;
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

async function request(path, init = {}, cookie = "") {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body = null;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch {}
  return { status: response.status, bytes, body };
}

const ownerCookie = await cookieFor(creds.owner);
const outsiderCookie = await cookieFor(creds.outsider);
const content = new TextEncoder().encode("TradesStack Alpha R2 document verification 2026-10-10\n");
const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", content))].map((b) => b.toString(16).padStart(2, "0")).join("");
const idempotencyKey = crypto.randomUUID();

const init = await request("/api/documents/uploads/initiate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ projectId, displayName: `alpha-r2-verification-${Date.now()}.txt`, claimedMimeType: "text/plain", byteSize: content.byteLength, idempotencyKey }),
}, ownerCookie);
if (init.status !== 201) throw new Error(`initiate failed: ${init.status} ${JSON.stringify(init.body)}`);

const upload = await request(`/api/documents/uploads/${init.body.versionId}/content`, {
  method: "PUT",
  headers: { "content-type": "text/plain" },
  body: content,
}, ownerCookie);
const download = await request(`/api/documents/nodes/${init.body.nodeId}/download/file`, {}, ownerCookie);
const unauthorized = await request(`/api/documents/nodes/${init.body.nodeId}/download/file`);
const outsider = await request(`/api/documents/nodes/${init.body.nodeId}/download/file`, {}, outsiderCookie);
const retry = await request(`/api/documents/uploads/${init.body.versionId}/content`, {
  method: "PUT",
  headers: { "content-type": "text/plain" },
  body: content,
}, ownerCookie);

const actualDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", download.bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
console.log(JSON.stringify({
  initiate: init.status,
  upload: upload.status,
  uploadBody: upload.body,
  nodeId: init.body.nodeId,
  versionId: init.body.versionId,
  download: download.status,
  downloadBody: download.body,
  checksumMatch: actualDigest === digest,
  downloadedBytes: download.bytes.byteLength,
  unauthorized: unauthorized.status,
  crossOrganization: outsider.status,
  retry: retry.status,
}));
if (upload.status !== 200 || download.status !== 200 || actualDigest !== digest || unauthorized.status !== 401 || outsider.status !== 404) process.exitCode = 1;
