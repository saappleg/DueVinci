// Supabase Project API Keys
const SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let calendarInstance = null;
let localCourses = []; // Keep a local copy of courses to easily populate the modal

// --- THEME LOGIC ---
window.changeTheme = (theme) => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

// Listen for system theme changes in case 'system' is selected
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if(localStorage.getItem('theme') === 'system' || !localStorage.getItem('theme')) {
        changeTheme('system');
    }
});

// Sync dropdown UI with stored value on load
document.addEventListener('DOMContentLoaded', () => {
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = localStorage.getItem('theme') || 'system';
});

// --- AUTH LOGIC ---
async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuth(session);
    supabaseClient.auth.onAuthStateChange((_event, session) => handleAuth(session));
}

function handleAuth(session) {
    if (session) {
        currentUser = session.user;
        if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.add('hidden');
        if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.remove('hidden');
        
        if (document.getElementById('calendar')) initCalendar();
        if (document.getElementById('dashboardGrid')) loadDashboardCourses();
        if (document.getElementById('calendar')) loadCalendarCourses();
    } else {
        currentUser = null;
        const currentPath = window.location.pathname;
        if (!currentPath.endsWith('index.html') && !currentPath.endsWith('/') && !currentPath.includes('DueVinci')) {
            window.location.href = 'index.html';
        } else {
            if (document.getElementById('authScreen')) document.getElementById('authScreen').classList.remove('hidden');
            if (document.getElementById('appScreen')) document.getElementById('appScreen').classList.add('hidden');
        }
    }
}

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
    window.location.href = 'index.html'; 
};

// --- DASHBOARD LOGIC ---
async function loadDashboardCourses() {
    const { data: courses, error } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
    if (error) return console.error('Error loading courses:', error);

    localCourses = courses; // Cache for modal
    const courseListEl = document.getElementById('courseList');
    if (!courseListEl) return;
    courseListEl.innerHTML = '';

    courses.forEach(course => {
        const emoji = course.emoji || '📚';
        // Now fully clickable to open settings
        courseListEl.innerHTML += `
            <div onclick="openCourseModal('${course.id}')" class="cursor-pointer flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600 transition hover:border-indigo-400 dark:hover:border-indigo-500 group">
                <div class="flex items-center gap-3">
                    <span class="text-xl">${emoji}</span>
                    <span class="w-3 h-3 rounded-full inline-block shadow-sm" style="background-color: ${course.color};"></span>
                    <span class="font-bold text-sm text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${course.code}</span>
                </div>
                <span class="text-slate-300 dark:text-slate-500 text-sm">⚙️</span>
            </div>
        `;
    });
}

// Add Main Course
const courseForm = document.getElementById('courseForm');
if (courseForm) {
    courseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        const code = document.getElementById('courseCode').value;
        const color = document.getElementById('courseColor').value;
        const emoji = document.getElementById('courseEmoji').value || '📚';

        const { error } = await supabaseClient.from('courses').insert([{ code, color, emoji, user_id: currentUser.id }]);
        if (!error) {
            document.getElementById('courseCode').value = '';
            document.getElementById('courseEmoji').value = '';
            loadDashboardCourses();
        } else {
            alert('Error adding course: ' + error.message);
        }
    });
}

// --- COURSE SETTINGS MODAL & ASSIGNMENTS ---
window.openCourseModal = (courseId) => {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    document.getElementById('modalCourseTitle').innerHTML = `<span>${course.emoji || '📚'}</span> ${course.code}`;
    document.getElementById('editCourseId').value = course.id;
    document.getElementById('editCourseEmoji').value = course.emoji || '📚';
    document.getElementById('editCourseCode').value = course.code;
    document.getElementById('editCourseColor').value = course.color;

    document.getElementById('courseModal').classList.remove('hidden');
    loadAssignments(course.id);
};

window.closeCourseModal = () => {
    document.getElementById('courseModal').classList.add('hidden');
};

// Update Course Data
const editCourseForm = document.getElementById('editCourseForm');
if (editCourseForm) {
    editCourseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editCourseId').value;
        const code = document.getElementById('editCourseCode').value;
        const color = document.getElementById('editCourseColor').value;
        const emoji = document.getElementById('editCourseEmoji').value;

        const { error } = await supabaseClient.from('courses').update({ code, color, emoji }).eq('id', id);
        if (!error) {
            closeCourseModal();
            loadDashboardCourses();
        }
    });
}

window.deleteCurrentCourse = async () => {
    const id = document.getElementById('editCourseId').value;
    if (confirm('Delete this course and ALL its assignments?')) {
        const { error } = await supabaseClient.from('courses').delete().eq('id', id);
        if (!error) {
            closeCourseModal();
            loadDashboardCourses();
        }
    }
};

// Load Assignments for Modal
async function loadAssignments(courseId) {
    const { data: assignments, error } = await supabaseClient
        .from('assignments')
        .select('*')
        .eq('course_id', courseId)
        .order('due_date', { ascending: true });

    const listEl = document.getElementById('assignmentList');
    listEl.innerHTML = '';

    if (error || !assignments.length) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 italic">No assignments yet.</p>';
        return;
    }

    assignments.forEach(assign => {
        const dateObj = new Date(assign.due_date + 'T12:00:00'); // Force local timezone interpretation
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        listEl.innerHTML += `
            <div class="flex items-center justify-between p-2 bg-white dark:bg-slate-700/50 rounded border border-slate-100 dark:border-slate-600 text-sm">
                <div class="flex flex-col">
                    <span class="font-semibold text-slate-700 dark:text-slate-200">${assign.title}</span>
                    <span class="text-xs text-indigo-500 font-medium">Due: ${dateStr}</span>
                </div>
                <button onclick="deleteAssignment('${assign.id}', '${courseId}')" class="text-red-400 hover:text-red-600 transition px-2">✕</button>
            </div>
        `;
    });
}

// Add New Assignment
const addAssignmentForm = document.getElementById('addAssignmentForm');
if (addAssignmentForm) {
    addAssignmentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const courseId = document.getElementById('editCourseId').value;
        const title = document.getElementById('assignTitle').value;
        const due_date = document.getElementById('assignDate').value;

        const { error } = await supabaseClient.from('assignments').insert([{ 
            course_id: courseId, 
            user_id: currentUser.id,
            title: title,
            due_date: due_date
        }]);

        if (!error) {
            document.getElementById('assignTitle').value = '';
            document.getElementById('assignDate').value = '';
            loadAssignments(courseId);
        }
    });
}

window.deleteAssignment = async (assignId, courseId) => {
    await supabaseClient.from('assignments').delete().eq('id', assignId);
    loadAssignments(courseId);
};

// --- CALENDAR LOGIC ---
function initCalendar() {
    if (calendarInstance) return;
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: []
    });
    calendarInstance.render();
}

async function loadCalendarCourses() {
    // Fetch courses to get colors
    const { data: courses } = await supabaseClient.from('courses').select('*');
    // Fetch all assignments
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    let calendarEvents = [];
    
    // Create map for easy color lookup
    const courseMap = {};
    courses.forEach(c => courseMap[c.id] = c);

    assignments.forEach(assign => {
        const course = courseMap[assign.course_id];
        if(!course) return;
        
        calendarEvents.push({
            title: `${course.emoji || '📚'} ${assign.title}`,
            start: assign.due_date,
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
