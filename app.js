// Supabase Project API Keys
const SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let calendarInstance = null;
let localCourses = [];

// --- THEME LOGIC ---
window.changeTheme = (themeValue) => {
    localStorage.setItem('theme', themeValue);
    if (themeValue === 'dark' || (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

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
let focusMinutes = parseInt(localStorage.getItem('focusMinutes')) || 25;
let breakMinutes = parseInt(localStorage.getItem('breakMinutes')) || 5;
let timeLeft = focusMinutes * 60;
let isWorking = true;

function updateTimerDisplay() {
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    const display = document.getElementById('timerDisplay');
    const circle = document.getElementById('timerProgress');

    if(display) display.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    if(circle) {
        const total = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
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
    timeLeft = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
    updateTimerDisplay();
};

window.skipTimer = () => {
    isWorking = !isWorking;
    document.getElementById('timerLabel').innerText = isWorking ? "Focus" : "Break";
    timeLeft = isWorking ? (focusMinutes * 60) : (breakMinutes * 60);
    updateTimerDisplay();
    
    if(timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        window.toggleTimer();
    }
};

window.toggleTimerSettings = () => {
    const form = document.getElementById('timerSettingsForm');
    document.getElementById('focusMinInput').value = focusMinutes;
    document.getElementById('breakMinInput').value = breakMinutes;
    form.classList.toggle('hidden');
};

window.saveTimerSettings = () => {
    focusMinutes = parseInt(document.getElementById('focusMinInput').value) || 25;
    breakMinutes = parseInt(document.getElementById('breakMinInput').value) || 5;
    localStorage.setItem('focusMinutes', focusMinutes);
    localStorage.setItem('breakMinutes', breakMinutes);
    document.getElementById('timerSettingsForm').classList.add('hidden');
    resetTimer();
};

let timerCollapsed = localStorage.getItem('timerCollapsed') === 'true';

function applyTimerCollapse() {
    const content = document.getElementById('timerContent');
    const icon = document.getElementById('timerCollapseIcon');
    if (!content || !icon) return;

    if(timerCollapsed) {
        content.classList.add('hidden');
        icon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
    } else {
        content.classList.remove('hidden');
        icon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
    }
}

window.toggleTimerCollapse = () => {
    timerCollapsed = !timerCollapsed;
    localStorage.setItem('timerCollapsed', timerCollapsed);
    applyTimerCollapse();
};

document.addEventListener('DOMContentLoaded', () => {
    applyTimerCollapse();
    updateTimerDisplay();
});

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
        
        const path = window.location.pathname;
        if ((path.endsWith('index.html') || path.endsWith('/')) && document.getElementById('dashboardGrid')) loadDashboardStats();
        if (path.endsWith('courses.html') && document.getElementById('coursesGrid')) loadCoursesPage();
        if (path.endsWith('calendar.html') && document.getElementById('calendar')) {
            initCalendar();
            loadCalendarCourses();
        }
    } else {
        currentUser = null;
        const path = window.location.pathname;
        if (!path.endsWith('index.html') && !path.endsWith('/') && !path.includes('DueVinci')) {
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

// --- MODULAR SETTINGS POPUP LOGIC ---
window.openSettingsModal = () => {
    if(currentUser) document.getElementById('profileEmail').value = currentUser.email;
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = localStorage.getItem('theme') || 'system';
    document.getElementById('settingsModal').classList.remove('hidden');
};

window.closeSettingsModal = () => {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('settingsMsg').classList.add('hidden');
};

window.switchSettingsTab = (tabName) => {
    document.getElementById('content-profile').classList.add('hidden');
    document.getElementById('content-appearance').classList.add('hidden');
    
    document.getElementById('tab-profile').className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    document.getElementById('tab-appearance').className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).className = "w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition";
};

const settingsForm = document.getElementById('settingsForm');
if(settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('profileEmail').value;
        const password = document.getElementById('profilePassword').value;
        const msgEl = document.getElementById('settingsMsg');
        
        let updates = {};
        if(email && email !== currentUser.email) updates.email = email;
        if(password) updates.password = password;
        
        if(Object.keys(updates).length === 0) {
            msgEl.textContent = "No changes made.";
            msgEl.className = "text-xs text-center mt-2 text-zinc-500";
            msgEl.classList.add('hidden');
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
}

// --- DASHBOARD LOGIC ---
async function loadDashboardStats() {
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*').order('due_date', { ascending: true });
    
    if (!courses || !assignments) return;

    const upNextListEl = document.getElementById('upNextList');
    if (upNextListEl) {
        upNextListEl.innerHTML = '';
        // Includes both units and individual lessons on the home screen
        const upcoming = assignments.filter(a => !a.is_completed).slice(0, 5);
        if (upcoming.length === 0) {
            upNextListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">No upcoming weekly items. You\'re all caught up!</p>';
        } else {
            upcoming.forEach(assign => {
                const course = courses.find(c => c.id === assign.course_id);
                if (!course) return;
                
                const dateStr = new Date(assign.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
                
                upNextListEl.innerHTML += `
                    <div class="flex items-center gap-3 p-3 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700">
                        <button onclick="toggleAssignment('${assign.id}', false, null)" class="w-5 h-5 rounded border border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-brand-700 transition flex items-center justify-center text-transparent hover:text-indigo-500 shrink-0"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>
                        <div>
                            <p class="text-sm font-bold text-zinc-800 dark:text-zinc-200">${course.emoji} ${unitBadge}${assign.title}</p>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">${course.code} • Target: ${dateStr}</p>
                        </div>
                    </div>`;
            });
        }
    }

    const goalsListEl = document.getElementById('goalsList');
    if (goalsListEl) {
        goalsListEl.innerHTML = '';
        if(courses.length === 0) goalsListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">Add classes to start tracking weekly progress.</p>';
        else {
            courses.forEach(course => {
                const cAssign = assignments.filter(a => a.course_id === course.id);
                const complete = cAssign.filter(a => a.is_completed).length;
                let pct = course.is_completed ? 100 : (cAssign.length ? Math.round((complete/cAssign.length)*100) : 0);
                
                goalsListEl.innerHTML += `
                    <div>
                        <div class="flex justify-between text-sm mb-2"><span class="font-bold text-zinc-700 dark:text-zinc-300">${course.emoji} ${course.code}</span><span class="font-bold" style="color: ${course.color}">${pct}%</span></div>
                        <div class="w-full bg-zinc-200 dark:bg-brand-700 rounded-full h-2.5 overflow-hidden"><div class="h-2.5 rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${course.color}"></div></div>
                    </div>`;
            });
        }
    }
}

// --- COURSES PAGE & METADATA / SCREENSHOT PARSERS ---
async function loadCoursesPage() {
    const { data: courses } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
    localCourses = courses;
    
    const listEl = document.getElementById('courseList');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    courses.forEach(course => {
        const emoji = course.emoji || '📚';
        const opacity = course.is_completed ? 'opacity-50' : '';
        const checkIcon = course.is_completed ? `<span class="text-indigo-500 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1 rounded">✔ Completed</span>` : '';
        
        listEl.innerHTML += `
            <div onclick="openCourseModal('${course.id}')" class="cursor-pointer group bg-white dark:bg-brand-800 p-4 rounded-xl border border-zinc-200 dark:border-brand-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition shadow-sm flex flex-col justify-between ${opacity} min-h-[100px]">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style="background-color: ${course.color}20; color: ${course.color}; border: 1px solid ${course.color}40;">${emoji}</div>
                    <div><h4 class="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${course.code}</h4><p class="text-xs text-zinc-500 dark:text-zinc-400">View weekly coursework &rarr;</p></div>
                </div>
                <div class="mt-3 flex justify-end">${checkIcon}</div>
            </div>`;
    });
}

const cForm = document.getElementById('courseForm');
if (cForm) {
    cForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('courseCode').value;
        const color = document.getElementById('courseColor').value;
        const emoji = document.getElementById('courseEmoji').value || '📚';
        
        const { error } = await supabaseClient.from('courses').insert([{ code, color, emoji, user_id: currentUser.id }]);
        if (!error) {
            document.getElementById('courseCode').value = '';
            loadCoursesPage();
        }
    });
}

window.openCourseModal = (courseId) => {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;
    
    document.getElementById('modalCourseTitle').innerHTML = `<span>${course.emoji || '📚'}</span> ${course.code}`;
    document.getElementById('editCourseId').value = course.id;
    document.getElementById('editCourseEmoji').value = course.emoji || '📚';
    document.getElementById('editCourseCode').value = course.code;
    document.getElementById('editCourseColor').value = course.color;
    
    const metaBox = document.getElementById('courseMetadataBox');
    if(metaBox) {
        let metaHtml = '';
        if (course.description) metaHtml += `<p class="text-xs text-zinc-600 dark:text-zinc-400 mb-1.5"><strong>Description:</strong> ${course.description}</p>`;
        if (course.objectives) metaHtml += `<p class="text-xs text-zinc-600 dark:text-zinc-400"><strong>Objectives:</strong> ${course.objectives}</p>`;
        metaBox.innerHTML = metaHtml ? `<div class="mt-3 bg-zinc-100 dark:bg-brand-900 p-3 rounded-lg border border-zinc-200 dark:border-brand-700">${metaHtml}</div>` : '';
    }

    const btn = document.getElementById('markCourseCompleteBtn');
    if (btn) {
        btn.onclick = () => toggleCourseComplete(course.id, course.is_completed);
        btn.innerText = course.is_completed ? "↺ Undo Completion" : "✔ Mark Complete";
        btn.className = course.is_completed ? "text-xs bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-brand-700 dark:text-zinc-400 px-3 py-1.5 rounded font-bold transition" : "text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded font-bold transition";
    }

    document.getElementById('pdfStatusMsg').classList.add('hidden');
    document.getElementById('syllabusFile').value = '';
    
    document.getElementById('courseModal').classList.remove('hidden');
    loadAssignments(course.id);
};

window.closeCourseModal = () => document.getElementById('courseModal').classList.add('hidden');


// --- 1. EDGE FUNCTION SYLLABUS PARSER ---
window.parseSyllabusPDF = async () => {
    const fileInput = document.getElementById('syllabusFile');
    const statusMsg = document.getElementById('pdfStatusMsg');
    const courseId = document.getElementById('editCourseId').value;

    if (!fileInput.files || fileInput.files.length === 0) {
        statusMsg.textContent = "Please select a PDF file first.";
        statusMsg.className = "text-xs text-center mt-2 text-red-500";
        statusMsg.classList.remove('hidden');
        return;
    }

    const file = fileInput.files[0];
    statusMsg.textContent = "AI is extracting description & objectives securely...";
    statusMsg.className = "text-xs text-center mt-2 text-indigo-500";
    statusMsg.classList.remove('hidden');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(" ") + " ";
        }

        const { data: responseData, error: functionError } = await supabaseClient.functions.invoke('gemini-parser', {
            body: { type: 'syllabus', text: fullText }
        });

        if (functionError) throw new Error(functionError.message);

        const rawResponse = responseData.result;
        const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson);

        let updates = {};
        if (parsedData.description) updates.description = parsedData.description;
        if (parsedData.objectives) updates.objectives = parsedData.objectives;

        if (Object.keys(updates).length > 0) {
            await supabaseClient.from('courses').update(updates).eq('id', courseId);
        }

        let baseDate = new Date();

        if (parsedData.units && parsedData.units.length > 0) {
            parsedData.units.sort((a, b) => {
                if (!a.dateStr || !b.dateStr) return 0;
                return new Date(a.dateStr) - new Date(b.dateStr);
            });

            for (let i = 0; i < parsedData.units.length; i++) {
                let u = parsedData.units[i];
                let targetDate = u.dateStr ? new Date(u.dateStr) : new Date(baseDate);
                if (!u.dateStr) {
                    targetDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                }

                const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                    course_id: courseId, user_id: currentUser.id,
                    title: `Unit ${u.num || i + 1}: ${u.title}`,
                    unit_number: u.num || i + 1,
                    due_date: targetDate.toISOString().split('T')[0]
                }]).select();

                if (insertedUnit && insertedUnit[0] && u.lessons) {
                    let lessonNum = 1;
                    for (let lessonTitle of u.lessons) {
                        let formattedTitle = lessonTitle.toLowerCase().startsWith('lesson') ? lessonTitle : `Lesson ${lessonNum}: ${lessonTitle}`;
                        
                        await supabaseClient.from('assignments').insert([{
                            course_id: courseId, user_id: currentUser.id,
                            title: `↳ ${formattedTitle}`,
                            due_date: targetDate.toISOString().split('T')[0]
                        }]);
                        lessonNum++;
                    }
                }
            }
        }

        statusMsg.textContent = "Successfully imported curriculum via secure Edge Function!";
        statusMsg.className = "text-xs text-center mt-2 text-green-500";
        openCourseModal(courseId);
        loadCoursesPage();
        loadAssignments(courseId);

    } catch (err) {
        console.error(err);
        statusMsg.textContent = "Error parsing file or contacting Edge Function.";
        statusMsg.className = "text-xs text-center mt-2 text-red-500";
    }
};

