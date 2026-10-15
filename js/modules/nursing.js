// --- NURSING HUB: student organization and educational practice tools ---
import { supabaseClient } from './config.js';
import { calculateSM2Repetition } from './flashcards.js';
import { escapeHtml, getLocalDateKey } from './utils.js';

const STORAGE_PREFIX = 'duevinci_workspace_nursing_hub_';
const MAX_WORKSPACE_BYTES = 240000;

export const DOSAGE_PROBLEMS = [
    {
        id: 'tablets',
        type: 'dose',
        title: 'Tablet amount',
        prompt: 'A practice order is 250 mg. The supplied tablets contain 125 mg each. How many tablets does the calculation produce?',
        desiredDose: 250,
        availableDose: 125,
        quantity: 1,
        unit: 'tablets',
        formula: 'Desired dose ÷ dose on hand × quantity on hand',
        expected: 2,
        worked: '250 mg ÷ 125 mg per tablet × 1 tablet = 2 tablets.'
    },
    {
        id: 'oral-solution',
        type: 'dose',
        title: 'Oral solution volume',
        prompt: 'A practice order is 300 mg. The solution label states 150 mg per 5 mL. What volume does the calculation produce?',
        desiredDose: 300,
        availableDose: 150,
        quantity: 5,
        unit: 'mL',
        formula: 'Desired dose ÷ dose on hand × quantity on hand',
        expected: 10,
        worked: '300 mg ÷ 150 mg × 5 mL = 10 mL.'
    },
    {
        id: 'pump-rate',
        type: 'pump',
        title: 'Pump-rate math',
        prompt: 'A practice problem gives a total volume of 750 mL over 6 hours. Calculate the rate in mL/hr.',
        volumeMl: 750,
        hours: 6,
        unit: 'mL/hr',
        formula: 'Volume in mL ÷ time in hours',
        expected: 125,
        worked: '750 mL ÷ 6 hours = 125 mL/hr.'
    },
    {
        id: 'drop-rate',
        type: 'gravity',
        title: 'Gravity-rate math',
        prompt: 'A practice problem gives 500 mL over 4 hours with tubing marked 20 gtt/mL. Round to the nearest whole drop.',
        volumeMl: 500,
        hours: 4,
        dropFactor: 20,
        unit: 'gtt/min',
        formula: 'Volume in mL × drop factor in gtt/mL ÷ time in minutes',
        expected: 42,
        worked: '500 mL × 20 gtt/mL ÷ 240 minutes = 41.67 gtt/min, which rounds to 42 gtt/min.'
    }
];

export const ANATOMY_SYSTEMS = [
    { id: 'integumentary', name: 'Integumentary', icon: '🧴', focus: 'The body’s outer covering and its structures.', structures: 'Skin, hair, nails, and associated glands.', check: 'Name two structures in this system.', answer: 'Skin, hair, nails, and associated glands are examples.' },
    { id: 'skeletal', name: 'Skeletal', icon: '🦴', focus: 'Support, protection, and a framework for movement.', structures: 'Bones, cartilage, joints, and connective structures.', check: 'Which tissues form the body’s skeletal framework?', answer: 'Bones and cartilage form much of the framework; joints connect bones.' },
    { id: 'muscular', name: 'Muscular', icon: '💪', focus: 'Movement and force produced by muscle tissue.', structures: 'Skeletal, smooth, and cardiac muscle.', check: 'Which three muscle tissue types are commonly studied?', answer: 'Skeletal, smooth, and cardiac muscle.' },
    { id: 'nervous', name: 'Nervous', icon: '🧠', focus: 'Communication, sensing, and coordination.', structures: 'Brain, spinal cord, nerves, and sensory structures.', check: 'What are the two main divisions of the central nervous system?', answer: 'The brain and spinal cord.' },
    { id: 'endocrine', name: 'Endocrine', icon: '⚗️', focus: 'Chemical signaling through hormones.', structures: 'Hormone-producing glands and organs.', check: 'What kind of signal is central to endocrine communication?', answer: 'Hormones carried to target tissues.' },
    { id: 'cardiovascular', name: 'Cardiovascular', icon: '❤️', focus: 'Transport through the heart, blood, and vessels.', structures: 'Heart, blood, arteries, veins, and capillaries.', check: 'What three components make up the cardiovascular system?', answer: 'The heart, blood, and blood vessels.' },
    { id: 'lymphatic', name: 'Lymphatic & immune', icon: '🛡️', focus: 'Fluid return and immune defense.', structures: 'Lymph, lymphatic vessels, lymph nodes, and immune tissues.', check: 'What fluid moves through lymphatic vessels?', answer: 'Lymph.' },
    { id: 'respiratory', name: 'Respiratory', icon: '🫁', focus: 'Air movement and gas exchange.', structures: 'Airways and lungs.', check: 'What is the respiratory system’s central exchange?', answer: 'Gas exchange between air and blood.' },
    { id: 'digestive', name: 'Digestive', icon: '🥣', focus: 'Breaking food down and absorbing nutrients.', structures: 'Digestive tract and accessory organs.', check: 'Where does most nutrient absorption occur?', answer: 'Most nutrient absorption occurs in the small intestine.' },
    { id: 'urinary', name: 'Urinary', icon: '💧', focus: 'Urine formation and regulation of the internal environment.', structures: 'Kidneys, ureters, bladder, and urethra.', check: 'Name the path urine takes after leaving the kidneys.', answer: 'Ureters, bladder, then urethra.' },
    { id: 'reproductive', name: 'Reproductive', icon: '🌱', focus: 'Reproduction and related hormone functions.', structures: 'Reproductive organs and gonads.', check: 'Which organs produce gametes and many reproductive hormones?', answer: 'The gonads: ovaries or testes.' }
];

