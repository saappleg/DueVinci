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
- [Security 🔒](#security-)
- [License 📄](#license)

---
## Features ✨

### Free core — always available

- **Course, term, and lesson management** — Organize classes, units, lessons, assignments, reviews, and exams.
- **Due-date planning** — Set and edit deadlines directly; ISO date and timestamp deadlines are treated as the same calendar date.
- **Smart Study Plan & Workload Balancer** — Sequences lessons within units, spreads work over available study days, respects chosen rest days where possible, and keeps deadlines as hard constraints.
- **7-Day Workload & Stress Radar** — Highlights upcoming task volume and exam days so students can spot pressure before it becomes cramming.
- **Grades, GPA, calendar, timers, and backups** — Track academic progress, export `.ics` calendars, run focus sessions, and export/import JSON data.
- **PWA and accessibility-minded UI** — Installable static web app with cached application assets, dark mode, and responsive layouts.

### Optional integrations

- **AI syllabus import** uses a Supabase Edge Function and Google Gemini. It is optional; manually created courses, lessons, and due dates retain full planning functionality without it.
- **Supabase sign-in and sync** support persistent accounts and cross-device data. The production database uses Row Level Security policies to isolate each account’s data.

## Free Core Promise

DueVinci’s essential planning workflow—course setup, lesson and due-date tracking, Smart Study Plan, 7-Day Workload & Stress Radar, grades, calendar, timers, and data export—will remain free to use. Optional third-party services may have their own limits or pricing, but they are never required for the core planning experience.

---
## Tech Stack 🛠️

**Frontend:**
- HTML5 & Vanilla JavaScript
- Tailwind CSS (CDN) for rapid prototyping and dark‑mode support
- FullCalendar for schedule visualization
- PDF.js for client‑side PDF text extraction
- Canvas‑Confetti for micro‑interactions and rewards

**Backend & APIs:**
- **Supabase** – PostgreSQL database & authentication
- **Supabase Edge Functions** – Serverless Deno functions handling secure API requests
- **Google Gemini API** – Optional AI processing for syllabus and image parsing via an authenticated Edge Function

---
## Setup & Installation 🚀

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
   - Create a new Supabase project.
   - Set up `courses`, `assignments`, and `custom_events` tables with a `user_id` column and Row Level Security policies based on `auth.uid() = user_id`.
   - Configure the project URL and publishable key in `js/modules/config.js`; never put a service-role or Gemini key in browser code.
4. **Optional AI Edge Function Deployment**
   ```bash
   supabase functions deploy gemini-parser
   ```
   Set your Gemini API key in the Supabase secrets vault:
   ```bash
   supabase secrets set GEMINI_API_KEY=your_google_ai_key
   ```
5. **Launch**
   Serve the static files with any local development server (e.g., Live Server extension in VS Code) or run `npx serve .` and open `index.html`.

---
## Project Structure 📂

```text
DueVinci/
├── index.html                   # Main dashboard (Up Next & Goals)
├── courses/
│   └── index.html               # Class management, syllabus AI & study quizzes
├── grades/
│   └── index.html               # Grade tracking & GPA simulator
├── calendar/
│   └── index.html               # FullCalendar view & .ics export
├── legal/
│   ├── terms.html               # Terms of Use
│   └── privacy.html             # Privacy & Data Retention Policy
├── docs/
│   ├── CHANGELOG.md             # Version release history
│   ├── CONTRIBUTING.md          # Contribution guidelines
│   └── SECURITY.md              # Security policies & reporting
├── assets/                      # CSS themes, icons, and image assets
├── js/
│   ├── app.js                   # Application orchestrator
│   └── modules/                 # Modular ES6 feature engines
└── tests/                       # Automated Vitest test suite
```

---
## Contributing & Releases 🤝

Contributions are welcome! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details.

---
## License 📄

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
