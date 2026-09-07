# Patch K — Origin Durability + Revision Integrity

**Release status:** implementation candidate only. Michael remains runtime-locked until permanent CI passes on the merged commit and the real iPad/Home Screen browser audit passes.

## Purpose

Patch K closes the remaining storage/recovery release-blocker class without adding learning features. It strengthens the local-first Michael pilot against ambiguous same-origin recovery, pre-revision records, old JSON backups, and unexamined browser persistence state.

## Four-layer durability model

### 1. Home Screen installation

The iPad release procedure tests the installed/standalone environment separately from an ordinary Safari tab. Installation is treated as its own protection layer and is not used as evidence that persistent storage mode was granted.

### 2. Persistent-storage mode

The app checks `navigator.storage.persisted()` when available and reports one of:

- `PERSISTENT`
- `BEST_EFFORT`
- `UNKNOWN_OR_UNSUPPORTED`

A request through `navigator.storage.persist()` is available only from a deliberate parent-facing button on the Backup screen. Patch K never calls `persist()` from `init()`.

### 3. Same-origin synchronization/integrity

IndexedDB is authoritative during normal operation. localStorage is a same-origin mirror used to detect/repair split-write, stale-mirror, and some primary-corruption/recovery conditions. The mirror is not described as protection against total origin eviction.

Mirror readback verifies the same-session candidate and revision written to localStorage. It does not claim future durability.

### 4. External JSON

Portable JSON export is the only current off-origin layer. A successful browser download cannot be proven by JavaScript, so the UI records the export **attempt**, not a guaranteed durable external copy.

## Revision rules

- Schema v2 adds `stateRevision`.
- Pre-K valid v1 records may load/migrate without a revision.
- Missing revision yields `UNKNOWN_PRE_REVISION`, not a stale/ahead verdict.
- The next successful primary save establishes revision 1.
- Later durable saves increment from `lastDurableRevision`.
- Revision is assigned to the immutable candidate before the authoritative IndexedDB write.
- localStorage mirrors the same candidate/revision after primary success.

## Restore reconciliation

Accepted restore candidates are compared against all valid observed revisions. Restore preparation carries the maximum observed revision as its base; the durable restore save then advances to max + 1.

Schema v1 JSON remains recoverable through an explicit forward migration included in Patch K. Unknown schema versions, truncated/foreign learner records, and prohibited legacy evidence fields remain rejected.

Restore provenance records:

- `learnerRecordOrigin`
- `restoredFrom`
- source schema version
- source revision when available
- migration timestamp for v1 backups

## Recovery decisions

Patch K does not silently choose a learner history in ambiguous cases.

### No valid primary or mirror

The app presents an explicit first-run/recovery choice:

- Restore JSON backup
- Start a new learner record

It does not silently treat total same-origin loss as a true first run.

### Mirror unexpectedly ahead

The app stops automatic learner loading and requires an explicit parent recovery decision rather than choosing the higher or lower revision on its own.

### Interrupted session

An `ACTIVE` session found after reload becomes `INTERRUPTED_PRESERVED`. The user must explicitly Resume or End while keeping evidence. Patch K does not auto-resume.

## Degraded same-origin redundancy

If the primary remains healthy but the mirror is degraded, evidence-producing sessions are blocked by default. A parent can explicitly acknowledge the degraded-redundancy override from the Backup screen.

Evidence collected while that override is already active receives:

`redundancy_degraded_at_write: true`

This field records persistence conditions, not academic quality.

## Browser audit update

The synthetic browser harness still uses a separate IndexedDB database and localStorage namespace. It now tests:

- revision 1 bootstrap
- monotonic serialized revisions
- primary/mirror revision equality
- pre-revision `UNKNOWN_PRE_REVISION`
- explicit first-run decision when both stores are absent
- health-probe isolation
- crash/reload preservation with `INTERRUPTED_PRESERVED`
- explicit resume/end semantics rather than automatic resume
- invalid-primary / valid-mirror recovery and revision advance
- browser-tab vs Home Screen/standalone environment state
- `PERSISTENT`, `BEST_EFFORT`, and `UNKNOWN_OR_UNSUPPORTED`

The persistence request itself is only activated by a user button.

## CI

Patch K adds behavioral tests for storage API fakes and revision/migration logic, plus integration assertions tying those helpers into the app/browser harness. Earlier D–J regressions remain in the suite.

## Remaining empirical gate

Passing CI does not prove iPad/Safari durability. After merge, the final release procedure must run the synthetic browser audit on the target iPad, including the Home Screen environment, reload/recovery scenarios, and recorded persistence state. `RUNTIME_ENABLED` remains `false` until that gate passes.
