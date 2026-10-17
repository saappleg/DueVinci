# Changelog

All notable changes to the **DueVinci** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- Replaced the browser-side Tailwind compiler with a generated, pre-cached static stylesheet. CI and the Pages deployment now rebuild the CSS and reject stale committed output.
- Updated Tailwind CSS to 3.4.19 and Vitest to 4.1.12, with compatible transitive dependency updates.

## [2.8.0] - 2026-10-16

### Added
- Added the optional Nursing Hub with rotation and skills tracking, fictional care-plan practice, synthetic dosage arithmetic, flashcards, anatomy review, and a quick-review queue built from existing study progress. Never enter real patient information.
- Added field-specific degree palettes and decorative themes, Sunday/Monday week-start preferences, and responsive dashboard scroll aids.
- Added opt-in Pro study-plan estimates calibrated from focus history, using records from the previous 90 days. The newest 180 focus sessions and 120 task completions are retained; older entries may be dropped.
- Added weighted grade categories, credit-weighted GPA estimates, target-score calculations, and 90-day term insights.
- Added recurring coursework entries, subtasks and partial progress, editable checklists from assignment instructions, reviewed syllabus imports and WGU/Maestro browser-import rows, timed note-based mock exams, and Anki text/CSV exchange. Canvas sync directly imports assignments for selected courses; it does not use the browser importer's row-review flow.
- Added source-checked course excerpts to Socratic Tutor replies, opt-in Canvas assignment and due-date alerts after sync, scheduled refresh, and posted-grade alerts after a baseline. Read-only Google Calendar and Outlook sync imports events once after connection; later syncs are started by the user.
- Added a public feature overview and updated privacy disclosures for connected calendars, Canvas grade snapshots, and optional study-plan history.
- Added Pro sync for SNHU Brightspace calendar feeds.
- Added free course-only term rollover and manual conversion of a calendar event into a linked assignment.

### Fixed
- Accepted valid singular and abbreviated tablet units in dosage practice while still rejecting mismatched units.
- Improved Settings and nested-modal focus and scrolling, mobile sidebar keyboard access, and scroll-aid visibility and placement.
- Added descriptive assignment, grade, and timer controls, enlarged audited mobile navigation targets, and named the main timer toggle for assistive technology.
- Added Tutor loading/retry feedback and pending-reply announcements, and prevented concurrent duplicate submissions.
- Reported backup export/restore failures, preserved partial-restore status, and offered an explicit device-only flashcard-mastery fallback when cloud mastery is unavailable.
- Excluded DueVinci's worker from loopback previews while preserving production PWA caching.
- Prevented account deletion from removing server-held data when cancellation of an existing subscription fails.
- Kept Nursing Hub practice content visible and readable in light and dark degree themes.
- Let a valid empty Brightspace feed retire older imported events while rejecting malformed feeds before changing existing events.

### Changed
- Calendar-to-assignment conversion and term rollover use source identifiers to avoid duplicate records on retries. Rollover copies course setup only; the original term, assignments, and lesson progress remain in place.
- Calendar events converted to assignments remain on the calendar.

## [2.7.0] - 2026-10-12

### Added
- Added class and term search, bulk class-to-term moves, completed-class visibility controls, and searchable/restorable archived terms.
- Added current-week course progress, task effort estimates, protected study dates, and automatic term archiving by date range.
- Added class and term date windows that constrain planned and imported coursework.
- Added live billing reconciliation in settings and retry-safe Stripe webhook processing.

### Fixed
- Kept weekly-paced courses on the current study week and prevented Smart Plan from scheduling onto protected dates.
- Improved billing recovery when a Stripe subscription changes while the profile snapshot is stale.
- Prevented duplicate Stripe webhook delivery from applying subscription changes more than once.
- Preserved completed Canvas assignments on later syncs and reported backup restore failures accurately.
- Scoped preference sync by account and prevented cross-account cached data from being uploaded.

### Security
- Restricted webhook event idempotency records to service-role access and protected them with database functions.

## [2.6.0] - 2026-09-22

### Added
- Added the Pro Daily Brief with deadline counts and a next-focus suggestion.
- Added visible daily and monthly Socratic Tutor allowances with atomic server-side metering.
- Synced flashcard review mastery across signed-in devices and included it in portable backups.
- Added authenticated subscription snapshots, public Pro pricing, and Stripe checkout return handling.

### Fixed
- Escaped stored course, Canvas, assignment, note, resource, and study-plan content before rendering it.
- Kept the grade simulator input focused while recalculating and prevented offline logout from restoring a cached identity.
- Aligned paid feature display with server entitlements and clarified paused billing access.
- Applied account and course deletion cleanup to flashcard mastery and Tutor usage records.
- Restricted profile writes to reminder settings so clients cannot change billing or entitlement fields.

### Security
- Added owner-scoped flashcard mastery and Tutor usage tables, service-role-only quota reservations, and 12-month usage retention.
- Restricted Stripe return URLs to the configured application origin and root route.

## [2.5.0] - 2026-09-21

