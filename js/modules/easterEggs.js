import { fireConfetti, getBasePath } from './utils.js';
import { activateProfileEasterEgg } from './profileAvatar.js';

const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiPos = 0;

export function triggerKonamiEasterEgg() {
    fireConfetti();
    if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 100, origin: { y: 0.4 } });
        setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } }), 250);
        setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } }), 400);
    }
    alert("🎨 Secret Easter Egg Unlocked!\nYou discovered the Da Vinci Renaissance Gold mode! +100 Focus Mastery.");
}

export function ensureCommandPaletteExists() {
    if (typeof document === 'undefined' || document.getElementById('commandPaletteModal')) return;
    const div = document.createElement('div');
    div.id = 'commandPaletteModal';
    div.className = 'fixed inset-0 z-50 flex items-start justify-center pt-24 bg-zinc-900/60 backdrop-blur-sm hidden p-4';
    div.innerHTML = `
        <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div class="p-4 border-b border-zinc-200 dark:border-brand-700 flex items-center gap-3">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" class="text-zinc-400" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="cmdInput" placeholder="Search pages, actions, or secret commands (/party)..." class="w-full bg-transparent text-sm focus:outline-none dark:text-white">
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-brand-700 text-zinc-400 font-mono">ESC</span>
            </div>
            <div id="cmdResults" class="p-2 max-h-72 overflow-y-auto space-y-1 text-xs">
                <!-- Populated dynamically -->
            </div>
        </div>
    `;
    document.body.appendChild(div);

    const input = div.querySelector('#cmdInput');
    if (input) {
        input.addEventListener('input', (e) => filterCommandPalette(e.target.value));
        input.addEventListener('keydown', handleCmdKey);
    }
}

export function toggleCommandPalette() {
    ensureCommandPaletteExists();
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
}

