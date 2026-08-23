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

- **Account Information** – Email address and a securely hashed password.
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
- **Google Gemini API** – Used solely for extracting syllabus data. According to Google Cloud’s privacy policy, processed data is not retained nor used for model training.

---
## Local Storage & Device Data <a id="local-storage--device-data"></a>

Non‑sensitive preferences are stored locally via `localStorage`:

- Theme (dark/light), date formats, GPA scale, Pomodoro timer settings, UI collapse states.
- No third‑party tracking cookies or advertising pixels are used.

---
## Data Retention & Deletion <a id="data-retention--deletion"></a>

- **Active Retention** – Data persists while your account is active.
- **Immediate Deletion** – Removing a course, term, or assignment permanently erases it from the database.
- **Account Deletion** – You may request full account and data removal at any time.

---
## Policy Updates <a id="policy-updates"></a>

We may revise this policy to reflect architectural changes or regulatory updates. Significant changes will be indicated by the "Last Updated" date at the top of this document.

---
## Contact <a id="contact"></a>

For questions or concerns, contact the team:

- **DueVinci Support Team**
- Email: <support@duevinci.tech>

---
*Last Updated: August 20, 2026*
