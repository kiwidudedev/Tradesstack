import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const proofRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(proofRoot, "../..");
const packageRoot = path.join(repositoryRoot, "packages/suppliers");
const artifactsRoot = path.join(proofRoot, ".artifacts/releases");
const versions = ["0.0.0-phase1m.1", "0.0.0-phase1m.2"];

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

fs.rmSync(artifactsRoot, { recursive: true, force: true });
fs.mkdirSync(artifactsRoot, { recursive: true });

const sourceManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
for (const version of versions) {
  const stagingRoot = path.join(artifactsRoot, "staging", version);
  const outputRoot = path.join(artifactsRoot, version);
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.cpSync(path.join(packageRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true });
  const releaseManifest = { ...sourceManifest, version };
  fs.writeFileSync(path.join(stagingRoot, "package.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`);

  const packOutput = execFileSync(
    "npm",
    ["pack", `./staging/${version}`, "--pack-destination", `./${version}`, "--json"],
    { cwd: artifactsRoot, encoding: "utf8" },
  );
  const packed = JSON.parse(packOutput)[0];
  const artifactPath = path.join(outputRoot, packed.filename);
  const metadata = {
    packageName: releaseManifest.name,
    version,
    artifactFilename: packed.filename,
    sha256: sha256(artifactPath),
    compressedSize: packed.size,
    unpackedSize: packed.unpackedSize,
    files: packed.files.map((file) => file.path).sort(),
    sourceGitSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    sourceWorkingTreeDirty: true,
    buildCommand: "npm --prefix packages/suppliers run build",
    publicApi: [
      "SupplierWriteInput",
      "ValidatedSupplierWriteInput",
      "SupplierValidationField",
      "SupplierValidationErrors",
      "SupplierPaymentTermsType",
      "SUPPLIER_PAYMENT_TERMS_TYPES",
      "SupplierValidationError",
      "normalizeSupplierWebsite",
      "validateSupplierWriteInput",
      "SupplierReference",
    ],
  };
  fs.writeFileSync(path.join(outputRoot, "release-manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify(metadata));
}
