// --- WALKTHROUGH & WHAT'S NEW CHANGELOG MODAL MODULE ---
import { getCurrentPageName, getTourCookie, setTourCookie } from './utils.js';

const ONBOARDING_KEY = 'duevinci_onboarding_v1';
// The 2.3 feature drop uses a versioned dismissal marker so students see each
// release announcement once after the installed app updates.
export const WHATS_NEW_VERSION = '2.3';
const WHATS_NEW_SEEN_KEY = 'duevinci_whats_new_seen';
const WHATS_NEW_SEEN_VALUE = `v${WHATS_NEW_VERSION}`;

function onboardingKey(user) { return `${ONBOARDING_KEY}:${user?.id || 'guest'}`; }

export function showFirstRunOnboarding(user) {
    if (typeof document === 'undefined' || !user?.id || localStorage.getItem(onboardingKey(user))) return;
    if (document.getElementById('firstRunOnboarding')) return;
    const modal = document.createElement('div');
    modal.id = 'firstRunOnboarding';
    modal.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl dark:bg-brand-800">
            <div class="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-7 text-white">
                <img src="assets/images/maestro-logo.svg" alt="DueVinci" class="h-10 w-10 rounded-xl bg-white/15 p-1.5 mb-4">
                <h2 class="text-2xl font-black">Set up your study space</h2>
                <p class="mt-1 text-sm text-white/85">A short checklist to make your dashboard useful from day one.</p>
            </div>
            <div class="p-6">
                <ol class="space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                    <li class="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-brand-700"><span class="flex min-w-0 gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">1</span><span><strong class="block">Add a class</strong><span class="text-xs text-zinc-500 dark:text-zinc-400">Create a home for your coursework.</span></span></span><button type="button" id="onboardingAddClass" class="shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-300">Open</button></li>
                    <li class="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-brand-700"><span class="flex min-w-0 gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">2</span><span><strong class="block">Import a syllabus</strong><span class="text-xs text-zinc-500 dark:text-zinc-400">Let DueVinci build your plan from it.</span></span></span><button type="button" id="onboardingImportSyllabus" class="shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-300">Open</button></li>
                    <li class="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-brand-700"><span class="flex min-w-0 gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">3</span><span><strong class="block">Choose your workspace</strong><span class="text-xs text-zinc-500 dark:text-zinc-400">Hide cards and arrange your dashboard.</span></span></span><button type="button" id="onboardingWorkspace" class="shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-300">Open</button></li>
                    <li class="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-brand-700"><span class="flex min-w-0 gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">4</span><span><strong class="block">Try Study Companion</strong><span class="text-xs text-zinc-500 dark:text-zinc-400">Ask for guided help in a course context.</span></span></span><button type="button" id="onboardingTutor" class="shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-300">Open</button></li>
                </ol>
                <div class="mt-5 grid gap-2 sm:grid-cols-2">
                    <button type="button" id="onboardingTour" class="rounded-xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-800 hover:bg-zinc-200 dark:bg-brand-700 dark:text-white dark:hover:bg-brand-600">Take the quick tour</button>
                    <button type="button" id="onboardingDismiss" class="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">I’ll set this up later</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const finish = () => { localStorage.setItem(onboardingKey(user), 'true'); modal.remove(); };
    modal.addEventListener('click', (event) => {
        if (event.target === modal) finish();
    });
    document.getElementById('onboardingAddClass')?.addEventListener('click', () => { finish(); window.location.href = 'courses/index.html'; });
    document.getElementById('onboardingImportSyllabus')?.addEventListener('click', () => { finish(); window.location.href = 'courses/index.html'; });
    document.getElementById('onboardingWorkspace')?.addEventListener('click', () => { finish(); window.openSettingsModal?.(); window.switchSettingsTab?.('appearance'); });
    document.getElementById('onboardingTutor')?.addEventListener('click', () => { finish(); window.location.href = 'tutor/index.html'; });
    document.getElementById('onboardingTour')?.addEventListener('click', () => { finish(); startWalkthrough(false); });
    document.getElementById('onboardingDismiss')?.addEventListener('click', finish);
}

