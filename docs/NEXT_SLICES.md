# Next implementation slices

1. **Implemented in Patch D:** Track B local persistence/usability: per-answer persistence, draft autosave, manual Save, Save & Exit, crash/reload recovery, backup/restore, serialized writes, and fail-stop transitions.
2. **Implemented in Patch E:** fresh deterministic Track B Day 2 / Day 7 / Day 21 delayed-retrieval reviews with transfer evidence, retry-safe evidence IDs, and memory-layer updates only.
3. **Implemented in Patch F:** deterministic Track A three-probe rules, two-probe verification, prerequisite tracing, prior-instruction protection, lifecycle guards, and the delayed-retrieval + transfer mastery requirement.
4. **Implemented in Patch G:** controlled Track A diagnostic delivery and formal evidence adapter with raw response, assistance, access, freshness, reliability, and prior-instruction provenance.
5. **Implemented in Patch H:** adaptive prerequisite routing, targeted Track B repair, explicit component verification, and two fresh formal verification probes before `PROVISIONAL`.
6. **Implemented in Patch I:** formal Day 2 and Day 7 delayed retrieval, separate transfer checks, guarded `PROVISIONAL → MASTERED`, Day 21 maintenance, controlled-miss repair/retry, and unusable-probe replacement.
7. **Release gate next:** run the synthetic browser persistence/reload audit in the exact target deployment environment. Michael remains blocked until all target-device checks pass.
8. **After the release gate:** perform a synthetic end-to-end learner-path smoke test, then deliberately switch student runtime on for Michael's pilot.
9. **Then extract reusable learner configuration and module boundaries** so Michael remains an isolated learner instance while the Level-Up core can power Aaliyah, Alaya, AStarryia, and future client sites.
10. Add ELA, Social Studies, Study Coach, and School Success / School Radar modules.
11. Add SAT, Essay Coach, Scholarship Discovery, and college-planning modules as reusable Level-Up modules.
12. Add managed cloud persistence later when cross-device sync, off-device recovery, or commercial scale requires it.

No real learner records, credentials, or school-session secrets belong in Git.
