# Testing & CI/CD 🧪

DueVinci uses Vitest for source and behavior regressions, syntax checks for the modules listed in `package.json`, and GitHub Actions for release validation.

## Local commands

```bash
npm test
npm run test:watch
npm run check:syntax
npm run build:css
```

`npm run test:coverage` is defined for environments with the required coverage tooling; it was not part of the October 16 release evidence. Syntax checking is not type checking or a browser execution test.

## Coverage areas

| Tests | Contract covered |
| --- | --- |
| `academic`, `study_plan`, `today`, `weekly_review` | Dates, workload, sequencing, planning boundaries and summaries |
| `courses`, `calendar`, `calendar_conversion`, `term_rollover` | Course behavior, date/file handling, conversion and rollover idempotency |
| `grades`, `timers`, `tutor` | Grade controls, timer states, Tutor loading/reply/error boundaries |
| `sm2_spaced_repetition`, `quiz_backup`, `backup_export` | Review math, portable payloads and export failure handling |
| `nursing`, `degreeThemes`, `preferenceMerge` | Fictional study workspace, theme invariants and validated preferences |
| `settings_accessibility`, `navigationTargets`, `sidebarFocus`, `modalFocus` | Labels, source sizing contracts and focus behavior |
| `scrollAids`, `pwa`, `service_worker`, `offlineDb` | Nested panes, visibility/collisions, local worker exclusion, cache and offline queue contracts |
| `brightspace_calendar_sync`, `canvas_assignment_changes`, `study_calibration` | Feed retirement/error safeguards, assignment change detection and bounded personalization |

These are `tests/*.test.js` files. Source class assertions do not calculate CSS geometry, and DOM stubs do not replace an accessibility-tree or real keyboard check.

## CI and deployment

[CI](https://github.com/saappleg/DueVinci/blob/main/.github/workflows/ci.yml) runs on pull requests and pushes to `main`/`dev`, using Node 24, syntax checks, Vitest, asset checks, and a Tailwind CSS rebuild that fails if the committed generated stylesheet is stale. The [Pages workflow](https://github.com/saappleg/DueVinci/blob/main/.github/workflows/deploy.yml) repeats syntax/tests and the CSS freshness check before publishing.

After deployment, `scripts/release-smoke.mjs` checks public pages, the service worker, manifest, and local assets. With dedicated `DUEVINCI_SMOKE_EMAIL`/`DUEVINCI_SMOKE_PASSWORD` secrets, it also signs in and performs a temporary planner write followed by a cleanup step. Pages and the production monitor currently set `DUEVINCI_SMOKE_SKIP_SUPPORT=true`; support submission is intentionally skipped. Do not use personal credentials or describe a logged cleanup attempt as an independent database deletion check.

## October 16, 2026 release evidence

Application release [c9abb3900f4762cd5109c8064afbf2029d133066](https://github.com/saappleg/DueVinci/commit/c9abb3900f4762cd5109c8064afbf2029d133066), application line 2.8 / shell `duevinci-v8.42`:

- **231 tests in 33 files** passed, plus `npm run check:syntax` and `git diff --check`.
- [Main CI](https://github.com/saappleg/DueVinci/actions/runs/38886005100), [Pages and production smoke](https://github.com/saappleg/DueVinci/actions/runs/38886005054), and [built-in Pages](https://github.com/saappleg/DueVinci/actions/runs/38886005150) passed.
- Signed-in Chrome's full six-section Settings light/dark matrix passed on v8.40. Scrolling reached lower controls; Nursing header artwork and one fictional General Tutor reply were checked.
- v8.41 focused checks verified 393×852 mobile navigation/timer bounds, drawer Tab/Escape/focus return, Grades header width, and Dashboard/Nursing Settings plus Support close focus.
- v8.42 confirmed the main timer's **Start or pause timer** accessible name and 44×44 target. The timer was not started for that check.

The browser was restored to desktop Nursing Overview with Follow System selected. These observations are dated release evidence, not a claim that every mode was rerun on every follow-up.

## October 28, 2026 dashboard and study-activity release

Commit [91afa4a](https://github.com/saappleg/DueVinci/commit/91afa4a2b72de97859e5d3aa5b9581d648601152), application line 2.8 / shell `duevinci-v8.54`:

- **359 tests in 35 files** passed, along with `npm run check:syntax`, `npm run build:css`, and `git diff --check`.
- [Main CI](https://github.com/saappleg/DueVinci/actions/runs/40797400019), [Pages deploy and post-deploy smoke](https://github.com/saappleg/DueVinci/actions/runs/40797400029), [Pages deployment](https://github.com/saappleg/DueVinci/actions/runs/40797399505), and [wiki sync](https://github.com/saappleg/DueVinci/actions/runs/40797399993) passed.
- Signed-in Chrome showed the updated due-date radar and Dashboard completion count (`73 / 73`), matching Weekly Review's completed total (`73`). Up Next and Daily Brief had no open dated coursework in that account, so no live assignment was changed; category inclusion and the timer-free prompt are covered by regression tests.
- The page first displayed the prior cached shell; one reload activated `duevinci-v8.54`. The local `verify:production-release` command could not check its required Production environment variables in this shell; the Pages workflow's release verification and configured smoke test passed.

These checks do not establish manual testing of the Daily Brief dialog against a live incomplete assignment or subscription-history sync across devices.

## Remaining verification boundaries

Purchases, real LMS synchronization, account deletion/credential changes, cross-device workflows, and complete accessibility compliance were not established by that audit. Deno was unavailable locally; backend deployment acceptance and status-only UI checks do not replace Deno type checking or a real provider sync. Nursing checks must always use fictional study content and no patient information.

Follow the [release checklist](https://github.com/saappleg/DueVinci/blob/main/docs/RELEASE_CHECKLIST.md) for additional environment-specific checks.
