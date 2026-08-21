# FAQ & Troubleshooting ❓

Frequently asked questions and solutions for common questions or errors when using or developing DueVinci.

---

## ❓ Frequently Asked Questions

### 1. Is an internet connection required to use DueVinci?
**No.** DueVinci is built with a local-first architecture. All core features (course tracking, grade simulation, Pomodoro timer, SM-2 flashcards, calendar) work completely offline using `IndexedDB` and service worker caching. An internet connection is only needed when:
- Parsing new syllabi using the Gemini AI feature.
- Synchronizing with your remote Supabase cloud database.

---

### 2. How do I change the GPA scale from 4.0 to 5.0?
Navigate to the **Grades** tab (`grades/index.html`) or your profile settings, locate the **GPA Scale Selector**, and switch between:
- **Standard 4.0 (Unweighted)**
- **Weighted 5.0 (AP / Honors / IB)**
- **Percentage Average (0 – 100%)**

---

### 3. Can I export my deadlines to Google Calendar or Apple Calendar?
**Yes.** Open the **Calendar** tab (`calendar/index.html`) and click the **"Export .ICS"** button. Download the `.ics` file and import it directly into Google Calendar, Apple Calendar, or Outlook.

---

## 🔧 Troubleshooting Guide

### Issue: Gemini AI Syllabus Parser fails with `Failed to fetch` or CORS error
- **Cause**: Supabase Edge Function URL is unconfigured, or the function has not been deployed to Supabase.
- **Solution**:
  1. Ensure you have deployed the function: `supabase functions deploy gemini-parser`.
  2. Verify that `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/modules/config.js` match your Supabase project.
  3. Verify that your Gemini API key is set in Supabase secrets: `supabase secrets set GEMINI_API_KEY=your_key`.

---

### Issue: Pomodoro chime sounds are silent
- **Cause**: Modern web browsers restrict audio playback until the user has interacted with the page (User Activation Policy).
- **Solution**: Click anywhere on the DueVinci interface or click the **Start Timer** button directly; this initializes the `AudioContext`.

---

### Issue: Service Worker not updating with new changes
- **Cause**: Aggressive browser caching during active development.
- **Solution**:
  1. Open Chrome DevTools (`F12` or `Cmd+Opt+I`).
  2. Navigate to the **Application** tab $\rightarrow$ **Service Workers**.
  3. Check the **"Update on reload"** checkbox and refresh the page, or click **"Unregister"**.
