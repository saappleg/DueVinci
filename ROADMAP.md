# DueVinci Roadmap 🗺️

Welcome to the **DueVinci** product and engineering roadmap! This document outlines the strategic vision, upcoming milestones, and long-term horizons for the DueVinci academic workspace.

> **Our Mission:** Empower students and lifelong learners with an intelligent, ambient, and frictionless academic hub—unifying course management, cognitive science (SM-2 spaced repetition), AI document analysis, and focus mastery in a beautiful, privacy-first interface.

> **Free Core Commitment:** Course and lesson setup, course-only term rollover, due-date tracking, Smart Study Plan & Workload Balancer, 7-Day Workload & Stress Radar, grades, calendar-event-to-assignment conversion, calendar import/export, timers, and portable backups remain free. Optional AI and third-party integrations may evolve independently of this core.

---

## 📌 Roadmap Status Legend

| Status | Meaning |
| :---: | :--- |
| ✅ | **Shipped & Live** (Available in current production build) |
| 🚧 | **In Active Development** (Targeted for upcoming release) |
| 📋 | **Planned** (Scheduled in current architectural pipeline) |
| 💡 | **Under Research & Exploration** (Community feedback & prototyping) |
| 🔮 | **Future Horizon** (Long-term vision) |

---

## 🚀 Released Milestones

### Phase 1: Core Foundation & Modern Multi-Page Architecture (v1.0 – v1.2) ✅
- [x] **AI Syllabus & Document Ingestion** – Automated course unit, objective, and assignment extraction via Google Gemini and Supabase Edge Functions.
- [x] **SuperMemo SM-2 Spaced Repetition** – Flashcard mastery engine with ease factor calculation and active recall intervals.
- [x] **Smart Study Planner & Balancer** – Automated study block distribution, exam countdowns, and cognitive workload balancing.
- [x] **Due-Date Safety & 7-Day Workload Radar** – Deadline-first scheduling, rest-day handling, timestamp-aware workload counts, and exam-day alerts.
- [x] **Interactive Quiz Generator** – Note-derived multiple-choice practice quizzes and flashcards.
- [x] **Academic GPA & Grade Calculator** – Percentage course averages, linear 4.0 / 5.0 scaling, and temporary hypothetical-score simulation; no custom grading-category or credit weighting.
- [x] **Pomodoro & Focus Timer** – Floating widget, custom countdown intervals, configurable Web Audio alarms, and ambient white/brown noise.
- [x] **Interactive Master Calendar** – FullCalendar integration, deadline filtering, and `.ics` feed export for Apple/Google Calendar.
- [x] **Offline-First PWA & IndexedDB Storage** – Cached application pages and supported per-user planner changes after an online load; authentication and provider services still require connectivity. Hosted installation support is separate from loopback previews, which skip DueVinci's worker.
- [x] **Command Palette (`Cmd+K`) & Easter Eggs** – Quick action navigator, WGU Night Owl flyover, and Da Vinci theme triggers.
- [x] **Data Sovereignty & Portability** – Plain JSON backup/restore and zero vendor lock-in.

### DueVinci 2.8.0 (2026-10-16) ✅
- [x] **Nursing Hub and field themes** – Optional Nursing rotation and skills tracking, fictional care-plan practice, synthetic dosage arithmetic, flashcards, anatomy review, and a quick-review queue based on existing saved progress; field-specific accent palettes and artwork. Keep nursing practice fictional and never enter real patient information.
- [x] **Study-plan calibration** – Pro users can opt in to estimates based on recent completed study tasks and focus sessions. The estimate uses records from the previous 90 days; that calculation window is not a data-retention period.
- [x] **Canvas assignment change alerts** – Pro users can opt in to alerts for new assignments and changed due dates after a Canvas sync, with browser notification permission enabled on each device.
- [x] **Term rollover and calendar conversion** – Free course-only rollover copies course setup into a new term without copying assignments or lesson progress. Students can manually turn a calendar event into a linked assignment while keeping the original event.
- [x] **SNHU Brightspace calendar feed** – Pro users can sync events and due dates from a private Brightspace calendar feed. This does not import course records or automatically create planner assignments.

---

## 🎯 Current Initiatives & Near-Term Releases

### Subscription packaging
- **DueVinci Pro (current offer):** Canvas sync for selected courses and assignments with due dates, SNHU Brightspace calendar sync, opt-in study-plan calibration, opt-in Canvas assignment change alerts, Socratic Tutor, and the Daily Brief; the existing planner, grades, calendar, timers, and portable backups stay free.
- **SNHU Brightspace calendar sync:** Pro users can connect the private Brightspace Calendar Feed to bring SNHU calendar events and due dates into DueVinci. The feed does not automatically create classes or planner assignments. A student can explicitly convert an imported event into an assignment for an existing class; automatic course/task import would require a separately approved integration.
- **Current checkout copy:** $5 monthly or $45 yearly, with a 30-day trial. Confirm Stripe price IDs and trial policy in each environment before release.
- **Tutor cost controls:** default allowance is 8 requests/day and 40/month during trial, and 30/day and 250/month on an active paid plan. Edge Function secrets can override these limits.
- **Next Pro addition — connected calendars:** build read-only Google Calendar and Microsoft Outlook/Graph OAuth connections, with encrypted refresh tokens, clear disconnect controls, refresh history, and event de-duplication. Configure provider client IDs, secrets, and exact redirect URIs before enabling the connector. Apple/iCloud remains supported through the existing `.ics` import/export until a suitable web authorization path is available.
- **Next Pro addition — scheduled Canvas refresh and grade alerts:** extend the existing opt-in alerts for new assignments and changed due dates, which are sent after a Canvas sync, with scheduled refresh and posted-grade alerts. Configure the scheduler, encryption key, push secrets, notification preferences, and retry/retention rules before enabling those additions.