export const NURSING_STARTER_CARDS = [
    { id: 'starter-anatomy', topic: 'Anatomy', front: 'What does anatomy study?', back: 'The structures of the body and how those structures relate to one another.', source: 'OpenStax Anatomy & Physiology 2e, section 1.1' },
    { id: 'starter-physiology', topic: 'Anatomy', front: 'What does physiology study?', back: 'How body structures function and work together.', source: 'OpenStax Anatomy & Physiology 2e, section 1.1' },
    { id: 'starter-organ-system', topic: 'Anatomy', front: 'What is an organ system?', back: 'A group of organs that work together to perform major functions or meet physiological needs.', source: 'OpenStax Anatomy & Physiology 2e, section 1.2' },
    { id: 'starter-process', topic: 'Nursing process', front: 'What are the five nursing-process steps?', back: 'Assessment, diagnosis, planning/outcomes, implementation, and evaluation. The process is iterative.', source: 'OpenStax Fundamentals of Nursing, chapter 13' },
    { id: 'starter-dosage', topic: 'Dosage math', front: 'What is the desired ÷ have × quantity setup used for?', back: 'A proportion method for calculating a practice amount from a desired dose, the amount on hand, and its quantity.', source: 'OpenStax Pharmacology for Nurses, section 2.4' },
    { id: 'starter-clinical-judgment', topic: 'Clinical judgment', front: 'What should happen after evaluating an outcome?', back: 'Use the evaluation to decide whether the learning plan or next action needs revision; judgment is an ongoing process.', source: 'OpenStax Fundamentals of Nursing, chapter 14' }
];

function safeText(value, max = 500) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

function safeDate(value) {
    const text = safeText(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    const date = new Date(text + 'T12:00:00');
    return Number.isNaN(date.getTime()) || getLocalDateKey(date) !== text ? '' : text;
}

function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function getNursingStorageKey(userId) {
    const id = safeText(userId, 100);
    return id ? STORAGE_PREFIX + id : '';
}

export function createEmptyNursingWorkspace() {
    return {
        version: 1,
        rotations: [],
        carePlans: [],
        customCards: [],
        cardMastery: {},
        dosageProgress: {},
        dosageIndex: 0,
        completedSystems: [],
        updatedAt: ''
    };
}

export function sanitizeNursingWorkspace(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return createEmptyNursingWorkspace();
    const rotations = Array.isArray(value.rotations) ? value.rotations.slice(0, 40).map((rotation) => {
        const source = rotation && typeof rotation === 'object' ? rotation : {};
        const skills = Array.isArray(source.skills) ? source.skills.slice(0, 80).map((skill) => {
            const item = skill && typeof skill === 'object' ? skill : {};
            const status = ['planned', 'practiced', 'checked'].includes(item.status) ? item.status : 'planned';
            return { id: safeText(item.id, 100), name: safeText(item.name, 120), status };
        }).filter((skill) => skill.id && skill.name) : [];
        return {
            id: safeText(source.id, 100),
            name: safeText(source.name, 120),
            courseId: safeText(source.courseId, 100),
            courseLabel: safeText(source.courseLabel, 120),
            startDate: safeDate(source.startDate),
            endDate: safeDate(source.endDate),
            skills
        };
    }).filter((rotation) => rotation.id && rotation.name) : [];
    const carePlans = Array.isArray(value.carePlans) ? value.carePlans.slice(0, 40).map((plan) => {
        const source = plan && typeof plan === 'object' ? plan : {};
        return {
            id: safeText(source.id, 100),
            title: safeText(source.title, 120),
            bodySystem: safeText(source.bodySystem, 80),
            scenario: safeText(source.scenario, 1800),
            cues: safeText(source.cues, 1800),
            priority: safeText(source.priority, 1000),
            outcome: safeText(source.outcome, 1000),
            actions: safeText(source.actions, 1800),
            rationale: safeText(source.rationale, 1800),
            evaluation: safeText(source.evaluation, 1400),
            createdAt: safeText(source.createdAt, 40)
        };
    }).filter((plan) => plan.id && plan.title) : [];
    const customCards = Array.isArray(value.customCards) ? value.customCards.slice(0, 100).map((card) => {
        const source = card && typeof card === 'object' ? card : {};
        return {
            id: safeText(source.id, 100),
            topic: safeText(source.topic, 60) || 'My cards',
            front: safeText(source.front, 500),
            back: safeText(source.back, 1200),
            source: 'Your card'
        };
    }).filter((card) => card.id && card.front && card.back) : [];
    const cardMastery = {};
    if (value.cardMastery && typeof value.cardMastery === 'object' && !Array.isArray(value.cardMastery)) {
        Object.entries(value.cardMastery).slice(0, 150).forEach(([id, mastery]) => {
            if (!id || id.length > 120 || !mastery || typeof mastery !== 'object' || Array.isArray(mastery)) return;
            cardMastery[id] = {
                repetitions: boundedNumber(mastery.repetitions, 0, 0, 100000),
                interval: boundedNumber(mastery.interval, 1, 1, 36500),
                easinessFactor: boundedNumber(mastery.easinessFactor, 2.5, 1.3, 5),
                nextReviewDate: safeDate(mastery.nextReviewDate),
                lastReviewed: safeDate(mastery.lastReviewed)
            };
        });
    }
    const dosageProgress = {};
    const problemIds = DOSAGE_PROBLEMS.map((problem) => problem.id);
    if (value.dosageProgress && typeof value.dosageProgress === 'object' && !Array.isArray(value.dosageProgress)) {
        problemIds.forEach((id) => {
            const record = value.dosageProgress[id];
            if (!record || typeof record !== 'object') return;
            dosageProgress[id] = {
                attempts: boundedNumber(record.attempts, 0, 0, 100000),
                correct: boundedNumber(record.correct, 0, 0, 100000),
                completed: Boolean(record.completed)
            };
        });
    }
    const completedSystems = Array.isArray(value.completedSystems)
        ? [...new Set(value.completedSystems.filter((id) => ANATOMY_SYSTEMS.some((system) => system.id === id)))]
        : [];
    return {
        version: 1,
        rotations,
        carePlans,
        customCards,
        cardMastery,
        dosageProgress,
        dosageIndex: Math.floor(boundedNumber(value.dosageIndex, 0, 0, DOSAGE_PROBLEMS.length - 1)),
        completedSystems,
        updatedAt: safeText(value.updatedAt, 40)
    };
}

export function calculateDosagePracticeAnswer(problem) {
    if (!problem || typeof problem !== 'object') throw new TypeError('A practice problem is required.');
    if (problem.type === 'dose') {
        const desired = Number(problem.desiredDose);
        const available = Number(problem.availableDose);
        const quantity = Number(problem.quantity);
        if (![desired, available, quantity].every((number) => Number.isFinite(number) && number > 0)) {
            throw new RangeError('Dose practice values must be positive numbers.');
        }
        return desired / available * quantity;
    }
    if (problem.type === 'pump') {
        const volume = Number(problem.volumeMl);
        const hours = Number(problem.hours);
        if (![volume, hours].every((number) => Number.isFinite(number) && number > 0)) {
            throw new RangeError('Volume and hours must be positive numbers.');
        }
        return volume / hours;
    }
    if (problem.type === 'gravity') {
        const volume = Number(problem.volumeMl);
        const hours = Number(problem.hours);
        const dropFactor = Number(problem.dropFactor);
        if (![volume, hours, dropFactor].every((number) => Number.isFinite(number) && number > 0)) {
            throw new RangeError('Volume, hours, and drop factor must be positive numbers.');
        }
        return Math.round(volume * dropFactor / (hours * 60));
    }
    throw new TypeError('Unsupported practice problem type.');
}

export function isDosageAnswerCorrect(value, expected, expectedUnit = '', tolerance = 0.01) {
    const normalized = String(value == null ? '' : value).trim().replace(/,/g, '');
    const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(?:tablets?|tabs?|ml(?:\/hr)?|gtt(?:\/min)?|drops?(?:\/min)?)?$/i);
    if (!match) return false;
    const numeric = Number(match[1]);
    const enteredUnit = (normalized.match(/(?:tablets?|tabs?|ml(?:\/hr)?|gtt(?:\/min)?|drops?(?:\/min)?)$/i) || [''])[0].toLowerCase().replace(/\s+/g, '');
    const unitAliases = { tablet: ['tablet', 'tablets', 'tab', 'tabs'], ml: ['ml'], 'ml/hr': ['ml/hr'], 'gtt/min': ['gtt/min', 'drops/min'] };
    const requiredUnit = String(expectedUnit || '').toLowerCase();
    if (enteredUnit && requiredUnit && !(unitAliases[requiredUnit] || [requiredUnit]).includes(enteredUnit)) return false;
    return Number.isFinite(numeric) && Math.abs(numeric - Number(expected)) <= Math.max(0, Number(tolerance) || 0);
}

