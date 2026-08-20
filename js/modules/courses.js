// --- COURSES, UNITS, ASSIGNMENTS & SYLLABUS AI PARSER MODULE ---
import { supabaseClient } from './config.js';
import { currentUser } from './auth.js';
import { smartParseDate, parseInputDate, fireConfetti, getCurrentPageName } from './utils.js';

export let localCourses = [];
export let customTerms = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('duevinci_terms'))) || ['Fall 2026', 'Spring 2027'];
export let hideUnassignedFolder = typeof localStorage !== 'undefined' && localStorage.getItem('hideUnassigned') === 'true';
export let currentAssignmentPage = 1;
export let activeTermModalName = '';

export async function loadDashboardStats() {
    if (typeof document === 'undefined') return;
    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    const getUnitNum = (item) => {
        if (item.unit_number) return parseInt(item.unit_number) || 0;
        const match = item.title.match(/(?:unit|wk|week)\s*([0-9]+)/i);
        if (match) return parseInt(match[1]) || 0;
        return 0;
    };

    const getLessonNum = (item) => {
        const match = item.title.match(/lesson\s*([0-9]+)/i);
        if (match) return parseInt(match[1]) || 0;
        const numMatch = item.title.replace(/[^0-9]/g, '');
        return numMatch ? parseInt(numMatch) : 999;
    };

    assignments.sort((a, b) => {
        let unitA = getUnitNum(a);
        let unitB = getUnitNum(b);
        if (unitA !== unitB) return unitA - unitB;

        let isSubA = a.title.startsWith('↳');
        let isSubB = b.title.startsWith('↳');

        if (!isSubA && isSubB) return -1;
        if (isSubA && !isSubB) return 1;

        if (isSubA && isSubB) {
            let lessonA = getLessonNum(a);
            let lessonB = getLessonNum(b);
            if (lessonA !== lessonB) return lessonA - lessonB;
        }

        return new Date(a.due_date) - new Date(b.due_date);
    });

    const upNextListEl = document.getElementById('upNextList');
    if (upNextListEl) {
        upNextListEl.className = "max-h-[320px] overflow-y-auto space-y-2 pr-1";
        upNextListEl.innerHTML = '';
        const currentFilter = window.activePriorityFilter || 'all';

        let upcoming = assignments.filter(a => !a.is_completed && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
        
        if (currentFilter !== 'all') {
            upcoming = upcoming.filter(a => (a.priority || 'medium') === currentFilter);
        }

        if (upcoming.length === 0) {
            upNextListEl.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400 py-3 text-center">No matching upcoming lessons. You\'re all caught up! 🎉</p>';
        } else {
            upcoming.forEach(assign => {
                const course = courses.find(c => c.id === assign.course_id);
                if (!course) return;
                const formattedDate = window.formatDate ? window.formatDate(assign.due_date) : assign.due_date;
                const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
                
                const priority = assign.priority || 'medium';
                let priorityBadge = '';
                if (priority === 'high') {
                    priorityBadge = `<span class="text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1.5 py-0.5 rounded font-bold">🔥 Urgent</span>`;
                } else if (priority === 'low') {
                    priorityBadge = `<span class="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">🌱 Low</span>`;
                }

                upNextListEl.innerHTML += `
                    <div class="flex items-center justify-between p-3 bg-white dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 hover:border-indigo-500/40 transition">
                        <div class="flex items-center gap-3 min-w-0">
                            <button onclick="toggleAssignment('${assign.id}', false, null)" class="w-5 h-5 rounded border border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-brand-700 transition flex items-center justify-center text-transparent hover:text-indigo-500 shrink-0"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>
                            <div class="truncate">
                                <p class="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">${course.emoji} ${unitBadge}${assign.title}</p>
                                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">${course.code} • Target: ${formattedDate}</p>
                            </div>
                        </div>
                        <div class="shrink-0 ml-2">
                            ${priorityBadge}
                        </div>
                    </div>`;
            });
        }
    }

    const goalsListEl = document.getElementById('goalsList');
    if (goalsListEl) {
        goalsListEl.innerHTML = '';
        courses.forEach(course => {
            const cAssign = assignments.filter(a => a.course_id === course.id && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
            const complete = cAssign.filter(a => a.is_completed).length;
            let pct = course.is_completed ? 100 : (cAssign.length ? Math.round((complete/cAssign.length)*100) : 0);

            const runnerPos = Math.min(Math.max(pct, 0), 94);
            const isWinner = pct === 100;

            goalsListEl.innerHTML += `
                <div class="space-y-1.5">
                    <div class="flex justify-between text-sm items-center">
                        <span class="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                            <span>${course.emoji}</span> ${course.code}
                        </span>
                        <span class="font-extrabold text-xs flex items-center gap-1" style="color: ${course.color}">
                            ${isWinner ? '<span class="animate-bounce">🏆</span>' : ''} ${pct}%
                        </span>
                    </div>
                    <div class="relative w-full bg-zinc-200 dark:bg-brand-700 rounded-full h-3.5 overflow-visible my-1 flex items-center">
                        <div class="h-3.5 rounded-full transition-all duration-700 shadow-sm" style="width: ${pct}%; background-color: ${course.color}"></div>
                        <div onclick="celebrateRunner(this, ${pct})" class="absolute top-1/2 -translate-y-1/2 transition-all duration-700 cursor-pointer select-none text-sm hover:scale-135 drop-shadow-sm z-10" style="left: calc(${runnerPos}% - 7px);" title="${isWinner ? 'Goal completed! Winner! 🏆 (Click to celebrate)' : 'Keep pushing! 🏃‍♂️ (Click me!)'}">
                            ${isWinner ? '🥇' : '🏃‍♂️'}
                        </div>
                        <div class="absolute right-0.5 top-1/2 -translate-y-1/2 text-xs select-none pointer-events-none opacity-85">
                            🏁
                        </div>
                    </div>
                </div>`;
        });
    }
}

export function celebrateRunner(el, pct) {
    fireConfetti();
    if (el) {
        el.style.transform = 'translateY(-50%) rotate(360deg) scale(1.4)';
        setTimeout(() => {
            el.style.transform = 'translateY(-50%)';
        }, 500);
    }
}

export async function loadCoursesPage() {
    const { data: courses } = await supabaseClient.from('courses').select('*').order('created_at', { ascending: false });
    localCourses = courses || [];
    if (typeof window !== 'undefined') window.localCourses = localCourses;

    localCourses.forEach(c => {
        if (c.term && !customTerms.includes(c.term.trim())) {
            customTerms.push(c.term.trim());
        }
    });
    if (typeof localStorage !== 'undefined') localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));

    renderTermFolders();
    renderAlphabeticals();
}

