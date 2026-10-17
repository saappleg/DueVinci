# Developer Guide & Contributing 🛠️

Use the repository's [CONTRIBUTING.md](https://github.com/saappleg/DueVinci/blob/main/docs/CONTRIBUTING.md) and applicable `AGENTS.md` instructions for the working checkout. Preserve existing architecture, user work, styling tokens, and privacy boundaries.

## Code organization

DueVinci uses native ES modules and static HTML routes. A static HTTP server can run the app without bundling. Local vendor assets provide Tailwind, FullCalendar, PDF.js and related browser libraries.

| Area | Main files |
| --- | --- |
| Bootstrap and shared UI | `js/app.js`, `ui.js`, `components.js`, `scrollAids.js` |
| Courses and planning | `courses.js`, `academics.js`, `studyPlan.js`, `courseDates.js`, `termRollover.js` |
| Study tools | `flashcards.js`, `grades.js`, `timers.js`, `studyCalibration.js`, `nursing.js` |
| Integrations | `tutor.js`, `subscription.js`, `canvas.js`, `brightspace.js`, `lmsAlerts.js` |
| Account and persistence | `auth.js`, `preferences.js`, `preferenceMerge.js`, `offlineDb.js`, `backup.js`, `pwa.js` |
| Themes and helpers | `degreeThemes.js`, `markdown.js`, `utils.js`, theme CSS |
| Backend | `supabase/functions/` and reviewed migrations in `supabase/migrations/` |

Module names above refer to `js/modules/` unless otherwise shown. Keep pure scheduling/math/parser helpers testable, and keep external service calls at explicit boundaries.

## Development workflow

1. Inspect the actual checkout, status/diff, full relevant source, documentation, tests, and theme styles before changing behavior.
2. Name the exact files and intended scope. Preserve unrelated changes and use a topic branch.
3. Reuse existing helpers/components. Make the smallest complete fix; do not add an unimplemented feature to make a document true.
4. Run relevant checks when implementation verification is requested. For documentation-only work, inspect links, source accuracy, and the diff; do not describe old test results as a new test run.

```bash
npm run check:syntax
npm test
```

For example, naming/target changes have focused regressions in `tests/navigationTargets.test.js`; focus changes have `tests/sidebarFocus.test.js` and `tests/modalFocus.test.js`. Add source/behavior regressions appropriate to changed implementation. Do not weaken failing checks.

## UI and accessibility verification

Check Dashboard, Classes, Grades, Calendar, Nursing, and Tutor routes when affected. Verify light/dark appearance, narrow layouts, computed target bounds, keyboard entry/Tab/Escape/focus return, and visible loading/error/empty states. Source classes and DOM stubs do not prove real CSS geometry or complete WCAG compliance.

Settings has both a static dashboard copy and injected nested-route copies. Verify both where relevant. Scroll aids must stay inside the active pane and avoid controls; hidden aids must not intercept pointer input. Local loopback previews deliberately remove DueVinci's worker; use a hosted environment for installation/offline checks.

## Backend and privacy boundaries

Read the current function/schema and official provider documentation before changing an integration. Keep provider/privileged secrets server-side and preserve ownership checks/RLS. Review database migrations and deployments explicitly; running frontend checks is not a backend deployment or Deno type check.

Nursing scenarios must be fictional. Never use real patient information, real coursework mutations, purchases, or destructive account actions as incidental audit data. Use authorized disposable accounts and report what remains unverified.

## Pull request checklist

- Describe exact behavior, files, and source evidence.
- Record checks actually run, failures encountered/resolved, manual coverage, and remaining limits.
- Update relevant docs/wiki without inventing shipped functionality.
- Follow the [release checklist](https://github.com/saappleg/DueVinci/blob/main/docs/RELEASE_CHECKLIST.md) and [Testing & CI/CD](Testing-&-CI-CD) before an authorized release.