function newId(prefix) {
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return prefix + '-' + random;
}

function getWorkspaceUserId() {
    if (typeof window !== 'undefined' && window.currentUser && window.currentUser.id) return window.currentUser.id;
    try {
        const user = JSON.parse(localStorage.getItem('duevinci_offline_user') || 'null');
        return user && typeof user.id === 'string' ? user.id : '';
    } catch {
        return '';
    }
}

let workspace = createEmptyNursingWorkspace();
let workspaceUserId = '';
let activeTab = 'overview';
let activeSystemId = 'cardiovascular';
let showAnatomyAnswer = false;
let showCardAnswer = false;
let dosageFeedback = null;
let availableCourses = [];

function saveWorkspace() {
    if (!workspaceUserId || typeof localStorage === 'undefined') return false;
    workspace.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(sanitizeNursingWorkspace(workspace));
    if (snapshot.length > MAX_WORKSPACE_BYTES) {
        setStatus('This workspace is full. Remove older drafts or cards before saving.', true);
        return false;
    }
    try {
        localStorage.setItem(getNursingStorageKey(workspaceUserId), snapshot);
        workspace = sanitizeNursingWorkspace(JSON.parse(snapshot));
        setStatus('Saved. Your Nursing Hub data syncs with your DueVinci account while online.');
        return true;
    } catch {
        setStatus('Could not save this change in this browser.', true);
        return false;
    }
}

