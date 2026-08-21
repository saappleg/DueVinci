# Developer Guide & Contributing 🛠️

Thank you for your interest in contributing to DueVinci! This document provides engineering guidelines, coding standards, and architectural conventions for developers.

---

## 🧭 Code Organization & Principles

DueVinci follows a **Vanilla Modern Web** philosophy:
1. **ES6 Native Modules**: All logic is structured as standard ES6 modules in `js/modules/`.
2. **Zero-Build Dependency**: The application can run directly in the browser via simple HTTP servers without requiring Webpack, Vite, or Babel for local runtime.
3. **Immutability & Pure Functions**: Wherever possible, mathematical calculations (GPA, SM-2, study scheduling) should be pure functions with dedicated unit tests.
4. **Accessible & Responsive**: All UI elements must maintain WCAG 2.1 AA accessibility and perform seamlessly across desktop and mobile screens.

---

## 📁 Key Modules Reference

| File | Primary Responsibility |
| :--- | :--- |
| `js/app.js` | Main entry point; binds event listeners, routes page states, boots modules |
| `js/modules/academics.js` | Terms, courses, categories, assignment CRUD, GPA scale definitions |
| `js/modules/courses.js` | Course detail view controller, syllabus ingestion UI, module tabs |
| `js/modules/flashcards.js` | SuperMemo-2 spaced repetition, review queues, flip-card modal |
| `js/modules/studyPlan.js` | Workload balancing, milestone generator, daily study checklist |
| `js/modules/grades.js` | Weighted course average, cumulative GPA calculations, what-if simulator |
| `js/modules/timers.js` | Pomodoro timer, stopwatch, Web Audio API chime synthesis |
| `js/modules/calendar.js` | FullCalendar lifecycle, event parsing, RFC 5545 `.ics` generator |
| `js/modules/markdown.js` | Markdown rendering with code formatting and KaTeX math parsing |
| `js/modules/offlineDb.js` | IndexedDB persistent object store wrapper |
| `js/modules/ui.js` | Notification toasts, modal dialog manager, theme toggle |
| `js/modules/utils.js` | Date formatting, sanitization, debounce, and helper utilities |

---

## 🧪 Development Workflow

### 1. Create a Topic Branch
```bash
git checkout -b feature/awesome-feature
```

### 2. Run Syntax & Test Checks
Always ensure tests and syntax checks pass before submitting a pull request:
```bash
npm run check:syntax
npm test
```

### 3. Commit Guidelines
Use clear, conventional commit messages:
- `feat: add export to CSV feature for grade tracker`
- `fix: handle edge case in SM-2 interval when ease factor drops below floor`
- `docs: update API documentation in wiki`

---

## 🤝 Pull Request Checklist

- [ ] Code follows existing formatting and ES6 module patterns.
- [ ] New logic is covered by automated unit tests in `tests/`.
- [ ] `npm test` and `npm run check:syntax` pass without errors or warnings.
- [ ] Relevant documentation / wiki pages are updated.
