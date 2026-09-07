# Patch J — Independent Audit Release Integrity

Status: implemented behind the student runtime release gate.

## Why this patch exists

An independent reviewer inspected an older/stale snapshot of Level-Up Lab. Several reported gaps were already closed on current `main` (Track A lifecycle/mastery, Save & Exit, null access provenance, guarded finish/next writes, and backup-attempt semantics). The review still exposed three useful release-integrity questions in the current build: strict backup restore validation, rollback of pre-save in-memory mutations when a primary write fails, and explicit attempt/session attribution for evidence.

Patch J closes those current gaps without changing the frozen learning architecture.

## Restore validation

`state-integrity.js` is loaded before `app.js` and defines the supported learner-state schema. Restore now:

- requires `schemaVersion: 1`
- requires a structurally valid Michael learner state
- rejects unknown schema versions
- rejects truncated/foreign states
- rejects legacy evidence keys such as `evidenceStatus`, `independent`, `skillState`, `accessSupport`, and `accessSupports`
- validates and clones before touching live state
- runs a persistence health check before attempting the durable restore
- keeps the previous in-memory state if the restore write cannot complete

Unknown or legacy backups are refused rather than silently migrated into the pilot record.

## Durable-state rollback

The app keeps a deep-cloned `lastDurableState` after a successful primary IndexedDB write. If a later primary write fails, the live in-memory learner state rolls back to that durable snapshot and active session references are rebound to the rolled-back state.

This closes the failure shape where an evidence record could remain only in memory after a failed write and then affect a retry or score.

IndexedDB remains the pilot source of truth. The localStorage copy is a secondary mirror. A mirror failure is surfaced separately from a primary persistence failure rather than pretending the primary write failed.

## Evidence attribution

Every evidence record written through the common evidence adapter now receives:

- `sessionId`
- `attemptNumber`
- `session_mode`

Attempt numbering is stable within a session and increments across repeated sessions for the same mode + skill. Evidence history remains append-only/retry-safe via stable evidence IDs.

The parent evidence table now exposes Attempt and Session fields for auditability.

## Access provenance

Unrecognized or unobserved access remains `null`; it is never inferred as `SELF_READ_SILENT`. The helper regression explicitly tests this behavior.

## Tests added

`tests/release-integrity-j.test.mjs` adds behavioral checks for:

- valid current-schema restore acceptance
- truncated backup rejection
- foreign learner rejection
- unknown schema rejection
- legacy-field rejection
- clone isolation during restore validation
- unobserved access remaining null
- explicit session linkage and incrementing attempt attribution
- stable attempt attribution on retry
- release lock remaining false

The permanent Level-Up audit workflow now runs this regression in addition to all Patch D–I tests.

## Release status

`RUNTIME_ENABLED` remains `false`.

Patch J does not clear the iPad release gate. The next release step remains the synthetic browser persistence harness on the target iPad Home Screen environment, followed by a synthetic end-to-end learner run. Michael is not enabled until those empirical checks pass.
