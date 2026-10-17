# Grade Tracker & GPA Calculator 📊

The Grades page (`js/modules/grades.js`) tracks percentage grades, course category weights, course credits, and temporary What-If values. It is a planning estimate, not a transcript or an institution-specific GPA calculation.

## Course averages

Open **Grade settings** on a course to enter category names and weights. The weights must total 100%. Assign each coursework item to a category using its category selector; items without a saved category use the first category. Existing courses start with one **Coursework** category weighted at 100%.

Within each category, DueVinci takes the arithmetic mean of included, non-empty percentage grades. The course average then combines the graded category averages using their configured weights. Categories without a graded item are omitted, and the remaining weights are normalized to calculate a current grade. **Exclude** removes an item from the category average.

Only coursework marked **Include in Grades** appears in the grade list and contributes to course averages, target-score estimates, term grade insights, and cumulative GPA. This keeps lessons, subtasks, and imported items out of the grade tracker until you choose them. New coursework starts unchecked. Existing items with a saved grade or grade category remain included after the upgrade, so their grade history stays visible.

Use the **Include in Grades** checkbox on a course's coursework row to add or remove that item. Turning it off hides the row from grade calculations without deleting its saved score, category, or GPA-exclusion choice; turning it on again restores those values. A missing gradeability flag in an older offline cache keeps an item visible only when it already has a grade or category.

The **Hide completed classes** setting in Settings also removes completed courses from the Grades page while enabled. Their course cards, coursework, contribution to cumulative GPA, and rows used by term insights are hidden until you show completed classes again.

DueVinci stores only percentages, not points earned or possible. Therefore, assignments count equally inside a category; category weights are supported, but point-weighted assignment averages are not.

## Cumulative GPA estimate

The selected scale is 4.0 or 5.0 in Settings → Appearance → **GPA Scale Target**. Each course percentage is converted linearly to that scale, then weighted by its credit hours:

$$\text{Estimated GPA} = \frac{\sum_c \left(\frac{\text{Course Average}_c}{100} \times \text{Scale} \times \text{Credit Hours}_c\right)}{\sum_c \text{Credit Hours}_c}$$

Existing courses start at 3 credit hours to preserve equal weighting until a student changes them. For example, an 88% average scales to 3.52 on a 4.0 scale before credit weighting. DueVinci does not translate percentage bands into letter-grade points, apply honors/AP weighting, or account for repeated-course rules. Check the official school calculation for academic decisions.

Courses without included graded work do not contribute to the cumulative estimate.

## Term insights

The Grades page shows a rolling 90-day snapshot. The score comparison needs at least six graded items with due dates in that window. It sorts the current saved percentage grades by due date, compares the earlier half with the later half, and counts each item equally. DueVinci does not keep grade-change history, so this describes current scores by coursework order rather than when a score changed. It does not use What-If scores.

The focus summary uses the existing saved study-history setting. It appears after at least three completed focus sessions across two different days in the same 90-day window. It shows aggregate session counts and minutes, with a weekday callout only when one day has the uniquely highest count. The page does not create or save insight records, and it does not match study minutes to grades or infer that one affected the other. If study history is off or the minimum sample is not met, the page explains what data is missing.

## Target score calculator

Enter a target course percentage and select the category for one upcoming item. The calculator solves for the score needed on that next item, assuming it counts equally with the other graded items in that category. It reports when the target is already secured by a zero score on that item or when the required score exceeds 100%.

The estimate uses the current category setup and current grade inputs, including temporary What-If values while the simulator is active. It does not model an item with a separate points value or a different within-category weight.

## What-If simulation

1. Select **Start simulator**.
2. Enter hypothetical percentages in the displayed grade fields.
3. Observe the recalculated course and cumulative values, or use the target score calculator.
4. Use **Reset simulation** or **Exit simulator** to discard temporary values.

Simulated values remain in page memory and do not overwrite saved grades. Exclude and category selections are separate saved assignment settings. Outside simulation, changing a grade saves it to the assignment.

## Input and error behavior

Grade fields include the course and coursework title in their accessible names, and grade/category/Exclude controls have enlarged targets. A load error offers **Try again** instead of presenting failed reads as an empty workspace. Grade settings and gradebook inclusion are saved on the existing course and assignment rows, subject to the existing account row-level security policies. Apply the weighted-gradebook and gradebook-selection migrations before using these saved settings.
