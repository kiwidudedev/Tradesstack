import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ROOT } from './lib.mjs';

const WORKER_MAIN = path.resolve(ROOT, '../tradesstack-worker-app/tradesstack-worker-app');
const HAS_WORKER_MAIN = fs.existsSync(path.join(WORKER_MAIN, '.git'));

const CUSTOMER = 'acme-promote';

function cloneWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tradesstack-promote-'));
  fs.cpSync(path.join(ROOT, 'ops'), path.join(workspace, 'ops'), { recursive: true });
  fs.rmSync(path.join(workspace, 'ops/provisioning'), { recursive: true, force: true });
  fs.rmSync(path.join(workspace, 'ops/worker/promotions'), { recursive: true, force: true });
  return workspace;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function profilePath(workspace) {
  const profile = {
    schemaVersion: 1,
    clientKey: CUSTOMER,
    identity: { appName: 'Acme Promote', slug: 'acme-promote-worker', scheme: 'acmepromote' },
    distribution: {
      channel: 'internal',
      iosBundleIdentifier: 'com.tradesstack.worker.acmepromote',
      androidPackage: 'com.tradesstack.worker.acmepromote',
      updateChannel: 'acme-promote',
    },
    environment: {
      kind: 'hosted',
      environmentId: 'acme-promote-production',
      displayLabel: 'Acme Promote',
      supabaseProjectRef: 'acmepromote000000001',
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
  };
  const file = path.join(workspace, `${CUSTOMER}.profile.json`);
  fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`);
  return file;
}

function run(script, args) {
  try {
    return {
      status: 0,
      json: JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'scripts/ops', script), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
      })),
    };
  } catch (error) {
    let json = null;
    try {
      json = JSON.parse(String(error.stdout));
    } catch {
      json = null;
    }
    return { status: error.status ?? 1, json };
  }
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function provision(workspace) {
  const profile = profilePath(workspace);
  return run('customer-provision.mjs', [
    '--customer-id', CUSTOMER,
    '--display-name', 'Acme Promote',
    '--worker-profile', profile,
    '--root', workspace,
    '--provider', 'local',
    '--worker-release', '1.2.0',
    '--web-release', '1.2.0',
    ...(HAS_WORKER_MAIN ? ['--worker-main', WORKER_MAIN] : []),
    '--apply',
  ], workspace);
}

function workerRepo(workspace) {
  return path.join(workspace, 'customer-repos', `client-${CUSTOMER}`, 'worker');
}

function promote(workspace, extra = []) {
  return run('worker-promote.mjs', [
    '--client', CUSTOMER,
    '--from', '1.2.0',
    '--to', '1.3.0',
    '--worker-root', workerRepo(workspace),
    '--worker-main', WORKER_MAIN,
    '--workspace', workspace,
    '--skip-validation',
    '--apply',
    ...extra,
  ], workspace);
}

function addCustomerExtension(root) {
  const file = path.join(root, 'client/extensions/home/index.tsx');
  const content = `import type { HomeExtension } from '@/src/config/extension-host';\n\nexport const homeExtensions: HomeExtension[] = [];\n// acme customisation\n`;
  fs.writeFileSync(file, content);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'customer extension']);
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe.skipIf(!HAS_WORKER_MAIN)('Worker Main to customer source promotion', { timeout: 120000 }, () => {
  let workspace;
  beforeEach(() => {
    workspace = cloneWorkspace();
    const result = provision(workspace);
    expect(result.status).toBe(0);
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('promotes real source while preserving customer-owned material', () => {
    const root = workerRepo(workspace);
    const extensionHash = addCustomerExtension(root);
    const header = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');

    const result = promote(workspace);
    expect(result.status).toBe(0);
    expect(result.json.status).toBe('PROMOTED');
    expect(result.json.validation.status).toBe('SKIPPED_NO_DEPENDENCIES');

    expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'client/extensions/home/index.tsx'))).digest('hex')).toBe(extensionHash);
    expect(fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8')).not.toBe(header);
    const manifest = readJson(path.join(root, 'release-manifest.json'));
    expect(manifest.workerRelease).toBe('1.3.0');
    expect(manifest.sourceSha).toBe(readJson(path.join(workspace, 'ops/worker/releases/1.3.0.json')).sourceSha);
    expect(manifest.releaseOwnedFiles).not.toEqual(expect.arrayContaining(['client/extensions/home/index.tsx']));

    const client = readJson(path.join(workspace, 'ops/clients.json')).clients.find((entry) => entry.clientId === CUSTOMER);
    // A prepared branch does not move the customer's actual baseline.
    expect(client.worker.targetWorkerRelease).toBe('1.2.0');
    expect(client.worker.promotedWorkerRelease).toBe('1.2.0');
    expect(client.worker.sourceBaseline.release).toBe('1.2.0');
    expect(client.worker.pendingPromotion.toVersion).toBe('1.3.0');
    expect(client.worker.pendingPromotion.status).toBe('AWAITING_MERGE');

    const record = readJson(path.join(workspace, 'ops/worker/promotions', CUSTOMER, '1.2.0__1.3.0.json'));
    expect(record.status).toBe('SOURCE_PREPARED_AWAITING_MERGE');
    expect(record.mergeState).toBe('NOT_MERGED');
    expect(record.preserved.releaseOwnedConflicts).toEqual([]);
    expect(record.artifactState.builtRelease).toBeNull();
    expect(record.artifactState.distributedRelease).toBeNull();
    expect(record.artifactState.installedRelease).toBeNull();

    // Confirm the merge only after the branch is actually on the default branch.
    git(root, ['switch', 'main']);
    git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'merge', '--no-ff', '-m', 'merge promotion', 'worker-upgrade/1.3.0']);
    const confirmed = run('worker-promote.mjs', [
      '--client', CUSTOMER, '--from', '1.2.0', '--to', '1.3.0',
      '--worker-root', root, '--workspace', workspace, '--confirm-merged',
    ], workspace);
    expect(confirmed.status).toBe(0);
    expect(confirmed.json.status).toBe('MERGE_CONFIRMED');
    const mergedClient = readJson(path.join(workspace, 'ops/clients.json')).clients.find((entry) => entry.clientId === CUSTOMER);
    expect(mergedClient.worker.targetWorkerRelease).toBe('1.3.0');
    expect(mergedClient.worker.sourceBaseline.release).toBe('1.3.0');
    expect(mergedClient.worker.pendingPromotion).toBeNull();
    const mergedRecord = readJson(path.join(workspace, 'ops/worker/promotions', CUSTOMER, '1.2.0__1.3.0.json'));
    expect(mergedRecord.status).toBe('SOURCE_PROMOTED');
    expect(mergedRecord.mergeState).toBe('MERGED');
  });

  it('detects a modified Worker Main-owned file and changes nothing', () => {
    const root = workerRepo(workspace);
    fs.appendFileSync(path.join(root, 'app/index.tsx'), '\n// local modification\n');
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'local main-owned edit']);
    const before = git(root, ['rev-parse', 'HEAD']);

    const result = promote(workspace);
    expect(result.status).toBe(1);
    expect(result.json.status).toBe('BLOCKED');
    expect(result.json.conflicts.join(' ')).toMatch(/release-owned file was modified locally: app\/index.tsx/);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(before);
    const client = readJson(path.join(workspace, 'ops/clients.json')).clients.find((entry) => entry.clientId === CUSTOMER);
    expect(client.worker.targetWorkerRelease).toBe('1.2.0');
  });

  it('refuses a non-sequential release and a mismatched customer profile', () => {
    const skipped = run('worker-promote.mjs', [
      '--client', CUSTOMER, '--from', '1.2.0', '--to', '1.4.0',
      '--worker-root', workerRepo(workspace), '--workspace', workspace, '--skip-validation', '--apply',
    ], workspace);
    expect(skipped.status).toBe(1);
    expect(skipped.json.reason).toMatch(/expects previous release/);

    const profileFile = path.join(workerRepo(workspace), 'client/worker-profile.json');
    const profile = readJson(profileFile);
    profile.identity.appName = 'Edited Directly';
    fs.writeFileSync(profileFile, `${JSON.stringify(profile, null, 2)}\n`);
    git(workerRepo(workspace), ['add', '-A']);
    git(workerRepo(workspace), ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'direct profile edit']);

    const mismatch = promote(workspace);
    expect(mismatch.status).toBe(1);
    expect(mismatch.json.reason).toMatch(/differs from the registered Worker profile/);
  });
});
