# Production release checklist

Use this checklist after the `main` freeze ends.

## Before release

- [ ] Merge the approved `dev` commits into `main`.
- [ ] Run `npm test`, `npm run check:syntax`, and `npm run verify:production-release` with Production configuration.
- [ ] Review the release diff for secrets, Dev URLs, and mock Canvas settings.
- [ ] Confirm the Production secret vault has `GEMINI_API_KEY` and `GEMINI_TUTOR_API_KEY`.

## Supabase Production

- [ ] Apply the subscription/tutor migration with `supabase db push --project-ref lzmsguzlmjmedlaybckc`.
- [ ] Deploy `tutor` and `gemini-parser` Edge Functions.
- [ ] Deploy any changed Canvas and billing functions.

## Smoke test

- [ ] Sign in with an active or trialing subscription: Tutor opens and uses selected-course notes.
- [ ] Verify an inactive account sees the Tutor/Canvas paywall.
- [ ] Scan a non-sensitive syllabus and confirm the review prompt appears before anything is saved.
- [ ] Confirm Canvas sync, reminders, and workspace visibility preferences work.
- [ ] Verify errors never expose provider responses or API keys.
