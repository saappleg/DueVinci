// --- FULLCALENDAR & ICS EXPORT MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { fireConfetti, getLocalDateKey, escapeHtml } from './utils.js';
import { generateBalancedStudyPlan } from './studyPlan.js';
import { getWeekStartDayIndex } from './weekPreferences.js';
import { isDateWithinCourseWindow } from './courseDates.js';
import { getStudyCalibrationContext, recordStudyPlanCompletionIfEntitled, removeStudyPlanCompletion } from './studyCalibration.js';
import { getSubscriptionSnapshot, hasSubscriptionFeature } from './subscription.js';

export let calendarInstance = null;
let lastEventModalTrigger = null;
let lastCalendarActionTrigger = null;
let activeCalendarEvent = null;
let calendarActionCourses = [];
let calendarProviderStatus = null;
let calendarLoadGeneration = 0;

async function getCalendarUser() {
    if (currentUser?.id) return currentUser;
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.user || null;
}

function setImportStatus(message, tone = 'muted') {
    if (typeof document === 'undefined') return;
    const status = document.getElementById('calendarImportStatus');
    if (!status) return;
    const colors = {
        muted: 'text-xs text-zinc-500 dark:text-zinc-400',
        success: 'text-xs text-emerald-600 dark:text-emerald-400',
        error: 'text-xs text-red-600 dark:text-red-400'
    };
    status.textContent = message;
    status.className = `${colors[tone] || colors.muted} mt-1`;
}

function setCalendarProviderMessage(message, tone = 'muted') {
    if (typeof document === 'undefined') return;
    const element = document.getElementById('calendarProviderSyncMessage');
    if (!element) return;
    const toneClasses = {
        muted: 'text-zinc-500 dark:text-zinc-400',
        success: 'text-emerald-700 dark:text-emerald-300',
        error: 'text-red-600 dark:text-red-400',
    };
    element.textContent = message;
    element.className = `text-xs ${toneClasses[tone] || toneClasses.muted}`;
    element.classList.remove('hidden');
}

export function googleCalendarDisconnectNotice(providerRevoked) {
    if (providerRevoked === 'revoked') {
        return {
            message: 'Disconnected and revoked Google access. Imported events are hidden.',
            tone: 'success',
        };
    }
    return {
        message: 'DueVinci removed its saved token and hid imported events. Google did not confirm revocation; remove DueVinci from your Google Account connections to revoke provider consent.',
        tone: 'muted',
    };
}

