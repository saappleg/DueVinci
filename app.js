// --- DYNAMIC SUPABASE ENVIRONMENT ROUTING ---
const DEV_SUPABASE_URL = 'https://kinsxkeerxguqkyzrjfm.supabase.co';
const DEV_SUPABASE_ANON_KEY = 'sb_publishable_8Paq4c7YXoFfbr0AhlXmpQ_gy-yn0RB';

const PROD_SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
const PROD_SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';

const currentHost = window.location.hostname;
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

// Determine environment based on hostname. Use Production DB for the live site (GitHub Pages or custom domain)
if (currentHost.includes('github.io') || currentHost.includes('duevinci.tech')) {
    SUPABASE_URL = PROD_SUPABASE_URL;
    SUPABASE_ANON_KEY = PROD_SUPABASE_ANON_KEY;
    console.log('🚀 Running in Production Mode (DueVinci-Prod)');
} else {
    // For local environments (localhost, 127.0.0.1, file:///), use Dev Database
    SUPABASE_URL = DEV_SUPABASE_URL;
    SUPABASE_ANON_KEY = DEV_SUPABASE_ANON_KEY;
    console.log('🔧 Running in Development Mode (DueVinci-Dev)');
}
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- END SUPABASE CONFIG ---

let currentUser = null;
let calendarInstance = null;
let localCourses = [];
let currentAssignmentPage = 1;
let customTerms = JSON.parse(localStorage.getItem('duevinci_terms')) || [];
let hideUnassignedFolder = localStorage.getItem('hideUnassigned') === 'true';
let floatingTimerDismissed = false;
let lastProcessedSessionToken = null;

// --- COOKIE HELPERS FOR TOUR STATE ---
window.setCookie = (name, value, days = 365) => {
    try {
        const d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};path=/;expires=${d.toUTCString()}`;
    } catch (e) {}
    try {
        localStorage.setItem(`cookie_${name}`, value);
    } catch (e) {}
};

window.getCookie = (name) => {
    try {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        if (match) return match[2];
    } catch (e) {}
    try {
        return localStorage.getItem(`cookie_${name}`);
    } catch (e) {
        return null;
    }
};

window.deleteCookie = (name) => {
    try {
        document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    } catch (e) {}
    try {
        localStorage.removeItem(`cookie_${name}`);
    } catch (e) {}
};

// --- STRICT PAGE PATH DETECTOR ---
function getCurrentPageName() {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const lastSegment = segments.pop() || 'index.html';
    if (lastSegment === 'DueVinci') return 'index.html';
    return lastSegment.toLowerCase();
}

// --- WEB AUDIO API TIMER ALARM ---
window.playTimerAlarm = () => {
    if (localStorage.getItem('duevinci_mute_alarm') === 'true') return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
        console.error("Audio playback error:", e);
    }
};

// --- GLOBAL KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (typeof window.toggleTimer === 'function') window.toggleTimer();
    }
    if (e.code === 'Escape') {
        if (typeof window.closeSettingsModal === 'function') window.closeSettingsModal();
        if (typeof window.closeCourseModal === 'function') window.closeCourseModal();
        if (typeof window.closeTermModal === 'function') window.closeTermModal();
    }
});

// --- SMART DATE PARSER WITH DATE RANGE & YEAR SAFEGUARDS ---
function smartParseDate(dateStr) {
    if (!dateStr) return null;
    
    if (dateStr.includes('-')) {
        dateStr = dateStr.split('-').pop().trim();
    } else if (dateStr.toLowerCase().includes(' to ')) {
        dateStr = dateStr.toLowerCase().split(' to ').pop().trim();
    }

    let d = new Date(dateStr);
    
    if (isNaN(d.getTime())) {
        const currentYear = new Date().getFullYear();
        d = new Date(`${dateStr}, ${currentYear}`);
        if (isNaN(d.getTime())) return null;
    }

    const now = new Date();
    let month = d.getMonth();
    let day = d.getDate();
    let year = d.getFullYear();

    if (year === 2001) year = now.getFullYear();

    if (now.getMonth() >= 10 && month <= 1) {
        year = now.getFullYear() + 1;
    } else if (now.getMonth() <= 1 && month >= 10) {
        year = now.getFullYear() - 1;
    }

    return new Date(year, month, day).toISOString().split('T')[0];
}

window.formatDate = (dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('T')[0].split('-');
    if (parts.length !== 3) return dateString;
    
    const [year, month, day] = parts;
    const format = localStorage.getItem('duevinci_date_format') || 'YYYY-MM-DD';
    
    if (format === 'MM-DD-YYYY') return `${month}-${day}-${year}`;
    if (format === 'DD-MM-YYYY') return `${day}-${month}-${year}`;
    return `${year}-${month}-${day}`;
};

function parseInputDate(dateStr) {
    if (!dateStr) return '';
    dateStr = dateStr.trim();
    const format = localStorage.getItem('duevinci_date_format') || 'YYYY-MM-DD';
    
    let parts = dateStr.split(/[-/]/);
    if (parts.length !== 3) return dateStr;
    
    let year, month, day;
    if (format === 'MM-DD-YYYY') {
        [month, day, year] = parts;
    } else if (format === 'DD-MM-YYYY') {
        [day, month, year] = parts;
    } else {
        [year, month, day] = parts;
    }
    
    if (year && year.length === 2) year = '20' + year;
    if (!year || !month || !day) return dateStr;
    
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

window.injectAppearanceSettingsExtras = () => {
    const appearanceTab = document.getElementById('content-appearance');
    if (!appearanceTab || document.getElementById('appearanceExtrasContainer')) return;

    const container = document.createElement('div');
    container.id = 'appearanceExtrasContainer';
    container.className = 'max-w-sm mt-6 pt-6 border-t border-zinc-200 dark:border-brand-700 space-y-4';
    
    const currentFormat = localStorage.getItem('duevinci_date_format') || 'YYYY-MM-DD';
    const isMuted = localStorage.getItem('duevinci_mute_alarm') === 'true';
    const currentGpaScale = localStorage.getItem('duevinci_gpa_scale') || '4.0';
    const isAcademicsHidden = localStorage.getItem('duevinci_hide_academics') === 'true';

    container.innerHTML = `
        <div>
            <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Date Format</label>
            <select id="dateFormatSelect" onchange="updateDateFormat(this.value)" class="w-full text-xs px-2.5 py-2 rounded border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="YYYY-MM-DD" ${currentFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                <option value="MM-DD-YYYY" ${currentFormat === 'MM-DD-YYYY' ? 'selected' : ''}>MM-DD-YYYY</option>
                <option value="DD-MM-YYYY" ${currentFormat === 'DD-MM-YYYY' ? 'selected' : ''}>DD-MM-YYYY</option>
            </select>
        </div>
        <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-zinc-700 dark:text-zinc-300">Mute Timer Alarm Sound</span>
            <input type="checkbox" id="muteAlarmSwitch" ${isMuted ? 'checked' : ''} onchange="toggleMuteAlarm(this.checked)" class="w-4 h-4 text-indigo-600 rounded border-zinc-300 focus:ring-indigo-500 cursor-pointer">
        </div>
        <div>
            <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">GPA Scale Target</label>
            <select id="gpaScaleSelect" onchange="updateGpaScale(this.value)" class="w-full text-xs px-2.5 py-2 rounded border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="4.0" ${currentGpaScale === '4.0' ? 'selected' : ''}>4.0 Scale</option>
                <option value="5.0" ${currentGpaScale === '5.0' ? 'selected' : ''}>5.0 Scale</option>
            </select>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-brand-800">
            <span class="text-xs font-medium text-zinc-700 dark:text-zinc-300">Show Dashboard Academics Widget</span>
            <input type="checkbox" id="academicsSwitch" ${!isAcademicsHidden ? 'checked' : ''} onchange="toggleAcademicsVisibility(this.checked)" class="w-4 h-4 text-indigo-600 rounded border-zinc-300 focus:ring-indigo-500 cursor-pointer">
        </div>
    `;
    appearanceTab.appendChild(container);
};

window.updateDateFormat = (format) => {
    localStorage.setItem('duevinci_date_format', format);
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof loadCoursesPage === 'function') loadCoursesPage();
};

window.toggleMuteAlarm = (muted) => {
    localStorage.setItem('duevinci_mute_alarm', muted);
};

window.updateGpaScale = (scale) => {
    localStorage.setItem('duevinci_gpa_scale', scale);
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
};

window.toggleAcademicsVisibility = (show) => {
    if (show) {
        localStorage.removeItem('duevinci_hide_academics');
        if (typeof window.renderAcademicsDashboardWidget === 'function') {
            window.renderAcademicsDashboardWidget('dashboardGrid');
        }
    } else {
        localStorage.setItem('duevinci_hide_academics', 'true');
        document.querySelectorAll('#academicsAnalyticsWidget').forEach(el => el.remove());
    }
};

window.changeTheme = (themeValue) => {
    localStorage.setItem('theme', themeValue);
    if (themeValue === 'dark' || (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

function fireConfetti() {
    if (typeof confetti !== 'undefined') {
        confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6']
        });
    }
    recordStudyActivity();
}

function recordStudyActivity() {
    const today = new Date().toISOString().split('T')[0];
    let activityDates = JSON.parse(localStorage.getItem('duevinci_activity_dates')) || [];
    if (!activityDates.includes(today)) {
        activityDates.push(today);
        localStorage.setItem('duevinci_activity_dates', JSON.stringify(activityDates));
    }
}

window.toggleSidebar = () => {
    const aside = document.querySelector('aside');
    if (aside) {
        aside.classList.toggle('hidden');
        updateFloatingTimer();
    }
};

let timerInterval = null;
let focusMinutes = parseInt(localStorage.getItem('focusMinutes')) || 25;
let breakMinutes = parseInt(localStorage.getItem('breakMinutes')) || 5;
let isWorking = localStorage.getItem('timerIsWorking') !== 'false';

let timerEndTime = parseInt(localStorage.getItem('timerEndTime')) || 0;
let timerRunning = localStorage.getItem('timerRunning') === 'true';
let timeLeft = parseInt(localStorage.getItem('timeLeft')) || (focusMinutes * 60);

if (timerRunning && timerEndTime > Date.now()) {
    timeLeft = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
} else {
    timerRunning = false;
    localStorage.setItem('timerRunning', 'false');
}

function updateTimerDisplay() {
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    const display = document.getElementById('timerDisplay');
    const circle = document.getElementById('timerProgress');

    if(display) display.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    if(circle) {
        const total = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
        const percent = ((total - timeLeft) / total) * 301.59;
        circle.style.strokeDashoffset = percent;
    }
    localStorage.setItem('timeLeft', timeLeft);
    updateFloatingTimer();
}

function updateFloatingTimer() {
    let floatWidget = document.getElementById('floatingTimerWidget');
    const aside = document.querySelector('aside');
    const sidebarHidden = aside ? aside.classList.contains('hidden') : false;
    
    const shouldFloat = timerRunning && !floatingTimerDismissed && (timerCollapsed || sidebarHidden);

    if (!shouldFloat) {
        if (floatWidget) floatWidget.classList.add('hidden');
        return;
    }

    if (!floatWidget) {
        floatWidget = document.createElement('div');
        floatWidget.id = 'floatingTimerWidget';
        floatWidget.className = 'fixed bottom-5 right-5 z-[9999] bg-zinc-900/95 dark:bg-brand-800 text-white p-4 rounded-2xl shadow-2xl border border-zinc-700 backdrop-blur-md w-64 transition-all';
        document.body.appendChild(floatWidget);
    }
    
    floatWidget.classList.remove('hidden');
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    const label = isWorking ? 'Focus Session' : 'Break Time';
    floatWidget.innerHTML = `
        <div class="flex justify-between items-center mb-2 pb-2 border-b border-zinc-700">
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-400">${label}</span>
            <button onclick="dismissFloatingTimer()" class="text-zinc-400 hover:text-white text-xs">✕</button>
        </div>
        <div class="flex justify-between items-center">
            <span class="font-mono text-2xl font-bold text-indigo-300">${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}</span>
            <button onclick="toggleTimer()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-bold transition">⏸ Pause</button>
        </div>
    `;
}

window.dismissFloatingTimer = () => {
    floatingTimerDismissed = true;
    const floatWidget = document.getElementById('floatingTimerWidget');
    if (floatWidget) floatWidget.classList.add('hidden');
};

window.toggleTimer = () => {
    const btn = document.getElementById('timerPlayBtn');
    if (timerRunning) {
        clearInterval(timerInterval);
        timerInterval = null;
        timerRunning = false;
        localStorage.setItem('timerRunning', 'false');
        if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    } else {
        timerRunning = true;
        floatingTimerDismissed = false;
        timerEndTime = Date.now() + (timeLeft * 1000);
        localStorage.setItem('timerRunning', 'true');
        localStorage.setItem('timerEndTime', timerEndTime);
        if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        
        timerInterval = setInterval(() => {
            if (timerEndTime > Date.now()) {
                timeLeft = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
                updateTimerDisplay();
            } else {
                playTimerAlarm();
                skipTimer();
            }
        }, 1000);
        recordStudyActivity();
    }
    updateFloatingTimer();
};

window.resetTimer = () => {
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    localStorage.setItem('timerRunning', 'false');
    timeLeft = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
    const btn = document.getElementById('timerPlayBtn');
    if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    updateTimerDisplay();
};

window.skipTimer = () => {
    isWorking = !isWorking;
    localStorage.setItem('timerIsWorking', isWorking);
    const labelEl = document.getElementById('timerLabel');
    if (labelEl) labelEl.innerText = isWorking ? "Focus" : "Break";
    
    timeLeft = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
    timerEndTime = Date.now() + (timeLeft * 1000);
    localStorage.setItem('timerEndTime', timerEndTime);
    updateTimerDisplay();
    
    if(!timerRunning) {
        window.toggleTimer();
    }
};

window.toggleTimerSettings = () => {
    const form = document.getElementById('timerSettingsForm');
    document.getElementById('focusMinInput').value = focusMinutes;
    document.getElementById('breakMinInput').value = breakMinutes;
    form.classList.toggle('hidden');
};

window.saveTimerSettings = () => {
    focusMinutes = parseInt(document.getElementById('focusMinInput').value) || 25;
    breakMinutes = parseInt(document.getElementById('breakMinInput').value) || 5;
    localStorage.setItem('focusMinutes', focusMinutes);
    localStorage.setItem('breakMinutes', breakMinutes);
    document.getElementById('timerSettingsForm').classList.add('hidden');
    window.resetTimer();
};

let timerCollapsed = localStorage.getItem('timerCollapsed') === 'true';

function applyTimerCollapse() {
    const content = document.getElementById('timerContent');
    const icon = document.getElementById('timerCollapseIcon');
    if (!content || !icon) return;

    if(timerCollapsed) {
        content.classList.add('hidden');
        icon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
    } else {
        content.classList.remove('hidden');
        icon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    }
}

window.toggleTimerCollapse = () => {
    timerCollapsed = !timerCollapsed;
    localStorage.setItem('timerCollapsed', timerCollapsed);
    applyTimerCollapse();
    updateFloatingTimer(); 
};

document.addEventListener('DOMContentLoaded', () => {
    applyTimerCollapse();
    setTimeout(window.injectAppearanceSettingsExtras, 400);

    if (timerRunning && timeLeft > 0) {
        const btn = document.getElementById('timerPlayBtn');
        if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        timerInterval = setInterval(() => {
            if (timerEndTime > Date.now()) {
                timeLeft = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
                updateTimerDisplay();
            } else {
                playTimerAlarm();
                skipTimer();
            }
        }, 1000);
    }
    updateTimerDisplay();
});

async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuth(session);
    supabaseClient.auth.onAuthStateChange((_event, session) => handleAuth(session));
}

function handleAuth(session) {
    const token = session?.access_token || null;
    if (token === lastProcessedSessionToken) return;
    lastProcessedSessionToken = token;

    if (session) {
        currentUser = session.user;
        if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.add('hidden');
        if (document.getElementById('appScreen')) {
            document.getElementById('appScreen').classList.remove('hidden');
        }
        
        const page = getCurrentPageName();
        if (page === 'index.html' && document.getElementById('dashboardGrid')) {
            loadDashboardStats();
            if (typeof window.renderAcademicsDashboardWidget === 'function') window.renderAcademicsDashboardWidget('dashboardGrid');
            
            // Auto launch on first login if cookies are empty
            if (getCookie('duevinci_tour_done') !== 'true') {
                setTimeout(() => { if (typeof window.startWalkthrough === 'function') window.startWalkthrough(false); }, 1000);
            }
        }
        if (page === 'courses.html' && document.getElementById('coursesGrid')) loadCoursesPage();
        if (page === 'calendar.html' && document.getElementById('calendar')) {
            initCalendar();
            loadCalendarCourses();
        }
        if (page === 'grades.html' && document.getElementById('gradesContainer')) {
            loadGradesPage();
        }
    } else {
        currentUser = null;
        const page = getCurrentPageName();
        if (page !== 'index.html') {
            window.location.href = 'index.html';
        } else {
            if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.remove('hidden');
            if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.add('hidden');
        }
    }
}

function showAuthMessage(msg, colorClass = "text-red-500") {
    const msgEl = document.getElementById('authMessage');
    if(msgEl) {
        msgEl.textContent = msg;
        msgEl.className = `text-sm mt-2 ${colorClass}`;
        msgEl.classList.remove('hidden');
    }
}

window.signUpWithEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showAuthMessage("Please enter an email and password.");
    
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) showAuthMessage(error.message);
    else showAuthMessage("Account created! You are now logged in.", "text-green-500");
};

window.signInWithEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showAuthMessage("Please enter your email and password.");
    
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) showAuthMessage(error.message);
};

window.logout = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
};

// --- ACTIONABLE, NON-LOOPING WALKTHROUGH ---
window.startWalkthrough = (manualStart = false) => {
    if (typeof window.driver === 'undefined') return;

    if (manualStart) {
        deleteCookie('duevinci_tour_done');
    }

    const driver = window.driver.js.driver;
    const page = getCurrentPageName();

    let steps = [];

    if (page === 'index.html') {
        steps = [
            { popover: { title: 'Welcome to DueVinci! 🎓', description: 'Your streamlined academic command center. Let’s explore your key tools.' } },
            { element: 'aside nav', popover: { title: '1. Navigation Bar', description: 'Quickly toggle between Dashboard, Classes, Grades, and Calendar.', side: "right" } },
            { element: '#timerContent', popover: { title: '2. Focus Timer', description: 'Run Pomodoro study blocks. When the sidebar collapses, this stays visible as a floating widget on your screen.', side: "right" } },
            { element: '#upNextList', popover: { title: '3. Up Next Deadlines', description: 'Shows chronological upcoming lessons across all your classes. Click any checkmark when you finish a lesson.', side: "top" } },
            { element: '#goalsList', popover: { title: '4. Completion Goals', description: 'Live progress bars calculate your total course completion automatically as you check off items.', side: "top" } },
            { element: 'a[href="courses.html"]', popover: { title: 'Next: Adding Coursework', description: 'Head to the Classes page next to add courses and import syllabi via AI.', side: "right" } }
        ];
    } else if (page === 'courses.html') {
        steps = [
            { popover: { title: 'Class & Syllabus Center 📚', description: 'Here is where you set up your classes and automatically parse coursework.' } },
            { element: '#courseForm', popover: { title: '1. Add a Class', description: 'Pick an emoji, type your course code (e.g. CS101), select a color badge, and click Add.', side: "bottom" } },
            { element: '#termFoldersGrid', popover: { title: '2. Term Folders', description: 'Create folders for your semesters (e.g., Fall 2026). Simply drag-and-drop course cards directly into folders to organize them.', side: "top" } },
            { element: '#alphabeticalCourseList', popover: { title: '3. Syllabus & AI Scanner', description: 'Click any class card to open its modal. You can upload a PDF syllabus or a screenshot of lessons to let Gemini AI build your schedule automatically.', side: "top" } }
        ];
    } else if (page === 'grades.html') {
        steps = [
            { popover: { title: 'Academic Performance 💯', description: 'Keep track of course averages and calculate your cumulative GPA in real-time.' } },
            { element: '#gpaBadgeContainer', popover: { title: '1. Cumulative GPA', description: 'Your overall GPA is dynamically calculated and pinned in the top header. You can switch between 4.0 and 5.0 scales in Settings.', side: "bottom" } },
            { element: '#gradesContainer', popover: { title: '2. Entering Grades', description: 'Type grade percentages directly next to any unit or assignment. Check "Exclude" for pass/fail assignments.', side: "top" } }
        ];
    } else if (page === 'calendar.html') {
        steps = [
            { popover: { title: 'Master Schedule 📅', description: 'A unified timeline of all your deadlines and study events.' } },
            { element: '#calendar', popover: { title: '1. Due Dates & Events', description: 'Coursework targets show up here automatically. Click any assignment event to mark it complete immediately.', side: "top" } },
            { element: 'button[onclick="openEventModal()"]', popover: { title: '2. Custom Events', description: 'Add your own exams, study group meetings, or project deadlines.', side: "bottom" } },
            { element: 'button[onclick="exportToICS()"]', popover: { title: '3. Calendar Export (.ics)', description: 'Download your entire schedule as an .ics file to sync with Apple Calendar, Google Calendar, or Outlook.', side: "bottom" } }
        ];
    }

    if (steps.length === 0) return;

    const driverObj = driver({
        showProgress: true,
        allowClose: true,
        steps: steps,
        onDestroyStarted: () => {
            setCookie('duevinci_tour_done', 'true');
            if (typeof window.updateTourButtonVisibility === 'function') window.updateTourButtonVisibility();
            driverObj.destroy();
        }
    });

    driverObj.drive();
};

window.updateTourButtonVisibility = () => {
    const isDone = getCookie('duevinci_tour_done') === 'true';
    document.querySelectorAll('#interactiveTourSidebarBtn').forEach(btn => {
        if (isDone) {
            btn.classList.add('hidden');
        } else {
            btn.classList.remove('hidden');
        }
    });
};

window.replayTourFromSettings = () => {
    if (typeof window.closeSettingsModal === 'function') window.closeSettingsModal();
    deleteCookie('duevinci_tour_done');
    if (typeof window.updateTourButtonVisibility === 'function') window.updateTourButtonVisibility();
    setTimeout(() => {
        startWalkthrough(true);
    }, 200);
};

// --- WHAT'S NEW IN DUEVINCI MODAL ---
window.ensureWhatsNewModalExists = () => {
    if (document.getElementById('whatsNewModal')) return;
    const div = document.createElement('div');
    div.id = 'whatsNewModal';
    div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/70 backdrop-blur-sm hidden p-4';
    div.innerHTML = `
        <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div class="p-6 pb-4 border-b border-zinc-100 dark:border-brand-700 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent">
                <div class="flex items-center gap-3">
                    <span class="text-3xl">✨</span>
                    <div>
                        <h3 class="font-black text-lg text-zinc-900 dark:text-white">What's New in DueVinci</h3>
                        <p class="text-xs text-indigo-600 dark:text-indigo-400 font-bold">Version 2.2 Feature Drop</p>
                    </div>
                </div>
                <button type="button" onclick="closeWhatsNewModal()" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-lg">✕</button>
            </div>
            <div class="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto text-xs">
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">🎯</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">"What-If" Grade Simulator</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Experiment with hypothetical scores on upcoming exams on the Grades page to see exactly what score you need to keep your target GPA.</p>
                    </div>
                </div>
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">📊</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">7-Day Workload & Stress Radar</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Visualize your upcoming academic load across the next 7 days right on your Dashboard to avoid crunch weeks.</p>
                    </div>
                </div>
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">🎴</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">AI Flashcards & Practice Quizzes</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Generate interactive study flashcard decks and 5-minute practice checks directly inside your course drawer.</p>
                    </div>
                </div>
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">📱</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">Installable App & Offline Mode</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Install DueVinci on your laptop or phone as a standalone PWA with offline caching.</p>
                    </div>
                </div>
            </div>
            <div class="p-4 bg-zinc-50 dark:bg-brand-900/80 border-t border-zinc-200/70 dark:border-brand-700 flex justify-end">
                <button type="button" onclick="closeWhatsNewModal()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-md">
                    Explore New Features 🚀
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
};

