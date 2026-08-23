# DueVinci subscription release checklist

- Promote the reviewed Dev commit to `main`; never copy Test Stripe price IDs or webhook secrets to production.
- Confirm production has Live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, monthly/yearly price IDs, and `APP_URL=https://duevinci.tech`.
- Enable and configure Stripe's Customer Portal (cancellation and plan management) before exposing the portal button.
- Verify one Test checkout end to end: new trial, monthly checkout, yearly checkout, payment failure, cancellation, webhook delivery, and return URL.
- Verify Canvas connect/list/sync with a real personal token; confirm the token is absent from browser-visible profiles data.
- Check Supabase function logs and Stripe webhook deliveries for errors after each test.
- Validate RLS with two accounts: neither account can view the other's courses, profile, or Canvas connection.
- Keep the free planner usable when a subscription is inactive, expired, canceled, or past due.
