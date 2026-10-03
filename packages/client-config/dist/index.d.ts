export declare const CLIENT_CONFIG_PACKAGE_VERSION: "0.0.0";
export declare const MASTER_CLIENT_CONFIG: {
    readonly schemaVersion: 1;
    readonly identity: {
        readonly clientKey: "tradesstack-master";
        readonly displayName: "Tradesstack";
        readonly description: "Tradesstack prototype app";
    };
    readonly theme: {
        readonly platformColor: "#0F172A";
        readonly actionColor: "#F45D22";
    };
    readonly defaults: {
        readonly locale: "en-NZ";
        readonly currency: "NZD";
        readonly timezone: "Pacific/Auckland";
    };
};
export declare const CLIENT_SCHEDULER_DISPATCH_PATH: "/api/cron/dispatch";
export declare const CLIENT_SCHEDULER_ADAPTERS: readonly ["vercel-cron", "external"];
export type ClientSchedulerAdapter = (typeof CLIENT_SCHEDULER_ADAPTERS)[number];
export declare const CLIENT_SCHEDULER_JOB_NAMES: readonly ["document-storage-cleanup", "material-supplier-pricing", "organization-memory-retirement", "project-qa-evidence-cleanup", "retention-rolling-drafts", "universal-construction-learning", "universal-construction-learning/supplier-bills", "worksheet-event-classifications", "worksheet-memory-evidence-pools", "worksheet-memory-semantic-pools", "worksheet-memory-synthesis", "worksheet-mutation-evidence-v2"];
export type ClientSchedulerJobName = (typeof CLIENT_SCHEDULER_JOB_NAMES)[number];
export type ClientSchedulerConfig = {
    readonly adapter: ClientSchedulerAdapter;
    readonly dispatcherPath: typeof CLIENT_SCHEDULER_DISPATCH_PATH;
    readonly enabledJobs: readonly ClientSchedulerJobName[];
};
export type ClientConfig = {
    readonly schemaVersion: 1;
    readonly identity: {
        readonly clientKey: string;
        readonly displayName: string;
        readonly description?: string;
    };
    readonly theme: {
        readonly platformColor: string;
        readonly actionColor: string;
    };
    readonly defaults: {
        readonly locale: string;
        readonly currency: string;
        readonly timezone: string;
    };
    readonly scheduler?: ClientSchedulerConfig;
};
export declare class ClientConfigValidationError extends Error {
    readonly path: string;
    constructor(path: string, message: string);
}
export declare function defineTradesStackClientConfig(input: unknown): ClientConfig;
export declare function resolveTradesStackClientConfig(input: unknown): ClientConfig;
