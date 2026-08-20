// --- POMODORO TIMER, SIDEBAR CONTROLS & MULTI-TIMER STATE MACHINE MODULE ---
import { playTimerAlarm, fireConfetti, recordStudyActivity } from './utils.js';

// --- SIDEBAR POMODORO TIMER STATE ---
export let timerInterval = null;
export let focusMinutes = (typeof localStorage !== 'undefined' && parseInt(localStorage.getItem('focusMinutes'))) || 25;
export let breakMinutes = (typeof localStorage !== 'undefined' && parseInt(localStorage.getItem('breakMinutes'))) || 5;
export let isWorking = typeof localStorage !== 'undefined' ? (localStorage.getItem('timerIsWorking') !== 'false') : true;

export let timerEndTime = (typeof localStorage !== 'undefined' && parseInt(localStorage.getItem('timerEndTime'))) || 0;
export let timerRunning = typeof localStorage !== 'undefined' ? (localStorage.getItem('timerRunning') === 'true') : false;
export let timeLeft = (typeof localStorage !== 'undefined' && parseInt(localStorage.getItem('timeLeft'))) || (focusMinutes * 60);
export let timerCollapsed = typeof localStorage !== 'undefined' ? (localStorage.getItem('timerCollapsed') === 'true') : false;
export let floatingTimerDismissed = false;

// Sync active state from timestamp on script load
if (timerRunning && timerEndTime > Date.now()) {
    timeLeft = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
} else {
    timerRunning = false;
    if (typeof localStorage !== 'undefined') localStorage.setItem('timerRunning', 'false');
}

export function updateTimerDisplay() {
    if (typeof document === 'undefined') return;
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    const display = document.getElementById('timerDisplay');
    const circle = document.getElementById('timerProgress');

    if (display) display.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    if (circle) {
        const total = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
        const percent = ((total - timeLeft) / total) * 301.59;
        circle.style.strokeDashoffset = percent;
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem('timeLeft', timeLeft);
    updateFloatingTimer();
}

export function updateFloatingTimer() {
    if (typeof document === 'undefined') return;
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

export function dismissFloatingTimer() {
    floatingTimerDismissed = true;
    const floatWidget = document.getElementById('floatingTimerWidget');
    if (floatWidget) floatWidget.classList.add('hidden');
}

export function toggleTimer() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('timerPlayBtn');
    if (timerRunning) {
        clearInterval(timerInterval);
        timerInterval = null;
        timerRunning = false;
        if (typeof localStorage !== 'undefined') localStorage.setItem('timerRunning', 'false');
        if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    } else {
        timerRunning = true;
        floatingTimerDismissed = false;
        timerEndTime = Date.now() + (timeLeft * 1000);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('timerRunning', 'true');
            localStorage.setItem('timerEndTime', timerEndTime);
        }
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
}

export function resetTimer() {
    timerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem('timerRunning', 'false');
    timeLeft = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
    const btn = document.getElementById('timerPlayBtn');
    if (btn) btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    updateTimerDisplay();
}

export function skipTimer() {
    isWorking = !isWorking;
    if (typeof localStorage !== 'undefined') localStorage.setItem('timerIsWorking', isWorking);
    const labelEl = document.getElementById('timerLabel');
    if (labelEl) labelEl.innerText = isWorking ? "Focus" : "Break";

    timeLeft = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
    timerEndTime = Date.now() + (timeLeft * 1000);
    if (typeof localStorage !== 'undefined') localStorage.setItem('timerEndTime', timerEndTime);
    updateTimerDisplay();

    if (!timerRunning) {
        toggleTimer();
    }
}

export function toggleTimerSettings() {
    const form = document.getElementById('timerSettingsForm');
    if (!form) return;
    const focusInput = document.getElementById('focusMinInput');
    const breakInput = document.getElementById('breakMinInput');
    if (focusInput) focusInput.value = focusMinutes;
    if (breakInput) breakInput.value = breakMinutes;
    form.classList.toggle('hidden');
}

export function saveTimerSettings() {
    const focusInput = document.getElementById('focusMinInput');
    const breakInput = document.getElementById('breakMinInput');
    focusMinutes = parseInt(focusInput?.value) || 25;
    breakMinutes = parseInt(breakInput?.value) || 5;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('focusMinutes', focusMinutes);
        localStorage.setItem('breakMinutes', breakMinutes);
    }
    const form = document.getElementById('timerSettingsForm');
    if (form) form.classList.add('hidden');
    resetTimer();
}

