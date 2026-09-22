import { supabaseClient } from './config.js';
import { escapeHtml } from './utils.js';

let cachedSubscriptionSnapshot = null;
let snapshotLoadedAt = 0;
let cachedSnapshotUserId = null;
const SNAPSHOT_CACHE_MS = 20_000;

export const SUBSCRIPTION_CATALOG = Object.freeze({
    planKey: 'canvas_sync',
    name: 'DueVinci Pro',
    trialDays: 30,
    monthlyLabel: '$5 / month',
    yearlyLabel: '$45 / year',
    features: [
        'Canvas LMS connection and course syncing',
        'Assignment importing and due-date updates',
        'Socratic Study Companion with selected-course context and notes',
        'Daily workload summary and next-focus suggestion',
        'Socratic Tutor: up to 30 prompts/day and 250/month (trial: 8/day and 40/month)'
    ]
});

export async function getSubscriptionSnapshot({ forceRefresh = false } = {}) {
    let userId = null;
    try {
        const { data } = await supabaseClient.auth.getSession();
        userId = data?.session?.user?.id || null;
    } catch { /* The Edge Function will report an authentication failure below. */ }
    if (!forceRefresh && userId && cachedSnapshotUserId === userId && cachedSubscriptionSnapshot && Date.now() - snapshotLoadedAt < SNAPSHOT_CACHE_MS) {
        return cachedSubscriptionSnapshot;
    }
    const { data, error } = await supabaseClient.functions.invoke('subscription-status');
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('Unable to load subscription status.');
    cachedSubscriptionSnapshot = data;
    snapshotLoadedAt = Date.now();
    cachedSnapshotUserId = userId;
    return cachedSubscriptionSnapshot;
}

export function clearSubscriptionSnapshot() {
    cachedSubscriptionSnapshot = null;
    cachedSnapshotUserId = null;
    snapshotLoadedAt = 0;
}

export function hasSubscriptionFeature(snapshot, featureKey) {
    return snapshot?.features?.[featureKey] === true;
}

export function applySubscriptionCatalog(root = typeof document !== 'undefined' ? document : null) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-pro-monthly-price]').forEach((element) => {
        element.textContent = SUBSCRIPTION_CATALOG.monthlyLabel;
    });
    root.querySelectorAll('[data-pro-yearly-price]').forEach((element) => {
        element.textContent = SUBSCRIPTION_CATALOG.yearlyLabel;
    });
    root.querySelectorAll('[data-pro-trial-days]').forEach((element) => {
        element.textContent = String(SUBSCRIPTION_CATALOG.trialDays);
    });
    root.querySelectorAll('[data-pro-feature-list]').forEach((element) => {
        element.innerHTML = SUBSCRIPTION_CATALOG.features.map((feature) => `<li>✓ ${escapeHtml(feature)}</li>`).join('');
    });
}
