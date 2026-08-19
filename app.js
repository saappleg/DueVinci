// Supabase Project URL and Anon Key
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
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        initCalendar();
        loadCourses();
    } else {
        currentUser = null;
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('appScreen').classList.add('hidden');
    }
}

// --- NEW EMAIL AUTHENTICATION FUNCTIONS ---

function showAuthMessage(msg, colorClass = "text-red-500") {
    const msgEl = document.getElementById('authMessage');
    msgEl.textContent = msg;
    msgEl.className = `text-sm mt-2 ${colorClass}`;
    msgEl.classList.remove('hidden');
}

window.signUpWithEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    if (!email || !password) {
        return showAuthMessage("Please enter an email and password.");
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        showAuthMessage(error.message);
    } else {
        showAuthMessage("Account created! You are now logged in.", "text-green-500");
        // The onAuthStateChange listener will automatically handle routing to the app
    }
};

window.signInWithEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        return showAuthMessage("Please enter your email and password.");
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        showAuthMessage(error.message);
    }
};

window.logout = async () => {
    await supabaseClient.auth.signOut();
};

// --- CALENDAR & DATABASE FUNCTIONS ---

function initCalendar() {
    if (calendarInstance) return;
    
    const calendarEl = document.getElementById('calendar');
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

// Fetch Courses from Supabase Database
async function loadCourses() {
    const { data: courses, error } = await supabaseClient
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading courses:', error);
        return;
    }

    const courseListEl = document.getElementById('courseList');
    courseListEl.innerHTML = '';
    let calendarEvents = [];

    courses.forEach(course => {
        // Render Sidebar Course Item
        courseListEl.innerHTML += `
            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div class="flex items-center gap-3">
                    <span class="w-4 h-4 rounded-full inline-block" style="background-color: ${course.color};"></span>
                    <span class="font-medium text-sm">${course.code}</span>
                </div>
                <button onclick="deleteCourse('${course.id}')" class="text-xs text-slate-400 hover:text-red-500">✕</button>
            </div>
        `;

        // Add placeholder event to calendar showing the color tag mapping
        calendarEvents.push({
            title: `${course.code} Session`,
            start: new Date().toISOString().split('T')[0],
            color: course.color
        });
    });

    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(calendarEvents);
    }
}

// Insert Course into Supabase Database
document.getElementById('courseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const code = document.getElementById('courseCode').value;
    const color = document.getElementById('courseColor').value;

    const { error } = await supabaseClient
        .from('courses')
        .insert([{ code, color, user_id: currentUser.id }]);

    if (!error) {
        document.getElementById('courseCode').value = '';
        loadCourses();
    } else {
        alert('Error adding course: ' + error.message);
    }
});

window.deleteCourse = async (id) => {
    if (confirm('Delete this course?')) {
        const { error } = await supabaseClient.from('courses').delete().eq('id', id);
        if (!error) loadCourses();
    }
};

// Client-side .ics Calendar Export Tool
window.exportToICS = () => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DueVinci//Student Planner//EN\n";
    
    const events = calendarInstance.getEvents();
    events.forEach(ev => {
        const dateStr = ev.start.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        icsContent += "BEGIN:VEVENT\n";
        icsContent += `SUMMARY:${ev.title}\n`;
        icsContent += `DTSTART:${dateStr}\n`;
        icsContent += `DTEND:${dateStr}\n`;
        icsContent += "END:VEVENT\n";
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