// --- 2. EDGE FUNCTION SCREENSHOT PARSER ---
window.parseLessonsImage = async (inputElement) => {
    const statusMsg = document.getElementById('pdfStatusMsg');
    const courseId = document.getElementById('editCourseId').value;

    if (!inputElement.files || inputElement.files.length === 0) return;

    const file = inputElement.files[0];
    statusMsg.textContent = "AI is securely reading lessons and dates...";
    statusMsg.className = "text-xs text-center mt-2 text-emerald-500";
    statusMsg.classList.remove('hidden');

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onloadend = async () => {
        const base64Image = reader.result.split(',')[1];
        const mimeType = file.type;

        try {
            const { data: responseData, error: functionError } = await supabaseClient.functions.invoke('gemini-parser', {
                body: { type: 'screenshot', imageBase64: base64Image, mimeType: mimeType }
            });

            if (functionError) throw new Error(functionError.message);

            const rawResponse = responseData.result;
            const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanJson);

            let baseDate = new Date();

            if (parsedData.units && parsedData.units.length > 0) {
                parsedData.units.sort((a, b) => {
                    if (!a.dateStr || !b.dateStr) return 0;
                    return new Date(a.dateStr) - new Date(b.dateStr);
                });

                for (let i = 0; i < parsedData.units.length; i++) {
                    let wk = parsedData.units[i];
                    
                    let targetDate = wk.dateStr ? new Date(wk.dateStr) : new Date(baseDate);
                    if (!wk.dateStr) {
                        targetDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                    }

                    const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                        course_id: courseId, user_id: currentUser.id,
                        title: wk.title || `Week ${wk.num}`,
                        unit_number: wk.num,
                        due_date: targetDate.toISOString().split('T')[0]
                    }]).select();

                    if (insertedUnit && insertedUnit[0] && wk.lessons) {
                        let lessonNum = 1;
                        for (let l of wk.lessons) {
                            let formattedTitle = l.toLowerCase().startsWith('lesson') ? l : `Lesson ${lessonNum}: ${l}`;
                            
                            await supabaseClient.from('assignments').insert([{
                                course_id: courseId, user_id: currentUser.id,
                                title: `↳ ${formattedTitle}`,
                                due_date: targetDate.toISOString().split('T')[0]
                            }]);
                            lessonNum++;
                        }
                    }
                }
            }

            statusMsg.textContent = "Successfully imported lessons via secure Edge Function!";
            statusMsg.className = "text-xs text-center mt-2 text-green-500";
            loadAssignments(courseId);

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error scanning image with Edge Function.";
            statusMsg.className = "text-xs text-center mt-2 text-red-500";
        }
    };
};

