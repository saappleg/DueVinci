// --- GRADES, GPA CALCULATION & "WHAT-IF" SIMULATOR MODULE ---
import { supabaseClient } from './config.js';

export let isSimulatingGrades = false;
export let simulatedGradesMap = {};

export function toggleGradeSimulator() {
    isSimulatingGrades = !isSimulatingGrades;
    if (!isSimulatingGrades) {
        simulatedGradesMap = {};
    }
    loadGradesPage();
}

export function resetGradeSimulation() {
    simulatedGradesMap = {};
    loadGradesPage();
}

export function simulateAssignmentGrade(assignId, gradeVal) {
    const val = gradeVal === '' ? null : parseFloat(gradeVal);
    if (val !== null && !isNaN(val)) {
        simulatedGradesMap[assignId] = val;
    } else {
        delete simulatedGradesMap[assignId];
    }
    loadGradesPage(true);
}

export async function loadGradesPage(isFastRecalc = false) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('gradesContainer');
    if (!container) return;

    const { data: courses } = await supabaseClient.from('courses').select('*');
    const { data: assignments } = await supabaseClient.from('assignments').select('*');
    if (!courses || !assignments) return;

    container.innerHTML = '';
    let totalGradePoints = 0;
    let gradedCount = 0;

    // Simulator Top Control Banner
    const simBanner = `
        <div class="mb-6 p-5 rounded-2xl border transition-all ${isSimulatingGrades ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' : 'bg-white dark:bg-brand-800 border-zinc-200 dark:border-brand-700 shadow-sm'}">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div class="flex items-center gap-3.5">
                    <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${isSimulatingGrades ? 'bg-indigo-600 text-white animate-pulse' : 'bg-indigo-50 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400'}">🎯</div>
                    <div>
                        <h3 class="font-extrabold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                            "What-If" Target Grade Simulator
                            ${isSimulatingGrades ? '<span class="px-2 py-0.5 bg-indigo-500 text-white rounded text-[10px] uppercase font-bold tracking-wider animate-pulse">Simulator Active</span>' : ''}
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            ${isSimulatingGrades ? 'Type hypothetical exam or lesson scores below to see projected GPA in real time. (Your real saved grades are never changed).' : 'Test hypothetical exam scores to calculate what score you need to reach your target GPA.'}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    ${isSimulatingGrades ? '<button type="button" onclick="resetGradeSimulation()" class="px-3.5 py-2 bg-zinc-200 dark:bg-brand-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition hover:bg-zinc-300">Reset Sim</button>' : ''}
                    <button type="button" onclick="toggleGradeSimulator()" class="px-4 py-2 ${isSimulatingGrades ? 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5">
                        ${isSimulatingGrades ? 'Exit Simulator ✕' : 'Launch Simulator 🎯'}
                    </button>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = simBanner;

    courses.forEach(course => {
        const cAssignments = assignments.filter(a => a.course_id === course.id && (a.title.includes('↳') || /lesson|exam|final|midterm|test|review/i.test(a.title)));
        const unitsMap = {};
        cAssignments.forEach(a => {
            const uNum = a.unit_number || 1;
            if (!unitsMap[uNum]) unitsMap[uNum] = [];
            unitsMap[uNum].push(a);
        });

        let courseTotal = 0;
        let courseGraded = 0;
        let unitsHtml = '';

        Object.keys(unitsMap).sort((a,b) => a-b).forEach(uNum => {
            let lessonsHtml = '';

            unitsMap[uNum].sort((a, b) => {
                const getLessonNum = (item) => {
                    const match = item.title.match(/lesson\s*([0-9]+)/i);
                    if (match) return parseInt(match[1]);
                    const numMatch = item.title.replace(/[^0-9]/g, '');
                    return numMatch ? parseInt(numMatch) : 999;
                };
                let isSubA = a.title.startsWith('↳');
                let isSubB = b.title.startsWith('↳');
                if (!isSubA && isSubB) return -1;
                if (isSubA && !isSubB) return 1;
                if (isSubA && isSubB) return getLessonNum(a) - getLessonNum(b);
                return new Date(a.due_date) - new Date(b.due_date);
            });

            unitsMap[uNum].forEach(item => {
                const activeGrade = isSimulatingGrades && simulatedGradesMap[item.id] !== undefined ? simulatedGradesMap[item.id] : item.grade;
                const isSimulatedVal = isSimulatingGrades && simulatedGradesMap[item.id] !== undefined;

                if (activeGrade !== null && activeGrade !== undefined && !item.exclude_from_gpa) {
                    courseTotal += parseFloat(activeGrade);
                    courseGraded++;
                }

                const inputHandler = isSimulatingGrades ? `oninput="simulateAssignmentGrade('${item.id}', this.value)"` : `onchange="updateAssignmentGrade('${item.id}', this.value)"`;

                lessonsHtml += `
                    <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-brand-900 rounded-lg border ${isSimulatedVal ? 'border-indigo-400 bg-indigo-50/20' : 'border-zinc-200 dark:border-brand-700'} text-xs">
                        <span class="font-bold truncate flex-1 ${isSimulatedVal ? 'text-indigo-600 dark:text-indigo-400' : ''}">${item.title}</span>
                        <div class="flex items-center gap-3">
                            <label class="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                                <input type="checkbox" ${item.exclude_from_gpa ? 'checked' : ''} onchange="toggleExcludeGpa('${item.id}', this.checked)" class="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"> Exclude
                            </label>
                            <div class="flex items-center gap-1">
                                <input type="number" min="0" max="100" value="${activeGrade !== null && activeGrade !== undefined ? activeGrade : ''}" placeholder="--" ${inputHandler} class="w-16 text-center text-xs font-bold p-1 rounded border ${isSimulatedVal ? 'border-indigo-500 bg-indigo-50 dark:bg-brand-800 text-indigo-600 font-black' : 'dark:bg-brand-800 dark:border-brand-600'} focus:outline-none focus:border-indigo-500">
                                <span class="text-zinc-400">%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            unitsHtml += `
                <div class="mb-4">
                    <h5 class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">Unit ${uNum}</h5>
                    <div class="space-y-2">${lessonsHtml}</div>
                </div>
            `;
        });

        const courseAvg = courseGraded > 0 ? (courseTotal / courseGraded).toFixed(1) : 'N/A';
        if (courseGraded > 0) {
            totalGradePoints += parseFloat(courseAvg);
            gradedCount++;
        }

        container.innerHTML += `
            <div class="bg-white dark:bg-brand-800 p-6 rounded-2xl border border-zinc-200 dark:border-brand-700 shadow-sm mb-4">
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-zinc-200 dark:border-brand-700">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${course.emoji || '📚'}</span>
                        <h3 class="font-bold text-base text-zinc-800 dark:text-zinc-100">${course.code}</h3>
                    </div>
                    <span class="text-sm font-extrabold px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg">Course Average: ${courseAvg}%</span>
                </div>
                ${unitsHtml || '<p class="text-xs text-zinc-400">No graded coursework in this class yet.</p>'}
            </div>
        `;
    });

    const cumulativeEl = document.getElementById('cumulativeGpaVal');
    if (cumulativeEl && gradedCount > 0) {
        const avgPct = totalGradePoints / gradedCount;
        const scaleTarget = parseFloat((typeof localStorage !== 'undefined' && localStorage.getItem('duevinci_gpa_scale')) || '4.0');
        const gpa = ((avgPct / 100) * scaleTarget).toFixed(2);
        cumulativeEl.innerText = `${gpa} / ${scaleTarget.toFixed(1)}`;
    }
}

export async function updateAssignmentGrade(assignId, gradeVal) {
    const val = gradeVal === '' ? null : parseFloat(gradeVal);
    await supabaseClient.from('assignments').update({ grade: val }).eq('id', assignId);
    loadGradesPage();
}

export async function toggleExcludeGpa(assignId, excluded) {
    await supabaseClient.from('assignments').update({ exclude_from_gpa: excluded }).eq('id', assignId);
    loadGradesPage();
}

// Bind to window
if (typeof window !== 'undefined') {
    window.toggleGradeSimulator = toggleGradeSimulator;
    window.resetGradeSimulation = resetGradeSimulation;
    window.simulateAssignmentGrade = simulateAssignmentGrade;
    window.loadGradesPage = loadGradesPage;
    window.updateAssignmentGrade = updateAssignmentGrade;
    window.toggleExcludeGpa = toggleExcludeGpa;
}
