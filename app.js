// Supabase Project API Keys
const SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let calendarInstance = null;

// Check authentication state on page load
async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuth(session);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuth(session);
    });
}

function handleAuth(session) {
    if (session) {
        currentUser = session.user;
        // Unhide the app screen if it exists on the page
        if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.add('hidden');
        if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.remove('hidden');
        
        // Page Routing Logic: Only load what is on the screen
        if (document.getElementById('calendar')) initCalendar();
        if (document.getElementById('dashboardGrid')) loadDashboardCourses();
        if (document.getElementById('calendar')) loadCalendarCourses();

    } else {
        currentUser = null;
        // If the user is logged out and NOT on the index page, kick them back to index.html
        const currentPath = window.location.pathname;
        if (!currentPath.endsWith('index.html') && !currentPath.endsWith('/') && !currentPath.includes('DueVinci')) {
            window.location.href = 'index.html';
        } else {
            if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.remove('hidden');
            if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.add('hidden');
        }
    }
}

// --- EMAIL AUTHENTICATION FUNCTIONS ---
function showAuthMessage(msg, colorClass = "text-red-500") {
    const msgEl = document.getElementById('authMessage');
    if(msgEl) {
        msgEl.textContent = msg;
        msgEl.className = `text-sm mt-2 ${colorClass}`;
        msgEl.classList.remove('hidden');
    }
}

window.signUpWithEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showAuthMessage("Please enter an email and password.");
    
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) showAuthMessage(error.message);
    else showAuthMessage("Account created! You are now logged in.", "text-green-500");
};

window.signInWithEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showAuthMessage("Please enter your email and password.");

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) showAuthMessage(error.message);
};

window.logout = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html'; // Force redirect to login screen on logout
};

// --- DASHBOARD LOGIC (Runs only on index.html) ---
async function loadDashboardCourses() {
    const { data: courses, error } = await supabaseClient
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return console.error('Error loading courses:', error);

    const courseListEl = document.getElementById('courseList');
    if (!courseListEl) return;
    courseListEl.innerHTML = '';

    courses.forEach(course => {
        courseListEl.innerHTML += `
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex items-center gap-3">
                    <span class="w-4 h-4 rounded-full inline-block shadow-sm" style="background-color: ${course.color};"></span>
                    <span class="font-bold text-sm text-slate-700">${course.code}</span>
                </div>
                <button onclick="deleteCourse('${course.id}')" class="text-xs text-slate-400 hover:text-red-500 transition">✕</button>
            </div>
        `;
    });
}

// Handle Course Submission on Dashboard
const courseForm = document.getElementById('courseForm');
if (courseForm) {
    courseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const code = document.getElementById('courseCode').value;
        const color = document.getElementById('courseColor').value;

        const { error } = await supabaseClient.from('courses').insert([{ code, color, user_id: currentUser.id }]);

        if (!error) {
            document.getElementById('courseCode').value = '';
            loadDashboardCourses();
        } else {
            alert('Error adding course: ' + error.message);
        }
    });
}

window.deleteCourse = async (id) => {
    if (confirm('Delete this course?')) {
        const { error } = await supabaseClient.from('courses').delete().eq('id', id);
        if (!error) loadDashboardCourses();
    }
};

// --- CALENDAR LOGIC (Runs only on calendar.html) ---
function initCalendar() {
    if (calendarInstance) return;
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        events: []
    });
    calendarInstance.render();
}

async function loadCalendarCourses() {
    const { data: courses, error } = await supabaseClient.from('courses').select('*');
    if (error) return;

    let calendarEvents = [];
    courses.forEach(course => {
        calendarEvents.push({
            title: `${course.code} Registration`,
            start: new Date().toISOString().split('T')[0],
            color: course.color
        });
    });

    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(calendarEvents);
    }
}

window.exportToICS = () => {
    if(!calendarInstance) return;
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DueVinci//Student Planner//EN\n";
    const events = calendarInstance.getEvents();
    
    events.forEach(ev => {
        const dateStr = ev.start.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        icsContent += "BEGIN:VEVENT\nSUMMARY:" + ev.title + "\nDTSTART:" + dateStr + "\nDTEND:" + dateStr + "\nEND:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'duevinci-schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Initialize app
checkUser();