function setStatus(message, isError = false) {
    const target = document.getElementById('nursingSaveStatus');
    if (!target) return;
    target.textContent = message;
    target.className = 'mt-2 text-xs ' + (isError ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-500 dark:text-zinc-400');
}

function dateLabel(value) {
    if (!value) return 'Date not set';
    const date = new Date(value + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? 'Date not set' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function skillStatusLabel(status) {
    if (status === 'checked') return 'Checked off';
    if (status === 'practiced') return 'Practiced';
    return 'To practice';
}

function rotationCard(rotation) {
    const checkedCount = rotation.skills.filter((skill) => skill.status === 'checked').length;
    const skillRows = rotation.skills.length
        ? rotation.skills.map((skill) => '<li class="flex items-center justify-between gap-2 border-t border-zinc-100 py-2 dark:border-brand-700">' +
            '<span class="min-w-0 truncate text-sm">' + escapeHtml(skill.name) + '</span>' +
            '<button type="button" data-action="cycle-skill" data-rotation-id="' + escapeHtml(rotation.id) + '" data-skill-id="' + escapeHtml(skill.id) + '" class="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-indigo-100 dark:bg-brand-700 dark:text-zinc-200 dark:hover:bg-indigo-900/40" aria-label="Change status for ' + escapeHtml(skill.name) + '">' + skillStatusLabel(skill.status) + '</button>' +
            '</li>').join('')
        : '<li class="py-2 text-xs text-zinc-500 dark:text-zinc-400">Add the skills you want to practice or get checked off.</li>';
    const courseText = rotation.courseLabel ? '<p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Linked class: ' + escapeHtml(rotation.courseLabel) + '</p>' : '';
    return '<article class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-800">' +
        '<div class="flex items-start justify-between gap-3"><div class="min-w-0"><h3 class="truncate font-bold text-zinc-900 dark:text-white">' + escapeHtml(rotation.name) + '</h3>' +
        '<p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">' + dateLabel(rotation.startDate) + ' – ' + dateLabel(rotation.endDate) + '</p>' + courseText +
        '</div><button type="button" data-action="delete-rotation" data-id="' + escapeHtml(rotation.id) + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" aria-label="Remove ' + escapeHtml(rotation.name) + '">Remove</button></div>' +
        '<div class="mt-4 flex items-center justify-between"><h4 class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Skills & check-offs</h4><span class="text-xs text-zinc-500 dark:text-zinc-400">' + checkedCount + ' of ' + rotation.skills.length + ' checked</span></div>' +
        '<ul class="mt-2">' + skillRows + '</ul>' +
        '<form data-nursing-form="skill" data-rotation-id="' + escapeHtml(rotation.id) + '" class="mt-3 flex gap-2">' +
        '<label class="sr-only" for="skill-' + escapeHtml(rotation.id) + '">Skill to track</label><input id="skill-' + escapeHtml(rotation.id) + '" name="skill" maxlength="120" required placeholder="Add a skill or competency" class="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900">' +
        '<button class="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500">Add</button></form></article>';
}

function renderOverview() {
    const activeRotations = workspace.rotations.filter((rotation) => !rotation.endDate || rotation.endDate >= getLocalDateKey()).length;
    const trackedSkills = workspace.rotations.reduce((total, rotation) => total + rotation.skills.length, 0);
    const checkedSkills = workspace.rotations.reduce((total, rotation) => total + rotation.skills.filter((skill) => skill.status === 'checked').length, 0);
    const dueCards = getAllCards().filter((card) => {
        const due = workspace.cardMastery[card.id] && workspace.cardMastery[card.id].nextReviewDate;
        return !due || due <= getLocalDateKey();
    }).length;
    const correctCount = Object.values(workspace.dosageProgress).reduce((sum, item) => sum + (item.correct || 0), 0);
    const tile = (title, value, note, icon, tab) => '<button type="button" data-nursing-tab="' + tab + '" class="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 dark:border-brand-700 dark:bg-brand-800 dark:hover:border-indigo-600"><span class="text-xl">' + icon + '</span><span class="mt-3 block text-2xl font-black text-zinc-900 dark:text-white">' + value + '</span><span class="block text-sm font-bold">' + title + '</span><span class="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">' + note + '</span></button>';
    return '<section class="mx-auto max-w-6xl">' +
        '<div class="rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 p-6 text-white shadow-lg sm:p-8"><p class="text-xs font-bold uppercase tracking-[0.18em] text-indigo-100">Nursing school, organized</p><h2 class="mt-2 max-w-2xl text-2xl font-black sm:text-3xl">A place to prepare, practice, and keep track of your progress.</h2><p class="mt-3 max-w-2xl text-sm leading-6 text-indigo-100">Connect your clinical rotations to your classes, work through dosage math, build study cards, and review body systems.</p><button type="button" data-nursing-tab="clinical" class="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm hover:bg-indigo-50">Set up a rotation</button></div>' +
        '<div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">' +
        tile('Active rotations', activeRotations, workspace.rotations.length + ' tracked', '🩺', 'clinical') +
        tile('Skills checked off', checkedSkills, trackedSkills + ' skills tracked', '✅', 'clinical') +
        tile('Cards ready to review', dueCards, workspace.customCards.length + NURSING_STARTER_CARDS.length + ' in your deck', '🎴', 'flashcards') +
        tile('Practice problems solved', correctCount, 'Dosage math practice', '🧮', 'dosage') + '</div>' +
        '<div class="mt-6 grid gap-4 lg:grid-cols-2">' +
        '<section class="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-800"><h3 class="font-bold text-zinc-900 dark:text-white">Your nursing workspace</h3><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Start with one tool, then build it around your courses.</p><div class="mt-4 grid gap-2 sm:grid-cols-2">' +
        '<button data-nursing-tab="careplans" class="rounded-xl border border-zinc-200 p-3 text-left hover:border-indigo-300 dark:border-brand-700">🗂️ <strong class="ml-1 text-sm">Care-plan studio</strong><span class="mt-1 block text-xs text-zinc-500">Practice with fictional cases</span></button>' +
        '<button data-nursing-tab="anatomy" class="rounded-xl border border-zinc-200 p-3 text-left hover:border-indigo-300 dark:border-brand-700">🫀 <strong class="ml-1 text-sm">Anatomy studio</strong><span class="mt-1 block text-xs text-zinc-500">Explore eleven body systems</span></button>' +
        '</div></section>' +
        '<section class="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20"><h3 class="font-bold text-amber-950 dark:text-amber-100">Practice safely</h3><p class="mt-2 text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">These tools support learning. They are not clinical references or patient-care instructions. Use fictional cases only; never add patient names, dates of birth, room numbers, photos, or other identifying information.</p></section>' +
        '</div><p id="nursingSaveStatus" class="mt-4 text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">Your workspace is saved to your DueVinci account when online.</p></section>';
}

function renderClinicalTab() {
    const courseOptions = '<option value="">No class linked</option>' + availableCourses.map((course) => {
        const label = course.code ? course.code + ' · ' + course.name : course.name;
        return '<option value="' + escapeHtml(course.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');
    const cards = workspace.rotations.length
        ? '<div class="mt-5 grid gap-4 xl:grid-cols-2">' + workspace.rotations.map(rotationCard).join('') + '</div>'
        : '<div class="mt-5 rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-brand-600"><p class="font-bold">No rotations tracked yet</p><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Add a rotation, then list the skills you want to practice or have checked off.</p></div>';
    return '<section class="mx-auto max-w-6xl"><div class="mb-5"><h2 class="text-2xl font-black text-zinc-900 dark:text-white">Clinical tracker</h2><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Keep rotation dates and competency progress together. This tracker has no patient-detail fields.</p></div>' +
        '<form id="rotationForm" data-nursing-form="rotation" class="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-brand-700 dark:bg-brand-800 sm:grid-cols-2 lg:grid-cols-5">' +
        '<label class="text-xs font-semibold sm:col-span-2 lg:col-span-2">Rotation name<input name="name" maxlength="120" required placeholder="Example: Fundamentals clinical" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></label>' +
        '<label class="text-xs font-semibold">Linked class<select name="courseId" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900">' + courseOptions + '</select></label>' +
        '<label class="text-xs font-semibold">Start date<input name="startDate" type="date" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></label>' +
        '<label class="text-xs font-semibold">End date<input name="endDate" type="date" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></label>' +
        '<button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 sm:col-span-2 lg:col-span-5">Add rotation</button></form>' +
        cards + '<p id="nursingSaveStatus" class="mt-4 text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite"></p></section>';
}

function renderCarePlanTab() {
    const bodyOptions = '<option value="">Choose a study area</option>' + ANATOMY_SYSTEMS.map((system) => '<option>' + escapeHtml(system.name) + '</option>').join('');
    const saved = workspace.carePlans.length
        ? '<div class="mt-5 grid gap-3 md:grid-cols-2">' + workspace.carePlans.map((plan) => '<article class="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-800"><div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-zinc-900 dark:text-white">' + escapeHtml(plan.title) + '</h3><p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">' + escapeHtml(plan.bodySystem || 'General') + ' · ' + dateLabel((plan.createdAt || '').slice(0, 10)) + '</p></div><button type="button" data-action="delete-care-plan" data-id="' + escapeHtml(plan.id) + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40">Delete</button></div>' +
            '<details class="mt-3"><summary class="cursor-pointer text-xs font-bold text-indigo-700 dark:text-indigo-300">Open study draft</summary><dl class="mt-3 space-y-2 text-xs leading-5">' +
            '<dt class="font-bold">Practice scenario</dt><dd class="text-zinc-600 dark:text-zinc-300">' + escapeHtml(plan.scenario || '—') + '</dd>' +
            '<dt class="font-bold">Cues to notice</dt><dd class="text-zinc-600 dark:text-zinc-300">' + escapeHtml(plan.cues || '—') + '</dd>' +
            '<dt class="font-bold">Priority concept</dt><dd class="text-zinc-600 dark:text-zinc-300">' + escapeHtml(plan.priority || '—') + '</dd>' +
            '<dt class="font-bold">Outcome / goal</dt><dd class="text-zinc-600 dark:text-zinc-300">' + escapeHtml(plan.outcome || '—') + '</dd>' +
            '<dt class="font-bold">Actions and rationale</dt><dd class="text-zinc-600 dark:text-zinc-300">' + escapeHtml(plan.actions || '—') + '<br>' + escapeHtml(plan.rationale || '') + '</dd>' +
            '<dt class="font-bold">Evaluation</dt><dd class="text-zinc-600 dark:text-zinc-300">' + escapeHtml(plan.evaluation || '—') + '</dd></dl></details></article>').join('') + '</div>'
        : '<p class="mt-5 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500 dark:border-brand-600 dark:text-zinc-400">Your saved study drafts will appear here.</p>';
    return '<section class="mx-auto max-w-6xl"><div class="mb-5"><h2 class="text-2xl font-black text-zinc-900 dark:text-white">Care-plan studio</h2><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Use the nursing process to organize your own reasoning with a fictional practice case.</p></div>' +
        '<div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100"><strong>Fictional cases only.</strong> Drafts sync to your DueVinci account. Do not enter information from a real patient, even if names are removed. No patient identifiers or clinical documentation belong here.</div>' +
        '<form data-nursing-form="care-plan" class="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-brand-700 dark:bg-brand-800 sm:p-6">' +
        '<div class="grid gap-3 sm:grid-cols-2"><label class="text-xs font-semibold">Draft title<input name="title" maxlength="120" required placeholder="Example: Respiratory assessment practice" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></label><label class="text-xs font-semibold">Study area<select name="bodySystem" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900">' + bodyOptions + '</select></label></div>' +
        '<label class="block text-xs font-semibold">Fictional or instructor-provided practice scenario<textarea name="scenario" maxlength="1800" rows="2" placeholder="Use a made-up scenario. Do not include any real patient details." class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label>' +
        '<div class="grid gap-3 md:grid-cols-2"><label class="text-xs font-semibold">Cues to notice<textarea name="cues" maxlength="1800" rows="3" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label><label class="text-xs font-semibold">Priority concept or hypothesis<textarea name="priority" maxlength="1000" rows="3" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label><label class="text-xs font-semibold">Expected outcome or goal<textarea name="outcome" maxlength="1000" rows="3" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label><label class="text-xs font-semibold">Planned learning actions<textarea name="actions" maxlength="1800" rows="3" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label><label class="text-xs font-semibold">Why these actions fit the scenario<textarea name="rationale" maxlength="1800" rows="3" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label><label class="text-xs font-semibold">How would you evaluate the outcome?<textarea name="evaluation" maxlength="1400" rows="3" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label></div>' +
        '<label class="flex items-start gap-2 text-xs leading-5"><input name="fictionalConfirm" type="checkbox" required class="mt-1 rounded border-zinc-300 text-indigo-600"><span>I confirm this is a fictional study case and contains no real patient information.</span></label>' +
        '<button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500">Save study draft</button></form>' +
        saved + '<p id="nursingSaveStatus" class="mt-4 text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite"></p>' +
        '<p class="mt-5 text-[11px] text-zinc-500 dark:text-zinc-400">Study structure follows the nursing process described in <a class="underline" href="https://openstax.org/books/fundamentals-nursing/pages/13-1-evolution-of-nursing-diagnosis" target="_blank" rel="noreferrer">OpenStax Fundamentals of Nursing</a>. Use your course rubric and instructor guidance.</p></section>';
}

function renderDosageTab() {
    const problemIndex = Number(workspace.dosageIndex || 0) % DOSAGE_PROBLEMS.length;
    const problem = DOSAGE_PROBLEMS[problemIndex];
    const result = workspace.dosageProgress[problem.id] || { attempts: 0, correct: 0, completed: false };
    const feedback = dosageFeedback && dosageFeedback.id === problem.id
        ? '<div class="mt-4 rounded-xl border ' + (dosageFeedback.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100') + ' p-4" role="status"><p class="font-bold">' + (dosageFeedback.correct ? 'Correct — nice work.' : 'Try the setup again.') + '</p><p class="mt-1 text-sm">' + escapeHtml(problem.worked) + '</p></div>'
        : '';
    const completed = DOSAGE_PROBLEMS.reduce((sum, item) => sum + (workspace.dosageProgress[item.id] && workspace.dosageProgress[item.id].completed ? 1 : 0), 0);
    return '<section class="mx-auto max-w-4xl"><div class="mb-5"><h2 class="text-2xl font-black text-zinc-900 dark:text-white">Dosage practice</h2><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Practice-only arithmetic with fictional values and no drug names.</p></div>' +
        '<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">For coursework practice only. This is not a dosing tool. Follow your program’s method, unit conventions, rounding rules, drug references, and instructor guidance in real clinical settings.</div>' +
        '<article class="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-800 sm:p-7">' +
        '<div class="flex flex-wrap items-center justify-between gap-2"><span class="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">' + escapeHtml(problem.title) + '</span><span class="text-xs text-zinc-500 dark:text-zinc-400">Practice set ' + (problemIndex + 1) + ' of ' + DOSAGE_PROBLEMS.length + ' · ' + completed + ' completed</span></div>' +
        '<h3 class="mt-5 text-lg font-bold text-zinc-900 dark:text-white">' + escapeHtml(problem.prompt) + '</h3><p class="mt-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-brand-900 dark:text-zinc-200"><strong>Set-up:</strong> ' + escapeHtml(problem.formula) + '</p>' +
        '<form data-nursing-form="dosage" data-problem-id="' + problem.id + '" class="mt-5 flex flex-col gap-3 sm:flex-row"><label class="flex-1 text-xs font-semibold">Your answer<input name="answer" inputmode="decimal" autocomplete="off" required placeholder="Enter a number (unit optional)" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base dark:border-brand-600 dark:bg-brand-900"></label><button class="self-end rounded-lg bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500">Check answer</button></form>' +
        feedback + '<div class="mt-5 flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-zinc-500 dark:text-zinc-400">Attempts: ' + result.attempts + ' · Correct: ' + result.correct + '</p><button type="button" data-action="next-dosage" class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-bold hover:bg-zinc-50 dark:border-brand-600 dark:hover:bg-brand-700">Next problem →</button></div></article>' +
        '<p class="mt-5 text-xs text-zinc-500 dark:text-zinc-400">Calculation format is adapted from <a class="underline" href="https://openstax.org/books/pharmacology/pages/2-4-dosage-calculations" target="_blank" rel="noreferrer">OpenStax Pharmacology for Nurses, Dosage Calculations</a>. Check your program’s policy for rounding and units.</p>' +
        '<p id="nursingSaveStatus" class="mt-3 text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite"></p></section>';
}

function getAllCards() {
    return NURSING_STARTER_CARDS.concat(workspace.customCards);
}

function isCardDue(card) {
    const nextDate = workspace.cardMastery[card.id] && workspace.cardMastery[card.id].nextReviewDate;
    return !nextDate || nextDate <= getLocalDateKey();
}

function renderFlashcardsTab() {
    const cards = getAllCards();
    const due = cards.filter(isCardDue);
    const card = (due.length ? due : cards)[0];
    const mastery = card && workspace.cardMastery[card.id];
    const deckText = due.length ? due.length + ' due now' : 'Nothing due today — practice any card';
    const customRows = workspace.customCards.length
        ? '<ul class="mt-3 space-y-2">' + workspace.customCards.map((item) => '<li class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-brand-900"><span class="min-w-0 truncate"><strong>' + escapeHtml(item.topic) + ':</strong> ' + escapeHtml(item.front) + '</span><button type="button" data-action="delete-card" data-id="' + escapeHtml(item.id) + '" class="shrink-0 text-rose-600 hover:underline dark:text-rose-300">Remove</button></li>').join('') + '</ul>'
        : '<p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Your custom cards will appear here.</p>';
    const cardFace = card
        ? '<div class="mt-5 min-h-56 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-6 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-violet-950/30"><p class="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">' + escapeHtml(card.topic) + ' · ' + escapeHtml(deckText) + '</p><p class="mt-6 text-xl font-bold leading-relaxed text-zinc-900 dark:text-white">' + escapeHtml(showCardAnswer ? card.back : card.front) + '</p>' +
            (showCardAnswer ? '<p class="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Source: ' + escapeHtml(card.source) + '</p>' : '') +
            '<button type="button" data-action="flip-card" class="mt-6 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-brand-800 dark:text-indigo-200"> ' + (showCardAnswer ? 'Show question' : 'Reveal answer') + '</button>' +
            (showCardAnswer ? '<div class="mt-4 flex flex-wrap gap-2">' + [['Again', 0], ['Hard', 3], ['Good', 4], ['Easy', 5]].map((rating) => '<button type="button" data-action="rate-card" data-card-id="' + escapeHtml(card.id) + '" data-quality="' + rating[1] + '" class="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">' + rating[0] + '</button>').join('') + '</div>' : '') + '</div>'
        : '<p class="mt-5 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500 dark:border-brand-600 dark:text-zinc-400">No cards are available.</p>';
    const customForm = '<form data-nursing-form="card" class="mt-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-800 sm:grid-cols-3"><label class="text-xs font-semibold">Topic<input name="topic" maxlength="60" placeholder="Pharmacology" class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></label><label class="text-xs font-semibold sm:col-span-2">Question / front<input name="front" maxlength="500" required class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></label><label class="text-xs font-semibold sm:col-span-3">Answer / back<textarea name="back" maxlength="1200" rows="2" required class="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-brand-600 dark:bg-brand-900"></textarea></label><button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 sm:col-span-3">Add card to my deck</button></form>';
    return '<section class="mx-auto max-w-4xl"><div class="mb-5"><h2 class="text-2xl font-black text-zinc-900 dark:text-white">Nursing flashcards</h2><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Review starter cards or make a deck from your own study notes. Ratings schedule the next review using DueVinci’s SM-2 system.</p></div>' +
        '<div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-800"><div class="flex items-center justify-between gap-3"><h3 class="font-bold text-zinc-900 dark:text-white">Review deck</h3><span class="text-xs text-zinc-500 dark:text-zinc-400">' + deckText + '</span></div>' + cardFace + '<p class="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">Starter cards summarize concepts from the linked OpenStax chapters. Confirm content with your assigned text and course materials.</p></div>' +
        '<div class="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-800"><h3 class="font-bold text-zinc-900 dark:text-white">My custom cards</h3>' + customRows + '</div>' +
        customForm + '<p id="nursingSaveStatus" class="mt-4 text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite"></p></section>';
}

function renderAnatomyTab() {
    const system = ANATOMY_SYSTEMS.find((item) => item.id === activeSystemId) || ANATOMY_SYSTEMS[0];
    const systemButtons = ANATOMY_SYSTEMS.map((item) => {
        const active = item.id === system.id;
        const complete = workspace.completedSystems.includes(item.id);
        return '<button type="button" data-system-id="' + item.id + '" class="flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ' + (active ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100' : 'border-zinc-200 bg-white hover:border-indigo-300 dark:border-brand-700 dark:bg-brand-800') + '"><span>' + item.icon + '</span><span class="min-w-0 flex-1">' + escapeHtml(item.name) + '</span>' + (complete ? '<span aria-label="Reviewed">✓</span>' : '') + '</button>';
    }).join('');
    const detail = '<article class="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-800 sm:p-7"><div class="flex items-start gap-4"><span class="text-4xl" aria-hidden="true">' + system.icon + '</span><div><p class="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Body system</p><h3 class="text-xl font-black text-zinc-900 dark:text-white">' + escapeHtml(system.name) + '</h3></div></div>' +
        '<dl class="mt-5 space-y-4"><div><dt class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Big picture</dt><dd class="mt-1 text-sm leading-6">' + escapeHtml(system.focus) + '</dd></div><div><dt class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Structures to review</dt><dd class="mt-1 text-sm leading-6">' + escapeHtml(system.structures) + '</dd></div></dl>' +
        '<div class="mt-5 rounded-xl bg-zinc-50 p-4 dark:bg-brand-900"><p class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Quick self-check</p><p class="mt-2 text-sm font-semibold">' + escapeHtml(system.check) + '</p>' +
        (showAnatomyAnswer ? '<p class="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">' + escapeHtml(system.answer) + '</p>' : '') +
        '<button type="button" data-action="reveal-anatomy" class="mt-3 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-bold hover:bg-white dark:border-brand-600 dark:hover:bg-brand-800">' + (showAnatomyAnswer ? 'Hide answer' : 'Check answer') + '</button></div>' +
        '<button type="button" data-action="mark-system" data-id="' + system.id + '" class="mt-4 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500">' + (workspace.completedSystems.includes(system.id) ? 'Mark for another review' : 'Mark reviewed') + '</button></article>';
    const reviewed = workspace.completedSystems.length;
    return '<section class="mx-auto max-w-6xl"><div class="mb-5"><h2 class="text-2xl font-black text-zinc-900 dark:text-white">Anatomy studio</h2><p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Explore body systems, test recall, and mark topics for review. ' + reviewed + ' of ' + ANATOMY_SYSTEMS.length + ' systems reviewed.</p></div>' +
        '<div class="grid gap-4 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)]"><nav aria-label="Body systems" class="grid content-start grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">' + systemButtons + '</nav>' + detail + '</div>' +
        '<p class="mt-5 text-xs text-zinc-500 dark:text-zinc-400">System overview follows <a class="underline" href="https://openstax.org/books/anatomy-and-physiology-2e/pages/1-2-structural-organization-of-the-human-body" target="_blank" rel="noreferrer">OpenStax Anatomy & Physiology 2e</a>. This compact overview is a starting point; use your assigned course text for complete detail.</p>' +
        '<p id="nursingSaveStatus" class="mt-3 text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite"></p></section>';
}

const TAB_DEFINITIONS = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'clinical', label: 'Clinicals', icon: '🩺' },
    { id: 'careplans', label: 'Care plans', icon: '🗂️' },
    { id: 'dosage', label: 'Dosage practice', icon: '🧮' },
    { id: 'flashcards', label: 'Flashcards', icon: '🎴' },
    { id: 'anatomy', label: 'Anatomy', icon: '🫀' }
];

function renderActiveTab() {
    const container = document.getElementById('nursingHub');
    if (!container) return;
    const body = activeTab === 'clinical' ? renderClinicalTab()
        : activeTab === 'careplans' ? renderCarePlanTab()
            : activeTab === 'dosage' ? renderDosageTab()
                : activeTab === 'flashcards' ? renderFlashcardsTab()
                    : activeTab === 'anatomy' ? renderAnatomyTab()
                        : renderOverview();
    container.innerHTML = '<div class="mx-auto max-w-6xl"><div class="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Nursing Hub tools">' +
        TAB_DEFINITIONS.map((tab) => '<button type="button" role="tab" aria-selected="' + (activeTab === tab.id ? 'true' : 'false') + '" data-nursing-tab="' + tab.id + '" class="rounded-xl px-3 py-2 text-xs font-bold transition ' + (activeTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300 dark:border-brand-700 dark:bg-brand-800 dark:text-zinc-300') + '">' + tab.icon + ' <span class="ml-1">' + tab.label + '</span></button>').join('') +
        '</div>' + body + '</div>';
}

function formValue(form, name) {
    const element = form.elements.namedItem(name);
    return element && typeof element.value === 'string' ? element.value.trim() : '';
}

function selectedCourseLabel(courseId) {
    const course = availableCourses.find((item) => item.id === courseId);
    if (!course) return '';
    return course.code ? course.code + ' · ' + course.name : course.name;
}

function saveAndRender() {
    if (saveWorkspace()) renderActiveTab();
}

function handleFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formType = form.dataset.nursingForm;
    if (!formType) return;
    event.preventDefault();

    if (formType === 'rotation') {
        const name = formValue(form, 'name');
        const startDate = safeDate(formValue(form, 'startDate'));
        const endDate = safeDate(formValue(form, 'endDate'));
        if (!name) return setStatus('Add a rotation name first.', true);
        if (startDate && endDate && endDate < startDate) return setStatus('The end date must be on or after the start date.', true);
        const courseId = formValue(form, 'courseId');
        workspace.rotations.unshift({
            id: newId('rotation'), name, courseId, courseLabel: selectedCourseLabel(courseId),
            startDate, endDate, skills: []
        });
        activeTab = 'clinical';
        saveAndRender();
        return;
    }
    if (formType === 'skill') {
        const name = formValue(form, 'skill');
        const rotation = workspace.rotations.find((item) => item.id === form.dataset.rotationId);
        if (!rotation || !name) return;
        rotation.skills.push({ id: newId('skill'), name: safeText(name, 120), status: 'planned' });
        saveAndRender();
        return;
    }
    if (formType === 'care-plan') {
        if (!form.elements.namedItem('fictionalConfirm')?.checked) return setStatus('Confirm the draft uses a fictional case before saving.', true);
        const title = formValue(form, 'title');
        if (!title) return setStatus('Give this study draft a title.', true);
        workspace.carePlans.unshift({
            id: newId('careplan'),
            title: safeText(title, 120),
            bodySystem: safeText(formValue(form, 'bodySystem'), 80),
            scenario: safeText(formValue(form, 'scenario'), 1800),
            cues: safeText(formValue(form, 'cues'), 1800),
            priority: safeText(formValue(form, 'priority'), 1000),
            outcome: safeText(formValue(form, 'outcome'), 1000),
            actions: safeText(formValue(form, 'actions'), 1800),
            rationale: safeText(formValue(form, 'rationale'), 1800),
            evaluation: safeText(formValue(form, 'evaluation'), 1400),
            createdAt: new Date().toISOString()
        });
        activeTab = 'careplans';
        saveAndRender();
        return;
    }
    if (formType === 'dosage') {
        const problem = DOSAGE_PROBLEMS.find((item) => item.id === form.dataset.problemId);
        if (!problem) return;
        const answer = formValue(form, 'answer');
        const correct = isDosageAnswerCorrect(answer, calculateDosagePracticeAnswer(problem), problem.unit);
        const record = workspace.dosageProgress[problem.id] || { attempts: 0, correct: 0, completed: false };
        record.attempts += 1;
        if (correct) {
            record.correct += 1;
            record.completed = true;
        }
        workspace.dosageProgress[problem.id] = record;
        dosageFeedback = { id: problem.id, correct };
        saveAndRender();
        return;
    }
    if (formType === 'card') {
        const front = formValue(form, 'front');
        const back = formValue(form, 'back');
        if (!front || !back) return setStatus('Add both a question and answer.', true);
        workspace.customCards.unshift({
            id: newId('card'),
            topic: safeText(formValue(form, 'topic'), 60) || 'My cards',
            front: safeText(front, 500),
            back: safeText(back, 1200),
            source: 'Your card'
        });
        showCardAnswer = false;
        activeTab = 'flashcards';
        saveAndRender();
    }
}

function handleHubClick(event) {
    const button = event.target && typeof event.target.closest === 'function' ? event.target.closest('button') : null;
    if (!button) return;
    if (button.dataset.nursingTab) {
        activeTab = button.dataset.nursingTab;
        dosageFeedback = null;
        showCardAnswer = false;
        showAnatomyAnswer = false;
        renderActiveTab();
        return;
    }
    if (button.dataset.systemId) {
        activeSystemId = button.dataset.systemId;
        showAnatomyAnswer = false;
        renderActiveTab();
        return;
    }
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'delete-rotation') {
        if (!window.confirm('Remove this rotation and its tracked skills?')) return;
        workspace.rotations = workspace.rotations.filter((item) => item.id !== id);
        saveAndRender();
    } else if (action === 'cycle-skill') {
        const rotation = workspace.rotations.find((item) => item.id === button.dataset.rotationId);
        const skill = rotation && rotation.skills.find((item) => item.id === button.dataset.skillId);
        if (!skill) return;
        skill.status = skill.status === 'planned' ? 'practiced' : skill.status === 'practiced' ? 'checked' : 'planned';
        saveAndRender();
    } else if (action === 'delete-care-plan') {
        if (!window.confirm('Delete this study draft?')) return;
        workspace.carePlans = workspace.carePlans.filter((item) => item.id !== id);
        saveAndRender();
    } else if (action === 'next-dosage') {
        workspace.dosageIndex = (Number(workspace.dosageIndex || 0) + 1) % DOSAGE_PROBLEMS.length;
        dosageFeedback = null;
        saveAndRender();
    } else if (action === 'flip-card') {
        showCardAnswer = !showCardAnswer;
        renderActiveTab();
    } else if (action === 'rate-card') {
        const cardId = button.dataset.cardId;
        const card = getAllCards().find((item) => item.id === cardId);
        if (!card) return;
        const quality = Number(button.dataset.quality);
        workspace.cardMastery[card.id] = calculateSM2Repetition(workspace.cardMastery[card.id] || {}, quality);
        showCardAnswer = false;
        const nextCard = getAllCards().find((item) => item.id !== card.id && isCardDue(item));
        if (!nextCard) {
            activeTab = 'flashcards';
        }
        saveAndRender();
    } else if (action === 'delete-card') {
        if (!window.confirm('Remove this card from your deck?')) return;
        workspace.customCards = workspace.customCards.filter((item) => item.id !== id);
        delete workspace.cardMastery[id];
        saveAndRender();
    } else if (action === 'reveal-anatomy') {
        showAnatomyAnswer = !showAnatomyAnswer;
        renderActiveTab();
    } else if (action === 'mark-system') {
        const exists = workspace.completedSystems.includes(id);
        workspace.completedSystems = exists ? workspace.completedSystems.filter((item) => item !== id) : workspace.completedSystems.concat(id);
        saveAndRender();
    }
}

export async function loadNursingPage() {
    const container = document.getElementById('nursingHub');
    if (!container) return;
    if (typeof localStorage === 'undefined' || localStorage.getItem('duevinci_workspace_nursing_hub') !== 'visible') {
        container.innerHTML = '<section class="mx-auto max-w-2xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-brand-700 dark:bg-brand-800 sm:p-8"><p class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Optional workspace feature</p><h2 class="mt-2 text-2xl font-black text-zinc-900 dark:text-white">Nursing Hub is turned off</h2><p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">Enable it to add clinical rotation tracking, fictional care-plan practice, dosage drills, flashcards, and anatomy review to your workspace. It will stay out of your sidebar until you opt in.</p><p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Use fictional study cases only. Do not save real patient information here.</p><div class="mt-5 flex flex-wrap gap-2"><button type="button" onclick="setWorkspaceFeatureVisibility(\'nursing_hub\', true)" class="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500">Enable Nursing Hub</button><a href="../index.html" class="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-brand-600 dark:hover:bg-brand-700">Back to dashboard</a></div></section>';
        return;
    }
    let userId = getWorkspaceUserId();
    try {
        const result = await supabaseClient.auth.getUser();
        userId = result && result.data && result.data.user ? result.data.user.id : userId;
    } catch {
        // An existing offline session may still open the locally saved workspace.
    }
    if (!userId) return;
    workspaceUserId = userId;
    try {
        workspace = sanitizeNursingWorkspace(JSON.parse(localStorage.getItem(getNursingStorageKey(userId)) || '{}'));
    } catch {
        workspace = createEmptyNursingWorkspace();
    }
    try {
        const result = await supabaseClient.from('courses').select('id, name, code').order('name');
        availableCourses = Array.isArray(result && result.data) ? result.data : [];
    } catch {
        availableCourses = [];
    }
    if (!container.dataset.nursingBound) {
        container.addEventListener('submit', handleFormSubmit);
        container.addEventListener('click', handleHubClick);
        container.dataset.nursingBound = 'true';
    }
    activeTab = 'overview';
    renderActiveTab();
}

if (typeof window !== 'undefined') window.loadNursingPage = loadNursingPage;
