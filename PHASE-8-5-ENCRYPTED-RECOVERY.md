# Phase 8.5 Encrypted Off-Site Recovery

Status as of 2026-10-19 (Asia/Manila): **NO-GO** for a hosted release. The
encrypted off-site application-data backup and isolated restore passed; platform
configuration recovery and release authorization remain open. This does not
authorize a deployment. See
[Phase 8.3](PHASE-8-3-RELEASE-PREFLIGHT.md) and
[Phase 8.4](PHASE-8-4-PRODUCTION-READINESS.md) for the migration rehearsal,
release sequence, and client approval requirements.

## Scope and safety

- Target hosted project: `ruoqkitfsuuvqkbtires` (`chicken-distributor-dev`).
  No hosted business row, migration, Edge Function, or Vercel deployment was
  changed during this backup work.
- Never put SQL, Auth rows, backup manifests, rclone configuration, OAuth
  tokens, database credentials, or age identities in Git, logs, or chat.
- The original Phase 8.3 backup and the new Phase 8.5 files must not be
  overwritten or removed. Temporary plaintext recovery copies require
  separate operator approval before removal.
- The owner attested that one age private key was placed and independently
  tested in two separate vaults. This is a custody attestation, not an
  independent technical audit of either vault. Neither copy belongs in the
  Google Drive backup folder.

## Verification evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Tool provenance | PASS | Official `age` v1.3.2 and `rclone` v1.75.2 Windows archives were SHA-256-verified before user-only installation outside Git. Supabase CLI v2.117.0 and isolated PostgreSQL 17.6.1.166 tools are available. |
| Phase 8.3 original integrity | PASS | Original `roles.sql`, `schema-v2.sql`, and `data-v2.sql` hashes matched the Phase 8.3 record; files were not modified. |
| Key generation and custody | PASS with operator attestation | An X25519 age identity was generated outside Git with ACL limited to the current Windows user, Administrators, and SYSTEM. The public recipient was shown to the owner, who confirmed two separately verified vault copies. |
| Fresh hosted logical backup | PASS with consistency limitation | Supabase CLI exports completed without write freeze to a new restricted directory. The data export is a single `pg_dump` snapshot; roles and schema exports are separate sessions. Before/after schema hashes matched. This is not one atomic cross-file snapshot. |
| Local encryption and decryption | PASS | Five files were encrypted to the escrowed age recipient. All five ciphertexts decrypted through a streaming SHA-256 verifier without writing recovery plaintext. A deliberately wrong expected hash was rejected. |
| Google Drive OAuth and private destination | PASS with OAuth-client caveat | Owner authorized OAuth and confirmed the Noderno account. The `drive.file` rclone remote uses an ACL-restricted config outside Git. The newly created `Chicken Distributor Backups` folder has one owner permission and no public/domain permission. The shared rclone OAuth client was used; replace it with a custodian-managed client for long-term automation. |
| Encrypted off-site upload and independent download | PASS | Five `.age` files, 1,486,295 bytes total, were uploaded with `--immutable` to `Chicken Distributor Backups/phase85-20261019T022445PHT`. Rclone checksum comparison passed. A separate restricted download matched all five ciphertext SHA-256 hashes, and every file has owner-only permission. No plaintext file was uploaded. |
| Isolated restore of the downloaded archive | PASS for application data | All five downloaded ciphertexts decrypted to their expected hashes. Schema and data restored with stop-on-error transactions to a new blank database in a network-isolated PostgreSQL 17.6.1.166 container. All 28 manifest control totals matched; see details below. Platform-managed services need separate recovery. |
| Temporary plaintext cleanup | PASS for approved copies | With separate owner approval, the four plaintext files in the isolated recovery directory and its disposable container were removed. The five downloaded `.age` files and original backups remain. The later configuration export staging files were also removed after separate approval; see below. File deletion is not a guarantee of physical SSD overwrite. |
| Platform configuration recovery | BLOCKED | See inventory below; a database SQL export is insufficient. |
| Client release authorization | BLOCKED | No release approval is implied by backup preparation. |

