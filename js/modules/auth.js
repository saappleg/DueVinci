// --- AUTHENTICATION & USER SESSION MODULE ---
import { supabaseClient } from './config.js';
import { getCurrentPageName, getBasePath, getTourCookie } from './utils.js';

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

export function handleAuth(session) {
    if (typeof document === 'undefined') return;
    const token = session?.access_token || null;
    if (token === lastProcessedSessionToken) return;
    lastProcessedSessionToken = token;

    if (session) {
        currentUser = session.user;
        if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.add('hidden');
        if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.remove('hidden');

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

export async function signInWithPasskey() {
    try {
        if (!supabaseClient.auth.signInWithPasskey) {
            showAuthMessage("Passkey authentication is not configured in this client.");
            return;
        }
        const { data, error } = await supabaseClient.auth.signInWithPasskey();
        if (error) showAuthMessage(error.message);
    } catch (err) {
        console.error("Passkey sign in error:", err);
        showAuthMessage("Passkey sign-in failed. Please use email/password.");
    }
}

export async function registerPasskey() {
    try {
        if (!supabaseClient.auth.registerPasskey) {
            alert("Passkeys are not supported on this browser or configuration.");
            return;
        }
        const { data, error } = await supabaseClient.auth.registerPasskey();
        if (error) {
            alert(`Passkey registration failed: ${error.message}`);
        } else {
            alert("Passkey registered successfully!");
        }
    } catch (err) {
        console.error("Passkey registration error:", err);
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
    window.signInWithPasskey = signInWithPasskey;
    window.registerPasskey = registerPasskey;
}
