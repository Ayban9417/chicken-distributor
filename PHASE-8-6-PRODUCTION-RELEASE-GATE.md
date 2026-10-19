# Production Release Gate (2026-10-19)

**NO-GO. No hosted change or deployment was made during this preflight.** The
project owner confirmed client approval of the recent change scope on
2026-10-19. That approval is recorded against the candidate source commit
`a1ad8d32d0a648f6830fe4fc8e1d2e1f4968681b`; it is not the final
deployment confirmation. A later documentation commit does not change the
candidate application source. Before release, the owner must confirm the
exact SHA again after every mandatory gate passes.

## Targets and change inventory

- Candidate branch: `feature/supabase-frontend`, clean and synchronized with
  `origin/feature/supabase-frontend` at the candidate commit when checked.
- Hosted Supabase: `chicken-distributor-dev`, project
  `ruoqkitfsuuvqkbtires`, organization `knqnrufpakeczonytkbk`,
  `ap-southeast-1`, PostgreSQL `17.6.1.166`; read-only project state was
  `ACTIVE_HEALTHY`.
- Existing Vercel production project: `chicken-distributor-uat`, project ID
  `prj_z8PA4FRRXfsKRg7JcKVTsAvKarsn`, domain
  `https://chicken-distributor-uat.vercel.app/`.
- Current production deployment resolved to
  `dpl_2dmM6UDMuboJNyxd78AadiNh4iYd` (created 2026-10-13 21:19 PHT).
  Vercel CLI inspection did not expose its source Git SHA. Commit `56af374`
  predates this deployment by about one minute and is a **plausible, not
  proven**, source baseline. Confirm the actual deployed revision privately
  before treating the following range as the exact live delta.
- Relative to that provisional baseline, `git diff 56af374..a1ad8d3`
  contains 18 commits and 91 changed files. The complete path-level inventory
  is reproducible with `git diff --name-status 56af374..a1ad8d3`; do not
  infer that the production artifact necessarily matches `56af374`.

The 18 commits in that range cover, in order: Sales/Payment form reset;
correction audit and authorization foundation; Stock In correction; local
Stock In edit visibility; RR and TF corrections; Sale corrections; Payment
corrections; Expense and DCR corrections; DTR, Payroll, and Truck corrections;
isolated database and release-gate tests; Phase 8.3-8.5 recovery documentation;
system-wide numeric-input entry; and the encrypted configuration-backup
record. The release includes nine pending correction migrations (see ordered
list in [Phase 8.4](PHASE-8-4-PRODUCTION-READINESS.md)), six dedicated
correction Edge Functions, frontend/service/UI changes, regression fixtures,
and release/recovery documentation. No broad schema reset, seed, or client
record deletion is in scope.

## Gate results

