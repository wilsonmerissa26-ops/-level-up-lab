# Data Model v2.2 — Storage Durability Addendum

**Status:** Frozen-topology exception for Patch K acceptance requirements.

## Why this addendum exists

Data Model v2.1 was frozen for Phase 1 topology. Patch K invokes the documented exception for a required behavior that the prior topology could not represent: determining which same-origin learner record is newer, recording how the current learner record began, and recording whether learner evidence was collected while same-origin redundancy was already degraded under an acknowledged override.

This addendum changes only storage/recovery provenance. It adds no learning capability and does not change Track A or Track B learning semantics.

## Learner-state additions

### `schemaVersion`

Current learner-state schema is **2**. Valid schemaVersion 1 learner states/backups are forward-migrated by the v2 reader. Unknown schema versions and records containing prohibited legacy evidence fields are rejected.

### `stateRevision`

Nullable positive integer on learner state.

- Pre-Patch-K records may initially have no revision.
- Missing revision is classified as `UNKNOWN_PRE_REVISION`, not stale/ahead.
- The next successful authoritative save establishes revision 1.
- Each later successful authoritative save writes `lastDurableRevision + 1` into the exact candidate persisted.
- On accepted restore, the base revision is reconciled to the maximum observed valid primary/mirror/restore revision; the subsequent durable save advances to max + 1.

### `learnerRecordOrigin`

Required on schema v2 learner state:

```text
{
  type: NEW | RESTORED_MIRROR | RESTORED_JSON,
  decidedAt,
  priorRecordOffered,
  migratedFromSchemaVersion? 
}
```

This records how the current learner history began. `priorRecordOffered` preserves whether a parent was presented with a prior record/recovery choice before the current history was established.

### `restoredFrom`

Nullable restore provenance object. When present it records the accepted restore source, source schema version, source revision when available, restore timestamp, and v1-to-v2 migration timestamp when applicable.

## Evidence-write provenance addition

### `redundancy_degraded_at_write`

Boolean provenance field for learner evidence records.

Semantics: `true` when the evidence was collected while same-origin redundancy was already degraded and the parent had explicitly acknowledged the override permitting evidence collection. It does **not** claim that a mirror failure discovered during that same write retroactively weakened the academic evidence; such a failure changes the redundancy state for subsequent evidence-producing sessions.

The topology requirement applies uniformly to these conceptual evidence-bearing entities:

- `Attempt`
- `ObservationLog`
- `DerivedGraphEvaluation`

The current Michael pilot materializes learner evidence through the shared evidence-write adapter (`pushEvidenceOnce`), which applies this provenance to concrete evidence records. `ObservationLog` and `DerivedGraphEvaluation` remain model-level entity requirements where/when those entities are materialized by later modules; this addendum does not falsely claim they are separate runtime collections today.

## Same-origin record comparison

Allowed comparison results:

- `UNKNOWN_PRE_REVISION`
- `IN_SYNC`
- `MIRROR_STALE`
- `MIRROR_AHEAD`

IndexedDB is authoritative during normal operation. The localStorage copy is a same-origin synchronization/integrity mirror, not an independent backup against origin eviction.

- `IN_SYNC`: same revision.
- `MIRROR_STALE`: authoritative primary is newer or mirror is missing/invalid; repair mirror from primary when safe.
- `MIRROR_AHEAD`: do not guess. Require an explicit recovery decision.
- `UNKNOWN_PRE_REVISION`: pre-revision bootstrap state; do not label either side stale/ahead solely because revision is absent.

## Four durability layers

1. Home Screen installation: a distinct Safari/WebKit protection mechanism relevant to installed web apps.
2. Storage persistence mode: `navigator.storage.persisted()`/`persist()` status when supported; persistent vs best-effort is recorded as environment state, not assumed.
3. Same-origin integrity: IndexedDB authoritative + localStorage synchronization mirror.
4. External JSON: the only current layer designed to survive total loss of the origin's script-writable storage.

No layer is allowed to claim another layer's guarantee.

## Freeze impact

All prior Data Model v2.1 entities and relationships remain frozen except for the fields explicitly added by this addendum. Future topology changes still require the existing freeze-exception process.
