# Course & Term Management 📂

The **Course & Term Management** module (`js/modules/academics.js` and `js/modules/courses.js`) is the organizational foundation of DueVinci. It manages the academic hierarchy from multi-year terms down to individual assignment rubrics.

---

## 🏛️ Academic Hierarchy

```text
Terms (e.g., Fall 2026, Spring 2027)
 └── Courses (e.g., CS 101, MATH 201)
      ├── Metadata (Professor, Office Hours, Location, Credits)
      ├── Grading Categories & Weights (Exams: 40%, Homework: 30%, Labs: 30%)
      ├── Assignments & Deadlines
      ├── Course Notes & Markdown Summaries
      └── SM-2 Flashcard Decks
```

---

## 🎨 Customization & Organization Features

- **Term Organization**: Easily switch between Active, Future, and Archived academic terms.
- **Custom Course Palettes & Emojis**: Assign unique theme colors and emoji icons to each class (e.g. 💻 `CS 101` in Emerald, 📐 `MATH 201` in Indigo) for quick visual scanning throughout the calendar and dashboard.
- **Credit Hour Tracking**: Monitor total registered credit hours per semester to ensure academic requirements are met.
- **Drag-and-Drop Sorting**: Reorder courses or rearrange assignments between categories with smooth drag-and-drop interactions.

---

## 📝 Assignment Management

Each assignment record supports:
- **Title & Description**: Detailed instructions with formatted Markdown support.
- **Category Association**: Assigned to custom weighted categories (e.g., Homework, Quiz, Project).
- **Due Date & Time**: Timestamp with timezone awareness and countdown alerts.
- **Status Toggles**: `Pending`, `In Progress`, `Completed`, or `Graded`.
- **Score & Max Points**: Earned score vs total points possible for real-time grade calculations.