export function renderTermFolders() {
    if (typeof document === 'undefined') return;
    const foldersGrid = document.getElementById('termFoldersGrid');
    if (!foldersGrid) return;

    const termsMap = {};
    customTerms.forEach(t => { termsMap[t] = []; });

    if (!hideUnassignedFolder) {
        if (!termsMap['Unassigned']) termsMap['Unassigned'] = [];
    }

    localCourses.forEach(c => {
        const t = (c.term && c.term.trim() !== '') ? c.term.trim() : 'Unassigned';
        if (t === 'Unassigned' && hideUnassignedFolder) return;
        if (!termsMap[t]) termsMap[t] = [];
        termsMap[t].push(c);
    });

    foldersGrid.innerHTML = '';
    const termNames = Object.keys(termsMap).sort();

    termNames.forEach(termName => {
        const termCourses = termsMap[termName];
        foldersGrid.innerHTML += `
            <div onclick="openTermModal('${termName}')" 
                 ondragover="allowDrop(event)" 
                 ondrop="handleDropToTerm(event, '${termName}')"
                 class="cursor-pointer group bg-white dark:bg-brand-800 p-5 rounded-xl border-2 border-dashed border-zinc-300 dark:border-brand-600 hover:border-indigo-500 dark:hover:border-indigo-400 transition shadow-sm flex flex-col justify-between min-h-[130px]">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <span class="text-2xl">📁</span>
                        <h4 class="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${termName}</h4>
                    </div>
                    <span class="text-xs bg-zinc-100 dark:bg-brand-700 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-full font-bold">${termCourses.length} class${termCourses.length === 1 ? '' : 'es'}</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-1.5">
                    ${termCourses.slice(0, 4).map(c => `<span class="text-[11px] px-2 py-0.5 rounded font-medium" style="background-color: ${c.color}20; color: ${c.color}; border: 1px solid ${c.color}40;">${c.code}</span>`).join('')}
                    ${termCourses.length > 4 ? `<span class="text-[11px] text-zinc-400 px-1">+${termCourses.length - 4} more</span>` : ''}
                </div>
                <p class="text-[11px] text-zinc-400 mt-2 text-right">Click to open &bull; Drag class here</p>
            </div>`;
    });
}

export function renderAlphabeticals() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById('alphabeticalCourseList');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (localCourses.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-sm text-zinc-500 text-center">No classes added yet.</div>';
        return;
    }

    const sortedCourses = [...localCourses].sort((a, b) => a.code.localeCompare(b.code));

    sortedCourses.forEach(course => {
        const emoji = course.emoji || '📚';
        const termBadge = course.term ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded font-bold">${course.term}</span>` : `<span class="text-xs bg-zinc-200 dark:bg-brand-700 text-zinc-500 px-2 py-0.5 rounded">Unassigned</span>`;
        const opacity = course.is_completed ? 'opacity-50' : '';
        const checkIcon = course.is_completed ? `<span class="text-indigo-500 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1 rounded">✔ Completed</span>` : '';

        listEl.innerHTML += `
            <div draggable="true" ondragstart="handleDragStart(event, '${course.id}')" onclick="openCourseModal('${course.id}')" class="cursor-pointer p-4 hover:bg-zinc-50 dark:hover:bg-brand-700/50 transition flex items-center justify-between ${opacity}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style="background-color: ${course.color}20; color: ${course.color}; border: 1px solid ${course.color}40;">${emoji}</div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-zinc-800 dark:text-zinc-200">${course.code}</h4>
                            ${termBadge}
                        </div>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Drag card to move term &bull; Click to open coursework</p>
                    </div>
                </div>
                <div>${checkIcon}</div>
            </div>`;
    });
}

export function handleDragStart(e, courseId) {
    e.dataTransfer.setData('text/plain', courseId);
}

