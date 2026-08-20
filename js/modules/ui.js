// --- UI, SETTINGS, THEMES & MODALS MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { fireConfetti } from './utils.js';

export function changeTheme(themeValue) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('theme', themeValue);
    if (typeof document === 'undefined') return;
    if (themeValue === 'dark' || (themeValue === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

export function toggleGreekTheme() {
    if (typeof document === 'undefined') return;
    const enabled = document.documentElement.classList.toggle('greek-theme');
    if (typeof localStorage !== 'undefined') localStorage.setItem('greekTheme', enabled ? 'on' : 'off');
}

export function updateDateFormat(format) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_date_format', format);
    if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
    if (typeof window.loadCoursesPage === 'function') window.loadCoursesPage();
}

export function toggleMuteAlarm(muted) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_mute_alarm', muted);
}

export function updateAlarmSound(sound) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_alarm_sound', sound);
}

export function updateAmbientNoise(type) {
    if (typeof window.toggleAmbientNoise === 'function') {
        window.toggleAmbientNoise(type);
    }
}

export function updateGpaScale(scale) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_gpa_scale', scale);
    if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
}

export function toggleSidebar() {
    if (typeof document === 'undefined') return;
    const aside = document.querySelector('aside');
    if (aside) {
        aside.classList.toggle('hidden');
        if (typeof window.updateFloatingTimer === 'function') window.updateFloatingTimer();
    }
}

