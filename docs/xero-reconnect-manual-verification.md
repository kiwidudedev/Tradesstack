# Xero reconnect manual verification

Run only after the reconnect migration is deployed and automated regressions pass. This checklist intentionally requires an operator; it must not run in CI.

1. Confirm the target is the `Tradesstack TEST` Xero tenant and the app is running at `http://localhost:3000`.
2. Confirm the Xero developer application registers exactly `http://localhost:3000/api/integrations/xero/callback`.
3. Open **Settings → Integrations** and record the existing connection and latest-attempt summaries without exposing tokens.
4. Click **Reconnect Xero** once.
5. Confirm a new `organization_xero_oauth_states` row exists with `status = redirect_issued`, a correlation ID, connection ID, expiry, and no raw state or authorization code.
6. Confirm the browser reaches Xero and authorize only `Tradesstack TEST`.
7. Confirm the callback returns to Integrations and the attempt becomes `completed`.
8. Confirm connection status is `connected`, health is `healthy`, and tenant ID is `e02deb91-ec91-4269-bf46-a587643da1ef`.
9. Confirm reference/contact/health jobs were queued, but no historical document or attachment job ran because of the callback.
10. Open **Client → John Andrews → Xero Contact** and confirm manual controls are visible.
11. Confirm `Dynamic Tool & Die` remains an active imported candidate and the historical link remains `unlinked_history`.
12. Do not create another Xero Contact. Link only after explicit operator confirmation that this is the correct contact.
13. Re-open Payment Claim `26030-PC-01` and confirm connection and client-contact blockers are reported separately.
14. Confirm no Xero invoice exists and do not export until every readiness item is valid.

Stop if the tenant differs, a historical job runs, a contact/link changes automatically, an external ID changes, or any accounting document is created.
