#!/usr/bin/env node
/**
 * Record the real artifact lifecycle of a customer Worker App.
 *
 * The control-plane release pin says which release a customer is *targeting*.
 * It must never imply that a binary was built, distributed or installed. This
 * tool records those distinct events, append-only, with evidence:
 *
 *   TARGET (ops/clients.json worker.targetWorkerRelease)
 *     -> BUILT      (a customer-specific binary exists)
 *     -> DISTRIBUTED (it was published to a channel)
 *     -> INSTALLED  (an installed application version was observed)
 *
 * Usage:
 *   node scripts/ops/worker-artifact.mjs --client client-alpha --release 1.1.0 \
 *     --stage BUILT --channel internal --evidence "EAS build <id>" [--artifact-sha256 <sha>] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, semver } from './lib.mjs';
import { workerPaths } from './worker-contract.mjs';

const STAGES = ['BUILT', 'DISTRIBUTED', 'INSTALLED'];
const options = { apply: false };
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--apply') options.apply = true;
  else if (argument === '--plan') options.apply = false;
  else if (argument.startsWith('--')) options[argument.slice(2)] = process.argv[++index];
}

const dataRoot = options.workspace ? path.resolve(ROOT, options.workspace) : ROOT;
const paths = workerPaths(dataRoot);
const registryPath = path.join(dataRoot, 'ops/clients.json');

function fail(reason, details = []) {
  console.log(JSON.stringify({ status: 'BLOCKED', reason, details }, null, 2));
  process.exit(1);
}

if (!options.client) fail('--client is required');
if (!options.release || !semver(options.release)) fail('--release MAJOR.MINOR.PATCH is required');
if (!STAGES.includes(options.stage)) fail(`--stage must be one of ${STAGES.join(', ')}`);
if (!options.evidence || String(options.evidence).trim().length < 4) {
  fail('--evidence is required (for example a build id, store listing reference or install observation)');
}
if (options["artifact-sha256"] && !/^[0-9a-f]{64}$/i.test(options["artifact-sha256"])) {
  fail('--artifact-sha256 must be a SHA-256 hex digest');
}

const registry = readJson(registryPath);
const client = (registry.clients ?? []).find((entry) => entry.clientId === options.client);
if (!client) fail(`Unknown client: ${options.client}`);
if (!client.worker) fail(`Client ${options.client} has no Worker binding`);

const releaseFile = path.join(paths.releases, `${options.release}.json`);
if (!fs.existsSync(releaseFile)) fail(`Worker release ${options.release} does not exist`);
const release = readJson(releaseFile);
if (release.status !== 'APPROVED' || release.releaseType !== 'OFFICIAL') {
  fail(`Worker release ${options.release} is not an approved official release`);
}

const recordPath = path.join(paths.directory, 'distribution', `${client.clientId}.json`);
const existing = fs.existsSync(recordPath) ? readJson(recordPath) : {
  schemaVersion: 1,
  clientId: client.clientId,
  events: [],
};
const events = existing.events ?? [];

const channel = options.channel ?? client.worker.distributionChannel ?? 'internal';
const previousStage = (stage) => events
  .filter((event) => event.release === options.release && event.stage === stage)
  .at(-1) ?? null;

if (options.stage === 'DISTRIBUTED' && client.worker.targetWorkerRelease !== options.release) {
  fail(`Cannot distribute ${options.release}: the customer target is ${client.worker.targetWorkerRelease}`);
}
if (options.stage !== 'BUILT' && !previousStage('BUILT')) {
  fail(`Cannot record ${options.stage} for ${options.release} before a BUILT event for the same release`);
}
if (options.stage === 'INSTALLED' && !previousStage('DISTRIBUTED') && !String(channel).startsWith('local')) {
  fail('INSTALLED requires a DISTRIBUTED event for the same release, or a local-only channel');
}

const duplicate = events.find(
  (event) => event.release === options.release
    && event.stage === options.stage
    && event.channel === channel
    && event.evidence === String(options.evidence).trim(),
);
const event = duplicate ?? {
  eventId: `${client.clientId}-${options.release}-${options.stage.toLowerCase()}-${events.length + 1}`,
  stage: options.stage,
  release: options.release,
  releaseFingerprint: release.releaseFingerprint,
  channel,
  artifactSha256: options["artifact-sha256"] ?? null,
  evidence: String(options.evidence).trim(),
  recordedAt: new Date().toISOString(),
  recordedBy: 'scripts/ops/worker-artifact.mjs',
};

const summary = {
  clientId: client.clientId,
  stage: options.stage,
  release: options.release,
  channel,
  duplicate: Boolean(duplicate),
  recordPath: path.relative(dataRoot, recordPath),
  target: client.worker.targetWorkerRelease,
  artifactState: {
    targetRelease: client.worker.targetWorkerRelease,
    builtRelease: previousStage('BUILT')?.release ?? null,
    distributedRelease: previousStage('DISTRIBUTED')?.release ?? null,
    installedRelease: previousStage('INSTALLED')?.release ?? null,
  },
  event,
};

if (!options.apply) {
  console.log(JSON.stringify({ status: duplicate ? 'ALREADY_RECORDED' : 'PLAN_ONLY', ...summary }, null, 2));
  process.exit(0);
}
if (duplicate) {
  console.log(JSON.stringify({ status: 'ALREADY_RECORDED', ...summary }, null, 2));
  process.exit(0);
}

const next = {
  ...existing,
  schemaVersion: 1,
  clientId: client.clientId,
  events: [...events, event],
  artifactState: {
    targetRelease: client.worker.targetWorkerRelease,
    builtRelease: [...events, event].filter((item) => item.stage === 'BUILT').at(-1)?.release ?? null,
    distributedRelease: [...events, event].filter((item) => item.stage === 'DISTRIBUTED').at(-1)?.release ?? null,
    installedRelease: [...events, event].filter((item) => item.stage === 'INSTALLED').at(-1)?.release ?? null,
  },
};
fs.mkdirSync(path.dirname(recordPath), { recursive: true });
fs.writeFileSync(recordPath, `${JSON.stringify(next, null, 2)}\n`);

console.log(JSON.stringify({
  status: 'RECORDED',
  ...summary,
  artifactState: next.artifactState,
}, null, 2));
