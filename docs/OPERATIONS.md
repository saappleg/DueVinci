# Production operations

Use this runbook for approved releases and incident response on `main`.
The scheduled GitHub Action runs each weekday at 14:00 UTC and checks public
pages, PWA assets, smoke-account sign-in, and one create/delete planner write.
It deliberately skips support submission in both the deployment and scheduled
monitor workflows. The smoke script attempts to delete its temporary course,
but does not check the DELETE response; its cleanup log is not independent proof
that the row was removed.

The smoke test uses HTTP requests rather than a browser. Verify signed-in
Settings separately on the Dashboard and a nested route: all six sections,
light/dark appearance, narrow-screen scrolling, keyboard navigation, and focus
return after closing. Check Tutor loading/error states and interactive overlays
in the browser when those features change.

## Daily signals

- GitHub Actions: `Production health monitor` must be green.
- Stripe live Workbench: investigate any failed `DueVinci` webhook delivery.
- Supabase: inspect recent `tutor`, `gemini-parser`, `stripe-webhook`, and
  `report-client-error` failures; never copy API keys or provider responses into
  tickets.
- Support inbox: triage new tickets and mark resolved issues closed when done.

## Billing release gate

During a declared `main` freeze, keep Production Stripe vault changes within
the approved release or incident exception. Before a billing release, validate
the masked values in the Production Supabase project against the live Stripe
account. The price IDs below are recorded deployment references, not a live
vault audit; confirm their products, amounts, and active state before reuse.

| Setting | Expected live value |
| --- | --- |
| `STRIPE_MONTHLY_PRICE_ID` | `price_1U7dnRCmvE75t0qr1haLEfJx` ($5/month) |
| `STRIPE_YEARLY_PRICE_ID` | `price_1U7dpKCmvE75t0qrbyVdrNlu` ($45/year) |
| `STRIPE_SECRET_KEY` | Live Stripe secret key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the Production Stripe endpoint |
| `APP_URL` | `https://duevinci.tech` |

Before exposing billing, confirm the Production webhook returns `200` for a
signed Stripe test delivery, then run one live-mode checkout using an approved
internal test account. Do not use Test-mode price IDs or webhook secrets in
Production.

## Incident response

1. Preserve the failing Action run or Stripe delivery ID.
2. Check the matching Edge Function log and identify the first failing layer.
3. Disable only the affected paid entry point if billing or entitlement data is
   unsafe; keep the free planner available.
4. Apply and verify the fix in Dev first. Promote under the approved release;
   during a declared freeze, use its authorized bug-fix exception.

## Release verification record

The October 16, 2026 application release is package **2.8.0**, with PWA shell
**v8.42**. [PR #15](https://github.com/saappleg/DueVinci/pull/15) records the final
timer-label check; [PR #14](https://github.com/saappleg/DueVinci/pull/14) records
the preceding mobile-target and modal-focus checks. Its
[production deployment](https://github.com/saappleg/DueVinci/actions/runs/38886005054)
ran 231 tests across 33 files and passed the public/PWA, sign-in, and planner-write
smoke checks. These checks do not establish live checkout or real LMS sync
coverage; verify those separately when changing billing or provider integrations.
