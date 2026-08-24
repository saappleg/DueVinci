// --- AUTHENTICATION & USER SESSION MODULE ---
import { supabaseClient } from './config.js';
import { getCurrentPageName, getBasePath, getTourCookie } from './utils.js';
import { initializePreferenceSync, stopPreferenceSync } from './preferences.js';
import { refreshProfileAvatar } from './profileAvatar.js';

export let currentUser = null;
let lastProcessedSessionToken = undefined;

export function showAuthMessage(msg, colorClass = "text-red-500") {
    if (typeof document === 'undefined') return;
    const msgEl = document.getElementById('authMessage');
    if (msgEl) {
        msgEl.textContent = msg;
        msgEl.className = `text-sm mt-2 ${colorClass}`;
        msgEl.classList.remove('hidden');
    }
}

export async function checkUser() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        handleAuth(session);
        supabaseClient.auth.onAuthStateChange((_event, session) => handleAuth(session));
    } catch (err) {
        console.error('Error checking user session:', err);
    }
}

export async function handleAuth(session) {
    if (typeof document === 'undefined') return;
    if (!session && typeof navigator !== 'undefined' && navigator.onLine === false) {
        try {
            const offlineUser = JSON.parse(localStorage.getItem('duevinci_offline_user') || 'null');
            if (offlineUser?.id) session = { access_token: `offline:${offlineUser.id}`, user: offlineUser };
        } catch { /* Show the normal auth screen if no prior local session exists. */ }
    }
    const token = session?.access_token || null;
    if (token === lastProcessedSessionToken) return;
    lastProcessedSessionToken = token;

    if (session) {
        currentUser = session.user;
        if (currentUser?.id && typeof localStorage !== 'undefined') {
            localStorage.setItem('duevinci_offline_user', JSON.stringify({ id: currentUser.id, email: currentUser.email || '' }));
        }
        if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.add('hidden');
        if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.remove('hidden');
        if (typeof window !== 'undefined') window.currentUser = currentUser;
        refreshProfileAvatar(currentUser).catch(() => {});

        // Never block cached-page rendering on a cloud preference request.
        // Chrome's DevTools offline mode can still report navigator.onLine,
        // so this must be deliberately background-only.
        initializePreferenceSync(currentUser).catch((error) => {
            console.warn('Preference sync deferred until reconnect:', error.message || error);
        });

        const page = getCurrentPageName();
        if ((page === 'index' || page === 'index.html' || page === '') && document.getElementById('dashboardGrid')) {
            if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
            if (typeof window.renderAcademicsDashboardWidget === 'function') window.renderAcademicsDashboardWidget('dashboardGrid');
            if (typeof window.renderStudyPlanDashboardWidget === 'function') window.renderStudyPlanDashboardWidget('studyPlanWidgetContainer');

            // Auto launch walkthrough on first login if cookies are empty
            if (!getTourCookie('duevinci_tour_done')) {
                setTimeout(() => {
                    if (typeof window.startWalkthrough === 'function') window.startWalkthrough(false);
                }, 1000);
            }
        }
        if ((page === 'courses' || page === 'courses.html') && document.getElementById('coursesGrid')) {
            if (typeof window.loadCoursesPage === 'function') window.loadCoursesPage();
        }
        if ((page === 'calendar' || page === 'calendar.html') && document.getElementById('calendar')) {
            if (typeof window.initCalendar === 'function') window.initCalendar();
            if (typeof window.loadCalendarCourses === 'function') window.loadCalendarCourses();
        }
        if ((page === 'grades' || page === 'grades.html') && document.getElementById('gradesContainer')) {
            if (typeof window.loadGradesPage === 'function') window.loadGradesPage();
        }
    } else {
        currentUser = null;
        if (typeof window !== 'undefined') window.currentUser = null;
        stopPreferenceSync();
        const page = getCurrentPageName();
        if (page !== 'index' && page !== 'index.html') {
            if (typeof window !== 'undefined' && window.location) window.location.href = getBasePath() + 'index.html';
        } else {
            if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.remove('hidden');
            if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.add('hidden');
        }
    }
}

export async function signUpWithEmail() {
    if (typeof document === 'undefined') return;
    const email = document.getElementById('authEmail')?.value;
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) return showAuthMessage("Please enter an email and password.");

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) showAuthMessage(error.message);
    else showAuthMessage("Account created! You are now logged in.", "text-green-500");
}

export async function signInWithEmail() {
    if (typeof document === 'undefined') return;
    const email = document.getElementById('authEmail')?.value;
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) return showAuthMessage("Please enter your email and password.");

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) showAuthMessage(error.message);
}

export async function logout() {
    await supabaseClient.auth.signOut();
    if (typeof window !== 'undefined' && window.location) {
        window.location.href = 'index.html';
    }
}

export function initPasskeyUI() {
    if (typeof document === 'undefined') return;
    const passkeySection = document.getElementById('passkeySignInSection');
    if (!passkeySection) return;

    // Check if WebAuthn / Platform Authenticator or Passkey is available in the browser
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        passkeySection.classList.remove('hidden');
    }
}

export async function signInWithPasskey() {
    try {
        if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.signInWithPasskey === 'function') {
            const { data, error } = await supabaseClient.auth.signInWithPasskey();
            if (error) {
                showAuthMessage(error.message || "Passkey sign-in failed. Please use email/password.");
            }
            return;
        }

        // WebAuthn platform prompt fallback
        if (typeof window !== 'undefined' && window.PublicKeyCredential) {
            showAuthMessage("Passkey credentials not found on this device. Sign in with email to register a passkey.");
        } else {
            showAuthMessage("Passkey authentication is not supported by your browser.");
        }
    } catch (err) {
        console.error("Passkey sign in error:", err);
        showAuthMessage("Passkey sign-in was cancelled or encountered an error.");
    }
}

export async function registerPasskey() {
    try {
        if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.registerPasskey === 'function') {
            const { data, error } = await supabaseClient.auth.registerPasskey();
            if (error) {
                alert(`Passkey registration failed: ${error.message}`);
            } else {
                alert("Passkey registered successfully! You can now use Touch ID, Face ID, or your security key to log in.");
            }
            return;
        }

        if (typeof window !== 'undefined' && window.PublicKeyCredential) {
            alert("Passkey registration requires an active online session. Your biometric device is ready.");
        } else {
            alert("Passkeys are not supported on this browser or platform.");
        }
    } catch (err) {
        console.error("Passkey registration error:", err);
        alert("Passkey registration was cancelled or encountered an error.");
    }
}

// Bind to window for HTML event handlers
if (typeof window !== 'undefined') {
    window.checkUser = checkUser;
    window.handleAuth = handleAuth;
    window.showAuthMessage = showAuthMessage;
    window.signUpWithEmail = signUpWithEmail;
    window.signInWithEmail = signInWithEmail;
    window.logout = logout;
    window.signOut = logout;
    window.initPasskeyUI = initPasskeyUI;
    window.signInWithPasskey = signInWithPasskey;
    window.registerPasskey = registerPasskey;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initPasskeyUI);
        } else {
            initPasskeyUI();
        }
    }
}
