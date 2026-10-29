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

Course and term setup, lesson and deadline tracking, Smart Study Plan, workload radar, weighted grade categories, credit-weighted GPA estimates, target-score calculations, What-If simulation, calendar events and `.ics` import/export, timers, and portable backups remain free.

- Set class and term date windows, search or archive terms, move classes in bulk, and start a new term by copying class shells without copying old coursework.
- Sequence study blocks around deadlines, rest days, and protected dates. The Dashboard shows actual due dates, including dates on rest days, while the Smart Study Plan schedules work around those preferences.
- Mark coursework complete from the Dashboard, Courses, Calendar, or study plan to update the study streak without a timer. Dashboard completion totals include all coursework categories, and Up Next lists dated work such as discussions and assignments.
- Review note-derived flashcards and quizzes, with account-scoped review progress and backup support.
- Turn a dated calendar event into an assignment for a chosen class while preserving the original event and checking duplicates.
- Enable the optional free Nursing Hub and degree themes in Settings → Appearance. Nursing practice must be fictional; **never enter real patient information**.
- Install the production PWA for cached pages and supported offline planner changes. Sign-in, provider services, and cloud synchronization still need a connection.

Optional syllabus parsing uses an authenticated Supabase Edge Function and configurable Google Gemini models. Manual course setup works without AI.

## DueVinci Pro and Study Companion

The current Pro offer is $5/month or $45/year with a 30-day trial; verify live Stripe price and trial settings in each environment before release. It includes Canvas course/assignment sync (selected-course assignments import directly), SNHU Brightspace calendar sync, read-only Google Calendar and Outlook sync, the Socratic Study Companion, a Daily Brief, opt-in personalized study estimates, scheduled Canvas refresh, and opt-in Canvas assignment and posted-grade alerts. Google and Outlook sync once after connection; later syncs are user-started. Provider OAuth, scheduler, and Web Push configuration is required before the related integrations and alerts can operate. Settings → Subscription shows the account's current access and billing options.

The Study Companion can use a selected course's description, objectives, notes, and assignment context. Choose **General study help** to ask without selected-course context. It guides learning rather than writing graded submissions. Loading, retry, pending-reply, and usage states are shown; conversation history remains in the current page and is not a saved chat archive. Daily/monthly allowances appear in the UI and can be configured by the operator.

Personalized estimates and Canvas assignment/grade alerts are off until enabled in Settings → Study & Reminders. Assignment alerts follow a Canvas sync; scheduled refresh runs about hourly for opted-in accounts, and posted-grade alerts need an initial baseline and browser push permission. Brightspace imports calendar entries, not course records or automatic planner assignments; a student can explicitly create an assignment from a calendar event.

## Settings and navigation

Click the profile card at the bottom of the sidebar to open Settings. Its sections are **Profile**, **Appearance**, **Study & Reminders**, **Cloud & Backup**, **Privacy & AI**, and **Subscription**. At narrow widths, scroll the section list horizontally and the content pane vertically. Settings opens before optional preferences finish loading.

The mobile drawer supports Tab wrapping and Escape-to-close with focus return. Settings and Support return focus to their opener when closed. Audited navigation and timer controls have enlarged touch targets and the main timer toggle has an accessible name; this is not a claim that every control has received a complete accessibility audit.

## Current release documentation

Updated October 28, 2026 for the 2.8 application line and PWA shell `duevinci-v8.54`. See the canonical [changelog](https://github.com/saappleg/DueVinci/blob/main/CHANGELOG.md), [roadmap](https://github.com/saappleg/DueVinci/blob/main/ROADMAP.md), and [release checks](Testing-&-CI-CD) for scope and verification limits.
