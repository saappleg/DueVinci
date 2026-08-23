# Offline Support & Progressive Web App (PWA) 📱

DueVinci caches its static application shell and a per-user planner cache for
PWA installation and offline use. After an initial online load, Courses,
assignments, completion changes, grades, and calendar events remain available
offline; supported planner writes queue locally and replay when the device
reconnects. Authentication, AI parsing, Canvas, billing, support requests, and
account deletion still require a connection.

---

## 🏗️ Offline Architecture

```mermaid
flowchart TD
    App[DueVinci App]
    SW[Service Worker: sw.js]
    Cache[(Service Worker Static Cache)]
    Cloud[(Supabase Remote Database)]

    App -- "Assets Request" --> SW
    SW -- "Cache-first navigation; background refresh" --> Cache
    App -- "Planner reads/writes" --> LocalDB[(IndexedDB cache and mutation queue)]
    LocalDB -- "Replay when online" --> Cloud
    App -- "AI, Canvas, billing, support" --> Cloud
```

---

## 🛠️ Key Offline Modules

### 1. Service Worker (`sw.js`)
- Caches all essential assets: HTML pages, JavaScript modules, stylesheets, fonts, and icons.
- Resolves known app routes from cache first and refreshes them in the background,
  avoiding a long network timeout while offline.
- Cache versions are bumped for application releases so installed clients receive updated planning logic.

### 2. PWA Controller (`js/modules/pwa.js`)
- Listens for `beforeinstallprompt` to present an unobtrusive, native-feeling install banner.
- Displays an offline badge indicator in the top navbar when network connection drops.
- Listens for `online` and `offline` events to reflect connection state in the UI.

## What works offline

Previously visited app pages and planner data can load when the network is
unavailable. Supported free-planner changes are queued in IndexedDB and replay
after reconnecting. Keep the app open until the "online synced" notice clears,
and export a JSON backup before relying on a long offline session.

---

## 📲 Installing as a PWA

### iOS (iPhone & iPad)
1. Open DueVinci in **Safari**.
2. Tap the **Share** icon (square with arrow up).
3. Scroll down and tap **"Add to Home Screen"**.

### Android
1. Open DueVinci in **Google Chrome**.
2. Tap the **"Install App"** prompt or tap the 3 dots menu $\rightarrow$ **"Install DueVinci"**.

### macOS & Windows Desktop
1. Open DueVinci in **Chrome**, **Edge**, or **Brave**.
2. Click the **Install** button in the omnibox (address bar).
3. Launch DueVinci as a standalone desktop window.
