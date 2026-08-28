import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('REMINDER_CRON_SECRET')
  if (!cronSecret || req.headers.get('x-reminder-cron-secret') !== cronSecret) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

  const today = new Date().toISOString().slice(0, 10)
  const { data: profiles, error: profilesError } = await admin.from('profiles').select('user_id, reminder_offsets').eq('reminders_enabled', true)
  if (profilesError) return json({ error: profilesError.message }, 500)
  let sent = 0
  for (const profile of profiles || []) {
    const offsets = (profile.reminder_offsets || [0, 1, 3]).filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 30)
    const { data: subscriptions } = await admin.from('push_subscriptions').select('*').eq('user_id', profile.user_id)
    if (!subscriptions?.length) continue
    const { data: assignments } = await admin.from('assignments').select('id, title, due_date, course_id').eq('user_id', profile.user_id).eq('is_completed', false)
    const { data: courses } = await admin.from('courses').select('id, name, code').eq('user_id', profile.user_id)
    const names = new Map((courses || []).map((course) => [course.id, course.name || course.code || 'Coursework']))
    for (const assignment of assignments || []) {
      const due = String(assignment.due_date || '').slice(0, 10)
      const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
      if (!offsets.includes(days)) continue
      const label = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`
      for (const subscription of subscriptions) {
        const reminderKey = `${assignment.id}:${due}:${days}`
        const { error: claimed } = await admin.from('push_delivery_log').insert({ subscription_id: subscription.id, reminder_key: reminderKey })
        if (claimed) continue
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: `DueVinci: ${label}`, body: `${assignment.title} · ${names.get(assignment.course_id) || 'Coursework'}` }), { TTL: 86400 })
          sent += 1
        } catch (error) {
          if ([404, 410].includes(Number((error as { statusCode?: number }).statusCode))) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
        }
      }
    }
  }
  return json({ sent, date: today })
})
