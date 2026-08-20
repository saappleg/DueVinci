// --- AI FLASHCARDS & STUDENT NOTES PRACTICE QUIZ MODULE ---
import { supabaseClient } from './config.js';
import { fireConfetti } from './utils.js';

export let currentDeckCards = [];
export let currentCardIndex = 0;
export let isCardFlipped = false;
export let currentQuizQuestions = [];
export let currentQuizIndex = 0;
export let quizScore = 0;
export let currentStudyMode = 'flashcards'; // 'flashcards' | 'quiz'
export let currentDeckCourseId = null;

/**
 * Extracts key concepts and terms from student submitted notes text.
 */
export function extractConceptsFromNotes(notesText = '') {
    if (!notesText || typeof notesText !== 'string') return [];

    // Split notes by lines, bullet points, semicolons, or numbered lists
    const lines = notesText
        .split(/\r?\n|•|\*|;|--+/)
        .map(l => l.replace(/^[\s\d.\-–—:>)\]]+/, '').trim())
        .filter(l => l.length > 5 && !l.startsWith('http'));

    const concepts = [];
    for (const line of lines) {
        // Look for definition patterns like "Term: definition" or "Term - definition" or "Term is/means definition"
        const colonMatch = line.match(/^([^:–—=-]{2,40})[:–—=-]\s*(.+)$/i);
        const isMatch = line.match(/^([^.?!]{2,35})\s+(?:is|means|refers to|represents|defined as)\s+(.+)$/i);

        if (colonMatch && colonMatch[2].length > 8) {
            concepts.push({
                term: colonMatch[1].trim(),
                definition: colonMatch[2].trim()
            });
        } else if (isMatch && isMatch[2].length > 8) {
            concepts.push({
                term: isMatch[1].trim(),
                definition: isMatch[2].trim()
            });
        } else if (line.length > 15 && line.length < 220) {
            // General notable sentence or fact
            const words = line.split(/\s+/);
            const keyTerm = words.slice(0, 3).join(' ');
            concepts.push({
                term: keyTerm,
                definition: line
            });
        }
    }

    return concepts;
}

/**
 * Generates structured multiple-choice quiz questions from student submitted notes.
 */
export function generateQuizFromNotes(notesText, course = {}) {
    const courseCode = course?.code || 'Course';
    const concepts = extractConceptsFromNotes(notesText);

    if (concepts.length === 0) {
        return generateQuizQuestions(course, []);
    }

    const defaultDistractors = [
        "Unrelated prerequisite concept not covered in these notes",
        "Opposing theoretical condition which is contradicted by class notes",
        "Outdated historical notation no longer applicable",
        "Administrative policy guideline only"
    ];

    const questions = [];
    concepts.slice(0, 10).forEach((c, idx) => {
        const otherDefinitions = concepts
            .filter((_, i) => i !== idx)
            .map(other => other.definition);

        const distractors = [];
        if (otherDefinitions.length >= 3) {
            distractors.push(...otherDefinitions.slice(0, 3));
        } else {
            distractors.push(...otherDefinitions);
            while (distractors.length < 3) {
                distractors.push(defaultDistractors[distractors.length % defaultDistractors.length]);
            }
        }

        const correctAnswer = c.definition;
        const allOptions = [correctAnswer, ...distractors.slice(0, 3)];
        const shuffled = [...allOptions].sort(() => 0.5 - ((idx % 3) * 0.3));
        const correctIdx = shuffled.indexOf(correctAnswer);

        questions.push({
            id: `q_note_${idx + 1}`,
            topic: c.term,
            unit: Math.floor(idx / 3) + 1,
            question: `According to your study notes for ${courseCode}, what is the key meaning or application of "${c.term}"?`,
            options: shuffled,
            correctIndex: correctIdx >= 0 ? correctIdx : 0,
            explanation: `From your notes: "${c.term}" — ${c.definition}`
        });
    });

    return questions;
}

