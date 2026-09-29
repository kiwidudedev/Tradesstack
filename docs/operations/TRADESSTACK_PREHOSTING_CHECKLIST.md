# TradesStack pre-hosting owner checklist

This checklist is the local gate only. It never grants external authorization.

- [ ] Client identity and fictional/no-customer-data scope recorded.
- [ ] Approved release manifest and provenance validate.
- [ ] Toolchain matches the declared contract.
- [ ] Client registry validates and contains no secrets.
- [ ] Database baseline/checksum and repository migration preflight pass.
- [ ] Client configuration contract is identified.
- [ ] Secret/public-env/service-role safety review passes.
- [ ] Support, incident, recovery and export/offboarding runbooks exist.
- [ ] Recovery keeps Postgres/Auth and Storage object recovery separate.
- [ ] Security/supply-chain checks and focused tests pass.
- [ ] Local command reports technical preconditions.
- [ ] Owner separately records provider, account, region, budget, RPO/RTO,
      retention, support and legal decisions.
- [ ] Exact external authorization is still required before any provider login.
