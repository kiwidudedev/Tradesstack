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
export const WORKER_CONFIG_PACKAGE_VERSION = "0.0.0";
export const WORKER_CONFIG_SCHEMA_VERSION = 1;
/**
 * Version of the Worker App configuration/application contract. Bumped when
 * the shape or meaning of the profile changes incompatibly.
 */
export const WORKER_APP_CONTRACT_VERSION = "1";
/**
 * Version of the mobile API contract (Supabase Edge Functions and mobile RPCs)
 * that the Worker App core is built against. Independent of the web release,
 * the Worker App release and the database migration target, but validated
 * against them by the Main release tooling.
 */
export const MOBILE_API_CONTRACT_VERSION = 2;
/* -------------------------------------------------------------------------- */
/* Registries: the Worker App core's supported surface                         */
/* -------------------------------------------------------------------------- */
export const WORKER_MODULES = [
    "dashboard",
    "time_clock",
    "tasks",
    "purchase_orders",
    "variations",
];
export const WORKER_MODULE_CAPABILITIES = {
    dashboard: "can_view_dashboard",
    time_clock: "can_clock_time",
    tasks: "can_view_tasks",
    purchase_orders: "can_view_purchase_orders",
    // Variations have no bootstrap capability flag; the server enforces project
    // membership and `variations.write` through the mobile RPCs.
    variations: null,
};
export const WORKER_TABS = ["dashboard", "time_clock", "tasks", "purchase_orders", "variations", "settings"];
/** Navigation tabs that require a module (settings is account-level and always shown). */
export const WORKER_TAB_MODULES = {
    dashboard: "dashboard",
    time_clock: "time_clock",
    tasks: "tasks",
    purchase_orders: "purchase_orders",
    variations: "variations",
    settings: null,
};
export const WORKER_QUICK_ACTION_TARGETS = [
    "time_clock",
    "tasks",
    "purchase_orders",
    "variations",
];
/**
 * Optional features with implemented behaviour in the Worker App core.
 *
 * Only add a feature here together with its implementation in the same Main
 * change. A profile may not enable behaviour that does not exist.
 *   notifications: renders the notification affordance in the home header.
 */