| Gate | Result | Evidence and remaining action |
| --- | --- | --- |
| Candidate source and hosted targets | PASS | Exact candidate SHA and existing project IDs recorded above; no Git changes at preflight start. Final approval must repeat the SHA after this record is committed. |
| Complete live-delta baseline | BLOCKED | Current Vercel deployment ID is known, but CLI metadata does not prove its source SHA. Operator must attest the deployed source revision or accept a reviewed artifact comparison. |
| Client change-scope approval | PASS | Owner confirmed approval in this task on 2026-10-19, pending documentation against the exact candidate commit. This is not final deployment authorization. |
| Node automated tests | PASS | `npm test`: 204 passed, 0 failed. |
| Isolated database fixtures | PASS for local migrated stack | `supabase test db --local`: 13 files, 331 assertions passed. No hosted correction call was made. |
| Production build | PASS | `npm run build` succeeded. Existing non-failing chunk-size warning remains. |
| Encrypted off-site database archive | PASS for existing snapshot | Private Drive folder contains five `.age` files (1,486,295 bytes); downloaded file hashes matched the Phase 8.5 manifest. |
| Independent application-data restore | PASS with limitation | Prior isolated PostgreSQL 17.6 restore matched 28/28 manifest control totals, RLS/policies, Auth rows, and migration history. This does not reconstruct Supabase-managed platform settings. |
| Recovery-key custody | PASS by owner attestation, not independent vault audit | Owner confirmed one age private key was independently verified in two vaults. Restricted local key file exists. Neither vault copy was inspected here. |
| Encrypted configuration package | PARTIAL | Two sanitized `.age` files remain in a separate private Drive folder and matched independent-download hashes/decryption. The package includes application Vercel settings and non-secret Supabase function metadata, not Auth settings or Edge secret values. |
| Hosted Auth and Edge secret recovery | BLOCKED | An authorized operator said they **will** verify privately. Await actual attestation of hosted Auth URLs/providers/SMTP/MFA/rate limits/JWT custody, Edge secret values in a recoverable vault, and rotation/recovery owners. Never paste values into this record. |
| Full Vercel production configuration/recovery | BLOCKED | An authorized operator said they **will** verify privately. Await actual attestation of domain/build/Git branch/access controls, production project-ref match, and recoverable configuration. The prior sanitized application env export alone is incomplete. |
| Hosted migration compatibility | PASS for current read-only snapshot | Hosted has 12 applied migrations and none of the nine correction migrations. Read-only counts: 4 Auth users, 1 Trip, 14 lots, 14 Sales, 4 Payments, 0 DCRs; no correction/amendment tables; 0 duplicate normalized Trip references; 0 Storage buckets/objects. Recheck immediately before migration. |
| Fresh release-window backup and baseline | BLOCKED | The existing restore proves the older snapshot only. At the agreed maintenance window, take and verify a new consistent encrypted backup and record frozen stock/financial/audit totals before any write. |
| Maintenance and recovery authority | BLOCKED | Name release/rollback operators, maintenance window, allowed write freeze, RPO/RTO, monitoring watch, and recovery decision maker. |
| Final deployment confirmation | BLOCKED | Request explicit owner confirmation of the exact SHA, projects, nine migrations, six functions, Vercel stage, rollback plan, and maintenance window only after all technical gates pass. |

## Operator-only evidence still required

1. In the hosted Supabase Dashboard and approved vault, compare Auth Site URL,
   redirect allowlist, providers, email/SMTP/templates, MFA and rate limits to
   intended production settings. Confirm JWT signing-key recovery or rotation
   ownership. Confirm every required Edge secret value can be restored without
   exporting it to chat, Git, or logs. Record only PASS/FAIL, operator, time,
   and approved vault evidence reference.
2. In the existing Vercel project, privately compare production application
   settings to the intended Supabase project, plus domain, build root/command,
   production branch, access controls, and recovery record. Confirm the
   current deployment's source SHA if available. Record only PASS/FAIL,
   operator, time, and evidence reference.
3. Immediately before any approved release, repeat migration/Trip-reference
   and DCR chronology guards, Storage inventory, Edge configuration, backup
   hash/restore, and business control totals. A changed assumption is NO-GO.

## Controlled release sequence, after a separate final confirmation

Use the exact migration/function order and rollback policy in
[Phase 8.4](PHASE-8-4-PRODUCTION-READINESS.md). Freeze writes if required for
the fresh baseline; back up and independently verify; apply the nine migrations
one at a time with reconciliation; deploy the six correction functions with
JWT, password, role, CORS, and rate-limit checks; deploy the pinned source to
the existing Vercel project; then smoke-test Owner/Admin and Salesman access,
inventory, Sales, Payments, Ledger, DCR, corrections, and numeric inputs.
Reconcile against the baseline and monitor. Preserve every existing live
business record. A frontend-only failure can return to the prior deployment;
an Edge-only failure can restore its prior function source. A committed
database failure requires a reviewed forward fix or a separately approved
isolated restore/cutover, never a blind schema rollback or reset.