async function callCalendarIntegration(action, extra = {}) {
    const { data, error } = await supabaseClient.functions.invoke('calendar-integrations', { body: { action, ...extra } });
    if (error) {
        let message = error.message || 'Calendar sync failed.';
        try {
            const body = await error.context?.json?.();
            if (body?.error) message = body.error;
        } catch { /* Use the SDK error when no response body is available. */ }
        throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
}

function renderCalendarProviderStatus() {
    const area = document.getElementById('calendarProvidersArea');
    if (!area) return;
    const providerNames = { google: 'Google Calendar', outlook: 'Outlook' };
    const connectedProviders = ['google', 'outlook'].filter((provider) => calendarProviderStatus?.providers?.[provider]?.connected);
    area.classList.toggle('hidden', !calendarProviderStatus?.featureEnabled && connectedProviders.length === 0);
    ['google', 'outlook'].forEach((provider) => {
        const status = calendarProviderStatus?.providers?.[provider] || {};
        const connectButton = document.getElementById(provider === 'google' ? 'calendarGoogleConnectButton' : 'calendarOutlookConnectButton');
        const providerConfigured = status.configured === true;
        connectButton?.classList.toggle('hidden', Boolean(status.connected && (!status.needsReconnect || !calendarProviderStatus?.featureEnabled)));
        if (connectButton) {
            connectButton.textContent = status.needsReconnect ? 'Reconnect' : 'Connect';
            connectButton.disabled = !providerConfigured || !calendarProviderStatus?.featureEnabled;
            connectButton.title = providerConfigured ? '' : 'Calendar provider setup is incomplete';
            connectButton.classList.toggle('opacity-50', connectButton.disabled);
            connectButton.classList.toggle('cursor-not-allowed', connectButton.disabled);
        }
        const connectedArea = document.getElementById(`${provider}CalendarConnectedArea`);
        connectedArea?.classList.toggle('hidden', !status.connected);
        const syncButton = document.getElementById(`${provider}CalendarSyncButton`);
        syncButton?.classList.toggle('hidden', status.needsReconnect === true);
        if (syncButton) {
            syncButton.disabled = !providerConfigured;
            syncButton.title = providerConfigured ? '' : 'Calendar provider setup is incomplete';
        }
        const detail = document.getElementById(`${provider}CalendarStatus`);
        if (!detail) return;
        if (!providerConfigured) {
            detail.textContent = status.connected
                ? `${providerNames[provider]} setup is incomplete. Sync and reconnect are unavailable; disconnect is still available.`
                : `${providerNames[provider]} setup is incomplete. Contact support before connecting.`;
        } else if (!status.connected) {
            detail.textContent = calendarProviderStatus?.featureEnabled
                ? `Connect your ${providerNames[provider]} account to import its default calendar.`
                : 'An active Pro plan is required to connect this calendar.';
        } else if (status.needsReconnect) {
            detail.textContent = status.lastSyncError || 'Reconnect this calendar to continue syncing.';
        } else if (!calendarProviderStatus.featureEnabled) {
            detail.textContent = 'Your account stays connected. Pro access is required to sync it again.';
        } else if (status.lastSyncedAt) {
            detail.textContent = `Last synced ${new Date(status.lastSyncedAt).toLocaleString()} · ${status.lastSyncCount || 0} events`;
        } else {
            detail.textContent = 'Connected. Sync to import events from the last 30 days through the next 180 days.';
        }
    });
}

export async function refreshCalendarProviderSettings() {
    const area = typeof document !== 'undefined' ? document.getElementById('calendarProvidersArea') : null;
    if (!area) return;
    try {
        const status = await callCalendarIntegration('status');
        let snapshot = null;
        try { snapshot = await getSubscriptionSnapshot(); } catch { /* Server-side status still controls disconnect access if billing is unavailable. */ }
        calendarProviderStatus = {
            ...status,
            featureEnabled: status.featureEnabled === true && (!snapshot || hasSubscriptionFeature(snapshot, 'calendar_sync')),
        };
        renderCalendarProviderStatus();
        const unconfiguredProviders = ['google', 'outlook']
            .filter((provider) => calendarProviderStatus.providers?.[provider]?.configured !== true)
            .map((provider) => provider === 'google' ? 'Google Calendar' : 'Outlook');
        if (calendarProviderStatus.featureEnabled && unconfiguredProviders.length) setCalendarProviderMessage(`${unconfiguredProviders.join(' and ')} setup is incomplete. Connect is unavailable until configured.`);
        else if (calendarProviderStatus.featureEnabled) setCalendarProviderMessage('Connect a provider to sync events. DueVinci imports event titles and dates only; it does not edit your provider calendar.');
        else if (['google', 'outlook'].some((provider) => calendarProviderStatus.providers?.[provider]?.connected)) setCalendarProviderMessage('Pro access is required to sync connected calendars. You can disconnect them here.');
        else setCalendarProviderMessage('Google and Outlook sync are included with DueVinci Pro.');
    } catch (error) {
        calendarProviderStatus = { featureEnabled: false, providers: {} };
        renderCalendarProviderStatus();
        setCalendarProviderMessage(error.message || 'Could not check calendar connections.', 'error');
    }
}

export async function connectCalendarProvider(provider) {
    if (!['google', 'outlook'].includes(provider)) return;
    const button = document.getElementById(provider === 'google' ? 'calendarGoogleConnectButton' : 'calendarOutlookConnectButton');
    if (calendarProviderStatus?.providers?.[provider]?.configured !== true) {
        setCalendarProviderMessage(`${provider === 'google' ? 'Google Calendar' : 'Outlook'} setup is incomplete. Contact support before connecting.`, 'error');
        return;
    }
    if (button) { button.disabled = true; button.textContent = 'Opening provider…'; }
    setCalendarProviderMessage(`Opening ${provider === 'google' ? 'Google Calendar' : 'Outlook'} authorization…`);
    try {
        const snapshot = await getSubscriptionSnapshot({ forceRefresh: true });
        if (!hasSubscriptionFeature(snapshot, 'calendar_sync')) throw new Error('An active DueVinci Pro plan is required to connect calendars.');
        const result = await callCalendarIntegration('authorize', { provider });
        if (!result?.authorizationUrl) throw new Error('The calendar provider authorization link could not be created.');
        window.location.assign(result.authorizationUrl);
    } catch (error) {
        setCalendarProviderMessage(error.message || 'Could not start calendar authorization.', 'error');
        if (button) {
            button.disabled = calendarProviderStatus?.providers?.[provider]?.configured !== true
                || calendarProviderStatus?.featureEnabled !== true;
            button.textContent = calendarProviderStatus?.providers?.[provider]?.needsReconnect ? 'Reconnect' : 'Connect';
        }
    }
}

export async function syncCalendarProvider(provider) {
    if (!['google', 'outlook'].includes(provider)) return;
    const button = document.getElementById(`${provider}CalendarSyncButton`);
    if (calendarProviderStatus?.providers?.[provider]?.configured !== true) {
        setCalendarProviderMessage(`${provider === 'google' ? 'Google Calendar' : 'Outlook'} setup is incomplete. Sync is unavailable.`, 'error');
        return;
    }
    if (button) { button.disabled = true; button.textContent = 'Syncing…'; }
    setCalendarProviderMessage(`Syncing ${provider === 'google' ? 'Google Calendar' : 'Outlook'} events…`);
    try {
        const result = await callCalendarIntegration('sync', { provider });
        if (calendarProviderStatus?.providers?.[provider]) {
            calendarProviderStatus.providers[provider] = { ...calendarProviderStatus.providers[provider], ...result, lastSyncError: null, needsReconnect: false };
        }
        renderCalendarProviderStatus();
        setCalendarProviderMessage(`${provider === 'google' ? 'Google Calendar' : 'Outlook'} synced. Updated ${result.lastSyncCount || 0} events.`, 'success');
        await loadCalendarCourses();
    } catch (error) {
        setCalendarProviderMessage(error.message || 'Could not sync this calendar.', 'error');
        await refreshCalendarProviderSettings();
        setCalendarProviderMessage(error.message || 'Could not sync this calendar.', 'error');
    } finally {
        if (button) {
            button.disabled = calendarProviderStatus?.providers?.[provider]?.configured !== true;
            button.textContent = 'Sync now';
        }
    }
}

export async function disconnectCalendarProvider(provider) {
    if (!['google', 'outlook'].includes(provider)) return;
    const providerName = provider === 'google' ? 'Google Calendar' : 'Outlook';
    if (!window.confirm(`Disconnect ${providerName}? DueVinci will remove its saved token and hide imported events. You can reconnect later.`)) return;
    const button = document.getElementById(`${provider}CalendarDisconnectButton`);
    if (button) button.disabled = true;
    setCalendarProviderMessage(`Disconnecting ${providerName}…`);
    try {
        const result = await callCalendarIntegration('disconnect', { provider });
        await refreshCalendarProviderSettings();
        await loadCalendarCourses();
        if (provider === 'google') {
            const notice = googleCalendarDisconnectNotice(result.providerRevoked);
            setCalendarProviderMessage(notice.message, notice.tone);
        } else {
            setCalendarProviderMessage('DueVinci removed its saved Outlook token and hid imported events. Remove DueVinci from Microsoft My Apps if you also want to revoke provider consent.', 'success');
        }
    } catch (error) {
        setCalendarProviderMessage(error.message || `Could not disconnect ${providerName}.`, 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

async function handleCalendarOAuthReturn() {
    if (typeof window === 'undefined' || !window.location?.search) return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get('calendar_oauth');
    if (!['connected', 'cancelled', 'failed'].includes(result)) return;
    const provider = url.searchParams.get('calendar_provider');
    url.searchParams.delete('calendar_oauth');
    url.searchParams.delete('calendar_provider');
    const query = url.searchParams.toString();
    window.history.replaceState(window.history.state, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
    window.openSettingsModal?.();
    window.switchSettingsTab?.('canvas', { refresh: false });
    await refreshCalendarProviderSettings();
    if (result === 'connected' && ['google', 'outlook'].includes(provider)) {
        setCalendarProviderMessage(`${provider === 'google' ? 'Google Calendar' : 'Outlook'} connected. Syncing events now…`);
        await syncCalendarProvider(provider);
    } else {
        setCalendarProviderMessage(result === 'cancelled' ? 'Calendar connection was canceled.' : 'Calendar connection could not be completed. Check the OAuth settings and try again.', result === 'cancelled' ? 'muted' : 'error');
    }
}

if (typeof window !== 'undefined') {
    window.refreshCalendarProviderSettings = refreshCalendarProviderSettings;
    window.connectCalendarProvider = connectCalendarProvider;
    window.syncCalendarProvider = syncCalendarProvider;
    window.disconnectCalendarProvider = disconnectCalendarProvider;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleCalendarOAuthReturn, { once: true });
        else Promise.resolve().then(handleCalendarOAuthReturn);
    }
}

export function unescapeICSValue(value = '') {
    return String(value)
        .replace(/\\n/gi, '\n')
        .replace(/\\N/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}

export function parseICSDate(value = '') {
    const match = String(value).match(/(?:^|[^0-9])(\d{8})(?:T|$)/);
    if (!match) return null;
    const digits = match[1];
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    const parsed = new Date(`${date}T12:00:00`);
    // The Date constructor normalizes impossible dates (2026-02-31 becomes
    // a March date). Reject those values instead of importing the wrong day.
    if (Number.isNaN(parsed.valueOf())
        || parsed.getFullYear() !== year
        || parsed.getMonth() + 1 !== month
        || parsed.getDate() !== day) return null;
    return date;
}

function addCalendarDays(dateString, amount) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return getLocalDateKey(date);
}

function isValidISODate(value = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return !Number.isNaN(parsed.valueOf())
        && parsed.getFullYear() === Number(String(value).slice(0, 4))
        && parsed.getMonth() + 1 === Number(String(value).slice(5, 7))
        && parsed.getDate() === Number(String(value).slice(8, 10));
}

function addCalendarMonths(date, amount) {
    const originalDay = date.getDate();
    const next = new Date(date);
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(originalDay, lastDay));
    return next;
}

function unfoldICS(text = '') {
    return String(text)
        .replace(/\r\n[ \t]/g, '')
        .replace(/\n[ \t]/g, '');
}

function parseICSProperty(line = '') {
    const separator = line.indexOf(':');
    if (separator < 0) return null;
    const left = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const [name, ...parameterParts] = left.split(';');
    const params = {};
    parameterParts.forEach((part) => {
        const equals = part.indexOf('=');
        if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1);
    });
    return { name: name.toUpperCase(), params, value };
}

function parseRecurrenceRule(rule = '') {
    return String(rule).split(';').reduce((result, part) => {
        const [key, value] = part.split('=');
        if (key && value) result[key.toUpperCase()] = value.toUpperCase();
        return result;
    }, {});
}

function monthlyRuleDates(monthCursor, parts, startDate) {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const dates = new Set();
    const dayIndexes = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

    if (parts.BYMONTHDAY) {
        String(parts.BYMONTHDAY).split(',').forEach((rawDay) => {
            const day = Number.parseInt(rawDay, 10);
            if (!Number.isInteger(day) || day === 0) return;
            const actualDay = day > 0 ? day : lastDay + day + 1;
            if (actualDay >= 1 && actualDay <= lastDay) {
                dates.add(getLocalDateKey(new Date(year, month, actualDay, 12)));
            }
        });
    }

    if (parts.BYDAY) {
        String(parts.BYDAY).split(',').forEach((token) => {
            const match = token.match(/^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
            if (!match) return;
            const weekday = dayIndexes[match[2]];
            const ordinal = match[1] ? Number.parseInt(match[1], 10) : null;
            if (ordinal) {
                if (ordinal > 0) {
                    const first = new Date(year, month, 1, 12);
                    const day = 1 + ((weekday - first.getDay() + 7) % 7) + ((ordinal - 1) * 7);
                    if (day <= lastDay) dates.add(getLocalDateKey(new Date(year, month, day, 12)));
                } else {
                    const last = new Date(year, month, lastDay, 12);
                    const day = lastDay - ((last.getDay() - weekday + 7) % 7) + ((ordinal + 1) * 7);
                    if (day >= 1) dates.add(getLocalDateKey(new Date(year, month, day, 12)));
                }
            } else {
                for (let day = 1; day <= lastDay; day += 1) {
                    if (new Date(year, month, day, 12).getDay() === weekday) {
                        dates.add(getLocalDateKey(new Date(year, month, day, 12)));
                    }
                }
            }
        });
    }

    return [...dates].filter((date) => date >= startDate).sort();
}

export function expandICSRecurrence(startDate, rule, maxOccurrences = 366) {
    if (!startDate) return [];
    if (!rule) return [startDate];

    const parts = parseRecurrenceRule(rule);
    const frequency = parts.FREQ;
    const interval = Math.max(1, Number.parseInt(parts.INTERVAL || '1', 10) || 1);
    const count = Math.min(maxOccurrences, Math.max(1, Number.parseInt(parts.COUNT || String(maxOccurrences), 10) || maxOccurrences));
    const until = parts.UNTIL ? parseICSDate(parts.UNTIL) : null;
    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(frequency)) return [startDate];

    // Google and Apple commonly encode a multi-day weekly recurrence with
    // BYDAY (for example, FREQ=WEEKLY;BYDAY=MO,WE). Preserve those weekdays
    // instead of reducing the event to only its DTSTART weekday.
    if (frequency === 'WEEKLY' && parts.BYDAY) {
        const dayIndexes = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        const weekStartIndex = dayIndexes[parts.WKST] ?? dayIndexes.MO;
        const offsets = parts.BYDAY.split(',')
            .map((day) => dayIndexes[day.slice(-2)])
            .filter((day) => Number.isInteger(day))
            .map((day) => (day - weekStartIndex + 7) % 7)
            .sort((a, b) => a - b);
        if (offsets.length > 0) {
            const weekCursor = new Date(`${startDate}T12:00:00`);
            weekCursor.setDate(weekCursor.getDate() - ((weekCursor.getDay() - weekStartIndex + 7) % 7));
            const dates = [];
            while (dates.length < count) {
                for (const offset of offsets) {
                    const candidate = new Date(weekCursor);
                    candidate.setDate(candidate.getDate() + offset);
                    const date = getLocalDateKey(candidate);
                    if (date < startDate) continue;
                    if (until && date > until) return dates;
                    dates.push(date);
                    if (dates.length >= count) return dates;
                }
                weekCursor.setDate(weekCursor.getDate() + (7 * interval));
            }
            return dates;
        }
    }

    if (frequency === 'MONTHLY' && (parts.BYMONTHDAY || parts.BYDAY)) {
        const dates = [];
        let monthCursor = new Date(`${startDate}T12:00:00`);
        monthCursor.setDate(1);
        while (dates.length < count) {
            for (const date of monthlyRuleDates(monthCursor, parts, startDate)) {
                if (until && date > until) return dates;
                dates.push(date);
                if (dates.length >= count) return dates;
            }
            monthCursor = addCalendarMonths(monthCursor, interval);
        }
        return dates;
    }

    const dates = [];
    const anchor = new Date(`${startDate}T12:00:00`);
    const anchorDay = anchor.getDate();
    const anchorMonth = anchor.getMonth();
    const anchorYear = anchor.getFullYear();
    let cursor = new Date(anchor);
    for (let index = 0; index < count; index += 1) {
        if (index > 0 && frequency === 'MONTHLY') {
            cursor = new Date(anchor);
            cursor.setDate(1);
            cursor.setMonth(anchorMonth + (index * interval));
            cursor.setDate(Math.min(anchorDay, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()));
        }
        if (index > 0 && frequency === 'YEARLY') {
            cursor = new Date(anchor);
            cursor.setDate(1);
            cursor.setFullYear(anchorYear + (index * interval));
            cursor.setMonth(anchorMonth);
            cursor.setDate(Math.min(anchorDay, new Date(cursor.getFullYear(), anchorMonth + 1, 0).getDate()));
        }
        const date = getLocalDateKey(cursor);
        if (until && date > until) break;
        dates.push(date);
        if (frequency === 'DAILY') cursor.setDate(cursor.getDate() + interval);
        if (frequency === 'WEEKLY') cursor.setDate(cursor.getDate() + (7 * interval));
    }
    return dates;
}

/**
 * Converts a portable RFC 5545 calendar export into rows supported by the
 * existing date-based custom_events table. Recurring and multi-day events are
 * expanded into individual dated events so no schema migration is required.
 */
export function parseICSCalendar(icsText, { color = '#8b5cf6', maxOccurrences = 1000 } = {}) {
    if (!icsText || typeof icsText !== 'string') return [];

    const lines = unfoldICS(icsText).split(/\r?\n/);
    const rows = [];
    let event = null;
    const pushEvent = () => {
        if (!event) return;
        const title = unescapeICSValue(event.SUMMARY?.value || '').trim();
        const start = parseICSDate(event.DTSTART?.value);
        if (!title || !start || rows.length >= maxOccurrences) return;

        const recurrenceDates = expandICSRecurrence(start, event.RRULE?.value, maxOccurrences - rows.length);
        const excludedDates = new Set((event.EXDATE || [])
            .flatMap((property) => String(property.value || '').split(','))
            .map((value) => parseICSDate(value))
            .filter(Boolean));
        const end = event.DTEND ? parseICSDate(event.DTEND.value) : null;
        const endIsDateOnly = event.DTEND?.params?.VALUE === 'DATE' || /^\d{8}$/.test(event.DTEND?.value || '');
        const duration = end && end > start
            ? Math.max(0, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) - (endIsDateOnly ? 1 : 0))
            : 0;

        recurrenceDates.forEach((occurrence) => {
            if (excludedDates.has(occurrence)) return;
            for (let offset = 0; offset <= duration && rows.length < maxOccurrences; offset += 1) {
                rows.push({ title, event_date: addCalendarDays(occurrence, offset), color });
            }
        });
    };

    lines.forEach((line) => {
        const upper = line.toUpperCase();
        if (upper === 'BEGIN:VEVENT') {
            event = {};
            return;
        }
        if (upper === 'END:VEVENT') {
            pushEvent();
            event = null;
            return;
        }
        if (!event) return;
        const property = parseICSProperty(line);
        if (property && ['SUMMARY', 'DTSTART', 'DTEND', 'RRULE', 'EXDATE'].includes(property.name)) {
            if (property.name === 'EXDATE') {
                event.EXDATE = [...(event.EXDATE || []), property];
            } else {
                event[property.name] = property;
            }
        }
    });
    return rows;
}