export function allowDrop(e) {
    e.preventDefault();
}

export async function handleDropToTerm(e, termName) {
    e.preventDefault();
    const courseId = e.dataTransfer.getData('text/plain');
    if (!courseId) return;

    const newTerm = termName === 'Unassigned' ? null : termName;
    if (newTerm && !customTerms.includes(newTerm)) {
        customTerms.push(newTerm);
        localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
    }

    if (termName === 'Unassigned') {
        hideUnassignedFolder = false;
        localStorage.removeItem('hideUnassigned');
    }

    await supabaseClient.from('courses').update({ term: newTerm }).eq('id', courseId);

    const course = localCourses.find(c => c.id === courseId);
    if (course) course.term = newTerm;

    renderTermFolders();
    renderAlphabeticals();
}

export function createNewTermFolder() {
    const input = document.getElementById('newTermInput');
    const termVal = input ? input.value.trim() : '';
    if (!termVal) return;

    if (!customTerms.includes(termVal)) {
        customTerms.push(termVal);
        localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));
    }
    input.value = '';
    renderTermFolders();
}

export function ensureTermModalExists() {
    let modal = document.getElementById('termModal');
    if (!modal && typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.id = 'termModal';
        div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm hidden';
        div.innerHTML = `
            <div class="bg-white dark:bg-brand-800 rounded-2xl border border-zinc-200 dark:border-brand-700 w-full max-w-lg p-6 shadow-xl max-h-[85vh] flex flex-col">
                <div class="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-brand-700">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">📁</span>
                        <h3 id="termModalTitle" class="text-lg font-bold text-zinc-800 dark:text-zinc-200"></h3>
                    </div>
                    <button type="button" onclick="closeTermModal()" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xl font-bold">✕</button>
                </div>
                <div id="termModalCourseList" class="py-4 space-y-3 overflow-y-auto flex-1"></div>
                <div class="pt-4 border-t border-zinc-200 dark:border-brand-700 flex justify-between items-center">
                    <button type="button" onclick="deleteCurrentTermFolder()" class="text-xs text-red-500 hover:text-red-700 font-bold transition">Delete Term Folder</button>
                    <button type="button" onclick="closeTermModal()" class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 text-zinc-700 dark:text-zinc-200 font-bold rounded-lg text-sm transition">Close</button>
                </div>
            </div>`;
        document.body.appendChild(div);
    }
}

export function openTermModal(termName) {
    ensureTermModalExists();
    activeTermModalName = termName;
    const titleEl = document.getElementById('termModalTitle');
    if (titleEl) titleEl.innerText = `Classes in ${termName}`;

    const listEl = document.getElementById('termModalCourseList');
    if (!listEl) return;

    const termCourses = localCourses.filter(c => {
        const t = c.term ? c.term.trim() : 'Unassigned';
        return t === termName;
    });

    listEl.innerHTML = '';
    if (termCourses.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-zinc-500 text-center py-6">No classes in this term yet. Drag a class card here or assign one.</p>';
    } else {
        termCourses.forEach(course => {
            const emoji = course.emoji || '📚';
            listEl.innerHTML += `
                <div onclick="closeTermModal(); openCourseModal('${course.id}')" class="cursor-pointer p-3 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 hover:border-indigo-500 transition flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style="background-color: ${course.color}20; color: ${course.color}; border: 1px solid ${course.color}40;">${emoji}</div>
                        <div>
                            <h4 class="font-bold text-sm text-zinc-800 dark:text-zinc-200">${course.code}</h4>
                            <p class="text-xs text-zinc-500">Click to view coursework &rarr;</p>
                        </div>
                    </div>
                </div>`;
        });
    }

    document.getElementById('termModal')?.classList.remove('hidden');
}

export function closeTermModal() {
    const modal = document.getElementById('termModal');
    if (modal) modal.classList.add('hidden');
}

export async function deleteCurrentTermFolder() {
    if (activeTermModalName === 'Unassigned') {
        if (confirm('Delete Unassigned folder and all unassigned classes inside it?')) {
            const termCourses = localCourses.filter(c => !c.term || c.term.trim() === '' || c.term.trim() === 'Unassigned');
            for (let c of termCourses) {
                await supabaseClient.from('courses').delete().eq('id', c.id);
            }
            localCourses = localCourses.filter(c => c.term && c.term.trim() !== '' && c.term.trim() !== 'Unassigned');
            hideUnassignedFolder = true;
            localStorage.setItem('hideUnassigned', 'true');
            closeTermModal();
            renderTermFolders();
            renderAlphabeticals();
        }
        return;
    }

    if (confirm(`Delete term folder "${activeTermModalName}"? Classes inside will be moved to Unassigned.`)) {
        hideUnassignedFolder = false;
        localStorage.removeItem('hideUnassigned');

        const termCourses = localCourses.filter(c => c.term && c.term.trim() === activeTermModalName);
        for (let c of termCourses) {
            await supabaseClient.from('courses').update({ term: null }).eq('id', c.id);
            c.term = null;
        }

        customTerms = customTerms.filter(t => t !== activeTermModalName);
        localStorage.setItem('duevinci_terms', JSON.stringify(customTerms));

        closeTermModal();
        renderTermFolders();
        renderAlphabeticals();
    }
}

