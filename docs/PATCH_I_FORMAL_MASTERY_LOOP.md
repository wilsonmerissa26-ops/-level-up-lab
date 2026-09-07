# Patch I — Formal Track A Mastery Loop

Status: implemented behind the student runtime release gate.

## Purpose

Patch I closes the formal Track A loop after a skill reaches `PROVISIONAL`. A provisional result is not allowed to become mastery from an immediate score. The system now schedules and evaluates delayed controlled evidence plus transfer before the canonical lifecycle can advance.

## Formal schedule

When a skill reaches `PROVISIONAL`, the deterministic mastery scheduler creates:

1. Day 2 delayed retrieval
2. Day 7 delayed retrieval
3. separate transfer evidence after Day 2 and Day 7 pass
4. Day 21 maintenance, initially locked

Day 7 stays locked until Day 2 passes. Transfer stays locked until both Day 2 and Day 7 pass. Day 21 stays locked until the guarded mastery transition succeeds.

## Controlled evidence requirements

Each formal checkpoint uses two fresh deterministic probes. A passing set requires every probe to be:

- fresh
- reliable
- `INDEPENDENT`
- correct

Formal evidence stores:

- `track: A`
- `evidence_class: FORMAL_CONTROLLED`
- `interaction_purpose: MASTERY_CHECK`
- evidence subtype for delayed retrieval, transfer, or maintenance
- raw response
- correctness
- checkpoint
- transfer flag
- assistance level
- access condition and access source
- freshness and reliability
- generator template/version metadata
- prior-instruction status

No correctness or teaching feedback appears between formal probes.

## Guarded mastery transition

`PROVISIONAL → MASTERED` occurs only after the mastery scheduler confirms:

- Day 2 controlled retrieval passed
- Day 7 controlled retrieval passed
- transfer controlled evidence passed

The UI does not assign mastery from a score. It passes `delayed_retrieval_passed` and `transfer_passed` into `track-a-engine.js`, and the deterministic lifecycle guard must approve the transition.

Memory strength remains a separate field. Successful delayed retrieval plus transfer can support `STABLE`; later Day 21 maintenance can support `FLEXIBLE` without inventing another lifecycle transition.

## Miss versus unusable evidence

Patch I keeps two failure types separate.

### Controlled miss

If a fresh, reliable, independent formal set contains an incorrect response, the task is `FAILED`. The route returns to targeted Track B repair on the same canonical skill. That teaching is permanently labeled `PRIOR_INSTRUCTION`. After the smallest component is independently verified, the system creates a new fresh formal attempt while preserving the failed evidence.

### Unusable formal set

If a formal set is assisted, stale, or unreliable, the task is `UNUSABLE`, not a learning failure. The system creates a fresh replacement attempt without using the unusable set as a reason to reteach.

No prior task or response is overwritten by a retry.

## Day 21 maintenance

Day 21 is maintenance evidence after mastery, not part of the original mastery declaration. A maintenance pass updates memory evidence. A controlled maintenance miss routes to targeted repair and a fresh maintenance retry while preserving the existing mastery history and failed maintenance evidence for review.

## Persistence and recovery

Formal mastery sessions use the same fail-stop persistence rules as the rest of Level-Up Lab. Required evidence is saved before the session can advance. Interrupted formal mastery sessions are preserved and explicitly resumed or ended.

## Release status

`RUNTIME_ENABLED` remains `false`. Patch I completing successfully does not by itself authorize Michael to use the app. The remaining release gate is the target-browser persistence/reload audit with synthetic data in the actual deployment environment.
