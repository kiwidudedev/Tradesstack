import crypto from "node:crypto";
import fs from "node:fs/promises";
import { assembleOperationalContract, validateOperationalContract } from "./control-plane-contract.mjs";

const repository = process.env.CONTROL_PLANE_CONTRACT_REPOSITORY;
const token = process.env.CONTROL_PLANE_ARTIFACT_TOKEN ?? process.env.GH_TOKEN;
const path = process.env.CONTROL_PLANE_CONTRACT_PATH ?? "control-plane-contract.json";

if (!repository) throw new Error("CONTROL_PLANE_CONTRACT_REPOSITORY is required");
if (!token) throw new Error("CONTROL_PLANE_ARTIFACT_TOKEN is required");

const contract = assembleOperationalContract();
const errors = validateOperationalContract(contract);
if (errors.length) throw new Error(`Control Plane contract invalid: ${errors.join("; ")}`);

const generatedAt = new Date().toISOString();
const payload = JSON.stringify(contract);
const envelope = {
  contract,
  generatedAt,
  sourceSha: contract.main.currentHead.value,
  contentDigest: crypto.createHash("sha256").update(payload).digest("hex"),
};
const body = Buffer.from(JSON.stringify(envelope, null, 2));
const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
};

const existing = await fetch(`${apiBase}/contents/${path}`, { headers });
let existingSha;
if (existing.ok) existingSha = (await existing.json()).sha;
else if (existing.status !== 404) throw new Error(`Unable to inspect hosted contract (${existing.status})`);

const response = await fetch(`${apiBase}/contents/${path}`, {
  method: "PUT",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({
    message: "publish: update Control Plane operational contract",
    content: body.toString("base64"),
    branch: "main",
    ...(existingSha ? { sha: existingSha } : {}),
  }),
});
if (!response.ok) throw new Error(`Unable to publish hosted contract (${response.status})`);

console.log(JSON.stringify({
  published: true,
  repository,
  path,
  sourceSha: contract.main.currentHead.value,
  generatedAt,
  bodyDigest: crypto.createHash("sha256").update(body).digest("hex"),
  customerCount: contract.customers.length,
}));