### Added
- Added reviewable `.ics` imports with duplicate detection and common `EXDATE` support.
- Added keyboard-accessible, mobile-friendly event, course, and Quick Add modals.

### Fixed
- Preserved existing weekly course pacing when editing course settings.
- Rejected impossible calendar dates and stopped silently truncating multi-month manual events.
- Added visible course-setting and Quick Add error status messages.

### Changed
- Clarified the permanent free core and renamed the paid bundle to DueVinci Pro.
- Updated the roadmap and What's New panel with the calendar import and accessibility improvements.

## [2.4.0] - 2026-09-21

### Added
- Added `.ics` calendar import for Google Calendar, Apple Calendar, Outlook,
  and other calendar applications, including recurring and multi-day events.
- Added course pacing profiles for WGU, Maestro, and manual coursework plans.
- Added sequence planning that keeps incomplete coursework in curriculum order.

### Fixed
- Fixed custom calendar event creation and added multi-day manual events.
- Fixed rescheduling so assignment order is deterministic by unit and lesson.
- Fixed dashboard Quick Add so current courses load before adding a task.

## Historical updates (2026-08-23)

### Changed
- Documented DueVinci’s permanent free planning core: course and lesson setup, due dates, Smart Study Plan & Workload Balancer, 7-Day Workload & Stress Radar, grades, calendar, timers, and data portability.
- Corrected planner documentation to match its deadline-first, lesson-sequencing, rest-day, and timestamp-aware workload behavior.
- Clarified that AI syllabus parsing and Supabase cloud services are optional integrations.
- Made the PWA shell and free planner data available offline after an initial
  online load; offline planner changes queue for replay after reconnection.
- Synced non-sensitive preferences across signed-in devices.

### Security
- Sanitized Markdown and planner/course display content, and restricted user resource links to HTTP(S).
- GitHub Pages deployment now runs syntax and test checks before publishing.
- Added daily privacy retention: browser error events are deleted after 90 days;
  resolved or closed support tickets are deleted 90 days after resolution.
- Added a post-deploy release smoke test for public pages and PWA assets, with
  optional authenticated sign-in, planner-write, and support-function checks.

---

## [1.2.0] - 2026-08-20

### Added
- **Modular Multi-Page Architecture**: Reorganized pages into dedicated subdirectories (`/courses`, `/grades`, `/calendar`, `/about`, `/support`, `/privacy`, `/terms`, `/security`) with standalone navigation and the `<duevinci-sidebar>` custom element.
- **SuperMemo SM-2 Spaced Repetition**: Dynamic flashcard engine with interval calculation, ease factor scaling, and active recall mastery tracking.
- **AI Study Planner & Workload Balancer**: Automatic task scheduling and workload distribution calculated from course deadlines and exam weights.
- **Interactive Student Quiz Generator**: Instant multiple-choice and true/false quiz generation directly from markdown course notes.
- **Markdown & LaTeX Equations**: Full formula rendering via KaTeX / MathJax, code syntax highlighting, and Anki/Markdown export.
- **Offline-First Storage**: IndexedDB caching layer (`offlineDb.js`) for seamless offline operation and data synchronization.
- **Audio Synthesizer & Ambient Sound**: Built-in Text-to-Speech (TTS) for flashcards and ambient noise generator (white noise, rain, cafe).
- **Data Portability**: Full JSON backup and restore system with enhanced `.ics` Master Calendar export.
- **Expanded Test Suite**: 43 automated unit tests across 6 Vitest suites verifying academic math, timers, SM-2 logic, markdown parser, and backup schemas.

### Changed
- Upgraded CI workflow runtime to **Node.js v24**.
- Relocated support link and Easter egg utilities to sidebar/command palette.
- Streamlined site header and responsive mobile views.

---

## [1.0.0] - 2026-08-20

### Added
- **AI Syllabus & Schedule Parsing**: Direct extraction of course structure, weekly units, and deadlines using Google Gemini and Supabase Edge Functions.
- **Academic Dashboard & Workload Radar**: Real-time study streak calculation, uncompleted exam countdowns, and 7-day stress & workload forecasting.
- **Grades & GPA Tracker**: Real-time course average computations and dynamic cumulative GPA calculation supporting both 4.0 and 5.0 scales.
- **Multi-Timer Pomodoro Widget**: Floating widget with customizable focus/break intervals, audio alerts, and confetti completion triggers.
- **PWA & Offline Support**: Service Worker caching (`sw.js`) and Web App Manifest (`manifest.json`) supporting standalone desktop and mobile installation.
- **Automated Testing Suite**: Vitest unit tests covering GPA conversion, study streaks, workload classification, and Pomodoro state machine.
- **Automated CI/CD Workflows**: GitHub Actions workflows for syntax validation, asset integrity, test execution, and automated GitHub Pages deployment.
- **Community & Governance**: Comprehensive `SECURITY.md`, `CONTRIBUTING.md`, issue and pull request templates, and funding configuration.

---

## [0.9.0] - 2026-08-15

### Added
- Interactive FullCalendar scheduling with `.ics` export support.
- Course cards with custom color accents and emoji tags.
- Renaissance and dark-mode themes.