/**
 * Generates multiple choice questions (supports course assignments, student notes, or defaults).
 */
export function generateQuizQuestions(course, assignments = [], notesText = '') {
    if (notesText && notesText.trim().length > 10) {
        return generateQuizFromNotes(notesText, course);
    }

    const topics = assignments ? assignments.map(a => a.title.replace('↳', '').trim()).filter(Boolean) : [];
    const questions = [];

    const defaultDistractors = [
        "Historical background unrelated to this semester's primary objectives",
        "Elementary prerequisites covered in preliminary coursework",
        "Optional reference material without direct grading impact",
        "Administrative formatting standards only"
    ];

    if (topics.length > 0) {
        topics.slice(0, 8).forEach((topic, idx) => {
            const unitNum = Math.floor(idx / 3) + 1;
            const correctAnswer = `Key analytical concept and assessment milestone in Unit ${unitNum} for ${topic}.`;

            const otherTopics = topics.filter(t => t !== topic);
            const distractors = [];
            if (otherTopics.length >= 3) {
                otherTopics.slice(0, 3).forEach(ot => {
                    distractors.push(`Secondary sub-topic covering ${ot} and peripheral applications.`);
                });
            } else {
                distractors.push(...defaultDistractors.slice(0, 3));
            }

            const allOptions = [correctAnswer, ...distractors.slice(0, 3)];
            const shuffled = [...allOptions].sort(() => 0.5 - ((idx % 3) * 0.3));
            const correctIdx = shuffled.indexOf(correctAnswer);

            questions.push({
                id: `q_${idx + 1}`,
                topic: topic,
                unit: unitNum,
                question: `Which statement best describes the focus and application of "${topic}" in ${course?.code || 'this course'}?`,
                options: shuffled,
                correctIndex: correctIdx >= 0 ? correctIdx : 0,
                explanation: `In Unit ${unitNum}, "${topic}" represents a core learning milestone required for upcoming quizzes and final exams.`
            });
        });
    } else {
        questions.push(
            {
                id: 'q_default_1',
                topic: 'Course Fundamentals',
                unit: 1,
                question: `What is the primary methodology introduced in ${course?.code || 'this course'} foundational units?`,
                options: [
                    'Mastery of core terminology, structural logic, and problem-solving workflows.',
                    'Memorization of historical publication dates without practical application.',
                    'Advanced multi-tier system optimization exclusively.',
                    'General administrative orientation only.'
                ],
                correctIndex: 0,
                explanation: 'Foundational units establish terminology, analytical problem-solving models, and conceptual baselines.'
            },
            {
                id: 'q_default_2',
                topic: 'Midterm Mastery',
                unit: 2,
                question: `How are cumulative exam points typically weighted across key units?`,
                options: [
                    'Distributed across major lesson topics with active problem sets.',
                    'Concentrated exclusively on the introductory syllabus reading.',
                    'Randomly evaluated without reference to unit objectives.',
                    'Assigned solely based on optional extra-credit submissions.'
                ],
                correctIndex: 0,
                explanation: 'Exams synthesize concepts across all unit learning milestones and coursework assignments.'
            }
        );
    }

    return questions;
}

/**
 * Generates flashcards deck and practice quiz from student notes.
 */
