// --- UTILITY & HELPER FUNCTIONS ---

export function getTourCookie(name) {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

export function setTourCookie(name, value, days = 365) {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCurrentPageName() {
    if (typeof window === 'undefined' || !window.location) return 'index';
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('courses.html') || path.includes('/courses')) return 'courses';
    if (path.endsWith('grades.html') || path.includes('/grades')) return 'grades';
    if (path.endsWith('calendar.html') || path.includes('/calendar')) return 'calendar';
    if (path.endsWith('terms.html') || path.includes('/terms')) return 'terms';
    if (path.endsWith('privacy.html') || path.includes('/privacy')) return 'privacy';
    return 'index';
}

export function playTimerAlarm() {
    try {
        const AudioContext = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.15); // A5

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.6);
    } catch (e) {
        console.warn('AudioContext alarm error:', e);
    }
}

export function smartParseDate(dateStr) {
    if (!dateStr) return null;
    const cleaned = dateStr.trim().replace(/^[^\w\d]+/, '');

    const dashMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dashMatch) {
        return `${dashMatch[1]}-${dashMatch[2].padStart(2, '0')}-${dashMatch[3].padStart(2, '0')}`;
    }

    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
        let year = slashMatch[3];
        if (year.length === 2) year = '20' + year;
        return `${year}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
    }

    const textualMatch = cleaned.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
    if (textualMatch) {
        const months = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const mKey = textualMatch[1].toLowerCase().substring(0, 3);
        const mNum = months[mKey];
        if (mNum) {
            const day = textualMatch[2].padStart(2, '0');
            const year = textualMatch[3] || new Date().getFullYear();
            return `${year}-${mNum}-${day}`;
        }
    }

    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }

    return null;
}

export function parseInputDate(dateStr) {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
}

export function fireConfetti() {
    if (typeof window !== 'undefined' && typeof window.confetti === 'function') {
        window.confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.8 }
        });
    }
}

export function recordStudyActivity() {
    try {
        if (typeof localStorage === 'undefined') return;
        const todayStr = new Date().toISOString().split('T')[0];
        let activityDates = JSON.parse(localStorage.getItem('duevinci_activity_dates')) || [];
        if (!activityDates.includes(todayStr)) {
            activityDates.push(todayStr);
            localStorage.setItem('duevinci_activity_dates', JSON.stringify(activityDates));
        }
    } catch (e) {
        console.error('Failed to record study activity:', e);
    }
}

// Bind to window for backwards compatibility with HTML inline handlers
if (typeof window !== 'undefined') {
    window.getTourCookie = getTourCookie;
    window.setTourCookie = setTourCookie;
    window.getCurrentPageName = getCurrentPageName;
    window.playTimerAlarm = playTimerAlarm;
    window.smartParseDate = smartParseDate;
    window.parseInputDate = parseInputDate;
    window.fireConfetti = fireConfetti;
    window.recordStudyActivity = recordStudyActivity;
}
