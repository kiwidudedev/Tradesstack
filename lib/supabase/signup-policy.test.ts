import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function read(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

function tomlSection(config: string, header: string) {
  const lines = config.split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${header}]`);
  if (start < 0) return "";
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    section.push(line);
  }
  return section.join("\n");
}

describe("dedicated customer application signup policy", () => {
  it("disables public signups in the Supabase Auth baseline", async () => {
    const config = await read("supabase/config.toml");
    const authSection = tomlSection(config, "auth");
    const emailSection = tomlSection(config, "auth.email");

    expect(authSection).toMatch(/enable_signup\s*=\s*false/);
    expect(emailSection).toMatch(/enable_signup\s*=\s*false/);
    expect(authSection).not.toMatch(/enable_signup\s*=\s*true/);
  });

  it("does not call the public Supabase sign-up endpoint from application code", async () => {
    const files = [
      "hooks/use-auth.ts",
      "components/auth/LoginShowcasePanel.tsx",
      "components/auth/RegisterShowcasePanel.tsx",
      "app/register/actions.ts",
    ];

    for (const file of files) {
      const source = await read(file);
      expect(source, file).not.toMatch(/auth\.signUp\s*\(/);
    }
  });

  it("requires an invitation for the only account-creation route", async () => {
    const page = await read("app/register/page.tsx");
    const actions = await read("app/register/actions.ts");

    expect(page).toContain('redirect("/login")');
    expect(actions).toContain("organization_invites");
    expect(actions).toContain("createUser");
    expect(actions).toContain("token");
  });
});