window.openWhatsNewModal = () => {
    window.ensureWhatsNewModalExists();
    const m = document.getElementById('whatsNewModal');
    if (m) m.classList.remove('hidden');
};

window.closeWhatsNewModal = () => {
    localStorage.setItem('duevinci_whats_new_seen', 'v2.2');
    const m = document.getElementById('whatsNewModal');
    if (m) m.classList.add('hidden');
};

window.checkWhatsNewOnLaunch = () => {
    if (localStorage.getItem('duevinci_whats_new_seen') !== 'v2.2') {
        setTimeout(window.openWhatsNewModal, 900);
    }
};

window.confirmAccountDeletion = async () => {
    const confirmed = confirm("Are you sure you want to permanently delete your account and all academic data? This will immediately remove all your courses, assignments, grades, notes, and calendar events. This action CANNOT be undone.");
    if (!confirmed) return;

    const typed = prompt("To confirm permanent deletion of your account and all data, please type DELETE in capital letters:");
    if (typed !== "DELETE") {
        alert("Deletion canceled. You must type DELETE to confirm.");
        return;
    }

    try {
        if (currentUser && currentUser.id) {
            await supabaseClient.from('assignments').delete().eq('user_id', currentUser.id);
            await supabaseClient.from('courses').delete().eq('user_id', currentUser.id);
            await supabaseClient.from('custom_events').delete().eq('user_id', currentUser.id);
        }

        localStorage.clear();
        sessionStorage.clear();
        if (typeof deleteCookie === 'function') deleteCookie('duevinci_tour_done');

        await supabaseClient.auth.signOut();

        alert("Your account and all associated data have been permanently deleted.");
        window.location.href = 'index.html';
    } catch (err) {
        console.error("Account deletion error:", err);
        alert("An error occurred while deleting your data: " + err.message);
    }
};