export async function generateStudyDeck(courseId, submittedNotes = null) {
    if (typeof document === 'undefined') return;
    const courses = window.localCourses || [];
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    currentDeckCourseId = courseId;

    // Use passed submitted notes, or get from course scratchpad, or query database
    let notes = submittedNotes !== null ? submittedNotes : (course.scratchpad || '');
    if (!notes && courseId) {
        try {
            const { data } = await supabaseClient.from('courses').select('scratchpad').eq('id', courseId).single();
            if (data && data.scratchpad) {
                notes = data.scratchpad;
                course.scratchpad = notes;
            }
        } catch (e) {
            console.warn('Note fetch fallback:', e);
        }
    }

    const concepts = extractConceptsFromNotes(notes);
    const deck = [];

    if (concepts.length > 0) {
        concepts.forEach(c => {
            deck.push({
                term: `${course.code}: ${c.term}`,
                definition: c.definition
            });
        });
    } else {
        // Fallback when student has not yet entered notes
        deck.push(
            {
                term: `📝 Add Student Notes for ${course.code}`,
                definition: `You haven't added lecture notes yet! Open the "Scratchpad" tab or paste notes in the box below to generate customized quizzes and flashcards directly from your class notes.`
            },
            {
                term: `${course.code}: Core Fundamentals`,
                definition: 'Key definitions, problem-solving techniques, and exam concepts recorded during lecture sessions.'
            },
            {
                term: `${course.code}: Active Recall Strategy`,
                definition: 'Testing yourself with note-derived practice questions improves long-term memory retention by up to 150% compared to passive reading.'
            }
        );
    }

    currentDeckCards = deck;
    currentCardIndex = 0;
    isCardFlipped = false;
    currentQuizQuestions = generateQuizFromNotes(notes, course);
    currentQuizIndex = 0;
    quizScore = 0;

    renderStudyQuizContainer(course, notes);
}

