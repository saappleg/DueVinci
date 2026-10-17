# Product Roadmap 🗺️

The canonical roadmap is [ROADMAP.md in the repository](https://github.com/saappleg/DueVinci/blob/main/ROADMAP.md). This wiki summary records shipped scope and separates it from future work. Updated October 17, 2026 for the 2.8 application line and PWA shell `duevinci-v8.50`.

## Free core commitment

Course and term setup, lessons and deadlines, Smart Study Plan, workload radar, weighted grade categories, credit-weighted GPA estimates, target-score calculations, calendar events and `.ics` import/export, timers, and portable backups remain free. The optional Nursing Hub and degree themes are free. AI and connected-provider services have separate requirements.

## Shipped

- Classes/terms with date windows, search, archive/restore, bulk moves, effort estimates, and protected study dates.
- Free term rollover that copies class shells while retaining the old term's coursework.
- Free calendar-to-assignment conversion with duplicate checks and the original event preserved.
- Reviewed `.ics` file import, date-based export, planned study blocks, and common recurrence/exception handling.
- Optional Nursing Hub, quick review, and field-specific themes. Nursing scenarios and arithmetic are fictional only; no patient information or patient-care use.
- Note-derived quizzes/flashcards, account-scoped mastery synchronization, and portable backups.
- Pro Canvas course/assignment sync, SNHU Brightspace calendar sync, Socratic Study Companion, and Daily Brief.
- Free weighted grade categories, credit-weighted GPA estimates, target-score calculator, and 90-day grade insights. Estimates use linear percentage scaling and do not reproduce every institution's letter-grade or repeat-course rules.
- Free recurring coursework, parent/subtask progress, editable checklist suggestions, reviewed syllabus/import rows, timed note-based mock exams, and Anki text/CSV exchange. Canvas sync imports assignments directly for selected courses.
- Pro opt-in study-plan calibration and Canvas assignment/due-date alerts after sync. Browser push permission and backend configuration are required.
- Pro read-only Google and Outlook calendar sync. The first sync runs after connection; later syncs are user-started.
- Pro opt-in scheduled Canvas refresh and posted-grade alerts. Scheduler secrets, Web Push configuration, and browser permission are required for delivery.
- Settings/Support scrolling and focus repairs, audited mobile navigation/timer touch targets, Tutor status feedback, scroll-aid collision/visibility fixes, and local-preview worker exclusion.

## Planned or exploratory

- Blackboard/Moodle integrations need separate provider authorization and mapping.
- Calendar-conflict-aware replanning, broader analytics, rich-media/Anki package features, live collaborative study rooms, and native packaging.
- Realtime timer/study-state synchronization and external note-system/plugin integrations.

These items are not available merely because they appear on this page. See the canonical roadmap for priorities and prerequisites.

## Current boundaries

Brightspace sync imports calendar entries, not automatic classes or planner tasks; explicit event conversion is available. Cached planner features work offline after successful caching, while authentication and external services require connectivity. DueVinci supports category-weighted course averages and credit-weighted GPA estimates using linear percentage scaling; it does not implement each institution's letter-grade conversion, honors weighting, or repeat-course rules. Google/Microsoft OAuth, scheduled Canvas refresh, and push alerts require operator credentials and service configuration before they can operate.

Release evidence and limits are in [Testing & CI/CD](Testing-&-CI-CD) and the [changelog](https://github.com/saappleg/DueVinci/blob/main/CHANGELOG.md). Source tests, public smoke checks, and manual signed-in checks establish different kinds of coverage; they do not prove every external workflow.