const eForm = document.getElementById('editCourseForm');
if (eForm) {
    eForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editCourseId').value;
        const code = document.getElementById('editCourseCode').value;
        const color = document.getElementById('editCourseColor').value;
        const emoji = document.getElementById('editCourseEmoji').value;
        
        await supabaseClient.from('courses').update({ code, color, emoji }).eq('id', id);
        closeCourseModal();
        loadCoursesPage();
    });
}

window.deleteCurrentCourse = async () => {
    if (confirm('Delete this course and ALL its coursework?')) {
        await supabaseClient.from('courses').delete().eq('id', document.getElementById('editCourseId').value);
        closeCourseModal();
        loadCoursesPage();
    }
};

window.toggleCourseComplete = async (courseId, currentState) => {
    await supabaseClient.from('courses').update({ is_completed: !currentState }).eq('id', courseId);
    if (!currentState) fireConfetti();
    closeCourseModal();
    loadCoursesPage();
};

window.toggleAssignment = async (assignId, currentState, courseId) => {
    await supabaseClient.from('assignments').update({ is_completed: !currentState }).eq('id', assignId);
    if (!currentState) fireConfetti();
    
    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) loadDashboardStats();
    else if (courseId) loadAssignments(courseId);
};

window.updateAssignmentDate = async (assignId, newDate, courseId) => {
    if(!newDate) return;
    await supabaseClient.from('assignments').update({ due_date: newDate }).eq('id', assignId);
    loadAssignments(courseId);
};