export function renderStudyQuizContainer(course, notesText = '') {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('studyQuizContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Mode Toggle Header -->
            <div class="flex items-center justify-between p-3 bg-zinc-100 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700">
                <div class="flex items-center gap-2">
                    <button type="button" onclick="switchStudyMode('flashcards')" id="modeBtn_flashcards" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${currentStudyMode === 'flashcards' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">🎴 Flashcards (${currentDeckCards.length})</button>
                    <button type="button" onclick="switchStudyMode('quiz')" id="modeBtn_quiz" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${currentStudyMode === 'quiz' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">📝 Practice Quiz (${currentQuizQuestions.length} Qs)</button>
                </div>
                <button type="button" onclick="toggleNotesInputSection()" class="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                    ✍️ Edit / Submit Notes
                </button>
            </div>

            <!-- Notes Quick Editor / Submitter (Collapsible) -->
            <div id="notesInputSection" class="hidden p-4 bg-indigo-50/50 dark:bg-brand-900/60 rounded-xl border border-indigo-200 dark:border-brand-700 space-y-2">
                <label class="block text-xs font-bold text-zinc-800 dark:text-zinc-200">Submit Lecture & Study Notes for ${course?.code || 'Course'}</label>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Paste your class notes, key definitions (e.g. <code>Term: definition</code>), formulas, or summaries to generate custom questions.</p>
                <textarea id="studyNotesInput" rows="5" class="w-full text-xs p-3 rounded-lg border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 leading-relaxed" placeholder="e.g.&#10;Mitochondria: Powerhouse of the cell generating ATP via oxidative phosphorylation.&#10;Photosynthesis: Process by which plants convert light energy into chemical glucose.">${notesText || ''}</textarea>
                <div class="flex justify-end gap-2">
                    <button type="button" onclick="applySubmittedNotes()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition shadow-sm">
                        ⚡ Generate Quizzes & Flashcards from Notes
                    </button>
                </div>
            </div>

            <!-- Main Content Area -->
            <div id="studyModeContent">
                ${currentStudyMode === 'flashcards' ? getFlashcardsHtml() : getQuizHtml()}
            </div>
        </div>
    `;
}

export function toggleNotesInputSection() {
    const sec = document.getElementById('notesInputSection');
    if (sec) sec.classList.toggle('hidden');
}

export async function applySubmittedNotes() {
    const textarea = document.getElementById('studyNotesInput');
    const notes = textarea ? textarea.value.trim() : '';

    if (currentDeckCourseId) {
        const courses = window.localCourses || [];
        const course = courses.find(c => c.id === currentDeckCourseId);
        if (course) {
            course.scratchpad = notes;
            await supabaseClient.from('courses').update({ scratchpad: notes }).eq('id', currentDeckCourseId);
        }
        await generateStudyDeck(currentDeckCourseId, notes);
        fireConfetti();
    }
}

export function switchStudyMode(mode) {
    currentStudyMode = mode;
    const courses = window.localCourses || [];
    const course = courses.find(c => c.id === currentDeckCourseId);
    renderStudyQuizContainer(course, course?.scratchpad || '');
}

export function getFlashcardsHtml() {
    if (currentDeckCards.length === 0) return '<div class="p-6 text-center text-xs text-zinc-400">No flashcards available. Submit notes above to generate.</div>';
    const card = currentDeckCards[currentCardIndex];

    return `
        <div class="space-y-4 text-center">
            <div class="flex justify-between items-center text-xs text-zinc-400 font-bold px-2">
                <span>Card ${currentCardIndex + 1} of ${currentDeckCards.length}</span>
                <span class="text-indigo-500 font-medium">Click card to flip 🔄</span>
            </div>
            <div onclick="flipCurrentCard()" class="cursor-pointer min-h-[170px] p-6 bg-zinc-50 dark:bg-brand-900 border-2 ${isCardFlipped ? 'border-indigo-500 bg-indigo-50/20' : 'border-zinc-200 dark:border-brand-700'} rounded-2xl flex flex-col items-center justify-center shadow-md transition-all hover:scale-[1.01]">
                <div class="text-[11px] uppercase tracking-wider font-extrabold ${isCardFlipped ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'} mb-2">
                    ${isCardFlipped ? '💡 Note Meaning / Definition' : '📖 Term / Note Concept'}
                </div>
                <div class="font-bold text-sm sm:text-base dark:text-white leading-relaxed max-w-md">
                    ${isCardFlipped ? card.definition : card.term}
                </div>
            </div>
            <div class="flex justify-between gap-2">
                <button type="button" onclick="prevFlashcard()" ${currentCardIndex === 0 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 transition"'}>← Prev</button>
                <button type="button" onclick="flipCurrentCard()" class="px-4 py-2 bg-indigo-50 dark:bg-brand-700/60 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold border border-indigo-200 dark:border-brand-600 transition">Flip 🔄</button>
                <button type="button" onclick="nextFlashcard()" ${currentCardIndex === currentDeckCards.length - 1 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"'}>Next →</button>
            </div>
        </div>
    `;
}

export function getQuizHtml() {
    if (currentQuizQuestions.length === 0) return '<div class="p-6 text-center text-xs text-zinc-400">No quiz questions available. Submit notes above to generate.</div>';
    const q = currentQuizQuestions[currentQuizIndex];

    return `
        <div class="space-y-4">
            <div class="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400 font-bold px-1">
                <span>Question ${currentQuizIndex + 1} of ${currentQuizQuestions.length}</span>
                <span class="text-indigo-600 dark:text-indigo-400">Score: ${quizScore} / ${currentQuizIndex}</span>
            </div>

            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700">
                <div class="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1.5">Note Topic: ${q.topic}</div>
                <h4 class="font-bold text-sm text-zinc-900 dark:text-white leading-relaxed">${q.question}</h4>
            </div>

            <div class="space-y-2" id="quizOptionsList">
                ${q.options.map((opt, oIdx) => `
                    <button type="button" onclick="submitQuizAnswer(${oIdx})" class="w-full text-left p-3.5 rounded-xl border border-zinc-200 dark:border-brand-700 bg-white dark:bg-brand-800 hover:border-indigo-500 dark:hover:border-indigo-400 transition text-xs flex items-start gap-3">
                        <span class="w-6 h-6 rounded-full bg-zinc-100 dark:bg-brand-700 text-zinc-600 dark:text-zinc-300 font-bold flex items-center justify-center shrink-0 text-[11px]">${String.fromCharCode(65 + oIdx)}</span>
                        <span class="text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">${opt}</span>
                    </button>
                `).join('')}
            </div>

            <div id="quizFeedbackBox" class="hidden p-3 rounded-xl text-xs"></div>

            <div class="flex justify-between pt-2">
                <button type="button" onclick="prevQuizQuestion()" ${currentQuizIndex === 0 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 transition"'}>← Prev Q</button>
                <button type="button" onclick="nextQuizQuestion()" ${currentQuizIndex === currentQuizQuestions.length - 1 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"'}>Next Q →</button>
            </div>
        </div>
    `;
}

export function submitQuizAnswer(selectedIdx) {
    const q = currentQuizQuestions[currentQuizIndex];
    if (!q) return;

    const feedbackBox = document.getElementById('quizFeedbackBox');
    const options = document.querySelectorAll('#quizOptionsList button');

    options.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === q.correctIndex) {
            btn.className = "w-full text-left p-3.5 rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-950/40 text-xs flex items-start gap-3";
        } else if (idx === selectedIdx) {
            btn.className = "w-full text-left p-3.5 rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-xs flex items-start gap-3";
        }
    });

    if (selectedIdx === q.correctIndex) {
        quizScore++;
        fireConfetti();
        if (feedbackBox) {
            feedbackBox.className = "p-3 rounded-xl text-xs bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300 border border-green-200 dark:border-green-800";
            feedbackBox.innerHTML = `<strong>✔ Correct!</strong> ${q.explanation}`;
            feedbackBox.classList.remove('hidden');
        }
    } else {
        if (feedbackBox) {
            feedbackBox.className = "p-3 rounded-xl text-xs bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
            feedbackBox.innerHTML = `<strong>Note Concept:</strong> ${q.explanation}`;
            feedbackBox.classList.remove('hidden');
        }
    }
}

export function nextQuizQuestion() {
    if (currentQuizIndex < currentQuizQuestions.length - 1) {
        currentQuizIndex++;
        const courses = window.localCourses || [];
        const course = courses.find(c => c.id === currentDeckCourseId);
        renderStudyQuizContainer(course, course?.scratchpad || '');
    }
}

export function prevQuizQuestion() {
    if (currentQuizIndex > 0) {
        currentQuizIndex--;
        const courses = window.localCourses || [];
        const course = courses.find(c => c.id === currentDeckCourseId);
        renderStudyQuizContainer(course, course?.scratchpad || '');
    }
}

export function renderFlashcardView() {
    const courses = window.localCourses || [];
    const course = courses.find(c => c.id === currentDeckCourseId);
    renderStudyQuizContainer(course, course?.scratchpad || '');
}

export function flipCurrentCard() {
    isCardFlipped = !isCardFlipped;
    renderFlashcardView();
}

export function nextFlashcard() {
    if (currentCardIndex < currentDeckCards.length - 1) {
        currentCardIndex++;
        isCardFlipped = false;
        renderFlashcardView();
    }
}

export function prevFlashcard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        isCardFlipped = false;
        renderFlashcardView();
    }
}

// Bind to window & globalThis
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.extractConceptsFromNotes = extractConceptsFromNotes;
_scope.generateQuizFromNotes = generateQuizFromNotes;
_scope.generateQuizQuestions = generateQuizQuestions;
_scope.generateStudyDeck = generateStudyDeck;
_scope.renderStudyQuizContainer = renderStudyQuizContainer;
_scope.toggleNotesInputSection = toggleNotesInputSection;
_scope.applySubmittedNotes = applySubmittedNotes;
_scope.switchStudyMode = switchStudyMode;
_scope.submitQuizAnswer = submitQuizAnswer;
_scope.nextQuizQuestion = nextQuizQuestion;
_scope.prevQuizQuestion = prevQuizQuestion;
_scope.renderFlashcardView = renderFlashcardView;
_scope.flipCurrentCard = flipCurrentCard;
_scope.nextFlashcard = nextFlashcard;
_scope.prevFlashcard = prevFlashcard;
