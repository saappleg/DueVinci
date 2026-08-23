# Smart Study Plan & Workload Balancer 🎯

The Smart Study Plan is DueVinci’s free planning core. It turns incomplete, dated coursework into a short daily plan without requiring AI or a paid integration.

## What it uses

- Incomplete assignments with a valid due date
- Course, unit, and lesson metadata
- The next seven planning days (five days in the dashboard preview)
- Optional rest days selected by the student

## Scheduling rules

1. **Deadlines are hard constraints.** A task is scheduled on or before its due date whenever it is inside the planning window. Overdue work is surfaced today.
2. **Earlier deadlines win.** If a later-numbered unit is due first, the planner prioritizes its deadline over unit numbering.
3. **Lessons keep their order.** Within a unit, Lesson 1 is scheduled before Lesson 2, and units with the same deadline keep numerical order.
4. **Work is spread across available days.** Lessons are distributed through active days leading to the unit deadline instead of being dumped onto the first day.
5. **Rest days are respected when possible.** If the only remaining day before a deadline is a rest day, the deadline takes precedence and the task is shown that day.

## 7-Day Workload & Stress Radar

The dashboard radar counts incomplete work due on each of the next seven local calendar days.

| Signal | Meaning |
| --- | --- |
| Green / Chill | No due coursework that day |
| Indigo | One task |
| Amber | Two or three tasks |
| Red | Four or more tasks |
| Pulsing exam badge | At least one exam, test, quiz, final, or midterm is due |

Both date-only values (`YYYY-MM-DD`) and ISO timestamps are normalized to the deadline’s calendar date, so imported timestamp deadlines appear correctly.

## Using it

1. Add a course, then add units or lessons with due dates.
2. Use clear titles such as `Unit 2` and `Lesson 3` for the strongest sequence detection; explicit unit and lesson fields are preferred when available.
3. On the dashboard, choose rest days and open a day card to see every scheduled block, study recommendation, and timer shortcut.
4. Mark coursework complete to remove it from future plans and radar counts.

## Implementation

The pure scheduler is `generateBalancedStudyPlan(courses, assignments, startDate, daysAhead, restDays)` in `js/modules/studyPlan.js`. Workload-radar data is built by `getSevenDayWorkload(...)` in `js/modules/academics.js`. Both are covered by automated regression tests.
