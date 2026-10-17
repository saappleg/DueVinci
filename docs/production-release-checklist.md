# Production release checklist

Use this checklist for an approved production release. If a `main` freeze is in
effect, confirm that the release fits its authorized exception first.

## Before release

- [ ] Merge the approved `dev` commits into `main`.
- [ ] Run `npm test`, `npm run check:syntax`, and `npm run verify:production-release` with Production configuration.
- [ ] Treat `verify:production-release` as a local environment-value check. It
  validates APP_URL, Stripe key/price-ID shapes, the presence of the Canvas
  encryption key, and disabled Dev/mock flags; it does not query the Supabase
  vault, confirm actual Stripe products, deploy functions, or test live billing.
- [ ] Review the release diff for secrets, Dev URLs, and mock Canvas settings.
- [ ] Confirm the Production secret vault has `GEMINI_API_KEY` for syllabus
  parsing. Tutor prefers a dedicated `GEMINI_TUTOR_API_KEY` and falls back to
  `GEMINI_API_KEY`; verify the intended key and model configuration for each
  function without exposing either value.

## Supabase Production

- [ ] Review pending migration history for the intended environment. Link the
  production project, inspect the dry run, and apply only the approved changes:

  ```sh
  supabase link --project-ref lzmsguzlmjmedlaybckc
  supabase db push --dry-run
  supabase db push
  ```

  The [CLI reference](https://supabase.com/docs/reference/cli/introduction)
  documents `--project-ref` on `link`, not `db push`. Keep Dev and Production
  project links and secrets separate. The migrations extend existing academic
  tables; see the [backend setup notes](../supabase/README.md) before provisioning
  a new project.
- [ ] Before enabling calendar or scheduled Canvas features, verify the
  Production Edge Function secret vault contains `APP_URL`,
  `CANVAS_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`,
  `GOOGLE_CALENDAR_CLIENT_SECRET`, `MICROSOFT_CALENDAR_CLIENT_ID`, and
  `MICROSOFT_CALENDAR_CLIENT_SECRET`. Register this exact callback in both
  Production OAuth clients:
  `https://lzmsguzlmjmedlaybckc.supabase.co/functions/v1/calendar-oauth-callback`.
  Confirm the configured read-only provider scopes using
  [the integration runbook](CALENDAR_INTEGRATIONS.md). Verify values in the
  vault without printing or copying them into logs. Missing or invalid provider
  credentials prevent that provider's calendar connection and sync; a callback
  mismatch prevents OAuth from completing.
- [ ] For scheduled Canvas refresh, verify `CANVAS_SCHEDULER_SECRET` is set as
  an Edge Function secret and that Supabase Vault contains
  `duevinci_project_url` plus `duevinci_canvas_scheduler_secret` with the
  matching scheduler secret. The cron job skips calls when either Vault entry
  is missing, and the worker rejects a mismatched secret; scheduled coursework
  refresh and posted-grade alerts will not run.
- [ ] For Canvas push alerts, verify `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and
  `VAPID_PRIVATE_KEY` in the Production Edge Function secret vault, without
  exposing their values. Without them, push alerts cannot be delivered. Canvas
  assignment rows may still be imported, but a failed posted-grade alert leaves
  its grade snapshot unchanged so a later refresh can retry it.
- [ ] Deploy the functions changed by the approved release after their required
  migrations. Include shared helper/parser changes in the deployed bundle.
  Review Tutor/Gemini, Canvas, Brightspace, billing, and deletion functions as
  applicable; frontend publication does not deploy Edge Functions.

## Smoke test

- [ ] Sign in with an active or trialing subscription: Tutor opens and uses selected-course notes.
- [ ] Verify an inactive account sees the Tutor/Canvas paywall.
- [ ] Parse a non-sensitive PDF syllabus and confirm its native review prompt
  appears before saving. Screenshot import currently saves parsed units after
  the function reply; it does not offer the PDF confirmation or a per-row editor.
- [ ] Confirm Canvas sync, reminders, and workspace visibility preferences work.
- [ ] Check SNHU Brightspace status/connect/sync only with an approved test feed;
  its scope is calendar events, not course records or posted grades.
- [ ] Verify signed-in Settings on the Dashboard and a nested route in light and
  dark modes, including all six sections, mobile scrolling, keyboard navigation,
  Close/Escape focus return, and scroll aids. Check 44px mobile targets for any
  controls changed by the release.
- [ ] Verify errors never expose provider responses or API keys.
- [ ] Record which checks were actually performed. The configured automated
  smoke test covers public/PWA files, optional smoke-account sign-in, and a
  planner write. Support submission is skipped; cleanup sends DELETE without
  asserting its response. It does not exercise Settings, checkout, or real LMS
  sync. See the [shared release checklist](RELEASE_CHECKLIST.md).

## Operations handoff

- [ ] Confirm `Production health monitor` is enabled and its first scheduled or
  manually dispatched run is green.
- [ ] Follow the Production Stripe validation table in `docs/OPERATIONS.md`;
  do not enable billing until each value is confirmed in the live Stripe vault.
- [ ] Confirm the weekday monitoring owner can access GitHub Actions, Stripe
  Workbench, Supabase Edge Function logs, and the support inbox.
