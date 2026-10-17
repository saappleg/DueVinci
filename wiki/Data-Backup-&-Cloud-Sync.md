# Data Backup & Cloud Sync 🔄

Settings → **Cloud & Backup** provides JSON export/restore and **Sync Pending & Refresh**. A portable file and account synchronization serve different purposes; keep a copy of important work outside browser storage.

## JSON export (`js/modules/backup.js`)

The current payload uses `version: "1.0"` with flat academic arrays and supporting state:

```json
{
  "version": "1.0",
  "app": "DueVinci",
  "exportedAt": "2026-10-16T12:00:00.000Z",
  "data": {
    "courses": [],
    "assignments": [],
    "customEvents": [],
    "timers": [],
    "preferences": {},
    "flashcardMastery": {}
  }
}
```

This empty shape illustrates the actual format, not a complete workspace example. Terms/date preferences are not exported as the invented nested `terms[].courses[]` schema. Course/assignment rows retain their supported stored fields; preferences can include the optional Nursing workspace and study settings.

Academic reads must succeed before downloading. If courses, assignments, or events cannot be read, export reports failure and does not silently download an incomplete academic backup. If cloud flashcard mastery is unavailable, the user can explicitly accept an export using only mastery saved on that device. Only the current account's mastery is collected.

Files are plain JSON, not encrypted by DueVinci. Store them privately; never put real patient information in Nursing practice or its backups. Server-only Canvas/Brightspace connection secrets and billing credentials are not part of this portable format.

## Restore

1. Choose a previously exported DueVinci JSON file.
2. Review the confirmation showing course and assignment counts.
3. Sign in before restoring account-backed records.

Validation checks the expected `data` object and supported collection shapes. Courses, assignments, and custom events are upserted under the current account. Timers/preferences are reapplied locally and flashcard mastery is restored through its account-scoped save flow.

Restore is not a single atomic transaction: a later error can follow successful earlier table writes, and the error reports previously restored tables. It does not wipe all existing work first. Review the account after a partial failure before retrying. There is limited compatibility for older preference keys, not a general versioned schema-migration engine.

## Cloud synchronization

The planner keeps per-user local caches and supported queued writes. Signed-in data is protected by owner-scoped RLS. **Sync Pending & Refresh** replays queued writes first; if changes remain pending, it reports incomplete sync and does not replace the visible state with a cloud refresh. After a successful replay it refetches courses and assignments; calendar events load separately through the Calendar route.

Preferences synchronize through `user_preferences`, including ordinary display settings, the optional Nursing workspace, and opt-in study history. Treat the workspace/history as account data rather than just display preferences. Flashcard mastery merges card updates by review timestamps and retains pending offline progress for later merge. This does not mean every record has general Last-Write-Wins conflict resolution or live realtime synchronization.

See [Offline Support & PWA](Offline-Support-&-PWA), the [readiness map](https://github.com/saappleg/DueVinci/blob/main/docs/FEATURE_READINESS.md), and the [Privacy Policy](https://duevinci.tech/legal/privacy.html) for scope and retention.
