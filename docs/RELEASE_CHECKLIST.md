# DueVinci subscription release checklist

## Shared release checks

- Confirm the GitHub Pages deployment workflow passed its post-deploy PWA smoke
  test.
- Authenticated checks use a dedicated disposable production account configured
  through `DUEVINCI_SMOKE_EMAIL` and `DUEVINCI_SMOKE_PASSWORD` repository Actions
  secrets. When those secrets are absent, the script reports that authenticated
  checks were skipped; a public-assets pass does not prove sign-in works.
- The configured deployment and scheduled monitor sign in, create a temporary
  course, and attempt its deletion. Cleanup currently does not assert the DELETE
  response, so confirm the disposable account's rows if cleanup matters to the
  release. Both workflows set `DUEVINCI_SMOKE_SKIP_SUPPORT=true`; support
  submission is intentionally skipped. Test support delivery separately only
  when a test submission has been approved.
- The HTTP smoke test does not click through signed-in Settings. Check the
  Dashboard's static dialog and a nested route's generated dialog: Profile,
  Appearance, Study & Reminders, Cloud & Backup, Privacy & AI, and Subscription.
  Verify light/dark modes, narrow-screen pane scrolling, Tab/Escape behavior,
  and focus return after the Close button. Confirm Back to top neither covers
  controls nor intercepts input while hidden.
- Confirm the `duevinci-privacy-retention` Supabase Cron job is active. It
  deletes browser error events after 90 days and resolved/closed support tickets
  90 days after resolution.

- Promote the reviewed Dev commit to `main`; never copy Test Stripe price IDs or webhook secrets to production.
- Confirm production has Live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, monthly/yearly price IDs, and `APP_URL=https://duevinci.tech`.
- Enable and configure Stripe's Customer Portal (cancellation and plan management) before exposing the portal button.
- Verify one Test checkout end to end: new trial, monthly checkout, yearly checkout, payment failure, cancellation, webhook delivery, and return URL.
- Verify Canvas connect/list/sync with a real personal token; confirm the token is absent from browser-visible profiles data.
- Check Supabase function logs and Stripe webhook deliveries for errors after each test.
- Validate RLS with two accounts: neither account can view the other's courses, profile, or Canvas connection.
- Keep the free planner usable when a subscription is inactive, expired, canceled, or past due.
- Check the opt-in personalized study plan's pause and clear-history controls.
  Its recent-data calculation window does not automatically delete stored study
  history, though each save retains at most the newest 180 focus sessions and
  120 task completions. Verify opted-in Canvas assignment alerts after an explicit
  or scheduled sync, and posted-grade alerts after the first baseline with the
  scheduler, VAPID secrets, and receiving-device browser permission configured.
- Check a valid empty Brightspace feed retires older events for that account
  and provider, while malformed feeds or failed saves do not retire older rows.
  Brightspace remains a calendar feed integration, not a course/grade importer.
- Check course-only term rollover and calendar-event conversion with disposable
  data: old coursework and calendar events remain, and retries avoid duplicates.
- With disposable coursework, confirm new lessons and assignments start out of
  Grades, **Include in Grades** adds the selected row, and turning it off hides
  the row without deleting its saved score or category. Complete a course, enable
  **Hide completed classes**, and confirm the course disappears from Grades,
  cumulative GPA, and term insights; turn the setting off and confirm it returns.


## Nursing Hub and theme checks

- Confirm the Nursing Hub stays hidden until a student enables it in Settings → Appearance; turning it off must preserve saved drafts.
- Build a quick-review session and verify it includes due flashcards, unfinished dosage arithmetic, and anatomy topics not yet marked reviewed. Confirm completion updates the existing study records and that progress is saved locally and synced to the signed-in account when online.
- Verify fictional-only privacy warnings remain visible. Do not add real patient details during testing.
- Open Settings from both the dashboard and Nursing page. Check section switching, Escape-to-close, focus return, modal scrolling, and progress indicators.
- Review the Nursing Hub and degree themes in light and dark modes at desktop and narrow mobile widths; check text, input, link, button, and focus-ring contrast before release.
- Run `npm test -- tests/nursing.test.js tests/scrollAids.test.js` and the full `npm test` suite before publishing.
