function normalizedPath(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '')
  return withoutTrailingSlash || '/'
}

function isLoopbackHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
}

function configuredBaseUrl(raw: string, allowLocalhost: boolean) {
  const url = new URL(raw)
  if ((url.protocol !== 'https:' && !(allowLocalhost && url.protocol === 'http:' && isLoopbackHost(url.hostname))) || url.username || url.password) {
    throw new Error('Application URL configuration is invalid.')
  }
  let pathname = normalizedPath(url.pathname)
  if (pathname.endsWith('/index.html')) pathname = normalizedPath(pathname.slice(0, -'/index.html'.length))
  return `${url.origin}${pathname === '/' ? '' : pathname}`
}

export function approvedReturnUrls(returnUrl: unknown, appUrl: string, allowLocalhost = false) {
  if (typeof returnUrl !== 'string' || !returnUrl.trim()) throw new Error('Invalid return URL')
  const candidate = new URL(returnUrl)
  if (candidate.username || candidate.password || candidate.search || candidate.hash) throw new Error('Invalid return URL')
  const localHost = isLoopbackHost(candidate.hostname)
  if (candidate.protocol !== 'https:' && !(allowLocalhost && candidate.protocol === 'http:' && localHost)) throw new Error('Invalid return URL')

  const candidatePath = normalizedPath(candidate.pathname)
  const configuredBase = configuredBaseUrl(appUrl, allowLocalhost)
  const configured = new URL(configuredBase)
  const appPath = normalizedPath(configured.pathname)
  const indexPath = appPath === '/' ? '/index.html' : `${appPath}/index.html`
  const candidateBase = `${candidate.origin}${candidatePath === '/' ? '' : candidatePath}`
  const validConfiguredUrl = candidate.origin === configured.origin
    && (candidatePath === appPath || candidatePath === indexPath)
  const validLocalUrl = allowLocalhost && localHost && (candidatePath === '/' || candidatePath === '/index.html')

  if (!validConfiguredUrl && !validLocalUrl) throw new Error('Invalid return URL')

  const baseUrl = validConfiguredUrl ? candidateBase.replace(/\/index\.html$/, '') : candidate.origin
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    indexUrl: `${baseUrl.replace(/\/$/, '')}/index.html`,
  }
}
