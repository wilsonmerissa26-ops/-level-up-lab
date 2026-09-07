# Next implementation slices

1. **Implemented in Patch D:** Track B local persistence/usability: per-answer persistence, draft autosave, manual Save, Save & Exit, crash/reload recovery, backup/restore, serialized writes, and fail-stop transitions.
2. Run the synthetic **browser** persistence audit in the target environment. Enable Michael only after it passes.
3. **Implemented in Patch E:** fresh deterministic Day 2 / Day 7 / Day 21 delayed-retrieval reviews with Day 21 transfer evidence, retry-safe evidence IDs, and memory-layer updates only.
4. Build Track A controlled diagnostics and deterministic mastery transitions without contaminating Track B evidence.
5. Extract reusable learner configuration and module boundaries so Michael remains an isolated instance while the Level-Up core becomes reusable.
6. Add ELA, Social Studies, Study Coach, and School Success / School Radar modules.
7. Add SAT, Essay Coach, Scholarship Discovery, and college-planning modules as reusable Level-Up modules for Aaliyah/Alaya and future learners.
8. Add managed cloud persistence later when cross-device sync, off-device recovery, or commercial scale requires it.

No real learner records, credentials, or school-session secrets belong in Git.
