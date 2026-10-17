/**
 * @tradesstack/worker-config
 *
 * Portable, dependency-free contract for dedicated TradesStack Worker App
 * implementations.
 *
 * This package is the single authority for:
 *   - which Worker App configuration fields exist and which are allowed;
 *   - which modules, navigation targets, feature flags and extensions the
 *     Worker App core currently supports;
 *   - whether a resolved configuration may be enabled for a given customer;
 *   - whether the compiled Supabase environment binding is the one the
 *     customer profile declares.
 *
 * Design rules enforced here (see docs/architecture/TRADESSTACK_WORKER_APP_ARCHITECTURE.md):
 *   1. Configuration only. No permissions, roles, workflow rules, SQL or
 *      source code are configurable.
 *   2. Fail closed. Unknown fields, unknown modules and secret-shaped values
 *      are rejected rather than ignored.
 *   3. No two customers can resolve to the same environment identity, app
 *      identity or bundle identifier.
 *   4. This package has no Node, React, React Native, Expo or Supabase
 *      dependency so it can be vendored into the Worker App repository and
 *      executed both at build time (Node) and at runtime (Hermes/JSC/web).
 */
export declare const WORKER_CONFIG_PACKAGE_VERSION: "0.0.0";
export declare const WORKER_CONFIG_SCHEMA_VERSION: 1;
/**
 * Version of the Worker App configuration/application contract. Bumped when
 * the shape or meaning of the profile changes incompatibly.
 */
export declare const WORKER_APP_CONTRACT_VERSION: "1";
/**
 * Version of the mobile API contract (Supabase Edge Functions and mobile RPCs)
 * that the Worker App core is built against. Independent of the web release,
 * the Worker App release and the database migration target, but validated
 * against them by the Main release tooling.
 */
export declare const MOBILE_API_CONTRACT_VERSION: 2;
export declare const WORKER_MODULES: readonly ["dashboard", "time_clock", "tasks", "purchase_orders", "variations"];
export type WorkerModule = (typeof WORKER_MODULES)[number];
/**
 * Bootstrap capability keys returned by `mobile_app_bootstrap`. A module is
 * only visible when the profile enables it AND the server grants its
 * capability. Capabilities can never widen the profile.
 */
export type WorkerBootstrapCapabilities = {
    readonly can_view_dashboard?: boolean;
    readonly can_view_tasks?: boolean;
    readonly can_clock_time?: boolean;
    readonly can_view_purchase_orders?: boolean;
};
export declare const WORKER_MODULE_CAPABILITIES: Readonly<Record<WorkerModule, keyof WorkerBootstrapCapabilities | null>>;
export declare const WORKER_TABS: readonly ["dashboard", "time_clock", "tasks", "purchase_orders", "variations", "settings"];
export type WorkerTab = (typeof WORKER_TABS)[number];
/** Navigation tabs that require a module (settings is account-level and always shown). */
export declare const WORKER_TAB_MODULES: Readonly<Record<WorkerTab, WorkerModule | null>>;
export declare const WORKER_QUICK_ACTION_TARGETS: readonly ["time_clock", "tasks", "purchase_orders", "variations"];
export type WorkerQuickActionTarget = (typeof WORKER_QUICK_ACTION_TARGETS)[number];
/**
 * Optional features with implemented behaviour in the Worker App core.
 *
 * Only add a feature here together with its implementation in the same Main
 * change. A profile may not enable behaviour that does not exist.
 *   notifications: renders the notification affordance in the home header.
 */
export declare const WORKER_FEATURES: readonly ["notifications"];
export type WorkerFeature = (typeof WORKER_FEATURES)[number];
export declare const WORKER_EXTENSIONS: readonly ["home-notice"];
export type WorkerExtension = (typeof WORKER_EXTENSIONS)[number];
export declare const WORKER_TERMINOLOGY_KEYS: readonly ["dashboard", "timeClock", "tasks", "purchaseOrders", "variations", "settings"];
export type WorkerTerminologyKey = (typeof WORKER_TERMINOLOGY_KEYS)[number];
export declare const WORKER_DISTRIBUTION_CHANNELS: readonly ["internal", "store"];
export type WorkerDistributionChannel = (typeof WORKER_DISTRIBUTION_CHANNELS)[number];
/**
 * Machine-readable description of the Worker App core's supported surface.
 * The Worker App repository commits a generated copy (`worker-capabilities.json`)
 * and each Worker release manifest records it, so an upgrade can prove whether
 * a customer's enabled modules/features/extensions remain supported.
 */
