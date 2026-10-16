# DueVinci Documentation Wiki 📚

DueVinci is a student academic workspace for classes, deadlines, study planning, grades, flashcards, and focus timers. Use the [live app](https://duevinci.tech) or follow [Getting Started](Getting-Started) for local setup.

## Quick Navigation

| Section | Guides |
| --- | --- |
| Getting started | [Getting Started](Getting-Started), [Architecture & Tech Stack](Architecture-&-Tech-Stack) |
| Free planning tools | [Course & Term Management](Course-&-Term-Management), [Smart Study Planner](Smart-Study-Planner), [Calendar & Schedule Sync](Calendar-&-Schedule-Sync), [Grades & GPA](Grade-Tracker-&-GPA-Calculator) |
| Study tools | [Flashcards](SM-2-Spaced-Repetition-&-Flashcards), [Pomodoro & Timers](Pomodoro-Timer-&-Focus-Modes), [Nursing Hub](Nursing-Hub), [AI Syllabus Parser](AI-Syllabus-&-Document-Parser) |
| Offline and data | [Offline Support & PWA](Offline-Support-&-PWA), [Data Backup & Cloud Sync](Data-Backup-&-Cloud-Sync) |
| Development | [Developer Guide](Developer-Guide-&-Contributing), [Testing & CI/CD](Testing-&-CI-CD), [Wiki Sync Guide](Wiki-Sync-Guide), [Product Roadmap](Product-Roadmap) |
| Help | [FAQ & Troubleshooting](FAQ-&-Troubleshooting) |

## Free core

Course and term setup, lesson and deadline tracking, Smart Study Plan, workload radar, percentage grades and What-If simulation, calendar events and `.ics` import/export, timers, and portable backups remain free.

- Set class and term date windows, search or archive terms, move classes in bulk, and start a new term by copying class shells without copying old coursework.
- Sequence study blocks around deadlines, rest days, and protected dates. Workload radar highlights upcoming due work and exams.
- Review note-derived flashcards and quizzes, with account-scoped review progress and backup support.
- Turn a dated calendar event into an assignment for a chosen class while preserving the original event and checking duplicates.
- Enable the optional free Nursing Hub and degree themes in Settings → Appearance. Nursing practice must be fictional; **never enter real patient information**.
- Install the production PWA for cached pages and supported offline planner changes. Sign-in, provider services, and cloud synchronization still need a connection.

Optional syllabus parsing uses an authenticated Supabase Edge Function and configurable Google Gemini models. Manual course setup works without AI.

## DueVinci Pro and Study Companion

The current Pro catalog includes Canvas course/assignment sync, SNHU Brightspace calendar sync, the Socratic Study Companion, a Daily Brief, opt-in personalized study estimates, and opt-in Canvas assignment change alerts after sync. The listed offer is $5/month or $45/year with a 30-day trial; Settings → Subscription shows the account's current access and billing options.

The Study Companion can use a selected course's description, objectives, notes, and assignment context. Choose **General study help** to ask without selected-course context. It guides learning rather than writing graded submissions. Loading, retry, pending-reply, and usage states are shown; conversation history remains in the current page and is not a saved chat archive. Daily/monthly allowances appear in the UI and can be configured by the operator.

Personalized estimates and Canvas change alerts are off until enabled in Settings → Study & Reminders. Canvas alerts follow a sync; scheduled refresh and grade alerts remain roadmap work. Brightspace imports calendar entries, not course records or automatic planner assignments; a student can explicitly create an assignment from a calendar event.

## Settings and navigation

Click the profile card at the bottom of the sidebar to open Settings. Its sections are **Profile**, **Appearance**, **Study & Reminders**, **Cloud & Backup**, **Privacy & AI**, and **Subscription**. At narrow widths, scroll the section list horizontally and the content pane vertically. Settings opens before optional preferences finish loading.

The mobile drawer supports Tab wrapping and Escape-to-close with focus return. Settings and Support return focus to their opener when closed. Audited navigation and timer controls have enlarged touch targets and the main timer toggle has an accessible name; this is not a claim that every control has received a complete accessibility audit.

## Current release documentation

Updated October 16, 2026 for the 2.8 application line and PWA shell `duevinci-v8.42`. See the canonical [changelog](https://github.com/saappleg/DueVinci/blob/main/CHANGELOG.md), [roadmap](https://github.com/saappleg/DueVinci/blob/main/ROADMAP.md), and [release checks](Testing-&-CI-CD) for scope and verification limits.
