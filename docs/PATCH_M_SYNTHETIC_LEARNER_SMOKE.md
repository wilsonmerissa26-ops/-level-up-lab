# Patch M — Synthetic end-to-end learner-path smoke test

Status: implemented as a test-only release gate. Michael runtime remains disabled.

## Purpose

Patch M performs the post-persistence-gate synthetic learner-path smoke test without touching Michael's learner record. It adds no learning feature and does not enable student runtime.

The browser harness uses its own storage namespace:

- IndexedDB: `MichaelLevelUpLab_SYNTHETIC_E2E`
- state key: `synthetic-e2e`
- localStorage mirror: `MLUL_SYNTHETIC_E2E_BACKUP_V1`
- phase/result keys are also synthetic-only

## Browser smoke path

The target-browser smoke test exercises this sequence:

1. Create and durably save a synthetic learner record.
2. Start a Track B session.
3. Record Track B teaching evidence as `INFORMAL_TRACK_B` + `PRIOR_INSTRUCTION`.
4. Record three practice responses with raw response, session ID, and attempt number.
5. Reload while the session is still `ACTIVE`.
6. Verify the record and mirror survive the reload.
7. Convert the interrupted session to `INTERRUPTED_PRESERVED` and prove it is not auto-resumed.
8. Require a separate explicit Continue action before resuming.
9. Complete the Track B lesson and verify `CHECK_STRONG`, `FRAGILE` memory, three delayed-review tasks, and no canonical Track A mastery write.
10. Generate a fresh Day 2 delayed-review set from the production review engine.
11. Add synthetic prior instruction to a Math skill, then run a perfect three-probe Track A diagnostic through the production Track A engine.
12. Verify the formal result is `PROVISIONAL_SUPPORTED`, not `MASTERED`, and that prior instruction makes the formal evidence not cold-baseline eligible.
13. Reload again and verify the completed learner path, evidence attribution, review schedule, Track A state, primary/mirror synchronization, and monotonic state revision all survive.

## Shared production modules used

The browser harness uses the production modules for:

- curriculum content
- delayed-review generation
- Track A diagnostic generation/checking
- Track A three-probe and lifecycle rules
- evidence session/attempt attribution
- revision helpers
- storage-environment reporting

The synthetic learner orchestration itself is isolated in `synthetic-e2e-core.js` and never targets Michael's production database.

## CI

`tests/synthetic-e2e-m.test.mjs` behaviorally executes the synthetic Track B → interrupted/preserved → explicit resume → completion → delayed review → Track A provisional path using the production content, review, Track A, and state-integrity modules.

Permanent CI also syntax-checks `synthetic-e2e-core.js` and `synthetic-e2e.js`.

## Release invariant

`app.js` must still contain:

```js
const RUNTIME_ENABLED = false;
```

Patch M completion by itself does not unlock Michael. The browser smoke test must also pass in the already-cleared iPad Home Screen / standalone environment before the runtime flag is deliberately changed in a later release decision.