window.addSubItem = async (parentId, courseId) => {
    const inputEl = document.getElementById(`subInput-${parentId}`);
    const title = inputEl ? inputEl.value.trim() : "";
    if(!title) return;
    
    await supabaseClient.from('assignments').insert([{
        course_id: courseId, user_id: currentUser.id,
        title: `↳ ${title}`, due_date: document.getElementById(`date-${parentId}`).value || new Date().toISOString().split('T')[0]
    }]);
    loadAssignments(courseId);
};

async function loadAssignments(courseId) {
    const { data: assignments } = await supabaseClient.from('assignments').select('*').eq('course_id', courseId);
    
    const listEl = document.getElementById('assignmentList');
    listEl.innerHTML = '';
    
    if (!assignments || !assignments.length) {
        listEl.innerHTML = '<div class="p-4 border border-dashed border-zinc-300 dark:border-brand-600 rounded-lg text-center"><p class="text-sm text-zinc-500 dark:text-zinc-400">No coursework added yet.</p></div>';
        return;
    }
    
    // Strict numeric and chronological sorting (fixes Lesson 10 sorting above Lesson 9)
    assignments.sort((a, b) => {
        let unitA = a.unit_number || 0;
        let unitB = b.unit_number || 0;
        if (unitA !== unitB) return unitA - unitB;
        
        let isSubA = a.title.startsWith('↳');
        let isSubB = b.title.startsWith('↳');
        if (isSubA !== isSubB) return isSubA ? 1 : -1;
        
        if (isSubA && isSubB) {
            let numA = parseInt(a.title.replace(/[^0-9]/g, '')) || 0;
            let numB = parseInt(b.title.replace(/[^0-9]/g, '')) || 0;
            if (numA !== numB) return numA - numB;
        }
        
        return new Date(a.due_date) - new Date(b.due_date);
    });
    
    assignments.forEach(assign => {
        const isSubItem = assign.title.startsWith('↳');
        const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
        
        const cClass = assign.is_completed ? "bg-indigo-500 text-white border-indigo-500" : "text-transparent border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:text-indigo-500";
        const tClass = assign.is_completed ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200";
        
        let subItemForm = '';
        if (!isSubItem && assign.unit_number) {
            subItemForm = `
                <div class="mt-2 pl-8 flex gap-2">
                    <input type="date" id="date-${assign.id}" value="${assign.due_date}" class="hidden">
                    <input type="text" id="subInput-${assign.id}" placeholder="Add lesson or review..." class="flex-1 border border-zinc-200 dark:border-brand-700 dark:bg-brand-900 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500">
                    <button type="button" onclick="addSubItem('${assign.id}', '${courseId}')" class="bg-indigo-600 text-white px-2.5 py-1 rounded text-xs font-bold hover:bg-indigo-500 transition">+ Lesson</button>
                </div>`;
        }
        
        listEl.innerHTML += `
            <div class="p-3 bg-zinc-50 dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-sm">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <button type="button" onclick="toggleAssignment('${assign.id}', ${assign.is_completed}, '${courseId}')" class="w-5 h-5 rounded border transition flex items-center justify-center shrink-0 ${cClass}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="font-bold transition-all truncate ${tClass}">${unitBadge}${assign.title}</span>
                            <input type="date" value="${assign.due_date}" onchange="updateAssignmentDate('${assign.id}', this.value, '${courseId}')" class="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border border-transparent hover:border-zinc-300 dark:hover:border-brand-600 rounded px-1 py-0.5 mt-0.5 w-32 cursor-pointer focus:outline-none focus:border-indigo-500" title="Click to update target week date">
                        </div>
                    </div>
                    <button type="button" onclick="deleteAssignment('${assign.id}', '${courseId}')" class="text-zinc-400 hover:text-red-500 transition px-2 shrink-0">✕</button>
                </div>
                ${subItemForm}
            </div>`;
    });
}