export const WORKER_FEATURES = ["notifications"];
export const WORKER_EXTENSIONS = ["home-notice"];
export const WORKER_TERMINOLOGY_KEYS = [
    "dashboard",
    "timeClock",
    "tasks",
    "purchaseOrders",
    "variations",
    "settings",
];
export const WORKER_DISTRIBUTION_CHANNELS = ["internal", "store"];
export const WORKER_CAPABILITIES = {
    schemaVersion: 1,
    contractVersion: WORKER_APP_CONTRACT_VERSION,
    mobileApiContractVersion: MOBILE_API_CONTRACT_VERSION,
    modules: WORKER_MODULES,
    tabs: WORKER_TABS,
    quickActionTargets: WORKER_QUICK_ACTION_TARGETS,
    features: WORKER_FEATURES,
    extensions: WORKER_EXTENSIONS,
    terminologyKeys: WORKER_TERMINOLOGY_KEYS,
};
/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */
export class WorkerConfigValidationError extends Error {
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.name = "WorkerConfigValidationError";
        this.path = path;
    }
}
/* -------------------------------------------------------------------------- */
/* Primitive validators                                                       */
/* -------------------------------------------------------------------------- */
const CLIENT_KEY = /^[a-z][a-z0-9-]{2,62}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCHEME = /^[a-z][a-z0-9+.-]*$/;
const BUNDLE_ID = /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)+$/;
const UPDATE_CHANNEL = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ENVIRONMENT_ID = /^[a-z][a-z0-9-]{2,62}$/;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ASSET_PATH = /^(?:assets|public)\/[A-Za-z0-9._/-]+$/;
const ASSET_EXTENSION = /\.(?:png|jpg|jpeg|webp)$/i;
const EXTENSION_ID = /^[a-z][a-z0-9-]{2,39}$/;
const SECRET_PATTERNS = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /(?:sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{12,})/,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /(?:postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/)[^\s/]+:[^\s@]+@/i,
];
const SECRET_KEY = /(secret|token|password|service_role|private_key|api_?key|apikey)/i;
function record(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new WorkerConfigValidationError(path, "must be an object.");
    }
    return value;
}
function stringValue(value, path, options) {
    if (typeof value !== "string" || !value.trim()) {
        throw new WorkerConfigValidationError(path, "must be a non-empty string.");
    }
    const normalized = value.trim();
    if (normalized.length > options.max) {
        throw new WorkerConfigValidationError(path, `must be at most ${options.max} characters.`);
    }
    if (options.min !== undefined && normalized.length < options.min) {
        throw new WorkerConfigValidationError(path, `must be at least ${options.min} characters.`);
    }
    if (options.pattern && !options.pattern.test(normalized)) {
        throw new WorkerConfigValidationError(path, "has an invalid value.");
    }
    rejectSecretValue(normalized, path);
    return normalized;
}
function booleanValue(value, path) {
    if (typeof value !== "boolean") {
        throw new WorkerConfigValidationError(path, "must be a boolean.");
    }
    return value;
}
function rejectUnknown(value, allowed, path) {
    for (const key of Object.keys(value)) {
        rejectSecretKey(key, `${path}.${key}`);
        if (!allowed.includes(key)) {
            throw new WorkerConfigValidationError(`${path}.${key}`, "unknown fields are not allowed.");
        }
    }
}
function rejectSecretKey(key, path) {
    // Caveat: `expectedSupabaseHost`, `functionsUrl` etc. are safe field names.
    if (SECRET_KEY.test(key)) {
        throw new WorkerConfigValidationError(path, "secret-shaped field names are not allowed.");
    }
}
function rejectSecretValue(value, path) {
    for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(value)) {
            throw new WorkerConfigValidationError(path, "secret-like values are not allowed.");
        }
    }
}
function uniqueStrings(value, path, allowed, maxItems) {
    if (!Array.isArray(value)) {
        throw new WorkerConfigValidationError(path, "must be an array.");
    }
    if (value.length > maxItems) {
        throw new WorkerConfigValidationError(path, `must contain at most ${maxItems} entries.`);
    }
    const output = value.map((entry, index) => stringValue(entry, `${path}[${index}]`, { max: 60 }));
    if (new Set(output).size !== output.length) {
        throw new WorkerConfigValidationError(path, "must not contain duplicates.");
    }
    for (const [index, entry] of output.entries()) {
        if (!allowed.includes(entry)) {
            throw new WorkerConfigValidationError(`${path}[${index}]`, "is not a supported value.");
        }
    }
    return output;
}
/* -------------------------------------------------------------------------- */
/* Config validation                                                          */
/* -------------------------------------------------------------------------- */
export function defineWorkerClientConfig(input) {
    const root = record(input, "config");
    rejectUnknown(root, ["schemaVersion", "clientKey", "identity", "distribution", "environment", "branding", "modules", "navigation", "terminology", "features", "extensions", "defaults"], "config");
    if (root.schemaVersion !== WORKER_CONFIG_SCHEMA_VERSION) {
        throw new WorkerConfigValidationError("schemaVersion", `must be ${WORKER_CONFIG_SCHEMA_VERSION}.`);
    }
    const clientKey = stringValue(root.clientKey, "clientKey", { pattern: CLIENT_KEY, max: 63 });
    const identity = record(root.identity, "identity");
    rejectUnknown(identity, ["appName", "slug", "scheme", "description"], "identity");
    const appName = stringValue(identity.appName, "identity.appName", { max: 30, min: 2 });
    const slug = stringValue(identity.slug, "identity.slug", { pattern: SLUG, max: 50 });
    const scheme = stringValue(identity.scheme, "identity.scheme", { pattern: SCHEME, max: 40 });
    const description = identity.description === undefined
        ? undefined
        : stringValue(identity.description, "identity.description", { max: 240 });
    const distribution = record(root.distribution, "distribution");
    rejectUnknown(distribution, ["channel", "iosBundleIdentifier", "androidPackage", "updateChannel"], "distribution");
    const channel = stringValue(distribution.channel, "distribution.channel", { max: 10 });
    if (!WORKER_DISTRIBUTION_CHANNELS.includes(channel)) {
        throw new WorkerConfigValidationError("distribution.channel", "is not a supported value.");
    }
    const iosBundleIdentifier = stringValue(distribution.iosBundleIdentifier, "distribution.iosBundleIdentifier", { pattern: BUNDLE_ID, max: 155 });
    const androidPackage = stringValue(distribution.androidPackage, "distribution.androidPackage", { pattern: BUNDLE_ID, max: 155 });
    const updateChannel = stringValue(distribution.updateChannel, "distribution.updateChannel", { pattern: UPDATE_CHANNEL, max: 40 });
    const environment = record(root.environment, "environment");
    const environmentKind = environment.kind;
    if (environmentKind !== "hosted" && environmentKind !== "local") {
        throw new WorkerConfigValidationError("environment.kind", 'must be "hosted" or "local".');
    }
    const environmentId = stringValue(environment.environmentId, "environment.environmentId", { pattern: ENVIRONMENT_ID, max: 63 });
    const displayLabel = stringValue(environment.displayLabel, "environment.displayLabel", { max: 60 });
    let resolvedEnvironment;
    if (environmentKind === "hosted") {
        rejectUnknown(environment, ["kind", "environmentId", "displayLabel", "supabaseProjectRef", "expectedSupabaseHost", "functionsUrl"], "environment");
        const supabaseProjectRef = stringValue(environment.supabaseProjectRef, "environment.supabaseProjectRef", { pattern: SUPABASE_PROJECT_REF, max: 20, min: 20 });
        const expectedSupabaseHost = environment.expectedSupabaseHost === undefined
            ? undefined
            : stringValue(environment.expectedSupabaseHost, "environment.expectedSupabaseHost", { pattern: HOSTNAME, max: 253 });
        const functionsUrl = environment.functionsUrl === undefined
            ? undefined
            : stringValue(environment.functionsUrl, "environment.functionsUrl", { pattern: /^https:\/\//, max: 200 });
        resolvedEnvironment = Object.assign(Object.assign({ kind: "hosted", environmentId,
            displayLabel,
            supabaseProjectRef }, (expectedSupabaseHost === undefined ? {} : { expectedSupabaseHost })), (functionsUrl === undefined ? {} : { functionsUrl }));
    }
    else {
        rejectUnknown(environment, ["kind", "environmentId", "displayLabel", "functionsUrl"], "environment");
        const functionsUrl = environment.functionsUrl === undefined
            ? undefined
            : stringValue(environment.functionsUrl, "environment.functionsUrl", { pattern: /^https?:\/\//, max: 200 });
        resolvedEnvironment = Object.assign({ kind: "local", environmentId,
            displayLabel }, (functionsUrl === undefined ? {} : { functionsUrl }));
    }
    const branding = record(root.branding, "branding");
    rejectUnknown(branding, ["platformColor", "actionColor", "splashBackgroundColor", "iconPath", "logoPath", "splashImagePath"], "branding");
    const platformColor = stringValue(branding.platformColor, "branding.platformColor", { pattern: HEX_COLOR, max: 7 });
    const actionColor = stringValue(branding.actionColor, "branding.actionColor", { pattern: HEX_COLOR, max: 7 });
    const splashBackgroundColor = stringValue(branding.splashBackgroundColor, "branding.splashBackgroundColor", { pattern: HEX_COLOR, max: 7 });
    const assetPath = (value, path) => {
        if (value === undefined)
            return undefined;
        const normalized = stringValue(value, path, { pattern: ASSET_PATH, max: 160 });
        if (normalized.includes("..")) {
            throw new WorkerConfigValidationError(path, "must not traverse outside the application root.");
        }
        if (!ASSET_EXTENSION.test(normalized)) {
            throw new WorkerConfigValidationError(path, "must reference a png, jpg, jpeg or webp asset.");
        }
        return normalized;
    };
    const iconPath = assetPath(branding.iconPath, "branding.iconPath");
    const logoPath = assetPath(branding.logoPath, "branding.logoPath");
    const splashImagePath = assetPath(branding.splashImagePath, "branding.splashImagePath");
    const modulesInput = record(root.modules, "modules");
    rejectUnknown(modulesInput, WORKER_MODULES, "modules");
    const modules = {};
    for (const moduleKey of WORKER_MODULES) {
        if (!(moduleKey in modulesInput)) {
            throw new WorkerConfigValidationError(`modules.${moduleKey}`, "must be declared explicitly.");
        }
        modules[moduleKey] = booleanValue(modulesInput[moduleKey], `modules.${moduleKey}`);
    }
    if (!modules.dashboard) {
        throw new WorkerConfigValidationError("modules.dashboard", "must remain enabled; the Worker App has no usable entry screen without it.");
    }
    const navigation = record(root.navigation, "navigation");
    rejectUnknown(navigation, ["tabs", "quickActions"], "navigation");
    const tabs = uniqueStrings(navigation.tabs, "navigation.tabs", WORKER_TABS, WORKER_TABS.length);
    if (!tabs.includes("dashboard")) {
        throw new WorkerConfigValidationError("navigation.tabs", 'must include "dashboard".');
    }
    if (!tabs.includes("settings")) {
        throw new WorkerConfigValidationError("navigation.tabs", 'must include "settings".');
    }
    if (!Array.isArray(navigation.quickActions)) {
        throw new WorkerConfigValidationError("navigation.quickActions", "must be an array.");
    }
    if (navigation.quickActions.length > 6) {
        throw new WorkerConfigValidationError("navigation.quickActions", "must contain at most 6 entries.");
    }
    const quickActionIds = new Set();
    const quickActions = navigation.quickActions.map((entry, index) => {
        const path = `navigation.quickActions[${index}]`;
        const action = record(entry, path);
        rejectUnknown(action, ["id", "label", "target"], path);
        const id = stringValue(action.id, `${path}.id`, { pattern: EXTENSION_ID, max: 40 });
        if (quickActionIds.has(id)) {
            throw new WorkerConfigValidationError(`${path}.id`, "must be unique.");
        }
        quickActionIds.add(id);
        const label = stringValue(action.label, `${path}.label`, { max: 40, min: 2 });
        const target = stringValue(action.target, `${path}.target`, { max: 40 });
        if (!WORKER_QUICK_ACTION_TARGETS.includes(target)) {
            throw new WorkerConfigValidationError(`${path}.target`, "is not a supported value.");
        }
        if (target !== "time_clock" && !modules[target]) {
            throw new WorkerConfigValidationError(`${path}.target`, `requires module ${target} to be enabled.`);
        }
        return { id, label, target: target };
    });
    // Navigation targets must resolve to enabled modules so the app never shows
    // a link that cannot open.
    for (const tab of tabs) {
        const tabModule = WORKER_TAB_MODULES[tab];
        if (!tabModule)
            continue;
        if (!modules[tabModule]) {
            throw new WorkerConfigValidationError("navigation.tabs", `includes ${tab} but modules.${tabModule} is disabled.`);
        }
    }
    let terminology;
    if (root.terminology !== undefined) {
        const terminologyInput = record(root.terminology, "terminology");
        rejectUnknown(terminologyInput, WORKER_TERMINOLOGY_KEYS, "terminology");
        terminology = {};
        for (const [key, value] of Object.entries(terminologyInput)) {
            terminology[key] = stringValue(value, `terminology.${key}`, { max: 40, min: 1 });
        }
    }
    const featuresInput = record(root.features, "features");
    rejectUnknown(featuresInput, WORKER_FEATURES, "features");
    const features = {};
    for (const feature of WORKER_FEATURES) {
        if (!(feature in featuresInput)) {
            throw new WorkerConfigValidationError(`features.${feature}`, "must be declared explicitly.");
        }
        features[feature] = booleanValue(featuresInput[feature], `features.${feature}`);
    }
    let extensions;
    if (root.extensions !== undefined) {
        const extensionsInput = record(root.extensions, "extensions");
        rejectUnknown(extensionsInput, WORKER_EXTENSIONS, "extensions");
        extensions = {};
        for (const [id, value] of Object.entries(extensionsInput)) {
            const path = `extensions.${id}`;
            const extension = record(value, path);
            rejectUnknown(extension, ["enabled", "config"], path);
            const enabled = booleanValue(extension.enabled, `${path}.enabled`);
            if (id === "home-notice") {
                const config = extension.config === undefined ? {} : record(extension.config, `${path}.config`);
                rejectUnknown(config, ["title", "body"], `${path}.config`);
                if (enabled) {
                    const title = stringValue(config.title, `${path}.config.title`, { max: 80, min: 2 });
                    const body = stringValue(config.body, `${path}.config.body`, { max: 280, min: 2 });
                    extensions[id] = { enabled, config: { title, body } };
                    continue;
                }
                extensions[id] = { enabled };
                continue;
            }
            throw new WorkerConfigValidationError(`${path}`, "is not a supported extension.");
        }
    }
    let defaults;
    if (root.defaults !== undefined) {
        const defaultsInput = record(root.defaults, "defaults");
        rejectUnknown(defaultsInput, ["locale", "currency", "timezone"], "defaults");
        const locale = stringValue(defaultsInput.locale, "defaults.locale", { max: 35 });
        try {
            if (Intl.getCanonicalLocales(locale).length !== 1)
                throw new Error();
        }
        catch (_a) {
            throw new WorkerConfigValidationError("defaults.locale", "must be a valid BCP 47 locale.");
        }
        const currency = stringValue(defaultsInput.currency, "defaults.currency", { pattern: /^[A-Z]{3}$/, max: 3 });
        const timezone = stringValue(defaultsInput.timezone, "defaults.timezone", { max: 80 });
        try {
            new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
        }
        catch (_b) {
            throw new WorkerConfigValidationError("defaults.timezone", "must be a valid IANA timezone.");
        }
        defaults = { locale, currency, timezone };
    }
    return Object.assign(Object.assign(Object.assign(Object.assign({ schemaVersion: 1, clientKey, identity: Object.assign({ appName,
            slug,
            scheme }, (description === undefined ? {} : { description })), distribution: {
            channel: channel,
            iosBundleIdentifier,
            androidPackage,
            updateChannel,
        }, environment: resolvedEnvironment, branding: Object.assign(Object.assign(Object.assign({ platformColor,
            actionColor,
            splashBackgroundColor }, (iconPath === undefined ? {} : { iconPath })), (logoPath === undefined ? {} : { logoPath })), (splashImagePath === undefined ? {} : { splashImagePath })), modules, navigation: { tabs, quickActions } }, (terminology === undefined ? {} : { terminology })), { features }), (extensions === undefined ? {} : { extensions })), (defaults === undefined ? {} : { defaults }));
}
export function resolveWorkerClientConfig(input) {
    return defineWorkerClientConfig(input);
}
/* -------------------------------------------------------------------------- */
/* Canonicalisation (for fingerprints)                                        */
/* -------------------------------------------------------------------------- */
function stable(value) {
    if (Array.isArray(value))
        return value.map(stable);
    if (value && typeof value === "object") {
        const source = value;
        return Object.fromEntries(Object.keys(source).sort().map((key) => [key, stable(source[key])]));
    }
    return value;
}
/**
 * Deterministic JSON serialisation of a validated profile. Main hashes this
 * string to record/profile fingerprints; the Worker App uses the same string
 * so build manifests and registry records agree.
 */
export function canonicalizeWorkerClientConfig(config) {
    // Re-validate so a caller cannot canonicalise an unvalidated object.
    const validated = defineWorkerClientConfig(config);
    return JSON.stringify(stable(validated));
}
export function resolveWorkerNavigation(config, capabilities = {}) {
    var _a;
    const enabledModules = WORKER_MODULES.filter((moduleKey) => config.modules[moduleKey]);
    const granted = enabledModules.filter((moduleKey) => {
        const capability = WORKER_MODULE_CAPABILITIES[moduleKey];
        if (!capability)
            return true;
        return capabilities[capability] === true;
    });
    const withheldModules = enabledModules.filter((moduleKey) => !granted.includes(moduleKey));
    const grantedSet = new Set(granted);
    const tabs = config.navigation.tabs.filter((tab) => {
        const tabModule = WORKER_TAB_MODULES[tab];
        if (!tabModule)
            return true;
        return grantedSet.has(tabModule);
    });
    const quickActions = config.navigation.quickActions.filter((action) => {
        if (action.target === "time_clock")
            return grantedSet.has("time_clock");
        return grantedSet.has(action.target);
    });
    const noticeExtension = (_a = config.extensions) === null || _a === void 0 ? void 0 : _a["home-notice"];
    const notice = (noticeExtension === null || noticeExtension === void 0 ? void 0 : noticeExtension.enabled)
        ? noticeExtension.config
        : null;
    return {
        tabs,
        quickActions,
        modules: granted,
        notice,
        withheldModules,
    };
}
function safeUrl(value) {
    try {
        return new URL(value);
    }
    catch (_a) {
        return null;
    }
}
function deriveProjectRef(hostname) {
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match ? match[1] : null;
}
/**
 * Fail-closed check that the compiled Supabase environment is the environment
 * the customer profile declares. Used at build time (Node) and at runtime
 * (React Native/web) with the same rules.
 */
export function validateWorkerEnvironment(config, input) {
    var _a, _b;
    const errors = [];
    const supabaseUrl = safeUrl(input.supabaseUrl.trim());
    if (!supabaseUrl) {
        return { ok: false, errors: ["supabaseUrl is not a valid absolute URL."] };
    }
    if (supabaseUrl.username || supabaseUrl.password) {
        errors.push("supabaseUrl must not embed credentials.");
    }
    if (supabaseUrl.search || supabaseUrl.hash) {
        errors.push("supabaseUrl must not contain query strings or fragments.");
    }
    const basePath = supabaseUrl.pathname.replace(/\/+$/, "");
    if (basePath !== "") {
        errors.push("supabaseUrl must be an origin without a path.");
    }
    const environment = config.environment;
    if (environment.kind === "hosted") {
        if (supabaseUrl.protocol !== "https:") {
            errors.push("hosted environments require an https supabaseUrl.");
        }
        const expectedHost = (_a = environment.expectedSupabaseHost) !== null && _a !== void 0 ? _a : `${environment.supabaseProjectRef}.supabase.co`;
        if (supabaseUrl.hostname !== expectedHost) {
            errors.push(`supabaseUrl host ${supabaseUrl.hostname} does not match the profile environment host ${expectedHost}.`);
        }
        const derived = deriveProjectRef(supabaseUrl.hostname);
        if (environment.expectedSupabaseHost === undefined && derived !== environment.supabaseProjectRef) {
            errors.push(`supabaseUrl does not resolve to the profile Supabase project ${environment.supabaseProjectRef}.`);
        }
    }
    else {
        const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
        if (!localHosts.has(supabaseUrl.hostname)) {
            errors.push(`local environments must use a loopback host; ${supabaseUrl.hostname} is not allowed.`);
        }
        if (supabaseUrl.protocol !== "http:" && supabaseUrl.protocol !== "https:") {
            errors.push("local environments require an http or https supabaseUrl.");
        }
    }
    const derivedProjectRef = deriveProjectRef(supabaseUrl.hostname);
    if (environment.kind === "hosted" && derivedProjectRef === null && environment.expectedSupabaseHost === undefined) {
        errors.push("supabaseUrl host is not a Supabase project host.");
    }
    const explicitFunctionsUrl = ((_b = input.functionsUrl) === null || _b === void 0 ? void 0 : _b.trim()) || environment.functionsUrl || "";
    let functionsUrl;
    if (explicitFunctionsUrl) {
        const parsed = safeUrl(explicitFunctionsUrl);
        if (!parsed) {
            errors.push("functionsUrl is not a valid absolute URL.");
            functionsUrl = "";
        }
        else {
            if (parsed.username || parsed.password)
                errors.push("functionsUrl must not embed credentials.");
            if (parsed.origin !== supabaseUrl.origin) {
                errors.push("functionsUrl must be same-origin with supabaseUrl.");
            }
            const path = parsed.pathname.replace(/\/+$/, "");
            if (path !== "/functions/v1") {
                errors.push('functionsUrl path must be "/functions/v1".');
            }
            functionsUrl = `${parsed.origin}${path}`;
        }
    }
    else {
        functionsUrl = `${supabaseUrl.origin}/functions/v1`;
    }
    if (errors.length)
        return { ok: false, errors };
    return {
        ok: true,
        environmentId: environment.environmentId,
        projectRef: environment.kind === "hosted" ? environment.supabaseProjectRef : null,
        supabaseUrl: supabaseUrl.origin,
        functionsUrl,
        derivedProjectRef,
    };
}
/**
 * Resolve the environment binding of the running app from a compiled profile
 * and the runtime environment values. Returning a discriminated union (instead
 * of throwing) lets the app render a fail-closed screen before any data access.
 */
export function resolveWorkerRuntimeEnvironment(config, env) {
    if (!env.supabaseUrl) {
        return { ok: false, errors: ["Missing EXPO_PUBLIC_SUPABASE_URL for this Worker App build."] };
    }
    return validateWorkerEnvironment(config, Object.assign({ supabaseUrl: env.supabaseUrl }, (env.functionsUrl === undefined ? {} : { functionsUrl: env.functionsUrl })));
}
export function workerIsolationIdentity(config) {
    return {
        clientKey: config.clientKey,
        environmentId: config.environment.environmentId,
        supabaseProjectRef: config.environment.kind === "hosted" ? config.environment.supabaseProjectRef : null,
        iosBundleIdentifier: config.distribution.iosBundleIdentifier,
        androidPackage: config.distribution.androidPackage,
        scheme: config.identity.scheme,
        updateChannel: config.distribution.updateChannel,
    };
}
/**
 * Detect collisions between two customer profiles. Returns human-readable
 * errors; an empty array means the two profiles are isolated.
 */
export function findWorkerIsolationConflicts(left, right) {
    const a = workerIsolationIdentity(left);
    const b = workerIsolationIdentity(right);
    const errors = [];
    if (a.clientKey === b.clientKey)
        errors.push(`duplicate clientKey ${a.clientKey}`);
    if (a.environmentId === b.environmentId)
        errors.push(`duplicate environmentId ${a.environmentId}`);
    if (a.supabaseProjectRef && a.supabaseProjectRef === b.supabaseProjectRef) {
        errors.push(`duplicate supabaseProjectRef ${a.supabaseProjectRef}`);
    }
    if (a.iosBundleIdentifier === b.iosBundleIdentifier) {
        errors.push(`duplicate iosBundleIdentifier ${a.iosBundleIdentifier}`);
    }
    if (a.androidPackage === b.androidPackage) {
        errors.push(`duplicate androidPackage ${a.androidPackage}`);
    }
    if (a.scheme === b.scheme)
        errors.push(`duplicate scheme ${a.scheme}`);
    if (a.updateChannel === b.updateChannel)
        errors.push(`duplicate updateChannel ${a.updateChannel}`);
    return errors;
}
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Dependency-free base64url decoder for JWT payload inspection. */
export function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    let bits = 0;
    let accumulator = 0;
    let output = "";
    for (const character of padded) {
        if (character === "=")
            break;
        const index = BASE64_ALPHABET.indexOf(character);
        if (index === -1)
            return null;
        accumulator = (accumulator << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            const byte = (accumulator >> bits) & 0xff;
            output += String.fromCharCode(byte);
        }
    }
    return output;
}
/**
 * Reject privileged Supabase credentials in a distributed mobile build.
 *
 * Only the public anon (or publishable) key may be embedded in the app. A
 * service-role key in a mobile bundle is a total tenant-isolation failure, so
 * this check fails closed both at build time and at runtime.
 */
/** Decode a JWT payload without verifying the signature. */
export function decodeJwtPayload(token) {
    const segments = typeof token === "string" ? token.split(".") : [];
    if (segments.length !== 3)
        return null;
    const payload = decodeBase64Url(segments[1]);
    if (!payload)
        return null;
    try {
        const parsed = JSON.parse(payload);
        return parsed && typeof parsed === "object" ? parsed : null;
    }
    catch (_a) {
        return null;
    }
}
export function inspectPublicSupabaseKey(key) {
    if (typeof key !== "string" || !key.trim()) {
        return { ok: false, errors: ["Missing EXPO_PUBLIC_SUPABASE_ANON_KEY for this Worker App build."] };
    }
    const value = key.trim();
    if (value.startsWith("sb_secret_")) {
        return { ok: false, errors: ["A Supabase secret key must never be embedded in the Worker App."] };
    }
    if (value.startsWith("sb_publishable_")) {
        return { ok: true, role: "publishable" };
    }
    const segments = value.split(".");
    if (segments.length !== 3) {
        return { ok: false, errors: ["EXPO_PUBLIC_SUPABASE_ANON_KEY is not a Supabase public JWT or publishable key."] };
    }
    const parsed = decodeJwtPayload(value);
    if (!parsed) {
        return { ok: false, errors: ["EXPO_PUBLIC_SUPABASE_ANON_KEY payload is not valid base64url JSON."] };
    }
    const role = parsed.role;
    if (role === "service_role") {
        return { ok: false, errors: ["A service_role key must never be embedded in the Worker App."] };
    }
    if (role !== "anon") {
        return { ok: false, errors: [`EXPO_PUBLIC_SUPABASE_ANON_KEY must be an anon key; found role ${String(role)}.`] };
    }
    return { ok: true, role: "anon" };
}
/* -------------------------------------------------------------------------- */
/* Build-environment resolution (shared by app config and CI gate)             */
/* -------------------------------------------------------------------------- */
export class WorkerBuildConfigurationError extends Error {
    constructor(errors) {
        super(errors.join(" "));
        this.name = "WorkerBuildConfigurationError";
        this.errors = errors;
    }
}
function joinPath(base, relative) {
    if (relative.startsWith("/"))
        return relative;
    return `${base.replace(/\/+$/, "")}/${relative.replace(/^\.\//, "")}`;
}
export function workerProfilePathFor({ projectRoot, profilePath, environmentName }) {
    if (typeof profilePath === "string" && profilePath.trim()) {
        return joinPath(projectRoot, profilePath.trim());
    }
    const name = (environmentName !== null && environmentName !== void 0 ? environmentName : "reference").trim() || "reference";
    return joinPath(joinPath(projectRoot, "profiles"), `${name}.json`);
}
export function resolveWorkerProfileFromJson(raw, profilePath) {
    try {
        const profile = defineWorkerClientConfig(raw);
        return { profile, profilePath, canonical: canonicalizeWorkerClientConfig(profile) };
    }
    catch (error) {
        throw new WorkerBuildConfigurationError([
            `Worker profile ${profilePath} is invalid: ${error instanceof Error ? error.message : String(error)}`,
        ]);
    }
}
/**
 * Validate the environment a Worker build is compiled with. In strict mode
 * (CI/EAS/release) a missing URL, key or mismatch is fatal; otherwise it is a
 * warning so `expo start` can run without environment variables and still fail
 * closed at runtime.
 */
export function validateWorkerBuildEnvironment(profile, input) {
    var _a, _b, _c, _d, _e, _f;
    const errors = [];
    const warnings = [];
    const supabaseUrl = (_b = (_a = input.supabaseUrl) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
    const functionsUrl = (_d = (_c = input.functionsUrl) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : "";
    const anonKey = (_f = (_e = input.anonKey) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : "";
    if (!supabaseUrl) {
        const message = "EXPO_PUBLIC_SUPABASE_URL is required for a distributable Worker App build.";
        if (input.strict)
            errors.push(message);
        else
            warnings.push(message);
        return { ok: errors.length === 0, errors, warnings, projectRef: null, supabaseUrl: null, functionsUrl: null };
    }
    const binding = resolveWorkerRuntimeEnvironment(profile, Object.assign({ supabaseUrl }, (functionsUrl ? { functionsUrl } : {})));
    if (!binding.ok) {
        errors.push(...binding.errors);
        return { ok: false, errors, warnings, projectRef: null, supabaseUrl: null, functionsUrl: null };
    }
    if (!anonKey) {
        const message = "EXPO_PUBLIC_SUPABASE_ANON_KEY is required for a distributable Worker App build.";
        if (input.strict)
            errors.push(message);
        else
            warnings.push(message);
    }
    else {
        const key = inspectPublicSupabaseKey(anonKey);
        if (!key.ok)
            errors.push(...key.errors);
    }
    return {
        ok: errors.length === 0,
        errors,
        warnings,
        projectRef: binding.projectRef,
        supabaseUrl: binding.supabaseUrl,
        functionsUrl: binding.functionsUrl,
    };
}
/**
 * Prove that a signed-in session was minted by the build's own Supabase
 * environment. A foreign, expired or non-authenticated session fails closed.
 */
export function assertWorkerSessionEnvironment(runtime, session, now = Date.now()) {
    var _a;
    if (!session)
        return { ok: true };
    const errors = [];
    if (typeof session.expires_at === "number" && session.expires_at * 1000 <= now) {
        errors.push("Your session has expired. Sign in again.");
    }
    const payload = decodeJwtPayload((_a = session.access_token) !== null && _a !== void 0 ? _a : "");
    if (!payload) {
        return { ok: false, errors: ["Your session token could not be read. Sign in again."] };
    }
    if (payload.role !== "authenticated") {
        errors.push("This session is not an authenticated Worker session.");
    }
    const issuer = typeof payload.iss === "string" ? payload.iss : null;
    const expectedPrefix = `${runtime.supabaseUrl}/auth/v1`;
    if (!issuer || !issuer.startsWith(expectedPrefix)) {
        errors.push(`This session was issued by ${issuer !== null && issuer !== void 0 ? issuer : "an unknown environment"}; this Worker App is bound to ${runtime.environmentId}.`);
    }
    return errors.length ? { ok: false, errors } : { ok: true };
}
export function isSecretLikeWorkerConfigValue(value) {
    if (typeof value === "string")
        return SECRET_PATTERNS.some((pattern) => pattern.test(value));
    if (Array.isArray(value))
        return value.some(isSecretLikeWorkerConfigValue);
    if (value && typeof value === "object") {
        return Object.entries(value).some(([key, entry]) => SECRET_KEY.test(key) || isSecretLikeWorkerConfigValue(entry));
    }
    return false;
}
