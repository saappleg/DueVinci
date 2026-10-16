# DueVinci Privacy, Security, and Data Retention Policy

[Report a security concern](mailto:support@duevinci.tech)

> **Implementation notes updated October 16, 2026.** This document describes
> current data handling; it is not a security certification.

---
## Table of Contents
- [Information We Collect](#information-we-collect)
- [Data Security & Storage](#data-security--storage)
- [Artificial Intelligence & Third‑Party Processing](#artificial-intelligence--third‑party-processing)
- [Local Storage & Device Data](#local-storage--device-data)
- [Data Retention & Deletion](#data-retention--deletion)
- [Policy Updates](#policy-updates)
- [Contact](#contact)

---
## Information We Collect <a id="information-we-collect"></a>

To provide a personalized academic planning experience, we collect:

- **Account Information** – Email address, authentication credentials, display name, and optional profile photo.
- **Academic Data** – Course codes, unit titles, assignments, due dates, grades, and custom calendar events.
- **AI Inputs** – Extracted PDF text, screenshots, and selected course context or prompts submitted for optional AI features.
- **Optional Nursing Workspace** – Saved study drafts and practice progress. All Nursing practice must be fictional; never enter real patient information.
- **Opt-in Study History** – Pro personalization can record task/course identifiers, task type, focused or estimated minutes, and completion/session timestamps. This history is synchronized through the signed-in user's preferences record.

---
## Data Security & Storage <a id="data-security--storage"></a>

The current implementation uses:

- **HTTPS** – The production app and its hosted services use HTTPS.
- **Row‑Level Security (RLS)** – PostgreSQL policies isolate each user's data, preventing cross‑account access.
- **Authentication** – Supabase Auth handles secure sign‑ups, logins, and session tokens.

Supabase's browser publishable key is part of the public client configuration;
access to account rows depends on authentication and RLS. Service-role keys,
Gemini/Stripe credentials, and encryption keys belong in backend secrets and
must not be placed in browser code or public issue reports.

---
## Artificial Intelligence & Third‑Party Processing <a id="artificial-intelligence--third‑party-processing"></a>

AI features run through secure server‑side Edge Functions:

- **Secure Edge Functions** – Documents are processed in Deno Edge Functions, keeping API keys hidden.
- **Google Gemini API** – Used for syllabus parsing and the Socratic Study Companion. DueVinci does not train models on student inputs; Google’s handling of prompts and outputs depends on the applicable Gemini service tier and terms. Do not represent AI inputs as exempt from provider processing.
- **Canvas LMS** – A user-provided access token is encrypted before server-side storage and used only to retrieve the authorized Canvas coursework.
- **SNHU Brightspace** – The private calendar-feed URL is encrypted before server-side storage. The browser can request status or sync without reading the saved URL back. Feed URLs must be treated as credentials.
- **Stripe and Resend** – Stripe processes subscription payments; Resend delivers support emails. DueVinci does not store full payment-card numbers.

---
## Local Storage & Device Data <a id="local-storage--device-data"></a>

Display preferences are cached locally and, for signed-in users, synchronized
through an RLS-protected preferences record:

- Theme (dark/light), date formats, GPA scale, Pomodoro timer settings, and UI collapse states.
- Opt-in study history and Nursing workspace data are also included in preference synchronization; they are account data, not just display settings.
- Supported planner data and pending changes are cached on the device for offline use. Other devices' offline caches are not remotely erased by clearing this browser.
- Exported backups are plain JSON, not encrypted by DueVinci. They can include coursework, preferences, flashcard mastery, and saved study history; protect the downloaded file accordingly.
- No third‑party tracking cookies or advertising pixels are used.

---
## Data Retention & Deletion <a id="data-retention--deletion"></a>

- **Active Retention** – Data persists while your account is active.
- **Academic Deletion** – Supported deletions remove cloud records when online; offline mutations must reconnect and replay before cloud deletion is complete.
- **Account Deletion** – The deletion endpoint removes server-held account data and credentials before deleting Auth, with billing cancellation where required. The current browser clears its account cache after success. Preference/history rows cascade with account deletion; offline copies on other devices and previously downloaded backups require separate removal. Provider-held data may remain subject to the provider's policy or legal obligations.
- **Study History** – The personalization calculation uses recent records from the previous 90 days. Storage is bounded to 180 focus sessions and 120 task completions; the calculation window is not an automatic 90-day deletion policy. Turning personalization off pauses it without clearing history. **Clear history** removes the local copy and requests account preference synchronization; allow synchronization to finish to propagate the clear.
- **Tutor** – Conversation history remains in the current page. The account usage ledger is separate; a daily cleanup removes rows whose last update is older than 12 months.
- **Support Tickets** – Resolved or closed tickets are automatically deleted 90 days after resolution.
- **Client Error Reports** – Browser diagnostic events are automatically deleted 90 days after creation.

---
## Policy Updates <a id="policy-updates"></a>

We may revise this policy to reflect architectural changes or regulatory updates. Significant changes will be indicated by the "Last Updated" date at the top of this document.

---
## Contact <a id="contact"></a>

For questions or concerns, contact the team:

- **DueVinci Support Team**
- Email: <support@duevinci.tech>

---
*Last Updated: October 16, 2026*