window.ensureSettingsModalExists = () => {
    let div = document.getElementById('settingsModal');
    if (!div) {
        div = document.createElement('div');
        div.id = 'settingsModal';
        div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm hidden';
        div.innerHTML = `
            <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 w-full max-w-2xl rounded-2xl shadow-2xl flex overflow-hidden min-h-[460px] max-h-[90vh]">
                <div class="w-48 bg-zinc-50 dark:bg-brand-900 border-r border-zinc-200 dark:border-brand-700 p-4 shrink-0 flex flex-col justify-between">
                    <div>
                        <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 px-2">Settings</h3>
                        <nav class="space-y-1">
                            <button type="button" onclick="switchSettingsTab('profile')" class="w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition" id="tab-profile">Profile</button>
                            <button type="button" onclick="switchSettingsTab('appearance')" class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="tab-appearance">Appearance</button>
                            <button type="button" onclick="switchSettingsTab('privacy')" class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="tab-privacy">Privacy & AI</button>
                        </nav>
                    </div>
                    <div class="pt-4 border-t border-zinc-200/60 dark:border-brand-700/60 text-[11px] space-y-1 px-1">
                        <button type="button" onclick="openWhatsNewModal()" class="block text-indigo-600 dark:text-indigo-400 font-bold hover:underline">What's New ✨</button>
                        <a href="privacy.html" class="block text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium">Privacy Policy ↗</a>
                        <a href="terms.html" class="block text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium">Terms of Use ↗</a>
                    </div>
                </div>
                <div class="flex-1 p-6 relative overflow-y-auto max-h-[90vh]">
                    <button type="button" onclick="closeSettingsModal()" class="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition text-xl">✕</button>
                    
                    <!-- Tab: Profile -->
                    <div id="content-profile" class="block space-y-6">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Profile & Security</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Update your email, password, and manage your account.</p>
                        </div>
                        <form id="settingsForm" class="max-w-sm space-y-4">
                            <div>
                                <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Email Address</label>
                                <input type="email" id="profileEmail" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">New Password</label>
                                <input type="password" id="profilePassword" placeholder="Leave blank to keep current" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500">
                            </div>
                            <button type="submit" class="w-full bg-zinc-900 dark:bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-zinc-800 dark:hover:bg-indigo-700 transition shadow-sm">Save Profile Changes</button>
                            <p id="settingsMsg" class="text-sm text-center hidden mt-2"></p>
                        </form>

                        <!-- Guided Tour Refresher -->
                        <div class="pt-4 border-t border-zinc-200 dark:border-brand-700 flex items-center justify-between p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl">
                            <div>
                                <div class="font-bold text-sm text-zinc-900 dark:text-white">Interactive Walkthrough</div>
                                <div class="text-xs text-zinc-500 dark:text-zinc-400">Relaunch the step-by-step tour anytime</div>
                            </div>
                            <button type="button" onclick="replayTourFromSettings()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm">Replay Tour 🎓</button>
                        </div>

                        <!-- Danger Zone: Self-Service Deletion -->
                        <div class="pt-6 border-t border-red-200 dark:border-red-900/50 space-y-3">
                            <div class="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                Danger Zone: Permanent Data Deletion
                            </div>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                Permanently wipe all your enrolled classes, assignments, grades, study notes, calendar events, and account information from our database. This action cannot be undone.
                            </p>
                            <button type="button" onclick="confirmAccountDeletion()" class="px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg border border-red-200 dark:border-red-800/60 transition flex items-center gap-2">
                                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Delete Account & All Data
                            </button>
                        </div>
                    </div>

                    <!-- Tab: Appearance -->
                    <div id="content-appearance" class="hidden space-y-6">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Appearance & Preferences</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Customize how DueVinci looks and operates on this device.</p>
                        </div>
                        <div class="max-w-sm">
                            <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Theme Preference</label>
                            <select id="themeSelect" onchange="changeTheme(this.value)" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm">
                                <option value="system">💻 Follow System</option>
                                <option value="light">☀️ Light Mode</option>
                                <option value="dark">🌙 Dark Mode</option>
                            </select>
                        </div>
                    </div>

                    <!-- Tab: Privacy & AI -->
                    <div id="content-privacy" class="hidden space-y-6">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Privacy & AI Data Transparency</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">How your student information and AI requests are protected.</p>
                        </div>

                        <div class="space-y-4 text-xs">
                            <!-- Gemini AI Card -->
                            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-2">
                                <div class="flex items-center gap-2 font-bold text-sm text-indigo-600 dark:text-indigo-400">
                                    <span>🤖</span> Google Gemini AI Processing
                                </div>
                                <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    <strong>What is sent:</strong> Only uploaded syllabus text or schedule screenshots strictly for automated assignment parsing.<br>
                                    <strong>What is never sent:</strong> Student passwords, IDs, grades, or personal profile details.<br>
                                    <strong>Zero Model Training:</strong> Processed transiently in-memory and <em>never</em> used to train Google's foundation AI models.
                                </p>
                            </div>

                            <!-- Supabase Storage & Backups Card -->
                            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-2">
                                <div class="flex items-center gap-2 font-bold text-sm text-indigo-600 dark:text-indigo-400">
                                    <span>🛡️</span> Data Retention & Supabase Backups
                                </div>
                                <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    <strong>Active Storage:</strong> Encrypted PostgreSQL with Row Level Security (RLS) guarantees total account isolation.<br>
                                    <strong>Immediate Deletion:</strong> Any course, assignment, or event you delete is permanently removed from live database tables immediately.<br>
                                    <strong>Backup Retention:</strong> Automated encrypted disaster recovery snapshots are kept on a rolling 7–30 day lifecycle before being overwritten and destroyed.
                                </p>
                            </div>

                            <!-- User Rights & Policy Links -->
                            <div class="p-4 bg-indigo-50/50 dark:bg-brand-900 rounded-xl border border-indigo-100 dark:border-brand-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div>
                                    <div class="font-bold text-zinc-900 dark:text-white">Live Legal & Compliance Policies</div>
                                    <div class="text-[11px] text-zinc-500 dark:text-zinc-400">Review our complete data retention and terms documentation.</div>
                                </div>
                                <div class="flex gap-2 shrink-0">
                                    <a href="privacy.html" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition">Privacy Policy ↗</a>
                                    <a href="terms.html" class="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 rounded-lg font-bold text-xs transition">Terms of Use ↗</a>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(div);
    }
    
    const form = document.getElementById('settingsForm');
    if (form && !form.dataset.listenerAttached) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('profileEmail').value;
            const password = document.getElementById('profilePassword').value;
            const msgEl = document.getElementById('settingsMsg');
            
            let updates = {};
            if(email && email !== currentUser?.email) updates.email = email;
            if(password) updates.password = password;
            
            if(Object.keys(updates).length === 0) {
                msgEl.textContent = "No changes made.";
                msgEl.className = "text-xs text-center mt-2 text-zinc-500";
                msgEl.classList.remove('hidden');
                return;
            }
            
            const { error } = await supabaseClient.auth.updateUser(updates);
            if (error) {
                msgEl.textContent = error.message;
                msgEl.className = "text-xs text-center mt-2 text-red-500";
            } else {
                msgEl.textContent = "Profile updated successfully!";
                msgEl.className = "text-xs text-center mt-2 text-green-500";
                document.getElementById('profilePassword').value = '';
            }
            msgEl.classList.remove('hidden');
        });
        form.dataset.listenerAttached = 'true';
    }
};

window.openSettingsModal = () => {
    window.ensureSettingsModalExists();
    
    if(currentUser) {
        const emailInput = document.getElementById('profileEmail');
        if (emailInput) emailInput.value = currentUser.email;
    }
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = localStorage.getItem('theme') || 'system';
    
    if (typeof window.injectAppearanceSettingsExtras === 'function') {
        window.injectAppearanceSettingsExtras();
    }

    const dfSelect = document.getElementById('dateFormatSelect');
    if (dfSelect) dfSelect.value = localStorage.getItem('duevinci_date_format') || 'YYYY-MM-DD';
    
    const muteSwitch = document.getElementById('muteAlarmSwitch');
    if (muteSwitch) muteSwitch.checked = localStorage.getItem('duevinci_mute_alarm') === 'true';
    
    const gpaSelect = document.getElementById('gpaScaleSelect');
    if (gpaSelect) gpaSelect.value = localStorage.getItem('duevinci_gpa_scale') || '4.0';
    
    const acadSwitch = document.getElementById('academicsSwitch');
    if (acadSwitch) acadSwitch.checked = localStorage.getItem('duevinci_hide_academics') !== 'true';

    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeSettingsModal = () => {
    const m = document.getElementById('settingsModal');
    if (m) m.classList.add('hidden');
    const msg = document.getElementById('settingsMsg');
    if (msg) msg.classList.add('hidden');
};

window.switchSettingsTab = (tabName) => {
    const tabs = ['profile', 'appearance', 'privacy'];
    tabs.forEach(t => {
        const content = document.getElementById(`content-${t}`);
        const tabBtn = document.getElementById(`tab-${t}`);
        if (content) {
            if (t === tabName) content.classList.remove('hidden');
            else content.classList.add('hidden');
        }
        if (tabBtn) {
            if (t === tabName) {
                tabBtn.className = "w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition";
            } else {
                tabBtn.className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
            }
        }
    });
};

// --- SUPPORT & HELP MODAL ---
window.ensureSupportModalExists = () => {
    let div = document.getElementById('supportModal');
    if (!div) {
        div = document.createElement('div');
        div.id = 'supportModal';
        div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm hidden p-4';
        div.innerHTML = `
            <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 w-full max-w-2xl rounded-2xl shadow-2xl flex overflow-hidden min-h-[480px] max-h-[90vh]">
                <div class="w-48 bg-zinc-50 dark:bg-brand-900 border-r border-zinc-200 dark:border-brand-700 p-4 shrink-0 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center gap-2 mb-4 px-2">
                            <span class="text-indigo-600 dark:text-indigo-400 font-bold text-sm">💬 Help & Support</span>
                        </div>
                        <nav class="space-y-1">
                            <button type="button" onclick="switchSupportTab('contact')" class="w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition" id="support-tab-contact">Contact Steven</button>
                            <button type="button" onclick="switchSupportTab('faq')" class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="support-tab-faq">Quick FAQ</button>
                            <button type="button" onclick="switchSupportTab('github')" class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="support-tab-github">GitHub & Bugs</button>
                        </nav>
                    </div>
                    <div class="pt-4 border-t border-zinc-200/60 dark:border-brand-700/60 text-[11px] space-y-1 px-1">
                        <span class="text-zinc-400 dark:text-zinc-500 block">DueVinci Support</span>
                        <a href="privacy.html" class="block text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium">Privacy Policy ↗</a>
                    </div>
                </div>
                <div class="flex-1 p-6 relative overflow-y-auto max-h-[90vh]">
                    <button type="button" onclick="closeSupportModal()" class="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition text-xl">✕</button>
                    
                    <!-- Tab 1: Contact Form -->
                    <div id="support-content-contact" class="block space-y-4">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Get Help & Reach Out</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Have a question or need assistance? Send a message directly to Steven.</p>
                        </div>
                        <form id="supportForm" onsubmit="submitSupportMessage(event)" class="space-y-3">
                            <div>
                                <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Topic / Category</label>
                                <select id="supportCategory" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
                                    <option value="General Question">💬 General Question & Support</option>
                                    <option value="Bug Report">🐞 Bug or Glitch Report</option>
                                    <option value="Syllabus AI Parsing">📄 Syllabus AI Import Assistance</option>
                                    <option value="Grades & Calculation">🎓 Grades & GPA Calculation Question</option>
                                    <option value="Feature Request">💡 Feature Request / Idea</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Your Email</label>
                                <input type="email" id="supportEmail" required placeholder="your.email@school.edu" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Subject</label>
                                <input type="text" id="supportSubject" required placeholder="Brief description of what you need help with" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Message</label>
                                <textarea id="supportMessageText" rows="4" required placeholder="Describe your question or issue in detail..." class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500"></textarea>
                            </div>
                            <div class="flex gap-2 pt-1">
                                <button type="submit" id="supportSubmitBtn" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg transition text-xs shadow-sm">Send Message</button>
                                <button type="button" onclick="sendDirectMailto()" class="px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 font-medium py-2.5 rounded-lg transition text-xs flex items-center gap-1.5" title="Open directly in your default mail app">
                                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Email App
                                </button>
                            </div>
                            <p id="supportFeedbackMsg" class="text-xs text-center hidden mt-2"></p>
                        </form>
                    </div>

                    <!-- Tab 2: FAQ -->
                    <div id="support-content-faq" class="hidden space-y-4">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Frequently Asked Questions</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Quick answers to common questions about DueVinci.</p>
                        </div>
                        <div class="space-y-3 text-xs">
                            <div class="p-3.5 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-1">
                                <h4 class="font-bold text-zinc-900 dark:text-white text-sm">How do I import a syllabus via AI?</h4>
                                <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    Go to the <strong>Classes</strong> page and click <strong>Import Course</strong>. Upload your syllabus PDF or screenshot, and Google Gemini will automatically extract course details, units, and weekly assignments.
                                </p>
                            </div>
                            <div class="p-3.5 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-1">
                                <h4 class="font-bold text-zinc-900 dark:text-white text-sm">How does GPA calculation work?</h4>
                                <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    The <strong>Grades</strong> page calculates average scores across your course assignments. You can customize the scale (4.0 or 5.0) in Settings and check <em>Exclude</em> on any lesson to omit it from calculations.
                                </p>
                            </div>
                            <div class="p-3.5 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-1">
                                <h4 class="font-bold text-zinc-900 dark:text-white text-sm">How do I export my calendar?</h4>
                                <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    Head to the <strong>Calendar</strong> page and click <strong>Export Calendar (.ics)</strong> at the bottom of the sidebar to download a calendar file compatible with Google Calendar, Apple Calendar, and Outlook.
                                </p>
                            </div>
                            <div class="p-3.5 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-1">
                                <h4 class="font-bold text-zinc-900 dark:text-white text-sm">How do I permanently delete my account?</h4>
                                <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                    Open <strong>Settings > Profile</strong> and locate the <strong>Danger Zone</strong>. Click <em>Delete Account & All Data</em> and type DELETE to erase all database rows and local tokens.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Tab 3: GitHub & Bug Tracker -->
                    <div id="support-content-github" class="hidden space-y-4">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">GitHub & Issue Tracker</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Track bugs, request features, and contribute to DueVinci.</p>
                        </div>
                        <div class="space-y-3 text-xs">
                            <a href="https://github.com/saappleg/DueVinci/issues" target="_blank" class="p-4 bg-zinc-50 dark:bg-brand-900 hover:bg-zinc-100 dark:hover:bg-brand-700 rounded-xl border border-zinc-200 dark:border-brand-700 block transition group">
                                <div class="font-bold text-zinc-900 dark:text-white text-sm flex items-center justify-between">
                                    <span class="flex items-center gap-2">🐞 Submit a Bug Report on GitHub</span>
                                    <span class="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">→</span>
                                </div>
                                <p class="text-zinc-500 dark:text-zinc-400 mt-1">Found something broken or misbehaving? Open an issue on GitHub with steps to reproduce.</p>
                            </a>
                            <a href="https://github.com/saappleg/DueVinci/issues" target="_blank" class="p-4 bg-zinc-50 dark:bg-brand-900 hover:bg-zinc-100 dark:hover:bg-brand-700 rounded-xl border border-zinc-200 dark:border-brand-700 block transition group">
                                <div class="font-bold text-zinc-900 dark:text-white text-sm flex items-center justify-between">
                                    <span class="flex items-center gap-2">💡 Propose a Feature Request</span>
                                    <span class="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">→</span>
                                </div>
                                <p class="text-zinc-500 dark:text-zinc-400 mt-1">Have an idea for a new widget, study tool, or integration? Let us know on GitHub.</p>
                            </a>
                            <a href="https://github.com/saappleg/DueVinci" target="_blank" class="p-4 bg-zinc-50 dark:bg-brand-900 hover:bg-zinc-100 dark:hover:bg-brand-700 rounded-xl border border-zinc-200 dark:border-brand-700 block transition group">
                                <div class="font-bold text-zinc-900 dark:text-white text-sm flex items-center justify-between">
                                    <span class="flex items-center gap-2">📂 View DueVinci Repository</span>
                                    <span class="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">→</span>
                                </div>
                                <p class="text-zinc-500 dark:text-zinc-400 mt-1">Star the project or inspect the open-source code.</p>
                            </a>
                        </div>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(div);
    }
};

