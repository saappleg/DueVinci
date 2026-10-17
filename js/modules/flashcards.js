// --- AI FLASHCARDS, STUDENT NOTES QUIZ & SM-2 SPACED REPETITION ENGINE ---
import { supabaseClient } from './config.js';
import { escapeHtml, fireConfetti, getLocalDateKey } from './utils.js';
import { renderMarkdownToHtml } from './markdown.js';

export let currentDeckCards = [];
export let currentCardIndex = 0;
export let isCardFlipped = false;
export let currentQuizQuestions = [];
export let currentQuizIndex = 0;
export let quizScore = 0;
export let currentStudyMode = 'flashcards'; // 'flashcards' | 'quiz' | 'mock-exam'
export let currentDeckCourseId = null;
export let currentMockExam = null;
let currentMockExamQuestionPool = [];
let mockExamTimerInterval = null;
let mockExamKeyHandler = null;
let mockExamBeforeUnloadHandler = null;
let mockExamNotice = '';

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

    const reviewedAt = new Date();
    const nextReviewAt = new Date(reviewedAt);
    nextReviewAt.setDate(nextReviewAt.getDate() + interval);
    const nextReviewDate = getLocalDateKey(nextReviewAt);

    return {
        ...card,
        repetitions,
        interval,
        easinessFactor: parseFloat(ef.toFixed(2)),
        nextReviewDate,
        lastReviewed: getLocalDateKey(reviewedAt)
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

export function getNoteDerivedMockExamQuestions(notesText, course = {}) {
    const concepts = extractConceptsFromNotes(notesText);
    if (concepts.length < 4) return [];
    const noteDefinitions = new Set(concepts.map((concept) => concept.definition.trim().toLocaleLowerCase()));
    return generateQuizFromNotes(notesText, course).filter((question) => {
        const options = Array.isArray(question.options) ? question.options : [];
        return options.length === 4
            && typeof question.explanation === 'string'
            && Boolean(question.explanation.trim())
            && Number.isInteger(question.correctIndex)
            && question.correctIndex >= 0
            && question.correctIndex < options.length
            && new Set(options.map((option) => String(option).trim().toLocaleLowerCase())).size === options.length
            && options.every((option) => noteDefinitions.has(String(option).trim().toLocaleLowerCase()));
    });
}

function shuffleItems(items, random = Math.random) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const sample = Number(random());
        const unit = Number.isFinite(sample) && sample >= 0 && sample < 1 ? sample : 0.5;
        const swapIndex = Math.floor(unit * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

export function buildTimedMockExam(questionPool, questionCount, durationMinutes, random = Math.random) {
    if (!Array.isArray(questionPool) || questionPool.length === 0) throw new Error('No note-derived questions are available.');
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > questionPool.length) {
        throw new Error(`Choose between 1 and ${questionPool.length} questions.`);
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 60) {
        throw new Error('Choose a time limit from 1 to 60 minutes.');
    }

    const selectedQuestions = shuffleItems(questionPool, random).slice(0, questionCount);
    const questions = selectedQuestions.map((question) => {
        const options = Array.isArray(question?.options) ? question.options.map((option) => String(option)) : [];
        const correctIndex = question?.correctIndex;
        if (typeof question?.question !== 'string' || !question.question.trim()
            || typeof question.explanation !== 'string' || !question.explanation.trim()
            || options.length < 2
            || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length
            || options.some((option) => !option.trim())
            || new Set(options.map((option) => option.trim().toLocaleLowerCase())).size !== options.length) {
            throw new Error('A question in this note-derived pool is incomplete or ambiguous.');
        }
        const correctAnswer = options[correctIndex];
        const shuffledOptions = shuffleItems(options, random);
        return {
            ...question,
            options: shuffledOptions,
            correctIndex: shuffledOptions.indexOf(correctAnswer)
        };
    });

    return {
        questions: shuffleItems(questions, random),
        durationSeconds: durationMinutes * 60
    };
}

export function scoreTimedMockExam(questions = [], answers = []) {
    const total = Array.isArray(questions) ? questions.length : 0;
    const safeAnswers = Array.isArray(answers) ? answers : [];
    let correct = 0;
    let answered = 0;
    if (total > 0) {
        questions.forEach((question, index) => {
            if (!question || !Array.isArray(question.options)) return;
            const answer = safeAnswers[index];
            if (Number.isInteger(answer) && answer >= 0 && answer < question.options.length) {
                answered += 1;
                if (answer === question.correctIndex) correct += 1;
            }
        });
    }
    return { correct, answered, total, unanswered: total - answered, percent: total ? Math.round((correct / total) * 100) : 0 };
}

export function getMockExamRemainingSeconds(endsAt, now = Date.now()) {
    const end = Number(endsAt);
    const current = Number(now);
    if (!Number.isFinite(end) || !Number.isFinite(current)) return 0;
    return Math.max(0, Math.ceil((end - current) / 1000));
}

function normalizeAnkiField(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function parseDelimitedRecords(text, delimiter) {
    const records = [];
    let row = [];
    let field = '';
    let quoted = false;
    let afterQuote = false;
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                field += '"';
                index++;
            } else if (character === '"') {
                quoted = false;
                afterQuote = true;
            } else {
                field += character === '\r' && text[index + 1] === '\n' ? (index++, '\n') : character;
            }
        } else if (afterQuote) {
            if (character === delimiter) {
                row.push(field);
                field = '';
                afterQuote = false;
            } else if (character === '\n' || character === '\r') {
                if (character === '\r' && text[index + 1] === '\n') index++;
                row.push(field);
                if (row.some((cell) => cell.trim())) records.push(row);
                row = [];
                field = '';
                afterQuote = false;
            } else {
                return { records: [], error: 'Unexpected characters after a quoted field.' };
            }
        } else if (character === '"') {
            if (field.length > 0) return { records: [], error: 'A quote can only start an empty field.' };
            quoted = true;
        } else if (character === delimiter) {
            row.push(field);
            field = '';
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && text[index + 1] === '\n') index++;
            row.push(field);
            if (row.some((cell) => cell.trim())) records.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }
    if (quoted) return { records: [], error: 'A quoted field is not closed.' };
    row.push(field);
    if (row.some((cell) => cell.trim())) records.push(row);
    return { records, error: null };
}

function ankiDelimiterFromHeader(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'tab' || normalized === '\\t') return '\t';
    if (normalized === 'comma') return ',';
    if (normalized === 'semicolon') return ';';
    if (normalized === 'pipe') return '|';
    if (normalized === 'space') return ' ';
    if (normalized === 'colon') return ':';
    if (normalized.length === 1) return normalized;
    return null;
}

function detectAnkiDelimiter(text) {
    let quoted = false;
    const counts = new Map([['\t', 0], [',', 0], [';', 0], ['|', 0]]);
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '"' && text[index + 1] === '"' && quoted) {
            index++;
        } else if (character === '"') {
            quoted = !quoted;
        } else if (!quoted && (character === '\n' || character === '\r')) {
            break;
        } else if (!quoted && counts.has(character)) {
            counts.set(character, counts.get(character) + 1);
        }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[1]
        ? [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0]
        : '\t';
}

