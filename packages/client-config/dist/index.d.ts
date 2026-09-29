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
};
export declare class ClientConfigValidationError extends Error {
    readonly path: string;
    constructor(path: string, message: string);
}
export declare function defineTradesStackClientConfig(input: unknown): ClientConfig;
export declare function resolveTradesStackClientConfig(input: unknown): ClientConfig;
