// Development-only Canvas fixtures. These are enabled only when the Dev
// Supabase project has ENABLE_CANVAS_MOCK=true; Production never sets it.
export const DEV_MOCK_CANVAS_DOMAIN = 'https://mock.canvas.duevinci.test'
export const DEV_MOCK_CANVAS_TOKEN = 'dev-mock-canvas-token'

export const DEV_MOCK_CANVAS_COURSES = [
  { id: 910001, name: 'Introduction to Psychology', course_code: 'PSY 101', term: { name: 'Fall 2026' } },
  { id: 910002, name: 'College Algebra', course_code: 'MATH 110', term: { name: 'Fall 2026' } },
  { id: 910003, name: 'Academic Writing', course_code: 'ENG 101', term: { name: 'Fall 2026' } },
]

export const mockCanvasEnabled = () => Deno.env.get('ENABLE_CANVAS_MOCK') === 'true'

export const isMockCanvasConnection = (domain: string) =>
  mockCanvasEnabled() && domain === DEV_MOCK_CANVAS_DOMAIN
