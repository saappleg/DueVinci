# Architecture & Tech Stack 🏛️

DueVinci is built with a **modular, zero-build, local-first architecture** designed for high performance, rapid prototyping, and privacy.

---

## 🏗️ Architecture Diagram

```mermaid
flowchart TD
    subgraph Client Browser
        subgraph UI Layer
            HTML[HTML5 Semantic Pages]
            TW[Tailwind CSS CDN]
            Icons[Heroicons & SVG Icons]
            FC[FullCalendar UI]
        end

        subgraph Engine Layer [ES6 Feature Engines in /js/modules/]
            Academics[academics.js - Course & Term State]
            StudyPlan[studyPlan.js - Workload & Scheduling]
            Flashcards[flashcards.js - SM-2 Spaced Repetition]
            Grades[grades.js - GPA & What-If Engine]
            Timers[timers.js - Pomodoro & Audio Synth]
            Calendar[calendar.js - ICS & Event Engine]
            Markdown[markdown.js - Markdown & Math Renderer]
            Tour[tour.js - Onboarding Engine]
        end

        subgraph Core Layer
            App[app.js - App Orchestrator]
            UI[ui.js - Modals, Toasts & Themes]
            Config[config.js - Constants & Keys]
            Auth[auth.js - Supabase & Guest Auth]
            Backup[backup.js - JSON Export/Import]
            OfflineDB[offlineDb.js - IndexedDB Store]
            PWA[pwa.js / sw.js - Service Worker Cache]
        end
    end

    subgraph Backend & Services
        Supabase[(Supabase PostgreSQL + Auth)]
        EdgeFn[Supabase Edge Function: gemini-parser]
        Gemini[Google Gemini 1.5 Pro/Flash AI]
    end

    HTML --> App
    App --> Engine Layer
    Engine Layer --> OfflineDB
    OfflineDB <--> Supabase
    Engine Layer --> EdgeFn
    EdgeFn --> Gemini
```

---

## 🛠️ Technology Stack Breakdown

### Frontend
- **Language**: Native Modern JavaScript (ES6+ Modules, zero-bundler dependency).
- **Styling**: Tailwind CSS (CDN) configured with custom dark-mode color palettes (`zinc-900`, `zinc-950`, accent colors).
- **Icons**: Inline SVG / Heroicons for lightweight, crisp vector rendering.
- **Interactive Calendar**: [FullCalendar](https://fullcalendar.io/) (v6) for month, week, day, and list schedule visualization.
- **Document Rendering**: [PDF.js](https://mozilla.github.io/pdf.js/) for client-side text extraction from uploaded PDF documents.
- **Spaced Repetition Engine**: Native implementation of the SuperMemo-2 (SM-2) memory decay curve algorithm.
- **Sound Synthesis**: Native Web Audio API for synthetic chimes and alerts without requiring external `.mp3` dependencies.

### Persistence & Cloud Sync
- **Local-First Database**: Browser `IndexedDB` with fallback to `localStorage` for instant, offline-capable, responsive data access.
- **Cloud Backend**: [Supabase](https://supabase.com) (PostgreSQL) for user authentication, cloud backups, and multi-device sync.
- **Edge Computing**: Supabase Edge Functions (Deno runtime) for proxying AI requests securely without exposing developer API keys in frontend client bundles.
- **AI Processing**: Google Gemini API (`gemini-1.5-flash` / `gemini-1.5-pro`) for multimodal syllabus analysis.

---

## 📂 Directory Structure

```text
DueVinci/
├── index.html                   # Dashboard (Up Next, Daily Goals & Overview)
├── courses/
│   └── index.html               # Course Hub, Syllabus AI, Flashcards & Modules
├── grades/
│   └── index.html               # Grade Tracker & Interactive GPA Simulator
├── calendar/
│   └── index.html               # FullCalendar view, Agenda & .ics Sync
├── legal/
│   ├── terms.html               # Terms of Service
│   └── privacy.html             # Privacy Policy & Data Retention Policy
├── js/
│   ├── app.js                   # Root initialization and module coordinator
│   └── modules/                 # Modular feature controllers
│       ├── academics.js         # Terms, courses, categories, assignments
│       ├── auth.js              # Supabase authentication & guest state
│       ├── backup.js            # JSON import/export & version migrations
│       ├── calendar.js          # Calendar events & ICS generation
│       ├── components.js        # Reusable UI component templates
│       ├── config.js            # Configuration & environment constants
│       ├── courses.js           # Course view controller & syllabus ingestion
│       ├── easterEggs.js        # Interactive rewards & themes
│       ├── flashcards.js        # SM-2 engine & active recall quizzes
│       ├── grades.js            # Weighted GPA & What-If simulator
│       ├── markdown.js          # Custom markdown & KaTeX math parser
│       ├── offlineDb.js         # IndexedDB storage wrapper
│       ├── pwa.js               # PWA install prompt & offline indicators
│       ├── studyPlan.js         # Dynamic study scheduler
│       ├── timers.js            # Pomodoro timer, stopwatch & audio
│       ├── tour.js              # Onboarding step-by-step tour
│       ├── ui.js                # Theme switching, toasts & modal manager
│       └── utils.js             # Date helpers, formatters, and validators
├── assets/                      # Stylesheets, icons, sound assets
├── docs/                        # Project documentation & guidelines
├── tests/                       # Automated Vitest test suite
└── wiki/                        # GitHub Wiki documentation files
```

---

## 🔒 Security & Privacy Model

1. **Client-Side Secrets Protection**: API keys for AI models and privileged services are never stored in client code; requests route through authenticated Supabase Edge Functions.
2. **Local-First Privacy**: Guest mode retains 100% of student coursework data inside the local browser sandbox (`IndexedDB`). No data is sent to cloud servers unless explicitly authenticated.
3. **Content Security & Sanitization**: Markdown and user input are strictly sanitized before insertion into the DOM to prevent XSS (Cross-Site Scripting).