export type WorkerCapabilities = {
    readonly schemaVersion: 1;
    readonly contractVersion: string;
    readonly mobileApiContractVersion: number;
    readonly modules: readonly WorkerModule[];
    readonly tabs: readonly WorkerTab[];
    readonly quickActionTargets: readonly WorkerQuickActionTarget[];
    readonly features: readonly WorkerFeature[];
    readonly extensions: readonly WorkerExtension[];
    readonly terminologyKeys: readonly WorkerTerminologyKey[];
};
export declare const WORKER_CAPABILITIES: WorkerCapabilities;
export type WorkerEnvironmentConfig = {
    readonly kind: "hosted";
    readonly environmentId: string;
    readonly displayLabel: string;
    readonly supabaseProjectRef: string;
    /** Optional override used only when the project is served from a
     * non-standard Supabase host; must be an exact hostname. */
    readonly expectedSupabaseHost?: string;
    /** Optional explicit Edge Functions base URL. Must be same-origin with
     * the Supabase URL when resolved. */
    readonly functionsUrl?: string;
} | {
    readonly kind: "local";
    readonly environmentId: string;
    readonly displayLabel: string;
    readonly functionsUrl?: string;
};
export type WorkerBrandingConfig = {
    readonly platformColor: string;
    readonly actionColor: string;
    readonly splashBackgroundColor: string;
    readonly iconPath?: string;
    readonly logoPath?: string;
    readonly splashImagePath?: string;
};
export type WorkerDistributionConfig = {
    readonly channel: WorkerDistributionChannel;
    readonly iosBundleIdentifier: string;
    readonly androidPackage: string;
    readonly updateChannel: string;
};
export type WorkerQuickActionConfig = {
    readonly id: string;
    readonly label: string;
    readonly target: WorkerQuickActionTarget;
};
export type WorkerHomeNoticeConfig = {
    readonly title: string;
    readonly body: string;
};
export type WorkerExtensionConfig = {
    readonly enabled: boolean;
    /** Extension-specific configuration. Validated per extension id. */
    readonly config?: Record<string, unknown>;
};
export type WorkerClientConfig = {
    readonly schemaVersion: 1;
    readonly clientKey: string;
    readonly identity: {
        readonly appName: string;
        readonly slug: string;
        readonly scheme: string;
        readonly description?: string;
    };
    readonly distribution: WorkerDistributionConfig;
    readonly environment: WorkerEnvironmentConfig;
    readonly branding: WorkerBrandingConfig;
    readonly modules: {
        readonly [Module in WorkerModule]: boolean;
    };
    readonly navigation: {
        readonly tabs: readonly WorkerTab[];
        readonly quickActions: readonly WorkerQuickActionConfig[];
    };
    readonly terminology?: {
        readonly [Key in WorkerTerminologyKey]?: string;
    };
    readonly features: {
        readonly [Feature in WorkerFeature]: boolean;
    };
    readonly extensions?: {
        readonly [Extension in WorkerExtension]?: WorkerExtensionConfig;
    };
};
export declare class WorkerConfigValidationError extends Error {
    readonly path: string;
    constructor(path: string, message: string);
}
export declare function defineWorkerClientConfig(input: unknown): WorkerClientConfig;
export declare function resolveWorkerClientConfig(input: unknown): WorkerClientConfig;
/**
 * Deterministic JSON serialisation of a validated profile. Main hashes this
 * string to record/profile fingerprints; the Worker App uses the same string
 * so build manifests and registry records agree.
 */
export declare function canonicalizeWorkerClientConfig(config: WorkerClientConfig): string;
export type ResolvedWorkerNavigation = {
    readonly tabs: readonly WorkerTab[];
    readonly quickActions: readonly WorkerQuickActionConfig[];
    readonly modules: readonly WorkerModule[];
    readonly notice: WorkerHomeNoticeConfig | null;
    /** Modules enabled by configuration but not granted by the server. */
    readonly withheldModules: readonly WorkerModule[];
};
export declare function resolveWorkerNavigation(config: WorkerClientConfig, capabilities?: WorkerBootstrapCapabilities): ResolvedWorkerNavigation;
export type WorkerEnvironmentInput = {
    readonly supabaseUrl: string;
    readonly functionsUrl?: string;
};
export type WorkerEnvironmentBinding = {
    readonly ok: true;
    readonly environmentId: string;
    readonly projectRef: string | null;
    readonly supabaseUrl: string;
    readonly functionsUrl: string;
    readonly derivedProjectRef: string | null;
} | {
    readonly ok: false;
    readonly errors: readonly string[];
};
/**
 * Fail-closed check that the compiled Supabase environment is the environment
 * the customer profile declares. Used at build time (Node) and at runtime
 * (React Native/web) with the same rules.
 */
