import webpush from 'npm:web-push@3.6.7'
import type { CanvasAssignmentChange } from './canvas_assignment_changes.ts'

type AdminClient = { from: (table: string) => any }

function reminderKey(change: CanvasAssignmentChange) {
  const changeValue = change.kind === 'due_date_changed'
    ? `${change.sourceId}:due:${change.previousDueDate}:${change.dueDate}`
    : `${change.sourceId}:new:${change.dueDate}`
  return `canvas:${changeValue}`
}

function notificationBody(change: CanvasAssignmentChange) {
  const course = change.courseCode ? ` · ${change.courseCode}` : ''
  if (change.kind === 'new_assignment') {
    const due = change.dueDate ? ` · due ${change.dueDate}` : ''
    return `New assignment: ${change.title}${course}${due}`
  }
  const newDate = change.dueDate || 'date removed'
  const oldDate = change.previousDueDate || 'no date'
  return `Due date changed: ${change.title}${course} · ${oldDate} → ${newDate}`
}

export async function sendCanvasAssignmentChangeAlerts(admin: AdminClient, userId: string, changes: CanvasAssignmentChange[]) {
  if (!changes.length) return 0
  const { data: subscriptions, error: subscriptionError } = await admin.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').eq('user_id', userId)
  if (subscriptionError) throw subscriptionError
  if (!subscriptions?.length) return 0

  const subject = Deno.env.get('VAPID_SUBJECT')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!subject || !publicKey || !privateKey) throw new Error('Web push is not configured.')
  webpush.setVapidDetails(subject, publicKey, privateKey)

  let sent = 0
  for (const change of changes) {
    const key = reminderKey(change)
    const body = notificationBody(change)
    for (const subscription of subscriptions) {
      const { error: claimed } = await admin.from('push_delivery_log').insert({ subscription_id: subscription.id, reminder_key: key })
      if (claimed) {
        if (claimed.code !== '23505') console.warn('Canvas push delivery could not claim a notification.')
        continue
      }
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ title: 'DueVinci · Canvas sync', body }), { TTL: 86400 })
        sent += 1
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode)
        if ([404, 410].includes(statusCode)) {
          await admin.from('push_subscriptions').delete().eq('id', subscription.id)
        } else {
          await admin.from('push_delivery_log').delete().eq('subscription_id', subscription.id).eq('reminder_key', key)
          console.warn('Canvas push delivery failed; it can retry after the next Canvas sync.')
        }
      }
    }
  }
  return sent
}
