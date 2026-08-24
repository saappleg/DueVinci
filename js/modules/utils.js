// --- DUEVINCI UTILITY FUNCTIONS & WEB APIS MODULE ---

let ambientAudioCtx = null;
let ambientNoiseNode = null;
let ambientGainNode = null;

/** Escapes untrusted text before interpolating it into HTML. */
export function escapeHtml(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Escapes text for a single-quoted inline event-handler argument. */
export function escapeInlineJs(value = '') {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/[\r\n]/g, ' ')
        .replace(/</g, '\\x3C')
        .replace(/>/g, '\\x3E')
        .replace(/&/g, '\\x26');
}

/** Allows only absolute HTTP(S) URLs for externally opened user links. */
export function getSafeExternalUrl(value = '') {
    try {
        const url = new URL(String(value).trim());
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

export function getTourCookie(name = 'duevinci_tour_done') {
    if (typeof document === 'undefined') return false;

    // 1. Check LocalStorage first (robust across refresh, PWA offline, strict privacy modes)
    try {
        if (typeof localStorage !== 'undefined') {
            const lsVal = localStorage.getItem(name);
            if (lsVal === 'true' || lsVal === '1') return true;
            if (lsVal === 'false' || lsVal === '0') return false;
        }
    } catch (e) {}

    // 2. Check document.cookie
    try {
        if (document.cookie) {
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + escapedName + '=([^;]+)'));
            if (match) {
                const val = decodeURIComponent(match[1]).trim();
                return val === 'true' || val === '1';
            }
        }
    } catch (e) {}

    return false;
}

export function setTourCookie(name = 'duevinci_tour_done', val = 'true', days = 365) {
    if (typeof document === 'undefined') return;
    const isClearing = (days < 0 || val === '' || val === 'false' || val === false || val === null);

    // Sync LocalStorage
    try {
        if (typeof localStorage !== 'undefined') {
            if (isClearing) {
                localStorage.removeItem(name);
            } else {
                localStorage.setItem(name, 'true');
            }
        }
    } catch (e) {}

    // Sync Cookie
    try {
        if (isClearing) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
        } else {
            const d = new Date();
            d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
            document.cookie = `${name}=true;expires=${d.toUTCString()};path=/;SameSite=Lax`;
        }
    } catch (e) {}
}

export function getBasePath() {
    if (typeof window === 'undefined' || !window.location) return './';
    const path = window.location.pathname || '';
    // A hosted project can live under its own root path (for example
    // /DueVinci-dev/). Only actual application subpages need to climb out of
    // their directory; treating every single directory as a page made assets
    // such as profile Easter-egg badges resolve one level too high.
    return /\/(?:courses|grades|calendar|legal|tutor)(?:\/|$)/.test(path) ? '../' : './';
}

export function getCurrentPageName() {
    if (typeof window === 'undefined' || !window.location) return 'index';
    const path = window.location.pathname || '';
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return 'index';
    const last = segments[segments.length - 1].replace('.html', '');
    if (last === 'index' && segments.length > 1) {
        return segments[segments.length - 2];
    }
    return last;
}

/**
 * Plays a customizable synthesized alarm chime using the Web Audio API.
 * @param {string} soundProfile - 'zenBowl' | 'gentleChime' | 'digitalBeep'
 */
export function playTimerAlarm(soundProfile) {
    try {
        const isMuted = typeof localStorage !== 'undefined' && localStorage.getItem('duevinci_mute_alarm') === 'true';
        if (isMuted) return;

        const profile = soundProfile || (typeof localStorage !== 'undefined' ? localStorage.getItem('duevinci_alarm_sound') : null) || 'gentleChime';
        const AudioContext = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;

        if (profile === 'zenBowl') {
            // Harmonic Zen Singing Bowl simulation
            [261.63, 523.25, 784.88].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);
                const volume = 0.25 / (idx + 1);
                gain.gain.setValueAtTime(volume, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 2.8);
            });
        } else if (profile === 'digitalBeep') {
            // 3 Crisp digital timer beeps
            for (let i = 0; i < 3; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const start = now + (i * 0.18);
                osc.type = 'square';
                osc.frequency.setValueAtTime(980, start);
                gain.gain.setValueAtTime(0.12, start);
                gain.gain.setValueAtTime(0.001, start + 0.1);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(start + 0.1);
            }
        } else {
            // Default: Gentle Rising Chime
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(880, now + 0.15); // A5
            osc.frequency.setValueAtTime(1174.66, now + 0.35); // D6
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.2);
        }
    } catch (e) {
        console.warn('AudioContext alarm error:', e);
    }
}