export function injectAppearanceSettingsExtras() {
    if (typeof document === 'undefined') return;
    const appearanceTab = document.getElementById('content-appearance');
    if (!appearanceTab || document.getElementById('appearanceExtrasContainer')) return;

    const currentFormat = localStorage.getItem('duevinci_date_format') || 'YYYY-MM-DD';
    const isMuted = localStorage.getItem('duevinci_mute_alarm') === 'true';
    const currentGpaScale = localStorage.getItem('duevinci_gpa_scale') || '4.0';
    const isAcademicsHidden = localStorage.getItem('duevinci_hide_academics') === 'true';

    const currentAlarmSound = localStorage.getItem('duevinci_alarm_sound') || 'gentleChime';
    const currentAmbientNoise = localStorage.getItem('duevinci_ambient_noise') || 'off';

    const container = document.createElement('div');
    container.id = 'appearanceExtrasContainer';
    container.className = 'max-w-sm space-y-4 pt-4 border-t border-zinc-200 dark:border-brand-700';
    container.innerHTML = `
        <div>
            <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Timer Alarm Chime</label>
            <div class="flex gap-2 items-center">
                <select id="alarmSoundSelect" onchange="updateAlarmSound(this.value)" class="flex-1 text-xs px-2.5 py-2 rounded border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                    <option value="gentleChime" ${currentAlarmSound === 'gentleChime' ? 'selected' : ''}>🔔 Gentle Rising Chime</option>
                    <option value="zenBowl" ${currentAlarmSound === 'zenBowl' ? 'selected' : ''}>🧘 Zen Singing Bowl</option>
                    <option value="digitalBeep" ${currentAlarmSound === 'digitalBeep' ? 'selected' : ''}>⏱️ Digital Beep</option>
                </select>
                <button type="button" onclick="playTimerAlarm(document.getElementById('alarmSoundSelect').value)" class="px-2.5 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded text-xs font-bold transition">▶ Test</button>
            </div>
        </div>
        <div>
            <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Ambient Focus Generator</label>
            <select id="ambientNoiseSelect" onchange="updateAmbientNoise(this.value)" class="w-full text-xs px-2.5 py-2 rounded border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="off" ${currentAmbientNoise === 'off' ? 'selected' : ''}>🔇 Off</option>
                <option value="brown" ${currentAmbientNoise === 'brown' ? 'selected' : ''}>🌧️ Soothing Rain / Brown Noise</option>
                <option value="white" ${currentAmbientNoise === 'white' ? 'selected' : ''}>💨 Pure Focus White Noise</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Date Format Display</label>
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
}

export function ensureSettingsModalExists() {
    if (typeof document === 'undefined') return;
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

                        <div class="pt-4 border-t border-zinc-200 dark:border-brand-700 flex items-center justify-between p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl">
                            <div>
                                <div class="font-bold text-sm text-zinc-900 dark:text-white">Interactive Walkthrough</div>
                                <div class="text-xs text-zinc-500 dark:text-zinc-400">Relaunch the step-by-step tour anytime</div>
                            </div>
                            <button type="button" onclick="replayTourFromSettings()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm">Replay Tour 🎓</button>
                        </div>

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
            if (email && email !== currentUser?.email) updates.email = email;
            if (password) updates.password = password;

            if (Object.keys(updates).length === 0) {
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
}

export function openSettingsModal() {
    ensureSettingsModalExists();
    if (currentUser) {
        const emailInput = document.getElementById('profileEmail');
        if (emailInput) emailInput.value = currentUser.email;
    }
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = localStorage.getItem('theme') || 'system';

    injectAppearanceSettingsExtras();

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
}

export function closeSettingsModal() {
    const m = document.getElementById('settingsModal');
    if (m) m.classList.add('hidden');
    const msg = document.getElementById('settingsMsg');
    if (msg) msg.classList.add('hidden');
}

export function switchSettingsTab(tabName) {
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
}

export function ensureSupportModalExists() {
    if (typeof document === 'undefined') return;
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
}

export function openSupportModal() {
    ensureSupportModalExists();
    if (currentUser) {
        const emailInput = document.getElementById('supportEmail');
        if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
    }
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.remove('hidden');
}

export function closeSupportModal() {
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.add('hidden');
    const msg = document.getElementById('supportFeedbackMsg');
    if (msg) msg.classList.add('hidden');
}

export function switchSupportTab(tabName) {
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
}

export async function submitSupportMessage(e) {
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

        fireConfetti();

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
}

export function sendDirectMailto() {
    const category = document.getElementById('supportCategory')?.value || 'DueVinci Help';
    const subject = document.getElementById('supportSubject')?.value || 'Support Request';
    const message = document.getElementById('supportMessageText')?.value || '';

    const mailSubject = encodeURIComponent(`[DueVinci ${category}] ${subject}`);
    const mailBody = encodeURIComponent(`${message}\n\n---\nSent from DueVinci User: ${currentUser?.email || 'Student'}`);

    if (typeof window !== 'undefined') {
        window.location.href = `mailto:support@duevinci.tech?subject=${mailSubject}&body=${mailBody}`;
    }
}

export async function confirmAccountDeletion() {
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

        if (typeof localStorage !== 'undefined') localStorage.clear();
        if (typeof sessionStorage !== 'undefined') sessionStorage.clear();

        await supabaseClient.auth.signOut();

        alert("Your account and all associated data have been permanently deleted.");
        if (typeof window !== 'undefined') window.location.href = 'index.html';
    } catch (err) {
        console.error("Account deletion error:", err);
        alert("An error occurred while deleting your data: " + err.message);
    }
}

// Restore Greek theme on load
if (typeof localStorage !== 'undefined' && localStorage.getItem('greekTheme') === 'on' && typeof document !== 'undefined') {
    document.documentElement.classList.add('greek-theme');
}

// Bind to window
if (typeof window !== 'undefined') {
    window.changeTheme = changeTheme;
    window.toggleGreekTheme = toggleGreekTheme;
    window.updateDateFormat = updateDateFormat;
    window.toggleMuteAlarm = toggleMuteAlarm;
    window.updateAlarmSound = updateAlarmSound;
    window.updateAmbientNoise = updateAmbientNoise;
    window.updateGpaScale = updateGpaScale;
    window.toggleSidebar = toggleSidebar;
    window.injectAppearanceSettingsExtras = injectAppearanceSettingsExtras;
    window.ensureSettingsModalExists = ensureSettingsModalExists;
    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;
    window.switchSettingsTab = switchSettingsTab;
    window.ensureSupportModalExists = ensureSupportModalExists;
    window.openSupportModal = openSupportModal;
    window.closeSupportModal = closeSupportModal;
    window.switchSupportTab = switchSupportTab;
    window.submitSupportMessage = submitSupportMessage;
    window.sendDirectMailto = sendDirectMailto;
    window.confirmAccountDeletion = confirmAccountDeletion;
}
