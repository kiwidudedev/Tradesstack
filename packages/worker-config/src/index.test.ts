import { describe, expect, it } from "vitest";
import {
  canonicalizeWorkerClientConfig,
  defineWorkerClientConfig,
  findWorkerIsolationConflicts,
  inspectPublicSupabaseKey,
  isSecretLikeWorkerConfigValue,
  resolveWorkerNavigation,
  resolveWorkerRuntimeEnvironment,
  validateWorkerEnvironment,
  WORKER_CAPABILITIES,
  WORKER_MODULES,
  WORKER_TABS,
  WORKER_TAB_MODULES,
  WorkerConfigValidationError,
  type WorkerClientConfig,
} from "./index";

function alphaProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    clientKey: "client-alpha",
    identity: {
      appName: "Alpha Worker",
      slug: "client-alpha-worker",
      scheme: "alphaworker",
      description: "Fictional Alpha profile",
    },
    distribution: {
      channel: "internal",
      iosBundleIdentifier: "com.tradesstack.worker.clientalpha",
      androidPackage: "com.tradesstack.worker.clientalpha",
      updateChannel: "client-alpha",
    },
    environment: {
      kind: "hosted",
      environmentId: "client-alpha-hosted",
      displayLabel: "Client Alpha",
      supabaseProjectRef: "ibjyzpyuqupsxqakpzxj",
    },
    branding: {
      platformColor: "#123456",
      actionColor: "#D9480F",
      splashBackgroundColor: "#FFFFFF",
    },
    modules: {
      dashboard: true,
      time_clock: true,
      tasks: true,
      purchase_orders: true,
      variations: true,
    },
    navigation: {
      tabs: ["dashboard", "time_clock", "tasks", "purchase_orders", "variations", "settings"],
      quickActions: [
        { id: "create-todo", label: "Create a To Do", target: "tasks" },
        { id: "create-po", label: "Create a PO", target: "purchase_orders" },
      ],
    },
    features: { notifications: false },
    extensions: {
      "home-notice": {
        enabled: true,
        config: { title: "Alpha environment", body: "Connected to Client Alpha only." },
      },
    },
    ...overrides,
  };
}

function betaProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...alphaProfile(),
    clientKey: "client-beta",
    identity: {
      appName: "Beta Worker",
      slug: "client-beta-worker",
      scheme: "betaworker",
    },
    distribution: {
      channel: "store",
      iosBundleIdentifier: "com.tradesstack.worker.clientbeta",
      androidPackage: "com.tradesstack.worker.clientbeta",
      updateChannel: "client-beta",
    },
    environment: {
      kind: "hosted",
      environmentId: "client-beta-hosted",
      displayLabel: "Client Beta",
      supabaseProjectRef: "abcdefghij0123456789",
    },
    extensions: {},
    ...overrides,
  };
}