The fresh restricted backup directory is outside the repository at
`%USERPROFILE%\Documents\Chicken Distributor Backups\phase85-20261019T022445PHT`.
The export began at approximately 2026-10-18 18:25:50 UTC. Hosted PostgreSQL
reports version 17.6.1.166. File sizes and SHA-256 hashes below are safe
identifiers, not the backup contents:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 431 | `0decd601faa70260a3a31e8ce63208cc4a4c1f99921bc6f3ed4faf1cd980da3a` |
| `schema-before.sql` | 408814 | `1d47f59cdb24fc2f6a475637dfdddc53dfe450d33e8b6dfc33ea0f90c3b210c2` |
| `data.sql` | 664891 | `85cbaf872b645af1eeff5a5d4f11617764bf60f865f99bc1c1ee48ec8c6a01ce` |
| `schema-after.sql` | 408814 | `1d47f59cdb24fc2f6a475637dfdddc53dfe450d33e8b6dfc33ea0f90c3b210c2` |
| `manifest.json` | 1993 | `5114db04afdb45fcb6601750364ff5c4fe676bd3055dafd2d211fc6610812923` |

Only these encrypted files may be uploaded:

| Ciphertext | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql.age` | 631 | `cd7d4c6458438e55b62f21d1e3882dc41be0d7ee8e4f1ab3726e34c64245af4f` |
| `schema-before.sql.age` | 409110 | `ce70e8135fe0a64d86dd9a7534e37b0a2e856a71fbc8281d3e268aa4a7779467` |
| `data.sql.age` | 665251 | `77d77c96e4ff1105cd02d5f2715ca050e1c751709198b5894897b15b7776f8ff` |
| `schema-after.sql.age` | 409110 | `e474eb54ef4bfe59e8ac46ec847bf2435612907a735293a727ac3df1ce351c8f` |
| `manifest.json.age` | 2193 | `f8c5f56911caa8b78b714a3b93fea8551772c3580bcb840f424fe18484fac0cb` |

The manifest includes file hashes, snapshot caveats, schema stability, and
aggregate control totals. Its Auth, stock, sales, payment, audit, and migration
data were verified in the isolated restore. The `roles.sql` hash above corrects
a one-character transcription error in the initial runbook; the original file
and encrypted manifest were not changed. Verification was rerun with fatal
errors and passed 5/5 downloaded files.

## Off-site restore evidence

- OAuth config: `%LOCALAPPDATA%\ChickenDistributorBackupTools\rclone-private\rclone.conf`.
  Its directory and file permissions allow only the current Windows user,
  Administrators, and SYSTEM. Rclone may recreate the config file during token
  refresh; the parent ACL remains restricted. No token value was printed.
- Remote: private Noderno Drive folder
  `Chicken Distributor Backups/phase85-20261019T022445PHT`. The folder was
  empty before upload; no existing backup was overwritten or deleted. The
  remote contains exactly five encrypted files and no plaintext SQL/JSON.
- Independent download:
  `%USERPROFILE%\Documents\Chicken Distributor Backups\phase85-recovery-20261019T113002`.
  All five downloaded ciphertext hashes and their decrypted hashes matched.
- Isolated restore: container `cd-phase85-recovery-20261019-1130`, image
  `public.ecr.aws/supabase/postgres:17.6.1.166`, with no network and no
  published port. A new `template0` database `phase85_restore` was blank before
  import. Container copies of schema/data matched source hashes. Schema and
  data each restored with `ON_ERROR_STOP=1` and `--single-transaction`; both
  exited successfully. A second replay into blank `phase85_restore_diagnostics`
  captured diagnostic counts: 0 notices, 0 warnings, 0 errors, and 15 ordinary
  output lines (not printed). The compatible Supabase image
  supplied platform roles, so `roles.sql` was inspected but not replayed over
  cluster roles.
- Reconciliation: 28/28 manifest control totals matched. The restored data
  include 4 Auth users, 20 customers, 1 Trip/14 lines, 14 lots/67 movements,
  14 receiving receipts, 14 Sales, 4 Payments/4 allocations, 511 audit events,
  and 12 migration records. Stock-in was 2,569.3 kg and PHP 349,906.80 cost;
  Sales were PHP 280,910.50; Payments and allocations each PHP 13,200.50.
  Twenty customer balances, 11 collectibles, and 18 ledger entries reconciled
  to PHP 267,710.00 outstanding. Company, warehouse, and salesman stock views
  each reconciled to 0 kg; company inventory cost value was PHP 0.
- Protection metadata: 32/32 public tables have RLS enabled; 55 public
  policies, 12 `api` functions, 239 public constraints, 117 indexes, 28 custom
  public triggers, and one restored sequence-state command were checked. All
  109 foreign keys in the restored application/platform schemas are validated.
- After owner approval, the four recovery plaintext files and exact disposable
  container were removed. The five downloaded ciphertext files remain; an
  independent human verifier has not attested this machine-run restore.

## Repeatable off-site and restore procedure

1. Obtain the owner's explicit Google account authorization. Configure a
   dedicated rclone Google Drive remote in a restricted configuration file
   outside Git, using interactive browser OAuth. Prefer `drive.file` scope so
   rclone can see only files it creates. Do not capture terminal OAuth output.
   Rclone's shared client ID is being retired in 2026. The present backup was
   verified with it, but future automation should use a dedicated OAuth client
   under operator custody. Owner access through Google Drive remains a
   separate recovery route for downloading the encrypted files.
2. Create a private `Chicken Distributor Backups` folder in the approved
   Noderno Drive. Confirm the account and folder permissions privately. Use a
   unique, previously nonexistent subfolder for this run. Never use `sync`,
   `move`, or an overwrite-capable upload. Use `rclone copy` with an `.age`
   include filter and `--immutable`; reject unexpected existing files.
3. Record remote path, sizes, and checksum metadata without listing any token
   or plaintext. Compare ciphertext SHA-256 locally and after a fresh
   download into a separately ACL-restricted recovery directory. Do not rely
   solely on an upload exit code.
4. Decrypt the downloaded `manifest.json.age` and SQL files only inside the
   isolated recovery environment. Run
   [Verify-AgeBackup.ps1](scripts/Verify-AgeBackup.ps1) against each ciphertext
   and the expected plaintext hash before applying SQL. It streams decrypted
   bytes into SHA-256 and does not make a plaintext copy.
5. Restore into a **new disposable PostgreSQL/Supabase 17-compatible database**,
   never into hosted DEV or the existing application database. Inspect the
   roles export and use compatible pre-provisioned platform roles; do not
   replay cluster roles blindly. Apply pre-snapshot schema, then data, with
   `ON_ERROR_STOP=1`; record every restore warning. Do not assume a plain SQL
   export is a `pg_restore` archive.
6. Compare restored table row counts and control totals to the encrypted
   manifest: organization/membership, Auth users, customers, plants, trips and
   lines, lots/movements/custody, sales, payments/allocations, ledger,
   expenses, DCR, DTR, payroll, trucks, audit history, and migration history.
   Check RLS policies, function/grant signatures, sequences, constraints, and
   representative foreign-key joins. Reconcile inventory and customer balances.
   Distinguish managed-platform restore warnings from application-data loss.
7. Have an independent verifier attest remote hashes, restore logs, totals,
   scope, and elapsed restore time. Keep the downloaded ciphertext and any
   plaintext recovery copies restricted until the owner separately approves
   their disposal. Preserve both original backup generations.

See [rclone's Google Drive scope and OAuth documentation](https://rclone.org/drive/)
and [PostgreSQL 17 pg_dump snapshot behavior](https://www.postgresql.org/docs/17/app-pgdump.html).

## Separately recoverable platform inventory

| Component | Evidence | Recovery status |
| --- | --- | --- |
| Supabase PostgreSQL application schema/data, Auth rows, Storage metadata, migrations | Fresh encrypted off-site SQL was independently downloaded, restored, and reconciled as described above | **PASS for application data on a compatible Supabase PostgreSQL image**; not a full platform rebuild |
| Supabase project settings and Auth providers/redirects/SMTP/JWT signing custody | Project ref, region, and DB version checked; local `config.toml` is not proof of hosted settings | **BLOCKED**; authorized operator must privately export/attest hosted settings and recovery/rotation procedure |
| Edge Function source and deployment configuration | Source is in Git; a read-only hosted inventory of three deployed functions, including versions and JWT-verification metadata, is encrypted off-site | **PARTIAL**; source and metadata are recoverable, but hosted CORS/configuration and secret custody need operator attestation |
| Edge Function secrets | Eight hosted secret names were inventoried without saving values; names are encrypted off-site | **BLOCKED**; values require approved secret-manager custody and a recovery/rotation test |
| Supabase Storage object bytes | Read-only inventory at this check: zero buckets and zero objects; SQL includes metadata, never object bytes | **PASS for current empty state**; recount immediately before release, export bytes separately if nonempty |
| Vercel production environment and domain/build settings | A read-only production export matched the intended Supabase project. The three application `VITE_*` settings and selected non-secret project metadata were encrypted off-site and independently downloaded/decrypted. The full export contained a generated OIDC token and was not uploaded; its temporary staging copies were removed. | **PARTIAL**; application settings are recoverable, but complete domain/access configuration and platform-generated runtime credentials need separate operator attestation |
| Local app target | `.env.local` mode is Supabase, URL matches the intended project ref, and public key is present (value not printed) | **PASS for local configuration only** |

The database archive does not recreate Storage object bytes, Auth provider
configuration, JWT signing keys, Edge secrets, or Vercel settings. The separate
configuration package below is incomplete and is not a substitute for platform
secret-manager custody.
[Supabase's backup guidance](https://supabase.com/docs/guides/platform/backups)
describes the Storage byte limitation.

### Configuration backup attempt

With separate owner approval, a read-only Vercel production export and
Supabase function/secret-name inventory were inspected without printing their
values. The three application `VITE_*` settings matched the intended hosted
project; only those settings and non-secret platform metadata were encrypted
to the existing escrowed age recipient. The full Vercel export contained a
generated runtime OIDC token, so its ciphertext was never uploaded. No hosted
settings were changed.

The private Drive destination is
`Chicken Distributor Backups/phase85-config-20261019T161616PHT`. The restricted
local originals are under the same-named directory in
`%USERPROFILE%\Documents\Chicken Distributor Backups`; an independent download
is in `phase85-config-recovery-20261019T162300PHT`. Both downloaded ciphertext
hashes matched their local originals and decrypted to the expected plaintext
hashes without writing a recovery plaintext copy:

| Uploaded ciphertext | Bytes | SHA-256 |
| --- | ---: | --- |
| `application-production.env.age` | 362 | `0968e5ee84cae8a75d5d2855eff0246fe4c7a5990a02b924a95f1d48d345fd3e` |
| `platform-inventory.json.age` | 2071 | `1f5928756e4e7d7fdd270736cb943a4d14ca39baff731aed29c0f11ad546ebb2` |

After explicit approval, the three temporary plaintext staging files and the
unuploaded full-export ciphertext were removed. Only the two sanitized `.age`
files remain in that staging directory. Hosted Auth provider/JWT settings,
Edge secret values, and full Vercel domain/access configuration are not in
this package and remain release blockers.

## Recovery and release gates

- If an encrypted file cannot be decrypted and matched to the plaintext hash,
  stop. Do not rotate or discard the escrowed private key until another
  independently tested recovery path exists.
- If SQL restore or control totals differ, preserve the evidence and stop.
  Do not restore over hosted DEV, disable RLS, or blindly reverse migrations.
- A frontend or Edge-only failure may use a prior compatible deployment.
  A committed schema/data failure needs a reviewed forward repair or a
  separately approved isolated restore/cutover. See Phase 8.4 rollback rules.
- Before any hosted release, repeat the fresh backup and recovery gates,
  migration preflight, environment-value attestation, Owner/Admin and Salesman
  authorization checks, and client release-approval checklist in Phase 8.4.
  Successful tests are not deployment authorization.

**Current recommendation: NO-GO.** The encrypted off-site application-data
backup and isolated restore passed. Separate platform/Auth/Edge/Vercel
configuration and secret recovery, long-term OAuth client custody, an
independent operator attestation, and explicit client release authorization
remain open. No hosted deployment was performed.
