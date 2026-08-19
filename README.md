# DueVinci 📚
DueVinci is a modern, modular student planner web application designed to help students manage courses, track assignments, map 6-month term units, and stay focused with an integrated Pomodoro timer.
## ✨ Key Features
- **Modular Architecture**: Clean multi-page layout separating the Dashboard, Class Management, and Schedule.
- **Secure Authentication**: Email/Password authentication powered by Supabase Auth with RLS database protection.
- **Intelligent Syllabus PDF Parser**: Upload course syllabus PDFs using built-in PDF.js to automatically extract units and milestones.
- **Pomodoro Focus Timer**: Fully functional focus/break timer with custom duration controls and a collapsible sidebar widget.
- **Interactive Calendar**: Sync and visualize assignments and custom events with FullCalendar, complete with `.ics` export capability.
- **Customization & Themes**: Class color-coding, custom emoji icons, celebratory confetti on task completion, and a dynamic theme switcher.
## 🛠️ Tech Stack
- **Frontend**: HTML5, Tailwind CSS (via CDN)
- **Scripting**: Vanilla JavaScript (ES6+)
- **Backend & Database**: Supabase (PostgreSQL, Auth)
- **Libraries**: FullCalendar, PDF.js, Canvas Confetti
DueVinci/
├── index.html       # Main student dashboard (Up Next & Goals)
├── courses.html     # Class management & PDF syllabus parser
├── calendar.html    # FullCalendar view & custom event manager
└── app.js           # Core business logic, Supabase hooks, and UI controllers
