# Changelog

All notable changes to the **DueVinci** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.0] - 2026-08-28

### Added
- **Student workspace improvements**: Today’s Focus, weekly workload review,
  manual study-plan scheduling, calendar study blocks, reminders, and a
  customizable dashboard layout that students can declutter and reorder.
- **Personal setup**: first-run onboarding, editable display names, private
  profile avatars, and optional Night Owl or Maestro profile badges.
- **Optional paid study tools**: Canvas LMS sync and a course-grounded
  Socratic Study Companion, with subscription status and renewal details in
  Settings.
- **Production operations**: weekday health monitoring, a release smoke test,
  and a documented Stripe/Edge Function release gate.

### Fixed
- Improved offline planner reliability, preference synchronization, PWA asset
  updates, subscription lifecycle handling, and resilient Tutor/Gemini model
  fallbacks.

### Changed
- Defined and documented the permanent free planning core: course and lesson management, due dates, Smart Study Plan & Workload Balancer, 7-Day Workload & Stress Radar, grades, calendar, timers, and portable backups.
- Updated planner, PWA, architecture, and setup documentation to reflect the current implementation and optional nature of AI and cloud services.

### Security
- Added user-content and external-link hardening, and release checks in the Pages deployment workflow.
- Added daily privacy retention: browser error events expire after 90 days, and
  resolved or closed support tickets expire 90 days after they are resolved.
- Added a post-deploy release smoke test. It verifies public pages and PWA
  assets on every Main deployment; authenticated checks activate only after
  dedicated GitHub Actions secrets are configured.

### Changed
- Free planner data and the application shell are cached per signed-in user for
  offline use, with queued planner mutations replayed after reconnection.
- Non-sensitive preferences now synchronize between signed-in devices.

---

## [1.1.0] - 2026-08-20

### Added
- **Interactive Practice Quiz Mode**: Dynamic 4-choice practice tests generated from syllabus units and coursework milestones with real-time scoring, question streak counters, and instant explanation feedback.
- **3D Card Flip Animations**: Realistic perspective CSS 3D flip effects with full keyboard accessibility (`Space` to flip, `←` / `→` arrows to navigate, and `1`–`4` for confidence rating).
- **1-Click JSON Data Backup & Restore**: Full JSON payload exporter and schema-validated data restoration in Settings for complete student data portability.
- **Enhanced RFC 5545 Calendar Export**: Robust `.ics` schedule generator with unique UIDs, course emojis, and timestamp formatting.
- **PWA Quick Launch Shortcuts**: Native launcher shortcuts in `manifest.json` for Dashboard, Focus Timers, Courses & Syllabus, and Calendar.
- **Real-Time Network Status Indicator**: Non-intrusive floating connection pill indicating offline/cached mode and reconnection events.
- **Automated Test Expansion**: New Vitest suite in `tests/quiz_backup.test.js` validating quiz generation, backup schemas, and `.ics` formatting (29 total tests).

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