export function applyTimerCollapse() {
    const content = document.getElementById('timerContent');
    const icon = document.getElementById('timerCollapseIcon');
    if (!content || !icon) return;

    if (timerCollapsed) {
        content.classList.add('hidden');
        icon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
    } else {
        content.classList.remove('hidden');
        icon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    }
}

export function toggleTimerCollapse() {
    timerCollapsed = !timerCollapsed;
    if (typeof localStorage !== 'undefined') localStorage.setItem('timerCollapsed', timerCollapsed);
    applyTimerCollapse();
    updateFloatingTimer();
}

// --- MULTI-TIMER STATE MACHINE ---
export function createTimerState(id = 'default', name = 'Focus Session', focusMin = 25, breakMin = 5) {
    return {
        id,
        name,
        focusMin,
        breakMin,
        timeLeft: focusMin * 60,
        isWorking: true,
        running: false
    };
}

export function formatTimerTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function stepTimerState(state) {
    if (!state || !state.running) return { ...state };

    let timeLeft = state.timeLeft - 1;
    let isWorking = state.isWorking;

    if (timeLeft < 0) {
        isWorking = !isWorking;
        timeLeft = (isWorking ? state.focusMin : state.breakMin) * 60;
    }

    return {
        ...state,
        isWorking,
        timeLeft
    };
}

export let activeTimers = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('duevinci_timers'))) || [
    createTimerState('default', 'Focus Session', 25, 5)
];

export function saveTimersToStorage() {
    if (typeof localStorage === 'undefined') return;
    const serialized = activeTimers.map(t => ({
        id: t.id,
        name: t.name,
        focusMin: t.focusMin,
        breakMin: t.breakMin,
        timeLeft: t.timeLeft,
        isWorking: t.isWorking,
        running: t.running
    }));
    localStorage.setItem('duevinci_timers', JSON.stringify(serialized));
}

export function initMultiTimersUI() {
    if (typeof document === 'undefined') return;
    renderFloatingTimerWidget();

    let container = document.getElementById('timersManagerContainer');
    if (!container) {
        const sidebarTimerContent = document.getElementById('timerContent');
        if (sidebarTimerContent) {
            container = document.createElement('div');
            container.id = 'timersManagerContainer';
            container.className = 'mt-4 pt-4 border-t border-zinc-200 dark:border-brand-700 w-full';
            sidebarTimerContent.appendChild(container);
        }
    }
    if (container) renderTimersManager(container);
}

export function addNewTimer() {
    if (typeof document === 'undefined') return;
    const nameInput = document.getElementById('newTimerNameInput');
    const name = nameInput ? nameInput.value.trim() : 'Study Block';
    if (!name) return;

    const newTimer = createTimerState('timer_' + Date.now(), name, 25, 5);
    activeTimers.push(newTimer);
    saveTimersToStorage();
    if (nameInput) nameInput.value = '';
    initMultiTimersUI();
}

export function deleteTimer(id) {
    if (activeTimers.length <= 1) {
        if (typeof alert === 'function') alert('You must keep at least one active timer.');
        return;
    }
    const idx = activeTimers.findIndex(t => t.id === id);
    if (idx !== -1) {
        activeTimers.splice(idx, 1);
        saveTimersToStorage();
        initMultiTimersUI();
    }
}

