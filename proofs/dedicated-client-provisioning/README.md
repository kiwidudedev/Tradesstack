# Phase 1Q dedicated-client provisioning proof

`npm run proof` runs the local-only repeatable provisioning proof. It validates the Phase 1O baseline checksum and migration cut, packs the portable client configuration contract, consumes the proven Phase 1M Supplier artifact, creates independently installed temporary client workspaces, provisions Alpha, cleans it up, provisions Beta, cleans it up, and reprovisions Alpha once more.

The proof uses only fictional identities and local disposable Supabase projects on `127.0.0.1`. It never creates hosted infrastructure, writes production state, prints credentials, or commits generated workspaces. Generated application workspaces, package locks, local env bindings, Auth data, and database state live under a guarded temporary root and are removed after each run.

The current application shell is not falsely represented as a published full-app package. The generated client shell is a small independent install/typecheck/build/test harness consuming the portable packages and proving its own Supabase binding. The full Master Next application remains Master-owned template/source material until a later shell extraction or repository-template phase.
