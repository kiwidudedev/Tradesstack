import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Files initial bundle boundary", () => {
  it("does not eagerly import the upload implementation from the Files workspace", () => {
    const root = process.cwd();
    const workspace = fs.readFileSync(path.join(root, "components/app/files/FilesWorkspace.tsx"), "utf8");
    const lazyButton = fs.readFileSync(path.join(root, "components/app/files/LazyFileUploadButton.tsx"), "utf8");

    expect(workspace).not.toContain('from "@/components/app/files/FileUploadQueue"');
    expect(lazyButton).toContain("dynamic(");
    expect(lazyButton).toContain("setActivated(true)");
  });
});
