#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  args.set(value.slice(2), process.argv[index + 1] ?? "");
  index += 1;
}

const required = ["source-copy", "expected-project-id", "api-port", "db-port"];
const missing = required.filter((key) => !args.get(key));
if (missing.length) {
  console.error(`ABORT: missing required guard arguments: ${missing.join(", ")}`);
  process.exit(2);
}

const sourceCopy = path.resolve(args.get("source-copy"));
const configPath = path.join(sourceCopy, "supabase", "config.toml");
const expectedProjectId = args.get("expected-project-id");
const expectedApiPort = Number(args.get("api-port"));
const expectedDbPort = Number(args.get("db-port"));
const expectedStudioPort = args.get("studio-port") || "unknown";
const protectedProjectId = args.get("protected-project-id") || "Tradesstack-ai";
const protectedPorts = new Set(
  (args.get("protected-ports") || "54321,54322,54323")
    .split(",")
    .map((value) => value.trim()),
);
const marker = args.get("marker") || expectedProjectId;

function readConfigValue(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*[\\\"]([^\\\"]+)[\\\"]`, "m"));
  return match?.[1] ?? null;
}

function readSectionPort(text, section) {
  const sectionText = text.match(new RegExp(`\\[${section}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1] ?? "";
  return sectionText.match(/^port\s*=\s*(\d+)/m)?.[1] ?? null;
}

function dockerNames(kind, filter) {
  try {
    return execFileSync("docker", [kind, "--filter", `label=com.supabase.cli.project=${filter}`, "--format", "{{.Names}}"], { encoding: "utf8" })
      .trim()
      .split("\\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

const failures = [];
const checks = [];
const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
const projectId = readConfigValue(configText, "project_id");
const apiPort = readSectionPort(configText, "api");
const dbPort = readSectionPort(configText, "db");
const targetPorts = [apiPort, dbPort, expectedStudioPort].filter(Boolean);

function check(label, condition, detail) {
  checks.push(`${condition ? "PASS" : "FAIL"} ${label}: ${detail}`);
  if (!condition) failures.push(`${label}: ${detail}`);
}

check("source copy", fs.existsSync(sourceCopy), sourceCopy);
check("Supabase config", fs.existsSync(configPath), configPath);
check("disposable marker", expectedProjectId === marker && projectId === marker, `expected=${expectedProjectId}, config=${projectId}, marker=${marker}`);
check("project identity", projectId === expectedProjectId && projectId !== protectedProjectId, `target=${projectId}, protected=${protectedProjectId}`);
check("API port", apiPort === String(expectedApiPort), `target=${apiPort}, expected=${expectedApiPort}`);
check("DB port", dbPort === String(expectedDbPort), `target=${dbPort}, expected=${expectedDbPort}`);
check("ports differ from protected local", targetPorts.every((port) => !protectedPorts.has(String(port))), `target=${targetPorts.join(",")}, protected=${[...protectedPorts].join(",")}`);
check("database host", (args.get("db-host") || "127.0.0.1") === "127.0.0.1", `host=${args.get("db-host") || "127.0.0.1"}`);

const targetContainers = dockerNames("ps", expectedProjectId);
const protectedContainers = dockerNames("ps", protectedProjectId);
if (targetContainers.length) {
  check("Docker target identity", targetContainers.every((name) => name.toLowerCase().includes(expectedProjectId.toLowerCase())), targetContainers.join(","));
  check("Docker protected separation", !targetContainers.some((name) => protectedContainers.includes(name)), `target=${targetContainers.join(",")}`);
}

console.log(`Current working directory: ${process.cwd()}`);
console.log(`Source-copy path: ${sourceCopy}`);
console.log(`Supabase project/config path: ${configPath}`);
console.log(`Supabase project ID: ${projectId ?? "unknown"}`);
console.log(`API port: ${apiPort ?? "unknown"}`);
console.log(`DB port: ${dbPort ?? "unknown"}`);
console.log(`Studio port: ${expectedStudioPort}`);
console.log(`Database host: ${args.get("db-host") || "127.0.0.1"}`);
console.log(`Docker target containers: ${targetContainers.join(",") || "not running"}`);
console.log(`Docker protected containers: ${protectedContainers.join(",") || "not running"}`);
console.log(`Expected disposable marker: ${marker}`);
console.log(`Active local TradesStack ports: ${[...protectedPorts].join(",")}`);
checks.forEach((line) => console.log(line));

if (failures.length) {
  console.error(`ABORT: disposable target verification failed (${failures.join("; ")})`);
  process.exit(1);
}
console.log("DISPOSABLE TARGET VERIFIED");
