import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { authenticatedUser } from '../_shared/canvas.ts'

const MAX_REQUEST_BYTES = 12 * 1024 * 1024
const MAX_SYLLABUS_CHARACTERS = 100_000
const MAX_IMAGE_BASE64_LENGTH = 11_200_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const models = [...new Set([
  Deno.env.get('GEMINI_SYLLABUS_MODEL') || 'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
])]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function providerMessage(status: number, detail: unknown) {
  const message = typeof detail === 'object' && detail !== null && 'error' in detail
    ? String((detail as { error?: { message?: string } }).error?.message || '') : ''
  return message || `Gemini returned HTTP ${status}`
}

async function generateContent(apiKey: string, bodyPayload: object) {
  let lastStatus = 0
  let lastMessage = 'No Gemini model was available.'

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(bodyPayload),
      })
      const responseBody = await response.json().catch(() => null)
      if (response.ok && responseBody?.candidates?.[0]?.content?.parts?.[0]?.text) return responseBody

      lastStatus = response.status
      lastMessage = providerMessage(response.status, responseBody)
      console.error(`Syllabus Gemini request failed (${response.status}, ${model}):`, lastMessage)
      if (![404, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : 'Network request failed.'
      console.error(`Syllabus Gemini request failed (${model}):`, lastMessage)
    }
  }

  if (lastStatus === 401 || lastStatus === 403) throw new Error('Syllabus AI credentials were rejected. Contact support.')
  if (lastStatus === 429) throw new Error('Syllabus AI is temporarily at capacity. Please try again in a minute.')
  throw new Error(`Syllabus AI could not respond. ${lastMessage}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const contentLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'The uploaded file is too large. Please use a smaller syllabus or image.' }, 413)
  }

  try {
    await authenticatedUser(req)
  } catch {
    return json({ error: 'Sign in before using Syllabus AI.' }, 401)
  }

  try {
    const { type, text, imageBase64, mimeType } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('Syllabus AI is not configured yet.')

    const currentYear = new Date().getFullYear()
    let bodyPayload: object
    if (type === 'syllabus') {
      if (typeof text !== 'string' || text.length === 0 || text.length > MAX_SYLLABUS_CHARACTERS) {
        return json({ error: 'Syllabus text must be non-empty and no longer than 100,000 characters.' }, 413)
      }
      bodyPayload = { contents: [{ parts: [{ text: `You are a syllabus parser. The current year is ${currentYear}. Read this syllabus and return ONLY a valid JSON object. Do not include markdown formatting or backticks. The JSON must have: 'description' (string, max 250 chars), 'objectives' (string, max 250 chars), and 'units' (array of objects with 'num' (integer), 'title', 'dateStr' (string, extract the exact date text if present), and a 'lessons' array of strings). Syllabus text: ${text}` }] }] }
    } else if (type === 'syllabus_metadata') {
      if (typeof text !== 'string' || text.length === 0 || text.length > MAX_SYLLABUS_CHARACTERS) {
        return json({ error: 'Syllabus text must be non-empty and no longer than 100,000 characters.' }, 413)
      }
      bodyPayload = { contents: [{ parts: [{ text: `You are a syllabus analyzer. Read this syllabus and return ONLY a valid JSON object. Do not include markdown formatting or backticks. The JSON must have ONLY: 'description' (string, max 250 chars) and 'objectives' (string, max 250 chars). Do not include units or lessons. Syllabus text: ${text}` }] }] }
    } else if (type === 'screenshot') {
      if (typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > MAX_IMAGE_BASE64_LENGTH
        || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return json({ error: 'Use a JPEG, PNG, or WebP image under 8 MB.' }, 413)
      }
      bodyPayload = { contents: [{ parts: [
        { text: `You are a course lesson parser. The current year is ${currentYear}. Read this screenshot. Return ONLY a valid JSON object (no markdown, no backticks). It must contain a 'units' array. Each unit should be an object with: 'num' (integer), 'title' (string), 'dateStr' (string, the START date for this unit — if a date range is shown like "Aug 26 – Sep 2" extract only the first date "Aug 26"), 'endDateStr' (string or null, the END date if a date range is shown — e.g. "Sep 2" — otherwise null), and 'lessons' (array of strings). If a single date is shown, set endDateStr to null.` },
        { inlineData: { mimeType, data: imageBase64 } },
      ] }] }
    } else {
      throw new Error('Unsupported Syllabus AI request.')
    }

    const data = await generateContent(apiKey, bodyPayload)
    return json({ result: data.candidates[0].content.parts[0].text })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Syllabus request failed.'
    console.error('Syllabus parser error:', message)
    return json({ error: message }, 400)
  }
})