export declare function validateWorkerEnvironment(config: WorkerClientConfig, input: WorkerEnvironmentInput): WorkerEnvironmentBinding;
/**
 * Resolve the environment binding of the running app from a compiled profile
 * and the runtime environment values. Returning a discriminated union (instead
 * of throwing) lets the app render a fail-closed screen before any data access.
 */
export declare function resolveWorkerRuntimeEnvironment(config: WorkerClientConfig, env: {
    readonly supabaseUrl?: string | undefined;
    readonly functionsUrl?: string | undefined;
}): WorkerEnvironmentBinding;
/**
 * Keys that must be globally unique across customers. Main's release tooling
 * and the client registry use this to prevent two customer implementations
 * from colliding on app identity or environment identity.
 */
export type WorkerIsolationIdentity = {
    readonly clientKey: string;
    readonly environmentId: string;
    readonly supabaseProjectRef: string | null;
    readonly iosBundleIdentifier: string;
    readonly androidPackage: string;
    readonly scheme: string;
    readonly updateChannel: string;
};
export declare function workerIsolationIdentity(config: WorkerClientConfig): WorkerIsolationIdentity;
/**
 * Detect collisions between two customer profiles. Returns human-readable
 * errors; an empty array means the two profiles are isolated.
 */
export declare function findWorkerIsolationConflicts(left: WorkerClientConfig, right: WorkerClientConfig): string[];
export type PublicSupabaseKeyInspection = {
    readonly ok: true;
    readonly role: "anon" | "publishable";
} | {
    readonly ok: false;
    readonly errors: readonly string[];
};
/** Dependency-free base64url decoder for JWT payload inspection. */
export declare function decodeBase64Url(value: string): string | null;
/**
 * Reject privileged Supabase credentials in a distributed mobile build.
 *
 * Only the public anon (or publishable) key may be embedded in the app. A
 * service-role key in a mobile bundle is a total tenant-isolation failure, so
 * this check fails closed both at build time and at runtime.
 */
/** Decode a JWT payload without verifying the signature. */
export declare function decodeJwtPayload(token: string): Record<string, unknown> | null;
export declare function inspectPublicSupabaseKey(key: string | undefined | null): PublicSupabaseKeyInspection;
export declare class WorkerBuildConfigurationError extends Error {
    readonly errors: string[];
    constructor(errors: string[]);
}
export type ResolveProfileInput = {
    readonly projectRoot: string;
    readonly profilePath?: string | null;
    readonly environmentName?: string | null;
};
export type ResolvedWorkerProfile = {
    readonly profile: WorkerClientConfig;
    readonly profilePath: string;
    readonly canonical: string;
};
export declare function workerProfilePathFor({ projectRoot, profilePath, environmentName }: ResolveProfileInput): string;
export declare function resolveWorkerProfileFromJson(raw: unknown, profilePath: string): ResolvedWorkerProfile;
export type WorkerBuildEnvironmentInput = {
    readonly supabaseUrl?: string | null;
    readonly functionsUrl?: string | null;
    readonly anonKey?: string | null;
    readonly strict: boolean;
};
export type WorkerBuildEnvironmentResult = {
    readonly ok: boolean;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly projectRef: string | null;
    readonly supabaseUrl: string | null;
    readonly functionsUrl: string | null;
};
/**
 * Validate the environment a Worker build is compiled with. In strict mode
 * (CI/EAS/release) a missing URL, key or mismatch is fatal; otherwise it is a
 * warning so `expo start` can run without environment variables and still fail
 * closed at runtime.
 */
export declare function validateWorkerBuildEnvironment(profile: WorkerClientConfig, input: WorkerBuildEnvironmentInput): WorkerBuildEnvironmentResult;
export type WorkerSessionLike = {
    readonly access_token?: string | null;
    readonly expires_at?: number | null;
};
export type WorkerSessionGuardResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly errors: readonly string[];
};
/**
 * Prove that a signed-in session was minted by the build's own Supabase
 * environment. A foreign, expired or non-authenticated session fails closed.
 */
export declare function assertWorkerSessionEnvironment(runtime: {
    readonly supabaseUrl: string;
    readonly environmentId: string;
}, session: WorkerSessionLike | null, now?: number): WorkerSessionGuardResult;
export declare function isSecretLikeWorkerConfigValue(value: unknown): boolean;
