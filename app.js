// Supabase Project API Keys
const SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let calendarInstance = null;
let localCourses = [];
let currentAssignmentPage = 1;
let customTerms = JSON.parse(localStorage.getItem('duevinci_terms')) || [];
let hideUnassignedFolder = localStorage.getItem('hideUnassigned') === 'true';
let floatingTimerDismissed = false;
let lastProcessedSessionToken = null;

// --- INJECT CALENDAR DARK MODE FIX STYLES ---
const calendarDarkFixStyle = document.createElement('style');
calendarDarkFixStyle.innerHTML = `
    .dark .fc-popover {
        background-color: #18181b !important;
        border-color: #27272a !important;
        color: #f4f4f5 !important;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7);
        border-radius: 0.75rem;
        overflow: hidden;
    }
    .dark .fc-popover-header {
        background-color: #27272a !important;
        color: #f4f4f5 !important;
        padding: 10px 14px !important;
        border-bottom: 1px solid #3f3f46 !important;
    }
    .dark .fc-popover-title {
        color: #f4f4f5 !important;
        font-weight: 700 !important;
        font-size: 0.875rem !important;
    }
    .dark .fc-popover-close {
        color: #a1a1aa !important;
        opacity: 0.9 !important;
        cursor: pointer;
    }
    .dark .fc-popover-close:hover {
        color: #ffffff !important;
    }
    .dark .fc-popover-body {
        padding: 8px !important;
    }
`;
document.head.appendChild(calendarDarkFixStyle);

