import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { requireHostedTestCredentials } from "./hosted-test-credentials.mjs";

const files = [
  "scripts/run-stage6-hosted-cohort.mjs",
  "scripts/run-stage7-default-corpus.mjs",
  "scripts/verify-stage6-hosted-rollback.mjs",
  "tests/e2e/opportunity-promotion-stage6-hosted.spec.ts",
];
const fixtureEnv = {
  HOSTED_TEST_OWNER_EMAIL: "owner@example.invalid",
  HOSTED_TEST_OWNER_PASSWORD: " synthetic owner password ",
  HOSTED_TEST_MANAGER_EMAIL: "manager@example.invalid",
  HOSTED_TEST_MANAGER_PASSWORD: "synthetic manager password",
};
function source(file: string) { return readFileSync(file, "utf8"); }
function javascript(code: string) {
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
}
function prefix(file: string) {
  return javascript(source(file).split("const admin = createClient")[0].replace(/^import .*;\n/gm, ""));
}
function context(file: string, credentials: Record<string, string | undefined>) {
  const text = source(file);
  const project = text.match(/const EXPECTED_(?:PROJECT_REFERENCE|REFERENCE) = "([^"]+)"/)?.[1];
  return {
    URL, Date,
    process: { argv: ["node", file, file.includes("cohort") ? "cohort2" : "20"], env: {
      NEXT_PUBLIC_SUPABASE_URL: `https://${project ?? "fixture"}.example.invalid`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
      STAGE6_HOSTED_MUTATION_ACK: "I_ACKNOWLEDGE_STAGE6_HOSTED_DEVELOPMENT_MUTATIONS",
      STAGE7_HOSTED_MUTATION_ACK: "I_ACKNOWLEDGE_STAGE7_HOSTED_DEVELOPMENT_MUTATIONS",
    } },
    requireHostedTestCredentials: (role: "owner" | "manager") => requireHostedTestCredentials(role, credentials),
  };
}
function declaration(file: string, name: string) {
  const tree = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw new Error(`Missing test function: ${name}`);
  return javascript(fn.getText(tree));
}

