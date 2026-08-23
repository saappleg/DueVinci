/*
 * Main release smoke test.
 *
 * It is deliberately implemented with fetch rather than a browser framework so
 * it stays quick, dependency-free, and can run immediately after GitHub Pages
 * deployment. Configure the two private GitHub Action secrets named below to
 * activate the authenticated checks.
 */
const baseUrl = (process.env.DUEVINCI_RELEASE_URL || '').replace(/\/$/, '');
const email = process.env.DUEVINCI_SMOKE_EMAIL;
const password = process.env.DUEVINCI_SMOKE_PASSWORD;
const supabaseUrl = (process.env.DUEVINCI_SMOKE_SUPABASE_URL || 'https://lzmsguzlmjmedlaybckc.supabase.co').replace(/\/$/, '');
const anonKey = process.env.DUEVINCI_SMOKE_SUPABASE_ANON_KEY || 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';

const requiredFiles = ['/', '/index.html', '/courses/', '/courses/index.html', '/grades/', '/calendar/', '/manifest.json', '/sw.js', '/js/app.js', '/assets/vendor/supabase-js.js'];
const fail = (message) => { throw new Error(message); };

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) fail(`${options.method || 'GET'} ${url} returned ${response.status}: ${body.slice(0, 300)}`);
  return { response, body };
}

async function verifyPublicRelease() {
  if (!baseUrl) fail('DUEVINCI_RELEASE_URL is required.');
  for (const path of requiredFiles) await request(`${baseUrl}${path}`);
  const { body: worker } = await request(`${baseUrl}/sw.js`);
  for (const path of ['/courses/index.html', '/manifest.json', '/js/app.js']) {
    if (!worker.includes(path)) fail(`Service worker does not precache ${path}.`);
  }
  console.log(`✓ Public release and PWA files are reachable at ${baseUrl}`);
}

async function verifyAuthenticatedFlows() {
  if (!email || !password) {
    console.log('ℹ Authenticated release checks skipped: set DUEVINCI_SMOKE_EMAIL and DUEVINCI_SMOKE_PASSWORD GitHub secrets.');
    return;
  }

  const { body } = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const session = JSON.parse(body);
  if (!session.access_token || !session.user?.id) fail('Sign-in did not return a session.');
  console.log('✓ Smoke account sign-in succeeded');

  const headers = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const code = `SMOKE-${Date.now()}`;
  let courseId;
  try {
    const inserted = await request(`${supabaseUrl}/rest/v1/courses`, {
      method: 'POST', headers, body: JSON.stringify({ user_id: session.user.id, emoji: '🧪', code, color: '#4f46e5' }),
    });
    courseId = JSON.parse(inserted.body)?.[0]?.id;
    if (!courseId) fail('Planner write did not return a course id.');
    console.log('✓ Planner write succeeded');

    await request(`${supabaseUrl}/functions/v1/submit-support-ticket`, {
      method: 'POST',
      headers: { ...headers, 'x-client-info': 'duevinci-release-smoke' },
      body: JSON.stringify({ category: 'Automated release test', email, subject: `Automated smoke test ${new Date().toISOString()}`, message: 'Automated verification only. No response is needed.' }),
    });
    console.log('✓ Support Edge Function accepted the release test');
  } finally {
    if (courseId) {
      await fetch(`${supabaseUrl}/rest/v1/courses?id=eq.${encodeURIComponent(courseId)}`, { method: 'DELETE', headers });
      console.log('✓ Smoke-test planner record removed');
    }
  }
}

await verifyPublicRelease();
await verifyAuthenticatedFlows();