export function parseAnkiTextImport(inputText, { maxCards = 500, maxFieldLength = 5000, maxFileLength = 2_000_000 } = {}) {
    if (typeof inputText !== 'string' || !inputText.trim()) return { cards: [], invalidRows: 0, duplicateRows: 0, conflictingRows: 0, error: 'The selected file is empty.' };
    if (inputText.length > maxFileLength) return { cards: [], invalidRows: 0, duplicateRows: 0, conflictingRows: 0, error: 'This text file exceeds the configured import size limit.' };

    const lines = inputText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const headers = new Map();
    let firstDataLine = 0;
    while (firstDataLine < lines.length) {
        const line = lines[firstDataLine];
        if (!line.trim()) {
            firstDataLine++;
            continue;
        }
        if (!line.startsWith('#')) break;
        const colonIndex = line.indexOf(':');
        if (colonIndex > 1) headers.set(line.slice(1, colonIndex).trim().toLowerCase(), line.slice(colonIndex + 1));
        firstDataLine++;
    }

    const dataText = lines.slice(firstDataLine).join('\n');
    const delimiter = ankiDelimiterFromHeader(headers.get('separator')) || detectAnkiDelimiter(dataText);
    const parsed = parseDelimitedRecords(dataText, delimiter);
    if (parsed.error) return { cards: [], invalidRows: 0, duplicateRows: 0, conflictingRows: 0, error: parsed.error };
    const records = parsed.records;
    let columns = null;
    if (headers.has('columns')) {
        const parsedColumns = parseDelimitedRecords(headers.get('columns'), delimiter);
        if (parsedColumns.error) return { cards: [], invalidRows: 0, duplicateRows: 0, conflictingRows: 0, error: parsedColumns.error };
        columns = parsedColumns.records[0] || [];
    } else if (records.length >= 2) {
        const candidateColumns = records[0].map((column) => column.trim().toLowerCase());
        if (['front', 'term', 'question'].includes(candidateColumns[0])
            && ['back', 'definition', 'answer'].includes(candidateColumns[1])) {
            columns = records.shift();
        }
    }

    const specialIndices = new Set();
    for (const headerName of ['guid column', 'deck column', 'notetype column', 'tags column']) {
        const columnNumber = Number.parseInt(headers.get(headerName), 10);
        if (Number.isInteger(columnNumber) && columnNumber > 0) specialIndices.add(columnNumber - 1);
    }
    const declaredGuidColumn = Number.parseInt(headers.get('guid column'), 10);
    const namedGuidColumn = columns?.findIndex((column) => column.trim().toLowerCase() === 'guid') ?? -1;
    const guidColumn = Number.isInteger(declaredGuidColumn) && declaredGuidColumn > 0
        ? declaredGuidColumn - 1
        : namedGuidColumn;
    const specialNames = new Set(['tag', 'tags', 'guid', 'deck', 'notetype', 'note type']);
    const regularIndices = columns
        ? columns.map((column, index) => ({ column: column.trim().toLowerCase(), index }))
            .filter(({ column, index }) => !specialNames.has(column) && !specialIndices.has(index))
            .map(({ index }) => index)
        : records[0]?.map((_, index) => index).filter((index) => !specialIndices.has(index)) || [];
    const findColumn = (names) => columns?.findIndex((column, index) => names.includes(column.trim().toLowerCase()) && !specialIndices.has(index)) ?? -1;
    const frontIndex = findColumn(['front', 'term', 'question', 'prompt']);
    const backIndex = findColumn(['back', 'definition', 'answer', 'response']);
    const frontColumn = frontIndex >= 0 ? frontIndex : regularIndices[0];
    const backColumn = backIndex >= 0 ? backIndex : regularIndices.find((index) => index !== frontColumn);
    if (!Number.isInteger(frontColumn) || !Number.isInteger(backColumn)) {
        return { cards: [], invalidRows: records.length, duplicateRows: 0, conflictingRows: 0, error: 'Choose a text file with at least two note fields.' };
    }

    const cards = [];
    let invalidRows = 0;
    let duplicateRows = 0;
    let conflictingRows = 0;
    for (const record of records) {
        if (record[0]?.trim().startsWith('#') && record.length === 1) continue;
        const term = String(record[frontColumn] || '').trim();
        const definition = String(record[backColumn] || '').trim();
        const guid = Number.isInteger(guidColumn) && guidColumn >= 0
            ? String(record[guidColumn] || '').trim()
            : '';
        if (!term || !definition || term.length > maxFieldLength || definition.length > maxFieldLength || guid.length > 200) {
            invalidRows++;
            continue;
        }
        const termKey = normalizeAnkiField(term);
        const existing = guid
            ? cards.find((card) => card.guid === guid) || cards.find((card) => !card.guid && normalizeAnkiField(card.term) === termKey)
            : cards.find((card) => normalizeAnkiField(card.term) === termKey);
        if (existing) {
            if (normalizeAnkiField(existing.term) === termKey
                && normalizeAnkiField(existing.definition) === normalizeAnkiField(definition)) duplicateRows++;
            else conflictingRows++;
            continue;
        }
        if (cards.length >= maxCards) {
            invalidRows++;
            continue;
        }
        cards.push({ term, definition, ...(guid ? { guid } : {}) });
    }

    return { cards, invalidRows, duplicateRows, conflictingRows, error: null };
}

