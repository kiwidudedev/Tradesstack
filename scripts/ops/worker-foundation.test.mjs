import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ROOT } from './lib.mjs';
import {
  checkWorkerCompatibility,
  listWorkerProfiles,
  loadContract,
  loadWorkerProduct,
  loadWorkerReleases,
  resolveClientWorker,
  validateWorkerProductVersion,
  validateWorkerReleaseManifest,
  validateRegistryWorkerBindings,
  workerReleaseFingerprint,
} from './worker-contract.mjs';

const contract = await loadContract(ROOT);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cloneWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tradesstack-worker-ops-'));
  fs.cpSync(path.join(ROOT, 'ops'), path.join(workspace, 'ops'), { recursive: true });
  return workspace;
}

function runScript(script, args, { workspace } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts/ops', script), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...(workspace ? {} : {}) },
    });
    return { status: 0, json: JSON.parse(stdout) };
  } catch (error) {
    const stdout = String(error.stdout ?? '');
    let json = null;
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
    return { status: error.status ?? 1, json, stdout };
  }
}

function registry(workspace) {
  return readJson(path.join(workspace, 'ops/clients.json'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe('worker control-plane manifests', () => {
  it('validates the approved Worker releases and product pointer', () => {
    const releases = loadWorkerReleases(ROOT);
    expect(releases.map(({ value }) => value.version)).toEqual(expect.arrayContaining(['1.0.0', '1.1.0']));
    for (const release of releases) {
      expect(validateWorkerReleaseManifest(release.value, { root: ROOT, contract })).toEqual([]);
    }
    const product = loadWorkerProduct(ROOT).value;
    expect(validateWorkerProductVersion(product, releases, path.join(ROOT, product.releaseManifest))).toEqual([]);
  });

  it('detects a tampered file hash and a missing required file', () => {
    const release = readJson(path.join(ROOT, 'ops/worker/releases/1.1.0.json'));
    const tampered = { ...release, fileHashes: { ...release.fileHashes } };
    tampered.fileHashes['package.json'] = '0'.repeat(64);
    expect(validateWorkerReleaseManifest(tampered, { root: ROOT, contract })).toEqual(
      expect.arrayContaining(['releaseFingerprint does not match files/fileHashes']),
    );

    const missing = {
      ...release,
      files: release.files.filter((file) => file !== 'app.config.ts'),
      releaseFingerprint: '',
    };
    delete missing.fileHashes['app.config.ts'];
    const errors = validateWorkerReleaseManifest(missing, { root: ROOT, contract });
    expect(errors.join(' ')).toMatch(/required Worker App file missing/);
  });

  it('recomputes the release fingerprint from the file map', () => {
    const release = readJson(path.join(ROOT, 'ops/worker/releases/1.1.0.json'));
    expect(workerReleaseFingerprint(release)).toBe(release.releaseFingerprint);
  });
});

describe('worker profile isolation', () => {
  it('rejects shared environments and bundle identifiers between customers', () => {
    const registryValue = registry(ROOT);
    const broken = {
      ...registryValue,
      clients: [
        ...registryValue.clients,
        {
          ...registryValue.clients[0],
          clientId: 'client-beta',
          databaseProjectReference: 'supabase:abcdefghij0123456789',
          worker: {
            ...registryValue.clients[0].worker,
            profilePath: 'ops/worker/profiles/client-alpha.json',
            targetWorkerRelease: '1.1.0',
          },
        },
      ],
    };
    const errors = validateRegistryWorkerBindings(broken, { contract });
    expect(errors.join(' ')).toMatch(/reused by another client/);
  });

  it('rejects a stale profile fingerprint in the registry', () => {
    const registryValue = registry(ROOT);
    const broken = {
      ...registryValue,
      clients: registryValue.clients.map((client) =>
        client.worker ? { ...client, worker: { ...client.worker, profileFingerprint: 'f'.repeat(64) } } : client),
    };
    const errors = validateRegistryWorkerBindings(broken, { contract });
    expect(errors.join(' ')).toMatch(/profileFingerprint is stale/);
  });
});

describe('worker compatibility', () => {
  const registryValue = registry(ROOT);
  const client = registryValue.clients.find((entry) => entry.clientId === 'client-alpha');
  const { profile } = resolveClientWorker(client, { root: ROOT, contract });
  const releases = loadWorkerReleases(ROOT);
  const release = releases.find(({ value }) => value.version === '1.1.0');

  it('accepts the approved Alpha binding', () => {
    const result = checkWorkerCompatibility({ client, profile, workerRelease: release, contract });
    expect(result.status).toBe('COMPATIBLE');
  });

  it('blocks a web release below the Worker minimum', () => {
    const result = checkWorkerCompatibility({
      client: { ...client, targetRelease: '0.9.0' },
      profile,
      workerRelease: release,
      contract,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join(' ')).toMatch(/must be at least the Worker minimum/);
  });

  it('blocks a customer database behind the mobile contract migration floor', () => {
    const result = checkWorkerCompatibility({
      client: { ...client, database: { ...client.database, migrationTarget: '20260101000000_old.sql' } },
      profile,
      workerRelease: release,
      contract,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join(' ')).toMatch(/migration floor/);
  });

  it('blocks a profile environment that differs from the registered database', () => {
    const mismatched = {
      ...profile,
      config: {
        ...profile.config,
        environment: {
          ...profile.config.environment,
          supabaseProjectRef: 'abcdefghij0123456789',
        },
      },
    };
    const result = checkWorkerCompatibility({ client, profile: mismatched, workerRelease: release, contract });
    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join(' ')).toMatch(/must equal registry database project/);
  });

  it('blocks a target release that cannot support an enabled customisation', () => {
    const narrowRelease = {
      value: {
        ...release.value,
        capabilities: { ...release.value.capabilities, modules: ['dashboard', 'time_clock', 'tasks'] },
      },
    };
    const result = checkWorkerCompatibility({ client, profile, workerRelease: narrowRelease, contract });
    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join(' ')).toMatch(/does not support:.*variations/);
  });
});

describe('customer Worker provisioning', () => {
  let workspace;

  beforeEach(() => {
    workspace = cloneWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  const profileArgs = (workspace, profilePath = 'ops/worker/fixtures/wilson-construction.json') => [
    '--client-id', 'wilson-construction',
    '--display-name', 'Wilson Construction',
    '--profile', path.join(workspace, profilePath),
    '--worker-release', '1.1.0',
    '--target-release', '1.2.0',
    '--workspace', workspace,
    '--apply',
  ];

  it('provisions a new customer repeatedly without drift', () => {
    const first = runScript('worker-provision.mjs', profileArgs(workspace));
    expect(first.status).toBe(0);
    expect(first.json.status).toBe('PROVISIONED_AWAITING_EXTERNAL_ACTIONS');

    const entry = registry(workspace).clients.find((client) => client.clientId === 'wilson-construction');
    expect(entry.worker.profilePath).toBe('ops/worker/profiles/wilson-construction.json');
    expect(entry.worker.targetWorkerRelease).toBe('1.1.0');
    expect(entry.databaseProjectReference).toBe('supabase:wlsnconstruction0001');
    expect(fs.existsSync(path.join(workspace, 'ops/worker/profiles/wilson-construction.json'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, 'ops/worker/provisioning/wilson-construction.json'))).toBe(true);

    const second = runScript('worker-provision.mjs', profileArgs(workspace));
    expect(second.status).toBe(0);
    expect(second.json.status).toBe('ALREADY_PROVISIONED');

    // Re-provisioning is idempotent: registry bytes are unchanged.
    const before = fs.readFileSync(path.join(workspace, 'ops/clients.json'), 'utf8');
    runScript('worker-provision.mjs', profileArgs(workspace));
    expect(fs.readFileSync(path.join(workspace, 'ops/clients.json'), 'utf8')).toBe(before);
  });

  it('blocks provisioning that would share another customer environment', () => {
    const colliding = readJson(path.join(workspace, 'ops/worker/fixtures/wilson-construction.json'));
    colliding.environment.supabaseProjectRef = 'ibjyzpyuqupsxqakpzxj';
    writeJson(path.join(workspace, 'ops/worker/fixtures/wilson-collision.json'), colliding);

    const result = runScript(
      'worker-provision.mjs',
      profileArgs(workspace, 'ops/worker/fixtures/wilson-collision.json'),
    );
    expect(result.status).toBe(1);
    expect(result.json.status).toBe('BLOCKED');
    expect(result.json.errors.join(' ')).toMatch(/shares Supabase project ibjyzpyuqupsxqakpzxj/);
    expect(registry(workspace).clients.some((client) => client.clientId === 'wilson-construction')).toBe(false);
  });

  it('refuses to overwrite a customer profile with different content', () => {
    const directory = path.join(workspace, 'ops/worker/profiles');
    fs.writeFileSync(
      path.join(directory, 'wilson-construction.json'),
      `${JSON.stringify({ ...readJson(path.join(directory, 'client-alpha.json')), clientKey: 'wilson-construction' }, null, 2)}\n`,
    );
    const result = runScript('worker-provision.mjs', profileArgs(workspace));
    expect(result.status).toBe(1);
    expect(result.json.errors.join(' ')).toMatch(/refusing to overwrite customer customisation/);
  });
});

describe('controlled Worker upgrades', () => {
  let workspace;

  beforeEach(() => {
    workspace = cloneWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  const upgradeArgs = (extra = []) => ['--client', 'client-alpha', '--workspace', workspace, ...extra];

  it('records a compatible upgrade while preserving the customer profile', () => {
    const profilePath = path.join(workspace, 'ops/worker/profiles/client-alpha.json');
    const before = fs.readFileSync(profilePath, 'utf8');

    const current = readJson(path.join(workspace, 'ops/clients.json')).clients
      .find((client) => client.clientId === 'client-alpha').worker.targetWorkerRelease;
    const plan = runScript('worker-upgrade.mjs', upgradeArgs(['--to', current]));
    expect(plan.status).toBe(0);
    expect(plan.json.status).toBe('ALREADY_CURRENT');

    const downgrade = runScript('worker-upgrade.mjs', upgradeArgs(['--to', '1.0.0']));
    expect(downgrade.status).toBe(1);
    expect(downgrade.json.reason).toMatch(/Downgrade/);

    // Reset the customer to 1.0.0 to exercise a real 1.0.0 -> 1.1.0 upgrade.
    const registryValue = registry(workspace);
    registryValue.clients[0].worker.targetWorkerRelease = '1.0.0';
    writeJson(path.join(workspace, 'ops/clients.json'), registryValue);
    fs.rmSync(path.join(workspace, 'ops/worker/upgrades'), { recursive: true, force: true });

    const applied = runScript('worker-upgrade.mjs', upgradeArgs(['--to', '1.1.0', '--apply']));
    expect(applied.status).toBe(0);
    expect(applied.json.status).toBe('UPGRADE_RECORDED');
    expect(fs.readFileSync(profilePath, 'utf8')).toBe(before);

    const updated = registry(workspace).clients.find((client) => client.clientId === 'client-alpha');
    expect(updated.worker.targetWorkerRelease).toBe('1.1.0');
    expect(updated.worker.lastUpgrade).toMatchObject({ fromVersion: '1.0.0', toVersion: '1.1.0' });

    const record = readJson(path.join(workspace, 'ops/worker/upgrades/client-alpha/1.0.0__1.1.0.json'));
    expect(record.status).toBe('READY_FOR_CONTROLLED_UPGRADE');
    expect(record.preserved.customisationsIntact).toBe(true);
    expect(record.preserved.customisations.extensions).toEqual(['home-notice']);
    expect(record.approvals.customerDeployment).toBe('NOT_APPROVED');

    const repeated = runScript('worker-upgrade.mjs', upgradeArgs(['--to', '1.1.0', '--apply']));
    expect(repeated.status).toBe(0);
    expect(repeated.json.status).toBe('ALREADY_CURRENT');
  });

  it('blocks an upgrade whose target release drops an enabled customisation', () => {
    const releasePath = path.join(workspace, 'ops/worker/releases/1.1.0.json');
    const release = readJson(releasePath);
    release.capabilities = {
      ...release.capabilities,
      modules: release.capabilities.modules.filter((module) => module !== 'variations'),
    };
    writeJson(releasePath, release);

    const registryValue = registry(workspace);
    registryValue.clients[0].worker.targetWorkerRelease = '1.0.0';
    writeJson(path.join(workspace, 'ops/clients.json'), registryValue);
    fs.rmSync(path.join(workspace, 'ops/worker/upgrades'), { recursive: true, force: true });

    const blocked = runScript('worker-upgrade.mjs', upgradeArgs(['--to', '1.1.0', '--apply']));
    expect(blocked.status).toBe(1);
    expect(blocked.json.status).toBe('BLOCKED');
    expect(blocked.json.conflicts.join(' ')).toMatch(/does not support:.*variations/);

    const registryAfter = registry(workspace).clients.find((client) => client.clientId === 'client-alpha');
    expect(registryAfter.worker.targetWorkerRelease).toBe('1.0.0');
    const record = readJson(path.join(workspace, 'ops/worker/upgrades/client-alpha/1.0.0__1.1.0.json'));
    expect(record.status).toBe('BLOCKED');
    expect(record.preserved.customisationsIntact).toBe(true);
  });
});

describe('worker environment isolation', () => {
  it('accepts only the registered project for each customer', () => {
    const profiles = listWorkerProfiles(ROOT, contract);
    const alpha = profiles.find((entry) => entry.relativePath.endsWith('client-alpha.json'));
    const wilson = profiles.find((entry) => entry.relativePath.includes('wilson-construction'));
    for (const profile of [alpha, wilson]) {
      const ref = profile.config.environment.supabaseProjectRef;
      const binding = contract.resolveWorkerRuntimeEnvironment(profile.config, {
        supabaseUrl: `https://${ref}.supabase.co`,
      });
      expect(binding.ok).toBe(true);
      expect(binding.projectRef).toBe(ref);
    }
    expect(alpha.fingerprint).not.toBe(wilson.fingerprint);
    expect(contract.findWorkerIsolationConflicts(alpha.config, wilson.config)).toEqual([]);
  });
});

describe('worker profile contract', () => {
  it('rejects secrets, permissions and unknown fields in profiles', () => {
    const base = readJson(path.join(ROOT, 'ops/worker/profiles/client-alpha.json'));
    expect(() => contract.defineWorkerClientConfig({ ...base, permissions: ['variations.write'] })).toThrow(/unknown fields/);
    expect(() =>
      contract.defineWorkerClientConfig({
        ...base,
        environment: { ...base.environment, supabaseServiceRoleKey: 'x' },
      }),
    ).toThrow();
    expect(() =>
      contract.defineWorkerClientConfig({ ...base, identity: { ...base.identity, appName: 'sk-' + 'a'.repeat(20) } }),
    ).toThrow(/secret-like/);
  });

  it('keeps a stable fingerprint independent of key ordering', () => {
    const base = readJson(path.join(ROOT, 'ops/worker/profiles/client-alpha.json'));
    const reversed = Object.fromEntries(Object.entries(base).reverse());
    const left = crypto.createHash('sha256').update(contract.canonicalizeWorkerClientConfig(contract.defineWorkerClientConfig(base))).digest('hex');
    const right = crypto.createHash('sha256').update(contract.canonicalizeWorkerClientConfig(contract.defineWorkerClientConfig(reversed))).digest('hex');
    expect(left).toBe(right);
  });
});

describe("artifact lifecycle is separate from the release pin", () => {
  let workspace;
  beforeEach(() => {
    workspace = cloneWorkspace();
    // Lifecycle tests start from no recorded artifacts so ordering rules are
    // exercised deterministically, independent of committed Alpha evidence.
    fs.rmSync(path.join(workspace, 'ops/worker/distribution'), { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  const artifactArgs = (extra = []) => ['--client', 'client-alpha', '--workspace', workspace, ...extra];
  const targetRelease = () => readJson(path.join(workspace, 'ops/clients.json')).clients
    .find((client) => client.clientId === 'client-alpha').worker.targetWorkerRelease;

  it("does not claim a build, distribution or install from an upgrade pin change", () => {
    const record = readJson(path.join(workspace, 'ops/worker/upgrades/client-alpha/1.0.0__1.1.0.json'));
    expect(record.artifactState).toEqual({
      targetRelease: '1.1.0',
      builtRelease: null,
      distributedRelease: null,
      installedApplicationVersion: null,
      note: 'Control-plane target updated only. No binary was built, distributed or installed by this upgrade.',
    });
  });

  it("enforces build -> distribute -> install ordering with evidence", () => {
    const target = targetRelease();
    const distributeFirst = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'DISTRIBUTED', '--evidence', 'test store listing', '--apply',
    ]));
    expect(distributeFirst.status).toBe(1);
    expect(distributeFirst.json.reason).toMatch(/before a BUILT event/);

    const built = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'BUILT', '--channel', 'internal',
      '--evidence', 'eas build 11111111-1111-1111-1111-111111111111',
      '--artifact-sha256', 'a'.repeat(64), '--apply',
    ]));
    expect(built.status).toBe(0);
    expect(built.json.status).toBe('RECORDED');
    expect(built.json.artifactState.builtRelease).toBe(target);
    expect(built.json.artifactState.distributedRelease).toBeNull();

    const wrongRelease = runScript('worker-artifact.mjs', artifactArgs([
      '--release', '1.0.0', '--stage', 'DISTRIBUTED', '--evidence', 'should not distribute an old release', '--apply',
    ]));
    expect(wrongRelease.status).toBe(1);
    expect(wrongRelease.json.reason).toMatch(new RegExp(`customer target is ${target.replace(/\./g, '\\.')}`));

    const installedBeforeDistribute = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'INSTALLED', '--channel', 'internal', '--evidence', 'device observation', '--apply',
    ]));
    expect(installedBeforeDistribute.status).toBe(1);
    expect(installedBeforeDistribute.json.reason).toMatch(/DISTRIBUTED event/);

    const distributed = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'DISTRIBUTED', '--channel', 'internal',
      '--evidence', 'TestFlight build 42', '--apply',
    ]));
    expect(distributed.status).toBe(0);
    expect(distributed.json.artifactState.distributedRelease).toBe(target);

    const duplicate = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'DISTRIBUTED', '--channel', 'internal',
      '--evidence', 'TestFlight build 42', '--apply',
    ]));
    expect(duplicate.json.status).toBe('ALREADY_RECORDED');

    const installed = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'INSTALLED', '--channel', 'internal',
      '--evidence', `simulator observed Worker ${target}`, '--apply',
    ]));
    expect(installed.status).toBe(0);
    expect(installed.json.artifactState).toEqual({
      targetRelease: target,
      builtRelease: target,
      distributedRelease: target,
      installedRelease: target,
    });

    const record = readJson(path.join(workspace, 'ops/worker/distribution/client-alpha.json'));
    expect(record.events.map((event) => event.stage)).toEqual(['BUILT', 'DISTRIBUTED', 'INSTALLED']);
    expect(record.events.every((event) => event.evidence.length > 4)).toBe(true);
  });

  it("allows an explicitly local install observation without a distribution", () => {
    const target = targetRelease();
    const built = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'BUILT', '--evidence', 'local ios release build', '--apply',
    ]));
    expect(built.status).toBe(0);
    const installed = runScript('worker-artifact.mjs', artifactArgs([
      '--release', target, '--stage', 'INSTALLED', '--channel', 'local-simulator',
      '--evidence', 'installed on iPhone 17 Pro simulator', '--apply',
    ]));
    expect(installed.status).toBe(0);
    expect(installed.json.artifactState.installedRelease).toBe(target);
  });
});
