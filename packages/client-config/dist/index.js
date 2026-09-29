export const CLIENT_CONFIG_PACKAGE_VERSION = "0.0.0";
export const MASTER_CLIENT_CONFIG = {
    schemaVersion: 1,
    identity: {
        clientKey: "tradesstack-master",
        displayName: "Tradesstack",
        description: "Tradesstack prototype app",
    },
    theme: {
        platformColor: "#0F172A",
        actionColor: "#F45D22",
    },
    defaults: {
        locale: "en-NZ",
        currency: "NZD",
        timezone: "Pacific/Auckland",
    },
};
export class ClientConfigValidationError extends Error {
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.name = "ClientConfigValidationError";
        this.path = path;
    }
}
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CLIENT_KEY = /^[a-z][a-z0-9-]{2,62}$/;
const CURRENCY = /^[A-Z]{3}$/;
function record(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ClientConfigValidationError(path, "must be an object.");
    }
    return value;
}
function stringValue(value, path, options) {
    if (typeof value !== "string" || !value.trim()) {
        throw new ClientConfigValidationError(path, "must be a non-empty string.");
    }
    const normalized = value.trim();
    if (normalized.length > options.max) {
        throw new ClientConfigValidationError(path, `must be at most ${options.max} characters.`);
    }
    if (options.pattern && !options.pattern.test(normalized)) {
        throw new ClientConfigValidationError(path, "has an invalid value.");
    }
    return normalized;
}
function rejectUnknown(value, allowed, path) {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            throw new ClientConfigValidationError(`${path}.${key}`, "unknown fields are not allowed.");
        }
    }
}
function validateLocale(value) {
    const locale = stringValue(value, "defaults.locale", { max: 35 });
    try {
        if (Intl.getCanonicalLocales(locale).length !== 1)
            throw new Error();
    }
    catch (_a) {
        throw new ClientConfigValidationError("defaults.locale", "must be a valid BCP 47 locale.");
    }
    return locale;
}
function validateTimezone(value) {
    const timezone = stringValue(value, "defaults.timezone", { max: 80 });
    try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    }
    catch (_a) {
        throw new ClientConfigValidationError("defaults.timezone", "must be a valid IANA timezone.");
    }
    return timezone;
}
export function defineTradesStackClientConfig(input) {
    const root = record(input, "config");
    rejectUnknown(root, ["schemaVersion", "identity", "theme", "defaults"], "config");
    if (root.schemaVersion !== 1) {
        throw new ClientConfigValidationError("schemaVersion", "must be 1.");
    }
    const identity = record(root.identity, "identity");
    rejectUnknown(identity, ["clientKey", "displayName", "description"], "identity");
    const clientKey = stringValue(identity.clientKey, "identity.clientKey", { pattern: CLIENT_KEY, max: 63 });
    const displayName = stringValue(identity.displayName, "identity.displayName", { max: 100 });
    const description = identity.description === undefined
        ? undefined
        : stringValue(identity.description, "identity.description", { max: 240 });
    const theme = record(root.theme, "theme");
    rejectUnknown(theme, ["platformColor", "actionColor"], "theme");
    const platformColor = stringValue(theme.platformColor, "theme.platformColor", { pattern: HEX_COLOR, max: 7 });
    const actionColor = stringValue(theme.actionColor, "theme.actionColor", { pattern: HEX_COLOR, max: 7 });
    const defaults = record(root.defaults, "defaults");
    rejectUnknown(defaults, ["locale", "currency", "timezone"], "defaults");
    const locale = validateLocale(defaults.locale);
    const currency = stringValue(defaults.currency, "defaults.currency", { pattern: CURRENCY, max: 3 });
    const timezone = validateTimezone(defaults.timezone);
    return {
        schemaVersion: 1,
        identity: description === undefined ? { clientKey, displayName } : { clientKey, displayName, description },
        theme: { platformColor, actionColor },
        defaults: { locale, currency, timezone },
    };
}
export function resolveTradesStackClientConfig(input) {
    return defineTradesStackClientConfig(input);
}
