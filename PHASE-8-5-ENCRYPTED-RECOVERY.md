# Phase 8.5 Encrypted Off-Site Recovery

Status as of 2026-10-19 (Asia/Manila): **NO-GO** for a hosted release. This
document records completed local backup work and the uncompleted off-site and
platform recovery gates. It does not authorize a deployment. See
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

## Completed local evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Tool provenance | PASS | Official `age` v1.3.2 and `rclone` v1.75.2 Windows archives were SHA-256-verified before user-only installation outside Git. Supabase CLI v2.117.0 and isolated PostgreSQL 17.6.1.166 tools are available. |
| Phase 8.3 original integrity | PASS | Original `roles.sql`, `schema-v2.sql`, and `data-v2.sql` hashes matched the Phase 8.3 record; files were not modified. |
| Key generation and custody | PASS with operator attestation | An X25519 age identity was generated outside Git with ACL limited to the current Windows user, Administrators, and SYSTEM. The public recipient was shown to the owner, who confirmed two separately verified vault copies. |
| Fresh hosted logical backup | PASS with consistency limitation | Supabase CLI exports completed without write freeze to a new restricted directory. The data export is a single `pg_dump` snapshot; roles and schema exports are separate sessions. Before/after schema hashes matched. This is not one atomic cross-file snapshot. |
| Local encryption and decryption | PASS | Five files were encrypted to the escrowed age recipient. All five ciphertexts decrypted through a streaming SHA-256 verifier without writing recovery plaintext. A deliberately wrong expected hash was rejected. |
| Google Drive OAuth and private destination | BLOCKED | Awaiting explicit account authorization. No rclone remote exists on this machine; no OAuth flow has started. |
| Encrypted off-site upload and independent download | BLOCKED | No remote archive ID, remote hash check, or downloaded recovery copy exists. |
| Isolated restore of the downloaded archive | BLOCKED | The fresh Phase 8.5 archive has not been independently restored. The Phase 8.3 restore is historical evidence only. |
| Platform configuration recovery | BLOCKED | See inventory below; a database SQL export is insufficient. |
| Client release authorization | BLOCKED | No release approval is implied by backup preparation. |

The fresh restricted backup directory is outside the repository at
`%USERPROFILE%\Documents\Chicken Distributor Backups\phase85-20261019T022445PHT`.
The export began at approximately 2026-10-18 18:25:50 UTC. Hosted PostgreSQL
reports version 17.6.1.166. File sizes and SHA-256 hashes below are safe
identifiers, not the backup contents:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 431 | `0decd601faa70260a3a31e8cee63208cc4a4c1f99921bc6f3ed4faf1cd980da3a` |
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
aggregate control totals. The export has quoted COPY sections for Auth users,
stock trips, movements, sales, payments, audit history, and migration records.
Presence in the SQL is not a substitute for an isolated restore.

## Off-site and independent restore procedure (not yet executed)

1. Obtain the owner's explicit Google account authorization. Configure a
   dedicated rclone Google Drive remote in a restricted configuration file
   outside Git, using interactive browser OAuth. Prefer `drive.file` scope so
   rclone can see only files it creates. Do not capture terminal OAuth output.
   Rclone's shared client ID is being retired in 2026; arrange a dedicated
   OAuth client under operator custody rather than relying on it for recovery.
2. Create a private `Chicken Distributor Backups` folder in the approved
   Noderno Drive. Confirm the account and folder permissions privately. Use a
   unique, previously nonexistent subfolder for this run. Never use `sync`,
   `move`, or an overwrite-capable upload. Use `rclone copy` with an `.age`
   include filter and `--immutable`; reject unexpected existing files.
3. Record remote object IDs, sizes, and checksum metadata without listing any
   token or plaintext. Compare ciphertext SHA-256 locally and after a fresh
   download into a separately ACL-restricted recovery directory. Do not rely
   solely on an upload exit code.
4. Decrypt the downloaded `manifest.json.age` and SQL files only inside the
   isolated recovery environment. Run
   [Verify-AgeBackup.ps1](scripts/Verify-AgeBackup.ps1) against each ciphertext
   and the expected plaintext hash before applying SQL. It streams decrypted
   bytes into SHA-256 and does not make a plaintext copy.
5. Restore into a **new disposable PostgreSQL/Supabase 17-compatible database**,
   never into hosted DEV or the existing application database. Follow the
   platform-role handling demonstrated in Phase 8.3. Apply roles, pre-snapshot
   schema, and data in that order with `ON_ERROR_STOP=1`; record every restore
   warning. Do not assume a plain SQL export is a `pg_restore` archive.
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
| Supabase PostgreSQL application schema/data, Auth rows, Storage metadata, migrations | Fresh encrypted local SQL exists; Phase 8.3 isolated restore passed for the earlier generation | **BLOCKED** until this off-site generation is independently restored |
| Supabase project settings and Auth providers/redirects/SMTP/JWT signing custody | Project ref, region, and DB version checked; local `config.toml` is not proof of hosted settings | **BLOCKED**; authorized operator must privately export/attest hosted settings and recovery/rotation procedure |
| Edge Function source and deployment configuration | Source is in Git; hosted deployment list has three existing functions, while correction functions remain undeployed | **BLOCKED** for separate version/JWT/CORS/config attestation and secret custody |
| Edge Function secrets | Names were previously checked read-only, not values | **BLOCKED**; approved secret manager and custodian must attest recovery without printing values |
| Supabase Storage object bytes | Read-only inventory at this check: zero buckets and zero objects; SQL includes metadata, never object bytes | **PASS for current empty state**; recount immediately before release, export bytes separately if nonempty |
| Vercel production environment and domain/build settings | Existing project/domain and `VITE_*` names checked; values are encrypted in read-only listing | **BLOCKED** for private value/ref verification and encrypted recovery record |
| Local app target | `.env.local` mode is Supabase, URL matches the intended project ref, and public key is present (value not printed) | **PASS for local configuration only** |

The database archive does not recreate Storage object bytes, Auth provider
configuration, JWT signing keys, Edge secrets, or Vercel settings. Do not
attempt to export sensitive platform configuration until separately authorized.
[Supabase's backup guidance](https://supabase.com/docs/guides/platform/backups)
describes the Storage byte limitation.

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

**Current recommendation: NO-GO.** Encrypted local backup and key custody are
complete, but off-site upload/download, independent restore, separate platform
configuration recovery, and explicit client release authorization are not.