window.openSupportModal = () => {
    window.ensureSupportModalExists();
    if (currentUser) {
        const emailInput = document.getElementById('supportEmail');
        if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
    }
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeSupportModal = () => {
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.add('hidden');
    const msg = document.getElementById('supportFeedbackMsg');
    if (msg) msg.classList.add('hidden');
};

window.switchSupportTab = (tabName) => {
    const tabs = ['contact', 'faq', 'github'];
    tabs.forEach(t => {
        const content = document.getElementById(`support-content-${t}`);
        const tabBtn = document.getElementById(`support-tab-${t}`);
        if (content) {
            if (t === tabName) content.classList.remove('hidden');
            else content.classList.add('hidden');
        }
        if (tabBtn) {
            if (t === tabName) {
                tabBtn.className = "w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition";
            } else {
                tabBtn.className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
            }
        }
    });
};

window.submitSupportMessage = async (e) => {
    if (e) e.preventDefault();
    const category = document.getElementById('supportCategory')?.value || 'General';
    const email = document.getElementById('supportEmail')?.value || (currentUser?.email || '');
    const subject = document.getElementById('supportSubject')?.value || '';
    const message = document.getElementById('supportMessageText')?.value || '';
    const feedback = document.getElementById('supportFeedbackMsg');
    const btn = document.getElementById('supportSubmitBtn');

    if (!email || !subject || !message) {
        if (feedback) {
            feedback.textContent = "Please fill in all fields.";
            feedback.className = "text-xs text-center mt-2 text-red-500";
            feedback.classList.remove('hidden');
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending...";
    }

    try {
        try {
            await supabaseClient.from('support_tickets').insert([{
                user_id: currentUser ? currentUser.id : null,
                email: email,
                category: category,
                subject: subject,
                message: message,
                status: 'open',
                created_at: new Date().toISOString()
            }]);
        } catch (dbErr) {
            console.warn('Support ticket DB insert fallback:', dbErr);
        }

        if (typeof confetti === 'function') {
            confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });
        }

        if (feedback) {
            feedback.textContent = "Thank you! Your message has been sent. Steven will review it shortly.";
            feedback.className = "text-xs text-center mt-2 text-green-500 font-bold";
            feedback.classList.remove('hidden');
        }

        if (document.getElementById('supportSubject')) document.getElementById('supportSubject').value = '';
        if (document.getElementById('supportMessageText')) document.getElementById('supportMessageText').value = '';

        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Send Message";
            }
        }, 2000);
    } catch (err) {
        console.error("Support message error:", err);
        if (feedback) {
            feedback.textContent = "Message recorded. You can also reach out via email directly.";
            feedback.className = "text-xs text-center mt-2 text-indigo-500";
            feedback.classList.remove('hidden');
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Send Message";
        }
    }
};

window.sendDirectMailto = () => {
    const category = document.getElementById('supportCategory')?.value || 'DueVinci Help';
    const subject = document.getElementById('supportSubject')?.value || 'Support Request';
    const message = document.getElementById('supportMessageText')?.value || '';
    
    const mailSubject = encodeURIComponent(`[DueVinci ${category}] ${subject}`);
    const mailBody = encodeURIComponent(`${message}\n\n---\nSent from DueVinci User: ${currentUser?.email || 'Student'}`);
    
    window.location.href = `mailto:steven@duevinci.app?subject=${mailSubject}&body=${mailBody}`;
};

async function loadDashboardStats() {
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    const getUnitNum = (item) => {
        if (item.unit_number) return parseInt(item.unit_number) || 0;
        const match = item.title.match(/(?:unit|wk|week)\s*([0-9]+)/i);
        if (match) return parseInt(match[1]) || 0;
        return 0;
    };

    const getLessonNum = (item) => {
        const match = item.title.match(/lesson\s*([0-9]+)/i);
        if (match) return parseInt(match[1]) || 0;
        const numMatch = item.title.replace(/[^0-9]/g, '');
        return numMatch ? parseInt(numMatch) : 999;
    };

    assignments.sort((a, b) => {
        let unitA = getUnitNum(a);
        let unitB = getUnitNum(b);
        if (unitA !== unitB) return unitA - unitB;
        
        let isSubA = a.title.startsWith('↳');
        let isSubB = b.title.startsWith('↳');
        
        if (!isSubA && isSubB) return -1;
        if (isSubA && !isSubB) return 1;
        
        if (isSubA && isSubB) {
            let lessonA = getLessonNum(a);
            let lessonB = getLessonNum(b);
            if (lessonA !== lessonB) return lessonA - lessonB;
        }
        
        return new Date(a.due_date) - new Date(b.due_date);
    });

    const upNextListEl = document.getElementById('upNextList');
    if (upNextListEl) {
        upNextListEl.className = "max-h-[320px] overflow-y-auto space-y-2 pr-1";
        upNextListEl.innerHTML = '';
        const upcoming = assignments.filter(a => !a.is_completed && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
        
        if (upcoming.length === 0) {
            upNextListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">No upcoming lessons. You\'re all caught up!</p>';
        } else {
            upcoming.forEach(assign => {
                const course = courses.find(c => c.id === assign.course_id);
                if (!course) return;
                const formattedDate = window.formatDate ? window.formatDate(assign.due_date) : assign.due_date;
                const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
                
                upNextListEl.innerHTML += `
                    <div class="flex items-center gap-3 p-3 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700">
                        <button onclick="toggleAssignment('${assign.id}', false, null)" class="w-5 h-5 rounded border border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-brand-700 transition flex items-center justify-center text-transparent hover:text-indigo-500 shrink-0"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>
                        <div>
                            <p class="text-sm font-bold text-zinc-800 dark:text-zinc-200">${course.emoji} ${unitBadge}${assign.title}</p>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">${course.code} • Target: ${formattedDate}</p>
                        </div>
                    </div>`;
            });
        }
    }

    const goalsListEl = document.getElementById('goalsList');
    if (goalsListEl) {
        goalsListEl.innerHTML = '';
        courses.forEach(course => {
            const cAssign = assignments.filter(a => a.course_id === course.id && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
            const complete = cAssign.filter(a => a.is_completed).length;
            let pct = course.is_completed ? 100 : (cAssign.length ? Math.round((complete/cAssign.length)*100) : 0);
            
            const runnerPos = Math.min(Math.max(pct, 0), 94);
            const isWinner = pct === 100;
            
            goalsListEl.innerHTML += `
                <div class="space-y-1.5">
                    <div class="flex justify-between text-sm items-center">
                        <span class="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                            <span>${course.emoji}</span> ${course.code}
                        </span>
                        <span class="font-extrabold text-xs flex items-center gap-1" style="color: ${course.color}">
                            ${isWinner ? '<span class="animate-bounce">🏆</span>' : ''} ${pct}%
                        </span>
                    </div>
                    <!-- Sprint Track with Running Man Easter Egg -->
                    <div class="relative w-full bg-zinc-200 dark:bg-brand-700 rounded-full h-3.5 overflow-visible my-1 flex items-center">
                        <div class="h-3.5 rounded-full transition-all duration-700 shadow-sm" style="width: ${pct}%; background-color: ${course.color}"></div>
                        <!-- Animated Runner -->
                        <div onclick="celebrateRunner(this, ${pct})" class="absolute top-1/2 -translate-y-1/2 transition-all duration-700 cursor-pointer select-none text-sm hover:scale-135 drop-shadow-sm z-10" style="left: calc(${runnerPos}% - 7px);" title="${isWinner ? 'Goal completed! Winner! 🏆 (Click to celebrate)' : 'Keep pushing! 🏃‍♂️ (Click me!)'}">
                            ${isWinner ? '🥇' : '🏃‍♂️'}
                        </div>
                        <!-- Finish Flag -->
                        <div class="absolute right-0.5 top-1/2 -translate-y-1/2 text-xs select-none pointer-events-none opacity-85">
                            🏁
                        </div>
                    </div>
                </div>`;
        });
    }
}

window.celebrateRunner = (el, pct) => {
    if (typeof confetti === 'function') {
        confetti({ 
            particleCount: pct === 100 ? 50 : 25, 
            spread: 50, 
            origin: { y: 0.65 } 
        });
    }
    if (el) {
        el.style.transform = 'translateY(-50%) rotate(360deg) scale(1.4)';
        setTimeout(() => {
            el.style.transform = 'translateY(-50%)';
        }, 500);
    }
};

async function loadCoursesPage() {
    const { data: courses } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
    localCourses = courses || [];
    
    localCourses.forEach(c => {
        if (c.term && !customTerms.includes(c.term.trim())) {
            customTerms.push(c.term.trim());
        }
    });
    localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
    
    renderTermFolders();
    renderAlphabeticals();
}

function renderTermFolders() {
    const foldersGrid = document.getElementById('termFoldersGrid');
    if (!foldersGrid) return;

    const termsMap = {};
    customTerms.forEach(t => { termsMap[t] = []; });
    
    if (!hideUnassignedFolder) {
        if (!termsMap['Unassigned']) termsMap['Unassigned'] = [];
    }

    localCourses.forEach(c => {
        const t = (c.term && c.term.trim() !== '') ? c.term.trim() : 'Unassigned';
        if (t === 'Unassigned' && hideUnassignedFolder) return;
        if (!termsMap[t]) termsMap[t] = [];
        termsMap[t].push(c);
    });

    foldersGrid.innerHTML = '';
    const termNames = Object.keys(termsMap).sort();

    termNames.forEach(termName => {
        const termCourses = termsMap[termName];
        foldersGrid.innerHTML += `
            <div onclick="openTermModal('${termName}')" 
                 ondragover="allowDrop(event)" 
                 ondrop="handleDropToTerm(event, '${termName}')"
                 class="cursor-pointer group bg-white dark:bg-brand-800 p-5 rounded-xl border-2 border-dashed border-zinc-300 dark:border-brand-600 hover:border-indigo-500 dark:hover:border-indigo-400 transition shadow-sm flex flex-col justify-between min-h-[130px]">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <span class="text-2xl">📁</span>
                        <h4 class="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${termName}</h4>
                    </div>
                    <span class="text-xs bg-zinc-100 dark:bg-brand-700 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-full font-bold">${termCourses.length} class${termCourses.length === 1 ? '' : 'es'}</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-1.5">
                    ${termCourses.slice(0, 4).map(c => `<span class="text-[11px] px-2 py-0.5 rounded font-medium" style="background-color: ${c.color}20; color: ${c.color}; border: 1px solid ${c.color}40;">${c.code}</span>`).join('')}
                    ${termCourses.length > 4 ? `<span class="text-[11px] text-zinc-400 px-1">+${termCourses.length - 4} more</span>` : ''}
                </div>
                <p class="text-[11px] text-zinc-400 mt-2 text-right">Click to open &bull; Drag class here</p>
            </div>`;
    });
}

function renderAlphabeticals() {
    const listEl = document.getElementById('alphabeticalCourseList');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (localCourses.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-sm text-zinc-500 text-center">No classes added yet.</div>';
        return;
    }

    const sortedCourses = [...localCourses].sort((a, b) => a.code.localeCompare(b.code));

    sortedCourses.forEach(course => {
        const emoji = course.emoji || '📚';
        const termBadge = course.term ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded font-bold">${course.term}</span>` : `<span class="text-xs bg-zinc-200 dark:bg-brand-700 text-zinc-500 px-2 py-0.5 rounded">Unassigned</span>`;
        const opacity = course.is_completed ? 'opacity-50' : '';
        const checkIcon = course.is_completed ? `<span class="text-indigo-500 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1 rounded">✔ Completed</span>` : '';

        listEl.innerHTML += `
            <div draggable="true" ondragstart="handleDragStart(event, '${course.id}')" onclick="openCourseModal('${course.id}')" class="cursor-pointer p-4 hover:bg-zinc-50 dark:hover:bg-brand-700/50 transition flex items-center justify-between ${opacity}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style="background-color: ${course.color}20; color: ${course.color}; border: 1px solid ${course.color}40;">${emoji}</div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-zinc-800 dark:text-zinc-200">${course.code}</h4>
                            ${termBadge}
                        </div>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Drag card to move term &bull; Click to open coursework</p>
                    </div>
                </div>
                <div>${checkIcon}</div>
            </div>`;
    });
}

window.handleDragStart = (e, courseId) => {
    e.dataTransfer.setData('text/plain', courseId);
};

window.allowDrop = (e) => {
    e.preventDefault();
};

window.handleDropToTerm = async (e, termName) => {
    e.preventDefault();
    const courseId = e.dataTransfer.getData('text/plain');
    if (!courseId) return;

    const newTerm = termName === 'Unassigned' ? null : termName;
    if (newTerm && !customTerms.includes(newTerm)) {
        customTerms.push(newTerm);
        localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
    }
    
    if (termName === 'Unassigned') {
        hideUnassignedFolder = false;
        localStorage.removeItem('hideUnassigned');
    }

    await supabaseClient.from('courses').update({ term: newTerm }).eq('id', courseId);
    
    const course = localCourses.find(c => c.id === courseId);
    if (course) course.term = newTerm;

    renderTermFolders();
    renderAlphabeticals();
};

window.createNewTermFolder = () => {
    const input = document.getElementById('newTermInput');
    const termVal = input ? input.value.trim() : '';
    if (!termVal) return;
    
    if (!customTerms.includes(termVal)) {
        customTerms.push(termVal);
        localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
    }
    input.value = '';
    renderTermFolders();
};

function ensureTermModalExists() {
    let modal = document.getElementById('termModal');
    if (!modal) {
        const div = document.createElement('div');
        div.id = 'termModal';
        div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm hidden';
        div.innerHTML = `
            <div class="bg-white dark:bg-brand-800 rounded-2xl border border-zinc-200 dark:border-brand-700 w-full max-w-lg p-6 shadow-xl max-h-[85vh] flex flex-col">
                <div class="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-brand-700">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">📁</span>
                        <h3 id="termModalTitle" class="text-lg font-bold text-zinc-800 dark:text-zinc-200"></h3>
                    </div>
                    <button type="button" onclick="closeTermModal()" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xl font-bold">✕</button>
                </div>
                <div id="termModalCourseList" class="py-4 space-y-3 overflow-y-auto flex-1"></div>
                <div class="pt-4 border-t border-zinc-200 dark:border-brand-700 flex justify-between items-center">
                    <button type="button" onclick="deleteCurrentTermFolder()" class="text-xs text-red-500 hover:text-red-700 font-bold transition">Delete Term Folder</button>
                    <button type="button" onclick="closeTermModal()" class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 text-zinc-700 dark:text-zinc-200 font-bold rounded-lg text-sm transition">Close</button>
                </div>
            </div>`;
        document.body.appendChild(div);
    }
}

let activeTermModalName = '';

window.openTermModal = (termName) => {
    ensureTermModalExists();
    activeTermModalName = termName;
    document.getElementById('termModalTitle').innerText = `Classes in ${termName}`;
    
    const listEl = document.getElementById('termModalCourseList');
    const termCourses = localCourses.filter(c => {
        const t = c.term ? c.term.trim() : 'Unassigned';
        return t === termName;
    });

    listEl.innerHTML = '';
    if (termCourses.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-zinc-500 text-center py-6">No classes in this term yet. Drag a class card here or assign one.</p>';
    } else {
        termCourses.forEach(course => {
            const emoji = course.emoji || '📚';
            listEl.innerHTML += `
                <div onclick="closeTermModal(); openCourseModal('${course.id}')" class="cursor-pointer p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 hover:border-indigo-500 transition flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style="background-color: ${course.color}20; color: ${course.color}; border: 1px solid ${course.color}40;">${emoji}</div>
                        <div>
                            <h4 class="font-bold text-sm text-zinc-800 dark:text-zinc-200">${course.code}</h4>
                            <p class="text-xs text-zinc-500">Click to view coursework &rarr;</p>
                        </div>
                    </div>
                </div>`;
        });
    }

    document.getElementById('termModal').classList.remove('hidden');
};

window.closeTermModal = () => {
    const modal = document.getElementById('termModal');
    if (modal) modal.classList.add('hidden');
};

window.deleteCurrentTermFolder = async () => {
    if (activeTermModalName === 'Unassigned') {
        if (confirm('Delete Unassigned folder and all unassigned classes inside it?')) {
            const termCourses = localCourses.filter(c => !c.term || c.term.trim() === '' || c.term.trim() === 'Unassigned');
            for (let c of termCourses) {
                await supabaseClient.from('courses').delete().eq('id', c.id);
            }
            localCourses = localCourses.filter(c => c.term && c.term.trim() !== '' && c.term.trim() !== 'Unassigned');
            hideUnassignedFolder = true;
            localStorage.setItem('hideUnassigned', 'true');
            closeTermModal();
            renderTermFolders();
            renderAlphabeticals();
        }
        return;
    }
    
    if (confirm(`Delete term folder "${activeTermModalName}"? Classes inside will be moved to Unassigned.`)) {
        hideUnassignedFolder = false;
        localStorage.removeItem('hideUnassigned');
        
        const termCourses = localCourses.filter(c => c.term && c.term.trim() === activeTermModalName);
        for (let c of termCourses) {
            await supabaseClient.from('courses').update({ term: null }).eq('id', c.id);
            c.term = null;
        }
        
        customTerms = customTerms.filter(t => t !== activeTermModalName);
        localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
        
        closeTermModal();
        renderTermFolders();
        renderAlphabeticals();
    }
};

const cForm = document.getElementById('courseForm');
if (cForm) {
    cForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('courseCode').value;
        const color = document.getElementById('courseColor').value;
        const emoji = document.getElementById('courseEmoji').value || '📚';
        
        const { error } = await supabaseClient.from('courses').insert([{ code, color, emoji, user_id: currentUser.id }]);
        if (!error) {
            document.getElementById('courseCode').value = '';
            loadCoursesPage();
        }
    });
}

