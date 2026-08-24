-- Socratic Tutor is included in the existing paid Canvas Sync plan.
insert into public.subscription_plan_features (plan_key, feature_key)
values ('canvas_sync', 'socratic_tutor')
on conflict do nothing;
