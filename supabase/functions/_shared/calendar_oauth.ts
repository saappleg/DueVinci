export type CalendarProvider = 'google' | 'outlook'

export type OAuthTokens = {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export class CalendarOAuthError extends Error {
  reconnectRequired: boolean

  constructor(message: string, reconnectRequired = false) {
    super(message)
    this.name = 'CalendarOAuthError'
    this.reconnectRequired = reconnectRequired
  }
}

export function classifyGoogleRevocationStatus(status: number): 'revoked' | 'revocation_failed' {
  return status === 200 ? 'revoked' : 'revocation_failed'
}

function providerConfig(provider: CalendarProvider) {
  if (provider === 'google') {
    const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('Google Calendar OAuth is not configured yet.')
    return {
      clientId,
      clientSecret,
      authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/calendar.events.owned.readonly',
    }
  }
  const clientId = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Microsoft calendar OAuth is not configured yet.')
  return {
    clientId,
    clientSecret,
    authorizeEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'https://graph.microsoft.com/Calendars.ReadBasic offline_access',
  }
}

export function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createAuthorizationUrl(provider: CalendarProvider, redirectUri: string, state: string, verifier: string) {
  const config = providerConfig(provider)
  const url = new URL(config.authorizeEndpoint)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  // Keep the raw verifier in the encrypted, short-lived server-side OAuth row.
  const verifierBytes = new TextEncoder().encode(verifier)
  const challenge = await crypto.subtle.digest('SHA-256', verifierBytes)
  const challengeBytes = new Uint8Array(challenge)
  let binary = ''
  challengeBytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  const codeChallenge = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (provider === 'google') {
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', 'consent')
  } else {
    url.searchParams.set('prompt', 'select_account')
  }
  return url.toString()
}

async function parseTokenResponse(response: Response, isRefresh: boolean): Promise<OAuthTokens> {
  if (!response.ok) {
    if (isRefresh && [400, 401].includes(response.status)) {
      throw new CalendarOAuthError('The calendar refresh token was rejected. Reconnect this calendar.', true)
    }
    if (response.status === 429 || response.status >= 500) {
      throw new CalendarOAuthError('The calendar provider authorization service is temporarily unavailable. Try again shortly.')
    }
    throw new CalendarOAuthError('The calendar provider could not authorize this connection. Check the OAuth app settings and try again.')
  }
  let payload: Record<string, unknown>
  try {
    payload = await response.json()
  } catch {
    throw new CalendarOAuthError('The calendar provider returned an invalid authorization response.')
  }
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : ''
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined
  const expiresIn = Number(payload.expires_in)
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new CalendarOAuthError('The calendar provider returned an incomplete authorization response.')
  }
  return { access_token: accessToken, ...(refreshToken ? { refresh_token: refreshToken } : {}), expires_in: Math.min(expiresIn, 86_400) }
}

async function tokenRequest(provider: CalendarProvider, params: URLSearchParams) {
  const config = providerConfig(provider)
  params.set('client_id', config.clientId)
  params.set('client_secret', config.clientSecret)
  let response: Response
  try {
    response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params,
      signal: AbortSignal.timeout(12_000),
      redirect: 'error',
    })
  } catch {
    throw new Error('Could not reach the calendar provider authorization service. Try again shortly.')
  }
  return parseTokenResponse(response, params.get('grant_type') === 'refresh_token')
}

export function exchangeAuthorizationCode(provider: CalendarProvider, code: string, redirectUri: string, verifier: string) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })
  return tokenRequest(provider, params)
}

export function refreshCalendarAccessToken(provider: CalendarProvider, refreshToken: string) {
  const config = providerConfig(provider)
  return tokenRequest(provider, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: config.scope,
  }))
}

export async function constantTimeSecretMatches(actual: string, expected: string) {
  if (!actual || !expected || actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}
