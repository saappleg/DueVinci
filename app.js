// Supabase Project API Keys
const SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let calendarInstance = null;
let localCourses = []; 

// --- THEME LOGIC ---
const moonIcon = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
const sunIcon = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;

function updateThemeIcon() {
    const iconEl = document.getElementById('themeIcon');
    if (!iconEl) return;
    if (document.documentElement.classList.contains('dark')) {
        iconEl.innerHTML = sunIcon;
    } else {
        iconEl.innerHTML = moonIcon;
    }
}

window.cycleTheme = () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
};

document.addEventListener('DOMContentLoaded', updateThemeIcon);

// --- CONFETTI LOGIC ---
function fireConfetti() {
    if (typeof confetti !== 'undefined') {
        confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6']
        });
    }
}

// --- POMODORO TIMER LOGIC ---
let timerInterval = null;
let timeLeft = 25 * 60; 
let isWorking = true; 

function updateTimerDisplay() {
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    const display = document.getElementById('timerDisplay');
    const circle = document.getElementById('timerProgress');
    
    if(display) display.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    
    if(circle) {
        const total = isWorking ? (25 * 60) : (5 * 60);
        const percent = ((total - timeLeft) / total) * 301.59; 
        circle.style.strokeDashoffset = percent;
    }
}

window.toggleTimer = () => {
    const btn = document.getElementById('timerPlayBtn');
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    } else {
        btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                skipTimer(); 
            }
        }, 1000);
    }
};

window.resetTimer = () => {
    timeLeft = isWorking ? (25 * 60) : (5 * 60);
    updateTimerDisplay();
};

window.skipTimer = () => {
    isWorking = !isWorking;
    document.getElementById('timerLabel').innerText = isWorking ? "Focus" : "Break";
    timeLeft = isWorking ? (25 * 60) : (5 * 60);
    updateTimerDisplay();
    if(timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        window.toggleTimer();
    }
};

// --- AUTH & ROUTING LOGIC ---
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
        
        const currentPath = window.location.pathname;
        const isIndex = currentPath.endsWith('index.html') || currentPath.endsWith('/') || currentPath.includes('DueVinci');
        const isCourses = currentPath.endsWith('courses.html');
        const isCalendar = currentPath.endsWith('calendar.html');

        if (isIndex && document.getElementById('dashboardGrid')) loadDashboardStats();
        if (isCourses && document.getElementById('coursesGrid')) loadCoursesPage();
        if (isCalendar && document.getElementById('calendar')) loadCalendarCourses();

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

// --- DASHBOARD (index.html) LOGIC ---
async function loadDashboardStats() {
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*').order('due_date', { ascending: true });

    if (!courses || !assignments) return;

    // Populating Up Next
    const upNextListEl = document.getElementById('upNextList');
    if (upNextListEl) {
        upNextListEl.innerHTML = '';
        const upcoming = assignments.filter(a => !a.is_completed).slice(0, 5);

        if (upcoming.length === 0) {
            upNextListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">No upcoming assignments. You\'re all caught up!</p>';
        } else {
            upcoming.forEach(assign => {
                const course = courses.find(c => c.id === assign.course_id);
                if (!course) return;
                const dateObj = new Date(assign.due_date + 'T12:00:00'); 
                const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                upNextListEl.innerHTML += `
                    <div class="flex items-center gap-3 p-3 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700">
                        <button onclick="toggleAssignment('${assign.id}', false, null)" class="w-5 h-5 rounded border border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-brand-700 transition flex items-center justify-center text-transparent hover:text-indigo-500 shrink-0">
                            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                        </button>
                        <div>
                            <p class="text-sm font-bold text-zinc-800 dark:text-zinc-200">${course.emoji} ${assign.title}</p>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">${course.code} • Due: ${dateStr}</p>
                        </div>
                    </div>
                `;
            });
        }
    }

    // Populating Goals
    const goalsListEl = document.getElementById('goalsList');
    if (goalsListEl) {
        goalsListEl.innerHTML = '';
        if(courses.length === 0) {
            goalsListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">Add classes to start tracking your progress.</p>';
        } else {
            courses.forEach(course => {
                const courseAssignments = assignments.filter(a => a.course_id === course.id);
                const completedCount = courseAssignments.filter(a => a.is_completed).length;
                let percent = 0;
                
                if (course.is_completed) {
                    percent = 100;
                } else if (courseAssignments.length > 0) {
                    percent = Math.round((completedCount / courseAssignments.length) * 100);
                }

                goalsListEl.innerHTML += `
                    <div>
                        <div class="flex justify-between text-sm mb-2">
                            <span class="font-bold text-zinc-700 dark:text-zinc-300">${course.emoji} ${course.code}</span>
                            <span class="font-bold" style="color: ${course.color}">${percent}%</span>
                        </div>
                        <div class="w-full bg-zinc-200 dark:bg-brand-700 rounded-full h-2.5 overflow-hidden">
                            <div class="h-2.5 rounded-full transition-all duration-500" style="width: ${percent}%; background-color: ${course.color}"></div>
                        </div>
                    </div>
                `;
            });
        }
    }
}

