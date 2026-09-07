# Next implementation slices

1. Finalize and independently audit Michael Track B local persistence with synthetic data: per-answer autosave, manual Save, Save & Exit, crash/reload recovery, backup/restore, and fail-stop on write error.
2. Enable Michael only after the synthetic persistence audit passes.
3. Add delayed-retrieval item generation for Day 2 / Day 7 / Day 21 reviews.
4. Build Track A controlled diagnostics and deterministic mastery transitions without contaminating Track B evidence.
5. Extract reusable learner configuration and module boundaries so Michael remains an isolated instance while the Level-Up core becomes reusable.
6. Add ELA, Social Studies, Study Coach, and School Success / School Radar modules.
7. Add SAT, Essay Coach, Scholarship Discovery, and college-planning modules as reusable Level-Up modules for Aaliyah/Alaya and future learners.
8. Add managed cloud persistence later when cross-device sync, off-device recovery, or commercial scale requires it.

No real learner records, credentials, or school-session secrets belong in Git.
