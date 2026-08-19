// --- MULTI-TIMER & FLOATING WIDGET LOGIC ---
let activeTimers = JSON.parse(localStorage.getItem('duevinci_timers')) || [
    { id: 'default', name: 'Focus Session', focusMin: 25, breakMin: 5, timeLeft: 25 * 60, isWorking: true, running: false }
];

function saveTimersToStorage() {
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

function initMultiTimersUI() {
    renderFloatingTimerWidget();
    
    // Automatically inject multi-timer manager into sidebar or dashboard if container doesn't exist
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

window.addNewTimer = () => {
    const nameInput = document.getElementById('newTimerNameInput');
    const name = nameInput ? nameInput.value.trim() : 'Study Block';
    if (!name) return;

    const newTimer = {
        id: 'timer_' + Date.now(),
        name: name,
        focusMin: 25,
        breakMin: 5,
        timeLeft: 25 * 60,
        isWorking: true,
        running: false
    };

    activeTimers.push(newTimer);
    saveTimersToStorage();
    if(nameInput) nameInput.value = '';
    initMultiTimersUI();
};

window.deleteTimer = (id) => {
    if (activeTimers.length <= 1) {
        alert('You must keep at least one active timer.');
        return;
    }
    const idx = activeTimers.findIndex(t => t.id === id);
    if (idx !== -1) {
        activeTimers.splice(idx, 1);
        saveTimersToStorage();
        initMultiTimersUI();
    }
};

window.toggleMultiTimerRun = (id) => {
    const timer = activeTimers.find(t => t.id === id);
    if (!timer) return;

    timer.running = !timer.running;
    saveTimersToStorage();
    initMultiTimersUI();
};

// Global ticker running every second for all active custom timers
setInterval(() => {
    let updated = false;
    activeTimers.forEach(t => {
        if (t.running) {
            updated = true;
            if (t.timeLeft > 0) {
                t.timeLeft--;
            } else {
                t.isWorking = !t.isWorking;
                t.timeLeft = (t.isWorking ? t.focusMin : t.breakMin) * 60;
                if (typeof fireConfetti === 'function') fireConfetti();
            }
        }
    });

    if (updated) {
        saveTimersToStorage();
        updateTimersDisplayDOM();
    }
}, 1000);

function updateTimersDisplayDOM() {
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

function renderFloatingTimerWidget() {
    let floatWidget = document.getElementById('floatingTimerWidget');
    const runningTimers = activeTimers.filter(t => t.running);

    if (runningTimers.length === 0) {
        if (floatWidget) floatWidget.classList.add('hidden');
        return;
    }

    if (!floatWidget) {
        floatWidget = document.createElement('div');
        floatWidget.id = 'floatingTimerWidget';
        floatWidget.className = 'fixed bottom-5 right-5 z-[9999] bg-zinc-900/95 dark:bg-brand-800 text-white p-4 rounded-2xl shadow-2xl border border-zinc-700 backdrop-blur-md w-72 transition-all';
        document.body.appendChild(floatWidget);
    }

    floatWidget.classList.remove('hidden');
    let html = `
        <div class="flex justify-between items-center mb-2 pb-2 border-b border-zinc-700">
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-400">Active Timers (${runningTimers.length})</span>
            <button onclick="document.getElementById('floatingTimerWidget').classList.add('hidden')" class="text-zinc-400 hover:text-white text-xs">✕</button>
        </div>
        <div class="space-y-2 max-h-48 overflow-y-auto">
    `;
    
    runningTimers.forEach(t => {
        const min = Math.floor(t.timeLeft / 60);
        const sec = t.timeLeft % 60;
        html += `
            <div class="flex justify-between items-center bg-zinc-800/80 p-2 rounded-xl text-xs">
                <span class="font-bold truncate max-w-[110px]">${t.name}</span>
                <span id="multiTimerDisplay_${t.id}" class="font-mono text-indigo-300 font-bold">${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}</span>
                <button onclick="toggleMultiTimerRun('${t.id}')" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-bold transition">⏸</button>
            </div>
        `;
    });

    html += `</div>`;
    floatWidget.innerHTML = html;
}

function renderTimersManager(container) {
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

document.addEventListener('DOMContentLoaded', () => {
    initMultiTimersUI();
});