describe("worker client configuration contract", () => {
  it("resolves a valid customer profile without changing its meaning", () => {
    const config = defineWorkerClientConfig(alphaProfile());
    expect(config.clientKey).toBe("client-alpha");
    expect(config.identity.scheme).toBe("alphaworker");
    expect(config.environment.kind).toBe("hosted");
    expect(config.modules.variations).toBe(true);
    expect(config.features.notifications).toBe(false);
    expect(config.extensions?.["home-notice"]?.enabled).toBe(true);
    expect(Object.isFrozen(config)).toBe(false);
  });

  it("rejects unknown top-level, nested and extension fields", () => {
    expect(() => defineWorkerClientConfig(alphaProfile({ permissions: {} }))).toThrow(
      WorkerConfigValidationError,
    );
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({
          environment: {
            kind: "hosted",
            environmentId: "client-alpha-hosted",
            displayLabel: "Client Alpha",
            supabaseProjectRef: "ibjyzpyuqupsxqakpzxj",
            databasePassword: "not-allowed",
          },
        }),
      ),
    ).toThrow(/databasePassword/);
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({
          extensions: { "home-notice": { enabled: true, config: { title: "x", body: "y", color: "#fff" } } },
        }),
      ),
    ).toThrow(/unknown fields/);
  });

  it("rejects secret-shaped field names and values", () => {
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({
          environment: {
            kind: "hosted",
            environmentId: "client-alpha-hosted",
            displayLabel: "Client Alpha",
            supabaseProjectRef: "ibjyzpyuqupsxqakpzxj",
            supabaseServiceRoleKey: "anything",
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      defineWorkerClientConfig(alphaProfile({ clientKey: "sk-proj-abcdefghijklmnopqrstuvwx" })),
    ).toThrow(/secret-like|invalid value/);
    expect(isSecretLikeWorkerConfigValue({ note: "-----BEGIN PRIVATE KEY-----" })).toBe(true);
    expect(isSecretLikeWorkerConfigValue({ note: "TradesStack" })).toBe(false);
  });

  it("fails closed when a navigation target references a disabled module", () => {
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({
          modules: {
            dashboard: true,
            time_clock: true,
            tasks: true,
            purchase_orders: false,
            variations: true,
          },
        }),
      ),
    ).toThrow(/requires module purchase_orders to be enabled|modules\.purchase_orders is disabled/);
  });

  it("requires dashboard and settings tabs and explicit feature declarations", () => {
    expect(() =>
      defineWorkerClientConfig(alphaProfile({ navigation: { tabs: ["tasks", "settings"], quickActions: [] } })),
    ).toThrow(/dashboard/);
    expect(() =>
      defineWorkerClientConfig(alphaProfile({ navigation: { tabs: ["dashboard", "tasks"], quickActions: [] } })),
    ).toThrow(/settings/);
    expect(() => defineWorkerClientConfig(alphaProfile({ features: {} }))).toThrow(
      /features\.notifications/,
    );
  });

  it("requires explicit module declarations and a usable dashboard", () => {
    expect(() => defineWorkerClientConfig(alphaProfile({ modules: { dashboard: true } }))).toThrow(
      /modules\.time_clock/,
    );
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({
          modules: {
            dashboard: false,
            time_clock: true,
            tasks: true,
            purchase_orders: true,
            variations: true,
          },
        }),
      ),
    ).toThrow(/modules\.dashboard/);
  });

  it("rejects asset paths that escape the application root", () => {
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({ branding: { ...alphaProfile().branding as object, iconPath: "assets/../../secret.png" } }),
      ),
    ).toThrow();
    expect(() =>
      defineWorkerClientConfig(
        alphaProfile({ branding: { ...alphaProfile().branding as object, logoPath: "/etc/logo.png" } }),
      ),
    ).toThrow();
  });

  it("produces a stable canonical string for fingerprints regardless of key order", () => {
    const first = canonicalizeWorkerClientConfig(defineWorkerClientConfig(alphaProfile()));
    const reordered = Object.fromEntries(Object.entries(alphaProfile()).reverse());
    const second = canonicalizeWorkerClientConfig(defineWorkerClientConfig(reordered));
    expect(first).toBe(second);
    const different = canonicalizeWorkerClientConfig(
      defineWorkerClientConfig(alphaProfile({ clientKey: "client-other" })),
    );
    expect(first).not.toBe(different);
  });
});

