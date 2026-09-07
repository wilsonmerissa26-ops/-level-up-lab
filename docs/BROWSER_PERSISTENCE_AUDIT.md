# Browser Persistence Release Gate

Michael must remain blocked from student runtime until this target-device audit passes.

## Why this exists

The code-level regression suite catches destructive key usage, invalid startup fallback, vocabulary leakage, retry hazards, and state-machine violations. It does not prove that the target browser/device actually persists IndexedDB and localStorage correctly across real reloads and user actions.

The browser audit uses a completely separate database and localStorage key:

- IndexedDB: `MichaelLevelUpLab_BROWSER_AUDIT`
- state key: `synthetic`
- localStorage: `MLUL_BROWSER_AUDIT_BACKUP_V1`

It never reads or writes Michael's learner record.

## Target environment

Run `audit-browser.html` in the same environment intended for Michael's use. For the local-only iPad pilot, the final accepted environment is the installed Home Screen web app / standalone environment rather than an ordinary Safari tab.

## Required tests

1. **Non-reload tests**
   - seed writes to IndexedDB
   - seed mirrors to localStorage
   - health check passes
   - health check does not change the learner state key
   - probe cleanup cannot replace learner state
   - serialized writes leave the newest snapshot in both stores
   - true first run creates a valid fresh record

2. **Crash/reload test**
   - writes a synthetic learner record
   - writes the health-check probe under the probe key
   - reloads before probe cleanup
   - confirms the learner record and backup survive unchanged

3. **Invalid-disk fallback reload test**
   - writes a valid synthetic localStorage backup
   - writes an invalid object to the IndexedDB learner key
   - reloads
   - confirms startup selects the valid backup
   - confirms the recovered backup is copied back to IndexedDB without first erasing the backup

## Pass rule

All displayed checks must pass. Any failure keeps `RUNTIME_ENABLED = false`.

Passing this harness is necessary but not sufficient to call the product commercially durable. It only clears the current local-pilot persistence gate. Off-device recovery and cross-device sync remain separate future capabilities.
