# Hosted-development test credentials

Supply these variables manually in a private shell environment or approved CI secret store. No local environment file is automatically loaded or changed by the credential helper. Do not commit values.

- `HOSTED_TEST_OWNER_EMAIL`
- `HOSTED_TEST_OWNER_PASSWORD`
- `HOSTED_TEST_MANAGER_EMAIL`
- `HOSTED_TEST_MANAGER_PASSWORD`

Stage 6 cohort2 and Stage 7 corpus scripts require both accounts. Stage 6 cohort1 requires only the owner account. The Stage 6 rollback script and hosted browser test require only the owner account. Missing or blank values fail before any client creation or authentication. Passwords are passed unchanged; emails are normalized for case-insensitive account lookup.

The owner must be the existing fixture administrator; Stage 7 expects the existing fixture project manager. Stage 6 can create the manager account if absent, using the supplied manager password, then attach its fixture membership. It does not reset an existing account password.

Existing Supabase URL/key environment variables, mutation acknowledgements, exact project/user/organization identity checks and hosted Playwright configuration still apply. Fixed IDs and project references are non-secret target restrictions, not credentials; they remain to prevent silently redirecting the fixture operations to another target. Fixture display names remain ordinary non-secret labels.

This configuration does not authorize running hosted tests. The credential-remediation tests use synthetic data and mocked clients only. The local E2E suite has a separate localhost-only target guard and is not converted into a hosted runner by these variables.

## Local fixture account

Two local E2E files previously repeated a hosted password. They now obtain the local fixture password through `LOCAL_E2E_OWNER_PASSWORD`, supplied manually in private `.env.test.local` or the test process environment. Choose a separate local-only value. The supplier-invoice fixture helper checks its existing localhost target guard before reading this required password and before creating a client. Its existing create/update fixture-account behavior is retained on the guarded local target. Payment-claim visual tests consume that same fixture context instead of carrying another password literal. No real environment file or account was changed by this repair.