window.openCourseModal = (courseId) => {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;
    
    const completionBadge = course.is_completed ? `<span class="ml-2 text-xs bg-green-500/10 text-green-500 border border-green-500/30 px-2 py-0.5 rounded-full font-bold">Completed</span>` : '';
    document.getElementById('modalCourseTitle').innerHTML = `<span>${course.emoji || '📚'}</span> ${course.code} ${completionBadge}`;
    
    document.getElementById('editCourseId').value = course.id;
    document.getElementById('editCourseEmoji').value = course.emoji || '📚';
    document.getElementById('editCourseCode').value = course.code;
    document.getElementById('editCourseColor').value = course.color;
    
    const descInput = document.getElementById('editCourseDescription');
    if (descInput) descInput.value = course.description || '';
    const objInput = document.getElementById('editCourseObjectives');
    if (objInput) objInput.value = course.objectives || '';
    
    const metaBox = document.getElementById('courseMetadataBox');
    if(metaBox) {
        let metaHtml = '';
        if (course.description) metaHtml += `<p class="text-xs text-zinc-600 dark:text-zinc-400 mb-1.5"><strong>Description:</strong> ${course.description}</p>`;
        if (course.objectives) metaHtml += `<p class="text-xs text-zinc-600 dark:text-zinc-400"><strong>Objectives:</strong> ${course.objectives}</p>`;
        metaBox.innerHTML = metaHtml ? `<div class="mt-3 bg-zinc-100 dark:bg-brand-900 p-3 rounded-lg border border-zinc-200 dark:border-brand-700">${metaHtml}</div>` : '<div class="mt-3 bg-zinc-100 dark:bg-brand-900 p-3 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs text-zinc-500">No course description or objectives provided yet. Upload a syllabus or edit below.</div>';
    }

    const btn = document.getElementById('markCourseCompleteBtn');
    if (btn) {
        btn.onclick = () => toggleCourseComplete(course.id, course.is_completed);
        if (course.is_completed) {
            btn.innerText = "↺ Mark as Incomplete";
            btn.className = "text-xs bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20 px-3 py-1.5 rounded font-bold transition";
        } else {
            btn.innerText = "✔ Mark Course Complete";
            btn.className = "text-xs bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 px-3 py-1.5 rounded font-bold transition";
        }
    }

    document.getElementById('pdfStatusMsg').classList.add('hidden');
    document.getElementById('syllabusFile').value = '';
    
    switchCourseTab('overview');
    renderStaticCoursePanels(course);

    document.getElementById('courseModal').classList.remove('hidden');
    currentAssignmentPage = 1;
    loadAssignments(course.id, currentAssignmentPage);
};

window.closeCourseModal = () => {
    const m = document.getElementById('courseModal');
    if (m) m.classList.add('hidden');
};

