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

window.addNewTimer = () => {
    const nameInput = document.getElementById('newTimerName');
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
    
    const mgr = document.getElementById('settingsTimersManager');
    if (mgr) renderTimersManager(mgr);
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
        const mgr = document.getElementById('settingsTimersManager');
        if (mgr) renderTimersManager(mgr);
    }
};

window.toggleTimerRun = (id) => {
    const timer = activeTimers.find(t => t.id === id);
    if (!timer) return;

    timer.running = !timer.running;
    saveTimersToStorage();
    updateTimersDisplayDOM();
    
    const mgr = document.getElementById('settingsTimersManager');
    if (mgr) renderTimersManager(mgr);
};

// Global ticker interval running every second for all active timers
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
        const displayEl = document.getElementById(`timerDisplay_${t.id}`);
        if (displayEl) displayEl.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        
        const btnEl = document.getElementById(`timerBtn_${t.id}`);
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
        // High z-index [9999] guarantees it floats cleanly above all content and modals
        floatWidget.className = 'fixed bottom-5 right-5 z-[9999] bg-zinc-900/95 dark:bg-brand-800 text-white p-4 rounded-2xl shadow-2xl border border-zinc-700 backdrop-blur-md w-72 transition-all';
        document.body.appendChild(floatWidget);
    }

    floatWidget.classList.remove('hidden');
    let html = `
        <div class="flex justify-between items-center mb-2 pb-2 border-b border-zinc-700">
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-400">Active Focus Timers (${runningTimers.length})</span>
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
                <span class="font-mono text-indigo-300 font-bold">${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}</span>
                <button onclick="toggleTimerRun('${t.id}')" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-bold transition">⏸</button>
            </div>
        `;
    });

    html += `</div>`;
    floatWidget.innerHTML = html;
}

window.renderTimersManager = (container) => {
    let html = `
        <div class="space-y-4">
            <div class="flex gap-2">
                <input type="text" id="newTimerName" placeholder="New timer name (e.g., Coding)" class="flex-1 text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 focus:outline-none focus:border-indigo-500">
                <button onclick="addNewTimer()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-bold transition">+ Add Timer</button>
            </div>
            <div class="space-y-2 max-h-48 overflow-y-auto">
    `;

    activeTimers.forEach(t => {
        const min = Math.floor(t.timeLeft / 60);
        const sec = t.timeLeft % 60;
        html += `
            <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 text-sm">
                <div>
                    <p class="font-bold text-zinc-800 dark:text-zinc-200">${t.name} <span class="text-xs text-zinc-400 font-normal">(${t.isWorking ? 'Focus' : 'Break'})</span></p>
                    <p id="timerDisplay_${t.id}" class="text-lg font-mono font-bold text-indigo-500">${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}</p>
                </div>
                <div class="flex gap-2">
                    <button id="timerBtn_${t.id}" onclick="toggleTimerRun('${t.id}')" class="w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center transition">${t.running ? '⏸' : '▶'}</button>
                    <button onclick="deleteTimer('${t.id}')" class="text-zinc-400 hover:text-red-500 font-bold px-2 transition">✕</button>
                </div>
            </div>
        `;
    });

    html += `</div></div>`;
    container.innerHTML = html;
};

document.addEventListener('DOMContentLoaded', () => {
    renderFloatingTimerWidget();
});