describe("hosted test credentials", () => {
  for (const role of ["owner", "manager"] as const) {
    const key = `HOSTED_TEST_${role.toUpperCase()}`;
    for (const value of [undefined, "", "   "]) {
      it(`rejects missing/blank ${role} email and password without exposing another value (${String(value)})`, () => {
        expect(() => requireHostedTestCredentials(role, { ...fixtureEnv, [`${key}_EMAIL`]: value })).toThrow(`Missing required environment variable: ${key}_EMAIL`);
        expect(() => requireHostedTestCredentials(role, { ...fixtureEnv, [`${key}_PASSWORD`]: value })).toThrow(`Missing required environment variable: ${key}_PASSWORD`);
      });
    }
    it(`preserves the exact ${role} password`, () => {
      expect(requireHostedTestCredentials(role, fixtureEnv)).toEqual({ email: fixtureEnv[`${key}_EMAIL` as keyof typeof fixtureEnv], password: fixtureEnv[`${key}_PASSWORD` as keyof typeof fixtureEnv] });
    });
  }
  for (const file of files) {
    it(`${file} fails before creating a client if owner credentials are absent`, () => {
      const createClient = vi.fn(() => { throw new Error("Unexpected client creation"); });
      expect(() => vm.runInNewContext(prefix(file) + "\ncreateClient();", { ...context(file, {}), createClient })).toThrow("HOSTED_TEST_OWNER_EMAIL");
      expect(() => vm.runInNewContext(prefix(file) + "\ncreateClient();", { ...context(file, { ...fixtureEnv, HOSTED_TEST_OWNER_PASSWORD: "" }), createClient })).toThrow("HOSTED_TEST_OWNER_PASSWORD");
      expect(createClient).not.toHaveBeenCalled();
    });
    it(`${file} accepts supplied configuration and reaches its existing client boundary`, () => {
      const createClient = vi.fn();
      vm.runInNewContext(prefix(file) + "\ncreateClient();", { ...context(file, fixtureEnv), createClient });
      expect(createClient).toHaveBeenCalledOnce();
    });
  }
  for (const file of files.slice(0, 2)) {
    it(`${file} requires manager credentials before client creation`, () => {
      const createClient = vi.fn();
      expect(() => vm.runInNewContext(prefix(file) + "\ncreateClient();", { ...context(file, { ...fixtureEnv, HOSTED_TEST_MANAGER_PASSWORD: undefined }), createClient })).toThrow("HOSTED_TEST_MANAGER_PASSWORD");
      expect(createClient).not.toHaveBeenCalled();
    });
  }
  it("Stage 7 forwards each configured account to the existing sign-in call", async () => {
    const file = files[1];
    for (const role of ["owner", "manager"] as const) {
      const signInWithPassword = vi.fn(async () => ({ data: { user: { id: "fixture-user" } }, error: null }));
      const sandbox = { ...context(file, fixtureEnv), client: () => ({ auth: { signInWithPassword } }) };
      const rolePrefix = role.toUpperCase();
      await vm.runInNewContext(prefix(file) + declaration(file, "login") + `\nlogin(${rolePrefix}_EMAIL, ${rolePrefix}_PASSWORD, "fixture-user");`, sandbox);
      expect(signInWithPassword).toHaveBeenCalledWith(requireHostedTestCredentials(role, fixtureEnv));
    }
  });
  it("Stage 6 owner verification forwards configured credentials after its existing target checks", async () => {
    const file = files[0];
    const ownerId = source(file).match(/const OWNER_ID = "([^"]+)"/)![1];
    const signInWithPassword = vi.fn(async () => ({ data: { user: { id: ownerId } }, error: null }));
    const rows: Record<string, object> = {
      organizations: { name: "Supplier Invoice E2E Org" }, organization_members: { role: "owner" },
      opportunity_lifecycle_rollout_controls: { allowed_strategy: "promote_workspace_v1", creation_enabled: true, promotion_enabled: true, pilot_scope: "hosted_development_allowlist", pilot_environment: "hosted_development" },
    };
    const admin = { from: (table: string) => { const query = { select: () => query, eq: () => query, single: async () => ({ data: rows[table], error: null }) }; return query; } };
    await vm.runInNewContext(prefix(file) + declaration(file, "resultData") + declaration(file, "verifyTarget") + "\nverifyTarget();", { ...context(file, fixtureEnv), admin, actor: { auth: { signInWithPassword } } });
    expect(signInWithPassword).toHaveBeenCalledWith(requireHostedTestCredentials("owner", fixtureEnv));
  });
  it("rollback forwards configured credentials and stops at a mocked authentication boundary", async () => {
    const file = files[2];
    const signInWithPassword = vi.fn(async () => { throw new Error("MOCK_AUTH_BOUNDARY"); });
    const beforeAuth = source(file).replace(/^import .*;\n/gm, "").split("if (login.error")[0];
    await expect(vm.runInNewContext(`(async () => { ${beforeAuth} })()`, { ...context(file, fixtureEnv), createClient: () => ({ auth: { signInWithPassword } }) })).rejects.toThrow("MOCK_AUTH_BOUNDARY");
    expect(signInWithPassword).toHaveBeenCalledWith(requireHostedTestCredentials("owner", fixtureEnv));
  });
  it("hosted browser login fills the configured owner credentials", async () => {
    const file = files[3];
    const fillEmail = vi.fn(), fillPassword = vi.fn();
    const page = { goto: vi.fn(), url: () => "/login", getByLabel: (label: string) => ({ fill: label === "Password*" ? fillPassword : fillEmail }), getByRole: () => ({ click: vi.fn() }), waitForURL: vi.fn() };
    await vm.runInNewContext(prefix(file) + declaration(file, "login") + '\nlogin(page, "http://example.invalid");', { ...context(file, fixtureEnv), page });
    expect(fillEmail).toHaveBeenCalledWith(fixtureEnv.HOSTED_TEST_OWNER_EMAIL);
    expect(fillPassword).toHaveBeenCalledWith(fixtureEnv.HOSTED_TEST_OWNER_PASSWORD);
  });
  for (const exists of [false, true]) {
    it(`Stage 6 manager creation/login uses supplied credentials (existing=${exists})`, async () => {
      const file = files[0];
      const credentials = requireHostedTestCredentials("manager", fixtureEnv);
      const user = { id: "fixture-manager", email: credentials.email };
      const createUser = vi.fn(async () => ({ data: { user }, error: null }));
      const signInWithPassword = vi.fn(async () => ({ data: { user }, error: null }));
      const admin = {
        auth: { admin: { listUsers: async () => ({ data: { users: exists ? [user] : [] }, error: null }), createUser } },
        from: () => ({
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
          upsert: async () => ({ data: null, error: null }),
        }),
      };
      await vm.runInNewContext(prefix(file) + declaration(file, "resultData") + declaration(file, "ensureCohort2Actor") + "\nensureCohort2Actor();", {
        ...context(file, fixtureEnv), admin, createClient: () => ({ auth: { signInWithPassword } }),
      });
      if (exists) expect(createUser).not.toHaveBeenCalled();
      else expect(createUser).toHaveBeenCalledWith(expect.objectContaining(credentials));
      expect(signInWithPassword).toHaveBeenCalledWith(credentials);
    });
  }

  it("Stage 6 cohort1 does not require unused manager credentials", () => {
    const file = files[0];
    const sandbox = context(file, {
      HOSTED_TEST_OWNER_EMAIL: fixtureEnv.HOSTED_TEST_OWNER_EMAIL,
      HOSTED_TEST_OWNER_PASSWORD: fixtureEnv.HOSTED_TEST_OWNER_PASSWORD,
    });
    sandbox.process.argv[2] = "cohort1";
    const createClient = vi.fn();
    vm.runInNewContext(prefix(file) + "\ncreateClient();", { ...sandbox, createClient });
    expect(createClient).toHaveBeenCalledOnce();
  });

});
