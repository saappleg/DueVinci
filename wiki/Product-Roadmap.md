# Product Roadmap 🗺️

Welcome to the **DueVinci** product and engineering roadmap! This page outlines the strategic vision, active developments, and upcoming horizons for the DueVinci academic workspace.

> **Our Mission:** Empower students and lifelong learners with an intelligent, ambient, and frictionless academic hub—unifying course management, cognitive science (SM-2 spaced repetition), AI document analysis, and focus mastery in a beautiful, privacy-first interface.

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
- [x] **Interactive Quiz Generator** – Instant multiple-choice and true/false quiz creation from markdown notes and syllabi.
- [x] **Academic GPA & Grade Calculator** – Real-time weighted course average and cumulative GPA simulation (4.0 / 5.0 scales).
- [x] **Pomodoro & Focus Timer** – Floating widget, custom intervals, Web Audio alarms, and ambient background sound synthesizer (Zen singing bowl, rain, cafe).
- [x] **Interactive Master Calendar** – FullCalendar integration, deadline filtering, and `.ics` feed export for Apple/Google Calendar.
- [x] **Offline-First PWA & IndexedDB Storage** – Full offline functionality, Service Worker caching, and desktop/mobile installation.
- [x] **Command Palette (`Cmd+K`) & Easter Eggs** – Quick action navigator, WGU Night Owl flyover, and Da Vinci theme triggers.
- [x] **Data Sovereignty & Portability** – Encrypted JSON backup/restore and zero vendor lock-in.

---

## 🎯 Current Initiatives & Near-Term Releases

### Phase 2: Socratic AI & Intelligent Study Workflows (v1.3 – v2.0) 🚧
- [ ] **Socratic AI Study Companion (`/tutor`)** 🚧
  - Context-aware study partner that quizzes you on course concepts rather than just giving answers.
  - Step-by-step problem solver for STEM formulas and coding concepts.
- [ ] **LMS Direct Import & Sync (Canvas / Blackboard / Moodle)** 📋
  - One-click syllabus and assignment import via ICS calendar feeds and Canvas API token integration.
  - Automated sync for newly posted assignments and grade adjustments.
- [ ] **Rich Media Flashcards** 📋
  - Image attachments, diagram occlusion, and KaTeX visual formula editor.
  - Two-way Anki package (`.apkg`) import and export.
- [ ] **Adaptive Daily Study Playlist** 📋
  - Morning brief highlighting high-priority flashcard reviews, approaching deadlines, and suggested 25-minute study sprints.
- [ ] **Supabase Realtime Multi-Device Sync** 📋
  - Instant synchronization of flashcard progress and timer states across phone, tablet, and desktop.

---

## 📈 Mid-Term Initiatives

### Phase 3: Analytics, Habit Psychology & Deep Collaboration (v2.1 – v2.5) 📋
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

- 💡 **Have a feature idea?** Open a proposal in [GitHub Discussions](https://github.com/saappleg/DueVinci/discussions) or submit an [Issue](https://github.com/saappleg/DueVinci/issues).
- 🐛 **Found a bug?** Check our [Issue Tracker](https://github.com/saappleg/DueVinci/issues) and submit a bug report.
- 🤝 **Want to contribute?** Read our [Developer Guide & Contributing](Developer-Guide-&-Contributing) to get started!
