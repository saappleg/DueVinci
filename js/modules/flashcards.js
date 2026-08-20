// --- AI FLASHCARDS, STUDENT NOTES QUIZ & SM-2 SPACED REPETITION ENGINE ---
import { supabaseClient } from './config.js';
import { fireConfetti } from './utils.js';
import { renderMarkdownToHtml } from './markdown.js';

export let currentDeckCards = [];
export let currentCardIndex = 0;
export let isCardFlipped = false;
export let currentQuizQuestions = [];
export let currentQuizIndex = 0;
export let quizScore = 0;
export let currentStudyMode = 'flashcards'; // 'flashcards' | 'quiz'
export let currentDeckCourseId = null;

/**
 * SuperMemo SM-2 Spaced Repetition Algorithm.
 * @param {Object} card Card state { repetitions, interval, easinessFactor, nextReviewDate }
 * @param {number} quality Grade from 0 (blackout) to 5 (perfect recall). 3=Hard, 4=Good, 5=Easy.
 * @returns {Object} Updated card state
 */
export function calculateSM2Repetition(card = {}, quality = 4) {
    const q = Math.max(0, Math.min(5, quality));
    let repetitions = card.repetitions || 0;
    let interval = card.interval || 1;
    let ef = card.easinessFactor !== undefined ? card.easinessFactor : 2.5;

    // Calculate new easiness factor
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;

    if (q < 3) {
        // Failed recall: reset repetitions and start interval over
        repetitions = 0;
        interval = 1;
    } else {
        // Successful recall
        if (repetitions === 0) {
            interval = 1;
        } else if (repetitions === 1) {
            interval = 6;
        } else {
            interval = Math.round(interval * ef);
        }
        repetitions += 1;
    }

    const nextReviewDate = new Date(Date.now() + (interval * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    return {
        ...card,
        repetitions,
        interval,
        easinessFactor: parseFloat(ef.toFixed(2)),
        nextReviewDate,
        lastReviewed: new Date().toISOString().split('T')[0]
    };
}

/**
 * Extracts key concepts and terms from student submitted notes text.
 */
export function extractConceptsFromNotes(notesText = '') {
    if (!notesText || typeof notesText !== 'string') return [];

    const lines = notesText
        .split(/\r?\n|•|\*|;|--+/)
        .map(l => l.replace(/^[\s\d.\-–—:>)\]]+/, '').trim())
        .filter(l => l.length > 5 && !l.startsWith('http'));

    const concepts = [];
    for (const line of lines) {
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
 * Generates multiple choice questions.
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
 * Loads stored SM-2 flashcards mastery database from localStorage.
 */
export function getSavedDeckMastery(courseId) {
    if (typeof localStorage === 'undefined' || !courseId) return {};
    const key = `duevinci_flashcards_mastery_${courseId}`;
    try {
        return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
        return {};
    }
}

/**
 * Persists updated SM-2 flashcard state to localStorage.
 */
export function saveCardMastery(courseId, cardId, updatedCard) {
    if (typeof localStorage === 'undefined' || !courseId || !cardId) return;
    const key = `duevinci_flashcards_mastery_${courseId}`;
    const all = getSavedDeckMastery(courseId);
    all[cardId] = {
        repetitions: updatedCard.repetitions,
        interval: updatedCard.interval,
        easinessFactor: updatedCard.easinessFactor,
        nextReviewDate: updatedCard.nextReviewDate,
        lastReviewed: updatedCard.lastReviewed
    };
    localStorage.setItem(key, JSON.stringify(all));
}

/**
 * Generates flashcards deck and practice quiz from student notes with SM-2 Spaced Repetition.
 */
export async function generateStudyDeck(courseId, submittedNotes = null) {
    if (typeof document === 'undefined') return;
    const courses = window.localCourses || [];
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    currentDeckCourseId = courseId;
    const savedMastery = getSavedDeckMastery(courseId);

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
        concepts.forEach((c, idx) => {
            const cardId = `c_${idx}_${c.term.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            const m = savedMastery[cardId] || { repetitions: 0, interval: 1, easinessFactor: 2.5 };
            deck.push({
                id: cardId,
                term: `${course.code}: ${c.term}`,
                definition: c.definition,
                ...m
            });
        });
    } else {
        deck.push(
            {
                id: 'default_1',
                term: `📝 Add Student Notes for ${course.code}`,
                definition: `You haven't added lecture notes yet! Open the "Scratchpad" tab or paste notes in the box below to generate customized quizzes and flashcards directly from your class notes with math ($E=mc^2$) and SM-2 Spaced Repetition.`,
                repetitions: 0, interval: 1, easinessFactor: 2.5
            },
            {
                id: 'default_2',
                term: `${course.code}: Active Recall & Spaced Repetition`,
                definition: 'Testing yourself at optimal time intervals (SM-2 Algorithm) boosts retention up to 150% compared to passive re-reading.',
                repetitions: 0, interval: 1, easinessFactor: 2.5
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
                    <button type="button" onclick="switchStudyMode('flashcards')" id="modeBtn_flashcards" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${currentStudyMode === 'flashcards' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">🎴 Spaced Flashcards (${currentDeckCards.length})</button>
                    <button type="button" onclick="switchStudyMode('quiz')" id="modeBtn_quiz" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${currentStudyMode === 'quiz' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">📝 Practice Quiz (${currentQuizQuestions.length} Qs)</button>
                </div>
                <button type="button" onclick="toggleNotesInputSection()" class="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1">
                    ✍️ Notes & Formulas
                </button>
            </div>

            <!-- Notes Quick Editor / Submitter (Collapsible) -->
            <div id="notesInputSection" class="hidden p-4 bg-indigo-50/50 dark:bg-brand-900/60 rounded-xl border border-indigo-200 dark:border-brand-700 space-y-2">
                <label class="block text-xs font-bold text-zinc-800 dark:text-zinc-200">Submit Lecture & Study Notes (Markdown & LaTeX Math Supported)</label>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Type notes, definitions (e.g. <code>Term: definition</code>), and math formulas (e.g. <code>$E = mc^2$</code> or <code>$$\\Delta x$$</code>).</p>
                <textarea id="studyNotesInput" rows="5" class="w-full text-xs p-3 rounded-lg border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono" placeholder="e.g.&#10;Mitochondria: Cellular powerhouse generating ATP via oxidative phosphorylation.&#10;Kinetic Energy: $KE = \\frac{1}{2}mv^2$ energy possessed by an object due to motion.">${notesText || ''}</textarea>
                <div class="flex justify-end gap-2">
                    <button type="button" onclick="applySubmittedNotes()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition shadow-sm">
                        ⚡ Generate Spaced Decks & Quizzes
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

export function rateFlashcardSM2(qualityRating) {
    const card = currentDeckCards[currentCardIndex];
    if (!card) return;

    const updated = calculateSM2Repetition(card, qualityRating);
    currentDeckCards[currentCardIndex] = updated;

    if (currentDeckCourseId && card.id) {
        saveCardMastery(currentDeckCourseId, card.id, updated);
    }

    if (qualityRating >= 4) {
        fireConfetti();
    }

    nextFlashcard();
}

export function getFlashcardsHtml() {
    if (currentDeckCards.length === 0) return '<div class="p-6 text-center text-xs text-zinc-400">No flashcards available. Submit notes above to generate.</div>';
    const card = currentDeckCards[currentCardIndex];
    const reps = card.repetitions || 0;
    const interval = card.interval || 1;
    const masteryBadge = reps === 0 ? '🌱 New' : (reps < 3 ? `⚡ Learning (${interval}d)` : `🏆 Mastered (${interval}d)`);

    const rawContent = isCardFlipped ? card.definition : card.term;
    const formattedContent = renderMarkdownToHtml(rawContent);

    return `
        <div class="space-y-4 text-center">
            <div class="flex justify-between items-center text-xs text-zinc-400 font-bold px-2">
                <span class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-brand-700 text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">${masteryBadge}</span>
                <span>Card ${currentCardIndex + 1} of ${currentDeckCards.length}</span>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="speakCurrentFlashcard()" title="Read aloud" class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-brand-700 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center gap-1 transition">
                        🔊 <span class="hidden sm:inline">Listen</span>
                    </button>
                    <button type="button" onclick="exportFlashcardsAsCSV()" title="Export Deck to Anki / CSV" class="p-1 rounded hover:bg-zinc-200 dark:hover:bg-brand-700 text-zinc-500 hover:text-indigo-600 dark:hover:text-white text-xs font-bold transition">
                        📥 CSV
                    </button>
                </div>
            </div>

            <div onclick="flipCurrentCard()" class="cursor-pointer min-h-[180px] p-6 bg-zinc-50 dark:bg-brand-900 border-2 ${isCardFlipped ? 'border-indigo-500 bg-indigo-50/20' : 'border-zinc-200 dark:border-brand-700'} rounded-2xl flex flex-col items-center justify-center shadow-md transition-all hover:scale-[1.01]">
                <div class="text-[11px] uppercase tracking-wider font-extrabold ${isCardFlipped ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'} mb-2">
                    ${isCardFlipped ? '💡 Note Meaning & Concept' : '📖 Term / Note Concept'}
                </div>
                <div class="font-bold text-sm sm:text-base dark:text-white leading-relaxed max-w-md">
                    ${formattedContent}
                </div>
            </div>

            ${isCardFlipped ? `
                <!-- SM-2 Spaced Repetition Response Rating Buttons -->
                <div class="p-3 bg-zinc-100 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700 space-y-1.5">
                    <div class="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Rate Recall for Spaced Scheduling (SM-2):</div>
                    <div class="grid grid-cols-4 gap-2">
                        <button type="button" onclick="rateFlashcardSM2(1)" class="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold transition">
                            ❌ Again<br/><span class="text-[10px] opacity-75">1 day</span>
                        </button>
                        <button type="button" onclick="rateFlashcardSM2(3)" class="p-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold transition">
                            ⚠️ Hard<br/><span class="text-[10px] opacity-75">${Math.max(1, Math.round(interval * 1.2))}d</span>
                        </button>
                        <button type="button" onclick="rateFlashcardSM2(4)" class="p-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition">
                            👍 Good<br/><span class="text-[10px] opacity-75">${Math.max(6, Math.round(interval * (card.easinessFactor || 2.5)))}d</span>
                        </button>
                        <button type="button" onclick="rateFlashcardSM2(5)" class="p-2 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold transition">
                            ⭐ Easy<br/><span class="text-[10px] opacity-75">${Math.max(8, Math.round(interval * (card.easinessFactor || 2.5) * 1.3))}d</span>
                        </button>
                    </div>
                </div>
            ` : `
                <div class="flex justify-between gap-2">
                    <button type="button" onclick="prevFlashcard()" ${currentCardIndex === 0 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 transition"'}>← Prev</button>
                    <button type="button" onclick="flipCurrentCard()" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm">Flip Card 🔄</button>
                    <button type="button" onclick="nextFlashcard()" ${currentCardIndex === currentDeckCards.length - 1 ? 'disabled class="opacity-40 px-4 py-2 bg-zinc-200 dark:bg-brand-700 rounded-lg text-xs font-bold"' : 'class="px-4 py-2 bg-zinc-200 dark:bg-brand-700 hover:bg-zinc-300 dark:hover:bg-brand-600 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 transition"'}>Next →</button>
                </div>
            `}
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
                <span class="text-indigo-600 dark:text-indigo-400 font-bold">Score: ${quizScore} / ${currentQuizIndex}</span>
            </div>

            <div class="p-4 bg-zinc-50 dark:bg-brand-900 rounded-xl border border-zinc-200 dark:border-brand-700">
                <div class="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1.5">Note Topic: ${q.topic}</div>
                <h4 class="font-bold text-sm text-zinc-900 dark:text-white leading-relaxed">${renderMarkdownToHtml(q.question)}</h4>
            </div>

            <div class="space-y-2" id="quizOptionsList">
                ${q.options.map((opt, oIdx) => `
                    <button type="button" onclick="submitQuizAnswer(${oIdx})" class="w-full text-left p-3.5 rounded-xl border border-zinc-200 dark:border-brand-700 bg-white dark:bg-brand-800 hover:border-indigo-500 dark:hover:border-indigo-400 transition text-xs flex items-start gap-3">
                        <span class="w-6 h-6 rounded-full bg-zinc-100 dark:bg-brand-700 text-zinc-600 dark:text-zinc-300 font-bold flex items-center justify-center shrink-0 text-[11px]">${String.fromCharCode(65 + oIdx)}</span>
                        <span class="text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">${renderMarkdownToHtml(opt)}</span>
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
            feedbackBox.innerHTML = `<strong>✔ Correct!</strong> ${renderMarkdownToHtml(q.explanation)}`;
            feedbackBox.classList.remove('hidden');
        }
    } else {
        if (feedbackBox) {
            feedbackBox.className = "p-3 rounded-xl text-xs bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
            feedbackBox.innerHTML = `<strong>Note Concept:</strong> ${renderMarkdownToHtml(q.explanation)}`;
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

export function speakCurrentFlashcard() {
    if (currentDeckCards.length === 0) return;
    const card = currentDeckCards[currentCardIndex];
    const textToSpeak = isCardFlipped 
        ? `Definition: ${card.definition}` 
        : `Term: ${card.term}`;
    
    if (typeof window !== 'undefined' && window.speakText) {
        window.speakText(textToSpeak);
    }
}

export function exportFlashcardsAsCSV(courseId = currentDeckCourseId) {
    if (currentDeckCards.length === 0) {
        alert('No flashcards to export! Add notes to generate a deck first.');
        return;
    }

    const courses = window.localCourses || [];
    const course = courses.find(c => c.id === courseId);
    const courseCode = course ? course.code.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Deck';

    let csvContent = "Front,Back\n";
    currentDeckCards.forEach(c => {
        const front = `"${(c.term || '').replace(/"/g, '""')}"`;
        const back = `"${(c.definition || '').replace(/"/g, '""')}"`;
        csvContent += `${front},${back}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${courseCode}_Flashcards_Anki.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Bind to window & globalThis
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.calculateSM2Repetition = calculateSM2Repetition;
_scope.rateFlashcardSM2 = rateFlashcardSM2;
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
_scope.speakCurrentFlashcard = speakCurrentFlashcard;
_scope.exportFlashcardsAsCSV = exportFlashcardsAsCSV;