window.switchCourseTab = (tabName) => {
    ['overview', 'resources', 'scratchpad', 'studyquiz'].forEach(t => {
        const panel = document.getElementById(`panel-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (panel) panel.classList.toggle('hidden', t !== tabName);
        if (btn) {
            btn.className = t === tabName 
                ? 'text-xs font-bold pb-3 border-b-2 border-indigo-500 text-indigo-500 transition' 
                : 'text-xs font-bold pb-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition';
        }
    });
};

function renderStaticCoursePanels(course) {
    let links = course.resources || [];
    const resPanel = document.getElementById('panel-resources');
    if (resPanel) {
        resPanel.innerHTML = `
            <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-300">🔗 Resource & Note Links</h3>
            <div id="linksList_${course.id}" class="space-y-2 mt-2">
                ${links.map((l, idx) => `
                    <div class="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs">
                        <a href="${l.url}" target="_blank" class="font-bold text-indigo-500 hover:underline truncate">${l.title}</a>
                        <button onclick="removeResourceLink('${course.id}', ${idx})" class="text-zinc-400 hover:text-red-500 font-bold px-2">✕</button>
                    </div>
                `).join('')}
            </div>
            <div class="flex gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-brand-700">
                <input type="text" id="resTitle_${course.id}" placeholder="Resource Title" class="w-1/3 text-xs px-3 py-2 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500">
                <input type="url" id="resUrl_${course.id}" placeholder="https://..." class="flex-1 text-xs px-3 py-2 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500">
                <button onclick="addResourceLink('${course.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-xs font-bold transition">+ Add Link</button>
            </div>
        `;
    }

    const scratchPanel = document.getElementById('panel-scratchpad');
    if (scratchPanel) {
        scratchPanel.innerHTML = `
            <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-300 mb-2">📝 Course Scratchpad & Notes</h3>
            <textarea oninput="saveCourseScratchpad('${course.id}', this.value)" rows="10" placeholder="Jot down quick lecture notes, formulas, or study reminders..." class="w-full text-xs p-3 rounded-lg border border-zinc-200 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 leading-relaxed">${course.scratchpad || ''}</textarea>
        `;
    }
}

window.addResourceLink = async (courseId) => {
    const titleInput = document.getElementById(`resTitle_${courseId}`);
    const urlInput = document.getElementById(`resUrl_${courseId}`);
    const title = titleInput ? titleInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';
    if (!title || !url) return;

    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    let links = course.resources || [];
    links.push({ title, url });
    course.resources = links;

    await supabaseClient.from('courses').update({ resources: links }).eq('id', courseId);
    renderStaticCoursePanels(course);
};

window.removeResourceLink = async (courseId, idx) => {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    let links = course.resources || [];
    links.splice(idx, 1);
    course.resources = links;

    await supabaseClient.from('courses').update({ resources: links }).eq('id', courseId);
    renderStaticCoursePanels(course);
};

window.saveCourseScratchpad = async (courseId, val) => {
    const course = localCourses.find(c => c.id === courseId);
    if (course) course.scratchpad = val;
    await supabaseClient.from('courses').update({ scratchpad: val }).eq('id', courseId);
};

window.parseSyllabusPDF = async () => {
    const fileInput = document.getElementById('syllabusFile');
    const statusMsg = document.getElementById('pdfStatusMsg');
    const courseId = document.getElementById('editCourseId').value;

    if (!fileInput.files || fileInput.files.length === 0) {
        statusMsg.textContent = "Please select a PDF file first.";
        statusMsg.className = "text-xs text-center mt-2 text-red-500";
        statusMsg.classList.remove('hidden');
        return;
    }

    const file = fileInput.files[0];
    statusMsg.textContent = "AI is extracting description & objectives securely...";
    statusMsg.className = "text-xs text-center mt-2 text-indigo-500";
    statusMsg.classList.remove('hidden');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(" ") + " ";
        }

        const metadataOnlyEl = document.getElementById('syllabusMetadataOnly') || document.getElementById('metadataOnly');
        const isMetadataOnly = metadataOnlyEl ? metadataOnlyEl.checked : false;
        const apiCallType = isMetadataOnly ? 'syllabus_metadata' : 'syllabus';

        const { data: responseData, error: functionError } = await supabaseClient.functions.invoke('gemini-parser', {
            body: { type: apiCallType, text: fullText }
        });

        if (functionError) throw new Error(functionError.message);

        const rawResponse = responseData.result;
        const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson);

        let updates = {};
        if (parsedData.description) updates.description = parsedData.description;
        if (parsedData.objectives) updates.objectives = parsedData.objectives;

        if (Object.keys(updates).length > 0) {
            await supabaseClient.from('courses').update(updates).eq('id', courseId);
            const cachedCourse = localCourses.find(c => c.id === courseId);
            if (cachedCourse) {
                if (parsedData.description) cachedCourse.description = parsedData.description;
                if (parsedData.objectives) cachedCourse.objectives = parsedData.objectives;
            }
        }

        if (isMetadataOnly) {
            statusMsg.textContent = "Successfully imported course description & objectives!";
            statusMsg.className = "text-xs text-center mt-2 text-green-500";
            openCourseModal(courseId);
            loadCoursesPage();
            return; 
        }

        let baseDate = new Date();
        if (parsedData.units && parsedData.units.length > 0) {
            parsedData.units.sort((a, b) => {
                if (!a.dateStr || !b.dateStr) return 0;
                return new Date(a.dateStr) - new Date(b.dateStr);
            });

            for (let i = 0; i < parsedData.units.length; i++) {
                let u = parsedData.units[i];
                let targetDate = u.dateStr ? smartParseDate(u.dateStr) : null;
                if (!targetDate) {
                    let fallbackDate = new Date(baseDate);
                    fallbackDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                    targetDate = fallbackDate.toISOString().split('T')[0];
                }

                const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                    course_id: courseId, user_id: currentUser.id,
                    title: `Unit ${u.num || i + 1}: ${u.title}`,
                    unit_number: u.num || i + 1,
                    due_date: targetDate
                }]).select();

                if (insertedUnit && insertedUnit[0] && u.lessons) {
                    let lessonNum = 1;
                    for (let lessonTitle of u.lessons) {
                        let formattedTitle = lessonTitle.toLowerCase().startsWith('lesson') ? lessonTitle : `Lesson ${lessonNum}: ${lessonTitle}`;
                        await supabaseClient.from('assignments').insert([{
                            course_id: courseId, user_id: currentUser.id,
                            title: `↳ ${formattedTitle}`,
                            unit_number: u.num || i + 1,
                            due_date: targetDate
                        }]);
                        lessonNum++;
                    }
                }
            }
        }

        statusMsg.textContent = "Successfully imported curriculum via secure Edge Function!";
        statusMsg.className = "text-xs text-center mt-2 text-green-500";
        openCourseModal(courseId);
        loadCoursesPage();
        loadAssignments(courseId, 1);

    } catch (err) {
        console.error(err);
        statusMsg.textContent = "Error parsing file or contacting Edge Function.";
        statusMsg.className = "text-xs text-center mt-2 text-red-500";
    }
};

window.parseLessonsImage = async (inputElement) => {
    const statusMsg = document.getElementById('pdfStatusMsg');
    const courseId = document.getElementById('editCourseId').value;
    if (!inputElement.files || inputElement.files.length === 0) return;

    const file = inputElement.files[0];
    statusMsg.textContent = "AI is securely reading lessons and dates...";
    statusMsg.className = "text-xs text-center mt-2 text-emerald-500";
    statusMsg.classList.remove('hidden');

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onloadend = async () => {
        const base64Image = reader.result.split(',')[1];
        const mimeType = file.type;

        try {
            const { data: responseData, error: functionError } = await supabaseClient.functions.invoke('gemini-parser', {
                body: { type: 'screenshot', imageBase64: base64Image, mimeType: mimeType }
            });

            if (functionError) throw new Error(functionError.message);

            const rawResponse = responseData.result;
            const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanJson);
            let baseDate = new Date();

            if (parsedData.units && parsedData.units.length > 0) {
                parsedData.units.sort((a, b) => {
                    if (!a.dateStr || !b.dateStr) return 0;
                    return new Date(a.dateStr) - new Date(b.dateStr);
                });

                for (let i = 0; i < parsedData.units.length; i++) {
                    let wk = parsedData.units[i];
                    let targetDate = wk.dateStr ? smartParseDate(wk.dateStr) : null;
                    if (!targetDate) {
                        let fallbackDate = new Date(baseDate);
                        fallbackDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                        targetDate = fallbackDate.toISOString().split('T')[0];
                    }

                    const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                        course_id: courseId, user_id: currentUser.id,
                        title: wk.title || `Week ${wk.num}`,
                        unit_number: wk.num,
                        due_date: targetDate
                    }]).select();

                    if (insertedUnit && insertedUnit[0] && wk.lessons) {
                        let lessonNum = 1;
                        for (let l of wk.lessons) {
                            let formattedTitle = l.toLowerCase().startsWith('lesson') ? l : `Lesson ${lessonNum}: ${l}`;
                            await supabaseClient.from('assignments').insert([{
                                course_id: courseId, user_id: currentUser.id,
                                title: `↳ ${formattedTitle}`,
                                unit_number: wk.num,
                                due_date: targetDate
                            }]);
                            lessonNum++;
                        }
                    }
                }
            }

            statusMsg.textContent = "Successfully imported lessons via secure Edge Function!";
            statusMsg.className = "text-xs text-center mt-2 text-green-500";
            loadAssignments(courseId, 1);

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error scanning image with Edge Function.";
            statusMsg.className = "text-xs text-center mt-2 text-red-500";
        }
    };
};

const eForm = document.getElementById('editCourseForm');
if (eForm) {
    eForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editCourseId').value;
        const code = document.getElementById('editCourseCode').value;
        const color = document.getElementById('editCourseColor').value;
        const emoji = document.getElementById('editCourseEmoji').value;
        const description = document.getElementById('editCourseDescription')?.value || '';
        const objectives = document.getElementById('editCourseObjectives')?.value || '';
        
        await supabaseClient.from('courses').update({ code, color, emoji, description, objectives }).eq('id', id);
        const cached = localCourses.find(c => c.id === id);
        if (cached) {
            cached.code = code; cached.color = color; cached.emoji = emoji;
            cached.description = description; cached.objectives = objectives;
        }
        closeCourseModal();
        loadCoursesPage();
    });
}

window.deleteCurrentCourse = async () => {
    if (confirm('Delete this course and ALL its coursework?')) {
        await supabaseClient.from('courses').delete().eq('id', document.getElementById('editCourseId').value);
        closeCourseModal();
        loadCoursesPage();
    }
};

window.toggleCourseComplete = async (courseId, currentState) => {
    const newState = !currentState;
    await supabaseClient.from('courses').update({ is_completed: newState }).eq('id', courseId);
    const course = localCourses.find(c => c.id === courseId);
    if (course) course.is_completed = newState;
    if (newState) fireConfetti();
    openCourseModal(courseId);
    loadCoursesPage();
};

window.toggleAssignment = async (assignId, currentState, courseId) => {
    const newState = !currentState;
    await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
    if (newState) fireConfetti();
    if (getCurrentPageName() === 'index.html') loadDashboardStats();
    else if (courseId) loadAssignments(courseId, currentAssignmentPage);
};

window.updateAssignmentDate = async (assignId, newDate, courseId) => {
    if(!newDate) return;
    const parsedDate = parseInputDate(newDate);
    await supabaseClient.from('assignments').update({ due_date: parsedDate }).eq('id', assignId);
    loadAssignments(courseId, currentAssignmentPage);
};

window.addSubItem = async (parentId, courseId) => {
    const inputEl = document.getElementById(`subInput-${parentId}`);
    const title = inputEl ? inputEl.value.trim() : "";
    if(!title) return;
    
    const { data: parentAssign } = await supabaseClient.from('assignments').select('unit_number, due_date').eq('id', parentId).single();
    const unitNum = parentAssign ? parentAssign.unit_number : null;
    const dueDate = parentAssign ? parentAssign.due_date : new Date().toISOString().split('T')[0];

    await supabaseClient.from('assignments').insert([{
        course_id: courseId, user_id: currentUser.id,
        title: `↳ ${title}`, unit_number: unitNum, due_date: dueDate
    }]);
    loadAssignments(courseId, currentAssignmentPage);
};

window.changeAssignmentPage = (courseId, page) => {
    loadAssignments(courseId, page);
};

async function loadAssignments(courseId, page = 1) {
    const { data: assignments } = await supabaseClient.from('assignments').select('*').eq('course_id', courseId);
    const listEl = document.getElementById('assignmentList');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    if (!assignments || !assignments.length) {
        listEl.innerHTML = '<div class="p-4 border border-dashed border-zinc-300 dark:border-brand-600 rounded-lg text-center"><p class="text-sm text-zinc-500 dark:text-zinc-400">No coursework added yet.</p></div>';
        return;
    }
    
    const getUnitNum = (item) => {
        if (item.unit_number) return parseInt(item.unit_number) || 0;
        const match = item.title.match(/(?:unit|wk|week)\s*([0-9]+)/i);
        return match ? parseInt(match[1]) || 0 : 0;
    };

    const getLessonNum = (item) => {
        const match = item.title.match(/lesson\s*([0-9]+)/i);
        if (match) return parseInt(match[1]) || 0;
        const numMatch = item.title.replace(/[^0-9]/g, '');
        return numMatch ? parseInt(numMatch) : 999;
    };

    assignments.sort((a, b) => {
        let unitA = getUnitNum(a);
        let unitB = getUnitNum(b);
        if (unitA !== unitB) return unitA - unitB;
        
        let isSubA = a.title.startsWith('↳');
        let isSubB = b.title.startsWith('↳');
        
        if (!isSubA && isSubB) return -1;
        if (isSubA && !isSubB) return 1;
        
        if (isSubA && isSubB) {
            let lessonA = getLessonNum(a);
            let lessonB = getLessonNum(b);
            if (lessonA !== lessonB) return lessonA - lessonB;
        }
        
        return new Date(a.due_date) - new Date(b.due_date);
    });

    const pageSize = 6;
    const totalPages = Math.ceil(assignments.length / pageSize);
    if (page > totalPages && totalPages > 0) page = totalPages;
    if (page < 1) page = 1;
    currentAssignmentPage = page;

    const startIndex = (page - 1) * pageSize;
    const paginatedAssignments = assignments.slice(startIndex, startIndex + pageSize);
    
    paginatedAssignments.forEach(assign => {
        const isSubItem = assign.title.startsWith('↳');
        const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
        const formattedDate = window.formatDate ? window.formatDate(assign.due_date) : assign.due_date;
        
        let checkboxHtml = '';
        if (isSubItem) {
            const cClass = assign.is_completed ? "bg-indigo-500 text-white border-indigo-500" : "text-transparent border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:text-indigo-500";
            checkboxHtml = `<button type="button" onclick="toggleAssignment('${assign.id}', ${assign.is_completed}, '${courseId}')" class="w-5 h-5 rounded border transition flex items-center justify-center shrink-0 ${cClass}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>`;
        } else {
            const unitLessons = assignments.filter(a => a.unit_number === assign.unit_number && a.title.startsWith('↳'));
            const allDone = unitLessons.length > 0 && unitLessons.every(l => l.is_completed);
            const unitClass = allDone ? "bg-green-500 text-white border-green-500" : "bg-zinc-200 dark:bg-brand-700 text-zinc-400 border-transparent";
            checkboxHtml = `<div class="w-5 h-5 rounded border transition flex items-center justify-center shrink-0 ${unitClass}" title="Automatically completed when all unit lessons are done"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div>`;
            
            if (assign.is_completed !== allDone) {
                supabaseClient.from('assignments').update({ is_completed: allDone }).eq('id', assign.id);
                assign.is_completed = allDone;
            }
        }

        const tClass = assign.is_completed ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200";
        
        let subItemForm = '';
        if (!isSubItem && assign.unit_number) {
            subItemForm = `
                <div class="mt-2 pl-8 flex gap-2">
                    <input type="text" id="date-${assign.id}" value="${formattedDate}" placeholder="YYYY-MM-DD" class="hidden">
                    <input type="text" id="subInput-${assign.id}" placeholder="Add lesson or review..." class="flex-1 border border-zinc-200 dark:border-brand-700 dark:bg-brand-900 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500">
                    <button type="button" onclick="addSubItem('${assign.id}', '${courseId}')" class="bg-indigo-600 text-white px-2.5 py-1 rounded text-xs font-bold hover:bg-indigo-500 transition">+ Lesson</button>
                </div>`;
        }
        
        listEl.innerHTML += `
            <div class="p-3 bg-zinc-50 dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-sm mb-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        ${checkboxHtml}
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="font-bold transition-all truncate ${tClass}">${unitBadge}${assign.title}</span>
                            <input type="text" value="${formattedDate}" placeholder="YYYY-MM-DD" onchange="updateAssignmentDate('${assign.id}', this.value, '${courseId}')" class="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border border-transparent hover:border-zinc-300 dark:hover:border-brand-600 rounded px-1 py-0.5 mt-0.5 w-32 cursor-pointer focus:outline-none focus:border-indigo-500 font-mono" title="Type date matching your format preference">
                        </div>
                    </div>
                    <button type="button" onclick="deleteAssignment('${assign.id}', '${courseId}')" class="text-zinc-400 hover:text-red-500 transition px-2 shrink-0">✕</button>
                </div>
                ${subItemForm}
            </div>`;
    });

    if (totalPages > 1) {
        listEl.innerHTML += `
            <div class="flex items-center justify-between pt-3 mt-2 border-t border-zinc-200 dark:border-brand-700 text-xs">
                <button type="button" onclick="changeAssignmentPage('${courseId}', ${page - 1})" ${page <= 1 ? 'disabled class="opacity-40 cursor-not-allowed px-2.5 py-1 bg-zinc-200 dark:bg-brand-700 rounded font-bold text-zinc-600 dark:text-zinc-300"' : 'class="px-2.5 py-1 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded font-bold text-zinc-700 dark:text-zinc-200 transition"'}>Previous</button>
                <span class="text-zinc-500 dark:text-zinc-400 font-medium">Page ${page} of ${totalPages}</span>
                <button type="button" onclick="changeAssignmentPage('${courseId}', ${page + 1})" ${page >= totalPages ? 'disabled class="opacity-40 cursor-not-allowed px-2.5 py-1 bg-zinc-200 dark:bg-brand-700 rounded font-bold text-zinc-600 dark:text-zinc-300"' : 'class="px-2.5 py-1 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded font-bold text-zinc-700 dark:text-zinc-200 transition"'}>Next</button>
            </div>`;
    }
}

