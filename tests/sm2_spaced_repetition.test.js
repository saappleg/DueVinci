import { describe, it, expect, beforeAll, vi } from 'vitest';
import ankiTextGuidFixture from './fixtures/anki-text-guid.tsv?raw';

describe('SuperMemo SM-2 Spaced Repetition Engine', () => {
    let calculateSM2Repetition;
    let buildTimedMockExam;
    let getNoteDerivedMockExamQuestions;
    let getMockExamRemainingSeconds;
    let scoreTimedMockExam;
    let confirmActiveMockExamReplacement;
    let preventActiveMockExamNavigation;
    let shouldHandleMockExamKeyboard;
    let buildAnkiTextExport;
    let parseAnkiTextImport;
    let mergeAnkiCardsIntoDeck;
    let sanitizeFlashcardMastery;

    beforeAll(async () => {
        const mod = await import('../js/modules/flashcards.js');
        calculateSM2Repetition = mod.calculateSM2Repetition || globalThis.calculateSM2Repetition;
        buildTimedMockExam = mod.buildTimedMockExam;
        getNoteDerivedMockExamQuestions = mod.getNoteDerivedMockExamQuestions;
        getMockExamRemainingSeconds = mod.getMockExamRemainingSeconds;
        scoreTimedMockExam = mod.scoreTimedMockExam;
        confirmActiveMockExamReplacement = mod.confirmActiveMockExamReplacement;
        preventActiveMockExamNavigation = mod.preventActiveMockExamNavigation;
        shouldHandleMockExamKeyboard = mod.shouldHandleMockExamKeyboard;
        buildAnkiTextExport = mod.buildAnkiTextExport;
        parseAnkiTextImport = mod.parseAnkiTextImport;
        mergeAnkiCardsIntoDeck = mod.mergeAnkiCardsIntoDeck;
        sanitizeFlashcardMastery = mod.sanitizeFlashcardMastery;
    });

    describe('calculateSM2Repetition', () => {
        it('initializes new card on first successful review with 1 day interval', () => {
            const card = { repetitions: 0, interval: 1, easinessFactor: 2.5 };
            const result = calculateSM2Repetition(card, 4); // Good
            expect(result.repetitions).toBe(1);
            expect(result.interval).toBe(1);
            expect(result.easinessFactor).toBe(2.5);
            expect(result.nextReviewDate).toBeDefined();
        });

        it('increases interval to 6 days on second successful review', () => {
            const card = { repetitions: 1, interval: 1, easinessFactor: 2.5 };
            const result = calculateSM2Repetition(card, 4); // Good
            expect(result.repetitions).toBe(2);
            expect(result.interval).toBe(6);
        });

        it('scales interval by Easiness Factor on subsequent reviews', () => {
            const card = { repetitions: 2, interval: 6, easinessFactor: 2.5 };
            const result = calculateSM2Repetition(card, 5); // Easy
            expect(result.repetitions).toBe(3);
            expect(result.interval).toBe(16); // 6 * 2.6 = 15.6 -> 16
            expect(result.easinessFactor).toBe(2.6);
        });

        it('resets repetitions and interval to 1 on blackout or failure (rating < 3)', () => {
            const card = { repetitions: 5, interval: 35, easinessFactor: 2.6 };
            const result = calculateSM2Repetition(card, 1); // Again / Forgot
            expect(result.repetitions).toBe(0);
            expect(result.interval).toBe(1);
            expect(result.easinessFactor).toBeLessThan(2.6);
        });

        it('enforces minimum Easiness Factor floor of 1.3', () => {
            const card = { repetitions: 0, interval: 1, easinessFactor: 1.3 };
            const result = calculateSM2Repetition(card, 0); // Complete Blackout
            expect(result.easinessFactor).toBe(1.3);
        });
    });

    describe('Timed mock exams', () => {
        const notes = [
            'Mitochondria: Cellular structures that generate ATP through oxidative phosphorylation.',
            'Photosynthesis: Process that converts light energy into stored chemical energy.',
            'Osmosis: Movement of water across a selectively permeable membrane.',
            'Homeostasis: Regulation that keeps internal conditions within stable ranges.'
        ].join('\n');

        it('builds the mock pool only when every answer choice comes from note definitions', () => {
            const questions = getNoteDerivedMockExamQuestions(notes, { code: 'BIO 101' });
            expect(questions).toHaveLength(4);
            const definitions = new Set(notes.split('\n').map((line) => line.split(': ')[1].toLocaleLowerCase()));
            questions.forEach((question) => {
                expect(question.options).toHaveLength(4);
                expect(question.options.every((option) => definitions.has(option.toLocaleLowerCase()))).toBe(true);
            });
            expect(getNoteDerivedMockExamQuestions(notes.split('\n').slice(0, 3).join('\n'), { code: 'BIO 101' })).toEqual([]);
        });

        it('shuffles question and answer order while retaining each correct answer', () => {
            const pool = getNoteDerivedMockExamQuestions(notes, { code: 'BIO 101' });
            const exam = buildTimedMockExam(pool, 3, 10, () => 0);
            expect(exam.durationSeconds).toBe(600);
            expect(exam.questions).toHaveLength(3);
            expect(exam.questions.map((question) => question.id)).not.toEqual(pool.slice(0, 3).map((question) => question.id));
            exam.questions.forEach((question) => {
                const source = pool.find((item) => item.id === question.id);
                expect(question.options).not.toEqual(source.options);
                expect(question.options[question.correctIndex]).toBe(source.options[source.correctIndex]);
            });
        });

        it('samples a shorter exam from the entire question pool', () => {
            const pool = Array.from({ length: 4 }, (_, index) => ({
                id: `question-${index + 1}`,
                question: `Question ${index + 1}`,
                explanation: `Explanation ${index + 1}`,
                options: ['correct', 'distractor a', 'distractor b', 'distractor c'],
                correctIndex: 0
            }));
            const exam = buildTimedMockExam(pool, 2, 5, () => 0);
            expect(new Set(exam.questions.map((question) => question.id))).toEqual(new Set(['question-2', 'question-3']));
        });

        it('scores unanswered items as incorrect, and clamps countdown at zero', () => {
            const questions = [
                { options: ['a', 'b'], correctIndex: 0 },
                { options: ['a', 'b'], correctIndex: 1 }
            ];
            expect(scoreTimedMockExam(questions, [0, null])).toEqual({ correct: 1, answered: 1, total: 2, unanswered: 1, percent: 50 });
            expect(getMockExamRemainingSeconds(5001, 1000)).toBe(5);
            expect(getMockExamRemainingSeconds(999, 1000)).toBe(0);
            expect(getMockExamRemainingSeconds('bad', 1000)).toBe(0);
        });

        it('rejects invalid question counts and time limits', () => {
            const pool = getNoteDerivedMockExamQuestions(notes, { code: 'BIO 101' });
            expect(() => buildTimedMockExam(pool, 0, 10)).toThrow('Choose between 1');
            expect(() => buildTimedMockExam(pool, 2, 61)).toThrow('time limit');
        });

        it('requires confirmation before replacing an active exam and leaves completed exams alone', () => {
            const activeExam = { status: 'in-progress' };
            const decline = vi.fn(() => false);
            const accept = vi.fn(() => true);
            expect(confirmActiveMockExamReplacement(activeExam, decline)).toBe(false);
            expect(decline).toHaveBeenCalledOnce();
            expect(confirmActiveMockExamReplacement(activeExam, accept)).toBe(true);
            expect(accept).toHaveBeenCalledOnce();
            expect(confirmActiveMockExamReplacement({ status: 'finished' }, decline)).toBe(true);
            expect(decline).toHaveBeenCalledOnce();
        });

        it('handles keyboard shortcuts only in a focused, visible mock exam', () => {
            const activeExam = { status: 'in-progress' };
            expect(shouldHandleMockExamKeyboard(activeExam, 'mock-exam', true, true)).toBe(true);
            expect(shouldHandleMockExamKeyboard(activeExam, 'mock-exam', false, true)).toBe(false);
            expect(shouldHandleMockExamKeyboard(activeExam, 'flashcards', true, true)).toBe(false);
            expect(shouldHandleMockExamKeyboard(activeExam, 'mock-exam', true, false)).toBe(false);
            expect(shouldHandleMockExamKeyboard({ status: 'finished' }, 'mock-exam', true, true)).toBe(false);
        });

        it('requests native page-exit confirmation only while an exam is in progress', () => {
            const activeEvent = { preventDefault: vi.fn(), returnValue: '' };
            expect(preventActiveMockExamNavigation(activeEvent, { status: 'in-progress' })).toBe(true);
            expect(activeEvent.preventDefault).toHaveBeenCalledOnce();
            expect(activeEvent.returnValue).toContain('active mock exam');

            const finishedEvent = { preventDefault: vi.fn(), returnValue: '' };
            expect(preventActiveMockExamNavigation(finishedEvent, { status: 'finished' })).toBe(false);
            expect(finishedEvent.preventDefault).not.toHaveBeenCalled();
            expect(finishedEvent.returnValue).toBe('');
        });
    });

    describe('Anki text exchange', () => {
        it('imports official-style note fields and preserves distinct GUID identities', () => {
            const result = parseAnkiTextImport(ankiTextGuidFixture);
            expect(result.cards).toEqual([
                { term: 'Mitochondria', definition: 'Cellular structures that generate ATP.', guid: 'guid-1' },
                { term: 'Photosynthesis', definition: 'Process that converts light into stored chemical energy.', guid: 'guid-2' },
                { term: 'Mitochondria', definition: 'Cellular structures that generate ATP.', guid: 'guid-3' },
                { term: 'Mitochondria', definition: 'A conflicting definition.', guid: 'guid-4' },
                { term: 'Term with "quote" and tab\tinside', definition: 'Line one\nLine two', guid: 'guid-6' }
            ]);
            expect(result.duplicateRows).toBe(0);
            expect(result.conflictingRows).toBe(0);
            expect(result.invalidRows).toBe(1);
            expect(result.error).toBeNull();
        });

        it('deduplicates and flags conflicting rows by GUID, with front-text fallback when GUID is absent', () => {
            const withGuid = parseAnkiTextImport([
                '#separator:Tab',
                '#columns:GUID\tFront\tBack',
                '#guid column:1',
                'same-id\tTerm\tDefinition',
                'same-id\tTerm\tDefinition',
                'conflict-id\tOther\tFirst definition',
                'conflict-id\tOther\tChanged definition'
            ].join('\n'));
            expect(withGuid.cards).toEqual([
                { term: 'Term', definition: 'Definition', guid: 'same-id' },
                { term: 'Other', definition: 'First definition', guid: 'conflict-id' }
            ]);
            expect(withGuid.duplicateRows).toBe(1);
            expect(withGuid.conflictingRows).toBe(1);

            const withoutGuid = parseAnkiTextImport('Front\tBack\nTerm\tDefinition\nterm\t definition ');
            expect(withoutGuid.cards).toEqual([{ term: 'Term', definition: 'Definition' }]);
            expect(withoutGuid.duplicateRows).toBe(1);
        });

        it('exports an Anki text file that round-trips GUIDs, tabs, quotes, and newlines', () => {
            const cards = [
                { term: 'Term\twith tab', definition: 'Line one\nLine "two"' },
                { term: 'Second term', definition: 'A definition' }
            ];
            const content = buildAnkiTextExport(cards, 'BIO 101');
            expect(content.startsWith('#separator:Tab\n#html:false\n#deck:DueVinci::BIO 101\n#guid column:1\n#columns:GUID\tFront\tBack\n')).toBe(true);
            expect(parseAnkiTextImport(content).cards).toEqual(cards);
            expect(content).not.toContain('.apkg');
        });

        it('preserves existing Anki GUIDs when exporting imported cards', () => {
            const content = buildAnkiTextExport([{
                term: 'Mitochondria', definition: 'Generates ATP.', ankiGuid: 'stable-note-guid'
            }], 'BIO 101');
            expect(content).toContain('stable-note-guid\tMitochondria\tGenerates ATP.');
            expect(parseAnkiTextImport(content).cards).toEqual([{
                term: 'Mitochondria', definition: 'Generates ATP.', guid: 'stable-note-guid'
            }]);
        });

        it('reads the existing quoted CSV export format and rejects malformed or oversized input', () => {
            expect(parseAnkiTextImport('Front,Back\n"Term, with comma","Definition with ""quotes"""').cards)
                .toEqual([{ term: 'Term, with comma', definition: 'Definition with "quotes"' }]);
            expect(parseAnkiTextImport('Front\tBack\n"unfinished\tvalue').error).toContain('not closed');
            expect(parseAnkiTextImport('Front\tBack\n"term"x\tdefinition').error).toContain('after a quoted field');
            expect(parseAnkiTextImport('Front\tBack\nte"rm\tdefinition').error).toContain('only start an empty field');
            expect(parseAnkiTextImport('Term\tDefinition', { maxFileLength: 3 }).error).toContain('configured import size limit');
        });

        it('updates an existing card by GUID after its front changes and retains front fallback', () => {
            const existingDeck = [{
                id: 'anki-original', source: 'anki', ankiGuid: 'stable-note-guid',
                term: 'Old front', definition: 'Old definition', repetitions: 4, interval: 12
            }];
            const existingMastery = {
                'anki-original': {
                    source: 'anki', ankiGuid: 'stable-note-guid', term: 'Old front', definition: 'Old definition',
                    repetitions: 4, interval: 12, easinessFactor: 2.4
                }
            };
            const updated = mergeAnkiCardsIntoDeck(existingDeck, existingMastery, [
                { guid: 'stable-note-guid', term: 'New front', definition: 'New definition' }
            ]);
            expect(updated).toMatchObject({ added: 0, updated: 1 });
            expect(updated.cards).toHaveLength(1);
            expect(updated.cards[0]).toMatchObject({
                id: 'anki-original', ankiGuid: 'stable-note-guid', term: 'New front', definition: 'New definition',
                repetitions: 4, interval: 12
            });

            const fallback = mergeAnkiCardsIntoDeck(
                [{ id: 'legacy-anki', source: 'anki', term: 'Water cycle', definition: 'Old definition' }],
                {},
                [{ term: 'Water cycle', definition: 'Updated definition' }]
            );
            expect(fallback).toMatchObject({ added: 0, updated: 1 });
            expect(fallback.cards[0].definition).toBe('Updated definition');
        });

        it('allows distinct GUID cards to share a front without colliding on their IDs', () => {
            const result = mergeAnkiCardsIntoDeck([], {}, [
                { guid: 'note-a', term: 'Shared front', definition: 'First answer' },
                { guid: 'note-b', term: 'Shared front', definition: 'Second answer' }
            ]);
            expect(result).toMatchObject({ added: 2, updated: 0, conflicts: 0 });
            expect(result.cards).toHaveLength(2);
            expect(result.cards[0].id).not.toBe(result.cards[1].id);
        });

        it('adds, updates prior imports, skips duplicates, and preserves generated-note conflicts', () => {
            const existingDeck = [
                { id: 'note-1', source: 'notes', term: 'Water cycle', definition: 'Generated from course notes.' },
                { id: 'anki-old', source: 'anki', term: 'Mitochondria', definition: 'Old definition', repetitions: 4 }
            ];
            const existingMastery = {
                'anki-old': {
                    source: 'anki', term: 'Mitochondria', definition: 'Old definition',
                    repetitions: 4, interval: 12, easinessFactor: 2.4, lastReviewedAt: '2026-10-01T10:00:00.000Z'
                }
            };
            const result = mergeAnkiCardsIntoDeck(existingDeck, existingMastery, [
                { term: 'mitochondria', definition: 'Old definition' },
                { term: 'Mitochondria', definition: 'Updated definition' },
                { term: 'Water cycle', definition: 'Replace generated content' },
                { term: 'Osmosis', definition: 'Water movement across a selective barrier.' },
                { term: '', definition: 'Invalid front' }
            ], '2026-10-17T12:00:00.000Z');

            expect(result).toMatchObject({ added: 1, updated: 1, duplicates: 1, conflicts: 2 });
            expect(result.cards.find((card) => card.id === 'anki-old')).toMatchObject({
                term: 'Mitochondria', definition: 'Updated definition', repetitions: 4, interval: 12,
                contentUpdatedAt: '2026-10-17T12:00:00.000Z'
            });
            expect(result.cards.find((card) => card.id === 'note-1').definition).toBe('Generated from course notes.');
            expect(result.cards.some((card) => card.term === 'Osmosis' && card.source === 'anki')).toBe(true);
            expect(existingDeck[1].definition).toBe('Old definition');
        });

        it('keeps imported note content in sanitized, account-scoped mastery backups', () => {
            const safe = sanitizeFlashcardMastery({
                anki_1: { source: 'anki', ankiGuid: 'stable-note-guid', term: 'Mitochondria', definition: 'Generates ATP.', repetitions: 2, interval: 6 },
                anki_2: { source: 'anki', term: 'Term', definition: 'x'.repeat(5001) }
            });
            expect(safe.anki_1).toMatchObject({ source: 'anki', ankiGuid: 'stable-note-guid', term: 'Mitochondria', definition: 'Generates ATP.', repetitions: 2 });
            expect(safe.anki_2).not.toHaveProperty('source');
        });
    });
});
