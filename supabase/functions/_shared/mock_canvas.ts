// Development-only Canvas fixtures. These are enabled only when the Dev
// Supabase project has ENABLE_CANVAS_MOCK=true; Production never sets it.
export const DEV_MOCK_CANVAS_DOMAIN = 'https://mock.canvas.duevinci.test'
export const DEV_MOCK_CANVAS_TOKEN = 'dev-mock-canvas-token'

export const DEV_MOCK_CANVAS_COURSES = [
  { id: 910001, name: 'Introduction to Psychology', course_code: 'PSY 101', term: { name: 'Fall 2026' } },
  { id: 910002, name: 'College Algebra', course_code: 'MATH 110', term: { name: 'Fall 2026' } },
  { id: 910003, name: 'Academic Writing', course_code: 'ENG 101', term: { name: 'Fall 2026' } },
]

export const DEV_MOCK_CANVAS_ASSIGNMENTS: Record<string, Array<Record<string, unknown>>> = {
  '910001': [
    { id: 920001, name: 'Research Methods Reflection', due_at: '2026-09-08T23:59:00Z', submission_types: ['online_text_entry'] },
    { id: 920002, name: 'Chapter 1 Quiz', due_at: '2026-09-12T23:59:00Z', submission_types: ['online_quiz'] },
  ],
  '910002': [
    { id: 920003, name: 'Problem Set 1', due_at: '2026-09-10T23:59:00Z', submission_types: ['online_upload'] },
  ],
  '910003': [
    { id: 920004, name: 'Narrative Essay Draft', due_at: '2026-09-15T23:59:00Z', submission_types: ['online_upload'] },
  ],
}

export const mockCanvasEnabled = () => Deno.env.get('ENABLE_CANVAS_MOCK') === 'true'

export const isMockCanvasConnection = (domain: string) =>
  mockCanvasEnabled() && domain === DEV_MOCK_CANVAS_DOMAIN