/**
 * Synthesizes ambient background noise (White or Brown noise) for deep focus.
 * @param {string} type - 'off' | 'brown' | 'white'
 */
export function toggleAmbientNoise(type = 'off') {
    if (typeof window === 'undefined') return;

    if (ambientNoiseNode) {
        try {
            ambientNoiseNode.stop();
            ambientNoiseNode.disconnect();
        } catch {}
        ambientNoiseNode = null;
    }

    if (type === 'off') {
        if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_ambient_noise', 'off');
        return;
    }

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!ambientAudioCtx) ambientAudioCtx = new AudioContext();

        const bufferSize = ambientAudioCtx.sampleRate * 2;
        const buffer = ambientAudioCtx.createBuffer(1, bufferSize, ambientAudioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            if (type === 'brown') {
                // Brown noise filter (deeper, soothing rain-like)
                lastOut = (lastOut + (0.02 * white)) / 1.02;
                data[i] = lastOut * 3.5;
            } else {
                data[i] = white * 0.15;
            }
        }

        ambientNoiseNode = ambientAudioCtx.createBufferSource();
        ambientNoiseNode.buffer = buffer;
        ambientNoiseNode.loop = true;

        if (!ambientGainNode) {
            ambientGainNode = ambientAudioCtx.createGain();
            ambientGainNode.gain.setValueAtTime(0.08, ambientAudioCtx.currentTime);
            ambientGainNode.connect(ambientAudioCtx.destination);
        }

        ambientNoiseNode.connect(ambientGainNode);
        ambientNoiseNode.start();
        if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_ambient_noise', type);
    } catch (e) {
        console.warn('Ambient noise error:', e);
    }
}

/**
 * Text-to-Speech synthesis for flashcards and notes reading aloud.
 * @param {string} text - The raw text to speak
 * @param {number} rate - Speech speed (default 1.0)
 */
export function speakText(text, rate = 1.0) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        console.warn('Web Speech API not supported in this environment');
        return;
    }

    window.speechSynthesis.cancel(); // Stop any currently playing audio

    if (!text || !text.trim()) return;

    // Clean markdown, LaTeX, and HTML formatting for speech
    const cleanText = text
        .replace(/<[^>]*>/g, '')
        .replace(/\$+/g, '')
        .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[#*`_~]/g, '')
        .replace(/\n+/g, '. ')
        .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = rate;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

export function smartParseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const cleaned = dateStr.trim();
    if (!cleaned) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
        return cleaned;
    }

    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const month = slashMatch[1].padStart(2, '0');
        const day = slashMatch[2].padStart(2, '0');
        const year = slashMatch[3];
        return `${year}-${month}-${day}`;
    }

    const textualMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
    if (textualMatch) {
        const months = {
            jan: '01', january: '01',
            feb: '02', february: '02',
            mar: '03', march: '03',
            apr: '04', april: '04',
            may: '05',
            jun: '06', june: '06',
            jul: '07', july: '07',
            aug: '08', august: '08',
            sep: '09', september: '09',
            oct: '10', october: '10',
            nov: '11', november: '11',
            dec: '12', december: '12'
        };
        const mKey = textualMatch[1].toLowerCase();
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
    window.getBasePath = getBasePath;
    window.getCurrentPageName = getCurrentPageName;
    window.playTimerAlarm = playTimerAlarm;
    window.toggleAmbientNoise = toggleAmbientNoise;
    window.speakText = speakText;
    window.smartParseDate = smartParseDate;
    window.parseInputDate = parseInputDate;
    window.fireConfetti = fireConfetti;
    window.recordStudyActivity = recordStudyActivity;
    window.escapeHtml = escapeHtml;
}
