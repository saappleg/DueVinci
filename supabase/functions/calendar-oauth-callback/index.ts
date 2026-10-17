import { adminClient, json } from '../_shared/canvas.ts'
import { decryptConnectionSecret, encryptConnectionSecret } from '../_shared/canvas_crypto.ts'
import { exchangeAuthorizationCode, sha256Hex, type CalendarProvider } from '../_shared/calendar_oauth.ts'

function callbackUri() {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('Calendar OAuth callback is not configured.')
  const baseUrl = new URL(base)
  if (baseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
    throw new Error('Calendar OAuth requires a secure Supabase project URL.')
  }
  return new URL('/functions/v1/calendar-oauth-callback', baseUrl).toString()
}

function appReturnUrl(result: 'connected' | 'cancelled' | 'failed', provider?: CalendarProvider) {
  const configured = Deno.env.get('APP_URL')
  if (!configured) throw new Error('Calendar OAuth return address is not configured.')
  const base = new URL(configured)
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Calendar OAuth return address must use HTTPS.')
  }
  if (base.pathname.endsWith('/index.html')) base.pathname = base.pathname.slice(0, -'index.html'.length)
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  base.search = ''
  base.hash = ''
  const url = new URL('index.html', base)
  url.searchParams.set('calendar_oauth', result)
  if (provider) url.searchParams.set('calendar_provider', provider)
  return url.toString()
}

function providerValue(value: unknown): CalendarProvider | null {
  return value === 'google' || value === 'outlook' ? value : null
}

function expiresAt(seconds: number) {
  return new Date(Date.now() + Math.min(seconds, 86_400) * 1000).toISOString()
}

function redirectToApp(url: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: url,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'Use the calendar provider redirect for this endpoint.' }, 405)
  let provider: CalendarProvider | null = null
  try {
    const callback = new URL(req.url)
    const state = callback.searchParams.get('state') || ''
    const code = callback.searchParams.get('code') || ''
    if (!state || state.length > 256) return redirectToApp(appReturnUrl('failed'))
    const admin = adminClient()
    const stateHash = await sha256Hex(state)
    const { data: stateRow, error: stateError } = await admin.from('calendar_oauth_states')
      .delete()
      .eq('state_hash', stateHash)
      .gt('expires_at', new Date().toISOString())
      .select('user_id,provider,code_verifier_encrypted')
      .maybeSingle()
    if (stateError || !stateRow) return redirectToApp(appReturnUrl('failed'))
    provider = providerValue(stateRow.provider)
    if (!provider) return redirectToApp(appReturnUrl('failed'))
    if (callback.searchParams.get('error') || !code) return redirectToApp(appReturnUrl('cancelled', provider))

    const verifier = await decryptConnectionSecret(stateRow.code_verifier_encrypted)
    const tokens = await exchangeAuthorizationCode(provider, code, callbackUri(), verifier)
    const { data: existing, error: existingError } = await admin.from('calendar_connections')
      .select('refresh_token_encrypted')
      .eq('user_id', stateRow.user_id)
      .eq('provider', provider)
      .maybeSingle()
    if (existingError) throw new Error('The existing calendar connection could not be updated.')
    const refreshToken = tokens.refresh_token
      || (existing?.refresh_token_encrypted ? await decryptConnectionSecret(existing.refresh_token_encrypted) : '')
    if (!refreshToken) throw new Error('No refresh token was returned by the provider.')
    const { error: saveError } = await admin.from('calendar_connections').upsert({
      user_id: stateRow.user_id,
      provider,
      access_token_encrypted: await encryptConnectionSecret(tokens.access_token),
      refresh_token_encrypted: await encryptConnectionSecret(refreshToken),
      expires_at: expiresAt(tokens.expires_in),
      needs_reconnect: false,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
    if (saveError) throw new Error('DueVinci could not save the calendar connection.')
    return redirectToApp(appReturnUrl('connected', provider))
  } catch (error) {
    console.error('Calendar OAuth callback failed:', error instanceof Error ? error.message : 'unknown error')
    try { return redirectToApp(appReturnUrl('failed', provider || undefined)) }
    catch { return json({ error: 'Calendar connection could not be completed.' }, 500) }
  }
})
