import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { fireConfetti, getBasePath } from './utils.js';
import { uploadProfileAvatar, removeProfileAvatar, getProfileDisplayName, saveProfileDisplayName } from './profileAvatar.js';
import { refreshReminderSettings } from './reminders.js';

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

function injectReminderSettings() {
    if (typeof document === 'undefined') return;
    const appearanceTab = document.getElementById('content-appearance');
    if (!appearanceTab || document.getElementById('reminderSettingsContainer')) return;
    const container = document.createElement('div');
    container.id = 'reminderSettingsContainer';
    container.className = 'max-w-sm space-y-3 pt-4 border-t border-zinc-200 dark:border-brand-700';
    container.innerHTML = `
        <div><h3 class="text-sm font-bold text-zinc-800 dark:text-white">🔔 Due-date reminders</h3><p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Assignments and dated calendar events are checked while DueVinci is open.</p></div>
        <label class="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 dark:bg-brand-900 p-3 border border-zinc-200 dark:border-brand-700"><span class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Enable reminders</span><input id="remindersEnabled" type="checkbox" class="h-4 w-4 accent-indigo-600"></label>
        <div><label class="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Remind me</label><select id="reminderSchedule" class="w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs dark:border-brand-600 dark:bg-brand-900 dark:text-white"><option value="0">On the due date</option><option value="0,1">On the due date and 1 day before</option><option value="0,1,3">On the due date, 1 day, and 3 days before</option><option value="0,1,3,7">On the due date, 1 day, 3 days, and 1 week before</option></select></div>
        <div class="flex gap-2"><button type="button" onclick="saveReminderSettingsFromUI()" class="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">Save reminders</button><button type="button" onclick="requestReminderPermission()" class="rounded-lg bg-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-300 dark:bg-brand-700 dark:text-white">Enable browser alerts</button></div>
        <p id="reminderSettingsMsg" class="hidden text-xs text-zinc-500 dark:text-zinc-400"></p>`;
    appearanceTab.appendChild(container);
}

