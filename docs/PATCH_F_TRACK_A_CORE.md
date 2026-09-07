# Patch F — Track A Deterministic Core

Status: core engine implemented. Delivery UI and evidence adapter are not active yet.

## Purpose

Track A is the controlled diagnostic/mastery lane. This slice implements the deterministic rules before building the student-facing diagnostic UI so UI activity cannot accidentally become the authority for lifecycle transitions.

## Three-probe diagnostic rule

A controlled Track A probe must be:

- fresh
- reliable
- `INDEPENDENT`

Exactly three controlled probes are evaluated together.

- **3/3 correct:** supports `PROVISIONAL` only, unless contradictory evidence is present.
- **2/3 correct:** records a miss and routes to minimal correction followed by **2 fresh controlled verification probes**.
- **0–1/3 correct:** routes downward to the first unstable prerequisite instead of continuing to guess at the same level.
- Any non-fresh, unreliable, or assisted probe makes the three-probe set insufficient for the controlled rule.

## Prior-instruction safeguard

Formal Track A evidence can still be useful after Track B teaching, but `PRIOR_INSTRUCTION` makes the skill ineligible to be interpreted as a clean cold baseline. The engine keeps this distinction separate from whether the formal evidence itself is usable.

## Lifecycle guards

Canonical states remain:

`UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED`

The engine does not accept a raw score as authority for a lifecycle transition. Each transition requires its own explicit evidence condition.

In particular:

- `DIAGNOSTIC → PROVISIONAL` requires the three-probe rule result.
- `PRACTICING → PROVISIONAL` requires fresh two-probe verification after correction/learning.
- `PROVISIONAL → MASTERED` requires both delayed retrieval and transfer.
- `MASTERED → EXTENDED` requires extension evidence.

## Memory remains separate

Memory strength is calculated independently from lifecycle state:

- FRAGILE
- BUILDING
- STABLE
- FLEXIBLE

A memory label never by itself changes a canonical lifecycle state.

## Next slice

Build the Track A delivery/evidence adapter and controlled diagnostic UI around this engine. The UI must capture access condition, assistance level, freshness, reliability, raw response, and prior-instruction status without letting presentation-layer scores bypass the engine guards.