export function openCourseModal(courseId) {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    const completionBadge = course.is_completed ? `<span class="ml-2 text-xs bg-green-500/10 text-green-500 border border-green-500/30 px-2 py-0.5 rounded-full font-bold">Completed</span>` : '';
    document.getElementById('modalCourseTitle').innerHTML = `<span>${course.emoji || '📚'}</span> ${course.code} ${completionBadge}`;

    document.getElementById('editCourseId').value = course.id;
    document.getElementById('editCourseEmoji').value = course.emoji || '📚';
    document.getElementById('editCourseCode').value = course.code;
    document.getElementById('editCourseColor').value = course.color;

    const descInput = document.getElementById('editCourseDescription');
    if (descInput) descInput.value = course.description || '';
    const objInput = document.getElementById('editCourseObjectives');
    if (objInput) objInput.value = course.objectives || '';

    const metaBox = document.getElementById('courseMetadataBox');
    if (metaBox) {
        let metaHtml = '';
        if (course.description) metaHtml += `<p class="text-xs text-zinc-600 dark:text-zinc-400 mb-1.5"><strong>Description:</strong> ${course.description}</p>`;
        if (course.objectives) metaHtml += `<p class="text-xs text-zinc-600 dark:text-zinc-400"><strong>Objectives:</strong> ${course.objectives}</p>`;
        metaBox.innerHTML = metaHtml ? `<div class="mt-3 bg-zinc-100 dark:bg-brand-900 p-3 rounded-lg border border-zinc-200 dark:border-brand-700">${metaHtml}</div>` : '<div class="mt-3 bg-zinc-100 dark:bg-brand-900 p-3 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs text-zinc-500">No course description or objectives provided yet. Upload a syllabus or edit below.</div>';
    }

    const btn = document.getElementById('markCourseCompleteBtn');
    if (btn) {
        btn.onclick = () => toggleCourseComplete(course.id, course.is_completed);
        if (course.is_completed) {
            btn.innerText = "↺ Mark as Incomplete";
            btn.className = "text-xs bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20 px-3 py-1.5 rounded font-bold transition";
        } else {
            btn.innerText = "✔ Mark Course Complete";
            btn.className = "text-xs bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 px-3 py-1.5 rounded font-bold transition";
        }
    }

    document.getElementById('pdfStatusMsg')?.classList.add('hidden');
    const syllabusFileInput = document.getElementById('syllabusFile');
    if (syllabusFileInput) syllabusFileInput.value = '';

    switchCourseTab('overview');
    renderStaticCoursePanels(course);

    document.getElementById('courseModal')?.classList.remove('hidden');
    currentAssignmentPage = 1;
    loadAssignments(course.id, currentAssignmentPage);
}

export function closeCourseModal() {
    const m = document.getElementById('courseModal');
    if (m) m.classList.add('hidden');
}