export function toggleMultiTimerRun(id) {
    const timer = activeTimers.find(t => t.id === id);
    if (!timer) return;

    timer.running = !timer.running;
    saveTimersToStorage();
    initMultiTimersUI();
}

export function updateTimersDisplayDOM() {
    if (typeof document === 'undefined') return;
    activeTimers.forEach(t => {
        const min = Math.floor(t.timeLeft / 60);
        const sec = t.timeLeft % 60;
        const displayEl = document.getElementById(`multiTimerDisplay_${t.id}`);
        if (displayEl) displayEl.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

        const btnEl = document.getElementById(`multiTimerBtn_${t.id}`);
        if (btnEl) btnEl.innerHTML = t.running ? '⏸' : '▶';
    });
    renderFloatingTimerWidget();
}

export function renderFloatingTimerWidget() {
    if (typeof document === 'undefined') return;
    let floatWidget = document.getElementById('floatingTimerWidget');
    const runningTimers = activeTimers.filter(t => t.running);

    if (runningTimers.length === 0 && !timerRunning) {
        if (floatWidget) floatWidget.classList.add('hidden');
        return;
    }
}

export function renderTimersManager(container) {
    if (!container) return;
    let html = `
        <div class="w-full space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Custom Timers</h4>
            <div class="flex gap-1.5">
                <input type="text" id="newTimerNameInput" placeholder="Timer name (e.g. Coding)" class="flex-1 text-xs px-2.5 py-1.5 rounded border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500">
                <button onclick="addNewTimer()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded text-xs font-bold transition">+ Add</button>
            </div>
            <div class="space-y-2 max-h-44 overflow-y-auto pr-1">
    `;

    activeTimers.forEach(t => {
        const min = Math.floor(t.timeLeft / 60);
        const sec = t.timeLeft % 60;
        html += `
            <div class="flex items-center justify-between p-2.5 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs">
                <div>
                    <p class="font-bold text-zinc-800 dark:text-zinc-200">${t.name}</p>
                    <p id="multiTimerDisplay_${t.id}" class="font-mono font-bold text-indigo-500 text-sm">${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}</p>
                </div>
                <div class="flex gap-1.5">
                    <button id="multiTimerBtn_${t.id}" onclick="toggleMultiTimerRun('${t.id}')" class="w-7 h-7 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center transition">${t.running ? '⏸' : '▶'}</button>
                    <button onclick="deleteTimer('${t.id}')" class="text-zinc-400 hover:text-red-500 font-bold px-1 transition">✕</button>
                </div>
            </div>
        `;
    });

    html += `</div></div>`;
    container.innerHTML = html;
}

// Bind to window / globalThis for HTML events
const _timerScope = typeof window !== 'undefined' ? window : globalThis;
_timerScope.updateTimerDisplay = updateTimerDisplay;
_timerScope.updateFloatingTimer = updateFloatingTimer;
_timerScope.dismissFloatingTimer = dismissFloatingTimer;
_timerScope.toggleTimer = toggleTimer;
_timerScope.resetTimer = resetTimer;
_timerScope.skipTimer = skipTimer;
_timerScope.toggleTimerSettings = toggleTimerSettings;
_timerScope.saveTimerSettings = saveTimerSettings;
_timerScope.applyTimerCollapse = applyTimerCollapse;
_timerScope.toggleTimerCollapse = toggleTimerCollapse;
_timerScope.createTimerState = createTimerState;
_timerScope.stepTimerState = stepTimerState;
_timerScope.formatTimerTime = formatTimerTime;
_timerScope.addNewTimer = addNewTimer;
_timerScope.deleteTimer = deleteTimer;
_timerScope.toggleMultiTimerRun = toggleMultiTimerRun;
_timerScope.initMultiTimersUI = initMultiTimersUI;
_timerScope.renderTimersManager = renderTimersManager;

// Auto-initialize timer collapse and state on DOM ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        applyTimerCollapse();
        updateTimerDisplay();

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
    });
}
