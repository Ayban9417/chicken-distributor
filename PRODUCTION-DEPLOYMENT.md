# Production Deployment Runbook

This runbook is preparatory. Do not execute it without explicit production authorization.

## Deployment Sequence

1. Obtain signed client UAT approval and resolved policy decisions.
2. Create a dedicated Supabase PROD project in the approved organization and region.
3. Record PROD project ownership, support contacts, RPO/RTO, and maintenance window.
4. Configure Auth: signup policy, password minimum, leaked-password protection, redirect URLs, and rate limits.
5. Link the CLI to PROD, verify the project reference twice, and run `supabase db push --dry-run --linked`.
6. Apply migrations with `supabase db push --linked`. Do not run `supabase db reset` or the DEV seed.
7. Deploy `username-login` with JWT verification disabled only because it performs credential exchange and its own validation. Deploy `manage-salesman-account` with JWT verification enabled.
8. Configure Edge secrets: `ALLOWED_ORIGINS`, `INTERNAL_AUTH_DOMAIN`, and platform-supplied Supabase keys. Never place service-role credentials in frontend variables.
9. Run database security/performance advisors and the hosted role/security checks.
10. Create the initial Owner/Admin through a controlled one-time procedure; deliver the temporary password out of band and require immediate change.
11. Import approved master/opening data per `GO-LIVE-DATA-IMPORT.md`.
12. Reconcile inventory, acquisition value, customer balances, users, and document counters.
13. Configure frontend PROD variables with the PROD URL and publishable key only.
14. Run `npm test` and `npm run build`; deploy the immutable `dist` artifact.
15. Run production smoke tests for login, Stock In, transfers, Sale, Payment, Expense, DCR, DTR, reports, logout, and deactivation.
16. Repeat inventory, ledger, outstanding, and DCR reconciliation.
17. Obtain client production sign-off.
18. Verify the first backup and monitoring signals.

## Rollback

- Frontend: redeploy the previous immutable artifact and retain current database state.
- Edge Function: redeploy the previous function version and retest Auth/account operations.
- Database: stop writes, preserve logs, and prefer a reviewed forward-fix migration. Restore only under the approved recovery procedure when forward repair is unsafe.
- Opening data: do not manually delete partial imports. Use the batch manifest and reviewed cleanup/restore procedure, then repeat reconciliation.

## Monitoring

Use Supabase logs/advisors and hosting-platform logs first. Alert or review:

- frontend uncaught errors and failed route loads
- Edge Function 4xx/5xx rates and execution failures
- Auth failures and repeated login throttling
- Postgres errors, lock timeouts, constraint violations, and slow queries
- failed Stock In, transfer, Sale, Payment, Expense, DCR, and DTR commands
- inventory discrepancies and post-DCR adjustments
- backup failures and restore-test results

Avoid adding paid third-party monitoring until retention, alerting, or correlation needs exceed existing platform capabilities.

## Release Record

Record the Git commit, migration list, Edge Function versions, frontend artifact checksum, environment variable names (not values), import manifest checksum, test results, approvers, deployment timestamps, and rollback owner.
