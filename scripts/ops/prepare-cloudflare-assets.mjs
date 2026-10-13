import fs from "node:fs/promises";
import path from "node:path";

const assetsRoot = path.resolve(process.cwd(), ".open-next/assets");
const maxBytes = 25 * 1024 * 1024;
const removed = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filePath);
    else {
      const stat = await fs.stat(filePath);
      if (stat.size > maxBytes) {
        await fs.rm(filePath);
        removed.push({ file: path.relative(assetsRoot, filePath), bytes: stat.size });
      }
    }
  }
}

await walk(assetsRoot);
console.log(JSON.stringify({
  status: "prepared",
  maxAssetBytes: maxBytes,
  excludedFromWorkerUpload: removed,
  note: "Large source assets remain in public/; deploy them through an external CDN/R2 path before enabling those URLs in Cloudflare.",
}, null, 2));