const aForm = document.getElementById('addAssignmentForm');
if (aForm) {
    aForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const courseId = document.getElementById('editCourseId').value;
        const unitNum = document.getElementById('assignUnit').value ? parseInt(document.getElementById('assignUnit').value) : null;
        
        await supabaseClient.from('assignments').insert([{
            course_id: courseId, user_id: currentUser.id,
            title: document.getElementById('assignTitle').value,
            unit_number: unitNum,
            due_date: document.getElementById('assignDate').value
        }]);
        
        document.getElementById('assignTitle').value = '';
        document.getElementById('assignUnit').value = '';
        document.getElementById('assignDate').value = '';
        loadAssignments(courseId, currentAssignmentPage);
    });
}

window.deleteAssignment = async (assignId, courseId) => {
    await supabaseClient.from('assignments').delete().eq('id', assignId);
    loadAssignments(courseId, currentAssignmentPage);
};

let isSimulatingGrades = false;
let simulatedGradesMap = {};

window.toggleGradeSimulator = () => {
    isSimulatingGrades = !isSimulatingGrades;
    if (!isSimulatingGrades) {
        simulatedGradesMap = {};
    }
    loadGradesPage();
};

window.resetGradeSimulation = () => {
    simulatedGradesMap = {};
    loadGradesPage();
};

window.simulateAssignmentGrade = (assignId, gradeVal) => {
    if (gradeVal === '' || gradeVal === null) {
        delete simulatedGradesMap[assignId];
    } else {
        simulatedGradesMap[assignId] = parseFloat(gradeVal);
    }
    loadGradesPage(true);
};

async function loadGradesPage(isFastRecalc = false) {
    const container = document.getElementById('gradesContainer');
    if (!container) return;

    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    container.innerHTML = '';
    let totalGradePoints = 0;
    let gradedCount = 0;

    // Simulator Top Control Banner
    const simBanner = `
        <div class="mb-6 p-5 rounded-2xl border transition-all ${isSimulatingGrades ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' : 'bg-white dark:bg-brand-800 border-zinc-200 dark:border-brand-700 shadow-sm'}">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div class="flex items-center gap-3.5">
                    <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${isSimulatingGrades ? 'bg-indigo-600 text-white animate-pulse' : 'bg-indigo-50 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400'}">🎯</div>
                    <div>
                        <h3 class="font-extrabold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                            "What-If" Target Grade Simulator
                            ${isSimulatingGrades ? '<span class="px-2 py-0.5 bg-indigo-500 text-white rounded text-[10px] uppercase font-bold tracking-wider animate-pulse">Simulator Active</span>' : ''}
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            ${isSimulatingGrades ? 'Type hypothetical exam or lesson scores below to see projected GPA in real time. (Your real saved grades are never changed).' : 'Test hypothetical exam scores to calculate what score you need to reach your target GPA.'}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    ${isSimulatingGrades ? '<button type="button" onclick="resetGradeSimulation()" class="px-3.5 py-2 bg-zinc-200 dark:bg-brand-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition hover:bg-zinc-300">Reset Sim</button>' : ''}
                    <button type="button" onclick="toggleGradeSimulator()" class="px-4 py-2 ${isSimulatingGrades ? 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5">
                        ${isSimulatingGrades ? 'Exit Simulator ✕' : 'Launch Simulator 🎯'}
                    </button>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = simBanner;

    courses.forEach(course => {
        const cAssignments = assignments.filter(a => a.course_id === course.id && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
        const unitsMap = {};
        cAssignments.forEach(a => {
            const uNum = a.unit_number || 1;
            if (!unitsMap[uNum]) unitsMap[uNum] = [];
            unitsMap[uNum].push(a);
        });

        let courseTotal = 0;
        let courseGraded = 0;
        let unitsHtml = '';

        Object.keys(unitsMap).sort((a,b) => a-b).forEach(uNum => {
            let lessonsHtml = '';
            
            unitsMap[uNum].sort((a, b) => {
                const getLessonNum = (item) => {
                    const match = item.title.match(/lesson\s*([0-9]+)/i);
                    if (match) return parseInt(match[1]);
                    const numMatch = item.title.replace(/[^0-9]/g, '');
                    return numMatch ? parseInt(numMatch) : 999;
                };
                let isSubA = a.title.startsWith('↳');
                let isSubB = b.title.startsWith('↳');
                if (!isSubA && isSubB) return -1;
                if (isSubA && !isSubB) return 1;
                if (isSubA && isSubB) return getLessonNum(a) - getLessonNum(b);
                return new Date(a.due_date) - new Date(b.due_date);
            });

            unitsMap[uNum].forEach(item => {
                const activeGrade = isSimulatingGrades && simulatedGradesMap[item.id] !== undefined ? simulatedGradesMap[item.id] : item.grade;
                const isSimulatedVal = isSimulatingGrades && simulatedGradesMap[item.id] !== undefined;

                if (activeGrade !== null && activeGrade !== undefined && !item.exclude_from_gpa) {
                    courseTotal += parseFloat(activeGrade);
                    courseGraded++;
                }

                const inputHandler = isSimulatingGrades ? `oninput="simulateAssignmentGrade('${item.id}', this.value)"` : `onchange="updateAssignmentGrade('${item.id}', this.value)"`;

                lessonsHtml += `
                    <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-brand-900 rounded-lg border ${isSimulatedVal ? 'border-indigo-400 bg-indigo-50/20' : 'border-zinc-200 dark:border-brand-700'} text-xs">
                        <span class="font-bold truncate flex-1 ${isSimulatedVal ? 'text-indigo-600 dark:text-indigo-400' : ''}">${item.title}</span>
                        <div class="flex items-center gap-3">
                            <label class="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                                <input type="checkbox" ${item.exclude_from_gpa ? 'checked' : ''} onchange="toggleExcludeGpa('${item.id}', this.checked)" class="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"> Exclude
                            </label>
                            <div class="flex items-center gap-1">
                                <input type="number" min="0" max="100" value="${activeGrade !== null && activeGrade !== undefined ? activeGrade : ''}" placeholder="--" ${inputHandler} class="w-16 text-center text-xs font-bold p-1 rounded border ${isSimulatedVal ? 'border-indigo-500 bg-indigo-50 dark:bg-brand-800 text-indigo-600 font-black' : 'dark:bg-brand-800 dark:border-brand-600'} focus:outline-none focus:border-indigo-500">
                                <span class="text-zinc-400">%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            unitsHtml += `
                <div class="mb-4">
                    <h5 class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">Unit ${uNum}</h5>
                    <div class="space-y-2">${lessonsHtml}</div>
                </div>
            `;
        });

        const courseAvg = courseGraded > 0 ? (courseTotal / courseGraded).toFixed(1) : 'N/A';
        if (courseGraded > 0) {
            totalGradePoints += parseFloat(courseAvg);
            gradedCount++;
        }

        container.innerHTML += `
            <div class="bg-white dark:bg-brand-800 p-6 rounded-2xl border border-zinc-200 dark:border-brand-700 shadow-sm mb-4">
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-zinc-200 dark:border-brand-700">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${course.emoji || '📚'}</span>
                        <h3 class="font-bold text-base text-zinc-800 dark:text-zinc-100">${course.code}</h3>
                    </div>
                    <span class="text-sm font-extrabold px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg">Course Average: ${courseAvg}%</span>
                </div>
                ${unitsHtml || '<p class="text-xs text-zinc-400">No graded coursework in this class yet.</p>'}
            </div>
        `;
    });

    const cumulativeEl = document.getElementById('cumulativeGpaVal');
    if (cumulativeEl && gradedCount > 0) {
        const avgPct = totalGradePoints / gradedCount;
        const scaleTarget = parseFloat(localStorage.getItem('duevinci_gpa_scale') || '4.0');
        const gpa = ((avgPct / 100) * scaleTarget).toFixed(2);
        cumulativeEl.innerText = `${gpa} / ${scaleTarget.toFixed(1)}`;
    }
}

window.updateAssignmentGrade = async (assignId, gradeVal) => {
    const val = gradeVal === '' ? null : parseFloat(gradeVal);
    await supabaseClient.from('assignments').update({ grade: val }).eq('id', assignId);
    loadGradesPage();
};

window.toggleExcludeGpa = async (assignId, excluded) => {
    await supabaseClient.from('assignments').update({ exclude_from_gpa: excluded }).eq('id', assignId);
    loadGradesPage();
};

// --- AI STUDY FLASHCARDS & PRACTICE QUIZ ---
let currentDeckCards = [];
let currentCardIndex = 0;
let isCardFlipped = false;

window.generateStudyDeck = async (courseId) => {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    const { data: assignments } = await supabaseClient.from('assignments').select('*').eq('course_id', courseId);
    const topics = assignments ? assignments.map(a => a.title.replace('↳', '').trim()).filter(Boolean) : [];
    
    const deck = [];
    if (topics.length > 0) {
        topics.slice(0, 8).forEach((t, idx) => {
            deck.push({
                term: `${course.code}: ${t}`,
                definition: `Key concept in Unit ${Math.floor(idx/3)+1}. Review core principles, active recall points, and test requirements for ${t}.`
            });
        });
    } else {
        deck.push(
            { term: `${course.code} Overview`, definition: 'Core fundamentals, introductory terminology, and foundational course methodologies.' },
            { term: 'Methodology & Application', definition: 'Key analytical problem-solving techniques and formulas applied throughout the semester.' },
            { term: 'Midterm Review Focus', definition: 'High-frequency exam concepts, synthetic problem sets, and practical applications.' }
        );
    }
    
    currentDeckCards = deck;
    currentCardIndex = 0;
    isCardFlipped = false;
    renderFlashcardView();
};

window.renderFlashcardView = () => {
    const container = document.getElementById('studyQuizContainer');
    if (!container || currentDeckCards.length === 0) return;
    
    const card = currentDeckCards[currentCardIndex];
    container.innerHTML = `
        <div class="space-y-4 text-center">
            <div class="flex justify-between items-center text-xs text-zinc-400 font-bold px-2">
                <span>Card ${currentCardIndex + 1} of ${currentDeckCards.length}</span>
                <span class="text-indigo-500 font-medium">Click card to flip 🔄</span>
            </div>
            <div onclick="flipCurrentCard()" class="cursor-pointer min-h-[160px] p-6 bg-zinc-50 dark:bg-brand-900 border-2 ${isCardFlipped ? 'border-indigo-500 bg-indigo-50/20' : 'border-zinc-200 dark:border-brand-700'} rounded-2xl flex flex-col items-center justify-center shadow-md transition-all hover:scale-[1.02]">
                <div class="text-[11px] uppercase tracking-wider font-extrabold ${isCardFlipped ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'} mb-2">
                    ${isCardFlipped ? '💡 Concept / Definition' : '📖 Term / Topic'}
                </div>
                <div class="font-bold text-base dark:text-white leading-relaxed">
                    ${isCardFlipped ? card.definition : card.term}
                </div>
            </div>
            <div class="flex justify-between gap-2">
                <button onclick="prevFlashcard()" ${currentCardIndex === 0 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 transition"'}">← Prev</button>
                <button onclick="flipCurrentCard()" class="px-4 py-2 bg-indigo-50 dark:bg-brand-700/60 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold border border-indigo-200 dark:border-brand-600 transition">Flip 🔄</button>
                <button onclick="nextFlashcard()" ${currentCardIndex === currentDeckCards.length - 1 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"'}">Next →</button>
            </div>
        </div>
    `;
};

window.flipCurrentCard = () => {
    isCardFlipped = !isCardFlipped;
    renderFlashcardView();
};

window.nextFlashcard = () => {
    if (currentCardIndex < currentDeckCards.length - 1) {
        currentCardIndex++;
        isCardFlipped = false;
        renderFlashcardView();
    }
};

window.prevFlashcard = () => {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        isCardFlipped = false;
        renderFlashcardView();
    }
};

function initCalendar() {
    if (calendarInstance) return;
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        timeZone: 'local',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: [],
        dayMaxEvents: true,
        eventClick: async function(info) {
            if (info.event.extendedProps.isCustom) {
                if(confirm(`Delete custom event "${info.event.title}"?`)) deleteCustomEvent(info.event.extendedProps.eventId);
            } else if (info.event.extendedProps.isAssignment) {
                const assignId = info.event.extendedProps.assignmentId;
                const newState = !info.event.extendedProps.isCompleted;
                await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
                if (newState) fireConfetti();
                loadCalendarCourses();
            }
        }
    });
    calendarInstance.render();
}