export function ensureSettingsModalExists() {
    if (typeof document === 'undefined') return;
    let div = document.getElementById('settingsModal');
    if (!div) {
        div = document.createElement('div');
        div.id = 'settingsModal';
        div.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-900/60 backdrop-blur-sm hidden';
        div.innerHTML = `
            <div class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col sm:flex-row overflow-hidden min-h-[460px] max-h-[92vh] sm:max-h-[90vh]">
                <div class="w-full sm:w-48 bg-zinc-50 dark:bg-brand-900 border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-brand-700 p-3 sm:p-4 shrink-0 flex flex-col justify-between">
                    <div>
                        <h3 class="hidden sm:block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 px-2">Settings</h3>
                        <nav class="flex gap-1 overflow-x-auto sm:block sm:space-y-1">
                            <button type="button" onclick="switchSettingsTab('profile')" class="shrink-0 sm:w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition" id="tab-profile">Profile</button>
                            <button type="button" onclick="switchSettingsTab('appearance')" class="shrink-0 sm:w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="tab-appearance">Appearance</button>
                            <button type="button" onclick="switchSettingsTab('backup')" class="shrink-0 sm:w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="tab-backup">Cloud & Backup</button>
                            <button type="button" onclick="switchSettingsTab('privacy')" class="shrink-0 sm:w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="tab-privacy">Privacy & AI</button>
                            <button type="button" onclick="switchSettingsTab('canvas')" class="shrink-0 sm:w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="tab-canvas">💳 Subscription</button>
                        </nav>
                    </div>
                    <div class="hidden sm:block pt-4 border-t border-zinc-200/60 dark:border-brand-700/60 text-[11px] space-y-1 px-1">
                        <button type="button" onclick="openWhatsNewModal()" class="block text-indigo-600 dark:text-indigo-400 font-bold hover:underline">What's New ✨</button>
                        <a href="${getBasePath()}legal/privacy.html" class="block text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium">Privacy Policy ↗</a>
                        <a href="${getBasePath()}legal/terms.html" class="block text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium">Terms of Use ↗</a>
                    </div>
                </div>
                <div class="flex-1 p-4 sm:p-6 relative overflow-y-auto max-h-[72vh] sm:max-h-[90vh]">
                    <button type="button" onclick="closeSettingsModal()" class="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition text-xl">✕</button>
                    
                    <!-- Tab: Profile -->
                    <div id="content-profile" class="block space-y-6">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Profile & Security</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Update your email, password, and manage your account.</p>
                        </div>
                        <form id="settingsForm" class="max-w-sm space-y-4">
                            <div>
                                <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Display Name</label>
                                <input type="text" id="profileDisplayName" maxlength="80" autocomplete="name" placeholder="How DueVinci should address you" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500">
                                <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Shown in your profile menu. Your email remains private.</p>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Profile photo</label>
                                <div class="flex items-center gap-3">
                                    <label class="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition">Upload photo
                                        <input id="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden">
                                    </label>
                                    <button type="button" onclick="removeProfileAvatar()" class="text-xs font-semibold text-zinc-500 hover:text-red-600 dark:text-zinc-400">Remove</button>
                                    <span class="text-[11px] text-zinc-400">JPG, PNG, or WebP · up to 2 MB</span>
                                </div>
                                <p id="avatarMsg" class="hidden mt-2 text-xs"></p>
                            </div>
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
                                <div class="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                                    <span>🔑</span> Passkeys & Biometric Login
                                </div>
                                <div class="text-xs text-zinc-500 dark:text-zinc-400">Log in seamlessly using Touch ID, Face ID, or Windows Hello</div>
                            </div>
                            <button type="button" onclick="registerPasskey()" class="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:opacity-90 text-white dark:text-zinc-900 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1">
                                + Register Passkey
                            </button>
                        </div>

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

                    <!-- Tab: Backup & Cloud Sync -->
                    <div id="content-backup" class="hidden space-y-6">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Supabase Cloud Sync & Data Backup</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Export local snapshots, restore course history, and sync with Supabase PostgreSQL.</p>
                        </div>

                        <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <div class="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                                    <span class="text-emerald-500">🟢</span> Supabase Cloud Database Sync
                                </div>
                                <div class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Real-time PostgreSQL synchronization for your courses, assignments, and study sessions.</div>
                            </div>
                            <button type="button" onclick="syncDataWithSupabase()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 flex items-center gap-1.5">
                                <span>🔄</span> Sync to Cloud Now
                            </button>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-3">
                                <div>
                                    <h4 class="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                                        <span>📥</span> Export JSON Backup
                                    </h4>
                                    <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Download a portable JSON archive of all your courses, assignments, custom events, timers, and preferences.</p>
                                </div>
                                <button type="button" onclick="exportUserDataJSON()" class="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-brand-700 dark:hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition">
                                    Download Backup (.json)
                                </button>
                            </div>

                            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-3">
                                <div>
                                    <h4 class="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                                        <span>📤</span> Restore from Backup
                                    </h4>
                                    <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Select a previously exported DueVinci JSON file to restore and sync courses and assignments back into Supabase.</p>
                                </div>
                                <label class="w-full py-2 px-3 bg-zinc-200 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-bold transition cursor-pointer text-center block">
                                    Choose JSON File to Restore
                                    <input type="file" accept=".json,application/json" onchange="importUserDataJSON(this)" class="hidden">
                                </label>
                            </div>
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
                                    <a href="${getBasePath()}legal/privacy.html" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition">Privacy Policy ↗</a>
                                    <a href="${getBasePath()}legal/terms.html" class="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 rounded-lg font-bold text-xs transition">Terms of Use ↗</a>
                                </div>
                            </div>
                        </div>

                    <!-- Tab: Subscription -->
                    <div id="content-canvas" class="hidden space-y-5">
                        <div>
                            <h2 class="text-xl font-bold dark:text-white mb-1">Subscription</h2>
                            <p class="text-sm text-zinc-500 dark:text-zinc-400">Canvas LMS Sync is the first subscription benefit. All existing DueVinci planning features remain free forever.</p>
                            <p class="mt-2 text-xs text-indigo-600 dark:text-indigo-300">Included now: course syncing, assignment importing, and due-date updates.</p>
                        </div>

                        <!-- Subscription Status Banner -->
                        <div id="canvasSubscriptionArea" class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-3">
                            <div class="flex items-center justify-between">
                                <div class="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">🎟️ Subscription Status</div>
                                <span id="canvasSubBadge" class="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-zinc-200 dark:bg-brand-700 text-zinc-500 dark:text-zinc-400">Loading…</span>
                            </div>
                            <p id="canvasSubMsg" class="text-xs text-zinc-500 dark:text-zinc-400">Checking your plan…</p>
                            <button id="canvasStartTrialBtn" type="button" onclick="handleCanvasStartTrial()" class="hidden w-full py-2 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2">
                                Start 30-Day Free Trial — No Card Required
                            </button>
                        <div id="canvasCheckoutOptions" class="hidden space-y-2">
                                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Subscribe to keep Canvas LMS Sync enabled. Cancel anytime.</p>
                                <div class="grid grid-cols-2 gap-2">
                                    <button type="button" data-canvas-checkout onclick="handleCanvasCheckout('monthly')" class="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50">$5 / month</button>
                                    <button type="button" data-canvas-checkout onclick="handleCanvasCheckout('yearly')" class="py-2 px-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50">$45 / year</button>
                                </div>
                            </div>
                        </div>
                        <button id="canvasManageBillingBtn" type="button" onclick="handleCanvasBillingPortal()" class="hidden w-full py-2 px-4 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 font-bold text-xs rounded-xl transition">Manage subscription</button>

                        <!-- Canvas Connector Form -->
                        <div id="canvasConnectorArea" class="hidden p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-4">
                            <div class="font-bold text-sm text-zinc-900 dark:text-white">🔗 Connect Your Canvas Instance</div>
                            <div id="canvasConnectorMsg" class="hidden text-xs rounded-lg px-3 py-2 border"></div>
                            <div>
                                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5">Canvas Instance URL</label>
                                <input type="text" id="canvasDomainInput" placeholder="https://canvas.myschool.edu" class="w-full px-3 py-2 bg-white dark:bg-brand-800 border border-zinc-300 dark:border-brand-600 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-indigo-500 transition">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5">Personal Access Token</label>
                                <input type="password" id="canvasTokenInput" placeholder="Canvas → Account → Settings → + New Access Token" class="w-full px-3 py-2 bg-white dark:bg-brand-800 border border-zinc-300 dark:border-brand-600 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-indigo-500 font-mono transition">
                                <p class="text-[11px] text-zinc-400 mt-1.5">Canvas: Account → Settings → Approved Integrations → + New Access Token.</p>
                            </div>
                            <button type="button" id="canvasConnectBtn" onclick="handleCanvasConnect()" class="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                                Connect Canvas LMS
                            </button>
                            <button type="button" id="canvasMockConnectBtn" onclick="handleCanvasConnectMock()" class="hidden w-full py-2 px-4 border border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 font-bold text-xs rounded-xl transition">
                                Use sample Canvas account (Dev only)
                            </button>
                            <p class="hidden text-[11px] text-zinc-400" id="canvasMockConnectHint">Uses sample courses to test importing. No real Canvas credentials are needed.</p>
                        </div>

                        <!-- Connected State + Sync Trigger -->
                        <div id="canvasSyncTriggerArea" class="hidden p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/50 space-y-3">
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-1.5">
                                        <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Canvas Connected
                                    </div>
                                    <div id="canvasConnectedDomain" class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono"></div>
                                    <div id="canvasLastSynced" class="text-[11px] text-zinc-400 mt-0.5">Not synced yet</div>
                                </div>
                                <button type="button" onclick="handleCanvasDisconnect()" class="text-[11px] text-zinc-400 hover:text-red-500 transition font-medium">Disconnect</button>
                            </div>
                            <button type="button" onclick="openCanvasSyncModal()" class="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                                Sync Canvas coursework…
                            </button>
                        </div>

                        <!-- Canvas Sync Modal -->
                        <div id="canvasSyncModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                            <div class="relative w-full max-w-lg bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                                <div class="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-brand-700">
                                    <div>
                                        <h3 class="text-sm font-bold text-zinc-900 dark:text-white">Sync Canvas coursework</h3>
                                        <p class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Import selected courses plus their dated assignments.</p>
                                    </div>
                                    <button type="button" onclick="closeCanvasSyncModal()" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition text-lg">✕</button>
                                </div>
                                <div id="canvasSyncModalMsg" class="hidden mx-5 mt-4 p-3 rounded-xl text-xs border"></div>
                                <div class="flex-1 overflow-y-auto p-5" id="canvasCourseList">
                                    <div class="flex flex-col items-center justify-center py-10 text-zinc-400 gap-3">
                                        <svg class="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                        <span class="text-xs">Loading courses from Canvas…</span>
                                    </div>
                                </div>
                                <div class="p-4 border-t border-zinc-200 dark:border-brand-700 flex justify-between items-center gap-3">
                                    <span id="canvasSyncCount" class="text-xs text-zinc-500 dark:text-zinc-400"></span>
                                    <div class="flex gap-2">
                                        <button type="button" onclick="closeCanvasSyncModal()" class="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-brand-700 hover:bg-zinc-200 dark:hover:bg-brand-600 rounded-lg transition">Cancel</button>
                                        <button type="button" id="canvasSyncConfirmBtn" onclick="handleCanvasSyncConfirm()" class="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50">Sync selected</button>
                                    </div>
                                </div>
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
            const displayName = document.getElementById('profileDisplayName').value;
            const msgEl = document.getElementById('settingsMsg');

            let updates = {};
            if (email && email !== currentUser?.email) updates.email = email;
            if (password) updates.password = password;

            const savedDisplayName = await getProfileDisplayName(currentUser);
            const hasNameChange = String(displayName || '').trim() !== savedDisplayName;

            if (Object.keys(updates).length === 0 && !hasNameChange) {
                msgEl.textContent = "No changes made.";
                msgEl.className = "text-xs text-center mt-2 text-zinc-500";
                msgEl.classList.remove('hidden');
                return;
            }

            let error = null;
            if (hasNameChange) {
                try {
                    await saveProfileDisplayName(displayName, currentUser);
                } catch (nameError) {
                    error = nameError;
                }
            }
            if (!error && Object.keys(updates).length > 0) {
                ({ error } = await supabaseClient.auth.updateUser(updates));
            }
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
        const displayNameInput = document.getElementById('profileDisplayName');
        if (displayNameInput) {
            getProfileDisplayName(currentUser).then((displayName) => {
                displayNameInput.value = displayName || currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || '';
            });
        }
        const avatarInput = document.getElementById('profileAvatarInput');
        if (avatarInput && !avatarInput.dataset.bound) {
            avatarInput.addEventListener('change', (event) => uploadProfileAvatar(event.target.files?.[0], currentUser));
            avatarInput.dataset.bound = 'true';
        }
    }
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = localStorage.getItem('theme') || 'system';

    injectAppearanceSettingsExtras();
    injectReminderSettings();
    refreshReminderSettings();

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

const SETTINGS_MOVED_NOTICE_KEY = 'duevinci_settings_moved_notice_v1';

export function showSettingsMovedNotice() {
    if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;
    if (localStorage.getItem(SETTINGS_MOVED_NOTICE_KEY)) return;
    if (document.getElementById('settingsMovedNotice')) return;

    const modal = document.createElement('div');
    modal.id = 'settingsMovedNotice';
    modal.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <section class="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-7 text-center shadow-2xl dark:border-brand-600 dark:bg-brand-800" role="dialog" aria-modal="true" aria-labelledby="settingsMovedTitle">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl dark:bg-indigo-500/20">⚙️</div>
            <h2 id="settingsMovedTitle" class="mt-5 text-xl font-extrabold text-zinc-900 dark:text-white">Settings have moved</h2>
            <p class="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-300">Your profile card at the bottom of the sidebar is now your home for Settings, account details, and your profile photo.</p>
            <button type="button" id="settingsMovedDismiss" class="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700">Got it</button>
        </section>`;
    document.body.appendChild(modal);
    document.getElementById('settingsMovedDismiss')?.addEventListener('click', () => {
        localStorage.setItem(SETTINGS_MOVED_NOTICE_KEY, 'true');
        modal.remove();
    });
}

export function switchSettingsTab(tabName) {
    const tabs = ['profile', 'appearance', 'backup', 'privacy', 'canvas'];
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
    // When switching to Canvas tab, refresh its state
    if (tabName === 'canvas') {
        if (typeof window.initCanvasSettingsTab === 'function') window.initCanvasSettingsTab();
    }
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
                            <button type="button" onclick="switchSupportTab('inbox'); loadSupportInbox()" class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition" id="support-tab-inbox">Support Inbox</button>
                        </nav>
                    </div>
                    <div class="pt-4 border-t border-zinc-200/60 dark:border-brand-700/60 text-[11px] space-y-1 px-1">
                        <span class="text-zinc-400 dark:text-zinc-500 block">DueVinci Support</span>
                        <a href="${getBasePath()}legal/privacy.html" class="block text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium">Privacy Policy ↗</a>
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

                    <div id="support-content-inbox" class="hidden space-y-3">
                        <div><h2 class="text-xl font-bold dark:text-white mb-1">Support Inbox</h2><p class="text-sm text-zinc-500 dark:text-zinc-400">Review and resolve incoming support tickets.</p></div>
                        <p id="supportInboxFeedback" class="text-xs text-red-500"></p>
                        <div id="supportInboxList" class="space-y-3 max-h-[50vh] overflow-y-auto"></div>
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
    const tabs = ['contact', 'faq', 'github', 'inbox'];
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

function escapeSupportHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

export async function loadSupportInbox() {
    const list = document.getElementById('supportInboxList');
    const feedback = document.getElementById('supportInboxFeedback');
    if (!list || !feedback) return;
    list.innerHTML = '<p class="text-xs text-zinc-500">Loading tickets…</p>';
    feedback.textContent = '';
    try {
        const { data, error } = await supabaseClient.functions.invoke('manage-support-tickets', { body: { action: 'list' } });
        if (error || !data?.tickets) throw new Error(data?.error || error?.message || 'Unable to load tickets.');
        if (!data.tickets.length) { list.innerHTML = '<p class="text-xs text-zinc-500">No support tickets yet.</p>'; return; }
        list.innerHTML = data.tickets.map((ticket) => `<article class="border border-zinc-200 dark:border-brand-700 rounded-lg p-3 space-y-2"><div class="flex justify-between gap-3"><strong class="text-xs dark:text-white">${escapeSupportHtml(ticket.subject)}</strong><span class="text-[10px] text-zinc-500">${new Date(ticket.created_at).toLocaleString()}</span></div><p class="text-[11px] text-zinc-500">${escapeSupportHtml(ticket.email)} · ${escapeSupportHtml(ticket.category)}</p><p class="text-xs whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">${escapeSupportHtml(ticket.message)}</p><select onchange="updateSupportTicketStatus('${ticket.id}', this.value)" class="text-xs border rounded px-2 py-1 dark:bg-brand-900 dark:border-brand-600">${['open', 'in_progress', 'resolved', 'closed', 'delivery_failed'].map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${status.replace('_', ' ')}</option>`).join('')}</select></article>`).join('');
    } catch (error) {
        list.innerHTML = '';
        feedback.textContent = error.message || 'Unable to load tickets.';
    }
}

export async function updateSupportTicketStatus(id, status) {
    const { data, error } = await supabaseClient.functions.invoke('manage-support-tickets', { body: { action: 'update', id, status } });
    if (error || !data?.success) alert(data?.error || error?.message || 'Unable to update ticket.');
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
        const { data, error } = await supabaseClient.functions.invoke('submit-support-ticket', {
            body: { category, email, subject, message }
        });
        let functionMessage = data?.error || error?.message;
        if (error?.context && typeof error.context.json === 'function') {
            const details = await error.context.json().catch(() => null);
            functionMessage = details?.error || functionMessage;
        }
        if (error || !data?.success) throw new Error(functionMessage || 'Unable to send support message.');
        fireConfetti();

        if (feedback) {
            feedback.textContent = "Thank you! Your message was delivered to Steven.";
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
            feedback.textContent = `We couldn't send that message: ${err.message || 'please try again or use Email App.'}`;
            feedback.className = "text-xs text-center mt-2 text-red-500";
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
            // Canvas credentials live in a server-only table, so remove them via
            // the authenticated Edge Function before deleting local coursework.
            const { error: canvasDisconnectError } = await supabaseClient.functions.invoke('canvas-disconnect');
            if (canvasDisconnectError) throw canvasDisconnectError;
            await supabaseClient.from('assignments').delete().eq('user_id', currentUser.id);
            await supabaseClient.from('courses').delete().eq('user_id', currentUser.id);
            await supabaseClient.from('custom_events').delete().eq('user_id', currentUser.id);
            const { data: deleteAccountData, error: deleteAccountError } = await supabaseClient.functions.invoke('delete-account');
            if (deleteAccountError) throw deleteAccountError;
            if (!deleteAccountData?.success) throw new Error(deleteAccountData?.error || 'Unable to delete account.');
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
    window.showSettingsMovedNotice = showSettingsMovedNotice;
    window.switchSettingsTab = switchSettingsTab;
    window.ensureSupportModalExists = ensureSupportModalExists;
    window.openSupportModal = openSupportModal;
    window.closeSupportModal = closeSupportModal;
    window.switchSupportTab = switchSupportTab;
    window.submitSupportMessage = submitSupportMessage;
    window.loadSupportInbox = loadSupportInbox;
    window.updateSupportTicketStatus = updateSupportTicketStatus;
    window.sendDirectMailto = sendDirectMailto;
    window.confirmAccountDeletion = confirmAccountDeletion;
    window.uploadProfileAvatar = (event) => uploadProfileAvatar(event?.target?.files?.[0], currentUser);
    window.removeProfileAvatar = () => removeProfileAvatar(currentUser);
}