function serializeAnkiTextField(value) {
    const field = String(value ?? '').replace(/\r\n?/g, '\n');
    return /[\t\n"]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function buildAnkiTextExport(cards = [], courseCode = 'Course') {
    if (!Array.isArray(cards) || !cards.length) throw new Error('There are no flashcards to export.');
    const safeCourseCode = String(courseCode || 'Course').replace(/[\t\r\n]/g, ' ').replace(/\s+/g, ' ').trim().replace(/::/g, ':') || 'Course';
    const rows = cards.map((card) => {
        const front = String(card?.term || '').trim();
        const back = String(card?.definition || '').trim();
        const guid = String(card?.ankiGuid || card?.guid || '').trim();
        if (!front || !back) throw new Error('Every card needs a front and back before export.');
        return `${serializeAnkiTextField(guid)}\t${serializeAnkiTextField(front)}\t${serializeAnkiTextField(back)}`;
    });
    return `#separator:Tab\n#html:false\n#deck:DueVinci::${safeCourseCode}\n#guid column:1\n#columns:GUID\tFront\tBack\n${rows.join('\n')}\n`;
}

function stableAnkiCardId(term, guid = '') {
    const normalized = guid ? `guid:${String(guid).trim()}` : `term:${normalizeAnkiField(term)}`;
    let firstHash = 2166136261;
    let secondHash = 2246822519;
    for (let index = 0; index < normalized.length; index++) {
        const code = normalized.charCodeAt(index);
        firstHash = Math.imul(firstHash ^ code, 16777619);
        secondHash = Math.imul(secondHash ^ code, 3266489917);
    }
    return `anki_${(firstHash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0).toString(16).padStart(8, '0')}`;
}

export function mergeAnkiCardsIntoDeck(existingDeck = [], existingMastery = {}, incomingCards = [], updatedAt = new Date().toISOString()) {
    const cards = Array.isArray(existingDeck)
        ? existingDeck.filter((card) => card && typeof card === 'object' && !Array.isArray(card)).map((card) => ({ ...card }))
        : [];
    const mastery = Object.create(null);
    if (existingMastery && typeof existingMastery === 'object' && !Array.isArray(existingMastery)) {
        Object.entries(existingMastery).forEach(([cardId, state]) => { mastery[cardId] = state; });
    }
    let added = 0;
    let updated = 0;
    let duplicates = 0;
    let conflicts = 0;

    for (const incoming of Array.isArray(incomingCards) ? incomingCards : []) {
        const term = String(incoming?.term || '').trim();
        const definition = String(incoming?.definition || '').trim();
        const guid = String(incoming?.guid || incoming?.ankiGuid || '').trim();
        if (!term || !definition || term.length > 5000 || definition.length > 5000 || guid.length > 200) {
            conflicts++;
            continue;
        }
        const termKey = normalizeAnkiField(term);
        const masteryEntries = Object.entries(mastery)
            .filter(([, state]) => state?.source === 'anki')
            .map(([id, state]) => ({ ...state, id }));
        const exactGuidCard = guid
            ? cards.find((card) => card.source === 'anki' && card.ankiGuid === guid)
                || masteryEntries.find((card) => card.ankiGuid === guid)
            : null;
        const legacyOrFrontCard = (list) => list.find((card) => normalizeAnkiField(card.term) === termKey
            && (!guid || !card.ankiGuid));
        const existingCard = exactGuidCard
            || legacyOrFrontCard(cards.filter((card) => card.source === 'anki'))
            || legacyOrFrontCard(masteryEntries)
            || legacyOrFrontCard(cards.filter((card) => card.source !== 'anki'));
        if (existingCard) {
            if (normalizeAnkiField(existingCard.term) === termKey
                && normalizeAnkiField(existingCard.definition) === normalizeAnkiField(definition)) {
                duplicates++;
                continue;
            }
            if (existingCard.source !== 'anki') {
                conflicts++;
                continue;
            }
            const previous = mastery[existingCard.id] || existingCard;
            const updatedCard = {
                ...previous,
                id: existingCard.id,
                source: 'anki',
                term,
                definition,
                ...(guid ? { ankiGuid: guid } : {}),
                contentUpdatedAt: updatedAt,
                lastReviewedAt: updatedAt
            };
            mastery[existingCard.id] = updatedCard;
            const deckCard = cards.find((card) => String(card.id) === String(existingCard.id));
            if (deckCard) Object.assign(deckCard, updatedCard);
            else if (!cards.some((card) => card.source !== 'anki' && normalizeAnkiField(card.term) === termKey)) cards.push(updatedCard);
            updated++;
            continue;
        }

        const id = stableAnkiCardId(term, guid);
        const previous = mastery[id] || cards.find((card) => card.id === id);
        if (previous && (previous.source !== 'anki' || normalizeAnkiField(previous.term) !== normalizeAnkiField(term))) {
            conflicts++;
            continue;
        }
        const importedCard = {
            id,
            source: 'anki',
            term,
            definition,
            ...(guid ? { ankiGuid: guid } : {}),
            repetitions: previous?.repetitions || 0,
            interval: previous?.interval || 1,
            easinessFactor: previous?.easinessFactor || 2.5,
            nextReviewDate: previous?.nextReviewDate || null,
            lastReviewed: previous?.lastReviewed || null,
            lastReviewedAt: previous?.lastReviewedAt || updatedAt,
            contentUpdatedAt: updatedAt
        };
        mastery[id] = importedCard;
        cards.push(importedCard);
        if (previous) updated++;
        else added++;
    }
    return { cards, mastery, added, updated, duplicates, conflicts };
}

function importedAnkiCardsFromMastery(mastery = {}) {
    return Object.entries(mastery)
        .filter(([, value]) => value?.source === 'anki' && value.term && value.definition)
        .map(([id, value]) => ({ id, ...value }));
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
const MASTERY_STORAGE_PREFIX = 'duevinci_flashcards_mastery_';
const masterySaveTimers = new Map();

function currentLocalUserId() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const user = JSON.parse(localStorage.getItem('duevinci_offline_user') || 'null');
        return typeof user?.id === 'string' && user.id ? user.id : null;
    } catch { return null; }
}

function masteryStorageKey(userId, courseId) {
    return userId && courseId ? `${MASTERY_STORAGE_PREFIX}${userId}_${courseId}` : null;
}

function pendingMasteryKey(userId, courseId) {
    return userId && courseId ? `${MASTERY_STORAGE_PREFIX}pending_${userId}_${courseId}` : null;
}

function normalizedDate(value, includeTime = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return includeTime ? new Date(parsed).toISOString() : value.slice(0, 10);
}

export function sanitizeFlashcardMastery(mastery = {}) {
    if (!mastery || typeof mastery !== 'object' || Array.isArray(mastery)) return {};
    const sanitized = Object.create(null);
    Object.entries(mastery).forEach(([cardId, value]) => {
        if (!cardId || cardId.length > 200 || !value || typeof value !== 'object' || Array.isArray(value)) return;
        const numberOr = (candidate, fallback, min, max, integer = false) => {
            const number = Number(candidate);
            if (!Number.isFinite(number)) return fallback;
            const bounded = Math.max(min, Math.min(max, number));
            return integer ? Math.round(bounded) : bounded;
        };
        const lastReviewedAt = normalizedDate(value.lastReviewedAt, true)
            || normalizedDate(value.lastReviewed, true);
        const cardState = {
            repetitions: numberOr(value.repetitions, 0, 0, 100000, true),
            interval: numberOr(value.interval, 1, 1, 36500, true),
            easinessFactor: numberOr(value.easinessFactor, 2.5, 1.3, 5),
            nextReviewDate: normalizedDate(value.nextReviewDate),
            lastReviewed: normalizedDate(value.lastReviewed),
            lastReviewedAt,
        };
        if (value.source === 'anki'
            && typeof value.term === 'string' && value.term.trim()
            && typeof value.definition === 'string' && value.definition.trim()
            && value.term.length <= 5000 && value.definition.length <= 5000) {
            cardState.source = 'anki';
            cardState.term = value.term;
            cardState.definition = value.definition;
            if (typeof value.ankiGuid === 'string' && value.ankiGuid.trim() && value.ankiGuid.length <= 200) {
                cardState.ankiGuid = value.ankiGuid.trim();
            }
            cardState.contentUpdatedAt = normalizedDate(value.contentUpdatedAt, true);
        }
        sanitized[cardId] = cardState;
    });
    return sanitized;
}

export function getSavedDeckMastery(courseId, userId = currentLocalUserId()) {
    if (typeof localStorage === 'undefined' || !courseId || !userId) return {};
    const key = masteryStorageKey(userId, courseId);
    try {
        return sanitizeFlashcardMastery(JSON.parse(localStorage.getItem(key) || '{}'));
    } catch {
        return {};
    }
}

export function mergeFlashcardMastery(localMastery = {}, cloudMastery = {}) {
    const merged = Object.assign(Object.create(null), sanitizeFlashcardMastery(cloudMastery));
    Object.entries(sanitizeFlashcardMastery(localMastery)).forEach(([cardId, local]) => {
        const remote = merged[cardId];
        const localTime = Date.parse(local?.lastReviewedAt || local?.lastReviewed || '') || 0;
        const remoteTime = Date.parse(remote?.lastReviewedAt || remote?.lastReviewed || '') || 0;
        if (!remote || localTime >= remoteTime) merged[cardId] = local;
    });
    return merged;
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function storeDeckMasteryLocally(courseId, mastery, userId = currentLocalUserId()) {
    if (typeof localStorage === 'undefined' || !courseId || !userId) return;
    const key = masteryStorageKey(userId, courseId);
    try {
        localStorage.setItem(key, JSON.stringify(sanitizeFlashcardMastery(mastery)));
    } catch (error) {
        console.warn('Could not save flashcard review progress on this device:', error);
    }
}

async function authenticatedUserId() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
        const { data, error } = await supabaseClient.auth.getUser();
        return error ? null : data?.user?.id || null;
    } catch {
        return null;
    }
}