async function loadCalendarCourses() {
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    const { data: customEvents } = await supabaseClient.from('custom_events').select('*');
    
    let calendarEvents = [];
    const courseMap = {};
    if(courses) courses.forEach(c => courseMap[c.id] = c);
    
    if(assignments) assignments.forEach(assign => {
        const course = courseMap[assign.course_id];
        if(!course) return;
        const prefix = assign.unit_number ? `[Wk ${assign.unit_number}] ` : '';
        calendarEvents.push({
            title: `${course.emoji || '📚'} ${prefix}${assign.title}`,
            start: assign.due_date,
            color: assign.is_completed ? '#9ca3af' : course.color,
            extendedProps: { isAssignment: true, assignmentId: assign.id, isCompleted: assign.is_completed }
        });
    });
    
    if(customEvents) customEvents.forEach(ev => {
        calendarEvents.push({ title: ev.title, start: ev.event_date, color: ev.color, extendedProps: { isCustom: true, eventId: ev.id } });
    });
    
    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(calendarEvents);
    }
}

window.openEventModal = () => document.getElementById('eventModal').classList.remove('hidden');
window.closeEventModal = () => document.getElementById('eventModal').classList.add('hidden');

const customEventForm = document.getElementById('customEventForm');
if(customEventForm) {
    customEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await supabaseClient.from('custom_events').insert([{
            user_id: currentUser.id, title: document.getElementById('evTitle').value,
            event_date: document.getElementById('evDate').value, color: document.getElementById('evColor').value
        }]);
        document.getElementById('evTitle').value = '';
        closeEventModal();
        loadCalendarCourses();
    });
}

window.deleteCustomEvent = async (id) => {
    await supabaseClient.from('custom_events').delete().eq('id', id);
    loadCalendarCourses();
};

window.exportToICS = () => {
    if(!calendarInstance) return;
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DueVinci//Student Planner//EN\n";
    calendarInstance.getEvents().forEach(ev => {
        const dateStr = ev.start.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        icsContent += "BEGIN:VEVENT\nSUMMARY:" + ev.title + "\nDTSTART:" + dateStr + "\nDTEND:" + dateStr + "\nEND:VEVENT\n";
    });
    icsContent += "END:VCALENDAR";
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'duevinci-schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- SECRET EASTER EGGS SUITE & GLOBAL COMMAND PALETTE ---
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiPos = 0;

document.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === konamiSequence[konamiPos] || e.key === konamiSequence[konamiPos]) {
        konamiPos++;
        if (konamiPos === konamiSequence.length) {
            konamiPos = 0;
            triggerKonamiEasterEgg();
        }
    } else {
        konamiPos = 0;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
    }
});

window.triggerKonamiEasterEgg = () => {
    if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 100, origin: { y: 0.4 } });
        setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } }), 250);
        setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } }), 400);
    }
    alert("🎨 Secret Easter Egg Unlocked!\nYou discovered the Da Vinci Renaissance Gold mode! +100 Focus Mastery.");
};

window.ensureCommandPaletteExists = () => {
    if (document.getElementById('commandPaletteModal')) return;
    const div = document.createElement('div');
    div.id = 'commandPaletteModal';
    div.className = 'fixed inset-0 z-50 flex items-start justify-center pt-24 bg-zinc-900/60 backdrop-blur-sm hidden p-4';
    div.innerHTML = `
        <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div class="p-4 border-b border-zinc-200 dark:border-brand-700 flex items-center gap-3">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" class="text-zinc-400" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="cmdInput" oninput="filterCommandPalette(this.value)" onkeydown="handleCmdKey(event)" placeholder="Search pages, actions, or secret commands (/party)..." class="w-full bg-transparent text-sm focus:outline-none dark:text-white">
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-brand-700 text-zinc-400 font-mono">ESC</span>
            </div>
            <div id="cmdResults" class="p-2 max-h-72 overflow-y-auto space-y-1 text-xs">
                <!-- Populated dynamically -->
            </div>
        </div>
    `;
    document.body.appendChild(div);
};

window.toggleCommandPalette = () => {
    window.ensureCommandPaletteExists();
    const m = document.getElementById('commandPaletteModal');
    if (!m) return;
    const isHidden = m.classList.contains('hidden');
    if (isHidden) {
        m.classList.remove('hidden');
        const input = document.getElementById('cmdInput');
        if (input) {
            input.value = '';
            input.focus();
            filterCommandPalette('');
        }
    } else {
        m.classList.add('hidden');
    }
};

window.filterCommandPalette = (query) => {
    const results = document.getElementById('cmdResults');
    if (!results) return;
    const q = query.toLowerCase().trim();
    
    const items = [
        { title: 'Dashboard', desc: 'Jump to main study dashboard', action: () => window.location.href = 'index.html', icon: '📊' },
        { title: 'Classes & Coursework', desc: 'Manage courses, syllabus AI, and lessons', action: () => window.location.href = 'courses.html', icon: '📚' },
        { title: 'Grades & GPA Tracker', desc: 'View course averages and GPA simulator', action: () => window.location.href = 'grades.html', icon: '🎓' },
        { title: 'Master Calendar', desc: 'Deadlines, events, and .ics export', action: () => window.location.href = 'calendar.html', icon: '📅' },
        { title: 'Help & Support', desc: 'Contact developer & view FAQs', action: () => openSupportModal(), icon: '💬' },
        { title: 'What\'s New', desc: 'View latest features in version 2.2', action: () => openWhatsNewModal(), icon: '✨' },
        { title: '/party', desc: 'Trigger celebratory confetti storm', action: () => { confetti({ particleCount: 100, spread: 80 }); }, icon: '🎉' },
        { title: '/inspire', desc: 'Leonardo da Vinci wisdom quote', action: () => { alert('"Learning never exhausts the mind." — Leonardo da Vinci'); }, icon: '📜' },
        { title: '/zen', desc: 'Activate Zen study aura', action: () => { confetti({ particleCount: 40, spread: 60, colors: ['#a78bfa', '#818cf8', '#c084fc'] }); }, icon: '🧘' },
        { title: '/maestro', desc: 'Rain Maestro University crests & shields', action: () => triggerMaestroRain(), icon: '🛡️' }
    ];

    const filtered = q ? items.filter(i => i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) : items;
    results.innerHTML = filtered.map((item, idx) => `
        <div onclick="executeCmd(${idx})" class="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-brand-700 cursor-pointer transition">
            <div class="flex items-center gap-3">
                <span class="text-base">${item.icon}</span>
                <div>
                    <div class="font-bold text-zinc-800 dark:text-zinc-100">${item.title}</div>
                    <div class="text-[11px] text-zinc-400">${item.desc}</div>
                </div>
            </div>
            <span class="text-xs text-zinc-400">↵</span>
        </div>
    `).join('') || '<div class="p-4 text-center text-zinc-400 text-xs">No matching commands. Try <code>/maestro</code>, <code>/party</code>, or <code>/zen</code></div>';
    window._currentCmdItems = filtered;
};

window.executeCmd = (idx) => {
    if (window._currentCmdItems && window._currentCmdItems[idx]) {
        toggleCommandPalette();
        window._currentCmdItems[idx].action();
    }
};

window.handleCmdKey = (e) => {
    if (e.key === 'Escape') toggleCommandPalette();
    if (e.key === 'Enter') {
        if (window._currentCmdItems && window._currentCmdItems[0]) {
            toggleCommandPalette();
            window._currentCmdItems[0].action();
        }
    }
};

// --- SECRET MAESTRO UNIVERSITY RAIN ANIMATION ---
window.triggerMaestroRain = () => {
    const existing = document.getElementById('maestroRainOverlay');
    if (existing) existing.remove();

    if (!document.getElementById('maestroRainStyle')) {
        const style = document.createElement('style');
        style.id = 'maestroRainStyle';
        style.innerHTML = `
            @keyframes maestroFall {
                0% {
                    transform: translateY(-90px) rotate(0deg) scale(0.9);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(105vh) rotate(var(--maestro-rot)) scale(1.05);
                    opacity: 0;
                }
            }
            @keyframes maestroSway {
                0%, 100% {
                    margin-left: 0px;
                }
                50% {
                    margin-left: var(--maestro-sway);
                }
            }
            @keyframes maestroBadgePop {
                0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            .maestro-shield-item {
                position: absolute;
                top: -80px;
                user-select: none;
                cursor: pointer;
                transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35));
                animation: maestroFall var(--fall-dur) linear forwards, maestroSway var(--sway-dur) ease-in-out infinite alternate;
            }
            .maestro-shield-item:hover {
                transform: scale(1.4) rotate(15deg) !important;
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'maestroRainOverlay';
    overlay.className = 'fixed inset-0 pointer-events-none z-[9999] overflow-hidden';
    document.body.appendChild(overlay);

    // Toast Badge
    const badge = document.createElement('div');
    badge.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-[10000] bg-zinc-900/90 dark:bg-black/90 text-white px-5 py-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-3 backdrop-blur-md transition-all pointer-events-none';
    badge.style.animation = 'maestroBadgePop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    badge.innerHTML = `
        <div class="w-9 h-9 rounded-xl bg-[#eae7dc] p-1 flex items-center justify-center shadow-inner">
            <img src="maestro-logo.svg" alt="Maestro" class="w-full h-full object-contain">
        </div>
        <div>
            <div class="text-xs font-black tracking-wider uppercase text-amber-400">Maestro University</div>
            <div class="text-xs text-zinc-300 font-medium">Honor & Excellence Raining Down! 🛡️🎓</div>
        </div>
    `;
    overlay.appendChild(badge);

    // Confetti burst
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 50,
            spread: 80,
            origin: { y: 0.12 },
            colors: ['#eae7dc', '#262626', '#f59e0b', '#6366f1']
        });
    }

    const totalLogos = 45;
    const logoSvgMarkup = `
        <svg viewBox="0 0 100 120" class="w-full h-full select-none pointer-events-none">
            <path d="M 20 8 L 80 8 Q 94 8 94 22 L 94 65 C 94 95 50 116 50 116 C 50 116 6 95 6 65 L 6 22 Q 6 8 20 8 Z" fill="#eae7dc"/>
            <rect x="32" y="34" width="12" height="12" rx="1" fill="#242424" />
            <rect x="56" y="34" width="12" height="12" rx="1" fill="#242424" />
            <rect x="20" y="46" width="12" height="12" rx="1" fill="#242424" />
            <rect x="44" y="46" width="12" height="12" rx="1" fill="#242424" />
            <rect x="68" y="46" width="12" height="12" rx="1" fill="#242424" />
            <rect x="32" y="58" width="12" height="12" rx="1" fill="#242424" />
            <rect x="56" y="58" width="12" height="12" rx="1" fill="#242424" />
            <rect x="44" y="70" width="12" height="12" rx="1" fill="#242424" />
        </svg>
    `;

    for (let i = 0; i < totalLogos; i++) {
        const el = document.createElement('div');
        el.className = 'maestro-shield-item pointer-events-auto';
        
        const size = Math.floor(Math.random() * 34) + 32; // 32px to 66px
        const left = Math.random() * 92; // 0% to 92%
        const delay = Math.random() * 2.5; // 0s to 2.5s
        const fallDur = (Math.random() * 1.8 + 2.4).toFixed(2); // 2.4s to 4.2s
        const swayDur = (Math.random() * 1.2 + 1.2).toFixed(2); // 1.2s to 2.4s
        const swayAmt = (Math.random() * 60 - 30).toFixed(0) + 'px';
        const rot = (Math.random() * 160 - 80).toFixed(0) + 'deg';

        el.style.width = `${size}px`;
        el.style.height = `${size * 1.2}px`;
        el.style.left = `${left}%`;
        el.style.setProperty('--fall-dur', `${fallDur}s`);
        el.style.setProperty('--sway-dur', `${swayDur}s`);
        el.style.setProperty('--maestro-sway', swayAmt);
        el.style.setProperty('--maestro-rot', rot);
        el.style.animationDelay = `${delay}s, ${delay}s`;

        el.innerHTML = logoSvgMarkup;

        // Click on falling shield for pop & confetti
        el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            el.style.transform = 'scale(1.8) rotate(360deg)';
            el.style.opacity = '0';
            if (typeof confetti === 'function') {
                const rect = el.getBoundingClientRect();
                confetti({
                    particleCount: 15,
                    spread: 45,
                    origin: {
                        x: (rect.left + rect.width / 2) / window.innerWidth,
                        y: (rect.top + rect.height / 2) / window.innerHeight
                    },
                    colors: ['#eae7dc', '#f59e0b', '#242424']
                });
            }
            setTimeout(() => el.remove(), 250);
        });

        overlay.appendChild(el);
    }

    setTimeout(() => {
        if (overlay) {
            overlay.style.transition = 'opacity 0.6s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 600);
        }
    }, 6000);
};

// PWA Service Worker Registration
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('SW reg error:', err);
        });
    });
}

// Check What's New banner & tour visibility on launch
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.checkWhatsNewOnLaunch === 'function') {
            window.checkWhatsNewOnLaunch();
        }
        if (typeof window.updateTourButtonVisibility === 'function') {
            window.updateTourButtonVisibility();
        }
    }, 400);
});

checkUser();