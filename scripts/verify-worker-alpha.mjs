#!/usr/bin/env node
/**
 * Read-only verification that a customer environment is Worker-ready.
 *
 * Checks, without mutating anything:
 *   - the customer profile's environment matches the supplied Supabase URL;
 *   - the public anon key is a public key (never a service-role key);
 *   - the three mobile Edge Functions are deployed (401 without a token, not 404);
 *   - the mobile RPCs required by the Worker App exist (auth-required error,
 *     not "function not found");
 *   - optionally, with ALPHA_E2E_EMAIL/ALPHA_E2E_PASSWORD, an authenticated
 *     bootstrap succeeds and returns the expected organization/project.
 *
 * Usage:
 *   ALPHA_URL=https://<ref>.supabase.co ALPHA_ANON_KEY=<public key> \
 *     node scripts/verify-worker-alpha.mjs --profile ops/worker/profiles/client-alpha.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './ops/lib.mjs';
import { loadContract } from './ops/worker-contract.mjs';

const contract = await loadContract(ROOT);
const options = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument.startsWith('--')) options[argument.slice(2)] = process.argv[++index];
}

const url = (process.env.ALPHA_URL ?? '').replace(/\/+$/, '');
const anon = process.env.ALPHA_ANON_KEY ?? '';
const email = process.env.ALPHA_E2E_EMAIL;
const password = process.env.ALPHA_E2E_PASSWORD;
const profilePath = path.resolve(ROOT, options.profile ?? 'ops/worker/profiles/client-alpha.json');

if (!url || !anon) {
  console.error('ALPHA_URL and ALPHA_ANON_KEY are required');
  process.exit(1);
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const profile = contract.defineWorkerClientConfig(JSON.parse(fs.readFileSync(profilePath, 'utf8')));
const expectedRef = profile.environment.kind === 'hosted' ? profile.environment.supabaseProjectRef : null;
const actualRef = (() => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return null;
  }
})();

check('profile resolves', Boolean(profile.clientKey), profile.clientKey);
check('URL matches the profile environment', actualRef === expectedRef, `${actualRef} vs ${expectedRef}`);
check('anon key is public', contract.inspectPublicSupabaseKey(anon).ok);

const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
check('Supabase auth endpoint reachable', health.status === 200 || health.status === 401, `HTTP ${health.status}`);

for (const fn of ['mobile_app_bootstrap', 'mobile_clock_in_v2', 'mobile_clock_out_v2']) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: '{}',
  });
  check(
    `Edge Function deployed: ${fn}`,
    response.status === 401,
    response.status === 404 ? 'HTTP 404 — not deployed' : `HTTP ${response.status}`,
  );
}

const rpcProbes = [
  ['list_tasks', {}],
  ['list_mobile_project_purchase_orders_v2', { p_project_id: '00000000-0000-0000-0000-000000000000' }],
  ['list_mobile_project_variations_v1', { p_project_id: '00000000-0000-0000-0000-000000000000' }],
  ['get_mobile_project_variation_capabilities_v1', { p_project_id: '00000000-0000-0000-0000-000000000000' }],
  ['resolve_mobile_project_member_context_v2', { p_project_id: '00000000-0000-0000-0000-000000000000' }],
];
for (const [name, body] of rpcProbes) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const missing = response.status === 404;
  check(`Mobile RPC exists: ${name}`, !missing, `HTTP ${response.status}${missing ? ' — not found' : ''}`);
  if (!missing && /authentication is required/i.test(text)) {
    check(`Mobile RPC enforces authentication: ${name}`, true);
  }
}

if (email && password) {
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((response) => response.json());
  check('Worker test account can sign in', Boolean(auth.access_token));
  if (auth.access_token) {
    const token = auth.access_token;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    check('session issued by this project', payload.iss === `${url}/auth/v1`, payload.iss);
    const bootstrapResponse = await fetch(`${url}/functions/v1/mobile_app_bootstrap`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const bootstrap = await bootstrapResponse.json();
    check('authenticated bootstrap succeeds', bootstrapResponse.status === 200 && bootstrap.ok === true);
    check('bootstrap returns an organization', Boolean(bootstrap.organization?.id), bootstrap.organization?.name);
    check(
      'bootstrap returns at least one project membership',
      (bootstrap.project_memberships ?? []).length > 0,
      `${(bootstrap.project_memberships ?? []).length} project(s)`,
    );
  }
} else {
  console.log('SKIP  authenticated checks (set ALPHA_E2E_EMAIL/ALPHA_E2E_PASSWORD)');
}

const failed = results.filter((result) => result.status === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