const aForm = document.getElementById('addAssignmentForm');
if (aForm) {
    aForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const courseId = document.getElementById('editCourseId').value;
        const unitNum = document.getElementById('assignUnit').value ? parseInt(document.getElementById('assignUnit').value) : null;
        
        await supabaseClient.from('assignments').insert([{
            course_id: courseId, user_id: currentUser.id,
            title: document.getElementById('assignTitle').value,
            unit_number: unitNum,
            due_date: document.getElementById('assignDate').value
        }]);
        
        document.getElementById('assignTitle').value = '';
        document.getElementById('assignUnit').value = '';
        document.getElementById('assignDate').value = '';
        loadAssignments(courseId);
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
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        events: [],
        eventClick: function(info) {
            if (info.event.extendedProps.isCustom) {
                if(confirm(`Delete custom event "${info.event.title}"?`)) {
                    deleteCustomEvent(info.event.extendedProps.eventId);
                }
            }
        }
    });
    calendarInstance.render();
}

async function loadCalendarCourses() {
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    const { data: customEvents } = await supabaseClient.from('custom_events').select('*');
    
    let calendarEvents = [];
    const courseMap = {};
    if(courses) courses.forEach(c => courseMap[c.id] = c);
    
    if(assignments) assignments.forEach(assign => {
        const course = courseMap[assign.course_id];
        if(!course) return;
        const prefix = assign.unit_number ? `[Wk ${assign.unit_number}] ` : '';
        
        calendarEvents.push({
            title: `${course.emoji || '📚'} ${prefix}${assign.title}`,
            start: assign.due_date,
            color: assign.is_completed ? '#9ca3af' : course.color
        });
    });
    
    if(customEvents) customEvents.forEach(ev => {
        calendarEvents.push({
            title: ev.title,
            start: ev.event_date,
            color: ev.color,
            extendedProps: { isCustom: true, eventId: ev.id }
        });
    });
    
    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(calendarEvents);
    }
}

window.openEventModal = () => document.getElementById('eventModal').classList.remove('hidden');
window.closeEventModal = () => document.getElementById('eventModal').classList.add('hidden');

const customEventForm = document.getElementById('customEventForm');
if(customEventForm) {
    customEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('evTitle').value;
        const date = document.getElementById('evDate').value;
        const color = document.getElementById('evColor').value;
        
        await supabaseClient.from('custom_events').insert([{
            user_id: currentUser.id, title: title, event_date: date, color: color
        }]);
        
        document.getElementById('evTitle').value = '';
        closeEventModal();
        loadCalendarCourses();
    });
}

window.deleteCustomEvent = async (id) => {
    await supabaseClient.from('custom_events').delete().eq('id', id);
    loadCalendarCourses();
};

window.exportToICS = () => {
    if(!calendarInstance) return;
    
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DueVinci//Student Planner//EN\n";
    
    calendarInstance.getEvents().forEach(ev => {
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

checkUser();
