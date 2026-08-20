# DueVinci 📚

[![Build Status](https://img.shields.io/github/actions/workflow/status/saappleg/DueVinci/ci.yml?branch=main&label=CI)](https://github.com/saappleg/DueVinci/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Security Policy](https://img.shields.io/badge/Security-Policy-brightgreen.svg)](SECURITY.md)

> **DueVinci** is a comprehensive, student‑focused academic workspace and planner. It replaces fragmented productivity apps and combines coursework tracking, GPA calculation, an integrated Pomodoro timer, and AI‑powered syllabus parsing into a single, cohesive dashboard.

---
## Table of Contents
- [Features ✨](#features)
- [Tech Stack 🛠️](#tech-stack)
- [Setup & Installation 🚀](#setup--installation)
- [Project Structure 📂](#project-structure)
- [Contributing 🤝](#contributing)
- [Security 🔒](#security-)
- [License 📄](#license)

---
## Features ✨

> **Note:** All features are live in the modern dark‑mode UI shown below.

![Dashboard Mockup](/Users/steven/.gemini/antigravity-ide/brain/29d18c0a-f76e-42fe-b6ce-d90a85104c9e/dashboard_mockup_1787202939693.jpg)

- **AI‑Powered Syllabus & Schedule Import** – Upload a PDF syllabus or a screenshot. DueVinci uses Google Gemini via a secure Supabase Edge Function to extract course descriptions, objectives, and automatically map out weekly units and due dates.
- **Smart Course Management** – Organize classes into custom term folders with intuitive drag‑and‑drop. Track assignments, exams, and reviews.
- **Real‑Time Academic Grade Tracker** – Input grades to see live course averages and cumulative GPA on a customizable 4.0 or 5.0 scale.
- **Integrated Pomodoro Timer** – Focus sessions and breaks with a floating widget and Web Audio alerts.
- **Interactive Calendar** – FullCalendar view supports deadlines, custom events, and `.ics` export.
- **Highly Customizable UI** – Dark/light mode, date‑format toggles, modular layout, and personalized course colour tags and emojis.

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
- **Google Gemini API** – AI processing for intelligent document and image parsing (`gemini‑1.5‑flash` / `gemini‑1.5‑pro`)

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
   - Set up `courses`, `assignments`, and `custom_events` tables matching the frontend schemas.
   - Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `app.js`.
4. **Edge Function Deployment**
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
├── index.html          # Main dashboard (Up Next & Goals)
├── courses.html        # Class management & PDF parser
├── grades.html         # Grade tracking & GPA calculations
├── calendar.html       # FullCalendar view & custom events
├── academics.js        # Academic analytics & streak algorithms
├── timers.js           # Multi-timer Pomodoro state engine
├── app.js              # Core logic, Supabase hooks, UI controllers
├── sw.js               # Service Worker & offline caching
├── tests/              # Automated unit & integration tests (Vitest)
└── .github/workflows/  # CI/CD and deployment workflows
```

---
## Contributing & Releases 🤝

- Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit issues and pull requests.
- See [CHANGELOG.md](CHANGELOG.md) for release notes and version history.

---
## Security 🔒

Please review our [SECURITY.md](SECURITY.md) for vulnerability disclosure guidelines and our privacy/security practices.

---
## License 📄

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
