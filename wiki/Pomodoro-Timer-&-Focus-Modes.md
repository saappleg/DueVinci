# Pomodoro Timer & Focus Modes ⏱️

The **Pomodoro Timer & Focus Modes** module (`js/modules/timers.js`) brings focused productivity directly into your academic workspace without requiring third-party extensions or apps.

---

## ⏲️ Modes & Intervals

| Mode | Default Duration | Purpose |
| :--- | :--- | :--- |
| **Focus / Pomodoro** | 25 minutes | Deep work session on active assignments or study plan tasks |
| **Short Break** | 5 minutes | Quick stretch, hydration, and mental reset |
| **Long Break** | 15 minutes | Deep recovery after completing 4 consecutive Pomodoros |
| **Open Stopwatch** | Untimed | Track continuous study sessions, lab work, or reading |

---

## 🔊 Synthetic Web Audio Alerts

DueVinci generates high-fidelity chimes directly in the browser using the native **Web Audio API** (`AudioContext`). This ensures that alert notifications always trigger instantly without relying on external `.mp3` downloads or network connectivity:

- **Session Start Chime**: Ascending harmonic tone sequence (Major triad: C5 $\rightarrow$ E5 $\rightarrow$ G5).
- **Session Complete Chime**: Clear, pleasant notification tone with custom decay.
- **Ambient Focus Noise**: Optional soothing background white/brown noise generator.

---

## 🚀 Key Features

1. **Floating Mini-Widget**: Minimize the timer into a floating badge in the bottom corner so you can review flashcards, browse calendars, or inspect syllabi while the timer runs.
2. **Assignment Association**: Link timer sessions directly to a specific course or assignment to automatically track total time spent studying for each class.
3. **Daily Productivity Analytics**: Track daily focus hours, completed intervals, and weekly study streaks.
4. **Browser Notifications**: Native HTML5 desktop notifications alert you when intervals finish even if DueVinci is in a background tab.
