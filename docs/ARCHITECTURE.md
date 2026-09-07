# Level-Up Lab v1 — Architecture Lock

## Tracks

### Track A — controlled evidence
Formal diagnostics and mastery evidence. A skill moves through:

`UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED`

Three fresh independent probes may support PROVISIONAL evidence. MASTERED still requires delayed retrieval and transfer. “Cleared” is not “Mastered.”

### Track B — immediate teaching
Used to help Michael now with school recovery and foundational gaps. Every Track B session logs separate frozen evidence dimensions:

- student
- subject
- skill ID
- prompt/item
- raw response
- confidence
- `evidence_class` (`INFORMAL_TRACK_B`)
- `instruction_exposure_status` (`PRIOR_INSTRUCTION`)
- `assistance_level`
- `access_condition`
- interpretation
- timestamp

Free-text support descriptions must not replace the frozen enums. Raw access observations may be stored separately for audit/migration detail.

Any future formal Track A diagnostic on a Track B-taught skill must retain `PRIOR_INSTRUCTION`. It is not a clean cold baseline.

## Learning lanes

Two separate but connected lanes:

1. Core Growth — prerequisite repair, grade-level mastery and acceleration.
2. School Success — actual Murphy Middle School materials, assessments, assignments, grades and teacher evidence.

## Michael support profile

Access sequence:

`SEE IT → MOVE/DO IT → SAY IT → SOLVE IT → EXPLAIN IT → RETRIEVE LATER`

Access supports do not reduce independence when they do not teach the answer. Examples: clean visual layout, one question at a time, extra processing time, exact reread/read-aloud, verbal response, reduced clutter.

Instructional assistance must be logged separately: hints, telling the concept/formula, highlighting correct numbers, worked examples, guided steps or correcting before an answer.

## Persistence requirement

A diagnostic or learning session must not continue if evidence cannot be saved. Every response is committed immediately. Refresh/crash/app closure must not erase completed evidence.

The Michael pilot uses IndexedDB plus a localStorage mirror and JSON export. Health probes must use a key separate from the learner-state key. Startup must validate a disk state before treating it as authoritative and must fall back to a valid local backup before creating fresh state. A managed cloud database can be added later for cross-device sync, off-device recovery, and commercial scale without changing the evidence schema or learner-isolation rules.

## Science 7e skill split

- `SCI.SPS7E.CONCEPT`
- `SCI.SPS7E.SYMBOLS_UNITS`
- `SCI.SPS7E.DELTA_T`
- `SCI.SPS7E.FORMULA_SETUP`
- `SCI.SPS7E.LITERAL_REARRANGE`
- `SCI.SPS7E.CALCULATION`

These are routable skills, not notes under one 7e label.

## Literal-equation prerequisite floor

The route is:

`numeric inverse operations → literal equations → science formula rearrangement → specific heat calculation`

If numeric inverse operations are unstable, do not interpret a higher literal-equation failure as the primary gap.

## Data separation

Student records must be isolated by learner. Shared engine code can be reused across client sites, but evidence, curriculum state, diagnostics, school sources and parent-facing experiences remain separate per learner.

## Track B progress vs canonical lifecycle

Track B activity scores never move the canonical lifecycle by inference. Track B may store a local descriptive field such as `trackBProgress`, but only guarded Track A/domain transitions may write `UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED`.
