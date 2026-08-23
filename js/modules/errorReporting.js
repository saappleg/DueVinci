// --- PRIVATE SUPABASE ERROR REPORTING ---
import { supabaseClient } from './config.js';

const recentReports = new Set();

export async function reportAppError(error, source = 'browser', metadata = {}) {
    const message = String(error?.message || error || 'Unknown application error').slice(0, 1000);
    const fingerprint = `${source}:${message}`;
    if (recentReports.has(fingerprint) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    recentReports.add(fingerprint);
    setTimeout(() => recentReports.delete(fingerprint), 60_000);
    try {
        await supabaseClient.functions.invoke('report-client-error', {
            body: {
                source,
                message,
                stack: String(error?.stack || '').slice(0, 8000),
                path: typeof window !== 'undefined' ? window.location.pathname : '',
                metadata,
            },
        });
    } catch {
        // Never let error reporting create another visible application error.
    }
}

export function initializeErrorReporting() {
    if (typeof window === 'undefined' || window.__duevinciErrorReportingStarted) return;
    window.__duevinciErrorReportingStarted = true;
    window.addEventListener('error', (event) => reportAppError(event.error || event.message, 'window.error', { filename: event.filename, line: event.lineno }));
    window.addEventListener('unhandledrejection', (event) => reportAppError(event.reason, 'unhandledrejection'));
}