### Phase 2: Socratic AI & Intelligent Study Workflows (v1.3 – v2.0) 🚧
- [x] **Socratic AI Study Companion (`/tutor`)** ✅
  - Context-aware study partner that quizzes you on course concepts rather than just giving answers.
  - Step-by-step problem solver for STEM formulas and coding concepts.
- [x] **Canvas LMS Direct Import** ✅
  - Paid, server-side Canvas connection with encrypted token storage and approved-course assignment import.
- [x] **Portable Calendar Import & Export** ✅
  - Free `.ics` import/export for Google Calendar, Apple Calendar, Outlook, and other RFC 5545-compatible tools.
- [x] **Pro Daily Brief & Tutor allowances** ✅
  - Added a daily deadline and focus summary to Pro, plus visible daily and monthly Tutor request limits.
- [x] **Flashcard mastery sync** ✅
  - Persist review progress across devices and include it in portable backups while keeping the planner free.
- [ ] **Connected Calendar Sync (Google / Microsoft)** 🚧
  - Pro read-only Google and Microsoft sync with encrypted token storage, revocation, refresh history, and duplicate detection. Apple calendars remain importable/exportable as `.ics` until direct web authorization is supported.
- [ ] **Scheduled LMS Refresh & Grade Alerts (Canvas / Blackboard / Moodle)** 📋
  - Add scheduled Canvas refresh and posted-grade alerts to the current opt-in notifications for new assignments and changed due dates after a Canvas sync; add Blackboard/Moodle only after provider authorization and data mapping are defined.
- [ ] **Rich Media Flashcards** 📋
  - Image attachments, diagram occlusion, and KaTeX visual formula editor.
  - Two-way Anki package (`.apkg`) import and export.
- [ ] **Adaptive Daily Study Playlist** 📋
  - Morning brief highlighting high-priority flashcard reviews, approaching deadlines, and suggested 25-minute study sprints.
- [ ] **Realtime Study State Sync** 📋
  - Extend persisted flashcard mastery to live updates and timer state across phone, tablet, and desktop.

---

## 📈 Mid-Term Initiatives

### Phase 3: Analytics, Habit Psychology & Deep Collaboration (v2.1 – v2.5) 📋
- [ ] **Calendar-aware automatic replanning** 📋
  - Detect schedule conflicts and recommend study blocks around connected calendar events.
- [ ] **Study Analytics & Cognitive Load Heatmaps** 📋
  - Correlate study hours, time-of-day focus, and Pomodoro sessions with exam outcomes.
  - Visual burnout radar and recommended rest intervals.
- [ ] **Virtual Study Rooms & Peer Accountability** 💡
  - Shared Pomodoro rooms with synchronized focus cycles and ambient soundscapes.
  - Study streak leaderboards and collaborative note decks.
- [ ] **Simulated Mock Exam Mode** 📋
  - Timed test simulator using question banks generated from notes and past homework.
  - Automated AI scoring with rubrics and targeted improvement recommendations.
- [ ] **Native Mobile & Tablet Packaging** 💡
  - Standalone iOS and Android apps powered by Capacitor / Web Push notifications for due date reminders.

---

## 🔮 Long-Term Horizon

### Phase 4: Open Ecosystem & Knowledge Graph (v3.0+) 🔮
- [ ] **Bi-Directional PKM Sync (Obsidian, Notion, Logseq)** 🔮
  - Synchronize course notes and markdown flashcards with personal knowledge management tools.
- [ ] **DueVinci Plugin API** 🔮
  - Developer SDK to create custom study widgets, themes, and third-party calendar connectors.
- [ ] **University Single Sign-On (SSO) & Institutional Themes** 🔮
  - Custom branding and tailored grading scales for universities and academic institutions.

---

## 💬 Community Requests & Feedback

We build DueVinci in the open with student and developer feedback!

- 💡 **Have a feature idea?** Open a [Feature Request](https://github.com/saappleg/DueVinci/issues/new?template=feature_request.md).
- 🐛 **Found a bug?** Check our [Issue Tracker](https://github.com/saappleg/DueVinci/issues) and submit a bug report.
- 🤝 **Want to contribute?** Read our [Contributing Guide](docs/CONTRIBUTING.md) to get started!

---
*Last updated: October 2026 • Maintained by [@saappleg](https://github.com/saappleg) and the DueVinci Open Source Community.*