describe("worker environment binding", () => {
  const config = defineWorkerClientConfig(alphaProfile());

  it("accepts the declared Supabase project and derives the functions URL", () => {
    const binding = validateWorkerEnvironment(config, {
      supabaseUrl: "https://ibjyzpyuqupsxqakpzxj.supabase.co",
    });
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    expect(binding.projectRef).toBe("ibjyzpyuqupsxqakpzxj");
    expect(binding.functionsUrl).toBe("https://ibjyzpyuqupsxqakpzxj.supabase.co/functions/v1");
  });

  it("blocks a build pointed at another customer's project", () => {
    const binding = validateWorkerEnvironment(config, {
      supabaseUrl: "https://abcdefghij0123456789.supabase.co",
    });
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.errors.join(" ")).toMatch(/does not match the profile environment host/);
  });

  it("blocks non-https, credential-bearing and path-bearing URLs", () => {
    expect(
      validateWorkerEnvironment(config, { supabaseUrl: "http://ibjyzpyuqupsxqakpzxj.supabase.co" }).ok,
    ).toBe(false);
    expect(
      validateWorkerEnvironment(config, {
        supabaseUrl: "https://user:pass@ibjyzpyuqupsxqakpzxj.supabase.co",
      }).ok,
    ).toBe(false);
    expect(
      validateWorkerEnvironment(config, {
        supabaseUrl: "https://ibjyzpyuqupsxqakpzxj.supabase.co/rest/v1",
      }).ok,
    ).toBe(false);
  });

  it("blocks a functions URL that is not same-origin with Supabase", () => {
    const binding = validateWorkerEnvironment(config, {
      supabaseUrl: "https://ibjyzpyuqupsxqakpzxj.supabase.co",
      functionsUrl: "https://attacker.example/functions/v1",
    });
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.errors.join(" ")).toMatch(/same-origin/);
  });

  it("requires loopback hosts for local development profiles", () => {
    const local = defineWorkerClientConfig({
      ...alphaProfile(),
      environment: {
        kind: "local",
        environmentId: "client-alpha-local",
        displayLabel: "Client Alpha (local)",
      },
    });
    expect(validateWorkerEnvironment(local, { supabaseUrl: "http://127.0.0.1:54321" }).ok).toBe(true);
    expect(validateWorkerEnvironment(local, { supabaseUrl: "http://localhost:54321" }).ok).toBe(true);
    expect(validateWorkerEnvironment(local, { supabaseUrl: "https://ibjyzpyuqupsxqakpzxj.supabase.co" }).ok).toBe(
      false,
    );
  });

  it("reports a missing runtime environment instead of falling back", () => {
    const binding = resolveWorkerRuntimeEnvironment(config, {});
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.errors[0]).toMatch(/EXPO_PUBLIC_SUPABASE_URL/);
  });
});

describe("worker navigation and capabilities", () => {
  const config = defineWorkerClientConfig(alphaProfile());

  it("exposes everything the profile enables when the server grants capabilities", () => {
    const navigation = resolveWorkerNavigation(config, {
      can_view_dashboard: true,
      can_view_tasks: true,
      can_clock_time: true,
      can_view_purchase_orders: true,
    });
    expect(navigation.tabs).toEqual(["dashboard", "time_clock", "tasks", "purchase_orders", "variations", "settings"]);
    expect(navigation.quickActions.map((action) => action.id)).toEqual(["create-todo", "create-po"]);
    expect(navigation.withheldModules).toEqual([]);
  });

  it("only reduces surface area when the server withholds capabilities", () => {
    const navigation = resolveWorkerNavigation(config, {
      can_view_dashboard: true,
      can_view_tasks: false,
      can_clock_time: false,
      can_view_purchase_orders: false,
    });
    expect(navigation.tabs).toEqual(["dashboard", "variations", "settings"]);
    expect(navigation.quickActions).toEqual([]);
    expect(navigation.withheldModules).toEqual(
      expect.arrayContaining(["time_clock", "tasks", "purchase_orders"]),
    );
    expect(navigation.withheldModules).not.toContain("variations");
  });

  it("returns the home notice only when the extension is enabled", () => {
    expect(resolveWorkerNavigation(config).notice?.title).toBe("Alpha environment");
    const withoutExtension = defineWorkerClientConfig(alphaProfile({ extensions: {} }));
    expect(resolveWorkerNavigation(withoutExtension).notice).toBeNull();
  });
});

describe("customer isolation", () => {
  it("accepts two independently configured customers", () => {
    const alpha = defineWorkerClientConfig(alphaProfile());
    const beta = defineWorkerClientConfig(betaProfile());
    expect(findWorkerIsolationConflicts(alpha, beta)).toEqual([]);
  });

  it("rejects shared environment, bundle identifiers and channels", () => {
    const alpha = defineWorkerClientConfig(alphaProfile());
    const clashing = defineWorkerClientConfig(
      betaProfile({
        distribution: {
          channel: "internal",
          iosBundleIdentifier: "com.tradesstack.worker.clientalpha",
          androidPackage: "com.tradesstack.worker.clientalpha",
          updateChannel: "client-alpha",
        },
        environment: {
          kind: "hosted",
          environmentId: "client-alpha-hosted",
          displayLabel: "Clashing",
          supabaseProjectRef: "ibjyzpyuqupsxqakpzxj",
        },
        identity: { appName: "Clashing Worker", slug: "clashing-worker", scheme: "alphaworker" },
      }),
    );
    const conflicts = findWorkerIsolationConflicts(alpha, clashing);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        "duplicate environmentId client-alpha-hosted",
        "duplicate supabaseProjectRef ibjyzpyuqupsxqakpzxj",
        "duplicate iosBundleIdentifier com.tradesstack.worker.clientalpha",
        "duplicate androidPackage com.tradesstack.worker.clientalpha",
        "duplicate scheme alphaworker",
        "duplicate updateChannel client-alpha",
      ]),
    );
  });
});