async function saveDeckMasteryToCloud(userId, courseId, mastery) {
    const authenticatedId = await authenticatedUserId();
    if (!userId || authenticatedId !== userId) return false;
    const sent = sanitizeFlashcardMastery(mastery);
    const { data, error } = await supabaseClient.rpc('merge_flashcard_mastery', {
        p_user_id: userId,
        p_course_id: String(courseId),
        p_mastery: sent,
    });
    if (error) throw error;
    const current = getSavedDeckMastery(courseId, userId);
    const reconciled = mergeFlashcardMastery(current, data || {});
    storeDeckMasteryLocally(courseId, reconciled, userId);
    if (stableJson(current) === stableJson(sent)) {
        try { localStorage.removeItem(pendingMasteryKey(userId, courseId)); } catch { /* The cloud copy is saved. */ }
    } else {
        try { localStorage.setItem(pendingMasteryKey(userId, courseId), 'true'); } catch { /* A future deck load can retry. */ }
    }
    return true;
}

function scheduleDeckMasteryCloudSave(courseId, mastery) {
    const userId = currentLocalUserId();
    if (!userId) return;
    try { localStorage.setItem(pendingMasteryKey(userId, courseId), 'true'); } catch { /* Keep the device copy even if sync metadata cannot be saved. */ }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const key = `${userId}:${courseId}`;
    clearTimeout(masterySaveTimers.get(key));
    masterySaveTimers.set(key, setTimeout(() => {
        masterySaveTimers.delete(key);
        saveDeckMasteryToCloud(userId, courseId, mastery).catch((error) => {
            console.warn('Flashcard review progress will sync when the connection is available:', error?.message || error);
        });
    }, 400));
}

export async function loadDeckMastery(courseId) {
    const localUserId = currentLocalUserId();
    const userId = await authenticatedUserId();
    if (localUserId && userId && localUserId !== userId) return {};
    const local = getSavedDeckMastery(courseId, userId || localUserId);
    if (!userId) return local;
    try {
        const { data, error } = await supabaseClient.from('flashcard_mastery')
            .select('mastery').eq('course_id', String(courseId)).maybeSingle();
        if (error) return local;
        const cloud = sanitizeFlashcardMastery(data?.mastery || {});
        const merged = mergeFlashcardMastery(local, cloud);
        storeDeckMasteryLocally(courseId, merged, userId);
        if (stableJson(merged) !== stableJson(cloud)) scheduleDeckMasteryCloudSave(courseId, merged);
        else {
            try { localStorage.removeItem(pendingMasteryKey(userId, courseId)); } catch { /* Cloud is current. */ }
        }
        return merged;
    } catch {
        return local;
    }
}

export function collectLocalFlashcardMastery() {
    const mastery = Object.create(null);
    if (typeof localStorage === 'undefined') return mastery;
    const userId = currentLocalUserId();
    if (!userId) return mastery;
    const prefix = `${MASTERY_STORAGE_PREFIX}${userId}_`;
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const courseId = key.slice(prefix.length);
        try {
            mastery[courseId] = sanitizeFlashcardMastery(JSON.parse(localStorage.getItem(key) || '{}'));
        } catch { /* Skip malformed local entries and preserve the rest of the backup. */ }
    }
    return mastery;
}

export function restoreFlashcardMastery(masteryByCourse = {}) {
    const userId = currentLocalUserId();
    if (!userId || !masteryByCourse || typeof masteryByCourse !== 'object' || Array.isArray(masteryByCourse)) return;
    Object.entries(masteryByCourse).forEach(([courseId, mastery]) => {
        if (!courseId || courseId.length > 200 || !mastery || typeof mastery !== 'object' || Array.isArray(mastery)) return;
        const safeMastery = sanitizeFlashcardMastery(mastery);
        storeDeckMasteryLocally(courseId, safeMastery, userId);
        scheduleDeckMasteryCloudSave(courseId, safeMastery);
    });
}

export async function deleteDeckMastery(courseId) {
    if (!courseId) return;
    const userId = currentLocalUserId();
    const key = `${userId}:${courseId}`;
    clearTimeout(masterySaveTimers.get(key));
    masterySaveTimers.delete(key);
    try {
        const storageKey = masteryStorageKey(userId, courseId);
        if (typeof localStorage !== 'undefined' && storageKey) localStorage.removeItem(storageKey);
        const pendingKey = pendingMasteryKey(userId, courseId);
        if (typeof localStorage !== 'undefined' && pendingKey) localStorage.removeItem(pendingKey);
    } catch { /* Cloud retention still follows the course/account deletion policy. */ }
    try {
        const { error } = await supabaseClient.from('flashcard_mastery').delete().eq('course_id', String(courseId));
        if (error) console.warn('Could not remove cloud flashcard review progress:', error.message || error);
    } catch (error) {
        console.warn('Could not remove cloud flashcard review progress:', error?.message || error);
    }
}

/**
 * Persists updated SM-2 flashcard state to localStorage.
 */
export function saveCardMastery(courseId, cardId, updatedCard) {
    const userId = currentLocalUserId();
    if (typeof localStorage === 'undefined' || !courseId || !cardId || !userId) return;
    const all = getSavedDeckMastery(courseId, userId);
    all[cardId] = {
        repetitions: updatedCard.repetitions,
        interval: updatedCard.interval,
        easinessFactor: updatedCard.easinessFactor,
        nextReviewDate: updatedCard.nextReviewDate,
        lastReviewed: updatedCard.lastReviewed,
        lastReviewedAt: updatedCard.lastReviewedAt || new Date().toISOString(),
        ...(updatedCard.source === 'anki' ? {
            source: 'anki',
            term: updatedCard.term,
            definition: updatedCard.definition,
            contentUpdatedAt: updatedCard.contentUpdatedAt
        } : {})
    };
    storeDeckMasteryLocally(courseId, all, userId);
    scheduleDeckMasteryCloudSave(courseId, all);
}

export async function syncPendingFlashcardMastery() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const userId = await authenticatedUserId();
    if (!userId || currentLocalUserId() !== userId || typeof localStorage === 'undefined') return;
    const prefix = `${MASTERY_STORAGE_PREFIX}pending_${userId}_`;
    const pending = [];
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) pending.push(key);
    }
    let remaining = 0;
    for (const key of pending) {
        const courseId = key.slice(prefix.length);
        const mastery = getSavedDeckMastery(courseId, userId);
        if (!Object.keys(mastery).length) {
            try { localStorage.removeItem(key); } catch { /* Empty local rows need no upload. */ }
            continue;
        }
        try {
            if (!await saveDeckMasteryToCloud(userId, courseId, mastery)) remaining += 1;
        } catch (error) {
            remaining += 1;
            console.warn('Flashcard sync will retry later:', error?.message || error);
        }
    }
    return { processed: pending.length - remaining, remaining };
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        syncPendingFlashcardMastery().catch((error) => console.warn('Flashcard sync will retry later:', error?.message || error));
    });
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session?.user?.id) setTimeout(() => {
            syncPendingFlashcardMastery().catch((error) => console.warn('Flashcard sync will retry later:', error?.message || error));
        }, 0);
    });
}

