import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const resendUrl = 'https://api.resend.com/emails'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) throw new Error('Missing Authorization header')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user }, error } = await admin.auth.getUser(authorization.replace('Bearer ', ''))
  if (error || !user) throw new Error('Unauthorized')
  return { admin, user }
}

function requiredString(value: unknown, label: string, maxLength: number) {
  const result = String(value || '').trim()
  if (!result) throw new Error(`${label} is required.`)
  if (result.length > maxLength) throw new Error(`${label} is too long.`)
  return result
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character] || character))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { admin, user } = await authenticatedUser(req)
    const body = await req.json()
    const category = requiredString(body.category, 'Category', 80)
    const email = requiredString(body.email, 'Email', 254).toLowerCase()
    const subject = requiredString(body.subject, 'Subject', 160)
    const message = requiredString(body.message, 'Message', 5000)
    if (!validEmail(email)) throw new Error('Enter a valid email address.')

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const supportTo = Deno.env.get('SUPPORT_TO_EMAIL')
    const supportFrom = Deno.env.get('SUPPORT_FROM_EMAIL')
    if (!apiKey || !supportTo || !supportFrom) {
      throw new Error('Support email is not configured yet. Please use the Email App button.')
    }

    // Keep an auditable ticket even if Resend later rejects delivery.
    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .insert({ user_id: user.id, email, category, subject, message, status: 'sending', created_at: new Date().toISOString() })
      .select('id')
      .single()
    if (ticketError) throw ticketError

    const emailResponse = await fetch(resendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DueVinci Support/1.0',
        'Idempotency-Key': `support-ticket-${ticket.id}`,
      },
      body: JSON.stringify({
        from: supportFrom,
        to: [supportTo],
        reply_to: email,
        subject: `[DueVinci · ${category}] ${subject}`,
        text: `From: ${email}\nCategory: ${category}\n\n${message}`,
        html: `<p><strong>From:</strong> ${escapeHtml(email)}</p><p><strong>Category:</strong> ${escapeHtml(category)}</p><hr><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      }),
    })
    const emailResult = await emailResponse.json().catch(() => ({}))
    if (!emailResponse.ok) {
      await admin.from('support_tickets').update({ status: 'delivery_failed' }).eq('id', ticket.id)
      throw new Error(emailResult?.message || 'The support email could not be delivered.')
    }

    await admin.from('support_tickets').update({ status: 'delivered' }).eq('id', ticket.id)
    return json({ success: true, ticketId: ticket.id, deliveryId: emailResult?.id })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to send support message.' }, 400)
  }
})
