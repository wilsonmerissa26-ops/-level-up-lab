# Patch G — Track A Delivery + Formal Evidence Adapter

Status: implemented behind the student runtime release gate.

## What this slice adds

- deterministic 3-probe Math diagnostic delivery for the first six v1 Track A skills
- one probe at a time, with no teaching or correctness feedback between probes
- read-aloud as an access support without automatically changing assistance level
- explicit six-value `assistance_level` capture before a formal probe can be locked
- optional four-value `access_condition` capture with `access_condition_source`
- exact raw-response preservation
- validated parameterized item templates and prompt fingerprints
- per-probe freshness and reliability fields
- crash/reload preservation and explicit resume/end handling
- fail-stop behavior if a required formal-evidence write fails
- parent-facing Track A skill-state table and expanded evidence log

## Canonical evidence vocabulary

Formal Track A probe evidence uses:

- `evidence_class: FORMAL_CONTROLLED`
- `interaction_purpose: DIAGNOSTIC`

These remain separate dimensions. Track B continues to use `INFORMAL_TRACK_B`.

If the same canonical skill has prior Track B instruction, formal evidence stores `instruction_exposure_status: PRIOR_INSTRUCTION` and `cold_baseline_eligible: false`. When no prior instruction is found, the exposure field remains null rather than inventing a second exposure enum value.

## Freshness and reliability

Freshness is evaluated against prior Track A prompt fingerprints for the same skill. Reliability is tied to the validated deterministic template metadata carried by the generated item. Both are stored as separate booleans on the formal probe and consumed by the deterministic Track A engine.

A probe that is not fresh, not reliable, or not `INDEPENDENT` cannot satisfy the controlled 3-probe rule.

## Current Math diagnostic chain

1. `MATH.INTEGER_OPS`
2. `MATH.DISTRIBUTIVE`
3. `MATH.COMBINE_LIKE_TERMS`
4. `MATH.ONE_STEP_EQUATIONS`
5. `MATH.TWO_STEP_EQUATIONS`
6. `MATH.INTRO_INEQUALITIES`

Each non-root skill points to the immediately preceding prerequisite. A 0–1/3 result records the prerequisite target rather than continuing to guess at the failed level.

## Lifecycle protection

The UI never writes a canonical lifecycle state from a raw score. It sends the controlled probe set to `track-a-engine.js`, then uses the engine's guarded transition decision. The diagnostic UI has no path that writes `MASTERED`.

- 3/3 controlled: may move `DIAGNOSTIC → PROVISIONAL`
- 2/3 controlled: moves `DIAGNOSTIC → GAP` and records that two fresh verification probes will be required after minimal correction
- 0–1/3 controlled: moves `DIAGNOSTIC → GAP` and records the prerequisite-trace target
- insufficient controlled evidence: remains `DIAGNOSTIC`

## Release status

`RUNTIME_ENABLED` remains `false`. Patch G implementation tests passing does not clear Michael for student use. The separate target-browser persistence audit remains the release gate.
