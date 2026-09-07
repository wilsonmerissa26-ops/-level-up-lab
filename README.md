# Michael Level-Up Lab — v1 Foundation

> **AUDIT HOLD — DO NOT USE WITH MICHAEL YET.** Student lesson runtime is hard-disabled until the local persistence path and recovery behavior pass a final synthetic-data audit.

This repository is the permanent foundation for Michael's individualized Level-Up Lab instance and the first reusable pilot of the broader Level-Up engine.

## Product architecture

Michael remains a **separate learner entity/site** with isolated curriculum, evidence, progress, parent views, and school-success data. The long-term commercial direction is a shared reusable Level-Up engine and modular features underneath individualized learner experiences.

Track B is implemented first so Michael can receive immediate school-recovery instruction while Track A controlled diagnostics/mastery logic is added in later slices.

## What is already implemented

- Michael learner profile
- Track A / Track B separation
- Track B Physical Science Unit 1 recovery sequence
- Track B Math bridge for inverse operations and literal equations
- distinct skill IDs for the six 7e subskills
- read-aloud support
- exact raw-response preservation, including `I don't know`
- split evidence dimensions: `evidence_class` and `instruction_exposure_status`
- `INFORMAL_TRACK_B` + `PRIOR_INSTRUCTION`
- frozen six-value `assistance_level` registry
- frozen four-value `access_condition` registry
- observed vs unrecorded access provenance
- immediate per-answer persistence in IndexedDB
- secondary local JSON snapshot in localStorage
- non-destructive persistence health check using a dedicated probe key
- hardened startup recovery
- Track-B-local progress labels that cannot write canonical lifecycle states
- Day 2 / Day 7 / Day 21 review scheduling structure
- Parent View
- Evidence Log
- JSON backup / restore
- fail-stop behavior when a required save fails

## Current storage decision

For the Michael pilot, browser persistence remains the local source of truth while we test the self-contained learner-instance model. A server/cloud database is **not required just to continue building**. Cloud persistence can be added later for cross-device sync, off-device recovery, and commercial scale.

Local persistence must still be treated seriously: a learner session may not continue after a failed required write, health checks may never touch the learner record key, and synthetic crash/reload tests must pass before runtime is enabled.

## Running locally for audit only

This build has no package dependencies.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Student lessons remain disabled in code until the final local-persistence audit passes.

## Commercial direction

The future product should reuse a shared Level-Up core while keeping every learner's experience and data isolated. SAT, Essay Coach, Scholarship Discovery, School Radar, ELA, Social Studies, and future modules should plug into the same engine rather than become separate technology stacks.

Do not commit real student records, credentials, or school-session secrets to this repository. Use synthetic fixtures in code.