/**
 * Generates flashcards deck and practice quiz from student notes with SM-2 Spaced Repetition.
 */
export async function generateStudyDeck(courseId, submittedNotes = null) {
    if (typeof document === 'undefined') return;
    const courses = window.localCourses || [];
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    if (!confirmActiveMockExamReplacement()) return false;

    clearMockExamRuntime();
    currentMockExam = null;
    syncMockExamNavigationGuard();
    mockExamNotice = '';
    currentDeckCourseId = courseId;
    const savedMastery = await loadDeckMastery(courseId);

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

    const savedImportedCards = importedAnkiCardsFromMastery(savedMastery);
    if (savedImportedCards.length) {
        const baseDeck = concepts.length > 0 ? deck : [];
        const baseTerms = new Set(baseDeck.map((card) => normalizeAnkiField(card.term)));
        const importedCards = savedImportedCards.filter((card) => !baseTerms.has(normalizeAnkiField(card.term)));
        currentDeckCards = [...baseDeck, ...importedCards];
    } else {
        currentDeckCards = deck;
    }
    currentCardIndex = 0;
    isCardFlipped = false;
    currentQuizQuestions = generateQuizFromNotes(notes, course);
    currentMockExamQuestionPool = getNoteDerivedMockExamQuestions(notes, course);
    currentQuizIndex = 0;
    quizScore = 0;

    renderStudyQuizContainer(course, notes);
    return true;
}