export function buildCustomEventPayload({ userId, title, eventDate, color = '#8b5cf6' } = {}) {
    const cleanTitle = String(title || '').trim();
    const cleanDate = String(eventDate || '').slice(0, 10);
    if (!userId) throw new Error('Please sign in before adding calendar events.');
    if (!cleanTitle) throw new Error('Event title is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) throw new Error('A valid event date is required.');
    if (!isValidISODate(cleanDate)) {
        throw new Error('A valid event date is required.');
    }
    return { user_id: userId, title: cleanTitle, event_date: cleanDate, color: color || '#8b5cf6' };
}

export function buildCalendarAssignmentPayload({ userId, courseId, title, dueDate, calendarEventId } = {}) {
    const cleanTitle = String(title || '').trim();
    const cleanDate = String(dueDate || '').slice(0, 10);
    if (!userId) throw new Error('Please sign in before creating an assignment.');
    if (!courseId) throw new Error('Choose a class for this assignment.');
    if (!calendarEventId) throw new Error('This calendar event cannot be linked to coursework.');
    if (!cleanTitle || cleanTitle.length > 200) throw new Error('The assignment title must be between 1 and 200 characters.');
    if (!isValidISODate(cleanDate)) throw new Error('This event does not have a valid date.');
    return {
        user_id: userId,
        course_id: courseId,
        title: cleanTitle,
        due_date: cleanDate,
        task_type: 'assignment',
        type: 'assignment',
        priority: 'medium',
        is_completed: false,
        source_calendar_event_id: String(calendarEventId),
    };
}

export function findMatchingCalendarAssignment(assignments = [], { courseId, title, dueDate } = {}) {
    const normalizedTitle = String(title || '').trim().toLocaleLowerCase();
    const dateKey = String(dueDate || '').slice(0, 10);
    return assignments.find((assignment) => assignment.course_id === courseId
        && String(assignment.title || '').trim().toLocaleLowerCase() === normalizedTitle
        && String(assignment.due_date || '').slice(0, 10) === dateKey) || null;
}

export function buildCustomEventRows({ userId, title, startDate, endDate, color = '#8b5cf6' } = {}) {
    const firstDate = String(startDate || '').slice(0, 10);
    const lastDate = String(endDate || firstDate).slice(0, 10);
    if (!isValidISODate(firstDate) || !isValidISODate(lastDate) || lastDate < firstDate) {
        throw new Error('End date must be on or after the start date.');
    }
    const rows = [];
    let cursor = firstDate;
    while (cursor <= lastDate) {
        if (rows.length >= 366) throw new Error('Calendar events can span at most 366 days.');
        rows.push(buildCustomEventPayload({ userId, title, eventDate: cursor, color }));
        cursor = addCalendarDays(cursor, 1);
    }
    return rows;
}

/**
 * Generates an RFC 5545 compliant VCALENDAR (.ics) string from event objects.
 */
export function generateICSString(events = [], calendarName = "DueVinci Master Schedule") {
    let ics = "BEGIN:VCALENDAR\r\n";
    ics += "VERSION:2.0\r\n";
    ics += "PRODID:-//DueVinci//Student Command Center//EN\r\n";
    ics += "CALSCALE:GREGORIAN\r\n";
    ics += `X-WR-CALNAME:${calendarName}\r\n`;
    ics += "X-WR-TIMEZONE:UTC\r\n";

    const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    events.forEach((ev, idx) => {
        if (!ev.date && !ev.start) return;
        const rawDate = (ev.date || ev.start || '').split('T')[0];
        const dateFormatted = rawDate.replace(/-/g, '');
        const uid = ev.id ? `duevinci-${ev.id}@duevinci.tech` : `duevinci-${dateFormatted}-${idx}@duevinci.tech`;
        const title = (ev.title || 'Academic Event').replace(/[\\,;]/g, ' ');
        const desc = (ev.description || ev.course || 'DueVinci Academic Planner').replace(/[\\,;]/g, ' ');

        ics += "BEGIN:VEVENT\r\n";
        ics += `UID:${uid}\r\n`;
        ics += `DTSTAMP:${nowStr}\r\n`;
        ics += `DTSTART;VALUE=DATE:${dateFormatted}\r\n`;
        // RFC 5545 all-day DTEND values are exclusive, so a one-day event
        // ends on the following date when another calendar imports it.
        ics += `DTEND;VALUE=DATE:${addCalendarDays(rawDate, 1).replace(/-/g, '')}\r\n`;
        ics += `SUMMARY:${title}\r\n`;
        ics += `DESCRIPTION:${desc}\r\n`;
        ics += "STATUS:CONFIRMED\r\n";
        ics += "END:VEVENT\r\n";
    });

    ics += "END:VCALENDAR\r\n";
    return ics;
}

function ensureCalendarEventActionsModal() {
    if (typeof document === 'undefined') return null;
    let modal = document.getElementById('calendarEventActionsModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'calendarEventActionsModal';
    modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-sm';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div role="dialog" aria-modal="true" aria-labelledby="calendarEventActionsTitle" class="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-brand-600 dark:bg-brand-800">
            <div class="flex items-start justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-brand-700">
                <div class="min-w-0"><h2 id="calendarEventActionsTitle" class="truncate text-lg font-bold text-zinc-900 dark:text-white"></h2><p id="calendarEventActionsDate" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400"></p></div>
                <button type="button" id="calendarEventActionsClose" aria-label="Close calendar event" class="shrink-0 rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-brand-700">✕</button>
            </div>
            <div class="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                <h3 class="text-sm font-bold text-zinc-900 dark:text-white">Create an assignment</h3>
                <p class="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Choose a class. The calendar event stays on your calendar, and DueVinci checks for a matching assignment before creating one.</p>
                <label for="calendarEventCourseSelect" class="block pt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Class</label>
                <select id="calendarEventCourseSelect" class="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm dark:border-brand-600 dark:bg-brand-900 dark:text-white"><option value="">Choose a class…</option></select>
            </div>
            <p id="calendarEventActionsStatus" role="status" aria-live="polite" class="min-h-5 text-xs text-zinc-500 dark:text-zinc-400"></p>
            <div class="flex flex-wrap justify-between gap-2">
                <button type="button" id="calendarEventDeleteButton" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30">Delete event</button>
                <div class="flex gap-2"><button type="button" id="calendarEventActionsCancel" class="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-200 dark:bg-brand-700 dark:text-zinc-100 dark:hover:bg-brand-600">Close</button><button type="button" id="calendarEventCreateAssignment" class="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">Create assignment</button></div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeCalendarEventActions();
    });
    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeCalendarEventActions();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button, select')].filter((element) => !element.disabled && element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    document.getElementById('calendarEventActionsClose')?.addEventListener('click', closeCalendarEventActions);
    document.getElementById('calendarEventActionsCancel')?.addEventListener('click', closeCalendarEventActions);
    document.getElementById('calendarEventCreateAssignment')?.addEventListener('click', createAssignmentFromCalendarEvent);
    document.getElementById('calendarEventDeleteButton')?.addEventListener('click', async () => {
        if (!activeCalendarEvent?.eventId) return;
        if (!confirm(`Delete calendar event “${activeCalendarEvent.title}”?`)) return;
        await deleteCustomEvent(activeCalendarEvent.eventId);
        closeCalendarEventActions();
    });
    return modal;
}

