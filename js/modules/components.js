import { getCurrentPageName, getBasePath } from './utils.js';
import {
    toggleTimer,
    resetTimer,
    skipTimer,
    toggleTimerSettings,
    saveTimerSettings,
    toggleTimerCollapse,
    applyTimerCollapse,
    updateTimerDisplay,
    initMultiTimersUI
} from './timers.js';
import { openSettingsModal, openSupportModal } from './ui.js';
import { renderProfileEasterEgg } from './profileAvatar.js';

const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

class DueVinciSidebar extends BaseElement {
    connectedCallback() {
        this.render();
        setTimeout(() => {
            applyTimerCollapse();
            updateTimerDisplay();
            initMultiTimersUI();
            renderProfileEasterEgg();
        }, 50);
    }

    render() {
        if (typeof document === 'undefined') return;
        const basePath = getBasePath();
        const currentPage = getCurrentPageName();
        const isDashboard = currentPage === 'index' || currentPage === 'index.html' || currentPage === '';
        const isCourses = currentPage === 'courses' || currentPage === 'courses.html';
        const isGrades = currentPage === 'grades' || currentPage === 'grades.html';
        const isCalendar = currentPage === 'calendar' || currentPage === 'calendar.html';
        const isTutor = currentPage === 'tutor' || currentPage === 'tutor.html';

        const navActiveStyle = "flex items-center gap-3 w-full text-left px-4 py-2.5 bg-zinc-200 dark:bg-brand-700 text-zinc-900 dark:text-white rounded-lg font-medium text-sm transition";
        const navInactiveStyle = "flex items-center gap-3 w-full text-left px-4 py-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 rounded-lg text-sm transition";

        this.innerHTML = `
        <div id="sidebarBackdrop" onclick="toggleSidebar(false)" class="hidden fixed inset-0 z-30 bg-zinc-900/50 backdrop-blur-[1px] lg:hidden"></div>
        <aside id="appSidebar" class="fixed inset-y-0 left-0 z-40 w-72 -translate-x-full bg-zinc-100 dark:bg-brand-800 border-r border-zinc-200 dark:border-brand-700 flex flex-col justify-between transition-transform duration-200 overflow-y-auto shrink-0 h-full lg:static lg:z-auto lg:w-64 lg:translate-x-0">
            <div class="border-b border-zinc-200 dark:border-brand-700">
                <div class="px-6 pt-6 pb-2 flex justify-between items-center text-zinc-500 dark:text-zinc-400">
                    <span class="text-xs font-bold uppercase tracking-wider">Timer</span>
                    <div class="flex gap-2">
                        <button type="button" onclick="toggleTimerSettings()" title="Custom Timer Settings" class="hover:text-zinc-800 dark:hover:text-white transition">
                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                        <button type="button" onclick="toggleTimerCollapse()" title="Collapse Timer" class="hover:text-zinc-800 dark:hover:text-white transition" id="timerCollapseIcon">
                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>
                        </button>
                    </div>
                </div>

                <div id="timerSettingsForm" class="hidden px-6 pb-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
                    <div class="flex justify-between items-center gap-2">
                        <label class="flex-1 text-xs font-medium">Focus (min): <input type="number" id="focusMinInput" class="w-14 border rounded p-1 ml-1 dark:bg-brand-900 dark:border-brand-600 text-xs text-center" value="25"></label>
                        <label class="flex-1 text-xs font-medium">Break (min): <input type="number" id="breakMinInput" class="w-14 border rounded p-1 ml-1 dark:bg-brand-900 dark:border-brand-600 text-xs text-center" value="5"></label>
                    </div>
                    <button type="button" onclick="saveTimerSettings()" class="w-full bg-indigo-600 text-white font-bold py-1.5 rounded hover:bg-indigo-700 transition text-xs shadow-sm">Save Time</button>
                </div>

                <div id="timerContent" class="px-6 pb-5 flex flex-col items-center transition-all overflow-hidden">
                    <div class="relative w-36 h-36 rounded-full border-4 border-zinc-300 dark:border-brand-600 flex flex-col items-center justify-center mb-3">
                        <svg class="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <circle id="timerProgress" cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="4" class="text-indigo-500" stroke-dasharray="301.59" stroke-dashoffset="0" style="transition: stroke-dashoffset 1s linear;"></circle>
                        </svg>
                        <span id="timerDisplay" class="text-2xl font-bold dark:text-white tracking-wider z-10">25:00</span>
                        <span id="timerLabel" class="text-xs text-zinc-500 dark:text-zinc-400 z-10 mt-0.5 font-medium">Focus</span>
                    </div>

                    <div class="flex items-center gap-3 mb-2 text-zinc-500 dark:text-zinc-400">
                        <button type="button" onclick="resetTimer()" title="Reset Timer" class="hover:text-zinc-800 dark:hover:text-white transition p-1"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
                        <button type="button" onclick="toggleTimer()" id="timerPlayBtn" class="bg-white dark:bg-zinc-100 text-zinc-900 p-2.5 rounded-lg shadow-sm hover:scale-105 transition"><svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
                        <button type="button" onclick="skipTimer()" title="Skip Mode" class="hover:text-zinc-800 dark:hover:text-white transition p-1"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 4v16M9 4l10 8-10 8V4z"/></svg></button>
                    </div>

                    <div id="timersManagerContainer" class="w-full mt-2 pt-2 border-t border-zinc-200 dark:border-brand-700"></div>
                </div>
            </div>

            <div class="p-4 flex-1">
                <nav class="space-y-1">
                    <a href="${basePath}index.html" class="${isDashboard ? navActiveStyle : navInactiveStyle}">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg> Dashboard
                    </a>
                    <a href="${basePath}courses/index.html" class="${isCourses ? navActiveStyle : navInactiveStyle}">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> Classes
                    </a>
                    <a href="${basePath}grades/index.html" class="${isGrades ? navActiveStyle : navInactiveStyle}">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> Grades
                    </a>
                    <a href="${basePath}calendar/index.html" class="${isCalendar ? navActiveStyle : navInactiveStyle}">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Calendar
                    </a>
                    <a href="${basePath}tutor/index.html" class="${isTutor ? navActiveStyle : navInactiveStyle}">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-1.2-.24-2.34-.68-3.38"/><path d="M8.5 10.5a3.5 3.5 0 1 1 5.5 2.87c-.96.69-1.5 1.21-1.5 2.63"/><path d="M12 18.5h.01"/></svg> Study Companion
                    </a>
                </nav>
            </div>

            <div class="p-4 border-t border-zinc-200 dark:border-brand-700 space-y-2">
                <button type="button" onclick="openSettingsModal()" class="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-zinc-200 dark:hover:bg-brand-700 transition" aria-label="Open profile settings">
                    <span class="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                        <img id="profileAvatarImage" class="hidden h-full w-full object-cover" alt="Your profile photo">
                        <span id="profileAvatarInitials">DV</span>
                        <img id="profileAvatarEasterEgg" class="pointer-events-none absolute bottom-0 right-0 z-10 h-6 w-6 object-contain drop-shadow-sm" alt="" hidden>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span id="profileIdentityName" class="block truncate text-xs font-bold text-zinc-800 dark:text-white">Your account</span>
                        <span id="profileIdentityEmail" class="block truncate text-[10px] text-zinc-500 dark:text-zinc-400">Signed in</span>
                    </span>
                    <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <button type="button" onclick="openSupportModal()" class="flex items-center gap-3 w-full text-left px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 rounded-lg text-sm font-medium transition">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Support & Help
                </button>
            </div>
        </aside>
        `;
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('duevinci-sidebar')) {
    customElements.define('duevinci-sidebar', DueVinciSidebar);
}

export { DueVinciSidebar };
