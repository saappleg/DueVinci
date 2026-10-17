# Getting Started with DueVinci 🚀

Run DueVinci as a static site with native browser ES modules. The [production app](https://duevinci.tech) uses configured Supabase authentication and services; a local copy does not create a separate backend automatically.

## Prerequisites

- Node.js 24 and npm match the repository's CI runtime.
- A modern browser with JavaScript and IndexedDB support.
- A configured Supabase project for sign-in and cloud-backed data.
- Optional server-side Gemini, Canvas, Stripe, and push configuration for the integrations you intend to operate.

## Installation and local setup

### 1. Clone the repository

```bash
git clone https://github.com/saappleg/DueVinci.git
cd DueVinci
```

### 2. Install development dependencies

```bash
npm install
```

The application runs as static files and does not need a JavaScript bundling step. Tailwind CSS is compiled ahead of time into the committed `assets/css/tailwind.css`; rebuild it only when changing Tailwind classes.

### 3. Verify code integrity

```bash
npm run build:css
npm test
npm run check:syntax
```

### 4. Serve the repository over HTTP

For example, with Python 3:

```bash
python3 -m http.server 3000
```

Open [http://localhost:3000](http://localhost:3000). VS Code Live Server or another static server can also serve the repository. Open the actual checkout, including `index.html`, `js/`, and `assets/`.

DueVinci does not register its application-shell service worker on `localhost`, `127.0.0.1`, or IPv6 loopback. It unregisters a previously installed DueVinci worker for that manifest directory while preserving unrelated workers. Reload an already controlled preview after cleanup. Local preview is therefore not an offline-installation test; use a suitable hosted environment for PWA verification.

## Configuration

### Supabase, authentication, and migrations

`js/modules/config.js` contains the browser project URL and publishable key. Never put a service-role key or provider secret in browser code. To operate an independent environment, review the checked-in [migrations](https://github.com/saappleg/DueVinci/tree/main/supabase/migrations), [Edge Functions](https://github.com/saappleg/DueVinci/tree/main/supabase/functions), and [release checklist](https://github.com/saappleg/DueVinci/blob/main/docs/RELEASE_CHECKLIST.md). Three manually created academic tables are not the complete current schema.

Use a separate development project and disposable accounts. Review migrations and owner-scoped RLS before applying changes; database migrations and deployment are explicit release actions. Configure provider credentials and authorized authentication return URLs for the environment you serve. A Google sign-in return uses that page's `index.html` URL; a browser login from the live origin is not automatically shared with localhost.

Email/password and Google sign-in are available in the current UI. Initial authentication needs connectivity; a cached planner session is not a public guest-account flow.

### Optional AI and Pro integrations

Syllabus parsing runs through `gemini-parser`; the Study Companion uses `tutor`. Their Gemini models are configurable with server-side fallbacks. Keep API keys in the backend secret vault. The current implementation and required settings are documented in [Architecture & Tech Stack](Architecture-&-Tech-Stack), [AI Syllabus Parser](AI-Syllabus-&-Document-Parser), and the [production runbook](https://github.com/saappleg/DueVinci/blob/main/docs/OPERATIONS.md).

Canvas, Brightspace, billing, push delivery, and Tutor require their corresponding deployed functions and configuration. Showing an entry point or passing a static test does not prove those external services are configured.

## PWA installation

Production supports service-worker caching and installation where the browser offers it. Sign in online and visit the pages you intend to use before checking offline behavior.

- Desktop Chrome/Edge: use the browser's install control when offered.
- iOS Safari: Share → Add to Home Screen.
- Android Chrome: use Install App or Add to Home Screen when offered.

See [Offline Support & PWA](Offline-Support-&-PWA) for supported offline operations and [FAQ & Troubleshooting](FAQ-&-Troubleshooting) for Settings and sign-in help.
