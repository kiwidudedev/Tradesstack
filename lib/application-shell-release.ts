/**
 * Master-owned application-shell provenance marker.
 *
 * This is deliberately separate from package, database, and client-config
 * versions. The release generator includes it in the non-secret client
 * release manifest and the application shell consumes it without rendering it.
 */
export const APPLICATION_SHELL_RELEASE = "0.0.0-phase1r.2" as const;
