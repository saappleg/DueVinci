# Course & Term Management 📂

Classes, terms, units, lessons, and assignments are managed by `js/modules/courses.js` and the academic/planning modules.

## Academic organization

```text
Named term and optional date window
 └── Class, pacing profile, and optional date window
      ├── Units, lessons, reviews, exams, and assignments
      ├── Due dates, priority, effort estimates, and completion
      ├── Weighted grade categories, credits, and GPA exclusion
      ├── Notes, resources, description, and objectives
      └── Note-derived quizzes and flashcards
```

## Find and organize classes

- Give classes a code, icon, and color; use term folders or the alphabetical list.
- Search classes/terms, select classes for a bulk term move, and choose whether completed classes are visible. **Hide completed classes** also removes those courses from Grades, including its GPA summary and term insights.
- Set class and term start/end dates. Planning and imports use their effective date window; terms can archive after their end date.
- Show archived terms to find or restore older folders. Hiding or archiving a folder does not mean its coursework was deleted.
- Choose manual or supported weekly pacing profiles. Weekly progress follows the current coursework week rather than assuming all overdue work belongs today.

## Start a new term

Open a named term, choose **Start a new term**, enter a distinct name and optional dates, then create it.

Rollover copies class shells: name/code, icon/color, and pacing type. Old coursework stays in the original term. The copies start incomplete with empty class dates and without old assignments, grades, notes, or LMS identities. Source-course keys prevent duplicate copies from a retried rollover. A new term is not a live duplicate of the old term; review dates and add/import the new coursework separately.

## Assignment management

Coursework supports a title, unit, date, task type, priority, effort estimate, a 0–100% progress value, completion, and an **Include in Grades** choice. New lessons, subtasks, and assignments start unchecked so a large course outline does not flood the Grades page. Select the items you want in the grade tracker; turning the choice off hides the grade row while preserving its saved grade and category. Items that already have a grade or category remain selected after the gradebook-selection migration. Marking an item complete sets progress to 100%; marking it incomplete resets progress to 0%. Partially completed work uses a proportional remaining-time estimate in the Smart Study Plan.

Use **Add subtask** on a top-level coursework item to break it into separately scheduled work. Subtasks keep their own due date, completion, and progress, and appear directly after their parent when ordered. Deleting a parent keeps its subtasks as standalone coursework.

Open **Instructions & checklist** to save assignment instructions. **Extract checklist steps** splits the text into candidate lines on this device; it does not use AI or invent missing details. Review and edit the proposal text before choosing **Add reviewed steps as subtasks**. Duplicate steps already linked to that assignment are skipped.

Choose **Every week** when adding coursework to create weekly instances through a selected end date. Each date becomes a regular, independently editable assignment and must fit inside the class and term date window. A single action is limited to 53 instances; later repeats are not generated automatically.

Syllabus PDF and image imports open a review dialog for each extracted unit and lesson row. Edit titles and dates or clear a row's Include checkbox before importing. Canceling the review leaves course metadata and coursework unchanged; selected due dates continue to follow the class and term date bounds.

Instructions, progress, parent links, and gradebook inclusion are synced with assignment records, kept by the offline cache, and included in full data backups. Apply `supabase/migrations/20261017022939_coursework_workflow_fields.sql` and `supabase/migrations/20261017064026_assignment_gradeability.sql` before deploying the matching UI so the saved assignment fields exist.

Grades accepts percentage values and an Exclude choice. Course category weights and credit hours are configurable in the Grades page; [Grades & GPA](Grade-Tracker-&-GPA-Calculator) explains how the estimates work and their limits. The saved settings require `supabase/migrations/20261017022938_weighted_gradebook_and_gpa.sql`.

The current UI does not provide a Pending/In Progress/Graded status workflow or drag-and-drop category sorting. Use the existing manual fields and [syllabus import](AI-Syllabus-&-Document-Parser) for the supported workflow.

Calendar events can be explicitly [converted to assignments](Calendar-&-Schedule-Sync), preserving the original event. DueVinci Pro adds connected Canvas imports; the free course/task workflow remains available without a subscription.
