# DueVinci Privacy, Security, and Data Retention Policy

[![Security](https://img.shields.io/badge/security-high-success)](#)

> **Note:** This policy reflects the latest security practices as of August 2026.

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
- **Document & Image Uploads** – PDFs or screenshots for AI‑powered syllabus parsing.

---
## Data Security & Storage <a id="data-security--storage"></a>

We employ industry‑standard security measures:

- **Secure Infrastructure** – All traffic is encrypted via HTTPS; data at rest is encrypted in Supabase.
- **Row‑Level Security (RLS)** – PostgreSQL policies isolate each user's data, preventing cross‑account access.
- **Authentication** – Supabase Auth handles secure sign‑ups, logins, and session tokens.

> [!WARNING] **Never share your API keys** – Keys are stored only in Supabase secrets and never exposed to the client.

---
## Artificial Intelligence & Third‑Party Processing <a id="artificial-intelligence--third‑party-processing"></a>

AI features run through secure server‑side Edge Functions:

- **Secure Edge Functions** – Documents are processed in Deno Edge Functions, keeping API keys hidden.
- **Google Gemini API** – Used for syllabus parsing and the Socratic Study Companion. DueVinci does not train models on student inputs; Google’s handling of prompts and outputs depends on the applicable Gemini service tier and terms. Do not represent AI inputs as exempt from provider processing.
- **Canvas LMS** – A user-provided access token is encrypted before server-side storage and used only to retrieve the authorized Canvas coursework.
- **Stripe and Resend** – Stripe processes subscription payments; Resend delivers support emails. DueVinci does not store full payment-card numbers.

---
## Local Storage & Device Data <a id="local-storage--device-data"></a>

Non-sensitive preferences are cached locally and, for signed-in users,
synchronized through an RLS-protected preferences record:

- Theme (dark/light), date formats, GPA scale, Pomodoro timer settings, and UI collapse states.
- No third‑party tracking cookies or advertising pixels are used.

---
## Data Retention & Deletion <a id="data-retention--deletion"></a>

- **Active Retention** – Data persists while your account is active.
- **Immediate Deletion** – Removing a course, term, or assignment permanently erases it from the database.
- **Account Deletion** – You may remove your account, Canvas connection, and profile photo through the app. Provider-held data may remain subject to the provider’s policy or legal obligations.
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
*Last Updated: August 24, 2026*
