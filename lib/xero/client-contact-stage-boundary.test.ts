import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ACTIONS = "app/app/(workspace)/leads-clients/clients/[clientId]/actions.ts";
const PANEL = "app/app/(workspace)/leads-clients/clients/[clientId]/ClientXeroContactPanel.tsx";

describe("Stage 2 client Xero Contact boundary", () => {
  it("keeps authoritative identities out of the browser action contract", async () => {
    const actions = await readFile(ACTIONS, "utf8");
    expect(actions).toContain("importedContactId: string");
    expect(actions).toContain('"accounting.contacts.manage"');
    expect(actions).not.toMatch(/params:\s*\{[^}]*\b(contactId|tenantId|connectionId|organizationId):/s);
  });

  it("adds only client Contact UI and no later-stage workflow", async () => {
    const source = `${await readFile(ACTIONS, "utf8")}\n${await readFile(PANEL, "utf8")}`.toLowerCase();
    expect(source).toContain("xero contact");
    expect(source).not.toContain("accrec");
    expect(source).not.toContain("invoice payload");
    expect(source).not.toContain("payment polling");
    expect(source).not.toContain("pdf attachment");
    expect(source).not.toContain("claim readiness");
  });
});