describe("capability registry", () => {
  it("stays internally consistent", () => {
    expect(WORKER_CAPABILITIES.modules).toEqual(WORKER_MODULES);
    expect(WORKER_CAPABILITIES.tabs).toEqual(WORKER_TABS);
    expect(WORKER_CAPABILITIES.schemaVersion).toBe(1);
    expect(WORKER_CAPABILITIES.mobileApiContractVersion).toBe(2);
    const config: WorkerClientConfig = defineWorkerClientConfig(alphaProfile());
    for (const tab of config.navigation.tabs) {
      expect(WORKER_TABS).toContain(tab);
      expect(WORKER_TAB_MODULES[tab]).not.toBeUndefined();
    }
    for (const module of WORKER_MODULES) {
      expect(typeof config.modules[module]).toBe("boolean");
    }
  });
});

describe("public Supabase credentials", () => {
  function jwt(payload: Record<string, unknown>) {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
  }

  it("accepts an anon JWT and a publishable key", () => {
    expect(inspectPublicSupabaseKey(jwt({ role: "anon", iss: "https://project.supabase.co/auth/v1" })).ok).toBe(true);
    expect(inspectPublicSupabaseKey("sb_publishable_example").ok).toBe(true);
  });

  it("rejects service-role and secret keys embedded in a mobile build", () => {
    const service = inspectPublicSupabaseKey(jwt({ role: "service_role" }));
    expect(service.ok).toBe(false);
    if (service.ok) return;
    expect(service.errors[0]).toMatch(/service_role/);

    const secret = inspectPublicSupabaseKey("sb_secret_abcdefghijkl");
    expect(secret.ok).toBe(false);

    expect(inspectPublicSupabaseKey(undefined).ok).toBe(false);
    expect(inspectPublicSupabaseKey("not-a-jwt").ok).toBe(false);
    expect(inspectPublicSupabaseKey(jwt({ role: "authenticated" })).ok).toBe(false);
  });
});

describe("display defaults", () => {
  it("accepts validated locale, currency and timezone defaults", () => {
    const config = defineWorkerClientConfig(
      alphaProfile({ defaults: { locale: "en-AU", currency: "AUD", timezone: "Australia/Sydney" } }),
    );
    expect(config.defaults).toEqual({ locale: "en-AU", currency: "AUD", timezone: "Australia/Sydney" });
  });

  it("rejects invalid or unknown defaults", () => {
    expect(() =>
      defineWorkerClientConfig(alphaProfile({ defaults: { locale: "en-NZ", currency: "nzd", timezone: "Pacific/Auckland" } })),
    ).toThrow(/defaults\.currency/);
    expect(() =>
      defineWorkerClientConfig(alphaProfile({ defaults: { locale: "en-NZ", currency: "NZD", timezone: "Mars/Olympus" } })),
    ).toThrow(/defaults\.timezone/);
    expect(() =>
      defineWorkerClientConfig(alphaProfile({ defaults: { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland", taxRate: 0.15 } })),
    ).toThrow(/unknown fields/);
  });

  it("includes defaults in the canonical fingerprint", () => {
    const withDefaults = defineWorkerClientConfig(alphaProfile({ defaults: { locale: "en-NZ", currency: "NZD", timezone: "Pacific/Auckland" } }));
    const withoutDefaults = defineWorkerClientConfig(alphaProfile());
    expect(canonicalizeWorkerClientConfig(withDefaults)).not.toBe(canonicalizeWorkerClientConfig(withoutDefaults));
  });
});