export function switchCourseTab(tabName) {
    ['overview', 'resources', 'scratchpad', 'studyquiz'].forEach(t => {
        const panel = document.getElementById(`panel-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (panel) panel.classList.toggle('hidden', t !== tabName);
        if (btn) {
            btn.className = t === tabName 
                ? 'text-xs font-bold pb-3 border-b-2 border-indigo-500 text-indigo-500 transition' 
                : 'text-xs font-bold pb-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition';
        }
    });
}

export function renderStaticCoursePanels(course) {
    let links = course.resources || [];
    const resPanel = document.getElementById('panel-resources');
    if (resPanel) {
        resPanel.innerHTML = `
            <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-300">🔗 Resource & Note Links</h3>
            <div id="linksList_${course.id}" class="space-y-2 mt-2">
                ${links.map((l, idx) => `
                    <div class="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs">
                        <a href="${l.url}" target="_blank" class="font-bold text-indigo-500 hover:underline truncate">${l.title}</a>
                        <button onclick="removeResourceLink('${course.id}', ${idx})" class="text-zinc-400 hover:text-red-500 font-bold px-2">✕</button>
                    </div>
                `).join('')}
            </div>
            <div class="flex gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-brand-700">
                <input type="text" id="resTitle_${course.id}" placeholder="Resource Title" class="w-1/3 text-xs px-3 py-2 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500">
                <input type="url" id="resUrl_${course.id}" placeholder="https://..." class="flex-1 text-xs px-3 py-2 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500">
                <button onclick="addResourceLink('${course.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-xs font-bold transition">+ Add Link</button>
            </div>
        `;
    }

    const scratchPanel = document.getElementById('panel-scratchpad');
    if (scratchPanel) {
        scratchPanel.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-300">📝 Course Scratchpad & Study Notes</h3>
                <div class="flex gap-2">
                    <button type="button" onclick="downloadCourseNotesAsMarkdown('${course.id}')" title="Download as .md file" class="px-2.5 py-1 bg-zinc-200 hover:bg-zinc-300 dark:bg-brand-700 dark:hover:bg-brand-600 text-zinc-800 dark:text-zinc-200 rounded text-xs font-bold transition">
                        📥 Download .md
                    </button>
                    <button type="button" onclick="switchCourseTab('studyquiz'); generateStudyDeck('${course.id}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition shadow-sm">
                        ⚡ Generate Test from Notes
                    </button>
                </div>
            </div>
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">Supports Markdown headings, bullet points, code blocks, and math formulas like <code>$E = mc^2$</code> or <code>$$\\Delta x$$</code>.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Editor</div>
                    <textarea id="scratchpadTextarea_${course.id}" oninput="saveCourseScratchpad('${course.id}', this.value); updateScratchpadPreview('${course.id}', this.value)" rows="10" placeholder="Type lecture notes, definitions (e.g. Term: definition), or formulas ($E=mc^2$)..." class="w-full text-xs p-3 rounded-lg border border-zinc-200 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono">${course.scratchpad || ''}</textarea>
                </div>
                <div>
                    <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Live Markdown & Math Preview</div>
                    <div id="scratchpadPreview_${course.id}" class="w-full h-[180px] sm:h-[190px] overflow-y-auto text-xs p-3 rounded-lg border border-zinc-200 dark:border-brand-700 bg-zinc-50 dark:bg-brand-900 text-zinc-800 dark:text-zinc-200 leading-relaxed">
                        ${window.renderMarkdownToHtml ? window.renderMarkdownToHtml(course.scratchpad || '*No notes yet. Type on the left to see live formatted math & markdown preview.*') : (course.scratchpad || 'No notes yet.')}
                    </div>
                </div>
            </div>
        `;
    }
}

export async function addCourseResourceLink(courseId) {
    const titleInput = document.getElementById(`resTitle_${courseId}`);
    const urlInput = document.getElementById(`resUrl_${courseId}`);
    const title = titleInput ? titleInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';
    if (!title || !url) return;

    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    let links = course.resources || [];
    links.push({ title, url });
    course.resources = links;

    await supabaseClient.from('courses').update({ resources: links }).eq('id', courseId);
    renderStaticCoursePanels(course);
}

export async function removeCourseResourceLink(courseId, idx) {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    let links = course.resources || [];
    links.splice(idx, 1);
    course.resources = links;

    await supabaseClient.from('courses').update({ resources: links }).eq('id', courseId);
    renderStaticCoursePanels(course);
}

export async function saveCourseScratchpad(courseId, val) {
    const course = localCourses.find(c => c.id === courseId);
    if (course) course.scratchpad = val;
    await supabaseClient.from('courses').update({ scratchpad: val }).eq('id', courseId);
}

export function updateScratchpadPreview(courseId, val) {
    const previewEl = document.getElementById(`scratchpadPreview_${courseId}`);
    if (previewEl && window.renderMarkdownToHtml) {
        previewEl.innerHTML = renderMarkdownToHtml(val || '*No notes yet.*');
    }
}

export async function parseSyllabusPDF() {
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
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(" ") + " ";
        }

        const metadataOnlyEl = document.getElementById('syllabusMetadataOnly') || document.getElementById('metadataOnly');
        const isMetadataOnly = metadataOnlyEl ? metadataOnlyEl.checked : false;
        const apiCallType = isMetadataOnly ? 'syllabus_metadata' : 'syllabus';

        const { data: responseData, error: functionError } = await supabaseClient.functions.invoke('gemini-parser', {
            body: { type: apiCallType, text: fullText }
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
            const cachedCourse = localCourses.find(c => c.id === courseId);
            if (cachedCourse) {
                if (parsedData.description) cachedCourse.description = parsedData.description;
                if (parsedData.objectives) cachedCourse.objectives = parsedData.objectives;
            }
        }

        if (isMetadataOnly) {
            statusMsg.textContent = "Successfully imported course description & objectives!";
            statusMsg.className = "text-xs text-center mt-2 text-green-500";
            openCourseModal(courseId);
            loadCoursesPage();
            return;
        }

        let baseDate = new Date();
        if (parsedData.units && parsedData.units.length > 0) {
            parsedData.units.sort((a, b) => {
                if (!a.dateStr || !b.dateStr) return 0;
                return new Date(a.dateStr) - new Date(b.dateStr);
            });

            for (let i = 0; i < parsedData.units.length; i++) {
                let u = parsedData.units[i];
                let targetDate = u.dateStr ? smartParseDate(u.dateStr) : null;
                if (!targetDate) {
                    let fallbackDate = new Date(baseDate);
                    fallbackDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                    targetDate = fallbackDate.toISOString().split('T')[0];
                }

                const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                    course_id: courseId, user_id: currentUser.id,
                    title: `Unit ${u.num || i + 1}: ${u.title}`,
                    unit_number: u.num || i + 1,
                    due_date: targetDate
                }]).select();

                if (insertedUnit && insertedUnit[0] && u.lessons) {
                    let lessonNum = 1;
                    for (let lessonTitle of u.lessons) {
                        let formattedTitle = lessonTitle.toLowerCase().startsWith('lesson') ? lessonTitle : `Lesson ${lessonNum}: ${lessonTitle}`;
                        await supabaseClient.from('assignments').insert([{
                            course_id: courseId, user_id: currentUser.id,
                            title: `↳ ${formattedTitle}`,
                            unit_number: u.num || i + 1,
                            due_date: targetDate
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
        loadAssignments(courseId, 1);

    } catch (err) {
        console.error(err);
        statusMsg.textContent = "Error parsing file or contacting Edge Function.";
        statusMsg.className = "text-xs text-center mt-2 text-red-500";
    }
}

export async function parseLessonsImage(inputElement) {
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
                    let targetDate = wk.dateStr ? smartParseDate(wk.dateStr) : null;
                    if (!targetDate) {
                        let fallbackDate = new Date(baseDate);
                        fallbackDate.setDate(baseDate.getDate() + ((i + 1) * 7));
                        targetDate = fallbackDate.toISOString().split('T')[0];
                    }

                    const { data: insertedUnit } = await supabaseClient.from('assignments').insert([{
                        course_id: courseId, user_id: currentUser.id,
                        title: wk.title || `Week ${wk.num}`,
                        unit_number: wk.num,
                        due_date: targetDate
                    }]).select();

                    if (insertedUnit && insertedUnit[0] && wk.lessons) {
                        let lessonNum = 1;
                        for (let l of wk.lessons) {
                            let formattedTitle = l.toLowerCase().startsWith('lesson') ? l : `Lesson ${lessonNum}: ${l}`;
                            await supabaseClient.from('assignments').insert([{
                                course_id: courseId, user_id: currentUser.id,
                                title: `↳ ${formattedTitle}`,
                                unit_number: wk.num,
                                due_date: targetDate
                            }]);
                            lessonNum++;
                        }
                    }
                }
            }

            statusMsg.textContent = "Successfully imported lessons via secure Edge Function!";
            statusMsg.className = "text-xs text-center mt-2 text-green-500";
            loadAssignments(courseId, 1);

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error scanning image with Edge Function.";
            statusMsg.className = "text-xs text-center mt-2 text-red-500";
        }
    };
}

export async function deleteCurrentCourse() {
    if (confirm('Delete this course and ALL its coursework?')) {
        await supabaseClient.from('courses').delete().eq('id', document.getElementById('editCourseId').value);
        closeCourseModal();
        loadCoursesPage();
    }
}

export async function toggleCourseComplete(courseId, currentState) {
    const newState = !currentState;
    await supabaseClient.from('courses').update({ is_completed: newState }).eq('id', courseId);
    const course = localCourses.find(c => c.id === courseId);
    if (course) course.is_completed = newState;
    if (newState) fireConfetti();
    openCourseModal(courseId);
    loadCoursesPage();
}

export async function toggleAssignment(assignId, currentState, courseId) {
    const newState = !currentState;
    await supabaseClient.from('assignments').update({ is_completed: newState }).eq('id', assignId);
    if (newState) fireConfetti();
    const page = getCurrentPageName();
    if (page === 'index' || page === 'index.html') loadDashboardStats();
    else if (courseId) loadAssignments(courseId, currentAssignmentPage);
}

export async function updateAssignmentDate(assignId, newDate, courseId) {
    if (!newDate) return;
    const parsedDate = parseInputDate(newDate);
    await supabaseClient.from('assignments').update({ due_date: parsedDate }).eq('id', assignId);
    loadAssignments(courseId, currentAssignmentPage);
}

export async function addSubItem(parentId, courseId) {
    const inputEl = document.getElementById(`subInput-${parentId}`);
    const title = inputEl ? inputEl.value.trim() : "";
    if (!title) return;

    const { data: parentAssign } = await supabaseClient.from('assignments').select('unit_number, due_date').eq('id', parentId).single();
    const unitNum = parentAssign ? parentAssign.unit_number : null;
    const dueDate = parentAssign ? parentAssign.due_date : new Date().toISOString().split('T')[0];

    await supabaseClient.from('assignments').insert([{
        course_id: courseId, user_id: currentUser.id,
        title: `↳ ${title}`, unit_number: unitNum, due_date: dueDate
    }]);
    loadAssignments(courseId, currentAssignmentPage);
}

export function changeAssignmentPage(courseId, page) {
    loadAssignments(courseId, page);
}

export async function loadAssignments(courseId, page = 1) {
    if (typeof document === 'undefined') return;
    const { data: assignments } = await supabaseClient.from('assignments').select('*').eq('course_id', courseId);
    const listEl = document.getElementById('assignmentList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!assignments || !assignments.length) {
        listEl.innerHTML = '<div class="p-4 border border-dashed border-zinc-300 dark:border-brand-600 rounded-lg text-center"><p class="text-sm text-zinc-500 dark:text-zinc-400">No coursework added yet.</p></div>';
        return;
    }

    const getUnitNum = (item) => {
        if (item.unit_number) return parseInt(item.unit_number) || 0;
        const match = item.title.match(/(?:unit|wk|week)\s*([0-9]+)/i);
        return match ? parseInt(match[1]) || 0 : 0;
    };

    const getLessonNum = (item) => {
        const match = item.title.match(/lesson\s*([0-9]+)/i);
        if (match) return parseInt(match[1]) || 0;
        const numMatch = item.title.replace(/[^0-9]/g, '');
        return numMatch ? parseInt(numMatch) : 999;
    };

    assignments.sort((a, b) => {
        let unitA = getUnitNum(a);
        let unitB = getUnitNum(b);
        if (unitA !== unitB) return unitA - unitB;

        let isSubA = a.title.startsWith('↳');
        let isSubB = b.title.startsWith('↳');

        if (!isSubA && isSubB) return -1;
        if (isSubA && !isSubB) return 1;

        if (isSubA && isSubB) {
            let lessonA = getLessonNum(a);
            let lessonB = getLessonNum(b);
            if (lessonA !== lessonB) return lessonA - lessonB;
        }

        return new Date(a.due_date) - new Date(b.due_date);
    });

    const pageSize = 6;
    const totalPages = Math.ceil(assignments.length / pageSize);
    if (page > totalPages && totalPages > 0) page = totalPages;
    if (page < 1) page = 1;
    currentAssignmentPage = page;

    const startIndex = (page - 1) * pageSize;
    const paginatedAssignments = assignments.slice(startIndex, startIndex + pageSize);

    paginatedAssignments.forEach(assign => {
        const isSubItem = assign.title.startsWith('↳');
        const unitBadge = assign.unit_number ? `<span class="text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-bold mr-1">Wk ${assign.unit_number}</span>` : '';
        const formattedDate = window.formatDate ? window.formatDate(assign.due_date) : assign.due_date;

        let checkboxHtml = '';
        if (isSubItem) {
            const cClass = assign.is_completed ? "bg-indigo-500 text-white border-indigo-500" : "text-transparent border-zinc-300 dark:border-brand-600 hover:border-indigo-500 hover:text-indigo-500";
            checkboxHtml = `<button type="button" onclick="toggleAssignment('${assign.id}', ${assign.is_completed}, '${courseId}')" class="w-5 h-5 rounded border transition flex items-center justify-center shrink-0 ${cClass}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>`;
        } else {
            const unitLessons = assignments.filter(a => a.unit_number === assign.unit_number && a.title.startsWith('↳'));
            const allDone = unitLessons.length > 0 && unitLessons.every(l => l.is_completed);
            const unitClass = allDone ? "bg-green-500 text-white border-green-500" : "bg-zinc-200 dark:bg-brand-700 text-zinc-400 border-transparent";
            checkboxHtml = `<div class="w-5 h-5 rounded border transition flex items-center justify-center shrink-0 ${unitClass}" title="Automatically completed when all unit lessons are done"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div>`;

            if (assign.is_completed !== allDone) {
                supabaseClient.from('assignments').update({ is_completed: allDone }).eq('id', assign.id);
                assign.is_completed = allDone;
            }
        }

        const tClass = assign.is_completed ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200";

        let subItemForm = '';
        if (!isSubItem && assign.unit_number) {
            subItemForm = `
                <div class="mt-2 flex items-center gap-2">
                    <input type="text" id="subInput-${assign.id}" placeholder="+ Add lesson..." class="flex-1 border border-zinc-200 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded p-1 text-xs">
                    <button type="button" onclick="addSubItem('${assign.id}', '${courseId}')" class="bg-indigo-600 text-white px-2 py-1 rounded text-xs font-bold">+ Add</button>
                </div>`;
        }

        listEl.innerHTML += `
            <div class="p-3 bg-zinc-50 dark:bg-brand-900 rounded-lg border border-zinc-200 dark:border-brand-700 text-xs">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5 flex-1 min-w-0">
                        ${checkboxHtml}
                        <span class="font-bold truncate ${tClass}">${unitBadge}${assign.title}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <input type="date" value="${assign.due_date || ''}" onchange="updateAssignmentDate('${assign.id}', this.value, '${courseId}')" class="bg-white dark:bg-brand-800 border border-zinc-200 dark:border-brand-600 rounded px-1.5 py-0.5 text-xs">
                    </div>
                </div>
                ${subItemForm}
            </div>`;
    });

    if (totalPages > 1) {
        let paginationHtml = '<div class="flex justify-between items-center mt-4 pt-3 border-t border-zinc-200 dark:border-brand-700 text-xs">';
        paginationHtml += `<button type="button" onclick="changeAssignmentPage('${courseId}', ${page - 1})" ${page === 1 ? 'disabled class="opacity-40 font-bold px-2 py-1"' : 'class="font-bold text-indigo-500 hover:underline px-2 py-1"'}">&larr; Prev</button>`;
        paginationHtml += `<span class="text-zinc-400 font-medium">Page ${page} of ${totalPages}</span>`;
        paginationHtml += `<button type="button" onclick="changeAssignmentPage('${courseId}', ${page + 1})" ${page === totalPages ? 'disabled class="opacity-40 font-bold px-2 py-1"' : 'class="font-bold text-indigo-500 hover:underline px-2 py-1"'}>Next &rarr;</button>`;
        paginationHtml += '</div>';
        listEl.innerHTML += paginationHtml;
    }
}

export function downloadCourseNotesAsMarkdown(courseId) {
    const course = localCourses.find(c => c.id === courseId);
    if (!course) return;

    const content = `# ${course.emoji || '📚'} ${course.code} Study Notes & Scratchpad\n\n${course.scratchpad || '*No notes recorded.*'}\n\n---\n*Exported from DueVinci on ${new Date().toLocaleDateString()}*`;
    const cleanCode = course.code.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${cleanCode}_Study_Notes.md`;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function filterDashboardUpNext(priority = 'all') {
    if (typeof window !== 'undefined') {
        window.activePriorityFilter = priority;
        ['all', 'high', 'medium', 'low'].forEach(p => {
            const btn = document.getElementById(`filter-priority-${p}`);
            if (btn) {
                if (p === priority) {
                    btn.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-sm transition";
                } else {
                    btn.className = "px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-200 dark:bg-brand-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-brand-600 transition";
                }
            }
        });
        loadDashboardStats();
    }
}

export async function openQuickAddModal() {
    let modal = document.getElementById('quickAddModal');
    if (!modal && typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.id = 'quickAddModal';
        div.className = 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm hidden p-4';
        div.innerHTML = `
            <div class="bg-white dark:bg-brand-800 rounded-2xl border border-zinc-200 dark:border-brand-700 w-full max-w-md p-6 shadow-2xl space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-brand-700">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">⚡</span>
                        <h3 class="text-base font-bold text-zinc-900 dark:text-white">Quick Add Assignment</h3>
                    </div>
                    <button type="button" onclick="closeQuickAddModal()" class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg font-bold">✕</button>
                </div>
                <form id="quickAddForm" onsubmit="submitQuickAddTask(event)" class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Class / Course</label>
                        <select id="quickAddCourseSelect" required class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
                            <option value="">Select a class...</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Assignment or Exam Title</label>
                        <input type="text" id="quickAddTitle" required placeholder="e.g. Unit 3 Quiz or Practice Exam" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Due Date</label>
                            <input type="date" id="quickAddDueDate" required class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Priority</label>
                            <select id="quickAddPriority" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
                                <option value="medium">⚡ Normal</option>
                                <option value="high">🔥 Urgent</option>
                                <option value="low">🌱 Low</option>
                            </select>
                        </div>
                    </div>
                    <div class="pt-2">
                        <button type="submit" id="quickAddSubmitBtn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-xs transition shadow-sm">+ Add to Course Plan</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(div);
    }

    const select = document.getElementById('quickAddCourseSelect');
    if (select) {
        select.innerHTML = '<option value="">Select a class...</option>';
        localCourses.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.emoji || '📚'} ${c.code}</option>`;
        });
    }

    const modalEl = document.getElementById('quickAddModal');
    if (modalEl) modalEl.classList.remove('hidden');
}

export function closeQuickAddModal() {
    const modalEl = document.getElementById('quickAddModal');
    if (modalEl) modalEl.classList.add('hidden');
}

export async function submitQuickAddTask(event) {
    if (event) event.preventDefault();
    const courseId = document.getElementById('quickAddCourseSelect')?.value;
    const title = document.getElementById('quickAddTitle')?.value.trim();
    const dueDate = document.getElementById('quickAddDueDate')?.value;
    const priority = document.getElementById('quickAddPriority')?.value || 'medium';

    if (!courseId || !title || !dueDate) {
        alert('Please fill out all required fields.');
        return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const newAssignment = {
        course_id: courseId,
        user_id: user.id,
        title: title.startsWith('↳') ? title : `↳ ${title}`,
        due_date: dueDate,
        priority: priority,
        is_completed: false
    };

    await supabaseClient.from('assignments').insert([newAssignment]);
    closeQuickAddModal();
    
    // Refresh stats and study plan
    loadDashboardStats();
    if (window.renderStudyPlanDashboardWidget) {
        window.renderStudyPlanDashboardWidget('studyPlanWidgetContainer');
    }
}

// Bind to window for HTML event handlers
if (typeof window !== 'undefined') {
    window.loadDashboardStats = loadDashboardStats;
    window.celebrateRunner = celebrateRunner;
    window.loadCoursesPage = loadCoursesPage;
    window.renderTermFolders = renderTermFolders;
    window.renderAlphabeticals = renderAlphabeticals;
    window.handleDragStart = handleDragStart;
    window.allowDrop = allowDrop;
    window.handleDropToTerm = handleDropToTerm;
    window.createNewTermFolder = createNewTermFolder;
    window.openTermModal = openTermModal;
    window.closeTermModal = closeTermModal;
    window.deleteCurrentTermFolder = deleteCurrentTermFolder;
    window.openCourseModal = openCourseModal;
    window.closeCourseModal = closeCourseModal;
    window.switchCourseTab = switchCourseTab;
    window.renderStaticCoursePanels = renderStaticCoursePanels;
    window.addCourseResourceLink = addCourseResourceLink;
    window.removeCourseResourceLink = removeCourseResourceLink;
    window.saveCourseScratchpad = saveCourseScratchpad;
    window.updateScratchpadPreview = updateScratchpadPreview;
    window.downloadCourseNotesAsMarkdown = downloadCourseNotesAsMarkdown;
    window.filterDashboardUpNext = filterDashboardUpNext;
    window.openQuickAddModal = openQuickAddModal;
    window.closeQuickAddModal = closeQuickAddModal;
    window.submitQuickAddTask = submitQuickAddTask;
    window.parseSyllabusPDF = parseSyllabusPDF;
    window.parseLessonsImage = parseLessonsImage;
    window.deleteCurrentCourse = deleteCurrentCourse;
    window.toggleCourseComplete = toggleCourseComplete;
    window.toggleAssignment = toggleAssignment;
    window.updateAssignmentDate = updateAssignmentDate;
    window.addSubItem = addSubItem;
    window.changeAssignmentPage = changeAssignmentPage;
    window.loadAssignments = loadAssignments;
}
