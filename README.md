# DueVinci 📚

DueVinci is a comprehensive, student-focused academic workspace and planner. Built to replace fragmented productivity apps, it combines coursework tracking, GPA calculation, an integrated Pomodoro timer, and AI-powered syllabus parsing into a single, cohesive dashboard.

## ✨ Features

*   **AI-Powered Syllabus & Schedule Import:** Upload a course syllabus (PDF) or a screenshot of your lessons. DueVinci utilizes Google's Gemini API via a secure Supabase Edge Function to extract course descriptions, objectives, and automatically map out weekly units and due dates.
*   **Smart Course Management:** Organize classes into custom term folders with intuitive drag-and-drop functionality. Track individual assignments, exams, and reviews.
*   **Real-Time Academic Grade Tracker:** Input grades for completed coursework to see real-time course averages and cumulative GPA calculations on a customizable 4.0 or 5.0 scale.
*   **Integrated Pomodoro Timer:** Keep your study sessions on track with a built-in focus and break timer, featuring a floating widget mode and Web Audio API alerts.
*   **Interactive Calendar:** Visual schedule utilizing FullCalendar with support for course deadlines, custom user events, and `.ics` schedule exporting.
*   **Highly Customizable:** Features full dark/light mode support, adjustable date formats, modular layout toggles, and personalized course color tags and emojis.

## 🛠️ Tech Stack

**Frontend:**
*   HTML5 & Vanilla JavaScript
*   Tailwind CSS (via CDN for rapid prototyping and dark mode support)
*   FullCalendar (Schedule visualization)
*   PDF.js (Client-side PDF text extraction)
*   Canvas Confetti (Micro-interactions and completion rewards)

**Backend & APIs:**
*   **Supabase:** PostgreSQL Database and User Authentication
*   **Supabase Edge Functions:** Serverless Deno functions handling secure API requests
*   **Google Gemini API:** AI processing for intelligent document and image parsing (`gemini-1.5-flash` / `gemini-1.5-pro`)

## 🚀 Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/saappleg/DueVinci.git](https://github.com/saappleg/DueVinci.git)
   cd DueVinci

```

2. **Supabase Configuration:**
* Create a new Supabase project.
* Set up `courses`, `assignments`, and `custom_events` tables matching the frontend schemas.
* Add your `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `app.js`.


3. **Edge Function Deployment:**
* Navigate to your Supabase CLI.
* Deploy the Gemini parser Edge Function:
```bash
supabase functions deploy gemini-parser

```


* Set your Gemini API key in the Supabase secrets vault:
```bash
supabase secrets set GEMINI_API_KEY=your_google_ai_key

```




4. **Launch:**
Serve the static files using any local development server (e.g., Live Server extension in VS Code) and open `index.html`.

## 🔒 Data Retention & Security

DueVinci is built with privacy and data security in mind, utilizing modern backend architecture to keep student data safe.

* **Authentication & Authorization:** User accounts are managed via Supabase Auth. Credentials are encrypted, and database access is locked down using PostgreSQL Row Level Security (RLS) policies, ensuring users can only read, edit, or delete their own academic data.
* **AI Processing Privacy:** Syllabus documents and lesson screenshots are processed securely. The Gemini API is accessed exclusively through a server-side Supabase Edge Function, keeping API keys hidden from the client-side. Document text and images are only used for the instantaneous generation of course schedules and are not retained or used to train Google's foundational AI models.
* **Data Control:** Users retain absolute control over their workspace. Deleting a class or term folder immediately permanently deletes all associated coursework, objectives, and links from the database.
* **Client-Side Storage:** Non-sensitive workspace preferences—such as dark/light mode, timer durations, date formatting, and UI collapse states—are saved locally in the browser's `localStorage` for a snappy, personalized experience without unnecessary database calls.

## 📂 Project Structure

```text
DueVinci/
├── index.html       # Main student dashboard (Up Next & Goals)
├── courses.html     # Class management & PDF syllabus parser
├── grades.html      # Grade tracking & GPA calculations
├── calendar.html    # FullCalendar view & custom event manager
└── app.js           # Core business logic, Supabase hooks, and UI controllers

```

## 👨‍💻 Author

Created and developed by **Steven Applegate**.

```

```
