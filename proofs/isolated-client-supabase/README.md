# TradesStack Phase 1N isolated client Supabase proof

This is a disposable, non-production proof harness. It uses the real candidate Master migration chain in a temporary local Supabase project, consumes the versioned `@tradesstack/suppliers` artifact, creates synthetic local Auth users and validates ordinary-user RLS behavior.

The harness never uses the repository’s linked hosted project metadata. It excludes the documented data-specific fixture-cleanup migration and applies the candidate schema migrations to a temporary project directory with a distinct project ID and ports.

The orchestration script performs the following steps:

1. create a temporary project copy without `.temp` or linked-project metadata;
2. run `scripts/verify-disposable-supabase-target.mjs`;
3. start/reset only the temporary local project;
4. pass local API keys in process environment only;
5. run `npm run build && npm test` for this proof;
6. stop the temporary project with `--no-backup` and remove only that temporary directory.

No hosted project, production database, production Auth, Storage or secrets are valid targets.