// --- THEME LOGIC ---
window.changeTheme = (themeValue) => {
    localStorage.setItem('theme', themeValue);
    if (themeValue === 'dark' || (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

// --- CONFETTI & STUDY STREAK RECORDER ---
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

// --- TOP TITLE BAR INJECTOR & SIDEBAR TOGGLE ---
function ensureTopTitleBar() {
    const appScreen = document.getElementById('appScreen');
    if (!appScreen) return;
    
    const headerEl = appScreen.querySelector('header');
    if (headerEl) {
        headerEl.className = 'h-16 border-b border-zinc-200 dark:border-brand-800 flex items-center justify-between px-8 gap-4 bg-white dark:bg-brand-900 shrink-0';
        if (!document.getElementById('headerLogoSection')) {
            const logoDiv = document.createElement('div');
            logoDiv.id = 'headerLogoSection';
            logoDiv.className = 'flex items-center gap-3';
            logoDiv.innerHTML = `
                <button type="button" onclick="toggleSidebar()" title="Toggle Sidebar" class="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-brand-800 text-zinc-600 dark:text-zinc-300 transition">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                </button>
                <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">DV</div>
                <div>
                    <h1 class="font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight text-base leading-tight">DueVinci</h1>
                    <p class="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-none mt-0.5">Student Planner Workspace</p>
                </div>
            `;
            headerEl.insertBefore(logoDiv, headerEl.firstChild);
        }
    }
}

window.toggleSidebar = () => {
    const aside = document.querySelector('aside');
    if (!aside) return;
    aside.classList.toggle('hidden');
};

// --- POMODORO TIMER LOGIC WITH REFRESH PERSISTENCE ---
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
    if (!timerRunning || floatingTimerDismissed) {
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
};

document.addEventListener('DOMContentLoaded', () => {
    applyTimerCollapse();
    if (timerRunning && timeLeft > 0) {
        const btn = document.getElementById('timerPlayBtn');
        if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        timerInterval = setInterval(() => {
            if (timerEndTime > Date.now()) {
                timeLeft = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
                updateTimerDisplay();
            } else {
                skipTimer();
            }
        }, 1000);
    }
    updateTimerDisplay();
});

// --- AUTH & ROUTING LOGIC ---
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
            ensureTopTitleBar();
        }
        
        const path = window.location.pathname;
        if ((path.endsWith('index.html') || path.endsWith('/')) && document.getElementById('dashboardGrid')) {
            loadDashboardStats();
            if (typeof window.renderAcademicsDashboardWidget === 'function') window.renderAcademicsDashboardWidget('dashboardGrid');
        }
        if (path.endsWith('courses.html') && document.getElementById('coursesGrid')) loadCoursesPage();
        if (path.endsWith('calendar.html') && document.getElementById('calendar')) {
            initCalendar();
            loadCalendarCourses();
        }
    } else {
        currentUser = null;
        const path = window.location.pathname;
        if (!path.endsWith('index.html') && !path.endsWith('/') && !path.includes('DueVinci')) {
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

// --- MODULAR SETTINGS POPUP LOGIC ---
window.openSettingsModal = () => {
    if(currentUser) document.getElementById('profileEmail').value = currentUser.email;
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = localStorage.getItem('theme') || 'system';
    document.getElementById('settingsModal').classList.remove('hidden');
};

window.closeSettingsModal = () => {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('settingsMsg').classList.add('hidden');
};

window.switchSettingsTab = (tabName) => {
    document.getElementById('content-profile').classList.add('hidden');
    document.getElementById('content-appearance').classList.add('hidden');
    
    document.getElementById('tab-profile').className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    document.getElementById('tab-appearance').className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).className = "w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition";
};

const settingsForm = document.getElementById('settingsForm');
if(settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('profileEmail').value;
        const password = document.getElementById('profilePassword').value;
        const msgEl = document.getElementById('settingsMsg');
        
        let updates = {};
        if(email && email !== currentUser.email) updates.email = email;
        if(password) updates.password = password;
        
        if(Object.keys(updates).length === 0) {
            msgEl.textContent = "No changes made.";
            msgEl.className = "text-xs text-center mt-2 text-zinc-500";
            msgEl.classList.add('hidden');
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
}

// --- DASHBOARD LOGIC ---
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
        
        // Show lessons and upcoming exams, finals, tests, or reviews in Up Next (excluding generic unit headers)
        const upcoming = assignments.filter(a => !a.is_completed && (
            a.title.includes('↳') || 
            /lesson|exam|final|midterm|test|review/i.test(a.title)
        ));
        
        if (upcoming.length === 0) {
            upNextListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">No upcoming lessons. You\'re all caught up!</p>';
        } else {
            upcoming.forEach(assign => {
                const course = courses.find(c => c.id === assign.course_id);
                if (!course) return;
                
                const dateStr = new Date(assign.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
                
                upNextListEl.innerHTML += `
                    <div class="flex items-center gap-3 p-3 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700">
                        <button onclick="toggleAssignment('${assign.id}', false, null)" class="w-5 h-5 rounded border border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-brand-700 transition flex items-center justify-center text-transparent hover:text-indigo-500 shrink-0"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>
                        <div>
                            <p class="text-sm font-bold text-zinc-800 dark:text-zinc-200">${course.emoji} ${unitBadge}${assign.title}</p>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">${course.code} • Target: ${dateStr}</p>
                        </div>
                    </div>`;
            });
        }
    }

    const goalsListEl = document.getElementById('goalsList');
    if (goalsListEl) {
        goalsListEl.innerHTML = '';
        if(courses.length === 0) goalsListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">Add classes to start tracking weekly progress.</p>';
        else {
            courses.forEach(course => {
                // Count only lessons and exams/reviews, excluding generic unit headers for accurate progress
                const cAssign = assignments.filter(a => a.course_id === course.id && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
                const complete = cAssign.filter(a => a.is_completed).length;
                let pct = course.is_completed ? 100 : (cAssign.length ? Math.round((complete/cAssign.length)*100) : 0);
                
                goalsListEl.innerHTML += `
                    <div>
                        <div class="flex justify-between text-sm mb-2"><span class="font-bold text-zinc-700 dark:text-zinc-300">${course.emoji} ${course.code}</span><span class="font-bold" style="color: ${course.color}">${pct}%</span></div>
                        <div class="w-full bg-zinc-200 dark:bg-brand-700 rounded-full h-2.5 overflow-hidden"><div class="h-2.5 rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${course.color}"></div></div>
                    </div>`;
            });
        }
    }
}

// --- COURSES PAGE, TERMS, DRAG & DROP, & MASTER LIST ---
async function loadCoursesPage() {
    const { data: courses } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
    localCourses = courses || [];
    
    localCourses.forEach(c => {
        if (c.term && !customTerms.includes(c.term.trim())) {
            customTerms.push(c.term.trim());
        }
    });
    localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
    
    const coursesGridEl = document.getElementById('coursesGrid') || document.getElementById('courseList')?.parentElement;
    if (!coursesGridEl) return;

    let container = document.getElementById('coursesMainContainer');
    if (!container) {
        coursesGridEl.innerHTML = `
            <div id="coursesMainContainer" class="space-y-8">
                <div>
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-bold text-zinc-800 dark:text-zinc-200">Term Folders</h3>
                        <div class="flex gap-2">
                            <input type="text" id="newTermInput" placeholder="New term (e.g., Fall 2026)" class="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 focus:outline-none focus:border-indigo-500">
                            <button type="button" onclick="createNewTermFolder()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition">+ Add Term</button>
                        </div>
                    </div>
                    <div id="termFoldersGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"></div>
                </div>
                <div class="pt-6 border-t border-zinc-200 dark:border-brand-700">
                    <h3 class="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4">All Classes (Alphabetical)</h3>
                    <div id="alphabeticalCourseList" class="bg-white dark:bg-brand-800 rounded-xl border border-zinc-200 dark:border-brand-700 divide-y divide-zinc-200 dark:divide-brand-700 overflow-hidden shadow-sm"></div>
                </div>
            `;
    }

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

// --- DRAG AND DROP HANDLERS ---
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

// --- TERM MODAL POP-UP ---
function ensureTermModalExists() {
    let modal = document.getElementById('termModal');
    if (!modal) {
        const div = document.createElement('div');
        div.id = 'termModal';
        div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm hidden';
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
    
    document.getElementById('courseModal').classList.remove('hidden');
    currentAssignmentPage = 1;
    loadAssignments(course.id, currentAssignmentPage);
    if (typeof window.renderResourceLinksSection === 'function') window.renderResourceLinksSection(course.id, 'courseResourceSection');
};

window.closeCourseModal = () => document.getElementById('courseModal').classList.add('hidden');


// --- 1. EDGE FUNCTION SYLLABUS PARSER ---
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

        const metadataOnlyEl = document.getElementById('syllabusMetadataOnly') || 
                               document.getElementById('metadataOnly') || 
                               document.getElementById('syllabusMetadata') ||
                               document.getElementById('metaOnly');
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
            const { error: updateError } = await supabaseClient.from('courses').update(updates).eq('id', courseId);
            if (updateError) {
                console.error("SUPABASE UPDATE FAILED:", updateError.message);
            }
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
                let targetDate = u.dateStr ? new Date(u.dateStr) : new Date(baseDate);
                if (!u.dateStr) {
                    targetDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                }

                const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                    course_id: courseId, user_id: currentUser.id,
                    title: `Unit ${u.num || i + 1}: ${u.title}`,
                    unit_number: u.num || i + 1,
                    due_date: targetDate.toISOString().split('T')[0]
                }]).select();

                if (insertedUnit && insertedUnit[0] && u.lessons) {
                    let lessonNum = 1;
                    for (let lessonTitle of u.lessons) {
                        let formattedTitle = lessonTitle.toLowerCase().startsWith('lesson') ? lessonTitle : `Lesson ${lessonNum}: ${lessonTitle}`;
                        
                        await supabaseClient.from('assignments').insert([{
                            course_id: courseId, user_id: currentUser.id,
                            title: `↳ ${formattedTitle}`,
                            unit_number: u.num || i + 1,
                            due_date: targetDate.toISOString().split('T')[0]
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

// --- 2. EDGE FUNCTION SCREENSHOT PARSER ---
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
                    
                    let targetDate = wk.dateStr ? new Date(wk.dateStr) : new Date(baseDate);
                    if (!wk.dateStr) {
                        targetDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                    }

                    const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                        course_id: courseId, user_id: currentUser.id,
                        title: wk.title || `Week ${wk.num}`,
                        unit_number: wk.num,
                        due_date: targetDate.toISOString().split('T')[0]
                    }]).select();

                    if (insertedUnit && insertedUnit[0] && wk.lessons) {
                        let lessonNum = 1;
                        for (let l of wk.lessons) {
                            let formattedTitle = l.toLowerCase().startsWith('lesson') ? l : `Lesson ${lessonNum}: ${l}`;
                            
                            await supabaseClient.from('assignments').insert([{
                                course_id: courseId, user_id: currentUser.id,
                                title: `↳ ${formattedTitle}`,
                                unit_number: wk.num,
                                due_date: targetDate.toISOString().split('T')[0]
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
        
        const { error: updateError } = await supabaseClient.from('courses').update({ code, color, emoji, description, objectives }).eq('id', id);
        
        if (updateError) {
            console.error("COURSE EDIT UPDATE FAILED:", updateError.message);
            alert(`Failed to save course: ${updateError.message}`);
            return;
        }
        
        const cached = localCourses.find(c => c.id === id);
        if (cached) {
            cached.code = code;
            cached.color = color;
            cached.emoji = emoji;
            cached.description = description;
            cached.objectives = objectives;
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
    
    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) loadDashboardStats();
    else if (courseId) loadAssignments(courseId, currentAssignmentPage);
};

window.updateAssignmentDate = async (assignId, newDate, courseId) => {
    if(!newDate) return;
    await supabaseClient.from('assignments').update({ due_date: newDate }).eq('id', assignId);
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
        course_id: courseId, 
        user_id: currentUser.id,
        title: `↳ ${title}`, 
        unit_number: unitNum,
        due_date: dueDate
    }]);
    loadAssignments(courseId, currentAssignmentPage);
};

window.changeAssignmentPage = (courseId, page) => {
    loadAssignments(courseId, page);
};

async function loadAssignments(courseId, page = 1) {
    const { data: assignments } = await supabaseClient.from('assignments').select('*').eq('course_id', courseId);
    
    const listEl = document.getElementById('assignmentList');
    listEl.innerHTML = '';
    
    if (!assignments || !assignments.length) {
        listEl.innerHTML = '<div class="p-4 border border-dashed border-zinc-300 dark:border-brand-600 rounded-lg text-center"><p class="text-sm text-zinc-500 dark:text-zinc-400">No coursework added yet.</p></div>';
        return;
    }
    
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
                    <input type="date" id="date-${assign.id}" value="${assign.due_date}" class="hidden">
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
                            <input type="date" value="${assign.due_date}" onchange="updateAssignmentDate('${assign.id}', this.value, '${courseId}')" class="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border border-transparent hover:border-zinc-300 dark:hover:border-brand-600 rounded px-1 py-0.5 mt-0.5 w-32 cursor-pointer focus:outline-none focus:border-indigo-500" title="Click to update target week date">
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

// --- CALENDAR LOGIC ---
function initCalendar() {
    if (calendarInstance) return;
    
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        timeZone: 'local',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        events: [],
        dayMaxEvents: true,
        eventClick: async function(info) {
            if (info.event.extendedProps.isCustom) {
                if(confirm(`Delete custom event "${info.event.title}"?`)) {
                    deleteCustomEvent(info.event.extendedProps.eventId);
                }
            } else if (info.event.extendedProps.isAssignment) {
                const assignId = info.event.extendedProps.assignmentId;
                const currentState = info.event.extendedProps.isCompleted;
                const newState = !currentState;
                
                await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
                if (newState) fireConfetti();
                loadCalendarCourses();
            }
        },
        eventDidMount: function(info) {
            if (info.event.extendedProps.isAssignment && info.event.extendedProps.isCompleted) {
                info.el.style.textDecoration = 'line-through';
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
            extendedProps: { 
                isAssignment: true, 
                assignmentId: assign.id, 
                isCompleted: assign.is_completed 
            }
        });
    });
    
    if(customEvents) customEvents.forEach(ev => {
        calendarEvents.push({
            title: ev.title,
            start: ev.event_date,
            color: ev.color,
            extendedProps: { isCustom: true, eventId: ev.id }
        });
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
        const title = document.getElementById('evTitle').value;
        const date = document.getElementById('evDate').value;
        const color = document.getElementById('evColor').value;
        
        await supabaseClient.from('custom_events').insert([{
            user_id: currentUser.id, title: title, event_date: date, color: color
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

checkUser();