export function startWalkthrough(manualStart = false) {
    if (typeof window === 'undefined' || typeof window.driver === 'undefined') return;

    if (manualStart) {
        setTourCookie('duevinci_tour_done', '', -1);
    }

    const driverFunc = window.driver.js ? window.driver.js.driver : window.driver;
    if (!driverFunc) return;
    const page = getCurrentPageName();

    let steps = [];

    if (page === 'index' || page === 'index.html') {
        steps = [
            { popover: { title: 'Welcome to DueVinci! 🎓', description: 'Your streamlined academic command center. Let’s explore your key tools.' } },
            { element: 'aside nav', popover: { title: '1. Navigation Bar', description: 'Quickly toggle between Dashboard, Classes, Grades, and Calendar.', side: "right" } },
            { element: '#timerContent', popover: { title: '2. Focus Timer', description: 'Run Pomodoro study blocks. When the sidebar collapses, this stays visible as a floating widget on your screen.', side: "right" } },
            { element: '#upNextList', popover: { title: '3. Up Next Deadlines', description: 'Shows chronological upcoming lessons across all your classes. Click any checkmark when you finish a lesson.', side: "top" } },
            { element: '#goalsList', popover: { title: '4. Completion Goals', description: 'Live progress bars calculate your total course completion automatically as you check off items.', side: "top" } },
            { element: 'a[href*="courses"]', popover: { title: 'Next: Adding Coursework', description: 'Head to the Classes page next to add courses and import syllabi via AI.', side: "right" } }
        ];
    } else if (page === 'courses' || page === 'courses.html') {
        steps = [
            { popover: { title: 'Class & Syllabus Center 📚', description: 'Here is where you set up your classes and automatically parse coursework.' } },
            { element: '#courseForm', popover: { title: '1. Add a Class', description: 'Pick an emoji, type your course code (e.g. CS101), select a color badge, and click Add.', side: "bottom" } },
            { element: '#termFoldersGrid', popover: { title: '2. Term Folders', description: 'Create folders for your semesters (e.g., Fall 2026). Simply drag-and-drop course cards directly into folders to organize them.', side: "top" } },
            { element: '#alphabeticalCourseList', popover: { title: '3. Syllabus & AI Scanner', description: 'Click any class card to open its modal. You can upload a PDF syllabus or a screenshot of lessons to let Gemini AI build your schedule automatically.', side: "top" } }
        ];
    } else if (page === 'grades' || page === 'grades.html') {
        steps = [
            { popover: { title: 'Academic Performance 💯', description: 'Keep track of course averages and calculate your cumulative GPA in real-time.' } },
            { element: '#gpaBadgeContainer', popover: { title: '1. Cumulative GPA', description: 'Your overall GPA is dynamically calculated and pinned in the top header. You can switch between 4.0 and 5.0 scales in Settings.', side: "bottom" } },
            { element: '#gradesContainer', popover: { title: '2. Entering Grades', description: 'Type grade percentages directly next to any unit or assignment. Check "Exclude" for pass/fail assignments.', side: "top" } }
        ];
    } else if (page === 'calendar' || page === 'calendar.html') {
        steps = [
            { popover: { title: 'Master Schedule 📅', description: 'A unified timeline of all your deadlines and study events.' } },
            { element: '#calendar', popover: { title: '1. Due Dates & Events', description: 'Coursework targets show up here automatically. Click any assignment event to mark it complete immediately.', side: "top" } },
            { element: 'button[onclick="openEventModal()"]', popover: { title: '2. Custom Events', description: 'Add your own exams, study group meetings, or project deadlines.', side: "bottom" } },
            { element: 'button[onclick="exportToICS()"]', popover: { title: '3. Calendar Export (.ics)', description: 'Download your entire schedule as an .ics file to sync with Apple Calendar, Google Calendar, or Outlook.', side: "bottom" } }
        ];
    }

    if (steps.length === 0) return;

    const driverObj = driverFunc({
        showProgress: true,
        allowClose: true,
        steps: steps,
        onDestroyStarted: () => {
            setTourCookie('duevinci_tour_done', 'true');
            if (typeof updateTourButtonVisibility === 'function') updateTourButtonVisibility();
            if (driverObj && typeof driverObj.destroy === 'function') driverObj.destroy();
        },
        onDestroyed: () => {
            setTourCookie('duevinci_tour_done', 'true');
            if (typeof updateTourButtonVisibility === 'function') updateTourButtonVisibility();
        }
    });

    driverObj.drive();
}