// --- COURSES PAGE (courses.html) LOGIC ---
async function loadCoursesPage() {
    const { data: courses, error } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
    if (error) return console.error('Error loading courses:', error);

    localCourses = courses; 
    const courseListEl = document.getElementById('courseList');
    if (!courseListEl) return;
    courseListEl.innerHTML = '';

    courses.forEach(course => {
        const emoji = course.emoji || '📚';
        const opacityStyle = course.is_completed ? 'opacity-50' : '';
        const checkIcon = course.is_completed ? `<span class="text-indigo-500 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1 rounded">✔ Completed</span>` : '';

        courseListEl.innerHTML += `
            <div onclick="openCourseModal('${course.id}')" class="cursor-pointer group bg-white dark:bg-brand-800 p-4 rounded-xl border border-zinc-200 dark:border-brand-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition shadow-sm flex flex-col justify-between ${opacityStyle} min-h-[100px]">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style="background-color: ${course.color}20; color: ${course.color}; border: 1px solid ${course.color}40;">
                        ${emoji}
                    </div>
                    <div>
                        <h4 class="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${course.code}</h4>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400">View assignments &rarr;</p>
                    </div>
                </div>
                <div class="mt-3 flex justify-end">
                    ${checkIcon}
                </div>
            </div>
        `;
    });
}

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
            loadCoursesPage();
        }
    });
}

// --- COURSE MODAL & COMPLETION LOGIC ---
window.openCourseModal = (courseId) => {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    document.getElementById('modalCourseTitle').innerHTML = `<span>${course.emoji || '📚'}</span> ${course.code}`;
    document.getElementById('editCourseId').value = course.id;
    document.getElementById('editCourseEmoji').value = course.emoji || '📚';
    document.getElementById('editCourseCode').value = course.code;
    document.getElementById('editCourseColor').value = course.color;

    const completeBtn = document.getElementById('markCourseCompleteBtn');
    if (completeBtn) {
        completeBtn.onclick = () => toggleCourseComplete(course.id, course.is_completed);
        completeBtn.innerText = course.is_completed ? "Undo Completion" : "✔ Mark Complete";
        completeBtn.className = course.is_completed 
            ? "text-xs bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-brand-700 dark:text-zinc-400 px-3 py-1.5 rounded font-bold transition"
            : "text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded font-bold transition";
    }

    document.getElementById('courseModal').classList.remove('hidden');
    loadAssignments(course.id);
};

window.closeCourseModal = () => {
    document.getElementById('courseModal').classList.add('hidden');
};

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
            loadCoursesPage();
        }
    });
}

window.deleteCurrentCourse = async () => {
    const id = document.getElementById('editCourseId').value;
    if (confirm('Delete this course and ALL its assignments?')) {
        const { error } = await supabaseClient.from('courses').delete().eq('id', id);
        if (!error) {
            closeCourseModal();
            loadCoursesPage();
        }
    }
};

window.toggleCourseComplete = async (courseId, currentState) => {
    await supabaseClient.from('courses').update({ is_completed: !currentState }).eq('id', courseId);
    if (!currentState) fireConfetti(); // Confetti on completion!
    closeCourseModal();
    loadCoursesPage();
};

window.toggleAssignment = async (assignId, currentState, courseId) => {
    await supabaseClient.from('assignments').update({ is_completed: !currentState }).eq('id', assignId);
    if (!currentState) fireConfetti(); 

    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) {
        loadDashboardStats();
    } else if (courseId) {
        loadAssignments(courseId);
    }
};

async function loadAssignments(courseId) {
    const { data: assignments, error } = await supabaseClient
        .from('assignments')
        .select('*')
        .eq('course_id', courseId)
        .order('due_date', { ascending: true });

    const listEl = document.getElementById('assignmentList');
    listEl.innerHTML = '';

    if (error || !assignments.length) {
        listEl.innerHTML = '<div class="p-4 border border-dashed border-zinc-300 dark:border-brand-600 rounded-lg text-center"><p class="text-sm text-zinc-500 dark:text-zinc-400">No assignments yet.</p></div>';
        return;
    }

    assignments.forEach(assign => {
        const dateObj = new Date(assign.due_date + 'T12:00:00'); 
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const checkedClass = assign.is_completed 
            ? "bg-indigo-500 text-white border-indigo-500" 
            : "text-transparent border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:text-indigo-500";
        
        const titleStyle = assign.is_completed ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200";

        listEl.innerHTML += `
            <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-sm">
                <div class="flex items-center gap-3">
                    <button type="button" onclick="toggleAssignment('${assign.id}', ${assign.is_completed}, '${courseId}')" class="w-5 h-5 rounded border transition flex items-center justify-center shrink-0 ${checkedClass}">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                    </button>
                    <div class="flex flex-col">
                        <span class="font-bold transition-all ${titleStyle}">${assign.title}</span>
                        <span class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Due: ${dateStr}</span>
                    </div>
                </div>
                <button type="button" onclick="deleteAssignment('${assign.id}', '${courseId}')" class="text-zinc-400 hover:text-red-500 transition px-2">✕</button>
            </div>
        `;
    });
}

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
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    let calendarEvents = [];
    const courseMap = {};
    courses.forEach(c => courseMap[c.id] = c);

    assignments.forEach(assign => {
        const course = courseMap[assign.course_id];
        if(!course) return;
        
        calendarEvents.push({
            title: `${course.emoji || '📚'} ${assign.title}`,
            start: assign.due_date,
            color: assign.is_completed ? '#9ca3af' : course.color // Grey out on calendar if done
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
