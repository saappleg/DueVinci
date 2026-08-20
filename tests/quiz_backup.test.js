import { describe, it, expect, beforeAll } from 'vitest';

describe('Quiz Generator, Backup Schema & Calendar ICS Utilities', () => {
    let generateQuizQuestions;
    let generateQuizFromNotes;
    let buildBackupPayload;
    let validateBackupPayload;
    let generateICSString;

    beforeAll(async () => {
        const mod = await import('../js/app.js');
        generateQuizQuestions = mod.generateQuizQuestions || globalThis.generateQuizQuestions;
        generateQuizFromNotes = mod.generateQuizFromNotes || globalThis.generateQuizFromNotes;
        buildBackupPayload = mod.buildBackupPayload || globalThis.buildBackupPayload;
        validateBackupPayload = mod.validateBackupPayload || globalThis.validateBackupPayload;
        generateICSString = mod.generateICSString || globalThis.generateICSString;
    });

    describe('generateQuizQuestions from student submitted notes', () => {
        it('generates quiz questions directly from student submitted notes', () => {
            const course = { code: 'BIO 101', title: 'General Biology' };
            const studentNotes = `
                Mitochondria: Powerhouse of the cell generating ATP via oxidative phosphorylation.
                Photosynthesis: Light-dependent and Calvin cycle reactions converting sunlight into chemical glucose.
                CRISPR-Cas9: RNA-guided targeted genome editing endonuclease.
            `;

            const questions = generateQuizFromNotes(studentNotes, course);
            expect(questions.length).toBe(3);
            expect(questions[0].topic).toBe('Mitochondria');
            expect(questions[0].options.length).toBe(4);
            expect(questions[0].options[questions[0].correctIndex]).toContain('ATP');
            expect(questions[0].explanation).toContain('Mitochondria');
        });

        it('generates multiple choice questions from course assignments when notes are absent', () => {
            const course = { code: 'BIO 101', title: 'General Biology' };
            const assignments = [
                { title: '↳ Cellular Respiration', due_date: '2026-09-01' },
                { title: '↳ Photosynthesis & Light Reactions', due_date: '2026-09-08' },
                { title: '↳ DNA Replication & Repair', due_date: '2026-09-15' },
                { title: '↳ Gene Expression', due_date: '2026-09-22' }
            ];

            const questions = generateQuizQuestions(course, assignments);
            expect(questions.length).toBe(4);

            const first = questions[0];
            expect(first.topic).toBe('Cellular Respiration');
            expect(first.unit).toBe(1);
            expect(first.options.length).toBe(4);
            expect(first.correctIndex).toBeGreaterThanOrEqual(0);
            expect(first.correctIndex).toBeLessThan(4);
            expect(first.explanation).toContain('Cellular Respiration');
        });

        it('provides default structured questions if course has no assignments or notes', () => {
            const course = { code: 'CS 50' };
            const questions = generateQuizQuestions(course, []);
            expect(questions.length).toBeGreaterThan(0);
            expect(questions[0].options.length).toBe(4);
            expect(questions[0].correctIndex).toBe(0);
        });
    });

    describe('Backup Payload & Schema Validation', () => {
        it('builds a structured backup payload matching DueVinci schema', () => {
            const courses = [{ id: 'c1', code: 'MATH 201' }];
            const assignments = [{ id: 'a1', title: 'Calculus Quiz', course_id: 'c1' }];
            const timers = [{ id: 't1', name: 'Focus', focusMin: 25 }];
            const prefs = { theme: 'dark', gpaScale: '4.0' };

            const payload = buildBackupPayload(courses, assignments, [], timers, prefs);
            expect(payload.version).toBe('1.0');
            expect(payload.app).toBe('DueVinci');
            expect(payload.data.courses).toEqual(courses);
            expect(payload.data.assignments).toEqual(assignments);
            expect(payload.data.timers).toEqual(timers);
            expect(payload.data.preferences.theme).toBe('dark');
        });

        it('validates correct backup schema', () => {
            const validPayload = {
                version: '1.0',
                app: 'DueVinci',
                data: {
                    courses: [],
                    assignments: []
                }
            };
            expect(validateBackupPayload(validPayload).valid).toBe(true);
        });

        it('rejects malformed or invalid backup payloads', () => {
            expect(validateBackupPayload(null).valid).toBe(false);
            expect(validateBackupPayload({ invalid: true }).valid).toBe(false);
            expect(validateBackupPayload({ data: { courses: 'not-an-array', assignments: [] } }).valid).toBe(false);
        });
    });

    describe('generateICSString', () => {
        it('generates standard RFC 5545 compliant VCALENDAR string', () => {
            const events = [
                { id: 'ev1', title: 'Midterm Exam', start: '2026-10-15', course: 'BIO 101' },
                { id: 'ev2', title: 'Final Project Submission', date: '2026-12-10' }
            ];

            const ics = generateICSString(events, 'My Study Schedule');
            expect(ics).toContain('BEGIN:VCALENDAR');
            expect(ics).toContain('VERSION:2.0');
            expect(ics).toContain('X-WR-CALNAME:My Study Schedule');
            expect(ics).toContain('SUMMARY:Midterm Exam');
            expect(ics).toContain('DTSTART;VALUE=DATE:20261015');
            expect(ics).toContain('SUMMARY:Final Project Submission');
            expect(ics).toContain('DTSTART;VALUE=DATE:20261210');
            expect(ics).toContain('END:VCALENDAR');
        });

        it('safely handles empty events list', () => {
            const ics = generateICSString([], 'Empty Schedule');
            expect(ics).toContain('BEGIN:VCALENDAR');
            expect(ics).toContain('END:VCALENDAR');
        });
    });
});
