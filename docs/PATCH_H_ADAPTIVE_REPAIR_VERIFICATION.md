# Patch H — Adaptive Prerequisite Repair + Two-Probe Verification

Status: implemented behind the student runtime release gate.

## Closed routing loop

Patch H completes the immediate branch logic that follows a Track A 3-probe diagnostic:

- `3/3 controlled` → `PROVISIONAL` only
- `2/3 controlled` → `GAP` → targeted Track B correction → explicit component verification → `PRACTICING` → 2 fresh `FORMAL_CONTROLLED` verification probes
- `0–1/3 controlled` → recursively trace prerequisite skills until the first unstable skill is found; teach only after the controlled trace identifies the repair target

The route resolver walks the prerequisite chain rather than repeatedly probing the same failed skill.

## Targeted repair stays Track B

Repair teaching uses the same canonical skill ID as Track A but stores:

- `track: B`
- `evidence_class: INFORMAL_TRACK_B`
- `interaction_purpose: INSTRUCTIONAL` for the teaching event
- `interaction_purpose: PRACTICE` for immediate component checks
- `instruction_exposure_status: PRIOR_INSTRUCTION`

This means the later formal verification stays useful but can never be described as a clean cold baseline.

## Canonical lifecycle protection during repair

Starting instruction does not infer a state from a score. The deterministic engine explicitly guards:

- `GAP → LEARNING` only when `instruction_started: true`
- `LEARNING → PRACTICING` only when `smallest_component_verified: true`

For Patch H, `smallest_component_verified` requires every targeted component-check item to be:

- correct
- reliable
- `INDEPENDENT` on the item itself

Prior teaching remains separately recorded as `PRIOR_INSTRUCTION`; it does not force the item assistance level to `TAUGHT` when no in-item help occurred.

## Two-probe formal verification

After the skill reaches `PRACTICING`, the system generates two fresh probes that exclude prior Track A prompt fingerprints. Each verification probe records:

- `evidence_class: FORMAL_CONTROLLED`
- `interaction_purpose: MASTERY_CHECK`
- raw response
- correctness
- freshness
- reliability
- assistance level
- access condition and access source
- prior-instruction status

The deterministic engine evaluates the pair:

- both fresh, reliable, independent, correct → `VERIFICATION_PASSED` and guarded `PRACTICING → PROVISIONAL`
- controlled miss → `VERIFICATION_FAILED`; no promotion
- stale, unreliable, or assisted probe → `INSUFFICIENT_CONTROLLED_EVIDENCE`; replace unusable probes rather than treating them as a learning failure

## Feedback policy

- Track B repair: teaching feedback is allowed after the response is locked.
- Track A verification: no correctness or teaching feedback appears between formal probes.

## Persistence

Diagnostic, repair, and verification sessions all use the same preserved Track A path slot. A crash/reload changes an active path to `INTERRUPTED_PRESERVED`; the user must explicitly resume or end it. Required evidence writes remain fail-stop.

## Release status

`RUNTIME_ENABLED` remains `false`. Michael is still blocked until the separate target-browser persistence audit passes.
