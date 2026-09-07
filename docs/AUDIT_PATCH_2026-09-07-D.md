# Audit Patch D — Track B Save / Resume Slice

Status: implemented, student runtime remains disabled.

## Added

- serialized persistence writes with immutable snapshots so draft autosaves cannot race answer saves
- global manual **Save** action
- lesson-level **Save & Exit**
- in-progress draft capture for teaching explanation, answer, confidence, and access condition
- debounced text draft autosave and immediate autosave for selections/read-aloud access changes
- explicit preserved-session recovery after navigation, reload, or interruption
- explicit **Resume session** and **End session, keep evidence** paths
- active session is no longer cleared during crash/reload recovery
- active session and session history are synchronized by session id
- fail-stop guards now cover start lesson, next-question transition, and lesson completion
- synthetic browser audit harness under `tests/` that uses a separate database and never opens Michael's learner database

## Runtime gate

`RUNTIME_ENABLED` remains `false`.

Passing the Node regression suite is necessary but not enough to enable Michael. Before enabling runtime, run the browser persistence audit in the actual target environment and verify reload/reopen behavior using synthetic data only.

## Evidence safety

Drafts are not evidence. An unsubmitted answer can be preserved for recovery without being written to the evidence log. Evidence is created only after the explicit Submit Answer action succeeds and the required persistence write completes.
