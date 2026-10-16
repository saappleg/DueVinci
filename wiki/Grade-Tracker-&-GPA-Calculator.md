# Grade Tracker & GPA Calculator 📊

The Grades page (`js/modules/grades.js`) shows saved percentage grades and a temporary **What-If** simulator. It is a planning aid, not a transcript or institution-specific GPA calculation.

## Current calculation

Within each course, the displayed average is the simple arithmetic mean of included, non-empty percentage grades among the coursework shown by the page. **Exclude** removes an item from that calculation. The current view includes lesson-style entries and titles matching lesson/exam/final/midterm/test/review rules; it does not necessarily include every arbitrary task title.

For the cumulative display, the implementation averages the displayed course percentages (rounded to one decimal place), then scales linearly:

$$\text{Scaled GPA} = \frac{\text{Mean of course percentages}}{100} \times \text{Selected scale}$$

Choose 4.0 or 5.0 in Settings → Appearance → **GPA Scale Target**. For example, an 88% mean scales to 3.52 on the 4.0 setting. It does not map 88% to a B+ grade point or weight courses by credits. The current UI has no custom grading-category weights or AP/Honors weighting policy.

Use the official school calculation for academic decisions. Courses without included graded work do not contribute to the displayed mean.

## What-If simulation

1. Select **Launch Simulator**.
2. Enter hypothetical percentages in the displayed grade fields.
3. Observe the recalculated course/cumulative values.
4. Use **Reset Sim** or **Exit Simulator** to discard temporary values.

Simulated values remain in page memory and do not overwrite saved grades. Exclude is a separate saved assignment setting; it is not made temporary by the simulator. Outside simulation, changing a grade saves it to the assignment.

This is a hypothetical-score editor, not an automatic solver for the final-exam percentage required to achieve a target weighted grade.

## Input and error behavior

Grade fields are named with their class and coursework title, and audited input/Exclude targets are enlarged. A load error offers **Try again** instead of presenting failed reads as an empty workspace. Source tests cover control contracts and recalculation behavior; actual visual alignment, focus, and saved data require browser/account checks.