export function updateTourButtonVisibility() {
    if (typeof document === 'undefined') return;
    const isDone = Boolean(getTourCookie('duevinci_tour_done'));
    document.querySelectorAll('#interactiveTourSidebarBtn').forEach(btn => {
        if (isDone) {
            btn.classList.add('hidden');
        } else {
            btn.classList.remove('hidden');
        }
    });
}

export function replayTourFromSettings() {
    if (typeof window.closeSettingsModal === 'function') window.closeSettingsModal();
    setTourCookie('duevinci_tour_done', '', -1);
    updateTourButtonVisibility();
    setTimeout(() => {
        startWalkthrough(true);
    }, 200);
}

export function ensureWhatsNewModalExists() {
    if (typeof document === 'undefined' || document.getElementById('whatsNewModal')) return;
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
                        <p class="text-xs text-indigo-600 dark:text-indigo-400 font-bold">Version ${WHATS_NEW_VERSION} Feature Drop</p>
                    </div>
                </div>
                <button type="button" onclick="closeWhatsNewModal()" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-lg">✕</button>
            </div>
            <div class="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto text-xs">
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">📅</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">Unit Milestone Planner & Rest Days</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Unit-by-unit milestone spacing planner with customizable Rest Days scheduling, deadline-first sorting, and timestamp-aware workload balancing.</p>
                    </div>
                </div>
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">🛡️</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">Dual-Persistence & Task Schema Hardening</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Persist custom task types (assignments, lessons, quizzes, pages), editable coursework titles, and priority tags across IndexedDB and cloud sync.</p>
                    </div>
                </div>
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">⚡</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">Canvas LMS Direct Sync</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Optional one-click import of active term courses and modules directly from your university's Canvas instance.</p>
                    </div>
                </div>
                <div class="flex gap-3 p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200/70 dark:border-brand-700">
                    <span class="text-2xl shrink-0">📊</span>
                    <div>
                        <div class="font-bold text-zinc-900 dark:text-white text-sm">7-Day Workload Radar & GPA Simulator</div>
                        <p class="text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">Visualize daily cognitive load to prevent crunch weeks and test "What-If" hypothetical scores on upcoming exams.</p>
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
    div.addEventListener('click', (event) => {
        if (event.target === div) closeWhatsNewModal();
    });
}

export function openWhatsNewModal() {
    ensureWhatsNewModalExists();
    const m = document.getElementById('whatsNewModal');
    if (m) m.classList.remove('hidden');
}

export function closeWhatsNewModal() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(WHATS_NEW_SEEN_KEY, WHATS_NEW_SEEN_VALUE);
    const m = document.getElementById('whatsNewModal');
    if (m) m.classList.add('hidden');
}

export function checkWhatsNewOnLaunch() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(WHATS_NEW_SEEN_KEY) !== WHATS_NEW_SEEN_VALUE) {
        setTimeout(openWhatsNewModal, 900);
    }
}

// Bind to window for HTML inline handlers
if (typeof window !== 'undefined') {
    window.showFirstRunOnboarding = showFirstRunOnboarding;
    window.startWalkthrough = startWalkthrough;
    window.updateTourButtonVisibility = updateTourButtonVisibility;
    window.replayTourFromSettings = replayTourFromSettings;
    window.ensureWhatsNewModalExists = ensureWhatsNewModalExists;
    window.openWhatsNewModal = openWhatsNewModal;
    window.closeWhatsNewModal = closeWhatsNewModal;
    window.checkWhatsNewOnLaunch = checkWhatsNewOnLaunch;
}
