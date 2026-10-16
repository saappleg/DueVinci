# Changelog

All notable changes to the **DueVinci** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Added an opt-in Nursing Hub with rotation and skills tracking, fictional care-plan practice, synthetic dosage arithmetic, flashcards, anatomy review, and a focused quick-review queue built from existing study progress.
- Added field-specific degree palettes and decorative themes, Sunday/Monday week-start preferences, and responsive dashboard scroll aids.

### Fixed
- Accepted valid singular and abbreviated tablet units in dosage practice while still rejecting mismatched units.
- Opened Settings before optional preference hydration and aligned modal scroll progress with nested Settings and Support panes.
- Kept Nursing Hub practice content visible and readable in light and dark degree themes.

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

## [Unreleased] - 2026-08-23

### Changed
- Documented DueVinci’s permanent free planning core: course and lesson setup, due dates, Smart Study Plan & Workload Balancer, 7-Day Workload & Stress Radar, grades, calendar, timers, and data portability.
- Corrected planner documentation to match its deadline-first, lesson-sequencing, rest-day, and timestamp-aware workload behavior.
- Clarified that AI syllabus parsing and Supabase cloud services are optional integrations.

### Security
- Sanitized Markdown and planner/course display content, and restricted user resource links to HTTP(S).
- GitHub Pages deployment now runs syntax and test checks before publishing.
- Added daily privacy retention: browser error events are deleted after 90 days;
  resolved or closed support tickets are deleted 90 days after resolution.
- Added a post-deploy release smoke test for public pages and PWA assets, with
  optional authenticated sign-in, planner-write, and support-function checks.

### Changed
- Made the PWA shell and free planner data available offline after an initial
  online load; offline planner changes queue for replay after reconnection.
- Synced non-sensitive preferences across signed-in devices.

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