export async function openCalendarEventActions(event, trigger = null) {
    const modal = ensureCalendarEventActionsModal();
    if (!modal || !event) return;
    activeCalendarEvent = {
        eventId: event.extendedProps?.eventId || event.id,
        title: String(event.title || 'Calendar event'),
        date: String(event.startStr || event.start?.toISOString?.() || '').slice(0, 10),
    };
    lastCalendarActionTrigger = trigger || document.activeElement;
    document.getElementById('calendarEventActionsTitle').textContent = activeCalendarEvent.title;
    document.getElementById('calendarEventActionsDate').textContent = activeCalendarEvent.date
        ? new Date(`${activeCalendarEvent.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : 'Date unavailable';
    const select = document.getElementById('calendarEventCourseSelect');
    const status = document.getElementById('calendarEventActionsStatus');
    const createButton = document.getElementById('calendarEventCreateAssignment');
    const deleteButton = document.getElementById('calendarEventDeleteButton');
    if (select) select.innerHTML = '<option value="">Choose a class…</option>';
    if (status) status.textContent = '';
    if (createButton) createButton.disabled = true;
    if (deleteButton) deleteButton.disabled = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    try {
        const { data, error } = await supabaseClient.from('courses').select('id,code,emoji,color,start_date,end_date,term').order('code', { ascending: true });
        if (error) throw error;
        calendarActionCourses = data || [];
        if (select) select.innerHTML = '<option value="">Choose a class…</option>' + calendarActionCourses.map((course) =>
            `<option value="${escapeHtml(course.id)}">${escapeHtml(course.emoji || '📚')} ${escapeHtml(course.code || course.name || 'Untitled class')}</option>`
        ).join('');
        if (!calendarActionCourses.length && status) status.textContent = 'Add a class before creating an assignment.';
        if (createButton) createButton.disabled = !calendarActionCourses.length;
    } catch (error) {
        calendarActionCourses = [];
        if (status) status.textContent = error.message || 'Could not load your classes. Try again.';
    }
    if (select) select.focus();
}

export function closeCalendarEventActions() {
    const modal = typeof document !== 'undefined' ? document.getElementById('calendarEventActionsModal') : null;
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    if (lastCalendarActionTrigger && typeof lastCalendarActionTrigger.focus === 'function') lastCalendarActionTrigger.focus();
    lastCalendarActionTrigger = null;
    activeCalendarEvent = null;
}

export async function createAssignmentFromCalendarEvent() {
    if (!activeCalendarEvent || typeof document === 'undefined') return;
    const select = document.getElementById('calendarEventCourseSelect');
    const button = document.getElementById('calendarEventCreateAssignment');
    const status = document.getElementById('calendarEventActionsStatus');
    const courseId = select?.value || '';
    const course = calendarActionCourses.find((item) => String(item.id) === String(courseId));
    try {
        const user = await getCalendarUser();
        if (!user) throw new Error('Please sign in before creating an assignment.');
        if (!course) throw new Error('Choose a class for this assignment.');
        if (!isDateWithinCourseWindow(activeCalendarEvent.date, course)) throw new Error('Choose a class whose term dates include this calendar event.');
        if (button) button.disabled = true;
        if (status) status.textContent = 'Checking for duplicates…';
        const { data: existing, error: lookupError } = await supabaseClient.from('assignments')
            .select('id,course_id,title,due_date')
            .eq('user_id', user.id)
            .eq('course_id', course.id);
        if (lookupError) throw lookupError;
        const duplicate = findMatchingCalendarAssignment(existing || [], {
            courseId: course.id,
            title: activeCalendarEvent.title,
            dueDate: activeCalendarEvent.date,
        });
        if (duplicate) throw new Error('A matching assignment already exists for this class and date. The calendar event is still here.');
        const payload = buildCalendarAssignmentPayload({
            userId: user.id,
            courseId: course.id,
            title: activeCalendarEvent.title,
            dueDate: activeCalendarEvent.date,
            calendarEventId: activeCalendarEvent.eventId,
        });
        if (status) status.textContent = 'Creating assignment…';
        const { data: created, error } = await supabaseClient.from('assignments')
            .upsert([payload], { onConflict: 'user_id,source_calendar_event_id', ignoreDuplicates: true })
            .select('id');
        if (error) throw error;
        if (!created?.length) throw new Error('This calendar event already has an assignment. The event remains on your calendar.');
        const title = activeCalendarEvent.title;
        closeCalendarEventActions();
        setImportStatus(`Created “${title}” as an assignment. The original calendar event remains.`, 'success');
        await loadCalendarCourses();
        if (typeof window !== 'undefined') window.loadCoursesPage?.();
    } catch (error) {
        if (status) status.textContent = error.message || 'Could not create this assignment.';
        if (button) button.disabled = false;
    }
}

export function initCalendar() {
    if (typeof document === 'undefined') return;
    if (calendarInstance) return;
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        timeZone: 'local',
        firstDay: getWeekStartDayIndex(),
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: [],
        dayMaxEvents: true,
        eventClick: async function(info) {
            if (info.event.extendedProps.isCustom) {
                openCalendarEventActions(info.event, info.jsEvent?.target);
            } else if (info.event.extendedProps.isAssignment) {
                const assignId = info.event.extendedProps.assignmentId;
                const newState = !info.event.extendedProps.isCompleted;
                const { error } = await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
                if (error) {
                    console.error('Could not update calendar coursework:', error);
                    return;
                }
                if (newState) {
                    let localType = '';
                    try { localType = JSON.parse(localStorage.getItem('duevinci_assignment_types') || '{}')[assignId] || ''; } catch { /* Use the synced assignment type below. */ }
                    recordStudyPlanCompletionIfEntitled({
                        taskId: assignId,
                        courseId: info.event.extendedProps.courseId,
                        taskType: localType || info.event.extendedProps.taskType || '',
                        title: info.event.extendedProps.assignmentTitle || '',
                        estimatedMinutes: info.event.extendedProps.estimatedMinutes,
                    });
                } else {
                    removeStudyPlanCompletion(assignId);
                }
                if (newState) fireConfetti();
                loadCalendarCourses();
            }
        }
    });
    calendarInstance.render();
}

export function disposeCalendar() {
    calendarLoadGeneration += 1;
    closeCalendarEventActions();
    closeEventModal();
    calendarInstance?.destroy();
    calendarInstance = null;
    calendarActionCourses = [];
    activeCalendarEvent = null;
    lastEventModalTrigger = null;
    lastCalendarActionTrigger = null;
}

export function initCalendarForm() {
    const customEventForm = typeof document !== 'undefined' ? document.getElementById('customEventForm') : null;
    if (!customEventForm || customEventForm.dataset.bound === 'true') return;
    customEventForm.addEventListener('submit', saveCustomEvent);
    customEventForm.dataset.bound = 'true';
}

export function setCalendarWeekStart(firstDay = getWeekStartDayIndex()) {
    if (calendarInstance) calendarInstance.setOption('firstDay', firstDay === 0 ? 0 : 1);
}

export async function loadCalendarCourses() {
    if (typeof document === 'undefined') return;
    const generation = ++calendarLoadGeneration;
    const { data: courses } = await supabaseClient.from('courses').select('*');
    if (generation !== calendarLoadGeneration) return;
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (generation !== calendarLoadGeneration) return;
    const { data: customEvents } = await supabaseClient.from('custom_events').select('*');
    if (generation !== calendarLoadGeneration) return;

    let calendarEvents = [];
    const courseMap = {};
    if (courses) courses.forEach(c => courseMap[c.id] = c);

    if (assignments) assignments.forEach(assign => {
        const course = courseMap[assign.course_id];
        if (!course) return;
        const prefix = assign.unit_number ? `[Wk ${assign.unit_number}] ` : '';
        calendarEvents.push({
            title: `${course.emoji || '📚'} ${prefix}${assign.title}`,
            start: assign.due_date,
            color: assign.is_completed ? '#9ca3af' : course.color,
            extendedProps: {
                isAssignment: true, assignmentId: assign.id, isCompleted: assign.is_completed,
                courseId: assign.course_id, assignmentTitle: assign.title, taskType: assign.task_type, estimatedMinutes: assign.estimated_minutes,
            }
        });
    });

    if (customEvents) customEvents.filter(ev => ev.is_active !== false).forEach(ev => {
        calendarEvents.push({ title: ev.title, start: ev.event_date, color: ev.color, extendedProps: { isCustom: true, eventId: ev.id, sourceProvider: ev.source_provider || null } });
    });

    // Planned focus blocks are separate from due dates: they show when the
    // student intends to work, without changing the assignment itself.
    if (courses && assignments) {
        const calibration = await getStudyCalibrationContext();
        if (generation !== calendarLoadGeneration) return;
        const plan = generateBalancedStudyPlan(courses, assignments, new Date(), 21, null, { calibration });
        let syncedMoves = [];
        if (currentUser?.id) {
            const { data } = await supabaseClient.from('study_plan_moves')
                .select('task_id, planned_for')
                .eq('user_id', currentUser.id);
            if (generation !== calendarLoadGeneration) return;
            syncedMoves = data || [];
        }
        const remoteMoveByTask = new Map(syncedMoves.filter((move) => move.planned_for).map((move) => [move.task_id, move.planned_for]));
        plan.forEach((day) => day.allBlocks.forEach((block) => {
            const plannedFor = remoteMoveByTask.get(block.taskId) || day.date;
            calendarEvents.push({
                title: `🧠 Study · ${block.courseCode}: ${block.title}`,
                start: plannedFor,
                color: '#6366f1',
                textColor: '#ffffff',
                extendedProps: { isStudyPlan: true, taskId: block.taskId, durationMinutes: block.durationMinutes },
            });
        }));
    }

    if (generation === calendarLoadGeneration && calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(calendarEvents);
    }
}

export async function openEventModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('eventModal');
    if (modal) {
        if (modal.classList.contains('hidden')) lastEventModalTrigger = document.activeElement;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (modal.dataset.a11yBound !== 'true') {
            modal.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeEventModal();
                    return;
                }
                if (event.key !== 'Tab') return;
                const focusable = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
                    .filter((element) => !element.disabled && element.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            });
            modal.dataset.a11yBound = 'true';
        }
        const focusEventTitle = () => document.getElementById('eventTitle')?.focus();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusEventTitle);
        else focusEventTitle();
    }
    const courseSelect = document.getElementById('eventCourseSelect');
    if (courseSelect) {
        try {
            const { data: courses } = await supabaseClient.from('courses').select('id,code,emoji,color').order('code', { ascending: true });
            courseSelect.innerHTML = '<option value="">General / None</option>' + (courses || []).map((course) =>
                `<option value="${escapeHtml(course.id)}" data-color="${escapeHtml(course.color || '')}">${escapeHtml(course.emoji || '📚')} ${escapeHtml(course.code || 'Untitled class')}</option>`
            ).join('');
        } catch (error) {
            console.warn('Calendar course lookup notice:', error);
        }
    }
}

export function closeEventModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('eventModal');
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    if (lastEventModalTrigger && typeof lastEventModalTrigger.focus === 'function') lastEventModalTrigger.focus();
    lastEventModalTrigger = null;
}

export async function deleteCustomEvent(id) {
    await supabaseClient.from('custom_events').delete().eq('id', id);
    loadCalendarCourses();
}

export function exportToICS() {
    if (!calendarInstance) return;
    const events = calendarInstance.getEvents().map(ev => ({
        title: ev.title,
        start: ev.start ? getLocalDateKey(ev.start) : null
    }));
    const icsContent = generateICSString(events);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'duevinci-schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function importICSFile(input) {
    const file = input?.files?.[0];
    if (!file) return;

    const user = await getCalendarUser();
    if (!user) {
        setImportStatus('Please sign in before importing a calendar.', 'error');
        input.value = '';
        return;
    }

    input.disabled = true;
    setImportStatus(`Reading ${file.name || 'calendar'}…`);
    try {
        const icsText = typeof file.text === 'function'
            ? await file.text()
            : new TextDecoder().decode(await file.arrayBuffer());
        const parsedEvents = parseICSCalendar(icsText);
        if (parsedEvents.length === 0) throw new Error('No dated events were found in this .ics file.');

        const seen = new Set();
        const uniqueRows = parsedEvents.filter((event) => {
            const key = `${String(event.title || '').trim().toLocaleLowerCase()}\u0000${event.event_date}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const { data: existingEvents, error: existingError } = await supabaseClient
            .from('custom_events')
            .select('title,event_date')
            .eq('user_id', user.id);
        if (existingError) throw existingError;
        const existingKeys = new Set((existingEvents || []).map((event) =>
            `${String(event.title || '').trim().toLocaleLowerCase()}\u0000${event.event_date}`));
        const rows = uniqueRows
            .filter((event) => !existingKeys.has(`${String(event.title || '').trim().toLocaleLowerCase()}\u0000${event.event_date}`))
            .map((event) => ({ ...event, user_id: user.id }));
        const skipped = parsedEvents.length - rows.length;
        const preview = rows.slice(0, 8).map((event) => `• ${event.event_date} — ${event.title}`).join('\n');
        const more = rows.length > 8 ? `\n• +${rows.length - 8} more` : '';
        const decision = window.confirm(`Review ${file.name || 'calendar'} before importing:\n\nNew events: ${rows.length}\nSkipped duplicates: ${skipped}${preview ? `\n\n${preview}${more}` : ''}\n\nImport these events?`);
        if (!decision) {
            setImportStatus('Calendar import canceled.', 'muted');
            input.value = '';
            return;
        }
        if (rows.length === 0) {
            setImportStatus(`No new events found. Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`, 'muted');
            input.value = '';
            return;
        }
        const { error } = await supabaseClient.from('custom_events').insert(rows);
        if (error) throw error;

        setImportStatus(`Imported ${rows.length} new event${rows.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`, 'success');
        input.value = '';
        await loadCalendarCourses();
    } catch (error) {
        console.error('Calendar import error:', error);
        setImportStatus(error.message || 'Could not import this calendar file.', 'error');
        input.value = '';
    } finally {
        input.disabled = false;
    }
}

