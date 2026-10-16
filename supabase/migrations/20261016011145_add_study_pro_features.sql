-- Add two optional Pro features to the existing plan. User preferences remain
-- account-scoped in user_preferences; this mapping is checked by the app and
-- the Canvas sync Edge Function.
insert into public.subscription_plan_features (plan_key, feature_key)
values
    ('canvas_sync', 'lms_change_alerts'),
    ('canvas_sync', 'study_plan_calibration')
on conflict do nothing;
