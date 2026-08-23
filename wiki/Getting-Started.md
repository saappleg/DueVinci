# Getting Started with DueVinci 🚀

This guide walks you through setting up, running, and configuring DueVinci on your local machine or hosting it on the web.

---

## 📋 Prerequisites

Before running DueVinci, ensure you have:
- **Node.js** (v18.0.0 or higher) & **npm** (for running test suites and syntax validators).
- Any modern web browser (Google Chrome, Mozilla Firefox, Apple Safari, or Microsoft Edge) with JavaScript and IndexedDB support.
- *(Optional)* A **Supabase** account for authentication and cloud-backed data.
- *(Optional)* A **Google Gemini API Key** for AI syllabus parsing and automated quiz generation.

---

## 📥 Installation & Local Setup

### 1. Clone the Repository
```bash
git clone https://github.com/saappleg/DueVinci.git
cd DueVinci
```

### 2. Install Development Dependencies
DueVinci uses standard Vanilla ES6 modules natively in the browser, so no heavy bundler is required. Dev dependencies are used for automated testing:
```bash
npm install
```

### 3. Verify Code Integrity
Run the test suite and syntax verification checks:
```bash
npm test
npm run check:syntax
```

### 4. Start Local Development Server
DueVinci can be served using any static web server:

**Option A: Using `npx serve`**
```bash
npx serve . -l 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

**Option B: Using VS Code Live Server**
- Open the project directory in VS Code.
- Right click `index.html` and select **"Open with Live Server"**.

**Option C: Using Python 3**
```bash
python3 -m http.server 3000
```

---

## ⚙️ Configuration

### Supabase Setup (Cloud Sync & Auth)

To enable authenticated cloud persistence:
1. Create a free project at [supabase.com](https://supabase.com).
2. Create `courses`, `assignments`, and `custom_events` tables with a `user_id` column.
3. Enable Row Level Security and add select, insert, update, and delete policies scoped to `auth.uid() = user_id` for each operation the table supports.
4. Open `js/modules/config.js` and set the project URL and **publishable** key:
   ```javascript
   export const SUPABASE_URL = 'https://your-project-id.supabase.co';
   export const SUPABASE_ANON_KEY = 'your-anon-public-key';
   ```

> [!NOTE]
> Do not put a service-role key or Gemini API key in the browser. The production application uses an authenticated Supabase Edge Function for optional Gemini parsing.

---

### Google Gemini API Integration

DueVinci utilizes Google Gemini 1.5 for intelligent document extraction (syllabi, schedules, rubrics).

To configure the Supabase Edge Function:
1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Link your Supabase project:
   ```bash
   supabase link --project-ref your-project-id
   ```
3. Set your Gemini API key:
   ```bash
   supabase secrets set GEMINI_API_KEY=your_gemini_api_key
   ```
4. Deploy the edge function:
   ```bash
   supabase functions deploy gemini-parser
   ```

---

## 📱 Progressive Web App (PWA) Installation

DueVinci is PWA-enabled with service-worker caching for the application shell and manifest support. Sign-in, cloud data, and AI parsing require a network connection.
- **Desktop (Chrome / Edge / Safari)**: Click the "Install" icon in the browser address bar.
- **iOS (Safari)**: Tap the Share button and select **"Add to Home Screen"**.
- **Android (Chrome)**: Tap the browser menu and select **"Install App"**.
