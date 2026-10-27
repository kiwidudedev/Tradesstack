import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ROOT } from './lib.mjs';

const WORKER_MAIN = path.resolve(ROOT, '../tradesstack-worker-app/tradesstack-worker-app');
const HAS_WORKER_MAIN = fs.existsSync(path.join(WORKER_MAIN, '.git'));

function cloneWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tradesstack-provision-'));
  fs.cpSync(path.join(ROOT, 'ops'), path.join(workspace, 'ops'), { recursive: true });
  return workspace;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeProfile(workspace, id, overrides = {}) {
  const profile = {
    schemaVersion: 1,
    clientKey: id,
    identity: { appName: `${id} Worker`, slug: `${id}-worker`, scheme: id.replace(/-/g, '') },
    distribution: {
      channel: 'internal',
      iosBundleIdentifier: `com.tradesstack.worker.${id.replace(/-/g, '')}`,
      androidPackage: `com.tradesstack.worker.${id.replace(/-/g, '')}`,
      updateChannel: id,
    },
    environment: {
      kind: 'hosted',
      environmentId: `${id}-production`,
      displayLabel: id,
      supabaseProjectRef: 'abcdefghij0123456789',
    },
    branding: { platformColor: '#123456', actionColor: '#D9480F', splashBackgroundColor: '#FFFFFF' },
    modules: { dashboard: true, time_clock: true, tasks: true, purchase_orders: true, variations: true },
    navigation: {
      tabs: ['dashboard', 'time_clock', 'tasks', 'purchase_orders', 'variations', 'settings'],
      quickActions: [{ id: 'create-todo', label: 'Create a To Do', target: 'tasks' }],
    },
    features: { notifications: true },
    extensions: {},
    defaults: { locale: 'en-NZ', currency: 'NZD', timezone: 'Pacific/Auckland' },
    ...overrides,
  };
  const file = path.join(workspace, `${id}.profile.json`);
  fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`);
  return file;
}

function provisionWebOnly(workspace, customerId, extra = []) {
  const args = [
    path.join(ROOT, 'scripts/ops/customer-provision.mjs'),
    '--customer-id', customerId,
    '--display-name', `${customerId} web`,
    '--environment-id', `${customerId}-production`,
    '--supabase-project-ref', 'webtestproject000001',
    '--root', workspace,
    '--provider', 'local',
    '--web-release', '1.2.0',
    '--web-only',
    ...extra,
  ];
  try {
    return { status: 0, json: JSON.parse(execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })) };
  } catch (error) {
    let json = null;
    try {
      json = JSON.parse(String(error.stdout));
    } catch {
      json = null;
    }
    return { status: error.status ?? 1, json, stdout: String(error.stdout ?? '') };
  }
}

describe('web-only customer provisioning', { timeout: 120000 }, () => {
  let workspace;
  beforeEach(() => {
    workspace = cloneWorkspace();
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('creates a deployable web-only repository without a Worker application', () => {
    const result = provisionWebOnly(workspace, 'tradelynk-web', ['--apply']);
    expect(result.status).toBe(0);
    expect(result.json.status).toBe('READY_FOR_DEPLOYMENT');
    expect(result.json.webOnly).toBe(true);
    expect(result.json.repositories.worker).toBeNull();

    const webRoot = path.join(workspace, 'customer-repos', 'client-tradelynk-web', 'web');
    const workerRoot = path.join(workspace, 'customer-repos', 'client-tradelynk-web', 'worker');
    expect(fs.existsSync(path.join(webRoot, '.git'))).toBe(true);
    expect(fs.existsSync(workerRoot)).toBe(false);

    for (const file of [
      'wrangler.jsonc',
      'open-next.config.ts',
      'cloudflare/worker.ts',
      'cloudflare-env.d.ts',
      'deploy/customer.json',
      'scripts/ops/prepare-cloudflare-assets.mjs',
      'scripts/ops/validate-cloudflare-deploy.mjs',
      '.github/workflows/customer-ci.yml',
      '.github/workflows/customer-deploy.yml',
    ]) {
      expect(fs.existsSync(path.join(webRoot, file)), file).toBe(true);
    }

    const identity = readJson(path.join(webRoot, 'deploy/customer.json'));
    expect(identity.customerKey).toBe('tradelynk-web');
    expect(identity.workerName).toBe('tradesstack-tradelynk-web');
    expect(identity.r2BucketName).toBe('tradesstack-tradelynk-web-documents');
    expect(identity.supabaseProjectRef).toBe('webtestproject000001');
    expect(identity.release).toBe('1.2.0');

    const wrangler = readJson(path.join(webRoot, 'wrangler.jsonc'));
    const environment = wrangler.env.production;
    expect(environment.name).toBe('tradesstack-tradelynk-web');
    expect(environment.r2_buckets[0].bucket_name).toBe('tradesstack-tradelynk-web-documents');
    expect(environment.vars.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();

    const plain = ['wrangler.jsonc', 'deploy/customer.json', 'cloudflare/worker.ts'].map((file) => fs.readFileSync(path.join(webRoot, file), 'utf8')).join('\n');
    expect(plain).not.toContain('ibjyzpyuqupsxqakpzxj');
    expect(plain).not.toContain('mvxyxvrxaorzglppxzzz');
    expect(plain).not.toContain('tradesstack-alpha');

    const preflight = spawnSync(process.execPath, ['scripts/ops/validate-cloudflare-deploy.mjs'], {
      cwd: webRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLOUDFLARE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://webtestproject000001.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    });
    expect(preflight.status, preflight.stderr).toBe(0);
    expect(preflight.stdout).toContain('tradesstack-tradelynk-web');

    const registry = readJson(path.join(workspace, 'ops/clients.json'));
    const client = registry.clients.find((entry) => entry.clientId === 'tradelynk-web');
    expect(client.worker).toBeUndefined();
    expect(client.workerEnabled).toBe(false);
    expect(client.deployment.workerName).toBe('tradesstack-tradelynk-web');
    expect(client.releaseProvenance.releaseId).toBe('1.2.0');
    expect(client.releaseProvenance.sourceSha).toBeTruthy();
    expect(client.releaseProvenance.fingerprint).toBeTruthy();
    expect(client.provisioning.state).toBe('READY_FOR_DEPLOYMENT');

    const manifest = readJson(path.join(webRoot, 'release-manifest.json'));
    expect(manifest.releaseId).toBe('1.2.0');
    expect(manifest.files.length).toBeGreaterThan(2500);
    expect(manifest.files.some((file) => file.startsWith('deploy/') || file.startsWith('cloudflare/') || file === 'wrangler.jsonc')).toBe(false);
  });

  it('is idempotent and resumes without recreating the Web repository', () => {
    const failed = provisionWebOnly(workspace, 'tradelynk-retry', ['--apply', '--simulate-failure', 'configuration']);
    expect(failed.status).toBe(1);
    expect(failed.json.status).toBe('PARTIALLY_PROVISIONED');
    const webRoot = path.join(workspace, 'customer-repos', 'client-tradelynk-retry', 'web');
    const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: webRoot, encoding: 'utf8' }).trim();
    expect(fs.existsSync(path.join(workspace, 'customer-repos', 'client-tradelynk-retry', 'worker'))).toBe(false);

    const resumed = provisionWebOnly(workspace, 'tradelynk-retry', ['--apply', '--resume']);
    expect(resumed.status).toBe(0);
    expect(resumed.json.status).toBe('READY_FOR_DEPLOYMENT');
    const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: webRoot, encoding: 'utf8' }).trim();
    expect(after).toBe(before);

    const replay = provisionWebOnly(workspace, 'tradelynk-retry', ['--apply']);
    expect(replay.status).toBe(0);
    expect(replay.json.status).toBe('ALREADY_PROVISIONED');
  });

  it('blocks a platform Supabase project and an invalid deployment identity', () => {
    const platform = provisionWebOnly(workspace, 'tradelynk-platform', ['--apply', '--supabase-project-ref', 'mvxyxvrxaorzglppxzzz']);
    expect(platform.status).toBe(1);
    expect(platform.json.reason).toMatch(/platform Supabase project/);

    const alpha = provisionWebOnly(workspace, 'tradelynk-alpha-ref', ['--apply', '--supabase-project-ref', 'ibjyzpyuqupsxqakpzxj']);
    expect(alpha.status).toBe(1);
    expect(alpha.json.reason).toMatch(/platform Supabase project|already owned by client-alpha/);
  });
});
function provision(workspace, profileFile, extra = [], customerId = null) {
  const args = [
    path.join(ROOT, 'scripts/ops/customer-provision.mjs'),
    '--customer-id', customerId ?? readJson(profileFile).clientKey,
    '--display-name', readJson(profileFile).identity.appName,
    '--worker-profile', profileFile,
    '--root', workspace,
    '--provider', 'local',
    '--worker-release', '1.3.0',
    '--web-release', '1.2.0',
    ...(HAS_WORKER_MAIN ? ['--worker-main', WORKER_MAIN] : []),
    ...extra,
  ];
  try {
    return { status: 0, json: JSON.parse(execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })) };
  } catch (error) {
    let json = null;
    try {
      json = JSON.parse(String(error.stdout));
    } catch {
      json = null;
    }
    if (process.env.DEBUG_PROVISION) console.error('PROVISION FAILED', error.status, String(error.stdout).slice(0, 500));
    return { status: error.status ?? 1, json, stdout: String(error.stdout ?? '') };
  }
}

describe.skipIf(!HAS_WORKER_MAIN)('unified customer provisioning', { timeout: 120000 }, () => {
  let workspace;
  beforeEach(() => {
    workspace = cloneWorkspace();
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('prepares one customer with web + worker repositories and one registry record', () => {
    const profile = writeProfile(workspace, 'acme-fitout');
    const result = provision(workspace, profile, ['--apply']);
    expect(result.status).toBe(0);
    expect(result.json.status).toBe('READY_FOR_DEPLOYMENT');

    const registry = readJson(path.join(workspace, 'ops/clients.json'));
    const client = registry.clients.find((entry) => entry.clientId === 'acme-fitout');
    expect(client.repositoryReference).toBe('github:tradesstack/tradesstack-client-acme-fitout');
    expect(client.worker.repositoryReference).toBe('github:tradesstack/tradesstack-worker-client-acme-fitout');
    expect(client.worker.sourceBaseline.release).toBe('1.3.0');
    expect(client.databaseProjectReference).toBe('supabase:abcdefghij0123456789');
    expect(client.worker.targetWorkerRelease).toBe('1.3.0');
    expect(client.provisioning.state).toBe('READY_FOR_DEPLOYMENT');

    const webRoot = path.join(workspace, 'customer-repos', 'client-acme-fitout', 'web');
    const workerRoot = path.join(workspace, 'customer-repos', 'client-acme-fitout', 'worker');
    expect(fs.existsSync(path.join(webRoot, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(workerRoot, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(webRoot, 'client/config/acme-fitout.ts'))).toBe(true);
    expect(fs.existsSync(path.join(workerRoot, 'client/worker-profile.json'))).toBe(true);
    expect(readJson(path.join(workerRoot, 'release-manifest.json')).workerRelease).toBe('1.3.0');
    expect(readJson(path.join(webRoot, 'release-manifest.json')).releaseId).toBe('1.2.0');

    // Both applications resolve to the same dedicated environment.
    const workerProfile = readJson(path.join(workerRoot, 'client/worker-profile.json'));
    expect(workerProfile.environment.supabaseProjectRef).toBe('abcdefghij0123456789');
    // A new customer never inherits another customer's source customisation.
    const extension = fs.readFileSync(path.join(workerRoot, 'client/extensions/home/index.tsx'), 'utf8');
    expect(extension).not.toContain('Alpha site notice');
  });

  it('is idempotent for a repeated identical request', () => {
    const profile = writeProfile(workspace, 'acme-repeat');
    expect(provision(workspace, profile, ['--apply']).status).toBe(0);
    const before = fs.readFileSync(path.join(workspace, 'ops/clients.json'), 'utf8');
    const second = provision(workspace, profile, ['--apply']);
    expect(second.status).toBe(0);
    expect(second.json.status).toBe('ALREADY_PROVISIONED');
    expect(fs.readFileSync(path.join(workspace, 'ops/clients.json'), 'utf8')).toBe(before);
  });

  it('recovers from a partial failure without recreating valid resources', () => {
    const profile = writeProfile(workspace, 'acme-retry');
    const failed = provision(workspace, profile, ['--apply', '--simulate-failure', 'worker-repository']);
    expect(failed.status).toBe(1);
    expect(failed.json.status).toBe('PARTIALLY_PROVISIONED');
    const webHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.join(workspace, 'customer-repos', 'client-acme-retry', 'web'),
      encoding: 'utf8',
    }).trim();
    expect(fs.existsSync(path.join(workspace, 'customer-repos', 'client-acme-retry', 'worker'))).toBe(false);

    const resumed = provision(workspace, profile, ['--apply', '--resume']);
    expect(resumed.status).toBe(0);
    expect(resumed.json.status).toBe('READY_FOR_DEPLOYMENT');
    expect(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: path.join(workspace, 'customer-repos', 'client-acme-retry', 'web'),
        encoding: 'utf8',
      }).trim(),
    ).toBe(webHead);
    expect(fs.existsSync(path.join(workspace, 'customer-repos', 'client-acme-retry', 'worker', '.git'))).toBe(true);
  });

  it('blocks a duplicate environment and a concurrent operation', () => {
    const conflicting = writeProfile(workspace, 'acme-conflict', {
      environment: {
        kind: 'hosted',
        environmentId: 'acme-conflict-production',
        displayLabel: 'conflict',
        supabaseProjectRef: 'ibjyzpyuqupsxqakpzxj',
      },
    });
    const result = provision(workspace, conflicting, ['--apply']);
    expect(result.status).toBe(1);
    expect(result.json.reason).toMatch(/already owned by client-alpha/);

    const lockDir = path.join(workspace, 'ops/provisioning/acme-lock');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '.lock'), `${JSON.stringify({ operationId: 'other', startedAt: new Date().toISOString(), pid: 1 })}\n`);
    const lockedProfile = writeProfile(workspace, 'acme-lock', {
      environment: {
        kind: 'hosted',
        environmentId: 'acme-lock-production',
        displayLabel: 'lock',
        supabaseProjectRef: 'locklocklock00000001',
      },
    });
    const locked = provision(workspace, lockedProfile, ['--apply']);
    expect(locked.status).toBe(1);
    expect(locked.json.status).toBe('PROVISIONING_IN_PROGRESS');
    expect(fs.existsSync(path.join(workspace, 'customer-repos', 'client-acme-lock'))).toBe(false);
  });

  it('attaches a dedicated Worker repository to an existing web customer', () => {
    // The copied ops tree contains the real Alpha provisioning checkpoint; this
    // test exercises a fresh attach operation in the isolated workspace.
    fs.rmSync(path.join(workspace, 'ops/provisioning/client-alpha'), { recursive: true, force: true });
    const profile = path.join(workspace, 'ops/worker/profiles/client-alpha.json');
    const result = provision(
      workspace,
      profile,
      ['--attach-worker', '--apply', '--worker-release', '1.2.0'],
      'client-alpha',
    );
    expect(result.status).toBe(0);
    expect(result.json.status).toBe('READY_FOR_DEPLOYMENT');
    const client = readJson(path.join(workspace, 'ops/clients.json')).clients
      .find((entry) => entry.clientId === 'client-alpha');
    expect(client.worker.repositoryReference).toBe('github:tradesstack/tradesstack-worker-client-alpha');
    expect(client.worker.sourceBaseline.release).toBe('1.2.0');
    expect(client.provisioning.state).toBe('READY_FOR_DEPLOYMENT');
    expect(fs.existsSync(path.join(workspace, 'customer-repos', 'client-alpha', 'worker', '.git'))).toBe(true);
  });
});