export function renderStudyQuizContainer(course, notesText = '') {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('studyQuizContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Mode Toggle Header -->
            <div class="flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-100 p-3 dark:border-brand-700 dark:bg-brand-900 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                    <button type="button" onclick="switchStudyMode('flashcards')" id="modeBtn_flashcards" class="min-h-11 rounded-lg px-3 py-1.5 text-xs font-bold transition ${currentStudyMode === 'flashcards' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">🎴 Spaced Flashcards (${currentDeckCards.length})</button>
                    <button type="button" onclick="switchStudyMode('quiz')" id="modeBtn_quiz" class="min-h-11 rounded-lg px-3 py-1.5 text-xs font-bold transition ${currentStudyMode === 'quiz' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">📝 Practice Quiz (${currentQuizQuestions.length} Qs)</button>
                    <button type="button" onclick="switchStudyMode('mock-exam')" id="modeBtn_mock-exam" class="min-h-11 rounded-lg px-3 py-1.5 text-xs font-bold transition ${currentStudyMode === 'mock-exam' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700'}">Timed Mock Exam</button>
                </div>
                <button type="button" onclick="toggleNotesInputSection()" class="min-h-11 px-2 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">
                    ✍️ Notes & Formulas
                </button>
            </div>

            <!-- Notes Quick Editor / Submitter (Collapsible) -->
            <div id="notesInputSection" class="hidden p-4 bg-indigo-50/50 dark:bg-brand-900/60 rounded-xl border border-indigo-200 dark:border-brand-700 space-y-2">
                <label class="block text-xs font-bold text-zinc-800 dark:text-zinc-200">Submit Lecture & Study Notes (Markdown & LaTeX Math Supported)</label>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Type notes, definitions (e.g. <code>Term: definition</code>), and math formulas (e.g. <code>$E = mc^2$</code> or <code>$$\\Delta x$$</code>).</p>
                <textarea id="studyNotesInput" rows="5" class="w-full text-xs p-3 rounded-lg border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono" placeholder="e.g.&#10;Mitochondria: Cellular powerhouse generating ATP via oxidative phosphorylation.&#10;Kinetic Energy: $KE = \\frac{1}{2}mv^2$ energy possessed by an object due to motion.">${escapeHtml(notesText || '')}</textarea>
                <div class="flex justify-end gap-2">
                    <button type="button" onclick="applySubmittedNotes()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition shadow-sm">
                        ⚡ Generate Spaced Decks & Quizzes
                    </button>
                </div>
            </div>

            <!-- Main Content Area -->
            <div id="studyModeContent">
                ${currentStudyMode === 'flashcards' ? getFlashcardsHtml() : (currentStudyMode === 'mock-exam' ? getMockExamHtml() : getQuizHtml())}
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
        if (!course) return false;
        if (!confirmActiveMockExamReplacement()) return false;
        clearMockExamRuntime();
        currentMockExam = null;
        syncMockExamNavigationGuard();
        course.scratchpad = notes;
        await supabaseClient.from('courses').update({ scratchpad: notes }).eq('id', currentDeckCourseId);
        await generateStudyDeck(currentDeckCourseId, notes);
        fireConfetti();
        return true;
    }
}

export function switchStudyMode(mode) {
    if (!['flashcards', 'quiz', 'mock-exam'].includes(mode)) return;
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
    const reps = Math.max(0, Math.round(Number(card.repetitions) || 0));
    const interval = Math.max(1, Math.round(Number(card.interval) || 1));
    const masteryBadge = reps === 0 ? '🌱 New' : (reps < 3 ? `⚡ Learning (${escapeHtml(interval)}d)` : `🏆 Mastered (${escapeHtml(interval)}d)`);

    const rawContent = isCardFlipped ? card.definition : card.term;
    const formattedContent = renderMarkdownToHtml(rawContent);

    return `
        <div class="space-y-4 text-center">
            <div class="flex justify-between items-center text-xs text-zinc-400 font-bold px-2">
                <span class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-brand-700 text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">${masteryBadge}</span>
                <span>Card ${currentCardIndex + 1} of ${currentDeckCards.length}</span>
                <div class="flex flex-wrap items-center justify-end gap-1.5">
                    <button type="button" onclick="speakCurrentFlashcard()" title="Read aloud" class="min-h-11 rounded px-2 text-indigo-600 transition hover:bg-zinc-200 dark:text-indigo-400 dark:hover:bg-brand-700">
                        🔊 <span class="hidden sm:inline">Listen</span>
                    </button>
                    <button type="button" onclick="exportFlashcardsAsAnkiText()" title="Export an Anki-importable text file" class="min-h-11 rounded px-2 text-xs font-bold text-indigo-600 transition hover:bg-zinc-200 dark:text-indigo-400 dark:hover:bg-brand-700">
                        Anki text
                    </button>
                    <button type="button" onclick="exportFlashcardsAsCSV()" title="Export a standard CSV file" class="min-h-11 rounded px-2 text-xs font-bold text-zinc-500 transition hover:bg-zinc-200 hover:text-indigo-600 dark:text-zinc-300 dark:hover:bg-brand-700 dark:hover:text-white">CSV</button>
                    <button type="button" onclick="document.getElementById('ankiImportFile').click()" class="min-h-11 rounded px-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-brand-700">Import</button>
                    <input id="ankiImportFile" type="file" accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values,text/csv" class="hidden" aria-label="Import Anki text or CSV file" onchange="importAnkiTextFile(this)">
                </div>
            </div>
            <p id="ankiImportStatus" class="hidden rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-[11px] text-zinc-700 dark:border-brand-700 dark:bg-brand-900 dark:text-zinc-300" role="status" aria-live="polite"></p>

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

function formatMockExamTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function clearMockExamRuntime() {
    if (mockExamTimerInterval !== null) {
        clearInterval(mockExamTimerInterval);
        mockExamTimerInterval = null;
    }
    if (mockExamKeyHandler && typeof document !== 'undefined') {
        document.removeEventListener('keydown', mockExamKeyHandler);
        mockExamKeyHandler = null;
    }
}

export function confirmActiveMockExamReplacement(exam = currentMockExam, confirmFn = null) {
    if (exam?.status !== 'in-progress') return true;
    const confirm = confirmFn || (typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? (message) => window.confirm(message)
        : null);
    if (typeof confirm !== 'function') return false;
    return Boolean(confirm('Generating a new study deck will cancel the active mock exam and discard its answers. Continue?'));
}

export function preventActiveMockExamNavigation(event, exam = currentMockExam) {
    if (exam?.status !== 'in-progress' || !event) return false;
    event.preventDefault?.();
    event.returnValue = 'An active mock exam will be lost if you leave this page.';
    return true;
}

function syncMockExamNavigationGuard() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    if (currentMockExam?.status === 'in-progress' && !mockExamBeforeUnloadHandler) {
        mockExamBeforeUnloadHandler = preventActiveMockExamNavigation;
        window.addEventListener('beforeunload', mockExamBeforeUnloadHandler);
    } else if (currentMockExam?.status !== 'in-progress' && mockExamBeforeUnloadHandler) {
        window.removeEventListener('beforeunload', mockExamBeforeUnloadHandler);
        mockExamBeforeUnloadHandler = null;
    }
}

export function shouldHandleMockExamKeyboard(exam, studyMode, examVisible, focusWithinExam) {
    return exam?.status === 'in-progress'
        && studyMode === 'mock-exam'
        && examVisible === true
        && focusWithinExam === true;
}

function isMockExamRootVisible(root) {
    if (!root) return false;
    for (let element = root; element; element = element.parentElement) {
        if (element.hidden || element.hasAttribute('hidden')
            || element.getAttribute('aria-hidden') === 'true'
            || element.classList?.contains('hidden')) return false;
    }
    return true;
}

function updateMockExamTimer() {
    if (currentMockExam?.status !== 'in-progress') return;
    const remaining = getMockExamRemainingSeconds(currentMockExam.endsAt);
    const timer = document.getElementById('mockExamTimer');
    if (timer) {
        timer.textContent = formatMockExamTime(remaining);
        timer.classList.toggle('text-red-600', remaining <= 60);
        timer.classList.toggle('dark:text-red-300', remaining <= 60);
    }
    if (remaining <= 0) finishTimedMockExam('time-expired');
}

function handleMockExamKeydown(event) {
    const examRoot = document.getElementById('mockExamActive');
    const focusWithinExam = Boolean(examRoot?.contains(document.activeElement));
    if (!shouldHandleMockExamKeyboard(currentMockExam, currentStudyMode, isMockExamRootVisible(examRoot), focusWithinExam)
        || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToMockExamQuestion(currentMockExam.currentIndex - 1);
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToMockExamQuestion(currentMockExam.currentIndex + 1);
    } else if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        selectMockExamAnswer(Number(event.key) - 1);
    }
}

export function startTimedMockExam(questionCount, durationMinutes) {
    if (currentMockExam?.status === 'in-progress' && !confirmActiveMockExamReplacement()) return false;
    if (!currentMockExamQuestionPool.length) {
        mockExamNotice = 'Add at least four distinct note definitions to build a mock exam without outside answer choices.';
        renderFlashcardView();
        return false;
    }
    const questionSelect = document.getElementById('mockExamQuestionCount');
    const durationSelect = document.getElementById('mockExamDuration');
    const selectedCount = questionCount ?? Number(questionSelect?.value);
    const selectedDuration = durationMinutes ?? Number(durationSelect?.value);
    let exam;
    try {
        exam = buildTimedMockExam(currentMockExamQuestionPool, selectedCount, selectedDuration);
    } catch (error) {
        mockExamNotice = error.message || 'Could not start this mock exam.';
        renderFlashcardView();
        return false;
    }

    clearMockExamRuntime();
    const startedAt = Date.now();
    currentMockExam = {
        status: 'in-progress',
        questions: exam.questions,
        answers: Array(exam.questions.length).fill(null),
        currentIndex: 0,
        startedAt,
        endsAt: startedAt + exam.durationSeconds * 1000,
        durationSeconds: exam.durationSeconds
    };
    syncMockExamNavigationGuard();
    mockExamNotice = '';
    mockExamKeyHandler = handleMockExamKeydown;
    document.addEventListener('keydown', mockExamKeyHandler);
    mockExamTimerInterval = setInterval(updateMockExamTimer, 1000);
    renderFlashcardView();
    document.getElementById('mockExamQuestionHeading')?.focus();
    return true;
}

export function selectMockExamAnswer(optionIndex) {
    if (currentMockExam?.status !== 'in-progress') return;
    if (getMockExamRemainingSeconds(currentMockExam.endsAt) <= 0) {
        finishTimedMockExam('time-expired');
        return;
    }
    const question = currentMockExam.questions[currentMockExam.currentIndex];
    if (!question || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) return;
    currentMockExam.answers[currentMockExam.currentIndex] = optionIndex;
    renderFlashcardView();
    document.querySelector(`#mockExamActive [data-mock-exam-answer="${optionIndex}"]`)?.focus();
}

export function goToMockExamQuestion(index) {
    if (currentMockExam?.status !== 'in-progress') return;
    if (getMockExamRemainingSeconds(currentMockExam.endsAt) <= 0) {
        finishTimedMockExam('time-expired');
        return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= currentMockExam.questions.length) return;
    currentMockExam.currentIndex = index;
    renderFlashcardView();
    document.getElementById('mockExamQuestionHeading')?.focus();
}

export function finishTimedMockExam(reason = 'submitted') {
    if (currentMockExam?.status !== 'in-progress') return;
    const actualReason = getMockExamRemainingSeconds(currentMockExam.endsAt) <= 0 ? 'time-expired' : reason;
    currentMockExam = {
        ...currentMockExam,
        status: 'finished',
        finishedAt: Date.now(),
        finishReason: actualReason,
        score: scoreTimedMockExam(currentMockExam.questions, currentMockExam.answers)
    };
    syncMockExamNavigationGuard();
    clearMockExamRuntime();
    if (currentStudyMode === 'mock-exam') renderFlashcardView();
}

export function cancelTimedMockExam() {
    if (currentMockExam?.status !== 'in-progress') return;
    if (typeof window !== 'undefined' && !window.confirm('Cancel this mock exam? Your answers will be discarded.')) return;
    clearMockExamRuntime();
    currentMockExam = null;
    syncMockExamNavigationGuard();
    mockExamNotice = 'Mock exam canceled. Your answers were discarded.';
    if (currentStudyMode === 'mock-exam') renderFlashcardView();
}

export function resetTimedMockExam() {
    if (currentMockExam?.status === 'in-progress') {
        if (typeof window !== 'undefined' && !window.confirm('Cancel and reset this mock exam? Your answers will be discarded.')) return;
    }
    clearMockExamRuntime();
    currentMockExam = null;
    syncMockExamNavigationGuard();
    mockExamNotice = '';
    if (currentStudyMode === 'mock-exam') renderFlashcardView();
}

export function getMockExamHtml() {
    const pool = currentMockExamQuestionPool;
    if (!currentMockExam && pool.length === 0) {
        return `<div class="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-brand-700 dark:bg-brand-900">
            <h3 class="font-bold text-zinc-900 dark:text-white">Timed mock exam</h3>
            <p class="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">A mock exam needs four distinct definitions that can be taken directly from your notes. Add notes such as <code>Term: definition</code>, then generate again.</p>
        </div>`;
    }

    if (!currentMockExam) {
        const defaultQuestionCount = Math.min(10, pool.length);
        return `<section class="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-brand-700 dark:bg-brand-900" aria-labelledby="mockExamSetupTitle">
            <div>
                <h3 id="mockExamSetupTitle" class="text-sm font-bold text-zinc-900 dark:text-white">Timed mock exam</h3>
                <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Uses only question answers and distractors found in your notes. Choose a length and time limit.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex flex-col gap-1 text-xs font-semibold">Questions
                    <select id="mockExamQuestionCount" class="min-h-11 rounded border border-zinc-300 bg-white px-3 text-sm dark:border-brand-600 dark:bg-brand-800">
                        ${pool.map((_, index) => `<option value="${index + 1}" ${index + 1 === defaultQuestionCount ? 'selected' : ''}>${index + 1}</option>`).join('')}
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-xs font-semibold">Time limit
                    <select id="mockExamDuration" class="min-h-11 rounded border border-zinc-300 bg-white px-3 text-sm dark:border-brand-600 dark:bg-brand-800">
                        ${[5, 10, 15, 20, 30, 45, 60].map((minutes) => `<option value="${minutes}" ${minutes === 10 ? 'selected' : ''}>${minutes} minutes</option>`).join('')}
                    </select>
                </label>
            </div>
            ${mockExamNotice ? `<p class="text-xs text-zinc-600 dark:text-zinc-300" role="status">${escapeHtml(mockExamNotice)}</p>` : ''}
            <button type="button" onclick="startTimedMockExam()" class="min-h-11 w-full rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-500 sm:w-auto">Start mock exam</button>
        </section>`;
    }

    const exam = currentMockExam;
    if (exam.status === 'in-progress') {
        const question = exam.questions[exam.currentIndex];
        const selectedAnswer = exam.answers[exam.currentIndex];
        const remaining = getMockExamRemainingSeconds(exam.endsAt);
        const answeredCount = exam.answers.filter(Number.isInteger).length;
        return `<section id="mockExamActive" class="space-y-4" aria-labelledby="mockExamQuestionHeading">
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-brand-700 dark:bg-brand-900">
                <div><p class="text-xs font-bold text-zinc-900 dark:text-white">Timed mock exam</p><p class="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">${answeredCount} of ${exam.questions.length} answered</p></div>
                <div class="text-right"><span class="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Time left</span><span id="mockExamTimer" role="timer" aria-label="Time remaining" class="font-mono text-lg font-bold tabular-nums ${remaining <= 60 ? 'text-red-600 dark:text-red-300' : 'text-indigo-700 dark:text-indigo-300'}">${formatMockExamTime(remaining)}</span></div>
            </div>
            <div class="grid grid-cols-5 gap-2 sm:grid-cols-10" aria-label="Question navigation">
                ${exam.questions.map((_, index) => `<button type="button" onclick="goToMockExamQuestion(${index})" aria-label="Question ${index + 1}${Number.isInteger(exam.answers[index]) ? ', answered' : ', unanswered'}" aria-current="${index === exam.currentIndex ? 'step' : 'false'}" class="min-h-11 rounded border px-2 text-xs font-bold ${index === exam.currentIndex ? 'border-indigo-600 bg-indigo-600 text-white' : (Number.isInteger(exam.answers[index]) ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-zinc-300 bg-white text-zinc-700 dark:border-brand-600 dark:bg-brand-800 dark:text-zinc-200')}">${index + 1}</button>`).join('')}
            </div>
            <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-800">
                <p class="text-[11px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">${escapeHtml(question.topic || 'Note topic')}</p>
                <h3 id="mockExamQuestionHeading" tabindex="-1" class="mt-1 text-sm font-bold leading-relaxed text-zinc-900 dark:text-white">${renderMarkdownToHtml(question.question)}</h3>
            </div>
            <div class="space-y-2" role="group" aria-label="Answer choices">
                ${question.options.map((option, index) => `<button type="button" data-mock-exam-answer="${index}" onclick="selectMockExamAnswer(${index})" aria-pressed="${selectedAnswer === index}" class="flex min-h-11 w-full items-start gap-3 rounded-lg border p-3 text-left text-xs transition ${selectedAnswer === index ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/30' : 'border-zinc-200 bg-white hover:border-indigo-400 dark:border-brand-700 dark:bg-brand-800'}">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-700 dark:bg-brand-700 dark:text-zinc-200">${String.fromCharCode(65 + index)}</span><span class="leading-relaxed text-zinc-800 dark:text-zinc-200">${renderMarkdownToHtml(option)}</span>
                </button>`).join('')}
            </div>
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Keyboard: use ← and → to move between questions, or 1–4 to choose an answer.</p>
            <div class="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-3 dark:border-brand-700 sm:flex-row sm:justify-between">
                <button type="button" onclick="cancelTimedMockExam()" class="min-h-11 rounded border border-zinc-300 px-4 text-xs font-bold hover:bg-zinc-100 dark:border-brand-600 dark:hover:bg-brand-700">Cancel exam</button>
                <div class="flex gap-2">
                    <button type="button" onclick="goToMockExamQuestion(${exam.currentIndex - 1})" ${exam.currentIndex === 0 ? 'disabled' : ''} class="min-h-11 flex-1 rounded border border-zinc-300 px-4 text-xs font-bold disabled:opacity-40 dark:border-brand-600 sm:flex-none">Previous</button>
                    ${exam.currentIndex < exam.questions.length - 1 ? `<button type="button" onclick="goToMockExamQuestion(${exam.currentIndex + 1})" class="min-h-11 flex-1 rounded bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500 sm:flex-none">Next</button>` : '<span class="flex min-h-11 items-center px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Last question</span>'}
                    <button type="button" onclick="finishTimedMockExam()" class="min-h-11 flex-1 rounded bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-600 sm:flex-none">Finish exam</button>
                </div>
            </div>
        </section>`;
    }

    const score = exam.score || scoreTimedMockExam(exam.questions, exam.answers);
    return `<section class="space-y-4" aria-labelledby="mockExamResultTitle">
        <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-brand-700 dark:bg-brand-900">
            <h3 id="mockExamResultTitle" class="text-base font-bold text-zinc-900 dark:text-white">Mock exam ${exam.finishReason === 'time-expired' ? 'time expired' : 'complete'}</h3>
            <p class="mt-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Score: ${score.correct} / ${score.total} (${score.percent}%)</p>
            <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-300">${score.answered} answered · ${score.unanswered} unanswered${score.unanswered ? ' (counted incorrect)' : ''}</p>
        </div>
        <button type="button" onclick="resetTimedMockExam()" class="min-h-11 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500">Set up another exam</button>
        <div class="space-y-3" aria-label="Answer review">
            ${exam.questions.map((question, index) => {
                const selected = exam.answers[index];
                const correct = selected === question.correctIndex;
                const selectedText = Number.isInteger(selected) ? question.options[selected] : 'No answer';
                return `<article class="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-brand-700 dark:bg-brand-800">
                    <h4 class="text-xs font-bold text-zinc-900 dark:text-white">${index + 1}. ${escapeHtml(question.topic || 'Note topic')}</h4>
                    <div class="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">${renderMarkdownToHtml(question.question)}</div>
                    <p class="text-xs ${correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}"><strong>${correct ? 'Correct' : 'Review'}:</strong> Your answer: ${renderMarkdownToHtml(selectedText)}</p>
                    <p class="text-xs text-zinc-700 dark:text-zinc-300"><strong>Note answer:</strong> ${renderMarkdownToHtml(question.options[question.correctIndex])}</p>
                    <div class="border-t border-zinc-200 pt-2 text-xs leading-relaxed text-zinc-600 dark:border-brand-700 dark:text-zinc-300">${renderMarkdownToHtml(question.explanation || '')}</div>
                </article>`;
            }).join('')}
        </div>
    </section>`;
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
                <div class="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1.5">Note Topic: ${escapeHtml(q.topic)}</div>
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
    const courseCode = course ? String(course.code || 'Course').replace(/[^a-zA-Z0-9_-]/g, '_') : 'Deck';

    let csvContent = "Front,Back\n";
    currentDeckCards.forEach(c => {
        const front = `"${(c.term || '').replace(/"/g, '""')}"`;
        const back = `"${(c.definition || '').replace(/"/g, '""')}"`;
        csvContent += `${front},${back}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${courseCode}_Flashcards.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function exportFlashcardsAsAnkiText(courseId = currentDeckCourseId) {
    if (!currentDeckCards.length) {
        alert('No flashcards to export. Add notes or import a deck first.');
        return;
    }
    const courses = window.localCourses || [];
    const course = courses.find((item) => item.id === courseId);
    try {
        const text = buildAnkiTextExport(currentDeckCards, course?.code || 'Course');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${String(course?.code || 'Deck').replace(/[^a-zA-Z0-9_-]/g, '_')}_Anki.txt`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Could not export the Anki text file: ${error.message || 'Check the deck and try again.'}`);
    }
}

function setAnkiImportStatus(message, tone = 'neutral') {
    const status = document.getElementById('ankiImportStatus');
    if (!status) return;
    const colors = {
        success: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
        warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
        error: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200',
        neutral: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-brand-700 dark:bg-brand-900 dark:text-zinc-300'
    };
    status.textContent = message;
    status.className = `rounded border px-3 py-2 text-left text-[11px] ${colors[tone] || colors.neutral}`;
}

export async function importAnkiTextFile(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;
    try {
        const courseId = currentDeckCourseId;
        if (/\.apkg$/i.test(file.name)) {
            throw new Error('DueVinci imports Anki text files only. An .apkg is a packaged SQLite deck, and this browser app does not read or create package files.');
        }
        if (!/\.(?:txt|tsv|csv)$/i.test(file.name)) {
            throw new Error('Choose an Anki text (.txt/.tsv) or CSV file.');
        }
        if (file.size > 2 * 1024 * 1024) throw new Error('This text file exceeds the 2 MB import limit.');
        if (!courseId) throw new Error('Open a course and generate its deck before importing cards.');

        const text = await file.text();
        const parsed = parseAnkiTextImport(text);
        if (parsed.error) throw new Error(parsed.error);
        if (!parsed.cards.length) {
            throw new Error(`No usable cards were found. ${parsed.invalidRows} invalid row${parsed.invalidRows === 1 ? '' : 's'} skipped.`);
        }

        const localUserId = currentLocalUserId();
        const cloudUserId = await authenticatedUserId();
        if (localUserId && cloudUserId && localUserId !== cloudUserId) {
            throw new Error('The signed-in account changed. Refresh the page before importing this deck.');
        }
        const userId = localUserId || cloudUserId;
        let mastery = await loadDeckMastery(courseId);
        if (currentDeckCourseId !== courseId) {
            throw new Error('The active course changed while this file was loading. Select the course again and retry the import.');
        }
        const now = new Date().toISOString();
        const merged = mergeAnkiCardsIntoDeck(currentDeckCards, mastery, parsed.cards, now);
        currentDeckCards = merged.cards;
        mastery = merged.mastery;
        const { added, updated } = merged;
        const skippedDuplicates = parsed.duplicateRows + merged.duplicates;
        const conflicts = parsed.conflictingRows + merged.conflicts;

        if (added || updated) {
            if (userId) {
                storeDeckMasteryLocally(courseId, mastery, userId);
                if ((typeof navigator !== 'undefined' && navigator.onLine === false) || !cloudUserId) {
                    if (localUserId) scheduleDeckMasteryCloudSave(courseId, mastery);
                } else {
                    try {
                        await saveDeckMasteryToCloud(userId, courseId, mastery);
                    } catch (error) {
                        console.warn('Imported flashcards will sync when the connection is available:', error?.message || error);
                        scheduleDeckMasteryCloudSave(courseId, mastery);
                    }
                }
            }
            if (currentCardIndex >= currentDeckCards.length) currentCardIndex = Math.max(0, currentDeckCards.length - 1);
            renderFlashcardView();
        }

        const persistenceNote = userId ? '' : ' Cards are available for this session but could not be saved without a signed-in account.';
        setAnkiImportStatus(`Imported ${added}; updated ${updated}; skipped ${skippedDuplicates} duplicates and ${conflicts} conflicting fronts; skipped ${parsed.invalidRows} invalid rows.${persistenceNote}`, userId ? (parsed.invalidRows || conflicts ? 'warning' : 'success') : 'warning');
    } catch (error) {
        setAnkiImportStatus(error.message || 'Could not import this file.', 'error');
    } finally {
        if (fileInput) fileInput.value = '';
    }
}

// Bind to window & globalThis
const _scope = typeof window !== 'undefined' ? window : globalThis;
_scope.calculateSM2Repetition = calculateSM2Repetition;
_scope.rateFlashcardSM2 = rateFlashcardSM2;
_scope.extractConceptsFromNotes = extractConceptsFromNotes;
_scope.generateQuizFromNotes = generateQuizFromNotes;
_scope.generateQuizQuestions = generateQuizQuestions;
_scope.getNoteDerivedMockExamQuestions = getNoteDerivedMockExamQuestions;
_scope.startTimedMockExam = startTimedMockExam;
_scope.selectMockExamAnswer = selectMockExamAnswer;
_scope.goToMockExamQuestion = goToMockExamQuestion;
_scope.finishTimedMockExam = finishTimedMockExam;
_scope.cancelTimedMockExam = cancelTimedMockExam;
_scope.resetTimedMockExam = resetTimedMockExam;
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
_scope.exportFlashcardsAsAnkiText = exportFlashcardsAsAnkiText;
_scope.importAnkiTextFile = importAnkiTextFile;
_scope.syncPendingFlashcardMastery = syncPendingFlashcardMastery;