export async function saveCustomEvent(event) {
    if (event) event.preventDefault();
    const form = event?.currentTarget || document.getElementById('customEventForm');
    const submitButton = form?.querySelector('button[type="submit"]');
    const status = document.getElementById('customEventStatus');
    const title = document.getElementById('eventTitle')?.value;
    const startDate = document.getElementById('eventStartDate')?.value;
    const endDate = document.getElementById('eventEndDate')?.value || startDate;
    const selectedCourse = document.getElementById('eventCourseSelect')?.selectedOptions?.[0];
    const color = selectedCourse?.dataset?.color || '#8b5cf6';

    if (submitButton) submitButton.disabled = true;
    if (status) status.textContent = 'Saving…';
    try {
        const user = await getCalendarUser();
        if (!user) throw new Error('Please sign in before adding calendar events.');
        const rows = buildCustomEventRows({ userId: user.id, title, startDate, endDate, color });
        const { error } = await supabaseClient.from('custom_events').insert(rows);
        if (error) throw error;

        if (status) status.textContent = '';
        form?.reset();
        closeEventModal();
        await loadCalendarCourses();
    } catch (error) {
        console.error('Custom calendar event error:', error);
        if (status) status.textContent = error.message || 'Could not save this event.';
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// Bind to window & globalThis for testing and HTML inline handlers
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.generateICSString = generateICSString;
_scope.initCalendar = initCalendar;
_scope.loadCalendarCourses = loadCalendarCourses;
_scope.openEventModal = openEventModal;
_scope.closeEventModal = closeEventModal;
_scope.openCalendarEventActions = openCalendarEventActions;
_scope.closeCalendarEventActions = closeCalendarEventActions;
_scope.createAssignmentFromCalendarEvent = createAssignmentFromCalendarEvent;
_scope.deleteCustomEvent = deleteCustomEvent;
_scope.exportToICS = exportToICS;
_scope.importICSFile = importICSFile;
_scope.parseICSCalendar = parseICSCalendar;
_scope.saveCustomEvent = saveCustomEvent;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initCalendarForm();
    });
}

