# Production operations

This runbook takes effect when the approved Dev release is promoted to `main`.
The scheduled GitHub Action runs each weekday at 14:00 UTC and checks public
pages, PWA assets, smoke-account sign-in, and one create/delete planner write.
It deliberately does not create recurring support tickets.

## Daily signals

- GitHub Actions: `Production health monitor` must be green.
- Stripe live Workbench: investigate any failed `DueVinci` webhook delivery.
- Supabase: inspect recent `tutor`, `gemini-parser`, `stripe-webhook`, and
  `report-client-error` failures; never copy API keys or provider responses into
  tickets.
- Support inbox: triage new tickets and mark resolved issues closed when done.

## Billing release gate

Do not change the Production Stripe vault during the `main` freeze. On release
day, validate the masked values in the Production Supabase project against the
live Stripe account:

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
4. Apply and verify the fix in Dev first. Promote to Production only under the
   bug-fix exception to the freeze.
