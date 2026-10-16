# DueVinci 📚

[![Build Status](https://img.shields.io/github/actions/workflow/status/saappleg/DueVinci/ci.yml?branch=main&label=CI)](https://github.com/saappleg/DueVinci/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Security Policy](https://img.shields.io/badge/Security-Policy-brightgreen.svg)](docs/SECURITY.md)

> **DueVinci** is a student-first academic workspace for organizing courses, tracking due dates, and building a realistic daily study plan.

---
## Table of Contents
- [Features ✨](#features)
- [Free Core Promise](#free-core-promise)
- [Roadmap 🗺️](ROADMAP.md)
- [Tech Stack 🛠️](#tech-stack)
- [Setup & Installation 🚀](#setup--installation)
- [Project Structure 📂](#project-structure)
- [Contributing 🤝](#contributing)
- [Security 🔒](docs/SECURITY.md)
- [License 📄](#license)

---
## Features ✨ <a id="features"></a>

### Free core — always available

- **Course, term, and lesson management** — Organize classes, units, lessons, assignments, reviews, and exams. Roll a term forward by copying course setup only; assignments and lesson progress stay in the original term.
- **Due-date planning** — Set and edit deadlines directly; ISO date and timestamp deadlines are treated as the same calendar date.
- **Smart Study Plan & Workload Balancer** — Sequences lessons within units, spreads work over available study days, respects chosen rest days where possible, and keeps deadlines as hard constraints.
- **7-Day Workload & Stress Radar** — Highlights upcoming task volume and exam days so students can spot pressure before it becomes cramming.
- **Grades, GPA, calendar, timers, and backups** — Track academic progress, import and export `.ics` calendars, manually turn a calendar event into a linked assignment while keeping the event, run focus sessions, and export/import JSON data.
- **Optional Nursing Hub** — Turn on the free Hub in Settings → Appearance to track rotations and skills, practice fictional care plans and synthetic arithmetic, review flashcards and anatomy, and start a quick review queue. It stays hidden until enabled. See the [Nursing Hub guide](wiki/Nursing-Hub.md); never enter real patient information.
- **Degree themes** — Choose a field-specific accent palette and decorative background artwork in Settings → Appearance; light and dark modes keep readable text contrast.
- **PWA and accessibility-minded UI** — Installable offline-first web app: planner data is cached locally and free-core changes sync after reconnecting, with dark mode and responsive layouts.

### Optional integrations

- **DueVinci Pro** adds Canvas sync for selected courses and assignments with due dates, SNHU Brightspace calendar-feed sync, opt-in Canvas notifications for new assignments or changed due dates after a Canvas sync, Socratic Tutor, Daily Brief, and opt-in study-plan estimates calibrated from focus history. Canvas alerts require browser notification permission on each device; they are sent after sync, not by a scheduled refresh.
- **AI syllabus import** uses a Supabase Edge Function and Google Gemini. It is optional; manually created courses, lessons, and due dates retain full planning functionality without it.
- **Supabase sign-in and sync** support persistent accounts and cross-device data. The production database uses Row Level Security policies to isolate each account’s data.
- **Browser coursework importer beta** is available at [saappleg/duevinci-coursework-importer](https://github.com/saappleg/duevinci-coursework-importer). It imports WGU pacing guides and Maestro weekly coursework without requiring a Canvas API token, then sends only the rows the student approves.

## Free Core Promise

DueVinci’s essential planning workflow—course setup, lesson and due-date tracking, course-only term rollover, Smart Study Plan, 7-Day Workload & Stress Radar, grades, calendar events, manual event-to-assignment conversion, `.ics` import/export, timers, and data portability—will remain free to use. The optional Nursing Hub and degree themes are also free. Optional third-party services may have their own limits or pricing, but they are never required for the core planning experience. Canvas and Brightspace sync, Canvas change alerts, personalized study-plan estimates, the Daily Brief, and Socratic Tutor are optional DueVinci Pro features.

---
## Tech Stack 🛠️ <a id="tech-stack"></a>

**Frontend:**
- HTML5 & Vanilla JavaScript
- Tailwind CSS and browser libraries served as local, pre-cached vendor assets for reliable PWA startup
- FullCalendar for schedule visualization
- PDF.js for client‑side PDF text extraction
- Canvas‑Confetti for micro‑interactions and rewards

**Backend & APIs:**
- **Supabase** – PostgreSQL database & authentication
- **Supabase Edge Functions** – Serverless Deno functions handling secure API requests
- **Google Gemini API** – Optional AI processing for syllabus and image parsing via an authenticated Edge Function

---
## Setup & Installation 🚀 <a id="setup--installation"></a>

1. **Clone the repository**
   ```bash
   git clone https://github.com/saappleg/DueVinci.git
   cd DueVinci
   ```
2. **Install Dev Tooling & Run Tests**
   ```bash
   npm install
   npm test
   ```
3. **Supabase Configuration**
   - The repository's migrations extend DueVinci's existing app schema; they are not a complete fresh-project bootstrap, and this repository does not include the full baseline schema. A new project also needs the base planner tables, their required columns, and owner-scoped Row Level Security policies before the app can run.
   - For the repository's Dev environment, follow [Supabase Dev setup](supabase/README.md). Keep development and production projects, function secrets, and Stripe modes separate.
   - The browser uses publishable Supabase keys from `js/modules/config.js`; never put a service-role key or Gemini API key in browser code or source control.
4. **Optional AI Edge Function Deployment**
   - Deploy `gemini-parser` to your intended development project and set `GEMINI_API_KEY` as a Supabase Edge Function secret. Do not deploy to Production from a local development setup.
5. **Launch**
   Serve the static files with any local development server (e.g., Live Server extension in VS Code) or run `npx serve .` and open `index.html`.

   DueVinci skips its service worker on `localhost`, `127.0.0.1`, and IPv6 loopback and unregisters only its matching old worker. Reload an already controlled preview after cleanup. Hosted PWA/offline checks require a suitable test deployment. Backend routing is separate: the checked-in configuration uses the Dev project for localhost/127.0.0.1 and Production for other hosts, so configure an isolated backend before hosting a fork or test copy.

---
## Project Structure 📂 <a id="project-structure"></a>

```text
DueVinci/
├── CHANGELOG.md                 # Canonical release history
├── index.html                   # Main dashboard (Up Next & Goals)
├── courses/
│   └── index.html               # Class management, syllabus AI & study quizzes
├── grades/
│   └── index.html               # Grade tracking & GPA simulator
├── calendar/
│   └── index.html               # FullCalendar view & .ics export
├── nursing/
│   └── index.html               # Optional Nursing Hub
├── tutor/
│   └── index.html               # Pro Socratic Study Companion
├── legal/
│   ├── terms.html               # Terms of Use
│   └── privacy.html             # Privacy & Data Retention Policy
├── docs/
│   ├── CHANGELOG.md             # Historical releases; new notes live at the root
│   ├── CONTRIBUTING.md          # Contribution guidelines
│   ├── FEATURE_READINESS.md     # Dev capability and verification map
│   ├── RELEASE_CHECKLIST.md     # Production release checks
│   ├── SECURITY.md              # Security policies & reporting
│   └── COURSEWORK_IMPORTER_BETA.md # Browser importer beta and poll rollout
├── scripts/
│   └── release-smoke.mjs        # Post-deploy production smoke test
├── supabase/                    # Migrations and Edge Functions
├── assets/                      # CSS themes, icons, and image assets (including degree-theme artwork)
├── js/
│   ├── app.js                   # Application orchestrator
│   └── modules/                 # Modular ES6 feature engines
└── tests/                       # Automated Vitest test suite
```

---
## Contributing & Releases 🤝 <a id="contributing"></a>

Contributions are welcome! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details.

For the Main release workflow and its optional authenticated smoke-test secrets,
see [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

The browser importer beta is documented in [COURSEWORK_IMPORTER_BETA.md](docs/COURSEWORK_IMPORTER_BETA.md).

---
## License 📄 <a id="license"></a>

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