export function filterCommandPalette(query) {
    const results = document.getElementById('cmdResults');
    if (!results) return;
    const q = (query || '').toLowerCase().trim();
    const base = getBasePath();

    const items = [
        { title: 'Dashboard', desc: 'Jump to main study dashboard', action: () => { window.location.href = base + 'index.html'; }, icon: '📊' },
        { title: 'Classes & Coursework', desc: 'Manage courses, syllabus AI, and lessons', action: () => { window.location.href = base + 'courses/index.html'; }, icon: '📚' },
        { title: 'Grades & GPA Tracker', desc: 'View course averages and GPA simulator', action: () => { window.location.href = base + 'grades/index.html'; }, icon: '🎓' },
        { title: 'Master Calendar', desc: 'Deadlines, events, and .ics export', action: () => { window.location.href = base + 'calendar/index.html'; }, icon: '📅' },
        { title: 'Study Companion', desc: 'Get Socratic tutoring with your subscription', action: () => { window.location.href = base + 'tutor/index.html'; }, icon: '🧠' },
        { title: 'What\'s New', desc: 'View latest features in version 2.3', action: () => { if (typeof window.openWhatsNewModal === 'function') window.openWhatsNewModal(); }, icon: '✨' },
        { title: '/party', desc: 'Trigger celebratory confetti storm', action: () => { fireConfetti(); }, icon: '🎉' },
        { title: '/inspire', desc: 'Leonardo da Vinci wisdom quote', action: () => { alert('"Learning never exhausts the mind." — Leonardo da Vinci'); }, icon: '📜' },
        { title: '/zen', desc: 'Activate Zen study aura', action: () => { if (typeof confetti === 'function') confetti({ particleCount: 40, spread: 60, colors: ['#a78bfa', '#818cf8', '#c084fc'] }); }, icon: '🧘' },
        { title: '/maestro', desc: 'Rain Maestro University crests & shields', action: () => triggerMaestroRain(), icon: '🛡️' },
        { title: '/nightowl', desc: 'Summon the WGU Night Owls flyover', action: () => triggerNightOwlFlight(), icon: '🦉' }
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
    `).join('') || '<div class="p-4 text-center text-zinc-400 text-xs">No matching commands. Try <code>/maestro</code>, <code>/nightowl</code>, or <code>/party</code></div>';
    window._currentCmdItems = filtered;
}

export function executeCmd(idx) {
    if (window._currentCmdItems && window._currentCmdItems[idx]) {
        toggleCommandPalette();
        window._currentCmdItems[idx].action();
    }
}

export function handleCmdKey(e) {
    if (e.key === 'Escape') toggleCommandPalette();
    if (e.key === 'Enter') {
        if (window._currentCmdItems && window._currentCmdItems[0]) {
            toggleCommandPalette();
            window._currentCmdItems[0].action();
        }
    }
}

export function triggerMaestroRain() {
    activateProfileEasterEgg('maestro');
    if (typeof document === 'undefined' || !document.body) return;
    const existing = document.getElementById('maestroRainOverlay');
    if (existing) existing.remove();

    if (!document.getElementById('maestroRainStyle')) {
        const style = document.createElement('style');
        style.id = 'maestroRainStyle';
        style.innerHTML = `
            @keyframes maestroFall {
                0% { transform: translateY(-90px) rotate(0deg) scale(0.9); opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translateY(105vh) rotate(var(--maestro-rot)) scale(1.05); opacity: 0; }
            }
            @keyframes maestroSway {
                0%, 100% { margin-left: 0px; }
                50% { margin-left: var(--maestro-sway); }
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
        if (document.head) document.head.appendChild(style);
        else document.body.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'maestroRainOverlay';
    overlay.className = 'fixed inset-0 pointer-events-none z-[9999] overflow-hidden';
    document.body.appendChild(overlay);

    const badge = document.createElement('div');
    badge.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-[10000] bg-zinc-900/90 dark:bg-black/90 text-white px-5 py-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-3 backdrop-blur-md transition-all pointer-events-none';
    badge.style.animation = 'maestroBadgePop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    badge.innerHTML = `
        <div class="w-9 h-9 rounded-xl bg-[#eae7dc] p-1 flex items-center justify-center shadow-inner">
            <img src="${getBasePath()}assets/images/maestro-logo.svg" alt="Maestro" class="w-full h-full object-contain">
        </div>
        <div>
            <div class="text-xs font-black tracking-wider uppercase text-amber-400">Maestro University</div>
            <div class="text-xs text-zinc-300 font-medium">Honor & Excellence Raining Down! 🛡️🎓</div>
        </div>
    `;
    overlay.appendChild(badge);

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

        const size = Math.floor(Math.random() * 34) + 32;
        const left = Math.random() * 92;
        const delay = Math.random() * 2.5;
        const fallDur = (Math.random() * 1.8 + 2.4).toFixed(2);
        const swayDur = (Math.random() * 1.2 + 1.2).toFixed(2);
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
}

export function triggerNightOwlFlight() {
    activateProfileEasterEgg('nightowl');
    if (typeof document === 'undefined' || !document.body) return;
    const existing = document.getElementById('nightOwlFlightOverlay');
    if (existing) existing.remove();

    if (!document.getElementById('nightOwlFlightStyle')) {
        const style = document.createElement('style');
        style.id = 'nightOwlFlightStyle';
        style.innerHTML = `
            @keyframes nightOwlFlyAcross {
                0% {
                    transform: translateX(-180px) translateY(var(--owl-start-y, 0px)) scale(var(--owl-scale, 1)) rotate(var(--owl-rot-start, -10deg));
                    opacity: 0;
                }
                6% {
                    opacity: 1;
                }
                50% {
                    transform: translateX(50vw) translateY(var(--owl-mid-y, -35px)) scale(calc(var(--owl-scale, 1) * 1.08)) rotate(var(--owl-rot-mid, 4deg));
                }
                92% {
                    opacity: 1;
                }
                100% {
                    transform: translateX(calc(100vw + 180px)) translateY(var(--owl-end-y, -60px)) scale(var(--owl-scale, 1)) rotate(var(--owl-rot-end, -6deg));
                    opacity: 0;
                }
            }
            @keyframes nightOwlFlyAcrossReverse {
                0% {
                    transform: translateX(calc(100vw + 180px)) translateY(var(--owl-start-y, 0px)) scaleX(-1) scale(var(--owl-scale, 1)) rotate(var(--owl-rot-start, 10deg));
                    opacity: 0;
                }
                6% {
                    opacity: 1;
                }
                50% {
                    transform: translateX(50vw) translateY(var(--owl-mid-y, -35px)) scaleX(-1) scale(calc(var(--owl-scale, 1) * 1.08)) rotate(var(--owl-rot-mid, -4deg));
                }
                92% {
                    opacity: 1;
                }
                100% {
                    transform: translateX(-180px) translateY(var(--owl-end-y, -60px)) scaleX(-1) scale(var(--owl-scale, 1)) rotate(var(--owl-rot-end, 6deg));
                    opacity: 0;
                }
            }
            @keyframes nightOwlFlapGlide {
                0%, 100% { transform: translateY(0px) rotate(0deg); }
                30% { transform: translateY(-10px) rotate(-3deg); }
                65% { transform: translateY(8px) rotate(3deg); }
            }
            @keyframes nightOwlBadgePop {
                0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            .night-owl-flyer {
                position: absolute;
                top: 0;
                left: 0;
                user-select: none;
                cursor: pointer;
                filter: drop-shadow(0 8px 18px rgba(0, 32, 91, 0.45)) drop-shadow(0 2px 6px rgba(99, 102, 241, 0.5));
                will-change: transform, opacity;
            }
            .night-owl-inner {
                width: 100%;
                height: 100%;
                animation: nightOwlFlapGlide var(--flap-dur, 1.6s) ease-in-out infinite;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .night-owl-flyer:hover .night-owl-inner {
                transform: scale(1.25) rotate(12deg);
                filter: drop-shadow(0 0 16px rgba(245, 158, 11, 0.85));
            }
        `;
        if (document.head) document.head.appendChild(style);
        else document.body.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'nightOwlFlightOverlay';
    overlay.className = 'fixed inset-0 pointer-events-none z-[9999] overflow-hidden';
    document.body.appendChild(overlay);

    const basePath = getBasePath();
    const owlImgSrc = `${basePath}assets/images/wgu-owl.png`;

    const badge = document.createElement('div');
    badge.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-[10000] bg-zinc-900/90 dark:bg-black/90 text-white px-5 py-3 rounded-2xl shadow-2xl border border-indigo-500/40 flex items-center gap-3 backdrop-blur-md transition-all pointer-events-none';
    badge.style.animation = 'nightOwlBadgePop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    badge.innerHTML = `
        <div class="w-10 h-10 rounded-xl bg-[#00205b] p-1 flex items-center justify-center shadow-inner border border-indigo-400/30">
            <img src="${owlImgSrc}" alt="WGU Owl" class="w-full h-full object-contain">
        </div>
        <div>
            <div class="text-xs font-black tracking-wider uppercase text-indigo-400 flex items-center gap-1.5">
                <span>WGU Night Owls Flyover!</span>
                <span class="text-amber-400">🦉✨</span>
            </div>
            <div class="text-xs text-zinc-300 font-medium">Night Owls Ascend! Late Night Study Power Active. 🌙⚡</div>
        </div>
    `;
    overlay.appendChild(badge);

    if (typeof confetti === 'function') {
        confetti({
            particleCount: 55,
            spread: 85,
            origin: { y: 0.14 },
            colors: ['#00205b', '#e8a100', '#6366f1', '#38bdf8', '#ffffff']
        });
    }

    // Spawn flight squad of Night Owls across varying altitudes and flight trajectories
    const squad = [
        // Lead Hero Owl
        { top: 22, size: 100, delay: 0, duration: 4.2, startY: 0, midY: -45, endY: 30, rotStart: -8, rotMid: 5, rotEnd: -5, reverse: false, flapDur: 1.3 },
        // Wingmen & Squadron
        { top: 12, size: 68, delay: 0.35, duration: 3.8, startY: 20, midY: -25, endY: -40, rotStart: -12, rotMid: 2, rotEnd: -8, reverse: false, flapDur: 1.1 },
        { top: 36, size: 75, delay: 0.6, duration: 4.5, startY: -20, midY: 35, endY: -10, rotStart: -5, rotMid: 8, rotEnd: -3, reverse: false, flapDur: 1.5 },
        { top: 52, size: 85, delay: 1.0, duration: 4.0, startY: 40, midY: -50, endY: 20, rotStart: -10, rotMid: 6, rotEnd: -6, reverse: false, flapDur: 1.2 },
        { top: 68, size: 72, delay: 1.3, duration: 4.6, startY: -10, midY: 30, endY: -35, rotStart: -6, rotMid: 4, rotEnd: -4, reverse: false, flapDur: 1.4 },
        { top: 28, size: 60, delay: 1.6, duration: 3.9, startY: 30, midY: -20, endY: 15, rotStart: -14, rotMid: 3, rotEnd: -10, reverse: false, flapDur: 1.0 },
        { top: 45, size: 90, delay: 2.0, duration: 4.3, startY: -30, midY: 40, endY: -20, rotStart: -7, rotMid: 7, rotEnd: -5, reverse: false, flapDur: 1.35 },
        // Reverse cross-flyers for dynamic depth
        { top: 18, size: 65, delay: 0.8, duration: 4.8, startY: -15, midY: 35, endY: -30, rotStart: 10, rotMid: -4, rotEnd: 8, reverse: true, flapDur: 1.25 },
        { top: 60, size: 78, delay: 1.7, duration: 4.4, startY: 25, midY: -35, endY: 20, rotStart: 8, rotMid: -6, rotEnd: 6, reverse: true, flapDur: 1.45 }
    ];

    squad.forEach((owlData) => {
        const el = document.createElement('div');
        el.className = 'night-owl-flyer pointer-events-auto';
        el.style.top = `${owlData.top}%`;
        el.style.width = `${owlData.size}px`;
        el.style.height = `${owlData.size}px`;
        el.style.setProperty('--owl-start-y', `${owlData.startY}px`);
        el.style.setProperty('--owl-mid-y', `${owlData.midY}px`);
        el.style.setProperty('--owl-end-y', `${owlData.endY}px`);
        el.style.setProperty('--owl-rot-start', `${owlData.rotStart}deg`);
        el.style.setProperty('--owl-rot-mid', `${owlData.rotMid}deg`);
        el.style.setProperty('--owl-rot-end', `${owlData.rotEnd}deg`);
        el.style.setProperty('--owl-scale', '1');
        el.style.setProperty('--flap-dur', `${owlData.flapDur}s`);

        const animName = owlData.reverse ? 'nightOwlFlyAcrossReverse' : 'nightOwlFlyAcross';
        el.style.animation = `${animName} ${owlData.duration}s cubic-bezier(0.25, 0.1, 0.25, 1) ${owlData.delay}s forwards`;

        el.innerHTML = `
            <div class="night-owl-inner">
                <img src="${owlImgSrc}" alt="WGU Night Owl" class="w-full h-full object-contain pointer-events-none select-none">
            </div>
        `;

        el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            el.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            el.style.transform = 'scale(1.7) rotate(360deg)';
            el.style.opacity = '0';
            if (typeof confetti === 'function') {
                const rect = el.getBoundingClientRect();
                confetti({
                    particleCount: 20,
                    spread: 55,
                    origin: {
                        x: (rect.left + rect.width / 2) / window.innerWidth,
                        y: (rect.top + rect.height / 2) / window.innerHeight
                    },
                    colors: ['#00205b', '#e8a100', '#6366f1', '#38bdf8', '#ffffff']
                });
            }
            setTimeout(() => el.remove(), 320);
        });

        overlay.appendChild(el);
    });

    setTimeout(() => {
        if (overlay) {
            overlay.style.transition = 'opacity 0.6s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 600);
        }
    }, 7200);
}

// Bind to window
if (typeof window !== 'undefined') {
    window.triggerKonamiEasterEgg = triggerKonamiEasterEgg;
    window.ensureCommandPaletteExists = ensureCommandPaletteExists;
    window.toggleCommandPalette = toggleCommandPalette;
    window.filterCommandPalette = filterCommandPalette;
    window.executeCmd = executeCmd;
    window.handleCmdKey = handleCmdKey;
    window.triggerMaestroRain = triggerMaestroRain;
    window.triggerNightOwlFlight = triggerNightOwlFlight;

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
}
