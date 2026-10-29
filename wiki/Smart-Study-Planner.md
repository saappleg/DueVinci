# Smart Study Plan & Workload Balancer 🎯

The free Smart Study Plan turns incomplete, dated coursework into daily study blocks. It does not require AI or a paid integration.

## What it uses

- Incomplete assignments with valid dates and course/unit/lesson metadata.
- Task effort estimates and the selected planning window; dashboard previews and calendar overlays can use different window lengths.
- Rest-day preferences, protected study dates, and class/term date windows.
- Optional saved study-plan moves, which are separate from assignment deadlines.

## Scheduling rules

1. **Deadlines constrain the plan.** Due work stays on or before its deadline within a usable date window; overdue work is surfaced rather than silently given a later deadline.
2. **Earlier deadlines take priority.** Unit numbering does not override an earlier due date.
3. **Lessons keep curriculum order.** Unit and lesson metadata help sequence blocks.
4. **Rest and protected dates stay clear.** If no eligible day exists in a unit's current plan, course, and deadline window, its future coursework stays unscheduled and the plan shows an infeasibility warning. Review rest days, protected dates, or course/date windows to make room.
5. **Study dates differ from due dates.** Due-today and overdue work stays on today even when it is a rest day; the planner does not move it later. Moving a study block does not rewrite its deadline.

## 7-Day Assignment Due Dates

The Dashboard counts incomplete assignments due on each local calendar day, including discussions and other coursework categories. It shows actual deadlines, even when a deadline falls on a configured rest day. Smart Study Plan uses those preferences to schedule work; it does not move deadlines. Dashboard completed totals and Weekly Review both count all assignment rows.

| Signal | Meaning |
| --- | --- |
| Green / No due items | No incomplete coursework is due |
| Indigo | One incomplete item is due |
| Amber | Two or three incomplete items are due |
| Red | Four or more items are due, or an exam is due |
| Exam label | Shows that an exam is due alongside the due-item count |

Date-only values and ISO timestamp deadlines use their stored calendar-date component for these counts.

Marking coursework complete records today's study activity when the save succeeds, even if no timer was used. Dashboard **Up Next** shows titled, dated coursework for the current study week across categories such as lessons, assignments, quizzes, and discussions, with the type shown for each item.

## Personalized estimates · Pro, opt-in

Settings → Study & Reminders → **Personalized study plan** can use completed focus sessions linked to study-plan tasks, optional self-reported minutes from Daily Brief completion, and subsequent task completions to adjust future duration estimates. The base free planner remains available with default/manual estimates. Completing work still updates the study streak when this Pro setting is off; only saving the time estimate requires opt-in history.

After enabling, start a task's study-plan timer and finish focus sessions, or enter an approximate time when completing a Daily Brief item that has no completed linked focus session on this device that day. Self-reported time is tracked separately and does not increase focus-session counts or minutes. The calculation uses recent history from the last 90 days, bounded adjustments, and fallback estimates when history or entitlement is unavailable. It is an estimate, not a measured guarantee of completion time.

Turning personalization off pauses its use and retains history. **Clear history** removes the local history and synchronizes removal through account preferences. Keep all study context fictional where nursing practice is involved; never enter patient information.

## Using and verifying the plan

Add dated coursework, review the proposed days, use timer shortcuts, and mark completed work. Check protected dates, narrow layouts, and warnings before relying on a plan.

The scheduler is `generateBalancedStudyPlan(...)` in `js/modules/studyPlan.js`; calibration is in `js/modules/studyCalibration.js`, and radar data is in `js/modules/academics.js`. Unit regressions verify scheduling boundaries; actual layout, timers, account synchronization, and external services require their own checks.
